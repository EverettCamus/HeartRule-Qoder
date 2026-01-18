import { Button, Space } from 'antd';
import React from 'react';

import type { VariableBubbleContent } from '../../types/debug';

interface VariableBubbleProps {
  content: VariableBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  actionId?: string;
  onToggleExpand: () => void;
}

const VariableBubble: React.FC<VariableBubbleProps> = ({
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

  const formatValue = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const handleExportJSON = () => {
    const data = {
      timestamp,
      actionId,
      changedVariables: content.changedVariables,
      allVariables: content.allVariables,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variables-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalVarCount =
    Object.keys(content.allVariables.session).length +
    Object.keys(content.allVariables.phase).length +
    Object.keys(content.allVariables.topic).length;

  return (
    <div
      style={{
        backgroundColor: '#f6ffed',
        border: '1px solid #52c41a',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        maxWidth: '100%',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', marginRight: '8px' }}>📊</span>
        <strong style={{ color: '#389e0d', flex: 1 }}>变量状态</strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {/* Collapsed Content */}
      {!isExpanded && (
        <div>
          {actionId && (
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              <strong>Action:</strong> {actionId} 执行后
            </div>
          )}
          {content.changedVariables.length > 0 && (
            <div style={{ fontSize: '13px', marginBottom: '4px' }}>
              <strong>新增/变化：</strong>
              {content.changedVariables.slice(0, 3).map((v, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  {v.name} = {formatValue(v.newValue)}
                </span>
              ))}
              {content.changedVariables.length > 3 && '...'}
            </div>
          )}
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
            <strong>当前总计:</strong> {totalVarCount} 个变量
          </div>
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div>
          {actionId && (
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
              <strong>Action:</strong> {actionId} 执行后
            </div>
          )}

          {content.changedVariables.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                变化的变量:
              </div>
              {content.changedVariables.map((v, index) => (
                <div
                  key={index}
                  style={{
                    fontSize: '12px',
                    marginLeft: '16px',
                    marginBottom: '4px',
                    backgroundColor: '#fff',
                    padding: '4px 8px',
                    borderRadius: '4px',
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>{v.name}</span>
                  <span style={{ color: '#999', margin: '0 8px' }}>
                    [{v.scope}]
                  </span>
                  {v.oldValue !== undefined && (
                    <span style={{ textDecoration: 'line-through', color: '#999' }}>
                      {formatValue(v.oldValue)}
                    </span>
                  )}
                  {v.oldValue !== undefined && ' → '}
                  <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
                    {formatValue(v.newValue)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              Session 级变量:
            </div>
            {Object.keys(content.allVariables.session).length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999', marginLeft: '16px' }}>
                （无）
              </div>
            ) : (
              <div style={{ fontSize: '12px', marginLeft: '16px' }}>
                {Object.entries(content.allVariables.session).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{key}:</span>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              Phase 级变量:
            </div>
            {Object.keys(content.allVariables.phase).length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999', marginLeft: '16px' }}>
                （无）
              </div>
            ) : (
              <div style={{ fontSize: '12px', marginLeft: '16px' }}>
                {Object.entries(content.allVariables.phase).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{key}:</span>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              Topic 级变量:
            </div>
            {Object.keys(content.allVariables.topic).length === 0 ? (
              <div style={{ fontSize: '12px', color: '#999', marginLeft: '16px' }}>
                （无）
              </div>
            ) : (
              <div style={{ fontSize: '12px', marginLeft: '16px' }}>
                {Object.entries(content.allVariables.topic).map(([key, value]) => (
                  <div key={key} style={{ marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{key}:</span>{' '}
                    <span style={{ fontFamily: 'monospace' }}>{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <Space size="small">
        <Button size="small" onClick={onToggleExpand}>
          {isExpanded ? '折叠 ▲' : '展开所有变量 ▼'}
        </Button>
        {isExpanded && (
          <Button size="small" onClick={handleExportJSON}>
            导出JSON
          </Button>
        )}
      </Space>
    </div>
  );
};

export default VariableBubble;
