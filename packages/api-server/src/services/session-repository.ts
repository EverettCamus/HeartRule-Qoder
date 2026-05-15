/**
 * Session Repository
 *
 * All database I/O for session management. Extracted from SessionManager
 * to separate persistence concerns from business orchestration.
 */

import type { ExecutionState } from '@heartrule/core-engine';
import { createLogger } from '@heartrule/core-engine';
import { and, eq, count } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

import { db } from '../db/index.js';
import {
  sessions,
  messages,
  scripts,
  variables,
  scriptFiles,
  userGlobalVariables,
  debugEntries,
  type NewVariable,
  type NewDebugEntry,
} from '../db/schema.js';

import { determineDebugEntryRound } from './session-variable-utils.js';

const logger = createLogger('SessionRepository');

// ---- Types ----

export interface SessionData {
  id: string;
  scriptId: string;
  userId: string;
  status: string;
  executionStatus: string;
  variables: Record<string, unknown> | null;
  position: Record<string, unknown> | null;
  metadata: Record<string, any> | null;
}

export interface ScriptData {
  id: string;
  scriptName: string;
  scriptContent: string;
  projectId?: string;
  tags?: string[];
}

// ---- Interface ----

export interface ISessionRepository {
  // Reads
  loadSessionById(sessionId: string): Promise<SessionData>;
  loadScriptById(scriptId: string): Promise<ScriptData>;
  loadConversationHistory(sessionId: string): Promise<any[]>;
  loadGlobalVariables(
    scriptName: string,
    userId: string
  ): Promise<{
    values: Record<string, any>;
    definitions: Array<{ name: string; define?: string; defaultValue?: unknown }>;
  }>;
  getScriptTags(scriptId: string): Promise<string[]>;
  getMessageCount(sessionId: string): Promise<number>;

  // Writes
  saveNewAIMessages(
    sessionId: string,
    executionState: ExecutionState,
    prevHistoryLength: number
  ): Promise<void>;
  saveUserMessage(sessionId: string, userInput: string): Promise<void>;
  saveVariableSnapshots(snapshots: NewVariable[]): Promise<void>;
  saveDebugEntry(sessionId: string, executionState: ExecutionState): Promise<void>;
  updateSessionState(
    sessionId: string,
    executionState: ExecutionState,
    globalVariables: Record<string, any>
  ): Promise<void>;

  // Session lifecycle
  setSessionRunId(sessionId: string, runId: string): Promise<void>;
  updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<void>;
  updateSessionVariablesAndMetadata(
    sessionId: string,
    variables: Record<string, unknown>,
    metadata: Record<string, any>
  ): Promise<void>;
  updateSessionForRerun(
    sessionId: string,
    position: Record<string, unknown>,
    metadata: Record<string, any>,
    runId: string
  ): Promise<void>;

  // Global variable persistence
  persistGlobalVariable(
    userId: string,
    projectId: string,
    name: string,
    value: unknown
  ): Promise<void>;

  // Rerun support
  flagSupersededMessages(sessionId: string, fromMessageIndex: number): Promise<void>;
}

// ---- Implementation ----

export class SessionRepository implements ISessionRepository {
  // ==================== Reads ====================

  async loadSessionById(sessionId: string): Promise<SessionData> {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      logger.error('❌ Session not found:', { sessionId });
      throw new Error('Session not found');
    }

    logger.info('✅ Session found', {
      id: session.id,
      scriptId: session.scriptId,
      status: session.status,
      executionStatus: session.executionStatus,
    });

    return session as SessionData;
  }

  async loadScriptById(scriptId: string): Promise<ScriptData> {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, scriptId),
    });

    if (!script) {
      logger.error('❌ Script not found:', { scriptId });
      throw new Error('Script not found');
    }

    const tags = (script.tags as string[]) || [];
    const projectTag = tags.find((tag) => tag.startsWith('project:'));
    const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

    logger.info('✅ Script found', {
      id: script.id,
      scriptName: script.scriptName,
      contentLength: script.scriptContent.length,
      projectId,
    });

    return {
      id: script.id,
      scriptName: script.scriptName,
      scriptContent: script.scriptContent,
      projectId,
      tags,
    };
  }

  async loadConversationHistory(sessionId: string): Promise<any[]> {
    const history = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (fields, { asc }) => [asc(fields.timestamp)],
    });

    const activeMessages = history.filter(
      (m) => !((m.metadata as Record<string, any>)?.superseded === true)
    );

    logger.debug(
      `📋 Loaded ${activeMessages.length}/${history.length} active messages from database:`,
      {
        aiMessages: activeMessages.filter((m) => m.role === 'assistant').length,
        userMessages: activeMessages.filter((m) => m.role === 'user').length,
        supersededCount: history.length - activeMessages.length,
      }
    );

    return activeMessages.map((m) => ({
      role: m.role,
      content: m.content,
      actionId: m.actionId || undefined,
      metadata: (m.metadata as Record<string, any>) || {},
    }));
  }

  async loadGlobalVariables(
    scriptName: string,
    userId: string
  ): Promise<{
    values: Record<string, any>;
    definitions: Array<{ name: string; define?: string; defaultValue?: unknown }>;
  }> {
    try {
      const sessionFile = await db.query.scriptFiles.findFirst({
        where: eq(scriptFiles.fileName, scriptName),
      });

      if (!sessionFile) {
        return { values: {}, definitions: [] };
      }

      const globalFile = await db.query.scriptFiles.findFirst({
        where: (fields, { and: andFn, eq: eqFn }) =>
          andFn(eqFn(fields.projectId, sessionFile.projectId), eqFn(fields.fileType, 'global')),
      });

      if (!globalFile) {
        return { values: {}, definitions: [] };
      }

      const definitions: Array<{ name: string; define?: string; defaultValue?: unknown }> = [];

      if (globalFile.yamlContent) {
        const parsed = yaml.parse(globalFile.yamlContent);
        if (parsed && parsed.variables && Array.isArray(parsed.variables)) {
          for (const varDef of parsed.variables) {
            if (varDef.name) {
              definitions.push({
                name: varDef.name,
                define: varDef.define,
                defaultValue: varDef.defaultValue,
              });
            }
          }
        }
      } else if (globalFile.fileContent) {
        const content = globalFile.fileContent as any;
        if (content.variables && Array.isArray(content.variables)) {
          for (const varDef of content.variables) {
            if (varDef.name) {
              definitions.push({
                name: varDef.name,
                define: varDef.define,
                defaultValue: varDef.defaultValue,
              });
            }
          }
        }
      }

      let storedValues: Record<string, any> = {};
      if (userId && sessionFile.projectId) {
        const userVars = await db.query.userGlobalVariables.findFirst({
          where: (fields, { and: andFn, eq: eqFn }) =>
            andFn(eqFn(fields.userId, userId), eqFn(fields.projectId, sessionFile.projectId)),
        });
        if (userVars?.variables) {
          storedValues = userVars.variables as Record<string, any>;
        }
      }

      const values: Record<string, any> = {};
      for (const def of definitions) {
        if (def.name in storedValues) {
          values[def.name] = storedValues[def.name];
        } else if (def.defaultValue !== undefined) {
          values[def.name] = def.defaultValue;
        }
      }

      logger.debug('📋 Loaded global variables from global.yaml:', Object.keys(values));
      logger.debug('📋 Global variable definitions:', definitions.length);

      return { values, definitions };
    } catch (error) {
      logger.error('❌ Error loading global variables:', error);
      return { values: {}, definitions: [] };
    }
  }

  async getScriptTags(scriptId: string): Promise<string[]> {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, scriptId),
    });
    return (script?.tags as string[]) || [];
  }

  async getMessageCount(sessionId: string): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));
    return result[0]?.count ?? 0;
  }

  // ==================== Writes ====================

  async saveNewAIMessages(
    sessionId: string,
    executionState: ExecutionState,
    prevHistoryLength: number
  ): Promise<void> {
    const newMessages = executionState.conversationHistory.slice(prevHistoryLength);

    for (const msg of newMessages) {
      if (msg.role === 'assistant') {
        await db.insert(messages).values({
          sessionId,
          role: 'assistant',
          content: msg.content || '',
          actionId: msg.actionId,
          metadata: msg.metadata || {},
          timestamp: new Date(),
        });
        logger.debug('Saved AI message', {
          actionId: msg.actionId,
          length: msg.content?.length,
        });
      }
    }
  }

  async saveUserMessage(sessionId: string, userInput: string): Promise<void> {
    await db.insert(messages).values({
      sessionId,
      role: 'user',
      content: userInput,
      metadata: {},
      timestamp: new Date(),
    });
  }

  async saveVariableSnapshots(snapshots: NewVariable[]): Promise<void> {
    if (snapshots.length > 0) {
      logger.debug('💾 Saving variable snapshots:', snapshots.length);
      await db.insert(variables).values(snapshots);
    }
  }

  async saveDebugEntry(sessionId: string, executionState: ExecutionState): Promise<void> {
    const debugInfos = executionState.lastLLMDebugInfo;
    if (!debugInfos || debugInfos.length === 0) return;

    const runId = executionState.metadata.currentRunId || 'unknown';
    const phaseId = executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`;
    const topicId = executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`;
    const actionId = executionState.currentActionId || `action_${executionState.currentActionIdx}`;
    const actionType = executionState.currentActionType || 'unknown';

    const round = determineDebugEntryRound(executionState.metadata, actionId);

    const entries: Array<Record<string, unknown>> = debugInfos.map((info: any) => ({
      type: 'llm_call',
      model: info.model,
      tokensUsed: info.tokensUsed,
      responseTimeMs: info.responseTimeMs,
      finishReason: info.response?.finishReason,
      prompt: info.prompt,
      response: typeof info.response === 'string' ? info.response : info.response?.text || '',
    }));

    const content = { entries };

    try {
      await db.insert(debugEntries).values({
        sessionId,
        runId,
        phaseId,
        topicId,
        actionId,
        actionType,
        round,
        content,
      } as NewDebugEntry);
      logger.info('💾 Debug entry saved', { actionId, runId, round, entryCount: entries.length });
    } catch (err: any) {
      logger.error('Failed to save debug entry:', err.message);
    }
  }

  async updateSessionState(
    sessionId: string,
    executionState: ExecutionState,
    globalVariables: Record<string, any>
  ): Promise<void> {
    logger.debug('💾 Updating session state in DB');

    logger.info('[DEBUG-UPDATESTATE] updateSessionState called', {
      hasActionSnapshots: !!executionState.metadata.actionSnapshots,
      snapshotKeys: executionState.metadata.actionSnapshots
        ? Object.keys(executionState.metadata.actionSnapshots as Record<string, any>)
        : [],
      metadataKeys: Object.keys(executionState.metadata),
    });

    // Backfill messageCount on snapshots
    if (executionState.metadata.actionSnapshots) {
      const snapshots = executionState.metadata.actionSnapshots;
      let msgCount: number | null = null;
      for (const key of Object.keys(snapshots)) {
        if (snapshots[key].messageCount === undefined) {
          if (msgCount === null) {
            msgCount = await this.getMessageCount(sessionId);
          }
          snapshots[key].messageCount = msgCount;
        }
      }
    }

    // Auto-create v1 entries in rerunHistory for actions that don't have one yet
    const actionSnapshotsForV1 = executionState.metadata.actionSnapshots;
    if (actionSnapshotsForV1) {
      const rerunHistory = (executionState.metadata.rerunHistory || []) as any[];
      for (const [actionId, snapshot] of Object.entries(actionSnapshotsForV1)) {
        const alreadyExists = rerunHistory.some((e: any) => e.actionId === actionId);
        if (!alreadyExists) {
          const originalConfig = (snapshot as any).originalConfig || {};
          rerunHistory.push({
            versionId: uuidv4(),
            actionId,
            runId: executionState.metadata.currentRunId,
            timestamp: new Date().toISOString(),
            config: originalConfig.config || {},
            llmConfig: originalConfig.llm_config || undefined,
            result: {
              roundsUsed: executionState.metadata.actionRoundInfo?.[actionId]?.currentRound ?? 1,
              variableCount: Object.keys(executionState.variables || {}).length,
            },
          });
        }
      }
      executionState.metadata.rerunHistory = rerunHistory;
    }

    const runId = executionState.metadata.currentRunId;

    const updateData: Record<string, any> = {
      position: {
        phaseIndex: executionState.currentPhaseIdx,
        topicIndex: executionState.currentTopicIdx,
        actionIndex: executionState.currentActionIdx,
      },
      variables: executionState.variables,
      executionStatus: executionState.status,
      metadata: {
        ...executionState.metadata,
        globalVariables,
        variableStore: executionState.variableStore,
      },
      updatedAt: new Date(),
    };

    if (runId) {
      updateData.currentRunId = runId;
    }

    await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId));
  }

  // ==================== Session Lifecycle ====================

  async setSessionRunId(sessionId: string, runId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ currentRunId: runId, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async updateSessionMetadata(sessionId: string, metadata: Record<string, any>): Promise<void> {
    await db
      .update(sessions)
      .set({ metadata, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId));
  }

  async updateSessionVariablesAndMetadata(
    sessionId: string,
    variables: Record<string, unknown>,
    metadata: Record<string, any>
  ): Promise<void> {
    await db
      .update(sessions)
      .set({
        variables,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
  }

  async updateSessionForRerun(
    sessionId: string,
    position: Record<string, unknown>,
    metadata: Record<string, any>,
    runId: string
  ): Promise<void> {
    await db
      .update(sessions)
      .set({
        position: position as any,
        executionStatus: 'running',
        variables: {} as any,
        currentRunId: runId,
        metadata: metadata as any,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
  }

  // ==================== Global Variable Persistence ====================

  async persistGlobalVariable(
    userId: string,
    projectId: string,
    name: string,
    value: unknown
  ): Promise<void> {
    const existing = await db.query.userGlobalVariables.findFirst({
      where: (fields, { and: andFn, eq: eqFn }) =>
        andFn(eqFn(fields.userId, userId), eqFn(fields.projectId, projectId)),
    });

    const merged = {
      ...((existing?.variables as Record<string, unknown>) || {}),
      [name]: value,
    };

    if (existing) {
      await db
        .update(userGlobalVariables)
        .set({ variables: merged, updatedAt: new Date() })
        .where(
          and(eq(userGlobalVariables.userId, userId), eq(userGlobalVariables.projectId, projectId))
        );
    } else {
      await db.insert(userGlobalVariables).values({
        userId,
        projectId,
        variables: { [name]: value },
      });
    }
  }

  // ==================== Rerun Support ====================

  async flagSupersededMessages(sessionId: string, fromMessageIndex: number): Promise<void> {
    const allMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.timestamp);

    if (fromMessageIndex >= allMessages.length) return;

    const idsToFlag = allMessages.slice(fromMessageIndex).map((m) => m.id);
    if (idsToFlag.length === 0) return;

    const supersededMeta = { superseded: true, supersededAt: new Date().toISOString() };

    for (const msgId of idsToFlag) {
      const msg = await db.query.messages.findFirst({
        where: eq(messages.id, msgId),
      });
      if (msg) {
        const existingMeta = (msg.metadata as Record<string, any>) || {};
        await db
          .update(messages)
          .set({
            metadata: { ...existingMeta, ...supersededMeta },
          })
          .where(eq(messages.id, msgId));
      }
    }

    logger.debug(`🏷️ Flagged ${idsToFlag.length} messages as superseded after snapshot point`);
  }
}
