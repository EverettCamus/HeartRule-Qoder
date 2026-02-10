import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type {
  ILLMProvider,
  LLMConfig,
  LLMDebugInfo,
  LLMGenerateResult,
} from '../../application/ports/outbound/llm-provider.port.js';

/**
 * 重新导出端口定义以保持向后兼容
 * 
 * @deprecated 请直接从 application/ports/outbound/llm-provider.port.ts 导入
 */
export type { ILLMProvider as LLMProvider, LLMConfig, LLMDebugInfo, LLMGenerateResult };

/**
 * LLM编排引擎
 *
 * 统一管理多个LLM提供者，支持批量调用与上下文共享
 */
export class LLMOrchestrator {
  private providers: Map<string, ILLMProvider>;
  private defaultProvider: string;

  constructor(defaultProvider: ILLMProvider, providerName = 'default') {
    this.providers = new Map();
    this.providers.set(providerName, defaultProvider);
    this.defaultProvider = providerName;
  }

  /**
   * 注册新的LLM提供者
   */
  registerProvider(name: string, provider: ILLMProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * 设置默认提供者
   */
  setDefaultProvider(name: string): void {
    if (!this.providers.has(name)) {
      throw new Error(`Provider ${name} not found`);
    }
    this.defaultProvider = name;
  }

  /**
   * 生成文本（非流式）
   */
  async generateText(
    prompt: string,
    config?: Partial<LLMConfig>,
    providerName?: string
  ): Promise<LLMGenerateResult> {
    const provider = this.getProvider(providerName);
    return provider.generateText(prompt, config);
  }

  /**
   * 生成文本（流式）
   */
  async *streamText(
    prompt: string,
    config?: Partial<LLMConfig>,
    providerName?: string
  ): AsyncIterable<string> {
    const provider = this.getProvider(providerName);
    yield* provider.streamText(prompt, config);
  }

  /**
   * 从对话历史生成提示词
   */
  buildPrompt(
    conversationHistory: Array<{ role: string; content: string }>,
    systemPrompt?: string
  ): string {
    let prompt = '';

    if (systemPrompt) {
      prompt += `System: ${systemPrompt}\n\n`;
    }

    // 应用sliding window策略，保留最近的对话
    const recentHistory = this.applySlidingWindow(conversationHistory);

    for (const message of recentHistory) {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      prompt += `${role}: ${message.content}\n\n`;
    }

    return prompt;
  }

  /**
   * 应用滑动窗口策略
   */
  private applySlidingWindow(
    history: Array<{ role: string; content: string }>
  ): Array<{ role: string; content: string }> {
    // 简化实现：保留最后10条消息
    const maxMessages = 10;
    return history.slice(-maxMessages);
  }

  /**
   * 获取提供者
   */
  private getProvider(name?: string): ILLMProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }

    return provider;
  }

  /**
   * 批量调用（并行）
   */
  async batchGenerate(
    prompts: string[],
    config?: Partial<LLMConfig>,
    providerName?: string
  ): Promise<LLMGenerateResult[]> {
    const provider = this.getProvider(providerName);
    return Promise.all(prompts.map((prompt) => provider.generateText(prompt, config)));
  }
}

/**
 * 基础LLM提供者实现
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  protected config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 2000,
      topP: 1.0,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0,
      ...config,
    };
  }

  abstract getModel(): LanguageModel;

  async generateText(prompt: string, config?: Partial<LLMConfig>): Promise<LLMGenerateResult> {
    const model = this.getModel();
    const mergedConfig = { ...this.config, ...config };
    const timestamp = new Date().toISOString();

    // 创建超时控制器 (25秒超时，小于前端的30秒)
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 25000);

    try {
      const result = await generateText({
        model,
        prompt,
        temperature: mergedConfig.temperature,
        maxTokens: mergedConfig.maxTokens,
        topP: mergedConfig.topP,
        frequencyPenalty: mergedConfig.frequencyPenalty,
        presencePenalty: mergedConfig.presencePenalty,
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);

      // 提取实际发送给 LLM 的 prompt
      // Vercel AI SDK 会将 prompt 字符串包装成 messages 数组
      // 我们尝试提取 result.request.body 中的实际内容，如果失败则使用原始 prompt
      let actualPrompt = prompt;
      try {
        // 检查 result.request 是否存在
        if (result.request && result.request.body) {
          const requestBody =
            typeof result.request.body === 'string'
              ? JSON.parse(result.request.body)
              : result.request.body;

          // 如果是 messages格式，提取最后一条user消息的content
          if (requestBody.messages && Array.isArray(requestBody.messages)) {
            const userMessage = requestBody.messages.find((m: any) => m.role === 'user');
            if (userMessage && userMessage.content) {
              actualPrompt = userMessage.content;
            }
          }
          // 如果是prompt字段，直接使用
          else if (requestBody.prompt) {
            actualPrompt = requestBody.prompt;
          }
        }
      } catch (e) {
        // 解析失败，使用原始 prompt
      }

      // 构建调试信息
      const debugInfo: LLMDebugInfo = {
        prompt: actualPrompt, // 使用实际发送的 prompt
        response: {
          text: result.text,
          finishReason: result.finishReason,
          usage: result.usage,
          // 完整的响应对象
          raw: result,
        },
        model: mergedConfig.model,
        config: mergedConfig,
        timestamp,
        tokensUsed: result.usage?.totalTokens,
      };

      return {
        text: result.text,
        debugInfo,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      // 增强错误信息
      if (error.name === 'AbortError') {
        throw new Error(`LLM request timeout after 25 seconds. Model: ${mergedConfig.model}`);
      }

      throw error;
    }
  }

  async *streamText(prompt: string, config?: Partial<LLMConfig>): AsyncIterable<string> {
    const model = this.getModel();
    const mergedConfig = { ...this.config, ...config };

    const result = await streamText({
      model,
      prompt,
      temperature: mergedConfig.temperature,
      maxTokens: mergedConfig.maxTokens,
      topP: mergedConfig.topP,
      frequencyPenalty: mergedConfig.frequencyPenalty,
      presencePenalty: mergedConfig.presencePenalty,
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }
}
