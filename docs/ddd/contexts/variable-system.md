# Variable System Context — Tactical DDD

> **Classification:** 🟡 Supporting Domain
> **Package:** `@heartrule/core-engine`
> **Relationship to Consulting Session:** Shared Kernel (same package, shared `VariableStore` type)

## Overview

变量系统为咨询脚本提供操作参数，驱动流程分支和 LLM prompt 个性化。与 Conversational Memory 形成互补：变量存精确值（脚本需要），记忆存语义内容（AI 理解来访者需要）。

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

实现 4 层优先级查找:

```
resolveVariable(varName, position):
  topic[varName]          ← 最高优先级
    ↓ fallback
  phase[varName]
    ↓ fallback
  session[varName]
    ↓ fallback
  global[varName]         ← 最低优先级
```

`setVariable(varName, value, scope, position, source?)`:

- 确定作用域 (通过 `determineScope()`)
- 写入对应 bucket
- 全局变量触发 `onGlobalVariableChange` 回调 → 持久化到 `user_global_variables` 表

### VariableExtractor

**File:** `core-engine/src/engines/variable-extraction/extractor.ts`

三种提取策略:

| 方法      | 机制                          | 适用场景                         |
| --------- | ----------------------------- | -------------------------------- |
| `direct`  | 用户输入即为值，类型转换      | 简单直接的问题（"你叫什么名字"） |
| `pattern` | 正则匹配 + 捕获组             | 结构化输入（日期、数字）         |
| `llm`     | 调用 LLMOrchestrator 语义提取 | 复杂语义（"描述你最近的感受"）   |

## Value Objects

| 类型                 | 来源           | 用途                                    |
| -------------------- | -------------- | --------------------------------------- |
| `VariableScope` enum | `shared-types` | global / session / phase / topic        |
| `VariableValue`      | `shared-types` | value, type, source, lastUpdated, scope |
| `VariableStore`      | `shared-types` | 4-bucket 内存结构                       |

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
```

## Current Limitations

1. **全局变量语义值混存:** 操作参数和语义结论都在 global 层（见 `variable-memory-bridge.md` §2）
2. **VariableExtractor LLM 方法:** 使用 `generateText` 而非 `streamObject`，缺少结构化输出保证
3. **无变量过期/刷新机制:** 全局变量一旦设置，除非手动更新，不会自动从记忆刷新
