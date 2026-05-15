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
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

import { container } from '../ioc/container.js';
import { buildDetailedError } from '../utils/error-handler.js';

import { DatabaseTemplateProvider } from './database-template-provider.js';
import type { ISessionRepository, SessionData, ScriptData } from './session-repository.js';
import { SessionRepository } from './session-repository.js';
import {
  flattenVariableStore,
  calculateRoundChanges,
  extractExitReason,
  buildVariableSnapshots,
} from './session-variable-utils.js';

const logger = createLogger('SessionManager');

// 类型定义
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
  private repository: ISessionRepository;
  private prevVariableSnapshots: Map<
    string,
    {
      global: Record<string, any>;
      session: Record<string, any>;
      phase: Record<string, any>;
      topic: Record<string, any>;
    }
  > = new Map();

  constructor(repository?: ISessionRepository) {
    this.scriptExecutor = container.getScriptExecutor();
    this.templateProvider = new DatabaseTemplateProvider();
    this.repository = repository || new SessionRepository();
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
   * 保存变量快照
   */
  private async saveVariableSnapshots(
    sessionId: string,
    executionState: ExecutionState
  ): Promise<void> {
    const snapshots = buildVariableSnapshots(sessionId, executionState);
    await this.repository.saveVariableSnapshots(snapshots);
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
  /**
   * 初始化会话 - 获取初始 AI 消息
   */

  async initializeSession(sessionId: string): Promise<SessionResponse> {
    logger.info('🔵 initializeSession called', { sessionId });

    // 1. 加载会话和脚本数据
    const session = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(session.scriptId);

    try {
      // 2. 生成首个 runId 并写入 DB
      const runId = uuidv4();
      await this.repository.setSessionRunId(sessionId, runId);

      // 3. 加载全局变量和对话历史
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, session.userId);
      const conversationHistory = await this.repository.loadConversationHistory(sessionId);

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
          await this.repository.persistGlobalVariable(
            session.userId,
            script.projectId,
            name,
            value
          );
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

        await this.repository.updateSessionMetadata(sessionId, updatedMetadata);

        logger.debug('💾 Saved sessionConfig to database:', executionState.metadata.sessionConfig);
      }

      // 6. 保存执行结果
      await this.repository.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, executionState);
      await this.repository.updateSessionState(sessionId, executionState, globalVariables);

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
    const session = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(session.scriptId);

    try {
      // 2. 加载全局变量（包含definition用于重建callback）
      const { values: globalVariables, definitions: globalVariableDefinitions } =
        await this.repository.loadGlobalVariables(script.scriptName, session.userId);

      // 3. 保存用户消息（先保存，再加载，确保 conversationHistory 完整）
      await this.repository.saveUserMessage(sessionId, userInput);

      // 4. 加载对话历史（包含刚保存的用户消息）
      const conversationHistory = await this.repository.loadConversationHistory(sessionId);

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
          await this.repository.persistGlobalVariable(
            session.userId,
            script.projectId,
            name,
            value
          );
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
      await this.repository.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, executionState);
      await this.repository.updateSessionState(sessionId, executionState, globalVariables);

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
        const tags = (await this.repository.getScriptTags(session.scriptId)) || [];
        const projectTag = tags.find((tag: string) => tag.startsWith('project:'));
        const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

        if (projectId) {
          await this.repository.persistGlobalVariable(
            session.userId,
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

    // 更新 sessions 表
    await this.repository.updateSessionVariablesAndMetadata(session.id, flatVariables, {
      ...metadata,
      variableStore,
    });

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
    const session = await this.repository.loadSessionById(sessionId);
    const script = await this.repository.loadScriptById(session.scriptId);

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
    const msgCount: number =
      (snapshot.messageCount as number) ?? (snapshot.conversationHistoryLength as number) ?? 0;
    await this.repository.flagSupersededMessages(sessionId, msgCount);

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

    // 9. Re-execute (same flow as processUserInput but without user input)
    const { values: globalVariables } = await this.repository.loadGlobalVariables(
      script.scriptName,
      session.userId
    );
    const conversationHistory = await this.repository.loadConversationHistory(sessionId);

    // Re-read session to get updated state
    const updatedSession = await this.repository.loadSessionById(sessionId);
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

    await this.repository.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
    await this.saveVariableSnapshots(sessionId, executionState);
    await this.repository.updateSessionState(sessionId, executionState, globalVariables);

    return this.buildSessionResponse(executionState, updatedSession, script, globalVariables, true);
  }
}

// Re-exported for backward compatibility
export { determineDebugEntryRound } from './session-variable-utils.js';
