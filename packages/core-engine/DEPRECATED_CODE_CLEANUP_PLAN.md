# Core Engine 废弃代码清理计划

> 生成时间：2026-02-09  
> 状态：待执行

## 📋 概述

本文档列出 `@heartrule/core-engine` 包中所有已废弃但尚未删除的代码文件，并制定清理计划。

---

## 🗑️ 待删除文件清单

### 1. 废弃的 Action 基础设施（Phase 2 已完成迁移）

#### 1.1 `src/actions/base.ts`

- **状态**: ❌ 已废弃
- **替代**: `src/actions/base-action.ts`
- **废弃原因**: 旧版 Action 基类，不支持 variableStore 分层结构、LLM 调试信息和作用域解析器
- **引用检查**: ✅ 无活跃引用（仅被 `executor.ts` 引用，后者也已废弃）
- **删除风险**: 🟢 低风险

**文件特征**:

```typescript
/**
 * @deprecated 旧版 Action 基类，将在第二阶段迁移到 base-action.ts
 */
export interface ActionContext {
  variables: Map<string, unknown>; // 旧版使用 Map
  // ...
}
```

#### 1.2 `src/actions/registry.ts`

- **状态**: ❌ 已废弃
- **替代**: `src/actions/action-registry.ts`
- **废弃原因**: 不支持 LLM 依赖注入，注册机制不够灵活
- **引用检查**: ✅ 无活跃引用（仅被 `executor.ts` 引用）
- **删除风险**: 🟢 低风险

**文件特征**:

```typescript
/**
 * @deprecated 旧版 Action 注册表，将在第二阶段迁移到 action-registry.ts
 */
export type ActionRegistry = Map<string, ...>;  // 使用 Map 类型
```

---

### 2. 废弃的执行器（Phase 1-2 已完成迁移）

#### 2.1 `src/engines/script-execution/executor.ts`

- **状态**: ❌ 已废弃
- **替代**: `src/engines/script-execution/script-executor.ts`
- **废弃原因**: 旧版执行器，不支持 Phase 1-8 重构后的架构（LLM 依赖注入、ActionFactory、MonitorOrchestrator 等）
- **引用检查**: ✅ 无活跃引用（未被导出到 index.ts）
- **删除风险**: 🟢 低风险

**文件特征**:

- 使用旧版 `ActionRegistry`（Map 类型）
- 使用旧版 `ActionContext`（Map 结构）
- 无 LLM 依赖注入
- 无监控编排能力
- 无状态管理能力分离

**代码示例**:

```typescript
import type { ActionRegistry } from '../../actions/registry.js'; // 旧版
import type { BaseAction, ActionContext } from '../../actions/base.js'; // 旧版

export class ScriptExecutor {
  constructor(actionRegistry: ActionRegistry) {
    // 旧版接口
    this.actionRegistry = actionRegistry;
  }
}
```

---

### 3. 预留的扩展点（未实现，可考虑删除）

#### 3.1 `src/engines/script-execution/execution-context.ts`

- **状态**: ⚠️ Phase 4 设计但未使用
- **用途**: ExecutionContext 三层结构设计（Position/Runtime/Metadata）
- **引用检查**:
  - ✅ 仅在 `test/phase4-execution-context.test.ts` 中有测试
  - ❌ 未被 `script-executor.ts` 实际使用
- **删除风险**: 🟡 中等风险（有完整测试，可能是未来重构方向）

**建议**: 保留或标记为 `@experimental`，等待 Phase 9+ 重构时使用

#### 3.2 `src/orchestration/topic-action-orchestrator.ts`

- **状态**: ⚠️ Story 1.4 预留扩展点
- **用途**: Topic 级别的动作编排能力（插入、跳过、重定向 Topic）
- **引用检查**:
  - ✅ 被 `orchestration/index.ts` 导出
  - ⚠️ 有占位符注释（`TODO: Not yet implemented`）
- **删除风险**: 🟡 中等风险（接口已定义，可能被外部依赖）

**建议**: 保留接口定义，删除未实现的默认实现类（`DefaultTopicActionOrchestrator`）

---

## 🎯 清理计划

### Phase 1: 立即清理（低风险）✅

**目标文件**:

1. `src/actions/base.ts`
2. `src/actions/registry.ts`
3. `src/engines/script-execution/executor.ts`

**执行步骤**:

1. ✅ 确认无外部引用（通过 grep 验证）
2. ✅ 删除三个文件
3. ✅ 更新 `src/index.ts` 中的注释（移除废弃文件列表）
4. ✅ 执行构建测试：`pnpm --filter @heartrule/core-engine build`
5. ✅ 执行回归测试：`pnpm test packages/core-engine`

**预期影响**:

- 无功能影响
- 减少代码行数约 **387 行**
- 清理混淆的废弃代码

---

### Phase 2: 评估决策（中等风险）⏳

#### 2.1 `execution-context.ts` 处理方案

**选项 A: 保留并标记为实验性**

```typescript
/**
 * @experimental Phase 4 ExecutionContext 三层结构设计
 *
 * 当前未使用，预留给 Phase 9+ 重构
 * 如需激活此设计，请参考 test/phase4-execution-context.test.ts
 */
```

**选项 B: 删除并记录设计**

- 将设计思路移至 `docs/design/execution-context-design.md`
- 删除实现代码和测试
- 减少约 **376 + 400 = 776 行**

**推荐**: 选项 A（保留标记），原因：

- 设计质量高，有完整测试
- 未来可能在 Phase 9 时使用
- 仅占 376 行，维护成本低

#### 2.2 `topic-action-orchestrator.ts` 处理方案

**选项 A: 保留接口，删除未实现的类**

```typescript
// 保留
export interface TopicActionOrchestrator { ... }
export interface OrchestrationPlan { ... }

// 删除
export class DefaultTopicActionOrchestrator { ... }  // 未实现
```

**选项 B: 完全删除**

- 删除整个文件
- 从 `orchestration/index.ts` 移除导出
- 更新引用该接口的注释

**推荐**: 选项 A（保留接口），原因：

- 接口设计合理，定义清晰
- 未来监控系统可能需要该能力
- 删除未实现的类可减少 **79 行**

---

## 📊 清理收益

### 代码量减少

| Phase    | 删除文件     | 减少行数       | 风险等级 |
| -------- | ------------ | -------------- | -------- |
| Phase 1  | 3 个         | ~387 行        | 🟢 低    |
| Phase 2A | 0 个（标记） | 0 行           | 🟢 低    |
| Phase 2B | 1 个部分     | ~79 行         | 🟡 中    |
| **合计** | **3-4 个**   | **387-466 行** | -        |

### 架构改进

1. ✅ **消除混淆**: 移除与新架构冲突的旧版实现
2. ✅ **提升可维护性**: 减少重复接口定义
3. ✅ **降低认知负担**: 统一使用新版 API

---

## ✅ 验收标准

### Phase 1 验收

- [ ] 三个废弃文件已删除
- [ ] `src/index.ts` 注释已更新
- [ ] TypeScript 编译成功（`pnpm build`）
- [ ] 所有现有测试通过（Phase 1-8 测试）
- [ ] 无新增 linter 警告

### Phase 2 验收

- [ ] 确定 `execution-context.ts` 处理方案
- [ ] 确定 `topic-action-orchestrator.ts` 处理方案
- [ ] 添加相应的 `@experimental` 或 `@future` 标记
- [ ] 更新相关文档

---

## 🔍 引用关系图

```
┌─────────────────┐
│   executor.ts   │ (废弃)
└────────┬────────┘
         │ 引用
         ├──> base.ts (废弃)
         └──> registry.ts (废弃)

✅ 三者形成独立的废弃依赖链，可整体删除
```

```
┌──────────────────────┐
│ execution-context.ts │ (实验性)
└──────────┬───────────┘
           │ 仅测试引用
           └──> phase4-execution-context.test.ts

⚠️ 独立模块，可选择保留或删除
```

```
┌─────────────────────────────┐
│ topic-action-orchestrator.ts│ (接口预留)
└──────────┬──────────────────┘
           │ 接口导出
           ├──> orchestration/index.ts
           │ TODO 注释
           ├──> monitor-orchestrator.ts
           └──> base-monitor-handler.ts

⚠️ 接口被导出，建议保留接口定义
```

---

## 📝 执行记录

| 时间             | Phase   | 操作                | 结果    |
| ---------------- | ------- | ------------------- | ------- |
| 2026-02-09 21:39 | -       | 生成清理计划        | ✅ 完成 |
| 2026-02-09 21:40 | Phase 1 | 删除 3 个废弃文件   | ✅ 完成 |
| 2026-02-09 21:40 | Phase 1 | 更新 index.ts 注释  | ✅ 完成 |
| 2026-02-09 21:40 | Phase 1 | TypeScript 构建测试 | ✅ 通过 |
| 2026-02-09 21:40 | Phase 1 | 回归测试 (26/26)    | ✅ 通过 |

---

## 🔗 相关文档

- [ScriptExecutor Phase 5-8 重构计划](./SCRIPT_EXECUTOR_PHASE5_REFACTORING_PLAN.md)
- [Phase 4 ExecutionContext 测试](./test/phase4-execution-context.test.ts)
- [DDD 架构指南](../../docs/design/ddd-architecture.md)

---

## 💡 备注

1. **构建测试必须**: 根据项目记忆，core-engine 修改后必须执行 `pnpm --filter @heartrule/core-engine build`
2. **回归测试**: 删除废弃代码后需运行完整测试套件，防止遗漏的引用
3. **渐进式清理**: 建议先执行 Phase 1（确定性高），再讨论 Phase 2 方案
4. **文档同步**: 删除文件后需更新 `src/index.ts` 和相关设计文档

---

**生成工具**: Qoder AI  
**审核状态**: 待人工审核  
**执行权限**: 需项目负责人确认
