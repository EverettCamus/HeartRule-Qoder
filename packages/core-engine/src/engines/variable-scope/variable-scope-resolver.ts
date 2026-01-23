/**
 * 变量作用域解析器
 * 
 * 负责变量的作用域解析与优先级查找
 * 实现设计文档中的 VariableScopeResolver 领域服务
 */

import type { VariableStore, VariableValue, VariableDefinition, Position } from '@heartrule/shared-types';
import { VariableScope } from '@heartrule/shared-types';

/**
 * 变量作用域解析器（领域服务）
 */
export class VariableScopeResolver {
  private variableDefinitions: Map<string, VariableDefinition>;
  private variableStore: VariableStore;

  constructor(variableStore: VariableStore, variableDefinitions?: Map<string, VariableDefinition>) {
    this.variableStore = variableStore;
    this.variableDefinitions = variableDefinitions || new Map();
  }

  /**
   * 解析变量值（按优先级查找：topic > phase > session > global）
   * 
   * @param varName 变量名
   * @param position 当前执行位置
   * @returns 变量值或 null
   */
  public resolveVariable(varName: string, position: Position): VariableValue | null {
    // 按优先级查找：topic > phase > session > global
    const searchOrder = [
      { scope: 'topic' as const, key: position.topicId },
      { scope: 'phase' as const, key: position.phaseId },
      { scope: 'session' as const, key: null },
      { scope: 'global' as const, key: null },
    ];

    for (const { scope, key } of searchOrder) {
      const value = this.lookupVariable(scope, key, varName);
      if (value !== null) {
        console.log(`[VariableScopeResolver] ✅ Found variable "${varName}" in ${scope} scope`, {
          value: value.value,
          source: value.source,
        });
        return value;
      }
    }

    console.log(`[VariableScopeResolver] ❌ Variable "${varName}" not found in any scope`);
    return null;
  }

  /**
   * 确定变量应写入的作用域
   * 
   * @param varName 变量名
   * @returns 目标作用域
   */
  public determineScope(varName: string): VariableScope {
    // 查找变量定义
    const definition = this.variableDefinitions.get(varName);

    if (definition) {
      console.log(`[VariableScopeResolver] 📋 Variable "${varName}" has defined scope:`, definition.scope);
      return definition.scope;
    }

    // 默认策略：未定义变量写入 topic 作用域（最小生命周期）
    console.log(`[VariableScopeResolver] ⚠️ Variable "${varName}" not defined, defaulting to topic scope`);
    return VariableScope.TOPIC;
  }

  /**
   * 获取变量定义元数据
   * 
   * @param varName 变量名
   * @returns 变量定义或 null
   */
  public getVariableDefinition(varName: string): VariableDefinition | null {
    return this.variableDefinitions.get(varName) || null;
  }

  /**
   * 添加或更新变量定义
   * 
   * @param definition 变量定义
   */
  public setVariableDefinition(definition: VariableDefinition): void {
    this.variableDefinitions.set(definition.name, definition);
    console.log(`[VariableScopeResolver] 📝 Registered variable definition:`, {
      name: definition.name,
      scope: definition.scope,
    });
  }

  /**
   * 批量设置变量定义
   * 
   * @param definitions 变量定义数组
   */
  public setVariableDefinitions(definitions: VariableDefinition[]): void {
    for (const definition of definitions) {
      this.setVariableDefinition(definition);
    }
  }

  /**
   * 内部方法：在指定作用域中查找变量
   * 
   * @param scope 作用域类型
   * @param key 作用域key（phase/topic需要）
   * @param varName 变量名
   * @returns 变量值或 null
   */
  private lookupVariable(
    scope: 'global' | 'session' | 'phase' | 'topic',
    key: string | null | undefined,
    varName: string
  ): VariableValue | null {
    switch (scope) {
      case 'topic':
        if (key && this.variableStore.topic[key]) {
          return this.variableStore.topic[key][varName] || null;
        }
        return null;

      case 'phase':
        if (key && this.variableStore.phase[key]) {
          return this.variableStore.phase[key][varName] || null;
        }
        return null;

      case 'session':
        return this.variableStore.session[varName] || null;

      case 'global':
        return this.variableStore.global[varName] || null;

      default:
        return null;
    }
  }

  /**
   * 写入变量到指定作用域
   * 
   * @param varName 变量名
   * @param value 变量值
   * @param scope 作用域
   * @param position 当前位置
   * @param source 数据来源
   */
  public setVariable(
    varName: string,
    value: any,
    scope: VariableScope,
    position: Position,
    source?: string
  ): void {
    const variableValue: VariableValue = {
      value,
      type: this.inferType(value),
      lastUpdated: new Date().toISOString(),
      source: source || position.actionId || 'unknown',
    };

    switch (scope) {
      case 'topic':
        if (!position.topicId) {
          console.error(`[VariableScopeResolver] ❌ Cannot write to topic scope: topicId is missing`);
          return;
        }
        if (!this.variableStore.topic[position.topicId]) {
          this.variableStore.topic[position.topicId] = {};
        }
        this.variableStore.topic[position.topicId][varName] = variableValue;
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in topic scope`, {
          topicId: position.topicId,
          value,
        });
        break;

      case 'phase':
        if (!position.phaseId) {
          console.error(`[VariableScopeResolver] ❌ Cannot write to phase scope: phaseId is missing`);
          return;
        }
        if (!this.variableStore.phase[position.phaseId]) {
          this.variableStore.phase[position.phaseId] = {};
        }
        this.variableStore.phase[position.phaseId][varName] = variableValue;
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in phase scope`, {
          phaseId: position.phaseId,
          value,
        });
        break;

      case 'session':
        this.variableStore.session[varName] = variableValue;
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in session scope`, { value });
        break;

      case 'global':
        this.variableStore.global[varName] = variableValue;
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in global scope`, { value });
        break;

      default:
        console.error(`[VariableScopeResolver] ❌ Unknown scope:`, scope);
    }
  }

  /**
   * 推断值的类型
   */
  private inferType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }
}
