/**
 * ScriptOperations单元测试
 */

import { describe, it, expect } from 'vitest';

import { scriptOperations } from '../ScriptOperations';
import type { PhaseWithTopics } from '../YamlService';

describe('ScriptOperations', () => {
  const createTestPhases = (): PhaseWithTopics[] => [
    {
      phase_id: 'phase_1',
      phase_name: 'Phase 1',
      topics: [
        {
          topic_id: 'topic_1',
          topic_name: 'Topic 1',
          actions: [
            {
              type: 'ai_say' as const,
              ai_say: 'Hello',
              action_id: 'action_1',
            },
            {
              type: 'ai_ask' as const,
              ai_ask: 'What is your name?',
              action_id: 'action_2',
            },
          ],
        },
      ],
    },
  ];

  describe('createActionByType', () => {
    it('应该创建ai_say类型的Action', () => {
      const action = scriptOperations.createActionByType('ai_say', 1);

      expect(action.type).toBe('ai_say');
      expect(action.action_id).toBe('action_1');
      expect(action.ai_say).toBeDefined();
    });

    it('应该创建ai_ask类型的Action', () => {
      const action = scriptOperations.createActionByType('ai_ask', 1);

      expect(action.type).toBe('ai_ask');
      expect(action.action_id).toBe('action_1');
      expect(action.output).toEqual([]);
    });

    it('应该创建use_skill类型的Action', () => {
      const action = scriptOperations.createActionByType('use_skill', 1);

      expect(action.type).toBe('use_skill');
      expect(action.skill).toBe('Skill name');
    });

    it('应该为未知类型返回默认ai_say', () => {
      const action = scriptOperations.createActionByType('unknown_type', 1);

      expect(action.type).toBe('ai_say');
    });
  });

  describe('Phase operations', () => {
    it('addPhase - 应该添加新Phase', () => {
      const phases = createTestPhases();
      const result = scriptOperations.addPhase(phases);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![1].phase_id).toBe('phase_2');
      expect(result.data![1].topics).toHaveLength(1);
    });

    it('deletePhase - 应该删除指定Phase', () => {
      const phases = createTestPhases();
      const result = scriptOperations.deletePhase(phases, 0);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('deletePhase - 应该对无效索引返回错误', () => {
      const phases = createTestPhases();
      const result = scriptOperations.deletePhase(phases, 999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的 Phase 索引');
    });

    it('updatePhase - 应该更新Phase属性', () => {
      const phases = createTestPhases();
      const result = scriptOperations.updatePhase(phases, 0, {
        phase_name: 'Updated Phase',
      });

      expect(result.success).toBe(true);
      expect(result.data![0].phase_name).toBe('Updated Phase');
      expect(result.data![0].phase_id).toBe('phase_1'); // 其他属性不变
    });

    it('movePhase - 应该移动Phase位置', () => {
      const phases = [
        ...createTestPhases(),
        {
          phase_id: 'phase_2',
          topics: [],
        },
      ];

      const result = scriptOperations.movePhase(phases, 0, 1);

      expect(result.success).toBe(true);
      expect(result.data![0].phase_id).toBe('phase_2');
      expect(result.data![1].phase_id).toBe('phase_1');
    });
  });

  describe('Topic operations', () => {
    it('addTopic - 应该添加新Topic', () => {
      const phases = createTestPhases();
      const result = scriptOperations.addTopic(phases, 0);

      expect(result.success).toBe(true);
      expect(result.data![0].topics).toHaveLength(2);
      expect(result.data![0].topics[1].topic_id).toBe('topic_2');
    });

    it('deleteTopic - 应该删除指定Topic', () => {
      const phases = createTestPhases();
      const result = scriptOperations.deleteTopic(phases, 0, 0);

      expect(result.success).toBe(true);
      expect(result.data![0].topics).toHaveLength(0);
    });

    it('deleteTopic - 应该对无效Phase索引返回错误', () => {
      const phases = createTestPhases();
      const result = scriptOperations.deleteTopic(phases, 999, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的 Phase 索引');
    });

    it('updateTopic - 应该更新Topic属性', () => {
      const phases = createTestPhases();
      const result = scriptOperations.updateTopic(phases, 0, 0, {
        topic_name: 'Updated Topic',
      });

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].topic_name).toBe('Updated Topic');
    });

    it('moveTopic - 应该在同一Phase内移动Topic', () => {
      const phases = createTestPhases();
      // 先添加第二个Topic
      phases[0].topics.push({
        topic_id: 'topic_2',
        actions: [],
      });

      const result = scriptOperations.moveTopic(phases, 0, 0, 0, 1);

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].topic_id).toBe('topic_2');
      expect(result.data![0].topics[1].topic_id).toBe('topic_1');
    });
  });

  describe('Action operations', () => {
    it('addAction - 应该添加新Action', () => {
      const phases = createTestPhases();
      const result = scriptOperations.addAction(phases, 0, 0, 'ai_think');

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].actions).toHaveLength(3);
      expect(result.data![0].topics[0].actions[2].type).toBe('ai_think');
    });

    it('deleteAction - 应该删除指定Action', () => {
      const phases = createTestPhases();
      const result = scriptOperations.deleteAction(phases, 0, 0, 1);

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].actions).toHaveLength(1);
      expect(result.data![0].topics[0].actions[0].action_id).toBe('action_1');
    });

    it('deleteAction - 应该拒绝删除最后一个Action', () => {
      const phases = createTestPhases();
      // 先删除到只剩一个
      const deleteResult1 = scriptOperations.deleteAction(phases, 0, 0, 1);

      // 再尝试删除最后一个
      const result = scriptOperations.deleteAction(deleteResult1.data!, 0, 0, 0);

      expect(result.success).toBe(false);
      expect(result.warning).toBe('At least one Action is required');
    });

    it('updateAction - 应该更新Action属性', () => {
      const phases = createTestPhases();
      const result = scriptOperations.updateAction(phases, 0, 0, 0, {
        ai_say: 'Updated content',
      });

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].actions[0].ai_say).toBe('Updated content');
    });

    it('moveAction - 应该在同一Topic内移动Action', () => {
      const phases = createTestPhases();
      const result = scriptOperations.moveAction(phases, 0, 0, 0, 0, 0, 1);

      expect(result.success).toBe(true);
      expect(result.data![0].topics[0].actions[0].action_id).toBe('action_2');
      expect(result.data![0].topics[0].actions[1].action_id).toBe('action_1');
    });

    it('moveAction - 应该对无效索引返回错误', () => {
      const phases = createTestPhases();
      const result = scriptOperations.moveAction(phases, 999, 0, 0, 0, 0, 0);

      expect(result.success).toBe(false);
      expect(result.error).toContain('无效的源 Phase 索引');
    });
  });

  describe('不可变性测试', () => {
    it('操作不应该修改原始数据', () => {
      const phases = createTestPhases();
      const originalJson = JSON.stringify(phases);

      // 执行操作
      scriptOperations.addPhase(phases);
      scriptOperations.addTopic(phases, 0);
      scriptOperations.addAction(phases, 0, 0, 'ai_say');

      // 原始数据应该保持不变
      expect(JSON.stringify(phases)).toBe(originalJson);
    });
  });
});
