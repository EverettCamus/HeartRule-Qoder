# HeartRule-Qoder DDD 战略设计

> **分析范围:** 全工程 (`packages/*`)
> **分析日期:** 2026-06-05
> **状态:** 战略设计完成，待重构清单已记录

---

## 1. 限界上下文 (Bounded Contexts)

### 1.1 上下文识别

基于包边界、领域语言、端口接口、数据库所有权四个信号，识别出 5 个限界上下文 + 1 个通用子域：

```
┌──────────────────────────────────────────────────────────────────┐
│  HeartRule-Qoder 限界上下文                                        │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │ Consulting         │  │ Variable          │  │ Prompt        │   │
│  │ Session            │  │ System            │  │ Engineering   │   │
│  │ (CORE)            │  │ (SUPPORTING)      │  │ (SUPPORTING)  │   │
│  │                   │  │                   │  │               │   │
│  │ Session, Script,   │  │ VariableScope,    │  │ Templates,    │   │
│  │ Action, Position,  │  │ VariableState,    │  │ Substitution, │   │
│  │ ExitDecision       │  │ Extraction        │  │ Schemes       │   │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘   │
│           │                     │                     │           │
│  ┌────────┴─────────┐  ┌────────┴─────────┐  ┌───────┴───────┐   │
│  │ Conversational    │  │ Script            │  │ LLM           │   │
│  │ Memory            │  │ Authoring         │  │ Integration   │   │
│  │ (SUPPORTING)      │  │ (SUPPORTING)      │  │ (GENERIC)     │   │
│  │                   │  │                   │  │               │   │
│  │ Hindsight,        │  │ Projects,         │  │ OpenAI,       │   │
│  │ retain/recall/    │  │ Versions,         │  │ DeepSeek,     │   │
│  │ reflect, 4-network│  │ Drafts, Files     │  │ Volcano       │   │
│  └──────────────────┘  └──────────────────┘  └───────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 上下文分类

| 上下文                    | 分类           | 理由                                                                                       |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| **Consulting Session**    | 🔴 Core Domain | 咨询流程编排是 HeartRule 的核心竞争力 — YAML→Phase→Topic→Action 的 DSL 引擎 + ExitDecision |
| **Variable System**       | 🟡 Supporting  | 支撑核心领域但没有独立业务价值 — 4 层作用域 + 3 种提取方法                                 |
| **Conversational Memory** | 🟡 Supporting  | 提升咨询质量的关键能力，但不是 HeartRule 独有的 — 基于 Hindsight 的通用记忆基础设施        |
| **Prompt Engineering**    | 🟡 Supporting  | 模板管理支撑 LLM 交互质量，但可以独立演进                                                  |
| **Script Authoring**      | 🟡 Supporting  | 脚本编辑器 + 项目版本管理 — 咨询师的工具链                                                 |
| **LLM Integration**       | 🟢 Generic     | 多 Provider 抽象 — 可以用任何 AI SDK 替换                                                  |

### 1.3 上下文详情

#### Consulting Session (Core)

**包:** `@heartrule/core-engine`
**领域语言:** Session, Script, Phase, Topic, Action, Position, ExecutionStatus, ExitDecision, Running/WaitingInput/Completed
**聚合根:** `Session` (唯一聚合根)
**端口:**

- `ScriptExecutor` — 无端口（它是编排器本身）
- `MemoryRepository` — 向 Conversational Memory 上下文请求记忆
- `ILLMProvider` — 向 LLM Integration 上下文请求推理

**关键不变性:**

- Session 的状态机: RUNNING → WAITING_INPUT ↔ RUNNING → COMPLETED | ERROR
- Position 必须保持一致性: phaseIndex/topicIndex/actionIndex 联动
- Action 执行一次只前进一个 Action（不可跳步）

#### Variable System (Supporting)

**包:** `@heartrule/core-engine` (同 Consulting Session 包，但内部边界清晰)
**领域语言:** VariableScope (global/session/phase/topic), extractionMethod (direct/pattern/llm), VariableState, VariableValue
**实体:** `VariableState`
**领域服务:** `VariableScopeResolver`, `VariableExtractor`
**关键不变性:**

- 读取优先级: topic > phase > session > global
- 写入位置由 `determineScope()` 决定，不可跨层写入
- global 变量变更必须触发 `onGlobalVariableChange` 回调

#### Conversational Memory (Supporting)

**端口定义包:** `@heartrule/core-engine` (domain/ports/memory-repository.port.ts)
**实现包:** `@heartrule/api-server` (adapters/outbound/memory/hindsight-adapter.ts)
**领域语言:** retain, recall, reflect, World/Experience/Opinion/Observation, MemoryContext
**端口:** `MemoryRepository`
**关键不变性:**

- retain 是 fire-and-forget（不阻塞会话）
- recall 失败返回空上下文（不中断会话）
- 记忆领域中立 — 咨询领域特定内容通过 options 传入

#### Prompt Engineering (Supporting)

**包:** `@heartrule/core-engine` (engines/prompt-template/)
**领域语言:** Template, Scheme (default/custom), SystemVariable, ScriptVariable, Substitution
**端口:** `TemplateProvider`
**关键不变性:**

- 两层替换: 系统变量 ({%var%}) → 脚本变量 ({{var}})
- 两层模板: custom scheme 优先 → default scheme 兜底
- `memory_context` 是系统变量（Phase 1 新增）

#### Script Authoring (Supporting)

**包:** `@heartrule/api-server` (projects) + `@heartrule/script-editor` (frontend)
**领域语言:** Project, Version, Draft, File, Template, Scheme, Publish, Rollback
**聚合根:** `Project`
**关键不变性:**

- Version 创建后不可变
- Draft 可随时修改，publish 时快照为 Version
- Template 从 `config/prompt-defaults/` 导入，可被 custom scheme 覆盖

#### LLM Integration (Generic)

**包:** `@heartrule/core-engine` (ports) + `@heartrule/api-server` (providers)
**领域语言:** Provider, Model, generateText, streamText, debugInfo
**端口:** `ILLMProvider`
**关键不变性:**

- 所有 provider 行为一致（OpenAI-compatible API）
- 调试信息 (debugInfo) 在每次调用后收集

---

## 2. 限界上下文关系映射图

```
                         ┌──────────────────────────┐
                         │   Script Authoring        │
                         │   (SUPPORTING)            │
                         │                           │
                         │   项目管理 + 版本控制       │
                         │   脚本编辑器前端            │
                         └────────────┬─────────────┘
                                      │ ACL (REST API)
                                      │ 读取/写入 YAML 脚本
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ┌─────────────────────────┐         ┌──────────────────────┐   │
│  │  Consulting Session      │         │  Variable System     │   │
│  │  (CORE)                 │  uses   │  (SUPPORTING)        │   │
│  │                         │────────▶│                      │   │
│  │  Session (Aggregate)    │         │  VariableScope       │   │
│  │  ScriptExecutor         │         │  VariableExtractor   │   │
│  │  Action Hierarchy       │         │  VariableState       │   │
│  │  ExitDecisionEngine     │         │                      │   │
│  └───────┬────────┬────────┘         └──────────────────────┘   │
│          │        │                                              │
│          │        │ 通过端口调用                                  │
│          │        │                                              │
│  ┌───────┴──┐ ┌───┴──────────────┐                              │
│  │ Memory   │ │ Prompt           │                              │
│  │ Repository│ │ TemplateProvider  │                              │
│  │ (Port)   │ │ (Port)           │                              │
│  └───────┬──┘ └───┬──────────────┘                              │
│          │        │                                              │
└──────────┼────────┼──────────────────────────────────────────────┘
           │        │
           │        │ 实现 (Customer-Supplier: 上游 Core Engine)
           │        │
┌──────────┼────────┼──────────────────────────────────────────────┐
│          ▼        ▼                                              │
│  ┌──────────────┐ ┌──────────────────┐ ┌──────────────────┐     │
│  │ Conversational│ │ Prompt            │ │ LLM Integration  │     │
│  │ Memory        │ │ Engineering       │ │ (GENERIC)        │     │
│  │ (SUPPORTING)  │ │ (SUPPORTING)      │ │                  │     │
│  │               │ │                   │ │ DeepSeekProvider │     │
│  │ Hindsight     │ │ TemplateManager   │ │ OpenAIProvider   │     │
│  │ Adapter       │ │ TemplateResolver  │ │ VolcanoProvider  │     │
│  │               │ │ DB Provider       │ │                  │     │
│  └──────────────┘ └──────────────────┘ └──────────────────┘     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SessionOrchestrator (Application Service)                │   │
│  │  编排 Session + Variable + Memory + Prompt + LLM          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Package: @heartrule/api-server                                 │
└──────────────────────────────────────────────────────────────────┘

           ┌──────────────────────────────┐
           │  Hindsight (External Service) │
           │  Docker: localhost:8888       │
           └──────────────────────────────┘

关系图例:
  ────────▶  Customer-Supplier (上游定义接口, 下游实现)
  - - - -▶  ACL (Anti-Corruption Layer)
  ────────▶  Conformist (下游完全跟随上游)
```

### 2.1 关系类型

| 上游 → 下游                                | 关系              | 说明                                                |
| ------------------------------------------ | ----------------- | --------------------------------------------------- |
| Consulting Session → Variable System       | Shared Kernel     | 共享 `VariableStore` 类型，同一包内                 |
| Consulting Session → Conversational Memory | Customer-Supplier | Core 定义 `MemoryRepository` 端口 → api-server 实现 |
| Consulting Session → Prompt Engineering    | Customer-Supplier | Core 定义 `TemplateProvider` 端口 → api-server 实现 |
| Consulting Session → LLM Integration       | Customer-Supplier | Core 定义 `ILLMProvider` 端口 → api-server 实现     |
| Script Authoring → Consulting Session      | Conformist        | 编辑器产出 YAML → 引擎消费；编辑器不定义引擎行为    |
| api-server → Hindsight                     | ACL               | 通过 `HindsightMemoryAdapter` 隔离外部 API 变更     |

---

## 3. 战术模式映射

### 3.1 Consulting Session 上下文

| 模式                    | 实现                                                          | 位置                                                 |
| ----------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| **Aggregate Root**      | `Session`                                                     | `domain/session.ts`                                  |
| **Entity**              | `Message`                                                     | `domain/message.ts`                                  |
| **Value Object**        | `ExecutionState`, `ActionContext`, `ActionResult`, `Position` | `domain/session.ts`, `domain/actions/base-action.ts` |
| **Domain Service**      | `ExitDecisionEngine`, `RuleBasedEvaluator`                    | `engines/exit-decision/`                             |
| **Application Service** | `ScriptExecutor`                                              | `engines/script-execution/`                          |
| **Factory**             | `ActionFactory`, `Session.fromSessionData()`                  | `application/actions/`, `domain/session.ts`          |
| **State Machine**       | `ExecutionStatus` transitions                                 | `domain/session.ts`                                  |

### 3.2 Variable System 上下文

| 模式               | 实现                                  | 位置                           |
| ------------------ | ------------------------------------- | ------------------------------ |
| **Entity**         | `VariableState`                       | `domain/variable.ts`           |
| **Domain Service** | `VariableScopeResolver`               | `engines/variable-scope/`      |
| **Domain Service** | `VariableExtractor`                   | `engines/variable-extraction/` |
| **Value Object**   | `VariableValue`, `VariableScope` enum | `shared-types`                 |

### 3.3 Conversational Memory 上下文

| 模式             | 实现                                                               | 位置                                     |
| ---------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| **Port**         | `MemoryRepository`                                                 | `domain/ports/memory-repository.port.ts` |
| **Adapter**      | `HindsightMemoryAdapter`                                           | `api-server/adapters/outbound/memory/`   |
| **Value Object** | `MemoryContext`, `MemoryMessage`, `RetainOptions`, `RecallOptions` | `domain/ports/memory-repository.port.ts` |

### 3.4 Prompt Engineering 上下文

| 模式                    | 实现                       | 位置                                                |
| ----------------------- | -------------------------- | --------------------------------------------------- |
| **Port**                | `TemplateProvider`         | `engines/prompt-template/template-provider.ts`      |
| **Application Service** | `PromptTemplateManager`    | `engines/prompt-template/template-manager.ts`       |
| **Application Service** | `TemplateResolver`         | `engines/prompt-template/template-resolver.ts`      |
| **Adapter**             | `DatabaseTemplateProvider` | `api-server/services/database-template-provider.ts` |

### 3.5 Script Authoring 上下文

| 模式                    | 实现                 | 位置                                           |
| ----------------------- | -------------------- | ---------------------------------------------- |
| **Aggregate Root**      | `Project`            | `api-server/db/schema.ts` (DB entity)          |
| **Repository**          | `ProjectRepository`  | `api-server/services/project-repository.ts`    |
| **Application Service** | `ProjectInitializer` | `api-server/services/project-initializer.ts`   |
| **ACL**                 | REST API routes      | `api-server/routes/projects.ts`, `versions.ts` |

---

## 4. 可优化点

### 🟡 Medium — DDD 模式可改进

**M1. SessionOrchestrator 职责过重**

- **位置:** `api-server/src/services/session-orchestrator.ts` (~700 lines)
- **问题:** 混合了 6 种职责 — 会话恢复、脚本执行编排、memory retain/recall/reflect 时序、变量持久化、rerun 逻辑、global variable callback。一个 Application Service 不应同时关心记忆时序和变量快照。
- **建议:** Extract Method → 抽取 `MemoryLifecycleService`（负责 retain/recall/reflect 时序）和 `SessionPersistenceService`（负责变量快照+消息保存）。SessionOrchestrator 保留纯编排角色。

**M2. LLMOrchestrator 横跨领域和基础设施**

- **位置:** `core-engine/src/engines/llm-orchestration/orchestrator.ts`
- **问题:** `LLMOrchestrator` 既是领域概念（"编排 LLM 调用"），又处理基础设施细节（provider 注册、debugInfo 收集、JSON 强制解析）。`BaseLLMProvider` 在同一个文件中混合了抽象类和 `generateObject`/`generateText` 的底层实现。
- **建议:** 分离 `LLMOrchestrator`（领域—"调度哪个 provider 处理哪个请求"）和 `LLMProviderAdapter`（基础设施—"HTTP 调用 + JSON 解析"）。当前混在一起的原因是历史上只有一个 provider，现在有 3 个了。

**M3. adapters/inbound/ 命名误导**

- **位置:** `core-engine/src/adapters/inbound/`
- **问题:** DDD 中的 "inbound adapter" 通常指 HTTP Controller、消息监听器等驱动端。当前这个目录实际存放的是 JSON Schema 验证器（`schema-validator.ts`, `placeholder-validator.ts`, `deprecated-fields.ts`），它们不是 adapters，是领域服务/规范。
- **建议:** 重命名为 `validators/script-schema/` 或移入 `engines/script-validation/`。

**M4. core-engine 缺少显式的 Application Service 层**

- **位置:** `core-engine/src/` 顶层目录
- **问题:** `ScriptExecutor`、`MonitorOrchestrator`、`TopicActionOrchestrator` 等应用层编排器散落在 `engines/` 目录，与领域引擎（`ExitDecisionEngine`、`VariableScopeResolver`）混在一起。没有 `application/` 目录来承载用例编排。
- **建议:** 将编排器移入 `application/orchestration/`（已有此目录，但未充分利用），engines/ 保留纯领域引擎。

**M5. Session 聚合根暴露了过多内部状态**

- **位置:** `core-engine/src/domain/session.ts`
- **问题:** `Session` 有 public getter 暴露 `variables`、`conversationHistory`、`position`、`metadata` 等多个可变引用。外部代码可以绕过 `setVariable()` 直接操作 `session.variables[key] = value`。
- **建议:** 将 `variables` 改为 `private`，强制通过 `setVariable()` / `getVariable()` 访问；或在 `Session` 上提供不可变快照。

### 🟢 Minor — 代码气味

**m1. metadata 类型安全**

- **位置:** `session-orchestrator.ts` + `base-action.ts`
- **问题:** `session.metadata` 和 `ActionContext.metadata` 都是 `Record<string, any>`。`memoryContext`、`actionSnapshots`、`rerunHistory` 等关键字段没有类型约束。
- **建议:** 定义 `SessionMetadata` 和 `ActionContextMetadata` 接口，限制已知字段的类型。

**m2. actionSnapshots 使用 `as` 类型断言**

- **位置:** `session-orchestrator.ts` L354
- **问题:** `const snapshots = (session.metadata.actionSnapshots || {}) as Record<string, any>` — 类型断言绕过了 TypeScript 检查。`ActionSnapshotMeta` 接口已在 `script-executor.ts` 中定义，但 orchestrator 没有复用。
- **建议:** 导入 `ActionSnapshotMeta` 并正确类型化。

**m3. FakeMemoryRepository 在 core-engine 测试中**

- **位置:** `core-engine/test/helpers/fake-memory-repository.ts`
- **问题:** Fake 实现放在 `core-engine` 的测试目录中，但 `MemoryRepository` 端口在 `core-engine/src/domain/ports/`。Fake 是测试替身，位置合理，但它实现了端口接口 — 应该有明确的 `implements MemoryRepository` 声明。
- **状态:** 已有 `implements MemoryRepository`，但仅限于 TS 类型，缺少运行时验证。

---

## 5. 包依赖健康度

```
评分: ✅ 良好

shared-types (leaf)
  ↑
core-engine (中间层 — 定义端口)
  ↑
api-server (顶层 — 实现端口)

script-editor (独立叶节点 — 仅依赖 shared-types)
```

- DAG 结构完整，无循环
- api-server 不反向修改 core-engine 的类型
- script-editor 不依赖 core-engine 或 api-server — 通过 REST API 通信（ACL）
- shared-types 是 Shared Kernel，但范围合理（仅 enums + Zod schemas，无业务逻辑）

---

## 6. 多包依赖图 (调试用途)

```
@heartrule/shared-types
  ├── zod (external)
  │
@heartrule/core-engine
  ├── @heartrule/shared-types
  ├── @ai-sdk/openai + ai (Vercel AI SDK)
  ├── ajv (JSON Schema validation)
  ├── js-yaml
  │
@heartrule/api-server
  ├── @heartrule/core-engine
  ├── @heartrule/shared-types
  ├── fastify + plugins (cors, swagger, websocket)
  ├── drizzle-orm + postgres (driver)
  ├── ioredis
  ├── @vectorize-io/hindsight-client
  │
@heartrule/script-editor
  ├── @heartrule/shared-types
  ├── react 18 + antd
  ├── reactflow
  ├── zustand
  ├── @uiw/react-codemirror
  └── axios
```
