/**
 * Dependency Injection Container
 * 
 * @remarks
 * DDD 六边形架构：依赖注入容器
 * 负责在应用启动时组装依赖关系，实现六边形架构的端口-适配器模式
 * 
 * 职责：
 * - 根据环境配置选择具体的适配器实现
 * - 组装核心引擎的依赖（LLM、ScriptExecutor、SessionApplicationService等）
 * - 提供单例服务获取接口
 * 
 * 依赖流向：
 * Container → Adapters (outbound) → Core Engine (through ports)
 */

import { LLMOrchestrator, ScriptExecutor } from '@heartrule/core-engine';
import type { ILLMProvider } from '@heartrule/core-engine';
import { VolcanoDeepSeekProvider } from '../adapters/outbound/llm/volcano-provider.js';
import { OpenAIProvider } from '../adapters/outbound/llm/openai-provider.js';

/**
 * 依赖注入容器
 * 
 * 单例模式，在应用启动时创建唯一实例
 */
export class DependencyContainer {
  private static instance: DependencyContainer;
  
  private llmProvider: ILLMProvider;
  private llmOrchestrator: LLMOrchestrator;
  private scriptExecutor: ScriptExecutor;

  private constructor() {
    // 1. 根据环境变量选择 LLM Provider
    this.llmProvider = this.createLLMProvider();
    
    // 2. 创建 LLM Orchestrator（核心引擎端口）
    this.llmOrchestrator = new LLMOrchestrator(this.llmProvider);
    
    // 3. 创建 ScriptExecutor（注入依赖）
    this.scriptExecutor = new ScriptExecutor(
      this.llmOrchestrator
      // 其他依赖可以继续注入：actionFactory, monitorOrchestrator等
    );
    
    console.log('[DependencyContainer] ✅ Container initialized:', {
      llmProvider: this.getLLMProviderName(),
    });
  }

  /**
   * 获取容器单例
   */
  static getInstance(): DependencyContainer {
    if (!DependencyContainer.instance) {
      DependencyContainer.instance = new DependencyContainer();
    }
    return DependencyContainer.instance;
  }

  /**
   * 创建 LLM Provider（根据环境配置）
   */
  private createLLMProvider(): ILLMProvider {
    const providerType = process.env.LLM_PROVIDER || 'volcano';
    
    switch (providerType.toLowerCase()) {
      case 'openai':
        return this.createOpenAIProvider();
      
      case 'volcano':
      case 'volcengine':
      default:
        return this.createVolcanoProvider();
    }
  }

  /**
   * 创建 Volcano Provider
   */
  private createVolcanoProvider(): VolcanoDeepSeekProvider {
    const apiKey = process.env.VOLCENGINE_API_KEY || 
                   process.env.VOLCANO_API_KEY || 
                   process.env.ARK_API_KEY || 
                   '';
    const endpointId = process.env.VOLCENGINE_MODEL || 
                       process.env.VOLCANO_ENDPOINT_ID || 
                       'deepseek-v3-250324';
    const baseUrl = process.env.VOLCENGINE_BASE_URL || 
                    process.env.VOLCANO_BASE_URL || 
                    'https://ark.cn-beijing.volces.com/api/v3';

    return new VolcanoDeepSeekProvider(
      {
        model: endpointId,
        temperature: 0.7,
        maxTokens: 2000,
      },
      apiKey,
      endpointId,
      baseUrl
    );
  }

  /**
   * 创建 OpenAI Provider
   */
  private createOpenAIProvider(): OpenAIProvider {
    const apiKey = process.env.OPENAI_API_KEY || '';
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    return new OpenAIProvider(
      {
        model,
        temperature: 0.7,
        maxTokens: 2000,
      },
      apiKey
    );
  }

  /**
   * 获取 LLM Provider 名称（用于日志）
   */
  private getLLMProviderName(): string {
    if (this.llmProvider instanceof VolcanoDeepSeekProvider) {
      return 'Volcano DeepSeek';
    }
    if (this.llmProvider instanceof OpenAIProvider) {
      return 'OpenAI';
    }
    return 'Unknown';
  }

  /**
   * 获取 LLM Orchestrator
   */
  getLLMOrchestrator(): LLMOrchestrator {
    return this.llmOrchestrator;
  }

  /**
   * 获取 ScriptExecutor
   */
  getScriptExecutor(): ScriptExecutor {
    return this.scriptExecutor;
  }
}

/**
 * 导出容器单例
 */
export const container = DependencyContainer.getInstance();
