/**
 * 测试 ai_ask 的 output_list 功能
 */

import { VariableScope, type VariableStore } from '@heartrule/shared-types';
import { describe, test, expect } from 'vitest';

import { AiAskAction } from '../../src/domain/actions/ai-ask-action.js';
import type { ActionContext } from '../../src/domain/actions/base-action.js';
import { VariableScopeResolver } from '../../src/engines/variable-scope/variable-scope-resolver.js';

/** 最小 ActionContext，scopeResolver 为 undefined */
function minimalContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    sessionId: 'test-session',
    phaseId: 'test-phase',
    topicId: 'test-topic',
    actionId: 'test-action',
    variables: {},
    conversationHistory: [],
    metadata: {},
    ...overrides,
  };
}

/** 空 VariableStore */
function emptyVariableStore(): VariableStore {
  return { global: {}, session: {}, phase: {}, topic: {} };
}

describe('AiAskAction - output_list 生成', () => {
  test('单个变量时也生成 output_list', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请告诉我你的名字',
      output: [{ get: '用户名', define: '用户的姓名或昵称' }],
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext());

    expect(result).toContain('"用户名"');
    expect(result).toContain('用户的姓名或昵称');
  });

  test('多个变量时生成完整的 output_list', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请描述你的症状',
      output: [
        { get: '症状描述', define: '用户描述的主要症状' },
        { get: '持续时间', define: '症状持续的时间长度' },
        { get: '严重程度', define: '症状的严重程度评估' },
      ],
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext());

    expect(result).toContain('"症状描述"');
    expect(result).toContain('"持续时间"');
    expect(result).toContain('"严重程度"');
    expect(result).toContain('用户描述的主要症状');
    expect(result).toContain('症状持续的时间长度');
    expect(result.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  test('没有 output 配置时返回空字符串', () => {
    const action = new AiAskAction('test_action', {
      question_template: '你好吗？',
      target_variable: 'user_mood',
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext());

    expect(result).toBe('');
  });

  test('部分变量没有 define 时也能正确生成', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请提供信息',
      output: [
        { get: '姓名', define: '用户的姓名' },
        { get: '年龄' }, // 没有 define
      ],
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext());

    expect(result).toContain('"姓名"');
    expect(result).toContain('"年龄"');
    expect(result).toContain('用户的姓名');
  });

  test('define 优先级: action output config > 变量作用域定义', () => {
    const store = emptyVariableStore();
    const scopeResolver = new VariableScopeResolver(store);

    // 注册全局变量定义（模拟 global.yaml 中的 define）
    scopeResolver.setVariableDefinitions([
      {
        name: '来访者名',
        scope: VariableScope.GLOBAL,
        define: '来访者的称呼，通常从用户首次对话中自我介绍的姓名/昵称中获取',
      },
      { name: '来访者年龄', scope: VariableScope.GLOBAL, define: '来访者的年纪' },
      {
        name: '来访者性别',
        scope: VariableScope.GLOBAL,
        define: '来访者的性别，也可以接纳是特殊性别',
      },
    ]);

    const action = new AiAskAction('test_action', {
      question_template: '收集信息',
      output: [
        { get: '来访者名' }, // 无 define，回退到作用域
        { get: '来访者年龄' }, // 无 define，回退到作用域
        { get: '来访者性别', define: '用户性别认同' }, // 有 define，优先用 action 级别的
      ],
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext({ scopeResolver }));

    // 来访者名: 回退到作用域的 define
    expect(result).toContain('来访者的称呼');
    // 来访者年龄: 回退到作用域的 define
    expect(result).toContain('来访者的年纪');
    // 来访者性别: 优先用 action 级别的 define
    expect(result).toContain('用户性别认同');
    // 不应出现作用域的性别 define
    expect(result).not.toContain('也可以接纳是特殊性别');

    console.log('define 回退测试 output_list:\n', result);
  });

  test('define 都找不到时只输出"提取的变量名"', () => {
    const action = new AiAskAction('test_action', {
      question_template: '收集信息',
      output: [{ get: '未知变量' }],
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList(minimalContext());

    expect(result).toContain('"未知变量": "提取的未知变量"');
  });
});
