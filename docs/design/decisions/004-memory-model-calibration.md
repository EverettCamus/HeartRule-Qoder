# 004 — 记忆数据模型校准（Hindsight v0.6.2 → v0.9.1）

## 重核记录（2026-08-14）

2026-08-14，`@vectorize-io/hindsight-client` 从 **v0.6.2** 升级到 **v0.9.1**（精确锁定，见 `packages/api-server/package.json`）。本文档基于 v0.9.1 真实类型定义（`node_modules/@vectorize-io/hindsight-client/dist/index.d.ts`）逐条重核，每条决策标注状态：**✅ 在 0.9.1 下依然成立 / ⚠️ 需要修订 / ➕ 新增**。

| 决策                       | 状态                            | 要点                                                                                                                          |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 决策 1：Opinion 自建存储   | ✅ 前提成立（需配套 ➕ 决策 6） | opinion 仍非 recall/reflect fact type；`confidence` 仍不存在                                                                  |
| 决策 2：reflect 结构化产出 | ✅ v0.9.1 直接支持              | `responseSchema` → `structured_output` 已是一等能力                                                                           |
| 决策 3：时间推理降级       | ⚠️ 需要修订                     | v0.9.1 新增 `enable_temporal_retrieval` + `query_timestamp`（查询侧时间检索），降级结论过时                                   |
| 决策 4：来源标注 metadata  | ✅ 依然成立                     | retain `metadata` 与 `RecallResult.metadata` 均在                                                                             |
| 决策 5：端口 options 对齐  | ⚠️ 需要修订                     | recall/reflect options 大幅扩充（tagsMatch/tagGroups/minScores/preferObservations/includeSourceFacts/budget/queryTimestamp…） |
| ➕ 决策 6：Mental Models   | ➕ 新增                         | v0.9.1 新增 mental model 第一类 API，冲击决策 1 的"自建 opinions 表"                                                          |

## 背景

记忆框架设计（`memory-framework.md`）基于 Hindsight SDK **v0.5.0** 撰写，但仓库实际安装的是 **v0.6.2**。两个版本之间存在一个致命错位：设计声称"Hindsight 四网络 World/Experience/Opinion/Observation 与 MemoryContext 1:1 映射"，而 v0.6.2 的 `recall` 事实类型只有三类（world/experience/observation），**没有 opinion**。

这个错位已经穿透到代码：`hindsight-adapter.ts` 的 `case 'opinion'` 分支永不命中，`MemoryContext.opinions` 恒空，`confidence: 0.5` 是硬编码假数据。这是一个**设计缺陷**（逻辑前提错误），不是设计未完成（待补充）。它阻断了依赖观点信心、反思综合、矛盾检测的功能开发。

本决策记录校准方案，作为修订 `memory-framework.md` 及相关文档的依据。

## 已核实的事实（对照 SDK v0.6.2 类型定义）

| 设计假设                                                        | SDK 实际                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 四网络 World/Experience/Opinion/Observation 均可 recall         | recall 事实类型仅 `world`/`experience`/`observation`                                                                                                                                                                                                                                         |
| `Opinion` 带 `confidence` 动态演化                              | `RecallResult` 无 `confidence` 字段                                                                                                                                                                                                                                                          |
| `reflect` = 跨记忆综合 → 更新观点信心                           | `reflect` = 用 bank 身份 + memories 回答 query，返回 markdown，可用 `response_schema` 拿 `structured_output`                                                                                                                                                                                 |
| 时间推理 (τ_start/τ_end/τ_mention) 作为检索参数                 | v0.6.2：`RecallResult` 带 `occurred_start`/`occurred_end`/`mentioned_at` 作为**结果元数据**，查询侧无时间窗口过滤旋钮；**v0.9.1：新增 `enable_temporal_retrieval`（日期感知查询分析）+ recall `query_timestamp`（相对时间表达式锚点 + recency 评分），查询侧时间检索已存在**（见 ⚠️ 决策 3） |
| 四路检索（语义+BM25+图谱+时间）                                 | v0.6.2：recall 就是 `query + types + tags + budget`；**v0.9.1：新增 `enableGraphRetrieval`/`enableTemporalRetrieval`（图谱遍历与时间检索臂）、`enableReranking`（交叉编码器重排）及 `tagsMatch`/`tagGroups`/`minScores`/`preferObservations` 等 options**（见 ⚠️ 决策 5）                    |
| 知识图谱多跳遍历                                                | v0.6.2：无公开 recall 图谱遍历 API（图谱仅在 stats/可视化端点出现）；**v0.9.1：`enableGraphRetrieval` 已提供 recall 侧的实体/链路图谱遍历臂**（1 跳/多跳深度未在类型层区分）                                                                                                                 |
| recall 接受 `searchWeights`（四网络权重）                       | 无此参数，仅 `types` 过滤 + `budget`                                                                                                                                                                                                                                                         |
| retain 接受 `extractionPrompt`、reflect 接受 `reflectionPrompt` | retain 用银行级 `strategy`（策略名）；reflect 的领域提示词直接放 query                                                                                                                                                                                                                       |
| 无来源标注写入点                                                | retain 支持 `metadata?: Record<string, string>`，`RecallResult` 也带 `metadata`                                                                                                                                                                                                              |

## 核心决策

### 决策 1：Opinion 的去向 —— 自建存储，不映射 Hindsight opinion（✅ 前提成立，需配套 ➕ 决策 6）

**结论**：`MemoryContext` 保持四字段（领域抽象"事实/经历/判断/综合"跨咨询领域通用），但 **opinions 的数据来源从"recall 返回字段"改为"HeartRule 自建的独立存储"**。

- recall 只填充 `worldFacts` / `experiences` / `observationSummary` 三字段。
- `opinions` 由 HeartRule 的 reflect 管线产出：reflect 用 `response_schema` 定义 `opinions` 数组，拿 `structured_output`，写入自建的 PostgreSQL `opinions` 表。
- 下一次 recall 时，opinions 从自建表加载后合并进 `MemoryContext.opinions`，不与 Hindsight 的 fact type 混淆。

**理由**：Hindsight 的 "opinion" 是 reflect 内部的 mental model（银行视角），不是 recall 能返回的事实。把咨询师的判断强塞进这个不存在的 fact type，是错的。但"事实 vs 判断"的领域区分本身是对的——所以保留领域字段，改换数据来源。

**v0.9.1 重核**：本决策的两个前提在 v0.9.1 下依然成立——opinion 仍不是 recall/reflect 的 fact type（`RecallRequest.types` 与 `ReflectRequest.fact_types` 均为 `'world' | 'experience' | 'observation'`），类型定义中也没有 `confidence` 字段。但 **v0.9.1 新增了 mental model 第一类 API，使"自建 opinions 表"不再是唯一/最优解**——见 ➕ 决策 6。

**代价**：新增一张 `opinions` 表 + 一个 reflect→写入→recall→合并的管线（若采用 ➕ 决策 6 的 mental model 路径，此成本下降）。这块本来就属于 Phase 4（矛盾检测/临床洞察）的范畴，不影响 Phase 1-3 的开发。

### 决策 2：reflect 语义校准 —— 结构化产出，而非更新观点（✅ v0.9.1 直接支持）

**结论**：reflect 的正确用法是"给定反思方向，用 `response_schema` 拿结构化输出"，而非 SDK 原生返回 markdown。

```
reflect(userId, query, {
  response_schema: {
    newObservations: string[],
    updatedOpinions: [{ content, confidence }],
    contradictions: [{ factA, factB, analysis }],
  }
})
→ response.structured_output  ← 这就是框架想要的 ReflectionResult
```

**修正**：框架 §5.2.1 定义的 `ReflectionResult { updatedOpinions, newObservations, contradictions }` **保留**，但明确其数据来源是 `response_schema → structured_output`，不是 SDK 原生返回。当前端口里的 `{ summary: string }` 是 Phase 0 简化，需在端口文档里承认这个降级，而不是与框架正文并存矛盾。

**v0.9.1 重核**：本决策已被 v0.9.1 **直接支持**——`reflect` 客户端签名明确提供 `responseSchema?: Record<string, unknown>`，返回 `ReflectResponse.structured_output`（"parsed according to the request's response_schema"）。不再是需要变通的能力，而是 SDK 一等能力，决策 2 无需修订。

### 决策 3：时间推理降级 —— 结果元数据，非查询过滤（⚠️ 需要修订）

**v0.6.2 结论**：SDK 的时间信息只是召回结果的**事件时间标注**（`occurred_start`/`occurred_end`/`mentioned_at`），查询侧无时间窗口过滤，因此九轴模型轴 3 的 `temporal` 需降级为"召回后应用层过滤"。

**v0.9.1 修订（该结论已过时）**：v0.9.1 新增了查询侧时间检索能力——

- `createBank` / `updateBankConfig` 的 `enableTemporalRetrieval`："Run the temporal retrieval arm during recall, and the date-aware query analysis feeding it"——recall 时运行**时间检索臂** + **日期感知查询分析**。
- recall 客户端选项 `queryTimestamp`（ISO 日期字符串）：作为**相对时间表达式的查询时锚点**与 recency 评分基准。
- `RecallScores.final` 注明最终排序 = "combined reranker + recency/temporal/proof boosts"——时间与 recency 已参与排序增强。

因此"查询侧无时间检索"不再成立：九轴模型轴 3 `temporal` 从"降级"改为"**部分支持**"。注意 v0.9.1 提供的是日期感知的查询侧时间检索 + recency 增强，而非框架原本设想的显式 `τ_start`/`τ_end` 窗口参数。落地方式改为：

- 在 `createBank` / `updateBankConfig` 时开启 `enableTemporalRetrieval`；recall 时按需传 `queryTimestamp` 作为时间锚点。
- `occurred_start`/`occurred_end`/`mentioned_at` 仍作为结果元数据返回，供 LLM 判断时间顺序与证据链。
- `memory-framework.md` §4.1 的"时间推理 (τ_start/τ_end/τ_mention)"改述为"查询侧时间检索（enableTemporalRetrieval + queryTimestamp）+ 事件时间元数据（occurred_start/occurred_end/mentioned_at）"。

### 决策 4：来源标注写入点 —— retain 的 metadata 字段（✅ 依然成立）

**结论**：来源标注（`source_channel` / `source_credibility`）通过 retain 的 `metadata?: Record<string, string>` 写入，recall 时随 `RecallResult.metadata` 返回。

- retain 时，调用方传入 `metadata: { source_channel: 'dialogue' | 'clinical_note' | 'scale' | 'knowledge', source_credibility: 'high' | 'medium' | 'low' }`。
- 适配器透传到 SDK 的 `metadata` 参数。
- recall 时，适配器从 `result.metadata` 读回，附加到 MemoryContext 的各条记忆上。

**v0.9.1 重核**：retain 客户端签名中的 `metadata?: Record<string, string>`、`documentId`、`tags`、`strategy` 均在，`RecallResult.metadata?: Record<string, string>` 亦在。本决策无需修订。

**修正**：`MemoryContext` 的各字段子类型需从 `{ content }` 扩展为 `{ content, source_channel?, source_credibility?, occurred_start?, occurred_end? }`。这补上了框架原则 3（推论与证据可互查）和类型Ⅳ（溯源追溯）的前置数据模型。

### 决策 5：端口 options 与 SDK 对齐（⚠️ 需要修订——recall/reflect options 已扩充）

**结论**：框架 §4.3 设想的 `searchWeights` / `extractionPrompt` / `reflectionPrompt` 三个 options 删除或改述为 SDK 实际支持的形态：

| 设计字段                                     | 改述为                                                            |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `searchWeights`（四网络权重）                | `RecallOptions.types`（事实类型过滤）+ `budget`                   |
| `extractionPrompt`（retain 领域提取提示词）  | 银行级 `strategy`（策略名，在 Hindsight 配置层设置，非 per-call） |
| `reflectionPrompt`（reflect 领域反思提示词） | reflect 的 `query` 参数直接承载反思方向                           |

领域特定性不再通过"per-call 提示词"注入，而是通过 **recall 的 query 构造**和 **reflect 的 query 文本**体现。这符合九轴模型轴 2 的 `conceptualized`/`predefined` 查询构造机制。

**v0.9.1 重核**：上表"改述为"仍成立，但 v0.9.1 的 recall/reflect options 大幅扩充，端口 `RecallOptions` 有更多可对齐项：

| v0.9.1 recall/reflect 新增 options                                     | 端口意义                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| `tagsMatch: 'any' \| 'all' \| 'any_strict' \| 'all_strict' \| 'exact'` | 标签匹配语义（含未打标签记忆的取舍），替代隐式 OR 语义 |
| `tagGroups`（布尔组合：and/or/not）                                    | 复合标签过滤，与 `tags` 互斥                           |
| `minScores: { semantic?, keyword?, reranker?, final? }`                | 分阶段分数下限，过滤低质量召回                         |
| `preferObservations`                                                   | observation 优先，压制其来源 raw fact（内容去重）      |
| `includeSourceFacts` + `results[].source_fact_ids`                     | observation 的证据溯源（类型Ⅳ 溯源追溯直接受益）       |
| `budget: 'low' \| 'mid' \| 'high'`                                     | 语义化预算档位（与 `maxTokens` 互补）                  |
| `queryTimestamp`                                                       | 查询时时间锚点（见 ⚠️ 决策 3）                         |
| `trace` / `includeToolCalls`                                           | 可观测性                                               |
| reflect `factTypes`                                                    | reflect 检索的 fact type 过滤（等价 recall `types`）   |
| reflect `excludeMentalModels` / `excludeMentalModelIds`                | 排除心理模型（见 ➕ 决策 6）                           |

端口对齐策略不变（决策 5 原意）：领域特定性通过 recall 的 query 构造与 reflect 的 query 文本体现；以上 options 按需从端口透传，而非全部暴露到端口。

### ➕ 决策 6：Mental Models —— v0.9.1 新增的第一类 API，冲击决策 1

**v0.9.1 新能力**：mental model 成为一等 API。客户端提供 `createMentalModel(bankId, name, sourceQuery)`、`listMentalModels`、`getMentalModel`、`refreshMentalModel`、`dryRunRefreshMentalModel`、`clearMentalModel`、`updateMentalModel`、`deleteMentalModel`、`getMentalModelHistory`。`MentalModelResponse` 含：`name`、`source_query`、`content`（markdown，由 reflect 自动生成）、`tags`、`max_tokens`、`trigger`（含 `refreshAfterConsolidation`——新记忆 consolidate 后自动刷新）、`last_refreshed_at`、`created_at`、`is_stale`（有新写入未刷新标记）、`reflect_response`（完整 reflect 载荷，可含 `structured_output`）。reflect 侧有 `excludeMentalModels`/`excludeMentalModelIds` 控制是否使用；`ReflectResponse.based_on.mental_models` 记录其证据来源。

**对决策 1 的影响（调查结论）**：mental model 比"自建 opinions 表"更贴近"观点演化/推论"的领域语义——

1. **语义吻合**：mental model = 银行视角下持续演化的观点（`source_query` 驱动的 reflect 产物，可随记忆增长自动刷新）。这正是 HeartRule `opinions`（判断/综合，随会谈演化）想要的语义；而 recall 的 world/experience/observation 是事实/经历/观察，不是判断。
2. **自带演化生命周期**：`trigger.refreshAfterConsolidation` + `is_stale` 实现"观点随新证据刷新"的闭环，自建表需自行实现这套机制。
3. **自带证据链**：`based_on.memories/mental_models/directives` 提供观点的事实依据，直接支撑框架原则 3（推论与证据可互查）与类型Ⅳ（溯源追溯）。
4. **结构化输出可持久化**：refresh 时传 `response_schema`，`reflect_response.structured_output` 存储解析结果——与决策 2 的 `structured_output` 方案一致。

**结论**：决策 1 的"自建 opinions 表"应**重新评估**——优先考察用 Hindsight mental model 承载 `MemoryContext.opinions`：

- **推荐路径**：用 `createMentalModel` + `response_schema` 创建咨询师观点模型，`listMentalModels` 读取、`refreshMentalModel` 随会谈推进刷新；`MemoryContext.opinions` 由 mental model 管线产出。
- **保留自建表作为降级路径**：若不想耦合 mental model API 的预 1.0 稳定性，或需要比 `tags` 更细粒度的领域视图，自建 `opinions` 表仍可做兜底。两种路径的领域端口契约（`MemoryContext.opinions`）不变，只是适配器实现选择不同。

**代价**：原"新增 opinions 表 + reflect→写入→recall→合并管线"可能简化为"配置 mental model + 适配器读取/刷新"；但 mental model API 仍预 1.0，需在适配器层隔离（适配器负责映射，端口不泄漏 SDK 类型）。

## 需要修订的设计文档（具体到章节）

### `memory-framework.md`（问题集中区，最高优先）

- **§4.1**：删除"v0.5.0 (2025-12 发布)"，改为 v0.6.2；删除"四路并行检索 + RRF + 交叉编码器""知识图谱 4 种边类型 + 多跳遍历""时间推理 τ_start/τ_end/τ_mention"这些 SDK 不公开的能力断言。
- **§4.2**：四网络图修正——明确 opinion 是 reflect 的 mental model，不是 recall 事实类型；三操作表中 reflect 的"更新观点信心"改为"结构化反思产出（response_schema）"。
- **§5.2.1**：`MemoryContext` 四字段定义改为——前三字段来自 recall，opinions 来自自建存储；`ReflectionResult` 明确来自 structured_output；补 `source_channel`/`source_credibility`/时间元数据字段。
- **§4.3**：`HindsightMemoryAdapter` 职责表里 searchWeights/extractionPrompt/reflectionPrompt 按决策 5 改述。
- **§7 关键设计决策记录**：追加一行"四网络映射"的修订说明。

### `memory-repository.port.ts`（代码，随设计修订同步）

- `MemoryContext` 各字段子类型扩展来源/时间元数据。
- `ReflectionResult` 从 `{ summary }` 扩展为结构化字段（或在端口注释中明确 Phase 4 前的降级）。
- `RetainOptions` 增加 `metadata`、`RetainOptions`/`RecallOptions` 与 SDK 对齐。
- `RecallOptions` 按 v0.9.1 扩充——`tagsMatch`/`tagGroups`/`minScores`/`preferObservations`/`includeSourceFacts`/`budget`/`queryTimestamp`（见 ⚠️ 决策 5）。
- `MemoryContext.opinions` 的数据来源按 ➕ 决策 6 定夺：Hindsight mental model 管线，或保留自建表兜底。

### `hindsight-adapter.ts`（代码）

- 删除永不命中的 `case 'opinion'` 分支和 `confidence: 0.5` 假数据。
- recall 映射改为 world/experience/observation 三路 + 从 metadata 读来源标注。
- reflect 改为 `response_schema` + `structured_output`。
- retain 透传 `metadata`。
- 按 ➕ 决策 6 评估是否用 mental model API（`createMentalModel`/`listMentalModels`/`refreshMentalModel`）承载 opinions 字段，替代/兜底自建表。

### `memory-retrieval-types.md`（九轴模型）

- 轴 3 `temporal` 的说明**按 v0.9.1 修订**：从"降级"改为"部分支持"——`enableTemporalRetrieval` + `queryTimestamp` 提供日期感知的查询侧时间检索与 recency 增强（见 ⚠️ 决策 3）；`occurred_start`/`occurred_end`/`mentioned_at` 仍为结果元数据。
- 轴 3 `graph_1hop`/`graph_multihop` 标注**按 v0.9.1 修订**：`enableGraphRetrieval` 已提供 recall 侧图谱遍历臂，1 跳/多跳深度未在类型层区分，Phase 4 验证后决定用 SDK 还是自建。
- §3.2 末尾"未形成预设的取值"清单更新——`graph_*`/`temporal`/`cross_client_experience` 需明确哪些能落地、哪些是空头支票。

### `ai-ask-memory-recall.md`

- §3.3 快通道查询构造里"升级为极短 LLM 摘要"与 ≤200ms 预算的矛盾需处理（决策：走规则，LLM 升级移到慢通道）。

## 第 0 步 PoC 评估（2026-08-15，类型 + 运行时级）

针对 ➕ 决策 6 做了 SDK 类型 + 运行时（`node_modules/@vectorize-io/hindsight-client/dist/index.{d.ts,js}` v0.9.1）核查，live PoC 脚本已就绪（`scripts/verify-mental-model.ts`），但当前环境无 Docker 与 `DEEPSEEK_API_KEY`，未跑通 live。

### 已核实（类型/运行时级）

| 结论                                                                                                                                                                                   | 证据                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| mental model API 完整：create/list/get/refresh/dryRun/clear/update/delete/history                                                                                                      | `index.d.ts` 客户端方法齐全      |
| 服务端 `MentalModelTriggerInput.response_schema` 支持结构化输出 → 存 `reflect_response.structured_output`                                                                              | `index.d.ts:3463`                |
| **类型化客户端不透传 `response_schema`**：`createMentalModel` 只转发 `refresh_after_consolidation`/`tags_match`/`tag_groups`；`updateMentalModel` 只转发 `refresh_after_consolidation` | `index.js:1784`、`index.js:1881` |
| `reflect` 客户端原生暴露 `responseSchema` → `response_schema`                                                                                                                          | `index.js:1536`                  |
| 异步操作可轮询：创建返回 `operation_id`，客户端有 `getOperationStatus`                                                                                                                 | `index.js:2114`                  |
| retain 原生透传 `metadata`/`strategy`（决策 4 写入点）                                                                                                                                 | `index.js:9294`                  |

### 结论与方向

- **mental model 路径可行但有缝**：服务端支持 `response_schema`，但客户端 `create`/`update` 都不透传——必须用 raw HTTP `POST /v1/default/banks/{bank_id}/mental-models` 创建才能配置结构化输出。创建后 refresh/get 走类型化客户端即可（refresh 用存储的 trigger，get(detail='full') 读 `structured_output`）。
- **降级路径（reflect + responseSchema）客户端完全支持**，无 bypass。
- **对步骤 1-2 的影响**：端口/适配器修订**不依赖** mental-model-vs-自建表 的最终选择——决策 2 的 reflect+responseSchema 路径两条路都要用。建议本次修订先落地 reflect+responseSchema（修复"reflect 烧 LLM 只拿空 markdown"），opinions 的持久化承载（自建表 vs mental model）作为 Phase 4 决策，由 live PoC（Path A）拍板。

### Live PoC 实测（2026-08-16，server 0.6.2 → 0.9.1 升级后 + DeepSeek）

**升级**：本地镜像过期（`latest` 停在 0.6.2，digest `f0f9e9a`）。`docker compose pull hindsight` 拉到 0.9.1（digest `a0e93736`，远程 `latest` 与 `0.9.1` 同 digest），`up -d --force-recreate hindsight` 重建，数据卷保留。`/version` → `api_version: 0.9.1`。

**实测结果**（`scripts/verify-mental-model.ts`，server 0.9.1 + `HINDSIGHT_API_LLM_PROVIDER=deepseek`）：

| 路径                                              | 0.6.2（升级前）                                                     | 0.9.1（升级后）                                                                                                                       | 根因                                                |
| ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Path A：mental model + raw HTTP `response_schema` | 创建成功，`structured_output` 空，content 卡"Generating content..." | 创建成功，refresh 时 **`MentalModelRefreshError: structured output extraction failed`**，`refresh_skipped='structured_output_failed'` | `scope=reflect_structured` 调用 DeepSeek 返回空内容 |
| Path B：类型化 `createMentalModel`                | `response_schema` 被丢弃                                            | 同左（SDK 层阻断，与 server 版本无关）                                                                                                | `index.js:1784/1881`                                |
| Path C：reflect + `responseSchema`                | `structured_output` 空，text 可用                                   | **`structured_output` 仍空**，但 text 输出质量高（多轮工具调用综合）                                                                  | 见下方日志                                          |

**根因定位**（容器日志）：0.9.1 server 的 structured 路径用 `scope=reflect_structured` 调用 LLM，而 DeepSeek 在此调用下返回 **`Provider returned empty message content ... finish_reason=length, has_tool_calls=False`**（2 次重试均失败）。对照 `scope=reflect`（普通文本）DeepSeek 正常产出完整 markdown（60s/2805 tokens）。→ **structured_output 可用性是 LLM provider 局限，不是 server 版本问题**（可能：DeepSeek 在该用例下 JSON 输出超长被截断，或不支持 Hindsight 的 structured JSON 模式）。

**对决策的影响**：

- 升级到 0.9.1 是**必要前提**（0.6.2 上 structured 路径根本不存在），但**不等于 structured_output 可用**。
- 决策 2/6 的"reflect+responseSchema → `structured_output`"落地**当前受 DeepSeek 阻断**。待验证项（Phase 4 前）：换 OpenAI provider 重测、简化 `response_schema`、或调大 structured 调用的 max_tokens。
- 适配器现状（`summary = response.text` 回退）**正确兜底**：Phase 0/1 用 markdown summary，`structured_output` 空时 `updatedOpinions` 等字段留空——不阻塞 `ai-ask-memory-recall`（该链路只用 `MemoryContext` 文本）。

## 实施顺序

0. **评估 ➕ 决策 6（mental models）**——类型/运行时级评估已完成（见上节）。live PoC 脚本 `scripts/verify-mental-model.ts` 已就绪，待 Docker + `DEEPSEEK_API_KEY` 就绪后跑一次 Path A 拍板"自建表 vs mental model 管线"。**此步不阻塞步骤 1-2**：reflect+responseSchema 两条路径都要用，本次先落地它。
1. **修订 `memory-framework.md` 数据模型章节**（§4.1/§4.2/§5.2.1/§4.3）——纯文档，1-2 天。
2. **同步修订端口 `memory-repository.port.ts` + 适配器 `hindsight-adapter.ts`**——修正 opinions 恒空、confidence 假数据、reflect 误用三个真实 bug；recall options 按 v0.9.1 扩充（⚠️ 决策 5）。
3. **修订 `memory-retrieval-types.md` 九轴模型的过度承诺**——temporal 轴按 ⚠️ 决策 3 升级、graph 轴按 `enableGraphRetrieval` 更新。
4. **补来源标注数据模型**——`source_channel`/`source_credibility` 字段 + retain metadata 写入点。

完成 1-4 后，Phase 2（变量桥接）和 Phase 4（矛盾检测）的开发前提才成立。Phase 1 收尾（快通道 + SessionMemoryContext 分层）和 Phase 3（咨询方案 + 领域知识库，自建 PostgreSQL）可并行启动，不依赖本修订。

## 后果

- **正面**：消除 opinions 恒空的静默失败；reflect 从"烧一次 LLM 拿 markdown 丢弃"变为"结构化产出可持久化"；来源标注有落地点；九轴模型不再开空头支票。
- **成本**：新增 `opinions` 表 + reflect→写入→recall→合并管线；端口签名变更需同步 FakeMemoryRepository 和相关测试。
- **风险**：SDK 预 1.0 仍可能变。本修订把"四网络 1:1 映射"这个领域假设从端口层剥离，未来 SDK 变更的穿透范围会缩小——但 `world/experience/observation` 三网络假设仍留在端口，需接受这个残留耦合，或进一步在端口层抽象为纯领域类型（与 SDK 完全解耦，由适配器负责映射）。

## 关联

- `memory-framework.md` §4.1/§4.2/§5.2.1/§4.3 — 本决策的直接修订对象
- `memory-retrieval-types.md` §2.3/§3.2 — 九轴模型的时间/图谱轴降级
- `memory-repository.port.ts` / `hindsight-adapter.ts` — 端口与适配器同步修订
- `ai-ask-memory-recall.md` §3.3 — 快通道 LLM 升级预算矛盾
