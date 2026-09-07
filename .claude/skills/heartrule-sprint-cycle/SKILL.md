---
name: heartrule-sprint-cycle
description: 新一周 sprint 计划、sprint 末节奏小结、或 backlog 维护时使用——sprint 边界与 backlog 治理的入口技能。
---

# Sprint 边界（开发节奏系统 §5 时钟 + §10 演进）

**核心原则**：sprint-plan 只放当前一周（历史在 git，不在文件里）；目标从意图区的「活跃」意图来，写成可验证的结果句。节奏依据：`docs/process/development-rhythm.md` §5。

## 何时用

- 新一周 sprint 计划
- sprint 末节奏小结（四行回顾）
- backlog 维护请求（排序/清理）

## 步骤

### A. sprint 计划

1. 从 backlog **意图区「活跃」意图**中选目标，写成**结果句**——本周结束时可验证的状态（如"记忆系统全绿 + 两条文档封板"）。
2. 从 backlog 按目标拆/选故事，每个含 DoD。粒度规则：1-2 会话内完成；需要"先写一篇大设计"的工作 = 战略设计议题，先走 §3 路由（`heartrule-intent-to-epic` / `heartrule-mechanism-flow`）。
3. **整文件覆盖重写** `docs/scrum/sprint-plan.md`（sprint 目标 + 故事表 `| 类型 | 故事 | DoD | 状态 |`）。
4. **停下等人确认**（增量可见、DoD 合理）。

### B. 节奏小结（sprint 末）

填 sprint-plan.md「节奏回顾」四行固定条目：计划 vs 实际完成 / 目标达成与下周方向 / 故事粒度是否合适 / 哪里堵了 + 下个 sprint 怎么调整。结论判断**流程是否调整**。

### C. backlog 维护

排序、清理失去价值的条目（**含意图区**——放弃的标日期）、探索项跟进。排序信号：验收观察、节奏小结结论、新意图、领域理解深化。不设时间窗口，随时可做。

## 人审门（停止点）

sprint 计划确认增量可见、DoD 合理；节奏小结由人判断流程是否调整。

## 产出物规则（§4 住所）

sprint-plan 的**下一个读者是每次开工的 AI 与人**，住所 = `docs/scrum/sprint-plan.md`；节奏小结的下一个读者是下个 sprint 计划，住所 = 同文件「节奏回顾」。

## 渐进规则化提醒（§10）

sprint 末若发现技能族本身有缺口（哪个节奏节点没有被遵守），**回写对应 heartrule skill**——规则是失败的补丁，先让流程跑，反复出问题处才加规则；规则多余时删掉。

另：`docs/process/development-rhythm.md` 改版（尤其章节重编号）后，核对各 heartrule skill 内的 § 引用并同步更新。

## 常见违规

| 违规                                  | 纠正                                         |
| ------------------------------------- | -------------------------------------------- |
| 目标从 backlog 故事拼凑而不是从意图选 | §5：先看活跃意图/epic 定目标，再按目标选故事 |
| sprint-plan 里保留历史 sprint         | 文件只放当前一周，历史在 git                 |
| 故事粒度超过 1-2 会话硬塞进 sprint    | 本质是战略设计议题，先走 §3 路由产出决策     |

## Red Flags

- 目标不是结果句（不可验证）
- 故事没有 DoD 就进 sprint
- 意图区有「活跃」意图却没进任何 sprint 目标讨论
