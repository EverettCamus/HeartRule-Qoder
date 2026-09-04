---
name: heartrule-accept-story
description: 故事实现完成后验收收口时使用——平台故事逐项勾选 GWT、引擎故事跑案例对话，再查故事级 DoD（测试/lint/commit/push/sprint 标记），全部满足才允许宣称完成。
---

# 验收 + DoD（开发节奏系统 §7 第 6 步 + §5）

**核心原则**：验收分两类（平台 GWT / 引擎案例对话），DoD 全勾完才 done——**DoD 未满足不得宣称"完成"**（CLAUDE.md 约定第 2 条）。节奏依据：`docs/design/development-rhythm.md` §7 第 6 步、§5 故事类型与 DoD。

## 何时用

- story-flow 第 ⑥ 步调用（实现完成后）
- 用户单独要求"验收 / 收尾某个故事"

**何时不用**：实现还没完成（回 `superpowers:verification-before-completion` 出证据再说）；[design] 故事（走 `heartrule-design-docs` 封板路径）。

## 步骤

1. **按故事类型验收**：
   - **平台故事**：对照 spec 验收标准，GWT 逐项勾选（正例+负例都过）。
   - **引擎故事**：案例对话验证——AI 可起草模拟对话片段，**人确认合理性后使用**（§8 单一出处）；验证片段存入 `packages/core-engine/test/`（`eval/`、`integration/` 等，与 CLAUDE.md 测试结构一致），作为回归资产持续运行。依赖 live 后端、进不了常规测试目录的验证脚本（如 docker 验证型），以故事行 DoD / ADR 指定的住所为准（如 `scripts/`）。
   - **故事没有 spec**（如从 ADR 直接拆出的验证故事）：验收依据锚定**故事行 DoD + §5 表**，证据照样逐项采。
2. **人工审查清单逐项打勾**（spec 第 7 节）；无 spec 的故事注明"无人工审查清单"，用故事行 DoD 替代。
3. **DoD 检查**（§5 表）：
   - `[feature]`：测试通过 + lint/typecheck 通过 + commit + push + sprint-plan 标记 done
   - `[intelligence]`：五落点收敛（机制文档/ADR/spec/本体更新/backlog 故事）+ 拆出的实现故事进 backlog + commit + push
   - `[design]`：文档达到 `decision-recorded`（必要时补 ADR）+ commit + push
   - 测试/lint 通过要有**命令输出证据**（衔接 `superpowers:verification-before-completion`）。
4. 更新 `docs/scrum/sprint-plan.md` 故事行状态为 `done`。
5. **停下：最终验收由人拍板。**

## 人审门（停止点）

最终验收决定——是否合并/关闭，人说了算。报告里证据先行：命令输出、勾选结果、案例片段。

## 产出物规则（§4 住所）

验收报告的下一个读者是人（拍板合并），住所 = 会话内呈现 + sprint-plan 状态更新；案例验证片段的下一个读者是回归测试，住所 = `packages/core-engine/test/`。

## 常见违规（rationalization 表）

| 违规想法                     | 现实                                                  |
| ---------------------------- | ----------------------------------------------------- |
| "测试过一遍就行，不用贴输出" | 需要命令输出证据；没跑过就不许宣称通过                |
| "顺手把下一个故事也做了"     | 越出故事范围——新需求回 backlog 意图区，由 sprint 排期 |
| "lint 有几个 warning 没事"   | DoD 要求 lint/typecheck 通过；过不了就是没 done       |

## Red Flags

- 宣称完成但拿不出验证命令的输出
- 引擎故事验收没有案例对话片段入库
- sprint-plan 状态没更新就说收尾了
