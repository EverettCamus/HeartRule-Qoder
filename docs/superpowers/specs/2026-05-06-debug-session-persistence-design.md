# Debug Session Persistence Design

## Overview

目前调试会话在关闭面板后即丢失，用户下次需要从零开始重新调试。本设计实现调试历史的持久化和恢复：后端已完整存储会话数据（sessions + messages 表），前端只需增加列表、恢复和按钮逻辑。

## Feature Summary

- **Smart Debug 按钮**：自动检测上次未完成会话，一键继续调试
- **调试历史列表**：工程级别浏览所有历史会话，显示状态、位置、消息数
- **详情预览**：点击展开变量快照和最后一条消息
- **只读模式**：已结束的会话可以打开浏览，但不可继续发送消息
- **自动清理**：每个工程最多保留 50 个会话

## Architecture

```
ProjectEditor (Smart Debug button)
  ├─ DebugConfigModal (新建调试，已有)
  ├─ DebugHistoryList (历史列表 — 新增)
  │    ├─ 列表项：脚本名 + 状态 + position + 消息数
  │    ├─ 展开详情：变量快照 + 最后消息
  │    └─ "进入" → 打开 DebugChatPanel (fromHistory 模式)
  └─ DebugChatPanel (已有，新增 fromHistory 适配)
```

### 数据流

```
[后端]
  GET /api/sessions?projectId=X&limit=50   ← 新增
  DELETE /api/sessions/{id}                ← 新增
  POST /api/sessions 时自动清理 >50 个

[前端]
  localStorage: "debug_last:{projectId}" → sessionId
  工程加载 → 读取 lastSessionId → 决定按钮文案
```

## Backend API

### List Sessions

```
GET /api/sessions?projectId={projectId}&limit=50

Response:
{
  "success": true,
  "data": [{
    "sessionId": "uuid",
    "scriptId": "uuid",
    "scriptFileName": "first_day.yaml",
    "executionStatus": "running",
    "createdAt": "2026-05-06T10:30:00Z",
    "updatedAt": "2026-05-06T10:35:00Z",
    "position": {
      "phaseIndex": 1, "phaseId": "phase_2",
      "topicIndex": 0, "topicId": "topic_1",
      "actionIndex": 2, "actionId": "ask_feeling",
      "actionType": "ai_ask"
    },
    "messageCount": 12
  }]
}
```

- `scriptFileName` 通过 `scripts` 表 JOIN 获取
- `messageCount` 聚合统计，不返回全部消息

### Delete Session

```
DELETE /api/sessions/{sessionId}
```

### Auto Cleanup

创建新会话时，查询该 project 下会话数，超过 50 则删除 `updatedAt` 最旧的。

### Database

在 `sessions` 表新增 `project_id` 列：`projectId: uuid('project_id').notNull()`。

当前 `sessions` 表无 `project_id`，`scripts` 表也无 `project_id`，只有 `script_files` 表有。需要 3 表 JOIN 才能关联。为了查询效率，在 `sessions` 表直接冗余 `project_id`。

`createDebugSession` 的请求体也需要新增 `projectId` 字段。

## Smart Debug Button

位置：`ProjectEditorHeader`，替换现有普通 Debug 按钮。

### 行为

```
进入工程 → 读 localStorage("debug_last:{projectId}")
  ├─ 无值     → 显示 "Debug ▾"
  ├─ 有值，会话未完成 → 显示 "▶ 继续调试 ▾"
  └─ 有值，会话已完成 → 显示 "Debug ▾"
```

### 下拉菜单

```
┌──────────────┐
│ ▶ 继续调试  ▾│
└──────────────┘
      │ ▼
  ┌──────────────┐
  │ 新建调试     │  → DebugConfigModal
  │ 调试历史     │  → DebugHistoryList
  └──────────────┘
```

- 普通 "Debug ▾" 点击主按钮 → 打开 DebugConfigModal
- "继续调试" 点击主按钮 → 恢复上次会话（跳过配置弹窗）

### "继续调试"恢复流程

1. 读取 lastSessionId
2. 用当前最新脚本内容 importScript → 获取新 scriptId
3. 用 session.position 在新脚本中校验位置：phaseIndex/topicIndex/actionIndex 是否越界
4. 兼容 → UPDATE session 的 scriptId → 加载 DebugChatPanel
5. 不兼容 → 错误对话框："脚本结构已变更，原调试位置无法定位，建议新建调试"

## Debug History List

从右侧滑入的 Modal，风格与版本管理面板一致。

### 列表项（中等信息）

```
┌──────────────────────────────────────────────────────┐
│ first_day.yaml                                       │
│ 🟢 进行中  Phase 2 → Topic 1 → ask_feeling          │
│ 12 条消息  ·  创建于 2026-05-06 10:30               │
│                              [详情] [进入]           │
└──────────────────────────────────────────────────────┘
```

### 点击"详情"展开

```
│ first_day.yaml                                       │
│ 🟢 进行中  Phase 2 → Topic 1 → ask_feeling          │
│ 12 条消息  ·  创建于 2026-05-06 10:30               │
│ ┌────────────────────────────────────────────────┐    │
│ │ 变量: anxiety_level=7, concern="public..."     │    │
│ │ 最后消息: "How does that make you feel?"       │    │
│ │ 回合: 2/5                                      │    │
│ └────────────────────────────────────────────────┘    │
│                              [收起] [进入]           │
```

### 状态标签

| executionStatus | 标签     | 颜色 |
| --------------- | -------- | ---- |
| running         | 进行中   | 绿色 |
| waiting_input   | 等待输入 | 蓝色 |
| completed       | 已完成   | 灰色 |
| error           | 错误     | 红色 |

### "进入"行为

- 未完成会话 → 打开 DebugChatPanel（fromHistory 模式），可继续发消息
- 已完成/错误 → 打开 DebugChatPanel，只读浏览，输入区显示"会话已结束"

### 删除

Hover 出现删除图标，二次确认后删除。如果删除的是 lastSessionId，同步清除 localStorage。

## DebugChatPanel Adaptation

### 新增 Props

```typescript
interface DebugChatPanelProps {
  // ... 现有
  fromHistory?: boolean;
  onSessionStatusChange?: (sessionId: string, status: string) => void;
}
```

### fromHistory 模式

进入时执行位置兼容性校验（同"继续调试"流程），不兼容则报错。

### localStorage 维护

```typescript
// 每次发消息成功后
localStorage.setItem(`debug_last:${projectId}`, sessionId);

// 会话完成/出错时清除
localStorage.removeItem(`debug_last:${projectId}`);

// 面板关闭时：未完成 → 保留；已完成 → 清除
```

## Files to Change

| File                                                               | Change                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `packages/api-server/src/routes/sessions.ts`                       | 新增 GET list + DELETE 路由                   |
| `packages/api-server/src/.../session-manager.ts`                   | 新增 listByProject / deleteSession / 自动清理 |
| `packages/script-editor/src/api/debug.ts`                          | 新增 listDebugSessions / deleteDebugSession   |
| `packages/script-editor/src/pages/ProjectEditor/index.tsx`         | Smart Debug 按钮逻辑 + localStorage           |
| `packages/script-editor/src/components/ProjectEditorHeader.tsx`    | Smart Debug 按钮 UI                           |
| `packages/script-editor/src/components/DebugHistoryList/index.tsx` | **新文件** 历史列表 Modal                     |
| `packages/script-editor/src/components/DebugChatPanel/index.tsx`   | fromHistory 模式 + 位置校验                   |

## Resolved

- `sessions` 表新增 `project_id` 列（冗余，避免 3 表 JOIN）
- `createDebugSession` 请求体新增 `projectId` 字段
- `importScript` 已有 `projectId` 参数，无需变更
