import type {
  MemoryRepository,
  MemoryContext,
  ReflectionResult,
  MemoryMessage,
  RetainOptions,
  RecallOptions,
  ReflectOptions,
} from '../../src/domain/ports/memory-repository.port.js';

/**
 * FakeMemoryRepository — Phase 0 纯数据桶
 *
 * retain() 原样存消息到内存 Map
 * recall() 返回预填充的 MemoryContext
 * reflect() no-op，记录调用计数
 */
export class FakeMemoryRepository implements MemoryRepository {
  private storage: Map<string, MemoryMessage[]> = new Map();
  public reflectCallCount = 0;

  /** 预填充数据：支持在测试中预设特定 userId 的 recall 结果 */
  private prefillData: Map<string, MemoryContext> = new Map();

  async retain(userId: string, messages: MemoryMessage[], _options?: RetainOptions): Promise<void> {
    const existing = this.storage.get(userId) || [];
    this.storage.set(userId, [...existing, ...messages]);
  }

  async recall(userId: string, _query: string, _options?: RecallOptions): Promise<MemoryContext> {
    const prefill = this.prefillData.get(userId);
    if (prefill) return prefill;

    return {
      worldFacts: [],
      experiences: [],
      opinions: [],
      observationSummary: '',
    };
  }

  async reflect(
    _userId: string,
    _query?: string,
    _options?: ReflectOptions
  ): Promise<ReflectionResult> {
    this.reflectCallCount++;
    return { summary: '' };
  }

  /** 预设某个 userId 的召回结果 */
  setRecallData(userId: string, context: MemoryContext): void {
    this.prefillData.set(userId, context);
  }

  /** 获取已存储的消息（用于测试验证） */
  getStoredMessages(userId: string): MemoryMessage[] {
    return this.storage.get(userId) || [];
  }
}
