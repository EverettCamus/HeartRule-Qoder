/**
 * MemoryRepository Domain Port
 *
 * @remarks
 * DDD 六边形架构：领域端口定义
 * 定义核心引擎对跨会话记忆的依赖接口
 *
 * 职责分离：
 * - 本文件：定义接口契约（Port）—— 领域层只关心"需要记忆能力"
 * - api-server/adapters/：未来提供具体实现（HindsightMemoryAdapter）
 *
 * 四网络模型 (World/Experience/Opinion/Observation):
 * - 区分事实与判断、证据与推论，是跨咨询领域的通用认知抽象
 * - Phase 0 子类型使用轻量占位，Phase 1 集成 Hindsight 时定型完整字段
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
 * 从会谈记忆中召回的上下文
 *
 * @remarks
 * 四字段对应 Hindsight 四网络：World→worldFacts, Experience→experiences,
 * Opinion→opinions, Observation→observationSummary
 */
export interface MemoryContext {
  worldFacts: Array<{ content: string }>;
  experiences: Array<{ content: string }>;
  opinions: Array<{ content: string; confidence: number }>;
  observationSummary: string;
}

/**
 * reflect() 操作的返回值
 *
 * @remarks
 * Phase 0 使用简化结构。Phase 4 矛盾检测时需要完整的
 * updatedOpinions / contradictions 字段
 */
export interface ReflectionResult {
  summary: string;
}

/**
 * retain() 的可选参数
 */
export interface RetainOptions {
  /** 关联到特定 Action 的标识符 */
  documentId?: string;
  /** 记忆标签（用于 Hindsight tag 过滤） */
  tags?: string[];
}

/**
 * recall() 的可选参数
 */
export interface RecallOptions {
  /** 召回结果的 token 上限 */
  maxTokens?: number;
  /** 事实类型筛选 */
  types?: Array<'world' | 'experience' | 'observation'>;
  /** 按标签过滤记忆 */
  tags?: string[];
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
   * @param _options - 可选参数（documentId, tags）
   */
  retain(userId: string, messages: MemoryMessage[], _options?: RetainOptions): Promise<void>;

  /**
   * 召回 —— 按查询检索相关记忆
   *
   * @param userId - 用户标识
   * @param query - 自然语言查询（如"用户的核心信念"）
   * @param _options - 可选参数（maxTokens, types, tags）
   * @returns 结构化的记忆上下文
   */
  recall(userId: string, query: string, _options?: RecallOptions): Promise<MemoryContext>;

  /**
   * 反思 —— 回顾已有记忆，综合形成新观察
   *
   * @param userId - 用户标识
   * @param query - 可选的反思方向
   * @returns 反思结果摘要
   */
  reflect(userId: string, query?: string): Promise<ReflectionResult>;
}
