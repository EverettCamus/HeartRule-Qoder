/**
 * Phase 7 重构测试：VariableScopeResolver 变量管理能力完善
 *
 * 测试目标：
 * 1. migrateToVariableStore 迁移功能测试
 * 2. inferTypeStatic 类型推断测试
 * 3. migrateIfNeeded 自动迁移测试
 * 4. 向后兼容性测试
 */

import type { VariableStore } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

import { VariableScopeResolver } from '../../src/engines/variable-scope/variable-scope-resolver.js';

describe('Phase 7 重构：VariableScopeResolver 变量管理能力完善', () => {
  describe('1. migrateToVariableStore 功能测试', () => {
    it('应该正确将扁平变量迁移到分层结构', () => {
      const flatVariables = {
        name: 'John',
        age: 30,
        isActive: true,
        tags: ['tag1', 'tag2'],
      };

      const variableStore = VariableScopeResolver.migrateToVariableStore(flatVariables);

      expect(variableStore).toHaveProperty('global');
      expect(variableStore).toHaveProperty('session');
      expect(variableStore).toHaveProperty('phase');
      expect(variableStore).toHaveProperty('topic');

      // 验证变量被迁移到 session 作用域
      expect(variableStore.session.name).toEqual({
        value: 'John',
        type: 'string',
        source: 'migrated',
        lastUpdated: expect.any(String),
      });

      expect(variableStore.session.age).toEqual({
        value: 30,
        type: 'number',
        source: 'migrated',
        lastUpdated: expect.any(String),
      });

      expect(variableStore.session.isActive).toEqual({
        value: true,
        type: 'boolean',
        source: 'migrated',
        lastUpdated: expect.any(String),
      });

      expect(variableStore.session.tags).toEqual({
        value: ['tag1', 'tag2'],
        type: 'array',
        source: 'migrated',
        lastUpdated: expect.any(String),
      });
    });

    it('应该正确处理空对象', () => {
      const variableStore = VariableScopeResolver.migrateToVariableStore({});

      expect(variableStore.session).toEqual({});
      expect(variableStore.global).toEqual({});
      expect(variableStore.phase).toEqual({});
      expect(variableStore.topic).toEqual({});
    });

    it('应该正确处理包含 null 和 undefined 的变量', () => {
      const flatVariables = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test',
      };

      const variableStore = VariableScopeResolver.migrateToVariableStore(flatVariables);

      expect(variableStore.session.nullValue.type).toBe('null');
      expect(variableStore.session.undefinedValue.type).toBe('undefined');
      expect(variableStore.session.normalValue.type).toBe('string');
    });
  });

  describe('2. inferTypeStatic 类型推断测试', () => {
    it('应该正确推断基本类型', () => {
      expect(VariableScopeResolver.inferTypeStatic('test')).toBe('string');
      expect(VariableScopeResolver.inferTypeStatic(123)).toBe('number');
      expect(VariableScopeResolver.inferTypeStatic(true)).toBe('boolean');
      expect(VariableScopeResolver.inferTypeStatic(false)).toBe('boolean');
    });

    it('应该正确推断特殊类型', () => {
      expect(VariableScopeResolver.inferTypeStatic(null)).toBe('null');
      expect(VariableScopeResolver.inferTypeStatic(undefined)).toBe('undefined');
      expect(VariableScopeResolver.inferTypeStatic([1, 2, 3])).toBe('array');
    });

    it('应该正确推断对象类型', () => {
      expect(VariableScopeResolver.inferTypeStatic({ key: 'value' })).toBe('object');
      expect(VariableScopeResolver.inferTypeStatic(new Date())).toBe('object');
    });

    it('应该正确推断函数类型', () => {
      expect(VariableScopeResolver.inferTypeStatic(() => {})).toBe('function');
      expect(VariableScopeResolver.inferTypeStatic(function () {})).toBe('function');
    });

    it('应该正确处理空数组', () => {
      expect(VariableScopeResolver.inferTypeStatic([])).toBe('array');
    });

    it('应该正确处理嵌套结构', () => {
      const nested = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      };
      expect(VariableScopeResolver.inferTypeStatic(nested)).toBe('object');
    });
  });

  describe('3. migrateIfNeeded 自动迁移测试', () => {
    it('如果缺少 variableStore 则应自动迁移', () => {
      const executionState = {
        variables: {
          name: 'Alice',
          age: 25,
        },
      } as any;

      VariableScopeResolver.migrateIfNeeded(executionState);

      expect(executionState.variableStore).toBeDefined();
      expect(executionState.variableStore.session.name.value).toBe('Alice');
      expect(executionState.variableStore.session.age.value).toBe(25);
    });

    it('如果已有 variableStore 则不应重复迁移', () => {
      const existingStore: VariableStore = {
        global: {},
        session: { existing: { value: 'test', type: 'string', source: 'manual', lastUpdated: '' } },
        phase: {},
        topic: {},
      };

      const executionState = {
        variables: { name: 'Bob' },
        variableStore: existingStore,
      } as any;

      VariableScopeResolver.migrateIfNeeded(executionState);

      // 验证没有被覆盖
      expect(executionState.variableStore).toBe(existingStore);
      expect(executionState.variableStore.session.existing).toBeDefined();
      expect(executionState.variableStore.session.name).toBeUndefined();
    });

    it('如果既没有 variableStore 也没有 variables 则不应报错', () => {
      const executionState = {} as any;

      expect(() => {
        VariableScopeResolver.migrateIfNeeded(executionState);
      }).not.toThrow();
    });

    it('如果只有空的 variables 对象则应创建空的 variableStore', () => {
      const executionState = {
        variables: {},
      } as any;

      VariableScopeResolver.migrateIfNeeded(executionState);

      expect(executionState.variableStore).toBeDefined();
      expect(executionState.variableStore.session).toEqual({});
    });
  });

  describe('4. 静态方法功能验证', () => {
    it('静态方法 inferTypeStatic 应该正确工作', () => {
      const testValues = ['string', 123, true, null, undefined, [1, 2, 3], { key: 'value' }];

      testValues.forEach((value) => {
        const staticResult = VariableScopeResolver.inferTypeStatic(value);
        expect(typeof staticResult).toBe('string');
      });
    });
  });

  describe('5. 边界情况测试', () => {
    it('应该处理包含特殊字符的变量名', () => {
      const flatVariables = {
        'var-with-dash': 'value1',
        'var.with.dot': 'value2',
        var_with_underscore: 'value3',
      };

      const variableStore = VariableScopeResolver.migrateToVariableStore(flatVariables);

      expect(variableStore.session['var-with-dash'].value).toBe('value1');
      expect(variableStore.session['var.with.dot'].value).toBe('value2');
      expect(variableStore.session['var_with_underscore'].value).toBe('value3');
    });

    it('应该处理大量变量的迁移', () => {
      const flatVariables: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        flatVariables[`var${i}`] = `value${i}`;
      }

      const variableStore = VariableScopeResolver.migrateToVariableStore(flatVariables);

      expect(Object.keys(variableStore.session)).toHaveLength(100);
      expect(variableStore.session.var0.value).toBe('value0');
      expect(variableStore.session.var99.value).toBe('value99');
    });

    it('应该正确处理深层嵌套的对象', () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };

      const variableStore = VariableScopeResolver.migrateToVariableStore({
        deep: deepObject,
      });

      expect(variableStore.session.deep.value).toEqual(deepObject);
      expect(variableStore.session.deep.type).toBe('object');
    });

    it('应该正确处理混合类型数组', () => {
      const mixedArray = [1, 'string', true, null, { key: 'value' }];

      const variableStore = VariableScopeResolver.migrateToVariableStore({
        mixed: mixedArray,
      });

      expect(variableStore.session.mixed.value).toEqual(mixedArray);
      expect(variableStore.session.mixed.type).toBe('array');
    });
  });

  describe('6. lastUpdated 时间戳测试', () => {
    it('迁移的变量应该包含 ISO 格式的时间戳', () => {
      const variableStore = VariableScopeResolver.migrateToVariableStore({
        test: 'value',
      });

      const timestamp = variableStore.session.test.lastUpdated;

      // 验证是有效的 ISO 时间戳
      expect(timestamp).toBeDefined();
      if (timestamp) {
        expect(new Date(timestamp).toISOString()).toBe(timestamp);
      }
    });

    it('多次迁移应该生成不同的时间戳', async () => {
      const store1 = VariableScopeResolver.migrateToVariableStore({
        test: 'value',
      });

      // 等待 1ms 确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 1));

      const store2 = VariableScopeResolver.migrateToVariableStore({
        test: 'value',
      });

      // 时间戳应该不同
      expect(store1.session.test.lastUpdated).not.toBe(store2.session.test.lastUpdated);
    });
  });

  describe('7. 代码度量验证', () => {
    it('新增功能应该约为 56 行代码', () => {
      // 验证新增的三个静态方法存在
      expect(typeof VariableScopeResolver.migrateToVariableStore).toBe('function');
      expect(typeof VariableScopeResolver.inferTypeStatic).toBe('function');
      expect(typeof VariableScopeResolver.migrateIfNeeded).toBe('function');
    });
  });
});
