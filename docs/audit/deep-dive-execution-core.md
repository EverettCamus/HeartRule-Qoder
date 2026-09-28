# 执行内核能力深挖（S1' · 波次 2）

> **镜头**：`docs/audit/capability-inventory.md` 已按「用户能用到什么」给出 16 条能力的三档评级。本文对它分配给「执行内核」簇的 **CAP-01 ~ CAP-04** 做四问深挖：实现程度（复核清单的档位）、领域概念（战略/战术）、设计文档（名实核对）、缺口（「没建」vs「建了没接」）。
> **口径**：实现程度按**用户能用到什么**算，不看代码写了多少。三档：端到端可用 / 部分可用（写清缺口）/ 桩或不可达。
> **证据**：每条结论带 `文件:行号`。本文只读，未改动任何代码与已有文档；唯一新增文件即本篇。
> **读法**：与清单不一致处已显式标出（CAP-02 档位、CAP-03「三策略」口径）。跨能力的「模板模式 vs 非模板模式」对照单列一节（清单 §4.4 交办）。
> **未覆盖**：会话状态桥（CAP-07）、变量四级作用域（CAP-09）、记忆（CAP-08）、监控反馈（清单 §二第 3 行）、安全兜底（CAP-06）分属同批其他簇；本文只在它们与 CAP-01~04 直接相交时引用。

---

## CAP-01 领域专家写一份 YAML 脚本，引擎跑完一次咨询

### 一、实现程度

**端到端可用**（与清单 `capability-inventory.md:13` 一致）。但「脚本合法」的判据只在**保存期**，不在**执行期**——这是本条能力最实质的缺口。

主链路（一次 HTTP 请求 = 一个 AI 回合，跨请求由 api-server 的状态桥接续）：

| 环节                | 位置                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML → JSON         | `api-server/src/services/session-orchestrator.ts:112`（`yaml.parse`）后 `JSON.stringify`                                                                                               |
| 建 Session 聚合     | `session-orchestrator.ts:87` / `:215`（`Session.fromSessionData`）                                                                                                                     |
| 出聚合 → 执行态     | `session-orchestrator.ts:123`（`session.toExecutionState()`）                                                                                                                          |
| 执行                | `session-orchestrator.ts:124-131` → `script-executor.ts:427` `executeSession(scriptContent, sessionId, executionState, userInput, projectId, templateProvider)`                        |
| 回写聚合            | `session-orchestrator.ts:132`（`session.applyExecutionResult`）                                                                                                                        |
| 解析脚本            | `script-executor.ts:497-529` `initializeSession`：`:505` `JSON.parse(scriptContent)`、`:506-507` `parsed.session.phases`                                                               |
| 阶段循环            | `script-executor.ts:676-725` `executeAllPhases` → `:880-905` `executePhase` → `:942-1086` `executeTopic`                                                                               |
| 动作推进            | `:1091-1129` `handleActionNotCompleted` / `:1134-1211` `handleActionCompleted` → `:1267-1284` `moveToNextAction` → `:1289-1321` `executeAction` → `:1326-1360` `continueAction`        |
| 动作实例化          | `:1367-1389` `createAction` → `application/actions/action-factory.ts:63-79` → `action-registry.ts:17-23`（只有 ai_say / ai_ask / ai_think）；`:41-42` 未知类型抛 `Unknown action type` |
| 续跑（ai_ask 特例） | `:535-602` `resumeCurrentActionIfNeeded`，`:587-590` 对 ai_ask 的续接分支                                                                                                              |

清单未点出的两处**结构性缺口**：

1. **执行期不校验。** `YAMLParser` 会调 `schemaValidator.validateSessionOrThrow`（`engines/script-execution/yaml-parser.ts:3,38`），但 `YAMLParser` 的引用**只出现在 `__tests__`**（`engines/script-execution/__tests__/yaml-parser.test.ts:3`、`yaml-parser-integration.test.ts:8`、`yaml-parser-technique-validation.regression.test.ts:27`），生产链路一次都没构造过它。生产里的 schema 校验只发生在保存/导入侧：`api-server/src/routes/scripts.ts:49`、`:226`、`:335`，编辑器 `script-editor/src/services/validation-service.ts:62`。
   → 后果：直接改库的脚本、历史遗留脚本可以带着非法配置一路跑完，**非法字段被静默忽略**（下条）。
2. **schema 的 `default` 不生效。** AJV 实例未开 `useDefaults`（`adapters/inbound/script-schema/validators/schema-registry.ts:46-51`：只有 `allErrors/verbose/strict/validateFormats`）。因此 `ai-ask.schema.json:34` 的 `max_rounds: 100` 只是文档，不会落到配置里——这一条直接决定 CAP-03 的兜底是否存在（见 CAP-03 §一）。

### 二、涉及的领域概念

**战略层（限界上下文 / 聚合 / 聚合根）**

- 「咨询会话」限界上下文 = `packages/core-engine`；聚合根声明在 `domain/session.ts:53`（`Session`），状态机 `:121-153`，位置 `:157-160`，变量 `:164-171`，对话 `:175-178`，动作 `:182-185`。
- **名实核对**：`Session` 在生产里确实被实例化（`session-orchestrator.ts:87,215`），不变量也挂在它身上，但它在主链路上是**状态载体/桥**而非行为边界：活的执行态是 `ExecutionState`（`script-executor.ts:427` 入参），跑完由 `session.ts:231-251` `applyExecutionResult` **整体拷回**。推进逻辑（谁先谁后、何时前进）全在 `ScriptExecutor`，不在聚合内。
- `Script`（`domain/script.ts:7-94`）**生产零实例化**：`new Script(` 只出现在 `domain/__tests__/script.test.ts:8,22,36,49`；仅 barrel 导出（`src/index.ts:100`）。
- `CLAUDE.md` 的领域目录树写 `script.ts  # Script, Phase, Topic value objects`——**该文件里没有 Phase/Topic 类**，全篇只有 `Script` 一个类（`domain/script.ts:1-95`）。Phase / Topic 在代码里始终是**未类型化的 JSON**（`script-executor.ts:507` `sessionData.phases`，`executeTopic` 直接消费普通对象）。

**战术层（实体 / 值对象 / 领域服务 / 端口 / 领域事件）**

| 战术构件           | 代码落点                                                                                                                                                | 实况                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 实体               | `Session`（`domain/session.ts:53`）                                                                                                                     | 唯一在产实体；其余见下                                                                                                                             |
| 实体（声明但不用） | `Message`（`domain/message.ts`）                                                                                                                        | 只被 `src/index.ts:97` barrel 导出；api-server 用的 `Message` 类型来自 `shared-types/src/domain/message.js`（`api-server/src/api/responses.ts:3`） |
| 值对象             | `ActionContext` / `ActionResult`（`base-action.ts:44-69` / `:92-102`）                                                                                  | 是 interface 而非 VO 类；Phase/Topic 是 JSON                                                                                                       |
| 领域服务           | `ExitDecisionEngine`（`engines/exit-decision/exit-decision-engine.ts:17`）+ `RuleBasedEvaluator`（`rule-based-evaluator.ts:15`）                        | 只服务 ai_ask 一个动作（见 CAP-02 §二：ai_say 的退出判断在基类里另写了一份）                                                                       |
| 端口               | `MemoryRepository`（`domain/ports/memory-repository.port.ts`）、`ILLMProvider`、`TemplateProvider`（`engines/prompt-template/template-provider.ts:22`） | 三者都在产；`TemplateProvider` 是唯一在 javadoc 里写明虚拟路径契约的端口                                                                           |
| 领域事件           | —                                                                                                                                                       | **代码里不存在**：无 `domain/events/`、无事件总线、无订阅点；`ubiquitous-language.md:124` 把「领域事件」列为术语，但无对应构件                     |

**dddd 分层自一致性：反了。** `domain/actions/*.ts` 直接 import 引擎——`ai-ask-action.ts:31` `import { ExitDecisionEngine } from '../../engines/exit-decision/index.js'`；`ai-say-action.ts` 在动作内 `new PromptTemplateManager` / `new TemplateResolver`（`:159`、`:550`）。也就是说「domain」层依赖「engines」层，而 `CLAUDE.md` 把 LLM 调用与模板解析划给 application/infrastructure。三个 Action 确实都 `extends BaseAction`（`ai-say-action.ts:137`、`ai-ask-action.ts:49`、`ai-think-action.ts:11`），继承关系成立；但基类同时背着退出决策、变量替换、安全扫描三件不同层级的活（`base-action.ts:511-585`、`:209-289`、`:622-710`）。

### 三、对应设计文档

| 文档                                                                                       | status                                                    | 名实核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/foundation/script-engine-design-principles.md`                                | `decision-recorded`（`:2`，v0.6.0）                       | **基本相符，但边界表的口径偏乐观**。`:143-151` 三种动作类型 = 代码三种 ✓；`:434`「退出条件 (`exit_condition`) ✅ 已有」✓（`ai-ask.schema.json:18-22` 确有此字段）；但 `:432`「`expand_by` 主题展开 ✅ 设计中」与 `:207`「无 for/while → 用 `expand_by` 替代」是**纯设计**：全 schema 检索 `expand_by` / `item_variable` **零命中**（`script-schema/**` 仅 `phase.schema.json:30 entry_condition`、`ai-ask.schema.json:18 exit_condition`、`base.schema.json:20 condition`），core-engine 与 api-server 源码亦零命中 |
| `docs/design/topic/topic-queue-implementation.md`                                          | `decision-recorded`（`README.md:36`，挂 ADR 001/002/003） | **名实分离最重的一篇**。`:129-149` 定义 `expand_by` 两阶段展开；`:347-359` 标题「与现有代码的对接」列出**新增文件** `domain/agenda.ts`、`application/preparation/agenda-preparer.ts`、`agenda-serializer.ts`——**这三个文件全仓不存在**（`find packages -name "agenda*"` 零结果），`domain/session.ts` 也无 `agenda` 字段。`:367` 的 Phase 1（MVP）范围含「议程驱动执行循环」，实际执行循环是 `script-executor.ts:676-725` 直读脚本 JSON。封板状态与零代码并存（这一点与「议程」簇、意识簇重叠，本文只登记）         |
| `docs/ddd/contexts/consulting-session.md`                                                  | 无 frontmatter（`:4` Updated 2026-06-05）                 | 大体相符：`:59-62` Action 继承树 ✓；`:50-51` `ActionContext/ActionResult` ✓；但 `:13-19` 写「`variableStore`: 4 层作用域」，与 ADR 007（B3 三层）冲突（已由 domain-ledger T7 登记）；`:106` 称 ScriptExecutor「约 1400 行」，实际 1419 行                                                                                                                                                                                                                                                                           |
| `docs/design/foundation/ubiquitous-language.md`                                            | `decision-recorded`（`README.md:17`）                     | `:41-45` 定义动作四态 Ask/Say/Think/**Form**——代码只有三态（`action-registry.ts:17-23`），Form 仅在 `use-skill.schema.json` 旁支。`:106` 变量作用域写「四层：话题 > 阶段 > 会谈 > 全局」，与 ADR 007 冲突（domain-ledger T6b）                                                                                                                                                                                                                                                                                      |
| `docs-archive/misc/Heart Rule脚本定义需求.md` ≡ `legacy-script-definition-requirements.md` | 归档（正文 0 差异，domain-ledger §4.3）                   | 是 DSL 需求的祖本；`script-engine-design-principles.md:467-472` 的版本历史（2026-07-14 起）显示二者非直系，祖本里的旧语法未进入现行 schema                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/design/foundation/consulting-intelligence-mechanism.md`                              | `draft`                                                   | `:25` 演进注记已声明旧语法作废、动作名映射到三态；`:` 上无冲突                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### 四、缺口

**没建**：Action 级 `condition`（schema 允许——`actions/base.schema.json:20-23`——但 engine 对 `condition` **零处理**，core-engine 全 `src` grep `condition` 命中 0；即「schema 合法但静默忽略」）；`expand_by` / `item_variable`；`phase.schema.json:30-33` 的 `entry_condition`（无约束、无实现）；Phase/Topic 领域对象；领域事件；议程/意识层（清单 §三第 1 行）。

**建了没接**：执行期 schema 校验（`yaml-parser.ts:38` 仅测试可达）；`TopicPlanner`（`script-executor.ts:227,282-285` 已注入，但实现是深拷贝原样返回——清单 `:39`）；`use_skill`（schema 有 `use-skill.schema.json`，注册表 `action-registry.ts:22` 被注释掉）。

**口径缺口**：`CLAUDE.md` 领域目录树的 `script.ts # Script, Phase, Topic value objects` 三缺二；`ubiquitous-language.md` 的动作四态 vs 代码三态。

---

## CAP-02 让 AI 按脚本「说话」：一轮轮表达，说到达标就自动收尾（ai_say）

### 一、实现程度

**部分可用**——**与清单 `capability-inventory.md:14` 的「端到端可用」不一致**。清单描述的判据是「AI 自行判断『这句话说透了没有』，说透了就进入下一步」；代码里的实际情况是：**唯一能自动收尾的机制是 `max_rounds` 轮次上限**，语义判据全部失效。逐条证据：

1. **模式闸门**：`ai-say-action.ts:165-166` `useTemplateMode = (max_rounds !== undefined) || (exit_criteria !== undefined)`。但 `actions/ai-say.schema.json:7-30` 只允许 `content` / `tone` / `exit` / `max_rounds`（`:30` `additionalProperties: false`），**`exit_criteria` 不是合法字段** → 在现行 schema 下模板模式**只能由 `max_rounds` 打开**。「`exit_criteria`」只出现在旧 DSL 样例（`scripts/sessions/test_ai_say_basic.yaml:33-37`，该文件用 `sessions:` / `steps:` 旧结构，过不了现行 `session.schema.json:7,11`）。
2. **退出源声明**：`:169-172` `enabledSources = ['max_rounds', 'exit_criteria', 'llm_suggestion']`——**没有 `exit_flag`**。
3. **于是 LLM 的退出意图到不了判断**：`base-action.ts:541-551`（`exit_flag` 分支）永不进入；`llmOutput.exit` 只被用来填 `exit_reason`（`ai-say-action.ts:297-298`）。
4. **`exit_criteria` 分支是死代码**：`base-action.ts:553-564` 调 `evaluateExitCriteria`，后者硬编码返回 `{should_exit:false, reason:'退出条件不完整'}`（`:594-608`，`:603-607` 是唯一 return）；而 `:561` 恰好以 `criteriaResult.reason !== '退出条件不完整'` 作为「应当返回」的条件 → 该分支**永远不返回**。
5. **`llm_suggestion` 分支读错字段名**：`base-action.ts:568` 读 `should_exit` / `shouldExit`，而默认模板 `config/prompt-defaults/ai_say_v1.md` 从不要求这个字段——它要求的是 `EXIT`（`:73` 的 JSON 样例、`:103` 字段说明、`:135` 退出判断规则）。
6. **即便打开 `exit_flag` 也读不到**：模板输出**大写** `EXIT`（`ai_say_v1.md:73`），`MainLineOutputSchema` 把大写 `EXIT` 与小写 `exit` **分别声明**（`ai-say-action.ts:120` vs `:102`），而判断只读小写（`base-action.ts:542` `llmOutput.exit`）。改名源头可追到归档设计：`docs-archive/misc/ai_say提示词模板示例.md:221-231` 的主线 A 包络写的是 `"exit": true|false`（小写布尔，与代码一致），现役模板改成了大写字符串、代码没跟。
7. **模板变量不闭合**：`ai_say_v1.md:64`、`:135` 都要求 `{{understanding_threshold}}`，但两个变量构造器都不提供——`extractScriptVariables`（`ai-say-action.ts:605-614`）只给 common profile + `topic_content`；`buildSystemVariables`（`:619-631`）只给 `time/who/user/chat_history/tone/topic_content/current_round/max_rounds/memory_context`。`substituteVariables`（`base-action.ts:209-289`，`:248-259` 走 scopeResolver）会在脚本恰好定义同名变量时替换，否则该占位符**以字面量留在提示词里**。
8. **实际收尾逻辑**：模板模式下 `completed` 只有两条来源——「提前退出」（`:334` `isEarlyExit`，因上述原因恒 false）或 `currentRound >= maxRounds`（`:295`、`:316-318`、`:344-359`，护栏在 `:214-231`）。默认 `maxRounds = 20`（`base-action.ts:165`）。**用户拿到的是「说满 N 轮就前进」，不是「说透了就前进」。**
9. **唯一真实的提前退出路径**：若某套 custom 层模板自己要求 LLM 输出 `should_exit`，`llm_suggestion` 分支（`base-action.ts:567-577`）会命中。两层模板机制允许领域专家改写（`template-resolver.ts:92-134`）——**即这条能力目前只对「自己另写模板的人」成立**。

**非模板模式（legacy）也走得通，但语义不是「达标」**：`executeLegacyMode`（`ai-say-action.ts:406-521`）读 `require_acknowledgment`（`:417`，**默认 true**），第一轮发出内容后 `completed:false` 等确认（`:486-505`），用户**任意回一句**即 `completed:true`（`:426-440`）。而 `require_acknowledgment` 不在 `ai-say.schema.json` 允许列表内 → schema 合法脚本永远走不到「无需确认」分支（`:507-520`）。旧 `content_template` 已被本仓库废弃注册表判废（`validators/deprecated-fields-registry.ts:26-33`），但 legacy 仍读它（`:413`）。

### 二、涉及的领域概念

- **「退出决策」这个领域服务的边界不自洽**。`ubiquitous-language.md:108` 定义「退出决策：判断当前动作是否可以结束。规则评估 + LLM 语义判断」，`:123` 把「退出决策引擎」列为领域服务；但生产里 `ExitDecisionEngine` **只被 ai_ask 引用**（`ai-ask-action.ts:31` 是唯一 import，`:61` 实例化，`:216` 调用）。ai_say 的退出判断是基类上的两个私有/受保护方法（`base-action.ts:511-585` + `:594-608`）。**同一个领域概念在代码里有两份实现、两套字段名、两套来源集合**——B 类「双权威」（见下方对照表）。这是清单 `mess-map.md` MESS-B 家族在本簇的落点。
- **动作的状态归属**：`currentRound` / `maxRounds` 是可变的动作状态（`base-action.ts:155-166`），由 `application/state/action-state-manager` 拍成快照存进 Session 元数据，并经 `session.ts:231-251` 整体回写——即「值对象」在 UL/`CLAUDE.md` 里被称作配置，在代码里却是有状态的实体行为。
- **端口**：`TemplateProvider`（`ai-say-action.ts:540` 从 `context.metadata` 取）与 `ILLMProvider`（经 `llmOrchestrator`）是本条能力真正在用的六边形接缝；`template_scheme` 走 `sessionConfig`（`:528-531`）。

**双权威对照（本簇必核项）**

| 维度                 | ai_say 的退出判断                                                        | ai_ask 的退出判断（`ExitDecisionEngine`）                                                                |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------- | --- | --------------------------- | ----------------------------------------------------------------- |
| 实现位置             | `base-action.ts:511-585`（基类方法）                                     | `engines/exit-decision/exit-decision-engine.ts:24-62`                                                    |
| 声明来源             | `ai-say-action.ts:171` `['max_rounds','exit_criteria','llm_suggestion']` | `ai-ask-action.ts:79` `['max_rounds','exit_flag','llm_suggestion']`（**仅装饰**，引擎不读 `exitPolicy`） |
| 实际读的 LLM 字段    | `should_exit` / `shouldExit`（`:568`）                                   | `exit`（`exit-decision-engine.ts:25`）                                                                   |
| LLM 字段实际是否存在 | **不存在**（模板给 `EXIT`）                                              | 存在（`ai_ask_v1.md:122`，schema 强制布尔→字符串 `shared-types/src/domain/ai-ask-output.ts:61-69`）      |
| 硬上限比较           | `currentRound >= maxRounds`（`:532`）                                    | `currentRound > criteria.max_rounds`（`rule-based-evaluator.ts:19`，**严格大于**）                       |
| 硬上限取值           | `config.maxRounds                                                        |                                                                                                          | config.max_rounds |     | 20`（`base-action.ts:165`） | `getConfig('max_rounds')` **无默认值**（`ai-ask-action.ts:1129`） |
| 结论                 | 只剩 `max_rounds` 生效                                                   | LLM `exit` + 两条规则，OR 关系（见 CAP-03）                                                              |

### 三、对应设计文档

| 文档                                                           | status                                   | 名实核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/topic/action-topic-boundary.md`                   | `draft`（`:2`，last_updated 2026-09-10） | `:54-56`「退出条件判断（自主决策）……严格按照 `exit_condition` 和 `max_rounds` 独立判断……Topic 层不干预」——**方向对、细节对不上**：ai_ask 近似（四级来源中的两级在产），ai_say 只实现 `max_rounds` 一级。`:22-26` 演进注记已把队列调整权改判给意识层（与代码无冲突，因为代码里没有意识层）                                                                                                                                                                                                         |
| `docs-archive/misc/ai_say提示词模板示例.md`（2352 行）         | 归档（domain-ledger A11）                | 主线 A 的 JSON 包络 `{response.咨询师, exit, exit_reason, risk_screening}`（`:221-231`，直读已核）= 代码读的字段名；现役模板 `ai_say_v1.md:71-96` 改成了 `content` / `EXIT` / `BRIEF` / `metrics` / `progress_suggestion` / `safety_risk` / `metadata.assessment`。**归档是被改名的源头，`docs/` 里没有记录这次改名**——CAP-02 §一 第 6 条的直接成因                                                                                                                                               |
| `docs-archive/misc/ai_say智能实现机制.md`（2610 行，最大单篇） | 归档（domain-ledger B3）                 | 三线（主线 A / 支线 B 分析 / 支线 C 风险 + 规则引擎）：现役代码只落地主线 + 监控模板（`config/prompt-defaults/ai_say_monitor_v1.md`）；支线 B 的「策略提示词注入」没有实现点。`backlog.md:29` 称其为「ai_say 三线旧稿」                                                                                                                                                                                                                                                                           |
| `_system/README.md:95-116`                                     | 活跃权威（domain-ledger 附录 A）         | 声称「所有咨询动作的 LLM 输出必须遵循统一的 JSON 格式」，含 `EXIT` / `BRIEF` / `safety_risk` / `metadata`；**落地的 ai_say 模板多出 `metrics` / `progress_suggestion` / `metadata.assessment`**（`ai_say_v1.md:75-96`），`_system/README.md` 全篇未提（mess-map MESS-C-08 的 ai_say 侧）。另：`:22`、`:31-33` 指向物理目录 `config/templates/default/`——**该目录不存在**，真目录是 `config/prompt-defaults/`（`api-server/src/services/project-initializer.ts:56`、`routes/projects.ts:166,817`） |

### 四、缺口

**没建**：`exit_criteria` 求值（`base-action.ts:594-608` 是占位）；ai_say 的 `exit_flag` 来源；`{{understanding_threshold}}` 的变量供给；安全拦截（命中违规只 `console.warn`，`ai-say-action.ts:278-284`，属 CAP-06）。

**建了没接**：`MainLineOutputSchema` 收了 `EXIT`（`:120`）、`metrics`（`:122`）、`progress_suggestion`（`:123`）却无人消费（只有 `metadata` 透传到返回值 `:380-381`）；`evaluateExitCriteria` 占位；监控反馈写回时序错位（清单 `:38`，写 `application/orchestrators/monitor-orchestrator.ts:89`、消费点 `ai-say-action.ts:242`）。

**口径缺口**：`ai-say.schema.json:18-21` 允许 `exit` 字段（描述「退出条件」）但**代码从不读配置里的 `exit`**——它读的是 LLM 输出里的 `exit`。同名两义，恰是 `script-engine-design-principles.md:368-385`「一字一义」原则的反例。

---

## CAP-03 让 AI 按脚本「提问」：多轮追问 + 自动抽成结构化变量（ai_ask）

### 一、实现程度

**端到端可用**（多轮路径），但清单 `capability-inventory.md:15` 的「（直接赋值/**正则**/LLM 三种抽取策略）」口径**不成立**——现役链路里没有正则/pattern 策略。另有两处必须写清的缺口（a、b）。

**多轮循环**（`:129-271`）：每轮 `currentRound += 1`（`:185`）→ `generateQuestionFromTemplate(context, MULTI_ROUND)`（`:188`）→ 退出决策（`:216`）→ 退出则 `finishAction` 并合并变量（`:231-256`），否则 `completed:false` / `waitingFor:'answer'`（`:259-266`）。跨请求续接由 `script-executor.ts:587-590` 特判 ai_ask 承担。

**退出决策是真的双通道**（这一点与 ai_say 相反）：`ExitDecisionEngine.evaluate`（`exit-decision-engine.ts:24-62`）——LLM 侧 `context.llmOutput.exit === 'true'`（`:25`），规则侧 `RuleBasedEvaluator.evaluate`（`:28-32`），二者 OR（`:38-53`）。模板确实按契约产出 `exit` / `exit_reason`（`ai_ask_v1.md:122-123`，强制因果链 `:68-72`），schema 做布尔→字符串强制（`shared-types/src/domain/ai-ask-output.ts:61-69`）。**这是 ai_ask「聊透了就收尾」真实成立的原因。**

**三处必须写清的缺口**：

- **(a) 硬上限在缺省脚本里不存在。** `buildExitCriteriaFromConfig`（`ai-ask-action.ts:1127-1134`）取 `this.getConfig('max_rounds')`——**无默认值**；schema 的 `default: 100`（`ai-ask.schema.json:34`）因 AJV 未开 `useDefaults` 而不生效；动作自己的 `this.maxRounds = getConfig('max_rounds', 20)`（`:59`）**不参与退出判断**。→ 脚本没显式写 `max_rounds` 的多轮 ai_ask，规则层第一条（`rule-based-evaluator.ts:19`）恒不触发，只剩「LLM 说 exit」与「变量收齐」两条出口。另注：比较符是**严格大于**（`currentRound > criteria.max_rounds`），与 ai_say 的 `>=`（`base-action.ts:532`）差一轮。
- **(b) 规则层「收齐即退」是与 LLM 并列的第二权威。** `rule-based-evaluator.ts:23-29`：只要 `required_variables`（= `output[].get` 全量，`ai-ask-action.ts:1130-1132`）都被判定为已收集，**无条件退出**——即便 LLM 当轮说 `exit: false`。而「已收集」的判据是「resolveVariable 拿到值且 `isValidVariableValue`」（`:1153-1162`）——非空即算，不判充分度。脚本作者以为的「LLM 判断聊透了」，可能被「某个变量碰巧抽到了」提前打断。设计文档的口径是「规则层只做 `max_rounds` 兜底」（`docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md:5,19-20`），**代码多了一条规则**。
- **(c) `exitPolicy` 在 ai_ask 上是装饰。** `:77-80` 声明 `['max_rounds','exit_flag','llm_suggestion']`，但决定权在 `ExitDecisionEngine`，它既不读 `exitPolicy`、也不读 `should_exit`（`llm_suggestion`）。`BaseAction.evaluateExitCondition` 只被 ai_say 调用。

**抽取：真实的「三策略」是另一组。** `finishAction`（`:445-494`）逐 `output[]` 项：

1. `findVariableInHistory`（`:457`，注释「策略1: 从历史 JSON 提取」）
2. `extractVariableByLlm`（`:461-462`，注释「策略2: LLM 提取」，仅当 `define` 非空）
3. 用户原话兜底（`:466-469`，注释「策略3: 兜底最后一次输入」，同时 `logger.warn`）

此外每轮还有一条前置路径：`extractVariablesFromJson`（`:393-412`）直接读 LLM 当轮 JSON 里与 `output[].get` 同名的键（`output_list` 在提示词里规定了输出格式，`:598-599`、`:661-682`）。**全链路无正则/pattern 策略**：`ai-ask-action.ts` 里唯一形如三段式的枚举是 JSON **解析**重试策略（`:732-736` `direct_parse` / `trim_and_parse` / `extract_json_block`），与变量抽取无关。清单 `:15` 与 `:46` 的说法（「引擎 `extractor.ts` 完整实现 direct/pattern/llm，生产零调用；真实逻辑在 `ai-ask-action.ts:445-494`」）中，`ai-ask-action.ts:445-494` 部分正确，`direct/pattern/llm` 属于引擎、与被调用的那三个不是同一组——**请在最终读法里按本文口径更正**。

**`output[]` 的实际生效字段**：schema 允许 `get` / `set` / `define` / `value` / `require`（`common/output-field.schema.json:8-29`），代码**只读 `get` 与 `define`**（`get`: `:398,453,641,672,868`；`define`: `:454,678,883`）；`set` / `value` / `require` 全仓零读取点。其中 `require` 的四个紧迫度（`output-field.schema.json:24-29`，含 default `可推迟`）来自 `docs/superpowers/plans/2026-04-06-ai-ask-exit-condition-refactor.md:9-14` 的重构计划——**schema 建了、代码没接**。

**SIMPLE 路径（`:276-337`）实际不抽任何变量**：它读 `target_variable` / `targetVariable` / `extract_to` / `extractTo`（`:283-288`），这四个名字都不在 `ai-ask.schema.json` 允许列表里（`:38` `additionalProperties:false`），且 `target_variable` 已被本仓库废弃注册表判废（`validators/deprecated-fields-registry.ts:42-46`「已被 output 配置取代」）→ schema 合法脚本必然 `extractTo === ''`，`:319-322` 返回空对象。SIMPLE 的行为就是「问一句 → 把用户整段话写进……没有变量」。它仍有存在意义：不配 `output` 的 ai_ask 脚本不会崩，但也拿不到结构化结果。

**模板文件只有一个**：`template-resolver.ts:62-63` 只按 `actionType` 拼 `${actionType}_v1.md` → SIMPLE 与 MULTI_ROUND **共用 `ai_ask_v1.md`**；`AskTemplateType`（`:44-46`）只影响代码分支与提示词变量集。ai_ask 的变量契约是闭合的：模板要的 `{{task}}`（`:561`）、`{{exit_condition}}`（`:565`）、`{{collected_variables}}`（`:602`）、`{{chat}}` / `{{tone}}` / `{{current_round}}` / `{{max_rounds}}` / `{{output_list}}` / `{%memory_context%}`（`:609-621`）全部由 `extractScriptVariables` + `buildSystemVariables` 提供——与 ai_say 的 `understanding_threshold` 形成对照。

### 二、涉及的领域概念

- **变量系统上下文**：`registerOutputVariables`（`:863-893`）在首轮把 `output[].get` 注册进作用域——`scope = isGlobalVariable(varName) ? GLOBAL : TOPIC`（`:878-882`）；`finishAction` 的兜底与 `getCollectedVariables` 都经 `scopeResolver.resolveVariable`（`:1153-1162`）。四层作用域 → ADR 007 的三层收缩对本条能力有直接影响（`registerOutputVariables` 的 TOPIC 归属、GLOBAL 分支是否还有意义），该判定属「会话与状态」簇，本文只标接口位置。
- **「变量提取」这个领域服务的名实分离最重**：`ubiquitous-language.md:107` 写「变量提取：从来访者回答中提取结构化变量。三种方法：直接类型转换、正则模式匹配、LLM 语义提取」——这份 UL 的状态是 `decision-recorded`（`docs/design/README.md:17`），它描述的三种方法只存在于**死代码** `engines/variable-extraction/extractor.ts:46-59`（`direct|pattern|llm`）；生产零 `new VariableExtractor(...)`，只有两处 barrel 导出（`engines/variable-extraction/index.ts:10-11`、`src/index.ts:159`）。CLAUDE.md:60-69 也仍把 variable-extraction 列为六引擎之一。→ **一个封板文档 + 一份项目说明书，共同为一个不存在的机制背书。**
- **抽取逻辑的领域归属**：三条策略是 `AiAskAction` 的私有方法（`:445-494`），不是领域服务。设计文档的原意正是如此（见 §三），所以这是「设计 → 实现」的忠实降级，而非走样；走样的是 UL 与 CLAUDE.md 的表述。
- **值对象**：`output[]` 项是配置 VO（`common/output-field.schema.json:8-29`），无对应 TS 类型被生产读取（`getConfig('output', [])` 返回 `any`）。

### 三、对应设计文档

| 文档                                                                          | status                                                        | 名实核对                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/topic/action-topic-boundary.md`                                  | `draft`                                                       | **最贴合的一篇**。`:60`「提取策略：采用多级后备策略（直接提取 -> LLM专门提取 -> 使用用户原话），确保鲁棒性」——与 `finishAction` 的三条**逐字对应**（`:457` / `:461` / `:466`）；`:54-56`「退出条件判断（自主决策）……`exit_condition` 和 `max_rounds`」与代码相符（`ai_ask.schema.json:18-22`、`rule-based-evaluator.ts:19`）。**该文档描述的 ai_ask 是现行代码的准确来源**                                                                                                                      |
| `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`            | 自述「已实施」（`:5`），不在 `docs/design/README.md` 状态表内 | `:19-20`「极简架构：规则层只做 `max_rounds` 兜底，语义判断完全交给 LLM」+ `:25` 流程「LLM生成 → 代码层检查 max_rounds → 综合决策」——**与代码冲突**：`rule-based-evaluator.ts:23-29` 的 `required_variables` 规则不在该文档描述内（见 §一 (b)）。「已实施」的封板结论被后续实现超出                                                                                                                                                                                                              |
| `docs/superpowers/plans/2026-04-06-ai-ask-exit-condition-refactor.md`         | 计划稿                                                        | `:9-14` 规划了 `output.require` 四档紧迫度 + `max_rounds: 100` 默认 + `require: 可推迟` 默认——**schema 建了**（`output-field.schema.json:24-29`），**代码没接**（零读取点），**默认值也没生效**（AJV 无 `useDefaults`）                                                                                                                                                                                                                                                                         |
| `docs/superpowers/plans/2026-04-06-remove-deprecated-exit-criteria-fields.md` | 计划稿                                                        | 移除 `understanding_threshold` / `has_questions`——**已实施**：`shared-types/src/domain/exit-decision.ts:45` 明确注释已移除；`ai-ask.schema.json` 已无这两个字段                                                                                                                                                                                                                                                                                                                                 |
| `_system/README.md:95-131`                                                    | 活跃权威                                                      | 统一 JSON 契约给的是 `EXIT` / `BRIEF` / `safety_risk` / `metadata`；**落地的 `ai_ask_v1.md:116-131` 用的是小写 `exit` / `brief` / `safety_check` / `crisis_detected` / `response_plan` / `assessment` / `progress`**——两套契约无一处同名（mess-map MESS-C-08 已记，本文补上精确字段对照）。注意 `_system/README.md:136` 把安全边界列为强制要求，而落地模板走的是 `safety_check.passed` + `crisis_detected`（`ai_ask_v1.md:126-130`），与 CAP-06 的 LLM 自审字段 `safety_risk.detected` 也不同名 |
| `docs-archive/misc/ai_ask_output_list_feature.md`（285 行）                   | 归档（domain-ledger A9，判为「全仓唯一非重构叙事者」）        | 描述 `output_list` 系统变量的现行语义、`buildSystemVariables` 返回 `{time, who, user, tone, chat, ai_role, output_list}`（`:124-139`，直读已核）——**与生产一致**（`ai-ask-action.ts:609-621` 返回同一组字段）。即 `output[]` 输出格式的**唯一权威说明在归档目录里，`docs/` 零登记**（domain-ledger A9 已登记）                                                                                                                                                                                  |

### 四、缺口

**没建**：正则/pattern 抽取（从未在产）、`output[].set` / `value` / `require` 语义、`required_variables` 与 LLM 的仲裁规则、危机处理的联动（`:1094` `// TODO: 同步启动危机处理LLM`）。

**建了没接**：`VariableExtractor` 引擎（死代码，却仍被 UL 与 CLAUDE.md 当作六引擎之一）、`output[]` 的 `require` 紧迫度（schema 有、代码无）、`target_variable`（判废却仍被读，`:283-288`、`:479-482`）、`max_rounds` 的 schema 默认值（`:34`，因 AJV 配置不生效）。

**口径缺口**：清单 `:15` 的「正则」三策略需要更正（见 §一）；UL `:107` 的三种方法与代码不符；CLAUDE.md 的「variable-extraction」引擎定位与死代码现状不符。

---

## CAP-04 让 AI「内部思考」一步再继续（ai_think）

### 一、实现程度

**桩或不可达**（与清单 `:16` 一致，且比清单描述更彻底）。不只是「不调 LLM」，而是**在任何 schema 合法的脚本下，它连一个变量都写不出来**。

- `ai-think-action.ts:18` 的形参是 `_context` / `_userInput`（下划线前缀 = 从未使用）→ 不读上下文、不读对话历史。
- `:20-21` 自述「MVP: 直接返回成功，不实际执行推理 / TODO: 后续实现真实的 LLM 推理逻辑」；`:4-5` 文件头同述。
- `:29-35` 为每个 `outputVariables` 写占位字符串 `[AI思考结果: ${varName}]`；`:45` 返回值自带 `note: 'MVP版本：占位符实现，未实际调用LLM'`。
- 构造函数只收 `actionId` / `config`（`:14-16`），**连 `llmOrchestrator` 这个字段都没有**——不是「调了没生效」，是「没有可调用的入口」。`ActionFactory` 也正是只对 ai_say / ai_ask 要求 orchestrator（`application/actions/action-factory.ts:63-74`），ai_think 走注册表兜底（`:79`）。
- `BaseAction` 默认 `exitPolicy = { supportsExit: false }`（`base-action.ts:169-171`），AiThinkAction 不覆盖 → 即便有人调 `evaluateExitCondition` 也是「不支持退出」。

**字段名三方对照（本簇必核项，逐行已核）**

| 层                                        | 位置                                                                                                                                                                                            | 字段名                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 引擎**读取**（思考目标）                  | `core-engine/src/domain/actions/ai-think-action.ts:23`                                                                                                                                          | `think_goal` / `thinkGoal`                                  |
| 引擎**读取**（输出变量）                  | `ai-think-action.ts:24`                                                                                                                                                                         | `output_variables` / `outputVariables`                      |
| 脚本 JSON Schema（**权威**）              | `script-schema/actions/ai-think.schema.json:7`（`required`）、`:8-21`（`properties`）、`:22`（`additionalProperties:false`）                                                                    | `content`（必填）、`output[]`                               |
| 编辑器**新建动作**默认值（`_raw.config`） | `script-editor/src/hooks/usePhaseOperations.ts:497`、`src/services/ScriptOperations.ts:74`                                                                                                      | `think_target`                                              |
| 编辑器内存节点字段                        | `usePhaseOperations.ts:490`、`ScriptOperations.ts:67`                                                                                                                                           | `think`                                                     |
| 编辑器 → YAML（写）                       | `script-editor/src/services/YamlService.ts:380-392`（`:386` `config.content = action.think`；`:389` 注释「使用 output 数组（不是 output_variables）」、`:391` `config.output = action.output`） | `content`、`output`                                         |
| 编辑器 ← YAML（读）                       | `YamlService.ts:139-147`                                                                                                                                                                        | `content` ‖ `prompt_template` ‖ `think_goal` → 节点 `think` |
| 编辑器变量分析（输入侧）                  | `script-editor/src/utils/variableAnalyzer.ts:84-85`                                                                                                                                             | `think_goal`                                                |
| 编辑器变量分析（输出侧）                  | `variableAnalyzer.ts:127-128`                                                                                                                                                                   | `output_variables`                                          |
| 废弃字段注册表                            | `script-schema/validators/deprecated-fields-registry.ts:60-67`                                                                                                                                  | `prompt_template` → 应换成 `content`                        |
| 遗留共享类型（死）                        | `shared-types/src/domain/topic-decision-v2.ts:142,144`                                                                                                                                          | `think_goal`、`output_variables`                            |

**后果链**：schema 合法脚本只会有 `content` + `output` → `thinkGoal = ''`、`outputVariables = []`（`:23-24`，`this.config` 直读，无 `getConfig` 的 snake/camel 兼容）→ `:31-34` 的循环体一次都不执行 → `extractedVariables` 恒为 `{}`（虽然 `completed:true`、无 aiMessage，流程上「跳过」了）。**能力在用户视角等同不存在。** 更早的时候编辑器写入的 `think_target` 连 schema 都过不了（`additionalProperties:false`），会被保存期校验拦下——即该字段**连存量数据都难以合法存在**。

### 二、涉及的领域概念

- UL `:44`「思考：咨询师内部思考和分析，不对外输出。产出写入变量」——**形状对、实质不对**：动作确实不产出面向用户的消息（`aiMessage: null`，`:40`），但「产出」是占位串。
- 三个 Action 都继承 `BaseAction`（`ai-think-action.ts:11`），策略模式的结构声明成立（`docs/ddd/contexts/consulting-session.md:59-62`）；但 AiThinkAction 不使用基类的退出机制、变量替换、LLM 编排三件能力中的任何一件 → 它在继承树里，不在能力面上。
- **设计文档把它当一等公民，代码把它当空壳**：`docs/design/foundation/ontology.md:42-46`（主线思维分解表）把 `ai_think` 与 `ai_ask` / `ai_say` / `ai_fill` 并列，无 stub 标注；`docs/design/memory/memory-retrieval-types.md:310-344` 把 **Layer 3（深度因果分析）的载体指定为 `ai_think`**，并定义 `on_script_node` 触发（`:366`）；`:271` 老实写「其余类型为预留组合，待对应消费者（意识层慢通道、ai_think、Phase 4 矛盾检测）实现时验证」；`docs/design/memory/variable-memory-bridge.md:33` 直接承认「当前变量只在 `ai_ask` 收集时写入，或 `ai_think` **占位符填充**」；`docs/ddd/contexts/variable-system.md:75` 标注「未来: AiThinkAction recall → VariableStore (Phase 2b)」。→ **记忆检索层有一层设计悬在这个不存在的消费者上**（该线属记忆簇，本文只登记接缝）。

### 三、对应设计文档

| 文档                                           | status                                | 名实核对                                                                                                          |
| ---------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ddd/contexts/consulting-session.md:61`   | 无 frontmatter                        | **最诚实的一处**：`AiThinkAction — 内部推理 (MVP stub, Phase 2b 待实现)`。与代码完全相符                          |
| `docs/design/foundation/ontology.md:44`        | `draft`                               | 把 ai_think 列为在产子任务，**无 stub 标记**——与代码冲突（同篇 `:42-46` 的 `ai_fill` / `ai_draw` 更是全无实现）   |
| `docs/design/memory/memory-retrieval-types.md` | `decision-recorded`（`README.md:27`） | `:310-312` 指定 ai_think 为 Layer 3 载体——**封板文档把机制挂在桩上**（同篇 `:271` 已作免责声明，但状态仍是封板）  |
| `docs/design/memory/variable-memory-bridge.md` | `decision-recorded`（`README.md:29`） | `:33`、`:146-149` 明确承认占位符填充、并据此做成本对比（「Piggyback 的边际成本约为独立 ai_think 的 1/10」）——诚实 |
| `docs-archive/`                                | —                                     | **没有任何一篇 ai_think 设计稿**（`grep -rn "ai_think                                                             | AiThink" docs/design docs/ddd docs/superpowers docs-archive --include=\*.md`的命中全部是上面这些「引用它」的文档，无「设计它」的文档）。→ ai_think 的能力定义只有`ontology.md:44` 一句话 + schema |

### 四、缺口

**没建**：LLM 调用、上下文读取、输出解析、变量写回、`output[].define` 的使用——即整个动作。

**建了没接**：编辑器 `think_target` 字段（`usePhaseOperations.ts:497`、`ScriptOperations.ts:74`）→ 无任何消费方，且过不了 schema；`variableAnalyzer.ts:84-85` / `:127-128` 按 `think_goal` / `output_variables` 分析变量 → 与写入侧（`content` / `output`）不闭合，分析结果失真；遗留类型 `topic-decision-v2.ts:142,144`。

**口径缺口**：`capability-inventory.md:16` 把 ai_think 记为「桩」；而 `CLAUDE.md:137`、`:172`、`:254` 把它列为与 ai_say / ai_ask 平级的一等动作类型（无任何 stub 标记），`CLAUDE.md:78` 还把 `variable-extraction` 列在产引擎表里。实际它还有一个**字段名漂移链**（`think_target` → `think_goal` / `output_variables` → `content` / `output`），这条链使得「将来接 LLM 时到底读哪个字段」也不能只看代码定。**建议在后续波次里把它作为「同一概念的名字在 11 处不一致」的判例登记**（清单 `:45` 已列其中 3 处，本文补全为 11 处）。

---

## 跨能力对照：模板模式 vs 非模板模式（本簇必核项）

| 动作         | 模式闸门                                                                                                                                       | 模板文件                                                                             | 非模板/另一条路径                                                                                                                      | 自动收尾的真实依据                                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ai_say**   | `ai-say-action.ts:165-166`：有 `max_rounds` **或** `exit_criteria`；但 `ai-say.schema.json:30` 使 `exit_criteria` 非法 → 实际只有 `max_rounds` | `config/prompt-defaults/ai_say_v1.md`（`template-resolver.ts:63` 拼 `ai_say_v1.md`） | `executeLegacyMode`（`:406-521`）：`content` / `content_template` + `require_acknowledgment`（默认 true）+ 二次 LLM 改写（`:454-478`） | 只有 `currentRound >= maxRounds`（`base-action.ts:532`）；legacy 下是「用户任意回一句」（`:426-440`）                                                |
| **ai_ask**   | `ai-ask-action.ts:71-74`：有 `output[]` **或** `exit_condition` → `MULTI_ROUND`，否则 `SIMPLE`                                                 | **两者共用** `ai_ask_v1.md`（`template-resolver.ts:62-63` 只按 actionType 拼名）     | `executeSimple`（`:276-337`）：问一轮 → 把整段回答写进 `target_variable` 系字段（schema 下该字段不存在 → 实际不写）                    | `ExitDecisionEngine`：LLM `exit`（`exit-decision-engine.ts:25`）OR `max_rounds`（`rule-based-evaluator.ts:19`，缺省时不触发）OR 变量收齐（`:23-29`） |
| **ai_think** | 无模式概念（`ai-think-action.ts:14-16` 构造函数只收 config）                                                                                   | 无                                                                                   | 唯一路径，即桩                                                                                                                         | 无（`:37-47` 直接 `completed: true`）                                                                                                                |

模板解析的两套世界（三者共用）：数据库模式走虚拟路径 `_system/config/custom/{scheme}/...` → `_system/config/default/...`（`template-resolver.ts:94,120`，由 `projectId` + `templateProvider` 触发，`:66`）；文件系统模式走真实目录 `config/prompt-defaults/`（`:148-160`）。**两条路径要求同一套模板变量契约**，而 ai_say 的 `{{understanding_threshold}}` 在两条路径下都拿不到值（见 CAP-02 §一 第 7 条）。

---

## 本簇未解问题

以下是我**没能判定**的事，以及判定它们需要什么。已按「需要什么证据」归类，便于后续波次直接派活。

1. **ai_say 的提前退出在真实项目里是否曾被启用？**
   代码上唯一可行路径是「custom 层模板自行要求 LLM 输出 `should_exit`」（CAP-02 §一 第 9 条）。要判定，需查数据库 `script_files` 里 `_system/config/custom/*/ai_say_v1.md` 的实际内容（本 agent 只读仓库，未接 DB；`config/prompt-defaults/` 只有 Default 层 4 个文件）。**需要**：一条只读 SQL，或对人确认「有没有客户/方案改过 ai_say 模板」。

2. **生产实际用 DB 模板还是文件系统模板？**
   `sessionConfig.template_scheme` 与 `context.metadata.projectId` / `templateProvider` 是否总存在，决定走 `template-resolver.ts:66` 还是 `:71`。**需要**：一次真实会话的 debug-entries（含 `template_path` / `layer` —— `ai-say-action.ts:384` 已把 `template_path` 写进返回值元数据），或读一次 DB 的 project 初始化结果（`project-initializer.ts:140` 写入 `_system/config/default/*`）。

3. **`max_rounds` 的「应有默认值」是多少？**
   现状三处不一致：代码 `20`（`base-action.ts:165`、`ai-ask-action.ts:59`）、schema `100`（`ai-ask.schema.json:34`，**不生效**）、规则层 **undefined**（`ai-ask-action.ts:1129`，即无兜底）。domain-ledger D14 已登记过同类冲突（5 vs 3）。**需要**：人裁定「多轮 ai_ask 的缺省上限」，或一次不带 `max_rounds` 的真实多轮会话记录（看它是否真会无限追问）。

4. **`RuleBasedEvaluator` 的 `required_variables` 规则是刻意设计还是遗留？**
   它与封板文档「规则层只做 `max_rounds` 兜底」（`2026-03-18-ai-ask-exit-decision-design.md:19-20`）冲突，且会与 LLM 判断抢权（CAP-03 §一 (b)）。**需要**：找到该规则的引入提交（`git log -S required_variables -- packages/core-engine/src/engines/exit-decision/`）并对照当时的意图；或人裁定「变量收齐是否等价于聊透」。

5. **`require_acknowledgment`（ai_say legacy）该留还是该删？**
   它在现行 `ai-say.schema.json` 下不可达（`additionalProperties:false`），但代码仍读（`ai-say-action.ts:417`）。**需要**：确认是否还有旧 DSL（`sessions:` / `steps:` 结构，如 `scripts/sessions/test_ai_say_basic.yaml`）在跑真实会话；否则它是纯死字段。

6. **ai_think 是保留为 DSL 一等动作，还是降级/移除？**
   支持保留的：`ontology.md:42-46`（任务层四子任务）、`memory-retrieval-types.md:310-312`（Layer 3 载体）、schema + 编辑器入口 + 测试齐备。支持降级的：零实现且无设计稿。**需要**：产品/设计裁定（不是代码考古能定的）；裁定后才知道「修字段名」还是「删动作」。

7. **`use_skill` 与 `show_form` 的入口是否要保留？**
   编辑器菜单项存在（清单 `:44`），注册表被注释（`action-registry.ts:22`），schema 有 `use-skill.schema.json`。**需要**：与人确认「可编排但不可运行」是不是临时可接受状态——若是，需要一条启动期告警；若否，需要从编辑器菜单摘除。

8. **安全兜底在本簇四个动作里的真实生效点。**
   我只确认了「`checkSafetyBoundary` 命中只 `console.warn`」（`ai-say-action.ts:278-284`）与「`parseStructuredOutput` / `confirmSafetyViolation` / `generateSafeFallbackResponse` 无生产调用点」（清单 `:47`）。**需要**：与 CAP-06 簇（同批 S1'「内容创作」agent）合并结论——本簇只给出「四个动作的代码路径在此处交会」。

9. **变量作用域 4 层 vs ADR 007 三层，对本簇的实际影响。**
   `registerOutputVariables` 的 GLOBAL/TOPIC 二分（`ai-ask-action.ts:878-882`）与 `UL:106` 的四层表述冲突；`de-termineScope` 的实际层级归属在 `script-executor.ts`（属「会话与状态」簇）。**需要**：合并该簇结论后，回填 CAP-01/CAP-03 的作用域判定。

10. **`docs/design/README.md` 状态表的可信度边界。**
    本文发现两处「封板但零代码」：`topic-queue-implementation.md`（`README.md:36` decision-recorded，`:347-349` 的三个新增文件全不存在）与 `memory-retrieval-types.md` 把 Layer 3 挂在 ai_think 桩上（`README.md:27`）。这提示状态表的 `decision-recorded` 语义可能只表示「设计决策已定」，不表示「已实现」。**需要**：与「文档治理」簇核对 `README.md:9` 的修订规则原文口径；若确系前者，建议在状态表加一列「实现状态」——**这条超出本簇职责，仅登记**。
