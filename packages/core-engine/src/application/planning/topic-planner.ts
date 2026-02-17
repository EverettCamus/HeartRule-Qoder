/**
 * Topic Planner
 * Story 2.1: Topic默认Action模板语义与策略定义
 *
 * Application层编排器,负责生成Topic的实例化Action队列
 *
 * DDD定位: Application Layer Orchestrator
 * - 协调领域对象(Topic模板、VariableStore)完成规划用例
 * - Story 2.1: 提供基础实现(直接返回模板)
 * - Story 2.2+: 增强为LLM智能规划
 */

import type { VariableStore, TopicPlan, ActionConfig } from '@heartrule/shared-types';

/**
 * Topic规划上下文
 */
export interface TopicPlanningContext {
  /** Topic配置(包含actions模板和strategy) */
  topicConfig: {
    topic_id: string;
    actions: ActionConfig[];
    strategy?: string;
  };

  /** 当前变量存储(用于占位符解析) */
  variableStore: VariableStore;

  /** 会话上下文信息 */
  sessionContext: {
    sessionId: string;
    phaseId: string;
    conversationHistory: Array<{ role: string; content: string }>;
  };
}

/**
 * Topic规划器接口
 *
 * Application层编排器,负责生成Topic的实例化Action队列
 *
 * DDD定位: Application Layer Orchestrator
 * - 协调领域对象(Topic模板、VariableStore)完成规划用例
 * - Story 2.1: 提供基础实现(直接返回模板)
 * - Story 2.2+: 增强为LLM智能规划
 */
export interface ITopicPlanner {
  /**
   * 生成Topic实例化规划
   *
   * @param context - 规划上下文
   * @returns Topic规划结果
   */
  plan(context: TopicPlanningContext): Promise<TopicPlan>;
}

/**
 * 基础Topic规划器实现(Story 2.1)
 *
 * 策略: 直接返回脚本模板中的actions,不做展开和调整
 * 这是一个"零智能"的基础实现,确保Story 2.1可独立交付
 *
 * Story 2.2将实现LLM智能规划逻辑
 */
export class BasicTopicPlanner implements ITopicPlanner {
  /**
   * 生成基础Topic规划
   *
   * Story 2.1: 直接使用模板actions,不做动态调整
   * Story 2.2: 此处将增加LLM调用逻辑
   *
   * @param context - 规划上下文
   * @returns Topic规划结果
   */
  async plan(context: TopicPlanningContext): Promise<TopicPlan> {
    const { topicConfig, variableStore, sessionContext } = context;

    // Story 2.1: 基础实现,直接使用模板actions
    // Story 2.2: 此处增加LLM调用逻辑,根据上下文动态生成队列
    const instantiatedActions = this.copyActions(topicConfig.actions);

    return {
      topicId: topicConfig.topic_id,
      plannedAt: new Date().toISOString(),
      instantiatedActions,
      planningContext: {
        variableSnapshot: this.captureVariableSnapshot(variableStore),
        strategyUsed: topicConfig.strategy || '',
      },
    };
  }

  /**
   * 深拷贝Action配置列表
   *
   * @param actions - 原始Action配置列表
   * @returns 拷贝后的Action配置列表
   */
  private copyActions(actions: ActionConfig[]): ActionConfig[] {
    // 使用JSON深拷贝确保不修改原始模板
    return JSON.parse(JSON.stringify(actions));
  }

  /**
   * 捕获当前变量状态快照(用于调试)
   *
   * @param variableStore - 变量存储
   * @returns 变量快照
   */
  private captureVariableSnapshot(variableStore: VariableStore): Record<string, any> {
    // 深拷贝各层变量状态
    return {
      global: JSON.parse(JSON.stringify(variableStore.global || {})),
      session: JSON.parse(JSON.stringify(variableStore.session || {})),
      phase: JSON.parse(JSON.stringify(variableStore.phase || {})),
      topic: JSON.parse(JSON.stringify(variableStore.topic || {})),
    };
  }
}
