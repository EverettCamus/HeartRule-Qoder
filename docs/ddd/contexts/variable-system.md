# Variable System Context — Tactical DDD

> **Classification:** 🟡 Supporting Domain
> **Package:** `@heartrule/core-engine`
> **Relationship to Consulting Session:** Shared Kernel (same package, shared `VariableStore` type)
>
> **设计权威不在本文件**：本文件是战术快照，边界、作用域层数与红线的最终依据是 [`docs/design/`](../../design/README.md)——具体为 [architecture-constraints](../../design/foundation/architecture-constraints.md) B3 与 [ADR 007](../../design/decisions/007-variable-document-boundary.md)。

## Overview

变量系统为咨询脚本提供操作参数，驱动流程分支和 LLM prompt 个性化。与 Conversational Memory 形成互补：变量存精确值（脚本需要），记忆存语义内容（AI 理解来访者需要）。

**作用域边界（ADR 007 决策 2）**：变量**只在单次会谈内生效**。跨会话状态一律写入**信息点文档**，不走变量——若保留跨会话的 global 变量层，同一个值会同时有"全局变量"和"信息点文档"两条路，使用者必然混淆。

## Entities

### VariableState

**File:** `core-engine/src/domain/variable.ts`

- `variableId: string`
- 值管理模式: OVERWRITE / APPEND / MERGE
- 历史追踪和回滚能力
- 被 `VariableStore` 持有，通过 `VariableScopeResolver` 操作

## Domain Services

### VariableScopeResolver

**File:** `core-engine/src/engines/variable-scope/variable-scope-resolver.ts`

实现 3 层优先级查找:

```
resolveVariable(varName, position):
  topic[varName]          ← 最高优先级
    ↓ fallback
  phase[varName]
    ↓ fallback
  session[varName]        ← 最低优先级
```

`setVariable(varName, value, scope, position, source?)`:

- 确定作用域 (通过 `determineScope()`)
- 写入对应 bucket
- 不可跨层写入

> **⚠️ 实现落后于设计（Epic D 在收口）**：代码目前**仍是 4 层**——保留 global 层与 `user_global_variables` 表（`api-server/src/db/schema.ts`、`variable-scope-resolver.ts`、`shared-types` 的 `VariableScope` enum，以及对外 API 契约）。ADR 007 决策 2 已封板取消该层。这是当前本上下文最大的实现偏离项。

### VariableExtractor

**File:** `core-engine/src/engines/variable-extraction/extractor.ts`

三种提取策略:

| 方法      | 机制                          | 适用场景                         |
| --------- | ----------------------------- | -------------------------------- |
| `direct`  | 用户输入即为值，类型转换      | 简单直接的问题（"你叫什么名字"） |
| `pattern` | 正则匹配 + 捕获组             | 结构化输入（日期、数字）         |
| `llm`     | 调用 LLMOrchestrator 语义提取 | 复杂语义（"描述你最近的感受"）   |

## Value Objects

| 类型                 | 来源           | 用途                                                         |
| -------------------- | -------------- | ------------------------------------------------------------ |
| `VariableScope` enum | `shared-types` | session / phase / topic（代码里仍含 global，见上方偏离说明） |
| `VariableValue`      | `shared-types` | value, type, source, lastUpdated, scope                      |
| `VariableStore`      | `shared-types` | 3-bucket 内存结构（代码里仍为 4-bucket）                     |

## Relationship to Other Contexts

```
Consulting Session (Core)
  │
  ├── 使用 VariableScopeResolver 读写变量
  ├── AiAskAction 触发 VariableExtractor
  │
  └── 未来: AiThinkAction recall → VariableStore (Phase 2b)
       ↑
Conversational Memory
       ↑
跨会话状态走「信息点文档」，不经变量系统（ADR 007 决策 2）
```

## Current Limitations

1. **实现仍是 4 层作用域**：global 层与 `user_global_variables` 表在设计中已取消，代码未跟上——见上方「实现落后于设计」。收口归 Epic D。
2. **VariableExtractor LLM 方法:** 使用 `generateText` 而非 `streamObject`，缺少结构化输出保证
3. **无变量过期/刷新机制:** 变量的生命周期即单次会谈；跨会谈的延续靠信息点文档，不靠变量刷新
