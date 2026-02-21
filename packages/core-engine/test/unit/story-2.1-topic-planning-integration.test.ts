/**
 * Story 2.1集成测试：Topic默认Action模板语义与策略定义
 *
 * 验证：
 * 1. ScriptExecutor支持TopicPlanner依赖注入
 * 2. 进入Topic时自动触发规划
 * 3. 从实例化队列读取Actions执行
 * 4. 向后兼容性：无规划时使用原始actions
 * 5. ExecutionState正确存储TopicPlan
 */

import { describe, it, expect, vi } from 'vitest';

import type { ITopicPlanner } from '../../src/application/planning/topic-planner.js';
import { BasicTopicPlanner } from '../../src/application/planning/topic-planner.js';
import {
  ScriptExecutor,
  type ExecutionState,
  ExecutionStatus,
} from '../../src/engines/script-execution/script-executor.js';
import type { ActionConfig } from '@heartrule/shared-types';
import { LLMOrchestrator } from '../../src/engines/llm-orchestration/orchestrator.js';
import type { ILLMProvider } from '../../src/application/ports/outbound/llm-provider.port.js';

// 创建 mock LLM provider
function createMockLLM(): LLMOrchestrator {
  const mockProvider: ILLMProvider = {
    getModel: vi.fn().mockReturnValue({
      doGenerate: vi.fn().mockResolvedValue({
        text: '模拟的AI响应',
        finishReason: 'stop',
      }),
    }),
    generateText: vi.fn().mockResolvedValue({
      text: '模拟的AI响应',
      debugInfo: {
        prompt: 'test',
        response: {},
        model: 'test-model',
        config: {},
        timestamp: new Date().toISOString(),
      },
    }),
    streamText: vi.fn().mockReturnValue((async function* () {
      yield '模拟';
      yield '响应';
    })()),
  };
  return new LLMOrchestrator(mockProvider);
}

describe('Story 2.1集成：Topic Planning Integration', () => {
  describe('1. TopicPlanner依赖注入', () => {
    it('应该接受TopicPlanner通过构造函数注入', () => {
      const mockPlanner: ITopicPlanner = {
        plan: vi.fn().mockResolvedValue({
          topicId: 'test_topic',
          plannedAt: new Date().toISOString(),
          instantiatedActions: [],
        }),
      };

      const executor = new ScriptExecutor(
        createMockLLM(),
        undefined,
        undefined,
        undefined,
        undefined,
        mockPlanner
      );

      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该在注入TopicPlanner时记录日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockPlanner: ITopicPlanner = {
        plan: vi.fn().mockResolvedValue({
          topicId: 'test',
          plannedAt: new Date().toISOString(),
          instantiatedActions: [],
        }),
      };

      new ScriptExecutor(createMockLLM(), undefined, undefined, undefined, undefined, mockPlanner);

      const logCalls = consoleSpy.mock.calls;
      const hasLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('Using injected TopicPlanner')
      );
      expect(hasLog).toBe(true);

      consoleSpy.mockRestore();
    });

    it('应该在无参数时创建默认BasicTopicPlanner', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const executor = new ScriptExecutor(createMockLLM());

      expect(executor).toBeInstanceOf(ScriptExecutor);
      const logCalls = consoleSpy.mock.calls;
      const hasLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('Created default BasicTopicPlanner')
      );
      expect(hasLog).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('2. Topic规划触发逻辑', () => {
    it('首次进入Topic时应该触发规划', () => {
      const executor = new ScriptExecutor(createMockLLM());
      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      // 使用私有方法的测试技巧：通过反射调用
      const shouldPlan = (executor as any).shouldPlanTopic(executionState, 'topic_1');

      expect(shouldPlan).toBe(true);
    });

    it('进入不同Topic时应该重新规划', () => {
      const executor = new ScriptExecutor(createMockLLM());
      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        currentTopicPlan: {
          topicId: 'topic_1',
          plannedAt: new Date().toISOString(),
          instantiatedActions: [],
        },
      };

      const shouldPlan = (executor as any).shouldPlanTopic(executionState, 'topic_2');

      expect(shouldPlan).toBe(true);
    });

    it('同一Topic内继续执行时不应重新规划', () => {
      const executor = new ScriptExecutor(createMockLLM());
      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        currentTopicPlan: {
          topicId: 'topic_1',
          plannedAt: new Date().toISOString(),
          instantiatedActions: [],
        },
      };

      const shouldPlan = (executor as any).shouldPlanTopic(executionState, 'topic_1');

      expect(shouldPlan).toBe(false);
    });
  });

  describe('3. Topic规划执行', () => {
    it('规划后应该将TopicPlan存储到ExecutionState', async () => {
      const mockPlanner: ITopicPlanner = {
        plan: vi.fn().mockResolvedValue({
          topicId: 'test_topic',
          plannedAt: '2024-01-01T00:00:00Z',
          instantiatedActions: [
            { action_id: 'action_1', action_type: 'ai_say', config: { content: 'Planned' } },
          ],
          planningContext: {
            variableSnapshot: {},
            strategyUsed: '测试策略',
          },
        }),
      };

      const executor = new ScriptExecutor(
        createMockLLM(),
        undefined,
        undefined,
        undefined,
        undefined,
        mockPlanner
      );

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const topicConfig = {
        topic_id: 'test_topic',
        strategy: '测试策略',
        actions: [
          { action_id: 'original_action', action_type: 'ai_say', config: { content: 'Original' } },
        ],
      };

      await (executor as any).planCurrentTopic(topicConfig, executionState, 'session_1', 'phase_1');

      // 验证ExecutionState存储了规划结果
      expect(executionState.currentTopicPlan).toBeDefined();
      expect(executionState.currentTopicPlan?.topicId).toBe('test_topic');
      expect(executionState.currentTopicPlan?.instantiatedActions.length).toBe(1);
      expect(executionState.currentTopicPlan?.instantiatedActions[0].action_id).toBe('action_1');

      // 验证规划器被正确调用
      expect(mockPlanner.plan).toHaveBeenCalledTimes(1);
      expect(mockPlanner.plan).toHaveBeenCalledWith(
        expect.objectContaining({
          topicConfig: expect.objectContaining({
            topic_id: 'test_topic',
            strategy: '测试策略',
          }),
          sessionContext: expect.objectContaining({
            sessionId: 'session_1',
            phaseId: 'phase_1',
          }),
        })
      );
    });

    it('规划后应该重置Action索引到0', async () => {
      const mockPlanner: ITopicPlanner = {
        plan: vi.fn().mockResolvedValue({
          topicId: 'test_topic',
          plannedAt: '2024-01-01T00:00:00Z',
          instantiatedActions: [],
        }),
      };

      const executor = new ScriptExecutor(
        createMockLLM(),
        undefined,
        undefined,
        undefined,
        undefined,
        mockPlanner
      );

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 5, // 初始非0
        currentAction: null,
        variables: {},
        variableStore: { global: {}, session: {}, phase: {}, topic: {} },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      await (executor as any).planCurrentTopic(
        { topic_id: 'test_topic', actions: [] },
        executionState,
        'session_1',
        'phase_1'
      );

      // planCurrentTopic 不再自动重置 currentActionIdx
      // 索引的重置由 executeTopic 中的逻辑处理（只在首次规划时重置）
      expect(executionState.currentActionIdx).toBe(5); // 保持原值
    });
  });

  describe('4. Action队列读取逻辑', () => {
    it('有实例化队列时应该优先使用实例化队列', () => {
      const executor = new ScriptExecutor(createMockLLM());

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        currentTopicPlan: {
          topicId: 'test_topic',
          plannedAt: '2024-01-01T00:00:00Z',
          instantiatedActions: [
            { action_id: 'instantiated_1', action_type: 'ai_say', config: { content: 'From Plan' } },
          ],
        },
      };

      const topicConfig = {
        topic_id: 'test_topic',
        actions: [
          { action_id: 'original_1', action_type: 'ai_say', config: { content: 'Original' } },
        ],
      };

      const actions = (executor as any).getTopicActions(topicConfig, executionState);

      expect(actions.length).toBe(1);
      expect(actions[0].action_id).toBe('instantiated_1');
      expect(actions[0].config.content).toBe('From Plan');
    });

    it('无规划时应该回退到原始actions', () => {
      const executor = new ScriptExecutor(createMockLLM());

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        // 无currentTopicPlan
      };

      const topicConfig = {
        topic_id: 'test_topic',
        actions: [
          { action_id: 'original_1', action_type: 'ai_say', config: { content: 'Original' } },
        ],
      };

      const actions = (executor as any).getTopicActions(topicConfig, executionState);

      expect(actions.length).toBe(1);
      expect(actions[0].action_id).toBe('original_1');
      expect(actions[0].config.content).toBe('Original');
    });

    it('Topic ID不匹配时应该回退到原始actions', () => {
      const executor = new ScriptExecutor(createMockLLM());

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        currentTopicPlan: {
          topicId: 'different_topic',
          plannedAt: '2024-01-01T00:00:00Z',
          instantiatedActions: [
            { action_id: 'wrong_action', action_type: 'ai_say', config: {} },
          ],
        },
      };

      const topicConfig = {
        topic_id: 'test_topic',
        actions: [
          { action_id: 'original_1', action_type: 'ai_say', config: { content: 'Original' } },
        ],
      };

      const actions = (executor as any).getTopicActions(topicConfig, executionState);

      expect(actions.length).toBe(1);
      expect(actions[0].action_id).toBe('original_1');
    });
  });

  describe('5. BasicTopicPlanner行为验证', () => {
    it('BasicTopicPlanner应该返回深拷贝的actions', async () => {
      const planner = new BasicTopicPlanner();

      const originalActions: ActionConfig[] = [
        { action_id: 'action_1', action_type: 'ai_say', config: { content: 'Original' } },
      ];

      const context = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: originalActions,
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 'session_1',
          phaseId: 'phase_1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      // 修改实例化队列不应影响原始配置
      expect(plan.instantiatedActions.length).toBe(1);
      const instantiatedConfig = plan.instantiatedActions[0]?.config;
      const originalConfig = originalActions[0]?.config;
      
      if (instantiatedConfig && originalConfig) {
        instantiatedConfig.content = 'Modified';
        expect(originalConfig.content).toBe('Original');
        expect(instantiatedConfig.content).toBe('Modified');
      } else {
        throw new Error('Config should be defined');
      }
    });

    it('BasicTopicPlanner应该捕获变量快照', async () => {
      const planner = new BasicTopicPlanner();

      const context = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: [],
        },
        variableStore: {
          global: { 
            global_var: { value: 'global_value', type: 'string' } 
          },
          session: { 
            session_var: { value: 'session_value', type: 'string' } 
          },
          phase: { 
            phase_1: { 
              phase_var: { value: 'phase_value', type: 'string' } 
            } 
          },
          topic: { 
            topic_1: { 
              topic_var: { value: 'topic_value', type: 'string' } 
            } 
          },
        },
        sessionContext: {
          sessionId: 'session_1',
          phaseId: 'phase_1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.planningContext?.variableSnapshot).toBeDefined();
      // 变量快照会包含完整的VariableValue对象
      expect(plan.planningContext?.variableSnapshot.global).toBeDefined();
      expect(plan.planningContext?.variableSnapshot.session).toBeDefined();
    });

    it('BasicTopicPlanner应该记录strategy', async () => {
      const planner = new BasicTopicPlanner();

      const context = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: [],
          strategy: '测试策略描述',
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 'session_1',
          phaseId: 'phase_1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.planningContext?.strategyUsed).toBe('测试策略描述');
    });

    it('BasicTopicPlanner无strategy时应该使用空字符串', async () => {
      const planner = new BasicTopicPlanner();

      const context = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: [],
          // 无strategy字段
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 'session_1',
          phaseId: 'phase_1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.planningContext?.strategyUsed).toBe('');
    });
  });

  describe('6. 向后兼容性测试', () => {
    it('无TopicPlanner注入时应该使用默认实现', () => {
      const executor = new ScriptExecutor(createMockLLM());

      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('无strategy字段的Topic应该正常执行', async () => {
      const executor = new ScriptExecutor(createMockLLM());

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        variableStore: { global: {}, session: {}, phase: {}, topic: {} },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const topicConfig = {
        topic_id: 'test_topic',
        // 无strategy字段
        actions: [
          { action_id: 'action_1', action_type: 'ai_say', config: { content: 'Test' } },
        ],
      };

      await (executor as any).planCurrentTopic(topicConfig, executionState, 'session_1', 'phase_1');

      expect(executionState.currentTopicPlan).toBeDefined();
      expect(executionState.currentTopicPlan?.topicId).toBe('test_topic');
    });
  });

  describe('7. 边界情况测试', () => {
    it('应该处理undefined TopicPlanner参数', () => {
      const executor = new ScriptExecutor(
        createMockLLM(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined
      );

      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该处理空actions列表', async () => {
      const planner = new BasicTopicPlanner();

      const context = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: [],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 'session_1',
          phaseId: 'phase_1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.instantiatedActions).toEqual([]);
    });

    it('getTopicActions应该处理undefined currentTopicPlan', () => {
      const executor = new ScriptExecutor(createMockLLM());

      const executionState: ExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        currentTopicPlan: undefined,
      };

      const topicConfig = {
        topic_id: 'test_topic',
        actions: [{ action_id: 'action_1', action_type: 'ai_say', config: {} }],
      };

      const actions = (executor as any).getTopicActions(topicConfig, executionState);

      expect(actions.length).toBe(1);
      expect(actions[0].action_id).toBe('action_1');
    });
  });
});
