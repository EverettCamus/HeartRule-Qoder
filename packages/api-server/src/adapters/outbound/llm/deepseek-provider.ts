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

  constructor(
    config: LLMConfig,
    apiKey: string,
    model = 'deepseek-chat',
    baseUrl = 'https://api.deepseek.com'
  ) {
    super(config);

    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    this.model = openai(model) as LanguageModel;
  }

  getModel(): LanguageModel {
    return this.model;
  }
}
