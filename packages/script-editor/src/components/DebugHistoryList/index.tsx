import { DeleteOutlined } from '@ant-design/icons';
import { Button, Empty, List, Modal, Popconfirm, Tag, Typography } from 'antd';
import React, { useEffect, useState } from 'react';

import { debugApi } from '../../api/debug';
import type { ExecutionPosition } from '../../api/debug';
import './style.css';

const { Text } = Typography;

interface SessionListItem {
  sessionId: string;
  scriptId: string;
  scriptFileName: string;
  executionStatus: string;
  createdAt: string;
  updatedAt: string;
  position: ExecutionPosition;
  messageCount: number;
}

interface DebugHistoryListProps {
  visible: boolean;
  projectId: string;
  onEnter: (sessionId: string, executionStatus: string) => void;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  running: { label: '进行中', color: 'green' },
  waiting_input: { label: '等待输入', color: 'blue' },
  completed: { label: '已完成', color: 'default' },
  error: { label: '错误', color: 'red' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPosition(pos: ExecutionPosition): string {
  const phase = pos.phaseId || `Phase ${(pos.phaseIndex || 0) + 1}`;
  const topic = pos.topicId || `Topic ${(pos.topicIndex || 0) + 1}`;
  return `${phase} → ${topic} → ${pos.actionId || '...'}`;
}

const DebugHistoryList: React.FC<DebugHistoryListProps> = ({
  visible,
  projectId,
  onEnter,
  onClose,
}) => {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSessions = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await debugApi.listDebugSessions(projectId);
      if (result.success) {
        setSessions(result.data);
      }
    } catch (err) {
      console.error('[DebugHistory] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadSessions();
      setExpandedId(null);
    }
  }, [visible, projectId]);

  const handleDelete = async (sessionId: string) => {
    try {
      await debugApi.deleteDebugSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      const lastKey = `debug_last:${projectId}`;
      if (localStorage.getItem(lastKey) === sessionId) {
        localStorage.removeItem(lastKey);
      }
    } catch (err) {
      console.error('[DebugHistory] Failed to delete session:', err);
    }
  };

  const isSessionActive = (status: string) => status === 'running' || status === 'waiting_input';

  return (
    <Modal
      title="调试历史"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      {sessions.length === 0 && !loading ? (
        <Empty description="暂无调试历史" />
      ) : (
        <List
          loading={loading}
          dataSource={sessions}
          renderItem={(item) => {
            const statusConfig = STATUS_CONFIG[item.executionStatus] || {
              label: item.executionStatus,
              color: 'default',
            };
            const isExpanded = expandedId === item.sessionId;

            return (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    key="expand"
                    onClick={() => setExpandedId(isExpanded ? null : item.sessionId)}
                  >
                    {isExpanded ? '收起' : '详情'}
                  </Button>,
                  <Button
                    type="link"
                    key="enter"
                    onClick={() => onEnter(item.sessionId, item.executionStatus)}
                  >
                    进入
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title="确定删除此调试会话？"
                    onConfirm={() => handleDelete(item.sessionId)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      <Text strong>{item.scriptFileName}</Text>
                      <Tag color={statusConfig.color} style={{ marginLeft: 8 }}>
                        {statusConfig.label}
                      </Tag>
                    </span>
                  }
                  description={
                    <div>
                      <div>{item.position ? formatPosition(item.position) : '未开始'}</div>
                      <div>
                        {item.messageCount} 条消息 · 创建于 {formatTime(item.createdAt)}
                      </div>
                      {isExpanded && (
                        <div className="debug-history-detail">
                          {isSessionActive(item.executionStatus) && (
                            <div>会话进行中，可继续调试</div>
                          )}
                          {!isSessionActive(item.executionStatus) && (
                            <div>会话已结束，以只读模式查看</div>
                          )}
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
};

export default DebugHistoryList;
