# 能力深挖 — 会话与状态（CAP-06 / 07 / 08 / 09）

> 波次：wave 2 · S1' 能力深挖
> 范围：`docs/audit/capability-inventory.md` 中「会话与状态」簇的四条能力
> 口径：「实现程度」按**用户能用到什么**算，不看代码写了多少。三档：端到端可用 / 部分可用（写清缺口）/ 桩或不可达。
> 方法：只读静态分析（读源码 + 读设计文档）。本环境 Docker/PostgreSQL/Redis/Hindsight 均不可达，未跑 `pnpm test`（会真实调用付费 LLM）、未跑 `pnpm dev`。凡「端到端可用」的判断均标注为**代码路径成立、未经运行时验证**。

---

## CAP-06 安全兜底

### 1. 实现度

**部分可用（重缺口：提示词层是唯一真实生效的防线；代码层的兜底与二次确认在生产链路无人调用）**

分层看：

| 层                               | 状态                                 | 证据                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 提示词层（AI 自我约束）          | **生效**，且写得具体                 | `config/prompt-defaults/ai_say_v1.md:3-17`（安全边界与伦理规范、危机识别）；`config/prompt-defaults/ai_ask_v1.md:84-98`（同段落）；ai_ask 另有话术表把「危机」列为第 6 类应对 `config/prompt-defaults/ai_ask_v1.md:44`                                                                                                                                                                                                   |
| 模板校验层（提醒作者补安全字段） | **生效**                             | `packages/core-engine/src/engines/prompt-template/template-manager.ts:380-400` — 若 JSON 输出模板缺 `safety_check` / `crisis_detected` 字段则告警                                                                                                                                                                                                                                                                        |
| 代码检测层（正则扫描）           | **在生产链路被调用，但只写日志**     | `ai-say-action.ts:278-282`：`const safetyCheckResult = this.checkSafetyBoundary(llmResult.text); if (!safetyCheckResult.passed) { console.warn(...) }` —— 无阻断、无替换、无上抛                                                                                                                                                                                                                                         |
| 代码检测层（ai_ask）             | **在生产链路被调用，结果只进元数据** | `ai-ask-action.ts:376` 调用，`:1072` 把结果塞进单轮分支的 `metadata.safety_check`，`:1112` 塞进多轮分支                                                                                                                                                                                                                                                                                                                  |
| 二次确认 / 兜底话术（"新机制"）  | **仅测试可达**                       | `base-action.ts:767`（`confirmSafetyViolation`）、`base-action.ts:855`（`generateSafeFallbackResponse`）、`base-action.ts:721`（`parseStructuredOutput`）在 `packages/*/src` 下零调用；唯一调用点是 `packages/core-engine/test/regression/safety-boundary-detection.test.ts`（经 `:37` `testParseStructuredOutput`、`:40-47` `testConfirmSafetyViolation`、`:50` `testGenerateSafeFallbackResponse` 三个测试专用转发器） |

命中违规后的生产实际行为，逐步追踪：

1. `ai_say`：LLM 输出 → `checkSafetyBoundary`（`ai-say-action.ts:278`）→ `console.warn` → 回复**原样发给用户**。
2. `ai_ask`：同上（`ai-ask-action.ts:376`）→ 结果进 metadata → 回复**原样发给用户**。
3. 危机信号：`ai-ask-action.ts:1090-1096`
   ```ts
   const crisisDetected = llmOutput.crisis_detected || false;
   if (crisisDetected) {
     // TODO: 同步启动危机处理LLM，评估是否修订回复
     logger.warn('⚠️ 危机信号检测到，启动危机处理流程');
   }
   ```
   即「启动危机处理流程」= 打一条 warn 日志。
4. 元数据落地：`execution-result-handler.ts:92-97` 与 `:180-185` 把 `result.metadata` 一并 push 进 `conversationHistory`，随消息落进 `messages.metadata`（`db/schema.ts:101`）——**但全仓无任何下游读者**。`grep` 确认 `safety_check` / `crisis_detected` / `safety_risk` 在 `script-executor.ts` 零命中。

因此：**用户在危机场景下得到的保护，等同于提示词里那句「建议寻求专业帮助 + 热线 400-161-9995」被 LLM 自觉遵守的概率**（`ai_say_v1.md:17`、`ai_ask_v1.md:98`）。红线没有代码守卫，红线是一段散文。

补充发现的**契约断裂**（本次深挖新增，不在原始清单里）：

- **N1：ai_say 的安全元数据恒为 `undefined`。** 代码读 `llmOutput.safety_check`（`ai-say-action.ts:107` schema、`:387` 写入 metadata），但 `config/prompt-defaults/ai_say_v1.md` 的 JSON 契约里**没有 `safety_check` 字段**——它输出的是 `safety_risk`（`:81-86`）与 `metadata.crisis_signal`（`:89`）。所以 `ai-say-action.ts:387` 这一行永远写 `undefined`。
- **N2：同一模板自相矛盾。** `ai_say_v1.md:15` 要求「立即在输出中标记 `crisis_detected: true`」，而同一文件 `:70-95` 的 JSON 契约（「严格按照以下 JSON 格式输出」）无此字段；`:134` 又改口让标记 `crisis_signal: true`。
- **N3：解析了但没人用。** `safety_risk` 有完整 schema（`ai-say-action.ts:54`、`:124`），但解析后全函数无第二次读取；`crisis_signal`（`:116`）同理。即 ai_say 侧**真的拿到了安全信号，然后扔了**。
- **N4：正则危机分支对 ai_say 永不触发。** `base-action.ts:694-704` 的危机判定是字面量子串扫描：
  ```ts
  if (aiMessage.includes('crisis_detected: true') || aiMessage.includes('"crisis_detected":true'))
  ```
  而 ai_say 的契约里根本没有这个 key（见 N1/N2）——该分支在 ai_say 路径上是死代码。
- **N5：`checkSafetyBoundary` 三组正则全部 `severity: 'warning'`**（diagnosis `:637-650`、prescription `:657-670`、guarantee `:677-688`），唯一 `severity: 'critical'` 的产出是 N4 那个永不触发的危机分支（`:699-702`）。即便将来有人接上 `passed === false` 的分支，能拿到的也只有 warning。
- **N6：`parseStructuredOutput` 解析失败时 fail-open。** `base-action.ts:721-753` 在 JSON 解析失败时返回 `passed: true`——最需要守卫的畸形输出场景，守卫默认放行。

### 2. 涉及的领域概念

**战略层（限界上下文 / 聚合）**

- 安全边界**不属于五个限界上下文中任何一个**。`docs/ddd/strategic-design.md` 的上下文图（`:26` 一族、`:180` 一族）无安全/伦理/危机相关词；`docs/audit/domain-ledger.md` §1.0 记录 `docs/ddd/` 对引擎领域关键词近乎零命中——安全兜底正是其中一项。
- 它实际落在 **Consulting Session** 上下文的 Action 执行内部：`BaseAction`（`packages/core-engine/src/domain/actions/base-action.ts:622`）作为三个 Action 的共同基类承载了 `checkSafetyBoundary`，`Session` 聚合根（`docs/ddd/contexts/consulting-session.md:12`）对安全无任何状态或方法。
- 后果：安全无聚合级状态（没有 `SafetyEvent`、没有 `session.safetyStatus`），所以「这个会话触发过危机」这一事实**无处存放**，只能躺在某条消息的 metadata 里。

**战术层**

| 概念                                                                     | 类型                                 | 代码位置                                                              | 备注                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkSafetyBoundary`                                                    | 领域服务（未命名，挂在基类上的方法） | `base-action.ts:622`                                                  | 头部 `@deprecated` 注记（`:613`）自称「使用新的基于 LLM 的安全边界检测机制（parseStructuredOutput + confirmSafetyViolation）」——而后者仅测试可达 |
| `SafetyViolation`                                                        | 值对象（隐式，内联对象字面量）       | `base-action.ts:636-704` 内联 `{category, matched_pattern, severity}` | 无类型别名、无独立文件、无 UL 登记                                                                                                               |
| `parseStructuredOutput`                                                  | 领域服务                             | `base-action.ts:721`                                                  | 返回 `StructuredActionOutput`（`passed` / `crisis_signal`），**生产链路零调用**                                                                  |
| `confirmSafetyViolation`                                                 | 领域服务（含第二次 LLM 调用）        | `base-action.ts:767`                                                  | 默认保守判定 `violation_confirmed: true, suggested_action: 'block'`；**生产链路零调用**                                                          |
| `generateSafeFallbackResponse`                                           | 领域服务                             | `base-action.ts:855`                                                  | 固定话术 + 热线 `400-161-9995`；**生产链路零调用**                                                                                               |
| `MainLineOutput.safety_check` / `safety_risk` / `metadata.crisis_signal` | 值对象字段                           | `ai-say-action.ts:40`、`:54`、`:46`                                   | 三者并存，只有 `safety_check` 被读取，而模板只产出另两个（见 N1）                                                                                |

**与 UL 的关系**：`docs/design/foundation/ubiquitous-language.md` 未登记任何安全域术语；`docs/design/foundation/ontology.md` 亦无。按红线 A5（`docs/design/foundation/architecture-constraints.md:20`）「代码概念必须登记 UL」，此处为**违规存量**。

### 3. 对应设计文档

**`docs/design/` 下没有安全兜底的机制文档。** 逐目录核查：

- `docs/design/foundation/`：`architecture-constraints.md`（`status: draft`，`docs/design/README.md:20`）的 A1–A7、B1–B5、C1–C7、D1–D6、E1–E3 中**无一条**涉及安全边界或危机处理。
- `docs/design/memory/`：`docs/design/README.md:26-29` 四篇（`memory-framework` / `memory-retrieval-types` / `ai-ask-memory-recall` / `variable-memory-bridge`）均不涉及。
- `docs/design/decisions/`：ADR 001–007（`docs/design/README.md:53-57`）无安全议题。
- 唯一成文的「机制」在**提示词文件本身**：`config/prompt-defaults/ai_say_v1.md:3-27`、`config/prompt-defaults/ai_ask_v1.md:84-104`。这些是交付物（脚本/模板域），不是设计文档，不受「设计封板」约束。
- 另有一份**测试夹具**重复了同一段安全规范：`docs/design/memory/fixtures/ai-ask-judgment-prompt-fixture.md:174-190`（`status` 为夹具，非机制文档）。**同一段红线文字现在有三份拷贝**（两个模板 + 一个夹具），无单一出处。

**代码与文档是否一致**：无法比对——**没有文档可对**。这是本能力最硬的结构性问题：红线 B 类（安全不可越界）是产品级的「必须确定」项（`CLAUDE.md` 设计哲学「三决策区」之 Must Determine），却没有一条约束落进 `architecture-constraints.md`。

**`docs/ddd/` 是否描述本能力**：否。`docs/ddd/strategic-design.md`、`docs/ddd/contexts/*.md` 均无安全/危机相关内容（`grep` 全目录零命中「安全边界」「危机」）。

**`docs-archive/`**：`docs-archive/misc/T6-T8-IMPLEMENTATION-SUMMARY.md` 与 `docs/superpowers/plans/ddd-refactoring-plan.md` 提及安全检测，属历史计划，非权威。

### 4. 缺口

- **【做了但接不上】"新机制"三件套（`parseStructuredOutput` / `confirmSafetyViolation` / `generateSafeFallbackResponse`）完整实现、有回归测试、无生产调用点。** 三方法合计约 130 行（`base-action.ts:721-861`），默认值都取保守侧，质量不差；缺的是一行接线——在 `ai-say-action.ts:278` / `ai-ask-action.ts:376` 的 `if (!passed)` 分支里调用它们并改写 `aiMessage`。这是**接线缺口，不是能力缺口**。
- **【没做】危机处理流程。** `ai-ask-action.ts:1093-1096` 是显式 `// TODO`。没有危机升级、没有人工介入通道、没有会话级标记。
- **【做了但接不上】安全信号有产出、无消费者。** 消息 metadata 里躺着 `safety_check` / `crisis_detected`（`execution-result-handler.ts:92-97`、`:180-185` → `db/schema.ts:101`），无任何读取方：不阻断、不告警、不落审计、不进调试面板。
- **【没做】输出侧守卫。** 现有全部检测都在「LLM 输出之后」，且是正则 + 自我报告。无输入侧风险识别，无 HTTP 层拦截（`docs/audit/mess-map.md` MESS-F-05 已记「无穿透 HTTP 的守卫」）。
- **【契约撕裂】模板与代码字段名不一致**（N1–N3）。修一行模板或修一行代码都能解决，但当前状态是 ai_say 的安全元数据**结构性为空**。
- **【文档缺口】红线 B 类无约束条目、无机制文档、无 ADR。** 一段红线拷贝在三处（两个模板 + 一个夹具）且互相矛盾（N2），无单一出处——违反红线 A5 的「单一出处」精神。

---

## CAP-07 咨询可以中断再续

### 1. 实现度

**端到端可用（代码路径成立；本环境无 DB/Redis，未做运行时验证）**

一次「再续」的完整链路，逐跳有据：

| 跳                           | 位置                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 入口                    | `packages/api-server/src/routes/sessions.ts:426`（`POST /api/sessions/:id/messages`）→ `:602-603` `new SessionOrchestrator().processUserInput(id, content)`                                                                                                                                                           |
| 并发入口                     | `packages/api-server/src/routes/chat.ts:6`（模块级单例）、`:67` 同一个 `processUserInput`                                                                                                                                                                                                                             |
| 读会话行                     | `session-orchestrator.ts:304` → `repository.loadSessionById`                                                                                                                                                                                                                                                          |
| 读全局变量                   | `session-orchestrator.ts:308-309` → `loadGlobalVariables`（`session-repository.ts:207-290`）                                                                                                                                                                                                                          |
| 读历史（已剔除被取代消息）   | `session-orchestrator.ts:312` → `loadConversationHistory`，内部过滤 `metadata.superseded === true`（`session-repository.ts:186-188`）                                                                                                                                                                                 |
| 存用户消息                   | `session-orchestrator.ts:315` → `saveUserMessage`（`session-repository.ts:309-317`）                                                                                                                                                                                                                                  |
| 重载历史（含刚存的用户消息） | `session-orchestrator.ts:317`                                                                                                                                                                                                                                                                                         |
| **恢复领域状态**             | `session-orchestrator.ts:319` → `:65-102` `restoreSession` → `Session.fromSessionData(...)`（`packages/core-engine/src/domain/session.ts:265-325`）：`position`（三索引，`:306-314`）、`variables`（`:315-318`）、`variableStore`（四桶，`:274-294`）、`conversationHistory`（`:320`）、`metadata` 整体透传（`:321`） |
| **执行**                     | `session-orchestrator.ts:345` → `:106-141` `executeScript`：`session.toExecutionState()`（`:123` → `session.ts:206-229`）→ `scriptExecutor.executeSession(...)`（`:124`）→ `session.applyExecutionResult(updatedState)`（`:132` → `session.ts:231-250`）                                                              |
| 断点识别                     | `packages/core-engine/src/engines/script-execution/script-executor.ts:449-457` 调用 `resumeCurrentActionIfNeeded`；`:535-543` 无 `currentAction` 时直接返回 true                                                                                                                                                      |
| **写回**                     | `session-orchestrator.ts:412-414`：`saveNewAIMessagesFromSession` → `saveVariableSnapshots` → `persistSession`（`session-repository.ts:446-521`，写 `position` / `variables` / `executionStatus` / `metadata`，`:497-511`）                                                                                           |
| 响应                         | `session-orchestrator.ts:418-425` → `SessionResponseBuilder`                                                                                                                                                                                                                                                          |

状态机的落库字段齐全：`db/schema.ts:63-70`（`status` / `executionStatus` / `currentRunId` / `position` / `variables` / `metadata`），消息表 `db/schema.ts:91-110`。`executionStatus` 默认 `'running'`（`:64`）。

判定为「端到端可用」的理由：链路无断点、无桩、无 `TODO`，`position` + `variables` + 历史三样都真的从 DB 读并真的写回；`pnpm typecheck` EXIT=0、`pnpm test` 697 passed（`docs/audit/runnability-baseline.md`）。**但需注明**：HTTP 路由层 2,872 行零测试（`docs/audit/runnability-baseline.md` §3），且本环境 DB 不可达——所以这是**读代码得出的可用，不是跑出来的可用**。

### 2. 涉及的领域概念

**战略层**

- **Consulting Session** 限界上下文（Core Domain）的核心用例。`Session` 是唯一聚合根（`docs/ddd/strategic-design.md:219`、`docs/design/foundation/architecture-constraints.md:18` A3）。
- 应用服务：`SessionOrchestrator`（`session-orchestrator.ts:33`）。**关于「SessionManager 拆解后应用服务层还剩什么」**——这是本次深挖的指定问题，回答如下：
  - 四个文件（`session-orchestrator.ts:4`、`session-repository.ts:4`、`session-variable-utils.ts:4`、`session-response-builder.ts:4` 的注释均自述 "Extracted from SessionManager"）现在分担的是**技术分层**，不是**领域职责分割**：
    - `SessionOrchestrator`（685 行）= 用例编排 + **记忆时序** + **变量持久化决策** + **rerun 分支逻辑** + 全局变量回调注册；
    - `SessionRepository`（796 行）= 全部 SQL 读写（`ISessionRepository` 接口 `:43-122`）；
    - `SessionResponseBuilder`（约 240 行）= 出参组装 + 变量轮次 diff；
    - `session-variable-utils.ts` = 纯函数工具。
  - 即：**拆分是把「一个类」拆成了「一个领域服务 + 三个技术助手」，应用服务层没有变薄**。`docs/ddd/strategic-design.md:266-270` 的 M1「SessionOrchestrator 职责过重」已明确指出六种职责混杂，并建议抽 `MemoryLifecycleService` + `SessionPersistenceService`——**该建议未落地**（`session-orchestrator.ts` 里 `recall` 在 `:254`、`retain` 在 `:379`、`reflect` 在 `:676`，记忆时序仍内联在编排里）。
  - **命名两说**：`docs/ddd/strategic-design.md:180` 写 `SessionOrchestrator`，`docs/design/foundation/architecture-constraints.md:22`（A7）导仍写 `持久化只在 SessionManager`，`CLAUDE.md` 9 处写 `SessionManager` 并列出 `restoreExecutionState` / `updateSessionState` 两个**已不存在**的方法。`grep -rn 'class SessionManager' packages/*/src` 零命中。（`docs/audit/mess-map.md:125` MESS-E-04 已记；本次确认 A7 仍未改。）

**战术层**

| 概念                     | 类型                                 | 代码位置                                                                                                                                              |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Session`                | 实体 / 聚合根                        | `packages/core-engine/src/domain/session.ts`（`fromSessionData` `:265`、`toExecutionState` `:206`、`applyExecutionResult` `:231`、`complete` `:141`） |
| `Position`               | 值对象                               | `session.ts:306-314`（phaseIndex/topicIndex/actionIndex + phaseId/topicId/actionId/actionType）；落库 `db/schema.ts:66-68`                            |
| `ExecutionStatus`        | 枚举（状态机）                       | `db/schema.ts:64`（`executionStatusEnum`，默认 `running`）；状态机定义 `docs/ddd/contexts/consulting-session.md:15`                                   |
| `ExecutionState`         | 值对象（进出 core-engine 的载体）    | `session.ts:206-250`；`script-executor.ts:180` 附近定义                                                                                               |
| `SessionPersistenceData` | DTO（infra → domain 的入参）         | `session.ts:265` 形参类型                                                                                                                             |
| `ISessionRepository`     | 端口（application 定义，infra 实现） | `session-repository.ts:43-122`                                                                                                                        |
| `SessionOrchestrator`    | 应用服务                             | `session-orchestrator.ts:33`                                                                                                                          |
| 状态迁移事件             | **无**                               | 无 `SessionResumed` / `SessionPaused` 领域事件；`docs/ddd/contexts/consulting-session.md` 亦未登记任何领域事件                                        |

**重要观察**：`Session.setVariable`（`session.ts:164`）**生产链路零调用**——`grep -rn '\.setVariable(' packages/*/src` 只命中 `script-executor.ts:371` 与 `:1245`（两处都是 `scopeResolver.setVariable`，不是 `session.setVariable`）。即聚合根的写方法只被它自己的单测（`packages/core-engine/src/domain/__tests__/session.test.ts:67,68,107`）使用，生产写路径绕开聚合根直写 `variableStore`。这与 `docs/ddd/strategic-design.md:293` 记录的「`Session` 暴露 public getter，外部可绕过 `setVariable()` 直接操作」是同一问题的两面。

### 3. 对应设计文档

**`docs/design/` 下没有一篇描述「中断再续」的机制文档。** 核查结果：

- **状态机 + Position 的约束在红线里**：`docs/design/foundation/architecture-constraints.md:21`（A6）「`RUNNING → WAITING_INPUT ↔ RUNNING → COMPLETED | ERROR`；Position 三索引联动；Action 执行一次只前进一个，不可跳步」，出处标 `docs/ddd/strategic-design.md §1.3`。**这是本能力唯一的封板约束**（该文件 `status: draft`，`docs/design/README.md:20`）。
- **`docs/design/foundation/ubiquitous-language.md:69`** 定义「**中断** Interrupt」——但语义不同：那是**话题级**紧急插入（「当前话题暂停（保存执行状态），紧急话题插到队首」），属议程/意识线，与「用户关掉网页明天再聊」的会话级再续不是同一机制。**这是一个真实的名实冲突**：UL 的「中断」指话题插队，产品的「中断再续」指会话恢复，两者共用「中断」一词。
- **A7（`:22`）** 声称「持久化只在 `SessionManager`（api-server）」：约束方向对，类名错（见上）。
- `docs/design/memory/memory-framework.md:820-822`、`:843` 描述三操作的触发点，间接涉及本能力（会话启动/结束的时序），但不是本能力的机制文档。
- `docs/design/decisions/` 七份 ADR（`docs/design/README.md:53-57`）无一条涉及会话恢复或 Position。

**代码与文档是否一致**：**部分一致**。A6 的三个不变量（状态机形状、Position 三索引、单步前进）在代码里成立；A7 的类名与代码不符；且**恢复机制的机制文档整体缺失**——恢复逻辑（读什么、按什么优先级合并、superseded 怎么过滤）目前只存在于代码与 `CLAUDE.md` 那段已经过时的 `SessionManager` 描述里。

**`docs/ddd/` 是否描述本能力**：**是，但只到战略层**。`docs/ddd/contexts/consulting-session.md:15-16`、`:31`、`:52` 描述状态机、position、`updatePosition()`；`docs/ddd/strategic-design.md:58`、`:69`、`:93` 列出领域语言与 Position 一致性要求。**但无一份描述实际恢复过程**（如何从 `metadata.variableStore` 重建、global 层如何合并、superseded 如何过滤）。

### 4. 缺口

- **【没做】恢复机制无机制文档。** 本能力的实现细节（`fromSessionData` 的合并顺序、`variableStore` 的四桶缺失回填、history 过滤 superseded）没有任何文档描述。A6 只约束了状态机形状，不约束恢复语义。
- **【没做】无并发保护 / 无幂等。** `saveUserMessage`（`session-orchestrator.ts:315`）在 LLM 调用**之前**就落了库。若进程在 `:315` 之后、`:412` 之前崩溃，用户消息已入库但无 AI 回复；用户重试会被追加为**第二条**用户消息（`saveUserMessage` 无去重、`db/schema.ts:91-110` 无唯一约束）。没有任何 request id / 幂等键。
- **【没做】无会话锁。** 两个并发 `POST /:id/messages` 各自 `loadSessionById` → 各自执行 → 各自 `persistSession` 全量覆盖（`session-repository.ts:497-517` 是无条件 `update ... set`）。后者覆盖前者，无乐观锁（`db/schema.ts:57-86` 无 `version` 列）。
- **【做了但接不上】`prevVariableSnapshots` 在路由层永远为空。** 该 Map 是 `SessionOrchestrator` 的**实例字段**（`session-orchestrator.ts:39`），而路由每次请求 `new SessionOrchestrator()`（`routes/sessions.ts:96`、`:602`、`:768`、`:868`）。于是 `session-response-builder.ts:189` 的 `prevVariableSnapshots.get(dbSession.id)` 恒为 `undefined`，`:193` 的 `calculateRoundChanges(prevSnapshot || null, ...)` 永远以 `null` 为基准。**只有 `routes/chat.ts:6` 的模块级单例能保住这个 Map**——同一条业务链路两个入口行为不一致。
- **【没做】断点粒度是 Action，不是「对话轮」。** `resumeCurrentActionIfNeeded`（`script-executor.ts:449-457`、`:535-543`）只能在 Action 边界恢复。用户在一次 `ai_ask` 的多轮追问中间关掉页面再回来，恢复的是整个 Action（多轮计数在 metadata 里），没有「回到第 3 轮」的语义。这对产品是否可接受，无文档裁决。
- **【口径失真】`CLAUDE.md` 用 9 处、两个已不存在的方法名描述本能力**（`restoreExecutionState` / `updateSessionState`），并把它叫 `SessionManager`。红线 A7（`architecture-constraints.md:22`）同样未更新。
- **【未验证】HTTP 路由层零测试。** 2,872 行路由 vs 308 行测试（`docs/audit/runnability-baseline.md` §3）。「端到端可用」目前是静态推论。

---

## CAP-08 跨会话记忆

### 1. 实现度

**部分可用（缺口：recall 时序错位使首条回复用不上记忆；reflect 的触发面窄；降级不可观测）**

三个操作在会话生命周期里的挂载点，全仓 `grep` 只有三处调用（外加两个自检脚本 `scripts/verify-hindsight.ts:14,37,51`、`scripts/verify-mental-model.ts:88,187`）：

| 操作      | 挂载点                                                     | 触发条件                                                                                             | 时序                                 |
| --------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `recall`  | `session-orchestrator.ts:253-265`                          | 仅 `initializeSession`                                                                               | **在 `executeScript`（`:250`）之后** |
| `retain`  | `session-orchestrator.ts:349-410`（调用在 `:379-405`）     | `actionChanged \|\| sessionEnded`（`:409` 注释「如果 Action 没变且 session 没结束，本轮不 retain」） | 每个 Action 结束；fire-and-forget    |
| `reflect` | `session-orchestrator.ts:671-684`（调用在 `:281`、`:416`） | `session.executionStatus === 'completed'`                                                            | 会话结束                             |

**recall 的时序问题（关键）**：`initializeSession` 的顺序是 `:250` 执行脚本（生成第一条 AI 消息）→ `:253-265` 才 recall。所以**会话的开场白不可能用到记忆**。recall 结果写入 `session.metadata.memoryContext`（`:256`），而 `persistSession` 会把整个 metadata 落库（`session-repository.ts:505-509`），`fromSessionData` 又整体透传（`session.ts:321`）——因此该 `memoryContext` 会被后续每次请求复用。**净效果：记忆在每个会话里只 recall 一次、且从第二次请求起才生效、整个会话期间冻结不更新。** `processUserInput` 全程不調 recall。

**recall 的查询串是硬编码**：`session-orchestrator.ts:254-257`，`'用户核心问题、关键事件、治疗进展'`。与 `docs/design/memory/memory-framework.md:714-736` 描述一致，但它是**每个用户、每个脚本、每次会话都一样的固定串**——不随脚本、来访者、会话主题变化。

**消费端是通的**：`formatMemoryContext`（`base-action.ts:384-415`）读 `context.metadata?.memoryContext`，无则返回 `''`；在 `ai-say-action.ts:629` 与 `ai-ask-action.ts:620` 作为 `memory_context` 注入；`template-manager.ts:274` 登记为系统变量；模板用 `{%memory_context%}`（`config/prompt-defaults/ai_say_v1.md:38`、`ai_ask_v1.md:21`）。**这条链是完整的**。

**降级路径不可观测（指定问题，回答如下）**：降级**发生在适配器内部、被吞掉**：

- `hindsight-adapter.ts:44-64` `retain`：catch 后 `logger.error('retain failed', ...)`（`:62`），然后什么也不做。
- `:66-143` `recall`：catch 后 `logger.error('recall failed', ...)`（`:140`），然后 `return { worldFacts: [], experiences: [], observations: [] }`（`:141`）。
- `:145-183` `reflect`：catch 后 `logger.error('reflect failed', ...)`（`:180`），然后 `return { summary: '' }`（`:181`）。

问题在**上游看不出区别**：

- `session-orchestrator.ts:259-264` 的 recall 日志只打个数（`worldFacts: ...length, experiences: ..., observations: ...`）。Hindsight 挂掉时三者长度都是 0，与「这个用户确实没有记忆」**打印完全相同的日志**。要区分只能去翻 `hindsight-adapter.ts:140` 那条 error 日志，而两条日志分属不同 logger。
- `container.ts:60` 无条件构造 `new HindsightMemoryAdapter()`，`:203-204` 返回类型是**非可选**的 `MemoryRepository`（不是 `MemoryRepository | undefined`）。所以 `session-orchestrator.ts:253` 和 `:349` 的 `if (this.memoryRepository)` **恒为 true，从不构成开关**。没有任何「记忆版本/降级 flag/健康标记」进入响应或 metadata。
- 结果：**一个 Hindsight 全程不可达的部署，产品行为与「新用户第一次来」逐字节相同**，只在服务端日志里留 error。用户和运维都没有可观测面。这与红线 D3（`architecture-constraints.md:46`「会话不因记忆失败中断」）**方向一致但过宽**：D3 只说了不中断，没要求可观测；实现把「不中断」做成了「不留痕」。

**环境实况**：`docs/audit/runnability-baseline.md` 记录本环境 Hindsight 不可达，且**适配器从未被真实跑过**——全部测试用 Spy/Fake。所以上述降级行为是**读代码得出的**，未实测。

**reflect 触发面（指定问题，回答如下）**：`maybeReflect` 的条件是 `session.executionStatus === 'completed'`（`session-orchestrator.ts:671-684` 内的早返回）。把会话推到 completed 的路径有几条：

1. `Session.complete()`（`session.ts:141-143`，同时置 `status` 与 `executionStatus`）；
2. `script-executor.ts:475-485`：脚本跑完且状态既非 `WAITING_INPUT` 也非 `ERROR` 时置 completed；
3. `execution-result-handler.ts:249` 与 `:266`：`prepareNext` 发现没有下一个 phase/topic 时置 `executionStatus = 'completed'`。

但**只有 `processUserInput` 与 `initializeSession` 会调 `maybeReflect`**（`:281`、`:416`）。而 `rerunAction`（`:533-669`）**不调**（`:657-668` 只有 save/persist/响应）。且 `PATCH /:id/variables` 在会话已 completed/error 时被拒（`routes/sessions.ts:753-766`，`ErrorCode.SESSION_ENDED`）。

所以现实是：**只有「用户发出最后一条消息 → 引擎在这一次请求内跑到队尾」这一种情形会 reflect**。若最后一条 `ai_say` 走的是 `script-executor.ts:581-598` 的暂停分支（有待确认的 aiMessage → `WAITING_INPUT`），该次请求不 reflect；用户若不再发消息，`reflect` **永不触发**——会话停在 `WAITING_INPUT`，没有超时兜底、没有会话关闭钩子、没有后台任务。对一个「最后一个话题就是收尾」的脚本，这是常见路径。

另：`maybeReflect` 调 `reflect(userId)`（`:676`）**不传 query**（端口签名 `memory-repository.port.ts:177` 的第二个参数可选）。即反思是全局的、非会话定向的。

### 2. 涉及的领域概念

**战略层**

- **Conversational Memory** 限界上下文（Supporting）。`docs/ddd/strategic-design.md` 列为五个上下文之一；`docs/design/foundation/architecture-constraints.md:18`（A3）列出。
- 关键架构立场：**记忆是端口不是引擎**——红线 D1（`architecture-constraints.md:44`）「`MemoryRepository`（retain/recall/reflect），实现是 api-server 的 `HindsightMemoryAdapter`」。这条在代码里严格成立：端口在 core-engine（`packages/core-engine/src/domain/ports/memory-repository.port.ts:149-178`），适配器在 api-server（`packages/api-server/src/adapters/outbound/memory/hindsight-adapter.ts`），ACL 红线 A4（`architecture-constraints.md:19`）也成立。
- **但它不是一个"引擎"这件事有代价**：因为不是引擎，它不进 `ScriptExecutor` 的编排（红线 B1，`architecture-constraints.md:26`），所以三操作的时序**只能由 api-server 的应用服务手工编排**。这正是「recall 排在 executeScript 之后」这类时序错误没有任何结构性能拦住它的原因。

**战术层**

| 概念                                                 | 类型                    | 代码位置                                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryRepository`                                   | 端口                    | `memory-repository.port.ts:149-178`（`retain` `:157`、`recall` `:167`、`reflect` `:177`）                                                                                             |
| `HindsightMemoryAdapter`                             | 适配器（ACL）           | `hindsight-adapter.ts:38-42`（构造）、`:33` 默认地址 `http://localhost:8888`、`:39` 环境变量 `HINDSIGHT_URL`                                                                          |
| `MemoryMessage`                                      | 值对象                  | `memory-repository.port.ts:24-28`                                                                                                                                                     |
| `MemoryEntry`                                        | 值对象（世界事实/经历） | `memory-repository.port.ts:35-45`（`sourceChannel` / `sourceCredibility` / `occurredStart` / `occurredEnd`）                                                                          |
| `ObservationEntry`                                   | 值对象                  | `memory-repository.port.ts:50-55`（`proofCount` / `sourceFactIds`）                                                                                                                   |
| `MemoryContext`                                      | 值对象（三字段）        | `memory-repository.port.ts:65-72`（`worldFacts` / `experiences` / `observations`）；红线 D2（`architecture-constraints.md:45`）约束「不引入第四字段」——**代码与 D2 一致**，无第四字段 |
| `ReflectionResult`                                   | 值对象                  | `memory-repository.port.ts:83-90`（`summary` + `newObservations` / `contradictions`）                                                                                                 |
| `RetainOptions` / `RecallOptions` / `ReflectOptions` | 值对象                  | `:95-102` / `:111-128` / `:133-138`                                                                                                                                                   |
| mental model                                         | 概念（无独立类型）      | 按 D2 由适配器渲染进 `{{memory_context}}`，领域模型不自建存储——**与红线一致**                                                                                                         |

**挂载点与其宿主**：三操作挂在 `SessionOrchestrator` 上（应用服务），不在 `Session` 聚合根上。聚合根对记忆无任何字段或方法——记忆是会话的**外部输入**（recall 结果塞进 `metadata.memoryContext`）与**外部副作用**（retain/reflect 是发出去的调用），不进聚合状态机。这个设计选择是干净的，但也意味着**记忆的时序正确性没有领域模型守卫**。

**`source_channel` / `source_credibility` 来源标注**：红线 D5（`architecture-constraints.md:48`）要求经 retain 的 metadata 写入。代码在 `session-orchestrator.ts:379-405` 的 retain 调用里传 `metadata: {source_channel: 'dialogue', source_credibility: 'high'}`——**代码与 D5 一致**，但两者都是**硬编码常量**，不随来源变化（无论内容来自用户直述还是 LLM 推断，都标 `high`）。

### 3. 对应设计文档

本能力是四条里**文档最厚**的一条。

| 文档                                           | status                                             | 与代码的关系                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/memory/memory-framework.md`       | `decision-recorded`（`docs/design/README.md:26`）  | `:229`「每个 Action 结束后 retain…；Session 结束时 reflect」——**与代码一致**（`session-orchestrator.ts:379`、`:676`）。`:714-736`「会话启动时的记忆加载」，含 `recall("用户的核心问题、关键生活事件、治疗进展")`——**查询串一致**（`session-orchestrator.ts:254-257`，措辞微异：代码为「用户核心问题、关键事件、治疗进展」），**但文档未规定 recall 与首次生成的先后**，代码把 recall 放在生成之后。`:820-822` 列三操作触发点，`:843` 生命周期小结 |
| `docs/design/memory/memory-retrieval-types.md` | `decision-recorded`（`README.md:27`）              | 检索类型定义                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/design/memory/ai-ask-memory-recall.md`   | `draft`（`README.md:28`，last_updated 2026-09-28） | 描述 ai_ask 输出里的 recall 三态决策字段（none/defer/block，含 `reason`/`entities`/`query`）与快/慢通道——**代码中完全不存在**（`ai-ask-action.ts` 无相关字段）。**代码与文档严重不一致**，但该文为 `draft`，未封板                                                                                                                                                                                                                                |
| `docs/design/memory/variable-memory-bridge.md` | `decision-recorded`（`README.md:29`）              | 含显式裁决注记：与 ADR 007 冲突处以 007 为准（跨会话权威=信息点文档；异步 recall 不再写变量）。与代码的关系见 CAP-09                                                                                                                                                                                                                                                                                                                              |

**ADR（`docs/design/decisions/`）**：

- **ADR 004**（记忆数据模型校准）→ 红线 D4（`architecture-constraints.md:47`，SDK 隔离）、D5（`:48`，来源标注）。**代码一致**。
- **ADR 005**（移除 opinions 领域概念）→ 红线 D2（`:45`）。**代码一致**：`memory-repository.port.ts:65-72` 的 `MemoryContext` 确实只有三字段，无 opinions、无数值 confidence。
- **ADR 006**（检索层范围收敛）→ 红线 D6（`:49`，快通道零 LLM）。**代码中快通道不存在**（见 `ai-ask-memory-recall.md` 一行）。

**红线 D3**（`architecture-constraints.md:46`）「会话不因记忆失败中断：retain 是 fire-and-forget；recall 失败返回空上下文」——**代码一致**（`hindsight-adapter.ts:62/140/180` + `session-orchestrator.ts:397-405` 的 `.catch(err => logger.warn(...))`），如 §1 所述，一致但过宽。

**注意：ADR 文件本身无 `status` frontmatter 字段**（`docs/design/decisions/001`–`007` 七份均只有标题与正文；与 `docs/design/**` 机制文档不同）。封板状态只能经 `docs/design/README.md:53-57` 的注册表读。

**`docs/ddd/` 是否描述本能力**：`docs/ddd/contexts/memory.md` 存在且把 `SessionOrchestrator` 列为「位置合理」（`docs/audit/domain-ledger.md:210` 引 `memory.md:56-68`）。即 DDD 文档描述了**归属**（记忆操作挂在哪个应用服务上），但未描述**时序**。

**代码与文档是否一致**：**大体一致，三处偏离**——(1) recall 与首次生成的先后（文档未定，代码把记忆排除在开场白之外）；(2) `ai-ask-memory-recall.md` 整篇机制未实现（该文 `draft`，不算违约）；(3) `reflect` 无 query（文档未明确要求，但 `ReflectionResult` 的定向反思能力在应用层被浪费）。

### 4. 缺口

- **【做了但接不上】recall 排在首次生成之后**（`session-orchestrator.ts:250` → `:253`）。三操作里最该影响体验的一个，恰好在新会话最需要它的那一刻缺席。修复是把 253-265 提到 250 之前，**但**：`session` 对象在 `:215` 才建立、`sessionConfig` 在 `:267` 才落库，顺序调整需连带处理（这正是「记忆时序内联在编排里」的代价，见 M1）。
- **【做了但接不上】降级路径无可观测面**（详见 §1）。`logger.error` 在适配器内，上游只看得到「0 条记忆」。无健康标记、无响应字段、无指标。
- **【没做】`reflect` 触发面窄且无兜底。** 只在「用户最后一条消息推动会话跑到队尾」时触发；停在 `WAITING_INPUT` 的会话永不 reflect；`rerunAction` 路径不 reflect（`session-orchestrator.ts:657-668`）；无超时、无会话关闭钩子、无后台补偿任务。
- **【没做】`processUserInput` 不 recall。** 一个跨越多天的长会话，第二天新消息仍用第一天冻结的 `memoryContext`（`session.ts:321` 透传 + `session-repository.ts:505-509` 落库）。
- **【没做】recall 查询串硬编码、单查询、无实体。** `'用户核心问题、关键事件、治疗进展'`（`session-orchestrator.ts:255`）对所有用户/脚本一致；`ai-ask-memory-recall.md` 设计的实体化、快慢通道决策字段一并未实现。
- **【没做】`source_credibility` 恒为 `'high'`**（`session-orchestrator.ts:379-405` 附近的 retain 参数）。D5 要求来源标注，代码给了常量——标注机制存在，标注语义为空。
- **【红线未覆盖】retain 的数据边界未定义。** `session-orchestrator.ts:349-410` 按 `currentSnapshot.conversationHistoryLength` → `nextSnapshot.conversationHistoryLength` 切片发送。切片的正确性依赖快照机制（见 CAP-09 / 调试迭代簇），无文档约束；若快照长度因 rerun 分支错位，发出去的就是错误的消息段。
- **【口径失真】环境层面**：本环境 Hindsight 不可达，适配器从未真实运行（`docs/audit/runnability-baseline.md`）。本能力全部结论为静态分析。

---

## CAP-09 变量有层级

### 1. 实现度

**端到端可用（读取侧）／部分可用（写入侧——四层里两层从来不会被写入）**

**读取侧完整且真的四层**：`variable-scope-resolver.ts:72-94` `resolveVariable` 的 `searchOrder` 是 topic > phase > session > global（`:74-79`），逐层 `lookupVariable`（`:240-267`）。这条链被 PromptTemplate 的替换消费，端到端成立。

**写入侧只有两层可被触达**：

- 生产链路里唯一的两次变量写入是 `script-executor.ts:371`（`writeVariableToScope`）与 `:1245`（`processExtractedVariables`），两者都先 `scopeResolver.determineScope(varName)` 再 `setVariable`。
- `determineScope`（`variable-scope-resolver.ts:102-114`）的逻辑：有定义则返回 `definition.scope`（`:104-106`），否则**返回 `VariableScope.TOPIC`**（`:113`）。
- 而定义从哪来？全仓 `setVariableDefinitions`（批量，`:226`）**只在 `packages/core-engine/test/integration/output-list.test.ts:100` 被调用**——生产链路零调用。生产链路里唯一的定义注册是 `ai-ask-action.ts:872-885`：ai_ask 从自己的 `output` 配置**自动注册**，scope 取 `isGlobalVariable(varName) ? GLOBAL : TOPIC`（`:876-878`）。
- 再全仓 `grep` `VariableScope\.(GLOBAL|SESSION|PHASE|TOPIC)`：src 下只有三个命中——`variable-scope-resolver.ts:113`（默认 TOPIC）、`ai-ask-action.ts:877-878`（GLOBAL/TOPIC）。

**结论：生产代码从不给任何变量指派 `session` 或 `phase` 作用域。** 「四层」在读取顺序上成立、在 `setVariable` 的 switch（`:278-370`）里四个分支都写了、在 `validateStoreStructure`（`:121-159`）里四个桶都必须存在（`:125` 要求 `['global','session','phase','topic']`），但**写入侧只有 TOPIC 和 GLOBAL 两个可达**。session 层唯一的写者是 `migrateToVariableStore`（`:388-411`，扁平变量 → session，`source: 'migrated'`，从 `script-executor.ts:503` 的 `migrateIfNeeded` `:426-430` 调用）——那是**迁移兼容路径，不是正常路径**。

**GLOBAL 层的额外链路**：`script-executor.ts:402-420` `configureScopeResolver` 从 `executionState.metadata.globalVariableDefinitions` 读全局定义并 `registerGlobalVariables`（`:412`）；定义由 `session-orchestrator.ts:200-201`（initializeSession）与 `:308-309`（processUserInput）从 `loadGlobalVariables` 取来，塞进 `session.metadata.globalVariableDefinitions`（`:226`、`:321`）。写入时经 `onGlobalVariableChange` 回调（`variable-scope-resolver.ts:355-363`）→ `globalVariableCallback`（`session-orchestrator.ts:227-247`、`:322-342`）→ `repository.persistGlobalVariable` → `user_global_variables` 表。

**关于「变量有层级」这项能力的用户可见性**：用户能用到的是「同一个变量名在不同层取到不同的值，且近的赢」——**读取侧可用**。用户用不到的是「系统会把某个变量自动放在 session 层或 phase 层」——**不存在**。`determineScope` 的默认值是 TOPIC，所以 ai_ask 提取的变量（除全局变量外）**全部落在当前话题**，换个话题就取不到了。这是否是设计意图，无文档裁决（见 §3）。

### 2. 涉及的领域概念

**战略层**

- **Variable System** 限界上下文（Supporting）。红线 A3（`architecture-constraints.md:18`）列出。
- **红线 B3 已修订为三层**：`docs/design/foundation/architecture-constraints.md:28` 现为「**变量作用域三层**：读取优先级 topic > phase > session；写入位置由 `determineScope()` 决定，不可跨层写入。**global 层取消**——跨会话状态唯一权威为信息点文档（007 ADR 决策 2）」。
- **代码仍是四层 + 一张 `user_global_variables` 表。** 这是本簇最尖锐的代码/文档背离（`docs/audit/mess-map.md` MESS-C-09 已记）。距离 ADR 007 有多远，逐条对照：

| ADR 007 要求                    | 代码现状                                                                                                                                                                                          | 差距                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 取消 global 作用域              | 四层解析器完整保留（`variable-scope-resolver.ts:74-79`、`:125`）                                                                                                                                  | 解析器未动                |
| 取消 `user_global_variables` 表 | 表在（`db/schema.ts:309-329`），有唯一索引 (userId, projectId)；读写都在（`session-repository.ts:207-290` 读、`:390` 附近写；`session-orchestrator.ts:227-247`、`:322-342`、`:500-523` 三处回调） | 表未删、读写未断          |
| 取消脚本层全局声明              | `config/project-defaults/global.yaml` 仍在；`loadGlobalVariables`（`session-repository.ts:207-290`）仍从 `scriptFiles` 里找 `fileType='global'` 的行解析 `variables[]`（`:236-237`、`:249-250`）  | 声明机制仍在用            |
| 跨会话状态迁移到信息点文档      | **代码中不存在任何信息点文档机制**                                                                                                                                                                | 目标态未开始              |
| bridge 双路径与合并策略删除     | `variable-memory-bridge.md` 已裁决（007 优先），代码无 bridge 路径                                                                                                                                | 一致                      |
| 异步 recall 不再写变量          | `session-orchestrator.ts:253-265` 的 recall 只写 `metadata.memoryContext`，**不写变量**                                                                                                           | **一致**（决策 6 已落地） |

**距离结论**：ADR 007 决策 6（异步 recall 不写变量）**已落地**；决策 2（取消 global）**完全未动**——代码处于「四层照旧运行 + 目标态未开始」的状态。这不是「做了一半」，是「起点未动」。ADR 007 自己在后果段（`docs/design/decisions/007-variable-document-boundary.md:77`）把这件事列为「迁移成本——global.yaml、`user_global_variables` 表、四层解析器、存量脚本全局声明（独立 [feature] 故事）」——**该 feature 故事尚未排期**。

**战术层**

| 概念                       | 类型                                      | 代码位置                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VariableScopeResolver`    | 领域服务                                  | `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`（`resolveVariable` `:72`、`determineScope` `:102`、`setVariable` `:278`、`lookupVariable` `:240`、`validateStoreStructure` `:121`） |
| `VariableScope`            | 枚举 / 值对象                             | `shared-types`；四个成员 `global/session/phase/topic`（`db/schema.ts:36` `variableScopeEnum` 同构；用于 `db/schema.ts:253`）                                                                                     |
| `VariableDefinition`       | 值对象                                    | `variable-scope-resolver.ts:213-229`（`setVariableDefinition` / `setVariableDefinitions`）                                                                                                                       |
| `VariableStore`            | 值对象（四桶）                            | 默认结构 `session.ts:274-279`；校验 `variable-scope-resolver.ts:121-159`                                                                                                                                         |
| 变量条目                   | 值对象                                    | `{value, type, source, lastUpdated, scope}`（见 `session.ts:285-291` 的 `global_sync` 构造）                                                                                                                     |
| `onGlobalVariableChange`   | 端口回调（函数类型）                      | `variable-scope-resolver.ts:57`；触发 `:355-363`；注册 `script-executor.ts:418-420`                                                                                                                              |
| `persistGlobalVariable`    | 仓储写方法                                | `session-repository.ts`（`ISessionRepository:43-122` 内声明）                                                                                                                                                    |
| `variables` 表             | 持久化模型（**无对应领域概念**）          | `db/schema.ts:244-269`                                                                                                                                                                                           |
| `user_global_variables` 表 | 持久化模型（对应被 007 取消的 global 层） | `db/schema.ts:309-329`                                                                                                                                                                                           |

**「按设计文档的说法，4 层作用域的实现是否对得上」——答：对不上，两个方向都对不上。**

- **方向的 A**：文档（红线 B3）说三层，代码四层。
- **方向的 B**：`docs/ddd/contexts/variable-system.md` **仍在描述四层并且把它们当作生效机制**：`:32-38` 画出 topic > phase > session > global 的完整优先级；`:45`「全局变量触发 `onGlobalVariableChange` 回调 → 持久化到 `user_global_variables` 表」；`:63`「`VariableScope` enum | `shared-types` | global / session / phase / topic」。**这份 DDD 上下文文档与已修订的红线 B3 直接矛盾，且与 `docs/design/README.md:57` 所记「007 已修订 B3」的状态不符。**

所以现状是：**同一仓库里，DDD 文档说四层、红线说三层、代码做四层、`determineScope` 只能产出两层。**

### 3. 对应设计文档

| 文档                                                      | status                                                                                                                      | 与代码的关系                                                                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/design/decisions/007-variable-document-boundary.md` | ADR（无 frontmatter status；`docs/design/README.md:57` 登记「变量职责收缩：跨会话状态唯一权威为信息点文档，全局变量取消」） | 决策 2（`:22-24` 取消 global 与 `user_global_variables` 表）：**代码未动**。决策 6（`:68-72` 取消异步 recall 覆盖变量）：**代码一致**。后果段（`:76-78`）明确「变量作用域四层变三层」「红线修订…已获人确认」 |
| `docs/design/foundation/architecture-constraints.md`      | `draft`（`docs/design/README.md:20`，注明由 007 触发 B3 修订）                                                              | B3（`:28`）**已改为三层**，与代码不符；A7（`:22`）仍写 `SessionManager`                                                                                                                                      |
| `docs/ddd/contexts/variable-system.md`                    | —（`docs/ddd/` 无 status 体系）                                                                                             | **与 007 和红线 B3 矛盾**（见 §2 方向 B），且 `:82` 已自行记录「全局变量语义值混存」问题                                                                                                                     |
| `docs/design/foundation/ubiquitous-language.md`           | —                                                                                                                           | `docs/audit/domain-ledger.md` 记 `:106` 仍写四层变量作用域，与 ADR 007 冲突                                                                                                                                  |
| `docs/design/memory/variable-memory-bridge.md`            | `decision-recorded`（`docs/design/README.md:29`）                                                                           | 含显式裁决：与 007 冲突处以 007 为准                                                                                                                                                                         |
| `docs/design/memory/memory-framework.md`                  | `decision-recorded`（`README.md:26`）                                                                                       | 记忆侧变量交互，与 007 一致                                                                                                                                                                                  |

**代码与文档是否一致**：**不一致**，且是**双向不一致**——红线说三层（代码四层），DDD 上下文文档说四层（红线说三层）。第三方（`CLAUDE.md`）说四层：「**variable-scope** — 4-level hierarchy: global → session → phase → topic」。四个出处、三种说法。

**`docs/ddd/` 是否描述本能力**：**是，且比 `docs/design/` 更详细**——`docs/ddd/contexts/variable-system.md:32-45`、`:63` 完整描述四层与持久化。这是四条能力里 `docs/ddd/` 覆盖度最高的一条（`docs/audit/domain-ledger.md` §1.0 记 `docs/ddd/` 对引擎领域关键词近乎零命中，变量系统是例外）。代价是：**这份详细描述现在是过期的**。

### 4. 缺口

**指定问题：`variables` 表与 `user_global_variables` 表的分工？**

- **`user_global_variables`（`db/schema.ts:309-329`）** = `user_global_variables` 的**跨会话**存储，主键语义 (userId, projectId)，存 `variables` jsonb。**写**：`session-orchestrator.ts:227-247`、`:322-342`（全局变量回调）、`:500-523`（PATCH 走 script 的 `project:` tag 解析 projectId）。**读**：`session-repository.ts:207-290` `loadGlobalVariables`。**这是一条活链路**——读写都在，是 ADR 007 要拆除的那条。
- **`variables`（`db/schema.ts:244-269`）** = 会话内变量**快照表**，且**是只写的**。见下。

**指定问题：`variables.round` 谁写、谁读？**

- **写者唯一**：`session-variable-utils.ts:314-352` `buildVariableSnapshotsFromSession`，`:333-336`：
  ```ts
  const round =
    (session.metadata.actionRoundInfo as any)?.[actionId]?.currentRound ||
    (session.metadata.lastActionRoundInfo as any)?.currentRound ||
    1;
  ```
  调用点三处，全在 `session-orchestrator.ts`：`:278`（initializeSession）、`:413`（processUserInput）、`:658`（rerunAction），经私有方法 `:145-147`。
- **读者：零。** 全仓 `grep`：`variables` 表的唯一写路径是 `session-repository.ts:319-324` `saveVariableSnapshots`（裸 `db.insert(variables).values(snapshots)`），**没有任何 `select ... from variables`**。`GET /api/sessions/:id/variables`（`routes/sessions.ts:670-706`）返回的是 `session.variables`——`sessions` 表上那个扁平 jsonb 列（`db/schema.ts:69`），**不是这张快照表**。
- 更要注意这张表**每行存的是什么**：`:338-351` 每次调用只产生**一行**，`variableName` = `actionId`（不是变量名）、`scope` 硬编码 `'session'`（不是真实作用域）、`valueType` 硬编码 `'object'`、`value` 是**全部四层的完整扁平快照**（`:319-328` 把 `global/session/phase/topic` 四桶拍平成一个对象）。也就是说：表的 schema 形状（按变量名、按作用域、按轮次）与实际写入（按 action、恒 session、整包快照）**根本不匹配**，`scope` 列与 `round` 列因此不承载它们名字所承诺的语义。

**缺口清单**

- **【没做】ADR 007 决策 2 未动工。** global 层、`user_global_variables` 表、脚本全局声明、四层解析器全部照旧运行。ADR 自己说这需要一个独立 feature 故事（`007:77`），**该故事不在 sprint**。这是本簇最大的一块已封板未执行的工作。
- **【做了但接不上】`variables` 表是纯写放大。** 每次 Action 完成写一行完整四层快照，无读者、无清理策略、无 TTL。表随会话数线性增长，且 `round` / `scope` / `variableName` 三列的语义与写入内容不符（见上）。**这是一张写进去就再也不看的表**——要么该接上（变量调试面板的事实源），要么该删。
- **【做了但接不上】变量轮次 diff 恒以 `null` 为基准。** `prevVariableSnapshots` 是 `SessionOrchestrator` 实例字段（`session-orchestrator.ts:39`），路由每请求 `new SessionOrchestrator()`（`routes/sessions.ts:96`、`:602`、`:768`、`:868`），故 `session-response-builder.ts:189` 恒取到 `undefined`，`:190-198` 的 `roundChanges` 每次都按「从零开始」算。`routes/chat.ts:6` 用模块级单例，行为反而不同。**与 CAP-07 缺口同源。**
- **【没做 / 语义存疑】session 层与 phase 层无写入方。** `determineScope` 默认 TOPIC（`variable-scope-resolver.ts:113`），唯一注入来源是 ai_ask 的 output 自动注册（`ai-ask-action.ts:872-885`），且只产出 TOPIC 或 GLOBAL。**没有任何机制把变量放进 session 或 phase 层。** 红线 B3 说「写入位置由 `determineScope()` 决定」——`determineScope` 事实上只能在两层里选。这是「四层作用域」这个能力名的最大实现空洞：**读四层、写两层**。
- **【没做】`setVariableDefinitions` 批量接口无人调用。** 脚本里声明的变量定义从未批量灌进 resolver（唯一调用在测试 `packages/core-engine/test/integration/output-list.test.ts:100`）。所以变量的作用域声明事实上只能来自：(a) `globalVariableDefinitions` 经 metadata（`script-executor.ts:408-412`），(b) ai_ask 的 output 自动注册。**脚本层的 `define` 声明没有进入作用域判定的通路。**
- **【口径失真】四个出处三种说法。** 红线 B3 = 三层；`docs/ddd/contexts/variable-system.md:32-45,63` = 四层；`CLAUDE.md` = 四层；代码 = 四层（写两层）。`docs/audit/domain-ledger.md` 记 `ubiquitous-language.md:106` 亦为四层。
- **【没做】无跨层覆写约束。** 红线 B3 写「不可跨层写入」，`setVariable`（`:278-370`）确实按 scope 分派到对应桶，但没有任何检查阻止同一变量名在多桶里各存一份——`resolveVariable` 的「近的赢」意味着远层的值会**静默失效**且不可见。global 层的重复值守卫（`:344-348`）是唯一的冲突检测，仅覆盖 global。
- **【移植风险】`migrateToVariableStore`（`:388-411`）把扁平旧变量一律塞进 session 层。** 对旧数据这是合理的，但它同时是**唯一往 session 层写值的代码**——若将来有人误以为 session 层在用，看到的就是这批 `source: 'migrated'` 的历史值。

---

## 本簇未解问题

0. **【跨能力·最优先】安全兜底没有红线条目、没有机制文档、没有单一出处。** 一段人工红线拷贝在两个模板（`ai_say_v1.md:3-27`、`ai_ask_v1.md:84-104`）与一个夹具（`docs/design/memory/fixtures/ai-ask-judgment-prompt-fixture.md:174-190`）里，且三份互相矛盾。需要人裁决：安全边界是「提示词层的软约束」（现状）还是「引擎层的硬不变量」？若是后者，红线 B 段需要一个新条目，且 `confirmSafetyViolation` / `generateSafeFallbackResponse` 需要接线。
1. **【跨能力】应用服务层的边界该划在哪。** `SessionManager` 拆成四个文件后，领域职责没有变薄（记忆时序、变量持久化、rerun 分支仍内联在 `SessionOrchestrator`）。`docs/ddd/strategic-design.md:266-270` 的 M1 建议抽 `MemoryLifecycleService` + `SessionPersistenceService`——是否采纳？**本簇两条缺口（recall 时序错位、`prevVariableSnapshots` 实例态失效）都是这一个结构问题的症状**，建议作为同一件事处理。
2. **【CAP-07/09】`SessionOrchestrator` 的实例生命周期该由谁定。** 路由每请求 new、`chat.ts` 却用模块级单例，导致同一业务链路两个入口行为不同。这是容器边界问题（`container.ts`），不是某个方法的 bug。
3. **【CAP-07】断点粒度是 Action，不是对话轮。** 用户在 `ai_ask` 多轮追问中间离开，回来恢复整个 Action。产品上是否可接受？无裁决。
4. **【CAP-07】恢复语义无文档。** `fromSessionData` 的合并顺序（global 覆盖 vs 被覆盖，`session.ts:283-294` 只在不冲突时写入）、superseded 过滤（`session-repository.ts:186-188`）、`variableStore` 四桶缺失回填——这些是恢复行为的实质，全部只存在于代码里。红线 A6 只定了状态机形状。
5. **【CAP-07】并发与幂等无任何保护。** 双请求覆盖写、崩溃后重试产生重复用户消息。是否需要会话锁/幂等键？需要裁决（涉及 DB schema 变更）。
6. **【CAP-08】记忆降级的可观测面该长什么样。** 现在 Hindsight 全程不可达与「新用户无记忆」不可区分。需要裁决：健康标记进响应？进 metadata？进指标？（红线 D3 只说「不中断」，未说「不留痕」。）
7. **【CAP-08】`recall` 时序错位的修复方式。** 是简单前移（`session-orchestrator.ts:253-265` 提到 `:250` 之前），还是随 M1 重构一起做？另：recall 是否应该在 `processUserInput` 里也发生（长会话跨天）？
8. **【CAP-08】`reflect` 的触发面。** 停在 `WAITING_INPUT` 的会话永不 reflect。需要会话关闭钩子 / 超时 / 后台补偿任务中的哪一个？`reflect` 是否该带 query（端口支持，`memory-repository.port.ts:177` 第二参数可选，应用层不传）？
9. **【CAP-08】`source_credibility` 恒为 `'high'`。** D5 要求来源标注，代码给常量。标注的分级规则由谁定——脚本声明？Action 类型？LLM 判断？
10. **【CAP-09·最大块】ADR 007 决策 2 的执行故事在哪里。** global 层、`user_global_variables` 表、脚本全局声明、四层解析器、`variable-memory-bridge` 存量——ADR（`007:77`）自己说需要独立 feature 故事，**故事不存在**。同时 `docs/ddd/contexts/variable-system.md:32-45,63` 与 `ubiquitous-language.md:106` 需要随 007 一起改（现在它们在教读者四层）。这是本簇唯一一块「已封板但未排期」的工作。
11. **【CAP-09】`session` 层与 `phase` 层该由谁写。** 现在没有任何写入方，`determineScope` 只能产出 TOPIC/GLOBAL。若四层是设计意图，需要一条「变量落在哪一层」的声明通路（脚本声明？Action 配置？提取规则？）——`setVariableDefinitions` 批量接口已存在但生产链路无人调用（`variable-scope-resolver.ts:226`，仅测试命中）。**若三层是设计意图（红线 B3），那要拆的是 GLOBAL，而 SESSION/PHASE 的写入通路仍缺——两条路都缺一块。**
12. **【CAP-09】`variables` 表的存废。** 纯写放大、无读者、`round`/`scope`/`variableName` 三列语义与写入内容不符。是接上（作为变量调试面板的事实源，同时修 `prevVariableSnapshots` 的实例态问题）还是删掉？需要裁决。
13. **【口径】红线 A7 与 `CLAUDE.md` 的 `SessionManager` 未更新。** `architecture-constraints.md:22` 与 `CLAUDE.md` 9 处引用一个不存在的类，且 `CLAUDE.md` 列出的 `restoreExecutionState` / `updateSessionState` 两个方法已不存在。这是「文档门面」问题，但它挡住的正是本簇（会话与状态）的入口。
14. **【方法】本簇全部结论为静态分析。** 本环境 PostgreSQL / Redis / Hindsight 均不可达，`pnpm test` 禁用（会真实调用付费 LLM），HTTP 路由层 2,872 行零测试。CAP-07「端到端可用」、CAP-08「降级不可观测」两条结论**未经运行时验证**，建议在可运行环境用一条真实会话复核。
