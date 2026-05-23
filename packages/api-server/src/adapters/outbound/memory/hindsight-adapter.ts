/**
 * HindsightMemoryAdapter — 基础设施层适配器
 *
 * 实现 MemoryRepository 领域端口，封装 Hindsight TypeScript SDK。
 *
 * 领域中立设计：
 * - 适配器不内置任何咨询领域的提取/反思提示词
 * - 使用 Hindsight 的领域中立默认值（提取事实、识别实体、时间信息）
 * - 领域特定的提取维度由 Phase 2+ 的 recall 查询内容体现
 *
 * 四网络映射：RecallResult.type → worldFacts/experiences/opinions/observationSummary
 */
import type {
  MemoryRepository,
  MemoryContext,
  ReflectionResult,
  MemoryMessage,
} from '@heartrule/core-engine';
import { createLogger } from '@heartrule/core-engine';
import { HindsightClient } from '@vectorize-io/hindsight-client';

const logger = createLogger('HindsightAdapter');

const DEFAULT_HINDSIGHT_URL = 'http://localhost:8888';

export class HindsightMemoryAdapter implements MemoryRepository {
  private client: HindsightClient;

  constructor(baseUrl?: string) {
    const url = baseUrl || process.env.HINDSIGHT_URL || DEFAULT_HINDSIGHT_URL;
    this.client = new HindsightClient({ baseUrl: url });
    logger.info('Initialized', { baseUrl: url });
  }

  async retain(userId: string, messages: MemoryMessage[]): Promise<void> {
    const content = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    logger.debug('retain called', { userId, messageCount: messages.length });

    try {
      await this.client.retain(userId, content, {
        tags: ['chat'],
      });
      logger.debug('retain succeeded', { userId });
    } catch (error: any) {
      logger.error('retain failed', { userId, error: error.message });
    }
  }

  async recall(userId: string, query: string): Promise<MemoryContext> {
    logger.debug('recall called', { userId, query });

    try {
      const response = await this.client.recall(userId, query, {
        maxTokens: 4000,
      });

      const worldFacts: Array<{ content: string }> = [];
      const experiences: Array<{ content: string }> = [];
      const opinions: Array<{ content: string; confidence: number }> = [];
      const observationTexts: string[] = [];

      for (const result of response.results) {
        switch (result.type) {
          case 'world':
            worldFacts.push({ content: result.text });
            break;
          case 'experience':
            experiences.push({ content: result.text });
            break;
          case 'opinion':
            opinions.push({ content: result.text, confidence: 0.5 });
            break;
          case 'observation':
            observationTexts.push(result.text);
            break;
          default:
            // Without a type, classify by content context — put in experiences as safest default
            experiences.push({ content: result.text });
        }
      }

      const context: MemoryContext = {
        worldFacts,
        experiences,
        opinions,
        observationSummary: observationTexts.join('\n'),
      };

      logger.debug('recall succeeded', {
        userId,
        worldFacts: worldFacts.length,
        experiences: experiences.length,
        opinions: opinions.length,
        hasSummary: observationTexts.length > 0,
      });

      return context;
    } catch (error: any) {
      logger.error('recall failed', { userId, query, error: error.message });
      return { worldFacts: [], experiences: [], opinions: [], observationSummary: '' };
    }
  }

  async reflect(userId: string): Promise<ReflectionResult> {
    logger.debug('reflect called', { userId });

    try {
      const response = await this.client.reflect(
        userId,
        '回顾所有对话，综合分析来访者的状态、进展和模式'
      );

      logger.debug('reflect succeeded', { userId });

      return { summary: response.text };
    } catch (error: any) {
      logger.error('reflect failed', { userId, error: error.message });
      return { summary: '' };
    }
  }
}
