import {
  SessionStatus,
  ExecutionStatus,
  type ExecutionPosition,
  type VariableStore,
  type TopicPlan,
} from '@heartrule/shared-types';
import { v4 as uuidv4 } from 'uuid';

import type { LLMDebugInfo } from '../engines/llm-orchestration/orchestrator.js';
import type {
  ExecutionState,
  ExecutionMetadata,
} from '../engines/script-execution/script-executor.js';

import type { BaseAction } from './actions/base-action.js';

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
 * Lightweight persistence shape — matches the DB row returned by SessionRepository.
 * Defined here so the domain class stays package-agnostic (no api-server import).
 */
export interface SessionPersistenceData {
  id: string;
  scriptId: string;
  userId: string;
  status: string;
  executionStatus: string;
  variables: Record<string, unknown> | null;
  position: Record<string, unknown> | null;
  metadata: Record<string, any> | null;
  currentRunId?: string;
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

  public variables: Record<string, unknown>;
  public variableStore?: VariableStore;

  public currentAction: BaseAction | null;
  public conversationHistory: ConversationEntry[];
  public lastAiMessage: string | null;
  public lastLLMDebugInfo: LLMDebugInfo[];

  public metadata: ExecutionMetadata;
  public currentTopicPlan?: TopicPlan;

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
    variables?: Record<string, unknown>;
    variableStore?: VariableStore;
    currentAction?: BaseAction | null;
    conversationHistory?: ConversationEntry[];
    lastAiMessage?: string | null;
    lastLLMDebugInfo?: LLMDebugInfo[];
    metadata?: ExecutionMetadata;
    currentTopicPlan?: TopicPlan;
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
    this.variables = params.variables || {};
    this.variableStore = params.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
    this.currentAction = params.currentAction || null;
    this.conversationHistory = params.conversationHistory || [];
    this.lastAiMessage = params.lastAiMessage || null;
    this.lastLLMDebugInfo = params.lastLLMDebugInfo || [];
    this.metadata = params.metadata || {};
    this.currentTopicPlan = params.currentTopicPlan;
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
    this.completedAt = params.completedAt;
  }

  // ---- State machine ----

  start(): void {
    this.status = SessionStatus.ACTIVE;
    this.executionStatus = ExecutionStatus.RUNNING;
    this.updatedAt = new Date();
  }

  pause(): void {
    this.status = SessionStatus.PAUSED;
    this.executionStatus = ExecutionStatus.PAUSED;
    this.updatedAt = new Date();
  }

  resume(): void {
    if (this.status === SessionStatus.PAUSED) {
      this.status = SessionStatus.ACTIVE;
      this.executionStatus = ExecutionStatus.RUNNING;
      this.updatedAt = new Date();
    }
  }

  complete(): void {
    this.status = SessionStatus.COMPLETED;
    this.executionStatus = ExecutionStatus.COMPLETED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  fail(error: string): void {
    this.status = SessionStatus.FAILED;
    this.executionStatus = ExecutionStatus.ERROR;
    this.metadata.error = error;
    this.updatedAt = new Date();
  }

  // ---- Position ----

  updatePosition(position: ExecutionPosition): void {
    this.position = position;
    this.updatedAt = new Date();
  }

  // ---- Variables ----

  setVariable(name: string, value: unknown): void {
    this.variables[name] = value;
    this.updatedAt = new Date();
  }

  getVariable(name: string): unknown {
    return this.variables[name];
  }

  // ---- Conversation ----

  addConversationEntry(entry: ConversationEntry): void {
    this.conversationHistory.push(entry);
    this.updatedAt = new Date();
  }

  // ---- Action ----

  setCurrentAction(action: BaseAction | null): void {
    this.currentAction = action;
    this.updatedAt = new Date();
  }

  // ---- Execution status helpers ----

  waitForInput(): void {
    this.executionStatus = ExecutionStatus.WAITING_INPUT;
    this.updatedAt = new Date();
  }

  resumeRunning(): void {
    this.executionStatus = ExecutionStatus.RUNNING;
    this.updatedAt = new Date();
  }

  // ---- ExecutionState bridge ----

  /**
   * Build an ExecutionState snapshot for passing to ScriptExecutor.
   * The ScriptExecutor and its internal engines mutate ExecutionState;
   * call applyExecutionResult() afterwards to sync changes back.
   */
  toExecutionState(): ExecutionState {
    return {
      status: this.executionStatus,
      currentPhaseIdx: this.position.phaseIndex,
      currentTopicIdx: this.position.topicIndex,
      currentActionIdx: this.position.actionIndex,
      currentAction: this.currentAction,
      variables: { ...this.variables },
      variableStore: this.variableStore,
      conversationHistory: [...this.conversationHistory],
      metadata: { ...this.metadata },
      lastAiMessage: this.lastAiMessage,
      lastLLMDebugInfo: this.lastLLMDebugInfo ? [...this.lastLLMDebugInfo] : [],
      currentPhaseId: this.position.phaseId,
      currentTopicId: this.position.topicId,
      currentActionId: this.position.actionId,
      currentActionType: this.position.actionType,
      currentTopicPlan: this.currentTopicPlan,
    };
  }

  /**
   * Sync mutated ExecutionState fields back into this Session.
   * Called after ScriptExecutor.executeSession() returns.
   */
  applyExecutionResult(state: ExecutionState): void {
    this.executionStatus = state.status;
    this.position = {
      phaseIndex: state.currentPhaseIdx,
      topicIndex: state.currentTopicIdx,
      actionIndex: state.currentActionIdx,
      phaseId: state.currentPhaseId,
      topicId: state.currentTopicId,
      actionId: state.currentActionId,
      actionType: state.currentActionType,
    };
    this.currentAction = state.currentAction;
    this.variables = { ...state.variables };
    this.variableStore = state.variableStore;
    this.conversationHistory = [...state.conversationHistory];
    this.metadata = { ...state.metadata };
    this.lastAiMessage = state.lastAiMessage;
    this.lastLLMDebugInfo = state.lastLLMDebugInfo ? [...state.lastLLMDebugInfo] : [];
    this.currentTopicPlan = state.currentTopicPlan;
    this.updatedAt = new Date();
  }

  // ---- Factory ----

  /**
   * Rebuild a Session from database row data.
   *
   * Handles the DB-to-domain mapping:
   * - DB status strings → SessionStatus/ExecutionStatus enums
   * - JSONB position → ExecutionPosition
   * - Metadata variableStore extraction
   * - Global variable sync into variableStore.global
   * - currentRunId injection
   */
  static fromSessionData(
    data: SessionPersistenceData,
    options: {
      globalVariables: Record<string, any>;
      conversationHistory: ConversationEntry[];
    }
  ): Session {
    const pos = (data.position as Record<string, any>) || {};
    const meta = (data.metadata as Record<string, any>) || {};
    const variableStore = meta.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    if (options.globalVariables) {
      if (!variableStore.global) variableStore.global = {};
      for (const [key, value] of Object.entries(options.globalVariables)) {
        if (!variableStore.global[key]) {
          variableStore.global[key] = {
            value,
            type: typeof value,
            source: 'global_sync',
            lastUpdated: new Date().toISOString(),
            scope: 'global',
          };
        }
      }
    }

    if (data.currentRunId) {
      meta.currentRunId = data.currentRunId;
    }

    return new Session({
      sessionId: data.id,
      userId: data.userId,
      scriptId: data.scriptId,
      status: (data.status as SessionStatus) || SessionStatus.ACTIVE,
      executionStatus: (data.executionStatus as ExecutionStatus) || ExecutionStatus.RUNNING,
      position: {
        phaseIndex: pos.phaseIndex ?? 0,
        topicIndex: pos.topicIndex ?? 0,
        actionIndex: pos.actionIndex ?? 0,
        phaseId: pos.phaseId,
        topicId: pos.topicId,
        actionId: pos.actionId,
        actionType: pos.actionType,
      },
      variables: {
        ...options.globalVariables,
        ...((data.variables as Record<string, unknown>) || {}),
      },
      variableStore,
      conversationHistory: options.conversationHistory,
      metadata: meta as ExecutionMetadata,
      lastAiMessage: null,
      lastLLMDebugInfo: [],
    });
  }

  // ---- Serialisation ----

  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      scriptId: this.scriptId,
      status: this.status,
      executionStatus: this.executionStatus,
      position: this.position,
      variables: this.variables,
      variableStore: this.variableStore,
      currentAction: this.currentAction
        ? {
            actionId: this.currentAction.actionId,
            actionType: (this.currentAction.constructor as any).actionType,
          }
        : null,
      conversationHistory: this.conversationHistory,
      lastAiMessage: this.lastAiMessage,
      lastLLMDebugInfo: this.lastLLMDebugInfo,
      metadata: this.metadata,
      currentTopicPlan: this.currentTopicPlan,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
