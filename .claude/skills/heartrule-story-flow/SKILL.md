---
name: heartrule-story-flow
description: 认领或开始 sprint-plan / backlog 中的某个 story、或用户说"开始做 X 故事"时使用——story 从认领到 done 的过程入口，按故事类型分叉。
---

# 故事六步（开发节奏系统 §7 编排器）

**核心原则**：story 管范围，spec 管设计，plan 管步骤——六步走完才 done。节奏依据：`docs/design/development-rhythm.md` §7。

## 何时用

- 认领 sprint-plan 或 backlog 中的某个 story 开始工作
- 用户说"开始做 X 故事"

**何时不用**：故事范围外的顺手改动（先走 `heartrule-intent-to-epic` 进意图区）；机制讨论（`heartrule-mechanism-flow`）。

## 步骤

### 0. 认领 + 类型分叉

把 story 在 sprint-plan 的状态改为 `in-progress`，然后按类型分叉：

- `[feature]` → 走下面完整六步
- `[intelligence]` → 机制未定型：**REQUIRED SUB-SKILL:** Use heartrule-mechanism-flow。机制定案后拆出的实现故事进 backlog，由 sprint 排期——不在本 story 里实现。
- `[design]` → 不走六步：转 `heartrule-design-docs`（一致性检查 → 关键决策补 ADR → 封板）

### 六步（[feature]）

1. **领域概念检查**：**REQUIRED SUB-SKILL:** Use heartrule-domain-check
2. **头脑风暴**：**REQUIRED SUB-SKILL:** Use superpowers:brainstorming（需求澄清，**不做领域建模**；既有流程类需求走其 Bounded 路径）→ **人审门：业务规则正确**
3. **写 spec**：**REQUIRED SUB-SKILL:** Use heartrule-write-spec → **人审门：领域模型片段与意图一致**
4. **写 plan**：**REQUIRED SUB-SKILL:** Use superpowers:writing-plans（plan 不新增领域建模；发现需调整模型 → 回第 3 步改 spec）→ **人审门：不违反架构约束**
5. **实现与测试**：superpowers:executing-plans 或 superpowers:subagent-driven-development + superpowers:test-driven-development；完成后出 **DDD 合规自查报告**（格式见 `references/ddd-compliance-report.md`，检查依据 = `docs/design/architecture-constraints.md`；机械项 AI 查、语义项人抽查）——此步是唯一**抽查**环节（§4 协议表）。
6. **验收**：**REQUIRED SUB-SKILL:** Use heartrule-accept-story（GWT/案例 + DoD + sprint-plan 标记 done）

## 人审门

头脑风暴后、spec 后、plan 后各停一次等批准；验收由人最终拍板。只有第 5 步（实现与测试）是抽查。

## 纪律

- 机制讨论不许"顺手实现"——收敛出的实现 story 一律进 backlog，由 sprint 排期（§8 产出物规则）。
- DoD 未满足不得宣称"完成"（CLAUDE.md 约定第 2 条）。

## 产出落点（§7 规格落点）

spec → `docs/superpowers/specs/`；plan → `docs/superpowers/plans/`；domain-check → `docs/superpowers/domain-checks/`（草稿纸级，定期清理）；合规报告随第 6 步验收给出。

## 常见违规

| 违规                           | 纠正                                                    |
| ------------------------------ | ------------------------------------------------------- |
| 跳过 domain-check 直接头脑风暴 | 第 1 步是节奏的硬门禁，superpowers 没有它，靠本技能生效 |
| 在 plan 里新增领域建模决策     | 战术设计在 spec 完成；发现缺口回 spec 改                |
| 实现完不验收就说 done          | 第 6 步 DoD 是完成定义，未勾完不得宣称                  |

## Red Flags

- story 类型没分清就动手
- 头脑风暴后不等批准就写 spec
- 把机制讨论顺手写成了代码
