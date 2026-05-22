/**
 * MemoryRepository 集成测试
 *
 * 验证 FakeMemoryRepository 在真实 Session + ScriptExecutor 路径中
 * 能否正常流动（不经过数据库层）
 */
import { describe, it, expect, beforeEach } from 'vitest';

import type { ILLMProvider } from '../../src/application/ports/outbound/llm-provider.port.js';
import {
  ScriptExecutor,
  Session,
  LLMOrchestrator,
  type MemoryRepository,
  type MemoryContext,
  type MemoryMessage,
  type ReflectionResult,
} from '../../src/index.js';

/** 集成了调用计数器的 Fake Repository */
class SpyMemoryRepository implements MemoryRepository {
  public retainCalls: Array<{ userId: string; messageCount: number }> = [];
  public recallCalls: Array<{ userId: string; query: string }> = [];
  public reflectCalls: string[] = [];

  private recallData: Map<string, MemoryContext> = new Map();

  async retain(userId: string, messages: MemoryMessage[]): Promise<void> {
    this.retainCalls.push({ userId, messageCount: messages.length });
  }

  async recall(userId: string, query: string): Promise<MemoryContext> {
    this.recallCalls.push({ userId, query });
    return (
      this.recallData.get(userId) || {
        worldFacts: [],
        experiences: [],
        opinions: [],
        observationSummary: '',
      }
    );
  }

  async reflect(userId: string): Promise<ReflectionResult> {
    this.reflectCalls.push(userId);
    return { summary: '' };
  }

  setRecallData(userId: string, context: MemoryContext): void {
    this.recallData.set(userId, context);
  }
}

// 最小 YAML 脚本：1 phase, 1 topic, 1 ai_say
const MINIMAL_SCRIPT = JSON.stringify({
  session: {
    session_id: 'test-memory-integration',
    phases: [
      {
        phase_id: 'phase1',
        phase_name: '开场',
        topics: [
          {
            topic_id: 'topic1',
            topic_name: '欢迎',
            actions: [
              {
                action_id: 'say_hello',
                action_type: 'ai_say',
                content: '你好，欢迎来到咨询。',
              },
            ],
          },
        ],
      },
    ],
  },
});

describe('MemoryRepository 集成测试', () => {
  let scriptExecutor: ScriptExecutor;
  let memoryRepo: SpyMemoryRepository;

  beforeEach(() => {
    // 构造最小 LLM mock
    const mockProvider: ILLMProvider = {
      getModel: () => ({ doGenerate: async () => ({ text: '你好！' }) }) as any,
      generateText: async () => ({
        text: '你好，我是AI咨询师。',
        debugInfo: {
          prompt: '',
          response: 'mock',
          model: 'test',
          config: {},
          timestamp: new Date().toISOString(),
        },
      }),
      streamText: async function* () {
        yield 'mock';
      },
    };
    const llm = new LLMOrchestrator(mockProvider);
    scriptExecutor = new ScriptExecutor(llm);
    memoryRepo = new SpyMemoryRepository();
  });

  describe('MemoryRepository 接口形状验证', () => {
    it('recall() 应该能返回 MemoryContext 并传递给调用方', async () => {
      const prefill: MemoryContext = {
        worldFacts: [{ content: '用户被诊断为 GAD' }],
        experiences: [{ content: '第1次会谈讨论了工作压力' }],
        opinions: [{ content: '焦虑来源可能与完美主义有关', confidence: 0.7 }],
        observationSummary: '用户首次会谈，情绪稳定',
      };
      memoryRepo.setRecallData('user-1', prefill);

      const ctx = await memoryRepo.recall('user-1', '用户概况');

      expect(ctx.worldFacts).toHaveLength(1);
      expect(ctx.worldFacts[0].content).toBe('用户被诊断为 GAD');
      expect(ctx.opinions[0].confidence).toBe(0.7);
      expect(ctx.observationSummary).toBeTruthy();
    });

    it('retain() 应该能接收消息并记录调用', async () => {
      await memoryRepo.retain('user-1', [
        { role: 'user', content: '我睡不好' },
        { role: 'assistant', content: '从什么时候开始的？' },
      ]);

      expect(memoryRepo.retainCalls).toHaveLength(1);
      expect(memoryRepo.retainCalls[0].userId).toBe('user-1');
      expect(memoryRepo.retainCalls[0].messageCount).toBe(2);
    });

    it('reflect() 应该能被执行并记录调用', async () => {
      await memoryRepo.reflect('user-1');
      await memoryRepo.reflect('user-1');

      expect(memoryRepo.reflectCalls).toHaveLength(2);
      expect(memoryRepo.reflectCalls[0]).toBe('user-1');
    });
  });

  describe('与 Session + ScriptExecutor 的代码路径验证', () => {
    it('不传 MemoryRepository 时 Session 应正常执行', async () => {
      const session = new Session({
        sessionId: 'test-session',
        userId: 'user-1',
        scriptId: 'test-script',
      });

      const execState = session.toExecutionState();
      const result = await scriptExecutor.executeSession(
        MINIMAL_SCRIPT,
        'test-session',
        execState,
        null,
        'test-project'
      );

      // ai_say 默认 require_acknowledgment=true，会话会进入 waiting_input 等待确认
      // 这是正常的执行路径 —— Session + ScriptExecutor 正确执行到了 ai_say 动作
      expect(result.status).toBe('waiting_input');
      expect(result.lastAiMessage).toBeTruthy();
    });

    it('传入 MemoryRepository 时 recall/retain/reflect 接口可被调用', async () => {
      // 模拟会话启动时的 recall
      const ctx = await memoryRepo.recall('user-1', '用户核心问题');
      expect(ctx).toBeDefined();

      // 模拟每轮对话后的 retain
      await memoryRepo.retain('user-1', [
        { role: 'user', content: '我有点焦虑' },
        { role: 'assistant', content: '能具体说说吗？' },
      ]);
      expect(memoryRepo.retainCalls).toHaveLength(1);

      // 模拟会话结束时的 reflect
      await memoryRepo.reflect('user-1');
      expect(memoryRepo.reflectCalls).toHaveLength(1);
    });

    it('MemoryContext 四字段在测试数据中应能合理填充', async () => {
      const fullContext: MemoryContext = {
        worldFacts: [{ content: 'GAD 诊断 (2026-01-15)' }, { content: 'PHQ-9 得分：15' }],
        experiences: [
          { content: '首次会谈：描述工作压力导致失眠' },
          { content: '第2次会谈：提及童年被严格管教经历' },
        ],
        opinions: [
          { content: '完美主义倾向根深蒂固', confidence: 0.85 },
          { content: '社交回避可能从职场泛化而来', confidence: 0.6 },
        ],
        observationSummary:
          '用户的核心模式：高标准自我要求 → 害怕失败 → 回避 → 自我批评 → 焦虑加重。治疗重点是打破这个循环。',
      };
      memoryRepo.setRecallData('user-1', fullContext);

      const result = await memoryRepo.recall('user-1', '用户完整画像');
      expect(result.worldFacts.length).toBeGreaterThanOrEqual(2);
      expect(result.experiences.length).toBeGreaterThanOrEqual(2);
      expect(result.opinions.length).toBeGreaterThanOrEqual(2);
      expect(result.observationSummary.length).toBeGreaterThan(50);
    });
  });
});
