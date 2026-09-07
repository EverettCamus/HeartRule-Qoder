---
status: active
last_updated: 2026-09-07
---

# 节奏技能族使用说明

> 一句话：九个 `heartrule-*` 项目技能是开发节奏系统（[development-rhythm](development-rhythm.md)）的执行载体——节奏文档定义"怎么一起工作"，技能把这些约定变成可执行的程序。本文档是速查：谁用、何时用、怎么用、怎么维护。

## 1. 三层载体关系

| 载体                                 | 角色                                          |
| ------------------------------------ | --------------------------------------------- |
| `docs/process/development-rhythm.md` | 约定本身（§1–§13，唯一权威）                  |
| CLAUDE.md Working Rhythm             | 承重摘要（四条约定 + 技能指针，压缩后仍生效） |
| `.claude/skills/heartrule-*/`        | 执行程序（按需装载，正文锚定节奏文档章节号）  |

技能正文的每节都标注节奏出处（§3/§5/§6/§7/§8/§9/§10）——**节奏文档改版时要同步技能**。

本文档与节奏文档同住 `docs/process/`（索引见 [README](README.md)）。

## 2. 速查表

| 技能                       | 一句话                                                            | 何时触发                                                                 | 节奏出处       |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------- |
| `heartrule-session-start`  | 开工节奏：读 sprint/backlog → 提工作计划草案 → **等人批准**再动手 | 新会话开始（hook 指向）；中途接到新任务方向；"开工/今天做什么"           | §9、§3         |
| `heartrule-intent-to-epic` | 意图登记进 backlog 意图区 → 三分类 → 拆 epic                      | 用户提新意图/想法/需求；分不清需求归哪类                                 | §3、§5         |
| `heartrule-story-flow`     | 故事六步编排器：认领 → 类型分叉 → 六步 → DoD 收口                 | 认领/开始某个 story；"开始做 X 故事"                                     | §7             |
| `heartrule-domain-check`   | 领域概念检查：概念对照 UL/本体，缺口按归属补齐                    | story-flow 第 ① 步；单独要"domain-check"                                 | §7 第 1 步     |
| `heartrule-write-spec`     | 写 spec：GWT 正负例 + 领域模型片段 + 人工审查清单                 | story-flow 第 ③ 步；单独要"写 spec"                                      | §7 第 3 步     |
| `heartrule-accept-story`   | 验收（平台 GWT / 引擎案例）+ DoD + sprint-plan 标 done            | story-flow 第 ⑥ 步；单独要"验收/收尾"                                    | §7 第 6 步、§5 |
| `heartrule-mechanism-flow` | 智能机制收敛：本体先行（任务锚）→ 机制设计 → 案例验证 → 五落点    | 引擎级需求；`[intelligence]` story；智能机制讨论                         | §8             |
| `heartrule-design-docs`    | 文档治理：状态机、封板、ADR 流程                                  | 动 docs/design、docs/ddd 文档且涉及状态/决策；架构决策；`[design]` story | §6             |
| `heartrule-sprint-cycle`   | sprint 边界：计划（整文件覆盖）、节奏小结、backlog 维护           | 新一周计划；sprint 末小结；backlog 维护                                  | §5、§10        |

## 3. 结构：入口少、委托多

```
heartrule-session-start ──批准后──▶ 按涉及面转交
heartrule-intent-to-epic ──引擎级──▶ heartrule-mechanism-flow
heartrule-story-flow（六步编排器）
  ① heartrule-domain-check        ← HeartRule 特有
  ② superpowers:brainstorming
  ③ heartrule-write-spec          ← HeartRule 特有
  ④ superpowers:writing-plans
  ⑤ superpowers:executing-plans 或 subagent-driven-development
     + test-driven-development，完成后出 DDD 合规自查报告
  ⑥ heartrule-accept-story        ← HeartRule 特有（收尾可委托 finishing-a-development-branch）
heartrule-design-docs · heartrule-sprint-cycle（治理层，独立入口）
```

- **类型分叉**（§5）：`[feature]` 走完整六步；`[intelligence]` 第 ① 步后转 mechanism-flow（定案后拆出的实现故事进 backlog，由 sprint 排期）；`[design]` 转 design-docs，不走六步。
- **人审门**：除第 ⑤ 步（实现与测试，唯一抽查）外，每步停一次等人批准——停下不是卡住，是节奏要求（§4：除标注外默认全人审）。

## 4. 人怎么用

显式调用：输入 `/heartrule-xxx`（`/skills` 查看全部）。场景对照：

| 你说的话                               | 调哪个                     |
| -------------------------------------- | -------------------------- |
| "开工 / 今天做什么"                    | `heartrule-session-start`  |
| "我有个想法…… / 这个需求算什么"        | `heartrule-intent-to-epic` |
| "开始做 X 故事"                        | `heartrule-story-flow`     |
| "单独写个 spec"                        | `heartrule-write-spec`     |
| "验收 / 收尾 X"                        | `heartrule-accept-story`   |
| "讨论记忆/意识/队列机制怎么实现"       | `heartrule-mechanism-flow` |
| "封板 / 登记文档 / 这个决策要不要 ADR" | `heartrule-design-docs`    |
| "新一周计划 / 总结这周 / 清理 backlog" | `heartrule-sprint-cycle`   |

## 5. AI 怎么用（机制）

- **开工**：SessionStart hook（`.claude/settings.json`，matcher `startup`）注入一行事实性指针（`.claude/hooks/session-start-pointer.txt`），点名 session-start——"开工先看节奏"由此确定性生效。
- **日常**：其余技能靠 description 自动触发。description 只写触发条件、不写流程摘要（写摘要会让模型走捷径不读正文）。
- **兜底**：CLAUDE.md Working Rhythm 四条约定各有一行"→ 用 heartrule-xxx 技能执行"。

## 6. 与 superpowers 的分工

HeartRule 技能只做 superpowers 没有的环节，通用环节一律委托：

| HeartRule 特有                                                  | 委托 superpowers                                                        |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 领域概念检查、DDD 合规自查报告                                  | brainstorming、writing-plans                                            |
| HeartRule 格式 spec（GWT 正负例 + 领域模型片段 + 人工审查清单） | executing-plans / subagent-driven-development + test-driven-development |
| 机制五落点收敛、封板治理、Scrum 时钟                            | verification-before-completion、finishing-a-development-branch          |

引用措辞统一 `**REQUIRED SUB-SKILL:** Use superpowers:xxx`（插件命名空间与 `heartrule-` 零冲突）；不修改 superpowers 插件文件。

## 7. 维护规则

- **渐进规则化**（§10）：真实会话中发现违规 → 回写对应技能的「常见违规」表 / Red Flags；规则被证明多余时删掉。
- 节奏文档改版（尤其章节重编号）后，核对各技能内的 § 引用并同步。
- 技能增删时，更新本文档 §2 表。
