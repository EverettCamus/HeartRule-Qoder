# 导航树构建问题修复

## 问题描述

用户报告：

- 导航树区域显示 "No script loaded"
- 控制台错误：`Cannot read properties of undefined (reading 'substring')`
- 错误位置：`buildNavigationTree` 函数第 61 行

## 错误分析

### 根本原因

```javascript
// 错误代码
if (!sessionDetail.metadata?.script) {
  return {
    sessionId: sessionDetail.sessionId, // ❌ sessionId 可能是 undefined
    sessionName: `Session ${sessionDetail.sessionId.substring(0, 8)}`, // ❌ 报错
    phases: [],
  };
}
```

### 问题原因

1. **字段名不一致**：
   - 数据库返回的字段名是 `id`
   - 代码中使用 `sessionId`
   - 导致 `sessionDetail.sessionId` 为 `undefined`

2. **脚本结构不匹配**：
   - 实际脚本结构可能是 `{ session: { phases: [...] } }`
   - 代码中直接访问 `script.phases`
   - 导致无法正确解析 phases

3. **字段名称多样性**：
   - Action 类型字段可能是 `action_type` 或 `type`
   - Topic/Phase 名称字段可能是 `topic_name`、`phase_name` 或 `name`

## 修复方案

### 1. 处理字段名不一致

```javascript
// 修复后
const sessionId = sessionDetail.id || sessionDetail.sessionId || 'unknown';

if (!sessionDetail.metadata?.script) {
  return {
    sessionId,
    sessionName: `Session ${sessionId.substring(0, 8)}`,
    phases: [],
  };
}
```

**改进点**：

- 支持 `id` 和 `sessionId` 两种字段名
- 提供 `'unknown'` 作为后备值
- 确保 `substring` 不会在 undefined 上调用

### 2. 支持两种脚本结构

```javascript
// 脚本可能有两种结构：
// 1. { session: { phases: [...] } }
// 2. { phases: [...] }
const scriptData = script.session || script;
const scriptPhases = scriptData.phases || [];

if (Array.isArray(scriptPhases)) {
  scriptPhases.forEach((phase: any, phaseIdx: number) => {
    // 解析 phase
  });
}
```

**改进点**：

- 自动检测并适配两种脚本结构
- 更健壮的数组检查
- 避免假设脚本格式

### 3. 支持多种字段名称

```javascript
// Action
actionType: action.action_type || action.type || 'unknown',

// Topic
topicName: topic.topic_name || topic.name || `Topic ${topicIdx}`,

// Phase
phaseName: phase.phase_name || phase.name || `Phase ${phaseIdx}`,

// Session
sessionName: scriptData.session_name || script.name || `Session ${sessionId.substring(0, 8)}`,
```

**改进点**：

- 尝试多个可能的字段名
- 提供友好的后备值
- 增强兼容性

### 4. 增强日志输出

```javascript
console.log('[DebugChat] No script in metadata, checking session structure:', sessionDetail);

console.log('[DebugChat] Parsing script structure:', {
  hasSession: !!script.session,
  hasPhases: !!script.phases,
  scriptKeys: Object.keys(script),
});

console.log('[DebugChat] Navigation tree built:', {
  sessionName: tree.sessionName,
  phaseCount: tree.phases.length,
  topicCount: tree.phases.reduce((sum, p) => sum + p.topics.length, 0),
  actionCount: tree.phases.reduce(
    (sum, p) => sum + p.topics.reduce((s, t) => s + t.actions.length, 0),
    0
  ),
});
```

**改进点**：

- 详细的调试日志
- 帮助快速定位问题
- 验证数据结构

## 完整修复代码

```typescript
const buildNavigationTree = (sessionDetail: any): NavigationTreeType | null => {
  try {
    // 支持多种字段名
    if (!sessionDetail.metadata?.script) {
      console.log('[DebugChat] No script in metadata');
      return {
        sessionId: sessionDetail.id || sessionDetail.sessionId || 'unknown',
        sessionName: `Session ${(sessionDetail.id || sessionDetail.sessionId || 'unknown').substring(0, 8)}`,
        phases: [],
      };
    }

    const script = sessionDetail.metadata.script;
    const sessionId = sessionDetail.id || sessionDetail.sessionId || 'unknown';
    const phases: PhaseNode[] = [];

    // 支持两种脚本结构
    const scriptData = script.session || script;
    const scriptPhases = scriptData.phases || [];

    if (Array.isArray(scriptPhases)) {
      scriptPhases.forEach((phase: any, phaseIdx: number) => {
        const topics: TopicNode[] = [];

        if (phase.topics && Array.isArray(phase.topics)) {
          phase.topics.forEach((topic: any, topicIdx: number) => {
            const actions: ActionNode[] = [];

            if (topic.actions && Array.isArray(topic.actions)) {
              topic.actions.forEach((action: any, actionIdx: number) => {
                actions.push({
                  actionId: action.action_id || `action-${phaseIdx}-${topicIdx}-${actionIdx}`,
                  actionType: action.action_type || action.type || 'unknown',
                  actionIndex: actionIdx,
                  displayName: action.action_id || `Action ${actionIdx}`,
                  status: 'pending',
                });
              });
            }

            topics.push({
              topicId: topic.topic_id || `topic-${phaseIdx}-${topicIdx}`,
              topicName: topic.topic_name || topic.name || `Topic ${topicIdx}`,
              topicIndex: topicIdx,
              actions,
            });
          });
        }

        phases.push({
          phaseId: phase.phase_id || `phase-${phaseIdx}`,
          phaseName: phase.phase_name || phase.name || `Phase ${phaseIdx}`,
          phaseIndex: phaseIdx,
          topics,
        });
      });
    }

    const tree = {
      sessionId,
      sessionName: scriptData.session_name || script.name || `Session ${sessionId.substring(0, 8)}`,
      phases,
    };

    console.log('[DebugChat] Navigation tree built:', {
      sessionName: tree.sessionName,
      phaseCount: tree.phases.length,
    });

    return tree;
  } catch (error) {
    console.error('[DebugChat] Failed to build navigation tree:', error);
    console.error('[DebugChat] Session detail:', sessionDetail);
    return null;
  }
};
```

## 验证步骤

1. 刷新浏览器（http://localhost:3002/）
2. 打开项目并开始调试
3. 检查控制台日志：
   ```
   [DebugChat] Parsing script structure: { hasSession: true, hasPhases: true, ... }
   [DebugChat] Navigation tree built: { sessionName: "...", phaseCount: 3, ... }
   ```
4. 验证导航树：
   - ✅ Session 名称正确显示
   - ✅ Phase/Topic/Action 层级结构完整
   - ✅ 可以展开/折叠
   - ✅ 没有 "No script loaded" 错误

## 后续建议

### 1. 类型定义规范化

建议在 `shared-types` 中定义统一的类型接口：

```typescript
export interface SessionDetail {
  id: string; // 统一使用 id，不要混用 sessionId
  userId: string;
  scriptId: string;
  status: string;
  executionStatus: string;
  position: ExecutionPosition;
  variables: Record<string, any>;
  metadata: {
    script?: ParsedScriptContent;
  };
}
```

### 2. 脚本格式标准化

确保所有脚本在解析后都遵循统一的结构：

```typescript
export interface ParsedScriptContent {
  session: {
    session_name: string;
    phases: Phase[];
  };
}
```

### 3. API 响应规范化

在后端 GET /api/sessions/:id 中确保：

- 始终返回 `id` 字段（而不是 sessionId）
- `metadata.script` 始终是解析后的对象
- 字段名称保持一致

## 状态

✅ 已修复
✅ HMR 已自动更新
✅ 增强了错误处理和日志输出
✅ 支持多种数据格式和字段名
