# Topic策略层提示词模拟示例

## 1. 示例Topic脚本定义

```yaml
# topic: 收集童年主要抚养者情况
topic_id: 'childhood_caregivers'
topic_goal: '收集来访者童年主要抚养者情况，为后续CBT分析提供基础资料'
topic_strategy: '使用CBT的探索性对话，温和引导，注意来访者情绪反应，保持非评判性态度'

actions:
  - action_id: 'ask_caregivers_list'
    action_type: 'ai_ask'
    prompt: '我想了解一下您童年时期的主要抚养者有哪些？比如父母、祖父母、其他亲属等。'
    output_variable: 'caregivers_list'
    metadata:
      step: 1
      purpose: '识别需要处理的实体列表'

  # 以下两个actions声明为模板（针对单个抚养者）
  - action_id: 'ask_caregiver_basic_info_template'
    action_type: 'ai_ask'
    template: true
    entity_binding: true
    prompt_template: '关于{caregiver_entity}，可以告诉我一些基本情况吗？比如与您的关系、大概年龄、职业等？'
    output_variable_template: '{caregiver_entity}_basic_info'
    metadata:
      step: 2
      purpose: '收集抚养者基本信息'

  - action_id: 'ask_caregiver_memory_template'
    action_type: 'ai_ask'
    template: true
    entity_binding: true
    prompt_template: '您与{caregiver_entity}之间，印象最深的一件事是什么？这件事给您带来了什么感受？'
    output_variable_template: '{caregiver_entity}_relationship_memory'
    metadata:
      step: 3
      purpose: '收集情感记忆资料'
```

## 2. 初始Action队列执行模拟

### 2.1 执行Action1: ask_caregivers_list

**引擎给LLM的输入（Action层）**：

```
角色：CBT咨询师
当前Topic：收集童年主要抚养者情况
目标：温和引导来访者列出主要抚养者

请根据以下提示进行提问：
我想了解一下您童年时期的主要抚养者有哪些？比如父母、祖父母、其他亲属等。
```

**模拟用户/LLM回复**：

```
我的童年主要由妈妈和姥姥抚养。妈妈在我小时候一直照顾我，姥姥在我3-7岁时也经常照顾我。
```

**引擎处理输出**：

- 提取实体：["妈妈", "姥姥"]
- 设置变量：`caregivers_list = "妈妈和姥姥"`

### 2.2 Topic策略层第一次决策（Action1执行后）

**引擎调用模板A的输入（变量注入后）**：

```
## ROLE: Topic策略决策专家

### 上下文信息
你是一个AI咨询引擎的Topic策略决策模块。负责判断当前Topic执行过程中是否需要调整Action队列结构。

**当前Topic目标**：
收集来访者童年主要抚养者情况，为后续CBT分析提供基础资料

**Topic策略**：
使用CBT的探索性对话，温和引导，注意来访者情绪反应，保持非评判性态度

**Topic执行状态**：
已完成：Action1(ask_caregivers_list)，待执行：无

**当前正在执行的Action**：
刚刚完成Action1，识别出抚养者：妈妈、姥姥

**已识别的实体状态**：
已识别实体：妈妈(未开始)，姥姥(未开始)；已处理：无；新识别：妈妈、姥姥

**时间和用户状态**：
剩余时间：20分钟；用户状态：配合，情绪稳定

**最近对话摘要**：
来访者提到童年主要由妈妈和姥姥抚养，妈妈一直照顾，姥姥在3-7岁时经常照顾

### 决策规则
你需要做出二分类决策：

1. **NO_CHANGE**：继续按现有Action队列执行，不需要调整结构
2. **REPLAN_ACTION_QUEUE**：需要对后续Action队列进行结构性调整

### 决策输出要求
必须返回严格格式的JSON：
```

**模拟LLM（模板A）输出**：

```json
{
  "decision": "REPLAN_ACTION_QUEUE",
  "reason": "识别到两个需要处理的实体（妈妈、姥姥），需要对每个实体展开重复的Action模板，实现一对多实体展开",
  "queue_replan_hint": {
    "target_entities": ["妈妈", "姥姥"],
    "replan_intent": "对多个抚养者实体展开重复的Action模板（基本信息收集+关系记忆收集）",
    "constraints": "每个实体最多2个Actions，按实体顺序展开，保持对话连续性，遵循CBT温和引导策略"
  }
}
```

### 2.3 引擎调用模板B生成新Actions

**引擎调用模板B的输入（变量注入后）**：

```
## ROLE: Action队列生成专家

### 上下文信息
你需要根据Topic层的决策，生成具体的Action队列结构。当前决策需要重构队列。

**Topic目标**：
收集来访者童年主要抚养者情况，为后续CBT分析提供基础资料

**Topic策略**：
使用CBT的探索性对话，温和引导，注意来访者情绪反应，保持非评判性态度

**重构意图**：
对多个抚养者实体展开重复的Action模板（基本信息收集+关系记忆收集）

**目标实体**：
妈妈, 姥姥

**每个实体需要的行动大纲**：
1. 询问基本信息（与来访者的关系、大概年龄、职业等）
2. 收集关系记忆（印象最深的事件、带来的感受）

**架构约束**：
允许的Action类型：ai_ask, ai_say; 每个Action必须关联实体变量; 输出变量按实体_类型命名

**允许的Action类型**：
ai_ask, ai_say

**每个实体最多Actions数**：
3

**新Actions插入位置**：
当前队列末尾（Action1之后），第一个实体（妈妈）的Actions先插入

### 生成要求
你需要为**每个目标实体**生成一组Actions。

### 输出格式
返回严格格式的JSON：
```

**模拟LLM（模板B）输出**：

```json
{
  "new_actions": [
    {
      "action_id": "ask_mom_basic_info_001",
      "action_type": "ai_ask",
      "entity_binding": "妈妈",
      "prompt_template": "关于妈妈，可以告诉我一些基本情况吗？比如与您的关系、大概年龄、职业等？",
      "output_variable": "妈妈_basic_info",
      "metadata": {
        "step_in_flow": 1,
        "question_type": "fact_collection",
        "expected_response_format": "自由文本",
        "cbt_consideration": "温和引导，避免质问语气"
      }
    },
    {
      "action_id": "ask_mom_memory_002",
      "action_type": "ai_ask",
      "entity_binding": "妈妈",
      "prompt_template": "您与妈妈之间，印象最深的一件事是什么？这件事给您带来了什么感受？",
      "output_variable": "妈妈_relationship_memory",
      "metadata": {
        "step_in_flow": 2,
        "question_type": "emotional_exploration",
        "expected_response_format": "叙述性描述",
        "cbt_consideration": "关注感受而非评判，使用开放性提问"
      }
    },
    {
      "action_id": "ask_grandma_basic_info_003",
      "action_type": "ai_ask",
      "entity_binding": "姥姥",
      "prompt_template": "关于姥姥，可以告诉我一些基本情况吗？比如与您的关系、大概年龄、职业等？",
      "output_variable": "姥姥_basic_info",
      "metadata": {
        "step_in_flow": 3,
        "question_type": "fact_collection",
        "expected_response_format": "自由文本"
      }
    },
    {
      "action_id": "ask_grandma_memory_004",
      "action_type": "ai_ask",
      "entity_binding": "姥姥",
      "prompt_template": "您与姥姥之间，印象最深的一件事是什么？这件事给您带来了什么感受？",
      "output_variable": "姥姥_relationship_memory",
      "metadata": {
        "step_in_flow": 4,
        "question_type": "emotional_exploration",
        "expected_response_format": "叙述性描述"
      }
    }
  ],
  "insertion_index": 1,
  "constraints_applied": [
    "每个实体最多2个Actions",
    "保持对话连续性",
    "遵循CBT策略",
    "按实体顺序展开"
  ]
}
```

## 3. 重构后的Action队列执行

### 3.1 执行Action2: ask_mom_basic_info_001

**引擎给LLM的输入**：

```
角色：CBT咨询师
当前Topic：收集童年主要抚养者情况
目标：温和引导，非评判性态度

请根据以下提示进行提问：
关于妈妈，可以告诉我一些基本情况吗？比如与您的关系、大概年龄、职业等？
```

**模拟用户/LLM回复**：

```
妈妈是我的亲生母亲，她今年58岁，退休前是小学老师。从我出生就一直照顾我。
```

**引擎处理输出**：

- 设置变量：`妈妈_basic_info = "妈妈是我的亲生母亲，她今年58岁，退休前是小学老师。从我出生就一直照顾我。"`

### 3.2 执行Action3: ask_mom_memory_002

**引擎给LLM的输入**：

```
角色：CBT咨询师
当前Topic：收集童年主要抚养者情况
目标：温和引导，关注感受而非评判

请根据以下提示进行提问：
您与妈妈之间，印象最深的一件事是什么？这件事给您带来了什么感受？
```

**模拟用户/LLM回复**：

```
印象最深的是我7岁发烧时，妈妈整夜守在我床边，用湿毛巾给我降温。那时候感觉很温暖、很安全。
```

**引擎处理输出**：

- 设置变量：`妈妈_relationship_memory = "7岁发烧时妈妈整夜守候，感觉温暖安全"`

### 3.3 执行Action4: ask_grandma_basic_info_003

**引擎给LLM的输入**：

```
角色：CBT咨询师
当前Topic：收集童年主要抚养者情况
目标：温和引导，非评判性态度

请根据以下提示进行提问：
关于姥姥，可以告诉我一些基本情况吗？比如与您的关系、大概年龄、职业等？
```

**模拟用户/LLM回复**：

```
姥姥是我妈妈的母亲，今年82岁，一直从事家务。她在我3-7岁时经常照顾我。
```

**引擎处理输出**：

- 设置变量：`姥姥_basic_info = "姥姥是我妈妈的母亲，今年82岁，一直从事家务。她在我3-7岁时经常照顾我。"`

### 3.4 执行Action5: ask_grandma_memory_004

**引擎给LLM的输入**：

```
角色：CBT咨询师
当前Topic：收集童年主要抚养者情况
目标：温和引导，关注感受而非评判

请根据以下提示进行提问：
您与姥姥之间，印象最深的一件事是什么？这件事给您带来了什么感受？
```

**模拟用户/LLM回复**：

```
记得姥姥总是给我做饺子吃，特别是冬天的时候。那时候感觉很幸福，但现在有点难过，因为她已经不太记得我了。
```

**引擎处理输出**：

- 设置变量：`姥姥_relationship_memory = "姥姥总做饺子吃，感觉幸福，现在难过因为她不太记得我了"`

## 4. 第二次策略决策（所有Actions执行后）

**引擎调用模板A的输入（Action5执行后）**：

```
## ROLE: Topic策略决策专家

### 上下文信息

**当前Topic目标**：
收集来访者童年主要抚养者情况，为后续CBT分析提供基础资料

**Topic策略**：
使用CBT的探索性对话，温和引导，注意来访者情绪反应，保持非评判性态度

**Topic执行状态**：
已完成：Action1(ask_caregivers_list)，Action2(妈妈基本信息)，Action3(妈妈关系记忆)，Action4(姥姥基本信息)，Action5(姥姥关系记忆)；待执行：无

**当前正在执行的Action**：
刚刚完成Action5(姥姥关系记忆)

**已识别的实体状态**：
已识别实体：妈妈(已完成)，姥姥(已完成)；已处理：妈妈、姥姥；新识别：无

**时间和用户状态**：
剩余时间：10分钟；用户状态：配合，情绪略有波动（提到姥姥时有些难过）

**最近对话摘要**：
来访者分享了妈妈和姥姥的基本信息和记忆。提到妈妈在发烧时守夜感到温暖安全，姥姥做饺子感到幸福但现在有些难过因为姥姥不太记得她了

### 决策输出要求
```

**模拟LLM（模板A）输出**：

```json
{
  "decision": "NO_CHANGE",
  "reason": "所有已识别实体（妈妈、姥姥）均已处理完毕，没有新实体出现，现有队列已执行完成，Topic目标基本达成",
  "queue_replan_hint": {
    "target_entities": [],
    "replan_intent": "",
    "constraints": ""
  }
}
```

## 5. 总结

### 5.1 动态展开效果

初始Action队列：

```
1. ask_caregivers_list (识别实体)
```

动态展开后队列：

```
1. ask_caregivers_list (识别实体：妈妈、姥姥)
2. ask_mom_basic_info_001 (妈妈基本信息)
3. ask_mom_memory_002 (妈妈关系记忆)
4. ask_grandma_basic_info_003 (姥姥基本信息)
5. ask_grandma_memory_004 (姥姥关系记忆)
```

### 5.2 收集的数据

```
caregivers_list = "妈妈和姥姥"
妈妈_basic_info = "妈妈是亲生母亲，58岁，退休小学老师"
妈妈_relationship_memory = "7岁发烧时妈妈整夜守候，感觉温暖安全"
姥姥_basic_info = "姥姥是妈妈的母亲，82岁，从事家务"
姥姥_relationship_memory = "姥姥总做饺子吃，感觉幸福，现在难过因为她不太记得我了"
```

### 5.3 智能决策点

1. **实体识别**：从第一个Action中提取"妈妈"、"姥姥"两个实体
2. **队列扩展**：自动为每个实体生成2个Actions（基本信息+关系记忆）
3. **执行顺序**：按实体顺序依次处理，保持对话连贯性
4. **策略调整**：遵循CBT的温和引导、非评判性态度

这个示例展示了HeartRule Topic策略层如何实现"一对多实体展开"的智能能力，使咨询脚本能够动态适应实际情况，大大减少脚本作者的重复工作。
