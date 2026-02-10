import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import type { LLMProvider, LLMConfig, LLMGenerateResult, LLMDebugInfo } from '@heartrule/core-engine';

/**
 * 基础LLM提供者实现
 */
export abstract class BaseLLMProvider implements LLMProvider {
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
      let actualPrompt = prompt;
      try {
        if (result.request && result.request.body) {
          const requestBody =
            typeof result.request.body === 'string'
              ? JSON.parse(result.request.body)
              : result.request.body;

          if (requestBody.messages && Array.isArray(requestBody.messages)) {
            const userMessage = requestBody.messages.find((m: any) => m.role === 'user');
            if (userMessage && userMessage.content) {
              actualPrompt = userMessage.content;
            }
          } else if (requestBody.prompt) {
            actualPrompt = requestBody.prompt;
          }
        }
      } catch (e) {
        // 解析失败，使用原始 prompt
      }

      // 构建调试信息
      const debugInfo: LLMDebugInfo = {
        prompt: actualPrompt,
        response: {
          text: result.text,
          finishReason: result.finishReason,
          usage: result.usage,
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
