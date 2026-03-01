# Topic Strategy Prompt Templates Design

## Template A: Initial Entity Detection

```prompt
## Task
Analyze conversation history to detect multiple entities matching current topic focus

## Context
Topic Goal: {%topic_goal%}
Current Action Summary: {%current_action_summary%}
Conversation Summary: {%conversation_summary%}

## Output
{"entities": ["entity1"], "action": "EXPAND_QUEUE"|"NO_CHANGE"}

## Rules
1. Return EXPAND_QUEUE when multiple entities detected
2. Normalize similar names
```

## Template B: Runtime Entity Detection

```prompt
## Task
Detect NEW entities mentioned during action execution

## Context
Existing Entities: {%object_list_status%}
Current Action Output: {%current_action_output_summary%}

## Output
{"new_entities": ["entity"], "action": "APPEND_QUEUE"|"NO_APPEND"}
```

---

## Caregiver Identification Simulation

### Script Definition

```yaml
- action: ai_ask
  params:
    question: '请告诉我小时候主要的抚养人有哪些？'
    output_var: caregivers_initial

- action: ai_ask # Template action
  params:
    question: '关于{%当前对象%}，请描述TA与您的关系、年龄和职业'
    output_template: '{%当前对象%}_details'

- action: ai_ask # Template action
  params:
    question: '分享您和{%当前对象%}最重要的记忆'
    output_template: '{%当前对象%}_memories'
```

### Simulation Sequence

1. **Initial Action** (ai_ask):
   Input: Prompt for caregivers
   User Response: "主要是妈妈和姥姥"

2. **Trigger Template A**:
   Context:

   ```
   topic_goal: 收集童年抚养者信息
   current_action_summary: 询问所有抚养者
   conversation_summary: 用户提到妈妈和姥姥
   ```

   Output:

   ```json
   {
     "entities": ["妈妈", "姥姥"],
     "action": "EXPAND_QUEUE"
   }
   ```

   Queue Expansion:
   - 妈妈:
     1. 关系/年龄/职业询问
     2. 记忆询问
   - 姥姥:
     1. 关系/年龄/职业询问
     2. 记忆询问

3. **First Expanded Action**:
   Input: "关于妈妈，请描述TA与您的关系、年龄和职业"
   User Response: "妈妈是我主要照顾者，50岁左右，教师..."

4. **Second Expanded Action**:
   Input: "分享您和妈妈最重要的记忆"
   User Response: "七岁时生病她整夜照顾我...哦，其实姥爷也常接送我上学"

5. **Trigger Template B**:
   Context:
   ```
   existing_entities: ["妈妈", "姥姥"]
   current_action_output: 提到姥爷接送上下学
   ```
   Output:
   ```json
   {
     "new_entities": ["姥爷"],
     "action": "APPEND_QUEUE"
   }
   ```
   Queue Appended:
   - 姥爷:
     1. 关系/年龄/职业询问
     2. 记忆询问

Final Queue: [妈妈-基础, 妈妈-记忆, 姥姥-基础, 姥姥-记忆, 姥爷-基础, 姥爷-记忆]
