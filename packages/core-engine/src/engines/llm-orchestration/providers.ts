import type { LanguageModel } from 'ai';
import { BaseLLMProvider, type LLMConfig } from './orchestrator.js';

/**
 * Volcengine自定义Provider
 * 
 * 通过兼容OpenAI格式的API接入火山引擎DeepSeek服务
 */
export class VolcanoProvider extends BaseLLMProvider {
  private apiKey: string;
  private endpointId: string;
  private baseURL: string;

  constructor(
    config: LLMConfig,
    apiKey: string,
    endpointId: string,
    baseURL = 'https://ark.cn-beijing.volces.com/api/v3'
  ) {
    super(config);
    this.apiKey = apiKey;
    this.endpointId = endpointId;
    this.baseURL = baseURL;
  }

  getModel(): LanguageModel {
    // 使用OpenAI兼容格式
    const { createOpenAI } = require('@ai-sdk/openai');
    
    const volcanoOpenAI = createOpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
    });

    // 使用端点ID作为模型名称
    return volcanoOpenAI(this.endpointId) as LanguageModel;
  }
}

/**
 * Mock提供者（用于测试）
 */
export class MockProvider extends BaseLLMProvider {
  getModel(): LanguageModel {
    // 返回一个模拟的LanguageModel
    return {
      modelId: 'mock-model',
      provider: 'mock',
      specificationVersion: 'v1',
      defaultObjectGenerationMode: 'json',
      doGenerate: async () => ({
        text: '这是一个模拟的LLM响应',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      }),
      doStream: async function* () {
        yield { type: 'text-delta', textDelta: '模拟' };
        yield { type: 'text-delta', textDelta: '响应' };
        yield {
          type: 'finish',
          finishReason: 'stop',
          usage: { promptTokens: 10, completionTokens: 20 },
        };
      },
    } as unknown as LanguageModel;
  }
}
