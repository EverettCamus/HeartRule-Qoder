---
status: active
last_updated: 2026-08-15
---

# HeartRule 开发节奏系统

> 本文档是 HeartRule 项目的人类 + AI 协同工作约定。它约束**我们怎么一起工作**：每周做什么、什么叫 Done、设计文档何时封板、智能思路讨论如何收敛。
>
> 一句话：**地图 / 时钟 / 施工队——三条节奏各归其位；引擎机制是内容流，讨论产出物驱动。**

## 1. 起源

2026-08-14 的会话中诊断出项目开发节奏失控，症状：

- 21 个 commit 堆在本地未推送——**没有终点**
- 设计文档膨胀至 85KB 仍在"完善中"——**没有封板**
- 仓库里没有 backlog / sprint 计划 / DoD 检查点——**没有节奏标记**
- AI 引擎的"智能实现思路"讨论没有专门位置，泄漏进设计文档和 sprint 工作

本文档确立四层模型解决以上问题。它是**活文档**：按第 8 节规则演进。

## 2. 四层模型

| 层                     | 回答的问题                            | 节奏                   | 仓库载体                                                                                | 完成态                                             |
| ---------------------- | ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **地图** DDD 设计      | 领域在哪、边界在哪、通用语言是什么    | 月~季度级，证据驱动    | 战略：`docs/ddd/`；领域建模：`docs/design/`（topic-unit-modeling、ubiquitous-language） | 文档达到 `decision-recorded` 即封板                |
| **时钟** Scrum（轻量） | 这周做什么、什么时候做完、什么叫 Done | 每周                   | `docs/scrum/backlog.md` + `sprint-plan.md`                                              | 故事级 DoD 全部勾选                                |
| **施工队** superpowers | 单个故事怎么做                        | 小时~天级              | `docs/superpowers/specs` + `plans/`                                                     | 一个可运行增量                                     |
| **引擎机制**           | 引擎智能机制怎么设计、怎么沉淀        | 事件驱动（遇到即讨论） | `docs/design/` 机制文档 + `docs/design/decisions/`（ADR）+ backlog「智能设计议题」      | 收敛为 机制文档 / ADR / spec / backlog 故事 四选一 |

> **引擎机制不是节奏层**——它是"我们在设计什么"（引擎的机制设计），不是"我们怎么工作"（地图/时钟/施工队三条节奏）。它进 `docs/design/` 存放，与地图层的领域建模、设计哲学混居；层归属见 [README 索引](README.md)。讨论纪律见第 6 节。

定位关系：**地图决定边界，时钟决定节奏，施工队决定方法，引擎机制决定引擎灵魂**。各层不得互相污染：

- **地图文档**（`docs/ddd/` 战略 + `docs/design/` 领域建模）不是 sprint 交付物；需要先写大设计的议题进地图层，不当故事做。
- sprint 故事是**时钟**的交付物，每个故事必须在 1–2 个会话内完成一个可运行增量；做不完说明故事太大或前置设计没定。
- **机制文档**（`docs/design/` 中实现思路类）与机制讨论是**内容流**，产出的是机制文档更新 / 决策 / spec / story，不是"聊到哪算哪"。

## 3. 时钟层：轻量 Scrum

**节奏**：每周一个 sprint。**仪式**：仅 sprint 计划（定目标 → 从 backlog 选故事 → 定每故事 DoD）。不设 review/retro 仪式。

**载体**：

- `docs/scrum/backlog.md` — 产品待办。所有候选故事，含三类：`[feature]` / `[design]` / `[intelligence]`。每项：标题、类型、状态（`backlog/ready/in-progress/done`）、关联文档。
- `docs/scrum/sprint-plan.md` — 当前 sprint。sprint 目标、选中的故事清单（含 DoD）、状态。每次 sprint 覆盖，旧计划留在 git 历史。

**故事级 DoD**（Definition of Done）：

| 故事类型         | DoD                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `[feature]`      | 测试通过 + lint/typecheck 通过 + commit + push + sprint-plan 标记 done |
| `[design]`       | 文档达到 `decision-recorded`（必要时追加 ADR）+ commit + push          |
| `[intelligence]` | 收敛出 机制文档 / ADR / spec / backlog 故事（四选一）+ commit + push   |

**故事粒度规则**：一个故事应在 1–2 个会话内完成。若某工作"需要先写一篇大设计"，它本质是地图层议题，先走 L2 流程，产出决策后再拆成小故事。

## 4. 地图层：DDD 战略设计

**载体**：战略设计 → `docs/ddd/`（strategic-design、context-map）；领域建模 → `docs/design/`（topic-unit-modeling、ubiquitous-language）。ADR 落 `docs/design/decisions/`。

> 注意：`docs/design/` 是**混层目录**——机制文档（引擎机制）与领域建模（地图层）并存。层归属以 [README 索引](README.md) 的「层」列为准，暂不物理拆分。

**状态语义**（每篇文档顶部 frontmatter 的 `status`）：

| 状态                | 含义                                                          |
| ------------------- | ------------------------------------------------------------- |
| `draft`             | 尚未验证，正在成形                                            |
| `active`            | 正在被实现/使用的活文档                                       |
| `decision-recorded` | 关键决策已记录（ADR），封板；仅当实现或新证据与之矛盾时才修订 |
| `superseded`        | 被其他文档取代                                                |

**封板规则**：设计文档在关键决策落入 ADR 后，从 `active` → `decision-recorded`，停止积累。修订是**证据驱动**的：实现碰壁、e2e 暴露问题、或领域理解深化时才打开修订，改完重新封板。

**索引**：`docs/design/README.md` 维护状态总表，作为地图的"一页视图"。

## 5. 施工队层：superpowers

每个故事按既有 superpowers 流程执行：**brainstorm → spec → plan → TDD → code review**。

- spec 落 `docs/superpowers/specs/`，plan 落 `docs/superpowers/plans/`（已有 11 spec + 13 plan 先例）。
- 施工队层与时钟层的接缝：**故事从 backlog 来，规格从 spec 来**。backlog 里的故事被认领后，若需要规格先写 spec，再按 plan 实施。

## 6. 引擎机制：AI 引擎实现思路

**为什么值得单独成节**：HeartRule 是 AI 引擎——记忆怎么调取、意识怎么触发、话题队列怎么动态调整，这些**引擎智能机制的实现思路**与 DDD 层（领域边界、通用语言）是两回事：DDD 回答"领域是什么"，机制设计回答"智能怎么做"。机制讨论需要人类与 AI 频繁对话，且天然不适合硬性排期，值得有专门的位置与纪律。

**可追溯性闸门**：每个机制文档开头必须写清它服务的**引擎级业务需求**（一句话用户价值）——"这个机制让谁在什么场景得到什么价值"。写不出来说明没有需求锚点，是技术自嗨，不写。业务需求分两流：

- **应用级**——站在最终用户/具体咨询域的视角，用 YAML scripts + templates 实现，不需要新机制；
- **引擎级**——站在引擎作为产品的用户价值视角（"咨询师会谈中能觉察信号并调整议程"），需要引擎新能力时由机制承载。

机制文档回答"怎么做"，锚定的业务需求回答"要什么"；二者靠**可追溯性**连接。

**载体**：机制文档 → `docs/design/`（memory-framework、consciousness-system、ai-ask-memory-recall 等）；决策 → `docs/design/decisions/`（ADR）；探索 → backlog「智能设计议题」。

**规则（产出物驱动）**：机制讨论**事件驱动**——遇到了就讨论，不必等排期；但每次讨论必须收敛为以下四选一：

1. **机制设计文档** —— 思路是引擎实现机制（如记忆调取、意识触发、队列调整），更新 `docs/design/` 对应文档（锚定引擎级业务需求）；
2. **ADR** —— 关键决策已定，记录进 `docs/design/decisions/`；
3. **spec** —— 思路已成型、可交付实现，写进 `docs/superpowers/specs/`；
4. **backlog 故事** —— 思路还需实施，沉淀为 `[intelligence]` 故事进 backlog。

若一次讨论无法收敛，明确标记为 backlog「智能设计议题」下的**探索项**（exploration item），注明未决问题，下次继续——不允许"无产出地聊到哪算哪"。

**机制的归宿**：机制文档成熟后，拆成 `[intelligence]` / `[feature]` 故事流入时钟层（backlog → sprint），每个故事面向脚本作者/引擎可观察的增量 + DoD。机制设计不是终点——流入 backlog 才是。

## 7. 每会话开工约定

Claude Code 在 HeartRule 仓库启动会话时：

1. **先看 `docs/scrum/sprint-plan.md`** —— 知道当前 sprint 做什么、哪些故事 in-progress。
2. **若涉及设计**，查 `docs/design/README.md` 确认相关文档状态，遵守封板规则。
3. **若涉及引擎机制**，按第 6 节收敛规则执行，产出物必须落地。

人类侧同样：开工前扫一眼 sprint-plan，确认本周目标；做完一个故事主动触发 DoD 检查。

## 8. 演进规则

本文档自身按**渐进规则化**（Progressive Rulification）演进：

- 让流程先宽松运行，在**反复出问题的地方**加一条明确规则；
- 规则被证明多余时删掉；
- 每季度回顾一次本节奏系统是否还适配（co-evolutionary，反馈通道）。

## 9. Sprint 0 记录（2026-08-15）

本轮恢复工作：

- 给 10 篇设计文档标注 `status`（见 `docs/design/README.md`）
- 建立本节奏系统：本文档 + backlog + sprint-plan 骨架
- `.gitignore` 排除 `.opencode/`、`.claude/worktrees/`
- 推送存量 21 个 commit + 本轮恢复 commit
