# 能力深挖 · 平台与交付簇（S1' 波次 2）

> **镜头**：三条能力各自"用户能用到什么"。**只读**——本文件是本次唯一写入。
> **输入**：`capability-inventory.md`（S1）· `mess-map.md`（S2）· `domain-ledger.md` · `runnability-baseline.md`（S5）。
> **方法**：全仓 grep + 读码。**未运行任何命令**（未跑 `pnpm test` / `dev` / `build` / `e2e`），所有结论为静态读码所得，逐条带 `文件:行号`。
> **实现度口径**：按「用户能用到什么」——端到端可用 / 部分可用（写清缺口）/ 桩或不可达。
> **日期**：2026-09-28
>
> **本簇领到的能力**：CAP-14（项目与版本管理）· CAP-15（换 LLM 供应商不用改代码）· 新候选「项目元信息维护」（人审门 ① 认下，尚未编号 → 本文件建议编号 **CAP-17**）。

---

## 0. 先修正 S1 的三处口径（后续结论以此为准）

S1 §4.2 的 8 行矩阵有 3 行需要修正。**这不是措辞问题，是会影响"这条能力到底做没做"的判断。**

| #   | S1 原文                                                               | 实测                                                                                                                                                                                                                            | 证据                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-1 | `archiveProject` 的后端是 `POST /projects/:id/deprecate`              | ❌ **错位**。`archiveProject` 打的是 **`DELETE /projects/:id`**（→ status=`archived`）；`deprecate` 是另一个客户端方法 `deprecateProject`，**且它有界面入口**                                                                   | 客户端 `script-editor/src/api/projects.ts:120-125`（DELETE）vs `:128-134`（POST /deprecate）；后端 `routes/projects.ts:312-339`（archive）vs `:342-390`（deprecate）；界面 `ProjectList/index.tsx:224-229` → `:132-164` |
| 0-2 | `archiveProject`「无入口（项目卡上的归档逻辑整段被注释 `:122-130`）」 | ⚠️ **对 `archiveProject` 成立，对"归档这件事"不成立**。`:122-130` 被注释掉的是旧 `handleArchiveProject`；它已被 `handleDeprecateProject`（`:132-164`）+ `handleRestoreProject`（`:166-194`）取代，两者都接在卡片的 ⋯ 下拉菜单上 | `ProjectList/index.tsx:122-130`（注释块）· `:132-164` · `:166-194` · `:224-229` · `:234-239`                                                                                                                            |
| 0-3 | 草稿「没有任何读取路径」（§二、§4.2）                                 | ⚠️ **应改为「没有任何"内容"读取路径"」**。端点 `GET /projects/:id/draft` 存在且被调用，但调用方只取 `updatedAt`，从不读 `draftFiles`                                                                                            | 端点 `routes/versions.ts:24-48`；唯一调用方 `VersionListPanel.tsx:49-79`（只用到 `:75` 的 `updatedAt`）；`draftFiles` 在 `api-server` 内除 schema/repo 写入外零读取                                                     |

**修正后的净效果**：S1 §4.2 那句「这 8 条是同一个形状」**不准确**。实际是两种形状——`archiveProject` 与 `deprecateProject` 是两条不同的路，其中一条通了界面、另一条没通；把它们并成一条会看不见"归档其实已经能点"。

---

## 1. CAP-14 · 项目与版本管理

> 用户视角：把当前工作区发布成一个版本、切换当前版本、历史可查。
> S1 初判：**部分可用**（缺口：版本差异恒返回"无变化"；回滚与"保存草稿"两个 API 在编辑器里没有入口）。

### 1.1 实现度：**部分可用**（维持初判；缺口清单从 2 条扩到 7 条）

#### 已经端到端可用的部分（三条主链路都通）

| 链路             | 证据                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **发布一个版本** | 编辑器按钮 → `ProjectEditor/index.tsx:823-863`（`handlePublish`：要求填 release note `:824-827`，自增版本号 `:836-842`）→ `versionsApi.publishVersion`（`:847-851`）→ `POST /api/projects/:id/publish`（`routes/versions.ts:97`）→ 后端快照工作区全部文件（`:123-137`）→ 写 `projects.current_version_id` + `status='published'`（`:148-151`） |
| **历史可查**     | 版本面板 `VersionListPanel.tsx:44-93`（`loadData`）→ `GET /projects/:id/versions`（`versions.ts:174`）→ 渲染 `:213-291`（版本号 / 发布时间 / 发布人 / release note / 回滚标记）                                                                                                                                                                |
| **切换当前版本** | 面板「切换」按钮 `VersionListPanel.tsx:250-259` → `:95-140`（确认弹窗）→ `versionsApi.setCurrentVersion`（`:99`）→ `PUT /projects/:id/current-version`（`versions.ts:300`）→ 后端把目标快照写回工作区（`:329-354`）→ 清空撤销栈（`:104`）+ 重载（`:107-108`）                                                                                  |

#### 缺口 1～2：S1 已列（核实无误）

- **(a) 版本差异恒为空。** `versions.ts:419-424` 硬编码 `{added:[],removed:[],modified:[]}`，注释自述「实际应该使用专门的diff库」。客户端 `api/projects.ts:387-399` 完整，无界面入口。
- **(b) 回滚（rollback）无界面入口。** 后端 `versions.ts:221-297` 完整实现（目标快照恢复 + 新版本号 + `isRollback`/`rollbackFromVersionId` 标记），客户端 `api/projects.ts:364-370` 完整，**界面只有 `VersionListPanel`，里面只有"切换"没有"回滚"**（`:250-259`；`:244-248` 只渲染回滚 tag）。
- **(c) 「保存草稿」无入口，且草稿内容无人读。** 见 §0-3。补充证据：`publish` 读草稿**只为存在性校验**（`versions.ts:113-120`，不存在则 404），随后快照的是 `script_files`（`:123`）——**因此"先存草稿再发布"带不动任何改动**（与 S1 §二 结论一致，此处补上"为什么"）。

#### 缺口 3～7：本次新增（S1 未列）

- **(d) 版本快照丢 `file_path`，会让模板方案在回滚/切换后消失。**
  - 快照字段只有 4 个：`versionFiles[fileId] = { fileType, fileName, fileContent, yamlContent }` —— **没有 `filePath`**（`versions.ts:126-137`）。
  - 回滚（`:251-265`）与切换（`:340-354`）都把快照喂给 `repo.upsertScriptFiles`；该方法的 UPDATE 分支（`project-repository.ts:243-254`）只写 name/type/content/yaml，**INSERT 分支（`:255-266`）完全不带 `filePath`**。
  - 后果：凡是「目标版本里有、工作区已被删」的模板文件，会被重建成一行 `file_path = NULL` 的记录；此后 `findTemplateFilesByPathLike`（`:414-425`）与 `findTemplateFileByExactPath`（`:427-443`）再也找不到它 → `GET /projects/:id/template-schemes`（`routes/projects.ts:661-710`）里该 custom 方案**静默消失**，`GET/PUT .../templates/:scheme/:path`（`:749`、`:791`）全部 404。
  - 未被波及的情形：文件若在目标快照与工作区**都存在**（走 UPDATE 分支），`filePath` 原样保留。

- **(e) 切换/回滚是「硬删 + 就地覆盖」，未发布的改动不可恢复。** 两条路径都先 `deleteScriptFiles`（`versions.ts:244-248` / `:333-337`）再 `upsertScriptFiles`；`deleteScriptFiles` 是真 `DELETE`（`project-repository.ts:226-229`，非软删）。被删掉的文件若**从未发布过**，则任何 `project_versions` 快照里都没有它 → 无任何回退余地。`current-version` 这条路尤其危险：它**不新建版本记录**，只改工作区和 `projects.current_version_id`（`:356-357`），所以"切换前的现场"在版本表里没有任何痕迹。

- **(f) 「切版本会覆盖且不可撤销」的警告在编辑器里永不触发。** `VersionListPanel.tsx:120-129` 写了这条 danger 警告，但它挂在可选 prop `hasUnsavedChanges` 上（`:23`）；调用点 `ProjectEditor/index.tsx:1596-1600` **只传了 `projectId` / `currentVersionId` / `onVersionChange`** —— 该 prop 从未被传入，条件恒 false → 永远走 `:130-139` 的普通确认框。
  - 仓库里那条 E2E 用例测的正是这个警告（`script-editor/e2e/version-management.spec.ts:129-169`，标题「版本切换前有未保存修改时必须弹出警告」），而测试自己写了兜底：如果标题不是那句警告，就打日志「⚠️ 当前工作区没有未保存修改，跳过警告验证」（`:159-164`）。**用例不会失败，所以这个洞不会被测试发现。**

- **(g) 「工作区草稿 / 未发布」标签的时间戳是死的。** 面板显示它读 `GET /draft` 的 `updatedAt`（`VersionListPanel.tsx:73-78`、渲染 `:189-211`），但 `project_drafts` 只在这三处被写：显式 `PUT /draft`（`versions.ts:68`）、建项目（`routes/projects.ts:159-162`）、复制项目（`:487-490`）。编辑器的保存走的是 `projectsApi.updateFile`（`ProjectEditor/index.tsx:797-799`）→ 写 `script_files`，**不碰 `project_drafts`**。所以这个时间戳永远停在项目创建那一刻，语义（"工作区有未发布改动"）与它显示的值不符。

- **(h) `projects.current_version_id` 无外键。** `schema.ts:150`（`currentVersionId: uuid('current_version_id')`，无 `.references()`）。当前靠路由层两次先查后写兜住（`versions.ts:317-324`、`:231-238`），但仓储的 `updateProject(id, data: Record<string, any>)`（`project-repository.ts:132-137`）是任意列写入，没有任何领域守卫——**这条不变性只活在被调用的三个路由里，不在聚合里**。

### 1.2 涉及的领域概念

#### 战略（限界上下文 / 聚合）

| 问题                             | 答案                                                                                                                                                                    | 证据                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 哪个限界上下文                   | **Script Authoring（Supporting）**，包归属 `api-server (projects) + script-editor`                                                                                      | `docs/ddd/strategic-design.md:50`（总表）· `:107-116`（详情）    |
| 领域语言                         | **Project, Version, Draft, File, Template, Scheme, Publish, Rollback** —— 与本簇三条能力几乎一一对应                                                                    | `strategic-design.md:110`                                        |
| 聚合根                           | **`Project`**                                                                                                                                                           | `strategic-design.md:111` · 战术表 `:255`                        |
| 与「Session 是唯一聚合根」的关系 | 两处「唯一聚合根」都不带限定语（`:59`、`ubiquitous-language.md:120`），而 `:111` 又说 Project 是聚合根。**domain-ledger D6 已登记为措辞精度问题**，本次深挖不改变该判断 | `strategic-design.md:59` · `:111` · `ubiquitous-language.md:120` |

**`Project` 与 `ProjectVersion` 的聚合边界（本次要查的重点）——结论：代码里不存在这层边界。**

- 文档说 `Project` 是聚合根（`strategic-design.md:111`），`Version` 只是它的领域语言之一（`:110`）。
- 代码里 `Project` **没有领域类**：全仓 `class Project` 只命中 `ProjectRepository`（`project-repository.ts:124`）与 `ProjectInitializer`（`project-initializer.ts:46`）；前端只有一个 TS interface（`script-editor/src/api/projects.ts:5`）。`Project` 的"值"就是数据库行类型 `typeof projects.$inferSelect`（`project-repository.ts:15`）。
- `ProjectVersion` **既不是 Project 的实体，也不是独立聚合——它是一张并列的表**：
  - 独立 uuid 主键 + 独立外键指向 project（`schema.ts:218-239`）；
  - 由 `createVersion(data)` 直接插入，**不经 Project**（`project-repository.ts:196-210`）；
  - 查询用双键 `findVersionById(projectId, versionId)`（`:188-194`），说明它从不用 project 对象导航到达；
  - Project 侧只有一根**裸 uuid 指针** `currentVersionId`（`schema.ts:150`，无 FK）。
- 因此文档 `:111` 的"Project 是聚合根、Version 在其中"在代码里**没有对应物**。真实形态是「两张表 + 路由层手写事务」，属于 **事务脚本（Transaction Script）**，不是聚合。

#### 战术（实体 / 值对象 / 领域服务 / 端口 / 仓储）

| 战术构件     | 文档说它是什么、在哪                                                                                      | 代码里住在哪                                           | 判断                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **实体**     | 无声明                                                                                                    | ——                                                     | **不存在**。Project / Version / Draft / File 都不以类存在                                                                                                                                        |
| **值对象**   | 无声明                                                                                                    | ——                                                     | **不存在**。版本快照 `versionFiles` 是 `Record<string, any>`（`schema.ts:226`），没有 `VersionFiles` 之类的 VO                                                                                   |
| **领域服务** | 无声明                                                                                                    | ——                                                     | **不存在**。但有一条**规则**在跑：版本号自增。它落在**前端**（`ProjectEditor/index.tsx:836-842`，`v` 前缀 + patch+1）与**路由**（`versions.ts:268-271`，回滚时 patch+1）**两处、两层、两份实现** |
| **端口**     | 无（`strategic-design.md:255-258` 只列 Aggregate Root / Repository / Application Service / ACL，无 Port） | `IProjectRepository`（`project-repository.ts:37-120`） | **不是六边形端口**。它是 api-server 内部的接口，不在 core-engine；core-engine 完全不认识 Project 概念（全仓无引用），所以 A2 红线（`architecture-constraints.md:17`）不受影响                    |
| **仓储**     | `ProjectRepository` — `strategic-design.md:256` 明写 "Repository"                                         | `services/project-repository.ts:124-477`               | **名实不符：它是表数据网关 / 事务脚本。** 四条证据见下                                                                                                                                           |

**`ProjectRepository` 是仓储还是事务脚本？——事务脚本，且领域逻辑确实被吃进了数据访问层之外、留在了调用方。**

1. **一个类横跨 5 张表、30 个方法**：project / draft / version / scriptFiles / template 文件全在一个类里（接口 `:37-120`）。这不是"聚合的仓储"（一个聚合一个仓储），是"这几张表的数据库访问层"。
2. **`updateProject(id, data: Record<string, any>)`**（`:132-137`）：无类型、不校验、不重建聚合，直接把入参铺进 `SET`。仓储在这里**没有任何领域判断**，连"哪些列允许改"都不知道（允许列清单写在路由的 zod schema `routes/projects.ts:25-31`）。
3. **领域规则留在路由层**，不在仓储也不在实体：例「只有 deprecated 才能 restore」（`routes/projects.ts:407-412`）、「name 不能叫 default」（`:887-891`）、「方案已存在则拒绝」（`:898-900`）、「回滚 = 删多余文件 + 恢复快照 + 新建版本 + 改当前版本」（`versions.ts:244-284` 一整个事务写在 handler 里）。
4. **反向也成立**：仓储里唯一带"逻辑"的方法 `upsertScriptFiles`（`:231-268`）其实是在补领域规则的窟窿——它自己重新查一遍现有 id 列表来做 upsert，这正是 (d) 缺口里丢 `filePath` 的地方。

> 一句话：**`ProjectRepository` 是「谁都能调的表网关」，`Project` 聚合在代码里不存在，领域规则散落在 5 个路由 handler 和 1 个前端组件里。** 文档 `:255-258` 的四个战术构件名（Aggregate Root / Repository / Application Service / ACL）里，只有 ACL（REST routes）在形态上对得上。

### 1.3 对应设计文档

| 文档                                                                                                 | status                                                                                                                                 | 讲这条能力的什么                                                                                            | 代码与文档对得上吗                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ddd/strategic-design.md:107-116`（§1.3 Script Authoring 详情）                                 | `:6` 自述「战略设计完成，待重构清单已记录」；**不在 `docs/design/README.md` 索引内**，权威声明在 `docs/README.md:13`（平台侧建模权威） | 上下文、领域语言 `:110`、聚合根 `:111`、3 条关键不变性 `:112-114`                                           | **部分矛盾，逐条对账见下表**                                                                                                                                                                                   |
| `docs/ddd/strategic-design.md:255-258`（§3.5 战术表）                                                | 同上                                                                                                                                   | Project / ProjectRepository / ProjectInitializer / ACL 的物理位置                                           | ✅ **完全对得上**。`project-repository.ts`、`project-initializer.ts`、`routes/{projects,versions}.ts` 四个路径全部存在且就是这三者                                                                             |
| `docs/ddd/context-map.md:25` · `:43`                                                                 | 活跃                                                                                                                                   | Script Authoring 挂在 script-editor；api-server → script-editor 为 Open Host Service                        | ✅ 与 `script-editor/src/api/projects.ts` 的纯 REST 客户端形态一致                                                                                                                                             |
| `docs/ddd/strategic-design.md:206`                                                                   | 活跃                                                                                                                                   | Script Authoring → Consulting Session 为 **Conformist**（编辑器产出 YAML → 引擎消费，编辑器不定义引擎行为） | ✅ 与 `EditorContent.tsx` 复用 core-engine schema 校验（S1 CAP-12）一致                                                                                                                                        |
| `docs/design/**`                                                                                     | ——                                                                                                                                     | **一篇都没有**                                                                                              | ❌ **`docs/design/` 下不存在任何讲项目/版本管理的文档**（该目录只有 foundation / memory / topic / consciousness / decisions 五个分区，见 `docs/design/README.md:11-43`）。这条能力的唯一设计权威是 `docs/ddd/` |
| `docs-archive/misc/project-initialization-guide.md` · `docs-archive/misc/script_editor_core_plan.md` | 归档（`docs-archive/README.md` 声明非权威）                                                                                            | 项目初始化、编辑器规划                                                                                      | 归档、不核                                                                                                                                                                                                     |

**3 条关键不变性逐条对账（`strategic-design.md:112-114`）：**

| 不变性（原文）                                                          | 代码                                                                                                             | 结论                                              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 「Version 创建后不可变」                                                | `createVersion` 只有 INSERT（`project-repository.ts:196-210`），全仓无 `UPDATE project_versions`                 | ✅ **对得上**                                     |
| 「Draft 可随时修改，**publish 时快照为 Version**」                      | `publish` 只把草稿做存在性校验（`versions.ts:113-120`），随后快照的是 **`script_files`（工作区）**（`:123-137`） | ❌ **被代码直接违反**。「快照草稿」这件事从未发生 |
| 「Template 从 `config/prompt-defaults/` 导入，可被 custom scheme 覆盖」 | 导入：`routes/projects.ts:166-195`；覆盖：`POST .../template-schemes` 复制 default → custom（`:872-937`）        | ✅ **对得上**                                     |

> **口径总结**：这条能力有 1 篇设计文档（`docs/ddd/strategic-design.md`），它的**领域语言与物理位置全对**、**3 条不变性里 1 条被代码违反**；同时 `docs/design/` 这条引擎侧权威线**完全没有覆盖它**——即本条能力的"设计权威"与"其余 21 篇设计文档"不在同一个索引体系里。

### 1.4 缺口：区分「没做」与「做了但接不上」

| 类型                                                 | 缺口                                                                                                                          | 证据                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **没做**                                             | 版本差异计算                                                                                                                  | `versions.ts:419-424` 恒返回空对象 + 注释自认 |
| **没做**                                             | 项目元信息的编辑界面                                                                                                          | 见 §3                                         |
| **做了但接不上**（后端完整 / 客户端完整 / 界面缺席） | `rollbackVersion`、`saveDraft`、`diffVersions`                                                                                | 三层矩阵 §4                                   |
| **做了但语义不成立**（后端"能跑"、契约不成立）       | 草稿 → 版本的契约：`publish` 不消费草稿（`versions.ts:113-137`），草稿时间戳不被编辑动作刷新（`ProjectEditor/index.tsx:797`） | §1.1 (c)(g)                                   |
| **做了但会丢数据**                                   | 切换/回滚硬删未发布文件（`versions.ts:244-248` / `:333-337` → `project-repository.ts:226-229`）                               | §1.1 (e)                                      |
| **做了但会丢字段**                                   | 快照不含 `filePath`，恢复时 INSERT 分支不带 `filePath`（`versions.ts:126-137` · `project-repository.ts:255-266`）             | §1.1 (d)                                      |
| **做了但护栏缺席**                                   | "未保存改动"警告永不触发（`ProjectEditor/index.tsx:1596-1600` 不传 prop）                                                     | §1.1 (f)                                      |

> **关于「版本切换会不会丢数据」的正面回答（任务指定问题）**：
> **会，且这是本簇最硬的一条。** 两个 API 都**就地覆盖工作区**（`versions.ts:243-265` 与 `:329-354`，代码结构逐行同构）。丢数据的必要条件与充分条件：
>
> 1. 工作区里存在**从未发布过**的文件（新建但没 publish，或 publish 之后才加的）；
> 2. 该文件不在目标版本快照里；
> 3. 于是 `idsToDelete`（`:247` / `:336`）命中它 → `deleteScriptFiles` 真 DELETE（`project-repository.ts:226-229`）。
>    `project_versions` 表里没有任何一行能把它找回来。**③ 的保护**只有 (f) 那个永不触发的警告 + 一个通用的"确认要切换吗"弹窗（`VersionListPanel.tsx:130-139`），后者不提示覆盖、不提示不可撤销。**另外**，切换这条路连版本记录都不留（`:356-357`），所以"切回去"也回不到切换前的现场。

---

## 2. CAP-15 · 换 LLM 供应商不用改代码

> 用户视角：一个环境变量在火山 / DeepSeek / OpenAI 之间切。
> S1 初判：**端到端可用**。

### 2.1 实现度：**部分可用**（建议从"端到端可用"降档，理由见"别名陷阱"与"3 选 1"）

**主链路确实可用**（这部分支持 S1 的初判）：

- 环境变量 → provider：`ioc/container.ts:80-96`（`createLLMProvider`：`openai` / `deepseek` / `volcano`|`volcengine` / **其余一律落到 volcano**（`:91-94` 的 `default` 分支））。
- 三个 provider 各自的配置读取：火山 `:101-124`（`VOLCENGINE_API_KEY` ‖ `VOLCANO_API_KEY` ‖ `ARK_API_KEY`；模型 `VOLCENGINE_MODEL` ‖ `VOLCANO_ENDPOINT_ID`，默认 `deepseek-v3-250324`）、OpenAI `:129-141`（`OPENAI_API_KEY` / `OPENAI_MODEL`，默认 `gpt-4o-mini`）、DeepSeek `:146-161`（`DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL`，默认 `deepseek-chat`）。
- 容器是**进程级单例**（`:70-75`、`:211`），provider 在构造时选定一次 → **是"改了重启"的切换，不是运行时切换**。这一点 S1 的口径（"一个环境变量切"）没写清，实际语义应是"改环境变量后重启进程"。
- 装配链：`container.ts:44`（`new LLMOrchestrator(provider, name)`）→ `:57`（注入 `ScriptExecutor`）→ 引擎侧从 `ILLMProvider` 端口消费（`application/ports/outbound/llm-provider.port.ts:78`）。

**为什么建议降档——三个具体缺陷：**

- **(i) 别名注册表是单向的，"3 个选项里只有 1 个真的能选"。**
  `container.ts:43-54`：拿到 `LLM_PROVIDER` 后，**只为自己注册别名**——
  | `LLM_PROVIDER` 的值 | 注册表实际有的 key | 默认 provider |
  | --- | --- | --- |
  | `volcano` / `volcengine`（含未设置时的默认） | `volcano`, **`deepseek`**（两者都指向 **Volcano** 实现） | `volcano` |
  | `deepseek` | `deepseek` | `deepseek` |
  | `openai` | `openai` | `openai` |
  | 任意其他值（如 `azure`） | 仅该字面值（`:44` 用小写名注册），**无任何别名** | 该字面值 |
  命中判定在 `engines/llm-orchestration/orchestrator.ts:112-121`：key 不存在即 `throw new Error('Provider X not found')`。
  **这跟界面直接冲突**：调试重跑弹窗的供应商下拉框提供**三个**选项（`DebugChatPanel/RerunModal/index.tsx:53-57`：deepseek / openai / volcano，默认 `deepseek` `:80`），选中的值经 `:116-120` 的 `llmConfig.provider` 一路上行（`session-orchestrator.ts:154`→`:616`→ 引擎 `ai-say-action.ts:266-275` 的第三个实参、`ai-ask-action.ts:530-538` 的第三个实参）打到 `getProvider(providerName)`。
  → **结论：无论 `LLM_PROVIDER` 设成什么，下拉框里至少 2 个选项会抛 `Provider X not found`。** 而 `ai-say-action.ts:266` 这处调用**没有本地 try/catch**（该文件仅有的 try 块在 `:176-190`、`:460-476`、`:676-721`），异常会一路冒到动作执行失败。
  → **另一个方向的坑**：`LLM_PROVIDER=volcano`（`.env.example:22` 的默认值）时，选 `deepseek` **不报错，但拿到的是火山实现**——因为 `:49` 把 `deepseek` 也注册成了火山 provider。**静默走错供应商，没有任何日志区分。**（注释 `:46` 自述是"for the frontend provider selector"，即这个别名就是为界面那个下拉框加的，但它加错了一半。）

- **(j) 日志名字有独立一套判断，与选到的 provider 可能不一致。** `:166-181` 的 `getLLMProviderName()` 第一分支用 `providerType === 'deepseek'`（**未 toLowerCase**，与 `:82` 的 `normalizedType` 不同源），其余靠 `instanceof`。大小写混写（如 `DeepSeek`）时第一分支不命中，落到 instanceof 才纠正回来；`openai` 且 key 为空时仍打印 `OpenAI`。**只影响日志，不影响实际路由**，但会让你在排查"到底用了哪家"时被误导。

- **(k) 一个 copy-paste 遗留**：`:127` 的注释写「创建 DeepSeek Provider」而函数是 `createOpenAIProvider`。纯注释错，无功能影响，但它在读码时会误导人以为 provider 分派有交叉。

### 2.2 涉及的领域概念

**这个问题在本簇里最值得记：`LLMOrchestrator` 的 provider 注册表算不算领域服务？——按代码判：不算，它是基础设施级的适配器注册表；但设计文档明确说了这层混淆是已知问题，且已给方案、未执行。**

代码侧证据：

- 注册表的全部内容：`private providers: Map<string, ILLMProvider>` + `defaultProvider: string`（`orchestrator.ts:24-25`），四个操作 `registerProvider` / `setDefaultProvider` / `getProvider` / 透传调用（`:36-72`、`:112-121`）。
- **没有领域不变量**：唯一的判断是"key 存在吗"（`:116-118`），没有业务规则、没有 UL 词汇、不产出领域状态。
- **不持有业务状态**：它不参与 `ExecutionState` 进 / 出的纯函数契约（`architecture-constraints.md:22` A7 红线）；它的输入输出全是 LLM 调用本身。
- **位置**：`core-engine/src/engines/llm-orchestration/`。按 `CLAUDE.md:60-79` 的六引擎表它与其余五引擎并列；按 DDD 账本它是 **Generic 通用子域**（`docs/ddd/strategic-design.md:51`、`:118-126`；`context-map.md:56` 标 🟢 Generic + "Can be replaced by any AI SDK"）。
- `BaseLLMProvider`（`orchestrator.ts:139-393`）里同时住着：抽象方法 `getModel()`（真正的适配器接缝，三个子类各实现一次）+ 25 秒超时、JSON 强制、debugInfo 收集、流式（`:199-392`）——**端口契约与 HTTP/SDK 细节同文件**。

**文档侧已经把这件事写清楚了**（这是本次查证里"文档比代码清醒"的一处）：

- `docs/ddd/strategic-design.md:272-276`（**M2. LLMOrchestrator 横跨领域和基础设施**）原文：「`LLMOrchestrator` 既是领域概念（"编排 LLM 调用"），又处理基础设施细节（provider 注册、debugInfo 收集、JSON 强制解析）。`BaseLLMProvider` 在同一个文件中混合了抽象类和 `generateObject`/`generateText` 的底层实现。」建议「分离 `LLMOrchestrator`（领域—"调度哪个 provider 处理哪个请求"）和 `LLMProviderAdapter`（基础设施—"HTTP 调用 + JSON 解析"）」。
- **M2 属于 §4 的 8 条整改清单（M1–M5 + m1–m3），按 mess-map MESS-D-05 全条不在 backlog**（`docs/ddd/strategic-design.md:264-317`，backlog 全表无对应条目）。
- 相关的另有 `packages/core-engine/DDD_HEXAGONAL_REFACTORING_PLAN.md:579`/`:605`（主张把 `OpenAIProvider` 改名 `OpenAIAdapter`、落 `api-server/src/adapters/outbound/llm/`）——**该改名已经在代码里发生了**：三个 provider 现在就住在 `api-server/src/adapters/outbound/llm/`（`deepseek-provider.ts` / `openai-provider.ts` / `volcano-provider.ts`），但**类名仍是 Provider**。文档与代码各对一半。

其余战术构件：

| 构件             | 结论                                                                                                                               | 证据                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 端口             | `ILLMProvider`（`application/ports/outbound/llm-provider.port.ts:78`、`:87`）                                                      | 端口本身成立 ✅                                                                         |
| 适配器           | `VolcanoDeepSeekProvider` / `DeepSeekProvider` / `OpenAIProvider`，三者都 `extends BaseLLMProvider` 且**只 override `getModel()`** | `deepseek-provider.ts:30-35` · `openai-provider.ts:18-25` · `volcano-provider.ts:38-43` |
| 领域服务         | **无**（注册表不是领域服务，见上）                                                                                                 | ——                                                                                      |
| 聚合/实体/值对象 | **无**（LLM 集成本身无领域模型）                                                                                                   | ——                                                                                      |

**三个 provider 的能力是否等价？——等价，且是"同样地少"。**（任务指定问题）

| 能力                         | 三个 provider                                                                                                                                                                                                                                                                                                                                   | 证据                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 流式                         | **等价：都没有被生产链路使用。** `streamText` 在 `BaseLLMProvider`（`orchestrator.ts:369-392`）与 `LLMOrchestrator`（`:65-72`）都实现了，但**全仓生产代码零调用**（grep `streamText` 在 `packages/*/src` 只命中端口声明、orchestrator 定义、以及 `:374` 那段自认缺口注释）。唯一"流式"端点是假流式（S1 §二：`routes/chat.ts:130-136` 固定话术） | `orchestrator.ts:369-377` 注释原文「当前生产环境未使用流式 JSON 输出（chat.ts 的 /api/chat/stream 是 mock 实现），因此优先度较低」 |
| 工具调用（function calling） | **等价：三者全不支持。** 全仓 `packages/*/src` grep `tools:` / `toolChoice` / `functionCall` / `tool_calls` = **0 命中**；`BaseLLMProvider.generateText` 的参数集里没有任何工具字段（`orchestrator.ts:222-245`）                                                                                                                                | 同上                                                                                                                               |
| 超时                         | **等价：都在基类，硬编码 25 秒**（`orchestrator.ts:205-207` `setTimeout(() => abortController.abort(), 25000)`），注释说是"小于前端的30秒"。三个子类无一 override                                                                                                                                                                               | `orchestrator.ts:206`                                                                                                              |
| JSON 强制输出                | **等价：都在基类**（`generateObject` + 失败回退 `generateText`，`:214-358`），三者共用                                                                                                                                                                                                                                                          | `orchestrator.ts:209-221`、`:312-358`                                                                                              |
| 各自唯一的差异               | 只有 `getModel(modelName?)` 的模型名解析行为：DeepSeek `:30-35`（传名则新建实例）、OpenAI `:18-25`（**每次调用都** `createOpenAI(...)` 新建客户端）、Volcano `:38-43`（传名则新建实例）                                                                                                                                                         | 三个文件                                                                                                                           |

> 所以"三个 provider 能力等价"这条文档不变性（`strategic-design.md:125`「所有 provider 行为一致（OpenAI-compatible API）」）**成立**——但成立的原因是**能力都压在基类里，三者一共只贡献了约 20 行**，而不是因为做了兼容性设计。`openai-provider.ts:19-22` 每次 `getModel` 都新建客户端这点，是三者中唯一的实现风格差异（Three providers differ only in ~20 lines; OpenAI rebuilds the client per call）。

### 2.3 对应设计文档

| 文档                                                                                     | status                                        | 讲什么                                                                                                                                                                                               | 对得上吗                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ddd/strategic-design.md:118-126`（LLM Integration 详情）                           | `:6`「战略设计完成，待重构清单已记录」        | UL「Provider, Model, generateText, streamText, debugInfo」`:`121`；端口 `ILLMProvider` `:122`；不变性「所有 provider 行为一致（OpenAI-compatible API）」`:125`、「debugInfo 在每次调用后收集」`:126` | ✅ UL 四条逐个在代码里有对应（`Provider`→三个子类；`generateText`/`streamText`→`orchestrator.ts:199`/`:369`；`debugInfo`→`:287-303`）。⚠️ 但 UL 里的 `streamText` **是个没有生产消费者的术语**（见上表） |
| `docs/ddd/strategic-design.md:272-276`（M2）                                             | 同上                                          | **明写 `LLMOrchestrator` 横跨领域与基础设施、并给出分离方案**                                                                                                                                        | ✅ 判断准确。❌ 未执行（MESS-D-05：8 条整改全不在 backlog）                                                                                                                                              |
| `docs/ddd/strategic-design.md:51` · `context-map.md:56`                                  | 活跃                                          | LLM Integration = 🟢 Generic 通用子域                                                                                                                                                                | ✅ 与代码形态一致（无领域模型、可整体替换）                                                                                                                                                              |
| `docs/ddd/strategic-design.md:173-175` · `:205`                                          | 活跃                                          | 三个 Provider 类名 + Consulting Session → LLM Integration = Customer-Supplier                                                                                                                        | ✅ 类名一致；✅ 端口由 core-engine 定义、api-server 实现                                                                                                                                                 |
| `docs/design/foundation/ubiquitous-language.md:105`（§六 技术架构，`decision-recorded`） | `decision-recorded`                           | `Provider` = 「LLM 服务提供方。如 OpenAI、DeepSeek、火山引擎」，所属上下文标 **LLM 集成**                                                                                                            | ✅ 对得上                                                                                                                                                                                                |
| `docs/design/foundation/architecture-constraints.md:17`（A2 红线，`draft`）              | `draft`                                       | core-engine 零基础设施依赖，外部交互一律走 `ILLMProvider` / `TemplateProvider` / `MemoryRepository`                                                                                                  | ✅ 三个 provider 全部在 api-server；core-engine 里只有端口与基类                                                                                                                                         |
| `packages/core-engine/DDD_HEXAGONAL_REFACTORING_PLAN.md:579`/`:605`                      | 「已归档」自述（`:3`），不属任何 `docs/` 索引 | 主张 provider 改名 Adapter、迁到 `api-server/src/adapters/outbound/llm/`                                                                                                                             | ⚠️ **迁移已发生、改名未发生**（目录已对、类名仍是 Provider）。文档与代码各对一半                                                                                                                         |

> **口径总结**：CAP-15 **三处口径全对得上**（`docs/ddd/` 的战略判断准确、M2 的问题诊断准确、A2 红线未被违反），且是本次三条能力里文档质量最好的一条。唯一"文档写了代码没有"的是 `streamText` 这个 UL 术语没有生产消费者。

### 2.4 缺口：区分「没做」与「做了但接不上」

| 类型                             | 缺口                                                                                                                         | 证据                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **做了但接不上（本簇唯一一条）** | 别名注册表只为"当前选中的 provider"注册，界面却给 3 个选项 → 2 个必然抛错；且 `volcano` 模式下 `deepseek` 是**静默的假别名** | `container.ts:43-54` · `RerunModal/index.tsx:53-57` · `orchestrator.ts:112-121` · `ai-say-action.ts:274` |
| **做了但没护栏**                 | provider 切换**没有任何启动期自检**：key 为空也应建 provider（`container.ts:130`、`:147` 的 `                                |                                                                                                          | ''`），且 `LLM_PROVIDER=azure` 这类拼错值**静默落到 volcano**（`:91-94`的`default`），只在日志里打一个名字 | `container.ts:91-94`、`:102-106`、`:130`、`:147` |
| **没做**                         | 运行时切换（改配置即生效）；容器是构造期单例                                                                                 | `container.ts:70-75`、`:211`                                                                             |
| **没做**                         | 工具调用（function calling）—— 三个 provider 都没有                                                                          | 全仓 grep 0 命中                                                                                         |
| **没做**                         | M2 的领域/基础设施分离（文档已给方案）                                                                                       | `strategic-design.md:272-276`；`mess-map.md` MESS-D-05                                                   |

---

## 3. 新候选 · 项目元信息维护：改名、写描述、归档不用的项目

> 人审门 ① 刚认下的一条（`capability-inventory.md:94`），尚未编号。**本文件建议编号 `CAP-17`**（现行最大号为 CAP-16，见 `capability-inventory.md:28`）。

### 3.1 实现度：**部分可用 —— 且初判的「2/3 实现」应改为「2/3 已实现，但缺的那 1/3 恰恰是最常被点的那一下」**

先把三件事拆开核：

| 子能力                     | 实现程度          | 证据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **归档不用的项目**         | ✅ **端到端可用** | 卡片 ⋯ 菜单「Move to Trash」（`ProjectList/index.tsx:224-229`）→ `handleDeprecateProject`（`:132-164`，含二次确认弹窗 + 说明文案"将从列表隐藏、文件保留、随时可恢复"）→ `projectsApi.deprecateProject`（`api/projects.ts:128-134`）→ `POST /api/projects/:id/deprecate`（`routes/projects.ts:342-390`，写 `status='deprecated'` + `metadata.deprecationHistory` 追加一条）。列表默认过滤掉 deprecated（`project-repository.ts:280-284` 的 `ne(projects.status,'deprecated')`）                                                                                                 |
| **恢复已归档的项目**       | ✅ **端到端可用** | 切到 "🗑️ Deprecated" 筛选（`ProjectList/index.tsx:305`）→ 卡片菜单变「Restore」（`:234-239`）→ `handleRestoreProject`（`:166-194`）→ `POST /projects/:id/restore`（`routes/projects.ts:393-446`，有前置守卫"只有 deprecated 能恢复" `:407-412`）→ 回到 `status='draft'`                                                                                                                                                                                                                                                                                                        |
| **改名 / 写描述 / 改标签** | ❌ **不可达**     | 后端完整：`PUT /api/projects/:id`（`routes/projects.ts:275-309`）+ 校验 schema 允许 `projectName`/`description`/`engineVersion`/`engineVersionMin`/`tags`（`:25-31`）。客户端完整：`projectsApi.updateProject`（`api/projects.ts:102-117`）。**界面：全仓零调用**（grep `updateProject` 在 `script-editor/src` 只命中 `updateTemplateScheme`/`updateTemplateContent`/`updateFile` 三个同名前缀方法）；`ProjectEditorHeader.tsx:75` 只**显示** `project?.projectName`，无编辑控件；组件目录 16 个组件里没有 ProjectSettings 一类（`ls packages/script-editor/src/components/`） |

**因此本条的准确表述应是**：

- 「归档」**已经做完了**（比 S1 §4.2 的判断好一个档），走的是 `deprecate` 这条**软删除 + 历史留痕 + 可恢复**的路，形态完整。
- 「改名/写描述」**完全没做**，三层只差最上面一层。
- S1 说的 2/3，分子上有偏差：不是"3 件事做了 2 件"，而是"3 件事做了 2 件，其中 1 件（归档）S1 判成了没做，另 1 件（恢复）S1 完全没提"。**净结果同档，但缺口清单不同。**

### 3.2 涉及的领域概念

- **战略**：与 CAP-14 同一个限界上下文 —— Script Authoring（Supporting），同一聚合根 `Project`（`docs/ddd/strategic-design.md:110-111`）。本能力动的字段全是 `projects` 表的列：`project_name` / `description` / `tags` / `status`（`schema.ts:142-165`）。
- **`status` 是本条唯一真正的领域概念**，代码里有 4 个值：`draft` / `published` / `archived` / `deprecated`（枚举 `schema.ts:37`；前端 `api/projects.ts:12` 的联合类型一致；`ProjectList/index.tsx:255-264` 的 tag 映射也是 4 个）。**但"归档"这个词在代码里被劈成了两个不同的值**：
  - `DELETE /projects/:id` → `status='archived'`（`routes/projects.ts:312-339`，路由注释也叫「归档工程」）；
  - `POST /projects/:id/deprecate` → `status='deprecated'`（`:342-390`，路由注释「作废工程（软删除）」）。
    → **同一个中文词"归档"对应两个英文状态值，且一个可达（deprecated）一个不可达（archived）**。界面的状态筛选器两者都列（`ProjectList/index.tsx:304-305`），所以用户能看到 "Archived" 这个筛选，但**没有任何操作能把项目变成 archived**（`archiveProject` 无调用者）。
- **战术**：无实体 / 无值对象 / 无领域服务。改状态这件事是一条 `updateProject(id, {status})` 的裸列写入（`project-repository.ts:132-137`）——与 §1.2 的"事务脚本"判断一致。
- **仓储**：同上，`ProjectRepository`。

### 3.3 对应设计文档

| 文档                                                                                                      | status                       | 对得上吗                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ddd/strategic-design.md:110` 领域语言含 `Publish, Rollback` 但**不含 Deprecate / Archive / Status** | 活跃                         | ⚠️ **UL 里没有这两个词**。`deprecated` 这个状态值是纯代码概念，没登记 UL（违反 A5 红线「代码概念必须登记 UL」，`architecture-constraints.md:20`）                                                                                                                                                                                                                                                   |
| `docs/ddd/strategic-design.md:111` 聚合根 `Project`                                                       | 活跃                         | 同 §1.2：代码里无聚合根                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/design/**`                                                                                          | ——                           | ❌ 零覆盖                                                                                                                                                                                                                                                                                                                                                                                           |
| 数据库迁移 `packages/api-server/drizzle/0003_add_deprecated_status.sql`                                   | 无 journal 条目（MESS-F-07） | ⚠️ **`deprecated` 这个状态的迁移文件本身是孤立的**（不在 `_meta/_journal.json` 里，`migrate()` 不会执行它）。**但 S5 已核实其内容被 `0003_smiling_doctor_strange.sql` 完全覆盖**（`runnability-baseline.md` §4.4 表：`ALTER TYPE project_status ADD VALUE 'deprecated'` ✅ 有）；`schema.ts` 的 `projectStatusEnum` 也含 `'deprecated'`。**→ 功能不受影响，属数据层卫生问题**，不构成本条能力的缺口 |

### 3.4 缺口：区分「没做」与「做了但接不上」

| 类型                   | 缺口                                                                                                                         | 证据                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **没做**               | 界面上改名 / 写描述 / 改标签                                                                                                 | 见 §3.1 第三行                                                                                                  |
| **没做（且语义重复）** | `archived` 状态**存在但不可达**：枚举有值、筛选器有项、状态 tag 有映射，但唯一能写它的 API（`DELETE /projects/:id`）无人调用 | `schema.ts:37` · `ProjectList/index.tsx:304`、`:259` · `routes/projects.ts:312-339` · `api/projects.ts:120-125` |
| **做了但接不上**       | `archiveProject` 客户端方法（三层矩阵 §4 第 5 行）                                                                           | 同上                                                                                                            |
| **做了但不可靠**       | `deprecate` / `restore` 的 `operator` 硬编码 `'LEO'`（两处 TODO 自述"从用户信息获取"）                                       | `ProjectList/index.tsx:155`、`:185`。与 S1 §三「没有登录与权限」一致，非本条独有                                |
| **做了但没护栏**       | 归档/恢复都没有测试。`routes/` 下 5 个路由模块零测试（S5 §三"HTTP 路由层（真实 handler）❌ 无"）                             | `runnability-baseline.md` 第三部分                                                                              |

---

## 4. §4.2 八条零调用 API 方法：三层矩阵（后端完成度 × 客户端 × 界面）

> 口径：**后端完成度** = 该端点被调用后"事情真的做成了吗"（不是"路由存在吗"）。**界面** = 用户点得到吗、点了之后真的发生吗。

| #   | 方法              | 后端端点                                                              | 后端完成度                                                                                                                                                                  | 客户端                       | 界面                                                                                                                                                                                                         | 净结论                                                                                                                                                                        |
| --- | ----------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `copyProject`     | `POST /projects/:id/copy`（`routes/projects.ts:449-503`）             | ✅ **完整**：建新项目（名加「（副本）」`:464`）+ 复制全部文件（`:473-484`）+ 建草稿（`:487-490`）                                                                           | ✅ `api/projects.ts:146-152` | ❌ **有入口但作假**：卡片 ⋯ 菜单「Duplicate」（`ProjectList/index.tsx:218`）→ `handleCopyProject`（`:111-119`）里是 `// TODO: 调用API复制项目` + 只弹 `message.success('...has been duplicated')` + 刷新列表 | **骗人的按钮**：用户以为复制了，其实什么都没发生                                                                                                                              |
| 2   | `rollbackVersion` | `POST /projects/:id/rollback`（`versions.ts:221-297`）                | ✅ **完整**：删多余文件 + 恢复快照 + 建新版本（带 `isRollback`/`rollbackFromVersionId`）+ 改 `currentVersionId`                                                             | ✅ `api/projects.ts:364-370` | ❌ **无入口**：`VersionListPanel` 只有「切换」（`:250-259`），回滚 tag 只读展示（`:244-248`）                                                                                                                | 后端能做、没人能点                                                                                                                                                            |
| 3   | `saveDraft`       | `PUT /projects/:id/draft`（`versions.ts:51-94`）                      | ⚠️ **能写但语义空转**：写入成功（`project-repository.ts:149-176`），但**没有任何读取方消费 `draftFiles`**（§0-3），且 `publish` 只拿它做存在性校验（`versions.ts:113-120`） | ✅ `api/projects.ts:327-333` | ❌ **无入口**                                                                                                                                                                                                | **三层齐全也不成立**：写进去的东西没人读，连上界面也不会改变任何行为。且唯一的读端点 `GET /draft`（`:24-48`）被 `VersionListPanel.tsx:51` 调了，但只取了 `updatedAt`（`:75`） |
| 4   | `diffVersions`    | `GET /projects/:id/versions/:versionId/diff`（`versions.ts:385-441`） | ❌ **桩**：`diff` 恒为 `{added:[],removed:[],modified:[]}`（`:419-424`），注释自述「实际应该使用专门的diff库」                                                              | ✅ `api/projects.ts:387-399` | ❌ **无入口**                                                                                                                                                                                                | **后端是桩，即使接上界面也永远是"无变化"**                                                                                                                                    |
| 5   | `archiveProject`  | `DELETE /projects/:id`（`routes/projects.ts:312-339`）                | ✅ **完整**：`status='archived'`                                                                                                                                            | ✅ `api/projects.ts:120-125` | ❌ **无入口**。注意 S1 把它错记成 `POST /deprecate`（§0-1）；真正无入口的是**打到 `archived` 的这条路**，而打到 `deprecated` 的那条（`deprecateProject`）**已有界面**（`:224-229`）                          | **两套"归档"并存，用户只能用一套**；`archived` 状态因此不可达（§3.4）                                                                                                         |
| 6   | `updateProject`   | `PUT /projects/:id`（`routes/projects.ts:275-309`）                   | ✅ **完整**：zod 校验 5 个可改字段（`:25-31`）→ `repo.updateProject` → 回读返回                                                                                             | ✅ `api/projects.ts:102-117` | ❌ **无入口**                                                                                                                                                                                                | **改项目名/描述/标签在界面上做不到**（§3.1）；这是本条新候选能力的唯一实质缺口                                                                                                |
| 7   | `deleteFile`      | `DELETE /projects/:id/files/:fileId`（`routes/projects.ts:633-658`）  | ✅ **完整**：真删 + 404 兜底                                                                                                                                                | ✅ `api/projects.ts:196-201` | ❌ **无入口**                                                                                                                                                                                                | 后端能做、没人能点（S1 §三已记「文件的删除与重命名：API 有，界面没有入口」）                                                                                                  |
| 8   | `getFile`         | `GET /projects/:id/files/:fileId`（`routes/projects.ts:526-550`）     | ✅ **完整**                                                                                                                                                                 | ✅ `api/projects.ts:163-168` | ❌ **无调用方**                                                                                                                                                                                              | **属冗余**：列表端点 `GET /projects/:id/files`（`:506-523`）返回全量文件对象，编辑器三处调用它（`ProjectEditor/index.tsx:407`、`:804`、`:1198`），单文件端点因此没有存在理由  |

### 4.1 汇总：8 条不是"同一个形状"，是三种形状

| 形状                         | 条数 | 成员                                                                          | 特征                                                | 接上界面的成本                    |
| ---------------------------- | ---- | ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| **A · 后端完整、只缺界面**   | 5    | `rollbackVersion`、`archiveProject`、`updateProject`、`deleteFile`、`getFile` | 三层只差最上面一层；接上即可用                      | 低（纯前端）                      |
| **B · 后端完整、界面在骗人** | 1    | `copyProject`                                                                 | 有按钮、有 onClick、有成功提示，**但没有 API 调用** | 极低（删 TODO 加一行）            |
| **C · 后端是桩或不成立**     | 2    | `diffVersions`（恒空）、`saveDraft`（写进去没人读）                           | **接上界面也不会产生用户价值**，必须先补后端语义    | 高（要写 diff 库 / 要定草稿契约） |

> **对 S1 §4.2「这 8 条是同一个形状：后端 + 客户端两层齐了，第三层（界面）缺席或作假」的修正**：
> "三层齐了两层"这半句对 **A + B 共 6 条**成立；对 **C 的 2 条不成立**——那两条是**后端本身没做完**，把它们和另外 6 条并成一张清单，会让"补齐界面"看起来像 8 条同样的活，实际其中 2 条要先补后端语义（且 `saveDraft` 那条还牵扯"草稿→版本"的契约，见 §1.4）。
> 另外 §4.2 的表格把 `archiveProject` 的后端列写成了 `POST /deprecate`，需按 §0-1 修正。

---

## 5. 本簇未解问题

> 只列**本次读码无法定论**或**需要人裁**的。每条给出"卡在哪"和"下一步问谁 / 查什么"。

1. **`deprecated` 与 `archived` 是同一件事的两套值，还是两件不同的事？** 代码里路由注释一个叫「归档工程」（→`archived`）、一个叫「作废工程（软删除）」（→`deprecated`）；界面的状态筛选器同时列了 "Archived" 和 "🗑️ Deprecated"，但只有后者能被产生（`ProjectList/index.tsx:304-305` vs `:224-229`）。**卡在**：需要人确认产品上是否真有两种退场语义（"归档"=只读留存？"作废"=移入回收站？）。**若只是一种**，则 `archived` 是死枚举、`DELETE /projects/:id` 与 `archiveProject` 可一并退场；**若是两种**，则缺一条把项目变成 `archived` 的界面入口。→ 建议在落 CAP-17 故事前先裁这一条。

2. **`publish` 到底应该快照什么？** 文档的不变性写「Draft 可随时修改，publish 时快照为 Version」（`strategic-design.md:115`），代码快照的是工作区 `script_files`（`versions.ts:123`）。**卡在**：两种读法都自洽——(a) 文档是设计意图、代码是实现漂移，应改代码；(b) "Draft" 这个词在文档里指的就是"工作区未发布状态"、代码是对的、文档措辞不精确。**这一条决定 `saveDraft`/`getDraft`/`project_drafts` 整张表是留是退，也决定 CAP-14 缺口 (c) 与 §4 形状 C 的第 2 条怎么收。** 本次只读审计不能替人裁。

3. **切换版本丢数据要不要在故事里当缺陷处理？** §1.4 已给出确定的技术结论（会丢、且警告永不触发），但**"未发布改动被覆盖"在版本管理产品里是不是可接受行为**是产品判断。更早的旁证：仓库里那条 E2E 用例本身就是想测这个警告（`version-management.spec.ts:129-169`），且它的兜底让测试恒绿——**这条用例当前不可能失败，也当前不可能发现这个洞**。

4. **`LLM_PROVIDER` 的别名是"给前端下拉框用的"（`container.ts:46` 注释），但下拉框有 3 项、别名只注册 1 项。** 本次能确定的是"至少 2 项必抛错"与"volcano 模式下 deepseek 是假别名"。**卡在**：不确定产品意图是"下拉框只该显示当前可用的那一个"（→ 改前端，按 `/api` 暴露当前 provider）还是"三个都该能选"（→ 改容器，按 key 惰性建 provider）。前者改动小得多。

5. **`docs/ddd/strategic-design.md:264-317` 的 8 条整改（M1–M5 + m1–m3）从没进过 backlog**（MESS-D-05）。本簇的 CAP-15 直接命中 M2（LLMOrchestrator 横跨领域/基础设施），CAP-14 命中 M5 同类问题（聚合暴露可变引用）。**卡在**：§4 的整改清单与现行 `docs/design/` 体系的 ADR 流程（`docs/design/README.md:9`、`:47`）之间没有通道——`docs/ddd/` 不在该索引里，也没有"整改项 → backlog 故事"的搬运规则。**这是"把已开发成果接进开发节奏"这件事本身的一个结构缺口**，建议在收敛阶段单独处理。

6. **CAP-17 的编号是否已被同波次其他 agent 占用。** 本文件按"现行最大号 CAP-16 + 1"建议 **CAP-17**（`capability-inventory.md:28` 的 CAP-16 为当前最大），但波次 2 有多个 agent 并行，**同波次其他簇可能也提了新候选编号**。收敛阶段需做一次编号去重。

7. **（旁支，越界记录）项目创建时的「Template Scheme」下拉框是死的，且死了两次。** UI 送 `templateScheme`（`ProjectList/index.tsx:90`），但后端建项目 schema 里没有这个字段（`routes/projects.ts:11-23`，无 `.strict()` → zod 静默丢弃），初始化调用也没把它传下去（`:201-209`）；即便传到了，`ProjectInitializer` 也只有一行日志说「not yet implemented」（`project-initializer.ts:81-87`）。**这不属本簇三条能力**（属项目创建 / CAP-05 提示词方案的交叉），但它是"界面上有个选择器、选了没用"的同类缺陷，留给 CAP-05 或收敛阶段认领。

---

## 附：本簇证据索引（关键文件）

| 文件                                                                          | 本簇用到的行段                                                                                                                               | 说明                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `packages/api-server/src/routes/versions.ts`                                  | `:24-48`，`:51-94`，`:97-171`，`:174-218`，`:221-297`，`:300-382`，`:385-441`                                                                | 版本管理全部 7 个端点                                      |
| `packages/api-server/src/routes/projects.ts`                                  | `:11-31`，`:275-309`，`:312-339`，`:342-390`，`:393-446`，`:449-503`，`:506-550`，`:633-658`，`:661-710`，`:749-788`，`:791-869`，`:872-937` | 项目 CRUD + 归档/作废/恢复/复制 + 模板方案                 |
| `packages/api-server/src/services/project-repository.ts`                      | `:37-120`，`:132-137`，`:149-176`，`:196-210`，`:226-229`，`:231-268`，`:272-318`，`:414-443`                                                | 事务脚本形态的证据集中地                                   |
| `packages/api-server/src/ioc/container.ts`                                    | `:38-65`，`:80-96`，`:101-161`，`:166-181`，`:211`                                                                                           | CAP-15 全部装配逻辑                                        |
| `packages/core-engine/src/engines/llm-orchestration/orchestrator.ts`          | `:23-72`，`:112-121`，`:199-207`，`:209-367`，`:369-392`                                                                                     | 注册表 + 基类能力（超时/JSON/流式）                        |
| `packages/api-server/src/adapters/outbound/llm/*.ts`                          | 三文件各 35-44 行                                                                                                                            | 三个 provider，全部只 override `getModel()`                |
| `packages/api-server/src/db/schema.ts`                                        | `:37`，`:142-165`，`:204-213`，`:218-239`                                                                                                    | projects / project_drafts / project_versions + status 枚举 |
| `packages/script-editor/src/pages/ProjectList/index.tsx`                      | `:111-119`，`:122-130`，`:132-164`，`:166-194`，`:196-253`，`:304-305`，`:372-380`                                                           | CAP-17 与 §4 界面层的证据                                  |
| `packages/script-editor/src/components/VersionListPanel/VersionListPanel.tsx` | `:44-93`，`:95-140`，`:189-211`，`:213-291`                                                                                                  | 版本面板（唯一版本界面）                                   |
| `packages/script-editor/src/pages/ProjectEditor/index.tsx`                    | `:743-820`，`:823-863`，`:1596-1600`                                                                                                         | 保存 / 发布 / 版本面板挂载点                               |
| `packages/script-editor/src/api/projects.ts`                                  | `:102-125`，`:146-152`，`:163-168`，`:196-201`，`:317-400`                                                                                   | 39 个客户端方法中的本簇相关 15 个                          |
| `packages/script-editor/src/components/DebugChatPanel/RerunModal/index.tsx`   | `:53-57`，`:80`，`:107-122`                                                                                                                  | 3 选 1 的供应商下拉框                                      |
| `docs/ddd/strategic-design.md`                                                | `:50-51`，`:107-126`，`:110-115`，`:255-258`，`:264-276`                                                                                     | CAP-14/15/17 的唯一设计权威                                |
| `docs/ddd/context-map.md`                                                     | `:25`，`:43`，`:56`                                                                                                                          | 上下文映射                                                 |
