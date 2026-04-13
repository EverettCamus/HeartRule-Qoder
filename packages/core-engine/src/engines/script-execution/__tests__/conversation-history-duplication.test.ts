/**
 * Conversation History Duplication Bug Fix Test
 *
 * Bug: When processing user input in multi-round ai_ask action,
 * the user message was being added twice to conversationHistory:
 * 1. Once from database load (via loadConversationHistory)
 * 2. Once from continueAction pushing userInput
 *
 * This test verifies that user messages are not duplicated.
 */

import { describe, test, expect, vi } from 'vitest';

import type { ILLMProvider } from '../../../application/ports/outbound/llm-provider.port.js';
import { LLMOrchestrator } from '../../llm-orchestration/orchestrator.js';
import { ScriptExecutor, ExecutionStatus } from '../script-executor.js';

// 创建 mock LLM provider
function createMockLLM(): LLMOrchestrator {
  const mockProvider: ILLMProvider = {
    getModel: vi.fn().mockReturnValue({
      doGenerate: vi.fn().mockResolvedValue({
        text: '模拟的AI响应',
        finishReason: 'stop',
      }),
    }),
    generateText: vi.fn().mockImplementation(async (prompt: string) => {
      // 模拟多轮对话的响应
      let text = '模拟的AI响应';

      if (prompt.includes('继续对话') || prompt.includes('后续')) {
        text = JSON.stringify({
          content: '感谢你的分享，能多说一些吗？',
          assessment: '## 阻抗分析\n阻抗程度：低\n主要表现：无回避倾向',
          progress: '## 进度评估\n- [x] 用户输入已收集',
          exit: 'false',
          exit_reason: '继续收集',
          用户回复: '我最近感觉有点无力',
          crisis_detected: false,
        });
      } else if (prompt.includes('初始') || prompt.includes('欢迎') || prompt.includes('开场')) {
        text = JSON.stringify({
          content: '你好，欢迎来到心理咨询。今天有什么想聊的吗？',
          assessment: '## 阻抗分析\n阻抗程度：无\n主要表现：初次对话',
          progress: '## 进度评估\n- [ ] 等待用户输入',
          exit: 'false',
          exit_reason: '继续收集',
          用户回复: '',
          crisis_detected: false,
        });
      }

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

describe('Conversation History Duplication Bug Fix', () => {
  test(
    'multi-round ai_ask should not duplicate user messages in conversationHistory',
    { timeout: 10000 },
    async () => {
      // 模拟脚本：多轮 ai_ask
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
                  topic_name: '多轮对话测试',
                  actions: [
                    {
                      action_type: 'ai_ask',
                      action_id: 'ask_feeling',
                      config: {
                        content: '今天有什么想聊的吗？',
                        tone: '友好',
                        exit: '用户已回复',
                        max_rounds: 3,
                        output: [
                          {
                            get: '用户回复',
                            define: '用户的任意回复',
                          },
                        ],
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
      let executionState = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-123';

      // 第一轮：初始化，无用户输入
      executionState = await executor.executeSession(
        scriptContent,
        sessionId,
        executionState,
        null
      );

      // 验证第一轮完成，状态为等待输入
      expect(executionState.status).toBe(ExecutionStatus.WAITING_INPUT);
      expect(executionState.conversationHistory.length).toBe(1);
      expect(executionState.conversationHistory[0].role).toBe('assistant');
      expect(executionState.currentAction).not.toBeNull();
      expect(executionState.metadata.actionState).toBeDefined();

      // 模拟从数据库加载的 conversationHistory（包含 AI 消息和用户输入）
      const userInput = '我最近感觉有点无力';
      executionState.conversationHistory.push({
        role: 'user',
        content: userInput,
        actionId: 'ask_feeling',
      });

      // 第二轮：传递 userInput 继续对话
      // 关键测试点：如果 continueAction 重复 push userInput，conversationHistory 会有 3 条消息
      // 正确的行为：conversationHistory 应该只有 2 条（1 条 AI + 1 条用户）
      executionState = await executor.executeSession(
        scriptContent,
        sessionId,
        executionState,
        userInput
      );

      // 验证关键断言：用户消息不应重复
      const userMessages = executionState.conversationHistory.filter((m) => m.role === 'user');
      expect(userMessages.length).toBe(1); // 应该只有 1 条用户消息，而不是 2 条
      expect(userMessages[0].content).toBe(userInput);

      // 验证总消息数：1 条 AI + 1 条用户 = 2 条（第二轮 AI 响应会再增加 1 条）
      expect(executionState.conversationHistory.length).toBeLessThanOrEqual(3);

      // 验证状态
      expect(executionState.status).toBe(ExecutionStatus.WAITING_INPUT);
    }
  );

  test(
    'conversationHistory should maintain correct order after user input',
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
                      action_type: 'ai_ask',
                      action_id: 'ask_mood',
                      config: {
                        content: '你感觉怎么样？',
                        max_rounds: 2,
                        output: [{ get: '心情', define: '用户的心情状态' }],
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
      let executionState = ScriptExecutor.createInitialState();
      const sessionId = 'test-session-456';

      // 第一轮
      executionState = await executor.executeSession(
        scriptContent,
        sessionId,
        executionState,
        null
      );
      expect(executionState.status).toBe(ExecutionStatus.WAITING_INPUT);

      // 添加用户消息到 history（模拟数据库加载）
      const userInput = '我觉得还不错';
      executionState.conversationHistory.push({
        role: 'user',
        content: userInput,
        actionId: 'ask_mood',
      });

      const historyBefore = [...executionState.conversationHistory];

      // 第二轮
      executionState = await executor.executeSession(
        scriptContent,
        sessionId,
        executionState,
        userInput
      );

      // 验证消息顺序不变
      expect(executionState.conversationHistory.length).toBe(historyBefore.length + 1); // 只增加 AI 响应
      expect(executionState.conversationHistory[0]).toEqual(historyBefore[0]); // 第一条 AI 消息不变
      expect(executionState.conversationHistory[1]).toEqual(historyBefore[1]); // 用户消息不变且只出现一次
    }
  );
});
