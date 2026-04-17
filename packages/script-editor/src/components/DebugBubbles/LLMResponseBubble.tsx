import { Button, Space } from 'antd';
import React, { useState } from 'react';

import type { LLMResponseBubbleContent } from '../../types/debug';

interface LLMResponseBubbleProps {
  content: LLMResponseBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  actionId?: string;
  onToggleExpand: () => void;
}

/**
 * LLM 响应气泡组件
 *
 * 显示 LLM 的原始响应内容（JSON 格式）
 * 紫色/深蓝色主题
 */
const LLMResponseBubble: React.FC<LLMResponseBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  actionId,
  onToggleExpand,
}) => {
  const [copySuccess, setCopySuccess] = useState(false);

  // 统一的响应内容处理函数：处理转义字符
  const parseResponseText = (rawText: string): string => {
    let displayText = rawText;

    // 处理所有常见的转义序列
    displayText = displayText.replace(/\\r\\n/g, '\n'); // 字面量 \r\n -> 换行
    displayText = displayText.replace(/\\n/g, '\n'); // 字面量 \n -> 换行
    displayText = displayText.replace(/\\r/g, '\n'); // 字面量 \r -> 换行
    displayText = displayText.replace(/\\t/g, '\t'); // 字面量 \t -> 制表符
    displayText = displayText.replace(/\\"/g, '"'); // 字面量 \" -> 双引号
    displayText = displayText.replace(/\\'/g, "'"); // 字面量 \' -> 单引号
    displayText = displayText.replace(/\\\\/g, '\\'); // 字面量 \\\\ -> 反斜杠

    // 统一处理真实的换行符（如果存在）
    displayText = displayText.replace(/\r\n/g, '\n');
    displayText = displayText.replace(/\r/g, '\n');

    return displayText;
  };

  // 格式化时间
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 复制 JSON 内容
  const handleCopyJSON = () => {
    navigator.clipboard.writeText(content.rawResponse).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  return (
    <div
      style={{
        backgroundColor: '#f0f5ff',
        border: '1px solid: #597ef7',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px',
        fontFamily: 'monospace',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🤖</span>
          <strong style={{ color: '#1d39c4' }}>LLM 响应</strong>
          <span style={{ fontSize: '12px', color: '#8c8c8c' }}>{formatTime(timestamp)}</span>
        </div>
      </div>

      {/* Collapsed Content */}
      {!isExpanded && (
        <div style={{ color: '#595959', fontSize: '13px' }}>
          <div style={{ marginBottom: '4px' }}>
            <strong>模型:</strong> {content.model}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>响应时间:</strong> {content.responseTimeMs ?? '-'}ms
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Token 使用:</strong> {content.tokens} / {content.maxTokens}
          </div>
          {actionId && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Action:</strong> {actionId}
            </div>
          )}
          <div
            style={{
              backgroundColor: '#fff',
              padding: '8px',
              borderRadius: '4px',
              marginTop: '8px',
              maxHeight: '60px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {content.preview}
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{ color: '#595959', fontSize: '13px' }}>
          {/* Metadata */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ marginBottom: '4px' }}>
              <strong>模型:</strong> {content.model}
            </div>
            <div style={{ marginBottom: '4px' }}>
              <strong>响应时间:</strong> {content.responseTimeMs ?? '-'}ms
            </div>
            <div style={{ marginBottom: '4px' }}>
              <strong>Token 使用:</strong> {content.tokens} / {content.maxTokens}
            </div>
            {actionId && (
              <div style={{ marginBottom: '4px' }}>
                <strong>Action:</strong> {actionId}
              </div>
            )}
          </div>

          {/* Processed Response */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', color: '#1d39c4' }}>
              处理后的响应:
            </div>
            <div
              style={{
                backgroundColor: '#fff',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #d9d9d9',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {parseResponseText(content.processedResponse)}
            </div>
          </div>

          {/* Raw Response (JSON) */}
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                fontWeight: 'bold',
                marginBottom: '4px',
                color: '#1d39c4',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>原始响应 (JSON):</span>
              <Button size="small" onClick={handleCopyJSON}>
                {copySuccess ? '✓ 已复制' : '复制 JSON'}
              </Button>
            </div>
            <pre
              style={{
                backgroundColor: '#fff',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #d9d9d9',
                maxHeight: '300px',
                overflow: 'auto',
                margin: 0,
                fontSize: '12px',
                lineHeight: '1.5',
              }}
            >
              {content.rawResponse}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          <Button size="small" onClick={onToggleExpand}>
            {isExpanded ? '折叠 ▲' : '展开详情 ▼'}
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default LLMResponseBubble;
