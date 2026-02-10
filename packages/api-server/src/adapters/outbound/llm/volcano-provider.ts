import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { LLMConfig } from '@heartrule/core-engine';
import { BaseLLMProvider } from './base-provider.js';

/**
 * 火山引擎DeepSeek Provider
 *
 * 基于OpenAI兼容接口实现，通过自定义baseURL和model参数适配火山引擎Ark API
 */
export class VolcanoDeepSeekProvider extends BaseLLMProvider {
  private apiKey: string;
  private endpointId: string;
  private baseUrl: string;
  private model: any; // 使用any类型避免ai包版本不匹配问题

  constructor(
    config: LLMConfig,
    apiKey: string,
    endpointId: string,
    baseUrl = 'https://ark.cn-beijing.volces.com/api/v3'
  ) {
    super(config);
    this.apiKey = apiKey;
    this.endpointId = endpointId;
    this.baseUrl = baseUrl;

    // 创建OpenAI兼容客户端，指向火山引擎 Ark API
    const openai = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });

    // 使用endpoint ID作为model名称
    this.model = openai(this.endpointId);
  }

  getModel(): LanguageModel {
    return this.model as LanguageModel;
  }
}
