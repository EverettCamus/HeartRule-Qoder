/**
 * Session Application Service Interface
 * 
 * @remarks
 * DDD 视角：这是核心引擎提供给 API 层的应用服务接口定义
 * 
 * 职责：
 * - 定义会话执行的标准接口形态
 * - 隔离核心引擎的内部实现细节与 API 层的调用关系
 * - 作为会话执行 BC 与外部系统的防腐层（Anti-Corruption Layer）
 * 
 * 接口设计原则：
 * 1. 输入参数只包含必要的业务标识与数据，不包含基础设施细节
 * 2. 输出结果携带完整的执行结果与状态，便于 API 层转换为 HTTP 响应
 * 3. 错误处理通过统一的错误类型封装，避免暴露内部异常
 * 
 * @see SessionManager API 层的具体实现示例
 */

import type { ExecutionStatus, ExecutionPosition } from '@heartrule/shared-types';

import type { LLMDebugInfo } from '../engines/llm-orchestration/orchestrator.js';

// 动态导入类型，避免循环依赖
type ScriptExecutor = any;

/**
 * 扩展的执行位置信息（包含多轮对话状态）
 * 
 * @remarks
 * 继承 shared-types 中的标准 ExecutionPosition，扩展了多轮对话相关字段
 */
export interface ExtendedExecutionPosition extends ExecutionPosition {
  currentRound?: number;
  maxRounds?: number;
}

/**
 * 会话初始化请求
 */
export interface InitializeSessionRequest {
  /** 会话 ID */
  sessionId: string;
  /** 脚本内容（JSON 字符串或解析后的对象） */
  scriptContent: string | Record<string, any>;
  /** 全局变量 */
  globalVariables?: Record<string, unknown>;
  /** 会话级变量（用于恢复会话） */
  sessionVariables?: Record<string, unknown>;
  /** 对话历史 */
  conversationHistory?: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * 用户输入处理请求
 */
export interface ProcessUserInputRequest {
  /** 会话 ID */
  sessionId: string;
  /** 用户输入内容 */
  userInput: string;
  /** 脚本内容（JSON 字符串或解析后的对象） */
  scriptContent: string | Record<string, any>;
  /** 全局变量 */
  globalVariables?: Record<string, unknown>;
  /** 当前执行状态（用于恢复） */
  currentExecutionState: {
    status: ExecutionStatus;
    position: {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
    };
    variables: Record<string, unknown>;
    variableStore?: any;
    conversationHistory: Array<{
      role: string;
      content: string;
      actionId?: string;
      metadata?: Record<string, any>;
    }>;
    metadata?: Record<string, any>;
  };
}

/**
 * 会话执行响应
 */
export interface SessionExecutionResponse {
  /** AI 生成的消息 */
  aiMessage: string;
  /** 执行状态 */
  executionStatus: ExecutionStatus;
  /** 当前执行位置 */
  position: ExtendedExecutionPosition;
  /** 会话级变量（扁平结构） */
  variables: Record<string, unknown>;
  /** 分层变量存储（用于调试与内部状态同步） */
  variableStore?: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  /** LLM 调试信息 */
  debugInfo?: LLMDebugInfo;
  /** 错误信息（如果执行失败） */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * 会话应用服务接口
 * 
 * @remarks
 * 该接口定义了核心引擎向 API 层暴露的标准能力：
 * 1. 初始化会话并获取第一条 AI 消息
 * 2. 处理用户输入并推进会话执行
 * 
 * API 层应该：
 * - 负责从数据库加载会话与脚本数据
 * - 调用本接口完成核心业务逻辑
 * - 将响应结果转换为 HTTP 响应并持久化状态
 * 
 * 核心引擎应该：
 * - 专注于脚本执行、变量管理、LLM 调用等核心逻辑
 * - 不直接依赖数据库或 HTTP 框架
 * - 通过该接口与外部系统解耦
 */
export interface ISessionApplicationService {
  /**
   * 初始化会话
   * 
   * @param request - 初始化请求
   * @returns 包含第一条 AI 消息的执行响应
   * 
   * @remarks
   * 用于会话的首次启动，执行脚本的第一个 Action 并返回 AI 消息
   */
  initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse>;

  /**
   * 处理用户输入
   * 
   * @param request - 用户输入处理请求
   * @returns 包含 AI 响应的执行结果
   * 
   * @remarks
   * 用于处理用户的后续输入，推进会话执行并返回 AI 回复
   */
  processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse>;
}

/**
 * 默认会话应用服务实现
 * 
 * @remarks
 * 基于 ScriptExecutor 的标准实现，封装核心引擎的执行逻辑
 * 作为防腐层（Anti-Corruption Layer）隔离核心引擎与 API 层
 */
export class DefaultSessionApplicationService implements ISessionApplicationService {
  private scriptExecutor: any; // ScriptExecutor实例

  constructor(scriptExecutor?: any) {
    // 如果外部提供了executor实例则使用，否则延迟到运行时创建
    this.scriptExecutor = scriptExecutor;
  }

  /**
   * 初始化会话
   * 
   * @performance 性能关键路径 - 会话启动
   */
  async initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse> {
    const startTime = Date.now();
    
    try {
      // 动态导入避免循环依赖
      if (!this.scriptExecutor) {
        const { ScriptExecutor } = await import('../engines/script-execution/script-executor.js');
        this.scriptExecutor = new ScriptExecutor();
      }

      // 解析脚本内容
      const scriptContent = typeof request.scriptContent === 'string'
        ? request.scriptContent
        : JSON.stringify(request.scriptContent);

      // 创建初始执行状态
      const executionState = this.createInitialExecutionState(
        request.globalVariables || {},
        request.sessionVariables || {},
        request.conversationHistory || []
      );

      console.log('[SessionApplicationService] 🚀 Initializing session:', {
        sessionId: request.sessionId,
        hasGlobalVars: !!request.globalVariables,
        hasSessionVars: !!request.sessionVariables,
        historyLength: request.conversationHistory?.length || 0,
      });

      // 执行脚本（userInput为null表示初始化）
      const updatedState = await this.scriptExecutor.executeSession(
        scriptContent,
        request.sessionId,
        executionState,
        null // 初始化时无用户输入
      );

      // 构造响应
      const response = this.buildResponse(updatedState);
      
      // 性能日志
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[Performance] initializeSession took ${duration}ms`);
      }
      
      return response;
    } catch (error: any) {
      console.error('[SessionApplicationService] ❌ Initialization failed:', error);
      return this.buildErrorResponse(error);
    }
  }

  /**
   * 处理用户输入
   * 
   * @performance 性能关键路径 - 多轮对话
   */
  async processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse> {
    const startTime = Date.now();
    
    try {
      // 动态导入避免循环依赖
      if (!this.scriptExecutor) {
        const { ScriptExecutor } = await import('../engines/script-execution/script-executor.js');
        this.scriptExecutor = new ScriptExecutor();
      }

      // 解析脚本内容
      const scriptContent = typeof request.scriptContent === 'string'
        ? request.scriptContent
        : JSON.stringify(request.scriptContent);

      // 恢复执行状态
      const executionState = this.restoreExecutionState(
        request.currentExecutionState,
        request.globalVariables || {}
      );

      console.log('[SessionApplicationService] ⏳ Processing user input:', {
        sessionId: request.sessionId,
        userInputLength: request.userInput.length,
        currentStatus: executionState.status,
        position: {
          phase: executionState.currentPhaseIdx,
          topic: executionState.currentTopicIdx,
          action: executionState.currentActionIdx,
        },
      });

      // 执行脚本
      const updatedState = await this.scriptExecutor.executeSession(
        scriptContent,
        request.sessionId,
        executionState,
        request.userInput
      );

      // 构造响应
      const response = this.buildResponse(updatedState);
      
      // 性能日志
      const duration = Date.now() - startTime;
      if (duration > 2000) {
        console.warn(`[Performance] processUserInput took ${duration}ms`);
      }
      
      return response;
    } catch (error: any) {
      console.error('[SessionApplicationService] ❌ Processing failed:', error);
      return this.buildErrorResponse(error);
    }
  }

  /**
   * 创建初始执行状态
   */
  private createInitialExecutionState(
    globalVariables: Record<string, unknown>,
    sessionVariables: Record<string, unknown>,
    conversationHistory: Array<any>
  ): any {
    return {
      status: 'running',
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {
        ...globalVariables,
        ...sessionVariables,
      },
      variableStore: {
        global: this.wrapVariables(globalVariables),
        session: this.wrapVariables(sessionVariables),
        phase: {},
        topic: {},
      },
      conversationHistory: conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        actionId: msg.actionId,
        metadata: msg.metadata || {},
      })),
      metadata: {},
      lastAiMessage: null,
    };
  }

  /**
   * 恢复执行状态
   */
  private restoreExecutionState(
    currentState: ProcessUserInputRequest['currentExecutionState'],
    globalVariables: Record<string, unknown>
  ): any {
    // 确保variableStore存在
    const variableStore = currentState.variableStore || {
      global: this.wrapVariables(globalVariables),
      session: {},
      phase: {},
      topic: {},
    };

    // 同步全局变量到variableStore
    if (!variableStore.global) variableStore.global = {};
    for (const [key, value] of Object.entries(globalVariables)) {
      if (!variableStore.global[key]) {
        variableStore.global[key] = {
          value,
          type: typeof value,
          source: 'global_sync',
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    return {
      status: currentState.status,
      currentPhaseIdx: currentState.position.phaseIndex,
      currentTopicIdx: currentState.position.topicIndex,
      currentActionIdx: currentState.position.actionIndex,
      currentAction: null,
      variables: {
        ...globalVariables,
        ...currentState.variables,
      },
      variableStore,
      conversationHistory: currentState.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        actionId: msg.actionId,
        metadata: msg.metadata || {},
      })),
      metadata: currentState.metadata || {},
      lastAiMessage: null,
    };
  }

  /**
   * 包装变量为VariableStore格式
   */
  private wrapVariables(variables: Record<string, unknown>): Record<string, any> {
    const wrapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(variables)) {
      wrapped[key] = {
        value,
        type: typeof value,
        source: 'initialization',
        lastUpdated: new Date().toISOString(),
      };
    }
    return wrapped;
  }

  /**
   * 提取扁平化变量（从variableStore中提取value）
   */
  private extractFlatVariables(variableStore: any): Record<string, unknown> {
    const flat: Record<string, unknown> = {};
    
    if (!variableStore) return flat;

    // 从各层级提取变量值
    const extractFromScope = (scope: Record<string, any>) => {
      for (const [key, varObj] of Object.entries(scope || {})) {
        if (varObj && typeof varObj === 'object' && 'value' in varObj) {
          flat[key] = varObj.value;
        } else {
          flat[key] = varObj;
        }
      }
    };

    extractFromScope(variableStore.global || {});
    extractFromScope(variableStore.session || {});
    
    // Phase和Topic是嵌套的，需要合并所有子作用域
    if (variableStore.phase) {
      for (const phaseVars of Object.values(variableStore.phase)) {
        extractFromScope(phaseVars as Record<string, any>);
      }
    }
    if (variableStore.topic) {
      for (const topicVars of Object.values(variableStore.topic)) {
        extractFromScope(topicVars as Record<string, any>);
      }
    }

    return flat;
  }

  /**
   * 构造成功响应
   */
  private buildResponse(executionState: any): SessionExecutionResponse {
    // 提取扁平化变量
    const flatVariables = this.extractFlatVariables(executionState.variableStore);

    // 构造扩展位置信息
    const position: ExtendedExecutionPosition = {
      phaseIndex: executionState.currentPhaseIdx,
      topicIndex: executionState.currentTopicIdx,
      actionIndex: executionState.currentActionIdx,
    };

    // 添加可选字段
    if (executionState.currentPhaseId) position.phaseId = executionState.currentPhaseId;
    if (executionState.currentTopicId) position.topicId = executionState.currentTopicId;
    if (executionState.currentActionId) position.actionId = executionState.currentActionId;
    if (executionState.currentActionType) position.actionType = executionState.currentActionType;
    if (executionState.metadata?.lastActionRoundInfo) {
      position.currentRound = executionState.metadata.lastActionRoundInfo.currentRound;
      position.maxRounds = executionState.metadata.lastActionRoundInfo.maxRounds;
    }

    const response: SessionExecutionResponse = {
      aiMessage: executionState.lastAiMessage || '',
      executionStatus: executionState.status as ExecutionStatus,
      position,
      variables: flatVariables,
    };

    // 添加可选字段
    if (executionState.variableStore) {
      response.variableStore = {
        global: executionState.variableStore.global || {},
        session: executionState.variableStore.session || {},
        phase: executionState.variableStore.phase || {},
        topic: executionState.variableStore.topic || {},
      };
    }

    if (executionState.lastLLMDebugInfo) {
      response.debugInfo = executionState.lastLLMDebugInfo;
    }

    return response;
  }

  /**
   * 构造错误响应
   */
  private buildErrorResponse(error: Error): SessionExecutionResponse {
    return {
      aiMessage: '',
      executionStatus: 'error' as ExecutionStatus,
      position: {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
      },
      variables: {},
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
        details: error.stack,
      },
    };
  }
}

/**
 * 默认实现工厂函数
 * 
 * @remarks
 * API 层可以使用此工厂函数创建默认的应用服务实现
 * 也可以根据需要提供自定义实现（例如用于测试或特殊场景）
 */
export function createDefaultSessionApplicationService(): ISessionApplicationService {
  return new DefaultSessionApplicationService();
}
