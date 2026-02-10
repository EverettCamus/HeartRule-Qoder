/**
 * LLM Provider Port (Outbound)
 * 
 * @remarks
 * DDD 六边形架构：出站端口定义
 * 该文件定义核心引擎对外部 LLM 服务的依赖接口
 * 
 * 职责分离：
 * - 本文件：定义接口契约（Port）
 * - api-server/adapters/outbound/llm/*：提供具体实现（Adapter）
 * 
 * 端口-适配器模式：
 * - 核心引擎只依赖此端口接口
 * - 具体的 LLM 实现（OpenAI/Volcano等）作为适配器注入
 * - 便于测试时使用 Mock 实现
 */

import type { LanguageModel } from 'ai';

/**
 * LLM调试信息
 */
export interface LLMDebugInfo {
  prompt: string; // 完整的提示词
  response: any; // 原始响应（JSON格式）
  model: string; // 使用的模型
  config: Partial<LLMConfig>; // LLM配置
  timestamp: string; // 调用时间
  tokensUsed?: number; // 使用的token数
}

/**
 * LLM生成结果（包含调试信息）
 */
export interface LLMGenerateResult {
  text: string; // 生成的文本
  debugInfo: LLMDebugInfo; // 调试信息
}

/**
 * LLM配置
 */
export interface LLMConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * LLM提供者接口（出站端口）
 * 
 * @remarks
 * 定义了核心引擎调用 LLM 服务的标准契约
 * 具体实现由外部适配器提供（OpenAI/Volcano/Mock等）
 */
export interface ILLMProvider {
  /**
   * 获取语言模型实例
   * 
   * @returns Vercel AI SDK 的 LanguageModel 实例
   */
  getModel(): LanguageModel;

  /**
   * 生成文本（非流式）
   * 
   * @param prompt - 提示词
   * @param config - LLM 配置（可选）
   * @returns 生成的文本及调试信息
   */
  generateText(prompt: string, config?: Partial<LLMConfig>): Promise<LLMGenerateResult>;

  /**
   * 流式生成文本
   * 
   * @param prompt - 提示词
   * @param config - LLM 配置（可选）
   * @returns 异步可迭代的文本流
   */
  streamText(prompt: string, config?: Partial<LLMConfig>): AsyncIterable<string>;
}
