---
document_id: product-topic-dynamic-action-queue-intelligent-capability-requirements
authority: product
status: active
version: 1.0.0
last_updated: 2026-03-06
source: docs/design/thinking/Story-2.2-Topic动态展开Action队列-智能能力需求.md
path: product/feature-guides/topic-dynamic-action-queue-intelligent-capability-requirements.md
tags: [product, feature-guide, requirements, topic-layer, dynamic-action-queue, story-2.2]
search_priority: high
language: zh
needs_translation: false
related_documents:
  - product/feature-guides/topic-configuration-guide.md
  - domain/tactical/topic-action-queue-ddd-tactical-design.md
  - _global/process/implementation-plans/story-2-2-two-stage-llm-refactor-implementation-plan.md
---

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

- **实体（Entity）**：需要被逐一处理的目标对象，如"爸爸、妈妈、外公"、"销售部、研发部"等
- **实体状态管理**：代码层维护的实体处理进度（基于 Decision LLM 输出）
- **Decision LLM 输出**：包含实体识别、意图判断、调整计划的结构化JSON
- **Planner LLM 输出**：基于调整计划生成的 Action YAML 脚本
- **实体混合策略**：不同实体可分配不同数量的 Actions，由 LLM 决定

> **注**：原有"对象列表"和"Action模板"概念已由两阶段 LLM Pipeline 取代，不再需要脚本层预定义模板。

### 框架级概念

- **Topic 意识层**：可调用 LLM，负责判断是否需要调整队列
- **两阶段 LLM Pipeline**：
  - Stage 1 Decision LLM：分析对话，生成结构化调整计划
  - Stage 2 Planner LLM：将调整计划转换为 Action YAML 脚本

## 5. 功能需求拆解

> **说明**：以下功能需求以场景A（一对多实体展开）为例实现，并已根据 2026-03-06 重构更新为两阶段 LLM Pipeline 架构。

### 5.1 实体感知与状态管理（场景A）- 已更新

1. **实体识别与意图判断**：Stage 1 Decision LLM 直接输出：
   - 识别到的实体名称（entityName）
   - 处理意图（intent）：NEW/EXTEND/DEEPEN/SKIP
   - 即LLM已判断是"新增实体"还是"扩展已有实体"
2. **状态跟踪**：代码层仅记录LLM输出的实体处理进度（用于可观测性，不参与决策）
3. **上下文传递**：将已处理的实体信息传递给下次Decision LLM调用，让LLM自行判断是否重复

> **关键变化**：LLM决定实体意图，代码层不对比、不判断、只记录。"新增"还是"扩展"完全由LLM的intent字段表达。

### 5.2 Action 动态生成（场景A）- 已更新

> **重要**：原有的"模板声明与绑定"模式已被两阶段 LLM Pipeline 取代。

1. **无需预定义模板**：Stage 2 Planner LLM 直接生成完整的 Action 配置
2. **实体上下文传递**：Decision LLM 输出的 `adjustmentPlan.entities` 提供：
   - 实体名称（entityName）
   - 处理意图
   - 需要的 Actions 描述
   - 上下文信息
3. **变量命名**：Planner LLM 遵循变量命名规范 `{entity_type}_{index}_{variable_suffix}`

> **优势**：不再需要脚本作者预定义 Action 模板，LLM 根据意图自动生成适配的 Actions。

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
   - 输入：Topic goal/strategy、当前 Action 进度、对话摘要、实体状态、剩余时间等
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

### 5.7 Prompt 输入上下文变量 - 已更新

> **说明**：原有的模板系统变量概念已调整为 Prompt 输入上下文。

| 变量名                           | 含义                 | 来源           |
| -------------------------------- | -------------------- | -------------- |
| `{%topic_goal%}`                 | Topic 目标           | Topic 脚本配置 |
| `{%topic_strategy%}`             | Topic 策略           | Topic 脚本配置 |
| `{%current_action_summary%}`     | 当前 Action 概要     | 执行上下文     |
| `{%current_topic_plan_summary%}` | TopicPlan 进度       | 执行上下文     |
| `{%conversation_summary%}`       | 对话摘要             | 对话历史       |
| `{%time_and_state%}`             | 剩余时间与用户状态   | Session/Phase  |
| `{%entity_status%}`              | 已识别实体及处理状态 | 代码层状态管理 |

> **删除的变量**：`{%object_list_status%}` 已由 `{%entity_status%}` 替代，反映从"硬编码对象列表"到"LLM驱动的实体状态"的转变。

### 5.8 最终Prompt模板设计 - 基于测试验证

基于三轮迭代测试，确定了最终版本的Prompt模板设计：

**Decision Prompt Template (v1-final)**：

- 位置：`/config/prompts/topic/decision-llm-v1-final.md`
- 核心功能：分析对话上下文，判断是否需要调整队列，生成结构化调整计划
- 关键增强：情感信号识别指南、边界情况处理、丰富示例

**Planner Prompt Template (v1-final)**：

- 位置：`/config/prompts/topic/planner-llm-v1-final.md`
- 核心功能：将调整计划转换为具体的Action YAML配置
- 关键增强：内容设计指南、边界情况处理模板、命名规范

### 5.9 变量替换机制与边界说明

本系统采用两层变量替换机制，明确划分系统层和模板层的职责边界：

#### 系统层变量（{%变量名%}）

- **来源**：系统运行时注入
- **示例**：`{%time%}`, `{%session_id%}`, `{%user_id%}`
- **替换时机**：Prompt构建时
- **职责边界**：代码层负责注入运行时信息，不包含业务逻辑

#### 模板层变量（{{变量名}}）

- **来源**：Topic配置或运行时计算
- **示例**：`{{topic_goal}}`, `{{conversation_history}}`, `{{existing_entities}}`
- **替换时机**：Prompt构建时
- **职责边界**：模板层定义业务上下文，代码层负责值替换

#### 动态内容块（{{#if 条件}}内容{{/if}}）

- **用途**：条件性包含内容块
- **示例**：`{{#if has_emotional_tone}}情绪分析指导...{{/if}}`
- **实现**：使用ConditionalTemplate类处理
- **职责边界**：模板层定义条件逻辑，代码层评估条件

### 5.10 模板逻辑与脚本配置的边界划分

基于最终设计，明确划分模板逻辑和脚本配置的职责：

#### 模板层（Prompt Templates）负责：

1. **通用决策逻辑**：何时需要/不需要调整队列
2. **通用规划逻辑**：如何生成Actions、命名规范
3. **通用指导原则**：问题设计、变量命名、共情表达
4. **通用输出格式**：JSON/YAML Schema定义

#### 脚本层（Topic YAML配置）负责：

1. **具体领域目标**：收集什么信息（如抚养者信息）
2. **具体策略**：如何收集（如渐进深入）
3. **具体约束**：资源限制（如最大Actions数）
4. **具体示例**：典型场景示例

#### 代码层（TypeScript实现）负责：

1. **LLM调用编排**：顺序、错误处理
2. **模板渲染**：变量替换、条件逻辑
3. **结果解析**：JSON/YAML解析
4. **Schema验证**：Zod验证
5. **队列操作执行**：插入、追加

**边界划分原则**：

- 业务逻辑尽量放在模板层，便于领域专家迭代
- 领域知识具体化放在脚本层，支持零编码扩展
- 技术实现放在代码层，保持稳定性和性能

## 6. 可观测性 - 已更新

1. **决策追踪**：每次 Stage 1 Decision LLM 调用记录决策过程、推理原因
2. **实体状态追踪**：记录实体识别、意图判断、Actions 数量分配
3. **Action 生成记录**：Stage 2 Planner LLM 生成的 Action YAML 及解析结果
4. **执行记录**：队列变化、插入位置、执行结果
5. **问题诊断**：帮助定位"重复生成"、"未按预期生成"、"输出格式错误"等问题

> **新增**：相比原有设计，增加了对 LLM 输出格式的追踪和问题诊断能力。

## 7. 配置规范

> **配置驱动**：本Story采用配置驱动的架构，所有业务逻辑通过YAML配置和Prompt模板定义，实现零编码扩展。

### 7.1 Topic节点YAML配置示例

以下是一个完整的Topic节点配置示例，展示如何配置两阶段LLM Pipeline：

```yaml
topic:
  id: 'collect_caregiver_info'
  goal: '收集来访者童年主要抚养者信息'
  strategy: 'progressive_deepening'

  # 决策提示词配置
  decision_prompt_config:
    # 系统层变量注入
    system_variables:
      time: '{%time%}'
      who: '{%who%}'
      user: '{%user%}'

    # 模板层变量定义
    template_variables:
      topic_goal: '收集来访者童年主要抚养者信息'
      topic_strategy: '渐进深入：先基本信息，再关系史，最后深层记忆'
      constraints: |
        最大总Actions数：10
        每个实体最大Actions数：4
        时间预算：5分钟
        禁止的Action类型：[]

    # 条件内容块配置
    conditional_blocks:
      - condition: 'has_emotional_context'
        content: |
          情绪敏感指导：
          根据用户情绪调整问题语气，避免触发防御反应
      - condition: 'has_time_pressure'
        content: |
          时间约束：优先收集关键信息，跳过非必要追问

    # 示例配置
    examples:
      - scenario: '发现新实体'
        input: "对话：'主要是爸爸，后来妈妈也回来了。对了，外公也经常来帮忙。'"
        output: |
          {
            "needsAdjustment": true,
            "strategy": "NEW_ENTITIES",
            "reasoning": "发现'妈妈'和'外公'两个新实体，爸爸需要补充关系史",
            "adjustmentPlan": { ... }
          }

  # 规划提示词配置
  planner_prompt_config:
    # 输入变量绑定
    input_variables:
      adjustment_plan_json: '{{adjustment_plan_json}}'
      entities: '{{adjustment_plan.entities}}'

    # 模板片段注册
    template_fragments:
      ai_ask_basic_info_template: |
        - action_type: "ai_ask"
          action_id: "{entity_type}_{index}_ask_basic_info"
          config:
            content: |
              请问{entity_name}的姓名是什么？
              您和{entity_name}的关系如何（亲近/疏远/较为复杂）？
              在您的成长过程中，{entity_name}扮演了怎样的角色？
            output:
              - get: "{entity_type}_{index}_name"
                define: "{entity_name}的姓名"
                extraction_method: "direct"
              - get: "{entity_type}_{index}_relationship"
                define: "与{entity_name}的关系类型"
                extraction_method: "llm"
            max_rounds: 2

      ai_say_transition_template: |
        - action_type: "ai_say"
          action_id: "{entity_type}_{index}_say_transition"
          config:
            content: |
              接下来，我想了解一下您{entity_name}的情况。
              了解童年抚养者情况有助于理解您的成长经历。
            max_rounds: 1

    # 循环模板配置
    loop_templates:
      - for: 'entities'
        template: |
          # 处理实体：{{entityName}}
          {{>ai_say_transition_template}}
          {{>ai_ask_basic_info_template}}
          {{#if needs_deepening}}
          {{>ai_ask_deepening_template}}
          {{/if}}

    # 示例配置
    examples:
      - scenario: '新实体处理'
        input: |
          {
            "needsAdjustment": true,
            "strategy": "NEW_ENTITIES",
            "adjustmentPlan": {
              "entities": [
                {
                  "entityName": "妈妈",
                  "intent": "NEW",
                  "actionsNeeded": [ ... ]
                }
              ]
            }
          }
        output: |
          actions:
            - action_type: "ai_say"
              action_id: "caregiver_1_say_welcome"
              config:
                content: |
                  接下来，我想了解一下您妈妈的情况。
                  了解童年抚养者情况有助于理解您的成长经历。
                max_rounds: 1
            # ... 更多actions
```

### 7.2 配置字段说明

#### 顶层字段

| 字段                     | 类型   | 必填 | 说明            |
| ------------------------ | ------ | ---- | --------------- |
| `id`                     | string | 是   | Topic唯一标识符 |
| `goal`                   | string | 是   | Topic目标描述   |
| `strategy`               | string | 是   | Topic策略描述   |
| `decision_prompt_config` | object | 是   | 决策提示词配置  |
| `planner_prompt_config`  | object | 是   | 规划提示词配置  |

#### decision_prompt_config字段

| 字段                 | 类型   | 必填 | 说明           |
| -------------------- | ------ | ---- | -------------- |
| `system_variables`   | object | 是   | 系统层变量映射 |
| `template_variables` | object | 是   | 模板层变量定义 |
| `conditional_blocks` | array  | 否   | 条件内容块配置 |
| `examples`           | array  | 否   | 示例场景配置   |

#### planner_prompt_config字段

| 字段                 | 类型   | 必填 | 说明         |
| -------------------- | ------ | ---- | ------------ |
| `input_variables`    | object | 是   | 输入变量绑定 |
| `template_fragments` | object | 否   | 模板片段注册 |
| `loop_templates`     | array  | 否   | 循环模板配置 |
| `examples`           | array  | 否   | 示例场景配置 |

### 7.3 配置与模板的集成方式

配置系统通过以下方式与Prompt模板集成：

1. **变量替换**：将配置中的变量值注入到Prompt模板中
2. **条件渲染**：根据配置的条件内容块动态生成Prompt内容
3. **模板组合**：将配置的模板片段组合成完整的Prompt
4. **示例注入**：将配置的示例添加到Prompt中作为参考

### 7.4 配置边界说明

明确配置系统的职责边界：

#### 配置负责（YAML层）

- 领域知识的具体化（目标、策略、约束）
- 运行时变量的定义和映射
- 条件逻辑的配置（何时包含哪些内容）
- 示例场景的定义

#### 模板负责（Prompt层）

- 通用决策逻辑的实现
- 通用规划逻辑的实现
- 输出格式的定义
- 命名规范的执行

#### 代码负责（TypeScript层）

- 配置的解析和验证
- 模板的渲染和执行
- 变量的替换和求值
- 条件逻辑的评估

### 7.5 扩展配置示例

#### 场景B：话题延伸处理

```yaml
topic:
  id: 'handle_topic_extension'
  goal: '处理用户主动跑题但相关的内容'
  strategy: 'brief_acknowledgement'

  decision_prompt_config:
    template_variables:
      topic_goal: '处理用户主动跑题但相关的内容'
      topic_strategy: '简要认可，快速回归主线'
      constraints: |
        最大插入Actions数：2
        时间预算：1分钟

    examples:
      - scenario: '话题延伸'
        input: "对话：'说到童年，我突然想起我小学时的班主任...'"
        output: |
          {
            "needsAdjustment": true,
            "strategy": "TOPIC_EXTENSION",
            "reasoning": "用户主动提及相关但未计划的话题，需要简要认可"
          }
```

#### 场景C：条件跳过

```yaml
topic:
  id: 'conditional_skip'
  goal: '根据条件跳过部分Actions'
  strategy: 'respect_user_preference'

  decision_prompt_config:
    template_variables:
      topic_goal: '根据条件跳过部分Actions'
      topic_strategy: '尊重用户偏好，灵活调整'

    examples:
      - scenario: '用户抗拒'
        input: "对话：'我不想谈这个，我们聊点别的吧。'"
        output: |
          {
            "needsAdjustment": true,
            "strategy": "SKIP_ENTITY",
            "reasoning": "用户明确表示抗拒，应尊重用户意愿跳过"
          }
```

---

## 8. Prompt工程实践

> **实践导向**：本Story采用三阶段迭代开发方法，强调测试→分析→优化→再测试的循环工作模式。

### 8.1 三阶段迭代开发方法

基于实际测试验证，本Story采用以下三阶段迭代方法：

**Wave 1: 设计文档更新 + Prompt草案创建**

- 更新设计文档，明确两阶段LLM Pipeline架构
- 创建Decision和Planner Prompt草案模板
- 建立测试框架和评估标准

**Wave 2: 迭代测试和优化（3+轮测试）**

- 执行三轮迭代测试：新实体发现、实体深化、跳过实体
- 每轮测试后分析结果，识别问题
- 优化Prompt模板，解决发现的问题
- 验证所有场景达到100%通过率

**Wave 3: 集成和文档完善**

- 创建最终版本Prompt模板
- 完善文档和配置规范
- 准备生产环境集成

### 8.2 用户实践导向工作模式

本Story采用实践导向的工作模式，强调从实际测试中学习和优化：

```
预想模板 → 测试输出 → 修订提示词 → 研究出可用模板
```

**关键实践原则**：

1. **测试驱动**：所有设计决策基于实际测试结果，而非理论假设
2. **快速迭代**：小步快跑，每轮迭代聚焦解决具体问题
3. **质量验证**：建立明确的评估标准，确保输出质量
4. **文档同步**：设计、实现、测试、文档同步更新

### 8.3 测试框架和评估标准

基于三轮迭代测试，建立了以下评估标准：

**格式正确性**：

- JSON Schema符合性: 100%
- YAML格式正确性: 100%
- 命名规范一致性: 100%

**内容质量**：

- 决策逻辑正确性: 100%
- 规划输出完整性: 100%
- 共情表达适当性: 100%

**集成一致性**：

- 决策-规划一致性: 100%
- 变量命名一致性: 100%
- 插入策略实现: 100%

### 8.4 关键发现与优化

通过三轮迭代测试，获得以下关键发现：

1. **命名规范的重要性**：统一的命名规范对于prompt模板的可维护性至关重要
   - 实体相关Action: `{entity_type}_{index}_{purpose_slug}`
   - 通用Action: `general_{purpose_slug}`
   - 变量命名: `{entity_type}_{index}_{variable_suffix}`

2. **情感信号识别**：情感信号识别对于咨询场景的响应质量至关重要
   - 分类情感信号（积极、消极、复杂、抗拒）
   - 提供针对性的处理建议
   - 在模板中明确情感信号关键词

3. **边界情况处理**：边界情况处理能力决定了模板的鲁棒性
   - 多实体同时出现：按顺序处理，使用通用Action过渡
   - 混合意图场景：使用NEW_ENTITIES策略，区分NEW/EXTEND/DEEPEN意图
   - 用户情绪波动：优先处理情绪，添加共情表达

4. **示例驱动设计**：丰富的示例能够显著提升LLM的输出质量
   - 为每种策略类型提供完整示例
   - 为每种Action类型提供配置模板
   - 为边界情况提供处理示例

---

## 9. 验收标准

> **质量导向**：本Story的验收标准基于实际测试结果，强调输出质量和迭代验证。

### 9.1 Prompt输出质量要求

基于三轮迭代测试，建立以下Prompt输出质量要求：

**格式正确性（100%要求）**：

- JSON Schema符合性：Decision LLM输出必须严格符合定义Schema
- YAML格式正确性：Planner LLM输出必须为有效YAML格式
- 命名规范一致性：Action ID和变量名必须遵循命名规范

**内容质量（100%要求）**：

- 决策逻辑正确性：needsAdjustment判断必须符合决策指南
- 规划输出完整性：生成的Actions必须覆盖所有实体需求
- 共情表达适当性：ai_say内容必须表达适当共情
- 问题设计合理性：ai_ask问题必须符合渐进深入原则

**集成一致性（100%要求）**：

- 决策-规划一致性：Planner输出必须基于Decision的adjustmentPlan
- 变量命名一致性：变量名必须在Decision和Planner间保持一致
- 插入策略实现：生成的Actions必须符合insertionStrategy

### 9.2 迭代测试要求

本Story采用迭代测试方法，要求至少完成三轮测试：

**第一轮测试**：

- 目标：验证基础功能，识别主要问题
- 要求：覆盖所有核心场景（新实体、深化实体、跳过实体）
- 通过标准：总体分数≥80%

**第二轮测试**：

- 目标：优化发现的问题，提升输出质量
- 要求：针对第一轮发现的问题进行针对性优化
- 通过标准：总体分数≥90%

**第三轮测试**：

- 目标：验证最终版本，确保生产就绪
- 要求：所有场景达到100%通过率
- 通过标准：总体分数=100%

### 9.3 兼容性要求

**向后兼容性**：

- 新版本的Prompt模板必须兼容现有Topic脚本配置
- 新增字段必须为可选字段，不影响现有功能
- 模板结构变更必须提供迁移指南

**向前兼容性**：

- 代码层实现必须支持模板层的灵活扩展
- Schema定义必须支持新策略类型的添加
- 配置系统必须支持新字段的添加

### 9.4 性能要求

**响应时间**：

- Decision LLM调用：平均响应时间≤2秒
- Planner LLM调用：平均响应时间≤3秒
- 完整两阶段Pipeline：平均响应时间≤5秒

**资源使用**：

- 内存使用：单次调用内存增量≤50MB
- Token消耗：单次完整Pipeline≤2000 tokens

### 9.5 可观测性要求

**日志记录**：

- 每次LLM调用必须记录输入和输出
- 每次队列调整必须记录调整原因和结果
- 错误情况必须记录详细错误信息

**监控指标**：

- 成功率：Decision和Planner调用成功率≥99%
- 格式正确率：输出格式正确率≥99%
- 用户满意度：基于测试评估的用户满意度≥90%

---

## 10. 后续演进 - 已更新

> **说明**：以下设计已根据 2026-03-06 重构更新为两阶段 LLM Pipeline 架构。

本 Story 定位：为 Topic 层提供"队列动态调整"能力，以场景A为例实现，框架支持扩展：

- **场景B（话题延伸）**：在 Decision Prompt 中增加 `TOPIC_EXTENSION` 策略类型
- **场景C（条件跳过）**：使用 `SKIP_ENTITY` 类型和 intent='SKIP' 实现
- **场景D（情绪响应）**：增加 `EMOTION_RESPONSE` 策略类型，后续 Story 2.3 承担

**扩展方式**：仅需更新两个 Prompt Template 和 Schema 定义，无需修改代码逻辑。实现零编码场景扩展。

---

> 本 Story 在 Story 2.1 基础上，为 Topic 层提供通用的"队列动态调整"能力，采用两阶段 LLM Pipeline 架构（Decision → Planner → Execution），作为后续更复杂 Topic 智能（阻抗处理、策略性取舍、情绪响应等）的基础。
