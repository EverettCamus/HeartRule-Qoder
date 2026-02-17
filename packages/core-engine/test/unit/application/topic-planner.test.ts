/**
 * Topic Planner Tests
 * Story 2.1: Topic默认Action模板语义与策略定义
 */

import { describe, test, expect, beforeEach } from 'vitest';

import {
  BasicTopicPlanner,
  type TopicPlanningContext,
  type ITopicPlanner,
} from '../../../src/application/planning/topic-planner.js';

describe('BasicTopicPlanner', () => {
  let planner: ITopicPlanner;

  beforeEach(() => {
    planner = new BasicTopicPlanner();
  });

  describe('plan()', () => {
    test('生成基础TopicPlan(直接返回模板)', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test_topic',
          actions: [
            {
              action_id: 'action_1',
              action_type: 'ai_say',
              config: { content: 'Hello' },
            },
          ],
          strategy: '测试策略',
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

      // 验证TopicPlan结构
      expect(plan.topicId).toBe('test_topic');
      expect(plan.plannedAt).toBeDefined();
      expect(plan.instantiatedActions).toHaveLength(1);
      expect(plan.instantiatedActions[0].action_id).toBe('action_1');
      expect(plan.planningContext).toBeDefined();
      expect(plan.planningContext?.strategyUsed).toBe('测试策略');
    });

    test('返回深拷贝的actions(不修改原始模板)', async () => {
      const originalActions = [
        {
          action_id: 'action_1',
          action_type: 'ai_say',
          config: { content: 'Original' },
        },
      ];

      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: originalActions,
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      // 修改实例化队列不应影响原始模板
      plan.instantiatedActions[0].config!.content = 'Modified';

      expect(originalActions[0].config!.content).toBe('Original');
      expect(plan.instantiatedActions[0].config!.content).toBe('Modified');
    });

    test('捕获变量快照', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: [],
          strategy: '',
        },
        variableStore: {
          global: {},
          session: { 用户名: { value: '测试用户' } },
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.planningContext?.variableSnapshot).toBeDefined();
      expect(plan.planningContext?.variableSnapshot.session).toEqual({
        用户名: { value: '测试用户' },
      });
    });

    test('处理空actions列表', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'empty_topic',
          actions: [],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.instantiatedActions).toHaveLength(0);
      expect(plan.topicId).toBe('empty_topic');
    });

    test('处理无strategy的Topic', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: [
            {
              action_id: 'a1',
              action_type: 'ai_say',
            },
          ],
          // 无strategy字段
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.planningContext?.strategyUsed).toBe('');
    });

    test('处理复杂嵌套的Action配置', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'complex',
          actions: [
            {
              action_id: 'ask_1',
              action_type: 'ai_ask',
              config: {
                content: '您和{抚养者}的关系如何?',
                output: [
                  {
                    get: '{抚养者}_关系',
                    define: '关系描述',
                  },
                ],
                max_rounds: 3,
              },
            },
          ],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect(plan.instantiatedActions).toHaveLength(1);
      expect(plan.instantiatedActions[0].config).toBeDefined();
      expect(plan.instantiatedActions[0].config!.content).toContain('{抚养者}');
      expect(plan.instantiatedActions[0].config!.max_rounds).toBe(3);
    });

    test('plannedAt使用ISO时间格式', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: [],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      // 验证ISO格式
      expect(() => new Date(plan.plannedAt)).not.toThrow();
      expect(plan.plannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('多次规划生成不同的plannedAt', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: [],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan1 = await planner.plan(context);
      // 等待1ms确保时间戳不同
      await new Promise((resolve) => setTimeout(resolve, 1));
      const plan2 = await planner.plan(context);

      expect(plan1.plannedAt).not.toBe(plan2.plannedAt);
    });

    test('保留Action的所有额外字段', async () => {
      const context: TopicPlanningContext = {
        topicConfig: {
          topic_id: 'test',
          actions: [
            {
              action_id: 'a1',
              action_type: 'ai_say',
              config: { content: 'Hello' },
              // 额外字段
              customField: 'custom_value',
              metadata: { key: 'value' },
            },
          ],
        },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {},
        },
        sessionContext: {
          sessionId: 's1',
          phaseId: 'p1',
          conversationHistory: [],
        },
      };

      const plan = await planner.plan(context);

      expect((plan.instantiatedActions[0] as any).customField).toBe('custom_value');
      expect((plan.instantiatedActions[0] as any).metadata).toEqual({ key: 'value' });
    });
  });
});
