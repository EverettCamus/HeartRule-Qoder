import { SessionStatus, ExecutionStatus, type ExecutionPosition , VariableStore } from '@heartrule/shared-types';
import { v4 as uuidv4 } from 'uuid';

import type { BaseAction } from '../actions/base-action.js';
import type { LLMDebugInfo } from '../engines/llm-orchestration/orchestrator.js';

/**
 * 对话历史条目
 */
export interface ConversationEntry {
  role: string;
  content: string;
  actionId?: string;
  metadata?: Record<string, any>;
}

/**
 * 会话领域模型
 * 
 * 【DDD视角】核心聚合根，负责维护会话执行的完整状态
 * - 执行位置与进度控制
 * - 变量状态管理（兼容旧版 variables 和新版 variableStore）
 * - 对话历史记录
 * - Action 执行状态的持久化
 */
export class Session {
  public sessionId: string;
  public userId: string;
  public scriptId: string;
  public status: SessionStatus;
  public executionStatus: ExecutionStatus;
  public position: ExecutionPosition;
  
  // 变量管理（双轨制）
  public variables: Map<string, unknown>;  // 旧版：扁平变量存储
  public variableStore?: VariableStore;    // 新版：分层变量存储
  
  // 执行状态扩展
  public currentAction: BaseAction | null;  // 当前正在执行的 Action 实例
  public conversationHistory: ConversationEntry[];  // 对话历史
  public lastAiMessage: string | null;      // 最近的 AI 消息
  public lastLLMDebugInfo?: LLMDebugInfo;   // LLM 调试信息
  
  public metadata: Map<string, unknown>;
  public createdAt: Date;
  public updatedAt: Date;
  public completedAt?: Date;

  constructor(params: {
    sessionId?: string;
    userId: string;
    scriptId: string;
    status?: SessionStatus;
    executionStatus?: ExecutionStatus;
    position?: ExecutionPosition;
    variables?: Map<string, unknown>;
    variableStore?: VariableStore;
    currentAction?: BaseAction | null;
    conversationHistory?: ConversationEntry[];
    lastAiMessage?: string | null;
    lastLLMDebugInfo?: LLMDebugInfo;
    metadata?: Map<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date;
  }) {
    this.sessionId = params.sessionId || uuidv4();
    this.userId = params.userId;
    this.scriptId = params.scriptId;
    this.status = params.status || SessionStatus.ACTIVE;
    this.executionStatus = params.executionStatus || ExecutionStatus.RUNNING;
    this.position = params.position || { phaseIndex: 0, topicIndex: 0, actionIndex: 0 };
    this.variables = params.variables || new Map();
    this.variableStore = params.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
    this.currentAction = params.currentAction || null;
    this.conversationHistory = params.conversationHistory || [];
    this.lastAiMessage = params.lastAiMessage || null;
    this.lastLLMDebugInfo = params.lastLLMDebugInfo;
    this.metadata = params.metadata || new Map();
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
    this.completedAt = params.completedAt;
  }

  /**
   * 启动会话
   */
  start(): void {
    this.status = SessionStatus.ACTIVE;
    this.executionStatus = ExecutionStatus.RUNNING;
    this.updatedAt = new Date();
  }

  /**
   * 暂停会话
   */
  pause(): void {
    this.status = SessionStatus.PAUSED;
    this.executionStatus = ExecutionStatus.PAUSED;
    this.updatedAt = new Date();
  }

  /**
   * 恢复会话
   */
  resume(): void {
    if (this.status === SessionStatus.PAUSED) {
      this.status = SessionStatus.ACTIVE;
      this.executionStatus = ExecutionStatus.RUNNING;
      this.updatedAt = new Date();
    }
  }

  /**
   * 完成会话
   */
  complete(): void {
    this.status = SessionStatus.COMPLETED;
    this.executionStatus = ExecutionStatus.COMPLETED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 会话失败
   */
  fail(error: string): void {
    this.status = SessionStatus.FAILED;
    this.executionStatus = ExecutionStatus.ERROR;
    this.metadata.set('error', error);
    this.updatedAt = new Date();
  }

  /**
   * 更新执行位置
   */
  updatePosition(position: ExecutionPosition): void {
    this.position = position;
    this.updatedAt = new Date();
  }

  /**
   * 设置变量（兼容旧版）
   */
  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
    this.updatedAt = new Date();
  }

  /**
   * 获取变量（兼容旧版）
   */
  getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  /**
   * 添加对话历史条目
   */
  addConversationEntry(entry: ConversationEntry): void {
    this.conversationHistory.push(entry);
    this.updatedAt = new Date();
  }

  /**
   * 设置当前正在执行的 Action
   */
  setCurrentAction(action: BaseAction | null): void {
    this.currentAction = action;
    this.updatedAt = new Date();
  }

  /**
   * 标记为等待用户输入
   */
  waitForInput(): void {
    this.executionStatus = ExecutionStatus.WAITING_INPUT;
    this.updatedAt = new Date();
  }

  /**
   * 恢复运行状态
   */
  resumeRunning(): void {
    this.executionStatus = ExecutionStatus.RUNNING;
    this.updatedAt = new Date();
  }

  /**
   * 转换为JSON对象
   */
  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      scriptId: this.scriptId,
      status: this.status,
      executionStatus: this.executionStatus,
      position: this.position,
      variables: Object.fromEntries(this.variables),
      variableStore: this.variableStore,
      currentAction: this.currentAction ? {
        actionId: this.currentAction.actionId,
        actionType: (this.currentAction.constructor as any).actionType,
      } : null,
      conversationHistory: this.conversationHistory,
      lastAiMessage: this.lastAiMessage,
      lastLLMDebugInfo: this.lastLLMDebugInfo,
      metadata: Object.fromEntries(this.metadata),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
