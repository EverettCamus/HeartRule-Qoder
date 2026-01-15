/**
 * Navigation Tree Types
 * 导航树数据结构定义
 */

/**
 * Action 节点状态
 */
export type ActionNodeStatus = 'pending' | 'executing' | 'executed' | 'error';

/**
 * Action 节点
 */
export interface ActionNode {
  actionId: string;
  actionType: string;
  actionIndex: number;
  displayName: string;
  status: ActionNodeStatus;
  config?: Record<string, any>;
  executedAt?: string;
}

/**
 * Topic 节点
 */
export interface TopicNode {
  topicId: string;
  topicName: string;
  topicIndex: number;
  actions: ActionNode[];
  isExpanded?: boolean;
}

/**
 * Phase 节点
 */
export interface PhaseNode {
  phaseId: string;
  phaseName: string;
  phaseIndex: number;
  topics: TopicNode[];
  isExpanded?: boolean;
}

/**
 * Session 导航树
 */
export interface NavigationTree {
  sessionId: string;
  sessionName: string;
  phases: PhaseNode[];
}

/**
 * 当前执行位置
 */
export interface CurrentPosition {
  phaseIndex: number;
  phaseId: string;
  topicIndex: number;
  topicId: string;
  actionIndex: number;
  actionId: string;
  actionType: string;
}
