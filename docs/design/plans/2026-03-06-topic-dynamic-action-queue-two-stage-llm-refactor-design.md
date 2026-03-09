# Story 2.2 重构设计：两阶段LLM驱动的Topic Action队列动态调整

**文档日期**: 2026-03-06
**设计者**: HeartRule Team
**状态**: 待实施

---

## 1. 设计背景

### 1.1 当前实现问题

Story 2.2 当前实现将"一对多实体展开"的业务逻辑硬编码在代码层：

**问题1：实体识别硬编码**

```typescript
// IntelligentTopicPlanner.extractEntitiesFromConversation (line 267-270)
const caregiverPattern = /(爸爸|妈妈|父亲|母亲|爷爷|奶奶|外公|外婆|祖父|祖母|哥哥|姐姐|弟弟|妹妹)/g;
const matches = message.content.match(caregiverPattern);
```

- 只能匹配中文亲属称谓
- 无法扩展到其他实体类型（如部门、角色）
- 新场景需要修改代码

**问题2：队列展开策略硬编码**

```typescript
// IntelligentTopicPlanner.expandQueueForEntities (line 329-350)
for (const entityName of entityNames) {
  const entity = entityListManager.addEntity(entityName);
  for (const template of templates) {
    const entityActions = template.instantiateForEntity(entity);
    result = this.queueExpansionService.appendActions(currentQueue, entityActions);
  }
}
```

- 机械化的"逐个遍历+追加到末尾"逻辑
- 无法支持复杂的实体混合策略（如爸爸3个actions、妈妈2个actions、根据对话动态决定）
- 插入位置固定，无法灵活调整

**问题3：Action生成未实现**

```typescript
// TopicDecisionService.generateReplannedActions (line 90-101)
async generateReplannedActions(...): Promise<any[]> {
  // 基础实现：返回空数组
  // 实际实现中会调用LLM生成新的Action配置
  return [];
}
```

- 当前是空实现，本应调用LLM生成Action配置但未完成

### 1.2 设计目标

基于与用户的讨论，本设计旨在实现：

1. **决策到执行全流程Prompt化**
   - 引入两阶段LLM Pipeline：决策层→规划层→执行层
   - 代码层只负责LLM编排、结果验证和队列操作
   - 几乎所有业务逻辑转移到prompts层

2. **零编码场景扩展**
   - 未来任何新场景（情绪响应、阻抗处理、条件跳过）只需更新prompt
   - 无需修改代码即可支持新的决策模式

3. **领域专家可迭代**
   - Prompt即策略文档，领域专家可直接迭代
   - 降低技术门槛，提高迭代效率

4. **灵活的实体混合策略**
   - 支持不同实体分配不同数量的actions
   - 由LLM根据对话动态决定每个实体的处理深度
   - 支持NEW/EXTEND/DEEPEN/SKIP等不同意图

---

## 2. 整体架构设计

### 2.1 两阶段LLM Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  IntelligentTopicPlanner (应用层协调者)                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. 构建上下文                                        │  │
│  │    - 对话历史 + Topic配置 + 实体状态                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. Stage 1: StrategicDecisionLLM                     │  │
│  │    输入: 上下文 + Decision Prompt                     │  │
│  │    输出: {决策 + 调整思路} (JSON)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                  │
│                     needsAdjustment?                       │
│                    ┌───────┴───────┐                       │
│                    │               │                       │
│                 NO YES             NO                       │
│                    │               │                       │
│                    ↓               ↓                       │
│              返回原队列    ┌────────────────────┐          │
│                             │ 3. Stage 2:       │          │
│                             │ ActionPlannerLLM  │          │
│                             │ 输入: 调整思路     │          │
│                             │      + Planner P. │          │
│                             │ 输出: Action YAML  │          │
│                             └────────────────────┘          │
│                                    ↓                        │
│                      ┌─────────────────────────────┐       │
│                      │ 4. 结果验证与转换           │       │
│                      │    - YAML解析               │       │
│                      │    - Schema验证             │       │
│                      │    - ActionConfig[]         │       │
│                      └─────────────────────────────┘       │
│                                    ↓                        │
│                      ┌─────────────────────────────┐       │
│                      │ 5. 队列执行                  │       │
│                      │    - QueueExpansionService  │       │
│                      │    - 可观测性记录            │       │
│                      └─────────────────────────────┘       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 代码层职责（极简）

| 职责           | 说明                                       |
| -------------- | ------------------------------------------ |
| LLM调用编排    | 按顺序调用两个prompt，传递合适的上下文     |
| JSON/YAML解析  | 将LLM输出解析为结构化对象                  |
| Schema验证     | 使用Zod验证ActionConfig合法性              |
| 队列操作执行   | 基于QueueExpansionService执行插入/追加操作 |
| 错误处理与降级 | LLM失败时回退到NO_CHANGE或保留原队列       |

**关键点**：

- 代码层不做任何业务判断（"是否需要调整"、"如何调整"都由LLM决定）
- 代码层只负责"编排"和"执行"

### 2.3 核心服务类

```
IntelligentTopicPlanner (应用层协调者)
├── TopicDecisionService (领域服务)
│   ├── buildDecisionPrompt() - 构建决策提示词
│   ├── callLLM() - 调用决策LLM
│   └── parseDecisionOutput() - 解析决策JSON
│
├── TopicPlannerService (领域服务，新增)
│   ├── buildPlannerPrompt() - 构建规划提示词
│   ├── callLLM() - 调用规划LLM
│   └── parsePlannerOutput() - 解析Action YAML
│
└── QueueExpansionService (已有，无需修改)
    └── 实际执行队列操作
```

---

## 3. Decision Prompt Schema设计

### 3.1 顶层Schema

```typescript
interface DecisionOutput {
  /**
   * 是否需要调整Action队列
   * - Stage 2条件：当为true时才调用Planner Prompt
   * - 代码层用途：控制流程分支
   */
  needsAdjustment: boolean;

  /**
   * 调整策略类型
   * - Stage 2用途：引导LLM选择合适的YAML生成方式
   * - 代码层用途：日志记录、可观测性
   */
  strategy: 'NEW_ENTITIES' | 'DEEPEN_ENTITY' | 'SKIP_ENTITY' | 'REORDER_ACTIONS' | 'CUSTOM';

  /**
   * 决策推理过程
   * - 代码层用途：日志记录、调试、可观测性
   */
  reasoning: string;

  /**
   * 调整计划（核心字段）
   * - Stage 2用途：作为Planner Prompt的输入
   * - 代码层用途：验证实体数量、估算Actions数量
   */
  adjustmentPlan: AdjustmentPlan;

  /**
   * 执行约束（可选）
   * - Stage 2用途：限制Actions生成的边界
   * - 代码层用途：熔断保护、资源控制
   */
  constraints?: Constraints;
}
```

### 3.2 AdjustmentPlan Schema

```typescript
interface AdjustmentPlan {
  /**
   * 需要处理/调整的实体列表
   */
  entities: EntityPlan[];

  /**
   * 全局Action插入策略
   * - 代码层用途：执行队列操作
   */
  insertionStrategy: 'APPEND_TO_END' | 'INSERT_AFTER_CURRENT' | 'INSERT_BEFORE_TOPIC_END';

  /**
   * 目标插入位置（按需提供）
   */
  targetPosition?: {
    afterActionId?: string;
    positionIndex?: number;
  };
}
```

### 3.3 EntityPlan Schema

```typescript
interface EntityPlan {
  /**
   * 实体名称
   * - Stage 2用途：在生成Action时引用
   * - 代码层用途：去重规范化
   */
  entityName: string;

  /**
   * 实体处理意图
   */
  intent: 'NEW' | 'EXTEND' | 'DEEPEN' | 'SKIP';

  /**
   * 需要的Actions描述
   * - Stage 2用途：主要输入，决定生成哪些Actions
   */
  actionsNeeded: ActionDescription[];

  /**
   * 上下文信息（可选）
   * - Stage 2用途：帮助生成更精准的Action内容
   */
  context?: {
    conversationSnippet?: string;
    existingKnowledge?: string;
    emotionalTone?: string;
  };
}
```

### 3.4 ActionDescription Schema

```typescript
interface ActionDescription {
  /**
   * Action类型
   */
  type: 'ai_ask' | 'ai_say' | 'ai_think' | 'use_skill';

  /**
   * Action目的描述
   * - Stage 2用途：引导LLM生成具体prompt
   */
  purpose: string;

  /**
   * 变量提取目标（仅ai_ask需要）
   */
  variableTargets?: VariableTarget[];

  /**
   * 优先级
   */
  priority: 'high' | 'medium' | 'low';
}
```

### 3.5 Constraints Schema

```typescript
interface Constraints {
  maxTotalActions?: number;
  maxActionsPerEntity?: number;
  timeBudgetMinutes?: number;
  forbiddenActionTypes?: string[];
}
```

---

## 4. Planner Prompt Schema设计

### 4.1 输出格式

Planner Prompt输出YAML格式，解析后符合`ActionConfig[]`类型：

```yaml
actions:
  - action_type: 'ai_say'
    action_id: '唯一ID'
    config:
      content: '要说的话'
      max_rounds: 1

  - action_type: 'ai_ask'
    action_id: '唯一ID'
    config:
      content: '问题文本'
      output:
        - get: '变量名'
          define: '变量定义'
          extraction_method: 'llm'
      max_rounds: 2
```

### 4.2 Action类型配置规范

#### ai_say

```yaml
必需字段：
- action_type: "ai_say"
- action_id: string
- config.content: string

可选字段：
- config.max_rounds: number (默认1)
- config.say_goal: string
```

#### ai_ask

```yaml
必需字段：
- action_type: "ai_ask"
- action_id: string
- config.content: string
- config.output: array OR config.target_variable: string

config.output格式：
  - get: string (变量名)
    define: string (变量定义)
    extraction_method?: string

可选字段：
- config.max_rounds: number (默认3)
- config.required: boolean
- config.extraction_prompt: string
```

#### ai_think

```yaml
必需字段：
- action_type: "ai_think"
- action_id: string
- config.think_goal: string
- config.input_variables: array<string>
- config.output_variables: array<string>

可选字段：
- config.prompt_template: string
```

#### use_skill

```yaml
必需字段：
- action_type: "use_skill"
- action_id: string
- config.skill_id: string

可选字段：
- config.skill_parameters: object
- config.output_variables: array<string>
```

### 4.3 变量命名规范

**嵌套实体变量**：

```
格式: {entity_type}_{index}_{variable_suffix}
示例: caregiver_1_name, caregiver_2_relationship
```

**动态索引分配**：

- 按adjustmentPlan.entities中的顺序分配索引0, 1, 2...
- 已存在的实体保留原索引
- 新实体按顺序分配新索引

---

## 5. Prompt模板设计

### 5.1 Decision Prompt Template

**核心功能**：

1. 接受Topic的goal和strategy作为指导
2. 分析对话上下文识别实体需求
3. 生成结构化的调整计划
4. 支持复杂的实体混合策略

**主要章节**：

- 当前Topic信息
- 对话上下文
- 决策指南（什么时候需要/不需要调整）
- 策略类型选择
- 实体处理意图选择
- Action描述指导
- 约束条件
- 输出格式
- 示例
  **关键指导原则**：

- 渐进深入：先基本信息→关系史→深层记忆
- 语句自然：避免列表式问题
- 灵活适配：NEW/EXTEND/DEEPEN不同意图对应不同数量actions
- 情绪敏感：根据emotionalTone调整问题语气

### 5.1.1 Decision Prompt Template 详细结构

````markdown
# Topic决策引擎 - Decision Prompt Template

## 系统角色与上下文

你是HeartRule AI咨询引擎的Topic决策专家。你的任务是分析当前对话上下文，判断是否需要调整Action队列，并生成结构化的调整计划。

## 当前Topic信息

- **Topic ID**: {{topic_id}}
- **Topic目标**: {{topic_goal}}
- **Topic策略**: {{topic_strategy}}
- **当前进度**: {{topic_progress}}%

## 对话上下文

{{conversation_history}}

## 已识别实体状态

{{existing_entities}}

## 决策指南

### 何时需要调整（needsAdjustment = true）

1. **发现新实体**：对话中提及未处理过的实体（如新出现的抚养者）
2. **实体需要深化**：已处理实体但信息不完整，需要追问细节
3. **对话转向**：用户主动提及相关但未计划的话题
4. **情绪信号**：用户表达强烈情绪，需要针对性响应

### 何时不需要调整（needsAdjustment = false）

1. **信息已充分**：当前实体信息收集已达到目标
2. **用户抗拒**：用户明确表示不愿继续当前话题
3. **时间/资源限制**：已达到会话时间或资源上限
4. **Topic已完成**：Topic目标已达成，无需进一步行动

## 策略类型选择指南

根据调整需求选择合适的strategy：

- **NEW_ENTITIES**：发现新实体需要处理
- **DEEPEN_ENTITY**：深化已有实体的信息收集
- **SKIP_ENTITY**：跳过某些实体（用户抗拒或无关）
- **REORDER_ACTIONS**：重新排序现有Actions
- **CUSTOM**：自定义调整策略

## 实体处理意图选择

为每个实体选择合适的intent：

- **NEW**：全新实体，需要完整信息收集流程
- **EXTEND**：已有实体，补充额外信息
- **DEEPEN**：深化已有实体的情感/关系维度
- **SKIP**：跳过该实体处理

## Action描述指导

为每个实体描述需要的Actions：

### ai_say类型

- 用途：引导话题、提供解释、建立信任
- 示例："引出妈妈的话题，建立情感连接"

### ai_ask类型

- 用途：收集信息、追问细节、探索感受
- 示例："询问妈妈的基本信息（姓名、关系、角色）"
- 变量提取：明确需要提取的变量名和定义

### ai_think类型

- 用途：内部认知加工、情感分析、模式识别
- 示例："评估与妈妈的情感连接质量"

### use_skill类型

- 用途：调用特定咨询技术
- 示例："使用苏格拉底式提问探索亲子关系"

## 约束条件

{{constraints}}

## 输出格式

你必须输出严格的JSON格式，符合以下Schema：

```json
{
  "needsAdjustment": boolean,
  "strategy": "NEW_ENTITIES" | "DEEPEN_ENTITY" | "SKIP_ENTITY" | "REORDER_ACTIONS" | "CUSTOM",
  "reasoning": "string（决策推理过程）",
  "adjustmentPlan": {
    "entities": [
      {
        "entityName": "string",
        "intent": "NEW" | "EXTEND" | "DEEPEN" | "SKIP",
        "actionsNeeded": [
          {
            "type": "ai_say" | "ai_ask" | "ai_think" | "use_skill",
            "purpose": "string",
            "priority": "high" | "medium" | "low",
            "variableTargets": ["string"]  // 仅ai_ask需要
          }
        ],
        "context": {
          "conversationSnippet": "string",
          "existingKnowledge": "string",
          "emotionalTone": "string"
        }
      }
    ],
    "insertionStrategy": "APPEND_TO_END" | "INSERT_AFTER_CURRENT" | "INSERT_BEFORE_TOPIC_END",
    "targetPosition": {
      "afterActionId": "string",
      "positionIndex": number
    }
  },
  "constraints": {
    "maxTotalActions": number,
    "maxActionsPerEntity": number,
    "timeBudgetMinutes": number,
    "forbiddenActionTypes": ["string"]
  }
}
```
````

## 示例

{{decision_example}}

---

````

### 5.1.2 变量替换机制

Decision Prompt使用两层变量替换系统：

#### 系统层变量（{%变量名%}）
- 来源：系统运行时注入
- 示例：{%time%}, {%session_id%}, {%user_id%}
- 替换时机：Prompt构建时

#### 模板层变量（{{变量名}}）
- 来源：Topic配置或运行时计算
- 示例：{{topic_goal}}, {{conversation_history}}, {{existing_entities}}
- 替换时机：Prompt构建时

#### 动态内容块（{{#if 条件}}内容{{/if}}）
- 用途：条件性包含内容块
- 示例：{{#if has_emotional_tone}}情绪分析指导...{{/if}}
- 实现：使用ConditionalTemplate类处理

### 5.1.3 Topic节点配置示例

```yaml
topic:
  id: "collect_caregiver_info"
  goal: "收集来访者童年主要抚养者信息"
  strategy: "progressive_deepening"
  decision_prompt_config:
    # 系统层变量注入
    system_variables:
      time: "{%time%}"
      who: "{%who%}"
      user: "{%user%}"

    # 模板层变量定义
    template_variables:
      topic_goal: "收集来访者童年主要抚养者信息"
      topic_strategy: "渐进深入：先基本信息，再关系史，最后深层记忆"
      constraints: |
        最大总Actions数：10
        每个实体最大Actions数：4
        时间预算：5分钟
        禁止的Action类型：[]

    # 条件内容块配置
    conditional_blocks:
      - condition: "has_emotional_context"
        content: |
          情绪敏感指导：
          根据用户情绪调整问题语气，避免触发防御反应
      - condition: "has_time_pressure"
        content: |
          时间约束：优先收集关键信息，跳过非必要追问

    # 示例配置
    examples:
      - scenario: "发现新实体"
        input: "对话：'主要是爸爸，后来妈妈也回来了。对了，外公也经常来帮忙。'"
        output: |
          {
            "needsAdjustment": true,
            "strategy": "NEW_ENTITIES",
            "reasoning": "发现'妈妈'和'外公'两个新实体，爸爸需要补充关系史",
            "adjustmentPlan": { ... }
          }
````

---

### 5.2 Planner Prompt Template

**核心功能**：

1. 接受Stage 1的adjustmentPlan作为输入
2. 结合Topic的goal和strategy，生成Action YAML
3. 严格按照ActionConfig Schema输出

### 5.2.1 Planner Prompt Template 详细结构

````markdown
# Topic规划引擎 - Planner Prompt Template

## 系统角色与上下文

你是HeartRule AI咨询引擎的Topic规划专家。你的任务是根据决策引擎的输出，生成具体的Action YAML配置。

## Topic信息

- **Topic ID**: {{topic_id}}
- **Topic目标**: {{topic_goal}}
- **Topic策略**: {{topic_strategy}}

## 调整计划输入

以下是决策引擎生成的调整计划：

```json
{{adjustment_plan_json}}
```
````

## 实体索引分配表

基于adjustmentPlan.entities，分配实体索引：

| 实体名称 | 实体类型 | 分配索引 | 处理意图 |
| -------- | -------- | -------- | -------- |

{{#each entities}}
| {{entityName}} | caregiver | {{@index}} | {{intent}} |
{{/each}}

**索引分配规则**：

1. 按entities数组顺序分配索引0, 1, 2...
2. 已存在的实体保留原索引
3. 新实体按顺序分配新索引

## Action配置规范

### ai_say Action规范

```yaml
必需字段：
- action_type: "ai_say"
- action_id: "{entity_type}_{index}_{purpose_slug}"
- config.content: "string（要说的话）"

可选字段：
- config.max_rounds: number（默认1）
- config.say_goal: "string（说话目的）"
```

**内容设计原则**：

- 自然过渡：从当前对话自然引出新话题
- 建立信任：表达共情和理解
- 明确目的：简要说明为什么要问这些问题

### ai_ask Action规范

```yaml
必需字段：
- action_type: "ai_ask"
- action_id: "{entity_type}_{index}_{variable_suffix}"
- config.content: "string（问题文本）"
- config.output: array 或 config.target_variable: string

config.output格式：
  - get: "string（变量名）"
    define: "string（变量定义）"
    extraction_method?: "direct" | "pattern" | "llm"

可选字段：
- config.max_rounds: number（默认3）
- config.required: boolean
- config.extraction_prompt: string
```

**问题设计原则**：

1. **渐进深入**：从简单事实→关系描述→情感体验
2. **开放引导**：使用开放式问题，避免是/否回答
3. **单一焦点**：每个问题聚焦一个主题
4. **变量明确**：明确要提取的变量名和定义

### ai_think Action规范

```yaml
必需字段：
- action_type: "ai_think"
- action_id: "{entity_type}_{index}_think_{purpose_slug}"
- config.think_goal: "string（思考目标）"
- config.input_variables: ["string"]
- config.output_variables: ["string"]

可选字段：
- config.prompt_template: string
```

**思考目标设计**：

- 分析模式：识别关系模式、情感模式
- 评估质量：评估关系质量、情感连接
- 生成洞察：基于已有信息生成专业洞察

### use_skill Action规范

```yaml
必需字段：
- action_type: "use_skill"
- action_id: "{entity_type}_{index}_skill_{skill_name}"
- config.skill_id: "string"

可选字段：
- config.skill_parameters: object
- config.output_variables: ["string"]
```

## Action ID命名规范

### 命名格式

```
{entity_type}_{index}_{purpose_slug}
```

**字段说明**：

- `entity_type`：实体类型（如caregiver、department、role）
- `index`：实体索引（从0开始）
- `purpose_slug`：用途简写（小写字母+下划线）

### 示例

- `caregiver_0_say_welcome`：欢迎爸爸的ai_say
- `caregiver_1_ask_basic_info`：询问妈妈基本信息的ai_ask
- `caregiver_2_think_emotional_connection`：评估与外公情感连接的ai_think

## 变量命名规范

### 嵌套实体变量格式

```
{entity_type}_{index}_{variable_suffix}
```

**示例**：

- `caregiver_0_name`：爸爸的姓名
- `caregiver_1_relationship`：与妈妈的关系类型
- `caregiver_2_childhood_memory`：与外公的童年记忆

### 变量后缀规范

| 后缀         | 含义     | 示例                             |
| ------------ | -------- | -------------------------------- |
| name         | 姓名     | caregiver_0_name                 |
| relationship | 关系类型 | caregiver_1_relationship         |
| role         | 角色描述 | caregiver_2_role                 |
| memory       | 记忆描述 | caregiver_0_childhood_memory     |
| emotion      | 情感体验 | caregiver_1_emotional_tone       |
| quality      | 关系质量 | caregiver_2_relationship_quality |

## 输出格式

你必须输出严格的YAML格式，符合ActionConfig[] Schema：

```yaml
actions:
  - action_type: 'ai_say'
    action_id: 'caregiver_1_say_welcome'
    config:
      content: |
        接下来，我想了解一下您妈妈的情况。
        了解童年抚养者情况有助于理解您的成长经历。
      max_rounds: 1

  - action_type: 'ai_ask'
    action_id: 'caregiver_1_ask_basic_info'
    config:
      content: |
        请问您妈妈的姓名是什么？
        您和她的关系如何（亲近/疏远/较为复杂）？
        在您的成长过程中，她扮演了怎样的角色？
      output:
        - get: 'caregiver_1_name'
          define: '妈妈的姓名'
          extraction_method: 'direct'
        - get: 'caregiver_1_relationship'
          define: '与妈妈的关系类型'
          extraction_method: 'llm'
      max_rounds: 2

  # ... 更多actions
```

## 示例

{{planner_example}}

---

````

### 5.2.2 变量替换与模板继承

Planner Prompt继承Decision Prompt的变量替换系统，并增加规划层特定变量：

#### 输入变量（{{变量名}}）
- `{{adjustment_plan_json}}`：Stage 1输出的完整JSON
- `{{entities}}`：实体列表，用于生成索引分配表
- `{{topic_goal}}`, `{{topic_strategy}}`：从Topic配置继承

#### 模板片段（{{>片段名}}）
- 用途：复用常见的Action配置模板
- 示例：{{>ai_ask_basic_info_template}}
- 实现：使用ModularTemplate类组合

#### 循环结构（{{#each items}}内容{{/each}}）
- 用途：遍历实体列表生成配置
- 示例：{{#each entities}}生成{{entityName}}的Actions...{{/each}}
- 实现：使用ConditionalTemplate类处理

### 5.2.3 Topic节点配置示例（续）

```yaml
topic:
  id: "collect_caregiver_info"
  goal: "收集来访者童年主要抚养者信息"
  strategy: "progressive_deepening"

  planner_prompt_config:
    # 输入变量绑定
    input_variables:
      adjustment_plan_json: "{{adjustment_plan_json}}"
      entities: "{{adjustment_plan.entities}}"

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
      - for: "entities"
        template: |
          # 处理实体：{{entityName}}
          {{>ai_say_transition_template}}
          {{>ai_ask_basic_info_template}}
          {{#if needs_deepening}}
          {{>ai_ask_deepening_template}}
          {{/if}}

    # 示例配置
    examples:
      - scenario: "新实体处理"
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
````

---

## 5.3 脚本配置与模板逻辑的边界

### 5.3.1 职责分离原则

两阶段LLM Pipeline遵循明确的职责分离：

| 层面       | 配置位置         | 职责                          | 修改频率               |
| ---------- | ---------------- | ----------------------------- | ---------------------- |
| **脚本层** | YAML脚本文件     | 定义Topic目标、策略、约束     | 低（领域知识变化时）   |
| **模板层** | Prompt模板文件   | 定义决策/规划逻辑、指导原则   | 中（Prompt优化迭代时） |
| **代码层** | TypeScript源代码 | 实现LLM调用、解析、验证、执行 | 极低（架构变更时）     |

### 5.3.2 脚本层配置（YAML）

脚本层负责领域知识的具体化，配置在Topic YAML文件中：

```yaml
topic:
  id: 'collect_caregiver_info'
  goal: '收集来访者童年主要抚养者信息'
  strategy: 'progressive_deepening'

  # 决策提示词配置
  decision_prompt_config:
    system_variables:
      time: '{%time%}'
      who: '{%who%}'
    template_variables:
      topic_goal: '收集来访者童年主要抚养者信息'
      topic_strategy: '渐进深入：先基本信息，再关系史，最后深层记忆'
    constraints: |
      最大总Actions数：10
      每个实体最大Actions数：4
    examples:
      - scenario: '发现新实体'
        input: "对话：'主要是爸爸，后来妈妈也回来了。'"
        output: '{...}'

  # 规划提示词配置
  planner_prompt_config:
    input_variables:
      adjustment_plan_json: '{{adjustment_plan_json}}'
    template_fragments:
      ai_ask_basic_info_template: '...'
    examples:
      - scenario: '新实体处理'
        input: '{...}'
        output: 'actions: [...]'
```

**脚本层关注点**：

- 具体的领域目标（收集什么信息）
- 具体的策略（如何收集）
- 具体的约束（资源限制）
- 具体的示例（典型场景）

### 5.3.3 模板层逻辑（Prompt Templates）

模板层负责决策/规划的通用逻辑，存储在独立的Prompt模板文件中：

```markdown
# Topic决策引擎 - Decision Prompt Template

## 系统角色与上下文

你是HeartRule AI咨询引擎的Topic决策专家...

## 决策指南

### 何时需要调整（needsAdjustment = true）

1. **发现新实体**：对话中提及未处理过的实体...
2. **实体需要深化**：已处理实体但信息不完整...

### 何时不需要调整（needsAdjustment = false）

1. **信息已充分**：当前实体信息收集已达到目标...
2. **用户抗拒**：用户明确表示不愿继续当前话题...

## 策略类型选择指南

根据调整需求选择合适的strategy：

- **NEW_ENTITIES**：发现新实体需要处理
- **DEEPEN_ENTITY**：深化已有实体的信息收集
- **SKIP_ENTITY**：跳过某些实体...

...
```

**模板层关注点**：

- 通用的决策逻辑（何时调整、如何选择策略）
- 通用的规划逻辑（如何生成Actions、命名规范）
- 通用的指导原则（问题设计、变量命名）
- 通用的输出格式（JSON/YAML Schema）

### 5.3.4 代码层实现（TypeScript）

代码层负责技术实现，不包含业务逻辑：

```typescript
// TopicDecisionService - 只负责编排，不包含决策逻辑
class TopicDecisionService {
  async makeDecision(context: DecisionContext): Promise<DecisionOutput> {
    // 1. 构建Prompt（组合脚本配置 + 模板）
    const prompt = this.buildDecisionPrompt(context);

    // 2. 调用LLM
    const llmResponse = await this.callLLM(prompt);

    // 3. 解析和验证
    const decision = this.parseDecisionOutput(llmResponse);
    this.validateDecisionSchema(decision);

    // 4. 返回结果
    return decision;
  }

  // 构建Prompt：组合模板 + 脚本配置 + 运行时变量
  private buildDecisionPrompt(context: DecisionContext): string {
    const template = this.loadTemplate('decision-prompt.md');
    const config = context.topic.decisionPromptConfig;
    const runtimeVars = this.extractRuntimeVariables(context);

    return this.templateEngine.render(template, {
      ...config.system_variables,
      ...config.template_variables,
      ...runtimeVars,
    });
  }
}
```

**代码层关注点**：

- LLM调用编排（顺序、错误处理）
- 模板渲染（变量替换、条件逻辑）
- 结果解析（JSON/YAML解析）
- Schema验证（Zod验证）
- 队列操作执行（插入、追加）

### 5.3.5 边界清晰的好处

1. **零编码扩展**：新场景只需更新YAML配置，无需改代码
2. **领域专家可迭代**：Prompt模板即策略文档，直接可读可改
3. **技术债务隔离**：业务逻辑在Prompt层，技术实现在代码层
4. **测试友好**：可单独测试Prompt效果、代码正确性
5. **版本控制**：Prompt模板和脚本配置可单独版本管理

### 5.3.6 修改指南

**何时修改脚本层（YAML）**：

- 添加新的Topic类型
- 调整领域特定的约束条件
- 增加新的示例场景
- 修改领域目标或策略

**何时修改模板层（Prompt）**：

- 优化决策逻辑（更准确的needsAdjustment判断）
- 改进规划质量（更自然的Action生成）
- 增加新的策略类型
- 改进变量命名规范

**何时修改代码层（TypeScript）**：

- 修复技术Bug（解析错误、内存泄漏）
- 性能优化（缓存、并行化）
- 架构变更（新的LLM Provider、存储后端）
- 增加可观测性（日志、监控）

---

## 6. 完整流程示例

### 场景：收集抚养者信息，发现新实体

**输入**：

- Topic目标：收集来访者童年主要抚养者信息
- 对话："主要是爸爸，后来妈妈也回来了。对了，外公也经常来帮忙。"
- 已处理：爸爸（基本信息已完成）

**Stage 1 (Decision) 输出**：

```json
{
  "needsAdjustment": true,
  "strategy": "NEW_ENTITIES",
  "reasoning": "发现'妈妈'和'外公'两个新实体，爸爸需要补充关系史",
  "adjustmentPlan": {
    "entities": [
      {
        "entityName": "妈妈",
        "intent": "NEW",
        "actionsNeeded": [
          { "type": "ai_say", "purpose": "引出妈妈的话题", "priority": "high" },
          { "type": "ai_ask", "purpose": "询问妈妈的基本信息", "priority": "high" },
          { "type": "ai_ask", "purpose": "询问与妈妈的早期记忆", "priority": "medium" },
          { "type": "ai_think", "purpose": "评估与妈妈的情感连接", "priority": "low" }
        ]
      },
      {
        "entityName": "外公",
        "intent": "NEW",
        "actionsNeeded": [
          { "type": "ai_ask", "purpose": "询问外公的基本信息", "priority": "medium" }
        ]
      },
      {
        "entityName": "爸爸",
        "intent": "EXTEND",
        "actionsNeeded": [
          { "type": "ai_ask", "purpose": "询问童年时期与爸爸的关系史", "priority": "high" }
        ]
      }
    ],
    "insertionStrategy": "APPEND_TO_END"
  }
}
```

**Stage 2 (Planner) 输出**：

```yaml
actions:
  - action_type: ai_say
    action_id: mother_1_say_welcome
    config:
      content: |
        接下来，我想了解一下您妈妈的情况。
        了解童年抚养者情况有助于理解您的成长经历。
      max_rounds: 1

  - action_type: ai_ask
    action_id: mother_1_ask_basic_info
    config:
      content: |
        请问您妈妈的姓名是什么？
        您和她的关系如何（亲近/疏远/较为复杂）？
        在您的成长过程中，她扮演了怎样的角色？
      output:
        - get: caregiver_1_name
          define: '妈妈的姓名'
          extraction_method: direct
        - get: caregiver_1_relationship
          define: '与妈妈的关系类型'
          extraction_method: llm
      max_rounds: 2

  # ... 更多actions
```

---

## 7. 风险与权衡

### 7.1 优势

| 方面     | 说明                             |
| -------- | -------------------------------- |
| 灵活性   | 新场景零编码扩展，只需更新prompt |
| 可维护性 | 领域专家可直接迭代prompt         |
| 可扩展性 | 支持复杂的实体混合策略           |
| 职责清晰 | 决策、规划、执行三分离           |

### 7.2 风险

| 风险           | 影响                       | 缓解措施                                         |
| -------------- | -------------------------- | ------------------------------------------------ |
| 性能           | 两次LLM调用，延迟增加      | 使用快速模型（GPT-4o-mini用于Stage 1）、缓存机制 |
| Prompt设计门槛 | Prompt质量直接影响系统表现 | 建立prompt工程规范、持续迭代优化                 |
| 配置成本       | 需要精心设计两个template   | 提供丰富的示例和指导文档                         |
| LLM输出稳定性  | JSON/YAML解析可能失败      | 严格的Schema验证、错误处理和降级机制             |

### 7.3 权衡决策

**选择两阶段LLM Pipeline的原因**：

1. **符合核心愿景**：用户明确要求"决策到执行全流程Prompt化"，方案1最贴合
2. **零编码扩展**：未来任何新场景只需更新prompt，无需改代码
3. **领域专家友好**：prompt就是策略文档，直接可迭代
4. **架构清晰**：决策→规划→执行三分离，符合认知模式

**性能问题的缓解**：

- Stage 1使用轻量级模型，快速过滤
- Stage 2可异步执行（不阻塞主流程）
- 决策结果缓存（相同上下文不重复调用）

---

## 8. 实施计划（概要）

### Phase 1: 基础设施

- [ ] 创建TopicPlannerService服务类
- [ ] 实现Decision Prompt Template
- [ ] 实现Planner Prompt Template
- [ ] 添加JSON Schema和YAML Schema验证

### Phase 2: 集成到IntelligentTopicPlanner

- [ ] 重写plan()方法，实现两阶段流程
- [ ] 删除硬编码的实体识别逻辑
- [ ] 删除expandQueueForEntities中的机械化遍历

### Phase 3: 测试与优化

- [ ] 编写单元测试（Decision输出验证）
- [ ] 编写单元测试（Planner输出验证）
- [ ] 编写集成测试（完整流程）
- [ ] Prompt迭代优化

### Phase 4: 文档与可观测性

- [ ] 更新技术文档
- [ ] 增强日志记录
- [ ] 添加决策追踪

---

## 9. 后续扩展点

本设计为以下场景预留扩展能力：

- **场景B：话题延伸处理** - 在Decision Prompt中增加策略描述
- **场景C：条件跳过** - 通过SKIP_ENTITY类型和intent='SKIP'实现
- **场景D：情绪响应** - 新增EMOTION_DETECTION策略类型

所有扩展仅需：

1. 在Decision Prompt中增加新策略的指导原则
2. 在Planner Prompt中增加对应的Action生成规则
3. 更新Schema定义（如有新字段）

无需修改任何代码逻辑。

---

## 10. 附录

### 附录A：Schema定义文件

所有Schema定义应添加到：

- `/packages/shared-types/src/domain/topic-types.ts`

### 附录B：Prompt模板存储位置

两个Prompt Template应存储为：

- `/config/prompts/topic/decision-llm-v1-draft.md`
- `/config/prompts/topic/planner-llm-v1-draft.md`

### 附录C：相关设计文档

- [Story 2.2原始需求文档](../thinking/Story-2.2-Topic动态展开Action队列-智能能力需求.md)
- [Story 2.2 DDD战术设计](../design/Story-2.2-Topic动态展开Action队列-DDD战术设计.md)
