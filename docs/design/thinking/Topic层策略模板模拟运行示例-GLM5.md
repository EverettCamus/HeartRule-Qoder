# Topic Strategy 模拟运行示例

## 背景

本文档模拟一个心理咨询场景：收集来访者童年主要抚养者信息。采用 CBT（认知行为疗法）风格。

---

## 1. Topic 脚本定义

```yaml
topic:
  id: collect_childhood_caregivers
  name: 收集童年抚养者信息
  goal: |
    了解来访者童年时期的主要抚养者情况，包括抚养者的基本信息、与来访者的关系模式，
    为后续分析早期依恋模式和家庭动力提供基础。
  strategy: |
    1. 先了解有哪些抚养者
    2. 对每个抚养者，依次收集基础信息和关系记忆
    3. 保持开放态度，允许来访者在叙述中自然展开
  action_template_pattern: one_to_many_expansion
  actions:
    - id: ask_caregivers_list
      action_type: ai_ask
      config:
        prompt: |
          我想先了解一下，您小时候主要是谁在照顾您？
          比如父母、爷爷奶奶、外公外婆，或者其他长期照顾您的人。
          请告诉我有哪些人，我们后面会逐个聊聊。
        output_variable: caregiver_list
        style: warm_exploratory

    - id: template_caregiver_basic_info
      action_type: ai_ask
      is_template: true
      template_for: each_caregiver
      config:
        prompt: |
          我们来聊聊 {%current_object%} 的基本情况。
          请问 {%current_object%} 和您是什么关系？她/他今年多大年纪？
          她/他之前从事什么工作？您小时候和她/他生活在一起的时间大概是怎样的？
        output_variable: caregiver_basic_info_{%current_object%}
        style: factual_collection

    - id: template_caregiver_relationship_memory
      action_type: ai_ask
      is_template: true
      template_for: each_caregiver
      config:
        prompt: |
          关于 {%current_object%}，您印象最深的相处经历是什么？
          您小时候和她/他的关系怎么样？有没有什么特别温暖或者难忘的时刻？
        output_variable: caregiver_relationship_memory_{%current_object%}
        style: emotional_exploratory
```

### 脚本结构说明

| Action ID                              | 类型        | 说明                     |
| -------------------------------------- | ----------- | ------------------------ |
| ask_caregivers_list                    | 固定 Action | 开启话题，询问抚养者列表 |
| template_caregiver_basic_info          | 模板 Action | 收集单个抚养者的基础信息 |
| template_caregiver_relationship_memory | 模板 Action | 收集单个抚养者的关系记忆 |

---

## 2. 模拟执行过程

### 初始状态

```
Action 队列:
1. ask_caregivers_list
2. (模板待展开)

对象列表: []
```

---

### 第一步：执行 ask_caregivers_list

#### 给 LLM 的输入

```json
{
  "system_prompt": "你是一位温暖、专业的心理咨询师，擅长CBT方法。你的风格是温和探索、共情倾听。",
  "user_prompt": "我想先了解一下，您小时候主要是谁在照顾您？比如父母、爷爷奶奶、外公外婆，或者其他长期照顾您的人。请告诉我有哪些人，我们后面会逐个聊聊。",
  "conversation_history": []
}
```

#### LLM 输出（模拟）

```
您好，很高兴您愿意和我聊聊您的成长经历。

我想先了解一下，您小时候主要是谁在照顾您呢？比如父母、爷爷奶奶、外公外婆，或者其他长期照顾您的人。请告诉我有哪些人，我们后面会逐个聊聊。
```

#### 用户回复

```
我小时候主要是妈妈和姥姥在照顾我。爸爸常年在外地工作，难得回来一次。
```

#### Action 输出

```json
{
  "action_id": "ask_caregivers_list",
  "output_variable": "caregiver_list",
  "extracted_data": {
    "caregivers": ["妈妈", "姥姥"],
    "mentioned_but_not_primary": ["爸爸"]
  },
  "conversation_turn": {
    "role": "user",
    "content": "我小时候主要是妈妈和姥姥在照顾我。爸爸常年在外地工作，难得回来一次。"
  }
}
```

---

### 第二步：触发 Topic Strategy - 模板A（决策层）

#### 当前上下文

```json
{
  "topic_goal": "了解来访者童年时期的主要抚养者情况，包括抚养者的基本信息、与来访者的关系模式，为后续分析早期依恋模式和家庭动力提供基础。",
  "topic_strategy": "1. 先了解有哪些抚养者\n2. 对每个抚养者，依次收集基础信息和关系记忆\n3. 保持开放态度，允许来访者在叙述中自然展开",
  "action_template_pattern": "one_to_many_expansion",
  "current_action_summary": "ask_caregivers_list - 询问抚养者列表",
  "current_action_output": {
    "caregivers": ["妈妈", "姥姥"],
    "mentioned_but_not_primary": ["爸爸"]
  },
  "object_list_status": "当前无已处理对象",
  "conversation_summary": "咨询师询问抚养者情况，用户回答主要是妈妈和姥姥照顾，爸爸常年在外地。",
  "queue_remaining": "两个模板Action待展开"
}
```

#### 给模板A的完整输入

````
你是一个心理咨询流程编排助手，负责判断当前 Topic 的 Action 队列是否需要调整。

## Topic 目标
了解来访者童年时期的主要抚养者情况，包括抚养者的基本信息、与来访者的关系模式，为后续分析早期依恋模式和家庭动力提供基础。

## Topic 执行策略
1. 先了解有哪些抚养者
2. 对每个抚养者，依次收集基础信息和关系记忆
3. 保持开放态度，允许来访者在叙述中自然展开

## Action 模板模式
one_to_many_expansion - 针对识别到的多个对象，为每个对象展开一套 Action 序列

## 当前状态
- 当前 Action: ask_caregivers_list - 询问抚养者列表
- Action 输出: 识别到的抚养者: 妈妈、姥姥；提及但非主要抚养者: 爸爸
- 已识别对象: 无
- 队列剩余: template_caregiver_basic_info, template_caregiver_relationship_memory (模板待展开)

## 近期对话摘要
咨询师询问抚养者情况，用户回答主要是妈妈和姥姥照顾，爸爸常年在外地在工作。

## 决策规则

1. 如果识别到新的对象需要处理，且队列中没有针对该对象的 Action，输出 REPLAN_ACTION_QUEUE
2. 如果所有对象都已处理或有对应的 Action 在队列中，输出 NO_CHANGE
3. 如果用户明确表示停止当前话题，输出 REPLAN_ACTION_QUEUE 并在 hint 中说明跳过意图

## 输出格式

请以 JSON 格式输出决策结果：

```json
{
  "decision": "NO_CHANGE" 或 "REPLAN_ACTION_QUEUE",
  "reason": "决策原因的简短说明",
  "new_objects": ["新识别的对象列表，如果有的话"]
}
````

注意：只输出 JSON，不要有其他文字。

````

#### 模板A LLM 输出

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "识别到两个主要抚养者对象（妈妈、姥姥），需要为每个对象展开对应的 Action 序列来收集基础信息和关系记忆",
  "new_objects": ["妈妈", "姥姥"]
}
````

---

### 第三步：触发模板B（执行层）

#### 给模板B的完整输入

````
你是一个心理咨询流程编排助手，负责生成 Action 队列调整方案。

## Topic 目标
了解来访者童年时期的主要抚养者情况，包括抚养者的基本信息、与来访者的关系模式，为后续分析早期依恋模式和家庭动力提供基础。

## Action 模板定义
templates:
  - id: template_caregiver_basic_info
    action_type: ai_ask
    purpose: 收集单个抚养者的基本信息
    config_pattern:
      prompt: 我们来聊聊 {对象名} 的基本情况。请问 {对象名} 和您是什么关系？她/他今年多大年纪？她/他之前从事什么工作？您小时候和她/他生活在一起的时间大概是怎样的？
      output_variable: caregiver_basic_info_{对象名}
      style: factual_collection

  - id: template_caregiver_relationship_memory
    action_type: ai_ask
    purpose: 收集单个抚养者的关系记忆
    config_pattern:
      prompt: 关于 {对象名}，您印象最深的相处经历是什么？您小时候和她/他的关系怎么样？有没有什么特别温暖或者难忘的时刻？
      output_variable: caregiver_relationship_memory_{对象名}
      style: emotional_exploratory

## 调整需求
- 新对象: ["妈妈", "姥姥"]
- 已处理对象: 无
- 插入位置: 队列末尾

## 任务

为每个新对象生成对应的 Action 序列。请严格遵循模板定义，只替换对象相关的变量。

## 输出格式

请以 JSON 格式输出 Action 序列：

```json
{
  "actions": [
    {
      "action_type": "ai_ask",
      "target_object": "对象名称",
      "config": {
        "prompt": "针对该对象的具体提示词",
        "output_variable": "变量名"
      }
    }
  ],
  "insert_after": "插入位置标识，如 'last' 或具体 action id"
}
````

注意：

1. 输出变量名需要包含对象标识，避免变量名冲突
2. 每个对象生成完整的 Action 序列，保持同一对象的 Actions 连续
3. 只输出 JSON，不要有其他文字

````

#### 模板B LLM 输出

```json
{
  "actions": [
    {
      "action_type": "ai_ask",
      "id": "caregiver_basic_info_妈妈",
      "target_object": "妈妈",
      "config": {
        "prompt": "我们来聊聊妈妈的基本情况。请问妈妈和您是什么关系？她今年多大年纪？她之前从事什么工作？您小时候和她生活在一起的时间大概是怎样的？",
        "output_variable": "caregiver_basic_info_妈妈",
        "style": "factual_collection"
      }
    },
    {
      "action_type": "ai_ask",
      "id": "caregiver_relationship_memory_妈妈",
      "target_object": "妈妈",
      "config": {
        "prompt": "关于妈妈，您印象最深的相处经历是什么？您小时候和她的关系怎么样？有没有什么特别温暖或者难忘的时刻？",
        "output_variable": "caregiver_relationship_memory_妈妈",
        "style": "emotional_exploratory"
      }
    },
    {
      "action_type": "ai_ask",
      "id": "caregiver_basic_info_姥姥",
      "target_object": "姥姥",
      "config": {
        "prompt": "我们来聊聊姥姥的基本情况。请问姥姥和您是什么关系？她今年多大年纪？她之前从事什么工作？您小时候和她生活在一起的时间大概是怎样的？",
        "output_variable": "caregiver_basic_info_姥姥",
        "style": "factual_collection"
      }
    },
    {
      "action_type": "ai_ask",
      "id": "caregiver_relationship_memory_姥姥",
      "target_object": "姥姥",
      "config": {
        "prompt": "关于姥姥，您印象最深的相处经历是什么？您小时候和她的关系怎么样？有没有什么特别温暖或者难忘的时刻？",
        "output_variable": "caregiver_relationship_memory_姥姥",
        "style": "emotional_exploratory"
      }
    }
  ],
  "insert_after": "last"
}
````

#### 队列更新

```
更新后的 Action 队列:
1. [已完成] ask_caregivers_list
2. [待执行] caregiver_basic_info_妈妈
3. [待执行] caregiver_relationship_memory_妈妈
4. [待执行] caregiver_basic_info_姥姥
5. [待执行] caregiver_relationship_memory_姥姥

对象状态:
- 妈妈: 未开始
- 姥姥: 未开始
```

---

### 第四步：执行 caregiver*basic_info*妈妈

#### Action 配置

```json
{
  "action_type": "ai_ask",
  "id": "caregiver_basic_info_妈妈",
  "target_object": "妈妈",
  "config": {
    "prompt": "我们来聊聊妈妈的基本情况。请问妈妈和您是什么关系？她今年多大年纪？她之前从事什么工作？您小时候和她生活在一起的时间大概是怎样的？",
    "output_variable": "caregiver_basic_info_妈妈",
    "style": "factual_collection"
  }
}
```

#### 给 LLM 的输入

```json
{
  "system_prompt": "你是一位温暖、专业的心理咨询师，擅长CBT方法。当前风格：事实收集，温和但聚焦。",
  "conversation_history": [
    {
      "role": "assistant",
      "content": "您好，很高兴您愿意和我聊聊您的成长经历。我想先了解一下，您小时候主要是谁在照顾您？"
    },
    {
      "role": "user",
      "content": "我小时候主要是妈妈和姥姥在照顾我。爸爸常年在外地工作，难得回来一次。"
    }
  ],
  "user_prompt": "我们来聊聊妈妈的基本情况。请问妈妈和您是什么关系？她今年多大年纪？她之前从事什么工作？您小时候和她生活在一起的时间大概是怎样的？"
}
```

#### LLM 输出（模拟）

```
好的，我们来聊聊妈妈。

我的了解是她是您的主要抚养者之一。能告诉我更多关于她的基本情况吗？比如她今年多大年纪？她之前从事什么工作？您小时候和她生活在一起的时间大概是怎样的？
```

#### 用户回复

```
我妈妈今年52岁，她是个小学老师。小时候她工作比较忙，但我每天放学后都能看到她，她也会辅导我做作业。不过在她放学之前，主要是姥姥在照顾我。
```

#### Action 输出

```json
{
  "action_id": "caregiver_basic_info_妈妈",
  "output_variable": "caregiver_basic_info_妈妈",
  "extracted_data": {
    "age": "52岁",
    "occupation": "小学老师",
    "living_arrangement": "每天放学后在一起，她辅导作业",
    "primary_care_timing": "放学后，姥姥负责放学前的照顾"
  },
  "conversation_turn": {
    "role": "user",
    "content": "我妈妈今年52岁，她是个小学老师。小时候她工作比较忙，但我每天放学后都能看到她，她也会辅导我做作业。不过在她放学之前，主要是姥姥在照顾我。"
  }
}
```

#### 触发模板A检查

**上下文**：

```json
{
  "current_action_output": {
    "age": "52岁",
    "occupation": "小学老师",
    "living_arrangement": "每天放学后在一起，她辅导作业"
  },
  "object_list_status": "妈妈: 处理中（基础信息已收集）",
  "queue_remaining": "caregiver_relationship_memory_妈妈, caregiver_basic_info_姥姥, caregiver_relationship_memory_姥姥"
}
```

**LLM 输出**：

```json
{
  "decision": "NO_CHANGE",
  "reason": "用户回复仅补充了妈妈的背景信息，并确认了姥姥作为另一个抚养者的角色，没有识别到新的抚养者对象",
  "new_objects": []
}
```

**队列状态**：

```
Action 队列:
1. [已完成] ask_caregivers_list
2. [已完成] caregiver_basic_info_妈妈
3. [待执行] caregiver_relationship_memory_妈妈
4. [待执行] caregiver_basic_info_姥姥
5. [待执行] caregiver_relationship_memory_姥姥

对象状态:
- 妈妈: 进行中（基础信息已收集）
- 姥姥: 未开始
```

---

### 第五步：执行 caregiver*relationship_memory*妈妈

#### 给 LLM 的输入

```json
{
  "system_prompt": "你是一位温暖、专业的心理咨询师，擅长CBT方法。你的风格是情感探索、共情倾听。",
  "user_prompt": "关于妈妈，您印象最深的相处经历是什么？您小时候和她的关系怎么样？有没有什么特别温暖或者难忘的时刻？",
  "conversation_history": [
    { "role": "assistant", "content": "我想先了解一下，您小时候主要是谁在照顾您？" },
    {
      "role": "user",
      "content": "我小时候主要是妈妈和姥姥在照顾我。爸爸常年在外地工作，难得回来一次。"
    },
    {
      "role": "assistant",
      "content": "我们来聊聊妈妈的基本情况。请问妈妈和您是什么关系？她今年多大年纪？"
    },
    {
      "role": "user",
      "content": "妈妈今年52岁，她是会计，在一家国企上班。我小时候基本每天都能见到她，她下班后会辅导我作业。"
    }
  ]
}
```

#### LLM 输出（模拟）

```
关于妈妈，您最早的一些相处记忆是什么呢？

您小时候和她的关系怎么样？有没有什么让您觉得特别温暖或者难忘的时刻？
```

#### 用户回复

```
有一次我发烧，妈妈半夜起来给我煮粥，一直守在我床边。那时候其实姥姥也在，但妈妈说想自己照顾我。这件事我一直记得很清楚。小时候妈妈工作挺忙的，但她总是尽量抽时间陪我。不过有时候她也会因为工作压力大，对我的作业要求比较严格。还有个事想提一下，那时候其实外公也常来帮忙，虽然不是主要照顾我，但周末经常带我去公园玩。
```

#### Action 输出

```json
{
  "action_id": "caregiver_relationship_memory_妈妈",
  "output_variable": "caregiver_relationship_memory_妈妈",
  "extracted_data": {
    "key_memories": ["半夜发烧时妈妈照顾", "妈妈工作忙但尽量抽时间陪伴"],
    "relationship_quality": "温暖但有压力，妈妈因工作压力对作业要求严格",
    "mentioned_other": "外公经常周末带去公园玩"
  }
}
```

---

### 第六步：再次触发模板A - 检测新对象

#### 当前上下文

```json
{
  "topic_goal": "...",
  "topic_strategy": "...",
  "action_template_pattern": "one_to_many_expansion",
  "current_action_summary": "caregiver_relationship_memory_妈妈 - 收集妈妈的关系记忆",
  "current_action_output": {
    "key_memories": ["半夜发烧时妈妈照顾", "妈妈工作忙但尽量抽时间陪伴"],
    "relationship_quality": "温暖但有压力，妈妈因工作压力对作业要求严格",
    "mentioned_other": "外公经常周末带去公园玩"
  },
  "object_list_status": "妈妈: 进行中；姥姥: 未开始",
  "conversation_summary": "用户分享了与妈妈的温暖记忆，同时提到了外公周末也会带用户去公园玩。",
  "queue_remaining": "caregiver_basic_info_姥姥, caregiver_relationship_memory_姥姥"
}
```

#### 模板A LLM 输出

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "用户在描述中提到了'外公'，虽然不是主要抚养者，但有规律的互动（周末带去公园）。根据对话的开放性策略，可以考虑收集外公的信息。但需要注意，外公不是主要抚养者，建议询问用户是否愿意聊聊外公。",
  "new_objects": ["外公"]
}
```

**注意**：这里决策层做出了判断，但需要考虑：外公是否应该被添加为主要抚养者？

#### 引擎层判断

根据策略，外公是"提及的非主要抚养者"，可以：

1. 添加到对象列表，生成对应 Action
2. 或者跳过，因为主要抚养者是妈妈和姥姥

为了演示动态追加，假设引擎接受这个建议，为外公生成 Action。

---

### 第七步：模板B 为外公生成 Action

#### 模板B 输出

```json
{
  "actions": [
    {
      "action_type": "ai_ask",
      "id": "caregiver_basic_info_外公",
      "target_object": "外公",
      "config": {
        "prompt": "刚才您提到外公周末会带您去公园玩。我们来简单了解一下外公的情况。请问外公今年多大年纪？他之前从事什么工作？您和他相处的时间大概是怎样的？",
        "output_variable": "caregiver_basic_info_外公",
        "style": "factual_collection"
      }
    },
    {
      "action_type": "ai_ask",
      "id": "caregiver_relationship_memory_外公",
      "target_object": "外公",
      "config": {
        "prompt": "关于外公，您印象最深的相处经历是什么？周末在公园的那些时光，您还记得什么特别的时刻吗？",
        "output_variable": "caregiver_relationship_memory_外公",
        "style": "emotional_exploratory"
      }
    }
  ],
  "insert_after": "last"
}
```

#### 更新后的队列

```
Action 队列:
1. [已完成] ask_caregivers_list
2. [已完成] caregiver_basic_info_妈妈
3. [已完成] caregiver_relationship_memory_妈妈
4. [待执行] caregiver_basic_info_姥姥
5. [待执行] caregiver_relationship_memory_姥姥
6. [待执行] caregiver_basic_info_外公       ← 动态追加
7. [待执行] caregiver_relationship_memory_外公  ← 动态追加

对象状态:
- 妈妈: 已完成
- 姥姥: 未开始
- 外公: 未开始 (动态追加)
```

---

## 3. 执行流程总结

```
时间线
  │
  ├─ T1: 执行 ask_caregivers_list
  │       └─ 用户回答: 妈妈、姥姥
  │
  ├─ T2: 触发模板A (决策)
  │       └─ 决策: REPLAN_ACTION_QUEUE
  │       └─ 新对象: [妈妈, 姥姥]
  │
  ├─ T3: 触发模板B (执行)
  │       └─ 生成 4 个 Action (妈妈×2 + 姥姥×2)
  │
  ├─ T4: 执行 caregiver_basic_info_妈妈
  │       └─ 用户回答: 妈妈基本资料
  │
  ├─ T5: 触发模板A (决策)
  │       └─ 决策: NO_CHANGE
  │
  ├─ T6: 执行 caregiver_relationship_memory_妈妈
  │       └─ 用户回答: 提到外公
  │
  ├─ T7: 触发模板A (决策)
  │       └─ 决策: REPLAN_ACTION_QUEUE
  │       └─ 新对象: [外公]
  │
  ├─ T8: 触发模板B (执行)
  │       └─ 生成 2 个 Action (外公×2)
  │       └─ 动态追加到队列末尾
  │
  └─ T9+: 继续执行姥姥、外公的 Action...
```

---

## 4. 关键观察点

### 4.1 模板分离的优势

| 场景       | 模板A调用次数 | 模板B调用次数    |
| ---------- | ------------- | ---------------- |
| 本模拟     | 3次           | 2次              |
| 如果不分离 | -             | 3次 (更重的调用) |

模板A每次只需要做二分类判断，token消耗较少；模板B只在需要时调用，处理更复杂的生成任务。

### 4.2 对象识别时机

- **首次识别**：ask_caregivers_list 输出时，识别到 [妈妈, 姥姥]
- **动态追加**：caregiver*relationship_memory*妈妈 执行时，用户提到 [外公]

### 4.3 队列连续性

同一对象的 Actions 保持连续：

```
[妈妈-basic] → [妈妈-memory] → [姥姥-basic] → [姥姥-memory] → [外公-basic] → [外公-memory]
```

这种顺序有利于用户聚焦在单个对象上完成完整叙事。

---

## 5. 边界情况探讨

### 5.1 如果用户拒绝深入聊某个人？

**用户回复示例**：

```
我觉得外公的事不重要，可以不聊吗？
```

**模板A 决策**：

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "用户表示不想聊外公，建议跳过外公相关的 Action",
  "new_objects": [],
  "skip_objects": ["外公"]
}
```

**引擎处理**：从队列中移除外公相关的 Action。

### 5.2 如果用户一次性提到很多人？

**用户回复示例**：

```
我小时候可热闹了，妈妈、姥姥、姥爷、奶奶、小姨都照顾过我。
```

**模板A 决策**：

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "用户一次性提到了多个抚养者，需要确认哪些是主要的",
  "new_objects": ["妈妈", "姥姥", "姥爷", "奶奶", "小姨"]
}
```

**引擎处理**：可能需要插入一个确认 Action，询问用户哪些抚养者更主要，控制对话深度。

---

## 6. 结论

本模拟演示了：

1. ✅ **模板A/B 分离设计**：决策轻量化，生成按需触发
2. ✅ **动态 Action 展开**：从识别的对象列表生成 Action 序列
3. ✅ **过程中追加**：用户提到新对象时动态追加 Action
4. ✅ **执行连续性**：同一对象的 Actions 保持连续
5. ✅ **可观测性**：每步决策都有明确的 reason 记录

这套机制能够支撑真实咨询场景中的灵活对话需求。
