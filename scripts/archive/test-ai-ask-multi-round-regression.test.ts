/**
 * ai_ask 多轮对话变量作用域回归测试
 *
 * 验证以下关键点：
 * 1. 变量作用域持久化：variableStore 的分层结构在数据库中正确保存和恢复
 * 2. 多轮对话变量一致性：相同变量不会在不同作用域层级重复创建
 * 3. 变量更新机制：用户更改变量值时，正确更新原有作用域位置
 * 4. 防止变量迁移冲突：存在 variableStore 时不会触发错误的迁移逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from './src/services/session-manager.js';
import { ExecutionStatus } from '@heartrule/core-engine';
import { db } from './src/db/index.js';

// Mock 数据库
vi.mock('./src/db/index.js', () => {
  const mockSessionsFindFirst = vi.fn();
  const mockScriptsFindFirst = vi.fn();
  const mockScriptFilesFindFirst = vi.fn();
  const mockMessagesFindMany = vi.fn();
  const mockValues = vi.fn().mockResolvedValue({});
  const mockWhere = vi.fn().mockResolvedValue({});
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

  return {
    db: {
      query: {
        sessions: { findFirst: mockSessionsFindFirst },
        scripts: { findFirst: mockScriptsFindFirst },
        scriptFiles: { findFirst: mockScriptFilesFindFirst },
        messages: { findMany: mockMessagesFindMany },
      },
      insert: vi.fn().mockReturnValue({ values: mockValues }),
      update: vi.fn().mockReturnValue({ set: mockSet }),
    },
  };
});

// Mock ScriptExecutor
vi.mock('@heartrule/core-engine', async () => {
  const actual = await vi.importActual('@heartrule/core-engine');
  return {
    ...actual,
    ScriptExecutor: vi.fn().mockImplementation(() => ({
      executeSession: vi.fn(),
    })),
  };
});

describe('ai_ask 多轮对话变量提取回归测试', () => {
  let sessionManager: SessionManager;
  let mockExecutor: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = new SessionManager();
    mockExecutor = (sessionManager as any).scriptExecutor;
  });

  it('应该确保 variableStore 在多轮对话中正确持久化、恢复并更新', async () => {
    const sessionId = 'test-session-id';
    const scriptId = 'test-script-id';

    // 1. 模拟第一轮对话：用户输入 "LEO"
    const sessionRound1 = {
      id: sessionId,
      scriptId: scriptId,
      status: 'active',
      executionStatus: 'waiting_input',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 1 },
      variables: { 咨询师名: '小光' },
      metadata: {
        globalVariables: { 咨询师名: '小光' },
        actionState: { actionId: 'action_2', currentRound: 1 },
      },
    };

    const script = {
      id: scriptId,
      scriptName: 'test.yaml',
      scriptContent:
        'session: { phases: [{ phase_id: "p1", topics: [{ topic_id: "t1", actions: [{ action_id: "a1" }] }] }] }',
    };

    // 设置 DB Mock 返回
    (db.query.sessions.findFirst as any).mockResolvedValueOnce(sessionRound1);
    (db.query.scripts.findFirst as any).mockResolvedValue(script);
    (db.query.messages.findMany as any).mockResolvedValue([]);
    (db.query.scriptFiles.findFirst as any).mockResolvedValue(null);

    // 模拟执行器返回：提取了 "LEO"，存储在 topic
    const executionStateRound1 = {
      status: ExecutionStatus.WAITING_INPUT,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 1,
      currentPhaseId: 'p1',
      currentTopicId: 't1',
      variables: { 咨询师名: '小光', 来访者称呼: 'LEO' },
      variableStore: {
        global: {},
        session: {
          咨询师名: {
            value: '小光',
            type: 'string',
            source: 'migrated',
            lastUpdated: '2026-01-25T10:00:00Z',
          },
        },
        phase: {},
        topic: {
          t1: {
            来访者称呼: {
              value: 'LEO',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T10:00:05Z',
            },
          },
        },
      },
      conversationHistory: [],
      metadata: {
        actionState: { actionId: 'action_2', currentRound: 1 },
        lastActionRoundInfo: { currentRound: 1 },
      },
      lastAiMessage: '你好 LEO',
    };
    mockExecutor.executeSession.mockResolvedValueOnce(executionStateRound1);

    // 执行 processUserInput
    await sessionManager.processUserInput(sessionId, '我叫 LEO');

    // 验证持久化：db.update 应该包含 variableStore

    const setCall = (db.update(null as any).set as any).mock.calls[0][0];

    expect(setCall.metadata.variableStore).toBeDefined();
    expect(setCall.metadata.variableStore.topic['t1']['来访者称呼'].value).toBe('LEO');

    // 2. 模拟第二轮对话：用户更改称呼为 "张三"
    // 此时从 DB 恢复的状态应包含上一轮保存的 variableStore
    const sessionRound2 = {
      ...sessionRound1,
      variables: executionStateRound1.variables,
      metadata: setCall.metadata, // 包含持久化的 variableStore
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 1 },
    };

    (db.query.sessions.findFirst as any).mockResolvedValueOnce(sessionRound2);

    // 模拟执行器返回：提取了 "张三"，更新在 topic
    const executionStateRound2 = {
      ...executionStateRound1,
      variables: { 咨询师名: '小光', 来访者称呼: '张三' },
      variableStore: {
        ...executionStateRound1.variableStore,
        topic: {
          t1: {
            来访者称呼: {
              value: '张三',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T10:05:00Z',
            },
          },
        },
      },
      metadata: {
        actionState: { actionId: 'action_2', currentRound: 2 },
        lastActionRoundInfo: { currentRound: 2 },
      },
      lastAiMessage: '好的张三',
    };
    mockExecutor.executeSession.mockResolvedValueOnce(executionStateRound2);

    // 执行 processUserInput
    const result = await sessionManager.processUserInput(sessionId, '改名叫张三');

    // 验证更新机制和一致性
    const resultVariableStore = result.variableStore as any;
    expect(resultVariableStore.topic['来访者称呼']).toBe('张三');

    // 验证关键点：session 作用域中不应存在 '来访者称呼' (防止重复创建)
    expect(resultVariableStore.session['来访者称呼']).toBeUndefined();

    // 验证持久化更新

    const setCall2 = (db.update(null as any).set as any).mock.calls[1][0];
    expect(setCall2.metadata.variableStore.topic['t1']['来访者称呼'].value).toBe('张三');
    expect(setCall2.metadata.variableStore.session['来访者称呼']).toBeUndefined();
  });

  it('action完成后currentTopicId跳到新topic时，应从前一个有数据的topic中取变量', async () => {
    const sessionId = 'test-topic-fallback-session';
    const scriptId = 'test-script-id';

    // 模拟 action 完成后的场景：
    // - currentTopicId 跳到 topic_2（空的，新topic）
    // - 变量存在 topic_1（旧topic）
    const sessionAfterAction = {
      id: sessionId,
      scriptId: scriptId,
      status: 'active',
      executionStatus: 'completed',
      position: { phaseIndex: 0, topicIndex: 1, actionIndex: 0 },
      variables: { 咨询师名: '小光', 来访者称呼: '李永泉' },
      metadata: {
        globalVariables: { 咨询师名: '小光' },
        actionState: {},
      },
    };

    const script = {
      id: scriptId,
      scriptName: 'test.yaml',
      scriptContent: '...',
    };

    (db.query.sessions.findFirst as any).mockResolvedValueOnce(sessionAfterAction);
    (db.query.scripts.findFirst as any).mockResolvedValue(script);
    (db.query.messages.findMany as any).mockResolvedValue([]);
    (db.query.scriptFiles.findFirst as any).mockResolvedValue(null);

    // 模拟执行器返回：
    // - currentTopicId 是 topic_2（新topic，空）
    // - 变量存储在 topic_1（旧topic，有数据）
    const executionState = {
      status: ExecutionStatus.COMPLETED,
      currentPhaseIdx: 0,
      currentTopicIdx: 1,
      currentActionIdx: 0,
      currentPhaseId: 'phase_1',
      currentTopicId: 'topic_2',
      currentAction: null,
      variables: { 咨询师名: '小光', 来访者称呼: '李永泉' },
      variableStore: {
        global: {},
        session: {
          咨询师名: {
            value: '小光',
            type: 'string',
            source: 'migrated',
            lastUpdated: '2026-01-25T10:00:00Z',
          },
        },
        phase: {},
        topic: {
          topic_1: {
            来访者称呼: {
              value: '李永泉',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T10:35:37Z',
            },
            来访者年龄: {
              value: '35',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T10:35:37Z',
            },
          },
          topic_2: {},
        },
      },
      conversationHistory: [],
      metadata: {
        actionState: {},
        lastCompletedActionOutput: [{ get: '来访者称呼' }, { get: '来访者年龄' }],
        // 模拟 script-executor 在 action 完成时保存的上下文
        completedActionContext: {
          phaseId: 'phase_1',
          topicId: 'topic_1',
          actionId: 'action_2',
        },
      },
      lastAiMessage: '好的李永泉，我们继续。',
    };
    mockExecutor.executeSession.mockResolvedValueOnce(executionState);

    const result = await sessionManager.processUserInput(sessionId, '我的信息');

    // 验证关键点：应该从 topic_1 回退取到变量（而不是返回空）
    const resultVariableStore = result.variableStore as any;

    // 变量应该被解包，不再是 VariableValue 嵌套对象
    expect(resultVariableStore.topic['来访者称呼']).toBe('李永泉');
    expect(resultVariableStore.topic['来访者年龄']).toBe('35');

    // session 作用域变量也应被解包
    expect(resultVariableStore.session['咨询师名']).toBe('小光');

    // 不应存在嵌套的 topicId key
    expect(resultVariableStore.topic['topic_1']).toBeUndefined();
    expect(resultVariableStore.topic['topic_2']).toBeUndefined();
  });

  it('当恢复会话时，如果没有 variableStore，应该触发迁移逻辑（向后兼容性）', async () => {
    const sessionId = 'legacy-session-id';
    const sessionLegacy = {
      id: sessionId,
      scriptId: 's1',
      status: 'active',
      executionStatus: 'waiting_input',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: { 旧变量: '旧值' },
      metadata: {}, // 没有 variableStore
    };

    (db.query.sessions.findFirst as any).mockResolvedValueOnce(sessionLegacy);
    (db.query.scripts.findFirst as any).mockResolvedValue({
      id: 's1',
      scriptName: 's.yaml',
      scriptContent: '...',
    });
    (db.query.messages.findMany as any).mockResolvedValue([]);

    // 模拟 executeSession 会接收到被 SessionManager 恢复（此时为空）的 variableStore
    // 根据 SessionManager.processUserInput 修复后的逻辑：
    // executionState.variableStore = metadata.variableStore || { global: {}, session: {}, phase: {}, topic: {} }

    mockExecutor.executeSession.mockImplementation(
      async (_json: any, _id: any, state: any, _input: any) => {
        // 模拟 ScriptExecutor 内部的迁移逻辑
        if (
          state.variables &&
          (!state.variableStore || Object.keys(state.variableStore.session).length === 0)
        ) {
          state.variableStore = { global: {}, session: {}, phase: {}, topic: {} };
          for (const [k, v] of Object.entries(state.variables)) {
            state.variableStore.session[k] = { value: v, source: 'migrated' };
          }
        }
        return state;
      }
    );

    await sessionManager.processUserInput(sessionId, 'hello');

    // 验证触发了迁移
    const setCall = (db.update(null as any).set as any).mock.calls[0][0];
    expect(setCall.metadata.variableStore.session['旧变量']).toBeDefined();
    expect(setCall.metadata.variableStore.session['旧变量'].source).toBe('migrated');
  });

  it('没有completedActionContext时，currentTopicId指向空topic应回退到有数据的topic', async () => {
    const sessionId = 'test-fallback-no-context';
    const scriptId = 'test-script-id';

    const sessionData = {
      id: sessionId,
      scriptId: scriptId,
      status: 'active',
      executionStatus: 'waiting_input',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 1 },
      variables: { 咨询师名: '小光' },
      metadata: {
        globalVariables: { 咨询师名: '小光' },
        actionState: {},
      },
    };

    const script = {
      id: scriptId,
      scriptName: 'test.yaml',
      scriptContent: '...',
    };

    (db.query.sessions.findFirst as any).mockResolvedValueOnce(sessionData);
    (db.query.scripts.findFirst as any).mockResolvedValue(script);
    (db.query.messages.findMany as any).mockResolvedValue([]);
    (db.query.scriptFiles.findFirst as any).mockResolvedValue(null);

    // 模拟 action 完成后指针已移动，但没有 completedActionContext
    // currentTopicId = "topic_0" (新topic，空)，变量在 topic_1
    const executionState = {
      status: ExecutionStatus.COMPLETED,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentPhaseId: 'phase_1',
      // 注意：currentTopicId 指向数据不存在的 topic_0
      currentTopicId: 'topic_0',
      currentAction: null,
      variables: { 来访者称呼: '李永泉', 来访者年龄: '48' },
      variableStore: {
        global: {},
        session: {},
        phase: {},
        topic: {
          topic_1: {
            来访者称呼: {
              value: '李永泉',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-04-14T15:00:00Z',
            },
            来访者年龄: {
              value: '48',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-04-14T15:00:00Z',
            },
          },
          topic_0: {},
        },
      },
      conversationHistory: [{ role: 'assistant', content: '你好，我了解了', actionId: 'action_2' }],
      metadata: {
        // 没有 completedActionContext — 模拟旧版本 core-engine 未保存此字段
        actionState: {},
        lastCompletedActionOutput: [{ get: '来访者称呼' }, { get: '来访者年龄' }],
      },
      lastAiMessage: '好的，我们已经了解了基本信息。',
    };
    mockExecutor.executeSession.mockResolvedValueOnce(executionState);

    const result = await sessionManager.processUserInput(sessionId, '李记， 48， 男');

    const resultVariableStore = result.variableStore as any;

    // 即使没有 completedActionContext，回退逻辑也应找到 topic_1 中的变量
    expect(resultVariableStore.topic['来访者称呼']).toBe('李永泉');
    expect(resultVariableStore.topic['来访者年龄']).toBe('48');
    expect(resultVariableStore.topic['topic_1']).toBeUndefined();
    expect(resultVariableStore.topic['topic_0']).toBeUndefined();
  });
});
