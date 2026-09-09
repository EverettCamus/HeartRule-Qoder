# Sprint 1 — 记忆收尾 · 节奏巩固

> 周期：2026-09-02 ~ 2026-09-08
> Sprint 目标：把 Hindsight 记忆集成收尾到全绿，两条记忆设计文档封板，并把七轮推敲后的开发节奏系统落盘为文档与 skill——完成一次完整的轻量 sprint 闭环。

## Sprint 目标

记忆系统从"集成中"走到"已验证 + 设计封板"，同时把开发节奏系统落盘（文档修订 + 项目 skill），演示一次完整的轻量 sprint 闭环。

## 故事

| 类型      | 故事                                                                                                  | DoD                                              | 状态 |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---- |
| [feature] | Hindsight 集成收尾：verify-mental-model.ts 对 docker 后端全绿                                         | verify 脚本 exit 0；已 commit+push               | done |
| [design]  | memory-retrieval-types 封板为 decision-recorded（补 ADR）                                             | frontmatter status 变更 + ADR 落库 + commit+push | done |
| [design]  | ai-ask-memory-recall 封板为 decision-recorded（补 ADR）                                               | frontmatter status 变更 + ADR 落库 + commit+push | done |
| [feature] | 开发节奏文档修订（rhythm.md 七轮共识 + backlog epic 重排 + sprint-plan + CLAUDE.md 同步）             | 文档修订完 + commit + push                       | done |
| [feature] | 创建节奏项目 skill（六步流程/四选一收敛/封板规则编码进 .claude/skills/）                              | skill 可用 + §9 开工约定引用 + commit+push       | done |
| [feature] | 收尾小账：development-rhythm2.md 旧稿移入 docs/reference + AI-DLC 参考文档入库 + domain-checks 目录建 | 三项完成 + commit                                | done |

## 节奏回顾（Sprint 结束时填）

- 计划 vs 实际完成：6/6 完成；周期 09-02 ~ 09-08，实际 09-09 收尾（晚 1 天）。两条设计故事从「改状态 + 补 ADR」膨胀为实质修订——封板一致性检查暴露检索文档与 004/005 的矛盾（快通道 LLM 摘要违反 004、DeepInsight confidence 违反 005），且中途发现 005（opinions 移除）牵连 5+ 份文档与代码。按「瘦身后再封板」决策收敛：ADR 006 定六条决策，慢通道机制移居意识系统文档。
- 目标达成与下周方向：Hindsight 集成全绿 + 三份 ADR 落库（004/005/006）+ 记忆框架与检索层文档封板 + 节奏系统文档与 skill 落盘——记忆主线闭环。下周方向：backlog 新增 4 条 [intelligence] 故事（快通道实现 / 三路查询实证 / 慢通道实现 / require 核实），连同 Epic B 意识层故事供 Sprint 2 选择。
- 故事粒度是否合适：设计封板类故事粒度偏粗——「封板」背后可能藏着实质修订（本次两条故事实际工作量 = 文档瘦身 + 内容迁移 + ADR + 索引/backlog 同步）；建议今后 [design] 故事描述先含一致性检查（与已封板 ADR 对照），或拆成「检查+修订」与「ADR+封板」两步。
- 哪里堵了 / 下个 sprint 怎么调整：堵点在 ADR 落库后关联文档的同步修订有遗漏——004 遗留 ai-ask §3.3 矛盾项未闭环，005 修订清单漏了检索文档 opinion 行，直到封板检查才暴露。调整：ADR 的「遗留跟进」项在落库时同步挂 backlog 故事，不能只记在 ADR 里（006 已按此执行）。
