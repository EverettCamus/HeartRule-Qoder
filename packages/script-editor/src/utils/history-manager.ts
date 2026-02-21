/**
 * 全局编辑历史管理器
 * 支持跨文件的 undo/redo 操作和焦点导航
 */

export interface FocusPath {
  phaseIndex?: number;
  topicIndex?: number;
  actionIndex?: number;
  type: 'phase' | 'topic' | 'action';
}

export interface PhaseWithTopics {
  phase_id: string;
  phase_name?: string;
  description?: string;
  topics: TopicWithActions[];
}

export interface TopicWithActions {
  topic_id: string;
  topic_name?: string;
  description?: string;
  localVariables?: Array<{ name: string; type?: string; description?: string }>;
  actions: any[];
}

export interface HistoryEntry {
  // 快照数据
  fileId: string; // 所属文件ID
  fileName: string; // 文件名（用于显示）
  beforePhases: PhaseWithTopics[]; // 操作前的数据快照
  afterPhases: PhaseWithTopics[]; // 操作后的数据快照

  // 焦点信息
  beforeFocusPath: FocusPath | null; // 操作前的焦点
  afterFocusPath: FocusPath | null; // 操作后的焦点

  // 操作元数据
  operation: string; // 操作描述，如 "添加 Action" "修改 Phase"
  timestamp: number; // 时间戳
}

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private readonly maxSize: number = 100;
  private isUndoRedoActive: boolean = false;

  /**
   * 推入新的历史记录
   */
  push(entry: HistoryEntry): void {
    console.log('\n========== [HistoryManager.push] 开始 ==========');
    console.log(`[HistoryManager] isUndoRedoActive: ${this.isUndoRedoActive}`);

    // 如果正在执行 undo/redo，不推入历史
    if (this.isUndoRedoActive) {
      console.log('[HistoryManager] ⚠️ 正在执行 undo/redo，忽略此次 push');
      console.log('========== [HistoryManager.push] 结束 ==========\n');
      return;
    }

    console.log(`[HistoryManager] 📝 操作: ${entry.operation}`);
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 before phases 数量: ${entry.beforePhases.length}`);
    console.log(`[HistoryManager] 📊 after phases 数量: ${entry.afterPhases.length}`);

    // 计算 Action 总数
    const beforeActions = entry.beforePhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    const afterActions = entry.afterPhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    console.log(
      `[HistoryManager] 🎯 Before Actions: ${beforeActions}, After Actions: ${afterActions}`
    );

    console.log(`[HistoryManager] 🎯 Before 焦点:`, entry.beforeFocusPath);
    console.log(`[HistoryManager] 🎯 After 焦点:`, entry.afterFocusPath);
    console.log(`[HistoryManager] 📅 时间戳: ${new Date().toLocaleTimeString()}`);

    // 截断未来分支（如果当前不在最新状态）
    if (this.currentIndex < this.entries.length - 1) {
      const truncated = this.entries.length - 1 - this.currentIndex;
      console.log(`[HistoryManager] ✂️ 截断未来分支: 删除 ${truncated} 条记录`);
      this.entries = this.entries.slice(0, this.currentIndex + 1);
    }

    // 添加新记录
    this.entries.push({
      ...entry,
      timestamp: Date.now(),
      // 深拷贝数据，避免引用问题
      beforePhases: JSON.parse(JSON.stringify(entry.beforePhases)),
      afterPhases: JSON.parse(JSON.stringify(entry.afterPhases)),
    });

    // 限制历史栈大小
    if (this.entries.length > this.maxSize) {
      console.log(`[HistoryManager] ♻️ 超出最大限制，删除最旧记录`);
      this.entries = this.entries.slice(this.entries.length - this.maxSize);
    }

    // 更新索引到最新
    this.currentIndex = this.entries.length - 1;

    console.log(`[HistoryManager] ✅ 推入成功`);
    console.log(
      `[HistoryManager] 📊 当前总数: ${this.entries.length}, 当前索引: ${this.currentIndex}`
    );
    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const afterActions = e.afterPhases.reduce((sum, phase) => {
        return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
      }, 0);
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation} (${afterActions} Actions)${marker}`);
    });
    console.log('========== [HistoryManager.push] 结束 ==========\n');
  }

  /**
   * 撤销操作
   * 返回当前操作记录，使用其 beforePhases 恢复到操作前状态
   * @returns 当前操作记录（包含 before/after），如果无法撤销返回 null
   */
  undo(): HistoryEntry | null {
    console.log('\n========== [HistoryManager.undo] 开始 ==========');
    console.log(`[HistoryManager] 当前索引: ${this.currentIndex}, 总数: ${this.entries.length}`);

    if (!this.canUndo()) {
      console.log('[HistoryManager] ⚠️ 无法撤销，已是最早状态');
      console.log('========== [HistoryManager.undo] 结束 ==========\n');
      return null;
    }

    this.isUndoRedoActive = true;

    // 关键修复：undo 时返回「当前操作」的记录，让调用方用 beforePhases 恢复
    const entry = this.entries[this.currentIndex];

    // 计算 Action 总数
    const beforeActions = entry.beforePhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    const afterActions = entry.afterPhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);

    console.log(`[HistoryManager] ⬅️ 撤销操作: "${entry.operation}"`);
    console.log(
      `[HistoryManager] 📊 Before Actions: ${beforeActions}, After Actions: ${afterActions}`
    );
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 将使用 beforePhases 恢复`);

    // 移动索引（下次 undo 会轮到前一条）
    this.currentIndex -= 1;
    console.log(`[HistoryManager] 📊 索引变化: ${this.currentIndex + 1} -> ${this.currentIndex}`);

    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const afterActions = e.afterPhases.reduce((sum, phase) => {
        return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
      }, 0);
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation} (${afterActions} Actions)${marker}`);
    });
    console.log('========== [HistoryManager.undo] 结束 ==========\n');

    // 返回深拷贝
    return {
      ...entry,
      beforePhases: JSON.parse(JSON.stringify(entry.beforePhases)),
      afterPhases: JSON.parse(JSON.stringify(entry.afterPhases)),
    };
  }

  /**
   * 重做操作
   * 返回下一个操作记录，使用其 afterPhases 恢复到操作后状态
   * @returns 下一个操作记录（包含 before/after），如果无法重做则返回 null
   */
  redo(): HistoryEntry | null {
    console.log('\n========== [HistoryManager.redo] 开始 ==========');
    console.log(`[HistoryManager] 当前索引: ${this.currentIndex}, 总数: ${this.entries.length}`);

    if (!this.canRedo()) {
      console.log('[HistoryManager] ⚠️ 无法重做，已是最新状态');
      console.log('========== [HistoryManager.redo] 结束 ==========\n');
      return null;
    }

    this.isUndoRedoActive = true;

    // redo 应该恢复到"下一个状态"，即 currentIndex + 1
    const targetIndex = this.currentIndex + 1;
    const entry = this.entries[targetIndex];

    // 计算 Action 总数
    const beforeActions = entry.beforePhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    const afterActions = entry.afterPhases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);

    console.log(`[HistoryManager] ➡️ 重做操作: "${entry.operation}"`);
    console.log(
      `[HistoryManager] 📊 Before Actions: ${beforeActions}, After Actions: ${afterActions}`
    );
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 将使用 afterPhases 恢复`);
    console.log(`[HistoryManager] 📊 索引变化: ${this.currentIndex} -> ${targetIndex}`);

    // 移动索引
    this.currentIndex = targetIndex;

    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const afterActions = e.afterPhases.reduce((sum, phase) => {
        return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
      }, 0);
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation} (${afterActions} Actions)${marker}`);
    });
    console.log('========== [HistoryManager.redo] 结束 ==========\n');

    // 返回深拷贝
    return {
      ...entry,
      beforePhases: JSON.parse(JSON.stringify(entry.beforePhases)),
      afterPhases: JSON.parse(JSON.stringify(entry.afterPhases)),
    };
  }

  /**
   * 重置 undo/redo 标记
   * 在 undo/redo 操作完成后调用
   */
  resetUndoRedoFlag(): void {
    this.isUndoRedoActive = false;
  }

  /**
   * 获取所有历史记录（只读）
   */
  getEntries(): readonly HistoryEntry[] {
    return this.entries;
  }

  /**
   * 检查是否可以撤销
   * 修复逻辑：不允许撤销到空状态（beforePhases.length === 0）
   * 因为空状态会导致Schema验证失败
   */
  canUndo(): boolean {
    if (this.currentIndex < 0) {
      return false;
    }

    // 检查当前操作的beforePhases是否为空
    const currentEntry = this.entries[this.currentIndex];
    if (currentEntry && currentEntry.beforePhases.length === 0) {
      // 不允许撤销到空状态（会导致phases: []，Schema验证失败）
      return false;
    }

    return true;
  }

  /**
   * 检查是否可以重做
   */
  canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  /**
   * 获取当前历史记录
   */
  getCurrent(): HistoryEntry | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.entries.length) {
      return this.entries[this.currentIndex];
    }
    return null;
  }

  /**
   * 获取历史记录数量
   */
  getSize(): number {
    return this.entries.length;
  }

  /**
   * 获取当前索引
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 清空历史记录（例如关闭工程时）
   */
  clear(): void {
    console.log('\n========== [HistoryManager.clear] 开始 ==========');
    console.log(
      `[HistoryManager] 🗑️ 清空前: ${this.entries.length} 条记录，当前索引: ${this.currentIndex}`
    );

    if (this.entries.length > 0) {
      console.log('[HistoryManager] 📚 历史栈内容:');
      this.entries.forEach((e, i) => {
        console.log(`  [${i}] ${e.fileName}: ${e.operation}`);
      });
    }

    this.entries = [];
    this.currentIndex = -1;
    this.isUndoRedoActive = false;

    console.log('[HistoryManager] ✅ 已清空历史栈');
    console.log('========== [HistoryManager.clear] 结束 ==========\n');
  }

  /**
   * 获取历史记录摘要（用于调试或显示）
   */
  getSummary(): Array<{ index: number; operation: string; fileName: string; timestamp: number }> {
    return this.entries.map((entry, index) => ({
      index,
      operation: entry.operation,
      fileName: entry.fileName,
      timestamp: entry.timestamp,
    }));
  }

  /**
   * 检查是否正在执行 undo/redo
   */
  isInUndoRedo(): boolean {
    return this.isUndoRedoActive;
  }
}

// 导出单例实例
export const globalHistoryManager = new HistoryManager();
