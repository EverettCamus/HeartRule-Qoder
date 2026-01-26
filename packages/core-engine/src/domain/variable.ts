import { VariableScope, VariableUpdateMode } from '@heartrule/shared-types';

/**
 * 变量历史条目
 */
export interface VariableHistoryEntry {
  value: unknown;
  source: string;
  timestamp: Date;
}

/**
 * 变量状态领域模型
 * 
 * 【DDD 视角】领域实体，封装单个变量的完整生命周期与业务规则
 * 
 * 核心职责：
 * 1. 值管理：维护变量的当前值、类型、来源
 * 2. 更新策略：支持 OVERWRITE、APPEND、MERGE 三种更新模式
 * 3. 历史管理：记录变量变更历史，支持回滚操作
 * 4. 作用域属性：标记变量属于哪个作用域（global/session/phase/topic）
 * 
 * 业务规则：
 * - OVERWRITE: 直接覆盖旧值
 * - APPEND: 将新值追加到数组末尾（非数组时转为数组）
 * - MERGE: 对象深度合并（非对象时退化为 OVERWRITE）
 * 
 * 使用场景：
 * - 持久化层：作为 database 表的对象映射
 * - 运行时：Session 中的 variableStore 存储的是简化版 VariableValue
 */
export class VariableState {
  public variableId: string;
  public variableName: string;
  public scope: VariableScope;
  public value: unknown;
  public valueType: string;
  public updateMode: VariableUpdateMode;
  public source: string;
  public history: VariableHistoryEntry[];
  public createdAt: Date;
  public updatedAt: Date;

  constructor(params: {
    variableId: string;
    variableName: string;
    scope: VariableScope;
    value: unknown;
    valueType: string;
    updateMode?: VariableUpdateMode;
    source: string;
    history?: VariableHistoryEntry[];
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.variableId = params.variableId;
    this.variableName = params.variableName;
    this.scope = params.scope;
    this.value = params.value;
    this.valueType = params.valueType;
    this.updateMode = params.updateMode || VariableUpdateMode.OVERWRITE;
    this.source = params.source;
    this.history = params.history || [];
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  /**
   * 更新变量值
   */
  update(newValue: unknown, source: string): void {
    // 保存历史
    this.history.push({
      value: this.value,
      source: this.source,
      timestamp: new Date(),
    });

    // 根据更新模式处理
    switch (this.updateMode) {
      case VariableUpdateMode.OVERWRITE:
        this.value = newValue;
        break;
      case VariableUpdateMode.APPEND:
        if (Array.isArray(this.value)) {
          this.value = [...this.value, newValue];
        } else {
          this.value = [this.value, newValue];
        }
        break;
      case VariableUpdateMode.MERGE:
        if (typeof this.value === 'object' && typeof newValue === 'object') {
          this.value = { ...this.value as object, ...newValue as object };
        } else {
          this.value = newValue;
        }
        break;
    }

    this.source = source;
    this.updatedAt = new Date();
  }

  /**
   * 回滚到上一个值
   */
  rollback(): boolean {
    if (this.history.length === 0) {
      return false;
    }

    const lastEntry = this.history.pop()!;
    this.value = lastEntry.value;
    this.source = lastEntry.source;
    this.updatedAt = new Date();
    return true;
  }

  /**
   * 转换为JSON对象
   */
  toJSON(): Record<string, unknown> {
    return {
      variableId: this.variableId,
      variableName: this.variableName,
      scope: this.scope,
      value: this.value,
      valueType: this.valueType,
      updateMode: this.updateMode,
      source: this.source,
      history: this.history,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
