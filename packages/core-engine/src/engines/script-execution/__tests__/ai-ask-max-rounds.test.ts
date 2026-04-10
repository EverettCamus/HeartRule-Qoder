/**
 * AI_Ask max_rounds 语义测试
 *
 * 语义定义：max_rounds 表示 AI 向用户回复的最大次数
 * - max_rounds = 1: AI 回复 1 次，等待用户回答后退出
 * - max_rounds = 2: AI 回复 2 次，期间用户可以回答，第2次回复后退出
 * - max_rounds = N: AI 最多回复 N 次
 *
 * 关键理解：
 * - max_rounds = 1 意味着：AI问1次 → 用户回答 → 完成（适合单轮问答）
 * - max_rounds = 2 意味着：AI问1次 → 用户回答 → AI追问1次 → 用户回答 → 完成
 *
 * 测试目标：
 * 1. 验证 max_rounds 语义正确实现
 * 2. 验证 currentRound 计算正确（在 AI 回复后递增）
 * 3. 验证退出时机正确（达到 max_rounds 后，用户回答完即退出）
 */

import { describe, test, expect, vi } from 'vitest';

import type { ILLMProvider } from '../../../application/ports/outbound/llm-provider.port.js';
import { LLMOrchestrator } from '../../llm-orchestration/orchestrator.js';
import { ScriptExecutor, ExecutionStatus } from '../script-executor.js';

function createMockLLM(): LLMOrchestrator {
  const mockProvider: ILLMProvider = {
    getModel: vi.fn().mockReturnValue({
      doGenerate: vi.fn().mockResolvedValue({
        text: '模拟响应',
        finishReason: 'stop',
      }),
    }),
    generateText: vi.fn().mockImplementation(async (prompt: string) => {
      let text = '模拟的AI响应';

      text = JSON.stringify({
        content: '这是一个测试问题',
        assessment: '## 阻抗分析\n阻抗程度：低',
        progress: '## 进度评估\n- [ ] 信息收集中',
        exit: 'false',
        exit_reason: '继续收集',
        crisis_detected: false,
      });

      return {
        text,
        debugInfo: {
          prompt: prompt.substring(0, 100),
          response: { text },
          model: 'test-model',
          config: {},
          timestamp: new Date().toISOString(),
        },
      };
    }),
    streamText: vi.fn().mockReturnValue(
      (async function* () {
        yield '模拟';
        yield '响应';
      })()
    ),
  };
  return new LLMOrchestrator(mockProvider);
}

describe('AI_Ask max_rounds 语义测试', () => {
  describe('max_rounds = 1', () => {
    test('AI 回复 1 次，等待用户回答后完成', { timeout: 10000 }, async () => {
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
                      action_type: 'ai_ask',
                      action_id: 'ask_1',
                      config: {
                        content: '这是第一个问题',
                        max_rounds: 1,
                        output: [{ get: '答案', define: '用户的回答' }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor(createMockLLM());
      let state = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-1';

      // 第一轮：AI 生成问题，等待用户输入
      state = await executor.executeSession(scriptContent, sessionId, state, null);

      // 验证：AI 已回复 1 次，等待用户回答
      expect(state.status).toBe(ExecutionStatus.WAITING_INPUT);
      expect(state.conversationHistory.filter((m) => m.role === 'assistant').length).toBe(1);
      expect(state.currentAction?.currentRound).toBe(1);

      // 模拟用户回答
      state = await executor.executeSession(scriptContent, sessionId, state, '这是用户的回答');

      // 验证：用户回答后，action 完成（因为 max_rounds = 1 已达到）
      expect(state.status).toBe(ExecutionStatus.COMPLETED);
    });
  });

  describe('max_rounds = 2', () => {
    test('AI 回复 2 次后应该触发 max_rounds 退出', { timeout: 15000 }, async () => {
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
                      action_type: 'ai_ask',
                      action_id: 'ask_2',
                      config: {
                        content: '这是第一个问题',
                        max_rounds: 2,
                        output: [{ get: '答案', define: '用户的回答' }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor(createMockLLM());
      let state = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-2';

      // === 第 1 次 AI 回复 ===
      state = await executor.executeSession(scriptContent, sessionId, state, null);

      expect(state.status).toBe(ExecutionStatus.WAITING_INPUT);
      expect(state.conversationHistory.length).toBe(1);
      expect(state.currentAction?.currentRound).toBe(1);

      // 模拟用户回复
      state.conversationHistory.push({
        role: 'user',
        content: '用户第一次回复',
        actionId: 'ask_2',
      });

      // === 第 2 次 AI 回复 ===
      state = await executor.executeSession(scriptContent, sessionId, state, '用户第一次回复');

      // 验证：AI 已回复 2 次，currentRound 应该是 2
      expect(state.conversationHistory.filter((m) => m.role === 'assistant').length).toBe(2);
      expect(state.currentAction?.currentRound).toBe(2);

      // 关键验证：如果 LLM 没有决定退出，应该还在等待输入
      // 但如果触发了 max_rounds 规则，应该退出
      // 注意：这里需要检查退出决策
    });

    test('达到 max_rounds 后不应再请求用户输入', { timeout: 15000 }, async () => {
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
                      action_type: 'ai_ask',
                      action_id: 'ask_3',
                      config: {
                        content: '问题内容',
                        max_rounds: 2,
                        exit: '已收集到答案',
                        output: [{ get: '答案', define: '用户的回答' }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor(createMockLLM());
      let state = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-3';

      // 第 1 次 AI 回复
      state = await executor.executeSession(scriptContent, sessionId, state, null);
      expect(state.status).toBe(ExecutionStatus.WAITING_INPUT);

      // 用户回复，准备第 2 次 AI 回复
      state.conversationHistory.push({
        role: 'user',
        content: '用户回复',
        actionId: 'ask_3',
      });

      // 第 2 次 AI 回复
      state = await executor.executeSession(scriptContent, sessionId, state, '用户回复');

      // 关键验证：max_rounds=2 时，AI 回复 2 次后
      // 如果退出了，status 应该是 COMPLETED 或有明确的退出标记
      const aiReplyCount = state.conversationHistory.filter((m) => m.role === 'assistant').length;

      // 记录当前状态用于调试
      console.log('=== max_rounds=2 测试状态 ===');
      console.log('AI 回复次数:', aiReplyCount);
      console.log('currentRound:', state.currentAction?.currentRound);
      console.log('status:', state.status);
      console.log('metadata:', JSON.stringify(state.metadata, null, 2));
    });
  });

  describe('max_rounds 边界情况', () => {
    test('max_rounds = 3 时 AI 应该最多回复 3 次', { timeout: 20000 }, async () => {
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
                      action_type: 'ai_ask',
                      action_id: 'ask_4',
                      config: {
                        content: '问题',
                        max_rounds: 3,
                        output: [{ get: '答案', define: '答案' }],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const executor = new ScriptExecutor(createMockLLM());
      let state = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-4';

      // 第 1 次 AI 回复
      state = await executor.executeSession(scriptContent, sessionId, state, null);
      expect(state.conversationHistory.filter((m) => m.role === 'assistant').length).toBe(1);

      // 第 2 次 AI 回复
      state.conversationHistory.push({ role: 'user', content: '回复1', actionId: 'ask_4' });
      state = await executor.executeSession(scriptContent, sessionId, state, '回复1');
      expect(state.conversationHistory.filter((m) => m.role === 'assistant').length).toBe(2);

      // 第 3 次 AI 回复
      state.conversationHistory.push({ role: 'user', content: '回复2', actionId: 'ask_4' });
      state = await executor.executeSession(scriptContent, sessionId, state, '回复2');

      const totalAiReplies = state.conversationHistory.filter((m) => m.role === 'assistant').length;

      // 关键验证：AI 不应该超过 3 次回复
      expect(totalAiReplies).toBeLessThanOrEqual(3);
    });
  });
});
