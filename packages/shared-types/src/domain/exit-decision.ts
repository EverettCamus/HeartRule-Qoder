/**
 * 退出决策相关类型定义
 * 
 * 用于多轮对话的智能终止判断机制
 */

import { z } from 'zod';

/**
 * 退出决策来源类型
 */
export type ExitDecisionSource = 'max_rounds' | 'exit_flag' | 'exit_criteria' | 'llm_suggestion';

/**
 * 退出决策结果接口
 */
export interface ExitDecision {
  should_exit: boolean;
  reason: string;
  decision_source: ExitDecisionSource;
}

/**
 * 退出决策结果 Schema
 */
export const ExitDecisionSchema = z.object({
  should_exit: z.boolean(),
  reason: z.string(),
  decision_source: z.enum(['max_rounds', 'exit_flag', 'exit_criteria', 'llm_suggestion']),
});

/**
 * 自定义退出条件（用于 exit_criteria.custom_conditions）
 */
export interface CustomExitCondition {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  value: unknown;
}

/**
 * 自定义退出条件 Schema
 */
export const CustomExitConditionSchema = z.object({
  variable: z.string(),
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains']),
  value: z.unknown(),
});

/**
 * 退出条件配置（通用 superset）
 * 
 * 针对不同的 action_type，实际可用字段有所不同：
 * - ai_ask: understanding_threshold, has_questions, min_rounds, custom_conditions
 * - ai_say: understanding_threshold, has_questions, min_rounds, custom_conditions
 * - fill_form: min_rounds, custom_conditions (表单完整性由其他逻辑处理)
 * - 内部动作 (ai_think, use_skill, show_pic): 不使用 exit_criteria
 */
export interface ExitCriteria {
  understanding_threshold?: number;  // 理解度阈值（0-100）
  has_questions?: boolean;           // 是否允许有疑问时退出
  min_rounds?: number;               // 最小轮次要求
  custom_conditions?: CustomExitCondition[];  // 自定义条件数组
}

/**
 * 退出条件配置 Schema
 */
export const ExitCriteriaSchema = z.object({
  understanding_threshold: z.number().min(0).max(100).optional(),
  has_questions: z.boolean().optional(),
  min_rounds: z.number().int().min(1).optional(),
  custom_conditions: z.array(CustomExitConditionSchema).optional(),
});

/**
 * Action 退出策略配置
 * 
 * 用于声明 Action 是否支持多轮退出机制
 */
export interface ExitPolicy {
  supportsExit: boolean;  // 是否支持多轮退出判定
  enabledSources?: ExitDecisionSource[];  // 启用的判定来源（如果 supportsExit 为 true）
}

/**
 * Action 退出策略配置 Schema
 */
export const ExitPolicySchema = z.object({
  supportsExit: z.boolean(),
  enabledSources: z.array(z.enum(['max_rounds', 'exit_flag', 'exit_criteria', 'llm_suggestion'])).optional(),
});

/**
 * 退出历史记录项
 */
export interface ExitHistoryEntry {
  actionId: string;
  round: number;
  decision: ExitDecision;
  timestamp: string;
}

/**
 * 退出历史记录项 Schema
 */
export const ExitHistoryEntrySchema = z.object({
  actionId: z.string(),
  round: z.number().int(),
  decision: ExitDecisionSchema,
  timestamp: z.string(),
});

/**
 * 最后一次 Action 轮次信息（扩展版）
 */
export interface LastActionRoundInfo {
  actionId: string;
  currentRound: number;
  maxRounds: number;
  exitDecision?: ExitDecision;
}

/**
 * 最后一次 Action 轮次信息 Schema
 */
export const LastActionRoundInfoSchema = z.object({
  actionId: z.string(),
  currentRound: z.number().int(),
  maxRounds: z.number().int(),
  exitDecision: ExitDecisionSchema.optional(),
});
