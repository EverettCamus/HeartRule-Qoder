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

### 5.2 Planner Prompt Template

**核心功能**：

1. 接受Stage 1的adjustmentPlan作为输入
2. 结合Topic的goal和strategy，生成Action YAML
3. 严格按照ActionConfig Schema输出

**主要章节**：

- Topic信息
- 调整计划（输入JSON）
- Action配置规范（四种类型）
- Action ID命名规范
- 问题设计原则
- 输出格式
- 示例
- 实体索引分配表

**关键指导原则**：

- 严格变量命名规则
- 渐进式问题设计
- 优先级排序

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

- `/packages/core-engine/config/prompts/topic/decision-lmm-prompt.md`
- `/packages/core-engine/config/prompts/topic/planner-llm-prompt.md`

### 附录C：相关设计文档

- [Story 2.2原始需求文档](../thinking/Story-2.2-Topic动态展开Action队列-智能能力需求.md)
- [Story 2.2 DDD战术设计](../design/Story-2.2-Topic动态展开Action队列-DDD战术设计.md)
