---
status: draft
last_updated: 2026-09-08
---

# 架构约束清单（红线）

> 本文档是 [开发节奏系统](../process/development-rhythm.md) §7 第 5 步 **DDD 合规自查报告的检查依据**。红线 = 不可违反的架构约束；每条注明出处（设计文档原文或 ADR），合规报告按 A–E 组编号逐条对照。
>
> **出身与维护**：渐进规则化（§10）——约束是失败的补丁，先让实现跑，反复出问题处才立红线；新红线通常随 ADR 流程落库时追加（`heartrule-design-docs` 技能第 4 步），**红线增删需人确认**，被证明多余的按 §10 删掉。
>
> **本清单由 AI 从现有文档汇总而成（无新决策）**，未经人逐条确认前保持 `draft`。机制参数（阈值、冷却时间等）不是红线，属各机制文档，不入本清单。

## A. 平台侧 DDD

- **A1 包依赖 DAG**：`shared-types`（叶）← `core-engine`（定义端口）← `api-server`（实现端口）；`script-editor` 为独立叶节点，仅依赖 shared-types。禁止反向依赖。出处：[strategic-design](../ddd/strategic-design.md) §5
- **A2 core-engine 零基础设施依赖**：无 HTTP/DB/Redis 代码，外部交互一律走端口（`ILLMProvider`、`TemplateProvider`、`MemoryRepository`）。出处：[strategic-design](../ddd/strategic-design.md) §1.3
- **A3 限界上下文五加一**：Consulting Session（Core，唯一聚合根 `Session`）/ Variable System / Conversational Memory / Prompt Engineering / Script Authoring（Supporting）+ LLM Integration（Generic）。出处：[strategic-design](../ddd/strategic-design.md) §1
- **A4 上下文关系固定**：Consulting Session 为上游定义三端口（Customer-Supplier）；Script Authoring → Consulting Session 为 Conformist；api-server → Hindsight 走 ACL（`HindsightMemoryAdapter` 隔离外部 API 变更）。出处：[strategic-design](../ddd/strategic-design.md) §2.1
- **A5 UL 单一出处**：代码概念（类/枚举/字段/端口）必须登记 [ubiquitous-language](ubiquitous-language.md)；本体概念变成代码符号时在 UL 登记一行、指向 [ontology](ontology.md)。出处：[development-rhythm](../process/development-rhythm.md) §8
- **A6 Session 状态机与 Position**：`RUNNING → WAITING_INPUT ↔ RUNNING → COMPLETED | ERROR`；Position 三索引（phase/topic/action）联动；Action 执行一次只前进一个，不可跳步。出处：[strategic-design](../ddd/strategic-design.md) §1.3
- **A7 分层纪律与纯函数核心**：Domain（无基础设施）→ Application（编排）→ Infrastructure（适配器）；core-engine 状态不可变（ExecutionState 进、ExecutionState 出），持久化只在 `SessionManager`（api-server）。出处：[strategic-design](../ddd/strategic-design.md) §3 · CLAUDE.md

## B. 引擎结构

- **B1 script-execution 是唯一编排器**：六引擎由 `ScriptExecutor` 调用，引擎之间无循环依赖。出处：CLAUDE.md
- **B2 模板两层解析**：Custom scheme 优先 → Default 兜底；变量替换两层：系统变量 `{%var%}` → 脚本变量 `{{var}}`。出处：[strategic-design](../ddd/strategic-design.md) §1.3 Prompt Engineering
- **B3 变量作用域四层**：读取优先级 topic > phase > session > global；写入位置由 `determineScope()` 决定，不可跨层写入。出处：[strategic-design](../ddd/strategic-design.md) §1.3 Variable System
- **B4 代码-vs-脚本边界**：所有咨询领域通用的能力进代码（core-engine/api-server）；领域特定内容进 YAML scripts + templates，不在 TypeScript 硬编码咨询逻辑。出处：CLAUDE.md 设计哲学原则 1
- **B5 智能实现仍守 DDD 结构纪律**：引擎机制的实现代码遵守限界上下文、端口、战术设计，照样进 spec。出处：[development-rhythm](../process/development-rhythm.md) §6

## C. 引擎机制不变量

- **C1 意识层是议程（话题队列）的唯一修改者**：六种队列操作意识层是唯一调用者（编译期通过 `IAgendaReader` / `IAgendaModifier` 接口隔离保证）。出处：[topic-queue-implementation](topic-queue-implementation.md) · [development-rhythm](../process/development-rhythm.md) §6 例证
- **C2 本体先行 · 任务锚**：引擎新概念必须先回答"哪个任务需要它"，写不出来就是造词，不进 [ontology](ontology.md)。出处：[development-rhythm](../process/development-rhythm.md) §8
- **C3 机制文档可追溯性**：每个机制文档开头必须有一句话引擎级业务需求（谁在什么场景得到什么价值）；写不出来不写。出处：[development-rhythm](../process/development-rhythm.md) §8
- **C4 案例验证单一出处**：验证对话片段由 AI 起草、人确认合理性后使用；智能点 story 验收时验证片段入库 `packages/core-engine/test/` 持续运行。出处：[development-rhythm](../process/development-rhythm.md) §8
- **C5 讨论不许顺手实现**：机制讨论收敛出的实现 story 一律进 backlog，由 sprint 排期。出处：[development-rhythm](../process/development-rhythm.md) §8
- **C6 推翻机制前先出静态+动态两份现状说明**，人验证正确后再动手改。出处：[development-rhythm](../process/development-rhythm.md) §8
- **C7 复用优先**：成熟机制（RAG、知识图谱等）先找现成的，不从零造。出处：[development-rhythm](../process/development-rhythm.md) §8

## D. 记忆系统

- **D1 记忆是端口不是引擎**：`MemoryRepository`（retain/recall/reflect），实现是 api-server 的 `HindsightMemoryAdapter`。出处：CLAUDE.md Memory System
- **D2 MemoryContext 三字段来源（近 1:1 映射）**：`worldFacts/experiences/observations` 来自 recall 的三类 fact type；领域模型不自建 opinions 存储、不持久化数值 confidence；mental model 的常驻公式化判断由适配器/应用层渲染进 `{{memory_context}}`，不引入 MemoryContext 第四字段。出处：[005 移除 opinions 领域概念](decisions/005-drop-opinions-domain-concept.md) 决策 1/2/3 · [004 记忆数据模型校准](decisions/004-memory-model-calibration.md) 决策 1/6
- **D3 会话不因记忆失败中断**：retain 是 fire-and-forget；recall 失败返回空上下文。出处：[strategic-design](../ddd/strategic-design.md) §1.3
- **D4 SDK 隔离**：端口不泄漏 Hindsight SDK 类型；预 1.0 API 的耦合收敛在适配器内，适配器负责映射。出处：[004 记忆数据模型校准](decisions/004-memory-model-calibration.md) 决策 6
- **D5 来源标注经 retain 的 metadata 写入**（`source_channel` / `source_credibility`）。出处：[004 记忆数据模型校准](decisions/004-memory-model-calibration.md) 决策 4
- **D6 快通道检索零 LLM**：ai_ask 快通道 recall 查询构造走规则，≤200ms 预算内不做任何 LLM 调用；命中率不足时的升级路径是慢通道（意识触发），不在快通道内加 LLM。出处：[006 检索层范围收敛](decisions/006-retrieval-layer-scope.md) 决策 3 · [004 记忆数据模型校准](decisions/004-memory-model-calibration.md)

## E. 时间机制

- **E1 会谈准备不做 LLM 时间评估**：预估来源只有三个——脚本声明 > 历史学习值 > 系统默认值。出处：[003 时间管理的实现机制](decisions/003-time-implementation-mechanism.md) 决策二
- **E2 时间判断归属 `process_quality` 内置意识**（一个判断维度），不作为独立意识。出处：[003 时间管理的实现机制](decisions/003-time-implementation-mechanism.md) 决策三
- **E3 深度切换三层叠加**：参数层（max_rounds）/ 动作层（quick 跳过 think）/ 提示词层（注入指导），各管各的。出处：[003 时间管理的实现机制](decisions/003-time-implementation-mechanism.md) 决策四
