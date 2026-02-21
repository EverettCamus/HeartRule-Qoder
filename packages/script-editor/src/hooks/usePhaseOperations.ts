/**
 * Phase/Topic/Action 编辑操作 Hook
 * 
 * 功能：
 * - 提供 Phase/Topic/Action 的增删改查操作
 * - 管理操作历史记录（支持 Undo/Redo）
 * - 自动同步到 YAML
 * - 处理选中状态和焦点导航
 * 
 * 重构说明：
 * 从 ProjectEditor/index.tsx 提取，减少主组件复杂度
 * 原文件约 800 行代码，现在独立为可测试的 Hook
 */

import { useCallback } from 'react';
import { message } from 'antd';
import type { PhaseWithTopics } from '../services/YamlService';
// import type { TopicWithActions } from '../services/YamlService';
import type { Action } from '../types/action';
import type { FocusPath } from '../utils/history-manager';

export interface PhaseOperationsConfig {
  // 状态
  currentPhases: PhaseWithTopics[];
  setCurrentPhases: (phases: PhaseWithTopics[] | ((prev: PhaseWithTopics[]) => PhaseWithTopics[])) => void;
  setHasUnsavedChanges: (changed: boolean) => void;
  
  // 选中路径
  selectedActionPath: { phaseIndex: number; topicIndex: number; actionIndex: number } | null;
  setSelectedActionPath: (path: any) => void;
  selectedPhasePath: { phaseIndex: number } | null;
  setSelectedPhasePath: (path: any) => void;
  selectedTopicPath: { phaseIndex: number; topicIndex: number } | null;
  setSelectedTopicPath: (path: any) => void;
  setEditingType: (type: 'phase' | 'topic' | 'action' | null) => void;
  
  // 依赖函数
  syncPhasesToYaml: (phases: PhaseWithTopics[], targetFileId?: string) => void;
  pushHistory: (
    beforePhases: PhaseWithTopics[],
    afterPhases: PhaseWithTopics[],
    operation: string,
    beforeFocusPath?: FocusPath | null,
    afterFocusPath?: FocusPath | null
  ) => void;
}

export interface PhaseOperations {
  // Phase 操作
  handleAddPhase: () => void;
  handleDeletePhase: (phaseIndex: number) => void;
  handlePhaseSave: (updatedPhaseData: any) => void;
  handleMovePhase: (fromIndex: number, toIndex: number) => void;
  handleSelectPhase: (path: { phaseIndex: number }) => void;
  
  // Topic 操作
  handleAddTopic: (phaseIndex: number) => void;
  handleDeleteTopic: (phaseIndex: number, topicIndex: number) => void;
  handleTopicSave: (updatedTopicData: any) => void;
  handleMoveTopic: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number
  ) => void;
  handleSelectTopic: (path: { phaseIndex: number; topicIndex: number }) => void;
  
  // Action 操作
  handleAddAction: (phaseIndex: number, topicIndex: number, actionType: string) => void;
  handleDeleteAction: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
  handleActionSave: (updatedAction: Action) => void;
  handleMoveAction: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    fromActionIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number,
    toActionIndex: number
  ) => void;
  handleSelectAction: (path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => void;
  
  // 辅助函数
  createActionByType: (actionType: string, actionIndex: number) => Action;
}

/**
 * usePhaseOperations Hook
 * 
 * 提供 Phase/Topic/Action 的所有编辑操作
 */
export function usePhaseOperations(config: PhaseOperationsConfig): PhaseOperations {
  const {
    currentPhases,
    setCurrentPhases,
    setHasUnsavedChanges,
    selectedActionPath,
    setSelectedActionPath,
    selectedPhasePath,
    setSelectedPhasePath,
    selectedTopicPath,
    setSelectedTopicPath,
    setEditingType,
    syncPhasesToYaml,
    pushHistory,
  } = config;

  // ==================== Phase 操作 ====================

  /**
   * 添加新 Phase
   */
  const handleAddPhase = useCallback(() => {
    console.log('[handleAddPhase] 开始添加新 Phase');
    console.log('[handleAddPhase] 当前 currentPhases 数量:', currentPhases.length);

    const beforePhases = JSON.parse(JSON.stringify(currentPhases));
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const newPhaseIndex = newPhases.length;

    newPhases.push({
      phase_id: `phase_${newPhaseIndex + 1}`,
      phase_name: `New Phase ${newPhaseIndex + 1}`,
      topics: [
        {
          topic_id: `topic_1`,
          topic_name: 'New Topic 1',
          actions: [
            {
              type: 'ai_say',
              ai_say: 'Please edit this content',
              action_id: `action_1`,
              _raw: {
                action_id: `action_1`,
                action_type: 'ai_say',
                config: {
                  content_template: 'Please edit this content',
                },
              },
            },
          ],
        },
      ],
    });

    console.log('[handleAddPhase] 新 newPhases 数量:', newPhases.length);
    setCurrentPhases(newPhases);
    pushHistory(beforePhases, newPhases, 'Add Phase', null, {
      phaseIndex: newPhaseIndex,
      type: 'phase',
    });
    console.log('[handleAddPhase] 调用 syncPhasesToYaml...');
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('New Phase added');
    console.log('[handleAddPhase] 完成');
  }, [currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]);

  /**
   * 删除 Phase
   */
  const handleDeletePhase = useCallback(
    (phaseIndex: number) => {
      setCurrentPhases((prevPhases: PhaseWithTopics[]) => {
        const beforePhases = JSON.parse(JSON.stringify(prevPhases));
        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        newPhases.splice(phaseIndex, 1);

        pushHistory(beforePhases, newPhases, 'Delete Phase', null, null);

        // 如果删除的是当前选中的 phase，清空选中状态
        if (selectedActionPath?.phaseIndex === phaseIndex) {
          setSelectedActionPath(null);
        } else if (selectedActionPath && selectedActionPath.phaseIndex > phaseIndex) {
          setSelectedActionPath({
            ...selectedActionPath,
            phaseIndex: selectedActionPath.phaseIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Phase deleted');

        return newPhases;
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory, setCurrentPhases, setSelectedActionPath, setHasUnsavedChanges]
  );

  /**
   * 保存 Phase 修改
   */
  const handlePhaseSave = useCallback(
    (updatedPhaseData: any) => {
      if (selectedPhasePath === null) return;

      const { phaseIndex } = selectedPhasePath;
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      newPhases[phaseIndex] = {
        ...newPhases[phaseIndex],
        phase_id: updatedPhaseData.id,
        phase_name: updatedPhaseData.name,
        description: updatedPhaseData.description,
      };

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Update Phase', null, {
        phaseIndex,
        type: 'phase',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Phase updated');
    },
    [selectedPhasePath, currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 移动 Phase
   */
  const handleMovePhase = useCallback(
    (fromIndex: number, toIndex: number) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const [movedPhase] = newPhases.splice(fromIndex, 1);
      newPhases.splice(toIndex, 0, movedPhase);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Phase from ${fromIndex} to ${toIndex}`, null, {
        phaseIndex: toIndex,
        type: 'phase',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Phase moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 处理选中 Phase
   */
  const handleSelectPhase = useCallback(
    (path: { phaseIndex: number }) => {
      setSelectedPhasePath(path);
      setSelectedTopicPath(null);
      setSelectedActionPath(null);
      setEditingType('phase');
    },
    [setSelectedPhasePath, setSelectedTopicPath, setSelectedActionPath, setEditingType]
  );

  // ==================== Topic 操作 ====================

  /**
   * 添加新 Topic
   */
  const handleAddTopic = useCallback(
    (phaseIndex: number) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const phase = newPhases[phaseIndex];
      const newTopicIndex = phase.topics.length;

      phase.topics.push({
        topic_id: `topic_${newTopicIndex + 1}`,
        topic_name: `New Topic ${newTopicIndex + 1}`,
        actions: [
          {
            type: 'ai_say',
            ai_say: 'Please edit this content',
            action_id: `action_1`,
            _raw: {
              action_id: `action_1`,
              action_type: 'ai_say',
              config: {
                content_template: 'Please edit this content',
              },
            },
          },
        ],
      });

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Add Topic', null, {
        phaseIndex,
        topicIndex: newTopicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('New Topic added');
    },
    [currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 删除 Topic
   */
  const handleDeleteTopic = useCallback(
    (phaseIndex: number, topicIndex: number) => {
      setCurrentPhases((prevPhases: PhaseWithTopics[]) => {
        const beforePhases = JSON.parse(JSON.stringify(prevPhases));
        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        newPhases[phaseIndex].topics.splice(topicIndex, 1);

        pushHistory(beforePhases, newPhases, 'Delete Topic', null, null);

        if (
          selectedActionPath?.phaseIndex === phaseIndex &&
          selectedActionPath?.topicIndex === topicIndex
        ) {
          setSelectedActionPath(null);
        } else if (
          selectedActionPath &&
          selectedActionPath.phaseIndex === phaseIndex &&
          selectedActionPath.topicIndex > topicIndex
        ) {
          setSelectedActionPath({
            ...selectedActionPath,
            topicIndex: selectedActionPath.topicIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Topic deleted');

        return newPhases;
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory, setCurrentPhases, setSelectedActionPath, setHasUnsavedChanges]
  );

  /**
   * 保存 Topic 修改
   */
  const handleTopicSave = useCallback(
    (updatedTopicData: any) => {
      if (selectedTopicPath === null) return;

      const { phaseIndex, topicIndex } = selectedTopicPath;
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        topic_goal: updatedTopicData.topic_goal,
        strategy: updatedTopicData.strategy,
        localVariables: updatedTopicData.localVariables,
      };

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Update Topic', null, {
        phaseIndex,
        topicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Topic updated');
    },
    [selectedTopicPath, currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 移动 Topic（支持跨 Phase）
   */
  const handleMoveTopic = useCallback(
    (
      fromPhaseIndex: number,
      fromTopicIndex: number,
      toPhaseIndex: number,
      toTopicIndex: number
    ) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      const [movedTopic] = newPhases[fromPhaseIndex].topics.splice(fromTopicIndex, 1);
      newPhases[toPhaseIndex].topics.splice(toTopicIndex, 0, movedTopic);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Topic`, null, {
        phaseIndex: toPhaseIndex,
        topicIndex: toTopicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Topic moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 处理选中 Topic
   */
  const handleSelectTopic = useCallback(
    (path: { phaseIndex: number; topicIndex: number }) => {
      setSelectedPhasePath(null);
      setSelectedTopicPath(path);
      setSelectedActionPath(null);
      setEditingType('topic');
    },
    [setSelectedPhasePath, setSelectedTopicPath, setSelectedActionPath, setEditingType]
  );

  // ==================== Action 操作 ====================

  /**
   * 根据类型创建 Action 初始结构
   */
  const createActionByType = useCallback((actionType: string, actionIndex: number): Action => {
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
  }, []);

  /**
   * 添加新 Action
   */
  const handleAddAction = useCallback(
    (phaseIndex: number, topicIndex: number, actionType: string) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const topic = newPhases[phaseIndex].topics[topicIndex];
      const newActionIndex = topic.actions.length;

      const newAction = createActionByType(actionType, newActionIndex + 1);
      topic.actions.push(newAction);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `添加 ${actionType} Action`, null, {
        phaseIndex,
        topicIndex,
        actionIndex: newActionIndex,
        type: 'action',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success(`New ${actionType} Action added`);
    },
    [currentPhases, syncPhasesToYaml, createActionByType, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 删除 Action
   */
  const handleDeleteAction = useCallback(
    (phaseIndex: number, topicIndex: number, actionIndex: number) => {
      setCurrentPhases((prevPhases: PhaseWithTopics[]) => {
        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        const topic = newPhases[phaseIndex].topics[topicIndex];

        if (topic.actions.length <= 1) {
          message.warning('At least one Action is required');
          return prevPhases;
        }

        const beforePhases = JSON.parse(JSON.stringify(prevPhases));
        topic.actions.splice(actionIndex, 1);

        pushHistory(beforePhases, newPhases, 'Delete Action', null, null);

        if (
          selectedActionPath?.phaseIndex === phaseIndex &&
          selectedActionPath?.topicIndex === topicIndex &&
          selectedActionPath?.actionIndex === actionIndex
        ) {
          setSelectedActionPath(null);
        } else if (
          selectedActionPath &&
          selectedActionPath.phaseIndex === phaseIndex &&
          selectedActionPath.topicIndex === topicIndex &&
          selectedActionPath.actionIndex > actionIndex
        ) {
          setSelectedActionPath({
            ...selectedActionPath,
            actionIndex: selectedActionPath.actionIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Action deleted');

        return newPhases;
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory, setCurrentPhases, setSelectedActionPath, setHasUnsavedChanges]
  );

  /**
   * 保存 Action 修改
   */
  const handleActionSave = useCallback(
    (updatedAction: Action) => {
      if (selectedActionPath === null) return;

      const { phaseIndex, topicIndex, actionIndex } = selectedActionPath;

      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const beforeFocus: FocusPath = {
        phaseIndex,
        topicIndex,
        actionIndex,
        type: 'action',
      };

      const afterPhases = JSON.parse(JSON.stringify(currentPhases));
      afterPhases[phaseIndex].topics[topicIndex].actions[actionIndex] = updatedAction;
      setCurrentPhases(afterPhases);

      const afterFocus: FocusPath = {
        phaseIndex,
        topicIndex,
        actionIndex,
        type: 'action',
      };

      pushHistory(beforePhases, afterPhases, '修改 Action', beforeFocus, afterFocus);
      syncPhasesToYaml(afterPhases);
      setHasUnsavedChanges(true);
      message.success('Action updated');
    },
    [selectedActionPath, currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 移动 Action（支持跨 Topic 和 Phase）
   */
  const handleMoveAction = useCallback(
    (
      fromPhaseIndex: number,
      fromTopicIndex: number,
      fromActionIndex: number,
      toPhaseIndex: number,
      toTopicIndex: number,
      toActionIndex: number
    ) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      const [movedAction] = newPhases[fromPhaseIndex].topics[fromTopicIndex].actions.splice(
        fromActionIndex,
        1
      );
      newPhases[toPhaseIndex].topics[toTopicIndex].actions.splice(toActionIndex, 0, movedAction);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Action`, null, {
        phaseIndex: toPhaseIndex,
        topicIndex: toTopicIndex,
        actionIndex: toActionIndex,
        type: 'action',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Action moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory, setCurrentPhases, setHasUnsavedChanges]
  );

  /**
   * 处理选中 Action
   */
  const handleSelectAction = useCallback(
    (path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => {
      setSelectedPhasePath(null);
      setSelectedTopicPath(null);
      setSelectedActionPath(path);
      setEditingType('action');
    },
    [setSelectedPhasePath, setSelectedTopicPath, setSelectedActionPath, setEditingType]
  );

  return {
    // Phase 操作
    handleAddPhase,
    handleDeletePhase,
    handlePhaseSave,
    handleMovePhase,
    handleSelectPhase,
    
    // Topic 操作
    handleAddTopic,
    handleDeleteTopic,
    handleTopicSave,
    handleMoveTopic,
    handleSelectTopic,
    
    // Action 操作
    handleAddAction,
    handleDeleteAction,
    handleActionSave,
    handleMoveAction,
    handleSelectAction,
    
    // 辅助函数
    createActionByType,
  };
}
