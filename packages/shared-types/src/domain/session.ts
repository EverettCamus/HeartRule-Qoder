import { z } from 'zod';

import {
  SessionStatus,
  SessionStatusSchema,
  ExecutionStatus,
  ExecutionStatusSchema,
} from '../enums.js';

/**
 * 执行位置接口
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
  // 扩展的 ID 字段（可选，用于导航树定位）
  phaseId?: string;
  topicId?: string;
  actionId?: string;
  actionType?: string;
}

/**
 * 执行位置 Schema
 */
export const ExecutionPositionSchema = z.object({
  phaseIndex: z.number().int().min(0),
  topicIndex: z.number().int().min(0),
  actionIndex: z.number().int().min(0),
  phaseId: z.string().optional(),
  topicId: z.string().optional(),
  actionId: z.string().optional(),
  actionType: z.string().optional(),
});

/**
 * 会话接口
 */
export interface Session {
  sessionId: string;
  userId: string;
  scriptId: string;
  status: SessionStatus;
  executionStatus: ExecutionStatus;
  position: ExecutionPosition;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 会话 Schema
 */
export const SessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().min(1),
  scriptId: z.string().uuid(),
  status: SessionStatusSchema,
  executionStatus: ExecutionStatusSchema,
  position: ExecutionPositionSchema,
  variables: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});

/**
 * 创建会话输入
 */
export interface CreateSessionInput {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
}

/**
 * 创建会话输入 Schema
 */
export const CreateSessionInputSchema = z.object({
  userId: z.string().min(1),
  scriptId: z.string().uuid(),
  initialVariables: z.record(z.unknown()).optional(),
});

/**
 * Action配置(解析后/实例化后)
 * Story 2.1: Topic默认Action模板语义与策略定义
 */
export interface ActionConfig {
  action_id: string;
  action_type: string;
  config?: Record<string, any>;
  // 其他字段保持与现有schema一致
  [key: string]: any;
}

/**
 * Action配置 Schema
 */
export const ActionConfigSchema = z.object({
  action_id: z.string(),
  action_type: z.string(),
  config: z.record(z.any()).optional(),
}).passthrough(); // 允许额外字段

/**
 * Topic实例化规划结果
 * Story 2.1: 存储进入Topic时生成的实际执行队列
 */
export interface TopicPlan {
  /** Topic ID */
  topicId: string;

  /** 规划生成时间戳 */
  plannedAt: string;

  /** 实例化后的Action配置列表 */
  instantiatedActions: ActionConfig[];

  /** 规划上下文快照(用于调试) */
  planningContext?: {
    /** 触发规划的变量状态 */
    variableSnapshot: Record<string, any>;
    /** 使用的strategy文本 */
    strategyUsed: string;
    /** 规划决策日志(可选,调试用) */
    planningLog?: string[];
  };
}

/**
 * Topic规划 Schema
 */
export const TopicPlanSchema = z.object({
  topicId: z.string(),
  plannedAt: z.string(),
  instantiatedActions: z.array(ActionConfigSchema),
  planningContext: z
    .object({
      variableSnapshot: z.record(z.any()),
      strategyUsed: z.string(),
      planningLog: z.array(z.string()).optional(),
    })
    .optional(),
});
