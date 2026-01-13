import {
  MessageOutlined,
  QuestionCircleOutlined,
  BulbOutlined,
  CommentOutlined,
  UserOutlined,
  RightOutlined,
  PlusOutlined,
  DeleteOutlined,
  DownOutlined,
  ThunderboltOutlined,
  FormOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import {
  Card,
  Typography,
  Tag,
  Space,
  Tooltip,
  Collapse,
  Button,
  Popconfirm,
  Dropdown,
  Menu,
} from 'antd';
import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

import type { Action } from '../../types/action';
import './style.css';

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

// 层级数据结构
interface TopicWithActions {
  topic_id: string;
  topic_name?: string;
  actions: Action[];
}

interface PhaseWithTopics {
  phase_id: string;
  phase_name?: string;
  topics: TopicWithActions[];
}

interface ActionNodeListProps {
  phases: PhaseWithTopics[];
  selectedActionPath: { phaseIndex: number; topicIndex: number; actionIndex: number } | null;
  selectedPhasePath: { phaseIndex: number } | null;
  selectedTopicPath: { phaseIndex: number; topicIndex: number } | null;
  onSelectAction: (path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => void;
  onSelectPhase: (path: { phaseIndex: number }) => void;
  onSelectTopic: (path: { phaseIndex: number; topicIndex: number }) => void;
  onAddPhase?: () => void;
  onAddTopic?: (phaseIndex: number) => void;
  onAddAction?: (phaseIndex: number, topicIndex: number, actionType: string) => void;
  onDeletePhase?: (phaseIndex: number) => void;
  onDeleteTopic?: (phaseIndex: number, topicIndex: number) => void;
  onDeleteAction?: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
  onMovePhase?: (fromIndex: number, toIndex: number) => void;
  onMoveTopic?: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number
  ) => void;
  onMoveAction?: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    fromActionIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number,
    toActionIndex: number
  ) => void;
}

/**
 * 对外暴露的方法
 */
export interface ActionNodeListRef {
  expandAndScrollTo: (focusPath: {
    phaseIndex?: number;
    topicIndex?: number;
    actionIndex?: number;
    type: 'phase' | 'topic' | 'action';
  }) => void;
}

/**
 * 根据 Action 类型返回对应的图标
 */
const getActionIcon = (type: string) => {
  switch (type) {
    case 'ai_say':
      return <MessageOutlined style={{ color: '#1890ff', fontSize: 20 }} />;
    case 'ai_ask':
      return <QuestionCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />;
    case 'ai_think':
      return <BulbOutlined style={{ color: '#faad14', fontSize: 20 }} />;
    case 'use_skill':
      return <ThunderboltOutlined style={{ color: '#722ed1', fontSize: 20 }} />;
    case 'show_form':
      return <FormOutlined style={{ color: '#13c2c2', fontSize: 20 }} />;
    case 'show_pic':
      return <PictureOutlined style={{ color: '#eb2f96', fontSize: 20 }} />;
    case 'say':
      return <CommentOutlined style={{ color: '#722ed1', fontSize: 20 }} />;
    case 'user_say':
      return <UserOutlined style={{ color: '#eb2f96', fontSize: 20 }} />;
    default:
      return <MessageOutlined style={{ fontSize: 20 }} />;
  }
};

/**
 * 根据 Action 类型返回显示名称
 */
const getActionTypeName = (type: string) => {
  const names: Record<string, string> = {
    ai_say: 'AI Say',
    ai_ask: 'AI Ask',
    ai_think: 'AI Think',
    use_skill: 'Use Skill',
    show_form: 'Show Form',
    show_pic: 'Show Image',
    say: 'Say',
    user_say: 'User Say',
  };
  return names[type] || type;
};

/**
 * 根据 Action 类型返回标签颜色
 */
const getActionTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    ai_say: 'blue',
    ai_ask: 'green',
    ai_think: 'gold',
    use_skill: 'purple',
    show_form: 'cyan',
    show_pic: 'magenta',
    say: 'purple',
    user_say: 'magenta',
  };
  return colors[type] || 'default';
};

/**
 * 获取 Action 的主要内容（用于预览）
 */
const getActionContent = (action: Action): string => {
  if ('ai_say' in action) return action.ai_say;
  if ('ai_ask' in action) return action.ai_ask;
  if ('think' in action) return action.think;
  if ('skill' in action) return action.skill;
  if ('form_id' in action) return action.form_id;
  if ('pic_url' in action) return action.pic_url;
  if ('say' in action) return action.say;
  if ('user_say' in action) return action.user_say;
  return '';
};

/**
 * 截取文本并添加省略号
 */
const truncateText = (text: string, maxLength: number = 100): string => {
  if (!text) return '';
  const cleanText = text.trim().replace(/\s+/g, ' ');
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.substring(0, maxLength) + '...';
};

export const ActionNodeList = forwardRef<ActionNodeListRef, ActionNodeListProps>((
  {
    phases,
    selectedActionPath,
    selectedPhasePath,
    selectedTopicPath,
    onSelectAction,
    onSelectPhase,
    onSelectTopic,
    onAddPhase,
    onAddTopic,
    onAddAction,
    onDeletePhase,
    onDeleteTopic,
    onDeleteAction,
    onMovePhase,
    onMoveTopic,
    onMoveAction,
  },
  ref
) => {
  // 默认展开所有层级
  const [expandedPhases, setExpandedPhases] = useState<string[]>(
    phases.map((_, i) => `phase-${i}`)
  );
  const [expandedTopics, setExpandedTopics] = useState<string[]>(
    phases.flatMap((phase, pi) => phase.topics.map((_, ti) => `phase-${pi}-topic-${ti}`))
  );

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{
    type: 'phase' | 'topic' | 'action';
    phaseIndex: number;
    topicIndex?: number;
    actionIndex?: number;
  } | null>(null);

  // 滚动容器引用和自动滚动
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollAnimationFrameRef = useRef<number | null>(null);

  // 对外暴露方法：展开父级节点并滚动到目标位置
  useImperativeHandle(ref, () => ({
    expandAndScrollTo: (focusPath) => {
      const { phaseIndex, topicIndex, type } = focusPath;

      // 1. 展开父级节点
      if (phaseIndex !== undefined) {
        const phaseKey = `phase-${phaseIndex}`;
        
        // 展开 Phase
        if (!expandedPhases.includes(phaseKey)) {
          setExpandedPhases((prev) => [...prev, phaseKey]);
        }

        // 如果是 Topic 或 Action，需要展开 Topic
        if ((type === 'topic' || type === 'action') && topicIndex !== undefined) {
          const topicKey = `phase-${phaseIndex}-topic-${topicIndex}`;
          if (!expandedTopics.includes(topicKey)) {
            setExpandedTopics((prev) => [...prev, topicKey]);
          }
        }
      }

      // 2. 等待展开动画完成后滚动（Collapse 展开需要时间）
      setTimeout(() => {
        scrollToTarget(focusPath);
      }, 300); // Ant Design Collapse 展开动画默认 300ms
    },
  }));

  /**
   * 滚动到目标节点
   */
  const scrollToTarget = (focusPath: {
    phaseIndex?: number;
    topicIndex?: number;
    actionIndex?: number;
    type: 'phase' | 'topic' | 'action';
  }) => {
    if (!containerRef.current) return;

    const { phaseIndex, topicIndex, actionIndex, type } = focusPath;
    let targetElement: HTMLElement | null = null;

    // 根据类型查找目标元素
    if (type === 'action' && phaseIndex !== undefined && topicIndex !== undefined && actionIndex !== undefined) {
      // 查找 Action 卡片（通过 data-action-path 属性）
      targetElement = containerRef.current.querySelector(
        `[data-action-path="${phaseIndex}-${topicIndex}-${actionIndex}"]`
      );
    } else if (type === 'topic' && phaseIndex !== undefined && topicIndex !== undefined) {
      // 查找 Topic Panel
      targetElement = containerRef.current.querySelector(
        `[data-topic-path="${phaseIndex}-${topicIndex}"]`
      );
    } else if (type === 'phase' && phaseIndex !== undefined) {
      // 查找 Phase Panel
      targetElement = containerRef.current.querySelector(
        `[data-phase-path="${phaseIndex}"]`
      );
    }

    // 滚动到目标元素
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center', // 将目标元素居中显示
      });

      // 添加高亮效果（可选）
      targetElement.classList.add('focus-highlight');
      setTimeout(() => {
        targetElement?.classList.remove('focus-highlight');
      }, 2000);
    }
  };

  // 清理滚动动画
  useEffect(() => {
    return () => {
      if (scrollAnimationFrameRef.current) {
        cancelAnimationFrame(scrollAnimationFrameRef.current);
      }
    };
  }, []);

  // 自动滚动处理函数
  const handleAutoScroll = (e: React.DragEvent) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const mouseY = e.clientY;
    const scrollThreshold = 80; // 边缘阈值（px）
    const scrollSpeed = 15; // 滚动速度（px/frame）

    // 停止之前的滚动动画
    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    // 向上滚动
    if (mouseY - rect.top < scrollThreshold && container.scrollTop > 0) {
      const scroll = () => {
        if (container.scrollTop > 0) {
          container.scrollTop -= scrollSpeed;
          scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
        }
      };
      scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
    }
    // 向下滚动
    else if (
      rect.bottom - mouseY < scrollThreshold &&
      container.scrollTop < container.scrollHeight - container.clientHeight
    ) {
      const scroll = () => {
        if (container.scrollTop < container.scrollHeight - container.clientHeight) {
          container.scrollTop += scrollSpeed;
          scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
        }
      };
      scrollAnimationFrameRef.current = requestAnimationFrame(scroll);
    }
  };

  // 停止自动滚动
  const stopAutoScroll = () => {
    if (scrollAnimationFrameRef.current) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
  };

  if (!phases || phases.length === 0) {
    return (
      <div className="action-node-list-empty">
        <Space direction="vertical" align="center" size="large">
          <Text type="secondary" style={{ fontSize: '16px' }}>No content yet</Text>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            Start by creating your first Phase to build the conversation flow
          </Text>
          {onAddPhase && (
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              size="large"
              onClick={onAddPhase}
            >
              Create First Phase
            </Button>
          )}
        </Space>
      </div>
    );
  }

  // 渲染单个 Action 卡片
  const renderActionCard = (
    action: Action,
    phaseIndex: number,
    topicIndex: number,
    actionIndex: number
  ) => {
    const isSelected =
      selectedActionPath?.phaseIndex === phaseIndex &&
      selectedActionPath?.topicIndex === topicIndex &&
      selectedActionPath?.actionIndex === actionIndex;
    const content = getActionContent(action);

    return (
      <Card
        key={actionIndex}
        data-action-path={`${phaseIndex}-${topicIndex}-${actionIndex}`}
        className={`action-node-card ${isSelected ? 'selected' : ''}`}
        size="small"
        hoverable
        draggable={!!onMoveAction}
        onClick={() => onSelectAction({ phaseIndex, topicIndex, actionIndex })}
        onDragStart={(e) => {
          if (!onMoveAction) return;
          e.stopPropagation();
          setDraggedItem({ type: 'action', phaseIndex, topicIndex, actionIndex });
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!onMoveAction || !draggedItem) return;
          // Action 卡片支持：action 拖到 action（同级排序）
          if (draggedItem.type === 'action') {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            handleAutoScroll(e);
          }
        }}
        onDrop={(e) => {
          if (!onMoveAction || !draggedItem) return;
          e.preventDefault();
          e.stopPropagation();
          stopAutoScroll();

          if (
            draggedItem.type === 'action' &&
            draggedItem.actionIndex !== undefined &&
            draggedItem.topicIndex !== undefined
          ) {
            if (
              draggedItem.phaseIndex !== phaseIndex ||
              draggedItem.topicIndex !== topicIndex ||
              draggedItem.actionIndex !== actionIndex
            ) {
              onMoveAction(
                draggedItem.phaseIndex,
                draggedItem.topicIndex,
                draggedItem.actionIndex,
                phaseIndex,
                topicIndex,
                actionIndex
              );
            }
          }
          setDraggedItem(null);
        }}
        onDragEnd={() => {
          stopAutoScroll();
          setDraggedItem(null);
        }}
        style={{ marginBottom: 8, cursor: onMoveAction ? 'move' : 'pointer' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {/* 节点头部：图标 + 类型 + 序号 + 删除按钮 */}
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              {getActionIcon(action.type)}
              <Text strong>{getActionTypeName(action.type)}</Text>
            </Space>
            <Space>
              <Tag color={getActionTypeColor(action.type)}>#{actionIndex + 1}</Tag>
              {onDeleteAction && (
                <Popconfirm
                  title="确认删除此 Action？"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    onDeleteAction(phaseIndex, topicIndex, actionIndex);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="确认"
                  cancelText="取消"
                >
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Popconfirm>
              )}
            </Space>
          </Space>

          {/* 节点内容预览 */}
          {content && (
            <Tooltip title={content} placement="topLeft">
              <Paragraph
                ellipsis={{ rows: 2 }}
                className="action-content-preview"
                style={{ marginBottom: 0 }}
              >
                {truncateText(content, 150)}
              </Paragraph>
            </Tooltip>
          )}

          {/* 附加信息标签 */}
          <Space size={4} wrap>
            {action.condition && (
              <Tag color="orange" style={{ fontSize: 11 }}>
                条件
              </Tag>
            )}
            {'exit' in action && action.exit && (
              <Tag color="red" style={{ fontSize: 11 }}>
                退出条件
              </Tag>
            )}
            {'output' in action && action.output && action.output.length > 0 && (
              <Tag color="cyan" style={{ fontSize: 11 }}>
                输出 {action.output.length} 个变量
              </Tag>
            )}
            {'tolist' in action && action.tolist && (
              <Tag color="purple" style={{ fontSize: 11 }}>
                添加到列表
              </Tag>
            )}
            {'tone' in action && action.tone && (
              <Tag color="geekblue" style={{ fontSize: 11 }}>
                语气: {action.tone}
              </Tag>
            )}
          </Space>
        </Space>
      </Card>
    );
  };

  return (
    <div ref={containerRef} className="action-node-list">
      {/* 顶部添加 Phase 按钮 */}
      {onAddPhase && (
        <div style={{ padding: '0 0 16px 0' }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={onAddPhase} block>
            添加 Phase
          </Button>
        </div>
      )}

      {/* Phase 级别折叠面板 */}
      <Collapse
        activeKey={expandedPhases}
        onChange={(keys) => setExpandedPhases(keys as string[])}
        expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} />}
        className="phase-collapse"
      >
        {phases.map((phase, phaseIndex) => (
          <Panel
            key={`phase-${phaseIndex}`}
            data-phase-path={phaseIndex}
            header={
              <div
                draggable={!!onMovePhase}
                onDragStart={(e) => {
                  if (!onMovePhase) return;
                  e.stopPropagation();
                  setDraggedItem({ type: 'phase', phaseIndex });
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!draggedItem) return;
                  // Phase header 支持：phase 拖到 phase（同级排序）+ topic 拖到 phase（追加）
                  if (
                    (onMovePhase && draggedItem.type === 'phase') ||
                    (onMoveTopic && draggedItem.type === 'topic')
                  ) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    handleAutoScroll(e);
                  }
                }}
                onDrop={(e) => {
                  if (!draggedItem) return;
                  e.preventDefault();
                  e.stopPropagation();
                  stopAutoScroll();

                  // Phase 拖到 Phase → 同级排序
                  if (
                    draggedItem.type === 'phase' &&
                    onMovePhase &&
                    draggedItem.phaseIndex !== phaseIndex
                  ) {
                    onMovePhase(draggedItem.phaseIndex, phaseIndex);
                  }
                  // Topic 拖到 Phase → 追加到该 Phase 末尾
                  else if (
                    draggedItem.type === 'topic' &&
                    onMoveTopic &&
                    draggedItem.topicIndex !== undefined
                  ) {
                    const targetTopicIndex = phase.topics.length; // 追加到末尾
                    if (
                      draggedItem.phaseIndex !== phaseIndex ||
                      draggedItem.topicIndex !== targetTopicIndex
                    ) {
                      onMoveTopic(
                        draggedItem.phaseIndex,
                        draggedItem.topicIndex,
                        phaseIndex,
                        targetTopicIndex
                      );
                    }
                  }
                  setDraggedItem(null);
                }}
                onDragEnd={() => {
                  stopAutoScroll();
                  setDraggedItem(null);
                }}
                style={{ cursor: onMovePhase ? 'move' : 'default' }}
              >
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPhase({ phaseIndex });
                    }}
                    style={{ cursor: 'pointer', flex: 1 }}
                  >
                    <Text strong style={{ fontSize: 16 }}>
                      {phase.phase_name || phase.phase_id || `Phase ${phaseIndex + 1}`}
                    </Text>
                    <Tag color="blue">{phase.topics.length} Topics</Tag>
                    {selectedPhasePath?.phaseIndex === phaseIndex && <Tag color="cyan">已选中</Tag>}
                  </Space>
                  <Space onClick={(e) => e.stopPropagation()}>
                    {onAddTopic && (
                      <Button
                        type="text"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddTopic(phaseIndex);
                        }}
                      >
                        添加Topic
                      </Button>
                    )}
                    {onDeletePhase && phases.length > 1 && (
                      <Popconfirm
                        title="确认删除此 Phase 及其所有内容？"
                        onConfirm={(e) => {
                          e?.stopPropagation();
                          onDeletePhase(phaseIndex);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="确认"
                        cancelText="取消"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Popconfirm>
                    )}
                  </Space>
                </Space>
              </div>
            }
            className="phase-panel"
          >
            {/* Topic 级别折叠面板 */}
            <Collapse
              activeKey={expandedTopics}
              onChange={(keys) => setExpandedTopics(keys as string[])}
              expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} />}
              className="topic-collapse"
            >
              {phase.topics.map((topic, topicIndex) => (
                <Panel
                  key={`phase-${phaseIndex}-topic-${topicIndex}`}
                  data-topic-path={`${phaseIndex}-${topicIndex}`}
                  header={
                    <div
                      draggable={!!onMoveTopic}
                      onDragStart={(e) => {
                        if (!onMoveTopic) return;
                        e.stopPropagation();
                        setDraggedItem({ type: 'topic', phaseIndex, topicIndex });
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        if (!draggedItem) return;
                        // Topic header 支持：topic 拖到 topic（同级排序）+ action 拖到 topic（追加）
                        if (
                          (onMoveTopic && draggedItem.type === 'topic') ||
                          (onMoveAction && draggedItem.type === 'action')
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'move';
                          handleAutoScroll(e);
                        }
                      }}
                      onDrop={(e) => {
                        if (!draggedItem) return;
                        e.preventDefault();
                        e.stopPropagation();
                        stopAutoScroll();

                        // Topic 拖到 Topic → 同级排序
                        if (
                          draggedItem.type === 'topic' &&
                          onMoveTopic &&
                          draggedItem.topicIndex !== undefined
                        ) {
                          if (
                            draggedItem.phaseIndex !== phaseIndex ||
                            draggedItem.topicIndex !== topicIndex
                          ) {
                            onMoveTopic(
                              draggedItem.phaseIndex,
                              draggedItem.topicIndex,
                              phaseIndex,
                              topicIndex
                            );
                          }
                        }
                        // Action 拖到 Topic → 追加到该 Topic 末尾
                        else if (
                          draggedItem.type === 'action' &&
                          onMoveAction &&
                          draggedItem.actionIndex !== undefined &&
                          draggedItem.topicIndex !== undefined
                        ) {
                          const targetActionIndex = topic.actions.length; // 追加到末尾
                          if (
                            draggedItem.phaseIndex !== phaseIndex ||
                            draggedItem.topicIndex !== topicIndex ||
                            draggedItem.actionIndex !== targetActionIndex
                          ) {
                            onMoveAction(
                              draggedItem.phaseIndex,
                              draggedItem.topicIndex,
                              draggedItem.actionIndex,
                              phaseIndex,
                              topicIndex,
                              targetActionIndex
                            );
                          }
                        }
                        setDraggedItem(null);
                      }}
                      onDragEnd={() => {
                        stopAutoScroll();
                        setDraggedItem(null);
                      }}
                      style={{ cursor: onMoveTopic ? 'move' : 'default' }}
                    >
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectTopic({ phaseIndex, topicIndex });
                          }}
                          style={{ cursor: 'pointer', flex: 1 }}
                        >
                          <Text strong style={{ fontSize: 14 }}>
                            {topic.topic_name || topic.topic_id || `Topic ${topicIndex + 1}`}
                          </Text>
                          <Tag color="green">{topic.actions.length} Actions</Tag>
                          {selectedTopicPath?.phaseIndex === phaseIndex &&
                            selectedTopicPath?.topicIndex === topicIndex && (
                              <Tag color="cyan">已选中</Tag>
                            )}
                        </Space>
                        <Space onClick={(e) => e.stopPropagation()}>
                          {onAddAction && (
                            <Dropdown
                              overlay={
                                <Menu
                                  onClick={({ key }) => {
                                    onAddAction(phaseIndex, topicIndex, key as string);
                                  }}
                                >
                                  <Menu.Item key="ai_say" icon={<MessageOutlined />}>
                                    AI 说话
                                  </Menu.Item>
                                  <Menu.Item key="ai_ask" icon={<QuestionCircleOutlined />}>
                                    AI 提问
                                  </Menu.Item>
                                  <Menu.Item key="ai_think" icon={<BulbOutlined />}>
                                    AI 思考
                                  </Menu.Item>
                                  <Menu.Item key="use_skill" icon={<ThunderboltOutlined />}>
                                    使用技能
                                  </Menu.Item>
                                  <Menu.Item key="show_form" icon={<FormOutlined />}>
                                    展示表单
                                  </Menu.Item>
                                  <Menu.Item key="show_pic" icon={<PictureOutlined />}>
                                    展示图片
                                  </Menu.Item>
                                </Menu>
                              }
                              trigger={['click']}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={(e) => e.stopPropagation()}
                              >
                                添加Action <DownOutlined />
                              </Button>
                            </Dropdown>
                          )}
                          {onDeleteTopic && phase.topics.length > 1 && (
                            <Popconfirm
                              title="确认删除此 Topic 及其所有 Actions？"
                              onConfirm={(e) => {
                                e?.stopPropagation();
                                onDeleteTopic(phaseIndex, topicIndex);
                              }}
                              onCancel={(e) => e?.stopPropagation()}
                              okText="确认"
                              cancelText="取消"
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>
                          )}
                        </Space>
                      </Space>
                    </div>
                  }
                  className="topic-panel"
                >
                  {/* Action 列表 */}
                  <div className="actions-container">
                    {topic.actions.map((action, actionIndex) =>
                      renderActionCard(action, phaseIndex, topicIndex, actionIndex)
                    )}
                    {/* Topic 内部添加 Action 按钮 */}
                    {onAddAction && (
                      <Dropdown
                        overlay={
                          <Menu
                            onClick={({ key }) => {
                              onAddAction(phaseIndex, topicIndex, key as string);
                            }}
                          >
                            <Menu.Item key="ai_say" icon={<MessageOutlined />}>
                              AI 说话
                            </Menu.Item>
                            <Menu.Item key="ai_ask" icon={<QuestionCircleOutlined />}>
                              AI 提问
                            </Menu.Item>
                            <Menu.Item key="ai_think" icon={<BulbOutlined />}>
                              AI 思考
                            </Menu.Item>
                            <Menu.Item key="use_skill" icon={<ThunderboltOutlined />}>
                              使用技能
                            </Menu.Item>
                            <Menu.Item key="show_form" icon={<FormOutlined />}>
                              展示表单
                            </Menu.Item>
                            <Menu.Item key="show_pic" icon={<PictureOutlined />}>
                              展示图片
                            </Menu.Item>
                          </Menu>
                        }
                        trigger={['click']}
                      >
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          block
                          style={{ marginTop: 8 }}
                        >
                          添加 Action <DownOutlined />
                        </Button>
                      </Dropdown>
                    )}
                  </div>
                </Panel>
              ))}
            </Collapse>
          </Panel>
        ))}
      </Collapse>
    </div>
  );
});
