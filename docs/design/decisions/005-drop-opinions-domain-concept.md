# 005 — 记忆领域模型去除 Opinions 概念（跟随上游合并，职能拆分）

## 背景

MemoryContext 领域四字段（worldFacts / experiences / opinions / observationSummary）沿用了 Hindsight 早期的"四网络 World/Experience/Opinion/Observation"宣传模型。004 决策 1/6 已确认 opinion 不是 Hindsight recall/reflect 的 fact type，并推荐由 mental model 承载。本次进一步核查上游史实（见下），发现四字段模型本身也应修订——opinion 作为独立领域概念不再成立。

**上游史实核查（2026-09-08，git 仓库 tag 对比 + 迁移文件 + 官方文档）**：

| 时间                | 上游动作                                                                                                                                                                                                  | 证据                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ≤v0.4.x             | opinion 曾是一等存储类型（带 `confidence_score` 列），reflect 可产出、graph/clear 可过滤                                                                                                                  | v0.4.22 openapi.json（5 处 opinion）+ versioned v0.3 文档《Opinions》 |
| 2026-01-15          | 迁移 `i4d5e6f7g8h9_delete_opinions`：opinion 不再是独立 fact type，"now represented through **mental model observations**"                                                                                | v0.5.0 起各 tag 的 alembic 迁移文件                                   |
| 2026-04-02          | 迁移 `g2h3i4j5k6l7_remove_opinion_fact_type`：删 opinion 索引/约束/行，**drop `confidence_score` 列**（"was only used for opinions, always NULL otherwise"）                                              | 同上                                                                  |
| v0.9.0 (2026-08-07) | spec 中 opinion 描述文字全部清除（v0.5.6~v0.8.0 各 5 处 → v0.9.0 起 0 处）                                                                                                                                | v0.9.0 release + openapi.json 对比                                    |
| v0.9.x 现状         | **observation = 自动 consolidate 的信念**（deduplicated beliefs + proof count + 精确引文 + refine 而非覆写）；**mental model = 显式常驻判断**（你定义问题、后台重写、读取零 LLM）；数值 confidence 无字段 | v0.9.2 `observations.mdx` / `mental-models.mdx`                       |

**上游合并动机**：observation 语义本就覆盖 opinion（"beliefs, preferences, learnings"都是归纳判断）；opinion 与 observation 边界天然模糊，双类型重复；数值 confidence 是 LLM 自我标注、无标定，列几乎全 NULL——用 proof count + refine 历史（证据强弱）替代更可靠。

**HeartRule 曾坚持自建 opinions 的理由**（004 决策 1）已逐条检验：

1. "事实 vs 判断的领域区分是对的" → 区分仍保留，但由 observation 的 grounding 语义承载（observation 带 source_fact_ids，recall 不混淆归纳与原始事实），不靠第二类型。
2. "咨询师判断需要信心分数驱动决策"（ai_think 变量填充信/问阈值、矛盾检测） → 数值 confidence 不可靠；改由证据强度信号（proof count / refine 方向 / freshness）+ mental model 的 is_stale 表达。变量桥接的"信 vs 问"阈值改规则（首次必问、证据充分才免问）。
3. "案例公式化（工作假设随证据演化）" → 这是 HeartRule 相对上游多出的真实需求，用 **mental model** 承载：source_query 定义公式化问题，后台随证据重写，读取零 LLM 成本，is_stale 给出"该重新审视了"信号。这与上游 opinion 职能的继承方向一致。

## 决策

### 决策 1：MemoryContext 四字段 → 三字段（worldFacts / experiences / observations）

**结论**：`MemoryContext` 删除 `opinions` 字段与 `observationSummary` 单字符串字段，改为结构化 `observations: ObservationEntry[]`。

```typescript
interface MemoryContext {
  worldFacts: MemoryEntry[]; // recall type=world
  experiences: MemoryEntry[]; // recall type=experience
  observations: ObservationEntry[]; // recall type=observation —— 原子信念，含证据溯源
}

interface ObservationEntry extends MemoryEntry {
  /** 上游 proof count —— 支撑该观察的证据条数（证据强度客观信号） */
  proofCount?: number;
  /** 来源事实 id（v0.9.1 includeSourceFacts）—— 推论与证据可互查（原则 3） */
  sourceFactIds?: string[];
}
```

**理由**：

- 上游观察网络的语义 = "去重后的信念 + 证据引文 + proof count + refine 演化"——这正是 HeartRule 曾想用 opinions 承载的"判断"职能，且带可验证的证据强度，不依赖 LLM 数值自我评分。
- `observationSummary` 折叠为单字符串是映射损失；改为 observation 列表保留结构（多条原子信念各自带证据），LLM 上下文拼装时按需渲染。
- "用户陈述的事实 vs AI 归纳的判断"的认知分离由 observation 的 grounding 语义天然保留（observation 带 sourceFactIds，raw fact 不带）——满足框架原则 1/3，无需第二类型。

**代价**：端口契约变更（memory-repository.port.ts）+ 适配器与消费方同步（hindsight-adapter.ts、base-action.ts 上下文渲染、session-orchestrator 统计、FakeMemoryRepository 与测试）。回退期在 Phase 4 之前，opinions 从未有真实数据（恒空），迁移成本为零。

### 决策 2：案例公式化（咨询师工作假设）用 mental model 承载，不落 MemoryContext

**结论**：HeartRule 不另建 opinions 表/管线。咨询师的工作假设追踪（原 opinions 的动态演化场景）改为 Hindsight **mental model**：

- 创建：`createMentalModel(bankId, name, sourceQuery)` + raw HTTP 补 `response_schema`（客户端 create/update 不透传，004 PoC 已核实）。
- 读取：会话启动时 `getMentalModel`（数据库读，零 LLM）→ 注入 `{{memory_context}}`。
- 刷新：`refreshAfterConsolidation` 触发 + `is_stale` 判断——随新证据自动重写。

**理由**：mental model = "你定义问题，Hindsight 后台写答案并随记忆演化重写"，语义正是案例公式化；自带演化生命周期、证据链（based_on）、零读取成本。004 决策 6 已确认此路径（"自建 opinions 表降级为兜底"），本决策关闭兜底，不再自建。

**代价**：mental model API 预 1.0，变更影响局限在适配器层（HindsightMemoryAdapter 内部）；依赖 004 Live PoC 已定位的 structured_output provider 限制（DeepSeek 下空内容）——但 mental model 的 content 是 markdown 文本（非 structured），不受该限制；structured 补充走 `reflect_response`。

**注意**：`MemoryContext.opinions` 删除后，若后续 phase 需要把 mental model 内容并入 LLM 上下文，由适配器/应用层把 mental model 渲染进 `{{memory_context}}` 文本（与 recall 结果并列），不重新引入第四字段。

### 决策 3：数值 confidence 不持久化，证据强度用客观信号表达

**结论**：任何 HeartRule 存储层不保留 `confidence: number` 字段。原使用场景改信号源：

| 原场景（confidence 用途）                        | 改后信号                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ai_think 变量填充："信心 ≥ 0.7 才填，否则问用户" | 规则化：变量首次出现必问用户；后续填充依据 = recall 命中的 observation 是否新鲜（非 stale）+ proofCount 充足 + 无矛盾观察 |
| 矛盾检测的"判断强度"                             | observation 的 refine 方向历史（strengthened/weakened）                                                                   |
| 退出决策 / 话题调整的依据                        | mental model 的 is_stale + content 综合                                                                                   |

**理由**：LLM 自评数值信心无标定、不可靠（上游 drop 列的实证）。咨询实践里咨询师用语言表达确信度（"我怀疑…""似乎…"），不用数字；引擎决策用可验证的客观信号（证据条数、新鲜度、刷新状态）更稳。

**代价**：变量桥接（ai_think）的"信 vs 问"从简单阈值判断变为规则 + 多信号综合，需在变量桥接文档与 spec 中重新设计（Phase 2/4 范畴）。

## 后果

- **正面**：领域模型与上游 v0.9.x 语义对齐，不再背着已删除的 opinion 概念；删除恒空字段与假数据分支（004 遗留的 `opinions: []`）；案例公式化用 mental model 获得演化生命周期与零成本读取；数值 confidence 这条死路关闭。
- **成本**：端口契约变更需同步 4 个代码文件 + FakeMemoryRepository 与相关测试；5+ 份文档（memory-framework、ai-ask-memory-recall、memory-retrieval-types、consciousness-system、variable-memory-bridge、strategic-design UL、architecture-constraints D2、CLAUDE.md）需同步修订；LLM 提示词中"## 判断与推论"渲染段删除。
- **风险**：mental model API 预 1.0 仍可能变（适配层隔离，风险可控）；ai_think 变量填充的"信 vs 问"规则需要重设计验证；上游 observation 的 consolidate 需要开启（`enableObservations`）且用银行级 strategy 校准提取维度。
- **遗留跟进**：变量桥接的填充规则重新设计（Phase 2）；mental model 配置 + raw HTTP response_schema 的落地（Phase 4 PoC 路径 A）；`memory-retrieval-types.md` 九轴模型类型 Ⅳ 的 Opinion/DeepInsight 表述修订。

## 关联

- `memory-framework.md` §4.2/§5.2.1/§7 — 本决策的直接修订对象
- `decisions/004-memory-model-calibration.md` 决策 1/6 — 本决策修正其"自建表兜底"遗留，史实补正
- `memory-repository.port.ts` / `hindsight-adapter.ts` / `base-action.ts` / `session-orchestrator.ts` — 端口与适配器同步修订
- `memory-retrieval-types.md`、`ai-ask-memory-recall.md`、`consciousness-system.md`、`variable-memory-bridge.md`、`strategic-design.md`、`architecture-constraints.md`、`CLAUDE.md` — 关联文档同步
