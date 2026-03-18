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
 * Enhanced AI_Ask LLM输出接口
 *
 * 简化的输出结构，使用markdown格式表达复杂语义：
 * - assessment: 阻抗分析、风险识别、用户理解
 * - progress: 任务进度说明、变量收集状态
 */
export interface EnhancedAskLLMOutput {
  content?: string;
  assessment?: string;
  progress?: string;
  EXIT: string;
  BRIEF?: string;
  crisis_detected: boolean;
}

/**
 * Enhanced AI_Ask LLM输出 Schema
 */
export const EnhancedAskLLMOutputSchema = z.object({
  content: z.string().optional(),
  assessment: z.string().optional(),
  progress: z.string().optional(),
  EXIT: z.enum(['true', 'false']),
  BRIEF: z.string().optional(),
  crisis_detected: z.boolean().default(false),
});
