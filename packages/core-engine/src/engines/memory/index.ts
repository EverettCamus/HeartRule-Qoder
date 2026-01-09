/**
 * 记忆引擎（占位）
 * 
 * 待实现：
 * - 短期记忆（Redis）
 * - 中期记忆（PostgreSQL）
 * - 长期记忆（向量检索）
 */

export interface MemoryItem {
  id: string;
  content: string;
  importance: number;
}

export class MemoryEngine {
  async store(_item: MemoryItem): Promise<void> {
    // TODO: 实现
  }

  async retrieve(_query: string): Promise<MemoryItem[]> {
    // TODO: 实现
    return [];
  }
}
