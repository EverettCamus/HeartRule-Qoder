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
  fileId: string;                    // 所属文件ID
  fileName: string;                  // 文件名（用于显示）
  phases: PhaseWithTopics[];         // 数据快照
  
  // 焦点信息
  focusPath: FocusPath | null;
  
  // 操作元数据
  operation: string;                 // 操作描述，如 "添加 Action" "修改 Phase"
  timestamp: number;                 // 时间戳
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
    console.log('\n========== [HistoryManager.push] 开始 ==========')
    console.log(`[HistoryManager] isUndoRedoActive: ${this.isUndoRedoActive}`);
    
    // 如果正在执行 undo/redo，不推入历史
    if (this.isUndoRedoActive) {
      console.log('[HistoryManager] ⚠️ 正在执行 undo/redo，忽略此次 push');
      console.log('========== [HistoryManager.push] 结束 ==========\n');
      return;
    }

    console.log(`[HistoryManager] 📝 操作: ${entry.operation}`);
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 phases 数量: ${entry.phases.length}`);
    
    // 计算 Action 总数
    const totalActions = entry.phases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    console.log(`[HistoryManager] 🎯 Action 总数: ${totalActions}`);
    
    console.log(`[HistoryManager] 🎯 焦点:`, entry.focusPath);
    console.log(`[HistoryManager] 📅 时间戳: ${new Date().toLocaleTimeString()}`);
    
    // 输出详细结构
    entry.phases.forEach((phase, pi) => {
      phase.topics.forEach((topic, ti) => {
        console.log(`[HistoryManager]   Phase[${pi}].Topic[${ti}]: ${topic.actions.length} Actions`);
      });
    });

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
      phases: JSON.parse(JSON.stringify(entry.phases)),
    });

    // 限制历史栈大小
    if (this.entries.length > this.maxSize) {
      console.log(`[HistoryManager] ♻️ 超出最大限制，删除最旧记录`);
      this.entries = this.entries.slice(this.entries.length - this.maxSize);
    }

    // 更新索引到最新
    this.currentIndex = this.entries.length - 1;
    
    console.log(`[HistoryManager] ✅ 推入成功`);
    console.log(`[HistoryManager] 📊 当前总数: ${this.entries.length}, 当前索引: ${this.currentIndex}`);
    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const totalActions = e.phases.reduce((sum, phase) => {
        return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
      }, 0);
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation} (${totalActions} Actions)${marker}`);
    });
    console.log('========== [HistoryManager.push] 结束 ==========\n');
  }

  /**
   * 撤销操作
   * 返回到上一个状态（currentIndex - 1）
   * @returns 上一个历史记录，如果无法撤销返回 null
   */
  undo(): HistoryEntry | null {
    console.log('\n========== [HistoryManager.undo] 开始 ==========')
    console.log(`[HistoryManager] 当前索引: ${this.currentIndex}, 总数: ${this.entries.length}`);
    console.log(`[HistoryManager] 📚 当前状态: ${this.entries[this.currentIndex]?.operation}`);
      
    if (!this.canUndo()) {
      console.log('[HistoryManager] ⚠️ 无法撤销，已是最早状态');
      console.log('========== [HistoryManager.undo] 结束 ==========\n');
      return null;
    }
  
    this.isUndoRedoActive = true;
      
    // currentIndex 指向“当前已应用的操作”
    // undo 时返回 entries[currentIndex - 1]，然后 currentIndex--
    const targetIndex = this.currentIndex - 1;
    const entry = this.entries[targetIndex];
    
    // 计算 Action 总数
    const currentActions = this.entries[this.currentIndex].phases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
    const targetActions = entry.phases.reduce((sum, phase) => {
      return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
    }, 0);
        
    console.log(`[HistoryManager] ⬅️ 撤销操作: "${this.entries[this.currentIndex].operation}" (${currentActions} Actions)`);
    console.log(`[HistoryManager] ➡️ 恢复到: "${entry.operation}" (${targetActions} Actions)`);
    console.log(`[HistoryManager] 📊 索引变化: ${this.currentIndex} -> ${targetIndex}`);
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 phases 长度: ${entry.phases.length}`);
        
    // 移动索引
    this.currentIndex = targetIndex;
        
    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const totalActions = e.phases.reduce((sum, phase) => {
        return sum + phase.topics.reduce((topicSum, topic) => topicSum + topic.actions.length, 0);
      }, 0);
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation} (${totalActions} Actions)${marker}`);
    });
    console.log('========== [HistoryManager.undo] 结束 ==========\n');
        
    // 返回深拷贝
    return {
      ...entry,
      phases: JSON.parse(JSON.stringify(entry.phases)),
    };
  }

  /**
   * 重做操作
   * 恢复到下一个状态（currentIndex + 1）
   * @returns 下一个历史记录，如果无法重做则返回 null
   */
  redo(): HistoryEntry | null {
    console.log('\n========== [HistoryManager.redo] 开始 ==========')
    console.log(`[HistoryManager] 当前索引: ${this.currentIndex}, 总数: ${this.entries.length}`);
    console.log(`[HistoryManager] 📚 当前状态: ${this.entries[this.currentIndex]?.operation}`);
    
    if (!this.canRedo()) {
      console.log('[HistoryManager] ⚠️ 无法重做，已是最新状态');
      console.log('========== [HistoryManager.redo] 结束 ==========\n');
      return null;
    }

    this.isUndoRedoActive = true;
    
    // redo 应该恢复到“下一个状态”，即 currentIndex + 1
    const targetIndex = this.currentIndex + 1;
    const entry = this.entries[targetIndex];
    
    console.log(`[HistoryManager] ➡️ 重做操作: “${entry.operation}”`);
    console.log(`[HistoryManager] 📊 索引变化: ${this.currentIndex} -> ${targetIndex}`);
    console.log(`[HistoryManager] 📄 文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[HistoryManager] 📊 phases 长度: ${entry.phases.length}`);
    
    // 移动索引
    this.currentIndex = targetIndex;
    
    console.log('[HistoryManager] 📚 历史栈摘要:');
    this.entries.forEach((e, i) => {
      const marker = i === this.currentIndex ? ' ← 当前' : '';
      console.log(`  [${i}] ${e.fileName}: ${e.operation}${marker}`);
    });
    console.log('========== [HistoryManager.redo] 结束 ==========\n');
    
    // 返回深拷贝
    return {
      ...entry,
      phases: JSON.parse(JSON.stringify(entry.phases)),
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
   * 现在索引 0 保存的是“初始状态”，所以 currentIndex > 0 时就可以 undo
   * （注意：不能 undo 到索引 0，因为那是初始状态，再 undo 就没有状态了）
   */
  canUndo(): boolean {
    return this.currentIndex > 0;
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
    console.log('\n========== [HistoryManager.clear] 开始 ==========')
    console.log(`[HistoryManager] 🗑️ 清空前: ${this.entries.length} 条记录，当前索引: ${this.currentIndex}`);
    
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
