---
document_id: openspec-specs-domain-ubiquitous-language-glossary-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/domain/ubiquitous-language-glossary.md
tags: [authoritative, current, specification]
search_priority: high
---

# 通用语言词汇表 (Ubiquitous Language Glossary)

## 概述

本文档定义了HeartRule AI咨询引擎项目的通用语言，确保团队在领域驱动设计(DDD)中使用一致的术语和概念。

## 核心领域概念

### 会话管理 (Session Management)

| 术语     | 英文              | 定义                                       | 示例                            |
| -------- | ----------------- | ------------------------------------------ | ------------------------------- |
| 会话     | Session           | 一次完整的咨询对话过程，包含多个阶段和话题 | "CBT焦虑评估会话"               |
| 会话状态 | Session Status    | 会话的当前状态：进行中、已完成、已暂停     | `active`, `completed`, `paused` |
| 会话变量 | Session Variables | 会话中存储的用户数据和上下文信息           | `user_name`, `anxiety_level`    |

### 阶段管理 (Phase Management)

| 术语     | 英文             | 定义                               | 示例                             |
| -------- | ---------------- | ---------------------------------- | -------------------------------- |
| 阶段     | Phase            | 会话中的一个逻辑阶段，包含多个话题 | "评估阶段"、"干预阶段"           |
| 阶段切换 | Phase Transition | 根据条件从一个阶段切换到另一个阶段 | "当焦虑评分>7时，切换到干预阶段" |
| 阶段目标 | Phase Goal       | 阶段要达成的咨询目标               | "完成初步评估"                   |

### 话题管理 (Topic Management)

| 术语         | 英文                    | 定义                           | 示例                       |
| ------------ | ----------------------- | ------------------------------ | -------------------------- |
| 话题         | Topic                   | 阶段中的一个具体讨论主题       | "焦虑症状评估"             |
| 话题目标     | Topic Goal              | 话题要达成的具体目标           | "收集用户焦虑症状信息"     |
| 话题策略     | Topic Strategy          | 实现话题目标的方法和策略       | "使用苏格拉底式提问"       |
| 动态话题展开 | Dynamic Topic Expansion | 根据用户输入动态生成Action队列 | "基于用户回答展开相关话题" |

### 动作管理 (Action Management)

| 术语           | 英文                    | 定义                         | 示例                                |
| -------------- | ----------------------- | ---------------------------- | ----------------------------------- |
| 动作           | Action                  | 最小的对话单元，执行具体操作 | `ai_say`, `ai_ask`, `ai_think`      |
| Action类型     | Action Type             | Action的具体类型和功能       | `ai_say`: AI说话, `ai_ask`: AI提问  |
| Action队列     | Action Queue            | 按顺序执行的一系列Action     | `[ai_say, ai_ask, ai_think]`        |
| Action执行状态 | Action Execution Status | Action的执行状态             | `pending`, `executing`, `completed` |

## 脚本工程 (Script Engineering)

| 术语     | 英文            | 定义                                       | 示例                  |
| -------- | --------------- | ------------------------------------------ | --------------------- |
| 脚本工程 | Script Project  | 包含多个脚本文件的完整项目                 | "CBT焦虑评估脚本工程" |
| 脚本文件 | Script File     | 包含会话、阶段、话题、Action定义的YAML文件 | `cbt-assessment.yaml` |
| 脚本版本 | Script Version  | 脚本工程的版本快照                         | `v1.0.0`, `v1.1.0`    |
| 脚本模板 | Script Template | 可复用的脚本结构和模式                     | "标准评估会话模板"    |

## AI与LLM集成

| 术语       | 英文                | 定义                        | 示例                     |
| ---------- | ------------------- | --------------------------- | ------------------------ |
| LLM编排    | LLM Orchestration   | 协调多个LLM调用完成复杂任务 | "两阶段LLM管道"          |
| 提示词工程 | Prompt Engineering  | 设计和优化LLM提示词         | "系统提示词、用户提示词" |
| 变量提取   | Variable Extraction | 从用户回答中提取结构化变量  | "从回答中提取焦虑评分"   |
| 上下文管理 | Context Management  | 管理对话上下文和历史        | "维护最近10轮对话历史"   |

## 监控与分析

| 术语     | 英文                | 定义                   | 示例                         |
| -------- | ------------------- | ---------------------- | ---------------------------- |
| 监控分析 | Monitor Analysis    | 对对话过程的分析和评估 | "分析AI回答质量"             |
| 反馈注入 | Feedback Injection  | 将监控结果注入后续对话 | "将分析反馈注入下一个Action" |
| 策略建议 | Strategy Suggestion | 基于分析的优化建议     | "建议使用更具体的提问"       |

## 技术架构

| 术语         | 英文            | 定义                     | 示例               |
| ------------ | --------------- | ------------------------ | ------------------ |
| 核心引擎     | Core Engine     | 执行脚本逻辑的核心组件   | "脚本执行引擎"     |
| 变量存储     | Variable Store  | 存储会话变量的组件       | "内存变量存储"     |
| 记忆引擎     | Memory Engine   | 管理短期、中期、长期记忆 | "Redis记忆存储"    |
| 话题调度引擎 | Topic Scheduler | 动态调度话题的引擎       | "基于时间的调度器" |

## 开发流程

| 术语         | 英文                | 定义                   | 示例                        |
| ------------ | ------------------- | ---------------------- | --------------------------- |
| 产品待办列表 | Product Backlog     | 按优先级排序的需求列表 | "Story 2.2: 动态Action队列" |
| 用户故事     | User Story          | 从用户角度描述的需求   | "作为咨询师，我希望..."     |
| 验收标准     | Acceptance Criteria | 用户故事的完成标准     | "给定...当...那么..."       |
| 冲刺         | Sprint              | 固定周期的开发迭代     | "2周冲刺"                   |

## 领域驱动设计术语

| 术语       | 英文            | 定义                         | 示例                               |
| ---------- | --------------- | ---------------------------- | ---------------------------------- |
| 限界上下文 | Bounded Context | 领域模型的明确边界           | "会话管理上下文"                   |
| 上下文映射 | Context Mapping | 不同限界上下文之间的关系     | "会话上下文与用户上下文的合作关系" |
| 聚合       | Aggregate       | 一组相关对象的集合，有聚合根 | "Session聚合，包含Phases"          |
| 实体       | Entity          | 有唯一标识的领域对象         | "Session实体，有session_id"        |
| 值对象     | Value Object    | 不可变的领域对象             | "AnxietyScore值对象"               |
| 领域服务   | Domain Service  | 执行领域逻辑的服务           | "TopicExpansionService"            |
| 领域事件   | Domain Event    | 领域状态变化的事件           | "TopicCompletedEvent"              |

## 缩写词表

| 缩写 | 全称                              | 中文                 | 定义                   |
| ---- | --------------------------------- | -------------------- | ---------------------- |
| CBT  | Cognitive Behavioral Therapy      | 认知行为疗法         | 一种心理治疗方法       |
| LLM  | Large Language Model              | 大语言模型           | 如GPT-4、Claude等      |
| DDD  | Domain-Driven Design              | 领域驱动设计         | 软件设计方法论         |
| MVP  | Minimum Viable Product            | 最小可行产品         | 具有核心功能的产品版本 |
| API  | Application Programming Interface | 应用程序编程接口     | 系统间交互接口         |
| YAML | YAML Ain't Markup Language        | YAML不是标记语言     | 数据序列化格式         |
| JSON | JavaScript Object Notation        | JavaScript对象表示法 | 轻量级数据交换格式     |

## 更新记录

| 日期       | 版本  | 变更说明              |
| ---------- | ----- | --------------------- |
| 2026-03-11 | 1.0.0 | 初始版本创建          |
| 2026-03-11 | 1.0.0 | 添加核心领域概念      |
| 2026-03-11 | 1.0.0 | 添加DDD术语和缩写词表 |

## 使用指南

1. **新成员入职**: 阅读本词汇表理解项目术语
2. **代码审查**: 确保代码中使用正确的术语
3. **文档编写**: 在文档中一致使用本词汇表中的术语
4. **团队沟通**: 在会议和讨论中使用统一术语

## 贡献指南

如需添加新术语或修改定义：

1. 在GitHub上创建Issue说明变更理由
2. 提交Pull Request修改本文件
3. 确保术语定义清晰、准确
4. 更新"更新记录"部分

## 联系

如有术语问题或建议，请联系领域专家团队。
