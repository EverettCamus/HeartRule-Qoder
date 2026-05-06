/**
 * AI_Ask LLM输出类型定义
 *
 * 用于AI_Ask多轮对话的LLM响应结构
 *
 * 危机检测分层机制说明：
 * - 明显危机：crisis_detected=true 时触发，主线程同步启动危机处理LLM
 * - 隐蔽危机：嵌入在assessment的markdown描述中，由监控流程异步处理
 */

import { z } from 'zod';

/**
 * 安全自查结果
 */
export interface SafetyCheck {
  passed: boolean;
  concern: string | null;
}

/**
 * 退出理由（已知值保留自动补全，同时接受自定义字符串）
 */
export type ExitReason =
  | '信息已完整'
  | '信息不足'
  | '用户阻抗'
  | '达到最大轮次'
  | '用户理解困难'
  | '话题偏离'
  | '危机信号'
  | '继续收集'
  | (string & NonNullable<unknown>);

/**
 * Enhanced AI_Ask LLM输出接口
 *
 * 输出结构按因果链排列：assessment → exit → exit_reason → content → brief → progress → safety_check → crisis_detected
 * - assessment: 语义评估（markdown格式），包含阻抗分析、风险识别、用户理解
 * - progress: 任务进度说明、变量收集状态（markdown格式）
 * - safety_check: LLM安全自查结果
 * - 动态变量: 支持任意键名的变量（如来访者称呼、来访者年龄等）
 */
export interface EnhancedAskLLMOutput {
  assessment?: string;
  exit: string;
  exit_reason?: ExitReason;
  content?: string;
  brief?: string;
  progress?: string;
  safety_check?: SafetyCheck;
  crisis_detected: boolean;
  // 动态变量字段（如来访者称呼、来访者年龄等）
  [key: string]: unknown;
}

/**
 * Convert boolean to string 'true'/'false' for exit field
 * LLM may output boolean instead of string
 */
const ExitFieldSchema = z.preprocess(
  (val) => {
    if (typeof val === 'boolean') {
      return val ? 'true' : 'false';
    }
    return val;
  },
  z.enum(['true', 'false'])
);

/**
 * Convert string 'true'/'false' to boolean for passed field
 * LLM may output string instead of boolean
 */
const BooleanLikeFieldSchema = z.preprocess((val) => {
  if (typeof val === 'boolean') {
    return val;
  }
  if (val === 'true') {
    return true;
  }
  if (val === 'false') {
    return false;
  }
  return val;
}, z.boolean());

/**
 * Convert string 'null' to actual null for concern field
 * LLM may output string 'null' instead of actual null
 */
const NullableStringSchema = z.preprocess((val) => {
  if (val === 'null') {
    return null;
  }
  return val;
}, z.string().nullable());

/**
 * Safety Check Schema with type coercion
 */
export const SafetyCheckSchema = z.object({
  passed: BooleanLikeFieldSchema,
  concern: NullableStringSchema,
});

/**
 * Enhanced AI_Ask LLM输出 Schema
 *
 * Uses preprocess to handle inconsistent LLM output types:
 * - exit: accepts both boolean and string 'true'/'false'
 * - safety_check.passed: accepts both string and boolean
 * - safety_check.concern: converts string 'null' to actual null
 * - crisis_detected: accepts both string and boolean
 * - catchall: preserves dynamic variable fields (如来访者称呼、来访者年龄等)
 */
export const EnhancedAskLLMOutputSchema = z
  .object({
    assessment: z.string().optional(),
    exit: ExitFieldSchema,
    exit_reason: z.string().optional(),
    content: z.string().optional(),
    brief: z.string().optional(),
    progress: z.string().optional(),
    safety_check: SafetyCheckSchema.optional(),
    crisis_detected: BooleanLikeFieldSchema.default(false),
  })
  .catchall(z.unknown());
