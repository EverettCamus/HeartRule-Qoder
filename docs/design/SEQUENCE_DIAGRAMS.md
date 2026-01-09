# 核心流程时序图

本文档包含 HeartRule AI 咨询引擎（TypeScript 版本）的关键时序图，用于帮助开发者和 AI 快速理解系统的核心执行流程。

---

## 1. HTTP 聊天接口完整调用链路

**场景描述**：用户通过前端发送一条消息到 `/api/chat` 接口，后端如何通过 SessionManager、ScriptExecutor 推进会谈脚本，并返回 AI 回复。

**涉及模块**：

- `packages/api-server/src/routes/chat.ts` - HTTP 路由层
- `packages/api-server/src/services/session-manager.ts` - 会话管理服务
- `packages/core-engine/src/engines/script-execution/script-executor.ts` - 脚本执行引擎
- PostgreSQL 数据库（sessions、messages、scripts 表）

**关键要点**：

- SessionManager 从数据库恢复会话状态（position、variables、metadata）
- ScriptExecutor 根据 YAML 脚本内容推进执行位置
- 执行结果（AI 消息、变量、位置）会持久化回数据库
- 支持多轮对话：通过 `executionState.metadata.actionState` 保存 Action 内部状态

```mermaid
sequenceDiagram
    participant User
    participant ApiServer as /api/chat
    participant SessionManager
    participant ScriptExecutor
    participant Postgres
    participant MessagesTable as messages

    User->>ApiServer: POST {sessionId, message}
    ApiServer->>Postgres: query sessions by id
    Postgres-->>ApiServer: session row

    alt 会话不存在
        ApiServer-->>User: 404 Session not found
    end

    Note over ApiServer,SessionManager: 正常路径：会话存在
    ApiServer->>SessionManager: processUserInput(sessionId, message)
    SessionManager->>Postgres: query sessions by id
    Postgres-->>SessionManager: session
    SessionManager->>Postgres: query scripts by session.scriptId
    Postgres-->>SessionManager: YAML script
    SessionManager->>MessagesTable: insert user message

    SessionManager->>ScriptExecutor: executeSession(scriptJson, sessionId, executionState, userInput)

    Note over ScriptExecutor: 解析 session/phases/topics/actions<br/>推进当前 action
    ScriptExecutor->>ScriptExecutor: executePhase → executeTopic → executeAction

    ScriptExecutor-->>SessionManager: ExecutionState<br/>(lastAiMessage, variables, position, status)

    SessionManager->>MessagesTable: insert assistant message
    SessionManager->>Postgres: update sessions<br/>(position, variables, executionStatus, metadata)

    SessionManager-->>ApiServer: {aiMessage, sessionStatus, executionStatus, variables}
    ApiServer-->>User: JSON response
```

---

## 2. ScriptExecutor 内部脚本驱动执行流程

**场景描述**：不关心 HTTP 和数据库层面，只看脚本执行引擎如何从 YAML 脚本驱动会话推进，并与 LLM 交互。

**涉及模块**：

- `packages/core-engine/src/engines/script-execution/script-executor.ts` - 脚本执行器
- `packages/core-engine/src/actions/*-action.ts` - Action 实现（ai_say、ai_ask、ai_think）
- `packages/core-engine/src/engines/llm-orchestration/orchestrator.ts` - LLM 编排引擎
- LLM Provider（OpenAI / Volcano）

**关键要点**：

- YAML 脚本结构：`session → phases → topics → actions`
- ExecutionState 保存三级索引：`currentPhaseIdx / currentTopicIdx / currentActionIdx`
- Action 可以是**多轮执行**的（如 ai_ask 需要等待用户回答）
  - 未完成时：保存 `actionState` 到 `metadata`，返回 `WAITING_INPUT`
  - 完成后：提取变量、追加对话历史、推进索引
- LLM 调用被封装在 Action 内部，通过 LLMOrchestrator 统一管理

```mermaid
sequenceDiagram
    participant SessionManager
    participant ScriptExecutor
    participant Actions as Action实例<br/>(ai_say/ai_ask)
    participant LLMOrchestrator
    participant LLM as LLM Provider

    SessionManager->>ScriptExecutor: executeSession(scriptJson, sessionId, state, userInput?)
    ScriptExecutor->>ScriptExecutor: JSON.parse(scriptJson)<br/>读取 session.phases/topics/actions

    alt 已有未完成的 currentAction
        Note over ScriptExecutor: 从 metadata.actionState 恢复 Action
        ScriptExecutor->>Actions: 继续执行 (传入 userInput)
    else 进入新 action
        ScriptExecutor->>Actions: createAction(config) 并首次执行
    end

    Note over Actions: Action 内部处理<br/>（如 ai_ask 构造提问提示词）
    Actions->>LLMOrchestrator: generateText(prompt, config)
    LLMOrchestrator->>LLM: generateText(...)
    LLM-->>LLMOrchestrator: text
    LLMOrchestrator-->>Actions: aiMessage

    Actions-->>ScriptExecutor: ActionResult<br/>{completed, aiMessage?, extractedVariables?}

    alt completed == false (等待用户输入)
        ScriptExecutor->>ScriptExecutor: 保存 actionState 到 state.metadata
        ScriptExecutor-->>SessionManager: ExecutionState<br/>(status=WAITING_INPUT, lastAiMessage)
    else completed == true (action 完成)
        ScriptExecutor->>ScriptExecutor: 合并 extractedVariables<br/>追加对话历史
        ScriptExecutor->>ScriptExecutor: 推进 currentActionIdx<br/>→ Topic → Phase

        alt 还有未执行的 action/topic/phase
            ScriptExecutor->>ScriptExecutor: 继续循环执行
        else 所有脚本执行完毕
            ScriptExecutor-->>SessionManager: ExecutionState<br/>(status=COMPLETED)
        end
    end
```

---

## 3. 会话初始化流程（欢迎消息）

**场景描述**：新建会话后，调用 `POST /api/sessions/:id/initialize` 获取脚本的第一条 AI 消息（通常是欢迎语）。

**关键要点**：

- 不传入用户输入，直接执行脚本到第一个 `WAITING_INPUT` 状态
- 通常第一个 Action 是 `ai_say`（欢迎语）或 `ai_ask`（开场提问）
- 执行状态持久化到数据库，后续对话从此状态继续

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer as /api/sessions/:id/initialize
    participant SessionManager
    participant ScriptExecutor
    participant Postgres

    Client->>ApiServer: POST /api/sessions/:id/initialize
    ApiServer->>SessionManager: initializeSession(sessionId)
    SessionManager->>Postgres: query sessions + scripts
    Postgres-->>SessionManager: session + YAML script

    SessionManager->>ScriptExecutor: executeSession(scriptJson, sessionId, initialState, null)
    Note over ScriptExecutor: userInput = null<br/>从 Phase[0].Topic[0].Action[0] 开始

    ScriptExecutor->>ScriptExecutor: 执行第一个 Action<br/>（通常是 ai_say 欢迎语）
    ScriptExecutor-->>SessionManager: ExecutionState<br/>(lastAiMessage="欢迎...", status=WAITING_INPUT)

    SessionManager->>Postgres: insert assistant message
    SessionManager->>Postgres: update sessions (position, executionStatus)
    SessionManager-->>ApiServer: {aiMessage, sessionStatus, executionStatus}
    ApiServer-->>Client: JSON response
```

---

## 4. 流式聊天 SSE 流程（待实现）

**场景描述**：通过 `/api/chat/stream` 接口实现 Server-Sent Events 流式响应，实时推送 LLM 生成的文本片段。

**当前状态**：✅ API 路由已定义，⚠️ 流式逻辑为 mock 实现

**待实现要点**：

- ScriptExecutor 需要支持流式模式（`executeSessionStream`）
- Action 内部调用 `LLMOrchestrator.streamText` 而非 `generateText`
- SSE 数据格式：`data: {"chunk": "文本片段"}\n\n`
- 最后发送：`data: {"done": true}\n\n`

```mermaid
sequenceDiagram
    participant Client
    participant ApiServer as /api/chat/stream
    participant SessionManager
    participant ScriptExecutor
    participant LLMOrchestrator
    participant LLM

    Client->>ApiServer: POST {sessionId, message}
    ApiServer->>ApiServer: 设置 SSE 响应头
    ApiServer->>SessionManager: processUserInput (流式模式)
    SessionManager->>ScriptExecutor: executeSessionStream(...)

    loop 流式生成
        ScriptExecutor->>LLMOrchestrator: streamText(prompt)
        LLMOrchestrator->>LLM: streamText
        LLM-->>LLMOrchestrator: chunk
        LLMOrchestrator-->>ScriptExecutor: chunk
        ScriptExecutor-->>SessionManager: chunk
        SessionManager-->>ApiServer: chunk
        ApiServer-->>Client: data: {"chunk": "..."}\n\n
    end

    ApiServer-->>Client: data: {"done": true}\n\n
    Note over ApiServer: 关闭 SSE 连接
```

---

## 附录：关键数据结构

### ExecutionState（执行状态）

```typescript
interface ExecutionState {
  status: ExecutionStatus; // running | waiting_input | completed | error
  currentPhaseIdx: number; // 当前阶段索引
  currentTopicIdx: number; // 当前话题索引
  currentActionIdx: number; // 当前动作索引
  currentAction: BaseAction | null; // 当前正在执行的 Action 实例
  variables: Record<string, any>; // 提取的变量（如：name、age）
  conversationHistory: Array<{
    // 对话历史
    role: string;
    content: string;
    actionId?: string;
  }>;
  metadata: Record<string, any>; // 元数据（如：actionState）
  lastAiMessage: string | null; // 最后一条 AI 消息
}
```

### ActionResult（Action 执行结果）

```typescript
interface ActionResult {
  success: boolean; // 是否成功
  completed: boolean; // 是否完成（false=需要等待用户输入）
  aiMessage?: string; // AI 生成的消息
  extractedVariables?: Record<string, any>; // 提取的变量
  error?: string; // 错误信息
  metadata?: Record<string, any>; // 附加元数据
}
```

---

## 使用建议

1. **新人上手**：先看时序图 1 和 2，理解"HTTP → 会话管理 → 脚本执行"的完整链路
2. **修改脚本执行逻辑**：重点关注时序图 2，理解 `executePhase/executeTopic/executeAction` 的嵌套循环
3. **添加新 Action 类型**：参考 `ai-ask-action.ts`，实现 `execute` 方法并返回 `ActionResult`
4. **调试多轮对话**：查看数据库中 `sessions.metadata.actionState` 的内容，了解 Action 状态持久化机制

---

**文档版本**：v1.0  
**最后更新**：2026-01-09  
**适用版本**：HeartRule 2.0 (TypeScript)
