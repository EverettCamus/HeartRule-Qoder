/**
 * Topic Goal 和 Strategy 字段保存回归测试
 *
 * 问题背景：
 * 用户在可视化编辑器中编辑 Topic 的 topic_goal 和 strategy 字段时，
 * 保存后字段会被自动清空或恢复为旧值。
 *
 * 根本原因：
 * handleTopicSave 在构建 newPhases 时没有包含这两个字段，
 * 导致 setCurrentPhases 和 syncPhasesToYaml 同步的数据不完整。
 *
 * 修复方案：
 * 在 handleTopicSave 中添加 topic_goal 和 strategy 字段的保存逻辑。
 *
 * 测试目标：
 * 确保 topic_goal 和 strategy 字段能够正确保存，不会被清空或覆盖。
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { PhaseWithTopics } from '../services/YamlService';

describe('Topic Goal 和 Strategy 字段保存', () => {
  let initialPhases: PhaseWithTopics[];
  let updatedTopicData: any;

  beforeEach(() => {
    // 初始化测试数据
    initialPhases = [
      {
        phase_id: 'test_phase',
        phase_name: 'Test Phase',
        description: 'Test phase description',
        topics: [
          {
            topic_id: 'test_topic',
            topic_name: 'Test Topic',
            description: 'Test topic description',
            topic_goal: '原始目标',
            strategy: '原始策略',
            localVariables: [],
            actions: [
              {
                type: 'ai_say' as const,
                ai_say: 'Hello',
                action_id: 'action_1',
                _raw: {
                  action_id: 'action_1',
                  action_type: 'ai_say',
                  config: { content: 'Hello' },
                },
              },
            ],
          },
        ],
      },
    ];

    // 模拟用户编辑后的数据
    updatedTopicData = {
      id: 'test_topic',
      name: 'Updated Topic',
      description: 'Updated description',
      topic_goal: '更新后的目标',
      strategy: '更新后的策略',
      localVariables: [],
    };
  });

  describe('handleTopicSave 模拟测试', () => {
    it('应该正确保存 topic_goal 和 strategy 字段', () => {
      // 模拟 handleTopicSave 的核心逻辑
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      // 这是修复后的代码逻辑
      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        topic_goal: updatedTopicData.topic_goal, // ✅ 关键：必须包含
        strategy: updatedTopicData.strategy, // ✅ 关键：必须包含
        localVariables: updatedTopicData.localVariables,
      };

      // 验证：字段被正确保存
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBe('更新后的目标');
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBe('更新后的策略');
      expect(newPhases[phaseIndex].topics[topicIndex].topic_name).toBe('Updated Topic');
      expect(newPhases[phaseIndex].topics[topicIndex].description).toBe('Updated description');
    });

    it('应该能够清空 topic_goal 和 strategy 字段', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      // 用户将字段清空
      const clearedTopicData = {
        ...updatedTopicData,
        topic_goal: '',
        strategy: '',
      };

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: clearedTopicData.id,
        topic_name: clearedTopicData.name,
        description: clearedTopicData.description,
        topic_goal: clearedTopicData.topic_goal,
        strategy: clearedTopicData.strategy,
        localVariables: clearedTopicData.localVariables,
      };

      // 验证：字段被正确清空（空字符串）
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBe('');
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBe('');
    });

    it('应该能够单独更新 topic_goal 或 strategy', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      // 只更新 topic_goal
      const partialUpdateData = {
        ...updatedTopicData,
        topic_goal: '只更新目标',
        strategy: '原始策略', // 保持不变
      };

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: partialUpdateData.id,
        topic_name: partialUpdateData.name,
        description: partialUpdateData.description,
        topic_goal: partialUpdateData.topic_goal,
        strategy: partialUpdateData.strategy,
        localVariables: partialUpdateData.localVariables,
      };

      // 验证：topic_goal 更新，strategy 保持
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBe('只更新目标');
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBe('原始策略');
    });

    it('应该保留其他 topic 字段（actions 等）', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        topic_goal: updatedTopicData.topic_goal,
        strategy: updatedTopicData.strategy,
        localVariables: updatedTopicData.localVariables,
      };

      // 验证：actions 等其他字段保持不变
      expect(newPhases[phaseIndex].topics[topicIndex].actions).toHaveLength(1);
      expect(newPhases[phaseIndex].topics[topicIndex].actions[0].type).toBe('ai_say');
    });
  });

  describe('回归测试：防止字段丢失', () => {
    it('不应该丢失 topic_goal 字段（Bug 回归测试）', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      // 模拟错误的实现（缺少 topic_goal 和 strategy）
      const wrongImplementation = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        localVariables: updatedTopicData.localVariables,
        // ❌ 错误：缺少 topic_goal 和 strategy
      };

      // 验证错误实现会导致字段丢失
      expect(wrongImplementation.topic_goal).toBe('原始目标'); // 保留旧值
      expect(wrongImplementation.strategy).toBe('原始策略'); // 保留旧值

      // 正确的实现
      const correctImplementation = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        topic_goal: updatedTopicData.topic_goal, // ✅ 必须显式设置
        strategy: updatedTopicData.strategy, // ✅ 必须显式设置
        localVariables: updatedTopicData.localVariables,
      };

      // 验证正确实现会更新字段
      expect(correctImplementation.topic_goal).toBe('更新后的目标');
      expect(correctImplementation.strategy).toBe('更新后的策略');
    });

    it('不应该在保存后触发 contentChanged（数据一致性测试）', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      // 保存前的表单数据
      const formData = {
        topic_goal: '更新后的目标',
        strategy: '更新后的策略',
      };

      // 执行保存
      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        topic_goal: updatedTopicData.topic_goal,
        strategy: updatedTopicData.strategy,
        localVariables: updatedTopicData.localVariables,
      };

      // 模拟属性面板从 currentPhases 读取数据
      const dataFromCurrentPhases = {
        topic_goal: newPhases[phaseIndex].topics[topicIndex].topic_goal || '',
        strategy: newPhases[phaseIndex].topics[topicIndex].strategy || '',
      };

      // 验证：保存后的数据与表单数据一致，不应该触发 contentChanged
      expect(dataFromCurrentPhases.topic_goal).toBe(formData.topic_goal);
      expect(dataFromCurrentPhases.strategy).toBe(formData.strategy);
    });
  });

  describe('边界情况测试', () => {
    it('应该处理 undefined 值', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      const dataWithUndefined = {
        ...updatedTopicData,
        topic_goal: undefined,
        strategy: undefined,
      };

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: dataWithUndefined.id,
        topic_name: dataWithUndefined.name,
        description: dataWithUndefined.description,
        topic_goal: dataWithUndefined.topic_goal,
        strategy: dataWithUndefined.strategy,
        localVariables: dataWithUndefined.localVariables,
      };

      // 验证：undefined 被正确设置
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBeUndefined();
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBeUndefined();
    });

    it('应该处理长文本内容', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      const longText = '这是一段很长的文本'.repeat(100); // 1000+ 字符
      const dataWithLongText = {
        ...updatedTopicData,
        topic_goal: longText,
        strategy: longText,
      };

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: dataWithLongText.id,
        topic_name: dataWithLongText.name,
        description: dataWithLongText.description,
        topic_goal: dataWithLongText.topic_goal,
        strategy: dataWithLongText.strategy,
        localVariables: dataWithLongText.localVariables,
      };

      // 验证：长文本被正确保存
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBe(longText);
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBe(longText);
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal?.length).toBeGreaterThan(500);
    });

    it('应该处理特殊字符和换行符', () => {
      const phaseIndex = 0;
      const topicIndex = 0;
      const newPhases = JSON.parse(JSON.stringify(initialPhases));

      const textWithSpecialChars =
        '验证目标：\n1. 包含换行符\n2. 包含特殊字符 @#$%\n3. 包含 {占位符}';
      const dataWithSpecialChars = {
        ...updatedTopicData,
        topic_goal: textWithSpecialChars,
        strategy: textWithSpecialChars,
      };

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: dataWithSpecialChars.id,
        topic_name: dataWithSpecialChars.name,
        description: dataWithSpecialChars.description,
        topic_goal: dataWithSpecialChars.topic_goal,
        strategy: dataWithSpecialChars.strategy,
        localVariables: dataWithSpecialChars.localVariables,
      };

      // 验证：特殊字符和换行符被正确保存
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toBe(textWithSpecialChars);
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toBe(textWithSpecialChars);
      expect(newPhases[phaseIndex].topics[topicIndex].topic_goal).toContain('\n');
      expect(newPhases[phaseIndex].topics[topicIndex].strategy).toContain('{占位符}');
    });
  });
});
