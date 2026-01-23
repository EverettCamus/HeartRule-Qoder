/**
 * P0-1 测试：ExecutionState 扩展与数据迁移
 */

import { describe, it, expect } from 'vitest';
import { ScriptExecutor, ExecutionStatus } from '../src/engines/script-execution/script-executor.js';
import type { ExecutionState } from '../src/engines/script-execution/script-executor.js';

describe('P0-1: ExecutionState 扩展与迁移逻辑', () => {
  it('应该将旧的 variables 迁移到 variableStore.session', async () => {
    const executor = new ScriptExecutor();
    
    // 创建一个带有旧 variables 的 ExecutionState
    const executionState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {
        '用户姓名': '李永',
        '用户年龄': 28,
        '是否已婚': true,
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };

    // 创建一个简单的测试脚本
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_migration',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [],
              },
            ],
          },
        ],
      },
    });

    // 执行会话（会触发迁移逻辑）
    const result = await executor.executeSession(
      scriptContent,
      'test_session',
      executionState
    );

    // 验证迁移结果
    expect(result.variableStore).toBeDefined();
    expect(result.variableStore?.session).toBeDefined();
    
    // 验证数据已迁移
    expect(result.variableStore?.session['用户姓名']?.value).toBe('李永');
    expect(result.variableStore?.session['用户年龄']?.value).toBe(28);
    expect(result.variableStore?.session['是否已婚']?.value).toBe(true);

    // 验证元数据
    expect(result.variableStore?.session['用户姓名']?.type).toBe('string');
    expect(result.variableStore?.session['用户年龄']?.type).toBe('number');
    expect(result.variableStore?.session['是否已婚']?.type).toBe('boolean');
    expect(result.variableStore?.session['用户姓名']?.source).toBe('migrated');
    expect(result.variableStore?.session['用户姓名']?.lastUpdated).toBeDefined();

    // 验证 variableStore 结构完整
    expect(result.variableStore?.global).toBeDefined();
    expect(result.variableStore?.phase).toBeDefined();
    expect(result.variableStore?.topic).toBeDefined();
  });

  it('应该保持 variableStore 如果已经存在', async () => {
    const executor = new ScriptExecutor();
    
    // 创建一个已有 variableStore 的 ExecutionState
    const executionState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {
        '旧变量': '不应该被使用',
      },
      variableStore: {
        global: {},
        session: {
          '现有变量': {
            value: '已存在的值',
            type: 'string',
            source: 'initial',
          },
        },
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };

    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_no_migration',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [],
              },
            ],
          },
        ],
      },
    });

    const result = await executor.executeSession(
      scriptContent,
      'test_session',
      executionState
    );

    // 验证不会重新迁移
    expect(result.variableStore?.session['现有变量']?.value).toBe('已存在的值');
    expect(result.variableStore?.session['旧变量']).toBeUndefined();
  });

  it('应该正确推断类型', async () => {
    const executor = new ScriptExecutor();
    
    const executionState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {
        stringVal: 'hello',
        numberVal: 42,
        boolVal: false,
        arrayVal: [1, 2, 3],
        objectVal: { key: 'value' },
        nullVal: null,
        undefinedVal: undefined,
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };

    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_types',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [],
              },
            ],
          },
        ],
      },
    });

    const result = await executor.executeSession(
      scriptContent,
      'test_session',
      executionState
    );

    // 验证类型推断
    expect(result.variableStore?.session['stringVal']?.type).toBe('string');
    expect(result.variableStore?.session['numberVal']?.type).toBe('number');
    expect(result.variableStore?.session['boolVal']?.type).toBe('boolean');
    expect(result.variableStore?.session['arrayVal']?.type).toBe('array');
    expect(result.variableStore?.session['objectVal']?.type).toBe('object');
    expect(result.variableStore?.session['nullVal']?.type).toBe('null');
    expect(result.variableStore?.session['undefinedVal']?.type).toBe('undefined');
  });
});
