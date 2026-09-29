# 文档地图

> `docs/` 的一页视图：**哪类文档住哪、谁是权威、下一个读者是谁**。文档放错位置时先改这一页，再动文件。
>
> 判断"这份产物该落哪"的依据是[开发节奏系统](process/development-rhythm.md) §4 产出物规则（先找下一个读者，再定住所）；状态语义（`draft` / `active` / `decision-recorded` / `superseded`）见 §6。

## 分区

| 目录                       | 放什么                                         | 权威性               | 下一个读者               | 索引                                  |
| -------------------------- | ---------------------------------------------- | -------------------- | ------------------------ | ------------------------------------- |
| `design/`                  | 设计真相源：领域建模、本体、引擎机制、横切约束 | **唯一设计权威**     | 建代码的人、封板评审的人 | [README](design/README.md)            |
| `design/decisions/`        | ADR（跨域扁平，不按域拆）                      | 决策封板记录         | 每次开工的 AI            | [注册表](design/README.md#adr-注册表) |
| `ddd/`                     | 战略设计：限界上下文、上下文映射、战术快照     | 平台侧建模权威       | 画边界的领域专家         | 见下方清单                            |
| `process/`                 | 怎么一起工作：节奏系统、技能速查               | **约定唯一权威**     | 人与 AI 每次开工         | [README](process/README.md)           |
| `scrum/`                   | 做什么、什么时候做：产品待办、当前 sprint      | 需求与计划权威       | sprint 计划与回顾的人    | 见下方清单                            |
| `superpowers/`             | 单个故事的过程记录：spec / plan / domain-check | **不作为依据**       | 执行该故事的 AI          | [README](superpowers/README.md)       |
| `reference/`               | 外部资料快照 + 本项目已废弃旧稿                | 参考，非权威         | 查来路的人               | [README](reference/README.md)         |
| `audit/`                   | 2026-09-28 代码编目：能力清单与深挖、混乱地图  | **过渡分区，会退场** | 领 backlog 故事的人      | 见下方清单（含退场条件）              |
| `logging-specification.md` | 日志级别、格式与数据摘要规则                   | 待核（见下方清单）   | 加日志的人               | —                                     |

已归档的文档在仓库根的 [`docs-archive/`](../docs-archive/)：**只作历史参考**，复活需经人确认并搬回 `design/`（复活稿带「演进注记」）。归档通道的作用是给每份文档一个退场处，见[归档说明](../docs-archive/README.md)。

## 无独立索引的分区

分区内容少且稳定，由本页直接列出，不另设 README。

**`audit/`** — 2026-09-28 一次性的代码编目战役产出（诊断与处置对照，**不修**）。它**不是常设分区**：backlog 的故事行大量 `关联` 到这里，"story 从哪来"的来路靠它保存。

| 文件                                                          | 一句话                                                      |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| [capability-inventory](audit/capability-inventory.md)         | 能力清单 CAP-01..17：用户能做什么 + 实现度分级（坐标系）    |
| [mess-map](audit/mess-map.md)                                 | 混乱制图：六类混乱各在哪、量级、是否已被 backlog 登记       |
| [mess-disposition](audit/mess-disposition.md)                 | 混乱处置核对表：65 条逐条的判断与归宿，待人核对（中间那层） |
| [domain-ledger](audit/domain-ledger.md)                       | 领域清算：战略/战术设计概念的实际分布表，每概念权威是哪份   |
| [duplication-report](audit/duplication-report.md)             | 重复与名实检测：双实现、同概念多名、同名多实、死概念        |
| [runnability-baseline](audit/runnability-baseline.md)         | 可运行基线：现在能不能跑、跑到哪断、护栏覆盖哪些执行路径    |
| [deep-dive-execution-core](audit/deep-dive-execution-core.md) | 深挖：执行内核（consulting-session 上下文）                 |
| [deep-dive-session-state](audit/deep-dive-session-state.md)   | 深挖：会话状态与断点恢复                                    |
| [deep-dive-debugging](audit/deep-dive-debugging.md)           | 深挖：调试闭环（runId 分支、重跑、回写）                    |
| [deep-dive-authoring](audit/deep-dive-authoring.md)           | 深挖：脚本编写与编辑器                                      |
| [deep-dive-platform](audit/deep-dive-platform.md)             | 深挖：项目与版本、供应商、模板                              |

**退场条件**：`audit/` 的存在只为服务"这批 story 从哪来"。当关联它的故事全部 done、`关联` 列不再需要指向它时，整体转 [`docs-archive/`](../docs-archive/)——它正好是[归档通道](../docs-archive/README.md)的第一个客户。

**`ddd/`** — 战略设计。边界与上下文关系改起来贵，这里是它们的记录处。

| 文件                                                              | 一句话                                            |
| ----------------------------------------------------------------- | ------------------------------------------------- |
| [strategic-design](ddd/strategic-design.md)                       | 5+1 限界上下文、聚合根、端口与分层                |
| [context-map](ddd/context-map.md)                                 | 上下文映射全图                                    |
| [contexts/consulting-session](ddd/contexts/consulting-session.md) | Core 域战术快照                                   |
| [contexts/memory](ddd/contexts/memory.md)                         | Conversational Memory 战术快照（随 ADR 005 校准） |
| [contexts/variable-system](ddd/contexts/variable-system.md)       | Variable System 战术快照                          |
| [phase2a-violation-check](ddd/phase2a-violation-check.md)         | 一次 session 的合规检查记录，非设计文档           |

**`scrum/`** — 需求与计划。文件里只放当前 sprint，历史靠 git。

| 文件                                | 一句话                                                 |
| ----------------------------------- | ------------------------------------------------------ |
| [backlog](scrum/backlog.md)         | 产品待办：意图区 + 按 epic 分组的故事 + 智能设计议题   |
| [sprint-plan](scrum/sprint-plan.md) | 当前 sprint 的目标、故事与 DoD（每次 sprint 覆盖重写） |

**`logging-specification.md`** — 由 2026-04-12 的 logging-optimization plan 产出，实现仍在 `packages/core-engine/src/utils/logger.ts`。**归属待核**：确认与现有 logger 实现一致后搬进 `design/` 并登记索引，不一致则按现状修订或归档。

## 新文档放哪

按产出物的类型对号：

- **关键决策已定** → `design/decisions/NNN-slug.md`（编号 = 现有最大 +1），并登记 [ADR 注册表](design/README.md#adr-注册表)；红线增删同步 `design/foundation/architecture-constraints.md`。
- **引擎机制的思路** → `design/` 对应域目录（anchor 是它服务的引擎级业务需求）。
- **单个故事的 spec / plan / domain-check** → `superpowers/`。做完标 `done`，被取代标 `superseded`，失效搬 `docs-archive/`。
- **外部资料或上游论文快照** → `reference/`。
- **过程与协作约定** → `process/`（活文档，不封板）。
