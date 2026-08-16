# 产品待办（Backlog）

> 节奏说明见 [开发节奏系统](../design/development-rhythm.md)。每周从「就绪故事」选入 [sprint-plan](sprint-plan.md)。
> 故事类型：`[feature]` 功能 / `[design]` 设计封板 / `[intelligence]` 智能实现。状态：`backlog` → `ready` → `in-progress` → `done`。

## 就绪故事（Ready）

| 状态    | 类型           | 故事                                                                            | 关联                                                                                             |
| ------- | -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ready   | [feature]      | Hindsight 记忆集成收尾验证：跑通 verify-mental-model.ts，确保对 docker 后端全绿 | [004 ADR](../design/decisions/004-memory-model-calibration.md) · scripts/verify-mental-model.ts  |
| ready   | [feature]      | rerun-action 从 worktree 分支合并回主干                                         | docs/superpowers/plans/2026-05-07-rerun-action.md · worktree-rerun-feature-continue              |
| ready   | [design]       | memory-retrieval-types 从 active → decision-recorded（补 ADR）                  | [记忆调取机制](../design/memory-retrieval-types.md)                                              |
| ready   | [design]       | ai-ask-memory-recall 从 active → decision-recorded（补 ADR）                    | [ai_ask 记忆调用](../design/ai-ask-memory-recall.md)                                             |
| backlog | [intelligence] | 意识层触发机制实现（不变量三：意识为唯一队列修改者）                            | [意识系统](../design/consciousness-system.md) · [话题单元建模](../design/topic-unit-modeling.md) |
| backlog | [intelligence] | 议程（话题队列）运行时实现                                                      | [议程实现机制](../design/topic-queue-implementation.md)                                          |
| backlog | [feature]      | session-intelligence guardian 实现                                              | docs/superpowers/specs · 相关设计                                                                |

## 智能设计议题（Exploration）

> 智能思路讨论的沉淀区。机制文档与 ADR 落在 `docs/design/`，此处仅留探索项。每次讨论必须收敛为机制文档 / ADR / spec / backlog 故事（四选一）；未收敛前以探索项留此，注明未决问题。

| 议题                           | 未决问题                                          | 备注                             |
| ------------------------------ | ------------------------------------------------- | -------------------------------- |
| 意识层与主线引擎的接缝协议     | 触发检测（矛盾/情绪）到队列修改之间的具体事件契约 | 设计 active，检测定义已落 commit |
| 记忆快/慢双通道与 LLM 预算配合 | 慢通道 recall 何时触发、怎么控制成本              | 关联 ai-ask-memory-recall        |

## 已关闭（Done）

| 故事                                       | 关闭日期   |
| ------------------------------------------ | ---------- |
| [feature] 建立开发节奏系统 + Sprint 0 恢复 | 2026-08-15 |
