# 产品待办（Backlog）

> 节奏说明见 [开发节奏系统](../process/development-rhythm.md)。需求池：随时可加（标注来源），按 epic 分组保持有序。每周从「就绪故事」选入 [sprint-plan](sprint-plan.md)。
> 故事类型：`[feature]` 功能实现 / `[design]` 设计封板 / `[intelligence]` 机制设计（机制未定型的收敛故事）。状态：`backlog` → `ready` → `in-progress` → `done`。

## 意图区（Intents）

> 「提出意图」的产出物登记处（[开发节奏系统 §4](../process/development-rhythm.md)）：意图一句话 + 价值 + 状态。意图随时可加、不急着拆；拆成 epic 时在对应 epic 分组下标注来源意图。状态：`活跃` / `未拆`（还没想清怎么拆）/ `已拆成 epic` / `放弃`（标日期）。每周 sprint 计划从「活跃」意图中选目标。

| 状态        | 意图（一句话）                                                       | 价值                                                             | 来源                       | 关联 epic |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- | --------- |
| 已拆成 epic | 记忆系统收尾与封板：Hindsight 记忆集成跑到全绿，两条记忆设计文档封板 | 记忆成为可验证、可回归的一等资产，设计不再悬空                   | 回溯补录                   | Epic A    |
| 已拆成 epic | 议程主线落地：意识层与话题队列的运行时实现，引擎能觉察信号并调整议程 | 引擎具备咨询师"边执行边观察"的核心智能                           | 回溯补录                   | Epic B    |
| 已拆成 epic | 节奏系统固化：开发节奏落盘为文档与项目 skill                         | 人与 AI 的协作有可查的约定与可执行的工具                         | 回溯补录                   | Epic C    |
| 已拆成 epic | 变量职责收缩：跨会话状态权威归信息点文档，全局变量取消               | 跨会话状态三处存储收敛为一处；人类咨询师获得修正 AI 理解的编辑面 | 2026-09-09 讨论（ADR 007） | Epic D    |

## 就绪故事（Ready）

### Epic A · 记忆主线 —— 记忆系统收尾与封板

> 来源意图：意图区「记忆系统收尾与封板」

| 状态        | 类型           | 故事                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 关联                                                                                                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| done        | [feature]      | Hindsight 记忆集成收尾验证：跑通 verify-mental-model.ts，确保对 docker 后端全绿                                                                                                                                                                                                                                                                                                                                                                                                   | [004 ADR](../design/decisions/004-memory-model-calibration.md) · scripts/verify-mental-model.ts                                                      |
| in-progress | [intelligence] | ai_ask 快通道实现：每轮 recall + 分层 memoryContext（baseline/fastHits/deepInsights）+ 分段渲染                                                                                                                                                                                                                                                                                                                                                                                   | [ai_ask 记忆调用 §3/§6](../design/memory/ai-ask-memory-recall.md) · [006 ADR](../design/decisions/006-retrieval-layer-scope.md) · Sprint 2           |
| backlog     | [intelligence] | 三路查询实证：类似/关联事件视角的命中率对比验证（默认关闭，证据通过才开启）                                                                                                                                                                                                                                                                                                                                                                                                       | [记忆调取机制 §2.11](../design/memory/memory-retrieval-types.md) · 006 ADR 决策 2                                                                    |
| backlog     | [intelligence] | 慢通道实现：insightForSlowThinking 触发 → 两阶段深度检索 → DeepInsight 注入                                                                                                                                                                                                                                                                                                                                                                                                       | [意识系统 §2.6](../design/consciousness/consciousness-system.md) · 006 ADR 决策 4 · [ai_say 三线旧稿](../../docs-archive/misc/ai_say智能实现机制.md) |
| backlog     | [intelligence] | require 收集紧迫度核实：在 exit-decision 上下文中评估是否重新设计                                                                                                                                                                                                                                                                                                                                                                                                                 | 006 ADR 决策 6                                                                                                                                       |
| backlog     | [feature]      | recall 取回接线与实证：① 实体态进**实体备忘**（§4.1）——每轮都取（端口补 `maxEntityTokens`）、按 `canonical_name` upsert 成备忘（会话内保留、上限 10 份、每份留最近 5 条、按末次提及淘汰），**渲染只在"这一轮提到它"时**（判定字段写了专名，或字面扫到备忘里已有的名字），**不额外发检索**；② 开 `preferObservations`（概要优先于原始片段，`sourceFactIds` 留展开路径）；③ 实证：写时实体质量与 observations 颗粒度（附 C.6 四处待实证）、开关对"事"类召回的影响（需 docker 后端） | [ai_ask 记忆调用 §4.1 / 附 C.1 / 附 C.6](../design/memory/ai-ask-memory-recall.md) · `hindsight-adapter.ts`                                          |

### Epic B · 议程主线 —— 意识层与话题队列

> 来源意图：意图区「议程主线落地」

| 状态    | 类型           | 故事                                                 | 关联                                                                                                                                                                                                                                             |
| ------- | -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ready   | [feature]      | rerun-action 从 worktree 分支合并回主干              | docs/superpowers/plans/2026-05-07-rerun-action.md · worktree-rerun-feature-continue · [脚本调试需求旧稿](../../docs-archive/misc/HeartRule脚本调试需求.md)                                                                                       |
| backlog | [intelligence] | 意识层触发机制实现（不变量三：意识为唯一队列修改者） | [意识系统](../design/consciousness/consciousness-system.md) · [话题单元建模](../design/topic/topic-unit-modeling.md) · [两阶段 LLM 旧稿](../../docs-archive/architecture/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md) |
| backlog | [feature]      | 议程（话题队列）运行时实现                           | [议程实现机制](../design/topic/topic-queue-implementation.md) · [DDD 战术设计旧稿](../../docs-archive/domain/Story-2.2-Topic动态展开Action队列-DDD战术设计.md)                                                                                   |
| backlog | [feature]      | session-intelligence guardian 实现                   | docs/superpowers/specs · 相关设计                                                                                                                                                                                                                |

### Epic C · 节奏系统主线 —— 工具与流程建设

> 来源意图：意图区「节奏系统固化」

| 状态    | 类型      | 故事                                                                    | 关联                                             |
| ------- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| backlog | [feature] | 把开发节奏编码为 Claude Code 项目 skill（六步流程/四选一收敛/封板规则） | [开发节奏系统](../process/development-rhythm.md) |

### Epic D · 变量-文档主线 —— 变量职责收缩与信息点文档落地

> 来源意图：意图区「变量职责收缩」

| 状态    | 类型           | 故事                                                                                                                                                                                                                                                         | 关联                                                                                                                              |
| ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| ready   | [design]       | memory-framework + variable-memory-bridge 按 ADR 007 修订（职责边界、双路径收缩、autoRefresh 矩阵、迁移策略）；与 bridge v0.2.0 矛盾处以 007 为准（2026-09-09 人裁定）；补**写值红线**（本 topic 待收集且为空者不进 piggy 目标集）与 look-ahead 单跳限制记录 | [007 ADR](../design/decisions/007-variable-document-boundary.md) · [ai_ask 记忆调用 §2](../design/memory/ai-ask-memory-recall.md) |
| backlog | [intelligence] | 信息点文档机制实现：文档模板+数据区、映射装载（hydrate）与写回、版本与 provenance                                                                                                                                                                            | 007 ADR 决策 2/3/4/5                                                                                                              |
| backlog | [feature]      | 全局变量取消迁移：global.yaml、user_global_variables 表、三层作用域、存量脚本                                                                                                                                                                                | 007 ADR 决策 2                                                                                                                    |

## 智能设计议题（Exploration）

> 智能思路讨论的沉淀区。机制文档与 ADR 落在 `docs/design/`，此处仅留探索项。每次讨论必须收敛为机制文档 / ADR / spec / backlog 故事（四选一）；未收敛前以探索项留此，注明未决问题。

| 议题                       | 未决问题                                                                                                                       | 备注                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 意识层与主线引擎的接缝协议 | 触发检测（矛盾/情绪）到队列修改之间的具体事件契约                                                                              | 设计 active，检测定义已落 commit；属 Epic B · [Action/Topic 职能边界](../design/topic/action-topic-boundary.md)                                                                                |
| 信息点跨文档引用关系       | 同一信息点被多份文档引用时，权威处与引用处的同步机制（引用语义、更新传播、冲突）                                               | ADR 007 决策 2 备注，待设计                                                                                                                                                                    |
| 咨询方案文档化             | 咨询方案（§2.4）是否改为信息点文档形态替代 treatment_plans 表；信息点是否需支持列表值                                          | ADR 007 遗留，随 Phase 3 解决                                                                                                                                                                  |
| 文档形态语法细化           | 笔记型 markdown+frontmatter 与表单型 HTML 模板+JSON 实例的具体语法、渲染、消毒                                                 | ADR 007 决策 2 留扩展                                                                                                                                                                          |
| 连发拼接还必要吗           | 先拼成一条的理由（「否则指代落在后几条会被漏掉」）是规则路径的说法；判定并入生成后还必要吗、留给谁（判定行的输入还是固定拼法） | [ai_ask 记忆调用 附 A.2 案例 9](../design/memory/ai-ask-memory-recall.md)；2026-09-15 挂，实现时收                                                                                             |
| 反问轮走哪个 move          | 默认模板的 `话术调整策略` 七行里没有"用户反问"这一行——用户直接要方案时，框架该给建议、该先澄清，还是该把它当材料谈？           | [ai_ask 记忆调用 §3.5](../design/memory/ai-ask-memory-recall.md)；记忆侧已定"判据只看缺不缺窗口外事实"，move 本身归模板侧（Default 模板 `config/prompt-defaults/ai_ask_v1.md`）；2026-09-16 挂 |

## 已关闭（Done）

| 故事                                                                        | 关闭日期   |
| --------------------------------------------------------------------------- | ---------- |
| [feature] 建立开发节奏系统 + Sprint 0 恢复                                  | 2026-08-15 |
| [design] memory-retrieval-types 封板（active → decision-recorded，006 ADR） | 2026-09-09 |
| [design] ai-ask-memory-recall 封板（active → decision-recorded，006 ADR）   | 2026-09-09 |
