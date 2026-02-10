/**
 * Session Application Service Implementation
 * 
 * @remarks
 * DDD 六边形架构：应用服务实现（Use Case）
 * 基于 ScriptExecutor 的标准实现，封装核心引擎的执行逻辑
 * 作为防腐层（Anti-Corruption Layer）隔离核心引擎与 API 层
 * 
 * @see ../ports/inbound/session-application.port.ts 接口定义
 */

import type {
  ISessionApplicationService,
  InitializeSessionRequest,
  ProcessUserInputRequest,
  SessionExecutionResponse,
  ExtendedExecutionPosition,
} from '../ports/inbound/session-application.port.js';

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
        const { ScriptExecutor } = await import('../../engines/script-execution/script-executor.js');
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
        const { ScriptExecutor } = await import('../../engines/script-execution/script-executor.js');
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
      executionStatus: executionState.status,
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
      executionStatus: 'error' as any, // 使用 any 避免类型错误
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
