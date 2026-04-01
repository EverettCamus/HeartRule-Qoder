import { Button, Space } from 'antd';
import React from 'react';

import type { CrisisAlertBubbleContent } from '../../types/debug';

interface CrisisAlertBubbleProps {
  content: CrisisAlertBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  onToggleExpand: () => void;
  onCopy?: () => void;
}

const CrisisAlertBubble: React.FC<CrisisAlertBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  onToggleExpand,
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

  const getCrisisTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      suicide: '自杀风险',
      self_harm: '自伤风险',
      violence: '暴力倾向',
      other: '其他危机',
    };
    return labels[type] || type;
  };

  const getSeverityLabel = (severity: string): string => {
    const labels: Record<string, string> = {
      high: '高',
      medium: '中',
      low: '低',
    };
    return labels[severity] || severity;
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      high: '#cf1322',
      medium: '#fa8c16',
      low: '#faad14',
    };
    return colors[severity] || colors.medium;
  };

  const handleCopy = () => {
    const text = [
      `危机类型: ${getCrisisTypeLabel(content.crisisType)}`,
      `严重程度: ${getSeverityLabel(content.severity)}`,
      `触发文本: ${content.triggerText}`,
      content.llmAssessment ? `LLM评估: ${content.llmAssessment}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      console.log('危机信息已复制到剪贴板');
    });

    onCopy?.();
  };

  return (
    <div
      style={{
        backgroundColor: '#fff7e6',
        border: '1px solid #fa8c16',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        maxWidth: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', marginRight: '8px' }}>⚠️</span>
        <strong style={{ color: '#d46b08', flex: 1 }}>危机警告</strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {!isExpanded && (
        <div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>{getCrisisTypeLabel(content.crisisType)}</strong>
            <span
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                backgroundColor: getSeverityColor(content.severity) + '20',
                color: getSeverityColor(content.severity),
              }}
            >
              严重程度: {getSeverityLabel(content.severity)}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>{content.summary}</div>
        </div>
      )}

      {isExpanded && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              危机类型: {getCrisisTypeLabel(content.crisisType)}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              严重程度:{' '}
              <span style={{ color: getSeverityColor(content.severity) }}>
                {getSeverityLabel(content.severity)}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              触发文本:
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#000',
                backgroundColor: '#fff',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ffd591',
              }}
            >
              {content.triggerText}
            </div>
          </div>

          {content.llmAssessment && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                LLM 评估:
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  backgroundColor: '#fafafa',
                  padding: '8px',
                  borderRadius: '4px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {content.llmAssessment}
              </div>
            </div>
          )}
        </div>
      )}

      <Space size="small">
        <Button size="small" onClick={onToggleExpand}>
          {isExpanded ? '折叠 ▲' : '展开详情 ▼'}
        </Button>
        {isExpanded && (
          <Button size="small" onClick={handleCopy}>
            复制信息
          </Button>
        )}
      </Space>
    </div>
  );
};

export default CrisisAlertBubble;
