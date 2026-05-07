# Re-run Current Action Design

## Overview

调试面板支持"重运行当前 action"：回退到当前 action 的未执行点（第 0 轮），保持前置环境不变，允许修改 prompt 和切换 LLM 后重新执行，支持多次迭代并选择最优版本回写到 YAML 脚本文件。

## Feature Summary

- **重运行当前 action**：回退 position 到 action 起点（currentRound=0），清除本 action 产生的消息和变量，重新执行
- **Prompt 内联编辑**：重运行前可修改 action 的 content、tone、max_rounds 等配置
- **LLM 动态切换**：每次重运行可指定 provider、model、temperature，不影响其他 action
- **版本历史**：每次重运行的配置和结果自动记录，可向前追溯和对比
- **回归历史版本**：选中任一历史版本，其配置自动回填编辑区
- **回写到脚本**：将选定版本的配置写入原 YAML 文件

## Architecture

```
DebugChatPanel (重运行按钮 + 配置 Modal)
  └─ POST /api/sessions/:sessionId/rerun
       ├─ 后端读取 session.metadata.actionSnapshot
       ├─ 回退 DB 状态（variableStore, position, messages）
       ├─ 应用 config + llmConfig（内存级别）
       ├─ 执行 action
       └─ 返回响应 + rerunInfo + 更新 rerunHistory
```

### LLM 配置传递链路

```
YAML action config (未来)          rerun API 请求 (当前)
       │                                    │
       └──── llmConfig ────┐────────────────┘
                           ▼
                  ActionContext.llmConfig
                           │
                           ▼
                  LLMOrchestrator.generateText(prompt, llmConfig?)
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
      调用时指定的 provider        全局默认 provider
```

优先级：**调用参数 > action 配置 > 全局默认**

## Backend

### Action Snapshot

进入每个新 action 时自动快照，存入 `sessions.metadata.actionSnapshot`：

```typescript
{
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
  actionId: string;
  actionType: string;
  variableStore: VariableStore; // 4 层 scope 完整快照
  messageCount: number; // 进入 action 前 messages 表已有条数
  conversationHistoryLength: number;
}
```

快照覆盖规则：进入新 action → 覆盖；同一 action 的 round 推进 → 不更新。

### POST /api/sessions/:sessionId/rerun

**Request body:**

```json
{
  "config": {
    "content": "新 prompt...",
    "tone": "平和，简洁",
    "max_rounds": 200,
    "output": [...]
  },
  "llmConfig": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

所有字段可选。

**Backend flow:**

1. 读取 `session.metadata.actionSnapshot`，无快照 → 400
2. 用快照回退 DB 状态：
   - `variableStore` → 写回 `sessions.metadata.variableStore`
   - `position` → 回退到快照（currentRound=0）
   - `executionStatus` → 设为 `running`
   - 删除本 action 产生的 messages（WHERE sessionId = X AND id > 快照时的 max message id）
3. 如果传入 `config`，merge 到当前 script 匹配的 action（内存级别，不持久化到 YAML）
4. 如果传入 `llmConfig`，注入 `ActionContext`（本次调用有效）
5. 调用 `scriptExecutor.executeSession(restoredState)`
6. 持久化新状态（同 `processUserInput` 流程）
7. 追加记录到 `metadata.rerunHistory`
8. 返回响应

**Response:**

```json
{
  "aiMessage": "...",
  "position": {...},
  "variables": {...},
  "variableStore": {...},
  "debugInfo": [...],
  "executionStatus": "waiting_input",
  "currentRound": 0,
  "maxRounds": 200,
  "rerunInfo": {
    "rerunCount": 3,
    "versionId": "uuid",
    "previousRounds": 2
  }
}
```

### Rerun 版本历史

存储在 `sessions.metadata.rerunHistory[]`：

```typescript
{
  versionId: string;          // uuid, 对应 rerunInfo.versionId
  actionId: string;
  timestamp: string;
  config: {                   // 本次使用的 action config
    content: string;
    tone?: string;
    max_rounds?: number;
    output?: [...];
  };
  llmConfig?: {
    provider: string;
    model: string;
    temperature: number;
  };
  debugInfo?: LLMDebugInfo[];
  result?: {
    roundsUsed: number;
    exitReason: string;
    variableCount: number;
  };
  writtenBack?: boolean;      // 是否已回写到脚本文件
}
```

- v1 始终为原始版本（session 创建时的 config），不可删除
- 每个 action 最多 20 个版本，超出删除最旧的（v1 除外）

### LLMOrchestrator 改造

`generateText()` 接受可选的 `llmConfig` 参数（调用级 override），不改变实例级默认 provider：

```typescript
async generateText(prompt: string, options?: { llmConfig?: LLMConfig }): Promise<...>
```

### ActionContext 扩展

```typescript
interface ActionContext {
  // ... 现有字段
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}
```

### POST /api/scripts/:scriptId/actions/:actionId/config（新增）

回写 action config 到 YAML 文件：

```json
// Request
{
  "config": {
    "content": "...",
    "tone": "...",
    "max_rounds": 200,
    "output": [...]
  },
  "llmConfig": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash"
  }
}
```

后端更新 `scripts` 表的 `scriptContent` 字段中对应 action 的 config 部分。

## Frontend

### 重运行按钮

位置：当前 action 的 PositionBubble 旁边。仅对当前正在执行的 action 显示，历史 bubble 不显示。

```
┌────────────────────────────────────────────────┐
│ 🔵 当前: Phase 1 → Topic 1 → ask_feeling [重运行]│
│    第 3/20 轮                                   │
└────────────────────────────────────────────────┘
```

### 配置 Modal

```
┌────────────────────────────────────────────────┐
│           重运行当前 Action                      │
│                                                │
│  ── 配置版本 ─────────────────────────────────│
│  ┌────────────────────────────────────────┐    │
│  │ ● v3  2026-05-07 14:32  2轮/已完成     │  ▲ │
│  │   prompt: "先与来访者打招呼，收集称呼..." │  │ │
│  │   LLM: DeepSeek v4-flash  temp=0.7     │  │ │
│  ├────────────────────────────────────────┤    │
│  │ ○ v2  2026-05-07 14:25  5轮/用户阻抗   │    │
│  │   prompt: "请温和地询问来访者..."        │    │
│  │   LLM: DeepSeek v4-flash  temp=0.7     │    │
│  ├────────────────────────────────────────┤    │
│  │ ○ v1 (原始)  2026-05-07 14:20          │    │
│  │   prompt: "先与来访者打招呼..."          │  ▼ │
│  └────────────────────────────────────────┘    │
│                                                │
│  ── 编辑配置 ──────────────────────────────────│
│  Prompt:                 [基于选中版本预填]     │
│  ┌────────────────────────────────────────┐    │
│  │ (可编辑)                                │    │
│  └────────────────────────────────────────┘    │
│  Tone: [平和，简洁，有趣              ]         │
│  Max Rounds: [200]                             │
│                                                │
│  ── LLM 设置 ──────────────────────────────────│
│  Provider: [DeepSeek ▼]                        │
│  Model: [deepseek-v4-flash ▼]                  │
│  Temperature: [0.7]                            │
│                                                │
│  ⚠️ 将回退到 Action 起点                       │
│    并清除本 Action 的消息                       │
│                                                │
│        [回写到脚本]    [取消]   [确认重运行]    │
└────────────────────────────────────────────────┘
```

### 交互逻辑

**版本选择**

- 列表按时间倒序，最新在最前
- 选中历史版本 → 编辑区自动填充该版本的 config 和 llmConfig
- 直接编辑并确认 → 创建新版本
- 不修改直接确认 → 不创建新版本（快照不变）

**回写到脚本**

- 将当前选中版本的 config 写入原 YAML 文件的对应 action
- 确认对话框："将 v2 的配置写入 {fileName} 的 action: {actionId}？"
- 调用 `POST /api/scripts/:scriptId/actions/:actionId/config`
- 前端刷新文件树，标记文件有变更
- 写入成功后该版本标记"已回写"

**对比能力**

- 重运行后新 debugInfo 追加到消息流
- 插入系统分隔消息 "🔄 重运行当前 action"
- 上一轮的 LLM prompt/response bubble 保留在消息流中，可向上滚动对比

### 状态处理

| 状态                    | 行为                                     |
| ----------------------- | ---------------------------------------- |
| 无快照                  | 不显示重运行按钮                         |
| 进行中                  | 按钮 loading，禁止重复点击               |
| 完成                    | 按钮恢复可用，更新 round 数              |
| 失败                    | 显示 error message，保留原有 UI 状态不变 |
| 脚本已修改已删除 action | 400 + "当前 action 已被删除"             |

API 调用采用悲观策略：不乐观更新 UI，等待 API 成功响应后再替换 messages。

## Error Handling

| 场景                    | 处理                                    |
| ----------------------- | --------------------------------------- |
| 快照不存在              | 400: "无法定位回退点，请新建调试"       |
| Action 在新脚本中已删除 | 400: "当前 action 已被删除，无法重运行" |
| 重运行执行失败          | 500: 保留原有 UI 状态不变，显示错误消息 |
| 回写时文件冲突          | 409: 提示用户先保存当前编辑             |
| 版本超限                | 自动删除最旧版本（v1 除外）             |

## Files to Change

| File                                                                     | Change                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `packages/api-server/src/routes/sessions.ts`                             | 新增 POST `/api/sessions/:id/rerun` 路由                   |
| `packages/api-server/src/routes/scripts.ts`                              | 新增 POST `/api/scripts/:id/actions/:actionId/config` 路由 |
| `packages/api-server/src/services/session-manager.ts`                    | 新增 `snapshotActionState()` / `rerunAction()` 方法        |
| `packages/core-engine/src/engines/llm-orchestration/llm-orchestrator.ts` | `generateText()` 增加 `llmConfig` 可选参数                 |
| `packages/core-engine/src/engines/script-execution/script-executor.ts`   | `ActionContext` 增加 `llmConfig` 字段                      |
| `packages/script-editor/src/api/debug.ts`                                | 新增 `rerunAction()` / `writeBackActionConfig()`           |
| `packages/script-editor/src/components/DebugChatPanel/index.tsx`         | 新增重运行按钮 + 配置 Modal + 版本历史 UI                  |
| `packages/script-editor/src/components/DebugChatPanel/RerunModal/`       | **新目录** 重运行 Modal 组件                               |

## Resolved

- 回退粒度：回退到 action **未执行点**（第 0 轮），不支持单步恢复
- LLM 配置：通过 `ActionContext.llmConfig` 传递，优先级为调用参数 > action 配置 > 全局默认
- 版本历史：存储在 `sessions.metadata.rerunHistory`，随 session 生命周期
- 回写：通过独立 API 修改 `scripts.scriptContent`，非重运行 API 的副作用
- 原始版本（v1）：不可删除，用作回退基准
