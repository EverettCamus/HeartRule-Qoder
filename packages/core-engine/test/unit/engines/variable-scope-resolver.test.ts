/**
 * 测试变量作用域结构验证功能
 *
 * 测试覆盖：
 * 1. validateStoreStructure 验证 VariableStore 结构完整性
 * 2. 变量操作历史记录追踪
 * 3. VariableValue 扩展字段（scope、history）
 */

import { VariableScope } from '@heartrule/shared-types';
import type { VariableStore, Position } from '@heartrule/shared-types';
import { describe, it, expect, beforeEach } from 'vitest';

import { VariableScopeResolver } from '../../../src/engines/variable-scope/variable-scope-resolver.js';

describe('变量作用域结构验证', () => {
  let variableStore: VariableStore;
  let position: Position;

  beforeEach(() => {
    variableStore = {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    position = {
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
    };
  });

  describe('1. VariableStore 结构验证', () => {
    it('应该验证完整的 VariableStore 结构', () => {
      const resolver = new VariableScopeResolver(variableStore);
      const result = resolver.validateStoreStructure();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺失的顶层作用域', () => {
      const incompleteStore = {
        global: {},
        session: {},
        // 缺少 phase 和 topic
      } as any;

      const resolver = new VariableScopeResolver(incompleteStore);
      const result = resolver.validateStoreStructure();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required scope: phase');
      expect(result.errors).toContain('Missing required scope: topic');
    });

    it('应该检测 phase 作用域中的非对象值', () => {
      const invalidStore = {
        ...variableStore,
        phase: {
          phase_1: 'not an object', // 错误：应该是对象
        },
      } as any;

      const resolver = new VariableScopeResolver(invalidStore);
      const result = resolver.validateStoreStructure();

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes('Phase scope'))).toBe(true);
    });

    it('应该检测 topic 作用域中的非对象值', () => {
      const invalidStore = {
        ...variableStore,
        topic: {
          topic_1: 123, // 错误：应该是对象
        },
      } as any;

      const resolver = new VariableScopeResolver(invalidStore);
      const result = resolver.validateStoreStructure();

      expect(result.valid).toBe(false);
      expect(result.errors.some((err) => err.includes('Topic scope'))).toBe(true);
    });
  });

  describe('2. 变量操作历史记录', () => {
    it('应该记录变量提取操作', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('用户名', 'LEO', VariableScope.TOPIC, position, 'action_1');

      const operations = resolver.getVariableOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toMatchObject({
        actionId: 'action_1',
        operation: 'extract',
        variableName: '用户名',
        scope: VariableScope.TOPIC,
        value: 'LEO',
      });
      expect(operations[0].timestamp).toBeDefined();
    });

    it('应该记录多个变量操作', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('用户名', 'LEO', VariableScope.TOPIC, position);
      resolver.setVariable('年龄', 28, VariableScope.SESSION, position);
      resolver.setVariable('已婚', true, VariableScope.SESSION, position);

      const operations = resolver.getVariableOperations();
      expect(operations).toHaveLength(3);
      expect(operations[0].variableName).toBe('用户名');
      expect(operations[1].variableName).toBe('年龄');
      expect(operations[2].variableName).toBe('已婚');
    });

    it('应该支持清除变量操作历史', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('用户名', 'LEO', VariableScope.TOPIC, position);
      expect(resolver.getVariableOperations()).toHaveLength(1);

      resolver.clearVariableOperations();
      expect(resolver.getVariableOperations()).toHaveLength(0);
    });
  });

  describe('3. VariableValue 扩展字段', () => {
    it('应该在 VariableValue 中包含 scope 字段', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('测试变量', 'test_value', VariableScope.TOPIC, position);

      const variable = variableStore.topic['topic_1']['测试变量'];
      expect(variable).toBeDefined();
      expect(variable.scope).toBe(VariableScope.TOPIC);
      expect(variable.value).toBe('test_value');
      expect(variable.type).toBe('string');
      expect(variable.source).toBe('action_1');
      expect(variable.lastUpdated).toBeDefined();
    });

    it('应该为不同作用域的变量正确设置 scope 字段', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('全局变量', 'global_value', VariableScope.GLOBAL, position);
      resolver.setVariable('会话变量', 'session_value', VariableScope.SESSION, position);
      resolver.setVariable('阶段变量', 'phase_value', VariableScope.PHASE, position);
      resolver.setVariable('话题变量', 'topic_value', VariableScope.TOPIC, position);

      expect(variableStore.global['全局变量'].scope).toBe(VariableScope.GLOBAL);
      expect(variableStore.session['会话变量'].scope).toBe(VariableScope.SESSION);
      expect(variableStore.phase['phase_1']['阶段变量'].scope).toBe(VariableScope.PHASE);
      expect(variableStore.topic['topic_1']['话题变量'].scope).toBe(VariableScope.TOPIC);
    });
  });

  describe('4. 综合场景测试', () => {
    it('应该在 CBT 场景中正确管理变量', () => {
      const resolver = new VariableScopeResolver(variableStore);

      // 场景：抑郁评分测试
      resolver.setVariable('用户姓名', '张三', VariableScope.SESSION, position, 'init_action');
      resolver.setVariable('抑郁评分', 12, VariableScope.TOPIC, position, 'assessment_action');
      resolver.setVariable(
        '是否需要转介',
        false,
        VariableScope.TOPIC,
        position,
        'assessment_action'
      );

      // 验证变量操作记录
      const operations = resolver.getVariableOperations();
      expect(operations).toHaveLength(3);

      // 验证 VariableStore 结构
      const validation = resolver.validateStoreStructure();
      expect(validation.valid).toBe(true);

      // 验证变量值
      expect(variableStore.session['用户姓名'].value).toBe('张三');
      expect(variableStore.topic['topic_1']['抑郁评分'].value).toBe(12);
      expect(variableStore.topic['topic_1']['是否需要转介'].value).toBe(false);

      // 验证 scope 字段
      expect(variableStore.session['用户姓名'].scope).toBe(VariableScope.SESSION);
      expect(variableStore.topic['topic_1']['抑郁评分'].scope).toBe(VariableScope.TOPIC);
    });
  });

  describe('Global variable support', () => {
    it('should register global variable names', () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);
      resolver.registerGlobalVariables([{ name: '来访者名' }, { name: '咨询师名' }]);

      expect(resolver.isGlobalVariable('来访者名')).toBe(true);
      expect(resolver.isGlobalVariable('咨询师名')).toBe(true);
      expect(resolver.isGlobalVariable('未知变量')).toBe(false);
    });

    it('should register definitions with GLOBAL scope for global variables', () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);
      resolver.registerGlobalVariables([{ name: '来访者名' }]);

      const def = resolver.getVariableDefinition('来访者名');
      expect(def).not.toBeNull();
      expect(def!.scope).toBe('global');
    });

    it('determineScope should return global for registered names', () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);
      resolver.registerGlobalVariables([{ name: '来访者名' }]);

      expect(resolver.determineScope('来访者名')).toBe('global');
      expect(resolver.determineScope('未知变量')).toBe('topic');
    });

    it('should invoke onGlobalVariableChange callback on global write', async () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);
      resolver.registerGlobalVariables([{ name: '来访者名' }]);

      let callbackCalled = false;
      let callbackName = '';
      let callbackValue = '';

      resolver.onGlobalVariableChange = async (name, value) => {
        callbackCalled = true;
        callbackName = name;
        callbackValue = value as string;
      };

      resolver.setVariable('来访者名', '小明', VariableScope.GLOBAL, {
        phaseId: 'p1',
        topicId: 't1',
        actionId: 'a1',
      });

      // Wait for the fire-and-forget callback to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callbackCalled).toBe(true);
      expect(callbackName).toBe('来访者名');
      expect(callbackValue).toBe('小明');
    });

    it('should skip callback when global variable value unchanged', async () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);
      resolver.registerGlobalVariables([{ name: '来访者名' }]);

      let callbackCount = 0;
      resolver.onGlobalVariableChange = async () => {
        callbackCount++;
      };

      const pos = { phaseId: 'p1', topicId: 't1', actionId: 'a1' };

      // First write
      resolver.setVariable('来访者名', '小明', VariableScope.GLOBAL, pos);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callbackCount).toBe(1);

      // Second write with same value
      resolver.setVariable('来访者名', '小明', VariableScope.GLOBAL, pos);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callbackCount).toBe(1); // Skipped

      // Third write with different value
      resolver.setVariable('来访者名', '小红', VariableScope.GLOBAL, pos);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(callbackCount).toBe(2);
    });

    it('should not invoke callback for topic-scope writes', async () => {
      const variableStore = createEmptyStore();
      const resolver = new VariableScopeResolver(variableStore);

      let callbackCalled = false;
      resolver.onGlobalVariableChange = async () => {
        callbackCalled = true;
      };

      resolver.setVariable('普通变量', 'test', VariableScope.TOPIC, {
        phaseId: 'p1',
        topicId: 't1',
        actionId: 'a1',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(callbackCalled).toBe(false);
    });
  });
});

function createEmptyStore(): VariableStore {
  return {
    global: {},
    session: {},
    phase: {},
    topic: {},
  };
}
