import React, { useState } from 'react';
import { Card, Typography, Tag, Space, Tooltip, Collapse, Button, Popconfirm, Dropdown, Menu } from 'antd';
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
  onMoveTopic?: (fromPhaseIndex: number, fromTopicIndex: number, toPhaseIndex: number, toTopicIndex: number) => void;
  onMoveAction?: (fromPhaseIndex: number, fromTopicIndex: number, fromActionIndex: number, toPhaseIndex: number, toTopicIndex: number, toActionIndex: number) => void;
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
    ai_say: 'AI 说话',
    ai_ask: 'AI 提问',
    ai_think: 'AI 思考',
    use_skill: '使用技能',
    show_form: '展示表单',
    show_pic: '展示图片',
    say: '说话',
    user_say: '用户说话',
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

export const ActionNodeList: React.FC<ActionNodeListProps> = ({
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
}) => {
  // 默认展开所有层级
  const [expandedPhases, setExpandedPhases] = useState<string[]>(
    phases.map((_, i) => `phase-${i}`)
  );
  const [expandedTopics, setExpandedTopics] = useState<string[]>(
    phases.flatMap((phase, pi) => 
      phase.topics.map((_, ti) => `phase-${pi}-topic-${ti}`)
    )
  );

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{
    type: 'phase' | 'topic' | 'action';
    phaseIndex: number;
    topicIndex?: number;
    actionIndex?: number;
  } | null>(null);

  if (!phases || phases.length === 0) {
    return (
      <div className="action-node-list-empty">
        <Text type="secondary">暂无脚本内容</Text>
      </div>
    );
  }

  // 渲染单个 Action 卡片
  const renderActionCard = (action: Action, phaseIndex: number, topicIndex: number, actionIndex: number) => {
    const isSelected = 
      selectedActionPath?.phaseIndex === phaseIndex &&
      selectedActionPath?.topicIndex === topicIndex &&
      selectedActionPath?.actionIndex === actionIndex;
    const content = getActionContent(action);

    return (
      <Card
        key={actionIndex}
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
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          if (!onMoveAction || !draggedItem) return;
          e.preventDefault();
          e.stopPropagation();
          
          if (draggedItem.type === 'action' && draggedItem.actionIndex !== undefined && draggedItem.topicIndex !== undefined) {
            if (draggedItem.phaseIndex !== phaseIndex || 
                draggedItem.topicIndex !== topicIndex || 
                draggedItem.actionIndex !== actionIndex) {
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
        onDragEnd={() => setDraggedItem(null)}
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
    <div className="action-node-list">
      {/* 顶部添加 Phase 按钮 */}
      {onAddPhase && (
        <div style={{ padding: '0 0 16px 0' }}>
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={onAddPhase}
            block
          >
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
                  if (!onMovePhase || !draggedItem) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  if (!onMovePhase || !draggedItem) return;
                  e.preventDefault();
                  e.stopPropagation();
                  
                  if (draggedItem.type === 'phase' && draggedItem.phaseIndex !== phaseIndex) {
                    onMovePhase(draggedItem.phaseIndex, phaseIndex);
                  }
                  setDraggedItem(null);
                }}
                onDragEnd={() => setDraggedItem(null)}
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
                  {selectedPhasePath?.phaseIndex === phaseIndex && (
                    <Tag color="cyan">已选中</Tag>
                  )}
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
                        if (!onMoveTopic || !draggedItem) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        if (!onMoveTopic || !draggedItem) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        if (draggedItem.type === 'topic' && draggedItem.topicIndex !== undefined) {
                          if (draggedItem.phaseIndex !== phaseIndex || draggedItem.topicIndex !== topicIndex) {
                            onMoveTopic(
                              draggedItem.phaseIndex,
                              draggedItem.topicIndex,
                              phaseIndex,
                              topicIndex
                            );
                          }
                        }
                        setDraggedItem(null);
                      }}
                      onDragEnd={() => setDraggedItem(null)}
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
                              <Menu onClick={({ key }) => {
                                onAddAction(phaseIndex, topicIndex, key as string);
                              }}>
                                <Menu.Item key="ai_say" icon={<MessageOutlined />}>AI 说话</Menu.Item>
                                <Menu.Item key="ai_ask" icon={<QuestionCircleOutlined />}>AI 提问</Menu.Item>
                                <Menu.Item key="ai_think" icon={<BulbOutlined />}>AI 思考</Menu.Item>
                                <Menu.Item key="use_skill" icon={<ThunderboltOutlined />}>使用技能</Menu.Item>
                                <Menu.Item key="show_form" icon={<FormOutlined />}>展示表单</Menu.Item>
                                <Menu.Item key="show_pic" icon={<PictureOutlined />}>展示图片</Menu.Item>
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
                          <Menu onClick={({ key }) => {
                            onAddAction(phaseIndex, topicIndex, key as string);
                          }}>
                            <Menu.Item key="ai_say" icon={<MessageOutlined />}>AI 说话</Menu.Item>
                            <Menu.Item key="ai_ask" icon={<QuestionCircleOutlined />}>AI 提问</Menu.Item>
                            <Menu.Item key="ai_think" icon={<BulbOutlined />}>AI 思考</Menu.Item>
                            <Menu.Item key="use_skill" icon={<ThunderboltOutlined />}>使用技能</Menu.Item>
                            <Menu.Item key="show_form" icon={<FormOutlined />}>展示表单</Menu.Item>
                            <Menu.Item key="show_pic" icon={<PictureOutlined />}>展示图片</Menu.Item>
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
};
