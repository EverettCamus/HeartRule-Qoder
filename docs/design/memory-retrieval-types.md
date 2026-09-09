---
status: decision-recorded
last_updated: 2026-09-08
---

# 记忆调取机制

> **关联**:
>
> - 上游: [记忆框架设计](memory-framework.md) — 五类记忆的定义与存储
> - 关联: [ai_ask 记忆调用](ai-ask-memory-recall.md) — 快/慢双通道检索机制
> - 关联: [意识系统设计](consciousness-system.md) — 慢通道的触发来源
>
> **版本**: v0.4.0 (封板修订)
> **创建**: 2026-07-23 · **更新**: 2026-09-08
>
> **校准**: 2026-09-08 按 [005 去除 Opinions 概念](decisions/005-drop-opinions-domain-concept.md) 修订——client_memory 不再含自建 opinions；判断类内容由 observation（原子信念，带 source_fact_ids）与 mental model（常驻判断，based_on 证据链）承载，溯源/附着表述相应更新
>
> **封板**: 2026-09-08 按 [006 检索层范围收敛](decisions/006-retrieval-layer-scope.md) 封板——本文定位为检索机制的**坐标系（描述语言）**而非强制契约；轴取值按第一个实现实例（ai_ask 快通道）标注校验状态（§5.1）

## 1. 设计思路

从跨领域咨询中归纳出七种记忆调取场景（§3），但**系统不能按场景分类来建**——场景是需求侧语言，实现需要找出背后独立变化的机制维度。

经过对七种类型的拆解和四个咨询领域的边界案例压力测试，提取出**九个独立变化的能力轴**（§2）。七种场景是九轴上的特定取值组合（§3），三层认知深度是各层的典型轴值偏好（§4）。

**定位：坐标系，不是契约。** 九轴是描述语言——任何一次记忆调取都能用轴取值组合无歧义地描述，脚本 DSL 与 SDK 参数之间的映射经轴层解耦（§5）。但轴不强制每个实现声明全部取值：未经验证的取值是**预留**，第一个实现实例（ai_ask 快通道，见 [ai_ask 记忆调用](ai-ask-memory-recall.md)）只校验它实际用到的子集（§5.1）。抽象从消费者向上生长，不由坐标系向下规定。

```
需求侧（咨询师视角）              实现侧（系统视角）
────────────────────             ─────────────────
"用户提到母亲，我想起他之前        触发时机: on_user_input
 说过的相关事情"          →       查询构造: raw_concat
                                  检索目标: semantic
                                  记忆空间: client_memory
                                  后处理:   passthrough
                                  组合模式: single
                                  → 注入 fastHits，保留 5 轮
```

---

## 2. 九轴机制模型

每个记忆调取操作由九个轴的取值组合定义。轴取值是**描述语言**：脚本作者不直接操作轴（§5），各轴的校验状态（已校验/预留）见 §5.1。

### 2.1 轴 1：触发时机 — 什么时候调

| 取值                   | 说明                               | 携带上下文                  |
| ---------------------- | ---------------------------------- | --------------------------- |
| `on_user_input`        | 每轮用户发言后自动触发             | 用户原话 + 当前 action 位置 |
| `on_session_start`     | 会话启动时触发一次                 | sessionId + userId          |
| `on_session_end`       | 会话结束时触发                     | sessionId + 完整对话摘要    |
| `on_script_node`       | 脚本中 ai_think 声明触发           | perspectives + 当前位置     |
| `on_schedule`          | 时间/日历条件（cron）              | 触发时间戳                  |
| `on_behavioral_signal` | 行为事件（哭、沉默、语气变化）     | 行为标签 + 上下文           |
| `on_external_event`    | 外部条件变化（政策变更、数据更新） | 事件类型 + 关联实体         |

`on_behavioral_signal` 和 `on_user_input` 是**并行触发**而非互斥——用户说话的同时可能眼眶红了，两条触发各自产生检索，结果合并注入同一轮 prompt。行为信号的检测由意识层或行为检测模块负责，检索系统只消费触发。

### 2.2 轴 2：查询构造 — 用什么语言查

| 取值                | 说明                                       | LLM |
| ------------------- | ------------------------------------------ | --- |
| `raw_concat`        | 用户原话截断(≤200字) + 当前收集变量名拼接  | 0   |
| `conceptualized`    | 小模型将当前语境转为 2-3 个抽象查询方向    | 1   |
| `predefined`        | 脚本预定义的查询模板（含 `{{变量}}` 替换） | 0   |
| `metadata_filtered` | 按来源类型/时间范围/置信度标签过滤         | 0   |
| `exact_lookup`      | 精确标识符匹配（文档 ID、人名、日期）      | 0   |

`raw_concat` 是最高频方式。其局限是语义向量跨不过"情绪陈述"和"事件叙述"的鸿沟，变量名锚点部分弥补。

### 2.3 轴 3：检索目标 — 在同一记忆空间内怎么查

| 取值             | 说明                                     | v0.9.1 落地状态                                                                                                                                                                               |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `semantic`       | 语义向量相似度检索（标准阈值）           | ✅ 内置                                                                                                                                                                                       |
| `semantic_loose` | 降低阈值扩大召回，接受更多噪音           | ✅ 内置（阈值/预算可调）                                                                                                                                                                      |
| `graph_1hop`     | 图谱实体边 1-2 跳邻近探索                | ⚠️ 部分支持：`enableGraphRetrieval` 提供 recall 侧图谱遍历臂，但 1 跳/多跳深度未在类型层区分（决策 5）                                                                                        |
| `graph_multihop` | 图谱多跳深度遍历（跨实体、因果、时间边） | ⚠️ 部分支持：同上；是否用 SDK 还是自建图谱，Phase 4 验证后决定（决策 5）                                                                                                                      |
| `temporal`       | 带时间范围过滤的检索（τ_start/τ_end）    | ⚠️ 部分支持：原"降级"结论过时——v0.9.1 `enableTemporalRetrieval` + `queryTimestamp` 提供日期感知查询侧检索 + recency 评分；`occurred_start/occurred_end/mentioned_at` 仍为结果元数据（决策 3） |
| `exact`          | 精确匹配（元数据索引、键值查找）         | ✅ 内置（tags/tagGroups/metadata 过滤）                                                                                                                                                       |

### 2.4 轴 4：记忆空间 — 去哪个库查

检索目标定义"怎么查"，记忆空间定义"查哪个库"。两者独立——`graph_multihop` 可以遍历用户记忆图谱，也可以遍历知识库概念图谱。

| 取值                      | 存储实现                                                                                                                         | 隔离粒度 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `client_memory`           | Hindsight 三 fact type (world/experience/observation)，observation 为自动 consolidate 的信念（ADR 005）；常驻判断走 mental model | 每用户   |
| `cross_client_experience` | 咨询师跨客户经验库（独立 pgvector）                                                                                              | 每咨询师 |
| `domain_knowledge`        | 领域知识库（pgvector + 元数据索引）                                                                                              | 全局共享 |
| `structured_variables`    | VariableStore + 咨询方案 (treatment_plans 表)                                                                                    | 每用户   |

`client_memory` 内部通过 origin 标签区分信息来源：

- `source: dialogue` — 从对话中提取的事实和经历片段
- `source: clinical_note` — 临床文档汇入的结构化认知（观察、评估、量表趋势）

默认 recall 不区分 origin，融合返回。需要区分时通过轴 2 的 `metadata_filtered` 按 origin 过滤或加权——Layer 2-3 对 `clinical_note` 加权以获取结构化认知。

**跨客户经验**区别于 `domain_knowledge`：领域知识是静态的流派/法规/营养学概念（专家编写）；跨客户经验是咨询师本人历史案例的经验归纳（系统积累）。

### 2.5 轴 5：后处理 — 查到之后做什么

| 取值          | 说明                                                                                    | LLM |
| ------------- | --------------------------------------------------------------------------------------- | --- |
| `passthrough` | 透传                                                                                    | 0   |
| `dedup`       | 按相似度 >80% 去重                                                                      | 0   |
| `synthesize`  | LLM 综合多条结果，产出 DeepInsight 卡片                                                 | 1-2 |
| `verify`      | 时效性门控——判断历史结果在当下是否仍然有效                                              | 0-1 |
| `trace`       | 证据反向追溯——从 mental model（based_on）/ observation（source_fact_ids）找到支撑证据链 | 0-1 |

### 2.6 轴 6：注入位置 — 放到上下文的哪个槽位

| 取值               | prompt 渲染                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `baseline`         | `## 关于来访者`（会话级常驻）                                                                       |
| `fast_hits`        | `## 本轮相关记忆`（滚动窗口）                                                                       |
| `deep_insights`    | `## 深度洞察`（持久洞察）                                                                           |
| `alert_queue`      | `## 本次会话特别关注`（跨会话提醒）                                                                 |
| `source_fragments` | 不独立渲染，附着于 observation（证据引文）/ mental model（based_on）/ DeepInsight，生命周期跟随载体 |

### 2.7 轴 7：生命周期 — 结果留多久

| 取值                | 说明                                                |
| ------------------- | --------------------------------------------------- |
| `rolling_5`         | 最近 5 轮滚动淘汰（ai_ask action 内轮次）           |
| `session`           | 整个会话，下次会话重新加载                          |
| `persistent_gated`  | 持久保留 + 时效门控（`relevanceCheck`），上限 10 条 |
| `independent_queue` | 独立提醒队列，确认后标记而非删除                    |

### 2.8 轴 8：组合模式 — 多路检索怎么编排

| 取值                     | 说明                                                                    |
| ------------------------ | ----------------------------------------------------------------------- |
| `single`                 | 一次触发 → 单次检索                                                     |
| `parallel_homogeneous`   | 同一空间同类检索的多路并行（如 3 路 conceptualized → semantic → merge） |
| `parallel_heterogeneous` | 不同空间/目标的异质并行（如同时查知识库 + 变量 + 对话记忆）             |
| `sequential`             | 检索 1 → 用结果构造检索 2（如先发现时间模式，再关联生活事件）           |

当一次操作同时涉及"同一空间多查询"和"不同空间多查询"时，后者决定整体模式——只要跨了不同空间或不同检索目标类型，就属于 `parallel_heterogeneous`。

### 2.9 轴 9：时间约束 — 检索可以花多长时间

决定检索是阻塞主流程还是异步运行，直接影响用户体验和系统负载。

| 取值             | 延迟上限   | 阻塞行为                           | 适用场景                           |
| ---------------- | ---------- | ---------------------------------- | ---------------------------------- |
| `strict_200ms`   | ≤200ms     | 阻塞用户，超时返回空，不阻塞主流程 | 快通道：Layer 1 联想、会话启动加载 |
| `moderate_500ms` | ≤500ms     | 异步追加，下一轮 prompt 注入       | Layer 2 关联洞察                   |
| `relaxed_30s`    | 5-30s      | fire-and-forget，不阻塞            | 慢通道：深度分析、综合洞察         |
| `batch`          | 无硬性约束 | 批量/后台运行                      | 会话后分析、提醒队列               |

### 2.10 轴间约束

系统在配置校验时拒绝无意义的组合：

| 约束                                                          | 原因                           |
| ------------------------------------------------------------- | ------------------------------ |
| `graph_1hop` / `graph_multihop` 不支持 `structured_variables` | 结构化变量没有图谱             |
| `temporal` 不支持 `domain_knowledge`                          | 领域知识是静态参考，无时间维度 |
| `rolling_5` 不适用于 `on_session_start`                       | 会话启动时没有历史轮次         |

### 2.11 可选检索增强：类似/关联事件视角（待实证）

除脚本声明的检索外，引擎设计了一个轻量增强——"类似事件 / 关联事件"视角的动态扩展。**默认关闭**（ADR 006 决策 2）：先验证不加的情况，命中率对比证据通过后才升级为默认行为。

**设计依据**：

- 检索视角（查类似事件、查关联事件）是咨询师的普适经验，但**不配置在脚本中**——让每个咨询动作声明检索视角是工程化（P2）
- **不交给意识层**——时序错配：主线即时理解需要 ≤200ms，意识层是异步 5-30s
- 若开启，是轴 8 `parallel_homogeneous` 的候选实例

**流程**：

```
每次 recall:
  1. 轻量判断: 当前查询是否"事件性描述"（有主体 + 动作 + 情境）?
       ├─ 否 → 单路原始查询（现状行为不变）
       └─ 是 → 触发视角扩展:
  2. 扩展查询 A (类似事件): 将原话抽象为事件概念后检索
     "上周我和老板大吵了一架" → 抽象 → "人际冲突 爆发性争执 职场关系紧张"
  3. 扩展查询 B (关联事件): 以原话中的时间点为窗口，检索同期生活变化
     "上周" → 时间窗口过滤 + "生活变化 压力事件 同期信号"
  4. 合并三路结果 → 注入 prompt
```

**关键点**：

- 扩展查询的构造（抽象事件概念、确定时间窗口）由**引擎动态完成**，不要求脚本作者提供任何检索词
- 抽象走规则，**零 LLM**（ADR 004：快通道走规则，LLM 升级移到慢通道）——若规则抽象命中率不理想，升级路径是慢通道（意识触发，见 [意识系统设计](consciousness-system.md)），不在快通道内加 LLM
- 判断"是否事件性描述"是零成本的启发式规则

**降级策略**（启用时，受轴 9 `strict_200ms` 预算约束）：

```
超出预算时按顺序降级:
  1. 先砍关联事件查询
  2. 仍超 → 砍类似事件查询
  3. 仍超 → 只留原始查询（现状行为）
```

**动态觉察的补充路径**：引擎默认增强覆盖的是普适方向。对"这个时刻值得深挖"的判断，由意识层承担（已有慢通道机制，见 [意识系统设计](consciousness-system.md)）——引擎增强负责"主线即时理解"，意识层负责"支线深度分析"，两者互补。

---

## 3. 七种调取类型（作为九轴的常见组合）

七种类型是从跨领域咨询中归纳出的**需求侧分类**——回答"咨询师为什么调取记忆"。每种类型在系统中是九轴上的预置组合，帮助脚本作者快速选择。

### 3.1 类型概览

| 类型             | 核心问题                                       | 典型场景                                                                |
| ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| **Ⅰ 联想关联**   | "这人/类似情境之前说过什么？"                  | 用户说"我觉得自己永远不够好"→ 联想第2次会谈中"母亲高标准教养"片段       |
| **Ⅱ快 变化验证** | "和之前说的/测的一致吗？"（即时对比）          | 用户说"这周睡得好多了"→ 对比第3次"失眠源于项目压力"                     |
| **Ⅱ慢 变化验证** | "和之前比变了吗？是进展还是矛盾？"（深度分析） | 意识层触发 → 对比多次会谈中的睡眠模式 + PHQ-9 趋势 → DeepInsight        |
| **Ⅲ 综合洞察**   | "这些碎片拼起来是什么模式？"                   | 跨域搜索"完美主义+母亲期望+自我评价"→ 发现因果链 → DeepInsight          |
| **Ⅳ 溯源追溯**   | "这个结论从哪来的？可信度如何？"               | 反查"违约事实认定的证据基础"→ 邮件记录 + 合同条款 + 对方自认            |
| **Ⅴ 持续背景**   | "我需要一直带着什么前提？"                     | 会话启动加载：诊断、用药、关键生活事件、风险因素 → 整个会话作为理解背景 |
| **Ⅵ 关系过程**   | "我和他之间的互动在怎么演变？"                 | 回顾互动历史：第3次起客户从"你说得对"变成"我有不同想法"，联盟在深化     |
| **Ⅶ 前瞻触发**   | "时间到了——有什么模式需要关注？"               | 春节前2周 → 调度器触发 → 该客户往年春节体重反弹模式 → 推送提醒          |

### 3.2 九轴组合一览

```
Ⅰ 联想关联:
  on_user_input × raw_concat × semantic × client_memory
  × passthrough × fast_hits × rolling_5 × single × strict_200ms

Ⅱ快 变化验证:
  同 Ⅰ（机制完全相同，Hindsight 返回的记忆自带时间标注，LLM 自然能做对比）

Ⅱ慢 变化验证:
  on_script_node × conceptualized × {semantic, temporal} × {client_memory, structured_variables}
  × {synthesize, verify} × deep_insights × persistent_gated × parallel_heterogeneous × relaxed_30s

Ⅲ 综合洞察:
  on_script_node × conceptualized × {semantic, graph_multihop, temporal} × {client_memory, domain_knowledge}
  × {dedup, synthesize, verify} × deep_insights × persistent_gated × parallel_heterogeneous × relaxed_30s

Ⅳ 溯源追溯:
  on_script_node × {exact_lookup, metadata_filtered} × {exact, graph_1hop} × {client_memory, structured_variables}
  × trace × source_fragments × (跟随载体) × single × moderate_500ms

Ⅴ 持续背景:
  on_session_start × predefined × semantic × {client_memory, structured_variables}
  × passthrough × baseline × session × single × strict_200ms

Ⅵ 关系过程:
  [链路1] on_session_start × predefined × semantic × client_memory
          × passthrough × baseline × session × single × strict_200ms
  [链路2] on_script_node × metadata_filtered × semantic × client_memory
          × synthesize × fast_hits × rolling_5 × single × moderate_500ms

Ⅶ 前瞻触发:
  on_schedule × metadata_filtered × {semantic, temporal} × {client_memory, structured_variables}
  × passthrough × alert_queue × independent_queue × single × batch
```

类型 Ⅵ 是唯一需要两条独立链路协同的类型——基线加载和当前信号评估走不同的轴组合。

类型 Ⅳ 的 `source_fragments` 不独立渲染，生命周期由所附着的载体决定——observation（证据引文）、mental model（based_on）或 DeepInsight；注入位置标注 `source_fragments` 的同时，生命周期即由载体接管。

**取值落地状态**（v0.9.1 校准，见 `decisions/004`）：`semantic_loose`、`on_behavioral_signal`、`on_external_event`、`cross_client_experience` 仍为"压力测试引入、尚未形成独立类型预设"的取值——脚本可通过直接声明轴取值使用。其中：

- `graph_1hop` / `graph_multihop` / `temporal`：v0.9.1 已**部分落地**（`enableGraphRetrieval` / `enableTemporalRetrieval` + `queryTimestamp`，见 §2.3 轴 3），不再算空头支票。
- `cross_client_experience`：仍是**空头支票**——需自建咨询师跨客户经验库（独立 pgvector），尚无实现，标注为 Phase 3+ 候选。

**校验状态**（第一个实现实例 ai_ask 快通道，ADR 006）：类型 Ⅰ（联想关联）与 Ⅱ快（同 Ⅰ 机制）已由 ai_ask 快通道校验；类型 Ⅴ（持续背景）已有会话启动加载的基础实现。其余类型为**预留组合**，待对应消费者（意识层慢通道、ai_think、Phase 4 矛盾检测）实现时验证。

---

## 4. 三层认知深度

九轴定义了"能做什么"，三层模型定义了**每层的典型轴值偏好**——来自对人类咨询师认知过程的观察：

- **Layer 1（即时上下文）**：用户一句话 → 自动浮现相关的人和事
- **Layer 2（快速关联洞察）**：用户讲完一段经历 → 判断是补充同一件事还是关联另一件事
- **Layer 3（深度因果分析）**：纵观整体 → 脚本安排的 ai_think 做因果分析和脉络梳理

```
即时 ←────────────────────────────────────────────────────→ 主动

Layer 1                    Layer 2                    Layer 3
────────────────────────────────────────────────────────────────
轴1: on_user_input         轴1: on_user_input         轴1: on_script_node
                                                      on_session_end
轴2: raw_concat            轴2: raw_concat            轴2: conceptualized
                             + metadata_filtered       predefined
轴3: semantic              轴3: semantic              轴3: graph_multihop
     semantic_loose             graph_1hop                  temporal
轴4: client_memory         轴4: client_memory          轴4: client_memory
                                  (+ clinical_note filter)    domain_knowledge
                                  cross_client_              (+ clinical_note filter)
                                    experience
轴5: passthrough           轴5: passthrough            轴5: synthesize
                                                       verify
轴6: fast_hits             轴6: fast_hits              轴6: deep_insights
轴7: rolling_5             轴7: rolling_5              轴7: persistent_gated
轴8: single                轴8: single                 轴8: parallel_heterogeneous
                                                       sequential
轴9: strict_200ms          轴9: moderate_500ms        轴9: relaxed_30s
                                                      batch
```

Layer 1 和 Layer 2 的分层调用策略：用户输入后，Layer 1 立即返回（≤200ms）保证对话连贯性；Layer 2 异步追加（≤500ms），在**下一轮** prompt 注入——关联洞察的价值在 AI 生成回应时体现，不需在用户话音刚落时到位。

### 4.1 Layer 3 与 ai_think

Layer 3 的载体是 `ai_think` action。脚本不直接操作轴取值，而是声明**分析视角**（perspectives），引擎映射为轴参数：

```yaml
# 会话中深度分析
- type: ai_think
  config:
    purpose: memory_analysis
    perspectives:
      - '梳理用户-母亲关系的因果链：教养方式→自我认知→当前困扰'
      - '对比第2次和第8次会谈对母亲描述的情感基调变化'
    memory_spaces: [client_memory, domain_knowledge]
    use_clinical_notes: true
# 映射为:
#   on_script_node × conceptualized × {semantic, graph_multihop, temporal}
#   × {client_memory, domain_knowledge} (+ clinical_note filter on client_memory)
#   × {dedup, synthesize, verify} × deep_insights × persistent_gated
#   × parallel_heterogeneous × relaxed_30s
```

```yaml
# 会话后分析
- type: ai_think
  trigger: on_session_end
  config:
    purpose: post_session_analysis
    perspectives:
      - '综合本次会谈内容，评估治疗目标进展'
      - '识别新浮现的临床模式，生成会谈笔记草案'
    memory_spaces: [client_memory, structured_variables]
    use_clinical_notes: true
```

会话中 ai_think 的产出注入后续轮次（`deep_insights`）；会话后 ai_think 的产出写入临床文档、咨询方案，并 retain 回 Hindsight。

---

## 5. 关键设计决定

**九轴是坐标系，不是契约（ADR 006 决策 1）。** 轴层解耦"需求侧场景语言"与"实现侧 SDK 参数"，任何调取操作可无歧义描述；但未经验证的取值是预留，不强制任何实现声明全部轴。校验状态见 §5.1。

**脚本作者不直接操作轴。** YAML 中通过声明式配置（perspectives + memory_spaces + purpose）表达意图，引擎负责映射为轴参数。轴的细节属于系统实现层，不暴露在脚本 DSL 中。这保持了"人类咨询师通过 YAML 间接控制"的设计原则。

**检索视角不进入 DSL。** "类似事件 / 关联事件 / 结构关联"是咨询师的普适检索经验，但不在脚本动作上声明——每个咨询动作配置检索视角是工程化负担（P2）。职责划分：

| 检索视角来源                     | 归属                       | 理由                                                   |
| -------------------------------- | -------------------------- | ------------------------------------------------------ |
| 普适方向（类似/关联事件）        | 可选检索增强（§2.11）      | 待实证（ADR 006 决策 2）：默认关闭，命中率证据驱动升级 |
| 动态觉察（"这个时刻值得深挖"）   | 意识层（已有慢通道）       | 本来就是意识层职责，异步不阻塞主线                     |
| 极少"必须查"场景（如证据链核查） | 脚本显式声明（语法待定义） | 确定性要求不交给概率判断；仅在少数关键 action 上出现   |

### 5.1 轴校验状态（第一个实现实例：ai_ask 快通道）

| 轴         | 快通道已校验取值                     | 预留取值（待对应消费者验证）                                                                               |
| ---------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 1 触发时机 | `on_user_input` / `on_session_start` | `on_script_node`（ai_think）、`on_session_end`、`on_schedule`、`on_behavioral_signal`、`on_external_event` |
| 2 查询构造 | `raw_concat` / `predefined`          | `conceptualized`（慢通道）、`metadata_filtered`、`exact_lookup`                                            |
| 3 检索目标 | `semantic`                           | `semantic_loose`、`graph_1hop` / `graph_multihop` / `temporal`（Phase 4）                                  |
| 4 记忆空间 | `client_memory`                      | `cross_client_experience`（Phase 3+）、`domain_knowledge`、`structured_variables`                          |
| 5 后处理   | `passthrough`                        | `dedup` / `synthesize` / `verify`（慢通道）、`trace`（Phase 4）                                            |
| 6 注入位置 | `baseline` / `fast_hits`             | `deep_insights`（慢通道）、`alert_queue`、`source_fragments`                                               |
| 7 生命周期 | `session` / `rolling_5`              | `persistent_gated`（慢通道）、`independent_queue`                                                          |
| 8 组合模式 | `single`                             | `parallel_homogeneous`（三路待实证，§2.11）、`parallel_heterogeneous` / `sequential`（慢通道）             |
| 9 时间约束 | `strict_200ms`                       | `moderate_500ms`、`relaxed_30s`（慢通道）、`batch`                                                         |
