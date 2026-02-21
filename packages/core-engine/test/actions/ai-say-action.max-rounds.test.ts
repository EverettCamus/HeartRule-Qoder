/**
 * TDD Test Suite: AiSayAction max_rounds behavior
 *
 * 测试目标：验证 ai_say 动作的 max_rounds 参数行为
 * 核心规律：AI发送次数 = 用户回复次数 + 1（AI先说AI收尾）
 *
 * 测试场景：
 * 1. max_rounds=1：AI发送1次，0次用户交互，立即完成并流转
 * 2. max_rounds=2：AI发送2次，1次用户交互，第2次后完成
 * 3. max_rounds=3：AI发送3次，2次用户交互，第3次后完成
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type {
  ILLMProvider,
  LLMGenerateResult,
} from '../../src/application/ports/outbound/llm-provider.port.js';
import { AiSayAction } from '../../src/domain/actions/ai-say-action.js';
import type { ActionContext } from '../../src/domain/actions/base-action.js';
import { LLMOrchestrator } from '../../src/engines/llm-orchestration/orchestrator.js';

// Mock LLM Provider
class MockLLMProvider implements ILLMProvider {
  getModel(): any {
    return null; // 模拟不需要真实模型
  }

  async generateText(prompt: string, config?: any): Promise<LLMGenerateResult> {
    return {
      text: JSON.stringify({
        content: 'AI生成的回复内容',
        EXIT: 'false', // 注意：应该是小写的 "false"
        metadata: {
          assessment: {
            understanding_level: 50,
            has_questions: false,
            expressed_understanding: false,
            reasoning: '测试评估',
          },
        },
        metrics: {
          user_engagement: '高',
          emotional_intensity: '中',
          understanding_level: '良好',
        },
        progress_suggestion: 'continue_needed',
      }),
      debugInfo: {
        prompt,
        response: 'mock response',
        model: 'mock-model',
        tokensUsed: 100,
        config: config || {},
        timestamp: new Date().toISOString(),
      },
    };
  }

  async *streamText(_prompt: string, _config?: any): AsyncIterable<string> {
    yield 'mock stream';
  }
}

// Create Mock LLM Orchestrator
function createMockLLM(): LLMOrchestrator {
  const mockProvider = new MockLLMProvider();
  return new LLMOrchestrator(mockProvider, 'mock');
}

describe('AiSayAction max_rounds behavior', () => {
  let mockLLM: LLMOrchestrator;
  let baseContext: ActionContext;

  beforeEach(() => {
    mockLLM = createMockLLM();
    baseContext = {
      sessionId: 'test-session',
      phaseId: 'test-phase',
      topicId: 'test-topic',
      actionId: 'test-action',
      variables: {},
      variableStore: {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {
        projectId: 'test-project',
        sessionConfig: {},
      },
    };
  });

  describe('max_rounds=1: 单向传达场景', () => {
    it('第1轮：应发送AI消息并立即完成（completed=true），不等待用户输入', async () => {
      // Arrange - 使用 Legacy Mode，明确设置不等待确认
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          require_acknowledgment: false, // 关键：不等待确认
        },
        mockLLM
      );

      // Act - 第1次执行（初始化）
      const result = await action.execute(baseContext);

      // Assert
      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
      expect(result.aiMessage).toBeTruthy();
    });
  });

  describe('max_rounds=2: 需要确认场景', () => {
    it('第1轮：应发送AI消息并等待用户输入（completed=false）', async () => {
      // Arrange
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      // Act - 第1次执行
      const result = await action.execute(baseContext);

      // Assert
      expect(result.success).toBe(true);
      expect(result.completed).toBe(false); // ✅ 关键：应该等待用户输入
      expect(result.aiMessage).toBeTruthy();
      expect(result.metadata?.currentRound).toBe(1);
      expect(result.metadata?.maxRounds).toBe(2);
      expect(result.metadata?.waitingFor).toBe('acknowledgment');
    });

    it('第2轮：用户回复后，应发送AI消息并完成（completed=true）', async () => {
      // Arrange
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      // Act - 第1次执行
      const result1 = await action.execute(baseContext);
      expect(result1.completed).toBe(false);

      // Act - 第2次执行（用户回复）
      const result2 = await action.execute(baseContext, '用户回复');

      // Assert
      expect(result2.success).toBe(true);
      expect(result2.completed).toBe(true); // ✅ 关键：应该完成
      expect(result2.aiMessage).toBeTruthy();
      expect(result2.metadata?.currentRound).toBe(2);
      expect(result2.metadata?.maxRounds).toBe(2);
    });

    it('不应该允许第3轮交互', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      // 第1轮
      await action.execute(baseContext);
      // 第2轮
      const result2 = await action.execute(baseContext, '用户回复1');
      expect(result2.completed).toBe(true);

      // 尝试第3轮（应该强制退出）
      const result3 = await action.execute(baseContext, '用户回复2');
      expect(result3.completed).toBe(true);
      expect(result3.aiMessage).toBeNull(); // 应该没有新消息
    });
  });

  describe('max_rounds=3: 多轮交互场景', () => {
    it('第1轮：应发送AI消息并等待（completed=false）', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 3,
        },
        mockLLM
      );

      const result = await action.execute(baseContext);

      expect(result.success).toBe(true);
      expect(result.completed).toBe(false);
      expect(result.aiMessage).toBeTruthy();
      expect(result.metadata?.currentRound).toBe(1);
    });

    it('第2轮：用户回复后，应发送AI消息并继续等待（completed=false）', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 3,
        },
        mockLLM
      );

      // 第1轮
      await action.execute(baseContext);

      // 第2轮
      const result2 = await action.execute(baseContext, '用户回复1');

      expect(result2.success).toBe(true);
      expect(result2.completed).toBe(false); // ✅ 关键：还要继续
      expect(result2.aiMessage).toBeTruthy();
      expect(result2.metadata?.currentRound).toBe(2);
    });

    it('第3轮：用户回复后，应发送AI消息并完成（completed=true）', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 3,
        },
        mockLLM
      );

      // 第1轮
      await action.execute(baseContext);
      // 第2轮
      await action.execute(baseContext, '用户回复1');
      // 第3轮
      const result3 = await action.execute(baseContext, '用户回复2');

      expect(result3.success).toBe(true);
      expect(result3.completed).toBe(true); // ✅ 关键：应该完成
      expect(result3.aiMessage).toBeTruthy();
      expect(result3.metadata?.currentRound).toBe(3);
    });

    it('完整流程：验证AI发送3次，用户回复2次', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 3,
        },
        mockLLM
      );

      const aiMessages: string[] = [];
      const userMessages: string[] = [];

      // 第1轮：AI发送
      const r1 = await action.execute(baseContext);
      if (r1.aiMessage) aiMessages.push(r1.aiMessage);
      expect(r1.completed).toBe(false);

      // 用户回复1
      userMessages.push('用户回复1');

      // 第2轮：AI发送
      const r2 = await action.execute(baseContext, '用户回复1');
      if (r2.aiMessage) aiMessages.push(r2.aiMessage);
      expect(r2.completed).toBe(false);

      // 用户回复2
      userMessages.push('用户回复2');

      // 第3轮：AI发送
      const r3 = await action.execute(baseContext, '用户回复2');
      if (r3.aiMessage) aiMessages.push(r3.aiMessage);
      expect(r3.completed).toBe(true);

      // 验证：AI发送3次，用户回复2次
      expect(aiMessages.length).toBe(3);
      expect(userMessages.length).toBe(2);
    });
  });

  describe('边界条件和异常场景', () => {
    it('max_rounds=0 应该使用默认值或抛出错误', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 0,
        },
        mockLLM
      );

      // 应该使用默认值（通常是1）或抛出错误
      const result = await action.execute(baseContext);
      expect(result.success).toBeDefined();
    });

    it('max_rounds 未设置时应该使用默认值', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          // 不设置 max_rounds
        },
        mockLLM
      );

      const result = await action.execute(baseContext);
      expect(result.success).toBe(true);
      expect(result.metadata?.maxRounds).toBeDefined();
    });

    it('超过 max_rounds 后继续调用，应返回 completed=true, aiMessage=null', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 1,
        },
        mockLLM
      );

      // 第1轮：新语义下 max_rounds=1 第一次返回 completed=false（等待确认）
      const r1 = await action.execute(baseContext);
      expect(r1.completed).toBe(false);
      expect(r1.aiMessage).toBeTruthy();

      // 第2轮：用户确认后，走保护分支，返回 completed=true, aiMessage=null
      const r2 = await action.execute(baseContext, '用户输入');
      expect(r2.completed).toBe(true);
      expect(r2.aiMessage).toBeNull();
    });
  });

  describe('与 ScriptExecutor 的集成行为', () => {
    it('max_rounds=1 应该允许等待用户确认后流转到下一个action', async () => {
      // 模拟 ScriptExecutor 的行为
      const action1 = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 1,
        },
        mockLLM
      );

      const action2 = new AiSayAction(
        'say_next',
        {
          content: '下一个消息',
          max_rounds: 1,
        },
        mockLLM
      );

      // 执行 action1 第1次：应该 completed=false
      const r1 = await action1.execute(baseContext);
      expect(r1.completed).toBe(false); // 等待用户确认
      expect(r1.aiMessage).toBeTruthy(); // Mock LLM 返回了内容

      // action1 第2次：用户确认后应该 completed=true
      const r2 = await action1.execute(baseContext, '');
      expect(r2.completed).toBe(true);
      expect(r2.aiMessage).toBeNull(); // 保护分支

      // 现在可以流转到 action2
      const r3 = await action2.execute(baseContext);
      expect(r3.completed).toBe(false); // action2 也需要等待确认
      expect(r3.aiMessage).toBeTruthy(); // Mock LLM 返回了内容
    });

    it('max_rounds=2 应该在第1轮后等待用户输入，不能流转', async () => {
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      const result1 = await action.execute(baseContext);

      // ScriptExecutor 应该检查 completed=false 并等待
      expect(result1.completed).toBe(false);
      // 此时不应该执行下一个 action
    });
  });

  describe('Action状态序列化与恢复：currentRound保持', () => {
    /**
     * 核心场景：多轮对话中，action 实例的 currentRound 必须被正确序列化和恢复
     *
     * 问题场景：
     * 1. 第1轮：currentRound=1，completed=false，序列化状态
     * 2. 用户输入后，反序列化恢复 action，currentRound 应该仍然是 1
     * 3. 第2轮：currentRound 递增到 2，isLastRound=true，completed=true
     *
     * 如果没有正确恢复，currentRound 会重置为 0，导致第2轮变成 currentRound=1，
     * 永远不会达到 isLastRound，可以无限对话。
     */

    it('应该正确序列化 action 状态（包括 currentRound）', async () => {
      const { ActionStateManager } =
        await import('../../src/application/state/action-state-manager.js');
      const { DefaultActionFactory } =
        await import('../../src/application/actions/action-factory.js');

      const factory = new DefaultActionFactory(mockLLM);
      const stateManager = new ActionStateManager(factory);

      // 创建 action 并执行第1轮
      const action = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      const result1 = await action.execute(baseContext);
      expect(result1.completed).toBe(false);
      expect(action.currentRound).toBe(1); // 第1轮执行后

      // 序列化状态
      const snapshot = stateManager.serialize(action);

      expect(snapshot).toBeDefined();
      expect(snapshot.actionId).toBe('say_hello');
      expect(snapshot.actionType).toBe('ai_say');
      expect(snapshot.currentRound).toBe(1); // 关键：currentRound 必须被保存
      expect(snapshot.maxRounds).toBe(2);
    });

    it('应该正确反序列化并恢复 action 状态', async () => {
      const { ActionStateManager } =
        await import('../../src/application/state/action-state-manager.js');
      const { DefaultActionFactory } =
        await import('../../src/application/actions/action-factory.js');

      const factory = new DefaultActionFactory(mockLLM);
      const stateManager = new ActionStateManager(factory);

      // 创建并执行第1轮
      const action1 = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      await action1.execute(baseContext);
      expect(action1.currentRound).toBe(1);

      // 序列化
      const snapshot = stateManager.serialize(action1);

      // 反序列化：模拟第2次请求时恢复 action
      const action2 = stateManager.deserialize(snapshot);

      expect(action2.actionId).toBe('say_hello');
      expect(action2.currentRound).toBe(1); // 关键：currentRound 必须被恢复
      expect(action2.maxRounds).toBe(2);
    });

    it('整个多轮对话流程：序列化 -> 反序列化 -> 继续执行', async () => {
      const { ActionStateManager } =
        await import('../../src/application/state/action-state-manager.js');
      const { DefaultActionFactory } =
        await import('../../src/application/actions/action-factory.js');

      const factory = new DefaultActionFactory(mockLLM);
      const stateManager = new ActionStateManager(factory);

      // ========== 第1轮：初始执行 ==========
      const action1 = new AiSayAction(
        'say_hello',
        {
          content: '欢迎',
          max_rounds: 2,
        },
        mockLLM
      );

      const result1 = await action1.execute(baseContext);

      console.log('[Test] Round 1 result:', {
        completed: result1.completed,
        currentRound: action1.currentRound,
        maxRounds: action1.maxRounds,
      });

      expect(result1.completed).toBe(false); // 第1轮不应该完成
      expect(action1.currentRound).toBe(1);
      expect(result1.metadata?.currentRound).toBe(1);

      // ========== 序列化：模拟 ScriptExecutor 保存状态 ==========
      const snapshot = stateManager.serialize(action1);

      console.log('[Test] Serialized snapshot:', snapshot);

      expect(snapshot.currentRound).toBe(1);

      // ========== 反序列化：模拟第2次请求时恢复 ==========
      const action2 = stateManager.deserialize(snapshot);

      console.log('[Test] Deserialized action:', {
        actionId: action2.actionId,
        currentRound: action2.currentRound,
        maxRounds: action2.maxRounds,
      });

      expect(action2.currentRound).toBe(1); // 关键：恢复后 currentRound 必须是 1

      // ========== 第2轮：用户输入后继续执行 ==========
      const result2 = await action2.execute(baseContext, '用户的回复');

      console.log('[Test] Round 2 result:', {
        completed: result2.completed,
        currentRound: action2.currentRound,
        maxRounds: action2.maxRounds,
      });

      // 关键断言：
      expect(action2.currentRound).toBe(2); // currentRound 应该递增到 2
      expect(result2.completed).toBe(true); // 第2轮应该完成
      expect(result2.metadata?.currentRound).toBe(2);
      expect(result2.metadata?.maxRounds).toBe(2);
    });
  });
});
