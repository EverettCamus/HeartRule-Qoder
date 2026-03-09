import { z } from 'zod';

import { ActionType } from '../enums.js';

/**
 * 策略类型枚举
 */
export const StrategyType = {
  NEW_ENTITIES: 'NEW_ENTITIES',
  DEEPEN_ENTITY: 'DEEPEN_ENTITY',
  SKIP_ENTITY: 'SKIP_ENTITY',
  REORDER_ACTIONS: 'REORDER_ACTIONS',
  CUSTOM: 'CUSTOM',
} as const;

export type StrategyType = (typeof StrategyType)[keyof typeof StrategyType];

/**
 * 实体处理意图枚举
 */
export const EntityIntent = {
  NEW: 'NEW',
  EXTEND: 'EXTEND',
  DEEPEN: 'DEEPEN',
  SKIP: 'SKIP',
} as const;

export type EntityIntent = (typeof EntityIntent)[keyof typeof EntityIntent];

/**
 * Action优先级枚举
 */
export const ActionPriority = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type ActionPriority = (typeof ActionPriority)[keyof typeof ActionPriority];

/**
 * Actions插入策略枚举
 */
export const InsertionStrategy = {
  APPEND_TO_END: 'APPEND_TO_END',
  INSERT_AFTER_CURRENT: 'INSERT_AFTER_CURRENT',
  INSERT_BEFORE_TOPIC_END: 'INSERT_BEFORE_TOPIC_END',
} as const;

export type InsertionStrategy = (typeof InsertionStrategy)[keyof typeof InsertionStrategy];

/**
 * 实体上下文 Schema
 */
export const EntityContextSchema = z.object({
  conversationSnippet: z.string(),
  existingKnowledge: z.string(),
  emotionalTone: z.string(),
});

/**
 * Action需求 Schema
 */
export const ActionNeededSchema = z.object({
  type: z.nativeEnum(ActionType),
  purpose: z.string(),
  priority: z.nativeEnum(ActionPriority),
  variableTargets: z.array(z.string()).optional(),
});

/**
 * 实体决策 Schema
 */
export const EntityDecisionSchema = z.object({
  entityName: z.string(),
  intent: z.nativeEnum(EntityIntent),
  actionsNeeded: z.array(ActionNeededSchema),
  context: EntityContextSchema,
});

/**
 * 目标位置 Schema
 */
export const TargetPositionSchema = z.object({
  afterActionId: z.string().optional(),
  positionIndex: z.number().int().min(0).optional(),
});

/**
 * 调整计划 Schema
 */
export const AdjustmentPlanSchema = z.object({
  entities: z.array(EntityDecisionSchema),
  insertionStrategy: z.nativeEnum(InsertionStrategy),
  targetPosition: TargetPositionSchema.optional(),
});

/**
 * 约束条件 Schema
 */
export const DecisionConstraintsSchema = z.object({
  maxTotalActions: z.number().int().min(1),
  maxActionsPerEntity: z.number().int().min(1),
  timeBudgetMinutes: z.number().int().min(1),
  forbiddenActionTypes: z.array(z.string()),
});

/**
 * 决策引擎输出 Schema
 */
export const TopicDecisionOutputSchema = z.object({
  needsAdjustment: z.boolean(),
  strategy: z.nativeEnum(StrategyType),
  reasoning: z.string(),
  adjustmentPlan: AdjustmentPlanSchema,
  constraints: DecisionConstraintsSchema,
});

/**
 * Planner变量定义 Schema
 */
export const PlannerVariableDefinitionSchema = z.object({
  get: z.string(),
  define: z.string(),
  extraction_method: z.enum(['direct', 'pattern', 'llm']).optional(),
});

/**
 * Planner Action配置 Schema
 */
export const PlannerActionConfigSchema = z.object({
  action_type: z.nativeEnum(ActionType),
  action_id: z.string(),
  config: z.object({
    content: z.string().optional(),
    max_rounds: z.number().int().min(1).optional(),
    say_goal: z.string().optional(),
    output: z.array(PlannerVariableDefinitionSchema).optional(),
    target_variable: z.string().optional(),
    required: z.boolean().optional(),
    extraction_prompt: z.string().optional(),
    think_goal: z.string().optional(),
    input_variables: z.array(z.string()).optional(),
    output_variables: z.array(z.string()).optional(),
    skill_id: z.string().optional(),
    skill_parameters: z.record(z.unknown()).optional(),
  }),
});

/**
 * 规划引擎输出 Schema
 */
export const TopicPlannerOutputSchema = z.object({
  actions: z.array(PlannerActionConfigSchema),
});

// 类型推断导出
export type EntityContext = z.infer<typeof EntityContextSchema>;
export type ActionNeeded = z.infer<typeof ActionNeededSchema>;
export type EntityDecision = z.infer<typeof EntityDecisionSchema>;
export type TargetPosition = z.infer<typeof TargetPositionSchema>;
export type AdjustmentPlan = z.infer<typeof AdjustmentPlanSchema>;
export type DecisionConstraints = z.infer<typeof DecisionConstraintsSchema>;
export type TopicDecisionOutput = z.infer<typeof TopicDecisionOutputSchema>;
export type PlannerVariableDefinition = z.infer<typeof PlannerVariableDefinitionSchema>;
export type PlannerActionConfig = z.infer<typeof PlannerActionConfigSchema>;
export type TopicPlannerOutput = z.infer<typeof TopicPlannerOutputSchema>;
