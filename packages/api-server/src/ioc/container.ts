/**
 * Dependency Injection Container
 *
 * @remarks
 * DDD 六边形架构：依赖注入容器
 * 负责在应用启动时组装依赖关系，实现六边形架构的端口-适配器模式
 *
 * 职责：
 * - 根据环境配置选择具体的适配器实现
 * - 组装核心引擎的依赖（LLM、ScriptExecutor等）
 * - 提供单例服务获取接口
 *
 * 依赖流向：
 * Container → Adapters (outbound) → Core Engine (through ports)
 */

import { LLMOrchestrator, ScriptExecutor } from '@heartrule/core-engine';
import type { ILLMProvider, MemoryRepository } from '@heartrule/core-engine';

import { DeepSeekProvider } from '../adapters/outbound/llm/deepseek-provider.js';
import { OpenAIProvider } from '../adapters/outbound/llm/openai-provider.js';
import { VolcanoDeepSeekProvider } from '../adapters/outbound/llm/volcano-provider.js';
import { HindsightMemoryAdapter } from '../adapters/outbound/memory/hindsight-adapter.js';

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
  private memoryRepository: MemoryRepository;

  private constructor() {
    // 1. 根据环境变量选择 LLM Provider
    this.llmProvider = this.createLLMProvider();

    // 2. 创建 LLM Orchestrator（核心引擎端口）
    const providerName = process.env.LLM_PROVIDER || 'volcano';
    this.llmOrchestrator = new LLMOrchestrator(this.llmProvider, providerName.toLowerCase());

    // Also register alias names for the frontend provider selector
    if (providerName.toLowerCase() === 'volcano' || providerName.toLowerCase() === 'volcengine') {
      this.llmOrchestrator.registerProvider('volcano', this.llmProvider);
      this.llmOrchestrator.registerProvider('deepseek', this.llmProvider);
    } else if (providerName.toLowerCase() === 'deepseek') {
      this.llmOrchestrator.registerProvider('deepseek', this.llmProvider);
    } else if (providerName.toLowerCase() === 'openai') {
      this.llmOrchestrator.registerProvider('openai', this.llmProvider);
    }

    // 3. 创建 ScriptExecutor（注入 LLMOrchestrator）
    this.scriptExecutor = new ScriptExecutor(this.llmOrchestrator);

    // 4. 创建 MemoryRepository (Hindsight adapter)
    this.memoryRepository = new HindsightMemoryAdapter();

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
    const normalizedType = providerType.toLowerCase();

    switch (normalizedType) {
      case 'openai':
        return this.createOpenAIProvider();

      case 'deepseek':
        return this.createDeepSeekProvider();

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
    const apiKey =
      process.env.VOLCENGINE_API_KEY ||
      process.env.VOLCANO_API_KEY ||
      process.env.ARK_API_KEY ||
      '';
    const endpointId =
      process.env.VOLCENGINE_MODEL || process.env.VOLCANO_ENDPOINT_ID || 'deepseek-v3-250324';
    const baseUrl =
      process.env.VOLCENGINE_BASE_URL ||
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
   * 创建 DeepSeek Provider
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
   * 创建 DeepSeek Provider
   */
  private createDeepSeekProvider(): DeepSeekProvider {
    const apiKey = process.env.DEEPSEEK_API_KEY || '';
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

    return new DeepSeekProvider(
      {
        model,
        temperature: 0.7,
        maxTokens: 2000,
      },
      apiKey,
      model,
      baseUrl
    );
  }

  /**
   * 获取 LLM Provider 名称（用于日志）
   */
  private getLLMProviderName(): string {
    const providerType = process.env.LLM_PROVIDER || 'volcano';
    if (providerType === 'deepseek') {
      return 'DeepSeek';
    }
    if (this.llmProvider instanceof VolcanoDeepSeekProvider) {
      return 'Volcano DeepSeek';
    }
    if (this.llmProvider instanceof OpenAIProvider) {
      return 'OpenAI';
    }
    if (this.llmProvider instanceof DeepSeekProvider) {
      return 'DeepSeek';
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
   * 获取 ScriptExecutor（单例）
   *
   * SessionOrchestrator 通过构造函数可选注入此依赖，
   * 方便单元测试 mock，生产代码默认使用此容器提供的单例。
   */
  getScriptExecutor(): ScriptExecutor {
    return this.scriptExecutor;
  }

  /**
   * 获取 MemoryRepository（单例）
   */
  getMemoryRepository(): MemoryRepository {
    return this.memoryRepository;
  }
}

/**
 * 导出容器单例
 */
export const container = DependencyContainer.getInstance();
