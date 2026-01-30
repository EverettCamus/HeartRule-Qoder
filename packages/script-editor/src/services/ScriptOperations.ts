/**
 * ScriptOperations - 脚本CRUD操作服务
 *
 * 纯函数实现，无副作用
 * 功能：
 * 1. Phase的增删改移动
 * 2. Topic的增删改移动
 * 3. Action的增删改移动
 * 4. 创建默认结构
 */

import type { Action } from '../types/action';

import type { PhaseWithTopics, TopicWithActions } from './YamlService';

/**
 * 操作结果
 */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  warning?: string;
}

class ScriptOperations {
  /**
   * 根据类型创建 Action 初始结构
   */
  createActionByType(actionType: string, actionIndex: number): Action {
    const baseActionId = `action_${actionIndex}`;

    switch (actionType) {
      case 'ai_say':
        return {
          type: 'ai_say',
          ai_say: '请编辑此处内容',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_say',
            config: {
              content_template: '请编辑此处内容',
            },
          },
        };

      case 'ai_ask':
        return {
          type: 'ai_ask',
          ai_ask: 'Please enter a question',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_ask',
            config: {
              question_template: 'Please enter a question',
              output: [],
            },
          },
        };

      case 'ai_think':
        return {
          type: 'ai_think',
          think: 'Please enter the thinking topic',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_think',
            config: {
              think_target: 'Please enter the thinking topic',
              output: [],
            },
          },
        };

      case 'use_skill':
        return {
          type: 'use_skill',
          skill: 'Skill name',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'use_skill',
            config: {
              skill_name: 'Skill name',
            },
          },
        };

      case 'show_form':
        return {
          type: 'show_form',
          form_id: '',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'show_form',
            config: {
              form_id: '',
            },
          },
        };

      case 'show_pic':
        return {
          type: 'show_pic',
          pic_url: '',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'show_pic',
            config: {
              pic_url: '',
            },
          },
        };

      default:
        // 默认返回 ai_say 类型
        return {
          type: 'ai_say',
          ai_say: '请编辑此处内容',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_say',
            config: {
              content_template: '请编辑此处内容',
            },
          },
        };
    }
  }

  /**
   * 创建默认 Topic
   */
  createDefaultTopic(topicIndex: number): TopicWithActions {
    return {
      topic_id: `topic_${topicIndex + 1}`,
      topic_name: `New Topic ${topicIndex + 1}`,
      actions: [this.createActionByType('ai_say', 1)],
    };
  }

  /**
   * 创建默认 Phase
   */
  createDefaultPhase(phaseIndex: number): PhaseWithTopics {
    return {
      phase_id: `phase_${phaseIndex + 1}`,
      phase_name: `New Phase ${phaseIndex + 1}`,
      topics: [this.createDefaultTopic(0)],
    };
  }

  // ==================== Phase 操作 ====================

  /**
   * 添加新 Phase
   */
  addPhase(phases: PhaseWithTopics[]): OperationResult<PhaseWithTopics[]> {
    try {
      const newPhases = JSON.parse(JSON.stringify(phases));
      const newPhaseIndex = newPhases.length;
      const newPhase = this.createDefaultPhase(newPhaseIndex);

      newPhases.push(newPhase);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加 Phase 失败',
      };
    }
  }

  /**
   * 删除 Phase
   */
  deletePhase(phases: PhaseWithTopics[], phaseIndex: number): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases.splice(phaseIndex, 1);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除 Phase 失败',
      };
    }
  }

  /**
   * 更新 Phase
   */
  updatePhase(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    updates: Partial<PhaseWithTopics>
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases[phaseIndex] = {
        ...newPhases[phaseIndex],
        ...updates,
      };

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新 Phase 失败',
      };
    }
  }

  /**
   * 移动 Phase
   */
  movePhase(
    phases: PhaseWithTopics[],
    fromIndex: number,
    toIndex: number
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (fromIndex < 0 || fromIndex >= phases.length) {
        return {
          success: false,
          error: `无效的源 Phase 索引: ${fromIndex}`,
        };
      }

      if (toIndex < 0 || toIndex >= phases.length) {
        return {
          success: false,
          error: `无效的目标 Phase 索引: ${toIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      const [movedPhase] = newPhases.splice(fromIndex, 1);
      newPhases.splice(toIndex, 0, movedPhase);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '移动 Phase 失败',
      };
    }
  }

  // ==================== Topic 操作 ====================

  /**
   * 添加新 Topic
   */
  addTopic(phases: PhaseWithTopics[], phaseIndex: number): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      const phase = newPhases[phaseIndex];
      const newTopicIndex = phase.topics.length;
      const newTopic = this.createDefaultTopic(newTopicIndex);

      phase.topics.push(newTopic);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加 Topic 失败',
      };
    }
  }

  /**
   * 删除 Topic
   */
  deleteTopic(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    topicIndex: number
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const phase = phases[phaseIndex];
      if (topicIndex < 0 || topicIndex >= phase.topics.length) {
        return {
          success: false,
          error: `无效的 Topic 索引: ${topicIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases[phaseIndex].topics.splice(topicIndex, 1);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除 Topic 失败',
      };
    }
  }

  /**
   * 更新 Topic
   */
  updateTopic(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    topicIndex: number,
    updates: Partial<TopicWithActions>
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const phase = phases[phaseIndex];
      if (topicIndex < 0 || topicIndex >= phase.topics.length) {
        return {
          success: false,
          error: `无效的 Topic 索引: ${topicIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        ...updates,
      };

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新 Topic 失败',
      };
    }
  }

  /**
   * 移动 Topic（支持跨 Phase）
   */
  moveTopic(
    phases: PhaseWithTopics[],
    fromPhaseIndex: number,
    fromTopicIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (fromPhaseIndex < 0 || fromPhaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的源 Phase 索引: ${fromPhaseIndex}`,
        };
      }

      if (toPhaseIndex < 0 || toPhaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的目标 Phase 索引: ${toPhaseIndex}`,
        };
      }

      const fromPhase = phases[fromPhaseIndex];
      if (fromTopicIndex < 0 || fromTopicIndex >= fromPhase.topics.length) {
        return {
          success: false,
          error: `无效的源 Topic 索引: ${fromTopicIndex}`,
        };
      }

      const toPhase = phases[toPhaseIndex];
      if (toTopicIndex < 0 || toTopicIndex > toPhase.topics.length) {
        return {
          success: false,
          error: `无效的目标 Topic 索引: ${toTopicIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));

      // 从源位置移除 topic
      const [movedTopic] = newPhases[fromPhaseIndex].topics.splice(fromTopicIndex, 1);

      // 插入到目标位置
      newPhases[toPhaseIndex].topics.splice(toTopicIndex, 0, movedTopic);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '移动 Topic 失败',
      };
    }
  }

  // ==================== Action 操作 ====================

  /**
   * 添加新 Action
   */
  addAction(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    topicIndex: number,
    actionType: string
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const phase = phases[phaseIndex];
      if (topicIndex < 0 || topicIndex >= phase.topics.length) {
        return {
          success: false,
          error: `无效的 Topic 索引: ${topicIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      const topic = newPhases[phaseIndex].topics[topicIndex];
      const newActionIndex = topic.actions.length;
      const newAction = this.createActionByType(actionType, newActionIndex + 1);

      topic.actions.push(newAction);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加 Action 失败',
      };
    }
  }

  /**
   * 删除 Action
   */
  deleteAction(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    topicIndex: number,
    actionIndex: number
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const phase = phases[phaseIndex];
      if (topicIndex < 0 || topicIndex >= phase.topics.length) {
        return {
          success: false,
          error: `无效的 Topic 索引: ${topicIndex}`,
        };
      }

      const topic = phase.topics[topicIndex];
      if (actionIndex < 0 || actionIndex >= topic.actions.length) {
        return {
          success: false,
          error: `无效的 Action 索引: ${actionIndex}`,
        };
      }

      // 至少保留一个 action
      if (topic.actions.length <= 1) {
        return {
          success: false,
          warning: 'At least one Action is required',
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases[phaseIndex].topics[topicIndex].actions.splice(actionIndex, 1);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除 Action 失败',
      };
    }
  }

  /**
   * 更新 Action
   */
  updateAction(
    phases: PhaseWithTopics[],
    phaseIndex: number,
    topicIndex: number,
    actionIndex: number,
    updates: Partial<Action>
  ): OperationResult<PhaseWithTopics[]> {
    try {
      if (phaseIndex < 0 || phaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的 Phase 索引: ${phaseIndex}`,
        };
      }

      const phase = phases[phaseIndex];
      if (topicIndex < 0 || topicIndex >= phase.topics.length) {
        return {
          success: false,
          error: `无效的 Topic 索引: ${topicIndex}`,
        };
      }

      const topic = phase.topics[topicIndex];
      if (actionIndex < 0 || actionIndex >= topic.actions.length) {
        return {
          success: false,
          error: `无效的 Action 索引: ${actionIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));
      newPhases[phaseIndex].topics[topicIndex].actions[actionIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex].actions[actionIndex],
        ...updates,
      };

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新 Action 失败',
      };
    }
  }

  /**
   * 移动 Action（支持跨 Topic 和 Phase）
   */
  moveAction(
    phases: PhaseWithTopics[],
    fromPhaseIndex: number,
    fromTopicIndex: number,
    fromActionIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number,
    toActionIndex: number
  ): OperationResult<PhaseWithTopics[]> {
    try {
      // 验证源索引
      if (fromPhaseIndex < 0 || fromPhaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的源 Phase 索引: ${fromPhaseIndex}`,
        };
      }

      const fromPhase = phases[fromPhaseIndex];
      if (fromTopicIndex < 0 || fromTopicIndex >= fromPhase.topics.length) {
        return {
          success: false,
          error: `无效的源 Topic 索引: ${fromTopicIndex}`,
        };
      }

      const fromTopic = fromPhase.topics[fromTopicIndex];
      if (fromActionIndex < 0 || fromActionIndex >= fromTopic.actions.length) {
        return {
          success: false,
          error: `无效的源 Action 索引: ${fromActionIndex}`,
        };
      }

      // 验证目标索引
      if (toPhaseIndex < 0 || toPhaseIndex >= phases.length) {
        return {
          success: false,
          error: `无效的目标 Phase 索引: ${toPhaseIndex}`,
        };
      }

      const toPhase = phases[toPhaseIndex];
      if (toTopicIndex < 0 || toTopicIndex >= toPhase.topics.length) {
        return {
          success: false,
          error: `无效的目标 Topic 索引: ${toTopicIndex}`,
        };
      }

      const toTopic = toPhase.topics[toTopicIndex];
      if (toActionIndex < 0 || toActionIndex > toTopic.actions.length) {
        return {
          success: false,
          error: `无效的目标 Action 索引: ${toActionIndex}`,
        };
      }

      const newPhases = JSON.parse(JSON.stringify(phases));

      // 从源位置移除 action
      const [movedAction] = newPhases[fromPhaseIndex].topics[fromTopicIndex].actions.splice(
        fromActionIndex,
        1
      );

      // 插入到目标位置
      newPhases[toPhaseIndex].topics[toTopicIndex].actions.splice(toActionIndex, 0, movedAction);

      return {
        success: true,
        data: newPhases,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '移动 Action 失败',
      };
    }
  }
}

// 导出单例
export const scriptOperations = new ScriptOperations();
export default scriptOperations;
