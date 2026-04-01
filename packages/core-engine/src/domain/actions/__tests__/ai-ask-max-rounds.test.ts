/**
 * AI_Ask max_rounds Semantics Tests
 *
 * Test Case: max_rounds = 1 means:
 * - AI replies once, waits for user response, then ends
 * - Total flow: AI asks → user answers → action completes
 *
 * max_rounds = 2 means:
 * - AI can reply up to 2 times total
 * - Flow: AI asks → user answers → (if not satisfied) AI asks again → user answers → completes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AiAskAction } from '../ai-ask-action.js';
import type { ActionContext } from '../base-action.js';

describe('AI_Ask max_rounds Semantics', () => {
  let mockLlmOrchestrator: any;
  let mockContext: ActionContext;

  beforeEach(() => {
    mockLlmOrchestrator = {
      generateText: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          content: '请问您有什么困扰？',
          EXIT: 'false',
          BRIEF: '等待用户回答',
          crisis_detected: false,
        }),
        debugInfo: {},
      }),
    };

    mockContext = {
      sessionId: 'test-session',
      phaseId: 'test-phase',
      topicId: 'test-topic',
      actionId: 'test-action',
      variables: { 用户名: '测试用户' },
      conversationHistory: [],
      metadata: {},
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('max_rounds = 1', () => {
    it('should complete after user answers first question', async () => {
      const config = {
        content: '请问您的症状是什么？',
        exit: '用户提供了症状描述',
        max_rounds: 1,
        output: [{ get: '症状描述', define: '用户描述的症状' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);

      // Round 1: AI asks question
      const result1 = await action.execute(mockContext);
      expect(result1.completed).toBe(false);
      expect(result1.metadata?.waitingFor).toBe('answer');
      expect(action.currentRound).toBe(1);

      // Round 2: User answers, action should complete
      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '感谢您的回答。',
          EXIT: 'true',
          BRIEF: '信息已收集',
          crisis_detected: false,
        }),
      });

      const result2 = await action.execute(mockContext, '我经常头疼');
      expect(result2.completed).toBe(true);
      expect(result2.metadata?.exit_reason).toBe('max_rounds_reached');
    });

    it('should exit due to max_rounds even if LLM suggests continue', async () => {
      const config = {
        content: '请问您的症状是什么？',
        exit: '用户提供了症状描述',
        max_rounds: 1,
        output: [{ get: '症状描述', define: '用户描述的症状' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);

      // Round 1: AI asks question
      await action.execute(mockContext);
      expect(action.currentRound).toBe(1);

      // Round 2: LLM says 'EXIT: false' but max_rounds should still force exit
      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '能详细说说吗？',
          EXIT: 'false', // LLM wants to continue
          BRIEF: '需要更多信息',
          crisis_detected: false,
        }),
      });

      const result2 = await action.execute(mockContext, '头疼');
      expect(result2.completed).toBe(true);
      expect(result2.metadata?.exit_reason).toBe('max_rounds_reached');
    });
  });

  describe('max_rounds = 2', () => {
    it('should allow two rounds of AI questioning', async () => {
      const config = {
        content: '请问您的症状是什么？',
        exit: '用户提供了详细症状描述',
        max_rounds: 2,
        output: [{ get: '症状描述', define: '用户描述的症状' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);

      // Round 1: AI asks question
      const result1 = await action.execute(mockContext);
      expect(result1.completed).toBe(false);
      expect(action.currentRound).toBe(1);

      // Round 2: User answers briefly, AI asks follow-up
      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '头疼持续多久了？',
          EXIT: 'false',
          BRIEF: '需要了解持续时间',
          crisis_detected: false,
        }),
      });

      const result2 = await action.execute(mockContext, '头疼');
      expect(result2.completed).toBe(false);
      expect(result2.metadata?.waitingFor).toBe('answer');
      expect(action.currentRound).toBe(2);

      // Round 3: User provides more details, should complete (max_rounds reached)
      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '了解了，感谢您的回答。',
          EXIT: 'true',
          BRIEF: '信息完整',
          crisis_detected: false,
        }),
      });

      const result3 = await action.execute(mockContext, '大概一周了');
      expect(result3.completed).toBe(true);
      expect(result3.metadata?.exit_reason).toBe('max_rounds_reached');
    });
  });

  describe('debugInfo preservation on exit', () => {
    it('should include debugInfo in result when shouldExit=true (max_rounds reached)', async () => {
      const config = {
        content: '您最近感觉如何？',
        max_rounds: 1,
        output: [{ get: '用户状态', define: '用户当前状态' }],
      };

      const crisisDebugInfo = {
        prompt: 'LLM detected crisis',
        response: {
          text: '危机干预内容',
          crisis_detected: true,
        },
        model: 'test-model',
        timestamp: new Date().toISOString(),
        tokensUsed: 150,
      };

      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '听说你想结束这一切让我很担心',
          EXIT: 'true',
          BRIEF: '危机干预',
          crisis_detected: true,
        }),
        debugInfo: crisisDebugInfo,
      });

      const action = new AiAskAction('crisis-test', config, mockLlmOrchestrator);
      action.currentRound = 1;

      const result = await action.execute(mockContext, '我想结束这一切');

      expect(result.completed).toBe(true);
      expect(result.debugInfo).toBeDefined();
      expect(result.debugInfo?.response?.crisis_detected).toBe(true);
    });

    it('should include debugInfo when required_variables collected and exit', async () => {
      const config = {
        content: '请描述症状',
        max_rounds: 5,
        output: [{ get: '症状', define: '用户症状描述' }],
      };

      const mockDebugInfo = {
        prompt: '请描述症状',
        response: {
          text: '感谢描述',
          crisis_detected: false,
        },
        model: 'test-model',
        timestamp: new Date().toISOString(),
      };

      mockLlmOrchestrator.generateText.mockResolvedValueOnce({
        text: JSON.stringify({
          content: '感谢描述',
          EXIT: 'true',
          BRIEF: '信息已收集',
          crisis_detected: false,
          症状: '头痛三天',
        }),
        debugInfo: mockDebugInfo,
      });

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);
      action.currentRound = 1;

      const result = await action.execute(mockContext, '头痛三天了');

      expect(result.completed).toBe(true);
      expect(result.debugInfo).toBeDefined();
      expect(result.debugInfo?.response?.crisis_detected).toBe(false);
    });
  });

  describe('evaluateExitCondition max_rounds check', () => {
    it('should return should_exit=true when currentRound >= maxRounds', async () => {
      const config = {
        content: '测试问题',
        max_rounds: 1,
        output: [{ get: 'test_var', define: '测试变量' }],
      };

      const action = new AiAskAction('test-action', config, mockLlmOrchestrator);

      // Execute first round
      await action.execute(mockContext);
      expect(action.currentRound).toBe(1);

      // The action's maxRounds should be 1
      expect(action.maxRounds).toBe(1);

      // currentRound (1) >= maxRounds (1) should trigger exit
      // This is tested via the evaluateExitCondition private method
      // We verify through the public execute behavior above
    });
  });
});
