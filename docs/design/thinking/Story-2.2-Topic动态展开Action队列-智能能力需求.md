> **文档状态**：本文档已根据 2026-03-06 重构设计更新。原始"二分类决策+单提示词"架构已演进为"两阶段 LLM Pipeline"架构。详见：[重构设计文档](../plans/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md)

---

# Story 2.2：Topic层 Action 队列动态调整的智能能力需求

## 1. 能力背景

在 HeartRule 五层架构中，Topic 层承担"目标攻坚单元"的角色：围绕一个清晰子目标，编排和调整一组 Action 队列。

在传统的"静态脚本"模式下，Topic 下的 Action 列表是预先写死的：

- **优势**：流程可控、易于调试。
- **局限**：无法根据现场情况动态调整 Action 队列，只能人工写很多分支或重复片段。

为了承载更接近真实咨询现场的复杂调整需求，本 Story 在 Topic 层引入一个 **可调用 LLM 的"意识层"**，提供通用的"Action 队列动态调整"能力。

> **框架设计思路**：本 Story 以**场景A（一对多实体展开）**为例实现完整能力，但框架设计支持后续扩展到其他场景（场景B、C...），符合开闭原则。

## 2. 能力目标

> **说明**：以下能力目标以**场景A（一对多实体展开）**为例进行实现，是本 Story 的首场景示例。

**场景A需要的能力目标：**

1. **感知需要处理的对象**：Topic 意识层能够从对话或变量中识别出"需要逐一处理的一组对象"（如多个抚养者、多个部门、多个角色）。
2. **复用一套脚本节奏**：对每个对象重复同一套 Action 模板，而非人工复制多份脚本。
3. **动态扩展队列**：在 Topic 执行过程中，如果识别到新的对象，可以追加新的 Action 子队列。
4. **保持执行秩序清晰**：同一对象的 Action 子队列在执行上保持相对连续，避免用户体验混乱。
5. **可观测、可调试**：所有队列调整决策都有清晰的 debug 信息记录。
6. **灵活的实体处理策略**：由 LLM 根据对话动态决定每个实体需要多少 Actions（如爸爸 3 个、妈妈 2 个、外公 1 个）。

> **框架级能力**：上述目标中的"策略驱动而非硬编码"（是否需要调整队列由 Topic 意识层判断）是框架级设计，本 Story 实现场景A的同时，也搭建了支持扩展的通用框架。

> **注**：本 Story 聚焦在"一对多对象的队列展开"能力（场景A），不处理阻抗检测、时间预算、优先级重排等问题。Topic 层只判断是否需要调整 Action 队列，不涉及单个 Action 内部的微调（那是 Action 层通过多轮对话自身解决的）。

## 3. 典型使用场景

### 3.1 场景A：一对多实体展开（本次实现）

**Topic 目标**：收集来访者童年主要抚养者情况

**脚本初始设计**：

- **Action1**：ai_ask — 询问有哪些抚养者
- **Action2 模板**：ai_ask — 询问某一位抚养者的基本信息
- **Action3 模板**：ai_ask — 询问该抚养者的关系史与关键事件

**动态展开**：

1. Action1 收集到"爸爸"，自动展开 Action2(爸爸)、Action3(爸爸)
2. Action3(爸爸) 执行中，用户提到"妈妈、外公"，自动追加 Action2(妈妈)、Action3(妈妈)、Action2(外公)、Action3(外公)

**关键点**：

- 脚本作者只需要写一次模板
- 引擎通过两阶段 LLM 自动生成和扩展 Actions
- 同一实体的数量可动态调整（如妈妈需要 2 个，外公需要 1 个）

### 3.2 场景B：话题延伸处理（预留扩展）

- **触发**：用户主动跑题，但跑题内容与当前 Topic 目标有支撑性
- **调整**：动态插入 1-2 个 Actions 对跑题内容进行简单沟通（如"嗯，您提到的xxx确实很重要"）
- **约束**：不宜过多，多了相当于另开一个 Topic

### 3.3 场景C：条件跳过（预留扩展）

- **触发**：某些前置条件不满足（如用户明确表示不想聊、时间不足）
- **调整**：跳过部分后续 Actions

### 3.4 场景D：情绪响应（后续 Story 2.3）

- **触发**：检测到用户情绪明显波动
- **调整**：动态插入安抚类 Action 或暂停当前 Topic

---

## 4. 核心概念

### 场景A特有概念

- **对象（Target）**：需要被逐一处理的目标，如"爸爸、妈妈、外公"、"销售部、研发部"等（场景A语境下）
- **对象列表**：当前 Topic 下需要处理的一组对象
- **Action 模板**：针对单个对象的一小段 Action 子序列
- **实体混合策略**：不同实体可分配不同数量的 Actions，由 LLM 决定

### 框架级概念

- **Topic 意识层**：可调用 LLM，负责判断是否需要调整队列
- **两阶段 LLM Pipeline**：
  - Stage 1 Decision LLM：分析对话，生成结构化调整计划
  - Stage 2 Planner LLM：将调整计划转换为 Action YAML 脚本

## 5. 功能需求拆解

> **说明**：以下功能需求以场景A（一对多实体展开）为例实现，并已根据 2026-03-06 重构更新为两阶段 LLM Pipeline 架构。

### 5.1 对象感知与列表管理（场景A）

1. **来源**：对象可以来自当前 Action 的 output 变量、对话中 LLM 解析出的角色（由 Stage 1 Decision LLM 负责）、之前 Topic 存下的变量
2. **增量更新**：每次 Action 执行后，识别新增对象，避免重复处理
3. **去重**：基本去重能力（如"爸、父亲、爸爸"规范为同一对象）

### 5.2 Action 模板声明与绑定（场景A）

1. **脚本层声明**：Topic 脚本声明哪些 Action 是"针对单个对象的模板片段"
2. **语义绑定**：模板内 Action 可引用"当前对象"的变量，output 变量名可区分不同对象

### 5.3 Action 队列动态生成（场景A）- 已更新

1. **初次生成**：对象列表第一次建立时，由 Stage 2 Planner LLM 根据每个实体生成对应的 Actions（数量和内容由 LLM 决策）
2. **过程中追加**：识别到新对象时，通过两阶段 Pipeline 生成新的 Actions 并追加
3. **执行连续性**：同一对象的 Actions 尽量连续执行（由 Planner LLM 考虑）
4. **灵活策略**：支持不同实体分配不同数量的 Actions（如爸爸 3 个、妈妈 2 个、外公 1 个）

### 5.4 与 Topic 意识层的协作

Topic 意识层（Stage 1 Decision LLM）负责判断"是否需要调整队列"并生成调整计划，Stage 2 Planner LLM 负责生成具体的 Action 配置，不负责单个 Action 内部的微调。

### 5.5 Topic 策略层两阶段 LLM 决策 - 已更新

本 Story 采用 **两阶段 LLM Pipeline** 的方式实现策略驱动：

**Stage 1: 决策 LLM**

1. **决策类型（由 Decision LLM 做出）**：
   - `needsAdjustment` = false：不调整队列
   - `needsAdjustment` = true：需要调整队列

2. **Stage 1 提示词模板（Decision Prompt）**：
   - 目标：分析对话，判断是否需要调整队列，并生成结构化调整计划
   - 输入：Topic goal/strategy、当前 Action 进度、对话摘要、对象列表状态、剩余时间等
   - 输出 JSON：
     ```json
     {
       "needsAdjustment": true,
       "strategy": "NEW_ENTITIES" | "DEEPEN_ENTITY" | "SKIP_ENTITY" | "REORDER_ACTIONS" | "CUSTOM",
       "reasoning": "决策原因",
       "adjustmentPlan": {
         "entities": [...],
         "insertionStrategy": "APPEND_TO_END" | "INSERT_AFTER_CURRENT" | "INSERT_BEFORE_TOPIC_END"
       },
       "constraints": { ... }
     }
     ```

**Stage 2: 规划 LLM**

3. **Stage 2 提示词模板（Planner Prompt）**：
   - 目标：将调整计划转换为可执行的 Action YAML 脚本
   - 输入：Stage 1 输出的 adjustmentPlan + Topic goal/strategy
   - 输出 YAML：
     ```yaml
     actions:
       - action_type: ai_ask
         action_id: xxx
         config:
           content: '问题'
           output:
             - get: variable_name
               define: '定义'
               extraction_method: llm
     ```

4. **引擎层职责**：
   - 调用 Stage 1 LLM 获取决策和调整计划
   - 当 needsAdjustment=true 时，调用 Stage 2 LLM 生成 Action YAML
   - 解析并验证输出，执行队列操作
   - 不写死具体业务规则

### 5.6 层级职责划分 - 已更新

- **Action 层（低头执行）**：通过多轮对话利用 LLM 自身能力完成微调
- **Topic 层（抬头规划）**：
  - Stage 1 Decision LLM：判断是否需要调整队列结构，生成调整计划
  - Stage 2 Planner LLM：将调整计划转换为具体的 Action 配置
- **代码层（编排执行）**：LLM 调用编排、结果验证、队列操作

这样分工更清晰：决策、规划、执行三分离，每层只在自己目标范围内调整。

### 5.7 模板系统变量

| 变量名                           | 含义                 | 来源           |
| -------------------------------- | -------------------- | -------------- |
| `{%topic_goal%}`                 | Topic 目标           | Topic 脚本配置 |
| `{%topic_strategy%}`             | Topic 策略           | Topic 脚本配置 |
| `{%current_action_summary%}`     | 当前 Action 概要     | 执行上下文     |
| `{%current_topic_plan_summary%}` | TopicPlan 进度       | 执行上下文     |
| `{%object_list_status%}`         | 已识别对象及处理进度 | 变量存储       |
| `{%time_and_state%}`             | 剩余时间与用户状态   | Session/Phase  |
| `{%conversation_summary%}`       | 对话摘要             | 对话历史       |

## 6. 可观测性

1. **调整记录**：每次队列变化记录调整内容、原因、插入位置
2. **对象状态标记**：记录每个对象的执行状态（未开始/进行中/已完成/被跳过）
3. **问题诊断**：帮助定位"重复展开"或"未展开"问题

## 7. 后续演进 - 已更新

> **说明**：以下设计已根据 2026-03-06 重构更新为两阶段 LLM Pipeline 架构。

本 Story 定位：为 Topic 层提供"队列动态调整"能力，以场景A为例实现，框架支持扩展：

- **场景B（话题延伸）**：在 Decision Prompt 中增加 `TOPIC_EXTENSION` 策略类型
- **场景C（条件跳过）**：使用 `SKIP_ENTITY` 类型和 intent='SKIP' 实现
- **场景D（情绪响应）**：增加 `EMOTION_RESPONSE` 策略类型，后续 Story 2.3 承担

**扩展方式**：仅需更新两个 Prompt Template 和 Schema 定义，无需修改代码逻辑。实现零编码场景扩展。

---

> 本 Story 在 Story 2.1 基础上，为 Topic 层提供通用的"队列动态调整"能力，采用两阶段 LLM Pipeline 架构（Decision → Planner → Execution），作为后续更复杂 Topic 智能（阻抗处理、策略性取舍、情绪响应等）的基础。
