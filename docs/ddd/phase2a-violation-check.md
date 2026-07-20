# Phase 2a DDD Violation Check

> **Date:** 2026-06-05
> **Scope:** 本次 session 的 Phase 2a 变更（per-Action retain、options 扩展、死代码清理）

## Summary

**全部通过。** 无体系结构违规。

## Check Results

| #   | Check                                | Result  | Evidence                                                                |
| --- | ------------------------------------ | ------- | ----------------------------------------------------------------------- |
| 1   | Domain → Infrastructure 导入         | ✅ Pass | core-engine 无 `api-server` 或 `hindsight` import                       |
| 2   | ScriptExecutor 不知 MemoryRepository | ✅ Pass | executor 不导入、不持有、不调用 memory                                  |
| 3   | SessionOrchestrator 依赖端口非实现   | ✅ Pass | 类型为 `MemoryRepository`，通过 IoC 注入 `HindsightMemoryAdapter`       |
| 4   | 端口先于适配器定义                   | ✅ Pass | `RetainOptions`/`RecallOptions` 先在 `memory-repository.port.ts` 定义   |
| 5   | 适配器被动实现新接口                 | ✅ Pass | `HindsightMemoryAdapter` 仅响应端口签名变更                             |
| 6   | per-Action retain 在正确的层         | ✅ Pass | 在 SessionOrchestrator（应用服务层），不侵入 ScriptExecutor（领域引擎） |
| 7   | 死代码已清理                         | ✅ Pass | `MemoryEngine` stub 和 `memories` 表已删除                              |
| 8   | 循环依赖                             | ✅ Pass | 单向 core-engine → api-server                                           |

## Design Notes

### 正确保留的架构决策

1. **per-Action retain 在 SessionOrchestrator 而非 ScriptExecutor**
   - ScriptExecutor 是领域引擎，不应关心记忆基础设施
   - SessionOrchestrator 作为应用层编排者，负责"何时 retain"的决策
   - 通过对比 position 变化而非侵入 executor 内部，保持松耦合

2. **options 参数在端口定义**
   - `RetainOptions`/`RecallOptions` 在 core-engine 端口文件中定义
   - 适配器被动实现新签名，不反向驱动接口变更

3. **MemoryRepository 可选而非必需**
   - `SessionOrchestrator.private memoryRepository?: MemoryRepository`
   - 可选依赖允许测试注入 FakeMemoryRepository，生产环境走 IoC

### 边际注意（非违规，仅供参考）

1. **SessionOrchestrator 职责增长:** processUserInput 中新增 ~40 行 per-Action retain 逻辑。如果未来 Action 完成检测逻辑更复杂，考虑抽取为 `ActionCompletionDetector` 领域服务。

2. **actionSnapshots 类型: `Record<string, any>`:** 目前使用 `as Record<string, any>` 访问，缺少 TypeScript 类型安全。`ActionSnapshotMeta` 接口在 core-engine 中已定义（`script-executor.ts` L54），可在 SessionOrchestrator 中复用。
