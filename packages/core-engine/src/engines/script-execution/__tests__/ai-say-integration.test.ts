/**
 * AiSayAction 集成测试
 *
 * 测试目标：
 * 1. ScriptExecutor 与 AiSayAction 的协作
 * 2. 第一轮会话初始化的完整流程
 * 3. 消息保存到 conversationHistory 的行为
 * 4. 执行状态的正确更新
 */

import { describe, test, expect } from 'vitest';

import { ScriptExecutor, ExecutionStatus } from '../script-executor.js';

describe('AiSayAction 集成测试 - 会话初始化', () => {
  test('【回归测试】第一个 ai_say (max_rounds:1) 应正常输出', { timeout: 10000 }, async () => {
    // 模拟 cbt_depression_assessment.yaml 的脚本结构
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        session_name: '测试会话',
        phases: [
          {
            phase_id: 'phase_1',
            phase_name: '测试阶段',
            topics: [
              {
                topic_id: 'topic_1',
                topic_name: '欢迎',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'welcome_greeting',
                    config: {
                      content: '你好，欢迎来到心理咨询。',
                      require_acknowledgment: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();
    const sessionId = 'test-session-123';

    // 执行第一轮（无用户输入）
    const result = await executor.executeSession(scriptContent, sessionId, initialState, null);

    // 验证执行成功
    expect(result.status).not.toBe(ExecutionStatus.ERROR);

    // 验证 AI 消息已生成 - LLM 会改写内容，所以使用 toMatch 而不是精确匹配
    expect(result.lastAiMessage).toBeTruthy();
    expect(result.lastAiMessage).toMatch(/欢迎|咨询/i);

    // 验证消息已保存到对话历史
    expect(result.conversationHistory.length).toBe(1);
    expect(result.conversationHistory[0].role).toBe('assistant');
    expect(result.conversationHistory[0].content).toMatch(/欢迎|咨询/i);
    expect(result.conversationHistory[0].actionId).toBe('welcome_greeting');

    // 验证位置已更新（max_rounds:1 的 ai_say 会立即完成，不会等待输入）
    // 所以会继续执行直到没有更多 action
    expect(result.status).toBe(ExecutionStatus.COMPLETED);
  });

  test(
    '【回归测试】完整模拟 cbt_depression_assessment 第一个 topic',
    { timeout: 10000 },
    async () => {
      const scriptContent = JSON.stringify({
        session: {
          session_id: 'cbt_depression_assessment_v1',
          session_name: 'CBT抑郁症初次评估会谈',
          phases: [
            {
              phase_id: 'phase_1_rapport',
              phase_name: '建立关系阶段',
              topics: [
                {
                  topic_id: 'topic_1_1_welcome',
                  topic_name: '开场欢迎',
                  actions: [
                    {
                      action_type: 'ai_say',
                      action_id: 'welcome_greeting',
                      config: {
                        content: `你好，欢迎来到心理咨询。我是AI咨询助手，会陪伴你完成今天的会谈。
在开始之前，我想先了解一些基本信息，这将帮助我更好地理解你的情况。
你可以放心，这里的所有对话都是保密的。`,
                        say_goal: '让来访者感到被欢迎和安全',
                        require_acknowledgment: false,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor();
      const initialState = ScriptExecutor.createInitialState();
      const sessionId = '329f3f58-bf48-4c92-add3-7a11da0d3ec3';

      const result = await executor.executeSession(scriptContent, sessionId, initialState, null);

      // 关键验证：不应该返回错误状态
      expect(result.status).not.toBe(ExecutionStatus.ERROR);
      expect(result.metadata.error).toBeUndefined();

      // 关键验证：应该有 AI 消息 - LLM 会改写内容
      expect(result.lastAiMessage).toBeTruthy();
      expect(result.lastAiMessage).not.toBe('');
      expect(result.lastAiMessage).toMatch(/欢迎|咨询|陪伴|心理|助手/i);

      // 验证对话历史
      expect(result.conversationHistory.length).toBeGreaterThan(0);
      const firstMessage = result.conversationHistory[0];
      expect(firstMessage.role).toBe('assistant');
      expect(firstMessage.actionId).toBe('welcome_greeting');

      // 验证位置信息（max_rounds:1 会立即完成，状态变为 COMPLETED）
      expect(result.status).toBe(ExecutionStatus.COMPLETED);
    }
  );

  test(
    '第一个 ai_say (require_acknowledgment:false) 应输出并立即完成',
    { timeout: 10000 },
    async () => {
      const scriptContent = JSON.stringify({
        session: {
          session_id: 'test_session',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'ai_say',
                      action_id: 'intro',
                      config: {
                        content: '今天我们来学习ABC模型。',
                        require_acknowledgment: false,
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor();
      const initialState = ScriptExecutor.createInitialState();

      const result = await executor.executeSession(scriptContent, 'session-1', initialState, null);

      // require_acknowledgment: false 应立即完成
      expect(result.status).toBe(ExecutionStatus.COMPLETED);

      // 应该有 AI 消息 - LLM 会改写内容，只验证消息存在
      expect(result.lastAiMessage).toBeTruthy();
      expect(result.lastAiMessage!.length).toBeGreaterThan(0);

      // 消息应该保存到历史
      expect(result.conversationHistory.length).toBe(1);
    }
  );

  test('变量替换应正常工作', async () => {
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'phase_1',
            topics: [
              {
                topic_id: 'topic_1',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'greeting',
                    config: {
                      content: '你好{用户名}，我是{咨询师名}。',
                      require_acknowledgment: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();
    initialState.variables = {
      用户名: '小明',
      咨询师名: 'Dr. Smith',
    };

    const result = await executor.executeSession(scriptContent, 'session-1', initialState, null);

    // 验证变量替换成功 - LLM 会改写内容，但应该包含替换后的变量
    expect(result.lastAiMessage).toContain('小明');
    expect(result.lastAiMessage).toMatch(/Dr\.\s*Smith|史密斯/i);
  });
});

describe('AiSayAction 集成测试 - 多轮对话', () => {
  test('require_acknowledgment: true 应正确处理两轮交互', { timeout: 15000 }, async () => {
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'phase_1',
            topics: [
              {
                topic_id: 'topic_1',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'info',
                    config: {
                      content: '这是需要确认的信息。',
                      require_acknowledgment: true,
                    },
                  },
                  {
                    action_type: 'ai_say',
                    action_id: 'next',
                    config: {
                      content: '下一个action',
                      require_acknowledgment: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();

    // 第一轮：输出信息
    const result1 = await executor.executeSession(scriptContent, 'session-1', initialState, null);

    expect(result1.status).toBe(ExecutionStatus.WAITING_INPUT);
    // LLM 会改写内容，只验证消息存在
    expect(result1.lastAiMessage).toBeTruthy();
    expect(result1.lastAiMessage!.length).toBeGreaterThan(0);
    expect(result1.currentActionIdx).toBe(0);

    // 第二轮：用户确认
    const result2 = await executor.executeSession(scriptContent, 'session-1', result1, '我知道了');

    // 应该完成第一个 action 并进入下一个
    // 第二个 action (require_acknowledgment:false) 会立即完成
    expect(result2.status).toBe(ExecutionStatus.COMPLETED);
    // LLM 会改写内容，只验证消息存在
    expect(result2.lastAiMessage).toBeTruthy();
  });

  test('连续的 ai_say (max_rounds:1) 应依次执行', async () => {
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'phase_1',
            topics: [
              {
                topic_id: 'topic_1',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'say1',
                    config: {
                      content: '第一条消息',
                      require_acknowledgment: false,
                    },
                  },
                  {
                    action_type: 'ai_say',
                    action_id: 'say2',
                    config: {
                      content: '第二条消息',
                      require_acknowledgment: false,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();

    const result = await executor.executeSession(scriptContent, 'session-1', initialState, null);

    // 两个 action 应该都执行完成，都会保存到 conversationHistory
    expect(result.conversationHistory.length).toBe(2);
    // LLM 会改写内容，所以验证 actionId 即可
    expect(result.conversationHistory[0].actionId).toBe('say1');
    expect(result.conversationHistory[0].content).toBeTruthy();
    expect(result.conversationHistory[1].actionId).toBe('say2');
    expect(result.conversationHistory[1].content).toBeTruthy();

    // 最后的消息应该存在
    expect(result.lastAiMessage).toBeTruthy();

    // 状态应该是完成
    expect(result.status).toBe(ExecutionStatus.COMPLETED);
  }, 15000); // 增加超时时间以适应 LLM 调用，两次 LLM 调用需要更多时间
});

describe('AiSayAction 集成测试 - 错误处理', () => {
  test('空脚本应正常处理', async () => {
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();

    const result = await executor.executeSession(scriptContent, 'session-1', initialState, null);

    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.conversationHistory.length).toBe(0);
  });

  test('无效的 action_type 应抛出错误', async () => {
    const scriptContent = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'phase_1',
            topics: [
              {
                topic_id: 'topic_1',
                actions: [
                  {
                    action_type: 'invalid_action',
                    action_id: 'test',
                    config: {},
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    const executor = new ScriptExecutor();
    const initialState = ScriptExecutor.createInitialState();

    await expect(
      executor.executeSession(scriptContent, 'session-1', initialState, null)
    ).rejects.toThrow();
  });
});
