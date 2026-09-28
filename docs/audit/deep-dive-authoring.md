# 内容创作簇能力深挖（S1'）

> **范围**：CAP-05 提示词可定制 · CAP-11 在编辑器里像改文档一样编排脚本 · CAP-12 直接编辑 YAML 文本。
> **方法**：只读。全部结论以 `文件:行号` 为凭，未取到证据的判断一律不写。
> **口径**：「实现程度」按**用户能用到什么**算，不看代码写了多少 —— 端到端可用 / 部分可用（写清缺口）/ 桩或不可达。
> **上游**：[capability-inventory](capability-inventory.md) §一（三能力初判）、§二（八项缺口线索）；[mess-map](mess-map.md) MESS-B-01 / MESS-C-02 / MESS-C-06 / MESS-F-06；[domain-ledger](domain-ledger.md) §1.1 D1 / §1.4；[runnability-baseline](runnability-baseline.md)。
> **本文回答 inventory §四.4 留下的「组件面」空白**：能力在 UI 上从哪进、点下去到哪落盘、落盘时有没有丢东西。

---

## 零、结论速览

| 能力                     | 档位                                   | 一句话                                                                                                                                                                                                          | 关键证据                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CAP-05 提示词可定制**  | **端到端可用**（带一个前提）           | 建方案、改模板、会话里选方案、引擎按 Custom > Default 取模板，全链路通；但「建项目时选的方案」不落 YAML，用户必须在会话属性面板里再选一次                                                                       | 建方案 `routes/projects.ts:872`；会话选方案 `SessionPropertyPanel/index.tsx:212`→`YamlService.ts:880`；引擎取模板 `script-executor.ts:506,509`→`template-resolver.ts:93`；断点 `project-initializer.ts:80-85`               |
| **CAP-11 可视化编排**    | **部分可用**                           | 增/删/改 + 动作/话题/阶段三种拖拽都在，每步同步落 YAML，编辑→保存→发布版本自洽；但**拖拽后元数据按旧下标回填**、**ai_say 三个字段落盘即丢**，且**编排产物到运行时没有一级通路**（只有一条标注为「调试」的导入） | 操作 `usePhaseOperations.ts:119,168,281,323,453,564,598,652,695`；落盘 `ProjectEditor/index.tsx:1320-1348`→`:797`；丢字段 `YamlService.ts:340-342`；错位 `YamlService.ts:309-320`；断链 §2.2（`routes/scripts.ts:171-176`） |
| **CAP-12 YAML 直接编辑** | **端到端可用**（提示不是「行内」级别） | 边打边校验（500 ms 防抖）+ 保存前阻塞都在，与后端 `POST /api/scripts/:id/validate` 是**同一个** `schemaValidator`；但错误只落在面板上，YAML 里没有行内标记                                                      | 实时链 `ProjectEditor/index.tsx:644,656`→`validation-service.ts:117-121,62`；阻塞 `ProjectEditor/index.tsx:773-784`；同一实例 `validation-service.ts:11` vs `routes/scripts.ts:335`；面板 `EditorContent.tsx:233`           |

**本簇一句话总账**：三条能力在**各自的 UI 面上都是通的** —— 但要分成两件事看：

1. **创作闭环通**：编辑 → 保存 → 发布版本 → 回滚，全程可用；坏在**闭环内部的转换层** —— 编辑器的「前端 Action 形状 ↔ YAML」转换是手写白名单（`YamlService.ts:329-430`），与引擎的 schema（`script-schema/actions/*.schema.json`）各写各的，双向都不保真（§四）。
2. **创作 → 运行**没有一级通路：编辑器写 `script_files`，运行时读 `scripts`，两者之间只有一条路由自述"用于调试"的导入（§2.2）。凡是要验收「改完脚本真的跑起来」，目前都得从调试入口进。

---

## 一、CAP-05 提示词可定制

### 1.1 实现度：端到端可用（前提见缺口 A）

**用户可达的四步，逐段给证据。**

**(1) 建方案（scheme）**

- 入口挂在项目编辑器上：`packages/script-editor/src/pages/ProjectEditor/index.tsx:1607`（`<TemplateSchemeManager>` 已挂载，非死组件）。
- 弹窗提交：`packages/script-editor/src/components/TemplateSchemeManager/CreateSchemeModal.tsx:38` → `projectsApi.createTemplateScheme` → `packages/script-editor/src/api/projects.ts:232-247` → `POST /api/projects/:id/template-schemes`。
- 服务端整方案复制：`packages/api-server/src/routes/projects.ts:872-940`，其中 `:905-925` 把源方案的文件逐个写进新 scheme 前缀。

**(2) 改模板**

- 入口：`packages/script-editor/src/pages/ProjectEditor/index.tsx:1617`（`<TemplateEditor>`），保存 `components/TemplateEditor/index.tsx:170` → `projectsApi.updateTemplateContent` → `api/projects.ts:298` → `PUT /api/projects/:id/templates/:schemeName/:templatePath`（`routes/projects.ts:791`）。
- 另有一条同名保存分支在 `ProjectEditor/index.tsx:767`（文件树里的 `template-` 伪文件走这里）。

**(3) 会话里选中方案**

- UI：`packages/script-editor/src/components/SessionPropertyPanel/index.tsx:212-227`（`name="template_scheme"` 的 Select，选项来自 `availableSchemes`）。
- 落到 YAML：`SessionPropertyPanel` 的 `handleSchemeChange` → `YamlService.updateSessionConfig`（`packages/script-editor/src/services/YamlService.ts:861-895`），其中 `:880-881` 写 `parsed.session.template_scheme`。
- 该字段确实是 schema 的合法字段：`packages/core-engine/src/adapters/inbound/script-schema/session.schema.json:25-29`。

**(4) 引擎运行时按两层取模板**

链是**闭合**的，逐跳：

| 跳  | 位置                                                                           | 动作                                                                                        |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1   | `packages/core-engine/src/engines/script-execution/script-executor.ts:506`     | `const sessionData = parsed.session;`                                                       |
| 2   | `script-executor.ts:509-514`                                                   | `setupSessionMetadata(executionState, sessionData, projectId, templateProvider)`            |
| 3   | `packages/core-engine/src/application/state/action-state-manager.ts:156-159`   | `metadata.sessionConfig = { template_scheme: sessionData.template_scheme }`                 |
| 4a  | `packages/core-engine/src/domain/actions/ai-ask-action.ts:900-901`             | 读 `context.metadata?.sessionConfig?.template_scheme`                                       |
| 4b  | `packages/core-engine/src/domain/actions/ai-say-action.ts:528-529`             | 同上（ai_say 也有自己的 resolve 路径，`:570`）                                              |
| 5   | `packages/core-engine/src/engines/prompt-template/template-resolver.ts:93-109` | Custom 层：`_system/config/custom/{scheme}/{actionType}_v1.md`，命中即返回 `layer:'custom'` |
| 6   | `template-resolver.ts:119-128`                                                 | Default 层：`_system/config/default/{actionType}_v1.md`；**不存在则抛错**（`:123-128`）     |

- monitor 模板走同一套 scheme：`packages/core-engine/src/application/monitors/monitor-template-resolver.ts:55`、`monitor-template-service.ts:71-74`。
- **只有 DB 模式有两层**：`template-resolver.ts:140-167`（filesystem 兜底路径）签名里 `_sessionConfig` 带下划线，即**根本不读 scheme**。生产走 DB（`projectId + templateProvider` 都在时才进 DB 分支，`template-resolver.ts:66-68`）。
- Default 层文件在磁盘上真实存在 4 个（`config/prompt-defaults/ai_ask_v1.md`、`ai_say_v1.md`、`ai_ask_monitor_v1.md`、`ai_say_monitor_v1.md`）；**没有 `ai_think_v1.md`** —— 与 ai_think 是桩（§四.5）一致。

### 1.2 涉及的领域概念

**战略层（限界上下文）—— 一个术语被两个上下文同时登记，边界是糊的。**

| 概念                                   | 归属上下文                                         | 登记处                                 |
| -------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| Template / Scheme / Substitution       | **Prompt Engineering**（core-engine）              | `docs/ddd/strategic-design.md:96-105`  |
| Template / Scheme / Publish / Rollback | **Script Authoring**（api-server + script-editor） | `docs/ddd/strategic-design.md:107-115` |

`Template` 与 `Scheme` 在两个上下文的「领域语言」行里各出现一次，且 `strategic-design.md:115` 明写 Script Authoring 的不变性是「Template 从 `config/prompt-defaults/` 导入，可被 custom scheme 覆盖」——**这是 Prompt Engineering 的规则被抄进了 Script Authoring 的清单**。这正是 domain-ledger §1.1 D1 那条争议的第三处证据。

**战术层（实体/值对象/端口/领域服务）。**

| 模式                | 实现                                         | 位置                                                                                                                                              |
| ------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Port                | `TemplateProvider`                           | `packages/core-engine/src/engines/prompt-template/template-provider.ts`（虚拟路径契约注释在 `:22`；登记于 `docs/ddd/strategic-design.md:246`）    |
| Adapter             | `DatabaseTemplateProvider`                   | `packages/api-server/src/services/database-template-provider.ts`（登记于 `docs/ddd/strategic-design.md:249`）                                     |
| Domain Service      | `TemplateResolver`                           | `packages/core-engine/src/engines/prompt-template/template-resolver.ts:58`（`resolveTemplatePath`；登记于 `docs/ddd/strategic-design.md:248`）    |
| Application Service | `PromptTemplateManager`                      | 同名目录 `template-manager.ts`（登记于 `docs/ddd/strategic-design.md:247`）                                                                       |
| Application Service | `TemplateSchemeManager`（**前端，UI 投影**） | `packages/script-editor/src/components/TemplateSchemeManager/index.tsx:20-24`（局部 `interface TemplateScheme { name; description; isDefault }`） |

**「方案」没有对应的领域对象 —— 它是一段路径前缀。**

- `packages/api-server/src/db/schema.ts:173-175` 注释即定义：`filePath` 存虚拟路径（含 `_system/config/{default,custom/<scheme>}/`）。
- `scriptFiles` 表结构 `schema.ts:177-199`，**没有 scheme 列、没有 scheme 表**。
- 服务端解析靠字符串拼接：`template-resolver.ts:94`（`` `_system/config/custom/${scheme}/${fileName}` ``）。
- 前端「方案列表」是对 `script_files` 的 `filePath` 做前缀聚合后的**投影**，不是实体查询。

> 也就是说：`Publish`/`Rollback` 在 `strategic-design.md:110` 被登记为 Script Authoring 的领域语言，`Scheme` 也在其中——但 `Scheme` 在实现里**没有身份**（无 id、无类型、无生命周期），只是一个文件夹名。这是名实问题，不是缺失问题。

### 1.3 对应设计文档

| 文档                                                                       | status                                                                                                                                        | 说了什么                                                                                      | 与代码对不对得上                                                                                                                                                    |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/design/foundation/architecture-constraints.md:27`（B2 模板两层解析） | `draft`                                                                                                                                       | Custom 优先 → Default 兜底；变量替换两层                                                      | **对得上**：`template-resolver.ts:93-135`。约束没提「filesystem 模式无 custom 层」这个例外（`template-resolver.ts:140-167`）                                        |
| `docs/design/foundation/ubiquitous-language.md:109`                        | `decision-recorded`                                                                                                                           | 提示词模板 = 两层模板体系                                                                     | **对得上**，但只此一行，无 scheme 的任何定义                                                                                                                        |
| `docs/ddd/strategic-design.md:96-105`                                      | 无 frontmatter status（`docs/ddd/` 不在设计文档状态体系内，见 `docs/design/README.md:4-8` 只登记 `docs/design/` 与 `docs/ddd/` 的"独立存放"） | Prompt Engineering 上下文、两层不变性                                                         | **对得上**                                                                                                                                                          |
| `docs/ddd/strategic-design.md:107-115`                                     | 同上                                                                                                                                          | Script Authoring 语言含 Template/Scheme；不变性「Template 从 `config/prompt-defaults/` 导入」 | **半对**：导入逻辑在 `routes/projects.ts:166-172`（建项目时读 `config/prompt-defaults` 并写库）确实存在；但「Version 创建后不可变」与 Draft 语义一并失真（见 §2.3） |
| `docs/design/memory/ai-ask-memory-recall.md:422`、`:502`                   | `draft`                                                                                                                                       | Default 层模板 `config/prompt-defaults/ai_ask_v1.md` 的最末，Custom 层可整段覆盖              | **对得上**（文件在，机制在）                                                                                                                                        |
| `docs/ddd/context-map.md:45`                                               | 无 frontmatter                                                                                                                                | Script Authoring → Consulting Session = Conformist，「editor follows engine's schema」        | **不对**，见 §2.3 依赖方向                                                                                                                                          |

**没有一篇文档描述「方案是一个路径前缀」**；也没有文档写明「Default 层只读」是前端约定。后者是有后果的：

- 前端拦：`packages/script-editor/src/pages/ProjectEditor/index.tsx:758-762`（`parts[0] === 'default'` → `message.warning` + `return`），另有 `components/TemplateEditor/index.tsx:243` 的只读提示。
- 后端不拦：`packages/api-server/src/routes/projects.ts:806-809` 直接把 `schemeName === 'default'` 拼成 `_system/config/default/...` 照写，路由体内（`:791-810`）无任何 layer 校验。

即：**系统默认模板的只读性完全依赖前端一次判断**，任何直连 REST 的调用方都能改写它。

### 1.4 缺口

**A. 做了但接不上：建项目时选的方案不落 YAML（stub）**

- 前端收集：`packages/script-editor/src/pages/ProjectList/index.tsx:90`、`:446`（`templateScheme` 表单字段）。
- 后端只打印日志：`packages/api-server/src/services/project-initializer.ts:80-85`，`console.log('... Template scheme not yet implemented: ...')`。
- 后果：用户在项目列表选了方案 → 新项目的 session YAML 里**没有** `session.template_scheme` → 引擎 `action-state-manager.ts:158` 取到 `undefined` → `template-resolver.ts:115-117` 走 Default 层。**必须在项目编辑器的会话属性面板里再选一次才生效。** 两处 UI 做同一件事，只有一处有用。

**B. 没做：Default 层的写保护**

- 只有前端判断（`ProjectEditor/index.tsx:759-762`），后端无校验（`routes/projects.ts:791-806` 无 layer 检查）。

**C. 知识残留：废弃字段注册表没有生产消费者**

- `packages/core-engine/src/adapters/inbound/script-schema/validators/deprecated-fields-registry.ts:1-107` 登记了 6 条废弃字段迁移规则（`content_template→content`、`question_template→content`、`target_variable→output`、`extraction_prompt→output[].instruction`、`required→删除`、`prompt_template→content`）。
- 唯一消费者是 `validators/schema-prompt-generator.ts:13,270`，而该文件**没有任何生产调用方**（全仓 grep 只有自身与 `__tests__`）。
- 但编辑器的兼容读取仍在原地手写：`YamlService.ts:105-107`（`content || content_template`）、`:120-123`（`content || question_template || content_template`）、`:140-142`（`content || prompt_template || think_goal`）。**同一套迁移知识，一份在无人调用的注册表里，一份散在编辑器的 `||` 链里。**

---

## 二、CAP-11 在编辑器里像改文档一样编排脚本

### 2.1 实现度：部分可用（操作齐备，结果不可信）

**五种操作，逐一给入口与落点。**

| 操作             | 处理函数                                                                               | 组件入口                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加阶段           | `hooks/usePhaseOperations.ts:119`（`handleAddPhase`）                                  | `pages/ProjectEditor/index.tsx:1453`                                                                                                                                                                                                                                                                                                      |
| 加话题           | `usePhaseOperations.ts:281`                                                            | `ProjectEditor/index.tsx:1454`                                                                                                                                                                                                                                                                                                            |
| 加动作           | `usePhaseOperations.ts:564`（`handleAddAction` → `createActionByType` `:453-559`）     | `ProjectEditor/index.tsx:1455`；菜单 `components/ActionNodeList/index.tsx:781-796` 与 `:853-868`（两处 Dropdown，同样 6 项）                                                                                                                                                                                                              |
| 删阶段/话题/动作 | `usePhaseOperations.ts:168` / `:323` / `:598`                                          | `ProjectEditor/index.tsx:1456-1458`                                                                                                                                                                                                                                                                                                       |
| 改（表单保存）   | `usePhaseOperations.ts:207`（phase）/ `:368`（topic）/ `:652`（action）                | 动作面板 `components/ActionPropertyPanel/index.tsx:91-145`，自动保存 `:148-156`（**600 ms**）；`<Form onValuesChange={triggerAutoSave}>` `:214`                                                                                                                                                                                           |
| 拖拽（三种）     | `usePhaseOperations.ts:244`（move phase）/ `:409`（move topic）/ `:695`（move action） | `ProjectEditor/index.tsx:1459-1461`；DnD 实现在 `ActionNodeList/index.tsx:396-442`（action：`draggable` `:396`、dragStart `:398`、dragOver `:404`、drop `:414-441`、dragEnd `:442`）、`:550-605`（**phase header**：phase↔phase 同级排序 + topic→phase 追加到末尾，逻辑在 `:570-604`）、`:680-749`（**topic**：同级排序 + 跨 phase 移动） |

**「拖完怎么落 YAML」——通路只有一条，而且是同步的。**

```
拖拽 onDrop (ActionNodeList/index.tsx:414-441)
  → onMoveAction / onMovePhase / onMoveTopic (usePhaseOperations.ts:695 / :244 / :409)
      → syncPhasesToYaml(...)            ← 同步调用，同一个事件循环内
          → YamlService.syncPhasesToYaml (YamlService.ts:253)
              → js-yaml dump
              → setFileContent(newYaml)
                  → hasUnsavedChanges = true
                      → visual 模式 1 秒防抖 (ProjectEditor/index.tsx:1320-1348)
                          → handleSave (ProjectEditor/index.tsx:743-820)
                              → projectsApi.updateFile (:797)
                                  → PUT /api/projects/:id/files/:fileId (routes/projects.ts:584)
```

**关于「600 ms 自动落 YAML」这个说法：路径上没有 600 ms 这一跳。** 600 ms 是**属性面板表单**的防抖（`ActionPropertyPanel/index.tsx:155`；另有 `PhaseTopicPropertyPanel/index.tsx:169` 同值），它触发 `handleSave()` 更新前端 Action 对象，**真正写 YAML 仍是同步的 `syncPhasesToYaml`**。落盘的防抖是 **1000 ms**（`ProjectEditor/index.tsx:1338-1340`）。两个数字、两个层，容易混。

**四处静默丢字段/错位（用户看不见，落盘后才发现）。**

**(1) ai_say 落盘即丢三个字段** — `packages/script-editor/src/services/YamlService.ts:340-342`：

```ts
if (action.tone) config.tone = action.tone;
if (action.exit_condition) config.exit_condition = action.exit_condition;
if (action.max_rounds) config.max_rounds = action.max_rounds;
```

白名单只放这三个 + `content`（`:334-336`）。而属性面板给 ai_say 提供并写回的是（`ActionPropertyPanel/index.tsx:52-61` 填表、`:101-109` 保存）：

- `require_acknowledgment` —— **落盘时被丢弃**（引擎运行时会读：`ai-say-action.ts:417`）；
- `exit_criteria{understanding_threshold, has_questions}` —— **落盘时被丢弃**（引擎运行时用：`ai-say-action.ts:166`、`:171`；`base-action.ts:165`）；
- `max_rounds` —— 保留，但面板默认 5（`:57`）与引擎 schema 默认 20（`ai-say.schema.json:26`）不一致。

即：**用户在面板上勾选的「需要用户确认」「理解度阈值」，保存后从 YAML 里消失，引擎按默认值跑。**（引擎侧默认 `require_acknowledgment=true`，`:417`，所以这一条表现为"用户改不动"，恰是最难察觉的一类。）

**而且有一条测试正断言相反的行为。** `packages/script-editor/src/__tests__/ai-say-sync.test.ts` 的用例「场景4: require_acknowledgment 等其他字段的同步」（`:267-296`）断言 `require_acknowledgment`（`:280`）与 `max_rounds`（`:296`）能同步进 YAML —— 但它**没有 import 任何生产代码**（`:11-12` 只 import `js-yaml` 与 vitest），而是在测试文件内部**照抄了一份** parse/sync 实现（自陈「模拟解析和同步函数的核心逻辑」`:14`；本地 `parseYamlToScript` `:17-63`；同步侧 `:108-120`）。那份副本**会**同步 `require_acknowledgment`（`:113`），生产代码**不会**（`YamlService.ts:340-342`）。

即：**这条测试是绿色的，但它证明的是测试文件里那份旧副本的行为**（副本还停留在 `content_template` 时代，`:30`），与 `YamlService.ts` 无关。修 N2 时不能以它为准，且应先删掉这份会误导人的副本。（这些测试在根 vitest 里本就不跑，见 `runnability-baseline`。）

**(2) 拖拽后元数据按旧下标回填** — `YamlService.ts:309-320`：

```ts
updatedScript.session.phases = phases.map((phase, pi) => {
  const originalPhase = baseScript?.session?.phases?.[pi] || {};
  return { ...originalPhase, phase_id: ..., phase_name: ..., description: ...,
    topics: phase.topics.map((topic, ti) => {
      const originalTopic = originalPhase.topics?.[ti] || {};
      const topicResult: any = { ...originalTopic, topic_id: ..., topic_name: ..., description: ... };
```

重建时**按当前下标去基线脚本里取"原来那一个"**，取到的是换序前的同位置对象。显式覆写的字段（`phase_id`/`phase_name`/`description`/`topic_id`/`topic_name`/`description`/`topic_goal`/`strategy` — `:313-323`、`:437-455`）没事；**其余字段一律从错误的下标继承**。可被波及的 schema 合法字段至少包括：

- topic：`declare`（编辑器自己读写，`YamlService.ts:181`、`:459`）——见下面 (4)；
- phase：`phase_goal`（`phase.schema.json:20-24`）、`entry_condition`（`phase.schema.json:30-33`）——`syncPhasesToYaml` 全程没有显式写这两个字段，只能靠 `...originalPhase`（`:312`）继承。

结论：**拖拽换序 → 阶段目标/进入条件/话题变量声明跟着换到别的阶段去。**

**(3) 无 `_raw` 的动作，面板编辑整份丢弃** — `YamlService.ts:326`（`if (action._raw)`）与 `:428-430`：

```ts
    return rawAction;
  }
  return action;
```

`:428` 返回 `_raw`（原样，**面板编辑的内容全丢**）；`:430` 返回前端对象（形状是 UI 形状，不是 YAML 形状）。`createActionByType` 造的 Action 带 `_raw`（`usePhaseOperations.ts:497`、`:512` 可见其构造），所以**新建的没事**；但任何来源不明或旧格式的动作（`parseYamlToScript` 的兼容分支 `YamlService.ts:170-172` 直接 `actions.push(action)`，**不带 `_raw`**）在面板里编辑后不会生效。

**(4) `declare` 是一个三方对不上的孤儿字段**

- 编辑器读：`YamlService.ts:181`（`localVariables: topic.declare || []`）；写：`:457-463`；类型：`types/action.ts:122`。
- 引擎 schema **拒绝**：`topic.schema.json:44` 是 `additionalProperties: false`，而 `:8-42` 的属性表里**没有** `declare`。
- 引擎代码**不读**：全仓 `packages/core-engine/src` 里 `declare` 只出现在一条注释 —— `variable-scope-resolver.ts:9`「维护变量的作用域元数据（从脚本 declare 中读取）」，**没有实现**。

也即：话题级变量声明一旦非空，编辑器写出一个 schema 判定非法的字段；而引擎既不读也不认。写它，只会让「保存前校验」失败。（`session`/`global` 文件的保存前校验是阻塞的，见 §3.1。）

### 2.2 编排好的脚本，怎么跑到运行时？（本簇最要紧的一处断链）

这一节回答「用户编完的东西，到底能不能被跑起来」。**结论：一级路径不存在，只有一条明确标注为「调试」的旁路。**

**两套存储，互不相通。**

|        | 编辑器产出                                                                                            | 运行时消费                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 表     | `script_files`（`db/schema.ts:177-199`）                                                              | `scripts`（`db/schema.ts:115-137`）                                                                                                                                                                                            |
| 字段   | `yamlContent`（`db/schema.ts:188`，即编辑区内容）                                                     | `scriptContent`（`db/schema.ts:121`）                                                                                                                                                                                          |
| 写入者 | `PUT /projects/:id/files/:fileId`（`routes/projects.ts:584-631`），来自 `ProjectEditor/index.tsx:797` | `POST /api/scripts`（`routes/scripts.ts:12` 起）、`POST /api/scripts/import`（`:171-172`）、`POST /api/scripts/:scriptId/actions/:actionId/config`（`:359-360`，回写落在 `:443`）。`routes/scripts.ts` 通篇没有 `PUT`/`DELETE` |
| 读取者 | 编辑器自己                                                                                            | 会话运行时：`routes/sessions.ts:80` `loadScriptById(scriptId)` → `session-orchestrator.ts:112` `yaml.parse(script.scriptContent)`                                                                                              |

**没有任何代码把 `script_files` 写进 `scripts`。** `routes/projects.ts` 里没有 `insert(scripts)`（grep 空）；`routes/versions.ts` 的 publish（`:94-165`）只写 `project_versions`，不碰 `scripts`。

**唯一的通路是「调试导入」，且它自己就叫调试。**

- 端点：`POST /api/scripts/import`（`routes/scripts.ts:171-172`），路由描述原文是 **`'导入YAML脚本内容到数据库（用于调试）'`**（`:176`）。
- 它给脚本打 tag：`tags: ['debug', 'project:' + projectId]`（`:266`、`:281`）。
- 会话靠这个 tag 反查项目：`routes/sessions.ts:86-89`（`tags.find(t => t.startsWith('project:'))`）→ `repo.createSession(..., projectId)` → `metadata: { projectId }`（`session-repository.ts:656`）。
- 前端调用点只有两处，都在调试语境：`pages/ProjectEditor/index.tsx:703`（「继续上次会话」）、`components/DebugConfigModal/index.tsx:199`（调试面板）。

**于是「编排 → 运行」的完整路径是**：编辑器保存 → `script_files` →（用户点「调试」）→ `importScript` → `scripts` + tag → 建会话 → 引擎执行。

**连带的两个后果：**

1. **`session.template_scheme` 能生效，靠的正是 tag 里的 projectId。** 引擎用 `context.metadata.projectId` 去 DB 取模板（`ai-ask-action.ts:911`），而 projectId 只由 tag 带过来。所以 **CAP-05 的两层模板在运行时是通的**（§1.1 的链闭合），但它依赖的 projectId 也来自同一处调试导入。若不经导入建会话（直接指定别的 scriptId），模板一律走 Default 层。
2. **版本绑定是「只有列，没有写入方」。** `sessions` 表有 `versionId`（`:72`，FK → `project_versions.id`）与 `versionSnapshot`（`:73`）两列，索引也建了（`:83`），但**全仓无任何写入**：`grep -rn versionSnapshot packages/` 只命中 `db/schema.ts:73` 与 `dist/` 的 d.ts；`sessions.versionId` 亦然（另外两处 `versionId: uuidv4()` 分别在 `session-orchestrator.ts:159` 与 `session-repository.ts:479`，是 `rerunHistory` 的条目版本号，与列无关）。也就是说：**「会话跑的是哪个版本」这件事在数据模型里预留了位置，但没有任何代码填过。** 发布（`routes/versions.ts:139-145`）与回滚（`:317-364`）都只动 `project_versions` 与 `projects.currentVersionId`。

> 这条把 CAP-11 的「编排」定性收窄了：**编辑器是一个自洽的创作工作台**（编辑 → 保存 → 发布版本 → 回滚，全部可用），**但与运行时之间没有一级集成**。用户要让改动生效，必须走那条写着"用于调试"的路。

### 2.3 涉及的领域概念（含「三概念 ↔ 三表」的对表）

**战略层：Script Authoring 是不是一个独立限界上下文？**

| 证据                               | 说法                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/ddd/strategic-design.md:50`  | Script Authoring = 🟡 Supporting                                                                            |
| `docs/ddd/strategic-design.md:109` | 包 = `@heartrule/api-server` (projects) **+** `@heartrule/script-editor` (frontend)                         |
| `docs/ddd/context-map.md:23-33`    | 图上把 `script-editor` 这**一个包**标成 `Script Authoring (SUPPORTING)`                                     |
| `docs/ddd/context-map.md:45`       | Script Authoring (editor) → Consulting Session (engine)：**Conformist**，「editor follows engine's schema」 |

**两篇文档给的是两种切法**（一个是"跨两包的上下文"，一个是"一个包就是一个上下文"）——这就是 domain-ledger §1.1 D1 的原文分歧。以下是我的判定，附证据：

- **概念上成立**：它有自己的聚合根与不变性声明（`strategic-design.md:111-115`），有独立的领域语言（Project/Version/Draft/File/Publish/Rollback），且**与 Consulting Session 的 UL 不重叠** —— 咨询会话讲 Session/Phase/Topic/Action，创作侧讲 Project/Version/Draft/File。语言分层是真分开了。
- **实现上落在 api-server 的表里，不在编辑器里**：聚合根 `Project` 被登记为「`api-server/db/schema.ts` (DB entity)」（`strategic-design.md:255`）。`packages/core-engine/src/domain/` 下**没有任何** Script Authoring 类型（该目录只有 `session.ts`/`script.ts`/`variable.ts`/`message.ts`/`actions/`/`ports/`）。
- **编辑器侧的「上下文」没有领域模型**：它有的是 React 组件与一套**自己的** YAML 形状（`types/action.ts`），而不是领域对象。所以若按 `context-map.md:23-33` 的切法（编辑器=上下文），这个上下文是**空的**——里面没有聚合、没有值对象、没有领域服务。

**结论**：Script Authoring 作为**语言边界**成立（与咨询会话的语言不重叠），作为**实现单元**不成立（模型在 api-server 的 DB schema 里，编辑器只有 UI 状态）。`context-map.md:23-33` 那格标注把包当上下文，与实际内容不符。

**战术层：编辑器「草稿 / 版本 / 文件」三概念 ↔ 后端三表，不是 1:1。**

| 编辑器概念 | 前端类型                                 | 表                                        | 是否 1:1                            | 证据                                                                                                                                                                                 |
| ---------- | ---------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File       | `ScriptFile` `api/projects.ts:21-31`     | `script_files` `db/schema.ts:177-199`     | **成立**                            | 编辑器实际读写的就是这张表：`ProjectEditor/index.tsx:797` → `PUT /projects/:id/files/:fileId`（`routes/projects.ts:584`）                                                            |
| Version    | `ProjectVersion` `api/projects.ts:42-52` | `project_versions` `db/schema.ts:218-239` | **成立**（但只写在创作侧，见 §2.2） | 发布快照 `routes/versions.ts:122-136` 把 `script_files` 逐条写进 `versionFiles`；**没有任何会话绑定到版本**（`sessions.versionId`/`versionSnapshot` 无写入方，`db/schema.ts:72-73`） |
| Draft      | `ProjectDraft` `api/projects.ts:33-40`   | `project_drafts` `db/schema.ts:204-213`   | **不成立（装饰行）**                | 见下                                                                                                                                                                                 |

Draft 为什么是装饰行，三条证据：

1. **只在建项目时写一次，且内容为空**：`routes/projects.ts:159-161`（`upsertDraft(id, { draftFiles: {}, updatedBy })`）、`:487-489`（复制项目，同样 `draftFiles: {}`）。全仓 `upsertDraft` 的调用点共三处，第三处是服务端路由 `routes/versions.ts:68`（`PUT /projects/:id/draft`）—— 该路由**没有前端调用方**（`api/projects.ts:327` 的 `saveDraft` 零 caller），所以实际上只有建项目那两次会执行。另：`ProjectRepository` 无 `updateDraft`/`updateVersion` 方法（`services/project-repository.ts:44,149` 即全部），版本确为只写不改。
2. **发布不读它的内容**：`routes/versions.ts:113` 取草稿、`:115-120` 仅在草稿**行不存在**时 404；`:122-136` 的快照来源是 `findScriptFilesByProjectId(id)`（`:123`）。也就是说 `draftFiles` 是空是满，对发布结果零影响，但**必须先有这行**。
3. **前端拿到它也不用**：`components/VersionListPanel/VersionListPanel.tsx:50-51` 同时调 `getVersions` + `getDraft`，`draftFiles` 从未被读——只取 `draftExists` / `draftUpdatedAt` 做徽标。写侧 `saveDraft`（`api/projects.ts:327`）**零调用方**（全仓 grep 只有定义）。

于是「Draft 可随时修改，publish 时快照为 Version」这条不变性（`strategic-design.md:114`）在实现里由**另一条路**满足：文件的每次保存直接写 `script_files`（`routes/projects.ts:584-631`），publish 快照 `script_files`。**Draft 表被架空了，语义搬到了 `script_files` 上** —— 「工作区」概念换成了「文件表即工作区」。这解释了 `VersionListPanel` 为何要用 `draftExists` 这种存在性徽标：它除了存在，没别的可显示。

**依赖方向：文档说「只用 shared-types + REST」，代码是「看不见的 core-engine 依赖」。**

- 文档：`docs/ddd/strategic-design.md:329`（`script-editor (独立叶节点 — 仅依赖 shared-types)`）、`:334`（`script-editor 不依赖 core-engine 或 api-server — 通过 REST API 通信（ACL）`）；`context-map.md:23`（`REST API client to api-server`）。
- 代码：`packages/script-editor/src` 里 **4 处** import `@heartrule/core-engine`：
  - `services/validation-service.ts:11`（**值导入** `schemaValidator`）、`components/ActionPropertyPanel/index.tsx:2`（类型）、`components/ValidationErrorPanel/ValidationErrorPanel.tsx:8`（类型）；`validation-service.ts:12` 另有类型导入。
- 而 `packages/script-editor/package.json:14-28` 的 dependencies **没有** `@heartrule/core-engine`；`packages/script-editor/node_modules/@heartrule/` 下只有 `shared-types`。它靠 pnpm 提升到根 `node_modules/@heartrule/core-engine` 才解析得动 —— 典型 **phantom dependency**。

**这个依赖方向意味着什么**（回答任务里的追问）：Conformist 的本意是「下游跟随上游的**契约**」（`context-map.md:45`：follows engine's schema），而实现走成了「下游直接把上游的**实现**打进自己的产物」。两者后果不同：

1. 文档设想的边界（REST + schema 契约）在代码里没有落地 —— 校验跑在浏览器里（§3.1），core-engine 的代码被 Vite 打进前端包（`runnability-baseline` 记录的 3007.87 kB 与 `"resolve" is not exported by "__vite-browser-external"` 就是这个后果）；
2. 契约演化不再是「上游改 schema → 下游重新生成/适配」，而是「升级 core-engine 就换掉了前端的全部校验行为」——**耦合比文档描述的重一个量级**；
3. 又因为 `@heartrule/core-engine` 没写进 package.json，**这次耦合连声明都没有** —— 根 typecheck 排除 script-editor（mess-map MESS-F-06）之后，它连报错的机会都没有。

### 2.4 对应设计文档

| 文档                                                          | status         | 说了什么                                                                                | 与代码对不对得上                                                                                                                                                                                 |
| ------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/ddd/strategic-design.md:107-115`                        | 无 frontmatter | 领域语言、聚合根 `Project`、三条不变性                                                  | **两条对不上**：Draft 不变性（见 §2.3）；「Version 创建后不可变」无法验证——`projectVersions` 表有 `createVersion` 但无 update 路径（`routes/versions.ts` 只有 publish 写入）                     |
| `docs/ddd/strategic-design.md:251-258`                        | 无 frontmatter | 3.5 节模式清单：应用服务 `ProjectInitializer`、ACL = `routes/projects.ts`/`versions.ts` | **对得上**（文件都在；`ProjectRepository` 在 `api-server/services/project-repository.ts`）                                                                                                       |
| `docs/ddd/context-map.md:45`                                  | 无 frontmatter | Conformist；follows engine's schema                                                     | **半对**：意图对，机制不对（见 §2.3 依赖方向）                                                                                                                                                   |
| `docs/design/foundation/architecture-constraints.md:19`（A4） | `draft`        | 「Script Authoring → Consulting Session 为 Conformist」                                 | **同上**                                                                                                                                                                                         |
| `docs/design/` 全域                                           | —              | —                                                                                       | **编辑器（CAP-11/12 的主体）在 `docs/design/` 里没有任何一篇文档。** `docs/design/foundation/script-engine-design-principles.md` 讲 DSL 该长什么样，不讲编辑器怎么用。这是本簇最大的一处文档空白 |

补充：`docs/design/README.md:4-8` 声明 `docs/ddd/` 独立存放战略设计，因此**这四篇 DDD 文档不在 `docs/design/README.md` 的状态表里**，也没有 `status` frontmatter（头部只有 `> **分析日期:**` 之类的引用块）。按「设计封板」约定（CLAUDE.md 第 3 条：`docs/design/` 下文档有 status），**这几篇的"封板"状态无处可查** —— 但它们承载了 A4/B2 两条红线的出处（`architecture-constraints.md:19,27` 均引 `strategic-design.md`）。是个索引漏洞。

### 2.5 缺口

**没做：**

- **编排产物到运行时的一级通路**（§2.2）：没有「发布 → 可运行脚本」的一步，会话绑定版本的两列也无人写。
- 编辑器无设计文档（§2.4 末行）。
- `Project` 无领域实体，只有 DB 表 + SQL（`strategic-design.md:255` 自陈 "(DB entity)"）；「不可变性」类规则无处安放，只能靠路由层的流程约束。
- Draft 的语义（可修改、发布时快照）没有实现载体（§2.3）。

**做了但接不上：**

- **方案选择有两个入口，只有一个通电**：`ProjectList/index.tsx:90,446`（建项目）→ 后端 stub（`project-initializer.ts:80-85`）；`SessionPropertyPanel/index.tsx:212`（会话属性面板）→ 真正落 YAML。属 CAP-05 缺口 A 的另一面。
- **`declare` 三方错位**（§2.1 (4)）：编辑器写、schema 拒、引擎不读。
- **`_raw` 缺失时面板编辑整份丢弃**（§2.1 (3)）：无提示、无日志。
- **拖拽换序后元数据错位**（§2.1 (2)）：无提示。
- **ai_say 面板字段落盘丢失**（§2.1 (1)）：无提示。

---

## 三、CAP-12 直接编辑 YAML 文本

### 3.1 实现度：端到端可用（「提示」不是「行内」级别）

**编辑面**：`packages/script-editor/src/pages/ProjectEditor/EditorContent.tsx:239-249`，`<CodeMirror>` 的 `extensions` **只有** `yamlLang()`（`:243`）—— 没有 lint、没有 gutter、没有装饰器。

**校验的四个触发点**（全在 `pages/ProjectEditor/index.tsx`）：

| #   | 触发                       | 位置                                | 是否阻塞保存                                    |
| --- | -------------------------- | ----------------------------------- | ----------------------------------------------- |
| 1   | 打开文件                   | `:542`（session）、`:556`（global） | 否                                              |
| 2   | 内容变更（**边打边校验**） | `:656`（session）、`:665`（global） | 否                                              |
| 3   | 格式化/缩进修复之后        | `:1019`                             | 否                                              |
| 4   | 手动按钮                   | `:1417`                             | 否                                              |
| ★   | **保存前**                 | `:773-784`                          | **是**（`:779-781` `message.error` + `return`） |

- 入口函数：`handleContentChange`（`:644-670`）→ `validationServiceRef.current.validateOnChange(value, cb)`。
- 防抖 500 ms：`hooks/useEditorState.ts:86`（`new ValidationService({ debounceMs: 500 })`）→ `services/validation-service.ts:52`（默认值）、`:117-121`（`window.setTimeout`）。
- 校验实现：`validation-service.ts:62`（`schemaValidator.validateYAML(yamlContent)`）。
- 结果展示：`EditorContent.tsx:232-238`（`<ValidationErrorPanel>`，YAML 模式，JSX 起于 `:233`）；visual 模式另有摘要条 `EditorContent.tsx:255-266`。

**校验链是不是同一条？—— 是，同一条，而且同一个实例。**

- 前端：`validation-service.ts:11` `import { schemaValidator } from '@heartrule/core-engine'`，`:62` 调 `validateYAML`。
- 后端：`packages/api-server/src/routes/scripts.ts:1`（import `schemaValidator`）、`:335`（`POST /api/scripts/:id/validate` 内调用 `validateYAML`）。
- 两边指向**同一个单例**：`packages/core-engine/src/adapters/inbound/script-schema/validators/schema-validator.ts:487`（`export const schemaValidator = new SchemaValidator()`）。
- **但后端这个端点没有编辑器调用方**：`packages/script-editor/src/api/` 下只有 `debug.ts` 与 `projects.ts` 两个文件，全仓 grep 无对 `/api/scripts/:id/validate` 的请求。**校验实际跑在浏览器里**，用被 Vite 打进来的 core-engine 代码。

**「行号提示」只在两处成立，动作级错误没有行号。**

- 有行号：YAML 语法错误（`schema-validator.ts:201`、`:207` `mark.line + 1`、`:209` 消息前缀「第 N 行」）；`global.yaml` 的变量定义错误（`buildGlobalLineMap` `:377-403`，用于 `:100-101`）。
- **没有行号**：session 脚本的动作级 schema 错误 —— `path` 直接取 AJV 的 `instancePath`，形如 `session.phases[0].topics[1].actions[2].config.field`，面板原样展示（`ValidationErrorPanel.tsx:149`、`:75`）。用户看到的是 JSON 指针，不是 YAML 行号。

### 3.2 涉及的领域概念

- **权威是引擎侧 10 个 JSON Schema**（`packages/core-engine/src/adapters/inbound/script-schema/`：`session`/`phase`/`topic`/`actions/base`/4 个 action config/`common/output-field`/`global`），注册于 `SchemaRegistry`（`validators/schema-registry.ts:19-31` import、`:65-80` `addSchema` ×10），单例暴露于 `schema-validator.ts:487`。
- **「脚本」有两套领域命名，同一份数据**：

| 层                  | 类型                                           | 位置                                                 |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| core-engine（权威） | `Script` / `Phase` / `Topic` / `Action` 值对象 | `packages/core-engine/src/domain/script.ts`          |
| script-editor（旧） | `SessionScript` / `Stage` / `Step`             | `packages/script-editor/src/types/action.ts:116-143` |

同一份 YAML，引擎叫 phase/topic，编辑器有一半代码叫 Stage/Step（domain-ledger §1.3 D11）。**CAP-12 的 YAML 面板用的却是引擎的叫法**（`if (parsed?.session?.phases)`，`YamlService.ts:94`）—— 两套命名在同一次编辑会话里并存。

- **`ValidationErrorDetail` 是一个跨包值对象**：定义在 `script-schema/validators/schema-validation-error.ts:4-16`（`path`/`errorType`/`message`/`expected`/`actual`/`suggestion`），被编辑器当类型用（`ActionPropertyPanel/index.tsx:2`、`ValidationErrorPanel.tsx:8`）。**它是被 import 的具体类型，不是 port** —— 引擎校验器的返回类型直接泄漏到 UI，这就是 CAP-11 §2.3「依赖方向」问题的具体形态：**本该是 port（契约），写成了具体实现**。
- 「schema 即契约」这条设计原则**只在文档里**：`docs/design/foundation/script-engine-design-principles.md:98-99`（P3 语法确定性 ↔ Schema 先行、一字一义）、`:330`、`:338`、`:340`、`:349-351`（策略 3.1 Schema 先行）、`:387-395`（策略 3.3 结构化验证反馈）。

### 3.3 对应设计文档

| 文档                                                                           | status                                                             | 说了什么                                                                                     | 与代码对不对得上                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `docs/design/foundation/script-engine-design-principles.md`                    | `decision-recorded`                                                | P3 语法确定性：Schema 先行、一字一义、结构化验证反馈、禁止语法糖（`:98-99`、`:330-395`）     | **方向对得上，程度对不上**：Schema 先行 ✅（10 个 schema + AJV）；结构化验证反馈 ⚠️ 动作级错误给的是 instancePath 而非行号+可用值列表（`:389` 的要求是「精确的定位和可用值列表」）；一字一义 ❌ 与 §四 的字段三重命名直接冲突 |
| `docs/design/foundation/architecture-constraints.md`                           | `draft`                                                            | 未涉及编辑器/Schema 校验                                                                     | —                                                                                                                                                                                                                             |
| `docs-archive/misc/editor-validation-integration.md`                           | `archived`（`authority: historical`，`archived_date: 2026-03-13`） | 设计与集成方案；`:102-107` 防抖实现；`:395`「行号左侧显示红色错误图标 ❌」                   | **防抖对得上**（代码 500 ms：`validation-service.ts:52`）；**行内标记对不上**：全仓无 `InlineErrorMarker`（grep 空），CodeMirror 无任何 lint 扩展（`EditorContent.tsx:243`）                                                  |
| `docs-archive/misc/editor-validation-integration-complete.md`                  | `archived`                                                         | 集成完成版                                                                                   | 同上（属同一方案的后继）                                                                                                                                                                                                      |
| `docs-archive/architecture/visual-editor-validation-implementation-summary.md` | `archived`                                                         | `:307-319` 技术亮点：条件验证、错误路径正则解析、React 性能优化（500 ms 防抖）、中文错误消息 | **条件验证对得上**（`base.schema.json:29-73` allOf+if/then）；**500 ms 对得上**（`:319` vs `validation-service.ts:52`）；**「错误路径正则解析…供 UI 展示精确位置」对不上**：编辑器侧无路径解析代码（grep `instancePath        | parsePath` 空），路径由引擎侧 AJV 原样给出 |
| `docs-archive/misc/T21-IMPLEMENTATION-SUMMARY.md`                              | `archived`                                                         | T21 任务实现总结                                                                             | 同上批                                                                                                                                                                                                                        |

**归档文档的可达性本身有问题**：这 4 篇的 frontmatter 都写着 `ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'`（例如 `editor-validation-integration.md:10`），但**本仓没有 OpenSpec 系统**（`migrated_to: ''` 全为空）。即：唯一描述过编辑器校验设计意图的文档，正把读者指向一个不存在的地方。这是本簇**已知设计意图的唯一载体**，值得在清理时优先处置。

### 3.4 缺口

**没做：**

- 行内错误标记（YAML 里的波浪线/gutter 图标）—— 归档文档承诺过（`editor-validation-integration.md:395`），代码里没有。
- 动作级错误的行号定位 —— 只有 instancePath（§3.1）。
- 客户端未使用后端校验端点（`routes/scripts.ts:335` 无调用方）。

**做了但接不上：**

- **校验能力被复制进浏览器**：同一份 `schemaValidator` 在两端各跑一份，后端那一份是死代码。要改校验行为，得同时发前端和后端。
- **错误位置信息在传输中降级**：引擎能算出 global.yaml 的行号（`schema-validator.ts:377-403`），session 的动作级错误算不出；面板只能显示 JSON 路径。
- **`ValidationErrorDetail` 走的是 `import type`/值导入，不是 port**（`validation-service.ts:11-12`），导致 CAP-11 §2.3 的 phantom dependency 无法通过声明修复。

---

## 四、DSL 双实现：字段级对照

> mess-map MESS-B-01「全仓最值得查清的一处」。本节是那个"查清"。

### 4.1 两边各是什么

|            | 引擎侧（权威）                                                                                                                                         | 编辑器侧                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 位置       | `packages/core-engine/src/adapters/inbound/script-schema/`                                                                                             | `packages/script-editor/src/services/YamlService.ts`                                                                                                  |
| 形态       | 10 个 JSON Schema（draft-07）+ AJV 校验器                                                                                                              | 手写 `parseYamlToScript` / `syncPhasesToYaml` 两个转换函数                                                                                            |
| 规模       | 10 个 `.json` 合计 **408 行**（`session` 53 + `phase` 44 + `topic` 45 + `global` 35 + `actions/base` 76 + 4 个 action config 123 + `output-field` 32） | **930 行**，单文件（`parseYamlToScript:86`、`syncPhasesToYaml:253`、`fixYamlIndentation:516`、`extractSessionConfig:820`、`updateSessionConfig:861`） |
| 声明的职责 | 说「什么合法」                                                                                                                                         | 说「YAML 怎么变前端对象、又怎么变回去」                                                                                                               |
| 校验器     | `validators/schema-registry.ts`（168 行，`addSchema` ×10）、`validators/schema-validator.ts`（488 行，单例 `:487`）                                    | 不自带 schema，直接 import 引擎的 `schemaValidator`（`validation-service.ts:11`）                                                                     |
| 依赖       | **零依赖**（`@heartrule/shared-types` 都不 import）                                                                                                    | 只 import `../api/projects`、`../types/action`（mess-map MESS-B-01 已记：**不 import `@heartrule/shared-types`**）                                    |

**共同点只有一处**：编辑器**借用**引擎的校验器（`validation-service.ts:11`）。除此之外两边**没有任何共享的字段清单** —— 没有共享的 TS 类型、没有共享的常量、没有代码生成。字段名字符串在两边各自手写。

### 4.2 覆盖范围对照

| 层级    | 引擎 schema                                                                                                       | 编辑器转换                                                                                                                                              | 对齐?                             |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| session | `session.schema.json`（`session_id`/`session_name`/`template_scheme`/`description`/`version`/`phases`，`:12-47`） | `extractSessionConfig` `:820`、`updateSessionConfig` `:861`（写 name/description/version/template_scheme，`:875-881`、`:889-893`）                      | ✅ 字段名一致                     |
| phase   | `phase.schema.json`（`phase_id`/`phase_name`/`phase_goal`/`description`/`entry_condition`/`topics`）              | `syncPhasesToYaml` 显式写 `phase_id`/`phase_name`/`description`（`:313-315`）；`phase_goal`/`entry_condition` 不写（靠 `...originalPhase` `:312` 继承） | ⚠️ 见 §4.6                        |
| topic   | `topic.schema.json`（`topic_id`/`topic_name`/`topic_goal`/`description`/`strategy`/`actions`，`:8-42`）           | 显式写 `topic_id`/`topic_name`/`description`（`:321-323`）/`topic_goal`/`strategy`（`:437-455`）/`declare`（`:459`）                                    | ❌ `declare` 是 schema 之外的字段 |
| action  | `actions/base.schema.json`                                                                                        | `YamlService.ts:326-430`                                                                                                                                | ❌ 见 §4.3-4.5                    |
| global  | `global.schema.json`                                                                                              | 无独立转换（global.yaml 直接文本编辑）                                                                                                                  | ✅ 不涉及                         |

**动作类型覆盖**：引擎 base 的 `enum` 是 4 个（`actions/base.schema.json:11`：`ai_say`/`ai_ask`/`ai_think`/`use_skill`）；编辑器 `parseYamlToScript` 的分支是 4 + 3（`ai_say:105`、`ai_ask:120`、`ai_think:138`、`use_skill:153`，加三个旧格式兼容分支 `:163-172`）。**但编辑器的 UI 菜单给 6 个**（`ActionNodeList/index.tsx:781-796`）—— 多出 `show_form`、`show_pic`，两者在引擎 enum 之外（mess-map MESS-C-06）。

### 4.3 ai_say 字段级对照

| 字段                     | 引擎 schema `ai-say.schema.json`                         | 引擎运行时读取                                          | 编辑器面板填写 `ActionPropertyPanel:52-61,101-109`       | 编辑器 parse 读 `YamlService:105-119`        | 编辑器 sync 写 `YamlService:329-351` | 判定                                 |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------ | ------------------------------------ |
| `content`                | ✅ 必填 `:7,9-13`                                        | ✅ `ai-say-action.ts:413,609,637`                       | ✅ `:54`                                                 | ✅ `:106`（`content \|\| content_template`） | ✅ `:336`                            | **一致**                             |
| `tone`                   | ✅ `:14-17`                                              | ✅ `ai-say-action.ts:625`                               | ✅ `:55`                                                 | ✅ `:108`                                    | ✅ `:340`                            | **一致**                             |
| `exit`                   | ✅ `:18-21`                                              | ❌ 无读取点                                             | ❌ 面板无此项                                            | ❌ 不读                                      | ❌ 不写                              | **schema 有、两端皆无**              |
| `max_rounds`             | ✅ `:22-28`（default **20**）                            | ✅ `base-action.ts:165`；`ai-say-action.ts:166`         | ✅ `:57`（default **5**）                                | ✅ `:110`                                    | ✅ `:342`                            | ⚠️ 默认值两端不一（20 vs 5）         |
| `exit_condition`         | ❌ **不在 schema**（`additionalProperties:false` `:30`） | ❌                                                      | ❌                                                       | ✅ `:109`                                    | ✅ `:341`（若 YAML 里有则回写）      | ⚠️ 幽灵字段：schema 拒绝，编辑器照搬 |
| `exit_criteria`          | ❌ **不在 schema**                                       | ✅ `ai-say-action.ts:166`、`:171`、`base-action.ts:165` | ✅ `:58-61`（`understanding_threshold`/`has_questions`） | ❌ 不读                                      | ❌ **不写（丢）**                    | ❌ **运行时读、面板填、立刻丢**      |
| `require_acknowledgment` | ❌ **不在 schema**                                       | ✅ `ai-say-action.ts:417`（default `true`）             | ✅ `:56`                                                 | ❌ 不读                                      | ❌ **不写（丢）**                    | ❌ **运行时读、面板填、立刻丢**      |
| `ai_role`                | ❌ **不在 schema**                                       | ✅ `ai-say-action.ts:304`（default `'咨询师'`）         | ❌                                                       | ❌                                           | ❌                                   | ❌ 引擎读、schema 拒、编辑器不可见   |
| `content_template`       | ❌（已废弃）                                             | ✅ `:413,609,637` 兜底                                  | ❌                                                       | ✅ `:107` 兜底                               | ❌                                   | ⚠️ 废弃字段仍在运行时生效            |
| `condition`              | ✅ `actions/base.schema.json:20-23`                      | —                                                       | ✅ `:49,98`                                              | ✅ `:112`                                    | ✅ `:347-349`                        | **一致**                             |

**ai_say 小结**：`content`/`tone`/`max_rounds` 三家一致；`exit` 是 schema 独有的孤岛；`exit_criteria`/`require_acknowledgment`/`ai_role` 是**引擎要、schema 禁、编辑器丢**的三方错位 —— 而它们恰好是「需要用户确认」「理解度阈值」这类**行为开关**，丢掉之后引擎按默认值静默运行。

### 4.4 ai_ask 字段级对照

| 字段                                                 | 引擎 schema `ai-ask.schema.json`                | 引擎运行时读取 `ai-ask-action.ts`                                  | 编辑器面板 `ActionPropertyPanel:62-69,110-119` | 编辑器 parse `YamlService:120-137` | 编辑器 sync `YamlService:352-379` | 判定                                                  |
| ---------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `content`                                            | ✅ 必填 `:7,9-13`                               | ✅ `:556`（`content \|\| question_template \|\| prompt_template`） | ✅ `:63`                                       | ✅ `:121-124`（同序 `\|\|`）       | ✅ `:359`                         | **一致**                                              |
| `tone`                                               | ✅ `:14-17`                                     | ✅ `:585`（default `'温和、同理心、专业'`）                        | ✅ `:64`                                       | ✅ `:127`                          | ✅ `:363`                         | **一致**                                              |
| `exit_condition`                                     | ✅ `:18-22`（default `'用户提供了足够的信息'`） | ✅ `:72,85,564`                                                    | ✅ `:65`                                       | ✅ `:128`                          | ✅ `:364`                         | **一致**                                              |
| `output[]`                                           | ✅ `:23-29`，item = `output-field.schema.json`  | ✅ `:393,450,628,661,865,1154,1172`                                | ✅ `:69,118`                                   | ✅ `:129`                          | ✅ `:369`（非空才写）             | **一致**                                              |
| `max_rounds`                                         | ✅ `:30-36`（default **100**）                  | ⚠️ `:59`（`getConfig('max_rounds', 20)`）                          | ✅ `:68`（default **10**）                     | ✅ `:130`                          | ✅ `:365`                         | ⚠️ 三个默认值：schema 100 / 引擎 20 / 面板 10         |
| `question_template`                                  | ❌（已废弃）                                    | ✅ `:557` 兜底                                                     | ✅ `:67,116`                                   | ✅ `:122` 兜底                     | ❌                                | ⚠️ 废弃字段仍在运行时生效                             |
| `tolist`                                             | ❌ **不在 schema**                              | ❌                                                                 | ✅ `:66,115`                                   | ❌                                 | ❌                                | ⚠️ 面板可填，落盘即丢（sync 注释自陈「移除」`：354`） |
| `target_variable` / `extraction_prompt` / `required` | ❌                                              | ✅ `:477`（`target_variable` 仍读）                                | ❌                                             | ❌                                 | ❌                                | ⚠️ 注释声明已移除（`:354`），运行时仍读一个           |
| `condition`                                          | ✅ base `:20-23`                                | —                                                                  | ✅                                             | ✅ `:131`                          | ✅ `:375-377`                     | **一致**                                              |

**`output[]` 的 item 字段对照**（引擎 `common/output-field.schema.json` vs 编辑器 `types/action.ts:7-12`）：

| item 字段 | 引擎 schema                                                                   | 引擎运行时                          | 编辑器类型        | 判定                                       |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------- | ----------------- | ------------------------------------------ |
| `get`     | ✅ `:8-11`                                                                    | 间接（`output` 整体传给 extractor） | ✅ `:8`           | 一致                                       |
| `set`     | ✅ `:12-15`                                                                   | 同上                                | ✅ `:9`           | 一致                                       |
| `define`  | ✅ `:16-19`                                                                   | ✅ `ai-ask-action.ts:883`           | ✅ `:10`          | 一致                                       |
| `value`   | ✅ `:20-23`                                                                   | 同上                                | ✅ `:11`          | 一致                                       |
| `require` | ✅ `:24-29`（enum `即时`/`本次对话内`/`可推迟`/`持续跟踪`，default `可推迟`） | ❌ 无读取点                         | ❌ **类型里没有** | ❌ **schema 有、编辑器无法表达、引擎不读** |

> `require` 是「信息收集紧迫度」——正是 topic 队列机制（`docs/design/topic/topic-queue-implementation.md`，status `decision-recorded`）需要的那种信号，但**它在实现里三头落空**：编辑器造不出、引擎不读、只有 schema 和文档记得它。

### 4.5 ai_think 字段级对照（三方全错）

| 字段               | 引擎 schema `ai-think.schema.json` | 引擎运行时读取 `ai-think-action.ts`                               | 编辑器面板 `ActionPropertyPanel:70-72,120-124` | 编辑器 parse `YamlService:138-152`                                        | 编辑器 sync `YamlService:380-401` | 判定                                   |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------- | -------------------------------------- |
| `content`          | ✅ **必填** `:7,9-13`              | ❌ **不读**                                                       | ✅ `:71`（字段名 `think`）                     | ✅ `:140-143`（`content \|\| prompt_template \|\| think_goal` → `think`） | ✅ `:386`                         | ❌ **schema 要求、编辑器写、引擎不读** |
| `output`           | ✅ `:14-20`                        | ❌ **不读**                                                       | ✅ `:72`                                       | ✅ `:145`                                                                 | ✅ `:391`                         | ❌ **同上**                            |
| `think_goal`       | ❌ **不在 schema**                 | ✅ `:23`（`config.think_goal \|\| config.thinkGoal`）             | ❌                                             | ✅ `:142`（第三兜底）                                                     | ❌                                | ❌ **引擎读、schema 拒**               |
| `output_variables` | ❌ **不在 schema**                 | ✅ `:24`（`config.output_variables \|\| config.outputVariables`） | ❌                                             | ❌                                                                        | ❌                                | ❌ **引擎读、schema 拒、编辑器看不见** |
| `condition`        | ✅ base `:20-23`                   | —                                                                 | ✅                                             | ✅ `:148`                                                                 | ✅ `:397`                         | 一致                                   |

**结论**：一个**通过校验**的 ai_think（`config: { content, output }`）交给引擎，`ai-think-action.ts:23-24` 两个 `||` 全落空 → `thinkGoal = ''`、`outputVariables = []` → `:31` 的循环零次迭代 → 返回 `extractedVariables: {}`。而 ai_think 本身是桩（`:4-5` 注释「MVP 简化版本：直接返回成功，不实际调用 LLM」、`:45` `note: 'MVP版本：占位符实现，未实际调用LLM'`）。

即 mess-map MESS-C-02 之外还有一层：**即便将来把 ai_think 接上 LLM，编辑器产出的 ai_think 也喂不进去** —— 字段名对不上，且是三方（schema / 运行时 / 编辑器）各自错位。这一条建议单独记档：修 ai_think 时要同时动三处。

### 4.6 层级字段与命名细节

| 项                             | 事实                                                                                                                                                       | 位置                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 文件名 ≠ `$id`                 | 文件叫 `actions/base.schema.json`，`$id` 是 `action-base.schema.json`                                                                                      | `actions/base.schema.json:3`            |
| `$ref` 用的是 `$id` 不是文件名 | `topic.schema.json:39` `$ref: "action-base.schema.json"`；`actions/ai-say.schema.json:3` `$id: "ai-say-config.schema.json"`，被 `base.schema.json:47` 引用 | 两处一致，**AJV 按 `$id` 解析，能跑通** |
| 注册顺序有隐式依赖             | `outputFieldSchema` 先注册（`:65`），再 action（`:68-72`），再层级（`:75-77`），最后 global（`:80`）。AJV `addSchema` 不做前向引用解析，顺序即正确性       | `schema-registry.ts:65-80`              |
| AJV 严格模式                   | `strict: true`（`:49`）、`allErrors: true`（`:47`），配合 `additionalProperties: false` → 多一个字段就报错                                                 | `schema-registry.ts:47-49`              |
| phase 级字段无人写             | `phase_goal`（`phase.schema.json:20-24`）、`entry_condition`（`:30-33`）在 `syncPhasesToYaml` 中无显式写入，只靠对象展开继承                               | `YamlService.ts:312`                    |
| topic 多写一个                 | `declare` 被写入但 schema 无此字段（`topic.schema.json:44` `additionalProperties: false`）                                                                 | `YamlService.ts:459`                    |

### 4.7 汇总：四类错位

1. **schema 独有的孤儿**：`ai_say.config.exit`（`ai-say.schema.json:18-21`）、`output[].require`（`output-field.schema.json:24-29`）—— 校验器认，没人读，编辑器也造不出。
2. **运行时独有的野生字段**：`ai_say.config.ai_role`（`ai-say-action.ts:304`）、`ai_think.config.think_goal`/`output_variables`（`ai-think-action.ts:23-24`）、`ai_ask.config.target_variable`（`ai-ask-action.ts:477`）—— 能跑，但**写了就过不了校验**（`additionalProperties: false`）。用户若手写这些字段，保存会被拦。
3. **面板独有的幽灵**：`ai_say` 的 `exit_criteria`/`require_acknowledgment`、`ai_ask` 的 `tolist`、topic 的 `declare` —— 用户在 UI 上填了，落盘即丢（或落盘即非法）。
4. **默认值三份**：`ai_ask.max_rounds` 有 100（schema `:34`）/ 20（`ai-ask-action.ts:59`、`base-action.ts:165`）/ 10（`ActionPropertyPanel:68`）三个值；`ai_say.max_rounds` 有 20（schema `:26`）/ 5（面板 `:57`）两个值。

**根因（可执行的一条）**：两边唯一的共享物是「校验器」，**没有共享的字段清单**。编辑器侧的字段名单是 `YamlService.ts:329-430` 的 4 段手写白名单 + `ActionPropertyPanel` 的 6 段手写表单；引擎侧是 10 份 JSON。**任何一次字段增删都要人肉同步 4-6 处**，而历史证明没同步上（以上四类都是）。

---

## 五、本簇未解问题

> 编号 N1…N16，按「是否阻塞用户」排序。每条附最小证据；**不在此处落故事**（后续波次的事）。

**阻塞用户正确性的：**

1. **拖拽换序 → 阶段/话题元数据错位**（`YamlService.ts:309-320`）。影响面至少含 `phase_goal`、`entry_condition`、topic `declare`。当前无测试覆盖（`syncPhasesToYaml` 的基线下标假设）。
2. **ai_say 的行为开关落盘即丢**：`exit_criteria`、`require_acknowledgment`（面板 `ActionPropertyPanel:52-61,101-109` 填 → `YamlService.ts:340-342` 丢）。用户改不动「理解度阈值」和「需不需要确认」。另注意 `__tests__/ai-say-sync.test.ts` 用**自抄副本**断言这两个字段能同步（`:267-296`），修这条时不要被它带偏。
3. **ai_think 三方字段错位**（§4.5）：schema `content`/`output` ← → 运行时 `think_goal`/`output_variables` ← → 编辑器 `think`。修 ai_think 时必须同时动三处，否则接上 LLM 也喂不进去。
4. **`declare` 三方错位**（`YamlService.ts:181,459` vs `topic.schema.json:44` vs `variable-scope-resolver.ts:9` 的注释）：写了就校验失败，引擎又不读。
5. **`output[].require` 三头落空**（`output-field.schema.json:24-29`）：schema 有、编辑器类型无（`types/action.ts:7-12`）、引擎不读。而它承载的「信息收集紧迫度」是 topic 队列机制（`docs/design/topic/topic-queue-implementation.md`，`decision-recorded`）需要的信号。
6. **`ai_ask.max_rounds` 三个默认值**（100/20/10，§4.6）。同一配置项在三处给出不同默认，行为取决于代码路径。

**阻塞功能可用的：**

7. **建项目时选的方案不落 YAML**（`project-initializer.ts:80-85` stub；前端已在收集 `ProjectList/index.tsx:90,446`）。用户必须去会话属性面板再选一次，否则一直用 Default 层。
8. **Default 层模板无写保护**（后端 `routes/projects.ts:791-810` 不校验 layer，`:806-809` 直接把 `default` 拼成路径；前端 `ProjectEditor/index.tsx:758-762` 是唯一防线）。系统默认模板可被 REST 直连改写。
9. **编辑器菜单给 6 种动作，引擎只认 3 种**。菜单 6 项：`ai_say`/`ai_ask`/`ai_think`/`use_skill`/`show_form`/`show_pic`（`ActionNodeList/index.tsx:781-796`、`:853-868`）。引擎 schema enum 4 项（`actions/base.schema.json:11`）。引擎 `ActionRegistry` 3 项（`application/actions/action-registry.ts`，`use_skill` 被注释掉 `:22`，未注册时 `:41-42` 抛错）。**完整差集**：`use_skill`（schema 认、registry 不认 → 运行抛错）、`show_form`（两端皆不认）、`show_pic`（两端皆不认）。即用户能建 3 种跑不了的动作。
10. **编排产物到运行时没有一级通路**（§2.2）。编辑器写 `script_files`，运行时读 `scripts`，两者之间只有 `POST /api/scripts/import`（`routes/scripts.ts:171-172`，路由自述"用于调试"）；项目与会话的关联靠脚本文本里的 tag（`tags: ['debug', 'project:'+projectId]` `:266,281` → `routes/sessions.ts:86-89`）。**「发布版本」不产生可运行的脚本**，`sessions.versionId`/`versionSnapshot`（`db/schema.ts:72-73`）全仓无写入方。凡是依赖「改脚本→跑会话」的验收，目前都得走调试入口。
11. **`_raw` 缺失的动作，面板编辑整份丢弃**（`YamlService.ts:326,428-430`）。旧格式 YAML（`parseYamlToScript:170-172` 的兜底分支不带 `_raw`）编辑后不生效、无提示。
12. **动作级校验错误没有行号**（`schema-validator.ts` 只为 global.yaml 建行号映射 `:377-403`，动作级用 AJV `instancePath`）。与 `script-engine-design-principles.md:387-395`（`decision-recorded`）承诺的「精确的定位和可用值列表」有差距。
13. **后端校验端点 `POST /api/scripts/:id/validate` 无客户端**（`routes/scripts.ts:306-307` 注册、`:335` 调用；编辑器 `api/` 只有 `debug.ts`/`projects.ts`）。同一份 `schemaValidator` 两端各跑一份，改校验要双发。

**名实/结构类：**

14. **Script Authoring 的上下文边界两篇文档各说各话**（`strategic-design.md:109` 说跨两包 vs `context-map.md:23-33` 说编辑器即上下文），且**编辑器侧无领域模型**（`docs/design/` 全域无编辑器文档）。`docs/ddd/` 四篇无 `status` frontmatter、不在 `docs/design/README.md` 状态表内，却承载 A4/B2 两条红线的出处。
15. **依赖方向名实不符**：文档说编辑器「仅依赖 shared-types + REST」（`strategic-design.md:329,334`、`context-map.md:23`），代码里 4 处 import `@heartrule/core-engine`（含值导入 `validation-service.ts:11`）且**未写入 `package.json`**（phantom dependency，靠根提升解析）。这是 3007 kB 前端包与 `__vite-browser-external` 告警的直接来源，也是「契约耦合」被写成了「实现耦合」的具体形态。
16. **`Scheme` 有语言、无身份**：`strategic-design.md:110` 把 `Scheme` 登记为 Script Authoring 领域语言，实现里它只是一段虚拟路径前缀（`db/schema.ts:173-175`、`template-resolver.ts:94`），无表、无 id、无生命周期。「方案」这个词在 UI、文档、DB 三层指的不是同一类东西。

**建议下一波优先处理的三条**：N10（编排产物到运行时无一级通路——它决定 CAP-11/12 的验收怎么做）、N1（静默改错数据，用户无法自查）、N9（能建跑不了的动作）。N3/N4/N5 同源（字段清单不共享），建议合并成一条「DSL 单一事实来源」议题处理。
