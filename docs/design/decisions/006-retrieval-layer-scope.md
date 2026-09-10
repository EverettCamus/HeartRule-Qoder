# 006 — 检索层范围收敛：九轴坐标系不预设契约，慢通道移居意识系统

## 背景

检索层两份文档（memory-retrieval-types.md 的九轴模型、ai-ask-memory-recall.md 的快/慢双通道）在 2026-09-08 设计讨论中暴露三类问题：

1. **抽象自上而下规定实现**：九轴最初以「检索抽象设计」姿态呈现，但当前唯一实现中的检索消费只有快通道一处（ai_ask）。以契约姿态提前固定九个维度及其取值，违背「抽象从消费者向上生长」的方向——未消费的维度是未验证的复杂度。
2. **文档间职责纠缠**：ai-ask-memory-recall.md 同时承载 ai_ask 侧快通道实现设计、意识系统侧慢通道机制细节（两阶段检索、DeepInsight 卡片、硬限制、时效门控、场景示例）、以及属 exit-decision 关切的 `require` 收集紧迫度。慢通道的消费端是意识系统（`insightForSlowThinking`），机制细节却写在 ai_ask 文档——与意识系统文档内容重复、版本漂移。
3. **与已封板决策矛盾**：快通道「命中率不足时升级为极短 LLM 摘要」违反 004（快通道走规则，LLM 升级移到慢通道）；DeepInsight 的 `confidence` 数值字段违反 005 决策 3（LLM 自评数值信心不持久化）。

## 决策

### 决策 1：九轴是坐标系，不是契约

**结论**：`memory-retrieval-types.md` 的九个维度（触发、查询构造、检索目标、记忆空间、后处理、注入位置、生命周期、组合模式、时间预算）定位为**描述语言**：用于比较不同检索方案、校验新方案是否想全参数。不规定任何检索方案必须实现哪些取值；抽象从消费者向上生长，不由坐标系向下规定。

**理由**：五类潜在检索消费场景（ai_ask 快通道、会话启动、意识 recall、慢通道、变量桥接）确实需要一个共享词汇表避免各自发明参数语义；但词汇表的正确用途是「描述与校验」，不是「预设复杂度」。快通道是当前唯一实现的实例。

### 决策 2：三路查询降级为可选增强（待实证，默认关闭）

**结论**：快通道每轮 recall 的**单路查询**（用户原话截断 + 变量名锚点）为默认行为。「类似事件 / 关联事件」三路扩展在 `memory-retrieval-types.md` §2.11 标记为待实证，默认关闭——先验证不加的情况，命中率对比证据通过后才升级为默认行为。启用时超出 ≤200ms 预算按序降级（先砍关联事件 → 再砍类似事件 → 只留原始查询）。

**理由**：三路扩展的预期收益（跨语义鸿沟命中类似/关联事件）未经验证；默认开启等于把未验证的复杂度压给首版实现。验证路径与渐进 rulification 一致：先绿（不加）→ 测量 → 有证据再加。

### 决策 3：快通道保持 0 LLM（继承 004）

**结论**：快通道查询构造全程走规则，零 LLM。删除原文档「升级为极短 LLM 摘要」的路径；若规则构造命中率不理想，升级路径是**慢通道**（意识触发），不在快通道内加 LLM。

**理由**：004 已决策「走规则，LLM 升级移到慢通道」——原文档的 LLM 摘要路径是漏网的矛盾残留，予以清除。≤200ms 预算也不容纳任何 LLM 调用。

### 决策 4：慢通道机制移居意识系统文档，ai_ask 只保留契约

**结论**：慢通道机制细节（两阶段深度检索、硬限制表、DeepInsight 卡片、时效性门控、场景 C/D 示例）迁至 `consciousness-system.md` §2.6——`insightForSlowThinking` 的消费端，单一出处。`ai-ask-memory-recall.md` §4 只保留 ai_ask 侧硬约束：fire-and-forget、产出入 `session.metadata.deepInsights`、注入前时效门控、慢通道只有建议权。触发契约确认为 **string**（`insightForSlowThinking: string | null`），不做结构化触发对象；DeepInsight 卡片**无 `confidence` 字段**（继承 005 决策 3），以 `relevanceCheck` 字符串门控代替。

**理由**：慢通道由意识层触发、由意识层消费——机制细节的住所应是意识系统文档；ai_ask 只需知道「何时被通知、结果怎么到达 prompt」。单一出处消除重复与漂移。

### 决策 5：检索文档清除 opinions 残留（继承 005）

**结论**：检索文档中所有 opinion 类记忆引用改写为 observation（带证据引文）+ mental model（会话启动读入 baseline，不逐轮 recall）。慢通道 recall 策略表四种类型为 experience / observation / mental model / world。

**理由**：005 已删除 opinions 领域概念；检索文档中的 opinion 侧重行是修订遗漏，按 005 语义修正（用户信念沉淀在 observation，常驻工作假设由 mental model 承载）。

### 决策 6：`require` 收集紧迫度移出检索层文档，挂 backlog

**结论**：`ai-ask-memory-recall.md` 的 `require` 章节（收集紧迫度）整节删除；作为 backlog 探索故事挂账，待 exit-decision 上下文重新评估是否需重新设计。

**理由**：`require` 属 exit-decision 关切（决定「收集到什么程度可以退出」），不是检索关切；且 ai_ask output schema 中无此字段，缺乏落地依据。移出避免检索层文档背着无主的契约。

## 后果

- **正面**：检索层文档瘦身——九轴回到工具位置，快通道是唯一已实现实例，慢通道单一出处（意识系统）；与 004/005 的矛盾全部清除；两份检索文档封板后停止积累。
- **成本**：三路查询、require 等增强暂缓——快通道命中率若不足，需走慢通道或实证路径补偿；意识系统文档新增 §2.6（v0.2.0，仍为 active 草案，机制实现待 backlog 排期）。
- **遗留跟进**：backlog 新增 4 条 [intelligence] 故事（快通道实现 / 三路查询实证 / 慢通道实现 / require 核实落地）；智能设计议题表「记忆快/慢双通道与 LLM 预算配合」已收敛移除。

## 关联

- [memory-retrieval-types.md](../memory/memory-retrieval-types.md) — 封板对象，坐标系定位（决策 1/2）
- [ai-ask-memory-recall.md](../memory/ai-ask-memory-recall.md) — 封板对象，快通道实现实例 + ai_ask 侧契约（决策 2/3/4/6）
- [consciousness-system.md](../consciousness/consciousness-system.md) — §2.6 慢通道机制新住所（决策 4）
- `decisions/004-memory-model-calibration.md` — 决策 3 继承「快通道走规则，LLM 升级移到慢通道」
- `decisions/005-drop-opinions-domain-concept.md` — 决策 5 继承 opinions 移除与 confidence 删除
- backlog：[intelligence] 故事 × 4（见后果）
