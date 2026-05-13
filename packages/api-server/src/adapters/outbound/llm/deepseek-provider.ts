import { createOpenAI } from '@ai-sdk/openai';
import { BaseLLMProvider, type LLMConfig } from '@heartrule/core-engine';
import type { LanguageModel } from 'ai';

/**
 * DeepSeek 官方 API Provider
 *
 * 使用 DeepSeek 官方 API，需要设置 DEEPSEEK_API_KEY 和 DEEPSEEK_MODEL
 */
export class DeepSeekProvider extends BaseLLMProvider {
  private model: LanguageModel;
  private openaiInstance: ReturnType<typeof createOpenAI>;

  constructor(
    config: LLMConfig,
    apiKey: string,
    model = 'deepseek-chat',
    baseUrl = 'https://api.deepseek.com'
  ) {
    super(config);

    this.openaiInstance = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    this.model = this.openaiInstance(model) as LanguageModel;
  }

  getModel(modelName?: string): LanguageModel {
    if (modelName && modelName !== this.config.model) {
      return this.openaiInstance(modelName) as LanguageModel;
    }
    return this.model;
  }
}
