import { EditOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import React, { useRef, useState } from 'react';

import { debugApi } from '../../api/debug';
import type { VariableBubbleContent } from '../../types/debug';

interface VariableBubbleProps {
  content: VariableBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  actionId?: string;
  onToggleExpand: () => void;
  sessionId?: string;
  onVariableEdit?: (scope: string, name: string, newValue: unknown) => void;
  isLatest?: boolean;
}

const VariableBubble: React.FC<VariableBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  actionId,
  onToggleExpand,
  sessionId,
  onVariableEdit,
  isLatest,
}) => {
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set(['topic']));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const inputRef = useRef<any>(null);

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
    if (value === null || value === undefined) return '(未收集)';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object' && value !== null) {
      // 处理 VariableValue 格式 {value, type, scope, lastUpdated, source}
      if ('value' in value) {
        return formatScopeValue((value as any).value);
      }
      const json = JSON.stringify(value);
      if (json.length > 50) {
        return json.substring(0, 50) + '...';
      }
      return json;
    }
    return String(value);
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

  // 显示所有变量，不再过滤

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
          {!isExpandedScope && varCount > 0 && (
            <span
              style={{ fontSize: '11px', color: '#999', fontWeight: 'normal', marginLeft: '8px' }}
            >
              {Object.keys(variables).slice(0, 2).join(', ')}
              {varCount > 2 && '...'}
            </span>
          )}
        </div>
        {isExpandedScope && (
          <div style={{ fontSize: '12px', marginLeft: '16px' }}>
            {varCount === 0 ? (
              <div style={{ color: '#999' }}>（无变量）</div>
            ) : (
              Object.entries(variables).map(([key, value]) => {
                const isInput = content.relevantVariables?.inputVariables.includes(key);
                const isOutput = content.relevantVariables?.outputVariables.includes(key);
                const editKey = `${scopeName}|${key}`;
                const isEditing = editingKey === editKey;
                const canEdit = content.actionStatus === 'running' && !!sessionId && isLatest;

                const handleStartEdit = () => {
                  setEditingKey(editKey);
                  setEditValue(formatScopeValue(value));
                  setSaveStatus('idle');
                };

                const handleSave = async () => {
                  if (saveStatus === 'saving') return;
                  const oldValue = value;
                  let parsedValue: unknown = editValue;
                  try {
                    parsedValue = JSON.parse(editValue);
                  } catch {
                    // keep as string
                  }

                  setSaveStatus('saving');
                  onVariableEdit?.(scopeName, key, parsedValue);

                  if (sessionId) {
                    try {
                      await debugApi.updateVariable(sessionId, {
                        variableName: key,
                        scope: scopeName,
                        value: parsedValue,
                        phaseId: content.scopePath?.phaseId,
                        topicId: content.scopePath?.topicId,
                      });
                      setSaveStatus('saved');
                      setTimeout(() => {
                        setEditingKey(null);
                        setSaveStatus('idle');
                      }, 1500);
                    } catch {
                      setSaveStatus('error');
                      onVariableEdit?.(scopeName, key, oldValue);
                      setTimeout(() => {
                        setEditingKey(null);
                        setSaveStatus('idle');
                      }, 3000);
                    }
                  }
                };

                const handleCancelEdit = () => {
                  setEditingKey(null);
                  setSaveStatus('idle');
                };

                const handleKeyDown = (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancelEdit();
                };

                return (
                  <div
                    key={key}
                    className="variable-row"
                    style={{
                      marginBottom: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
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
                    {isEditing ? (
                      <>
                        <Input
                          ref={inputRef}
                          size="small"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onBlur={handleSave}
                          autoFocus
                          style={{ width: 120, fontFamily: 'monospace' }}
                        />
                        {saveStatus === 'saved' && (
                          <CheckCircleFilled style={{ color: '#52c41a', fontSize: 14 }} />
                        )}
                        {saveStatus === 'error' && (
                          <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: 14 }} />
                        )}
                        {saveStatus === 'saving' && (
                          <span style={{ fontSize: 11, color: '#999' }}>保存中...</span>
                        )}
                      </>
                    ) : (
                      <span
                        style={{ fontFamily: 'monospace' }}
                        onDoubleClick={canEdit ? handleStartEdit : undefined}
                      >
                        {formatScopeValue(value)}
                      </span>
                    )}
                    {canEdit && !isEditing && (
                      <EditOutlined
                        className="edit-icon"
                        onClick={handleStartEdit}
                        style={{
                          fontSize: 11,
                          color: '#bbb',
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                        }}
                      />
                    )}
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
    Object.keys(content.allVariables.global).length +
    Object.keys(content.allVariables.session).length +
    Object.keys(content.allVariables.phase).length +
    Object.keys(content.allVariables.topic).length;

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
              <strong>Action:</strong> {actionId}{' '}
              {content.actionStatus === 'completed' ? '已完成' : '执行后'}
            </div>
          )}
          {content.actionStatus === 'completed' ? (
            // 动作完成时显示收集变量摘要
            content.collectionHistory && content.collectionHistory.length > 0 ? (
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                <strong>收集变量：</strong>
                {(() => {
                  const lastRound =
                    content.collectionHistory![content.collectionHistory!.length - 1];
                  return lastRound.changes.slice(0, 3).map((c, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {c.name} → {formatScopeValue(c.toValue)}
                    </span>
                  ));
                })()}
                {content.collectionHistory.length > 1 && (
                  <span style={{ color: '#722ed1', marginLeft: '4px' }}>
                    [+{content.collectionHistory.length - 1}轮]
                  </span>
                )}
              </div>
            ) : content.changedVariables.length > 0 ? (
              // 如果没有历史，显示当前变化的变量
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                <strong>收集变量：</strong>
                {content.changedVariables.slice(0, 3).map((v, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {v.name} → {formatScopeValue(v.newValue)}
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#999', marginBottom: '4px' }}>
                （无收集变量）
              </div>
            )
          ) : (
            // 动作进行中显示变化变量
            content.changedVariables.length > 0 && (
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                <strong>变化：</strong>
                {content.changedVariables.slice(0, 3).map((v, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {v.name} = {formatValue(v.newValue)}
                  </span>
                ))}
                {content.changedVariables.length > 3 && '...'}
              </div>
            )
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
          {renderScopeVariables('global', 'Global 级变量', content.allVariables.global)}
          {renderScopeVariables('session', 'Session 级变量', content.allVariables.session)}
          {renderScopeVariables('phase', 'Phase 级变量', content.allVariables.phase)}
          {renderScopeVariables('topic', 'Topic 级变量', content.allVariables.topic)}
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
      <style>{`
        .variable-row:hover .edit-icon { opacity: 1 !important; }
      `}</style>
    </div>
  );
};

export default VariableBubble;
