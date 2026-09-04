---
name: heartrule-design-docs
description: 创建或修改 docs/design、docs/ddd 文档、做架构决策、或处理 [design] 封板故事时使用——管理文档状态机与 README 索引，关键决策落 ADR 后封板停止积累。
---

# 设计文档治理 / 封板（开发节奏系统 §6 载体与治理）

**核心原则**：文档必须封板——关键决策落 ADR 后 `active` → `decision-recorded`，**停止积累**；修订仅证据驱动。节奏依据：`docs/design/development-rhythm.md` §6。

## 何时用

- 创建/修改 `docs/design/`、`docs/ddd/` 下的文档
- 做架构决策（需要 ADR）
- `[design]` story（story-flow 类型分叉转来）

**何时不用**：文档内容的具体讨论（`heartrule-mechanism-flow`）；story 执行（`heartrule-story-flow`）。

## 步骤

1. **状态机**：frontmatter `status` 只取四态——`draft`（成形中）/ `active`（活文档）/ `decision-recorded`（封板）/ `superseded`（被取代）。
2. **新文档登记** `docs/design/README.md` 索引（列：`| 文档 | 层 | 状态 | 已记录决策 |`；层值：基础哲学 / 地图·领域建模 / 本体 / 引擎机制 / 流程）。
3. **封板**：关键决策落 ADR 后 `active` → `decision-recorded`。封板后**停止积累**——新想法另起 ADR / 新文档 / backlog 探索项；修订仅**证据驱动**（实现碰壁、e2e 暴露问题、领域理解深化），改完重新封板。
4. **ADR 流程**：AI 起草（模板见 `references/adr-template.md`）→ **人批准** → 落 `docs/design/decisions/NNN-slug.md`（编号取现有最大 +1）→ 更新 README「已记录决策」列 → 更新架构约束清单（`docs/design/architecture-constraints.md`，首次需要时创建并登记 README，层归属 = 横切约束）。
5. **[design] story 路径**（不走六步）：一致性检查（文档概念与 UL/本体对得上）→ 关键决策补 ADR → 封板。

## 人审门（停止点）

批准 ADR 与领域模型变化。ADR 未经人批准不落库。

## 产出物规则（§4 住所）

ADR 的下一个读者是**每次开工的 AI 与封板评审的人**，住所 = `docs/design/decisions/`；文档状态的下一个读者是所有读者，住所 = README 索引。

## 常见违规（rationalization 表）

| 违规想法                       | 现实                                           |
| ------------------------------ | ---------------------------------------------- |
| "再往封板文档里加一小节"       | 封板 = 停止积累；新想法另起 ADR/新文档/探索项  |
| "顺手把状态改了，索引以后再说" | README 索引必须同步——状态改了索引没改 = 账不符 |
| "这个决策小，不用 ADR"         | 关键决策落 ADR 是封板的前提；§6 状态语义写明   |

## Red Flags

- 向 `decision-recorded` 文档加内容
- 改了 frontmatter status 没同步 README 索引
- ADR 未经人批准就落 decisions/
