# Topic Strategy 提示词模板设计与模拟

> 本文档设计 Topic Strategy 的提示词模板，并通过"收集抚养者信息"场景进行完整的模拟运行。

## 1. 提示词模板设计

### 1.1 模板设计思路

根据 Story 2.2 的需求，Topic 需要两种能力：

1. **决策能力**：判断是否需要调整 Action 队列
2. **展开能力**：根据识别的对象生成新的 Action 子队列

因此设计两个提示词模板：

- **模板A（决策模板）**：二分类决策，判断是否需要展开
- **模板B（展开模板）**：生成展开后的 Action 队列

---

## 2. 模板A：决策模板（Decision Template）

### 2.1 设计目标

判断当前 Topic 是否需要调整 Action 队列，支持以下场景：

- **场景A**：识别到多个需要逐一处理的对象（一对多展开）
- **场景B**：用户跑题但内容有支撑性（话题延伸）
- **场景C**：前置条件不满足（条件跳过）

### 2.2 提示词模板

````
# Role
你是一个心理咨询会话的 Topic 决策引擎。你的任务是分析当前会话状态，判断是否需要调整 Action 队列。

# Context
## Topic 信息
- **目标**：{%topic_goal%}
- **策略**：{%topic_strategy%}
- **当前 Action**：{%current_action_summary%}

## 执行状态
- **TopicPlan 进度**：{%current_topic_plan_summary%}
- **已识别对象**：{%object_list_status%}
- **时间与状态**：{%time_and_state%}

## 对话摘要
{%conversation_summary%}

# 任务
根据以上信息，判断是否需要调整 Action 队列。

## 决策类型
1. **NO_CHANGE**：继续按现有队列执行，无需调整
2. **REPLAN_ACTION_QUEUE**：需要调整队列结构

## 需要调整队列的典型场景
### 场景A：一对多对象展开
- 从对话中识别出多个需要逐一处理的对象（如多个抚养者、多个部门）
- 触发条件：对话中出现新的、未被处理的实体对象
- 判断要点：对象是否需要单独的 Action 子队列来处理

### 场景B：话题延伸
- 用户主动跑题，但跑题内容对当前 Topic 目标有支撑作用
- 判断要点：跑题内容是否值得短暂跟进（1-2个Action）

### 场景C：条件跳过
- 前置条件不满足（如用户明确拒绝、时间严重不足）
- 判断要点：是否需要跳过部分后续 Actions

# 输出格式
请以 JSON 格式输出决策结果：

```json
{
  "decision": "NO_CHANGE | REPLAN_ACTION_QUEUE",
  "reason": "决策原因的简要说明",
  "replan_context": {
    "scenario": "A | B | C | null",
    "trigger_description": "触发调整的具体描述",
    "detected_objects": ["对象1", "对象2"],
    "constraints": "约束条件说明"
  }
}
````

注意：

- 如果 decision 为 NO_CHANGE，replan_context 可以为 null
- detected_objects 仅在场景A时填写
- 请确保 JSON 格式正确，不要输出其他内容

```

### 2.3 模板变量说明

| 变量 | 类型 | 说明 |
|------|------|------|
| `{%topic_goal%}` | string | Topic 的目标描述 |
| `{%topic_strategy%}` | string | Topic 的执行策略 |
| `{%current_action_summary%}` | string | 当前正在执行的 Action 概要 |
| `{%current_topic_plan_summary%}` | string | TopicPlan 中所有 Topic 的进度概要 |
| `{%object_list_status%}` | string | 已识别对象及其处理状态（JSON格式） |
| `{%time_and_state%}` | string | 剩余时间、用户情绪状态等 |
| `{%conversation_summary%}` | string | 当前 Topic 下的对话摘要 |

---

## 3. 模板B：展开模板（Expansion Template）

### 3.1 设计目标

当决策为 `REPLAN_ACTION_QUEUE` 时，根据识别的对象和 Action 模板，生成展开后的 Action 队列。

### 3.2 提示词模板

```

# Role

你是一个心理咨询会话的 Action 队列生成引擎。你的任务是根据识别的对象和 Action 模板，生成展开后的 Action 队列。

# Context

## Topic 信息

- **目标**：{%topic_goal%}
- **策略**：{%topic_strategy%}

## 展开上下文

- **展开场景**：{%expansion_scenario%}
- **触发原因**：{%trigger_reason%}
- **已识别对象**：{%detected_objects%}
- **已处理对象**：{%processed_objects%}
- **约束条件**：{%constraints%}

## Action 模板定义

{%action_templates%}

## 当前队列状态

- **当前 Action**：{%current_action_summary%}
- **剩余队列**：{%remaining_queue%}

# 任务

根据以上信息，生成展开后的 Action 队列。

## 展开规则

### 场景A：一对多对象展开

1. 对每个新识别的、未处理的对象，生成完整的 Action 子队列
2. 子队列按照 Action 模板定义的顺序排列
3. 同一对象的 Actions 保持连续
4. 新增 Action 追加到当前 Action 之后

### 场景B：话题延伸

1. 生成 1-2 个跟进 Action，用于处理跑题内容
2. 跟进 Action 插入到当前位置
3. 保持与原主线的关联

### 场景C：条件跳过

1. 标记需要跳过的 Actions
2. 说明跳过原因

# 输出格式

请以 JSON 格式输出展开结果：

```json
{
  "expansion_type": "APPEND | INSERT | SKIP",
  "new_actions": [
    {
      "action_id": "唯一标识，格式：template_id_target_object",
      "action_type": "ai_ask | ai_say | ...",
      "template_ref": "引用的模板ID",
      "target_object": "处理的对象（场景A）",
      "goal": "该 Action 的目标",
      "prompt_hint": "给 LLM 的提示上下文",
      "output_var": "输出变量名，需区分对象"
    }
  ],
  "skip_actions": ["需要跳过的action_id列表"],
  "skip_reason": "跳过原因（如有）",
  "expansion_summary": "展开操作的整体说明"
}
```

## Action 模板变量替换规则

展开时需要对模板中的变量进行替换：

| 原始变量          | 替换规则                        |
| ----------------- | ------------------------------- |
| `{target_object}` | 替换为实际对象名（如"妈妈"）    |
| `{output_prefix}` | 替换为对象标识前缀（如"mom\_"） |

## 示例

假设检测到两个新对象"妈妈"和"姥姥"，Action 模板有两个：

- template_1: 询问抚养者基本信息
- template_2: 询问关系记忆

输出示例：

```json
{
  "expansion_type": "APPEND",
  "new_actions": [
    {
      "action_id": "ask_basic_mom",
      "action_type": "ai_ask",
      "template_ref": "template_1",
      "target_object": "妈妈",
      "goal": "收集妈妈的基本信息",
      "prompt_hint": "当前询问对象是妈妈的亲属关系、年龄、职业等基本信息",
      "output_var": "mom_basic_info"
    },
    {
      "action_id": "ask_memory_mom",
      "action_type": "ai_ask",
      "template_ref": "template_2",
      "target_object": "妈妈",
      "goal": "收集来访者对妈妈的关系记忆",
      "prompt_hint": "询问来访者童年时期与妈妈的互动记忆、关键事件",
      "output_var": "mom_relation_memory"
    },
    {
      "action_id": "ask_basic_grandma",
      "action_type": "ai_ask",
      "template_ref": "template_1",
      "target_object": "姥姥",
      "goal": "收集姥姥的基本信息",
      "prompt_hint": "当前询问对象是姥姥的亲属关系、年龄、职业等基本信息",
      "output_var": "grandma_basic_info"
    },
    {
      "action_id": "ask_memory_grandma",
      "action_type": "ai_ask",
      "template_ref": "template_2",
      "target_object": "姥姥",
      "goal": "收集来访者对姥姥的关系记忆",
      "prompt_hint": "询问来访者童年时期与姥姥的互动记忆、关键事件",
      "output_var": "grandma_relation_memory"
    }
  ],
  "skip_actions": [],
  "skip_reason": null,
  "expansion_summary": "检测到2个新抚养者对象（妈妈、姥姥），为每个对象生成2个Action，共4个新Action追加到队列末尾"
}
```

注意：

- 请确保 JSON 格式正确
- 同一对象的 Actions 应连续排列
- output_var 需要唯一，建议使用对象前缀区分

````

### 3.3 模板变量说明

| 变量 | 类型 | 说明 |
|------|------|------|
| `{%expansion_scenario%}` | string | 展开场景类型（A/B/C） |
| `{%trigger_reason%}` | string | 触发展开的具体原因 |
| `{%detected_objects%}` | string | 新识别的对象列表（JSON数组） |
| `{%processed_objects%}` | string | 已处理的对象列表（JSON数组） |
| `{%constraints%}` | string | 展开约束条件 |
| `{%action_templates%}` | string | Action 模板定义（YAML/JSON格式） |
| `{%remaining_queue%}` | string | 当前剩余的 Action 队列概要 |

---

## 4. 示例 Topic 脚本设计

### 4.1 Topic 定义（抚养者信息收集）

```yaml
# topic-caregiver-info.yaml
id: topic_caregiver_info
name: 收集抚养者信息
goal: |
  收集来访者童年时期主要抚养者的信息，包括抚养者身份、基本信息、以及来访者与各抚养者之间的关系记忆。
  这是CBT评估中理解来访者早期经历的重要环节。

strategy: |
  采用渐进式探询策略：
  1. 先开放式询问，让来访者自然回忆
  2. 对每个抚养者，先收集客观信息（关系、年龄、职业）
  3. 再探询主观体验（关系质量、关键记忆）
  4. 保持共情态度，避免评判

# Action 队列配置
actions:
  # Action 1: 开启话题，识别抚养者
  - id: ask_who_caregivers
    type: ai_ask
    goal: 开启抚养者话题，识别有哪些主要抚养者
    prompt_template: |
      你是一位温暖的咨询师，正在与来访者探讨童年经历。

      话题目标：{goal}

      请以自然、开放的方式开启这个话题，询问来访者童年时期主要由谁照顾。
      注意：
      - 语气温和、有共情
      - 使用开放式问题
      - 可以适当铺垫，说明了解早期抚养情况对咨询的意义

    output_schema:
      type: object
      properties:
        detected_caregivers:
          type: array
          description: 从用户回答中识别出的抚养者列表
          items:
            type: object
            properties:
              name:
                type: string
                description: 抚养者称呼（如妈妈、爸爸、姥姥等）
              mention_context:
                type: string
                description: 提及的上下文
    output_var: caregiver_list

  # Action 模板 1: 收集基本信息（用于动态展开）
  - id: template_ask_basic_info
    type: ai_ask
    is_template: true
    template_id: template_1
    template_params:
      target_object: "{target_object}"
    goal: 收集 {target_object} 的基本信息
    prompt_template: |
      你是一位专业的咨询师，正在采用CBT方法了解来访者的早期经历。

      当前任务：收集来访者关于 {target_object} 的基本信息

      已知信息：
      - 这是来访者童年时期的抚养者之一
      - 来访者提到过的上下文：{mention_context}

      请询问以下基本信息：
      1. 与来访者的亲属关系
      2. 在来访者童年时期的大致年龄
      3. 主要职业或日常角色

      注意：
      - 语气自然，可以结合之前对话的语境
      - 如果来访者提到多个抚养者，当前只询问 {target_object}
      - 保持一个询问的焦点，不要一次问太多

    output_schema:
      type: object
      properties:
        relationship:
          type: string
          description: 与来访者的关系
        age_range:
          type: string
          description: 来访者童年时期该抚养者的大致年龄
        occupation:
          type: string
          description: 主要职业或角色
        additional_notes:
          type: string
          description: 其他值得注意的信息
    output_var: "{output_prefix}_basic_info"

  # Action 模板 2: 收集关系记忆（用于动态展开）
  - id: template_ask_relation_memory
    type: ai_ask
    is_template: true
    template_id: template_2
    template_params:
      target_object: "{target_object}"
    goal: 收集来访者对 {target_object} 的关系记忆
    prompt_template: |
      你是一位专业的咨询师，正在采用CBT方法了解来访者的早期经历。

      当前任务：了解来访者童年时期与 {target_object} 的关系记忆

      已收集的基本信息：
      {basic_info_summary}

      请探询以下内容：
      1. 来访者与 {target_object} 的日常互动模式
      2. 印象深刻的积极记忆
      3. 印象深刻的消极记忆（如有）
      4. 来访者对这段关系的整体感受

      CBT要点：
      - 关注来访者的认知模式（如何看待这段关系）
      - 注意情感表达（不仅是描述事实，更要表达感受）
      - 避免评判，保持共情

    output_schema:
      type: object
      properties:
        interaction_pattern:
          type: string
          description: 日常互动模式描述
        positive_memories:
          type: array
          description: 积极记忆列表
          items:
            type: string
        negative_memories:
          type: array
          description: 消极记忆列表
          items:
            type: string
        overall_feeling:
          type: string
          description: 对关系的整体感受
        cognitive_notes:
          type: string
          description: CBT角度的认知模式观察
    output_var: "{output_prefix}_relation_memory"
````

---

## 5. 模拟运行：Topic 执行过程

### 5.1 执行环境设定

```
Session 信息：
- Session ID: session_001
- 当前 Phase: 评估阶段
- 用户：张先生，35岁，首次咨询

Topic 信息：
- Topic ID: topic_caregiver_info
- 开始时间: 10:05
- 初始 Action 队列: [ask_who_caregivers]
```

### 5.2 Action 1 执行：识别抚养者

#### 5.2.1 LLM 输入

```
# System Prompt
你是一位温暖的咨询师，正在与来访者探讨童年经历。

话题目标：收集来访者童年时期主要抚养者的信息，包括抚养者身份、基本信息、以及来访者与各抚养者之间的关系记忆。

请以自然、开放的方式开启这个话题，询问来访者童年时期主要由谁照顾。
注意：
- 语气温和、有共情
- 使用开放式问题
- 可以适当铺垫，说明了解早期抚养情况对咨询的意义

# 输出格式
请先输出你的问话内容，然后在最后以JSON格式输出提取的信息。

# 对话历史
[这是该话题的第一个问题]
```

#### 5.2.2 LLM 输出

````
张先生，在正式开始之前，我想先了解一下您的成长背景。

每个人的童年经历都会对我们产生深远的影响。为了更好地理解您现在的困扰，我想先请您回忆一下——在您小时候，主要是谁来照顾您长大的呢？比如是父母，还是其他长辈？

---

```json
{
  "question_type": "open_ended",
  "intent": "识别主要抚养者",
  "extracted_info": null
}
````

#### 5.2.3 用户回复

```
我小时候主要是妈妈和姥姥带大的。爸爸工作很忙，经常出差，基本不在家。
```

#### 5.2.4 Action 1 输出结果

```json
{
  "action_id": "ask_who_caregivers",
  "success": true,
  "output": {
    "detected_caregivers": [
      {
        "name": "妈妈",
        "mention_context": "主要抚养者之一，与姥姥共同照顾"
      },
      {
        "name": "姥姥",
        "mention_context": "主要抚养者之一，与妈妈共同照顾"
      }
    ],
    "excluded_caregivers": [
      {
        "name": "爸爸",
        "reason": "工作忙经常出差，基本不在家",
        "role": "非主要抚养者"
      }
    ]
  },
  "output_var": "caregiver_list"
}
```

---

## 6. 模拟运行：Topic Strategy 触发

### 6.1 触发时机

Action 1 执行完成后，引擎检测到：

- `caregiver_list.detected_caregivers` 包含 2 个对象
- 当前 Action 队列为空（Action 1 已完成）
- 需要判断是否展开队列

### 6.2 调用模板A（决策模板）

#### 6.2.1 LLM 输入

````
# Role
你是一个心理咨询会话的 Topic 决策引擎。你的任务是分析当前会话状态，判断是否需要调整 Action 队列。

# Context
## Topic 信息
- **目标**：收集来访者童年时期主要抚养者的信息，包括抚养者身份、基本信息、以及来访者与各抚养者之间的关系记忆。这是CBT评估中理解来访者早期经历的重要环节。
- **策略**：采用渐进式探询策略：1. 先开放式询问，让来访者自然回忆；2. 对每个抚养者，先收集客观信息（关系、年龄、职业）；3. 再探询主观体验（关系质量、关键记忆）；4. 保持共情态度，避免评判
- **当前 Action**：ask_who_caregivers（已完成）- 识别有哪些抚养者

## 执行状态
- **TopicPlan 进度**：评估阶段，当前为第2个Topic（已完成家庭结构了解）
- **已识别对象**：
  ```json
  {
    "detected": [
      {"name": "妈妈", "status": "pending", "mention_context": "主要抚养者之一"},
      {"name": "姥姥", "status": "pending", "mention_context": "主要抚养者之一"}
    ],
    "excluded": [
      {"name": "爸爸", "reason": "非主要抚养者"}
    ],
    "processed": []
  }
````

- **时间与状态**：剩余时间充足（评估阶段约30分钟，已用10分钟），用户情绪稳定，配合度高

## 对话摘要

```
[10:05] 咨询师: 张先生，在正式开始之前，我想先了解一下您的成长背景。每个人的童年经历都会对我们产生深远的影响。为了更好地理解您现在的困扰，我想先请您回忆一下——在您小时候，主要是谁来照顾您长大的呢？

[10:06] 来访者: 我小时候主要是妈妈和姥姥带大的。爸爸工作很忙，经常出差，基本不在家。
```

# 任务

根据以上信息，判断是否需要调整 Action 队列。

## 决策类型

1. **NO_CHANGE**：继续按现有队列执行，无需调整
2. **REPLAN_ACTION_QUEUE**：需要调整队列结构

## 需要调整队列的典型场景

### 场景A：一对多对象展开

- 从对话中识别出多个需要逐一处理的对象（如多个抚养者、多个部门）
- 触发条件：对话中出现新的、未被处理的实体对象
- 判断要点：对象是否需要单独的 Action 子队列来处理

### 场景B：话题延伸

- 用户主动跑题，但跑题内容对当前 Topic 目标有支撑作用
- 判断要点：跑题内容是否值得短暂跟进（1-2个Action）

### 场景C：条件跳过

- 前置条件不满足（如用户明确拒绝、时间严重不足）
- 判断要点：是否需要跳过部分后续 Actions

# 输出格式

请以 JSON 格式输出决策结果：

```json
{
  "decision": "NO_CHANGE | REPLAN_ACTION_QUEUE",
  "reason": "决策原因的简要说明",
  "replan_context": {
    "scenario": "A | B | C | null",
    "trigger_description": "触发调整的具体描述",
    "detected_objects": ["对象1", "对象2"],
    "constraints": "约束条件说明"
  }
}
```

注意：

- 如果 decision 为 NO_CHANGE，replan_context 可以为 null
- detected_objects 仅在场景A时填写
- 请确保 JSON 格式正确，不要输出其他内容

````

#### 6.2.2 LLM 输出

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "从 Action 1 的输出中识别到 2 个主要抚养者（妈妈、姥姥），需要为每个抚养者展开一套完整的探询流程（基本信息 + 关系记忆），以符合 Topic 策略中'对每个抚养者逐一深入探询'的要求。",
  "replan_context": {
    "scenario": "A",
    "trigger_description": "检测到多个抚养者对象，需要为每个对象生成独立的 Action 子队列",
    "detected_objects": ["妈妈", "姥姥"],
    "constraints": "同一抚养者的 Actions 应保持连续执行；按照 Topic 策略，先收集基本信息再探询关系记忆；保持共情态度"
  }
}
````

### 6.3 调用模板B（展开模板）

#### 6.3.1 LLM 输入

````
# Role
你是一个心理咨询会话的 Action 队列生成引擎。你的任务是根据识别的对象和 Action 模板，生成展开后的 Action 队列。

# Context
## Topic 信息
- **目标**：收集来访者童年时期主要抚养者的信息，包括抚养者身份、基本信息、以及来访者与各抚养者之间的关系记忆。
- **策略**：采用渐进式探询策略：1. 先开放式询问；2. 对每个抚养者，先收集客观信息；3. 再探询主观体验；4. 保持共情态度。

## 展开上下文
- **展开场景**：A（一对多对象展开）
- **触发原因**：检测到多个抚养者对象，需要为每个对象生成独立的 Action 子队列
- **已识别对象**：["妈妈", "姥姥"]
- **已处理对象**：[]
- **约束条件**：同一抚养者的 Actions 应保持连续执行；先基本信息后关系记忆

## Action 模板定义
```yaml
templates:
  - template_id: template_1
    action_type: ai_ask
    name: 收集基本信息
    description: 收集单个抚养者的基本资料（关系、年龄、职业）
    parameters:
      target_object: 目标抚养者名称
      mention_context: 首次提及的上下文

  - template_id: template_2
    action_type: ai_ask
    name: 收集关系记忆
    description: 收集来访者对该抚养者的关系记忆和情感体验
    parameters:
      target_object: 目标抚养者名称
      basic_info_summary: 已收集的基本信息摘要
````

## 当前队列状态

- **当前 Action**：ask_who_caregivers（已完成）
- **剩余队列**：[]（队列为空）

# 任务

根据以上信息，生成展开后的 Action 队列。

## 展开规则

### 场景A：一对多对象展开

1. 对每个新识别的、未处理的对象，生成完整的 Action 子队列
2. 子队列按照 Action 模板定义的顺序排列
3. 同一对象的 Actions 保持连续
4. 新增 Action 追加到当前 Action 之后

## Action 模板变量替换规则

展开时需要对模板中的变量进行替换：

| 原始变量          | 替换规则                        |
| ----------------- | ------------------------------- |
| `{target_object}` | 替换为实际对象名（如"妈妈"）    |
| `{output_prefix}` | 替换为对象标识前缀（如"mom\_"） |

# 输出格式

请以 JSON 格式输出展开结果：

```json
{
  "expansion_type": "APPEND | INSERT | SKIP",
  "new_actions": [
    {
      "action_id": "唯一标识",
      "action_type": "ai_ask | ai_say | ...",
      "template_ref": "引用的模板ID",
      "target_object": "处理的对象",
      "goal": "该 Action 的目标",
      "prompt_hint": "给 LLM 的提示上下文",
      "output_var": "输出变量名"
    }
  ],
  "skip_actions": [],
  "skip_reason": null,
  "expansion_summary": "展开操作的整体说明"
}
```

注意：

- 请确保 JSON 格式正确
- 同一对象的 Actions 应连续排列
- output_var 需要唯一，建议使用对象前缀区分

````

#### 6.3.2 LLM 输出

```json
{
  "expansion_type": "APPEND",
  "new_actions": [
    {
      "action_id": "ask_basic_mom",
      "action_type": "ai_ask",
      "template_ref": "template_1",
      "target_object": "妈妈",
      "goal": "收集妈妈的基本信息（关系、年龄、职业）",
      "prompt_hint": "来访者提到妈妈是主要抚养者之一，需要了解：1) 妈妈的具体身份和角色；2) 来访者童年时期妈妈的大致年龄；3) 妈妈的主要职业或日常角色。语气自然，结合之前对话语境。",
      "output_var": "mom_basic_info"
    },
    {
      "action_id": "ask_memory_mom",
      "action_type": "ai_ask",
      "template_ref": "template_2",
      "target_object": "妈妈",
      "goal": "收集来访者对妈妈的关系记忆",
      "prompt_hint": "在了解基本信息后，探询：1) 与妈妈的日常互动模式；2) 印象深刻的积极/消极记忆；3) 对这段关系的整体感受。关注CBT认知模式，避免评判。",
      "output_var": "mom_relation_memory"
    },
    {
      "action_id": "ask_basic_grandma",
      "action_type": "ai_ask",
      "template_ref": "template_1",
      "target_object": "姥姥",
      "goal": "收集姥姥的基本信息（关系、年龄、职业）",
      "prompt_hint": "来访者提到姥姥是另一位主要抚养者，需要了解：1) 姥姥与来访者的关系；2) 来访者童年时期姥姥的大致年龄；3) 姥姥的主要角色。语气自然过渡。",
      "output_var": "grandma_basic_info"
    },
    {
      "action_id": "ask_memory_grandma",
      "action_type": "ai_ask",
      "template_ref": "template_2",
      "target_object": "姥姥",
      "goal": "收集来访者对姥姥的关系记忆",
      "prompt_hint": "探询来访者与姥姥的关系：1) 日常互动模式；2) 印象深刻的记忆；3) 整体感受。注意与妈妈的关系可能有所不同，保持开放态度。",
      "output_var": "grandma_relation_memory"
    }
  ],
  "skip_actions": [],
  "skip_reason": null,
  "expansion_summary": "为2个抚养者对象（妈妈、姥姥）各生成2个Action（基本信息+关系记忆），共4个新Action追加到队列。同一对象的Actions连续排列。"
}
````

---

## 7. 展开后的队列执行模拟

### 7.1 新的 Action 队列

```
队列状态：
1. [已完成] ask_who_caregivers
2. [待执行] ask_basic_mom         ← 当前
3. [待执行] ask_memory_mom
4. [待执行] ask_basic_grandma
5. [待执行] ask_memory_grandma
```

### 7.2 Action 2 执行：收集妈妈基本信息

#### 7.2.1 LLM 输入

```
# System Prompt
你是一位专业的咨询师，正在采用CBT方法了解来访者的早期经历。

当前任务：收集来访者关于妈妈的基本信息

已知信息：
- 这是来访者童年时期的抚养者之一
- 来访者提到过的上下文：主要抚养者之一，与姥姥共同照顾

请询问以下基本信息：
1. 与来访者的亲属关系
2. 在来访者童年时期的大致年龄
3. 主要职业或日常角色

注意：
- 语气自然，可以结合之前对话的语境
- 如果来访者提到多个抚养者，当前只询问妈妈
- 保持一个询问的焦点，不要一次问太多

# 输出格式
请先输出你的问话内容，然后在最后以JSON格式输出提取的信息。

# 对话历史
[10:05] 咨询师: 张先生，在正式开始之前，我想先了解一下您的成长背景。每个人的童年经历都会对我们产生深远的影响。为了更好地理解您现在的困扰，我想先请您回忆一下——在您小时候，主要是谁来照顾您长大的呢？

[10:06] 来访者: 我小时候主要是妈妈和姥姥带大的。爸爸工作很忙，经常出差，基本不在家。
```

#### 7.2.2 LLM 输出

````
您提到小时候主要是妈妈和姥姥带大的。能跟我说说妈妈的情况吗？

比如，您小时候妈妈大概是做什么工作的？那时候她大概多大年纪？在家里主要扮演什么样的角色呢？

---

```json
{
  "question_type": "semi_structured",
  "target": "妈妈基本信息",
  "asked_aspects": ["职业", "年龄", "家庭角色"]
}
````

#### 7.2.3 用户回复

```
我妈妈那时候是小学老师，我小时候她大概三十多岁吧。她白天上班，晚上回来还要照顾我和做家务，挺辛苦的。
```

#### 7.2.4 Action 2 输出结果

```json
{
  "action_id": "ask_basic_mom",
  "success": true,
  "output": {
    "relationship": "母亲",
    "age_range": "30多岁（来访者童年时期）",
    "occupation": "小学老师",
    "additional_notes": "白天上班，晚上照顾家庭，较为辛苦"
  },
  "output_var": "mom_basic_info"
}
```

### 7.3 Action 3 执行：收集妈妈关系记忆

#### 7.3.1 LLM 输入

```
# System Prompt
你是一位专业的咨询师，正在采用CBT方法了解来访者的早期经历。

当前任务：了解来访者童年时期与妈妈的关系记忆

已收集的基本信息：
- 关系：母亲
- 年龄：30多岁（来访者童年时期）
- 职业：小学老师，白天上班晚上照顾家庭

请探询以下内容：
1. 来访者与妈妈的日常互动模式
2. 印象深刻的积极记忆
3. 印象深刻的消极记忆（如有）
4. 来访者对这段关系的整体感受

CBT要点：
- 关注来访者的认知模式（如何看待这段关系）
- 注意情感表达（不仅是描述事实，更要表达感受）
- 避免评判，保持共情

# 输出格式
请先输出你的问话内容，然后在最后以JSON格式输出提取的信息。

# 对话历史
[10:05] 咨询师: 张先生，在正式开始之前，我想先了解一下您的成长背景。每个人的童年经历都会对我们产生深远的影响。为了更好地理解您现在的困扰，我想先请您回忆一下——在您小时候，主要是谁来照顾您长大的呢？

[10:06] 来访者: 我小时候主要是妈妈和姥姥带大的。爸爸工作很忙，经常出差，基本不在家。

[10:07] 咨询师: 您提到小时候主要是妈妈和姥姥带大的。能跟我说说妈妈的情况吗？比如，您小时候妈妈大概是做什么工作的？那时候她大概多大年纪？在家里主要扮演什么样的角色呢？

[10:08] 来访者: 我妈妈那时候是小学老师，我小时候她大概三十多岁吧。她白天上班，晚上回来还要照顾我和做家务，挺辛苦的。
```

#### 7.3.2 LLM 输出

````
听得出妈妈那时候承担了很多。作为小学老师，白天要面对学生，晚上还要照顾您和打理家务，确实不容易。

我想请您回忆一下，童年时期和妈妈相处的时光——在您的印象里，和妈妈在一起的时候，都是什么样的场景呢？有没有哪些时刻或事情，您到现在还记得特别清楚？

---

```json
{
  "question_type": "open_memory_exploration",
  "target": "妈妈关系记忆",
  "approach": "场景回忆+关键事件探询"
}
````

#### 7.3.3 用户回复

```
印象最深的其实是妈妈陪我做作业。因为她是老师，对我的学习要求比较严。我记得有一次我考试没考好，她没有骂我，而是陪着我一起分析错题。那时候虽然有点紧张，但现在想想，那种被关注的感觉挺好的。

但也有让我害怕的时候，就是她工作压力大的时候，回家会有点烦躁，语气不太好。小时候我不太理解，会觉得是自己做错了什么。
```

#### 7.3.4 Action 3 输出结果

```json
{
  "action_id": "ask_memory_mom",
  "success": true,
  "output": {
    "interaction_pattern": "学习辅导是主要互动场景，妈妈要求较严格但方式温和",
    "positive_memories": ["考试没考好时妈妈没有责骂而是陪分析错题，感受到被关注"],
    "negative_memories": ["妈妈工作压力大时回家烦躁、语气不好，来访者会感到害怕并自责"],
    "overall_feeling": "复杂情感：一方面感激妈妈的付出和关注，另一方面对妈妈的情绪波动感到不解和不安",
    "cognitive_notes": "存在'妈妈烦躁=我做错什么'的认知联结，值得后续CBT工作中探索这种归因模式"
  },
  "output_var": "mom_relation_memory"
}
```

---

## 8. 总结

### 8.1 模板设计要点

| 模板          | 触发时机          | 核心职责             | 输出                  |
| ------------- | ----------------- | -------------------- | --------------------- |
| 模板A（决策） | Action 执行完成后 | 判断是否需要调整队列 | 二分类决策 + 场景识别 |
| 模板B（展开） | 决策为 REPLAN 时  | 生成新 Action 队列   | 具体的 Action 列表    |

### 8.2 设计优势

1. **职责分离**：决策和生成分开，便于调试和优化
2. **扩展性强**：新增场景只需在模板中添加判断逻辑
3. **可控性好**：所有展开决策都有明确的 reasoning 记录
4. **模板复用**：同一套模板可应用于不同 Topic

### 8.3 后续优化方向

1. **增量检测**：当 Action 3 执行中发现新抚养者（如"还有奶奶偶尔来"），可再次触发策略进行追加
2. **优先级调整**：根据用户情绪或信息重要性，调整 Action 执行顺序
3. **条件合并**：当检测到对象过于相似时，可智能合并询问

---

> 文档版本：v1.0
> 创建日期：2026-02-26
> 关联文档：Story-2.2-Topic动态展开Action队列-智能能力需求.md
