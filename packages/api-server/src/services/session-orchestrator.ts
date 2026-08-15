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
  type MemoryRepository,
  type SessionPersistenceData,
  createLogger,
} from '@heartrule/core-engine';
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
  private memoryRepository?: MemoryRepository;
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
    memoryRepository?: MemoryRepository,
    scriptExecutor?: ScriptExecutor,
    repository?: ISessionRepository,
    templateProvider?: TemplateProvider,
    responseBuilder?: SessionResponseBuilder
  ) {
    this.memoryRepository = memoryRepository || container.getMemoryRepository();
    this.scriptExecutor = scriptExecutor || container.getScriptExecutor();
    this.templateProvider = templateProvider || new DatabaseTemplateProvider();
    this.repository = repository || new SessionRepository();
    this.responseBuilder = responseBuilder || new SessionResponseBuilder();
  }

  // ==================== Private: Session Construction ====================

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
      currentRunId: sessionData.currentRunId,
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
      const runId = uuidv4();
      await this.repository.setSessionRunId(sessionId, runId);

      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, sessionData.userId);
      const conversationHistory = await this.repository.loadConversationHistory(sessionId);

      const dataForFactory: SessionPersistenceData = {
        id: sessionData.id,
        scriptId: sessionData.scriptId,
        userId: sessionData.userId,
        status: sessionData.status,
        executionStatus: sessionData.executionStatus,
        variables: sessionData.variables,
        position: sessionData.position,
        metadata: sessionData.metadata,
      };

      let session = Session.fromSessionData(dataForFactory, {
        globalVariables,
        conversationHistory,
      });

      // Override with script-level projectId (authoritative source)
      if (script.projectId) {
        session.metadata.projectId = script.projectId;
      }

      session.metadata.currentRunId = runId;
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

      const prevMsgCount = session.conversationHistory.length;
      session = await this.executeScript(script, sessionId, session, null);

      // Phase 0: 会话启动时调用 recall（仅记录日志）
      if (this.memoryRepository) {
        const memoryContext = await this.memoryRepository.recall(
          sessionData.userId,
          '用户核心问题、关键事件、治疗进展'
        );
        session.metadata.memoryContext = memoryContext;
        logger.info('🧠 [Memory] recall at session start:', {
          userId: sessionData.userId,
          worldFacts: memoryContext.worldFacts.length,
          experiences: memoryContext.experiences.length,
          opinions: memoryContext.opinions.length,
          hasSummary: !!memoryContext.observationSummary,
        });
      }

      if (session.metadata.sessionConfig) {
        const currentMetadata = (sessionData.metadata as Record<string, any>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          sessionConfig: session.metadata.sessionConfig,
        };
        await this.repository.updateSessionMetadata(sessionId, updatedMetadata);
        logger.debug('💾 Saved sessionConfig to database:', session.metadata.sessionConfig);
      }

      await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevMsgCount);
      await this.saveVariableSnapshots(session);
      await this.repository.persistSession(session, globalVariables);

      await this.maybeReflect(sessionData.userId, session);

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

  async processUserInput(sessionId: string, userInput: string): Promise<SessionResponse> {
    logger.info('🔵 processUserInput called', { sessionId, userInput });

    const sessionData = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(sessionData.scriptId);

    try {
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, sessionData.userId);

      // Pre-load history to know which AI messages are new (for saveNewAIMessagesFromSession)
      const prevConversationHistory = await this.repository.loadConversationHistory(sessionId);
      const prevMsgCount = prevConversationHistory.length;

      await this.repository.saveUserMessage(sessionId, userInput);

      const conversationHistory = await this.repository.loadConversationHistory(sessionId);

      let session = this.restoreSession(sessionData, globalVariables, conversationHistory);

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

      const prevPosition = session.position;
      session = await this.executeScript(script, sessionId, session, userInput);

      // Phase 2: per-Action retain（非 per-round）
      // 检测 Action 是否完成，对完成的 Action 做一次完整对话片段的 retain
      if (this.memoryRepository) {
        const newPosition = session.position;
        const prevActionId = (prevPosition as Record<string, any>)?.actionId;
        const newActionId = (newPosition as Record<string, any>)?.actionId;
        // Action 前进（跳到新 action）
        const actionChanged = prevActionId && prevActionId !== newActionId;
        // Session 完成但 Action 未前进（最后一个 Action 完成时）
        const sessionEnded =
          session.executionStatus === 'completed' && prevActionId === newActionId;

        if (actionChanged || sessionEnded) {
          const snapshots = (session.metadata.actionSnapshots || {}) as Record<string, any>;
          const retainActionId = actionChanged ? prevActionId : newActionId;
          const currentSnapshot = snapshots[retainActionId];
          const nextSnapshot = actionChanged ? snapshots[newActionId] : undefined;

          if (currentSnapshot) {
            const startIdx: number = currentSnapshot.conversationHistoryLength ?? 0;
            const endIdx: number = nextSnapshot
              ? nextSnapshot.conversationHistoryLength
              : session.conversationHistory.length;
            const actionMessages = session.conversationHistory.slice(startIdx, endIdx);

            if (actionMessages.length > 0) {
              logger.info('🧠 [Memory] per-Action retain:', {
                userId: sessionData.userId,
                actionId: retainActionId,
                msgCount: actionMessages.length,
                trigger: actionChanged ? 'action-changed' : 'session-ended',
              });
              this.memoryRepository
                .retain(
                  sessionData.userId,
                  actionMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                    timestamp: new Date(),
                  })),
                  {
                    documentId: retainActionId,
                    tags: ['chat'],
                    // 来源标注（决策 4）：对话 retain 统一标注渠道与可信度，供证据溯源
                    metadata: {
                      source_channel: 'dialogue',
                      source_credibility: 'high',
                    },
                  }
                )
                .then(() => {
                  logger.debug('🧠 [Memory] retain completed:', {
                    userId: sessionData.userId,
                    actionId: retainActionId,
                  });
                })
                .catch((err) => {
                  logger.warn('🧠 [Memory] retain failed:', err.message);
                });
            }
          }
        }
        // 如果 Action 没变且 session 没结束，本轮不 retain
      }

      await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevMsgCount);
      await this.saveVariableSnapshots(session);
      await this.repository.persistSession(session, globalVariables);

      await this.maybeReflect(sessionData.userId, session);

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

    const metadata = (sessionData.metadata as Record<string, any>) || {};
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

    const msgCount: number =
      (snapshot.messageCount as number) ?? (snapshot.conversationHistoryLength as number) ?? 0;
    await this.repository.flagSupersededMessages(sessionId, msgCount);

    let rerunHistory = (metadata.rerunHistory || []) as any[];
    rerunHistory = rerunHistory.filter((entry: any) => {
      const entryIdx = allActionIds.indexOf(entry.actionId);
      return entryIdx >= 0 && entryIdx <= targetIdx;
    });

    const newRunId = uuidv4();

    const restoredMetadata: Record<string, any> = {
      ...metadata,
      variableStore: snapshot.variableStore,
      actionSnapshots: newSnapshots,
      rerunHistory,
      llmConfig: llmConfig || metadata.llmConfig,
      rerunConfigOverride: configOverride || undefined,
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
    const conversationHistory = await this.repository.loadConversationHistory(sessionId);

    const updatedSessionData = await this.repository.loadSessionById(sessionId);
    let session = this.restoreSession(updatedSessionData, globalVariables, conversationHistory);

    if (configOverride) {
      session.metadata.rerunConfigOverride = configOverride;
    }

    const prevMsgCount = session.conversationHistory.length;
    session = await this.executeScript(script, sessionId, session, null);

    this.addRerunVersion(session, targetKey, configOverride, llmConfig);

    await this.repository.saveNewAIMessagesFromSession(sessionId, session, prevMsgCount);
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

  private async maybeReflect(userId: string, session: Session): Promise<void> {
    if (!this.memoryRepository) return;
    if (session.executionStatus !== 'completed') return;

    try {
      const result = await this.memoryRepository.reflect(userId);
      logger.debug('🧠 [Memory] reflect completed:', {
        userId,
        summary: result.summary,
      });
    } catch (err: any) {
      logger.warn('🧠 [Memory] reflect failed:', err.message);
    }
  }
}
