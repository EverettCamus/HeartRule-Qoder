/**
 * MemoryRepository Domain Port
 *
 * @remarks
 * DDD 六边形架构：领域端口定义
 * 定义核心引擎对跨会话记忆的依赖接口
 *
 * 职责分离：
 * - 本文件：定义接口契约（Port）—— 领域层只关心"需要记忆能力"
 * - api-server/adapters/：提供具体实现（HindsightMemoryAdapter）
 *
 * 数据模型校准（见 docs/design/decisions/004-memory-model-calibration.md ·
 * docs/design/decisions/005-drop-opinions-domain-concept.md）：
 * - World/Experience/Observation 三类 fact type 均来自 Hindsight recall
 * - 005 起领域模型不再有 opinions 概念（上游 2026 年初已删除该类型）——归纳判断由
 *   observation 承载（带 proofCount/sourceFactIds），案例公式化由 mental model 承载（适配器层），
 *   数值 confidence 不持久化
 * - 来源/时间元数据通过 retain 的 metadata 写入、recall 读回（决策 4）
 */

/**
 * 跨越 retain 边界的消息结构
 */
export interface MemoryMessage {
  role: string;
  content: string;
  timestamp?: Date;
}

/**
 * 单条记忆（含来源/时间元数据，决策 4）
 *
 * 由 retain 的 `metadata` 写入、recall 从 `RecallResult.metadata`/时间字段读回。
 */
export interface MemoryEntry {
  content: string;
  /** 来源渠道 —— 咨询领域标记，供证据溯源（类型Ⅳ） */
  sourceChannel?: 'dialogue' | 'clinical_note' | 'scale' | 'knowledge';
  /** 来源可信度 */
  sourceCredibility?: 'high' | 'medium' | 'low';
  /** 事件发生时间（ISO）—— 来自 RecallResult.occurred_start */
  occurredStart?: string;
  /** 事件结束时间（ISO）—— 来自 RecallResult.occurred_end */
  occurredEnd?: string;
}

/**
 * observation 的结构化补充（ADR 005 决策 1/3）—— 证据强度客观信号替代数值 confidence
 */
export interface ObservationEntry extends MemoryEntry {
  /** 上游 proof count —— 支撑该观察的证据条数（recall 结果 proofCount 透传） */
  proofCount?: number;
  /** 来源事实 id（v0.9.1 includeSourceFacts）—— 推论与证据可互查（原则 3） */
  sourceFactIds?: string[];
}

/**
 * 从会谈记忆中召回的上下文
 *
 * @remarks
 * 三类字段均来自 Hindsight recall（world/experience/observation）；
 * 案例公式化（咨询师工作假设）由 Hindsight mental model 承载，不落本端口
 * （ADR 005 决策 2 —— 适配器/应用层将其内容渲染进 {{memory_context}}）。
 */
export interface MemoryContext {
  /** 确定的客观事实（诊断/案由/用药/证据）—— recall type=world */
  worldFacts: MemoryEntry[];
  /** 来访者/当事人亲历的第一人称事件 —— recall type=experience */
  experiences: MemoryEntry[];
  /** 原子信念/归纳判断 —— recall type=observation，含证据溯源 */
  observations: ObservationEntry[];
}

/**
 * reflect() 操作的返回值
 *
 * @remarks
 * 结构化字段来自 reflect 的 `response_schema → structured_output`（决策 2），
 * 非 SDK 原生 markdown。observation 综合与 mental model 演化由 Hindsight 自动完成
 * （consolidate / refreshAfterConsolidation），不落在 reflect 返回值中（ADR 005 决策 2）。
 * Phase 0 简化只填充 `summary`；newObservations / contradictions 是 Phase 4 的完整形态。
 */
export interface ReflectionResult {
  /** 反思摘要（markdown） */
  summary: string;
  /** 反思中新形成的综合观察（Phase 4） */
  newObservations?: string[];
  /** 矛盾检测结果（Phase 4） */
  contradictions?: Array<{ factA: string; factB: string; analysis: string }>;
}

/**
 * retain() 的可选参数
 */
export interface RetainOptions {
  /** 关联到特定 Action 的标识符 */
  documentId?: string;
  /** 记忆标签（用于 Hindsight tag 过滤） */
  tags?: string[];
  /** 来源标注元数据（决策 4）：source_channel / source_credibility 等，透传到 SDK */
  metadata?: Record<string, string>;
}

/**
 * recall() 的可选参数
 *
 * @remarks
 * 按 Hindsight v0.9.1 对齐（决策 5）：领域特定性由 query 构造承载，
 * options 按需从端口透传。未全部暴露 tagGroups/minScores 等复杂项。
 */
export interface RecallOptions {
  /** 召回结果的 token 上限 */
  maxTokens?: number;
  /** 事实类型筛选（recall 仅三类 fact type，无 opinion —— ADR 004/005） */
  types?: Array<'world' | 'experience' | 'observation'>;
  /** 按标签过滤记忆 */
  tags?: string[];
  /** 标签匹配语义（v0.9.1） */
  tagsMatch?: 'any' | 'all' | 'any_strict' | 'all_strict' | 'exact';
  /** observation 优先，压制其来源 raw fact（v0.9.1） */
  preferObservations?: boolean;
  /** 返回结果附带 source_fact_ids，支撑证据溯源（v0.9.1） */
  includeSourceFacts?: boolean;
  /** 语义化预算档位（v0.9.1，与 maxTokens 互补） */
  budget?: 'low' | 'mid' | 'high';
  /** 查询时时间锚点（ISO 日期），recency 评分基准（v0.9.1，决策 3） */
  queryTimestamp?: string;
}

/**
 * reflect() 的可选参数
 */
export interface ReflectOptions {
  /** JSON Schema —— 结构化输出契约（决策 2），透传到 SDK response_schema */
  responseSchema?: Record<string, unknown>;
  /** reflect 检索的 fact type 过滤（v0.9.1） */
  factTypes?: Array<'world' | 'experience' | 'observation'>;
}

/**
 * 记忆仓储领域端口
 *
 * @remarks
 * 定义跨会话积累对来访者理解所需的能力：
 * - retain: 从对话中记住新信息
 * - recall: 按需检索已有记忆
 * - reflect: 回顾综合形成新领悟
 */
export interface MemoryRepository {
  /**
   * 记住 —— 将对话消息存入记忆
   *
   * @param userId - 用户标识
   * @param messages - 待存入的消息列表
   * @param options - 可选参数（documentId, tags, metadata）
   */
  retain(userId: string, messages: MemoryMessage[], options?: RetainOptions): Promise<void>;

  /**
   * 召回 —— 按查询检索相关记忆
   *
   * @param userId - 用户标识
   * @param query - 自然语言查询（如"用户的核心信念"）
   * @param options - 可选参数（types, tags, tagsMatch, budget, queryTimestamp 等）
   * @returns 结构化的记忆上下文
   */
  recall(userId: string, query: string, options?: RecallOptions): Promise<MemoryContext>;

  /**
   * 反思 —— 回顾已有记忆，综合形成新观察
   *
   * @param userId - 用户标识
   * @param query - 可选的反思方向
   * @param options - 可选参数（responseSchema 结构化产出）
   * @returns 反思结果（summary + 结构化字段）
   */
  reflect(userId: string, query?: string, options?: ReflectOptions): Promise<ReflectionResult>;
}
