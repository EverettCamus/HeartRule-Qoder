# Topic策略层提示词模板设计 (Story 2.2)

## 1. 概述

根据Story 2.2的设计，Topic策略层采用**二阶段决策模式**：

1. **模板A（决策层）**：判断是否需要调整Action队列
2. **模板B（队列生成层）**：如果需要调整，生成具体的Action队列结构

## 2. 模板A：Topic策略决策提示词

### 2.1 模板变量系统

| 变量名                           | 含义           | 示例值                                                                        |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `{%topic_goal%}`                 | Topic目标      | "收集来访者童年主要抚养者情况"                                                |
| `{%topic_strategy%}`             | Topic策略      | "使用CBT的探索性对话，温和引导，注意来访者情绪反应"                           |
| `{%current_action_summary%}`     | 当前Action概要 | "当前执行到Action2(妈妈)，正在询问妈妈的基本职业信息"                         |
| `{%current_topic_plan_summary%}` | TopicPlan进度  | "已完成：Action1(收集抚养者列表)，进行中：妈妈的两个模板Action，待执行：无"   |
| `{%entity_list_status%}`         | 实体列表状态   | "已识别实体：妈妈(进行中)，姥姥(未开始)；已处理：爸爸(已完成)；新识别：无"    |
| `{%time_and_state%}`             | 时间与状态     | "剩余时间：15分钟；用户状态：配合，情绪稳定"                                  |
| `{%conversation_summary%}`       | 对话摘要       | "来访者提到童年主要由妈妈和姥姥抚养，爸爸在6岁时离开，对妈妈有较强的情感依赖" |

### 2.2 完整提示词设计

````markdown
## ROLE: Topic策略决策专家

### 上下文信息

你是一个AI咨询引擎的Topic策略决策模块。负责判断当前Topic执行过程中是否需要调整Action队列结构。

**当前Topic目标**：
{%topic_goal%}

**Topic策略**：
{%topic_strategy%}

**Topic执行状态**：
{%current_topic_plan_summary%}

**当前正在执行的Action**：
{%current_action_summary%}

**已识别的实体状态**：
{%entity_list_status%}

**时间和用户状态**：
{%time_and_state%}

**最近对话摘要**：
{%conversation_summary%}

### 决策规则

你需要做出二分类决策：

1. **NO_CHANGE**：继续按现有Action队列执行，不需要调整结构
   - 适用情况：没有新实体需要处理，现有计划仍合理

2. **REPLAN_ACTION_QUEUE**：需要对后续Action队列进行结构性调整
   - 适用情况：
     a) **一对多实体展开**：在对话中新识别到需要逐一处理的实体（如多个抚养者、多个部门）
     b) **条件跳过**：用户明确拒绝或条件不满足需要跳过后续Actions
     c) **话题延伸**：用户跑题但内容对Topic目标有支撑价值
     d) **紧急情况**：检测到用户明显情绪波动或阻抗

### 决策输出要求

必须返回严格格式的JSON：

```json
{
  "decision": "NO_CHANGE" | "REPLAN_ACTION_QUEUE",
  "reason": "清晰的中文决策理由说明，不超过100字",
  "queue_replan_hint": {
    "target_entities": ["实体1", "实体2"], // 如果是一对多展开，列出需要处理的实体列表
    "replan_intent": "意图描述，如一：'对多个实体展开重复模板Actions'，'跳过因用户拒绝的后续Actions'",
    "constraints": "约束条件，如：'每个实体最多2个Actions，保持对话连续性'"
  }
}
```
````

### 特别注意

- 单个Action内部的微调由下层Action自己完成，Topic层只负责判断是否需要调整队列结构
- 如果发现新实体，请确保在target_entities中列出所有需要处理的新实体（包括部分已开始但未完成的）
- 决策理由应该基于当前上下文，而不是推测

````

## 3. 模板B：Action队列重构提示词

### 3.1 模板变量系统

| 变量名 | 含义 | 示例值 |
|--------|------|--------|
| `{%topic_goal%}` | Topic目标 | "收集来访者童年主要抚养者情况" |
| `{%topic_strategy%}` | Topic策略 | "使用CBT的探索性对话，温和引导，注意来访者情绪反应" |
| `{%replan_intent%}` | 重构意图 | "对新识别的实体'姥姥'展开重复的Action模板" |
| `{%target_entities%}` | 目标实体 | "姥姥" |
| `{%per_entity_action_outline%}` | 每个实体的Action大纲 | "1. 询问基本信息（职业、年龄、主要角色）\n2. 收集关系记忆（印象最深的事件、情感关系）" |
| `{%action_schema_constraints%}` | Action架构约束 | "允许的Action类型：ai_ask, ai_say; 每个Action必须有关联的实体变量; 输出变量需要按实体_类型命名" |
| `{%allowed_action_types%}` | 允许的Action类型 | "ai_ask, ai_say" |
| `{%max_actions_per_entity%}` | 每个实体最多Actions数 | 3 |
| `{%insert_position_description%}` | 插入位置描述 | "当前队列末尾，在妈妈的所有Actions之后" |

### 3.2 完整提示词设计

```markdown
## ROLE: Action队列生成专家

### 上下文信息
你需要根据Topic层的决策，生成具体的Action队列结构。当前决策需要重构队列。

**Topic目标**：
{%topic_goal%}

**Topic策略**：
{%topic_strategy%}

**重构意图**：
{%replan_intent%}

**目标实体**：
{%target_entities%}

**每个实体需要的行动大纲**：
{%per_entity_action_outline%}

**架构约束**：
{%action_schema_constraints%}

**允许的Action类型**：
{%allowed_action_types%}

**每个实体最多Actions数**：
{%max_actions_per_entity%}

**新Actions插入位置**：
{%insert_position_description%}

### 生成要求
你需要为**每个目标实体**生成一组Actions。这些Actions应该：
1. 遵循指定的行动大纲
2. 遵守架构约束
3. 保持对话的自然流畅性
4. 考虑咨询策略（如CBT的探索性对话）

### 输出格式
返回严格格式的JSON：

```json
{
  "new_actions": [
    {
      "action_id": "action_unique_id_1",
      "action_type": "ai_ask" | "ai_say",
      "entity_binding": "姥姥",
      "prompt_template": "询问具体问题的提示词，实体占位符用{entity}",
      "output_variable": "姥姥_基本信息",
      "metadata": {
        "step_in_flow": 1,
        "question_type": "fact_collection",
        "expected_response_format": "自由文本"
      }
    },
    {
      "action_id": "action_unique_id_2",
      "action_type": "ai_ask",
      "entity_binding": "姥姥",
      "prompt_template": "现在我想了解您与{entity}之间印象最深的一件事是什么？这件事给您带来了什么感受？",
      "output_variable": "姥姥_关系记忆",
      "metadata": {
        "step_in_flow": 2,
        "question_type": "emotional_exploration",
        "expected_response_format": "叙述性描述"
      }
    }
  ],
  "insertion_index": 3, // 在当前队列的第几个位置后插入（0-based）
  "constraints_applied": ["每个实体最多2个Actions", "保持对话连续性", "遵循CBT策略"]
}
````

### 注意事项

5. `action_id` 应该唯一，可以使用实体名+步骤+随机后缀
6. `prompt_template` 中可以用 {entity} 作为实体占位符，执行时会被替换
7. 保持对话的连贯性，避免重复问相同的问题
8. 考虑咨询策略，比如CBT需要温和引导而非直接质问

````

## 4. 模板管理配置示例

```json
{
  "decision_template": {
    "id": "topic_decision_v1",
    "name": "Topic策略决策模板",
    "description": "判断Topic是否需要调整Action队列",
    "content": "上述模板A的内容",
    "system_variables": [
      "topic_goal",
      "topic_strategy",
      "current_action_summary",
      "current_topic_plan_summary",
      "entity_list_status",
      "time_and_state",
      "conversation_summary"
    ],
    "output_schema": {
      "type": "object",
      "properties": {
        "decision": {"enum": ["NO_CHANGE", "REPLAN_ACTION_QUEUE"]},
        "reason": {"type": "string"},
        "queue_replan_hint": {
          "type": "object",
          "properties": {
            "target_entities": {"type": "array", "items": {"type": "string"}},
            "replan_intent": {"type": "string"},
            "constraints": {"type": "string"}
          }
        }
      }
    }
  },
  "replan_template": {
    "id": "queue_replan_v1",
    "name": "Action队列重构模板",
    "description": "生成具体的Action队列结构",
    "content": "上述模板B的内容",
    "system_variables": [
      "topic_goal",
      "topic_strategy",
      "replan_intent",
      "target_entities",
      "per_entity_action_outline",
      "action_schema_constraints",
      "allowed_action_types",
      "max_actions_per_entity",
      "insert_position_description"
    ],
    "output_schema": {
      "type": "object",
      "properties": {
        "new_actions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "action_id": {"type": "string"},
              "action_type": {"enum": ["ai_ask", "ai_say"]},
              "entity_binding": {"type": "string"},
              "prompt_template": {"type": "string"},
              "output_variable": {"type": "string"},
              "metadata": {
                "type": "object",
                "properties": {
                  "step_in_flow": {"type": "number"},
                  "question_type": {"type": "string"},
                  "expected_response_format": {"type": "string"}
                }
              }
            }
          }
        },
        "insertion_index": {"type": "number"},
        "constraints_applied": {"type": "array", "items": {"type": "string"}}
      }
    }
  }
}
````
