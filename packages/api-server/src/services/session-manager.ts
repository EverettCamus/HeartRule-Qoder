/**
 * 会话管理服务
 *
 * 集成脚本执行引擎，提供基于 YAML 脚本的会话管理
 */

import { ScriptExecutor, ExecutionStatus } from '@heartrule/core-engine';
import type { ExecutionState } from '@heartrule/core-engine';
import type { DetailedApiError } from '@heartrule/shared-types';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

import { db } from '../db/index.js';
import {
  sessions,
  messages,
  scripts,
  variables,
  scriptFiles,
  type NewVariable,
} from '../db/schema.js';
import { buildDetailedError } from '../utils/error-handler.js';

// 类型定义
interface SessionData {
  id: string;
  scriptId: string;
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
}

interface SessionResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
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
  debugInfo?: any;
  error?: DetailedApiError;
}

/**
 * 会话管理器
 */
export class SessionManager {
  private scriptExecutor: ScriptExecutor;

  constructor() {
    this.scriptExecutor = new ScriptExecutor();
  }

  /**
   * 扁平化 variableStore，将嵌套的 phase/topic 结构转为当前位置的扁平结构
   */
  private flattenVariableStore(
    variableStore:
      | {
          global?: Record<string, unknown>;
          session?: Record<string, unknown>;
          phase?: Record<string, Record<string, unknown>>;
          topic?: Record<string, Record<string, unknown>>;
        }
      | null
      | undefined,
    position: { phaseId?: string; topicId?: string }
  ): {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  } {
    if (!variableStore) {
      return {
        global: {},
        session: {},
        phase: {},
        topic: {},
      };
    }

    return {
      global: variableStore.global || {},
      session: variableStore.session || {},
      phase:
        position.phaseId && variableStore.phase?.[position.phaseId]
          ? variableStore.phase[position.phaseId]
          : {},
      topic:
        position.topicId && variableStore.topic?.[position.topicId]
          ? variableStore.topic[position.topicId]
          : {},
    };
  }

  /**
   * 推断变量的类型字符串，用于写入 value_type
   */
  private inferValueType(value: unknown): string {
    if (value === null || value === undefined) return 'unknown';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return t;
    }
    return 'object';
  }

  /**
   * 根据旧值和新值，构造需要写入 variables 表的快照
   */
  private buildVariableSnapshots(
    sessionId: string,
    oldVars: Record<string, unknown> | null,
    newVars: Record<string, unknown>
  ): NewVariable[] {
    const rows: NewVariable[] = [];

    for (const [name, value] of Object.entries(newVars)) {
      const prev = oldVars ? oldVars[name] : undefined;

      // 简单对比：不同才记录快照
      if (prev !== value) {
        rows.push({
          sessionId,
          variableName: name,
          value,
          scope: 'session', // 先全部按会话级变量处理
          valueType: this.inferValueType(value),
          source: 'script_executor', // 后续可以细化来源
        });
      }
    }

    return rows;
  }

  /**
   * 从数据库加载会话数据
   */
  private async loadSessionById(sessionId: string): Promise<SessionData> {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      console.error('[SessionManager] ❌ Session not found:', sessionId);
      throw new Error('Session not found');
    }

    console.log('[SessionManager] ✅ Session found:', {
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
      console.error('[SessionManager] ❌ Script not found:', scriptId);
      throw new Error('Script not found');
    }

    console.log('[SessionManager] ✅ Script found:', {
      id: script.id,
      scriptName: script.scriptName,
      contentLength: script.scriptContent.length,
    });

    return script as ScriptData;
  }

  /**
   * 加载对话历史消息
   */
  private async loadConversationHistory(sessionId: string): Promise<any[]> {
    const history = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (fields, { asc }) => [asc(fields.timestamp)],
    });

    return history.map((m) => ({
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
    conversationHistory: any[]
  ): ExecutionState {
    const executionState: ExecutionState = ScriptExecutor.createInitialState();
    executionState.variables = {
      ...globalVariables,
      ...((sessionVariables as Record<string, unknown>) || {}),
    };
    executionState.conversationHistory = conversationHistory;

    console.log('[SessionManager] 📋 Initial execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      variables: executionState.variables,
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
      variableStore: metadata.variableStore,
      conversationHistory: conversationHistory,
      metadata: metadata,
      lastAiMessage: null,
    };

    // 确保 variableStore.global 包含最新的全局变量
    if (executionState.variableStore) {
      if (!executionState.variableStore.global) executionState.variableStore.global = {};
      for (const [key, value] of Object.entries(globalVariables)) {
        if (!executionState.variableStore.global[key]) {
          executionState.variableStore.global[key] = {
            value,
            type: typeof value,
            source: 'global_sync',
            lastUpdated: new Date().toISOString(),
          };
        }
      }
    }

    console.log('[SessionManager] 📋 Restored execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      hasActionState: !!executionState.metadata.actionState,
      hasLastActionRoundInfo: !!executionState.metadata.lastActionRoundInfo,
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

    console.log('[SessionManager] 📄 Parsed YAML script:', {
      sessionId: scriptContent.session?.session_id,
      sessionName: scriptContent.session?.session_name,
      phasesCount: scriptContent.session?.phases?.length || 0,
      firstPhase: scriptContent.session?.phases?.[0]?.phase_name,
      firstTopic: scriptContent.session?.phases?.[0]?.topics?.[0]?.topic_name,
      actionsCount: scriptContent.session?.phases?.[0]?.topics?.[0]?.actions?.length || 0,
    });

    const logPrefix = userInput === null ? 'initialization' : 'with user input';
    console.log(`[SessionManager] ⏳ Executing script (${logPrefix})...`);

    const updatedState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      userInput
    );

    console.log('[SessionManager] ✅ Script execution completed:', {
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
      console.log(`[SessionManager] 💾 Saving ${aiMessages.length} AI message(s):`, {
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
      console.log('[SessionManager] ⚠️ No AI messages to save');
    }
  }

  /**
   * 保存用户消息
   */
  private async saveUserMessage(sessionId: string, userInput: string): Promise<void> {
    const userMessageId = uuidv4();
    console.log('[SessionManager] 💾 Saving user message:', {
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
    previousVars: Record<string, unknown> | null,
    newVars: Record<string, unknown>
  ): Promise<void> {
    const snapshots = this.buildVariableSnapshots(sessionId, previousVars, newVars);
    if (snapshots.length > 0) {
      console.log('[SessionManager] 💾 Saving variable snapshots:', snapshots.length);
      await db.insert(variables).values(snapshots);
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
    console.log('[SessionManager] 💾 Updating session state in DB');

    await db
      .update(sessions)
      .set({
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
      })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * 构建会话响应结果
   */
  private buildSessionResponse(
    executionState: ExecutionState,
    session: SessionData,
    globalVariables: Record<string, any>,
    includeVariableStore: boolean = false
  ): SessionResponse {
    const result: SessionResponse = {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      variables: executionState.variables,
      globalVariables,
      debugInfo: executionState.lastLLMDebugInfo,
      position: {
        phaseIndex: executionState.currentPhaseIdx,
        phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
        topicIndex: executionState.currentTopicIdx,
        topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
        actionIndex: executionState.currentActionIdx,
        actionId: executionState.currentActionId || `action_${executionState.currentActionIdx}`,
        actionType: executionState.currentActionType || 'unknown',
        currentRound:
          executionState.metadata?.lastActionRoundInfo?.currentRound ??
          executionState.metadata?.actionState?.currentRound,
        maxRounds:
          executionState.metadata?.lastActionRoundInfo?.maxRounds ??
          executionState.metadata?.actionState?.maxRounds,
      },
    };

    // 仅在 processUserInput 中包含扁平化的 variableStore
    if (includeVariableStore) {
      result.variableStore = this.flattenVariableStore(executionState.variableStore, {
        phaseId: executionState.currentPhaseId,
        topicId: executionState.currentTopicId,
      });
    } else {
      // initializeSession 返回原始的 variableStore
      result.variableStore = executionState.variableStore as any;
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
  private async loadGlobalVariables(scriptName: string): Promise<Record<string, any>> {
    try {
      // 查找包含该脚本文件的项目
      const sessionFile = await db.query.scriptFiles.findFirst({
        where: eq(scriptFiles.fileName, scriptName),
      });

      if (!sessionFile) {
        return {};
      }

      // 查找该项目的 global.yaml 文件
      const globalFile = await db.query.scriptFiles.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.projectId, sessionFile.projectId), eq(fields.fileType, 'global')),
      });

      if (!globalFile) {
        return {};
      }

      // 解析全局变量
      const globalVariables: Record<string, any> = {};

      if (globalFile.yamlContent) {
        // 从 yamlContent 解析
        const parsed = yaml.parse(globalFile.yamlContent);
        if (parsed && parsed.variables && Array.isArray(parsed.variables)) {
          for (const varDef of parsed.variables) {
            if (varDef.name && varDef.value !== undefined) {
              globalVariables[varDef.name] = varDef.value;
            }
          }
        }
      } else if (globalFile.fileContent) {
        // 从 fileContent 解析
        const content = globalFile.fileContent as any;
        if (content.variables && Array.isArray(content.variables)) {
          for (const varDef of content.variables) {
            if (varDef.name && varDef.value !== undefined) {
              globalVariables[varDef.name] = varDef.value;
            }
          }
        }
      }

      return globalVariables;
    } catch (error) {
      console.error('[SessionManager] ❌ Error loading global variables:', error);
      return {};
    }
  }

  /**
   * 初始化会话 - 获取初始 AI 消息
   */
  async initializeSession(sessionId: string): Promise<SessionResponse> {
    console.log('[SessionManager] 🔵 initializeSession called', { sessionId });

    // 1. 加载会话和脚本数据
    const session = await this.loadSessionById(sessionId);
    const script = await this.loadScriptById(session.scriptId);

    try {
      // 2. 加载全局变量和对话历史
      const globalVariables = await this.loadGlobalVariables(script.scriptName);
      const conversationHistory = await this.loadConversationHistory(sessionId);

      // 3. 创建初始执行状态
      let executionState = this.createInitialExecutionState(
        globalVariables,
        session.variables,
        conversationHistory
      );

      // 4. 执行脚本
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.executeScript(script, sessionId, executionState, null);

      // 5. 保存执行结果
      await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, session.variables, executionState.variables);
      await this.updateSessionState(sessionId, executionState, globalVariables);

      // 6. 构建并返回响应
      const result = this.buildSessionResponse(executionState, session, globalVariables, false);
      console.log('[SessionManager] 🏁 initializeSession completed:', result);
      return result;
    } catch (error) {
      console.error('[SessionManager] ❌ Error during initialization:', error);
      return this.buildErrorResponse(error, session, script, sessionId);
    }
  }

  /**
   * 处理用户输入
   */
  async processUserInput(sessionId: string, userInput: string): Promise<SessionResponse> {
    console.log('[SessionManager] 🔵 processUserInput called', { sessionId, userInput });

    // 1. 加载会话和脚本数据
    const session = await this.loadSessionById(sessionId);
    const script = await this.loadScriptById(session.scriptId);

    try {
      // 2. 加载全局变量和对话历史
      const globalVariables = await this.loadGlobalVariables(script.scriptName);
      const conversationHistory = await this.loadConversationHistory(sessionId);

      // 3. 保存用户消息
      await this.saveUserMessage(sessionId, userInput);

      // 4. 恢复执行状态
      let executionState = this.restoreExecutionState(
        session,
        globalVariables,
        conversationHistory
      );

      // 5. 执行脚本
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.executeScript(script, sessionId, executionState, userInput);

      // 6. 保存执行结果
      await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
      await this.saveVariableSnapshots(sessionId, session.variables, executionState.variables);
      await this.updateSessionState(sessionId, executionState, globalVariables);

      // 7. 构建并返回响应
      const result = this.buildSessionResponse(executionState, session, globalVariables, true);
      console.log('[SessionManager] 🏁 processUserInput completed:', {
        aiMessage: result.aiMessage,
        aiMessageLength: result.aiMessage?.length || 0,
        hasDebugInfo: !!result.debugInfo,
        debugInfoPrompt: result.debugInfo?.prompt?.substring(0, 50),
        debugInfoResponse: result.debugInfo?.response?.text?.substring(0, 50),
        executionStatus: result.executionStatus,
        position: result.position,
        hasGlobalVariables: !!result.globalVariables,
        globalVariablesKeys: Object.keys(result.globalVariables || {}),
        hasVariableStore: !!result.variableStore,
        variableStoreKeys: result.variableStore ? Object.keys(result.variableStore) : [],
      });
      console.log('[DebugConfig] 🔍 Result object keys:', Object.keys(result));
      console.log('[DebugConfig] 🔍 variableStore value:', result.variableStore);
      return result;
    } catch (error) {
      console.error('[SessionManager] ❌ Error during user input processing:', error);
      return this.buildErrorResponse(error, session, script, sessionId);
    }
  }
}
