# Topic 层策略模板设计

## 概述

本文档定义了 Topic 意识层的两个核心提示词模板：

| 模板  | 名称       | 职责                           | 触发时机                            |
| ----- | ---------- | ------------------------------ | ----------------------------------- |
| 模板A | 决策层模板 | 判断是否需要调整 Action 队列   | 每个 Action 执行完成后              |
| 模板B | 执行层模板 | 生成具体的 Action 队列调整方案 | 决策结果为 `REPLAN_ACTION_QUEUE` 时 |

---

## 模板A：决策层模板

### 职责

判断当前 Topic 的 Action 队列是否需要结构性调整。

### 输入变量

| 变量名                        | 类型   | 说明                                    |
| ----------------------------- | ------ | --------------------------------------- |
| `{%topic_goal%}`              | string | Topic 的目标描述                        |
| `{%topic_strategy%}`          | string | Topic 的执行策略                        |
| `{%action_template_pattern%}` | string | Action 模板的模式说明（如"一对多展开"） |
| `{%current_action_summary%}`  | string | 当前执行的 Action 概要                  |
| `{%current_action_output%}`   | string | 当前 Action 输出的关键信息              |
| `{%object_list_status%}`      | string | 已识别对象及其处理状态                  |
| `{%conversation_summary%}`    | string | 近期对话摘要                            |
| `{%queue_remaining%}`         | string | 队列中剩余的 Action 列表                |

### 提示词模板

````
你是一个心理咨询流程编排助手，负责判断当前 Topic 的 Action 队列是否需要调整。

## Topic 目标
{%topic_goal%}

## Topic 执行策略
{%topic_strategy%}

## Action 模板模式
{%action_template_pattern%}

## 当前状态
- 当前 Action: {%current_action_summary%}
- Action 输出: {%current_action_output%}
- 已识别对象: {%object_list_status%}
- 队列剩余: {%queue_remaining%}

## 近期对话摘要
{%conversation_summary%}

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

### 输出示例

**场景：识别到新的抚养者对象**

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "用户在对话中提到了'姥姥'作为抚养者，当前对象列表中没有姥姥，需要为姥姥生成对应的 Action 序列",
  "new_objects": ["姥姥"]
}
````

**场景：无需调整**

```json
{
  "decision": "NO_CHANGE",
  "reason": "当前对象列表为空，无法判断是否有新对象；或用户未提及新的抚养者",
  "new_objects": []
}
```

---

## 模板B：执行层模板

### 职责

根据决策层输出，生成具体的 Action 队列调整方案。

### 输入变量

| 变量名                           | 类型   | 说明                             |
| -------------------------------- | ------ | -------------------------------- |
| `{%topic_goal%}`                 | string | Topic 的目标描述                 |
| `{%action_template_definition%}` | string | Action 模板的定义（YAML 格式）   |
| `{%new_objects%}`                | string | 需要生成 Action 的新对象列表     |
| `{%existing_objects%}`           | string | 已存在的对象及其处理状态         |
| `{%insert_position%}`            | string | Action 插入位置（末尾/当前之后） |

### 提示词模板

````
你是一个心理咨询流程编排助手，负责生成 Action 队列调整方案。

## Topic 目标
{%topic_goal%}

## Action 模板定义
{%action_template_definition%}

## 调整需求
- 新对象: {%new_objects%}
- 已处理对象: {%existing_objects%}
- 插入位置: {%insert_position%}

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

### 输出示例

```json
{
  "actions": [
    {
      "action_type": "ai_ask",
      "target_object": "姥姥",
      "config": {
        "prompt": "请聊聊姥姥的基本情况：她和您是什么亲属关系？她今年多大年纪？她之前从事什么工作？",
        "output_variable": "caregiver_basic_info_姥姥"
      }
    },
    {
      "action_type": "ai_ask",
      "target_object": "姥姥",
      "config": {
        "prompt": "关于姥姥，您印象最深的相处经历是什么？您小时候和她的关系怎么样？",
        "output_variable": "caregiver_relationship_memory_姥姥"
      }
    }
  ],
  "insert_after": "last"
}
````

---

## 两模板协作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Action 执行完成                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    调用模板A：决策层                             │
│  输入：Topic上下文 + 当前Action结果 + 对话历史 + 对象状态        │
│  输出：decision + reason + new_objects                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              NO_CHANGE          REPLAN_ACTION_QUEUE
                    │                   │
                    ▼                   ▼
              继续执行          ┌───────────────────┐
              下一个Action      │  调用模板B：执行层  │
                               │  输入：新对象 +     │
                               │        模板定义    │
                               │  输出：Action序列   │
                               └───────────────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │  插入Action到队列  │
                               └───────────────────┘
                                         │
                                         ▼
                               继续执行下一个Action
```

---

## 关键设计决策

### 1. 为什么分成两个模板？

| 考量           | 说明                                                |
| -------------- | --------------------------------------------------- |
| **复杂度分离** | 决策只需要判断"是/否"，生成方案需要更多上下文和逻辑 |
| **按需调用**   | 大多数情况是 NO_CHANGE，不需要调用 heavier 的模板B  |
| **独立调优**   | 两个模板可以独立迭代，互不影响                      |
| **可观测性**   | 决策日志和执行日志分开记录，便于问题定位            |

### 2. 为什么用 JSON 输出？

| 考量           | 说明                                            |
| -------------- | ----------------------------------------------- |
| **程序可解析** | JSON 可以直接转换为程序对象，无需额外的解析逻辑 |
| **结构化约束** | 强制模型输出结构化数据，减少格式错误            |
| **调试友好**   | JSON 格式便于人工阅读和验证                     |

### 3. 对象变量命名约定

为了避免不同对象的 Action 输出变量冲突，采用以下命名约定：

```
{action_type}_{purpose}_{object_name}
```

例如：

- `caregiver_basic_info_妈妈`
- `caregiver_basic_info_姥姥`
- `caregiver_relationship_memory_妈妈`
- `caregiver_relationship_memory_姥姥`

---

## 使用注意事项

1. **模板变量替换**：引擎层负责将上下文变量替换到模板中，确保变量值格式正确
2. **JSON 解析容错**：建议使用 json_repair 或类似库处理 LLM 输出中的 JSON 格式问题
3. **决策日志**：每次调用模板时记录完整输入输出，便于问题追溯
4. **超时处理**：设置合理的 LLM 调用超时，避免队列调整过程阻塞主流程
