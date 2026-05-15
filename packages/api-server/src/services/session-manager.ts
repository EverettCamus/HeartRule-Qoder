/**
 * 会话管理服务
 *
 * 集成脚本执行引擎，提供基于 YAML 脚本的会话管理
 */

import {
  ScriptExecutor,
  type TemplateProvider,
  type ExecutionState,
  createLogger,
} from '@heartrule/core-engine';
import type { DetailedApiError } from '@heartrule/shared-types';
import { VariableScope, ExecutionStatus } from '@heartrule/shared-types';
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
  type NewDebugEntry,
} from '../db/schema.js';
import { container } from '../ioc/container.js';
import { buildDetailedError } from '../utils/error-handler.js';

import { DatabaseTemplateProvider } from './database-template-provider.js';
import {
  flattenVariableStore,
  calculateRoundChanges,
  extractExitReason,
  buildVariableSnapshots,
  determineDebugEntryRound,
} from './session-variable-utils.js';

const logger = createLogger('SessionManager');

// 类型定义
interface SessionData {
  id: string;
  scriptId: string;
  userId: string;
  status: string;
  executionStatus: string;
  variables: Record<string, unknown> | null;
  position: Record<string, unknown> | null;
  metadata: Record<string, any> | null;
}

interface ScriptData {
  id: string;
  scriptName: string;
  scriptContent: string;
  projectId?: string; // 从 tags 中提取
  tags?: string[];
}

interface SessionResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  currentRunId?: string;
  variables?: Record<string, unknown>;
  globalVariables?: Record<string, unknown>;
  variableStore?: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  position?: {
    phaseIndex: number;
    phaseId: string;
    topicIndex: number;
    topicId: string;
    actionIndex: number;
    actionId: string;
    actionType: string;
    currentRound?: number;
    maxRounds?: number;
  };
  error?: DetailedApiError;
  actionSnapshots?: Record<string, any>;
  rerunHistory?: any[];
}

/**
 * 会话管理器
 */
export class SessionManager {
  private scriptExecutor: ScriptExecutor;
  private templateProvider: TemplateProvider;
  private prevVariableSnapshots: Map<
    string,
    {
      global: Record<string, any>;
      session: Record<string, any>;
      phase: Record<string, any>;
      topic: Record<string, any>;
    }
  > = new Map();

  constructor() {
    // Phase 4: 使用依赖注入容器获取 ScriptExecutor
    this.scriptExecutor = container.getScriptExecutor();
    this.templateProvider = new DatabaseTemplateProvider();
  }

  /**
   * 从数据库加载会话数据
   */
  private async loadSessionById(sessionId: string): Promise<SessionData> {
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

  /**
   * 从数据库加载脚本数据
   */
  private async loadScriptById(scriptId: string): Promise<ScriptData> {
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

  /**
   * 加载对话历史消息
   */
  private async loadConversationHistory(sessionId: string): Promise<any[]> {
    const history = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (fields, { asc }) => [asc(fields.timestamp)],
    });

    // Filter out superseded messages so the LLM only sees the current timeline
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

  /**
   * 创建初始执行状态
   */
  private createInitialExecutionState(
    globalVariables: Record<string, any>,
    sessionVariables: Record<string, unknown> | null,
    conversationHistory: any[],
    sessionMetadata?: Record<string, any> | null // 添加 session metadata
  ): ExecutionState {
    const executionState: ExecutionState = ScriptExecutor.createInitialState();
    executionState.variables = {
      ...globalVariables,
      ...((sessionVariables as Record<string, unknown>) || {}),
    };
    executionState.conversationHistory = conversationHistory;

    // Populate variableStore.global with loaded global variables (fix gap)
    if (executionState.variableStore) {
      if (!executionState.variableStore.global) executionState.variableStore.global = {};
      for (const [key, value] of Object.entries(globalVariables)) {
        executionState.variableStore.global[key] = {
          value,
          type: typeof value,
          source: 'global_init',
          lastUpdated: new Date().toISOString(),
          scope: VariableScope.GLOBAL,
        };
      }
    }

    // 将 session.metadata 中的数据传递到 executionState.metadata
    if (sessionMetadata) {
      // 传递 projectId
      if (sessionMetadata.projectId) {
        executionState.metadata.projectId = sessionMetadata.projectId;
      }

      // 传递 sessionConfig（包含 template_scheme）
      if (sessionMetadata.sessionConfig) {
        executionState.metadata.sessionConfig = sessionMetadata.sessionConfig;
      }
    }

    logger.debug('📋 Initial execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      variables: executionState.variables,
      projectId: executionState.metadata.projectId,
      sessionConfig: executionState.metadata.sessionConfig,
    });

    return executionState;
  }

  /**
   * 恢复执行状态（用于处理用户输入）
   */
  private restoreExecutionState(
    session: SessionData,
    globalVariables: Record<string, any>,
    conversationHistory: any[]
  ): ExecutionState {
    const metadata = (session.metadata as Record<string, any>) || {};

    // 注入 currentRunId 到 metadata（从 sessions.current_run_id 读取）
    if ((session as any).currentRunId) {
      metadata.currentRunId = (session as any).currentRunId;
    }

    logger.info('[DEBUG-RESTORE] restoreExecutionState metadata from session', {
      metadataKeys: Object.keys(metadata),
      hasActionSnapshots: !!metadata.actionSnapshots,
      snapshotKeys: metadata.actionSnapshots ? Object.keys(metadata.actionSnapshots) : [],
    });

    const executionState: ExecutionState = {
      status: (session.executionStatus as ExecutionStatus) || ExecutionStatus.RUNNING,
      currentPhaseIdx: ((session.position as Record<string, unknown>)?.phaseIndex as number) || 0,
      currentTopicIdx: ((session.position as Record<string, unknown>)?.topicIndex as number) || 0,
      currentActionIdx: ((session.position as Record<string, unknown>)?.actionIndex as number) || 0,
      currentAction: null,
      variables: {
        ...globalVariables,
        ...((session.variables as Record<string, unknown>) || {}),
      },
      variableStore: metadata.variableStore || {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: conversationHistory,
      metadata: metadata,
      lastAiMessage: null,
      lastLLMDebugInfo: [],
    };

    // 确保 variableStore.global 包含最新的全局变量，并添加 scope 元数据
    if (executionState.variableStore) {
      if (!executionState.variableStore.global) executionState.variableStore.global = {};
      for (const [key, value] of Object.entries(globalVariables)) {
        if (!executionState.variableStore.global[key]) {
          executionState.variableStore.global[key] = {
            value,
            type: typeof value,
            source: 'global_sync',
            lastUpdated: new Date().toISOString(),
            scope: VariableScope.GLOBAL, // 🔧 明确标记为global作用域
          };
          logger.debug(`🔄 Synced global variable "${key}" to variableStore.global:`, value);
        }
      }
      logger.debug(
        '✅ Global variables synchronized:',
        Object.keys(executionState.variableStore.global)
      );
    }

    logger.debug('📋 Restored execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      hasActionState: !!executionState.metadata.actionState,
      hasLastActionRoundInfo: !!executionState.metadata.lastActionRoundInfo,
      conversationHistoryLength: executionState.conversationHistory.length,
      conversationHistoryContent: executionState.conversationHistory.map(
        (m) => `${m.role}: ${m.content.substring(0, 30)}...`
      ),
      metadata: executionState.metadata,
    });

    return executionState;
  }

  /**
   * 执行脚本并返回更新后的执行状态
   */
  private async executeScript(
    script: ScriptData,
    sessionId: string,
    executionState: ExecutionState,
    userInput: string | null
  ): Promise<ExecutionState> {
    const scriptContent = yaml.parse(script.scriptContent) || {};
    const scriptJson = JSON.stringify(scriptContent);

    logger.debug('📄 Parsed YAML script:', {
      sessionId: scriptContent.session?.session_id,
      sessionName: scriptContent.session?.session_name,
      phasesCount: scriptContent.session?.phases?.length || 0,
      firstPhase: scriptContent.session?.phases?.[0]?.phase_name,
      firstTopic: scriptContent.session?.phases?.[0]?.topics?.[0]?.topic_name,
      actionsCount: scriptContent.session?.phases?.[0]?.topics?.[0]?.actions?.length || 0,
    });

    const logPrefix = userInput === null ? 'initialization' : 'with user input';
    logger.debug(`⏳ Executing script (${logPrefix})...`);

    // 🎯 WI-2: 传递 projectId 和 templateProvider 到 ScriptExecutor
    const updatedState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      userInput,
      script.projectId, // 传递 projectId
      this.templateProvider // 传递 templateProvider
    );

    logger.debug('✅ Script execution completed:', {
      status: updatedState.status,
      phaseIdx: updatedState.currentPhaseIdx,
      topicIdx: updatedState.currentTopicIdx,
      actionIdx: updatedState.currentActionIdx,
      lastAiMessage: updatedState.lastAiMessage,
      hasMessage: !!updatedState.lastAiMessage,
    });

    return updatedState;
  }

  /**
   * 保存新增的 AI 消息
   */
  private async saveNewAIMessages(
    sessionId: string,
    executionState: ExecutionState,
    prevHistoryLength: number
  ): Promise<void> {
    const newMessages = executionState.conversationHistory.slice(prevHistoryLength);
    const aiMessages = newMessages.filter((msg) => msg.role === 'assistant');

    if (aiMessages.length > 0) {
      logger.debug(`💾 Saving ${aiMessages.length} AI message(s):`, {
        messages: aiMessages.map((m) => ({
          actionId: m.actionId,
          content: m.content.substring(0, 50),
        })),
      });

      for (const msg of aiMessages) {
        const aiMessageId = uuidv4();
        await db.insert(messages).values({
          id: aiMessageId,
          sessionId,
          role: 'assistant',
          content: msg.content,
          actionId: msg.actionId,
          metadata: msg.metadata || {},
          timestamp: new Date(),
        });
      }
    } else {
      logger.warn('⚠️ No AI messages to save');
    }
  }

  /**
   * 保存用户消息
   */
  private async saveUserMessage(sessionId: string, userInput: string): Promise<void> {
    const userMessageId = uuidv4();
    logger.debug('💾 Saving user message:', {
      messageId: userMessageId,
      content: userInput,
    });

    await db.insert(messages).values({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: userInput,
      metadata: {},
      timestamp: new Date(),
    });
  }

  /**
   * 保存变量快照
   */
  private async saveVariableSnapshots(
    sessionId: string,
    executionState: ExecutionState
  ): Promise<void> {
    const snapshots = buildVariableSnapshots(sessionId, executionState);
    if (snapshots.length > 0) {
      logger.debug('💾 Saving variable snapshots:', snapshots.length);
      await db.insert(variables).values(snapshots);
    }
  }

  /**
   * 保存调试信息到 debug_entries 表
   */
  private async saveDebugEntry(sessionId: string, executionState: ExecutionState): Promise<void> {
    const debugInfos = executionState.lastLLMDebugInfo;
    if (!debugInfos || debugInfos.length === 0) return;

    const runId = executionState.metadata.currentRunId || 'unknown';
    const phaseId = executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`;
    const topicId = executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`;
    const actionId = executionState.currentActionId || `action_${executionState.currentActionIdx}`;
    const actionType = executionState.currentActionType || 'unknown';

    // Determine current round from metadata
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

  /**
   * 更新会话状态到数据库
   */
  private async updateSessionState(
    sessionId: string,
    executionState: ExecutionState,
    globalVariables: Record<string, any>
  ): Promise<void> {
    logger.debug('💾 Updating session state in DB');

    // Add messageCount to any new snapshots that don't have it yet
    logger.info('[DEBUG-UPDATESTATE] updateSessionState called', {
      hasActionSnapshots: !!executionState.metadata.actionSnapshots,
      snapshotKeys: executionState.metadata.actionSnapshots
        ? Object.keys(executionState.metadata.actionSnapshots as Record<string, any>)
        : [],
      metadataKeys: Object.keys(executionState.metadata),
    });

    if (executionState.metadata.actionSnapshots) {
      const snapshots = executionState.metadata.actionSnapshots;
      let msgCount: number | null = null;
      for (const key of Object.keys(snapshots)) {
        if (snapshots[key].messageCount === undefined) {
          if (msgCount === null) {
            // Count messages for this session
            const result = await db
              .select({ count: count() })
              .from(messages)
              .where(eq(messages.sessionId, sessionId));
            msgCount = result[0]?.count ?? 0;
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

    await this.saveDebugEntry(sessionId, executionState);

    await db.update(sessions).set(updateData).where(eq(sessions.id, sessionId));
  }

  /**
   * 构建会话响应结果
   */
  private buildSessionResponse(
    executionState: ExecutionState,
    session: SessionData,
    script: ScriptData,
    globalVariables: Record<string, any>,
    includeVariableStore: boolean = false
  ): SessionResponse {
    const runId =
      executionState.metadata.currentRunId || (session as any).currentRunId || undefined;
    const result: SessionResponse = {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      currentRunId: runId,
      variables: executionState.variables,
      globalVariables,
      position: {
        phaseIndex: executionState.currentPhaseIdx,
        phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
        topicIndex: executionState.currentTopicIdx,
        topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
        actionIndex: executionState.currentActionIdx,
        actionId: executionState.currentActionId || `action_${executionState.currentActionIdx}`,
        actionType: executionState.currentActionType || 'unknown',
        sourceActionId: executionState.lastAiMessage
          ? executionState.conversationHistory
              .slice()
              .reverse()
              .find((m: any) => m.role === 'assistant')?.actionId
          : undefined,
        sourceActionType: (() => {
          if (!executionState.lastAiMessage) return undefined;
          const sourceActionId = executionState.conversationHistory
            .slice()
            .reverse()
            .find((m: any) => m.role === 'assistant')?.actionId;
          if (!sourceActionId) return undefined;
          // 从脚本中查找 sourceActionId 对应的 actionType
          try {
            const scriptObj =
              typeof script.scriptContent === 'string'
                ? yaml.parse(script.scriptContent)
                : script.scriptContent;
            const sessionData = scriptObj.session || scriptObj;
            for (const phase of sessionData.phases) {
              for (const topic of phase.topics) {
                const action = topic.actions.find(
                  (a: any) => a.action_id === sourceActionId || a.id === sourceActionId
                );
                if (action) return action.action_type || action.type;
              }
            }
          } catch (e) {
            logger.error('❌ Error parsing script:', e);
          }
          return undefined;
        })(),
        currentRound:
          executionState.metadata?.lastActionRoundInfo?.currentRound ??
          executionState.metadata?.actionState?.currentRound,
        maxRounds:
          executionState.metadata?.lastActionRoundInfo?.maxRounds ??
          executionState.metadata?.actionState?.maxRounds,
      } as any,
    };

    // === 新增：计算动作状态和轮次变化 ===
    const currentAction = executionState.currentAction;
    const outputVariables: string[] = currentAction?.config?.output?.map((v: any) => v.get) || [];

    // 计算动作状态
    const actionStatus: 'running' | 'completed' | 'error' =
      executionState.status === 'error'
        ? 'error'
        : executionState.status === 'completed'
          ? 'completed'
          : 'running';

    // 获取当前轮次
    const currentRound =
      executionState.metadata?.actionRoundInfo?.[currentAction?.actionId || '']?.currentRound ||
      executionState.metadata?.actionState?.currentRound;
    const maxRounds =
      currentAction?.config?.max_rounds || executionState.metadata?.actionState?.maxRounds;

    // 添加新字段到 result
    (result as any).actionStatus = actionStatus;
    (result as any).currentRound = currentRound;
    (result as any).maxRounds = maxRounds;
    (result as any).outputVariables = outputVariables;

    // 仅在 processUserInput 中包含扁平化的 variableStore
    if (includeVariableStore) {
      result.variableStore = flattenVariableStore(executionState.variableStore, {
        phaseId: executionState.currentPhaseId,
        topicId: executionState.currentTopicId,
      });
    } else {
      // initializeSession 返回原始的 variableStore
      result.variableStore = executionState.variableStore as any;
    }

    // 计算轮次变化（必须在 variableStore 赋值之后）
    const prevSnapshot = this.prevVariableSnapshots.get(session.id);
    const roundChanges =
      includeVariableStore && outputVariables.length > 0 && currentRound
        ? calculateRoundChanges(
            prevSnapshot || null,
            result.variableStore as any,
            outputVariables,
            currentRound
          )
        : null;

    // 清理快照（session 完成时释放内存）
    if (actionStatus === 'completed') {
      this.prevVariableSnapshots.delete(session.id);
    } else if (includeVariableStore) {
      // 更新快照（用于下一次比较）
      this.prevVariableSnapshots.set(session.id, result.variableStore as any);
    }

    if (roundChanges) {
      (result as any).roundChanges = roundChanges;
    }
    if (actionStatus === 'completed') {
      (result as any).exitReason = extractExitReason(executionState);
    }

    // Include actionSnapshots and rerunHistory for frontend
    if (executionState.metadata.actionSnapshots) {
      result.actionSnapshots = executionState.metadata.actionSnapshots;
    }
    if (executionState.metadata.rerunHistory) {
      result.rerunHistory = executionState.metadata.rerunHistory;
    }

    return result;
  }

  /**
   * 构建错误响应
   */
  private buildErrorResponse(
    error: unknown,
    session: SessionData,
    script: ScriptData,
    sessionId: string
  ): SessionResponse {
    const detailedError = buildDetailedError(error, {
      scriptId: script.id,
      scriptName: script.scriptName,
      sessionId: sessionId,
      position: {
        phaseIndex: ((session.position as Record<string, unknown>)?.phaseIndex as number) || 0,
        topicIndex: ((session.position as Record<string, unknown>)?.topicIndex as number) || 0,
        actionIndex: ((session.position as Record<string, unknown>)?.actionIndex as number) || 0,
      },
    });

    const cachedGlobalVariables =
      ((session.metadata as any)?.globalVariables as Record<string, unknown>) || {};
    const pos = session.position as Record<string, unknown> | null;

    return {
      aiMessage: '',
      sessionStatus: session.status,
      executionStatus: ExecutionStatus.ERROR,
      error: detailedError,
      variables: (session.variables as Record<string, unknown>) || {},
      globalVariables: cachedGlobalVariables,
      position: {
        phaseIndex: (pos?.phaseIndex as number) || 0,
        phaseId: (pos?.phaseId as string) || 'phase_0',
        topicIndex: (pos?.topicIndex as number) || 0,
        topicId: (pos?.topicId as string) || 'topic_0',
        actionIndex: (pos?.actionIndex as number) || 0,
        actionId: (pos?.actionId as string) || 'action_0',
        actionType: (pos?.actionType as string) || 'unknown',
      },
    };
  }

  /**
   * 加载项目的全局变量
   */
  private async loadGlobalVariables(
    scriptName: string,
    userId: string
  ): Promise<{
    values: Record<string, any>;
    definitions: Array<{ name: string; define?: string; defaultValue?: unknown }>;
  }> {
    try {
      // 查找包含该脚本文件的项目
      const sessionFile = await db.query.scriptFiles.findFirst({
        where: eq(scriptFiles.fileName, scriptName),
      });

      if (!sessionFile) {
        return { values: {}, definitions: [] };
      }

      // 查找该项目的 global.yaml 文件
      const globalFile = await db.query.scriptFiles.findFirst({
        where: (fields, { and: andFn, eq: eqFn }) =>
          andFn(eqFn(fields.projectId, sessionFile.projectId), eqFn(fields.fileType, 'global')),
      });

      if (!globalFile) {
        return { values: {}, definitions: [] };
      }

      // 解析变量定义
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

      // 查询用户已存储的全局变量值
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

      // 解析最终值：已存值 > defaultValue
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

  /**
   * 初始化会话 - 获取初始 AI 消息
   */

  async initializeSession(sessionId: string): Promise<SessionResponse> {
    logger.info('🔵 initializeSession called', { sessionId });

    // 1. 加载会话和脚本数据
    const session = await this.loadSessionById(sessionId);
    const script = await this.loadScriptById(session.scriptId);

    try {
      // 2. 生成首个 runId 并写入 DB
      const runId = uuidv4();
      await db
        .update(sessions)
        .set({ currentRunId: runId, updatedAt: new Date() })
        .where(eq(sessions.id, sessionId));

      // 3. 加载全局变量和对话历史
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.loadGlobalVariables(script.scriptName, session.userId);
      const conversationHistory = await this.loadConversationHistory(sessionId);

      // 4. 创建初始执行状态，将projectId传递给metadata
      let executionState = this.createInitialExecutionState(
        globalVariables,
        session.variables,
        conversationHistory,
        {
          ...(session.metadata as Record<string, any>),
          projectId: script.projectId, // 传递projectId用于模板加载
        }
      );

      // 注入 currentRunId 到 metadata，使 saveDebugEntry 能使用正确的 runId
      executionState.metadata.currentRunId = runId;

      // 4. Inject global variable persistence callback and definitions into metadata
      executionState.metadata.globalVariableDefinitions = globalVariableDefinitions;
      executionState.metadata.globalVariableCallback = async (name: string, value: unknown) => {
        try {
          logger.info(`🔔 [GlobalVarCallback] Called: "${name}" = "${value}"`);
          if (!script.projectId) {
            logger.warn(`[SessionManager] Cannot persist global "${name}": projectId missing`);
            return;
          }

          const existing = await db.query.userGlobalVariables.findFirst({
            where: (fields, { and: andFn, eq: eqFn }) =>
              andFn(eqFn(fields.userId, session.userId), eqFn(fields.projectId, script.projectId!)),
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
                and(
                  eq(userGlobalVariables.userId, session.userId),
                  eq(userGlobalVariables.projectId, script.projectId!)
                )
              );
          } else {
            await db.insert(userGlobalVariables).values({
              userId: session.userId,
              projectId: script.projectId,
              variables: { [name]: value },
            });
          }
          logger.info(`💾 [GlobalVarCallback] Persisted: "${name}" = "${value}"`);
        } catch (err: any) {
          logger.error(
            `[SessionManager] Failed to persist global variable "${name}":`,
            err.message
          );
        }
      };

      // 5. 执行脚本
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.executeScript(script, sessionId, executionState, null);

      // 5.1 如果 ScriptExecutor 提取了 sessionConfig，保存到 session.metadata
      if (executionState.metadata.sessionConfig) {
        const currentMetadata = (session.metadata as Record<string, any>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          sessionConfig: executionState.metadata.sessionConfig,
        };

        await db
          .update(sessions)
          .set({ metadata: updatedMetadata })
          .where(eq(sessions.id, sessionId));

        logger.debug('💾 Saved sessionConfig to database:', executionState.metadata.sessionConfig);
      }

      // 6. 保存执行结果
      await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, executionState);
      await this.updateSessionState(sessionId, executionState, globalVariables);

      // 7. 构建并返回响应
      const result = this.buildSessionResponse(
        executionState,
        session,
        script,
        globalVariables,
        false
      );
      logger.info('🏁 initializeSession completed:', {
        runId: result.currentRunId,
      });
      return result;
    } catch (error) {
      logger.error('❌ Error during initialization:', error);
      return this.buildErrorResponse(error, session, script, sessionId);
    }
  }

  /**
   * 处理用户输入
   */
  async processUserInput(sessionId: string, userInput: string): Promise<SessionResponse> {
    logger.info('🔵 processUserInput called', { sessionId, userInput });

    // 1. 加载会话和脚本数据
    const session = await this.loadSessionById(sessionId);
    const script = await this.loadScriptById(session.scriptId);

    try {
      // 2. 加载全局变量（包含definition用于重建callback）
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.loadGlobalVariables(script.scriptName, session.userId);

      // 3. 保存用户消息（先保存，再加载，确保 conversationHistory 完整）
      await this.saveUserMessage(sessionId, userInput);

      // 4. 加载对话历史（包含刚保存的用户消息）
      const conversationHistory = await this.loadConversationHistory(sessionId);

      // 5. 恢复执行状态
      let executionState = this.restoreExecutionState(
        session,
        globalVariables,
        conversationHistory
      );

      // 5.5 重建全局变量定义和回调（JSON序列化会丢失函数）
      executionState.metadata.globalVariableDefinitions = globalVariableDefinitions;
      executionState.metadata.globalVariableCallback = async (name: string, value: unknown) => {
        try {
          logger.info(`🔔 [GlobalVarCallback] Called: "${name}" = "${value}"`);
          if (!script.projectId) {
            logger.warn(`[SessionManager] Cannot persist global "${name}": projectId missing`);
            return;
          }

          const existing = await db.query.userGlobalVariables.findFirst({
            where: (fields, { and: andFn, eq: eqFn }) =>
              andFn(eqFn(fields.userId, session.userId), eqFn(fields.projectId, script.projectId!)),
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
                and(
                  eq(userGlobalVariables.userId, session.userId),
                  eq(userGlobalVariables.projectId, script.projectId!)
                )
              );
          } else {
            await db.insert(userGlobalVariables).values({
              userId: session.userId,
              projectId: script.projectId,
              variables: { [name]: value },
            });
          }
          logger.info(`💾 [GlobalVarCallback] Persisted: "${name}" = "${value}"`);
        } catch (err: any) {
          logger.error(
            `[SessionManager] Failed to persist global variable "${name}":`,
            err.message
          );
        }
      };

      // 6. 执行脚本（传递 userInput 以便 continueAction 正确处理）
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.executeScript(script, sessionId, executionState, userInput);

      // 7. 保存执行结果
      await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, executionState);
      await this.updateSessionState(sessionId, executionState, globalVariables);

      // 8. 构建并返回响应
      const result = this.buildSessionResponse(
        executionState,
        session,
        script,
        globalVariables,
        true
      );
      logger.debug('🏁 processUserInput completed:', {
        aiMessageLength: result.aiMessage?.length || 0,
        executionStatus: result.executionStatus,
        position: result.position,
        hasGlobalVariables: !!result.globalVariables,
        globalVariablesKeys: Object.keys(result.globalVariables || {}),
        hasVariableStore: !!result.variableStore,
        variableStoreKeys: result.variableStore ? Object.keys(result.variableStore) : [],
      });
      return result;
    } catch (error) {
      logger.error('❌ Error during user input processing:', error);
      return this.buildErrorResponse(error, session, script, sessionId);
    }
  }

  /**
   * 更新变量值（手动编辑）
   */
  async updateVariable(
    session: SessionData,
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
    const metadata = (session.metadata as Record<string, any>) || {};
    const variableStore = metadata.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    // 构建 VariableValue 包装
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

    // 写入 variableStore
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

    // 更新扁平变量
    const flatVariables: Record<string, unknown> = {
      ...((session.variables as Record<string, unknown>) || {}),
      [variableName]: value,
    };

    // 全局作用域: 持久化到 user_global_variables
    if (scope === 'global') {
      try {
        const tags = (await this.getScriptTags(session.scriptId)) || [];
        const projectTag = tags.find((tag: string) => tag.startsWith('project:'));
        const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

        if (projectId) {
          const existing = await db.query.userGlobalVariables.findFirst({
            where: (fields, { and: andFn, eq: eqFn }) =>
              andFn(eqFn(fields.userId, session.userId), eqFn(fields.projectId, projectId)),
          });

          const merged = {
            ...((existing?.variables as Record<string, unknown>) || {}),
            [variableName]: value,
          };

          if (existing) {
            await db
              .update(userGlobalVariables)
              .set({ variables: merged, updatedAt: new Date() })
              .where(
                and(
                  eq(userGlobalVariables.userId, session.userId),
                  eq(userGlobalVariables.projectId, projectId)
                )
              );
          } else {
            await db.insert(userGlobalVariables).values({
              userId: session.userId,
              projectId,
              variables: { [variableName]: value },
            });
          }
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

    // 更新 sessions 表
    await db
      .update(sessions)
      .set({
        variables: flatVariables,
        metadata: { ...metadata, variableStore },
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));

    return { variableName, scope, value, updatedAt: now };
  }

  /**
   * Rerun an action from a saved snapshot
   *
   * Restores session state to the point when the target action was first executed,
   * cleans up all state after that point, and re-executes the action.
   *
   * @param sessionId - The session ID
   * @param targetActionId - Optional action ID to rerun (defaults to current action)
   * @param configOverride - Optional config overrides for the rerun
   * @param llmConfig - Optional LLM config overrides
   */
  async rerunAction(
    sessionId: string,
    targetActionId?: string,
    configOverride?: Record<string, any>,
    llmConfig?: Record<string, any>
  ): Promise<SessionResponse> {
    logger.info('🔵 rerunAction called', { sessionId, targetActionId });

    // 1. Load session and script
    const session = await this.loadSessionById(sessionId);
    const script = await this.loadScriptById(session.scriptId);

    const metadata = (session.metadata as Record<string, any>) || {};
    const actionSnapshots = metadata.actionSnapshots || {};

    logger.info('[DEBUG-RERUN] Session metadata loaded from DB', {
      metadataKeys: Object.keys(metadata),
      hasActionSnapshots: !!metadata.actionSnapshots,
      snapshotKeys: Object.keys(actionSnapshots),
      snapshotContent: JSON.stringify(actionSnapshots).substring(0, 500),
    });

    // 2. Parse script to extract all action IDs and their positions
    const scriptContent = yaml.parse(script.scriptContent) || {};
    const phases = scriptContent.session?.phases || [];
    const allActionIds: string[] = [];
    const actionPositionMap: Record<
      string,
      { phaseIdx: number; topicIdx: number; actionIdx: number }
    > = {};
    for (let pIdx = 0; pIdx < phases.length; pIdx++) {
      const phase = phases[pIdx];
      for (let tIdx = 0; tIdx < (phase.topics || []).length; tIdx++) {
        const topic = phase.topics[tIdx];
        for (let aIdx = 0; aIdx < (topic.actions || []).length; aIdx++) {
          const action = topic.actions[aIdx];
          allActionIds.push(action.action_id);
          actionPositionMap[action.action_id] = { phaseIdx: pIdx, topicIdx: tIdx, actionIdx: aIdx };
        }
      }
    }

    // 3. Determine target action
    let targetKey: string | undefined = targetActionId;
    if (!targetKey) {
      // Fallback 1: position.actionId (may be set from previous rerun)
      const posActionId = (session.position as Record<string, any>)?.actionId;
      if (posActionId) {
        targetKey = posActionId;
      } else {
        // Fallback 2: lookup from position indices
        const pos = session.position as Record<string, any>;
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

    // 4. Cascade cleanup — keep only snapshots up to and including target
    const newSnapshots: Record<string, any> = {};
    const targetIdx = allActionIds.indexOf(targetKey);
    for (const id of allActionIds.slice(0, targetIdx + 1)) {
      if (actionSnapshots[id]) {
        newSnapshots[id] = actionSnapshots[id];
      }
    }

    // 5. Flag messages after snapshot point as superseded (instead of hard-delete)
    // This preserves them in the debug panel for comparison while excluding them from LLM context.
    const allMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.timestamp);

    // snapshot uses conversationHistoryLength; also accept messageCount for forward compat
    const msgCount: number =
      (snapshot.messageCount as number) ?? (snapshot.conversationHistoryLength as number) ?? 0;
    if (msgCount < allMessages.length) {
      const idsToFlag = allMessages.slice(msgCount).map((m) => m.id);
      if (idsToFlag.length > 0) {
        const supersededMeta = { superseded: true, supersededAt: new Date().toISOString() };
        // Update each message's metadata individually (Drizzle does not support bulk JSONB merge)
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

    // 6. Clean rerunHistory — keep only entries up to target
    let rerunHistory = (metadata.rerunHistory || []) as any[];
    rerunHistory = rerunHistory.filter((entry: any) => {
      const entryIdx = allActionIds.indexOf(entry.actionId);
      return entryIdx >= 0 && entryIdx <= targetIdx;
    });

    // 7. Generate new runId for this rerun/rollback
    const newRunId = uuidv4();

    // 8. Restore metadata
    const restoredMetadata: Record<string, any> = {
      ...metadata,
      variableStore: snapshot.variableStore,
      actionSnapshots: newSnapshots,
      rerunHistory,
      llmConfig: llmConfig || metadata.llmConfig,
      rerunConfigOverride: configOverride || undefined,
      currentRunId: newRunId,
    };
    // Remove action-level state that will be recreated
    delete restoredMetadata.actionState;
    delete restoredMetadata.lastActionRoundInfo;
    delete restoredMetadata.completedActionContext;
    delete restoredMetadata.actionRoundInfo;

    // 9. Update session in DB
    await db
      .update(sessions)
      .set({
        position: {
          phaseIndex: snapshot.phaseIndex,
          topicIndex: snapshot.topicIndex,
          actionIndex: snapshot.actionIndex,
          actionId: snapshot.actionId,
          actionType: snapshot.actionType,
          currentRound: 0,
        } as any,
        executionStatus: ExecutionStatus.RUNNING,
        variables: {},
        currentRunId: newRunId,
        metadata: restoredMetadata,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    // 9. Re-execute (same flow as processUserInput but without user input)
    const { values: globalVariables } = await this.loadGlobalVariables(
      script.scriptName,
      session.userId
    );
    const conversationHistory = await this.loadConversationHistory(sessionId);

    // Re-read session to get updated state
    const updatedSession = await this.loadSessionById(sessionId);
    let executionState = this.restoreExecutionState(
      updatedSession,
      globalVariables,
      conversationHistory
    );

    // Apply config override to metadata for the action to pick up
    if (configOverride) {
      executionState.metadata.rerunConfigOverride = configOverride;
    }

    const prevHistoryLength = executionState.conversationHistory.length;
    executionState = await this.executeScript(script, sessionId, executionState, null);

    await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
    await this.saveVariableSnapshots(sessionId, executionState);
    await this.updateSessionState(sessionId, executionState, globalVariables);

    return this.buildSessionResponse(executionState, updatedSession, script, globalVariables, true);
  }

  private async getScriptTags(scriptId: string): Promise<string[]> {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, scriptId),
    });
    return (script?.tags as string[]) || [];
  }
}

// Re-exported for backward compatibility
export { determineDebugEntryRound } from './session-variable-utils.js';
