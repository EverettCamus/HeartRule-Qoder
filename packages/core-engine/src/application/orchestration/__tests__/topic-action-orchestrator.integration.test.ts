/**
 * TopicActionOrchestrator 集成测试
 *
 * 测试范围：
 * - Topic 动作编排功能的集成流程
 * - 触发编排条件的验证
 * - 编排计划生成与执行的流程验证
 * - 不同编排类型的处理逻辑
 * - 编排结果对执行队列的影响
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { MonitorAnalysis } from '../../monitors/base-monitor-handler.js';
import { DefaultTopicActionOrchestrator } from '../topic-action-orchestrator.js';
import type {
  OrchestrationPlan,
  OrchestrationContext,
  TopicActionOrchestrator,
} from '../topic-action-orchestrator.js';

describe('TopicActionOrchestrator Integration', () => {
  let orchestrator: TopicActionOrchestrator;

  beforeEach(() => {
    orchestrator = new DefaultTopicActionOrchestrator();
  });

  describe('编排触发条件验证', () => {
    it('当 orchestration_needed=true 且 intervention_level="topic_orchestration" 时，应该触发编排（未来实现）', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户严重抗拒当前话题',
        orchestration_needed: true,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-caregiver',
        currentAction: 'ask-father-occupation',
        monitorAnalysis: analysis,
        executionHistory: [
          {
            actionType: 'ai_ask',
            completed: false,
            metrics: {
              information_completeness: '信息不足',
              user_engagement: '极低，连续3轮回避',
              emotional_intensity: '高度焦虑',
              reply_relevance: '不相关回答',
            },
          },
        ],
      };

      // 当前 Story 1.4 阶段固定返回 false
      const result = orchestrator.shouldTriggerOrchestration(analysis, context);
      expect(result).toBe(false);

      // 注：未来实现时，应该返回 true
      // expect(result).toBe(true);
    });

    it('当 intervention_level="action_feedback" 时，不应该触发编排', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'insufficient',
        intervention_level: 'action_feedback', // 仅需话术调整
        strategy_suggestion: 'rephrase',
        feedback_for_action: '建议调整提问方式',
        orchestration_needed: false,
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

    it('当 orchestration_needed=false 时，不应该触发编排', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'insufficient',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'rephrase',
        feedback_for_action: '信息不足',
        orchestration_needed: false, // 明确不需要编排
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
  });

  describe('编排计划生成流程验证', () => {
    it('应该拒绝生成 insert 类型的编排计划（当前版本未实现）', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户严重抗拒',
        orchestration_needed: true,
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

    it('应该拒绝生成 skip 类型的编排计划（当前版本未实现）', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'skip',
        feedback_for_action: '跳过当前话题',
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
        /未实现/
      );
    });

    it('应该拒绝生成 redirect 类型的编排计划（当前版本未实现）', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'off_topic',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'redirect',
        feedback_for_action: '重定向到其他话题',
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
        /未实现/
      );
    });

    it('应该拒绝生成 restructure 类型的编排计划（当前版本未实现）', async () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'insufficient',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'restructure',
        feedback_for_action: '重组动作顺序',
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
        /未实现/
      );
    });
  });

  describe('编排计划执行流程验证', () => {
    it('应该拒绝执行 insert 类型的编排计划（当前版本未实现）', async () => {
      const plan: OrchestrationPlan = {
        type: 'insert',
        targetPosition: {
          action: 'action-2',
        },
        newActions: [
          {
            type: 'ai_say',
            config: {
              content_template: '我理解你的感受，我们可以换个话题',
            },
          },
        ],
        reason: '插入安抚动作',
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

      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow(/未实现/);
    });

    it('应该拒绝执行 skip 类型的编排计划（当前版本未实现）', async () => {
      const plan: OrchestrationPlan = {
        type: 'skip',
        reason: '跳过当前话题',
        metadata: {
          skipped_topic: 'topic-1',
        },
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
          strategy_suggestion: 'skip',
          feedback_for_action: '跳过',
          orchestration_needed: true,
        },
      };

      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow(/未实现/);
    });

    it('应该拒绝执行 redirect 类型的编排计划（当前版本未实现）', async () => {
      const plan: OrchestrationPlan = {
        type: 'redirect',
        targetPosition: {
          phase: 'crisis-phase',
          topic: 'crisis-intervention',
        },
        reason: '检测到危机情况',
        metadata: {
          crisis_detected: true,
        },
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
          strategy_suggestion: 'redirect',
          feedback_for_action: '重定向',
          orchestration_needed: true,
        },
      };

      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow(/未实现/);
    });

    it('应该拒绝执行 restructure 类型的编排计划（当前版本未实现）', async () => {
      const plan: OrchestrationPlan = {
        type: 'restructure',
        reason: '根据用户状态调整动作顺序',
        newActions: [
          { type: 'ai_say', config: { priority: 1 } },
          { type: 'ai_ask', config: { priority: 2 } },
        ],
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-1',
        currentAction: 'action-1',
        monitorAnalysis: {
          intervention_needed: true,
          intervention_reason: 'insufficient',
          intervention_level: 'topic_orchestration',
          strategy_suggestion: 'restructure',
          feedback_for_action: '重组',
          orchestration_needed: true,
        },
      };

      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow(/未实现/);
    });
  });

  describe('编排结果对执行队列的影响验证', () => {
    it('应该验证编排结果的数据结构（未来实现）', async () => {
      // 注：当前版本会抛出异常，未来实现时应返回正确的结果结构
      const plan: OrchestrationPlan = {
        type: 'insert',
        reason: '插入安抚动作',
        newActions: [
          {
            type: 'ai_say',
            config: { content_template: '我理解你' },
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

      // 当前版本抛出异常
      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow();

      // 未来实现时，应该返回如下结构：
      // const result = await orchestrator.executeOrchestrationPlan(plan, context);
      // expect(result).toHaveProperty('success');
      // expect(result.success).toBe(true);
      // expect(result).toHaveProperty('newPosition');
      // expect(result.newPosition).toEqual({
      //   phase: 'phase-1',
      //   topic: 'topic-1',
      //   action: 'action-2', // 插入后的新位置
      // });
    });

    it('应该处理编排失败的情况（未来实现）', async () => {
      // 注：未来实现时，应该返回失败结果而不是抛出异常
      const plan: OrchestrationPlan = {
        type: 'redirect',
        targetPosition: {
          topic: 'non-existent-topic', // 不存在的目标
        },
        reason: '重定向到不存在的话题',
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
          strategy_suggestion: 'redirect',
          feedback_for_action: '重定向',
          orchestration_needed: true,
        },
      };

      // 当前版本抛出异常
      await expect(orchestrator.executeOrchestrationPlan(plan, context)).rejects.toThrow();

      // 未来实现时，应该返回失败结果：
      // const result = await orchestrator.executeOrchestrationPlan(plan, context);
      // expect(result.success).toBe(false);
      // expect(result.error).toContain('目标话题不存在');
    });
  });

  describe('复杂编排场景集成测试', () => {
    it('应该支持连续多次编排（未来实现）', () => {
      // 场景：用户连续3轮抗拒，触发多次编排
      const histories: Array<{ analysis: MonitorAnalysis; expected: boolean }> = [
        {
          // 第1轮：用户回避，仅需话术调整
          analysis: {
            intervention_needed: true,
            intervention_reason: 'insufficient',
            intervention_level: 'action_feedback',
            strategy_suggestion: 'rephrase',
            feedback_for_action: '调整话术',
            orchestration_needed: false,
          },
          expected: false,
        },
        {
          // 第2轮：用户持续回避，仍需话术调整
          analysis: {
            intervention_needed: true,
            intervention_reason: 'insufficient',
            intervention_level: 'action_feedback',
            strategy_suggestion: 'rephrase',
            feedback_for_action: '继续调整话术',
            orchestration_needed: false,
          },
          expected: false,
        },
        {
          // 第3轮：用户严重抗拒，需要动作编排
          analysis: {
            intervention_needed: true,
            intervention_reason: 'blocked',
            intervention_level: 'topic_orchestration',
            strategy_suggestion: 'comfort',
            feedback_for_action: '插入安抚',
            orchestration_needed: true,
          },
          expected: false, // 当前版本固定返回 false，未来应为 true
        },
      ];

      for (const { analysis, expected } of histories) {
        const context: OrchestrationContext = {
          sessionId: 'test-session',
          currentPhase: 'phase-1',
          currentTopic: 'topic-1',
          currentAction: 'action-1',
          monitorAnalysis: analysis,
        };

        const result = orchestrator.shouldTriggerOrchestration(analysis, context);
        expect(result).toBe(expected);
      }
    });

    it('应该根据执行历史做出编排决策（未来实现）', () => {
      const analysis: MonitorAnalysis = {
        intervention_needed: true,
        intervention_reason: 'blocked',
        intervention_level: 'topic_orchestration',
        strategy_suggestion: 'comfort',
        feedback_for_action: '用户持续抗拒',
        orchestration_needed: true,
      };

      const context: OrchestrationContext = {
        sessionId: 'test-session',
        currentPhase: 'phase-1',
        currentTopic: 'topic-caregiver',
        currentAction: 'ask-father-occupation',
        monitorAnalysis: analysis,
        executionHistory: [
          {
            actionType: 'ai_ask',
            completed: false,
            metrics: {
              information_completeness: '信息不足',
              user_engagement: '低',
            },
          },
          {
            actionType: 'ai_ask',
            completed: false,
            metrics: {
              information_completeness: '信息不足',
              user_engagement: '极低',
            },
          },
          {
            actionType: 'ai_ask',
            completed: false,
            metrics: {
              information_completeness: '信息不足',
              user_engagement: '极低，拒绝回答',
            },
          },
        ],
      };

      // 当前版本固定返回 false
      const result = orchestrator.shouldTriggerOrchestration(analysis, context);
      expect(result).toBe(false);

      // 未来实现时，应该根据连续3轮失败的历史触发编排
      // expect(result).toBe(true);
    });
  });
});
