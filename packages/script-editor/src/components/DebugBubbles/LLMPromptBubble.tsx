import { Button, Space } from 'antd';
import React from 'react';

import type { LLMPromptBubbleContent } from '../../types/debug';

interface LLMPromptBubbleProps {
  content: LLMPromptBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  actionId?: string;
  onToggleExpand: () => void;
}

const LLMPromptBubble: React.FC<LLMPromptBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  actionId,
  onToggleExpand,
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

  // 统一的 prompt 处理函数：提取 JSON 包装的 content 字段，并统一换行符
  const parsePromptText = (rawText: string): string => {
    let displayText = rawText;
    try {
      // 判断是否是 JSON 格式
      const trimmed = displayText.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const parsed = JSON.parse(trimmed);
        if (parsed.content && typeof parsed.content === 'string') {
          displayText = parsed.content;
        }
      }
    } catch (e) {
      // JSON 解析失败是正常现象（prompt 可能包含未转义的控制字符）
      // 静默处理，使用原始内容
    }

    // 处理所有常见的转义序列
    // 注意：JSON.parse 已经处理了一层转义，但如果是双重JSON序列化，这里需要再处理一次
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

  const handleCopy = () => {
    // 使用统一的处理函数
    const processedSystemPrompt = content.systemPrompt ? parsePromptText(content.systemPrompt) : '';
    const processedUserPrompt = parsePromptText(content.userPrompt);

    const text = [
      processedSystemPrompt ? `系统提示词:\n${processedSystemPrompt}\n` : '',
      `用户提示词:\n${processedUserPrompt}\n`,
      content.conversationHistory && content.conversationHistory.length > 0
        ? `\n对话历史:\n${content.conversationHistory.map((h) => `${h.role}: ${h.content}`).join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      console.log('提示词已复制到剪贴板');
    });
  };

  return (
    <div
      style={{
        backgroundColor: '#e6f7ff',
        border: '1px solid #1890ff',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', marginRight: '8px' }}>💡</span>
        <strong style={{ color: '#0050b3', flex: 1 }}>LLM 提示词</strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {/* Collapsed Content */}
      {!isExpanded && (
        <div>
          {actionId && (
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              <strong>Action:</strong> {actionId}
            </div>
          )}
          <div style={{ fontSize: '13px', marginBottom: '8px' }}>
            <strong>提示词片段:</strong> {content.preview}
            {content.userPrompt.length > 100 && '...'}
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div>
          {actionId && (
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
              <strong>Action:</strong> {actionId}
            </div>
          )}

          {content.systemPrompt && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                系统提示词:
              </div>
              <div
                style={{
                  fontSize: '12px',
                  backgroundColor: '#fff',
                  padding: '8px',
                  borderRadius: '4px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                {parsePromptText(content.systemPrompt)}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              用户提示词:
            </div>
            <div
              style={{
                fontSize: '12px',
                backgroundColor: '#fff',
                padding: '8px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflow: 'auto',
              }}
            >
              {parsePromptText(content.userPrompt)}
            </div>
          </div>

          {content.conversationHistory && content.conversationHistory.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                对话历史: [{content.conversationHistory.length} 条消息]
              </div>
              <div
                style={{
                  maxHeight: '150px',
                  overflow: 'auto',
                  backgroundColor: '#fff',
                  padding: '8px',
                  borderRadius: '4px',
                }}
              >
                {content.conversationHistory.map((msg, index) => (
                  <div key={index} style={{ marginBottom: '8px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 'bold', color: '#0050b3' }}>{msg.role}:</div>
                    <div style={{ marginLeft: '12px', color: '#666' }}>{msg.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <Space size="small">
        <Button size="small" onClick={onToggleExpand}>
          {isExpanded ? '折叠 ▲' : '展开全文 ▼'}
        </Button>
        {isExpanded && (
          <Button size="small" onClick={handleCopy}>
            复制提示词
          </Button>
        )}
      </Space>
    </div>
  );
};

export default LLMPromptBubble;
