/**
 * AI_Ask 变量上下文测试
 *
 * 测试目标：
 * 1. currentRound 在新 action 开始时重置为 0
 * 2. 模板变量 current_round/max_rounds 正确传递
 * 3. collected_variables 正确显示已收集和未收集的变量
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

import { AiAskAction } from '../ai-ask-action.js';
import type { ActionContext } from '../base-action.js';

describe('AI_Ask 变量上下文', () => {
  let mockLlmOrchestrator: any;
  let capturedPrompt: string = '';

  beforeEach(() => {
    capturedPrompt = '';
    mockLlmOrchestrator = {
      generateText: vi.fn().mockImplementation(async (prompt: string) => {
        capturedPrompt = prompt;
        return {
          text: JSON.stringify({
            content: '测试问题',
            exit: 'false',
            exit_reason: '继续',
            crisis_detected: false,
          }),
          debugInfo: {},
        };
      }),
    } as any;
  });

  describe('currentRound 重置', () => {
    test('新 action 的 currentRound 应该从 0 开始', () => {
      const config = {
        content: '测试问题',
        max_rounds: 5,
        output: [{ get: '测试变量', define: '测试用途' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);

      expect(action.currentRound).toBe(0);
    });

    test('首次执行后 currentRound 应该是 1', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 5,
        output: [{ get: '测试变量', define: '测试用途' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'test-action',
        variables: {},
        conversationHistory: [],
        metadata: {},
      };

      await action.execute(context);

      expect(action.currentRound).toBe(1);
    });
  });

  describe('模板变量替换', () => {
    test('提示词应该包含正确的 current_round 和 max_rounds', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 10,
        output: [{ get: '测试变量', define: '测试用途' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'test-action',
        variables: {},
        conversationHistory: [],
        metadata: {},
      };

      await action.execute(context);

      expect(capturedPrompt).toContain('第 1/10 轮');
    });

    test('第二轮执行应该显示正确的轮次', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 3,
        output: [{ get: '测试变量', define: '测试用途' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'test-action',
        variables: {},
        conversationHistory: [],
        metadata: {},
      };

      await action.execute(context);
      expect(capturedPrompt).toContain('第 1/3 轮');

      await action.execute(context, '用户回答');
      expect(capturedPrompt).toContain('第 2/3 轮');
    });
  });

  describe('collected_variables 构建', () => {
    test('应该显示已收集和未收集的变量', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 5,
        output: [
          { get: '姓名', define: '用户姓名' },
          { get: '年龄', define: '用户年龄' },
        ],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'test-action',
        variables: { 姓名: '张三' },
        conversationHistory: [],
        metadata: {},
      };

      await action.execute(context);

      expect(capturedPrompt).toContain('姓名: 张三');
      expect(capturedPrompt).toContain('年龄: (未收集)');
    });

    test('没有配置 output 时不显示已收集变量', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 5,
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'test-action',
        variables: { 姓名: '张三' },
        conversationHistory: [],
        metadata: {},
      };

      await action.execute(context);

      expect(capturedPrompt).not.toContain('已收集变量');
    });
  });

  describe('不同 action 之间的隔离', () => {
    test('第二个 action 的 currentRound 应该从 0 开始', async () => {
      const config1 = {
        content: '第一个问题',
        max_rounds: 5,
        output: [{ get: '变量1', define: '测试1' }],
      };

      const config2 = {
        content: '第二个问题',
        max_rounds: 10,
        output: [{ get: '变量2', define: '测试2' }],
      };

      const action1 = new AiAskAction('action-1', config1, mockLlmOrchestrator);
      const action2 = new AiAskAction('action-2', config2, mockLlmOrchestrator);

      const context: ActionContext = {
        sessionId: 'test-session',
        phaseId: 'test-phase',
        topicId: 'test-topic',
        actionId: 'action-1',
        variables: {},
        conversationHistory: [],
        metadata: {},
      };

      await action1.execute(context);
      await action1.execute(context, '回答1');

      expect(action1.currentRound).toBe(2);

      expect(action2.currentRound).toBe(0);

      const context2: ActionContext = {
        ...context,
        actionId: 'action-2',
      };
      await action2.execute(context2);
      expect(action2.currentRound).toBe(1);
    });
  });
});
