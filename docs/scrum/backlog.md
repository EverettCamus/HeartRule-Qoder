# 产品待办（Backlog）

> 节奏说明见 [开发节奏系统](../process/development-rhythm.md)。需求池：随时可加（标注来源），按 epic 分组保持有序。每周从「就绪故事」选入 [sprint-plan](sprint-plan.md)。
> 故事类型：`[feature]` 功能实现 / `[design]` 设计封板 / `[intelligence]` 机制设计（机制未定型的收敛故事）。状态：`backlog` → `ready` → `in-progress` → `done`。

## 意图区（Intents）

> 「提出意图」的产出物登记处（[开发节奏系统 §4](../process/development-rhythm.md)）：意图一句话 + 价值 + 状态。意图随时可加、不急着拆；拆成 epic 时在对应 epic 分组下标注来源意图。状态：`活跃` / `未拆`（还没想清怎么拆）/ `已拆成 epic` / `放弃`（标日期）。每周 sprint 计划从「活跃」意图中选目标。

| 状态        | 意图（一句话）                                                       | 价值                                           | 来源     | 关联 epic |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------- | -------- | --------- |
| 已拆成 epic | 记忆系统收尾与封板：Hindsight 记忆集成跑到全绿，两条记忆设计文档封板 | 记忆成为可验证、可回归的一等资产，设计不再悬空 | 回溯补录 | Epic A    |
| 已拆成 epic | 议程主线落地：意识层与话题队列的运行时实现，引擎能觉察信号并调整议程 | 引擎具备咨询师"边执行边观察"的核心智能         | 回溯补录 | Epic B    |
| 已拆成 epic | 节奏系统固化：开发节奏落盘为文档与项目 skill                         | 人与 AI 的协作有可查的约定与可执行的工具       | 回溯补录 | Epic C    |

## 就绪故事（Ready）

### Epic A · 记忆主线 —— 记忆系统收尾与封板

> 来源意图：意图区「记忆系统收尾与封板」

| 状态  | 类型      | 故事                                                                            | 关联                                                                                            |
| ----- | --------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ready | [feature] | Hindsight 记忆集成收尾验证：跑通 verify-mental-model.ts，确保对 docker 后端全绿 | [004 ADR](../design/decisions/004-memory-model-calibration.md) · scripts/verify-mental-model.ts |
| ready | [design]  | memory-retrieval-types 从 active → decision-recorded（补 ADR）                  | [记忆调取机制](../design/memory-retrieval-types.md)                                             |
| ready | [design]  | ai-ask-memory-recall 从 active → decision-recorded（补 ADR）                    | [ai_ask 记忆调用](../design/ai-ask-memory-recall.md)                                            |

### Epic B · 议程主线 —— 意识层与话题队列

> 来源意图：意图区「议程主线落地」

| 状态    | 类型           | 故事                                                 | 关联                                                                                             |
| ------- | -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ready   | [feature]      | rerun-action 从 worktree 分支合并回主干              | docs/superpowers/plans/2026-05-07-rerun-action.md · worktree-rerun-feature-continue              |
| backlog | [intelligence] | 意识层触发机制实现（不变量三：意识为唯一队列修改者） | [意识系统](../design/consciousness-system.md) · [话题单元建模](../design/topic-unit-modeling.md) |
| backlog | [feature]      | 议程（话题队列）运行时实现                           | [议程实现机制](../design/topic-queue-implementation.md)                                          |
| backlog | [feature]      | session-intelligence guardian 实现                   | docs/superpowers/specs · 相关设计                                                                |

### Epic C · 节奏系统主线 —— 工具与流程建设

> 来源意图：意图区「节奏系统固化」

| 状态    | 类型      | 故事                                                                    | 关联                                             |
| ------- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| backlog | [feature] | 把开发节奏编码为 Claude Code 项目 skill（六步流程/四选一收敛/封板规则） | [开发节奏系统](../process/development-rhythm.md) |

## 智能设计议题（Exploration）

> 智能思路讨论的沉淀区。机制文档与 ADR 落在 `docs/design/`，此处仅留探索项。每次讨论必须收敛为机制文档 / ADR / spec / backlog 故事（四选一）；未收敛前以探索项留此，注明未决问题。

| 议题                           | 未决问题                                          | 备注                                        |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------- |
| 意识层与主线引擎的接缝协议     | 触发检测（矛盾/情绪）到队列修改之间的具体事件契约 | 设计 active，检测定义已落 commit；属 Epic B |
| 记忆快/慢双通道与 LLM 预算配合 | 慢通道 recall 何时触发、怎么控制成本              | 关联 ai-ask-memory-recall；属 Epic A        |

## 已关闭（Done）

| 故事                                       | 关闭日期   |
| ------------------------------------------ | ---------- |
| [feature] 建立开发节奏系统 + Sprint 0 恢复 | 2026-08-15 |
