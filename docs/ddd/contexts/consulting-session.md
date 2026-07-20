# Consulting Session Context — Tactical DDD

> **Classification:** 🔴 Core Domain
> **Package:** `@heartrule/core-engine`
> **Updated:** 2026-06-05

## Aggregate Root

### Session

**File:** `core-engine/src/domain/session.ts`

Session 是唯一聚合根。管理：

- 状态机 (`ExecutionStatus`: RUNNING → WAITING_INPUT ↔ RUNNING → COMPLETED | ERROR)
- 执行位置 (`position`: phaseIndex/topicIndex/actionIndex)
- 变量存储 (`variableStore`: 4 层作用域)
- 对话历史 (`conversationHistory`: ConversationEntry[])
- 元数据 (`metadata`: actionSnapshots, rerunHistory, memoryContext, sessionConfig 等)

**工厂方法:**

- `Session.fromSessionData(data, { globalVariables, conversationHistory })` — 从 DB 行重建
- `session.toExecutionState()` — 转换为引擎状态对象
- `session.applyExecutionResult(state)` — 应用引擎执行结果

**边界规则:**

- 变量只能通过 `setVariable()` 写入（通过 VariableScopeResolver 确定作用域）
- conversationHistory 是 append-only 的（对外暴露为 getter）
- position 更新通过 `updatePosition()` 保证索引一致性

## Entities

### Message

**File:** `core-engine/src/domain/message.ts`

- `messageId: string` (唯一标识)
- `sessionId: string` (所属会话)
- `role: 'user' | 'assistant' | 'system'`
- `content: string`
- `metadata: Map<string, any>` (不可变)

## Value Objects

| 类型                     | 文件                            | 用途                          |
| ------------------------ | ------------------------------- | ----------------------------- |
| `ExecutionState`         | `domain/session.ts`             | 引擎间传递的不可变状态快照    |
| `ActionContext`          | `domain/actions/base-action.ts` | 每个 Action 执行时的上下文    |
| `ActionResult`           | `domain/actions/base-action.ts` | Action 执行结果               |
| `Position`               | `domain/session.ts`             | phase/topic/action 索引三元组 |
| `ConversationEntry`      | `domain/session.ts`             | 对话历史条目                  |
| `SessionPersistenceData` | `domain/session.ts`             | DB 行 → 领域对象桥接          |

## Action Hierarchy (Strategy Pattern)

```
BaseAction (abstract)
  ├── AiAskAction   — 对话收集 (extractionMethod: direct/pattern/llm)
  ├── AiSayAction   — 讲解输出 (multiround + understanding assessment)
  └── AiThinkAction — 内部推理 (MVP stub, Phase 2b 待实现)
```

每个 Action 实现:

- `execute(context, userInput?) → Promise<ActionResult>`
- `buildSystemVariables(context) → Record<string, string>`
- `getType() → ActionType`

## Domain Services

| 服务                 | 文件                        | 职责                                   |
| -------------------- | --------------------------- | -------------------------------------- |
| `ExitDecisionEngine` | `engines/exit-decision/`    | LLM 建议 + 规则评估 → 最终退出决定     |
| `RuleBasedEvaluator` | `engines/exit-decision/`    | max_rounds / required_variables 硬规则 |
| `ScriptExecutor`     | `engines/script-execution/` | 主编排器: YAML→Phase→Topic→Action 循环 |
| `ActionFactory`      | `application/actions/`      | actionType → Action 实例               |
| `ActionStateManager` | `application/state/`        | Action 状态序列化/反序列化             |

## Ports

| 端口               | 位置                                              | 消费方                   |
| ------------------ | ------------------------------------------------- | ------------------------ |
| `MemoryRepository` | `domain/ports/memory-repository.port.ts`          | SessionOrchestrator      |
| `ILLMProvider`     | `application/ports/outbound/llm-provider.port.ts` | LLMOrchestrator          |
| `TemplateProvider` | `engines/prompt-template/template-provider.ts`    | AiAskAction, AiSayAction |

## State Machine

```
  ┌─────────┐   start()   ┌─────────┐  userInput    ┌──────────────┐
  │  ACTIVE  │───────────▶│ RUNNING │─────────────▶│ WAITING_INPUT │
  └─────────┘             └─────────┘◀─────────────└──────────────┘
                                │      userInput
                                │
                          ┌─────┴─────┐
                          │ COMPLETED  │ (所有 Phase 完成)
                          │ ERROR      │ (异常)
                          └───────────┘
```

## Design Notes

- Session 聚合根目前对外暴露可变引用（variables, metadata）。建议逐步收紧为 private + getter/setter
- ScriptExecutor 既是 Application Service 又是编排引擎 — 约 1400 行，是最大的单文件。可考虑按 Phase/Topic/Action 拆分
