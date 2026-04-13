# 变量调试面板改进实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进变量调试气泡，使其在动作完成后显示收集历史和各层级变量快照。

**Architecture:** 后端在 session-manager 中计算轮次变化并返回新字段，前端在 DebugChatPanel 累积历史，在 VariableBubble 中改进渲染逻辑。

**Tech Stack:** TypeScript, React, Ant Design

---

## 文件结构

### 新建/修改文件

```
packages/shared-types/src/api/responses.ts
  - 添加 RoundChanges, ActionStatus 等类型

packages/script-editor/src/types/debug.ts
  - 扩展 VariableBubbleContent 接口

packages/script-editor/src/api/debug.ts
  - 处理新响应字段

packages/script-editor/src/components/DebugChatPanel/index.tsx
  - 添加 collectionHistory 状态累积逻辑
  - 传递历史数据给 VariableBubble

packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx
  - 重构渲染逻辑：动作进行中 vs 已完成
  - 添加收集历史显示
  - 添加层级折叠/展开功能

packages/api-server/src/services/session-manager.ts
  - 计算 roundChanges
  - 提取 actionStatus 和 exitReason

packages/core-engine/src/domain/actions/base-action.ts
  - ActionResult 添加 exitReason 字段（可选）
```

---

## Task 1: 扩展类型定义（shared-types）

**Files:**

- Modify: `packages/shared-types/src/api/responses.ts`

- [ ] **Step 1: 添加轮次变化类型**

在 `responses.ts` 末尾添加：

```typescript
/**
 * 单轮变量变化记录
 */
export interface RoundVariableChange {
  round: number;
  timestamp: string;
  changes: Array<{
    name: string;
    fromValue?: unknown;
    toValue: unknown;
    scope: 'global' | 'session' | 'phase' | 'topic';
  }>;
}

export const RoundVariableChangeSchema = z.object({
  round: z.number(),
  timestamp: z.string(),
  changes: z.array(
    z.object({
      name: z.string(),
      fromValue: z.unknown().optional(),
      toValue: z.unknown(),
      scope: z.enum(['global', 'session', 'phase', 'topic']),
    })
  ),
});

/**
 * 动作状态
 */
export type ActionStatus = 'running' | 'completed' | 'error';

export const ActionStatusSchema = z.enum(['running', 'completed', 'error']);

/**
 * 动作退出原因
 */
export type ActionExitReason =
  | 'collected'
  | 'resistance'
  | 'crisis'
  | 'max_rounds'
  | 'user_interrupt';

export const ActionExitReasonSchema = z.enum([
  'collected',
  'resistance',
  'crisis',
  'max_rounds',
  'user_interrupt',
]);
```

- [ ] **Step 2: 导出新类型**

确保在文件顶部有正确的导出（已是 `export` 声明，无需额外操作）

- [ ] **Step 3: 验证类型检查**

```bash
cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/shared-types typecheck
```

Expected: 类型检查通过

---

## Task 2: 扩展前端类型（script-editor）

**Files:**

- Modify: `packages/script-editor/src/types/debug.ts`

- [ ] **Step 1: 扩展 VariableBubbleContent 接口**

在 `VariableBubbleContent` 接口中添加新字段：

```typescript
export interface VariableBubbleContent {
  type: 'variable';
  changedVariables: Array<{
    name: string;
    oldValue?: unknown;
    newValue: unknown;
    scope: 'global' | 'session' | 'phase' | 'topic';
  }>;
  allVariables: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  relevantVariables?: {
    inputVariables: string[];
    outputVariables: string[];
  };
  summary: string;

  // === 新增字段 ===
  /** 动作状态：running=进行中, completed=已完成, error=出错 */
  actionStatus?: 'running' | 'completed' | 'error';

  /** 当前轮次（仅 actionStatus=running 时有效） */
  currentRound?: number;

  /** 最大轮次 */
  maxRounds?: number;

  /** 变量收集历史（仅 actionStatus=completed 时有效） */
  collectionHistory?: Array<{
    round: number;
    timestamp: string;
    changes: Array<{
      name: string;
      fromValue?: unknown;
      toValue: unknown;
    }>;
  }>;

  /** 层级路径信息 */
  scopePath?: {
    phaseId: string;
    phaseName: string;
    topicId: string;
    topicName: string;
  };

  /** 动作退出原因（仅 actionStatus=completed 时有效） */
  exitReason?: 'collected' | 'resistance' | 'crisis' | 'max_rounds' | 'user_interrupt';
}
```

- [ ] **Step 2: 验证类型检查**

```bash
cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/script-editor typecheck
```

Expected: 类型检查通过

---

## Task 3: 后端 - 计算轮次变化（api-server）

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

- [ ] **Step 1: 添加辅助方法计算轮次变化**

在 `SessionManager` 类中添加私有方法（约在 `flattenVariableStore` 方法之后）：

```typescript
/**
 * 计算本轮变量变化
 */
private calculateRoundChanges(
  prevState: {
    global: Record<string, any>;
    session: Record<string, any>;
    phase: Record<string, any>;
    topic: Record<string, any>;
  } | null,
  currentState: {
    global: Record<string, any>;
    session: Record<string, any>;
    phase: Record<string, any>;
    topic: Record<string, any>;
  },
  outputVariables: string[],
  round: number
): {
  round: number;
  timestamp: string;
  changes: Array<{
    name: string;
    fromValue?: any;
    toValue: any;
    scope: string;
  }>;
} | null {
  if (!outputVariables || outputVariables.length === 0) {
    return null;
  }

  const changes: Array<{
    name: string;
    fromValue?: any;
    toValue: any;
    scope: string;
  }> = [];

  // 只追踪 outputVariables 中的变量
  for (const varName of outputVariables) {
    // 查找变量在哪个作用域
    let found = false;
    for (const scope of ['topic', 'phase', 'session', 'global'] as const) {
      const currentScopedVars = currentState[scope];
      if (currentScopedVars && varName in currentScopedVars) {
        const currentValue = currentScopedVars[varName];
        const prevValue = prevState?.[scope]?.[varName];

        // 只有值变化了才记录
        if (JSON.stringify(prevValue) !== JSON.stringify(currentValue)) {
          changes.push({
            name: varName,
            fromValue: prevValue,
            toValue: currentValue,
            scope,
          });
        }
        found = true;
        break;
      }
    }

    // 新变量（之前不存在）
    if (!found) {
      for (const scope of ['topic', 'phase', 'session', 'global'] as const) {
        const currentScopedVars = currentState[scope];
        if (currentScopedVars && varName in currentScopedVars) {
          changes.push({
            name: varName,
            toValue: currentScopedVars[varName],
            scope,
          });
          break;
        }
      }
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    round,
    timestamp: new Date().toISOString(),
    changes,
  };
}

/**
 * 从 ActionResult 或 executionState 中提取退出原因
 */
private extractExitReason(
  executionState: ExecutionState,
  actionResult?: any
): 'collected' | 'resistance' | 'crisis' | 'max_rounds' | 'user_interrupt' | undefined {
  // 从 actionResult.metadata.exitDecision 获取
  if (actionResult?.metadata?.exitDecision) {
    const decision = actionResult.metadata.exitDecision;
    if (decision.reason === 'collected') return 'collected';
    if (decision.reason === 'resistance') return 'resistance';
    if (decision.reason === 'crisis') return 'crisis';
    if (decision.reason === 'max_rounds') return 'max_rounds';
    if (decision.reason === 'user_interrupt') return 'user_interrupt';
  }

  // 从 executionState.metadata.exitDecision 获取
  const exitDecisions = executionState.metadata?.exitDecisions;
  if (exitDecisions && exitDecisions.length > 0) {
    const lastDecision = exitDecisions[exitDecisions.length - 1];
    return lastDecision?.decision?.reason || 'collected';
  }

  return undefined;
}
```

- [ ] **Step 2: 在 buildResponse 中添加新字段**

找到 `buildResponse` 方法中返回 `result` 的位置（约 573-582 行），添加 `roundChanges` 计算逻辑：

首先找到获取 outputVariables 的位置，在方法开头附近添加：

```typescript
// 在 buildResponse 方法内部，buildVariableSnapshots 之后添加

// 获取当前 action 的输出变量列表
const currentAction = executionState.currentAction;
const outputVariables = currentAction?.getConfig?.('output')?.map((v: any) => v.get) || [];

// 计算动作状态
const actionStatus: 'running' | 'completed' | 'error' =
  executionState.status === 'error'
    ? 'error'
    : executionState.status === 'completed'
      ? 'completed'
      : 'running';

// 获取当前轮次
const currentRound =
  executionState.metadata?.actionRoundInfo?.[currentAction?.actionId || '']?.currentRound ||
  executionState.metadata?.actionState?.currentRound;

const maxRounds =
  currentAction?.getConfig?.('max_rounds') || executionState.metadata?.actionState?.maxRounds;

// 计算轮次变化（变量收集历史）
const roundChanges = this.calculateRoundChanges(
  prevState, // 需要保存上一次的 variableStore 快照
  flattenedVariableStore,
  outputVariables,
  currentRound || 1
);
```

- [ ] **Step 3: 修改返回对象添加新字段**

在返回的 `result` 对象中添加新字段：

```typescript
// 在 result 对象中添加（约 575 行之后）
result.actionStatus = actionStatus;
result.currentRound = currentRound;
result.maxRounds = maxRounds;
result.outputVariables = outputVariables;
if (roundChanges) {
  result.roundChanges = roundChanges;
}
if (actionStatus === 'completed') {
  result.exitReason = this.extractExitReason(executionState);
}
```

注意：需要在类中添加 `prevState` 属性来保存上一次的变量状态快照。

- [ ] **Step 4: 在类中添加 prevState 属性**

在 `SessionManager` 类顶部添加私有属性：

```typescript
export class SessionManager {
  private scriptExecutor: ScriptExecutor;
  private templateProvider: TemplateProvider;
  private prevVariableSnapshots: Map<
    string,
    {
      global: Record<string, any>;
      session: Record<string, any>;
      phase: Record<string, any>;
      topic: Record<string, any>;
    }
  > = new Map();

  // ...
}
```

在 `processUserInput` 方法末尾，返回响应之前保存当前状态：

```typescript
// 在 buildResponse 之后，return result 之前
this.prevVariableSnapshots.set(sessionId, result.variableStore || {});
```

- [ ] **Step 5: 验证编译**

```bash
cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/api-server typecheck
```

Expected: 编译通过

---

## Task 4: 前端 - 累积历史数据（DebugChatPanel）

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: 添加 collectionHistory 状态**

在组件顶部状态声明区域（约 77 行附近）添加：

```typescript
// 变量收集历史（按 actionId 分组）
const [collectionHistory, setCollectionHistory] = useState<
  Map<
    string,
    Array<{
      round: number;
      timestamp: string;
      changes: Array<{
        name: string;
        fromValue?: unknown;
        toValue: unknown;
      }>;
    }>
  >
>(new Map());
```

- [ ] **Step 2: 在 handleSendMessage 中更新历史**

找到创建变量气泡的代码（约 646-702 行），在创建气泡之前更新历史：

```typescript
// 在创建变量气泡之前，更新收集历史
if (response.actionStatus === 'completed') {
  // 动作完成，保存完整历史
  const actionId = response.position?.actionId || 'unknown';
  const history = collectionHistory.get(actionId) || [];

  if (response.collectionHistory && response.collectionHistory.length > 0) {
    setCollectionHistory((prev) => {
      const newMap = new Map(prev);
      newMap.set(actionId, response.collectionHistory || []);
      return newMap;
    });
  }
}
```

- [ ] **Step 3: 传递历史数据给 VariableBubble**

修改 VariableBubble 的 props，添加 collectionHistory：

```typescript
{item.data.type === 'variable' && (
  <VariableBubble
    content={item.data.content as VariableBubbleContent}
    isExpanded={item.data.isExpanded}
    timestamp={item.data.timestamp}
    actionId={item.data.actionId}
    collectionHistory={item.data.content.collectionHistory} // 新增
    onToggleExpand={() => toggleBubbleExpand(item.data.id)}
  />
)}
```

- [ ] **Step 4: 更新 DebugBubble 类型**

在创建 variableBubble 对象时，确保 collectionHistory 被包含：

```typescript
const variableBubble: DebugBubble = {
  id: uuidv4(),
  type: 'variable',
  timestamp: new Date().toISOString(),
  isExpanded: false,
  actionId: response.position?.actionId,
  actionType: response.position?.actionType,
  content: {
    type: 'variable',
    changedVariables: [], // TODO: 计算变化的变量
    allVariables: categorizedVars,
    relevantVariables,
    summary: '变量更新',
    // 新增字段
    actionStatus: response.actionStatus,
    currentRound: response.currentRound,
    maxRounds: response.maxRounds,
    collectionHistory: response.collectionHistory,
    scopePath: {
      phaseId: response.position?.phaseId || '',
      phaseName: response.position?.phaseName || '',
      topicId: response.position?.topicId || '',
      topicName: response.position?.topicName || '',
    },
    exitReason: response.exitReason,
  } as VariableBubbleContent,
};
```

- [ ] **Step 5: 更新 handleSendMessage 的变量创建逻辑**

在响应处理后，需要根据 actionStatus 更新气泡状态。找到最后一轮响应的处理位置：

```typescript
// 如果动作完成，需要获取完整的收集历史
if (response.actionStatus === 'completed' && response.position?.actionId) {
  const actionId = response.position.actionId;
  // 从 API 获取完整历史或使用累积的历史
  // 這裡我們使用累积的 collectionHistory state
}
```

---

## Task 5: 前端 - 重构 VariableBubble 组件

**Files:**

- Modify: `packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx`

这个任务较大，分成多个子步骤。

- [ ] **Step 1: 更新组件 Props**

```typescript
interface VariableBubbleProps {
  content: VariableBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  actionId?: string;
  collectionHistory?: VariableBubbleContent['collectionHistory']; // 新增
  onToggleExpand: () => void;
}
```

- [ ] **Step 2: 添加层级折叠状态**

在组件内部添加状态：

```typescript
const VariableBubble: React.FC<VariableBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  actionId,
  collectionHistory,
  onToggleExpand,
}) => {
  // 层级折叠状态
  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(new Set(['topic']));

  const toggleScope = (scope: string) => {
    setExpandedScopes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scope)) {
        newSet.delete(scope);
      } else {
        newSet.add(scope);
      }
      return newSet;
    });
  };

  // ... rest of component
```

- [ ] **Step 3: 添加辅助函数**

```typescript
// 格式化值显示
const formatValue = (value: any): string => {
  if (value === null || value === undefined) return '(未收集)';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object' && 'value' in value) {
    return formatValue((value as any).value);
  }
  return String(value);
};

// 渲染收集历史
const renderCollectionHistory = () => {
  const history = collectionHistory || content.collectionHistory;
  if (!history || history.length === 0) return null;

  // 按变量名聚合历史
  const variableHistory = new Map<string, Array<{ round: number; fromValue?: any; toValue: any }>>();

  for (const round of history) {
    for (const change of round.changes) {
      const existing = variableHistory.get(change.name) || [];
      if (change.fromValue !== undefined) {
        // 第二次及之后的变化，只有 toValue 是新值
        existing.push({ round: round.round, fromValue: change.fromValue, toValue: change.toValue });
      } else {
        // 第一次遇到这个变量
        existing.push({ round: round.round, toValue: change.toValue });
      }
      variableHistory.set(change.name, existing);
    }
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#389e0d' }}>
        ▼ 收集历史（当前动作相关）
      </div>
      {Array.from(variableHistory.entries()).map(([varName, changes]) => (
        <div key={varName} style={{ fontSize: '12px', marginLeft: '16px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 'bold' }}>{varName}</span>
          <span style={{ color: '#666', marginLeft: '8px' }}>
            {changes.map((c, i) => {
              const from = i === 0 ? '(空白)' : formatValue(c.fromValue);
              const to = formatValue(c.toValue);
              return i === 0
                ? `${from} → ${to}`
                : ` → ${to}`;
            }).join('')}
          </span>
          <span style={{ fontSize: '10px', color: '#999', marginLeft: '4px' }}>
            [R{changes[0]?.round}]
          </span>
        </div>
      ))}
    </div>
  );
};

// 渲染层级变量
const renderScopeVariables = (
  scopeName: string,
  variables: Record<string, unknown>,
  scopeLabel: string,
  relevantVars?: string[]
) => {
  const isExpanded = expandedScopes.has(scopeName);
  const varCount = Object.keys(variables).length;

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 'bold',
          marginBottom: '4px',
          cursor: 'pointer',
          color: isExpanded ? '#1890ff' : '#666',
        }}
        onClick={() => toggleScope(scopeName)}
      >
        {isExpanded ? '▼' : '▶'} {scopeLabel} ({varCount})
        {!isExpanded && varCount > 0 && (
          <span style={{ fontWeight: 'normal', color: '#999', marginLeft: '8px' }}>
            {Object.keys(variables).slice(0, 2).join(', ')}
            {varCount > 2 && '...'}
          </span>
        )}
      </div>
      {isExpanded && (
        <div style={{ fontSize: '12px', marginLeft: '16px' }}>
          {varCount === 0 ? (
            <span style={{ color: '#999' }}>(无)</span>
          ) : (
            Object.entries(variables).map(([key, value]) => {
              const formattedValue = formatValue(value);
              return (
                <div key={key} style={{ marginBottom: '2px' }}>
                  <span style={{ fontWeight: 'bold' }}>{key}</span>
                  <span>: </span>
                  <span style={{ fontFamily: 'monospace' }}>{formattedValue}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 4: 重构主渲染逻辑**

```typescript
// 判断动作状态
const isCompleted = content.actionStatus === 'completed';
const isRunning = content.actionStatus === 'running';

// 动作状态标签
const statusLabel = isCompleted
  ? '已完成'
  : isRunning
    ? `进行中 (Round ${content.currentRound || '?'}/${content.maxRounds || '?'})`
    : '出错';

// 动作状态颜色
const statusColor = isCompleted
  ? '#52c41a'
  : isRunning
    ? '#1890ff'
    : '#ff4d4f';

// 主渲染
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
            <strong>Action:</strong> {actionId}
            <span style={{ marginLeft: '8px', color: statusColor }}>{statusLabel}</span>
          </div>
        )}

        {/* 如果已完成，显示收集历史摘要 */}
        {isCompleted && collectionHistory && collectionHistory.length > 0 && (
          <div style={{ fontSize: '13px', marginBottom: '4px' }}>
            <strong>收集变量:</strong> {
              Array.from(new Set(
                collectionHistory.flatMap(r => r.changes.map(c => c.name))
              )).join(', ')
            }
          </div>
        )}

        {/* 如果进行中，显示变化变量 */}
        {!isCompleted && content.changedVariables.length > 0 && (
          <div style={{ fontSize: '13px', marginBottom: '4px' }}>
            <strong>变化的变量:</strong> {
              content.changedVariables.slice(0, 3).map(v => (
                <span key={v.name}>{v.name} → {formatValue(v.newValue)}</span>
              ))
            }
          </div>
        )}

        <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
          <strong>总计:</strong> {
            Object.keys(content.allVariables.global).length +
            Object.keys(content.allVariables.session).length +
            Object.keys(content.allVariables.phase).length +
            Object.keys(content.allVariables.topic).length
          } 个变量
        </div>
      </div>
    )}

    {/* Expanded Content */}
    {isExpanded && (
      <div>
        {actionId && (
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
            <strong>Action:</strong> {actionId}
            <span style={{ marginLeft: '8px', color: statusColor }}>{statusLabel}</span>
          </div>
        )}

        {/* 动作已完成时显示收集历史 */}
        {isCompleted && (
          <div style={{ marginBottom: '12px' }}>
            {renderCollectionHistory()}
            {/* 显示退出原因 */}
            {content.exitReason && (
              <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                退出原因: {
                  content.exitReason === 'collected' ? '变量收集完成' :
                  content.exitReason === 'resistance' ? '检测到阻抗' :
                  content.exitReason === 'crisis' ? '检测到危机' :
                  content.exitReason === 'max_rounds' ? '达到最大轮次' :
                  '用户中断'
                }
              </div>
            )}
          </div>
        )}

        {/* 变化的变量（进行中时显示） */}
        {!isCompleted && content.changedVariables.length > 0 && (
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

        {/* 各层级变量 */}
        {renderScopeVariables('global', content.allVariables.global, 'Global 级')}
        {renderScopeVariables('session', content.allVariables.session, 'Session 级')}
        {renderScopeVariables('phase', content.allVariables.phase, `Phase: ${content.scopePath?.phaseName || ''}`)}
        {renderScopeVariables('topic', content.allVariables.topic, `Topic: ${content.scopePath?.topicName || ''}`)}

        {/* 导出按钮 */}
        <div style={{ marginTop: '12px', borderTop: '1px solid #d9d9d9', paddingTop: '8px' }}>
          <Button size="small" onClick={handleExportJSON}>
            导出 JSON
          </Button>
        </div>
      </div>
    )}

    {/* 展开/收起按钮 */}
    <div
      style={{
        marginTop: '8px',
        textAlign: 'center',
        cursor: 'pointer',
        color: '#1890ff',
        fontSize: '12px',
      }}
      onClick={onToggleExpand}
    >
      {isExpanded ? '收起 ▲' : '展开 ▼'}
    </div>
  </div>
);
```

- [ ] **Step 5: 验证编译**

```bash
cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/script-editor typecheck
```

Expected: 编译通过

---

## Task 6: 集成测试

- [ ] **Step 1: 启动开发服务器**

```bash
cd /home/leo/projects/HeartRule-Qoder && pnpm dev
```

- [ ] **Step 2: 打开编辑器调试面板**

在浏览器中打开编辑器，启动调试会话。

- [ ] **Step 3: 测试多轮 ai_ask**

使用提供的测试脚本：

- 创建会话
- 进行多轮对话
- 观察变量气泡的变化
- 验证收集历史是否正确显示

- [ ] **Step 4: 验证动作完成后的显示**

当 `exit: true` 后：

- 确认变量气泡显示"已完成"状态
- 确认收集历史正确显示
- 确认各层级变量可折叠展开

---

## Task 7: 提交代码

- [ ] **Step 1: 提交后端更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/shared-types/src/api/responses.ts
git add packages/api-server/src/services/session-manager.ts
git commit -m "feat: add roundChanges and actionStatus to API response"
```

- [ ] **Step 2: 提交前端更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/script-editor/src/types/debug.ts
git add packages/script-editor/src/components/DebugChatPanel/index.tsx
git add packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx
git commit -m "feat: improve VariableBubble with collection history and scope folding"
```

---

## 边界情况处理

1. **变量覆盖**: 同一变量多轮更新，历史只保留变化记录
2. **动作中断**: 如果动作中途出错，仍显示已收集的历史
3. **空变量**: 未收集的变量显示 `(未收集)`
4. **大量变量**: 各层级折叠，减少视觉负担

## 回滚计划

如果出现问题，可以：

1. 回退前端更改：`git revert <commit-hash>`
2. 回退后端更改：`git revert <commit-hash>`
3. 变量气泡会恢复原有行为，不影响其他功能
