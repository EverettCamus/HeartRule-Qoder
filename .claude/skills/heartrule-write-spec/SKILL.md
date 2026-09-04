---
name: heartrule-write-spec
description: 头脑风暴通过后为 story 写 spec 时使用——按 HeartRule 固定节写 spec（GWT 正负例、领域模型片段、人工审查清单），落在 docs/superpowers/specs/，人批准后才算通过。
---

# 写 Spec（开发节奏系统 §7 第 3 步）

**核心原则**：spec 是 DDD 战术设计的落点——功能、验收标准、领域模型片段一次写清；plan 阶段不再建模。节奏依据：`docs/design/development-rhythm.md` §7 第 3 步、§6 接缝关系。

## 何时用

- story-flow 第 ③ 步调用（头脑风暴已通过）
- 用户单独要求"写 spec"

**何时不用**：需求还没澄清（先 `superpowers:brainstorming`）；领域概念还没查（先 `heartrule-domain-check`）；引擎机制讨论（`heartrule-mechanism-flow` 的落点之一才是 spec）。

## 步骤

1. 若 brainstorming 的 Architectural 路径已产出 spec 草稿 → **补齐/校验**下述必含节，不重写。
2. 按 HeartRule 格式写 spec（节模板见 `references/spec-template.md`），落 `docs/superpowers/specs/YYYY-MM-DD-<slug>-design.md`（实测命名先例）。
3. **接缝门**：spec 涉及限界上下文边界变化（新限界上下文、新通用语言、改上下文关系）→ **停下**，先做战略设计（`docs/ddd/` + UL），再回来写 spec。
4. 写完自检必含节齐了没：功能描述 / 验收标准（GWT 正例+负例）/ 数据模型 / 接口定义 / 领域模型片段 / 异常处理 / 人工审查清单。
5. **停下等人批准。**

## 人审门（停止点）

人审：领域模型片段与意图一致（§4 协议表「写 Spec」行）。批准后才进 plan。

## 产出物规则（§4 住所）

spec 的**下一个读者是写 plan 的 AI 与验收时的人**，住所 = `docs/superpowers/specs/`。

## 常见违规

| 违规                             | 纠正                                       |
| -------------------------------- | ------------------------------------------ |
| 验收标准只有正例没有负例         | GWT 必须含正例+负例（§7 第 3 步硬性要求）  |
| 领域模型片段省掉，说"实现时再定" | 战术设计在 spec 完成；spec 缺模型 = 缺设计 |
| spec 碰了上下文边界还继续写      | 停下先战略设计，再回 spec                  |
| 人工审查清单没写                 | 验收（第 6 步）逐项打勾就靠它              |

## Red Flags

- spec 没有验收标准或只有正例
- spec 里出现"实现阶段再决定"的建模决策
- 未经人批准就转入 plan
