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

/**
 * 会话管理器
 */
export class SessionManager {
  private scriptExecutor: ScriptExecutor;

  constructor() {
    this.scriptExecutor = new ScriptExecutor();
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
   * 加载项目的全局变量
   */
  private async loadGlobalVariables(scriptName: string): Promise<Record<string, any>> {
    try {
      console.log('[SessionManager] 🔍 Loading global variables for script:', scriptName);

      // 查找包含该脚本文件的项目
      const sessionFile = await db.query.scriptFiles.findFirst({
        where: eq(scriptFiles.fileName, scriptName),
      });

      if (!sessionFile) {
        console.log(
          '[SessionManager] ⚠️ Script file not found in projects, skipping global variables'
        );
        return {};
      }

      console.log('[SessionManager] ✅ Found script file:', {
        fileName: sessionFile.fileName,
        projectId: sessionFile.projectId,
      });

      // 查找该项目的 global.yaml 文件
      const globalFile = await db.query.scriptFiles.findFirst({
        where: (fields, { and, eq }) =>
          and(eq(fields.projectId, sessionFile.projectId), eq(fields.fileType, 'global')),
      });

      if (!globalFile) {
        console.log('[SessionManager] ⚠️ No global.yaml found in project');
        return {};
      }

      console.log('[SessionManager] ✅ Found global.yaml:', {
        fileName: globalFile.fileName,
        hasYamlContent: !!globalFile.yamlContent,
        hasFileContent: !!globalFile.fileContent,
      });

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

      console.log('[SessionManager] ✅ Loaded global variables:', globalVariables);
      console.log('[SessionManager] 🔑 Global variable keys:', Object.keys(globalVariables));
      return globalVariables;
    } catch (error) {
      console.error('[SessionManager] ❌ Error loading global variables:', error);
      return {};
    }
  }

  /**
   * 初始化会话 - 获取初始 AI 消息
   */
  async initializeSession(sessionId: string): Promise<{
    aiMessage: string;
    sessionStatus: string;
    executionStatus: string;
    variables?: Record<string, unknown>;
    globalVariables?: Record<string, unknown>; // 添加全局变量单独返回
    position?: {
      phaseIndex: number;
      phaseId: string;
      topicIndex: number;
      topicId: string;
      actionIndex: number;
      actionId: string;
      actionType: string;
    };
    debugInfo?: any; // LLM调试信息
    error?: DetailedApiError;
  }> {
    console.log('[SessionManager] 🔵 initializeSession called', { sessionId });

    // 获取会话
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

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      console.error('[SessionManager] ❌ Script not found:', session.scriptId);
      throw new Error('Script not found');
    }
    console.log('[SessionManager] ✅ Script found:', {
      id: script.id,
      scriptName: script.scriptName,
      contentLength: script.scriptContent.length,
    });

    try {
      // 加载全局变量
      const globalVariables = await this.loadGlobalVariables(script.scriptName);

      // 获取历史消息
      const history = await db.query.messages.findMany({
        where: eq(messages.sessionId, sessionId),
        orderBy: (fields, { asc }) => [asc(fields.timestamp)],
      });

      const conversationHistory = history.map((m) => ({
        role: m.role,
        content: m.content,
        actionId: m.actionId || undefined,
        metadata: (m.metadata as Record<string, any>) || {},
      }));

      // 创建初始执行状态，合并全局变量和会话变量
      let executionState: ExecutionState = ScriptExecutor.createInitialState();
      executionState.variables = {
        ...globalVariables, // 先加载全局变量
        ...((session.variables as Record<string, unknown>) || {}), // 会话变量覆盖全局变量
      };
      executionState.conversationHistory = conversationHistory;
      console.log('[SessionManager] 📋 Initial execution state:', {
        status: executionState.status,
        phaseIdx: executionState.currentPhaseIdx,
        topicIdx: executionState.currentTopicIdx,
        actionIdx: executionState.currentActionIdx,
        variables: executionState.variables,
      });

      // 转换 YAML 为 JSON
      const scriptContent = yaml.parse(script.scriptContent);
      const scriptJson = JSON.stringify(scriptContent);
      console.log('[SessionManager] 📄 Parsed YAML script:', {
        sessionId: scriptContent.session?.session_id,
        sessionName: scriptContent.session?.session_name,
        phasesCount: scriptContent.session?.phases?.length || 0,
        firstPhase: scriptContent.session?.phases?.[0]?.phase_name,
        firstTopic: scriptContent.session?.phases?.[0]?.topics?.[0]?.topic_name,
        actionsCount: scriptContent.session?.phases?.[0]?.topics?.[0]?.actions?.length || 0,
      });

      // 执行脚本（初始化，没有用户输入）
      console.log('[SessionManager] ⏳ Executing script (initialization)...');
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.scriptExecutor.executeSession(
        scriptJson,
        sessionId,
        executionState,
        null
      );
      console.log('[SessionManager] ✅ Script execution completed:', {
        status: executionState.status,
        phaseIdx: executionState.currentPhaseIdx,
        topicIdx: executionState.currentTopicIdx,
        actionIdx: executionState.currentActionIdx,
        lastAiMessage: executionState.lastAiMessage,
        hasMessage: !!executionState.lastAiMessage,
      });

      // 保存新增的 AI 消息（仅保存本次执行新产生的）
      const newMessages = executionState.conversationHistory.slice(prevHistoryLength);
      const aiMessages = newMessages.filter((msg) => msg.role === 'assistant');

      if (aiMessages.length > 0) {
        console.log(`[SessionManager] 💾 Saving ${aiMessages.length} AI message(s) (init):`, {
          messages: aiMessages.map((m) => ({
            actionId: m.actionId,
            content: m.content.substring(0, 50),
          })),
        });

        // 批量保存所有 AI 消息
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
        console.log('[SessionManager] ⚠️ No AI messages to save (init)');
      }

      // 在更新 sessions 之前，记录变量变化快照
      const previousVars = (session.variables as Record<string, unknown> | null) || null;
      const newVars = (executionState.variables || {}) as Record<string, unknown>;

      const snapshots = this.buildVariableSnapshots(sessionId, previousVars, newVars);
      if (snapshots.length > 0) {
        console.log('[SessionManager] 💾 Saving variable snapshots (init):', snapshots.length);
        await db.insert(variables).values(snapshots);
      }

      // 更新会话状态
      console.log('[SessionManager] 💾 Updating session state in DB (init)');
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
            globalVariables, // 存储全局变量到 metadata
          },
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));
      
      const result = {
        aiMessage: executionState.lastAiMessage || '',
        sessionStatus: session.status,
        executionStatus: executionState.status,
        variables: executionState.variables,
        globalVariables, // 返回全局变量
        variableStore: executionState.variableStore, // 🔧 添加分层变量存储
        debugInfo: executionState.lastLLMDebugInfo, // 添加LLM调试信息
        position: {
          phaseIndex: executionState.currentPhaseIdx,
          phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
          topicIndex: executionState.currentTopicIdx,
          topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
          actionIndex: executionState.currentActionIdx,
          actionId: executionState.currentActionId || `action_${executionState.currentActionIdx}`,
          actionType: executionState.currentActionType || 'unknown',
          // 添加回合数信息（优先从 lastActionRoundInfo 读取,否则从 actionState 读取）
          currentRound:
            executionState.metadata?.lastActionRoundInfo?.currentRound ??
            executionState.metadata?.actionState?.currentRound,
          maxRounds:
            executionState.metadata?.lastActionRoundInfo?.maxRounds ??
            executionState.metadata?.actionState?.maxRounds,
        },
      };
      console.log('[SessionManager] 🏁 initializeSession completed:', result);
      return result;
    } catch (error) {
      console.error('[SessionManager] ❌ Error during initialization:', error);

      // 构建详细错误信息
      const detailedError = buildDetailedError(error, {
        scriptId: script.id,
        scriptName: script.scriptName,
        sessionId: sessionId,
      });

      // 返回错误信息（而不是抛出异常）
      return {
        aiMessage: '',
        sessionStatus: session.status,
        executionStatus: ExecutionStatus.ERROR,
        error: detailedError,
      };
    }
  }

  /**
   * 处理用户输入
   */
  async processUserInput(
    sessionId: string,
    userInput: string
  ): Promise<{
    aiMessage: string;
    sessionStatus: string;
    executionStatus: string;
    variables?: Record<string, unknown>;
    globalVariables?: Record<string, unknown>; // 添加全局变量单独返回
    variableStore?: {
      // 🔧 添加分层变量存储
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
      currentRound?: number; // 当前回合数
      maxRounds?: number; // 最大回合数
    };
    debugInfo?: any; // LLM调试信息
    error?: DetailedApiError;
  }> {
    console.log('[SessionManager] 🔵 processUserInput called', { sessionId, userInput });

    // 获取会话
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      console.error('[SessionManager] ❌ Session not found:', sessionId);
      throw new Error('Session not found');
    }
    console.log('[SessionManager] ✅ Session found:', {
      id: session.id,
      status: session.status,
      executionStatus: session.executionStatus,
      position: session.position,
    });

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      console.error('[SessionManager] ❌ Script not found:', session.scriptId);
      throw new Error('Script not found');
    }
    console.log('[SessionManager] ✅ Script found:', {
      id: script.id,
      scriptName: script.scriptName,
    });

    try {
      // 加载全局变量
      const globalVariables = await this.loadGlobalVariables(script.scriptName);

      // 获取历史消息（此时不包含当前刚收到的 userInput，避免重复）
      const history = await db.query.messages.findMany({
        where: eq(messages.sessionId, sessionId),
        orderBy: (fields, { asc }) => [asc(fields.timestamp)],
      });

      // 保存当前用户消息到数据库
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

      const conversationHistory = history.map((m) => ({
        role: m.role,
        content: m.content,
        actionId: m.actionId || undefined,
        metadata: (m.metadata as Record<string, any>) || {},
      }));

      // 恢复执行状态，合并全局变量
      let executionState: ExecutionState = {
        status: (session.executionStatus as ExecutionStatus) || ExecutionStatus.RUNNING,
        currentPhaseIdx: ((session.position as Record<string, unknown>)?.phaseIndex as number) || 0,
        currentTopicIdx: ((session.position as Record<string, unknown>)?.topicIndex as number) || 0,
        currentActionIdx:
          ((session.position as Record<string, unknown>)?.actionIndex as number) || 0,
        currentAction: null, // 会在执行器中重建
        variables: {
          ...globalVariables, // 先加载全局变量
          ...((session.variables as Record<string, unknown>) || {}), // 会话变量覆盖全局变量
        },
        conversationHistory: conversationHistory,
        metadata: (session.metadata as Record<string, unknown>) || {},
        lastAiMessage: null,
      };
      console.log('[SessionManager] 📋 Restored execution state:', {
        status: executionState.status,
        phaseIdx: executionState.currentPhaseIdx,
        topicIdx: executionState.currentTopicIdx,
        actionIdx: executionState.currentActionIdx,
        hasActionState: !!executionState.metadata.actionState,
        hasLastActionRoundInfo: !!executionState.metadata.lastActionRoundInfo,
        metadata: executionState.metadata,
      });

      // 转换 YAML 为 JSON
      const scriptContent = yaml.parse(script.scriptContent);
      const scriptJson = JSON.stringify(scriptContent);

      // 执行脚本（传入用户输入）
      console.log('[SessionManager] ⏳ Executing script with user input...');
      const prevHistoryLength = executionState.conversationHistory.length;
      executionState = await this.scriptExecutor.executeSession(
        scriptJson,
        sessionId,
        executionState,
        userInput
      );
      console.log('[SessionManager] ✅ Script execution completed:', {
        status: executionState.status,
        phaseIdx: executionState.currentPhaseIdx,
        topicIdx: executionState.currentTopicIdx,
        actionIdx: executionState.currentActionIdx,
        lastAiMessage: executionState.lastAiMessage,
        hasMessage: !!executionState.lastAiMessage,
      });

      // 保存新增的 AI 消息（仅保存本次执行新产生的）
      // 注意：userInput 已经被 push 到了 conversationHistory 中（在 continueAction 或 executeAction 里）
      const newMessages = executionState.conversationHistory.slice(prevHistoryLength);
      const aiMessages = newMessages.filter((msg) => msg.role === 'assistant');

      if (aiMessages.length > 0) {
        console.log(`[SessionManager] 💾 Saving ${aiMessages.length} AI message(s):`, {
          messages: aiMessages.map((m) => ({
            actionId: m.actionId,
            content: m.content.substring(0, 50),
          })),
        });

        // 批量保存所有 AI 消息
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

      // 在更新 sessions 之前，记录变量变化快照
      const previousVars = (session.variables as Record<string, unknown> | null) || null;
      const newVars = (executionState.variables || {}) as Record<string, unknown>;

      const snapshots = this.buildVariableSnapshots(sessionId, previousVars, newVars);
      if (snapshots.length > 0) {
        console.log('[SessionManager] 💾 Saving variable snapshots:', snapshots.length);
        await db.insert(variables).values(snapshots);
      }

      // 更新会话状态
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
            globalVariables, // 存储全局变量到 metadata
          },
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));

      const result = {
        aiMessage: executionState.lastAiMessage || '',
        sessionStatus: session.status,
        executionStatus: executionState.status,
        variables: executionState.variables,
        globalVariables, // 返回全局变量
        variableStore: executionState.variableStore, // 🔧 添加分层变量存储
        debugInfo: executionState.lastLLMDebugInfo, // 添加LLM调试信息
        position: {
          phaseIndex: executionState.currentPhaseIdx,
          phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
          topicIndex: executionState.currentTopicIdx,
          topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
          actionIndex: executionState.currentActionIdx,
          actionId: executionState.currentActionId || `action_${executionState.currentActionIdx}`,
          actionType: executionState.currentActionType || 'unknown',
          // 添加回合数信息（优先从 lastActionRoundInfo 读取，否则从 actionState 读取）
          currentRound:
            executionState.metadata?.lastActionRoundInfo?.currentRound ??
            executionState.metadata?.actionState?.currentRound,
          maxRounds:
            executionState.metadata?.lastActionRoundInfo?.maxRounds ??
            executionState.metadata?.actionState?.maxRounds,
        },
      };
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
        hasVariableStore: !!result.variableStore, // 🔧 添加 variableStore 日志
        variableStoreKeys: result.variableStore ? Object.keys(result.variableStore) : [], // 🔧 显示 variableStore 的键
      });
      console.log('[DebugConfig] 🔍 Result object keys:', Object.keys(result));
      console.log('[DebugConfig] 🔍 variableStore value:', result.variableStore);
      return result;
    } catch (error) {
      console.error('[SessionManager] ❌ Error during user input processing:', error);

      // 构建详细错误信息
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

      // 返回错误信息（而不是抛出异常）
      // 注意：globalVariables 在 try 块内定义，catch 块中无法访问，从 session.metadata 获取
      const cachedGlobalVariables = ((session.metadata as any)?.globalVariables as Record<string, unknown>) || {};
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
  }
}
