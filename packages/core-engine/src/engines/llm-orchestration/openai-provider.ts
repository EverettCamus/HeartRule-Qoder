import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

import { BaseLLMProvider, type LLMConfig } from './orchestrator.js';

/**
 * OpenAI提供者
 */
export class OpenAIProvider extends BaseLLMProvider {
  private apiKey: string;
  private baseURL?: string;

  constructor(config: LLMConfig, apiKey: string, baseURL?: string) {
    super(config);
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  getModel(): LanguageModel {
    const openai = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });

    return openai(this.config.model) as LanguageModel;
  }
}
