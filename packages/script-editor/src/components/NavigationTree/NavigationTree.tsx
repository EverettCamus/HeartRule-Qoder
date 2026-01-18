/**
 * Navigation Tree Component
 * 导航树组件 - 显示脚本执行的四层结构
 */

import React, { useState, useEffect, useRef } from 'react';

import type {
  NavigationTree,
  PhaseNode,
  TopicNode,
  ActionNode,
  CurrentPosition,
} from '../../types/navigation';

interface NavigationTreeProps {
  tree: NavigationTree | null;
  currentPosition?: CurrentPosition;
}

const NavigationTreeComponent: React.FC<NavigationTreeProps> = ({ tree, currentPosition }) => {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [executedActions, setExecutedActions] = useState<Set<string>>(new Set());
  const currentActionRef = useRef<HTMLDivElement>(null);

  // 智能展开/折叠：当 currentPosition 变化时，自动展开当前执行路径
  useEffect(() => {
    if (!currentPosition || !tree) return;

    console.log('[NavigationTree] Current position changed:', currentPosition);

    // 找到当前执行的 Phase 和 Topic
    let targetPhaseId: string | null = null;
    let targetTopicId: string | null = null;
    let foundCurrentAction = false;

    // 通过 actionId 查找对应的 Phase 和 Topic，并标记已执行的 Action
    const newExecutedActions = new Set<string>();

    for (const phase of tree.phases) {
      for (const topic of phase.topics) {
        for (const action of topic.actions) {
          // 如果找到当前 Action，停止标记
          if (action.actionId === currentPosition.actionId) {
            targetPhaseId = phase.phaseId;
            targetTopicId = topic.topicId;
            foundCurrentAction = true;
            console.log('[NavigationTree] Found target path:', {
              phase: phase.phaseName,
              topic: topic.topicName,
              action: action.actionId,
            });
            break;
          }
          // 当前 Action 之前的所有 Action 都标记为已执行
          if (!foundCurrentAction) {
            newExecutedActions.add(action.actionId);
          }
        }
        if (foundCurrentAction) break;
      }
      if (foundCurrentAction) break;
    }

    // 更新已执行 Action 集合
    setExecutedActions(newExecutedActions);
    console.log('[NavigationTree] Updated executed actions:', Array.from(newExecutedActions));

    // 如果找到了目标路径，更新展开状态
    if (targetPhaseId && targetTopicId) {
      setExpandedPhases(new Set([targetPhaseId]));
      setExpandedTopics(new Set([targetTopicId]));

      // 延迟滚动，等待 DOM 更新
      setTimeout(() => {
        if (currentActionRef.current) {
          currentActionRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
          console.log('[NavigationTree] Scrolled to current action');
        }
      }, 300);
    }
  }, [currentPosition, tree]);

  if (!tree) {
    return <div style={{ padding: '16px', color: '#999' }}>No script loaded</div>;
  }

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const getActionIcon = (action: ActionNode): string => {
    if (currentPosition && action.actionId === currentPosition.actionId) {
      return '⚡'; // 执行中
    }
    if (executedActions.has(action.actionId)) {
      return '●'; // 已执行
    }
    if (action.status === 'error') {
      return '⚠️'; // 错误
    }
    return '○'; // 未执行
  };

  const getActionStatus = (action: ActionNode): string => {
    if (currentPosition && action.actionId === currentPosition.actionId) {
      return '执行中';
    }
    if (executedActions.has(action.actionId)) {
      return '已执行';
    }
    if (action.status === 'error') {
      return '错误';
    }
    return '未执行';
  };

  const getActionTooltip = (action: ActionNode): string => {
    const status = getActionStatus(action);
    const lines = [
      `Action ID: ${action.actionId}`,
      `类型: ${action.actionType}`,
      `状态: ${status}`,
    ];

    // 如果有配置摘要信息，添加到 Tooltip
    if (action.config && typeof action.config === 'object') {
      // ai_say 或 ai_think 的提示词
      if (action.config.content_template) {
        const content = String(action.config.content_template);
        const preview = content.substring(0, 50);
        lines.push(`提示词: "${preview}${content.length > 50 ? '...' : ''}"`);
      }
      // ai_ask 的问题模板
      if (action.config.question_template) {
        const question = String(action.config.question_template);
        const preview = question.substring(0, 50);
        lines.push(`问题: "${preview}${question.length > 50 ? '...' : ''}"`);
      }
      // 变量提取目标
      if (action.config.target_variable) {
        lines.push(`变量提取: ${action.config.target_variable}`);
      }
    }

    return lines.join('\n');
  };

  const getActionStyle = (action: ActionNode): React.CSSProperties => {
    const isExecuting = currentPosition && action.actionId === currentPosition.actionId;
    return {
      padding: '4px 8px',
      fontSize: '13px',
      backgroundColor: isExecuting ? '#e6f7ff' : 'transparent',
      fontWeight: isExecuting ? 'bold' : 'normal',
      color: action.status === 'error' ? '#c33' : '#333',
      borderRadius: '4px',
    };
  };

  const renderAction = (action: ActionNode) => {
    const isCurrentAction = currentPosition && action.actionId === currentPosition.actionId;

    return (
      <div
        key={action.actionId}
        ref={isCurrentAction ? currentActionRef : null}
        style={{
          ...getActionStyle(action),
          transition: 'all 0.3s ease',
        }}
        title={getActionTooltip(action)}
      >
        <span style={{ marginRight: '8px' }}>{getActionIcon(action)}</span>
        Action: {action.actionId}
      </div>
    );
  };

  const renderTopic = (topic: TopicNode) => {
    const isExpanded = expandedTopics.has(topic.topicId);
    return (
      <div key={topic.topicId} style={{ marginLeft: '16px' }}>
        <div
          onClick={() => toggleTopic(topic.topicId)}
          style={{
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span style={{ marginRight: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
          Topic: {topic.topicName || topic.topicId}
        </div>
        {isExpanded && <div style={{ marginLeft: '16px' }}>{topic.actions.map(renderAction)}</div>}
      </div>
    );
  };

  const renderPhase = (phase: PhaseNode) => {
    const isExpanded = expandedPhases.has(phase.phaseId);
    return (
      <div key={phase.phaseId} style={{ marginBottom: '8px' }}>
        <div
          onClick={() => togglePhase(phase.phaseId)}
          style={{
            padding: '6px 8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '15px',
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
          }}
        >
          <span style={{ marginRight: '8px' }}>{isExpanded ? '▼' : '▶'}</span>
          Phase: {phase.phaseName || phase.phaseId}
        </div>
        {isExpanded && (
          <div style={{ marginTop: '4px' }}>{phase.topics.map((topic) => renderTopic(topic))}</div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        maxHeight: '600px',
        overflow: 'auto',
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
        Session: {tree.sessionName || tree.sessionId}
      </h3>
      {tree.phases.map(renderPhase)}
      <div
        style={{ marginTop: '16px', padding: '8px', backgroundColor: '#f9f9f9', fontSize: '12px' }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Legend:</div>
        <div>○ Not Executed</div>
        <div>⚡ Executing (Current)</div>
        <div>● Executed</div>
        <div>⚠️ Error</div>
      </div>
    </div>
  );
};

export default NavigationTreeComponent;
