# 深挖报告：调试与迭代簇（CAP-10 / CAP-13 / CAP-16）

> 波次 2 · S1' 能力深挖 · 只读审计
> 方法：静态代码追溯 + git 历史定点考古（`git log -L`）+ 设计文档对照。
> **未实跑任何功能**（重跑会真实调用付费 LLM）。所有结论均为静态推导，标注了推导所依赖的每一环代码位置。
> 实现程度口径：**按「用户能用到什么」算**。三档：端到端可用 / 部分可用（写清缺口）/ 桩或不可达。

---

## 一、CAP-10 人工介入：改变量 / 从某动作重跑 / 回滚 / 旧消息标记为「已被取代」

### 1.1 实现程度：**部分可用**

三条用户动作各自都能走通，但「已被取代」这条机制存在一个**静默的错标缺陷**（见 §四·缺陷①）：

| 用户动作                   | 入口                                                                                                                                          | 状态                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 改一个变量                 | `PATCH /api/sessions/:id/variables`（`routes/sessions.ts:709-783`）→ `orchestrator.updateVariable`                                            | 端到端可用，但 `executionStatus` 为 `COMPLETED`/`ERROR` 时被拒（`routes/sessions.ts:717-724`，HTTP 400 + 消息 `SESSION_ENDED`）                                                                                   |
| 从某动作重跑               | `POST /api/sessions/:sessionId/rerun`（`routes/sessions.ts:819-888`）→ `SessionOrchestrator.rerunAction`（`session-orchestrator.ts:533-669`） | 端到端可用。但重跑**必然续跑后续 action**——`executeScript(script, sessionId, session, null)`（`session-orchestrator.ts:653`）从目标位置一路执行到下一个 `waiting_input`，用户无法「只重跑这一个 action 然后停下」 |
| 回滚到更早的动作           | 前端 `NavigationTree` 的「回退到此」（`NavigationTree.tsx:221`）→ 同一个 rerun 路由                                                           | 端到端可用，但只在 `actionSnapshots?.[action.actionId]` 存在时按钮才出现（`NavigationTree.tsx:221`）——即只能回退到**本会话已经进入过**的 action                                                                   |
| 旧消息自动标记「已被取代」 | `flagSupersededMessages`（`session-repository.ts:412-442`）                                                                                   | **机制存在，语义有缺陷**：把「活跃消息数」当成「全表行号」用，见 §四·缺陷①                                                                                                                                        |

另一个口径缺口：重跑按钮 `🔄 重运行` 只在 `isCurrentAction && executionStatus === 'waiting_input'` 时渲染（`NavigationTree.tsx:204`）——**`ai_say`/`ai_think` 当前动作或会话已结束时，没有「重跑当前 action」入口**，只能走「回退到此」。

### 1.2 涉及的领域概念

| 概念              | 战略级 / 战术级               | 代码位置                                                                                     | 权威归属                                                                                 |
| ----------------- | ----------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Session`         | 战略级（唯一聚合根）          | `core-engine/src/domain/session.ts`                                                          | 权威——`fromSessionData` / `toExecutionState` 是状态出入的唯一门户                        |
| `Position`        | 战术级                        | `db/schema.ts:66-68` `sessions.position`                                                     | 权威——重跑的唯一「回退点」表达                                                           |
| `actionSnapshots` | 战术级（未注册进 DDD 术语表） | `sessions.metadata.actionSnapshots`，类型 `ActionSnapshotMeta`（`script-executor.ts:45-58`） | 回退点的**唯一权威**。`rerunAction` 从它取 `variableStore` + `position` + `messageCount` |
| `rerunHistory`    | 战术级（未注册）              | `sessions.metadata.rerunHistory`                                                             | 只是**展示用版本列表**，不参与任何状态恢复                                               |
| `superseded`      | 战术级（未注册）              | `messages.metadata.superseded`                                                               | 消息可见性的**唯一权威**                                                                 |
| `runId`           | **无任何设计文档注册**        | `sessions.current_run_id`（`db/schema.ts:65`）+ `debug_entries.run_id`（`db/schema.ts:287`） | 见 §三                                                                                   |

**权威重叠检查（本题点名要求）**：`debug_entries` / `runId` / `rerunHistory` / `actionSnapshots` 四者没有重叠的写权限——

- `actionSnapshots` 是**执行状态**的权威（变量、位置、消息边界）；
- `rerunHistory` 是**配置版本**的权威（改了什么 prompt / LLM 参数）；
- `debug_entries` 是**LLM I/O** 的权威（每轮的提示词与回复）；
- `runId` 是 `debug_entries` 的**分区键**，同时也是 `sessions` 上的一个**单值游标**。

四者按「状态 / 配置 / I-O / 分区」正交切分，**没有双权威**。真正的重叠出现在**同一个字段被两个消费者按两种语义读**——`actionSnapshots[x].messageCount`（见 §四·缺陷①），这才是本簇的病灶，且它是**名实分离**类（mess-map 的 C 类），不是双权威类。

### 1.3 对应设计文档

本簇**没有**专属设计文档。相关的只有三处顺带提及：

- `docs/ddd/strategic-design.md:269` —— 把「rerun 逻辑」列为 `SessionOrchestrator` 六大职责之一，并判为 **M1 职责过重**（Medium 级问题）。代码至今未拆分：`rerunAction` 仍在 `session-orchestrator.ts` 内。
- `docs/ddd/strategic-design.md:296-312` —— **m1/m2 直接预言了缺陷①**：
  - m1：`actionSnapshots`、`rerunHistory` 都是 `Record<string, any>`，**关键字段没有类型约束**；
  - m2：`ActionSnapshotMeta` 接口已在 `script-executor.ts` 定义，但 orchestrator 没有复用，改用 `as Record<string, any>` 断言（"位置: session-orchestrator.ts L354"）。
  - 这两条的类型松弛，正是 `messageCount` / `conversationHistoryLength` 两个字段可以被随意互换、从而藏住缺陷①的原因。
- `docs/ddd/contexts/consulting-session.md:19` —— 只把 `actionSnapshots`、`rerunHistory` 列为 `metadata` 的成员，没有给出语义。

对齐两份旧草稿（问题 3）：

| 旧草稿的承诺                                                                                                       | 代码交付                                                                                                                 | 差距                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs-archive/misc/HeartRule脚本调试需求.md`：web 侧即时改提示词 + 「重运行当前 action」                           | 交付（`RerunModal` 可编辑 prompt/tone/max_rounds，`POST rerun`）                                                         | 无                                                                                                                                                                                                                                                                                                                               |
| 同上：快照可存可取                                                                                                 | 交付（每个 action 进入时自动快照，`script-executor.ts:1001-1010`）                                                       | **手动「生成快照」按钮未实现**（全仓无第二处 snapshot 写入点）                                                                                                                                                                                                                                                                   |
| 同上：快照命名 `[来访者名]-[session名]-[stage名]-[goal名]-[时间]`                                                  | **未实现**——快照以 `action_id` 为键存在 `metadata` 里，没有名字、没有时间轴视图                                          | 没做                                                                                                                                                                                                                                                                                                                             |
| 同上：快照内容含 用户id/咨询师id、当天聊天记录 + 摘要、全局/session/stage/goal 变量、forms、当前 action 类型与内容 | **部分**——`variableStore` ✔（`script-executor.ts:1002-1004`）、`originalConfig` ✔（`:1008`）、消息由 `messages` 表恢复 ✔ | 用户/咨询师 id ✘、聊天摘要 ✘、forms ✘                                                                                                                                                                                                                                                                                            |
| 同上：**第 7 步「将调试好的 action 内容 copy回 yaml 文件」是人工动作**                                             | 部分——自动化了（写回接口存在），但写错了表，见 §二                                                                       | **做了但接不上**                                                                                                                                                                                                                                                                                                                 |
| 同上：跨天恢复（场景 3）                                                                                           | **未实现**——没有任何按 `runId` 或按快照恢复执行的路径（见 §三·3.2）                                                      | 没做                                                                                                                                                                                                                                                                                                                             |
| 同上：**分支/分叉概念**                                                                                            | 原文全文无此概念                                                                                                         | 不适用（CAP-16 是后加的需求）                                                                                                                                                                                                                                                                                                    |
| `docs/superpowers/plans/2026-05-07-rerun-action.md`：11 个任务                                                     | 交付 1-10（含偏差）                                                                                                      | 偏差：① Task 4 规定**级联 DELETE** `gt(messages.id, snapshot.messageCount)`，shipped 改为 **FLAG superseded**；② Task 3 注明 `messageCount` 由 `SessionManager` 在 `updateSessionState()` 补齐，shipped 改由引擎在快照创建时写入（`565c448`，2026-05-11）——**这一改动正是缺陷①的成因**；③ Task 11（人工 E2E 验证）无任何完成记录 |

### 1.4 缺口分类

**没做**：手动快照按钮；快照命名与内容清单（来访者/咨询师 id、聊天摘要、forms）；跨天/跨运行恢复执行。

**做了但接不上**：写回路径（见 §二）；`rerunHistory.result`（轮数/退出原因）只写不读，前端仅做 tag 展示。

---

## 二、CAP-13 调试台：不部署就能真跑一遍脚本

### 2.1 实现程度：**部分可用**（主链路端到端可用；写回环节断裂）

主链路用户确实能走通：

1. 从编辑器发起调试 → `DebugConfigModal`（`DebugConfigModal/index.tsx:151-184` 取版本内容）→ `debugApi.importScript`（`:199-203`）→ `POST /api/scripts/import`（`routes/scripts.ts:172-303`）→ 得到 `scriptId`（`:211`）
2. 建调试会话 → `debugApi.createDebugSession`（`:216-223`）→ `POST /api/sessions` 类接口
3. 与 AI 对话 → `sendDebugMessage`（`api/debug.ts:233`）→ 每轮真实调用 LLM
4. 看每轮提示词与回复 → `debug_entries` 表 + `DebugEntryBubble` V2（`DebugChatPanel/index.tsx:362-415` 组装 `DebugBubbleV2`）
5. 把调好的配置写回脚本 → **断裂**，见下

**断裂点（新发现 N2）**：写回写进了**另一张表**。

- 调试会话用的脚本来自 `importScript`，它 upsert 的是 **`scripts` 表**（`routes/scripts.ts:172-303`，`repo.findByName` → `repo.update`/`repo.create`）；
- 写回接口 `POST /api/scripts/:scriptId/actions/:actionId/config` 也写 **`scripts.scriptContent`**（`routes/scripts.ts:442-443`）；
- 而编辑器的工作文件是 **`script_files` 表**，全仓仅有两处写入：`project-repository.ts:246`、`:390`。

结论：**回写成功了，但编辑器里看不见**；用户点「继续调试」时 `ProjectEditor/index.tsx:703` 会拿 `targetFile.yamlContent`（即 `script_files` 的旧内容）重新 `importScript`，把刚写回的 `scripts` 行**覆盖掉**。这条链路对用户表现为「回写按钮提示成功，但脚本文件没变，再调一次又回到原样」。这正是旧需求文档第 7 步（人工 copy 回 yaml）的半成品自动化。

### 2.2 涉及的领域概念

`debug_entries` 表（`db/schema.ts:275-303`）是本簇唯一的**新增持久化概念**，定义了一套「按 phase-topic-action-round 定位，支持多 run 分支」的坐标（`:277` 注释）。它把「一次 LLM 调用」固化成一个可检索的记录，键为 `(sessionId, runId, phaseId, topicId, actionId, round)`（`:288-297`）。

**但它在 `docs/` 中零注册**：`grep -rn "debug_entries\|debugEntries\|DebugEntry" docs/ | grep -v audit` 返回**空**。同样 `runId` / `run_id` / `currentRunId` 在 `docs/`（排除 audit）中也**零命中**。

即：CAP-13/CAP-16 的核心数据模型是**纯战术级、无设计文档背书**的产物。它既不违反任何封板文档（因为没文档），也无法从设计文档推导出它的语义——读者只能从代码反推。这一点应作为后续补 ADR 的输入。

### 2.3 对应设计文档

`docs/design/` 下**没有**调试台/重跑相关文档（`docs/design/` 目录内容为 `README.md, consciousness, decisions, foundation, memory, topic`）。唯一实质性关联是 `docs/design/memory/memory-framework.md`——它**不是**调试文档，但为调试机制提供了底层依据，且 `status: decision-recorded`（**已封板**）：

- `memory-framework.md:345`：「**messages 表是 ground truth**……重跑和调试从它恢复」。代码符合：`restoreSession` 确实从 `messages` 表重建 `conversationHistory`。
- `memory-framework.md:340`（**关键**）：「**重跑依赖细粒度。** `flagSupersededMessages(position)` **按 action 位置精确废弃消息**。」
  - 封板文档把该函数的参数命名为 **`position`**，语义是「按 action 位置」；
  - 代码的形参是 `fromMessageIndex: number`（`session-repository.ts:412`），实际被传一个**消息计数**；
  - 这个语义漂移发生在封板文档之后，**且未被任何文档记录**。缺陷① 因此不仅是实现 bug，也是「实现与封板文档相矛盾」——按 CLAUDE.md 第三条约定，属于应当修订设计文档或修正实现的情形。
- `memory-framework.md:1100-1106`、`:1190`：把 `superseded 重跑` 与 `actionId 追溯` 列为 `messages` 表「一回合一条」粒度的理由。这是 CAP-16「每条分支各存一套完整记录」在设计上的唯一伏笔。

### 2.4 缺口分类

**没做**：调试台的会话复用（每次「继续调试」都新建 `scriptId` + 新会话，`ProjectEditor/index.tsx:703-707`，无法回到一次已存在的调试会话）；`debug_entries` 的导出/对比视图。

**做了但接不上**：写回路径（写错表，见 2.1）；`DebugConfigModal` 按 `fileName` 匹配版本文件而非 id（`DebugConfigModal/index.tsx:151-184`），重名文件会取错内容。

---

## 三、CAP-16 调试可以分叉

### 3.1 实现程度：**部分可用**（记录层分叉成立，执行层分叉不可达）

分叉在**记录层**确实成立：每次 rerun 生成新 `runId`（`session-orchestrator.ts:609` `const newRunId = uuidv4();`），`debug_entries` 的 upsert 键含 `runId`（`session-repository.ts:576-606`），所以**旧分支的 LLM 记录不会被覆盖**，`getDebugEntries` 可按 `runId` 取出（`session-repository.ts:779-795`，路由 `routes/sessions.ts:387-423` 支持 `?runId=`）。

但用户能做的「分叉」只有记录层：

| 承诺                         | 实际                                                                                                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 同一次调试里试不同写法       | ✔ 用户可在 `RerunModal` 改 prompt 后重运行（`RerunModal/index.tsx:107-128`）                                                                                                                                                           |
| 每条分支各存一套**完整**记录 | ✘ 只有 `debug_entries`（LLM I/O）分支独立；**执行状态不独立**——`actionSnapshots` 被就地截断覆盖（`session-orchestrator.ts:591-597`），`rerunHistory` 同样被截断（`:603-607`），`sessions.current_run_id` 只存最新（`db/schema.ts:65`） |
| 可切着对照                   | △ 有入口但**几乎不可达**，且只对照 LLM I/O，不对照消息（见 §五·N1、N10）                                                                                                                                                               |

### 3.2 「旧分支记录留着但回不去继续跑」是否准确：**准确**

逐条给出「回不去」的证据——穷举了所有可能回到旧分支的路径：

1. `actionSnapshots` 就地覆盖：`session-orchestrator.ts:591-597` 只保留 `allActionIds.slice(0, targetIdx + 1)` 的快照，`targetIdx` 之后的全部丢弃，且写入的是**新的** `newSnapshots` 对象（`:611-619` 的 `restoredMetadata.actionSnapshots = newSnapshots`）→ 旧分支之后的回退点永久消失。
2. `rerunHistory` 同样被过滤（`:603-607`）→ 旧分支的配置版本条目也被丢弃。
3. `current_run_id` 是单值 `varchar(50)`（`db/schema.ts:65`），且只有两个写入点：`setSessionRunId`（`session-repository.ts:328-333`，**仅被 `initializeSession` 调用**）和 `updateSessionForRerun`（`:357-374`，**总是覆盖为新 runId**）→ 没有任何「切回旧 runId」的写路径。
4. `rerunHistory` 条目里带了 `runId`（`session-orchestrator.ts:161`，`addRerunVersion`），但**全仓无任何消费者**：`grep -rn "entry.runId\|version.runId\|e.runId"` 只命中 `debug_entries` 自己的字段（`DebugChatPanel/index.tsx:399/414/419/470` 全部是 `debugEntries` 的 `entry.runId`，不是 `rerunHistory` 的）。即 `rerunHistory.runId` 是**只写不读**的死字段。
5. 路由层没有任何接口接受 `runId` 来**驱动执行**——`runId` 只作为 `GET /debug-entries` 的查询条件出现（`routes/sessions.ts:387-423`）。

因此：**旧分支的 LLM 记录可看不可续**，「回不去继续跑」成立。用户能做的替代动作是「回退到此」——但那会**新建**一个 `runId`，属于开新分支，不是回到旧分支。

### 3.3 缺口分类

**没做**：执行状态的分支隔离（每个分支各存一套 `actionSnapshots` / `rerunHistory` / messages）；从旧 `runId` 恢复执行；分支命名/删除/对比视图。

**做了但接不上**：分支选择器（§五·N1）；`rerunHistory.runId` 死字段。

---

## 四、缺陷查证单

### 缺陷① 「重跑的第二次错标消息」

**结论：现象成立；`capability-inventory.md` §4.3 给出的因果链被推翻。**

#### (a) 前半段：`executionState.conversationHistory` 只含活跃消息 —— **成立**

- `restoreSession()`（`session-orchestrator.ts:65-102`）用 `Session.fromSessionData(...)` 构造，其 `conversationHistory` 来自 `loadConversationHistory(sessionId)`；
- `loadConversationHistory`（`session-repository.ts:180-205`）显式过滤：`:186-188` `!((m.metadata as Record<string,any>)?.superseded === true)`；
- 本次请求中新产生的条目由 `Session.conversationHistory.push(entry)`（`domain/session.ts:176`）在内存追加。
- ⇒ `conversationHistory.length` = **活跃消息数**。

#### (b) 后半段：`flagSupersededMessages` 按全表行号切片 —— **成立**

- `session-repository.ts:413-417` 的查询**没有任何 superseded 过滤**（`select({id}).from(messages).where(eq(sessionId)).orderBy(messages.timestamp)`）；
- `:421` `const idsToFlag = allMessages.slice(fromMessageIndex).map((m) => m.id);` —— 参数被当作**全表排序后的行号**。
- ⇒ 同一字段两种语义，**成立**。

#### (c) 回填分支 `session-repository.ts:456-468` 何时触发 —— **正常路径永不触发**（对当前引擎产出的快照）

回填的守卫是 `:461` `if (snapshots[key].messageCount === undefined)`。而 `script-executor.ts:1006` 在**创建快照时无条件写入** `messageCount: executionState.conversationHistory.length`。

git 考古定论：

```
565c448 (2026-05-11) "feat: consolidate debug output into unified V2 DebugEntryBubble"
  → 在 script-executor.ts:1006 加入 messageCount
b38d9a0 (2026-05-17) "refactor: wire Session into api-server, remove SessionManager facade"
  → 在 session-repository.ts:456-468 加入回填
git merge-base --is-ancestor 565c448 b38d9a0  →  真（565c448 是 b38d9a0 的祖先）
```

后加入的回填，其触发条件已被先加入的写入**永久满足**（`messageCount` 从不是 `undefined`）。全仓也**没有任何删除 `messageCount` 的代码**。

⇒ **§4.3 声称「`getMessageCount()` 是生效的那个定义」是错的。** 实际生效的永远是 `session-orchestrator.ts:600` 的第一个分支 `snapshot.messageCount`（`:600` `(snapshot.messageCount as number) ?? (snapshot.conversationHistoryLength as number) ?? 0`）。两个定义**从不同时生效**——但缺陷不因此消失，因为生效的那个值**本身就是错的类型**（活跃数被当全表行号）。

> 附注（不影响结论，但值得记）：即便回填真的触发，它取的也是**请求结束时**的行数——`persistSession` 在 `saveNewAIMessagesFromSession` **之后**调用（`session-orchestrator.ts:657` → `:659`；`processUserInput` 中同序 `:412` → `:414`），所以 `getMessageCount()` 返回的是「已包含本轮新消息」的行数，比正确边界**偏大**。这与 `flagSupersededMessages` 的「按 `timestamp` 排序取行号」也不自洽（行数与时间序在 `timestamp` 并列时不等价）。这是一条**被掩盖的第二重错误**，因回填不触发而无从暴露。

#### (d) 时序推演（明确可观测症状）

**关键判据**：快照创建的那一刻，若全表已存在 superseded 行，则写入的 `messageCount`（活跃数）就小于正确行号，偏差量 = **快照创建时全表已有的 superseded 行数**。

**首次重跑永远正确**（首次重跑前无 superseded 行，两值相等）；**重跑同一个 action 也恰巧正确**（该快照创建于会话开头，`messageCount` 为 0，而正确地就是「从 0 开始全标」）。**错误只在「快照创建于已有 superseded 行之后、且其后又被当作重跑目标」时出现**。最常见的触发链是「先回退到靠前的 action」→「后续 action 的快照被重建（旧快照已被 `:591-597` 丢弃）」→「再回退到那个后续 action」。

推演（脚本 `A: ai_say` → `B: ai_ask`，`A` 自动推进）：

| 步  | 动作                                                                                    | 全表（按 timestamp）          | 活跃        | 快照                                                                                            |
| --- | --------------------------------------------------------------------------------------- | ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| 1   | 初始化，进入 A                                                                          | `[]`                          | `[]`        | `sA.messageCount = 0`（正确：行号 0）                                                           |
| 2   | A 输出 → 推进到 B                                                                       | `[m1]`                        | `[m1]`      | `sB.messageCount = 1`（正确：行号 1）                                                           |
| 3   | B 提问、用户回复、B 再答                                                                | `[m1,m2,m3,m4]`               | 同左        | —                                                                                               |
| 4   | **回退到 A**：`msgCount = sA.messageCount = 0` → `slice(0)` → 全标                      | `[m1\*,m2\*,m3\*,m4\*]`       | `[]`        | `newSnapshots` 丢掉 `sB`（`:591-597`）                                                          |
| 5   | 重跑 A → 推进到 B → **B 重建快照**                                                      | `[m1\*,m2\*,m3\*,m4\*,m5,m6]` | `[m5,m6]`   | **`sB'.messageCount = 1`**（活跃数）——但此刻全表已有 **4 行 superseded**，正确行号应是 **5** ❌ |
| 6   | **回退到 B**：`msgCount = sB'.messageCount = 1` → `slice(1)` → 打掉 `m2*,m3*,m4*,m5,m6` | 6 行**全部** superseded       | **`[]`** ❌ | 正确应 `slice(5)` → 只打 `m6`，活跃应为 `[m5]`                                                  |

**第 6 步的错误后果**：`m5`（A 在当前分支的最新输出、且是**唯一**的活跃消息）被误标为 superseded。

**可观测症状**（全部静默，无报错）：

1. **AI 失忆**：`rerunAction` 在标记后重载历史（`session-orchestrator.ts:643` `loadConversationHistory(sessionId)`），得到**空历史**；重跑的 `B` 拿着空对话上下文去调 LLM ⇒ 用户看到 AI 像初次见面一样重新开场，而界面上什么都没报错。
2. **消息列表被清空**：前端 `messages` 状态来自 `debugApi.getDebugSessionMessages` → `GET /api/sessions/:id/messages`，该路由同样过滤 superseded（`routes/sessions.ts:358-360`）⇒ 调试面板里 `m5`、`m6` 的气泡消失。
3. **分隔线插入位置错乱**：`separatorUtils.insertSeparator` 在活跃消息数组上按 `snapshotMsgCount` 切片（`separatorUtils.ts:82-94`），活跃列表变化后分隔线落点与用户预期不符。
4. **记忆窗口漂移**：`retain()` 的窗口基于 `conversationHistory` 切片（`session-orchestrator.ts:366-370`），历史被截断 ⇒ 送进长期记忆的内容也跟着少一段。
5. 日志层面只有 `logger.debug`（`session-repository.ts:441` `🏷️ Flagged N messages...`）⇒ 默认日志级别下**完全无痕**。

**最坏情况**：偏差量随 superseded 行数累积；上表已展示偏差即可导致**全表 superseded、对话历史归零**。

#### 附：同一字段在两个消费者手里语义相反（缺陷①的根因，新发现 N7）

| 消费者                        | 位置                                                            | 期望语义         | 对 `sB'.messageCount = 1` 的解读                 |
| ----------------------------- | --------------------------------------------------------------- | ---------------- | ------------------------------------------------ |
| 后端 `flagSupersededMessages` | `session-repository.ts:421`                                     | **全表行号**     | 错（正确是 5）                                   |
| 前端分隔线 / 清理计数         | `DebugChatPanel/index.tsx:1463-1467`、`separatorUtils.ts:24-35` | **活跃数组下标** | **对**（活跃列表 `[m5,m6]`，B 的边界恰是下标 1） |

即：**写值的人（引擎）用的是活跃语义，后端消费者用的是全表语义，前端消费者用的是活跃语义**——三方中只有后端一家读错。修法因此是明确且局部的：`flagSupersededMessages` 应当接收「action 位置」并在**活跃消息序列**上切片（与封板文档 `memory-framework.md:340` 的 `flagSupersededMessages(position)` 一致），而不是在全表上切片。

---

### 缺陷② 「分支只在调试记录上成立」

**结论：成立（准确）。**

证据链见 §3.2 的五条穷举。要点复述：

- `session-orchestrator.ts:591-597` — `actionSnapshots` 就地截断覆盖；
- `session-orchestrator.ts:603-607` — `rerunHistory` 同步截断；
- `db/schema.ts:65` — `current_run_id` 单值；
- `session-repository.ts:328-333` / `:357-374` — runId 的两个写入点，都不支持「切回旧值」；
- `session-orchestrator.ts:161` — `rerunHistory[].runId` 只写不读，全仓无消费者；
- 路由层无任何以 `runId` 驱动执行的接口（`runId` 仅出现在 `GET /debug-entries` 的查询串，`routes/sessions.ts:387-423`）。

⇒ 「旧分支记录留着但回不去继续跑」**准确**。措辞上宜微调为「记录层分叉成立，执行层分叉不可达」——因为旧分支的记录**确实**留着（`debug_entries` 不被覆盖，`session-repository.ts:576-606`），不只是「回不去」。

---

## 五、附加发现（§4.3 之外，本簇新识别）

| #       | 发现                                                                                                                                                                                                                                                                                                                                                                                                      | 证据                     | 影响                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1**  | **分支下拉框几乎不可达**：`availableRunIds` 由当次抓取的 `entries` 现场聚合（`DebugChatPanel/index.tsx:412-415`），下拉框仅在 `length > 1` 时渲染（`:1789`）。而所有调用点都传了具体 `runId`（`:759, :1084, :1268, :1424, :1639, :1794`）⇒ 返回值只含单一 runId ⇒ 集合恒为 1。**唯一**能产生多 runId 的调用是回滚分支 `:1634`（`fetchDebugEntriesV2(undefined, {...})`，不传 runId 时后端返回全部 run）。 | 三处代码位置             | 用户**只有在「回退到此」之后**才可能看到分支选择器；CAP-16 的「可切着对照」在主路径上不可达                                                                      |
| **N2**  | **切到旧分支后下拉框会消失**：选中旧 runId 触发 `fetchDebugEntriesV2(val)`（`:1794`）⇒ 只返回该 run 的 entries ⇒ `availableRunIds` 塌缩为 1 ⇒ 下拉框卸载，而 `currentRunId` 状态仍指向旧分支，用户失去切回的入口（除非发一条消息，届时由 `:1076-1084` 的响应重建）。                                                                                                                                      | `:1792-1795`、`:412-415` | 分支对照是「单向门」                                                                                                                                             |
| **N3**  | **写回写错表**：调试会话脚本落在 `scripts` 表（`routes/scripts.ts:172-303`），写回也写 `scripts`（`:442-443`），而编辑器工作文件是 `script_files`（仅 `project-repository.ts:246, :390` 写入）⇒ 回写对编辑器不可见，且被「继续调试」的重新 import（`ProjectEditor/index.tsx:703`）覆盖。                                                                                                                  | 四处                     | CAP-13 的最后一环断裂（§2.1）                                                                                                                                    |
| **N4**  | **`writtenBack` 是死状态**：声明于 `RerunModal/index.tsx:27`，渲染于 `:207`（`已回写` 绿标），全仓无任何赋值点；`handleWriteBack` 的第一个参数在调用侧被写成 `_versionId` 未使用（`DebugChatPanel/index.tsx:1718-1719`）⇒ 「已回写」标签**永不出现**。                                                                                                                                                    | 三处                     | 用户无法判断某个版本是否已回写，重复回写无提示                                                                                                                   |
| **N5**  | **死 409 分支**：前端 `handleWriteBack` 专门处理 `e?.response?.status === 409`（`DebugChatPanel/index.tsx:1733`，提示「文件冲突」），但写回路由的返回码只有 404 / 400（`目标 action 已被删除，无法回写`）/ 500（`routes/scripts.ts:435-448`）——**从不返回 409**。                                                                                                                                         | 两处                     | 冲突保护只存在于 UI 措辞里                                                                                                                                       |
| **N6**  | **`RerunModal` 静默改写 LLM 配置**：`provider='deepseek'` / `model='deepseek-flash'` / `temperature=0.7` 是硬编码初值（`RerunModal/index.tsx:80-82`），既不从会话配置也不从当前 action 的 `llm_config` 初始化；`handleConfirm` **无条件**把三者塞进 `llmConfig`（`:110-121`）。                                                                                                                           | 两处                     | 用户只改 prompt 点确认，就顺手把 provider/model 覆写成了 deepseek-flash。当前 `.env` 恰好是 deepseek + deepseek-flash 所以不显形；换 provider 的会话会被静默切走 |
| **N7**  | **两个「v1」**：前端把时间倒序列表的**最后一项**（即最旧）标为 `v1 (原始)`（`RerunModal/index.tsx:196-200`），而后端 20 版裁剪保护的是 `actionVersions[0]`（**插入序**，`session-orchestrator.ts:174-182`）。                                                                                                                                                                                             | 两处                     | 版本号与「原始」的所指在后端裁剪后可能不一致                                                                                                                     |
| **N8**  | **同字段双语义**（缺陷① 根因）                                                                                                                                                                                                                                                                                                                                                                            | §四·附                   | 已归入缺陷①                                                                                                                                                      |
| **N9**  | **零护栏**：全仓**没有任何**测试覆盖 `rerunAction` / `flagSupersededMessages` / `superseded`。`grep -rln "superseded\|rerunAction" packages/*/src/**/*.test.ts` 无命中；相邻只有 `separatorUtils.test.ts` 与 `determineDebugEntryRound.test.ts`。                                                                                                                                                         | 全仓                     | 缺陷① 能长期存活而不被发现的直接原因；与 `mess-map.md` 的 F 类「HTTP 贯通层无任何护栏」一致                                                                      |
| **N10** | **`flagSupersededMessages` 是 N+1 且无事务**：逐条 `findFirst` + `update` 的读改写循环（`session-repository.ts:426-439`），无 `db.transaction` 包裹。                                                                                                                                                                                                                                                     | 一处                     | 大历史会话下慢；中途失败会留下**半标记**状态，且 `superseded` 无二次校验                                                                                         |
| **N11** | **切分支会改写「当前位置」显示**：`fetchDebugEntriesV2` 在收尾时用**本次结果的最后一个 bubble** 反推并 `setCurrentPosition(pos)`（`DebugChatPanel/index.tsx:528-570`）。选旧 runId 会把这个指示器改成旧分支的最后一个 action。                                                                                                                                                                            | 一处                     | 用户以为自己在看「当前进度」，其实看的是浏览到的分支的进度                                                                                                       |

---

## 六、本簇未解问题

1. **缺陷① 的触发条件是否只有「先回退 A、再回退 B」这一种次序？** 静态推导的判据是「快照创建于已有 superseded 行之后」，任何满足该判据的路径（新加 action、回退后重新进入后续 action）都应触发。**未实跑确认**（约束禁止）。
2. **现网/开发库里是否已存在被误标的历史会话数据？** 需查 `messages.metadata->>'superseded'` 的分布与会话对照。本次为只读审计，未连库。
3. **`orderBy(messages.timestamp)` 在同毫秒并列行上的顺序是否稳定？** 行号语义依赖排序全序；`timestamp` 为 JS `Date`、无次级排序键（`session-repository.ts:417`）。若曾在同一毫秒内写入多行，标记边界本身就不确定。
4. **`scripts` 与 `script_files` 谁是权威？** 两条写入路径（`importScript` 的 upsert vs `project-repository.update`）目前互不知情，是否存在别的同步点（如保存时回灌）需实跑验证。
5. **`actionSnapshots` 存入的 `variableStore` 是全量还是增量？** 若为全量，跨分支对照「变量差异」本可纯前端实现；这决定 CAP-16 的补做成本。
6. **`debug_entries` / `runId` 是否应补 ADR？** 二者是本簇核心数据模型却在 `docs/` 零注册（§2.2）。按 CLAUDE.md 约定 4，涉及智能机制的讨论须收敛为文档，但这两个概念属基础设施层，是否需要 ADR 或只需在 `domain-ledger` 登记，需定夺。
7. **「回退到此」的语义边界**：它丢弃 `targetIdx` 之后的所有快照（`session-orchestrator.ts:591-597`），意味着用户**无法**保留后续分支的前提下重做当前 action——这是有意设计还是缺陷② 的副作用？旧草稿未涉及，需产品裁决。
8. **`RerunModal` 是否应回填当前 action 的 `llm_config` 作为初值？**（N6）若 `llm_config` 在脚本中的缺省语义是「继承会话」，则当前实现构成静默覆写；需确认脚本 schema 中 `llm_config` 的缺省约定。

---

_报告完 · 波次 2 / S1' 能力深挖 · 调试与迭代簇_
