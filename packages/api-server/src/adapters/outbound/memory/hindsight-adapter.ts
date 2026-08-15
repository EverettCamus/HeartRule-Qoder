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
 * 数据模型校准（见 docs/design/decisions/004-memory-model-calibration.md）：
 * - recall 只映射 world/experience/observation 三类型（SDK 无 opinion fact type）
 * - opinions 由 HeartRule 自建层（reflect + response_schema）产出，Phase 0/1 为空
 * - reflect 用 response_schema 拿结构化输出（决策 2），否则回退 markdown 摘要
 * - retain 透传 metadata 承载来源标注（决策 4）
 */
import type {
  MemoryRepository,
  MemoryContext,
  ReflectionResult,
  MemoryMessage,
  RetainOptions,
  RecallOptions,
  ReflectOptions,
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

  async retain(userId: string, messages: MemoryMessage[], options?: RetainOptions): Promise<void> {
    const content = messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    logger.debug('retain called', {
      userId,
      messageCount: messages.length,
      documentId: options?.documentId,
      metadata: options?.metadata,
    });

    try {
      await this.client.retain(userId, content, {
        tags: options?.tags ?? ['chat'],
        documentId: options?.documentId,
        metadata: options?.metadata,
      });
      logger.debug('retain succeeded', { userId });
    } catch (error: any) {
      logger.error('retain failed', { userId, error: error.message });
    }
  }

  async recall(userId: string, query: string, options?: RecallOptions): Promise<MemoryContext> {
    logger.debug('recall called', { userId, query });

    try {
      const response = await this.client.recall(userId, query, {
        maxTokens: options?.maxTokens ?? 4000,
        types: options?.types as any,
        tags: options?.tags,
        tagsMatch: options?.tagsMatch,
        preferObservations: options?.preferObservations,
        includeSourceFacts: options?.includeSourceFacts,
        budget: options?.budget,
        queryTimestamp: options?.queryTimestamp,
      });

      const worldFacts: MemoryContext['worldFacts'] = [];
      const experiences: MemoryContext['experiences'] = [];
      const observationTexts: string[] = [];

      for (const result of response.results) {
        const entry = {
          content: result.text,
          sourceChannel: result.metadata?.source_channel as
            | 'dialogue'
            | 'clinical_note'
            | 'scale'
            | 'knowledge'
            | undefined,
          sourceCredibility: result.metadata?.source_credibility as
            | 'high'
            | 'medium'
            | 'low'
            | undefined,
          occurredStart: result.occurred_start ?? undefined,
          occurredEnd: result.occurred_end ?? undefined,
        };

        switch (result.type) {
          case 'world':
            worldFacts.push(entry);
            break;
          case 'experience':
            experiences.push(entry);
            break;
          case 'observation':
            observationTexts.push(result.text);
            break;
          default:
            // Without a type, classify by content context — put in experiences as safest default
            experiences.push(entry);
        }
      }

      const context: MemoryContext = {
        worldFacts,
        experiences,
        // opinions 来自 HeartRule 自建层（reflect + response_schema），Phase 0/1 为空
        opinions: [],
        observationSummary: observationTexts.join('\n'),
      };

      logger.debug('recall succeeded', {
        userId,
        worldFacts: worldFacts.length,
        experiences: experiences.length,
        hasSummary: observationTexts.length > 0,
      });

      return context;
    } catch (error: any) {
      logger.error('recall failed', { userId, query, error: error.message });
      return { worldFacts: [], experiences: [], opinions: [], observationSummary: '' };
    }
  }

  async reflect(
    userId: string,
    query?: string,
    options?: ReflectOptions
  ): Promise<ReflectionResult> {
    logger.debug('reflect called', { userId, query, hasSchema: !!options?.responseSchema });

    try {
      const response = await this.client.reflect(
        userId,
        query ?? '回顾所有对话，综合分析来访者的状态、进展和模式',
        {
          responseSchema: options?.responseSchema,
          factTypes: options?.factTypes,
        }
      );

      const structured = response.structured_output as
        | {
            updatedOpinions?: Array<{ content: string; confidence: number }>;
            newObservations?: string[];
            contradictions?: Array<{ factA: string; factB: string; analysis: string }>;
          }
        | undefined;

      logger.debug('reflect succeeded', {
        userId,
        hasStructured: !!structured,
      });

      return {
        summary: response.text,
        ...(structured?.updatedOpinions && { updatedOpinions: structured.updatedOpinions }),
        ...(structured?.newObservations && { newObservations: structured.newObservations }),
        ...(structured?.contradictions && { contradictions: structured.contradictions }),
      };
    } catch (error: any) {
      logger.error('reflect failed', { userId, error: error.message });
      return { summary: '' };
    }
  }
}
