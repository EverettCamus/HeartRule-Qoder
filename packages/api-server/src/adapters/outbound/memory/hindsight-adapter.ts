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
 * 数据模型校准（见 docs/design/decisions/004-memory-model-calibration.md ·
 * docs/design/decisions/005-drop-opinions-domain-concept.md）：
 * - recall 只映射 world/experience/observation 三类型（SDK 无 opinion fact type）
 * - 005 起领域模型不再有 opinions 概念：observation 保结构映射为数组（附 source_fact_ids），
 *   案例公式化由 mental model 承载（本适配器层，Phase 2+），数值 confidence 不持久化
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
      const observations: MemoryContext['observations'] = [];

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
            // 保结构映射（ADR 005 决策 1）：不折叠成单字符串，附来源事实 id 供证据溯源（原则 3）
            observations.push({
              ...entry,
              sourceFactIds: result.source_fact_ids ?? undefined,
              // 注：SDK v0.9.1 recall 结果项未暴露 proof_count（consolidate 存储侧字段），
              // proofCount 暂不填充；证据充分性可由 sourceFactIds 长度近似判断
            });
            break;
          default:
            // Without a type, classify by content context — put in experiences as safest default
            experiences.push(entry);
        }
      }

      const context: MemoryContext = {
        worldFacts,
        experiences,
        observations,
      };

      logger.debug('recall succeeded', {
        userId,
        worldFacts: worldFacts.length,
        experiences: experiences.length,
        observations: observations.length,
      });

      return context;
    } catch (error: any) {
      logger.error('recall failed', { userId, query, error: error.message });
      return { worldFacts: [], experiences: [], observations: [] };
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
        ...(structured?.newObservations && { newObservations: structured.newObservations }),
        ...(structured?.contradictions && { contradictions: structured.contradictions }),
      };
    } catch (error: any) {
      logger.error('reflect failed', { userId, error: error.message });
      return { summary: '' };
    }
  }
}
