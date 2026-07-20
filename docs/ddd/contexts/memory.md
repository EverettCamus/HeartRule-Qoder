# Memory Context — Tactical DDD Patterns

> **Scope:** Phase 2a 变更涉及的模式
> **Updated:** 2026-06-05

## Domain Layer (core-engine)

### Port (Interface)

```
MemoryRepository (domain/ports/memory-repository.port.ts)
├── retain(userId, messages, options?) → Promise<void>
├── recall(userId, query, options?) → Promise<MemoryContext>
└── reflect(userId, query?) → Promise<ReflectionResult>
```

- **模式:** Port (六边形架构)
- **位置:** 领域层 — 定义"需要什么"，不关心"谁来实现"
- **正确方向:** ✅ 端口在 domain/ports/，实现者在 infrastructure/

### Value Objects

| 类型               | 文件                      | 用途                           |
| ------------------ | ------------------------- | ------------------------------ |
| `MemoryMessage`    | port file                 | retain 入参 — 角色+内容+时间戳 |
| `MemoryContext`    | port file                 | recall 返回值 — 四网络结构     |
| `ReflectionResult` | port file                 | reflect 返回值                 |
| `RetainOptions`    | port file (Phase 2a 新增) | retain 可选配置                |
| `RecallOptions`    | port file (Phase 2a 新增) | recall 可选配置                |

- **正确方向:** ✅ 所有类型在领域端口文件中定义，无外部依赖

### Domain Service

```
BaseAction.formatMemoryContext(context: ActionContext): string
```

- **模式:** Domain Service Method (protected, built into BaseAction abstract class)
- **职责:** 将 MemoryContext 格式化为 LLM prompt 可用的 markdown 字符串
- **正确方向:** ✅ 仅依赖 ActionContext + MemoryContext（均为领域对象）

## Infrastructure Layer (api-server)

### Adapter

```
HindsightMemoryAdapter implements MemoryRepository
  └── HindsightClient (SDK)
```

- **模式:** Adapter (六边形架构)
- **正确方向:** ✅ 实现领域端口，不反向依赖
- **Phase 2a 变更:** retain/recall 增加 options 参数透传

### Application Service

```
SessionOrchestrator
  ├── initializeSession() → recall (session start)
  ├── processUserInput() → per-Action retain (Phase 2a 变更)
  └── maybeReflect() → reflect (session end)
```

- **模式:** Application Service
- **职责:** 编排会话生命周期 + 记忆操作时序
- **正确方向:** ✅ 依赖 MemoryRepository 端口（通过 IoC 注入），不直接依赖 Hindsight
- **Phase 2a 变更:** retain 从 per-round 改为 per-Action，检测 Action 完成时机

## Tricky Boundary

### SessionOrchestrator 的位置

SessionOrchestrator 在 api-server 中，但它编排 core-engine 的 ScriptExecutor 和 MemoryRepository 端口。它不属于纯粹的 infrastructure（只做适配），也不属于 domain（有业务编排逻辑）。

**分类: Application Service** — 横跨 domain ports + infrastructure，类似 Martin Fowler 的 "Service Layer"。位置合理：它不需要在 core-engine 中，因为它依赖 DB repository 和 Hindsight adapter。

**潜在风险:** 如果未来 SessionOrchestrator 的业务逻辑膨胀（如 Action 完成检测、retain 片段提取等），应考虑将这些规则提取到 core-engine 的领域服务中。当前规模可控。

## Violation Check (Phase 2a specific)

| Check                      | Result                                         |
| -------------------------- | ---------------------------------------------- |
| 领域层是否依赖基础设施？   | ✅ 无 — MemoryRepository 是端口，不是实现      |
| Adapter 是否反向修改端口？ | ✅ 无 — options 先在端口定义，adapter 被动适配 |
| 是否存在循环依赖？         | ✅ 无 — 单向 core-engine → api-server          |
| 值对象是否在正确层级？     | ✅ 是 — 所有 VO 在端口文件中                   |
| 死代码是否已清理？         | ✅ MemoryEngine stub 已删除，memories 表已删除 |
