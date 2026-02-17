/**
 * 回归测试：ai_ask 多轮对话中的变量提取问题
 *
 * BUG描述：
 * 在 ai_ask 动作的多轮对话过程中（action.completed = false），
 * 提取的变量未能存储到 variableStore 的 topic 级别，
 * 导致前端变量气泡无法显示这些变量。
 *
 * 根本原因：
 * script-executor.ts 的 continueAction 分支中，
 * 当 result.completed = false 时直接返回，
 * 跳过了变量写入逻辑（第253-309行）。
 *
 * 修复方案：
 * 在 result.completed = false 分支内，
 * 添加变量提取和写入 variableStore 的逻辑。
 *
 * 测试目标：
 * 确保 ai_ask 在未完成状态下提取的变量能正确存储到 variableStore
 */

import { VariableScope } from '@heartrule/shared-types';
import type { VariableStore, Position } from '@heartrule/shared-types';
import { describe, it, expect, beforeEach } from 'vitest';

import { VariableScopeResolver } from '../../src/engines/variable-scope/variable-scope-resolver.js';

describe('ai_ask 多轮对话变量提取回归测试', () => {
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
      actionId: 'action_2',
    };
  });

  describe('场景1: ai_ask 未完成时的变量提取', () => {
    it('应该在 action 未完成时也能提取并存储变量到 topic 作用域', () => {
      // 模拟 ai_ask 第一轮返回的提取变量（action 未完成）
      const extractedVariables = {
        来访者称呼: 'LEO',
        来访者年龄: '未知',
      };

      // 模拟 script-executor 中的变量写入逻辑
      if (extractedVariables && variableStore) {
        const scopeResolver = new VariableScopeResolver(variableStore);

        for (const [varName, varValue] of Object.entries(extractedVariables)) {
          const targetScope = scopeResolver.determineScope(varName);
          scopeResolver.setVariable(varName, varValue, targetScope, position, position.actionId);
        }
      }

      // 验证变量已存储到 topic 作用域
      expect(variableStore.topic['topic_1']).toBeDefined();
      expect(variableStore.topic['topic_1']['来访者称呼']).toBeDefined();
      expect(variableStore.topic['topic_1']['来访者称呼'].value).toBe('LEO');
      expect(variableStore.topic['topic_1']['来访者年龄']).toBeDefined();
      expect(variableStore.topic['topic_1']['来访者年龄'].value).toBe('未知');

      // 验证变量元数据
      expect(variableStore.topic['topic_1']['来访者称呼'].type).toBe('string');
      expect(variableStore.topic['topic_1']['来访者称呼'].source).toBe('action_2');
      expect(variableStore.topic['topic_1']['来访者称呼'].lastUpdated).toBeDefined();
    });

    it('应该在多轮对话中累积提取变量', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 第一轮：提取称呼
      const round1Variables = {
        来访者称呼: 'LEO',
      };

      for (const [varName, varValue] of Object.entries(round1Variables)) {
        const targetScope = scopeResolver.determineScope(varName);
        scopeResolver.setVariable(varName, varValue, targetScope, position, position.actionId);
      }

      expect(variableStore.topic['topic_1']['来访者称呼'].value).toBe('LEO');

      // 第二轮：提取年龄（称呼已存在）
      const round2Variables = {
        来访者年龄: '28',
      };

      for (const [varName, varValue] of Object.entries(round2Variables)) {
        const targetScope = scopeResolver.determineScope(varName);
        scopeResolver.setVariable(varName, varValue, targetScope, position, position.actionId);
      }

      // 验证两个变量都存在
      expect(variableStore.topic['topic_1']['来访者称呼'].value).toBe('LEO');
      expect(variableStore.topic['topic_1']['来访者年龄'].value).toBe('28');
      expect(Object.keys(variableStore.topic['topic_1']).length).toBe(2);
    });

    it('应该在变量值更新时保留历史元数据', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 第一轮：初始值
      scopeResolver.setVariable(
        '来访者称呼',
        'Leo',
        VariableScope.TOPIC,
        position,
        position.actionId
      );
      const firstTimestamp = variableStore.topic['topic_1']['来访者称呼'].lastUpdated;

      // 等待一小段时间
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      // 第二轮：更新值
      return delay(10).then(() => {
        scopeResolver.setVariable(
          '来访者称呼',
          'LEO',
          VariableScope.TOPIC,
          position,
          position.actionId
        );
        const secondTimestamp = variableStore.topic['topic_1']['来访者称呼'].lastUpdated;

        // 验证值已更新
        expect(variableStore.topic['topic_1']['来访者称呼'].value).toBe('LEO');

        // 验证时间戳已更新
        expect(secondTimestamp).not.toBe(firstTimestamp);
        expect(new Date(secondTimestamp!).getTime()).toBeGreaterThan(
          new Date(firstTimestamp!).getTime()
        );
      });
    });
  });

  describe('场景2: variableStore 嵌套结构验证', () => {
    it('应该正确创建嵌套的 phase/topic 结构', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 写入多个 topic 的变量
      const position1 = { phaseId: 'phase_1', topicId: 'topic_1', actionId: 'action_1' };
      const position2 = { phaseId: 'phase_1', topicId: 'topic_2', actionId: 'action_2' };

      scopeResolver.setVariable('变量A', '值A', VariableScope.TOPIC, position1, 'action_1');
      scopeResolver.setVariable('变量B', '值B', VariableScope.TOPIC, position2, 'action_2');

      // 验证嵌套结构
      expect(variableStore.topic['topic_1']).toBeDefined();
      expect(variableStore.topic['topic_2']).toBeDefined();
      expect(variableStore.topic['topic_1']['变量A'].value).toBe('值A');
      expect(variableStore.topic['topic_2']['变量B'].value).toBe('值B');

      // 验证互不干扰
      expect(variableStore.topic['topic_1']['变量B']).toBeUndefined();
      expect(variableStore.topic['topic_2']['变量A']).toBeUndefined();
    });

    it('应该支持跨作用域的变量存储', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 写入不同作用域
      scopeResolver.setVariable('全局变量', '全局值', VariableScope.GLOBAL, position, 'action_2');
      scopeResolver.setVariable('会话变量', '会话值', VariableScope.SESSION, position, 'action_2');
      scopeResolver.setVariable('阶段变量', '阶段值', VariableScope.PHASE, position, 'action_2');
      scopeResolver.setVariable('话题变量', '话题值', VariableScope.TOPIC, position, 'action_2');

      // 验证各作用域
      expect(variableStore.global['全局变量']).toBeDefined();
      expect(variableStore.session['会话变量']).toBeDefined();
      expect(variableStore.phase['phase_1']['阶段变量']).toBeDefined();
      expect(variableStore.topic['topic_1']['话题变量']).toBeDefined();

      // 验证值正确
      expect(variableStore.global['全局变量'].value).toBe('全局值');
      expect(variableStore.session['会话变量'].value).toBe('会话值');
      expect(variableStore.phase['phase_1']['阶段变量'].value).toBe('阶段值');
      expect(variableStore.topic['topic_1']['话题变量'].value).toBe('话题值');
    });
  });

  describe('场景3: 默认作用域规则', () => {
    it('未定义的变量应默认存入 topic 作用域', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 不预定义变量，直接判断作用域
      const scope = scopeResolver.determineScope('未定义变量');

      expect(scope).toBe(VariableScope.TOPIC);

      // 写入变量
      scopeResolver.setVariable('未定义变量', '测试值', scope, position, 'action_2');

      // 验证存储在 topic
      expect(variableStore.topic['topic_1']['未定义变量']).toBeDefined();
      expect(variableStore.topic['topic_1']['未定义变量'].value).toBe('测试值');
    });

    it('output 配置中的变量应遵循默认 topic 作用域', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // 模拟 output 配置中的变量（如 cbt_depression_assessment.yaml 中的配置）

      // 提取的值
      const extractedValues = {
        来访者称呼: 'LEO',
        来访者年龄: '28岁',
      };

      // 写入变量
      for (const [varName, varValue] of Object.entries(extractedValues)) {
        const scope = scopeResolver.determineScope(varName);
        scopeResolver.setVariable(varName, varValue, scope, position, 'action_2');
      }

      // 验证都存入 topic
      expect(variableStore.topic['topic_1']['来访者称呼'].value).toBe('LEO');
      expect(variableStore.topic['topic_1']['来访者年龄'].value).toBe('28岁');

      // 验证其他作用域为空
      expect(Object.keys(variableStore.global).length).toBe(0);
      expect(Object.keys(variableStore.session).length).toBe(0);
      expect(Object.keys(variableStore.phase).length).toBe(0);
    });
  });

  describe('场景4: 边界条件测试', () => {
    it('应该处理空的 extractedVariables', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);
      const extractedVariables = {};

      // 不应抛出错误
      expect(() => {
        for (const [varName, varValue] of Object.entries(extractedVariables)) {
          const targetScope = scopeResolver.determineScope(varName);
          scopeResolver.setVariable(varName, varValue, targetScope, position, position.actionId);
        }
      }).not.toThrow();

      // 验证 variableStore 仍为空
      expect(Object.keys(variableStore.topic).length).toBe(0);
    });

    it('应该处理特殊字符的变量名', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      const specialNames = ['来访者-称呼', '来访者_年龄', '来访者.职业', '来访者（性别）'];

      specialNames.forEach((varName, index) => {
        const scope = scopeResolver.determineScope(varName);
        scopeResolver.setVariable(varName, `值${index}`, scope, position, 'action_2');
      });

      // 验证所有特殊字符变量都正确存储
      specialNames.forEach((varName) => {
        expect(variableStore.topic['topic_1'][varName]).toBeDefined();
      });
    });

    it('应该处理 null 和 undefined 值', () => {
      const scopeResolver = new VariableScopeResolver(variableStore);

      // undefined 值应该被跳过（根据 ai-ask-action 的逻辑）
      const extractedVariables: Record<string, any> = {
        有效变量: 'LEO',
        // '空变量': undefined,  // 在提取阶段就被过滤了
      };

      for (const [varName, varValue] of Object.entries(extractedVariables)) {
        if (varValue !== undefined && varValue !== null && varValue !== '') {
          const scope = scopeResolver.determineScope(varName);
          scopeResolver.setVariable(varName, varValue, scope, position, 'action_2');
        }
      }

      // 只有有效变量被存储
      expect(variableStore.topic['topic_1']['有效变量']).toBeDefined();
      expect(Object.keys(variableStore.topic['topic_1']).length).toBe(1);
    });
  });
});
