# 设计文档状态索引

> 地图层的一页视图。状态语义见 [开发节奏系统](../process/development-rhythm.md) §6。
> 目录按**域**分组（2026-09-10 起）：`foundation/` 基础层 · `memory/` 记忆线 · `topic/` 话题/议程线 · `consciousness/` 意识线；`decisions/` 为 ADR 注册表（跨域扁平，不按域拆）。
> 每篇文档的**层**归属见下表（域与层正交，层为治理分类、域为目录归置）；`docs/ddd/` 独立存放战略设计。过程/节奏类文档（开发节奏系统、skills 使用说明）已迁至 [`docs/process/`](../process/README.md)（2026-09-07）。
> `本体` 层 = 引擎侧知识模型（任务/领域/推理三层），与 `地图 · 领域建模`（平台侧 UL）分别维护。
> `横切约束` 层 = 架构红线清单（§7 第 5 步合规自查的检查依据）。
> 修订规则：`decision-recorded` 文档仅在实现或新证据与之矛盾时才打开修订。

## 基础层（foundation/）

| 文档                                                                             | 层              | 状态              | 已记录决策                                                                     |
| -------------------------------------------------------------------------------- | --------------- | ----------------- | ------------------------------------------------------------------------------ |
| [heartrule-design-philosophy-v2](foundation/heartrule-design-philosophy-v2.md)   | 基础哲学        | active            | —                                                                              |
| [ubiquitous-language](foundation/ubiquitous-language.md)                         | 地图 · 领域建模 | decision-recorded | —                                                                              |
| [ontology](foundation/ontology.md)                                               | 本体            | draft             | —                                                                              |
| [script-engine-design-principles](foundation/script-engine-design-principles.md) | 引擎机制        | decision-recorded | —                                                                              |
| [architecture-constraints](foundation/architecture-constraints.md)               | 横切约束        | draft             | [007 变量职责收缩](decisions/007-variable-document-boundary.md)（B3 红线修订） |

## 记忆线（memory/）

| 文档                                                       | 层       | 状态              | 已记录决策                                                                                                                                                                                                        |
| ---------------------------------------------------------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [memory-framework](memory/memory-framework.md)             | 引擎机制 | decision-recorded | [004 记忆数据模型校准](decisions/004-memory-model-calibration.md) · [005 移除 opinions 领域概念](decisions/005-drop-opinions-domain-concept.md) · [007 变量职责收缩](decisions/007-variable-document-boundary.md) |
| [memory-retrieval-types](memory/memory-retrieval-types.md) | 引擎机制 | decision-recorded | [006 检索层范围收敛](decisions/006-retrieval-layer-scope.md)                                                                                                                                                      |
| [ai-ask-memory-recall](memory/ai-ask-memory-recall.md)     | 引擎机制 | decision-recorded | [006 检索层范围收敛](decisions/006-retrieval-layer-scope.md)                                                                                                                                                      |
| [variable-memory-bridge](memory/variable-memory-bridge.md) | 引擎机制 | decision-recorded | [007 变量职责收缩](decisions/007-variable-document-boundary.md)                                                                                                                                                   |

## 话题 / 议程线（topic/）

| 文档                                                              | 层              | 状态              | 已记录决策                                                                                                                                                                                  |
| ----------------------------------------------------------------- | --------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [topic-unit-modeling](topic/topic-unit-modeling.md)               | 地图 · 领域建模 | active            | —                                                                                                                                                                                           |
| [topic-queue-implementation](topic/topic-queue-implementation.md) | 引擎机制        | decision-recorded | [001 话题时间预估](decisions/001-topic-time-estimation.md) · [002 用途与深度](decisions/002-time-application-and-depth.md) · [003 实现机制](decisions/003-time-implementation-mechanism.md) |

## 意识线（consciousness/）

| 文档                                                          | 层       | 状态   | 已记录决策 |
| ------------------------------------------------------------- | -------- | ------ | ---------- |
| [consciousness-system](consciousness/consciousness-system.md) | 引擎机制 | active | —          |
