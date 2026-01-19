/**
 * PositionBubble - 位置信息气泡
 *
 * 显示当前执行位置的详细路径信息（Phase → Topic → Action）
 * 主题色：黄色/橙色
 */

import React from 'react';

import type { PositionBubbleContent } from '../../types/debug';

interface PositionBubbleProps {
  content: PositionBubbleContent;
  isExpanded: boolean;
  onToggleExpand: () => void;
  timestamp: string;
}

export const PositionBubble: React.FC<PositionBubbleProps> = ({
  content,
  isExpanded,
  onToggleExpand,
  timestamp,
}) => {
  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('zh-CN');
    } catch {
      return ts;
    }
  };

  const handleCopyPath = () => {
    const pathText = `Phase: ${content.phase.name} (${content.phase.id})\nTopic: ${content.topic.name} (${content.topic.id})\nAction: ${content.action.id} (${content.action.type})`;
    navigator.clipboard.writeText(pathText);
  };

  return (
    <div
      style={{
        backgroundColor: '#fff9e6',
        border: '1px solid #ffd666',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: isExpanded ? '12px' : '0',
          cursor: 'pointer',
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '18px' }}>📍</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', color: '#d46b08', fontSize: '14px' }}>位置信息</div>
            {!isExpanded && (
              <div
                style={{
                  fontSize: '13px',
                  color: '#666',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {content.summary}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
          <span
            style={{
              fontSize: '16px',
              color: '#d46b08',
              transition: 'transform 0.2s',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            ▼
          </span>
        </div>
      </div>

      {/* 展开内容 */}
      {isExpanded && (
        <div>
          {/* 执行路径 */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{ fontSize: '13px', fontWeight: 'bold', color: '#666', marginBottom: '8px' }}
            >
              执行路径
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Phase */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  backgroundColor: '#fffbf0',
                  borderRadius: '4px',
                  border: '1px solid #ffe7ba',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#ffa940',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  P
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                    {content.phase.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace' }}>
                    {content.phase.id} (index: {content.phase.index})
                  </div>
                </div>
              </div>

              {/* 连接线 */}
              <div
                style={{
                  width: '2px',
                  height: '12px',
                  backgroundColor: '#ffd666',
                  marginLeft: '11px',
                }}
              />

              {/* Topic */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  backgroundColor: '#fffbf0',
                  borderRadius: '4px',
                  border: '1px solid #ffe7ba',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#ffa940',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  T
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                    {content.topic.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace' }}>
                    {content.topic.id} (index: {content.topic.index})
                  </div>
                </div>
              </div>

              {/* 连接线 */}
              <div
                style={{
                  width: '2px',
                  height: '12px',
                  backgroundColor: '#ffd666',
                  marginLeft: '11px',
                }}
              />

              {/* Action */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  backgroundColor: '#fff7e6',
                  borderRadius: '4px',
                  border: '1px solid #ffd666',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: '#fa8c16',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  A
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                    {content.action.id}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999', fontFamily: 'monospace' }}>
                    Type: {content.action.type} (index: {content.action.index})
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              paddingTop: '8px',
              borderTop: '1px solid #ffe7ba',
            }}
          >
            <button
              onClick={handleCopyPath}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: 'white',
                border: '1px solid #ffd666',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#d46b08',
                fontWeight: '500',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fffbf0';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'white';
              }}
            >
              📋 复制路径
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
