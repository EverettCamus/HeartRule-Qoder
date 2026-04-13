# 变量调试面板改进设计

## 问题背景

在调试 `ai_ask` 动作时，当动作完成（exit=true）后，变量状态气泡显示为空。原因是气泡只显示"当前动作相关变量"，但动作已退出，没有相关变量了。

用户需要：

1. 在动作完成后仍能看到收集到的所有变量
2. 查看每个变量在多轮对话中的变化历史
3. 能查看各层级（global/session/phase/topic）的变量

## 设计方案

### 核心思路

保持一个变量气泡，改进其显示逻辑：

| 状态       | 显示内容                                   |
| ---------- | ------------------------------------------ |
| 动作进行中 | 变化变量 + 各层级变量（当前层级默认展开）  |
| 动作已完成 | 收集历史（相关变量）+ 各层级快照（可折叠） |

### UI 布局

#### 折叠态

```
┌─────────────────────────────────────────────────┐
│ 📊 变量状态                    10:23:45   [展开]│
├─────────────────────────────────────────────────┤
│ Action: action_2 已完成                          │
│ 收集变量: 来访者称呼 → "张三"                     │
└─────────────────────────────────────────────────┘
```

#### 展开态（动作进行中）

```
┌─────────────────────────────────────────────────┐
│ 📊 变量状态                    10:23:45   [收起]│
├─────────────────────────────────────────────────┤
│ Action: action_2 执行后 (Round 2/200)            │
├─────────────────────────────────────────────────┤
│ 【变化的变量】                                   │
│   来访者称呼: (空白) → "张三"                    │
├─────────────────────────────────────────────────┤
│ ▶ Global (0)                        [点击展开]   │
│ ▶ Session (0)                                    │
│ ▶ Phase: phase_1 (0)                             │
│ ▼ Topic: topic_1 (1)                [正在展开]   │
│   ├─ 来访者称呼: "张三" [输出]                    │
│   ├─ 来访者年龄: (未收集)                        │
│   └─ 来访者性别: (未收集)                        │
└─────────────────────────────────────────────────┘
```

#### 展开态（动作已完成）

```
┌─────────────────────────────────────────────────┐
│ 📊 变量状态                    10:23:45   [收起]│
├─────────────────────────────────────────────────┤
│ Action: action_2 已完成                          │
├─────────────────────────────────────────────────┤
│ ▼ 收集历史（当前动作相关）                        │
│   来访者称呼: (空白) → "张三"              [R1]  │
│   来访者年龄: (空白) → "未知" → "快50了"   [R2]  │
│   来访者性别: (空白) → "男"                [R3]  │
├─────────────────────────────────────────────────┤
│ ▶ Global (0)                        [点击展开]   │
│ ▶ Session (0)                                    │
│ ▶ Phase: phase_1 (0)                            │
│ ▼ Topic: topic_1 (3)                [正在展开]   │
│   ├─ 来访者称呼: "张三"                          │
│   ├─ 来访者年龄: "快50了"                        │
│   └─ 来访者性别: "男"                            │
└─────────────────────────────────────────────────┘
```

### 信息优先级

1. **收集历史**（最相关，最醒目）
   - 只显示当前动作的输出变量
   - 显示每轮的变化：`(空白) → "值1" → "值2"`
   - 标注轮次：`[R1]`, `[R2]`, ...

2. **Topic 级变量**（当前动作输出，默认展开）

3. **Global/Session/Phase 级**（可折叠，按需展开）
   - 只显示当前路径的变量
   - 非当前路径的暂不显示

## 状态判断

| 动作状态    | 判断条件                           | 含义                                                     |
| ----------- | ---------------------------------- | -------------------------------------------------------- |
| `running`   | `ActionResult.completed === false` | 还在收集变量，等待用户输入                               |
| `completed` | `ActionResult.completed === true`  | 动作结束（原因可能是变量收集完成、阻抗退出、危机退出等） |

在 `ai_ask` 多轮模式中：

- LLM 返回 `exit: "true"` → 触发 `finishAction()` → 返回 `completed: true`
- `exit_reason` 字段说明退出原因：`collected`（收集完成）、`resistance`（阻抗）、`crisis`（危机）等
- 无论何种原因退出，都显示已收集的变量历史
- 前端通过 API 响应的 `executionStatus` 或专门字段判断

**前端判断逻辑**：

```typescript
// 方案1：通过 executionStatus 判断
const isActionCompleted =
  response.executionStatus === 'completed' || response.position?.actionCompleted;

// 方案2：后端直接返回 actionStatus 字段
const actionStatus = response.actionStatus; // 'running' | 'completed' | 'error'

// 退出原因（可选显示）
const exitReason = response.exitReason; // 'collected' | 'resistance' | 'crisis' | undefined
```

## 数据结构

### 类型定义（前端）

```typescript
// types/debug.ts

interface VariableBubbleContent {
  type: 'variable';

  // 现有字段
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

  // 现有：当前动作相关变量
  relevantVariables?: {
    inputVariables: string[];
    outputVariables: string[];
  };

  // 新增：动作状态
  actionStatus?: 'running' | 'completed' | 'error';

  // 新增：当前轮次（动作进行中时）
  currentRound?: number;
  maxRounds?: number;

  // 新增：变量收集历史
  collectionHistory?: Array<{
    round: number;
    timestamp: string;
    changes: Array<{
      name: string;
      fromValue?: unknown;
      toValue: unknown;
    }>;
  }>;

  // 新增：层级路径信息
  scopePath?: {
    phaseId: string;
    phaseName: string;
    topicId: string;
    topicName: string;
  };
}
```

### API 响应结构（后端）

```typescript
// DebugMessageResponse

{
  // 现有字段
  variableStore: {
    global: Record<string, VariableValue>;
    session: Record<string, VariableValue>;
    phase: Record<string, VariableValue>;
    topic: Record<string, VariableValue>;
  };

  // 新增：动作状态
  actionStatus: 'running' | 'completed' | 'error';

  // 新增：当前轮次
  currentRound: number;
  maxRounds: number;

  // 新增：动作输出变量列表
  outputVariables: string[];

  // 新增：本轮变量变化
  roundChanges?: {
    round: number;
    changes: Array<{
      name: string;
      fromValue?: unknown;
      toValue: unknown;
      scope: string;
    }>;
  };

  // 现有：位置信息（已有）
  position: {
    phaseId: string;
    phaseName: string;
    topicId: string;
    topicName: string;
    // ...
  };
}
```

## 数据流

### 后端改动（api-server）

1. **session-manager.ts** - `buildResponse` 方法
   - 从 `executionState.metadata.actionRoundInfo` 获取当前轮次
   - 从 `executionState.currentAction.config.output` 获取输出变量列表
   - 对比上一轮变量与当前变量，生成 `roundChanges`
   - 判断动作状态：`running` / `completed` / `error`

2. **核心逻辑**

   ```
   action.config.output = [{ get: '来访者称呼' }, { get: '来访者年龄' }, ...]
   currentRound = actionState.currentRound
   variableStore = executionState.variableStore (已分层)

   roundChanges = compareVariables(prevStore, currentStore, outputVariables)
   ```

### 前端改动（script-editor）

1. **DebugChatPanel** - 累积收集历史

   ```typescript
   // 新增状态
   const [collectionHistory, setCollectionHistory] = useState<CollectionHistory[]>([]);

   // 每轮响应后更新
   useEffect(() => {
     if (response.roundChanges) {
       setCollectionHistory((prev) => [...prev, response.roundChanges]);
     }
   }, [response]);
   ```

2. **VariableBubble** - 改进渲染逻辑
   - 根据 `actionStatus` 切换显示模式
   - `running`: 显示变化变量 + 当前层级变量
   - `completed`: 显示收集历史 + 各层级快照
   - 增加层级折叠/展开功能

## 实现步骤

### Phase 1: 数据结构准备

1. 更新 `types/debug.ts` 类型定义
2. 更新后端 `DebugMessageResponse` 类型

### Phase 2: 后端实现

1. 在 `session-manager.ts` 中：
   - 提取动作状态和轮次信息
   - 计算轮次变量变化
   - 组装新的响应结构

2. 在 `core-engine` 中：
   - 确保 `variableStore` 正确传递
   - 在 `ActionResult` 中包含轮次信息

### Phase 3: 前端实现

1. 更新 `api/debug.ts` 处理新响应字段
2. 更新 `DebugChatPanel` 累积历史
3. 重构 `VariableBubble` 组件：
   - 折叠态显示摘要
   - 展开态按状态显示不同内容
   - 实现层级折叠/展开

### Phase 4: 测试验证

1. 单元测试：后端 `roundChanges` 计算
2. 集成测试：前端累积逻辑
3. E2E 测试：完整调试流程

## 文件改动清单

### 后端

```
packages/api-server/src/services/session-manager.ts
  - buildResponse(): 添加 roundChanges 计算
  - 提取动作状态和轮次

packages/shared-types/src/index.ts
  - DebugMessageResponse: 添加新字段
```

### 前端

```
packages/script-editor/src/types/debug.ts
  - VariableBubbleContent: 添加新字段

packages/script-editor/src/api/debug.ts
  - DebugMessageResponse: 处理新字段

packages/script-editor/src/components/DebugChatPanel/index.tsx
  - 添加 collectionHistory 状态
  - 累积历史记录

packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx
  - 重构渲染逻辑
  - 添加层级折叠/展开
  - 添加收集历史显示
```

## 边界情况

1. **变量覆盖**：同一变量多轮更新，历史只保留变化记录
2. **动作中断**：如果动作中途出错，仍显示已收集的历史
3. **空变量**：未收集的变量显示 `(未收集)`
4. **大量变量**：各层级折叠，减少视觉负担
