/**
 * 变量作用域解析器
 *
 * 【DDD 视角】领域服务，负责变量的作用域解析与优先级查找
 *
 * 核心职责：
 * 1. 作用域决策：根据变量定义或默认策略确定变量应写入的作用域
 * 2. 优先级查找：按 topic > phase > session > global 顺序查找变量值
 * 3. 变量定义管理：维护变量的作用域元数据（从脚本 declare 中读取）
 *
 * 作用域规则：
 * - global: 全局配置、常量，跨会话共享
 * - session: 会话级变量，存储用户身份、会话元数据等
 * - phase: 阶段级变量，适合临时状态与中间结果
 * - topic: 话题级变量，最小生命周期，适合单一话题内的临时数据
 *
 * 默认策略：
 * - 未定义的变量默认写入 topic 作用域（最小生命周期，避免数据泄漏）
 * - 查找时按优先级从内层到外层逐级查找
 */

import type {
  VariableStore,
  VariableValue,
  VariableDefinition,
  Position,
} from '@heartrule/shared-types';
import { VariableScope } from '@heartrule/shared-types';

/**
 * 变量作用域解析器（领域服务）
 *
 * 负责变量在不同作用域之间的读写逻辑，封装作用域规则。
 * 与 Session 领域模型协作，Session 维护 variableStore，该解析器提供访问逻辑。
 */
export class VariableScopeResolver {
  private variableDefinitions: Map<string, VariableDefinition>;
  private variableStore: VariableStore;
  private variableOperations: Array<{
    actionId: string;
    operation: 'extract' | 'update' | 'delete';
    variableName: string;
    scope: VariableScope;
    value: unknown;
    timestamp: string;
  }>;

  constructor(variableStore: VariableStore, variableDefinitions?: Map<string, VariableDefinition>) {
    this.variableStore = variableStore;
    this.variableDefinitions = variableDefinitions || new Map();
    this.variableOperations = [];
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
      console.log(
        `[VariableScopeResolver] 📋 Variable "${varName}" has defined scope:`,
        definition.scope
      );
      return definition.scope;
    }

    // 默认策略：未定义变量写入 topic 作用域（最小生命周期）
    console.log(
      `[VariableScopeResolver] ⚠️ Variable "${varName}" not defined, defaulting to topic scope`
    );
    return VariableScope.TOPIC;
  }

  /**
   * 验证 VariableStore 结构完整性
   *
   * @returns 验证结果
   */
  public validateStoreStructure(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查必需的顶层作用域
    const requiredScopes = ['global', 'session', 'phase', 'topic'];
    for (const scope of requiredScopes) {
      if (!(scope in this.variableStore)) {
        errors.push(`Missing required scope: ${scope}`);
      } else if (typeof this.variableStore[scope as keyof VariableStore] !== 'object') {
        errors.push(`Scope ${scope} must be an object`);
      }
    }

    // 检查 phase 和 topic 是否为嵌套结构
    if (this.variableStore.phase && typeof this.variableStore.phase === 'object') {
      for (const [phaseId, phaseVars] of Object.entries(this.variableStore.phase)) {
        if (typeof phaseVars !== 'object') {
          errors.push(`Phase scope '${phaseId}' must contain an object`);
        }
      }
    }

    if (this.variableStore.topic && typeof this.variableStore.topic === 'object') {
      for (const [topicId, topicVars] of Object.entries(this.variableStore.topic)) {
        if (typeof topicVars !== 'object') {
          errors.push(`Topic scope '${topicId}' must contain an object`);
        }
      }
    }

    const valid = errors.length === 0;
    if (valid) {
      console.log('[VariableScopeResolver] ✅ VariableStore structure is valid');
    } else {
      console.error(
        '[VariableScopeResolver] ❌ VariableStore structure validation failed:',
        errors
      );
    }

    return { valid, errors };
  }

  /**
   * 获取变量操作历史记录
   *
   * @returns 变量操作数组
   */
  public getVariableOperations() {
    return [...this.variableOperations];
  }

  /**
   * 清除变量操作历史记录
   */
  public clearVariableOperations(): void {
    this.variableOperations = [];
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
    // 记录变量操作
    const timestamp = new Date().toISOString();
    this.variableOperations.push({
      actionId: position.actionId || 'unknown',
      operation: 'extract',
      variableName: varName,
      scope,
      value,
      timestamp,
    });

    const variableValue: VariableValue = {
      value,
      type: this.inferType(value),
      lastUpdated: timestamp,
      source: source || position.actionId || 'unknown',
      scope, // 添加作用域字段
    };

    switch (scope) {
      case 'topic':
        if (!position.topicId) {
          console.error(
            `[VariableScopeResolver] ❌ Cannot write to topic scope: topicId is missing`
          );
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
          console.error(
            `[VariableScopeResolver] ❌ Cannot write to phase scope: phaseId is missing`
          );
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
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in session scope`, {
          value,
        });
        break;

      case 'global':
        this.variableStore.global[varName] = variableValue;
        console.log(`[VariableScopeResolver] ✅ Set variable "${varName}" in global scope`, {
          value,
        });
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

  /**
   * [Phase 7] 将扁平变量迁移到分层 variableStore
   *
   * @param variables 扁平变量对象
   * @returns 分层的 VariableStore
   */
  static migrateToVariableStore(variables: Record<string, any>): VariableStore {
    console.log('[VariableScopeResolver] 🔄 Migrating variables to variableStore');

    const variableStore: VariableStore = {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    // Migrate old data to session scope
    for (const [key, value] of Object.entries(variables)) {
      variableStore.session[key] = {
        value,
        type: this.inferTypeStatic(value),
        source: 'migrated',
        lastUpdated: new Date().toISOString(),
      };
    }

    console.log(
      '[VariableScopeResolver] ✅ Migrated',
      Object.keys(variables).length,
      'variables to session scope'
    );

    return variableStore;
  }

  /**
   * [Phase 7] 静态方法：推断值的类型
   */
  static inferTypeStatic(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  /**
   * [Phase 7] 如果需要则迁移 variableStore（带副作用）
   */
  static migrateIfNeeded(executionState: any): void {
    if (!executionState.variableStore && executionState.variables) {
      executionState.variableStore = this.migrateToVariableStore(executionState.variables);
    }
  }
}
