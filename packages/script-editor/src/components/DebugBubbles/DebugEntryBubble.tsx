import { CopyOutlined } from '@ant-design/icons';
import { Button, Collapse, Typography, Tag, Space, message } from 'antd';
import React, { useState } from 'react';

import type { DebugBubbleV2, DebugOutputFilter } from '../../types/debug';
import VariableBubble from '../DebugBubbles/VariableBubble';

const { Text } = Typography;

interface DebugEntryBubbleProps {
  bubble: DebugBubbleV2;
  filter: DebugOutputFilter;
  onToggleExpand: () => void;
  sessionId?: string;
  isLatest?: boolean;
  onVariableEdit?: (scope: string, name: string, newValue: unknown) => void;
}

const formatTime = (isoString: string) => {
  try {
    return new Date(isoString).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
};

const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text).then(
    () => message.success(`${label} 已复制`),
    () => message.error('复制失败')
  );
};

const getFinishReasonMeta = (reason?: string): { label: string; color: string } | null => {
  if (!reason) return null;
  const map: Record<string, { label: string; color: string }> = {
    stop: { label: '正常结束', color: 'green' },
    length: { label: '长度限制', color: 'orange' },
    tool_calls: { label: '工具调用', color: 'blue' },
    content_filter: { label: '内容过滤', color: 'red' },
  };
  return map[reason] || { label: reason, color: 'default' };
};

/** Collapsible text section with header bar, character count, and copy button */
const TextSection: React.FC<{
  title: string;
  icon: string;
  content: string;
  accentColor: string;
  bgColor: string;
}> = ({ title, icon, content, accentColor, bgColor }) => {
  const [expanded, setExpanded] = useState(false);
  const charCount = content.length;
  const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          padding: '6px 10px',
          borderRadius: 6,
          background: bgColor,
          border: `1px solid ${accentColor}20`,
          userSelect: 'none',
        }}
      >
        <span style={{ marginRight: 4, fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: accentColor, flex: 1 }}>
          {icon} {title}
        </span>
        <Tag style={{ margin: 0, fontSize: 11 }}>{charCount.toLocaleString()} 字符</Tag>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            copyToClipboard(content, title);
          }}
          style={{ marginLeft: 4 }}
        />
      </div>
      {expanded && (
        <pre
          style={{
            background: '#fafafa',
            padding: 12,
            borderRadius: '0 0 6px 6px',
            fontSize: 12,
            maxHeight: 400,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            borderLeft: `3px solid ${accentColor}`,
            borderRight: `1px solid ${accentColor}20`,
            borderBottom: `1px solid ${accentColor}20`,
          }}
        >
          {content}
        </pre>
      )}
      {!expanded && (
        <div
          style={{
            color: '#999',
            fontSize: 12,
            padding: '4px 8px 4px 20px',
            borderLeft: `3px solid ${accentColor}40`,
          }}
        >
          {preview}
        </div>
      )}
    </div>
  );
};

/** Fallback: simple variable snapshot when full VariableBubbleContent not available */
const VariableSnapshotSection: React.FC<{
  variableSnapshot: NonNullable<DebugBubbleV2['variableSnapshot']>;
}> = ({ variableSnapshot }) => {
  const scopes = [
    { key: 'global' as const, label: 'Global', color: 'purple' },
    { key: 'session' as const, label: 'Session', color: 'blue' },
    { key: 'phase' as const, label: 'Phase', color: 'green' },
    { key: 'topic' as const, label: 'Topic', color: 'orange' },
  ];

  return (
    <div style={{ marginBottom: 8 }}>
      <Collapse
        size="small"
        ghost
        items={[
          {
            key: 'variables',
            label: '变量快照',
            children: (
              <div>
                {scopes.map(({ key, label, color }) => {
                  const vars = variableSnapshot[key];
                  if (!vars || Object.keys(vars).length === 0) return null;
                  return (
                    <div key={key} style={{ marginBottom: 8 }}>
                      <Tag color={color} style={{ marginBottom: 4 }}>
                        {label} ({Object.keys(vars).length})
                      </Tag>
                      <div
                        style={{
                          background: '#fafafa',
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                      >
                        {Object.entries(vars).map(([name, value]) => (
                          <div key={name} style={{ marginBottom: 2 }}>
                            <Text strong>{name}</Text>
                            {': '}
                            <Text>{JSON.stringify(value)}</Text>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
};

const DebugEntryBubble: React.FC<DebugEntryBubbleProps> = ({
  bubble,
  filter,
  onToggleExpand,
  sessionId,
  isLatest,
  onVariableEdit,
}) => {
  const collapsedLabel = [bubble.topicName || bubble.topicId, bubble.actionName || bubble.actionId]
    .filter(Boolean)
    .join(' / ');

  const expandedLabel = [
    bubble.phaseName || bubble.phaseId,
    bubble.topicName || bubble.topicId,
    bubble.actionName || bubble.actionId,
  ]
    .filter(Boolean)
    .join(' / ');

  const hasLLMEntries = bubble.entries.some((e) => e.type === 'llm_call');
  const llmEntry = bubble.entries.find((e) => e.type === 'llm_call');
  const llmCallCount = bubble.entries.filter((e) => e.type === 'llm_call').length;

  const metaTags: { label: string; color?: string }[] = [];
  if (llmEntry?.model) metaTags.push({ label: llmEntry.model, color: 'blue' });
  if (llmEntry?.tokensUsed)
    metaTags.push({ label: `${llmEntry.tokensUsed} tokens`, color: 'green' });
  if (llmEntry?.responseTimeMs)
    metaTags.push({ label: `${llmEntry.responseTimeMs}ms`, color: 'orange' });
  const finishMeta = getFinishReasonMeta(llmEntry?.finishReason);
  if (finishMeta) metaTags.push({ label: finishMeta.label, color: finishMeta.color });

  const varContent = bubble.variableContent;
  const statusLabel =
    varContent?.actionStatus === 'completed'
      ? '已完成'
      : varContent?.actionStatus === 'running'
        ? '进行中'
        : null;
  const statusColor =
    varContent?.actionStatus === 'completed'
      ? 'green'
      : varContent?.actionStatus === 'running'
        ? 'blue'
        : undefined;

  return (
    <div
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 8,
        padding: 12,
        background: '#fafafa',
        margin: '8px 0',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          marginBottom: bubble.isExpanded ? 12 : 0,
          gap: 4,
          overflow: 'hidden',
        }}
        onClick={onToggleExpand}
      >
        <span style={{ marginRight: 2, flexShrink: 0 }}>{bubble.isExpanded ? '▼' : '▶'}</span>
        <span style={{ fontSize: 15, marginRight: 6, flexShrink: 0 }}>🐛</span>
        <strong style={{ fontSize: 13, color: '#1d1d1d', flexShrink: 0 }}>
          {bubble.isExpanded ? expandedLabel : collapsedLabel} (Round {bubble.round})
        </strong>
        {statusLabel && (
          <Tag color={statusColor} style={{ margin: '0 0 0 6px', flexShrink: 0 }}>
            {statusLabel}
          </Tag>
        )}
        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 'auto', flexShrink: 0 }}>
          {formatTime(bubble.timestamp)}
        </span>
      </div>

      {/* Expanded content */}
      {bubble.isExpanded && (
        <div style={{ paddingLeft: 8 }}>
          {/* Position + Meta bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 12,
              padding: '8px 12px',
              background: '#f5f5f5',
              borderRadius: 6,
            }}
          >
            {metaTags.length > 0 ? (
              <Space size={4}>
                {metaTags.map((m, i) => (
                  <Tag key={i} color={m.color} style={{ margin: 0, fontSize: 11 }}>
                    {m.label}
                  </Tag>
                ))}
              </Space>
            ) : (
              <span style={{ fontSize: 11, color: '#999' }}>无 LLM 调用</span>
            )}
            <span style={{ color: '#d9d9d9' }}>|</span>
            <span style={{ fontSize: 11, color: '#999' }}>{formatTime(bubble.timestamp)}</span>
          </div>

          {/* LLM entries */}
          {hasLLMEntries &&
            filter.showLLMPrompt &&
            bubble.entries
              .filter((e) => e.type === 'llm_call')
              .map((entry, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: '3px solid #1890ff',
                    paddingLeft: 12,
                    marginBottom: 12,
                    background: '#fafafa',
                    borderRadius: '0 6px 6px 0',
                  }}
                >
                  {llmCallCount > 1 && (
                    <div style={{ marginBottom: 6 }}>
                      <Tag color="blue">LLM 调用 #{i + 1}</Tag>
                      {entry.model && <Tag style={{ fontSize: 11 }}>{entry.model}</Tag>}
                    </div>
                  )}
                  {entry.prompt && filter.showLLMPrompt && (
                    <TextSection
                      title="LLM 提示词"
                      icon="📝"
                      content={entry.prompt}
                      accentColor="#1890ff"
                      bgColor="#e6f7ff"
                    />
                  )}
                  {entry.response && filter.showLLMResponse && (
                    <TextSection
                      title="LLM 响应"
                      icon="💬"
                      content={entry.response}
                      accentColor="#722ed1"
                      bgColor="#f9f0ff"
                    />
                  )}
                </div>
              ))}

          {/* Variable state — embedded VariableBubble */}
          {bubble.variableContent && filter.showVariable && (
            <div
              style={{
                borderLeft: '3px solid #52c41a',
                paddingLeft: 12,
                marginBottom: 12,
              }}
            >
              <VariableBubble
                content={bubble.variableContent}
                isExpanded={true}
                timestamp={bubble.timestamp}
                actionId={bubble.actionId}
                onToggleExpand={() => {}}
                sessionId={sessionId}
                isLatest={isLatest}
                onVariableEdit={onVariableEdit}
              />
            </div>
          )}
          {/* Fallback: simple variable snapshot */}
          {!bubble.variableContent && bubble.variableSnapshot && filter.showVariable && (
            <div
              style={{
                borderLeft: '3px solid #52c41a',
                paddingLeft: 12,
                marginBottom: 12,
              }}
            >
              <VariableSnapshotSection variableSnapshot={bubble.variableSnapshot} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugEntryBubble;
