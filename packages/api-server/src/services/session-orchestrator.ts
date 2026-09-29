/**
 * Session Orchestrator
 *
 * Business orchestration extracted from SessionManager.
 * Coordinates repository reads/writes, script execution, and response building.
 * Uses the Session domain aggregate as the primary state object.
 */

import {
  Session,
  ScriptExecutor,
  type TemplateProvider,
  createLogger,
} from '@heartrule/core-engine';
import { VariableScope } from '@heartrule/shared-types';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

import { container } from '../ioc/container.js';

import { DatabaseTemplateProvider } from './database-template-provider.js';
import type { ISessionRepository, SessionData, ScriptData } from './session-repository.js';
import { SessionRepository } from './session-repository.js';
import { SessionResponseBuilder, type SessionResponse } from './session-response-builder.js';
import {
  buildVariableSnapshotsFromSession,
  extractExitReasonFromSession,
} from './session-variable-utils.js';

const logger = createLogger('SessionOrchestrator');

export class SessionOrchestrator {
  private scriptExecutor: ScriptExecutor;
  private templateProvider: TemplateProvider;
  private repository: ISessionRepository;
  private responseBuilder: SessionResponseBuilder;
  private prevVariableSnapshots: Map<
    string,
    {
      global: Record<string, any>;
      session: Record<string, any>;
      phase: Record<string, any>;
      topic: Record<string, any>;
    }
  > = new Map();

  constructor(
    scriptExecutor?: ScriptExecutor,
    repository?: ISessionRepository,
    templateProvider?: TemplateProvider,
    responseBuilder?: SessionResponseBuilder
  ) {
    this.scriptExecutor = scriptExecutor || container.getScriptExecutor();
    this.templateProvider = templateProvider || new DatabaseTemplateProvider();
    this.repository = repository || new SessionRepository();
    this.responseBuilder = responseBuilder || new SessionResponseBuilder();
  }

  // ==================== Private: Session Construction ====================

  /** Parse double-encoded JSONB metadata (Drizzle stores JSON as JSON-string). */
  private parseMetadata(raw: unknown): Record<string, any> {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return {}; }
    }
    return (raw as Record<string, any>) || {};
  }

  private createInitialSession(
    sessionData: SessionData,
    globalVariables: Record<string, any>,
    conversationHistory: any[],
    overrides: Record<string, any> = {}
  ): Session {
    const session = new Session({
      sessionId: sessionData.id,
      userId: sessionData.userId,
      scriptId: sessionData.scriptId,
      status: (sessionData.status as any) || 'active',
      executionStatus: (sessionData.executionStatus as any) || 'running',
      variables: {
        ...globalVariables,
        ...((sessionData.variables as Record<string, unknown>) || {}),
      },
      conversationHistory,
    });

    // Populate variableStore.global with loaded global variables
    if (session.variableStore) {
      if (!session.variableStore.global) session.variableStore.global = {};
      for (const [key, value] of Object.entries(globalVariables)) {
        session.variableStore.global[key] = {
          value,
          type: typeof value,
          source: 'global_init',
          lastUpdated: new Date().toISOString(),
          scope: VariableScope.GLOBAL,
        };
      }
    }

    // Apply overrides
    if (overrides.projectId) {
      session.metadata.projectId = overrides.projectId;
    }
    if (overrides.sessionConfig) {
      session.metadata.sessionConfig = overrides.sessionConfig;
    }
    if (overrides.currentBranchId) {
      session.metadata.currentBranchId = overrides.currentBranchId;
    }

    logger.debug('📋 Initial session:', {
      sessionId: session.sessionId,
      status: session.status,
      executionStatus: session.executionStatus,
      position: session.position,
      variables: session.variables,
      projectId: session.metadata.projectId,
      sessionConfig: session.metadata.sessionConfig,
    });

    return session;
  }

  private restoreSession(
    sessionData: SessionData,
    globalVariables: Record<string, any>,
    conversationHistory: any[]
  ): Session {
    logger.info('[DEBUG-RESTORE] restoreSession from DB data', {
      metadataKeys: Object.keys((sessionData.metadata as Record<string, any>) || {}),
      hasActionSnapshots: !!((sessionData.metadata as Record<string, any>) || {}).actionSnapshots,
    });

    const dataForFactory = {
      id: sessionData.id,
      scriptId: sessionData.scriptId,
      userId: sessionData.userId,
      status: sessionData.status,
      executionStatus: sessionData.executionStatus,
      variables: sessionData.variables,
      position: sessionData.position,
      metadata: sessionData.metadata,
      currentRunId: (sessionData as any).currentRunId,
    };

    const session = Session.fromSessionData(dataForFactory, {
      globalVariables,
      conversationHistory,
    });

    logger.debug('📋 Restored session:', {
      sessionId: session.sessionId,
      status: session.status,
      executionStatus: session.executionStatus,
      position: session.position,
      conversationHistoryLength: session.conversationHistory.length,
      metadata: Object.keys(session.metadata),
    });

    return session;
  }

  // ==================== Private: Script Execution ====================

  private async executeScript(
    script: ScriptData,
    sessionId: string,
    session: Session,
    userInput: string | null
  ): Promise<Session> {
    const scriptContent = yaml.parse(script.scriptContent) || {};
    const scriptJson = JSON.stringify(scriptContent);

    logger.debug('📄 Parsed YAML script:', {
      sessionId: scriptContent.session?.session_id,
      phasesCount: scriptContent.session?.phases?.length || 0,
    });

    const logPrefix = userInput === null ? 'initialization' : 'with user input';
    logger.debug(`⏳ Executing script (${logPrefix})...`);

    const execState = session.toExecutionState();
    const updatedState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      execState,
      userInput,
      script.projectId,
      this.templateProvider
    );
    session.applyExecutionResult(updatedState);

    logger.debug('✅ Script execution completed:', {
      status: session.executionStatus,
      position: session.position,
      lastAiMessage: session.lastAiMessage,
    });

    return session;
  }

  // ==================== Private: Persistence Helpers ====================

  private async saveVariableSnapshots(session: Session): Promise<void> {
    const snapshots = buildVariableSnapshotsFromSession(session.sessionId, session);
    await this.repository.saveVariableSnapshots(snapshots);
  }

  private addRerunVersion(
    session: Session,
    actionId: string,
    configOverride?: Record<string, any>,
    llmConfig?: Record<string, any>
  ): void {
    const rerunHistory = (session.metadata.rerunHistory || []) as any[];

    const newVersion: any = {
      versionId: uuidv4(),
      actionId,
      runId: session.metadata.currentRunId,
      timestamp: new Date().toISOString(),
      config: configOverride ?? {},
      llmConfig: llmConfig ?? undefined,
      result: {
        roundsUsed: (session.metadata.actionRoundInfo as any)?.[actionId]?.currentRound ?? 1,
        exitReason: extractExitReasonFromSession(session) || undefined,
        variableCount: Object.keys(session.variables || {}).length,
      },
    };

    // Per-action limit: max 20 versions, remove oldest (except v1) if exceeded
    const actionVersions = rerunHistory.filter((e: any) => e.actionId === actionId);
    while (actionVersions.length >= 20) {
      const oldestNonV1 = actionVersions.find(
        (e: any) => e.versionId !== actionVersions[0]?.versionId
      );
      if (!oldestNonV1) break;
      const idx = rerunHistory.indexOf(oldestNonV1);
      rerunHistory.splice(idx, 1);
      actionVersions.splice(actionVersions.indexOf(oldestNonV1), 1);
    }

    rerunHistory.push(newVersion);
    session.metadata.rerunHistory = rerunHistory;
  }

  // ==================== Public API ====================

  async initializeSession(sessionId: string): Promise<SessionResponse> {
    logger.info('🔵 initializeSession called', { sessionId });

    const sessionData = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(sessionData.scriptId);

    try {
      const branchId = uuidv4();
      const runId = uuidv4();
      await this.repository.setSessionRunId(sessionId, runId);

      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, sessionData.userId);
      const conversationHistory = await this.repository.loadConversationHistory(
        sessionId,
        { branchId }
      );

      let session = this.createInitialSession(sessionData, globalVariables, conversationHistory, {
        ...(sessionData.metadata as Record<string, any>),
        projectId: script.projectId,
        currentBranchId: branchId,
      });

      session.metadata.currentRunId = runId;
      session.metadata.currentBranchId = branchId;
      session.metadata.globalVariableDefinitions = globalVariableDefinitions;
      session.metadata.globalVariableCallback = async (name: string, value: unknown) => {
        try {
          logger.info(`🔔 [GlobalVarCallback] Called: "${name}" = "${value}"`);
          if (!script.projectId) {
            logger.warn(`[SessionOrchestrator] Cannot persist global "${name}": projectId missing`);
            return;
          }
          await this.repository.persistGlobalVariable(
            sessionData.userId,
            script.projectId,
            name,
            value
          );
          logger.info(`💾 [GlobalVarCallback] Persisted: "${name}" = "${value}"`);
        } catch (err: any) {
          logger.error(
            `[SessionOrchestrator] Failed to persist global variable "${name}":`,
            err.message
          );
        }
      };

      const prevHistoryLength = session.conversationHistory.length;
      session = await this.executeScript(script, sessionId, session, null);

      if (session.metadata.sessionConfig) {
        const currentMetadata = (sessionData.metadata as Record<string, any>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          sessionConfig: session.metadata.sessionConfig,
        };
        await this.repository.updateSessionMetadata(sessionId, updatedMetadata);
        logger.debug('💾 Saved sessionConfig to database:', session.metadata.sessionConfig);
      }

      logger.info('🔍 [INIT] Before persist — metadata keys:', Object.keys(session.metadata).join(','));
      logger.info('🔍 [INIT] currentBranchId:', session.metadata.currentBranchId);
      await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevHistoryLength);
      await this.saveVariableSnapshots(session);
      await this.repository.persistSession(session, globalVariables);

      const result = this.responseBuilder.buildSessionResponseFromSession(
        session,
        sessionData,
        script,
        globalVariables,
        this.prevVariableSnapshots,
        false
      );
      logger.info('🏁 initializeSession completed:', {
        runId: result.currentRunId,
      });
      return result;
    } catch (error) {
      logger.error('❌ Error during initialization:', error);
      return this.responseBuilder.buildErrorResponse(error, sessionData, script, sessionId);
    }
  }

  async processUserInput(
    sessionId: string,
    userInput: string,
    restoreToActionId?: string
  ): Promise<SessionResponse> {
    logger.info('🔵 processUserInput called', { sessionId, userInput, restoreToActionId });

    const sessionData = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(sessionData.scriptId);

    try {
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, sessionData.userId);

      // Determine which branch to use. When continuing from a snapshot,
      // load messages from that snapshot's branch (not the current branch).
      const metadata = this.parseMetadata(sessionData.metadata);
      const actionSnapshots = metadata.actionSnapshots || {};
      const snapshot = restoreToActionId ? actionSnapshots[restoreToActionId] : null;
      const snapshotBranchId = snapshot?.branchId as string | undefined;
      const activeBranchId = snapshotBranchId || (metadata.currentBranchId as string);

      // Load conversation history filtered by the active branch
      let conversationHistory = await this.repository.loadConversationHistory(
        sessionId,
        { branchId: activeBranchId }
      );

      // Create a new runId for snapshot continuation (debug entries isolated from V1)
      const continuationRunId = snapshot ? uuidv4() : null;
      if (continuationRunId) {
        await this.repository.setSessionRunId(sessionId, continuationRunId);
        logger.info('Branch continuation — new runId:', { continuationRunId });
      }

      if (snapshot) {
        logger.info('🔄 Continuing from snapshot on branch', {
          restoreToActionId,
          snapshotBranchId,
          historyLength: conversationHistory.length,
        });
      }

      await this.repository.saveUserMessage(sessionId, userInput, activeBranchId);

      // Append the just-saved user message to history
      conversationHistory = [
        ...conversationHistory,
        {
          role: 'user',
          content: userInput,
          timestamp: new Date().toISOString(),
        },
      ];

      let session = this.restoreSession(sessionData, globalVariables, conversationHistory);

      if (continuationRunId) {
        session.metadata.currentRunId = continuationRunId;
        // Track latest runId per branch for debug entry lookup
        const branchRunIds = (session.metadata.branchRunIds as Record<string, string>) || {};
        branchRunIds[activeBranchId] = continuationRunId;
        session.metadata.branchRunIds = branchRunIds;
      }

      // Restore branch position (where V0 was when the rollback was triggered)
      if (snapshot?.branchPosition) {
        const bp = snapshot.branchPosition as Record<string, any>;
        session.position = {
          phaseIndex: (bp.phaseIndex as number) ?? session.position.phaseIndex,
          topicIndex: (bp.topicIndex as number) ?? session.position.topicIndex,
          actionIndex: (bp.actionIndex as number) ?? session.position.actionIndex,
          phaseId: (bp.phaseId as string) || session.position.phaseId,
          topicId: (bp.topicId as string) || session.position.topicId,
          actionId: (bp.actionId as string) || session.position.actionId,
          actionType: (bp.actionType as string) || session.position.actionType,
        };
        logger.info('Restored branch position from snapshot', { position: session.position });
      }

      session.metadata.globalVariableDefinitions = globalVariableDefinitions;
      session.metadata.globalVariableCallback = async (name: string, value: unknown) => {
        try {
          logger.info(`🔔 [GlobalVarCallback] Called: "${name}" = "${value}"`);
          if (!script.projectId) {
            logger.warn(`[SessionOrchestrator] Cannot persist global "${name}": projectId missing`);
            return;
          }
          await this.repository.persistGlobalVariable(
            sessionData.userId,
            script.projectId,
            name,
            value
          );
          logger.info(`💾 [GlobalVarCallback] Persisted: "${name}" = "${value}"`);
        } catch (err: any) {
          logger.error(
            `[SessionOrchestrator] Failed to persist global variable "${name}":`,
            err.message
          );
        }
      };

      const prevHistoryLength = session.conversationHistory.length;
      session = await this.executeScript(script, sessionId, session, userInput);

      const branchForSave = restoreToActionId ? activeBranchId : undefined;
      await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevHistoryLength, branchForSave);
      await this.saveVariableSnapshots(session);
      await this.repository.persistSession(session, globalVariables);

      const result = this.responseBuilder.buildSessionResponseFromSession(
        session,
        sessionData,
        script,
        globalVariables,
        this.prevVariableSnapshots,
        true
      );
      logger.debug('🏁 processUserInput completed:', {
        aiMessageLength: result.aiMessage?.length || 0,
        executionStatus: result.executionStatus,
        position: result.position,
        currentRunId: result.currentRunId,
      });
      return result;
    } catch (error) {
      logger.error('❌ Error during user input processing:', error);
      return this.responseBuilder.buildErrorResponse(error, sessionData, script, sessionId);
    }
  }

  async updateVariable(
    sessionData: SessionData,
    params: {
      variableName: string;
      scope: string;
      value: unknown;
      phaseId?: string;
      topicId?: string;
    }
  ): Promise<{ variableName: string; scope: string; value: unknown; updatedAt: string }> {
    const { variableName, scope, value, phaseId, topicId } = params;
    const now = new Date().toISOString();
    const metadata = (sessionData.metadata as Record<string, any>) || {};
    const variableStore = metadata.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    const previousValue =
      scope === 'global' || scope === 'session'
        ? variableStore[scope]?.[variableName]
        : variableStore[scope]?.[scope === 'phase' ? phaseId || '' : topicId || '']?.[variableName];

    const history = previousValue?.history || [];
    if (previousValue?.value !== undefined) {
      history.push({
        value: previousValue.value,
        type: previousValue.type,
        lastUpdated: previousValue.lastUpdated,
        source: previousValue.source,
      });
    }

    const variableWrapper = {
      value,
      type: value === null ? 'null' : typeof value,
      lastUpdated: now,
      source: 'manual_edit',
      scope,
      history,
    };

    if (scope === 'global' || scope === 'session') {
      if (!variableStore[scope]) variableStore[scope] = {};
      variableStore[scope][variableName] = variableWrapper;
    } else if (scope === 'phase' && phaseId) {
      if (!variableStore.phase) variableStore.phase = {};
      if (!variableStore.phase[phaseId]) variableStore.phase[phaseId] = {};
      variableStore.phase[phaseId][variableName] = variableWrapper;
    } else if (scope === 'topic' && topicId) {
      if (!variableStore.topic) variableStore.topic = {};
      if (!variableStore.topic[topicId]) variableStore.topic[topicId] = {};
      variableStore.topic[topicId][variableName] = variableWrapper;
    }

    const flatVariables: Record<string, unknown> = {
      ...((sessionData.variables as Record<string, unknown>) || {}),
      [variableName]: value,
    };

    if (scope === 'global') {
      try {
        const tags = (await this.repository.getScriptTags(sessionData.scriptId)) || [];
        const projectTag = tags.find((tag: string) => tag.startsWith('project:'));
        const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

        if (projectId) {
          await this.repository.persistGlobalVariable(
            sessionData.userId,
            projectId,
            variableName,
            value
          );
          logger.info(
            `💾 [updateVariable] Persisted global "${variableName}" to user_global_variables`
          );
        }
      } catch (err: any) {
        logger.error(
          `[updateVariable] Failed to persist global variable "${variableName}":`,
          err.message
        );
      }
    }

    await this.repository.updateSessionVariablesAndMetadata(sessionData.id, flatVariables, {
      ...metadata,
      variableStore,
    });

    return { variableName, scope, value, updatedAt: now };
  }

  async rerunAction(
    sessionId: string,
    targetActionId?: string,
    configOverride?: Record<string, any>,
    llmConfig?: Record<string, any>
  ): Promise<SessionResponse> {
    logger.info('🔵 rerunAction called', { sessionId, targetActionId });

    const sessionData = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(sessionData.scriptId);

    const metadata = this.parseMetadata(sessionData.metadata);
    const actionSnapshots = metadata.actionSnapshots || {};

    logger.info('[DEBUG-RERUN] Session metadata loaded from DB', {
      metadataKeys: Object.keys(metadata),
      hasActionSnapshots: !!metadata.actionSnapshots,
      snapshotKeys: Object.keys(actionSnapshots),
      snapshotContent: JSON.stringify(actionSnapshots).substring(0, 500),
    });

    const scriptContent = yaml.parse(script.scriptContent) || {};
    const phases = scriptContent.session?.phases || [];
    const allActionIds: string[] = [];
    for (let pIdx = 0; pIdx < phases.length; pIdx++) {
      const phase = phases[pIdx];
      for (let tIdx = 0; tIdx < (phase.topics || []).length; tIdx++) {
        const topic = phase.topics[tIdx];
        for (let aIdx = 0; aIdx < (topic.actions || []).length; aIdx++) {
          allActionIds.push(topic.actions[aIdx].action_id);
        }
      }
    }

    let targetKey: string | undefined = targetActionId;
    if (!targetKey) {
      const posActionId = (sessionData.position as Record<string, any>)?.actionId;
      if (posActionId) {
        targetKey = posActionId;
      } else {
        const pos = sessionData.position as Record<string, any>;
        const pIdx = pos?.phaseIndex ?? 0;
        const tIdx = pos?.topicIndex ?? 0;
        const aIdx = pos?.actionIndex ?? 0;
        if (phases[pIdx]?.topics?.[tIdx]?.actions?.[aIdx]) {
          targetKey = phases[pIdx].topics[tIdx].actions[aIdx].action_id;
        }
      }
    }

    if (!targetKey || !actionSnapshots[targetKey]) {
      throw Object.assign(new Error(`No snapshot found for action: ${targetKey}`), {
        statusCode: 400,
      });
    }

    const snapshot = actionSnapshots[targetKey];

    const newSnapshots: Record<string, any> = {};
    const targetIdx = allActionIds.indexOf(targetKey);
    for (const id of allActionIds.slice(0, targetIdx + 1)) {
      if (actionSnapshots[id]) {
        newSnapshots[id] = actionSnapshots[id];
      }
    }

    // Create a new branch for the rollback result
    const previousBranchId = (metadata.currentBranchId as string) || undefined;
    const newBranchId = uuidv4();
    const newRunId = uuidv4();

    // Store branch metadata in snapshots so V0 continuation can restore state
    if (previousBranchId) {
      const previousPosition = (sessionData.position as Record<string, any>) || {};
      for (const id of Object.keys(newSnapshots)) {
        newSnapshots[id] = {
          ...newSnapshots[id],
          branchId: previousBranchId,
          branchPosition: {
            phaseIndex: previousPosition.phaseIndex,
            topicIndex: previousPosition.topicIndex,
            actionIndex: previousPosition.actionIndex,
            phaseId: previousPosition.phaseId || '',
            topicId: previousPosition.topicId || '',
            actionId: previousPosition.actionId || '',
            actionType: previousPosition.actionType || '',
          },
        };
      }
    }

    let rerunHistory = (metadata.rerunHistory || []) as any[];
    rerunHistory = rerunHistory.filter((entry: any) => {
      const entryIdx = allActionIds.indexOf(entry.actionId);
      return entryIdx >= 0 && entryIdx <= targetIdx;
    });

    const restoredMetadata: Record<string, any> = {
      ...metadata,
      variableStore: snapshot.variableStore,
      actionSnapshots: newSnapshots,
      rerunHistory,
      llmConfig: llmConfig || metadata.llmConfig,
      rerunConfigOverride: configOverride || undefined,
      currentBranchId: newBranchId,
      currentRunId: newRunId,
    };
    delete restoredMetadata.actionState;
    delete restoredMetadata.lastActionRoundInfo;
    delete restoredMetadata.completedActionContext;
    delete restoredMetadata.actionRoundInfo;

    await this.repository.updateSessionForRerun(
      sessionId,
      {
        phaseIndex: snapshot.phaseIndex,
        topicIndex: snapshot.topicIndex,
        actionIndex: snapshot.actionIndex,
        actionId: snapshot.actionId,
        actionType: snapshot.actionType,
        currentRound: 0,
      } as any,
      restoredMetadata,
      newRunId
    );

    const { values: globalVariables } = await this.repository.loadGlobalVariables(
      script.scriptName,
      sessionData.userId
    );
    // Load conversation history for the NEW branch only (old branch messages are in V0)
    const conversationHistory = await this.repository.loadConversationHistory(
      sessionId,
      { branchId: newBranchId }
    );

    const updatedSessionData = await this.repository.loadSessionById(sessionId);
    let session = this.restoreSession(updatedSessionData, globalVariables, conversationHistory);

    if (configOverride) {
      session.metadata.rerunConfigOverride = configOverride;
    }

    const prevHistoryLength = session.conversationHistory.length;
    session = await this.executeScript(script, sessionId, session, null);

    this.addRerunVersion(session, targetKey, configOverride, llmConfig);

    await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevHistoryLength);
    await this.saveVariableSnapshots(session);
    await this.repository.persistSession(session, globalVariables);

    return this.responseBuilder.buildSessionResponseFromSession(
      session,
      updatedSessionData,
      script,
      globalVariables,
      this.prevVariableSnapshots,
      true
    );
  }
}
