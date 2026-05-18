/**
 * Session Repository
 *
 * All database I/O for session management. Extracted from SessionManager
 * to separate persistence concerns from business orchestration.
 */

import type { Session } from '@heartrule/core-engine';
import { createLogger } from '@heartrule/core-engine';
import { and, eq, count, sql, inArray } from 'drizzle-orm';
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
} from '../db/schema.js';

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
  parsedContent?: any;
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
  saveUserMessage(sessionId: string, userInput: string): Promise<void>;
  saveVariableSnapshots(snapshots: NewVariable[]): Promise<void>;

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

  // Session-based persistence (Phase 2: Session domain activation)
  persistSession(session: Session, globalVariables: Record<string, any>): Promise<void>;
  saveNewAIMessagesFromSession(
    sessionId: string,
    session: Session,
    prevHistoryLength: number
  ): Promise<void>;

  // Route-level operations (formerly inline db.* in routes)
  createSession(
    userId: string,
    scriptId: string,
    initialVariables?: Record<string, unknown>,
    projectId?: string
  ): Promise<string>;
  deleteSession(sessionId: string): Promise<boolean>;
  listSessionsByProject(
    projectId: string,
    limit?: number
  ): Promise<
    Array<{
      sessionId: string;
      scriptId: string;
      scriptFileName: string;
      executionStatus: string;
      createdAt: string;
      updatedAt: string;
      position: Record<string, unknown> | null;
      messageCount: number;
    }>
  >;
  getRawMessages(sessionId: string): Promise<any[]>;
  listUserSessions(userId: string): Promise<SessionData[]>;
  getDebugEntries(sessionId: string, runId?: string): Promise<any[]>;
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
      parsedContent: (script as any).parsedContent,
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

  // ==================== Session-based Persistence ====================

  async persistSession(session: Session, globalVariables: Record<string, any>): Promise<void> {
    logger.debug('💾 Persisting session state to DB');

    logger.info('[DEBUG-UPDATESTATE] persistSession called', {
      hasActionSnapshots: !!session.metadata.actionSnapshots,
      snapshotKeys: session.metadata.actionSnapshots
        ? Object.keys(session.metadata.actionSnapshots as Record<string, any>)
        : [],
    });

    // Backfill messageCount on snapshots
    if (session.metadata.actionSnapshots) {
      const snapshots = session.metadata.actionSnapshots;
      let msgCount: number | null = null;
      for (const key of Object.keys(snapshots)) {
        if (snapshots[key].messageCount === undefined) {
          if (msgCount === null) {
            msgCount = await this.getMessageCount(session.sessionId);
          }
          snapshots[key].messageCount = msgCount;
        }
      }
    }

    // Auto-create v1 entries in rerunHistory
    const actionSnapshots = session.metadata.actionSnapshots;
    if (actionSnapshots) {
      const rerunHistory = (session.metadata.rerunHistory || []) as any[];
      for (const [actionId, snapshot] of Object.entries(actionSnapshots)) {
        const alreadyExists = rerunHistory.some((e: any) => e.actionId === actionId);
        if (!alreadyExists) {
          const originalConfig = (snapshot as any).originalConfig || {};
          rerunHistory.push({
            versionId: uuidv4(),
            actionId,
            runId: session.metadata.currentRunId,
            timestamp: new Date().toISOString(),
            config: originalConfig.config || {},
            llmConfig: originalConfig.llm_config || undefined,
            result: {
              roundsUsed: (session.metadata.actionRoundInfo as any)?.[actionId]?.currentRound ?? 1,
              variableCount: Object.keys(session.variables || {}).length,
            },
          });
        }
      }
      session.metadata.rerunHistory = rerunHistory;
    }

    const runId = session.metadata.currentRunId;

    const updateData: Record<string, any> = {
      position: {
        phaseIndex: session.position.phaseIndex,
        topicIndex: session.position.topicIndex,
        actionIndex: session.position.actionIndex,
      },
      variables: session.variables,
      executionStatus: session.executionStatus,
      metadata: {
        ...session.metadata,
        globalVariables,
        variableStore: session.variableStore,
      },
      updatedAt: new Date(),
    };

    if (runId) {
      updateData.currentRunId = runId;
    }

    await db.update(sessions).set(updateData).where(eq(sessions.id, session.sessionId));

    // Persist debug entries to debug_entries table
    await this.saveDebugEntries(session);
  }

  /**
   * Persist lastLLMDebugInfo entries from Session into the debug_entries table.
   * Groups entries by (phaseId, topicId, actionId, round) so all LLM calls
   * for one action execution form a single debug_entries row.
   */
  private async saveDebugEntries(session: Session): Promise<void> {
    const debugEntries_ = session.lastLLMDebugInfo;
    if (!debugEntries_ || debugEntries_.length === 0) return;

    const runId = (session.metadata.currentRunId as string) || 'default';
    const phaseId = (session.position.phaseId as string) || `phase_${session.position.phaseIndex}`;
    const topicId = (session.position.topicId as string) || `topic_${session.position.topicIndex}`;
    const actionId =
      (session.position.actionId as string) || `action_${session.position.actionIndex}`;
    const actionType = (session.position.actionType as string) || 'unknown';

    // Determine round from actionRoundInfo
    let round = 1;
    const roundInfo = session.metadata.actionRoundInfo as
      | Record<string, { currentRound?: number }>
      | undefined;
    if (roundInfo?.[actionId]?.currentRound) {
      round = roundInfo[actionId].currentRound!;
    }

    // Group by (actionId, round) — supports multiple actions per execution cycle
    const groups = new Map<string, typeof debugEntries_>();
    for (const entry of debugEntries_) {
      const key = `${entry.actionId || actionId}|${round}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    for (const [, group] of groups) {
      const first = group[0];
      const content = {
        entries: group.map((e) => ({
          type: 'llm_call' as const,
          model: e.model,
          tokensUsed: e.tokensUsed,
          responseTimeMs: e.responseTimeMs,
          finishReason: (e.config as any)?.finish_reason,
          prompt: e.prompt,
          response:
            (e.response as any)?.text ??
            (typeof e.response === 'string' ? e.response : JSON.stringify(e.response)),
        })),
      };

      const entryActionId = first.actionId || actionId;
      const entryActionType = first.actionType || actionType;

      // Check for existing row to merge into
      const existing = await db.query.debugEntries.findFirst({
        where: and(
          eq(debugEntries.sessionId, session.sessionId),
          eq(debugEntries.runId, runId),
          eq(debugEntries.phaseId, phaseId),
          eq(debugEntries.topicId, topicId),
          eq(debugEntries.actionId, entryActionId),
          eq(debugEntries.round, round)
        ),
      });

      if (existing) {
        const existingEntries = (existing.content as any)?.entries || [];
        await db
          .update(debugEntries)
          .set({
            content: { entries: [...existingEntries, ...content.entries] },
          } as any)
          .where(eq(debugEntries.id, existing.id));
      } else {
        await db.insert(debugEntries).values({
          sessionId: session.sessionId,
          runId,
          phaseId,
          topicId,
          actionId: entryActionId,
          actionType: entryActionType,
          round,
          content,
        } as any);
      }
    }

    logger.debug('💾 Saved debug entries', { count: debugEntries_.length, groups: groups.size });
  }

  async saveNewAIMessagesFromSession(
    sessionId: string,
    session: Session,
    prevHistoryLength: number
  ): Promise<void> {
    const newMessages = session.conversationHistory.slice(prevHistoryLength);

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

  // ==================== Route-level operations ====================

  async createSession(
    userId: string,
    scriptId: string,
    initialVariables?: Record<string, unknown>,
    projectId?: string
  ): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date();

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      scriptId,
      status: 'active',
      executionStatus: 'running',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: initialVariables || {},
      metadata: projectId ? { projectId } : {},
      createdAt: now,
      updatedAt: now,
    });

    if (projectId) {
      await db.transaction(async (tx) => {
        const countResult = await tx
          .select({ count: count() })
          .from(sessions)
          .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`);
        const projectSessionCount = countResult[0]?.count ?? 0;

        if (projectSessionCount > 50) {
          const excessCount = projectSessionCount - 50;
          const oldestToDelete = await tx
            .select({ id: sessions.id })
            .from(sessions)
            .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`)
            .orderBy(sql`${sessions.updatedAt} ASC`)
            .limit(excessCount);

          for (const old of oldestToDelete) {
            await tx.delete(messages).where(eq(messages.sessionId, old.id));
            await tx.delete(sessions).where(eq(sessions.id, old.id));
          }
          logger.info(`Auto-cleaned ${oldestToDelete.length} old sessions`);
        }
      });
    }

    return sessionId;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) return false;

    await db.delete(messages).where(eq(messages.sessionId, sessionId));
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return true;
  }

  async listSessionsByProject(
    projectId: string,
    limit: number = 50
  ): Promise<
    Array<{
      sessionId: string;
      scriptId: string;
      scriptFileName: string;
      executionStatus: string;
      createdAt: string;
      updatedAt: string;
      position: Record<string, unknown> | null;
      messageCount: number;
    }>
  > {
    const projectSessions = await db
      .select({
        id: sessions.id,
        scriptId: sessions.scriptId,
        executionStatus: sessions.executionStatus,
        position: sessions.position,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
      })
      .from(sessions)
      .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`)
      .orderBy(sql`${sessions.updatedAt} DESC`)
      .limit(Math.min(limit, 50));

    const sessionIds = projectSessions.map((s) => s.id);
    if (sessionIds.length === 0) return [];

    const scriptIds = [...new Set(projectSessions.map((s) => s.scriptId).filter(Boolean))];

    const [scriptRows, msgCountRows] = await Promise.all([
      scriptIds.length > 0
        ? db
            .select({ id: scripts.id, scriptName: scripts.scriptName })
            .from(scripts)
            .where(inArray(scripts.id, scriptIds))
        : [],
      db
        .select({ sessionId: messages.sessionId, count: count() })
        .from(messages)
        .where(inArray(messages.sessionId, sessionIds))
        .groupBy(messages.sessionId),
    ]);

    const scriptNameMap = new Map(scriptRows.map((r) => [r.id, r.scriptName]));
    const msgCountMap = new Map(msgCountRows.map((r) => [r.sessionId, r.count]));

    return projectSessions.map((s) => ({
      sessionId: s.id,
      scriptId: s.scriptId,
      scriptFileName: scriptNameMap.get(s.scriptId) || 'unknown.yaml',
      executionStatus: s.executionStatus,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      position: s.position,
      messageCount: msgCountMap.get(s.id) ?? 0,
    }));
  }

  async getRawMessages(sessionId: string): Promise<any[]> {
    return db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (messages, { asc }) => [asc(messages.timestamp)],
    });
  }

  async listUserSessions(userId: string): Promise<SessionData[]> {
    return db.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
    }) as Promise<SessionData[]>;
  }

  async getDebugEntries(sessionId: string, runId?: string): Promise<any[]> {
    const conditions = [eq(debugEntries.sessionId, sessionId)];
    if (runId) {
      conditions.push(eq(debugEntries.runId, runId));
    }

    return db.query.debugEntries.findMany({
      where: and(...conditions),
      orderBy: (debugEntries, { asc }) => [
        asc(debugEntries.phaseId),
        asc(debugEntries.topicId),
        asc(debugEntries.actionId),
        asc(debugEntries.round),
        asc(debugEntries.createdAt),
      ],
    });
  }
}
