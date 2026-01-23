import { Button, Space } from 'antd';
import React from 'react';

import type { ErrorBubbleContent } from '../../types/debug';

interface ErrorBubbleProps {
  content: ErrorBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  onToggleExpand: () => void;
  onRestart: () => void;
  onCopy?: () => void;
}

const ErrorBubble: React.FC<ErrorBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  onToggleExpand,
  onRestart,
  onCopy,
}) => {
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleCopy = () => {
    const text = [
      `错误代码: ${content.code}`,
      `错误类型: ${content.errorType}`,
      `描述: ${content.message}`,
      content.details ? `详情: ${content.details}` : '',
      content.position
        ? `位置: Phase ${content.position.phaseName} > Topic ${content.position.topicName} > Action ${content.position.actionId}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      console.log('错误信息已复制到剪贴板');
    });

    onCopy?.();
  };

  return (
    <div
      style={{
        backgroundColor: '#fff1f0',
        border: '1px solid #ff4d4f',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', marginRight: '8px' }}>⚠️</span>
        <strong style={{ color: '#cf1322', flex: 1 }}>错误消息</strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {/* Collapsed Content */}
      {!isExpanded && (
        <div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>错误：</strong>
            {content.message}
          </div>
          {content.position && (
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              <strong>Action:</strong> {content.position.actionId}
            </div>
          )}
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
            <strong>类型:</strong> {content.errorType}
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              错误代码: {content.code}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              错误类型: {content.errorType}
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              错误描述:
            </div>
            <div style={{ fontSize: '14px', color: '#000' }}>{content.message}</div>
          </div>

          {content.position && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                执行位置:
              </div>
              <div style={{ fontSize: '13px', marginLeft: '16px' }}>
                <div>Phase: {content.position.phaseName}</div>
                <div>Topic: {content.position.topicName}</div>
                <div>Action: {content.position.actionId}</div>
              </div>
            </div>
          )}

          {content.details && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                技术详情:
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  backgroundColor: '#fafafa',
                  padding: '8px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {content.details}
              </div>
            </div>
          )}

          {content.recovery && content.recovery.suggestions && content.recovery.suggestions.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                修复建议:
              </div>
              <ul style={{ margin: '4px 0', paddingLeft: '24px' }}>
                {content.recovery.suggestions.map((suggestion, index) => (
                  <li key={index} style={{ fontSize: '13px', color: '#666' }}>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {content.stackTrace && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                堆栈跟踪:
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: '#666',
                  backgroundColor: '#fafafa',
                  padding: '8px',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '150px',
                  overflow: 'auto',
                }}
              >
                {content.stackTrace}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <Space size="small">
        <Button size="small" onClick={onToggleExpand}>
          {isExpanded ? '折叠 ▲' : '展开详情 ▼'}
        </Button>
        {isExpanded && (
          <Button size="small" onClick={handleCopy}>
            复制错误信息
          </Button>
        )}
        <Button size="small" type="primary" danger onClick={onRestart}>
          重新开始
        </Button>
      </Space>
    </div>
  );
};

export default ErrorBubble;
