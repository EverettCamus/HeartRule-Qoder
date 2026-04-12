import { Button, Space } from 'antd';
import React, { useState } from 'react';

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
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set(['topic']));

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

  const formatValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const formatScopeValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') {
      const json = JSON.stringify(value);
      if (json.length > 50) {
        return json.substring(0, 50) + '...';
      }
      return json;
    }
    return String(value);
  };

  const filterVariables = (
    variables: Record<string, unknown>,
    relevantVars: string[] | undefined
  ): Record<string, unknown> => {
    if (!relevantVars || relevantVars.length === 0) {
      return variables;
    }
    const filtered: Record<string, unknown> = {};
    for (const key of relevantVars) {
      if (key in variables) {
        filtered[key] = variables[key];
      }
    }
    return filtered;
  };

  const toggleScope = (scope: string) => {
    setExpandedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const allRelevantVarNames = content.relevantVariables
    ? [...content.relevantVariables.inputVariables, ...content.relevantVariables.outputVariables]
    : undefined;

  const filteredGlobal = filterVariables(content.allVariables.global, allRelevantVarNames);
  const filteredSession = filterVariables(content.allVariables.session, allRelevantVarNames);
  const filteredPhase = filterVariables(content.allVariables.phase, allRelevantVarNames);
  const filteredTopic = filterVariables(content.allVariables.topic, allRelevantVarNames);

  const handleExportJSON = () => {
    const data = {
      timestamp,
      actionId,
      changedVariables: content.changedVariables,
      allVariables: content.allVariables,
      actionStatus: content.actionStatus,
      currentRound: content.currentRound,
      maxRounds: content.maxRounds,
      collectionHistory: content.collectionHistory,
      scopePath: content.scopePath,
      exitReason: content.exitReason,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variables-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderCollectionHistory = () => {
    if (!content.collectionHistory || content.collectionHistory.length === 0) return null;

    return (
      <div style={{ marginBottom: '12px' }}>
        <div
          style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', color: '#722ed1' }}
        >
          变量收集历史:
        </div>
        {content.collectionHistory.map((history, idx) => (
          <div
            key={idx}
            style={{
              fontSize: '12px',
              marginLeft: '16px',
              marginBottom: '8px',
              backgroundColor: '#f9f0ff',
              padding: '8px',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
              轮次 {history.round} - {history.timestamp}
            </div>
            {history.changes.map((change, changeIdx) => (
              <div key={changeIdx} style={{ marginLeft: '8px', marginBottom: '2px' }}>
                <span style={{ fontWeight: 'bold' }}>{change.name}</span>:
                {change.fromValue !== undefined && (
                  <span style={{ textDecoration: 'line-through', color: '#999', margin: '0 4px' }}>
                    {formatScopeValue(change.fromValue)}
                  </span>
                )}
                {change.fromValue !== undefined && ' → '}
                <span style={{ color: '#52c41a', fontWeight: 'bold' }}>
                  {formatScopeValue(change.toValue)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderScopeVariables = (
    scopeName: string,
    scopeLabel: string,
    variables: Record<string, unknown>
  ) => {
    const isExpandedScope = expandedScopes.has(scopeName);
    const varCount = Object.keys(variables).length;

    return (
      <div style={{ marginBottom: '8px' }}>
        <div
          onClick={() => toggleScope(scopeName)}
          style={{
            fontSize: '13px',
            fontWeight: 'bold',
            marginBottom: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ marginRight: '4px' }}>{isExpandedScope ? '▼' : '▶'}</span>
          {scopeLabel} ({varCount} 个变量)
          {content.relevantVariables && (
            <span
              style={{
                fontSize: '11px',
                color: '#999',
                fontWeight: 'normal',
                marginLeft: '8px',
              }}
            >
              （仅显示相关）
            </span>
          )}
        </div>
        {isExpandedScope && (
          <div style={{ fontSize: '12px', marginLeft: '16px' }}>
            {varCount === 0 ? (
              <div style={{ color: '#999' }}>
                {content.relevantVariables ? '（无相关变量）' : '（无）'}
              </div>
            ) : (
              Object.entries(variables).map(([key, value]) => {
                const isInput = content.relevantVariables?.inputVariables.includes(key);
                const isOutput = content.relevantVariables?.outputVariables.includes(key);
                return (
                  <div key={key} style={{ marginBottom: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{key}</span>
                    {isInput && (
                      <span style={{ fontSize: '10px', color: '#1890ff', marginLeft: '4px' }}>
                        [输入]
                      </span>
                    )}
                    {isOutput && (
                      <span style={{ fontSize: '10px', color: '#52c41a', marginLeft: '4px' }}>
                        [输出]
                      </span>
                    )}
                    <span>: </span>
                    <span style={{ fontFamily: 'monospace' }}>{formatScopeValue(value)}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const getExitReasonLabel = (reason: string): string => {
    const labels: Record<string, string> = {
      collected: '收集完成',
      resistance: '检测到抵抗',
      crisis: '检测到危机',
      max_rounds: '达到最大轮次',
      user_interrupt: '用户中断',
    };
    return labels[reason] || reason;
  };

  const totalVarCount =
    Object.keys(filteredGlobal).length +
    Object.keys(filteredSession).length +
    Object.keys(filteredPhase).length +
    Object.keys(filteredTopic).length;

  const showCollectionHistory = content.actionStatus === 'completed';

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
        <strong style={{ color: '#389e0d', flex: 1 }}>
          变量状态
          {content.actionStatus && (
            <span
              style={{
                fontSize: '12px',
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor:
                  content.actionStatus === 'completed'
                    ? '#52c41a'
                    : content.actionStatus === 'running'
                      ? '#1890ff'
                      : '#ff4d4f',
                color: '#fff',
              }}
            >
              {content.actionStatus === 'completed'
                ? '已完成'
                : content.actionStatus === 'running'
                  ? '进行中'
                  : '错误'}
            </span>
          )}
        </strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {/* Scope Path */}
      {content.scopePath && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
          <strong>位置:</strong> {content.scopePath.phaseName || content.scopePath.phaseId} →{' '}
          {content.scopePath.topicName || content.scopePath.topicId}
        </div>
      )}

      {/* Running Status */}
      {content.actionStatus === 'running' && (
        <div style={{ fontSize: '12px', marginBottom: '8px', color: '#1890ff' }}>
          <strong>轮次:</strong>{' '}
          {content.currentRound !== undefined &&
            content.maxRounds !== undefined &&
            `${content.currentRound}/${content.maxRounds}`}
        </div>
      )}

      {/* Exit Reason */}
      {content.actionStatus === 'completed' && content.exitReason && (
        <div style={{ fontSize: '12px', marginBottom: '8px', color: '#52c41a' }}>
          <strong>退出原因:</strong> {getExitReasonLabel(content.exitReason)}
        </div>
      )}

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
                  <span style={{ color: '#999', margin: '0 8px' }}>[{v.scope}]</span>
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

          {/* Collection History (only when completed) */}
          {showCollectionHistory && renderCollectionHistory()}

          {/* Scope Variables with Collapsible Sections */}
          {renderScopeVariables('global', 'Global 级变量', filteredGlobal)}
          {renderScopeVariables('session', 'Session 级变量', filteredSession)}
          {renderScopeVariables('phase', 'Phase 级变量', filteredPhase)}
          {renderScopeVariables('topic', 'Topic 级变量', filteredTopic)}
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
