/**
 * ExecutionContext - Phase 4 重构后的执行状态结构
 *
 * 【设计目标】
 * 将原有的扁平化ExecutionState结构分离为三个清晰的层次：
 * 1. ExecutionPosition - 纯粹的位置标记（当前执行到哪里）
 * 2. ExecutionRuntime - 临时运行状态（正在执行的Action、最近的消息）
 * 3. ExecutionMetadata - 元数据和调试信息（配置、调试信息、Action状态）
 *
 * 【向后兼容】
 * 通过ExecutionStateAdapter提供新旧结构的双向转换，保证现有代码零影响
 */

import type { VariableStore } from '@heartrule/shared-types';

import type { BaseAction } from '../../domain/actions/base-action.js';
import type { LLMDebugInfo } from '../llm-orchestration/orchestrator.js';

import { ExecutionStatus } from './script-executor.js';

/**
 * 执行位置 - 纯粹的位置标记
 *
 * 职责：标记脚本执行的精确位置（phase/topic/action）
 * 特点：不可变、可序列化、可比较
 */
export interface ExecutionPosition {
  // 数组索引位置
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;

  // ID标识（用于日志和调试）
  phaseId?: string;
  topicId?: string;
  actionId?: string;
  actionType?: string;
}

/**
 * 执行运行时 - 临时运行状态
 *
 * 职责：存储当前执行过程中的临时对象和最近消息
 * 特点：不持久化、随执行流程变化
 */
export interface ExecutionRuntime {
  // 当前正在执行的Action实例（如果存在）
  currentAction: BaseAction | null;

  // 最近的AI消息（用于返回给用户）
  lastAiMessage: string | null;

  // 最近一次LLM调用的调试信息
  lastLLMDebugInfo?: LLMDebugInfo;
}

/**
 * 执行元数据 - 配置和扩展信息
 *
 * 职责：存储会话配置、项目信息、Action序列化状态等
 * 特点：部分持久化、用于状态恢复和调试
 */
export interface ExecutionMetadata {
  // Session配置（如template_scheme）
  sessionConfig?: {
    template_scheme?: string;
    [key: string]: any;
  };

  // 项目信息
  projectId?: string;
  templateProvider?: any;

  // Action序列化状态（用于恢复）
  actionState?: {
    actionId: string;
    actionType: string;
    currentRound: number;
    maxRounds: number;
    conversationHistory: Array<{
      role: string;
      content: string;
      metadata?: Record<string, any>;
    }>;
    outputConfig?: any[];
    metadata?: Record<string, any>;
  };

  // Story 1.4: Action执行状态历史记录
  actionMetricsHistory?: Array<{
    actionId: string;
    actionType: string;
    round: number;
    timestamp: string;
    metrics: Record<string, any>;
    progress_suggestion?: string;
  }>;

  // 最新的监控反馈（用于下一轮Action）
  latestMonitorFeedback?: string;

  // 其他扩展字段
  [key: string]: any;
}

/**
 * 执行上下文 - Phase 4 重构后的统一结构
 *
 * 【结构分层】
 * - status: 执行状态枚举（running/waiting_input/completed/error）
 * - position: 执行位置（3层索引 + ID标识）
 * - runtime: 运行时状态（Action实例、最近消息）
 * - variableStore: 变量存储（四层作用域）
 * - conversationHistory: 对话历史
 * - metadata: 元数据（配置、调试、序列化）
 */
export interface ExecutionContext {
  // 执行状态
  status: ExecutionStatus;

  // 【分离1】执行位置
  position: ExecutionPosition;

  // 【分离2】运行时状态
  runtime: ExecutionRuntime;

  // 变量存储（四层作用域）
  variableStore: VariableStore;

  // 对话历史
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;

  // 【分离3】元数据
  metadata: ExecutionMetadata;
}

/**
 * 旧的ExecutionState接口（向后兼容）
 *
 * 保留原有的扁平化结构定义，供适配器使用
 */
export interface LegacyExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;
  variableStore?: VariableStore;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  lastAiMessage: string | null;
  // 扩展位置信息
  currentPhaseId?: string;
  currentTopicId?: string;
  currentActionId?: string;
  currentActionType?: string;
  // LLM调试信息
  lastLLMDebugInfo?: LLMDebugInfo;
}

/**
 * ExecutionStateAdapter - 新旧结构双向适配器
 *
 * 【设计目标】
 * 提供ExecutionContext和LegacyExecutionState之间的无损转换，
 * 保证渐进式重构过程中两种结构可以互操作。
 *
 * 【使用场景】
 * 1. 新代码使用ExecutionContext，通过toLegacy()转换给旧代码
 * 2. 旧代码返回LegacyExecutionState，通过fromLegacy()转换给新代码
 * 3. 测试中验证两种结构的等价性
 */
export class ExecutionStateAdapter {
  /**
   * 从旧结构转换为新结构
   *
   * @param legacy 旧的ExecutionState结构
   * @returns 新的ExecutionContext结构
   */
  static fromLegacy(legacy: LegacyExecutionState): ExecutionContext {
    return {
      status: legacy.status,

      // 提取位置信息
      position: {
        phaseIndex: legacy.currentPhaseIdx,
        topicIndex: legacy.currentTopicIdx,
        actionIndex: legacy.currentActionIdx,
        phaseId: legacy.currentPhaseId,
        topicId: legacy.currentTopicId,
        actionId: legacy.currentActionId,
        actionType: legacy.currentActionType,
      },

      // 提取运行时状态
      runtime: {
        currentAction: legacy.currentAction,
        lastAiMessage: legacy.lastAiMessage,
        lastLLMDebugInfo: legacy.lastLLMDebugInfo,
      },

      // 迁移变量存储（优先使用variableStore）
      variableStore: legacy.variableStore || {
        global: {},
        session: legacy.variables || {},
        phase: {},
        topic: {},
      },

      // 保留对话历史
      conversationHistory: legacy.conversationHistory || [],

      // 提取元数据（结构化）
      metadata: {
        sessionConfig: legacy.metadata?.sessionConfig,
        projectId: legacy.metadata?.projectId,
        templateProvider: legacy.metadata?.templateProvider,
        actionState: legacy.metadata?.actionState,
        actionMetricsHistory: legacy.metadata?.actionMetricsHistory,
        latestMonitorFeedback: legacy.metadata?.latestMonitorFeedback,
        // 保留其他未知字段
        ...Object.keys(legacy.metadata || {})
          .filter(
            (key) =>
              ![
                'sessionConfig',
                'projectId',
                'templateProvider',
                'actionState',
                'actionMetricsHistory',
                'latestMonitorFeedback',
              ].includes(key)
          )
          .reduce(
            (acc, key) => {
              acc[key] = legacy.metadata[key];
              return acc;
            },
            {} as Record<string, any>
          ),
      },
    };
  }

  /**
   * 从新结构转换为旧结构
   *
   * @param context 新的ExecutionContext结构
   * @returns 旧的ExecutionState结构
   */
  static toLegacy(context: ExecutionContext): LegacyExecutionState {
    return {
      status: context.status,

      // 展开位置信息
      currentPhaseIdx: context.position.phaseIndex,
      currentTopicIdx: context.position.topicIndex,
      currentActionIdx: context.position.actionIndex,
      currentPhaseId: context.position.phaseId,
      currentTopicId: context.position.topicId,
      currentActionId: context.position.actionId,
      currentActionType: context.position.actionType,

      // 展开运行时状态
      currentAction: context.runtime.currentAction,
      lastAiMessage: context.runtime.lastAiMessage,
      lastLLMDebugInfo: context.runtime.lastLLMDebugInfo,

      // 迁移变量（向后兼容：保留variables字段）
      variables: context.variableStore.session || {},
      variableStore: context.variableStore,

      // 保留对话历史
      conversationHistory: context.conversationHistory,

      // 展开元数据（扁平化）
      metadata: {
        sessionConfig: context.metadata.sessionConfig,
        projectId: context.metadata.projectId,
        templateProvider: context.metadata.templateProvider,
        actionState: context.metadata.actionState,
        actionMetricsHistory: context.metadata.actionMetricsHistory,
        latestMonitorFeedback: context.metadata.latestMonitorFeedback,
        // 包含其他扩展字段
        ...Object.keys(context.metadata)
          .filter(
            (key) =>
              ![
                'sessionConfig',
                'projectId',
                'templateProvider',
                'actionState',
                'actionMetricsHistory',
                'latestMonitorFeedback',
              ].includes(key)
          )
          .reduce(
            (acc, key) => {
              acc[key] = context.metadata[key];
              return acc;
            },
            {} as Record<string, any>
          ),
      },
    };
  }

  /**
   * 验证转换的正确性（用于测试）
   *
   * @param legacy 旧结构
   * @param context 新结构
   * @returns 是否等价
   */
  static validate(legacy: LegacyExecutionState, context: ExecutionContext): boolean {
    // 验证关键字段
    const checks = [
      legacy.status === context.status,
      legacy.currentPhaseIdx === context.position.phaseIndex,
      legacy.currentTopicIdx === context.position.topicIndex,
      legacy.currentActionIdx === context.position.actionIndex,
      legacy.currentAction === context.runtime.currentAction,
      legacy.lastAiMessage === context.runtime.lastAiMessage,
      legacy.conversationHistory.length === context.conversationHistory.length,
    ];

    return checks.every(Boolean);
  }

  /**
   * 创建空的ExecutionContext
   */
  static createEmpty(): ExecutionContext {
    return {
      status: ExecutionStatus.RUNNING,
      position: {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
      },
      runtime: {
        currentAction: null,
        lastAiMessage: null,
      },
      variableStore: {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
    };
  }

  /**
   * 创建空的LegacyExecutionState（向后兼容）
   */
  static createEmptyLegacy(): LegacyExecutionState {
    return {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {},
      variableStore: {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };
  }
}
