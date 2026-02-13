/**
 * TopicActionOrchestrator 单元测试
 *
 * 测试范围：
 * - DefaultTopicActionOrchestrator 的行为验证
 * - OrchestrationPlan 和 OrchestrationContext 数据结构验证
 * - 扩展点接口规范验证
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { MonitorAnalysis } from '../../monitors/base-monitor-handler.js';
import { DefaultTopicActionOrchestrator } from '../topic-action-orchestrator.js';
import type {
  OrchestrationPlan,
  OrchestrationContext,
  TopicActionOrchestrator,
} from '../topic-action-orchestrator.js';

describe('DefaultTopicActionOrchestrator', () => {
  let orchestrator: TopicActionOrchestrator;

  beforeEach(() => {
    orchestrator = new DefaultTopicActionOrchestrator();
  });

  describe('shouldTriggerOrchestration', () => {
    it('应该固定返回 false（Story 1.4 扩展点预留）', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户遇阻',
        orchestration_needed: true,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: analysis,
      };

      const result = orchestrator.shouldTriggerOrchestration(analysis, context);

      expect(result).toBe(false);
    });

    it('应该忽略 orchestration_needed 字段（当前版本未实现）', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'off_topic',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'redirect',
        feedback_for_action: '用户偏题',
        orchestration_needed: true, // 即使为 true，也应返回 false
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: analysis,
      };

      const result = orchestrator.shouldTriggerOrchestration(analysis, context);

      expect(result).toBe(false);
    });

    it('应该接受空的执行历史', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: false,
        intervention_reason: 'normal',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '继续执行',
        orchestration_needed: false,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: analysis,
        executionHistory: [],
      };

      const result = orchestrator.shouldTriggerOrchestration(analysis, context);

      expect(result).toBe(false);
    });
  });

  describe('generateOrchestrationPlan', () => {
    it('应该抛出未实现错误', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户遇阻',
        orchestration_needed: true,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: analysis,
      };

      await expect(orchestrator.generateOrchestrationPlan(analysis, context)).rejects.toThrow(
        'TopicActionOrchestrator.generateOrchestrationPlan() 未实现（Story 1.4扩展点预留）'
      );
    });

    it('应该在任何输入下都抛出错误', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: false,
        intervention_reason: 'normal',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '继续执行',
        orchestration_needed: false,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: analysis,
      };

      await expect(orchestrator.generateOrchestrationPlan(analysis, context)).rejects.toThrow();
    });
  });

  describe('executeOrchestrationPlan', () => {
    it('应该抛出未实现错误', async () => {
      const plan: OrchestrationPlan = {
        type: 'insert',
        reason: '插入安抚动作',
        newActions: [
          {
            type: 'ai_say',
            config: { content_template: '我理解你的感受' },
          },
        ],
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: {
          intervention_needed: true,
          intervention_reason: 'blocked',
          intervention_level: 'topic_orchestration',
          strategy_suggestion: 'comfort',
          feedback_for_action: '用户遇阻',
          orchestration_needed: true,
        },
      };

      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow(
        'TopicActionOrchestrator.executeOrchestrationPlan() 未实现（Story 1.4扩展点预留）'
      );
    });

    it('应该在任何计划类型下都抛出错误', async () => {
      const plans: OrchestrationPlan[] = [
        { type: 'insert', reason: '插入动作' },
        { type: 'skip', reason: '跳过动作' },
        { type: 'redirect', reason: '重定向' },
        { type: 'restructure', reason: '重组动作' },
      ];

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: {
          intervention_needed: true,
          intervention_reason: 'blocked',
          intervention_level: 'topic_orchestration',
          strategy_suggestion: 'comfort',
          feedback_for_action: '用户遇阻',
          orchestration_needed: true,
        },
      };

      for (const plan of plans) {
        await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow();
      }
    });
  });
});

describe('OrchestrationPlan 数据结构', () => {
  it('应该支持 insert 类型的计划', () => {
    const plan: OrchestrationPlan = {
      type: 'insert',
      targetPosition: {
        action: 'action-2',
      },
      newActions: [
        {
          type: 'ai_say',
          config: {
            content_template: '我理解你的感受',
          },
        },
      ],
      reason: '插入安抚动作',
      metadata: {
        intervention_reason: 'blocked',
      },
    };

    expect(plan.type).toBe('insert');
    expect(plan.newActions).toHaveLength(1);
    expect(plan.newActions?.[0].type).toBe('ai_say');
    expect(plan.targetPosition?.action).toBe('action-2');
  });

  it('应该支持 skip 类型的计划', () => {
    const plan: OrchestrationPlan = {
      type: 'skip',
      reason: '用户强烈抗拒当前话题',
      metadata: {
        skipped_topic: 'topic-1',
      },
    };

    expect(plan.type).toBe('skip');
    expect(plan.reason).toContain('抗拒');
    expect(plan.newActions).toBeUndefined();
  });

  it('应该支持 redirect 类型的计划', () => {
    const plan: OrchestrationPlan = {
      type: 'redirect',
      targetPosition: {
        phase: 'phase-2',
        topic: 'topic-3',
      },
      reason: '检测到危机情况',
      metadata: {
        crisis_detected: true,
      },
    };

    expect(plan.type).toBe('redirect');
    expect(plan.targetPosition?.phase).toBe('phase-2');
    expect(plan.targetPosition?.topic).toBe('topic-3');
  });

  it('应该支持 restructure 类型的计划', () => {
    const plan: OrchestrationPlan = {
      type: 'restructure',
      reason: '根据用户状态调整动作顺序',
      newActions: [
        { type: 'ai_say', config: { priority: 1 } },
        { type: 'ai_ask', config: { priority: 2 } },
      ],
    };

    expect(plan.type).toBe('restructure');
    expect(plan.newActions).toHaveLength(2);
  });

  it('应该支持最小化的计划结构', () => {
    const plan: OrchestrationPlan = {
      type: 'skip',
      reason: '跳过',
    };

    expect(plan.type).toBe('skip');
    expect(plan.reason).toBe('跳过');
    expect(plan.targetPosition).toBeUndefined();
    expect(plan.newActions).toBeUndefined();
    expect(plan.metadata).toBeUndefined();
  });
});

describe('OrchestrationContext 数据结构', () => {
  it('应该包含完整的上下文信息', () => {
    const context: OrchestrationContext = {
      sessionId: 'test-session',
      currentPhase: 'phase-1',
      currentTopic: 'topic-1',
      currentAction: 'action-1',
      monitorAnalysis: {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户遇阻',
        orchestration_needed: true,
      },
      executionHistory: [
        {
          actionType: 'ai_ask',
          completed: true,
          metrics: {
            information_completeness: '部分完成',
            user_engagement: '低',
          },
        },
      ],
      metadata: {
        retry_count: 2,
      },
    };

    expect(context.sessionId).toBe('test-session');
    expect(context.currentPhase).toBe('phase-1');
    expect(context.monitorAnalysis.intervention_needed).toBe(true);
    expect(context.executionHistory).toHaveLength(1);
    expect(context.metadata?.retry_count).toBe(2);
  });

  it('应该支持最小化的上下文结构', () => {
    const context: OrchestrationContext = {
      sessionId: 'test-session',
      currentPhase: 'phase-1',
      currentTopic: 'topic-1',
      currentAction: 'action-1',
      monitorAnalysis: {
        intervention_needed: false,
        intervention_reason: 'normal',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '继续执行',
        orchestration_needed: false,
      },
    };

    expect(context.sessionId).toBe('test-session');
    expect(context.executionHistory).toBeUndefined();
    expect(context.metadata).toBeUndefined();
  });

  it('应该支持空的执行历史', () => {
    const context: OrchestrationContext = {
      sessionId: 'test-session',
      currentPhase: 'phase-1',
      currentTopic: 'topic-1',
      currentAction: 'action-1',
      monitorAnalysis: {
        intervention_needed: false,
        intervention_reason: 'normal',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '继续执行',
        orchestration_needed: false,
      },
      executionHistory: [],
    };

    expect(context.executionHistory).toEqual([]);
  });
});

describe('TopicActionOrchestrator 接口规范', () => {
  it('应该定义完整的接口方法', () => {
    const orchestrator = new DefaultTopicActionOrchestrator();

    // 验证接口方法存在
    expect(orchestrator.shouldTriggerOrchestration).toBeDefined();
    expect(orchestrator.generateOrchestrationPlan).toBeDefined();
    expect(orchestrator.executeOrchestrationPlan).toBeDefined();

    // 验证方法类型
    expect(typeof orchestrator.shouldTriggerOrchestration).toBe('function');
    expect(typeof orchestrator.generateOrchestrationPlan).toBe('function');
    expect(typeof orchestrator.executeOrchestrationPlan).toBe('function');
  });

  it('应该符合 TopicActionOrchestrator 接口契约', () => {
    const orchestrator: TopicActionOrchestrator = new DefaultTopicActionOrchestrator();

    // TypeScript 编译时类型检查确保接口符合
    expect(orchestrator).toBeInstanceOf(DefaultTopicActionOrchestrator);
  });
});
