# 产品待办（Backlog）

> 节奏说明见 [开发节奏系统](../process/development-rhythm.md)。需求池：随时可加（标注来源），按 epic 分组保持有序。每周从「就绪故事」选入 [sprint-plan](sprint-plan.md)。
> 故事类型：`[feature]` 功能实现 / `[design]` 设计封板 / `[intelligence]` 机制设计（机制未定型的收敛故事）。状态：`backlog` → `ready` → `in-progress` → `done`。

## 意图区（Intents）

> 「提出意图」的产出物登记处（[开发节奏系统 §4](../process/development-rhythm.md)）：意图一句话 + 价值 + 状态。意图随时可加、不急着拆；拆成 epic 时在对应 epic 分组下标注来源意图。状态：`活跃` / `未拆`（还没想清怎么拆）/ `已拆成 epic` / `放弃`（标日期）。每周 sprint 计划从「活跃」意图中选目标。

| 状态        | 意图（一句话）                                                                                                     | 价值                                                               | 来源                              | 关联 epic |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------- | --------- |
| 已拆成 epic | 记忆系统收尾与封板：Hindsight 记忆集成跑到全绿，两条记忆设计文档封板                                               | 记忆成为可验证、可回归的一等资产，设计不再悬空                     | 回溯补录                          | Epic A    |
| 已拆成 epic | 议程主线落地：意识层与话题队列的运行时实现，引擎能觉察信号并调整议程                                               | 引擎具备咨询师"边执行边观察"的核心智能                             | 回溯补录                          | Epic B    |
| 已拆成 epic | 节奏系统固化：开发节奏落盘为文档与项目 skill                                                                       | 人与 AI 的协作有可查的约定与可执行的工具                           | 回溯补录                          | Epic C    |
| 已拆成 epic | 变量职责收缩：跨会话状态权威归信息点文档，全局变量取消                                                             | 跨会话状态三处存储收敛为一处；人类咨询师获得修正 AI 理解的编辑面   | 2026-09-09 讨论（ADR 007）        | Epic D    |
| 已拆成 epic | 代码-文档一致性收敛：设计约定了一套、AI 生成代码时另起炉灶的那几处收口；加上编目查出、还没登记过归宿的 51+4 处混乱 | 引擎行为与设计文档对得上，读者不必猜"以哪份为准"                   | 2026-09-27 审计 + 编目 2026-09-28 | Epic J    |
| 已拆成 epic | 三大基础咨询动作（收集 ai_ask / 分析 ai_think / 传递 ai_say）的主线能力成立：写下的能跑起来、能接进流程            | 一次咨询能由脚本自动走完，走完时关键信息已变成结构化变量           | 代码编目 2026-09-28               | Epic E    |
| 已拆成 epic | 调试闭环：调试台与编辑器看到的是同一份脚本，改动写得回去、看得见，一局能接着上次继续                               | 脚本作者"改一版立刻试、调好就落地"的闭环真的闭上                   | 代码编目 2026-09-28               | Epic F    |
| 已拆成 epic | 咨询师用拖拽和配置搭出咨询骨架，手写的只有提示词；写错立刻知道                                                     | 领域专家自己能搭、能改一个咨询流程，不用每次找工程师               | 代码编目 2026-09-28               | Epic G    |
| 已拆成 epic | 项目版本切来切去有据可依，且不丢东西                                                                               | 调试期反复切版本对比是常态；这个能力不可靠，整条编辑器路子就站不稳 | 代码编目 2026-09-28               | Epic H    |
| 已拆成 epic | 来访者中途走了，下次回来接着上次那句话往下谈                                                                       | 一次咨询能被拆成很多次——做不成，就只能一口气谈完                   | 代码编目 2026-09-28               | Epic I    |
| 未拆        | 咨询动作的智能提升：退出判断、策略调整（含"运行时由 LLM 动态调整动作脚本"）                                        | 咨询动作从"能跑"到"跑得准"                                         | 会话 2026-09-28                   | —         |
| 未拆        | 咨询师口述经验，由 LLM 生成咨询脚本                                                                                | 咨询师不必先学脚本写法——"计划"能力                                 | 会话 2026-09-28                   | —         |
| 未拆        | 面向来访者的咨询产品：咨询界面、登录与权限、脚本导入导出                                                           | 从"编辑器自用"走到"能给来访者用"                                   | 代码编目 2026-09-28 §三           | —         |

## 就绪故事（Ready）

### Epic A · 记忆主线 —— 记忆系统收尾与封板

> 来源意图：意图区「记忆系统收尾与封板」

| 状态        | 类型           | 故事                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 关联                                                                                                                                                                                                                                                                          |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| done        | [feature]      | Hindsight 记忆集成收尾验证：跑通 verify-mental-model.ts，确保对 docker 后端全绿                                                                                                                                                                                                                                                                                                                                                                                                   | [004 ADR](../design/decisions/004-memory-model-calibration.md) · scripts/verify-mental-model.ts                                                                                                                                                                               |
| in-progress | [intelligence] | ai_ask 快通道实现：每轮 recall + 分层 memoryContext（baseline/fastHits/deepInsights）+ 分段渲染                                                                                                                                                                                                                                                                                                                                                                                   | [ai_ask 记忆调用 §3/§6](../design/memory/ai-ask-memory-recall.md) · [006 ADR](../design/decisions/006-retrieval-layer-scope.md) · [008 ADR](../design/decisions/008-ai-ask-judgment-field.md) · **归另一个 session**（图纸由它封板，实现由它接着走；本表只登记，不排 sprint） |
| backlog     | [intelligence] | 三路查询实证：类似/关联事件视角的命中率对比验证（默认关闭，证据通过才开启）                                                                                                                                                                                                                                                                                                                                                                                                       | [记忆调取机制 §2.11](../design/memory/memory-retrieval-types.md) · 006 ADR 决策 2                                                                                                                                                                                             |
| backlog     | [intelligence] | 慢通道实现：insightForSlowThinking 触发 → 两阶段深度检索 → DeepInsight 注入                                                                                                                                                                                                                                                                                                                                                                                                       | [意识系统 §2.6](../design/consciousness/consciousness-system.md) · 006 ADR 决策 4 · [ai_say 三线旧稿](../../docs-archive/misc/ai_say智能实现机制.md)                                                                                                                          |
| backlog     | [intelligence] | require 收集紧迫度核实：在 exit-decision 上下文中评估是否重新设计                                                                                                                                                                                                                                                                                                                                                                                                                 | 006 ADR 决策 6                                                                                                                                                                                                                                                                |
| backlog     | [feature]      | recall 取回接线与实证：① 实体态进**实体备忘**（§4.1）——每轮都取（端口补 `maxEntityTokens`）、按 `canonical_name` upsert 成备忘（会话内保留、上限 10 份、每份留最近 5 条、按末次提及淘汰），**渲染只在"这一轮提到它"时**（判定字段写了专名，或字面扫到备忘里已有的名字），**不额外发检索**；② 开 `preferObservations`（概要优先于原始片段，`sourceFactIds` 留展开路径）；③ 实证：写时实体质量与 observations 颗粒度（附 C.6 四处待实证）、开关对"事"类召回的影响（需 docker 后端） | [ai_ask 记忆调用 §4.1 / 附 C.1 / 附 C.6](../design/memory/ai-ask-memory-recall.md) · `hindsight-adapter.ts`                                                                                                                                                                   |

### Epic B · 议程主线 —— 意识层与话题队列

> 来源意图：意图区「议程主线落地」

| 状态    | 类型           | 故事                                                 | 关联                                                                                                                                                                                                                                             |
| ------- | -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| backlog | [intelligence] | 意识层触发机制实现（不变量三：意识为唯一队列修改者） | [意识系统](../design/consciousness/consciousness-system.md) · [话题单元建模](../design/topic/topic-unit-modeling.md) · [两阶段 LLM 旧稿](../../docs-archive/architecture/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md) |
| backlog | [feature]      | 议程（话题队列）运行时实现                           | [议程实现机制](../design/topic/topic-queue-implementation.md) · [DDD 战术设计旧稿](../../docs-archive/domain/Story-2.2-Topic动态展开Action队列-DDD战术设计.md)                                                                                   |
| backlog | [feature]      | session-intelligence guardian 实现                   | docs/superpowers/specs · 相关设计                                                                                                                                                                                                                |

### Epic C · 节奏系统主线 —— 工具与流程建设

> 来源意图：意图区「节奏系统固化」

| 状态    | 类型      | 故事                                                                                                                                                                        | 关联                                                                              |
| ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| done    | [design]  | 文档地图与索引归位：立 `docs/README.md`（哪类文档住哪、谁是权威、下一个读者是谁）、补 `reference/` 与 `superpowers/` 的 README、ADR 注册表落表、消灭 CLAUDE.md 的第二份索引 | [文档地图](../README.md) · [设计文档状态索引](../design/README.md)                |
| ready   | [design]  | 过程产物退场规则：在节奏系统 §7/§8 补 spec/plan 的完成与归档规则（做完标 done、被取代标 superseded、失效搬 docs-archive），据此给存量过程文档补状态                         | [开发节奏系统](../process/development-rhythm.md) §7/§8 · [文档地图](../README.md) |
| backlog | [feature] | 把开发节奏编码为 Claude Code 项目 skill（六步流程/四选一收敛/封板规则）                                                                                                     | [开发节奏系统](../process/development-rhythm.md)                                  |

### Epic D · 变量-文档主线 —— 变量职责收缩与信息点文档落地

> 来源意图：意图区「变量职责收缩」

| 状态    | 类型           | 故事                                                                                                                                                                                                                                                         | 关联                                                                                                                              |
| ------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| ready   | [design]       | memory-framework + variable-memory-bridge 按 ADR 007 修订（职责边界、双路径收缩、autoRefresh 矩阵、迁移策略）；与 bridge v0.2.0 矛盾处以 007 为准（2026-09-09 人裁定）；补**写值红线**（本 topic 待收集且为空者不进 piggy 目标集）与 look-ahead 单跳限制记录 | [007 ADR](../design/decisions/007-variable-document-boundary.md) · [ai_ask 记忆调用 §2](../design/memory/ai-ask-memory-recall.md) |
| backlog | [intelligence] | 信息点文档机制实现：文档模板+数据区、映射装载（hydrate）与写回、版本与 provenance                                                                                                                                                                            | 007 ADR 决策 2/3/4/5                                                                                                              |
| backlog | [feature]      | 全局变量取消迁移：global.yaml、user_global_variables 表、三层作用域、存量脚本                                                                                                                                                                                | 007 ADR 决策 2                                                                                                                    |

### Epic E · 咨询动作主线 —— 三大基础咨询动作的主线能力

> 来源意图：意图区「三大基础咨询动作（收集 / 分析 / 传递）的主线能力成立」
> 分两层：**主线能力**（写下的能跑起来、能接进流程）在本 epic；**智能提升**（退出判断、策略调整）留给意图区那条 `未拆`。

| 状态    | 类型               | 故事                                                                                              | 关联                                                                                              |
| ------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ready   | [feature]          | ai_think 真的推演一步：调 LLM，结果写进脚本指定的变量，后续动作读得到                             | [CAP-04](../audit/capability-inventory.md) · [执行内核深挖](../audit/deep-dive-execution-core.md) |
| ready   | [feature]          | ai_ask 的追问循环有硬上限：缺省脚本也保证终止                                                     | [CAP-03](../audit/capability-inventory.md)                                                        |
| ready   | [feature]          | ai_say 的配置字段只有一个名字（编辑器 / YAML / 引擎三处同名）                                     | [CAP-02](../audit/capability-inventory.md) · [重复报告](../audit/duplication-report.md)           |
| backlog | [feature]          | ai_say 说完之后，等不等确认由脚本说了算（`require_acknowledgment` 现在面板有、落盘丢、schema 拒） | [CAP-02](../audit/capability-inventory.md)                                                        |
| backlog | [feature·回溯补录] | 领域专家写一份 YAML，就能把一次咨询交给引擎跑完                                                   | [CAP-01](../audit/capability-inventory.md)                                                        |
| backlog | [design]           | ADR：AI 输出的安全水位——拦截换话术，还是事后关键词告警                                            | [CAP-06](../audit/capability-inventory.md)                                                        |
| backlog | [feature]          | 按 ADR 落地安全机制（接上那两段死码，或删干净）                                                   | [CAP-06](../audit/capability-inventory.md)                                                        |

### Epic F · 调试闭环主线 —— 调好的东西真的落回脚本

> 来源意图：意图区「调试闭环」
> **本 epic 的里子**：调试时会临时改脚本、特别是提示词，改完立刻看 AI 回复的效果——**调好的那些改动要能保存回脚本文件**，不然调试白调。
> **回退是调试的常规动作，不是终点**：改提示词 → 重跑 → 看输出 → 不满意 → 回退再改 → 再看，直到提示词或配置项定得合理。**回退之后必须能接着跑**。
> **版本管理不在本 epic**：项目版本（`script_files` 快照、切版本、版本对比）归 Epic H。F 只管 `runId` 这条"一次尝试"的线。

| 状态    | 类型      | 故事                                                                                                                             | 关联                                                                                                                                                       |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ready   | [feature] | rerun-action 从 worktree 分支合并回主干                                                                                          | docs/superpowers/plans/2026-05-07-rerun-action.md · worktree-rerun-feature-continue · [脚本调试需求旧稿](../../docs-archive/misc/HeartRule脚本调试需求.md) |
| backlog | [feature] | 调试里调好的改动，落回编辑器那份脚本上——提示成功就等于真的变了                                                                   | [CAP-13](../audit/capability-inventory.md) · [调试深挖 N3](../audit/deep-dive-debugging.md)                                                                |
| backlog | [feature] | "这版改动写回去了没有"，用户看得出来                                                                                             | [CAP-13](../audit/capability-inventory.md) · [调试深挖 N4/N5](../audit/deep-dive-debugging.md)                                                             |
| backlog | [feature] | 接着上次那局调，不用每次从头开一局                                                                                               | [CAP-13](../audit/capability-inventory.md)                                                                                                                 |
| backlog | [feature] | 每条分支各存一套执行状态，能切回去接着跑                                                                                         | [CAP-16](../audit/capability-inventory.md) · [调试深挖 缺陷②](../audit/deep-dive-debugging.md)                                                             |
| backlog | [feature] | 分支选择器真的能用                                                                                                               | [CAP-16](../audit/capability-inventory.md) · [调试深挖 N1/N2/N11](../audit/deep-dive-debugging.md)                                                         |
| backlog | [feature] | 重跑不要把历史消息标错                                                                                                           | [CAP-10](../audit/capability-inventory.md) · [调试深挖 缺陷①](../audit/deep-dive-debugging.md)                                                             |
| backlog | [design]  | ADR：一条会话能不能同时活着多条分支——能切回某条旧分支接着往下跑，还是旧分支只作可看的历史记录；顺带给 `runId` 定个用户看得懂的名 | [CAP-16](../audit/capability-inventory.md) · [调试深挖 缺陷②](../audit/deep-dive-debugging.md) · 与 Epic I 的会话模型同题                                  |
| backlog | [feature] | 按 ADR 落地：回退之后能接着跑（同一点可以反复回退、反复试），每次试过什么配置留得住                                              | [CAP-16](../audit/capability-inventory.md) · [调试深挖 N1/N2](../audit/deep-dive-debugging.md)                                                             |
| backlog | [feature] | 重跑按当时那次用的模型配置来，不凭空写死 `deepseek`                                                                              | [CAP-16](../audit/capability-inventory.md) · [调试深挖 N6](../audit/deep-dive-debugging.md)                                                                |
| backlog | [feature] | 换一个 action 重开，不会带着上一个的模型配置                                                                                     | [CAP-16](../audit/capability-inventory.md) · [调试深挖 N6](../audit/deep-dive-debugging.md)                                                                |

### Epic G · 编辑主线 —— 写下的就是会生效的

> 来源意图：意图区「咨询师用拖拽和配置搭出咨询骨架，手写的只有提示词」
> **DSL 单一出处是本 epic 的地基**（它在编辑器里落地，不像原先设想的游离在外）。E 管引擎侧字段、G 管编辑器侧派生，按包切不按字段切。

| 状态    | 类型               | 故事                                                                                   | 关联                                                                                       |
| ------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| backlog | [feature]          | 编辑器的脚本模型从引擎派生：删掉死的那套词汇，活的那套不再手抄                         | [CAP-11](../audit/capability-inventory.md) · [重复报告 一](../audit/duplication-report.md) |
| backlog | [feature]          | 拖拽换序不搬错元数据                                                                   | [CAP-11](../audit/capability-inventory.md)                                                 |
| backlog | [feature]          | 菜单里能选的动作类型，引擎都跑得起来（`use_skill`/`show_form`/`show_pic`：接了或撤了） | [CAP-11](../audit/capability-inventory.md)                                                 |
| backlog | [feature]          | 面板里配的字段，落盘不丢                                                               | [CAP-11](../audit/capability-inventory.md)                                                 |
| backlog | [feature]          | 校验报错指到位置（行号）                                                               | [CAP-12](../audit/capability-inventory.md)                                                 |
| backlog | [feature·回溯补录] | 直接编辑 YAML 文本，边写边校验                                                         | [CAP-12](../audit/capability-inventory.md)                                                 |

### Epic H · 项目与版本主线 —— 切来切去不丢东西

> 来源意图：意图区「项目版本切来切去有据可依，且不丢东西」
> 本 epic 含原 Epic F 的目标 2（版本对比与切换）——版本能力只有一个家。

| 状态    | 类型      | 故事                                                                               | 关联                                                                                    |
| ------- | --------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| backlog | [design]  | ADR：切版本时，当前工作区怎么办（自动存现场 / 要求先发布 / 别的）                  | [CAP-14](../audit/capability-inventory.md) · [平台深挖](../audit/deep-dive-platform.md) |
| backlog | [feature] | 按 ADR 落地：切版本不丢文件（发布快照带全字段 `filePath`、切前存现场、删除可回溯） | [CAP-14](../audit/capability-inventory.md)                                              |
| backlog | [feature] | 两个版本摆一起，看得出差在哪                                                       | [CAP-14](../audit/capability-inventory.md)                                              |
| backlog | [feature] | 切版本前有未发布改动时给警告（`VersionListPanel` 那个从未传过的 prop 接上）        | [CAP-14](../audit/capability-inventory.md)                                              |
| backlog | [feature] | 项目元信息在界面上能改（改名 / 描述 / 标签）                                       | [CAP-17](../audit/capability-inventory.md)                                              |
| backlog | [feature] | 建项目时选的方案算数（不用在会话属性面板再选第二次）                               | [CAP-05](../audit/capability-inventory.md)                                              |
| backlog | [feature] | 撤销草稿表：工作区以 `script_files` 为准（界面那个假的"草稿时间戳"改读对地方）     | [CAP-14](../audit/capability-inventory.md)                                              |

### Epic I · 会话运行时主线 —— 接着上次那句话往下谈

> 来源意图：意图区「来访者中途走了，下次回来接着上次那句话往下谈」
> **主目标是用户价值（对话级断点、入口一致）；并发与幂等是支撑的非功能需求，排在后面。**

| 状态    | 类型      | 故事                                                                              | 关联                                                                                                                            |
| ------- | --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| backlog | [design]  | ADR："接着那一轮"是重发那一轮还是等用户先开口                                     | [CAP-07](../audit/capability-inventory.md) · [会话状态深挖](../audit/deep-dive-session-state.md) · 会话模型同题见 Epic F 的 ADR |
| backlog | [feature] | `position` 类型补上轮次（现在是 `as any` 写进去、schema 类型没有，前端 9 处在读） | [CAP-07](../audit/capability-inventory.md) · [会话状态深挖](../audit/deep-dive-session-state.md)                                |
| backlog | [feature] | 下次回来，接着上次那句话往下谈（不是重开那个动作）                                | [CAP-07](../audit/capability-inventory.md)                                                                                      |
| backlog | [feature] | 两个入口对同一件事表现一致（`prevVariableSnapshots` 现在一个恒空、一个正常）      | [CAP-07](../audit/capability-inventory.md)                                                                                      |
| backlog | [design]  | 恢复语义写成机制文档（`fromSessionData` 合并顺序、superseded 过滤、四桶回填）     | [CAP-07](../audit/capability-inventory.md) · 红线 A6                                                                            |
| backlog | [feature] | 发消息幂等：重复请求不多出一条用户消息                                            | [CAP-07](../audit/capability-inventory.md)                                                                                      |
| backlog | [feature] | 同会话并发不打架（锁或乐观并发）                                                  | [CAP-07](../audit/capability-inventory.md)                                                                                      |
| backlog | [feature] | 配了哪家就是哪家（provider 别名不把 DeepSeek 静默指向火山）                       | [CAP-15](../audit/capability-inventory.md)                                                                                      |

### Epic J · 混乱收口 —— 说出口的与代码里的一致

> 来源意图：意图区「代码-文档一致性收敛」（2026-09-27 审计 + 编目 2026-09-28）
> **覆盖范围**：[混乱地图](../audit/mess-map.md) 64 条里**没有归宿的 55 条**（51「否」+ 4「X」）。其余 9 条早有家：3 条已进 C/B/D，6 条「部分」随原意图走。
> **做事顺序**：先修**有用户影响的**——对外文档说错事实（E 类口径失真 13 条，全部是根 README / CLAUDE.md / AGENTS.md / 指南在说假话，谁读谁被误导）；其余 42 条**不逐条开故事**，一次性定归宿（直接改 / 拆故事 / 明确弃 / 归档）。
> 修复的验收口径是"读者照做能走通"，不是"文件被打开过"。

| 状态    | 类型      | 故事                                                                                                                                                      | 关联                                                                                                                                   |
| ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| backlog | [feature] | 根 `README.md` 不再说谎：完成度一节（前端"0%"、11 个端点、15 个测试）、项目目录树、服务端口、"六大引擎"含三个不存在的引擎                                 | [E-01/02/03/06](../audit/mess-map.md) · [CAP-01](../audit/capability-inventory.md)                                                     |
| backlog | [feature] | `CLAUDE.md` 与 4 篇 `AGENTS.md` 对齐事实：`SessionManager` 已不存在（现为 `SessionOrchestrator`）、schema 是单文件、推荐的技能名已改名                    | [E-04/05/07](../audit/mess-map.md)                                                                                                     |
| backlog | [feature] | 死引用与过期索引清一遍：`_system/README.md` 三处死引用 + 不存在的物理路径、`docs-archive/README.md` 自身过期、`DEV_START_GUIDE.md` 端口写反、两份索引漏项 | [E-08/10/11/13](../audit/mess-map.md)                                                                                                  |
| backlog | [feature] | `docs/ddd/strategic-design.md` 的整改清单与代码现状对齐（M4 称"没有 `application/` 目录"，实际已存在）                                                    | [E-12](../audit/mess-map.md) · [MESS-D-05](../audit/mess-map.md)                                                                       |
| backlog | [design]  | 其余 42 条逐条定归宿，出一份「编目项 → 归宿」对照表：直接改 / 拆故事 / 明确弃 / 归档                                                                      | [mess-map](../audit/mess-map.md) 51「否」+ 4「X」 · 含 `.qoder/` 20+ 处死引用的取舍、`application/` 三个并行目录（DDD 计划 Phase 1.4） |

## 智能设计议题（Exploration）

> 智能思路讨论的沉淀区。机制文档与 ADR 落在 `docs/design/`，此处仅留探索项。每次讨论必须收敛为机制文档 / ADR / spec / backlog 故事（四选一）；未收敛前以探索项留此，注明未决问题。

| 议题                       | 未决问题                                                                                                                       | 备注                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 意识层与主线引擎的接缝协议 | 触发检测（矛盾/情绪）到队列修改之间的具体事件契约                                                                              | 设计 active，检测定义已落 commit；属 Epic B · [Action/Topic 职能边界](../design/topic/action-topic-boundary.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 信息点跨文档引用关系       | 同一信息点被多份文档引用时，权威处与引用处的同步机制（引用语义、更新传播、冲突）                                               | ADR 007 决策 2 备注，待设计                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 咨询方案文档化             | 咨询方案（§2.4）是否改为信息点文档形态替代 treatment_plans 表；信息点是否需支持列表值                                          | ADR 007 遗留，随 Phase 3 解决                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 文档形态语法细化           | 笔记型 markdown+frontmatter 与表单型 HTML 模板+JSON 实例的具体语法、渲染、消毒                                                 | ADR 007 决策 2 留扩展                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 连发拼接还必要吗           | 先拼成一条的理由（「否则指代落在后几条会被漏掉」）是规则路径的说法；判定并入生成后还必要吗、留给谁（判定行的输入还是固定拼法） | [ai_ask 记忆调用 附 A.2 案例 9](../design/memory/ai-ask-memory-recall.md)；2026-09-15 挂，实现时收                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 反问轮走哪个 move          | 默认模板的 `话术调整策略` 七行里没有"用户反问"这一行——用户直接要方案时，框架该给建议、该先澄清，还是该把它当材料谈？           | [ai_ask 记忆调用 §3.5](../design/memory/ai-ask-memory-recall.md)；记忆侧已定"判据只看缺不缺窗口外事实"，move 本身归模板侧（Default 模板 `config/prompt-defaults/ai_ask_v1.md`）；2026-09-16 挂；**2026-09-24 实测（DeepSeek ×14，先澄清支）**：默认模板下案例 12 的 `block` 支**低频自发但不自洽**——14 发：11 落 12-a 的 `none`、2 发判反（字段说要引既往、正文还是探询，≈14%）、1 发 `defer`；第三批 5 发的 `response_plan` 全是「不知道」而档位分三种。支点须落模板层——判别实验见[夹具 §六 案例 9](../design/memory/fixtures/ai-ask-judgment-prompt-fixture.md) |

## 已关闭（Done）

| 故事                                                                                           | 关闭日期   |
| ---------------------------------------------------------------------------------------------- | ---------- |
| [feature] 建立开发节奏系统 + Sprint 0 恢复                                                     | 2026-08-15 |
| [design] memory-retrieval-types 封板（active → decision-recorded，006 ADR）                    | 2026-09-09 |
| [design] ai-ask-memory-recall 封板（active → decision-recorded，006 ADR）                      | 2026-09-09 |
| [design] ai-ask-memory-recall 二次封板（draft → decision-recorded，008 ADR；09-19 曾退回收敛） | 2026-09-29 |
