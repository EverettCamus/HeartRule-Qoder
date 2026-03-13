---
document_id: openspec-specs-domain-tactical-topic-action-queue-intelligent-capability-requirements-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/domain/tactical/topic-action-queue-intelligent-capability-requirements.md
tags:
  [
    authoritative,
    current,
    specification,
    ddd,
    tactical-design,
    topic,
    action-queue,
    intelligent-capability,
  ]
search_priority: high
language_note: This document is currently in Chinese and needs translation to English per DDD tactical design language strategy.
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

## 3. 架构设计

### 3.1 两阶段 LLM Pipeline 架构

```
原始架构（已演进）：
用户输入 → 二分类决策 → 单提示词生成 → Action执行

演进后架构（本 Story）：
用户输入 → 第一阶段：对象识别与队列规划 → 第二阶段：Action模板实例化 → Action执行
```

#### **第一阶段：对象识别与队列规划**

**输入**：

- 当前 Topic 配置（`topic_goal`, `strategy`）
- 对话历史（最近 N 轮）
- 已提取的变量
- 当前 Action 队列状态

**处理**：

1. **对象识别**：识别对话中提到的实体对象
2. **队列规划**：决定如何组织这些对象的处理顺序
3. **模板选择**：选择适合的 Action 模板

**输出**：

- 识别到的对象列表（带优先级）
- 每个对象对应的 Action 模板
- 队列调整决策（追加、跳过、合并）

#### **第二阶段：Action模板实例化**

**输入**：

- 对象信息（名称、属性、上下文）
- 选择的 Action 模板
- Topic 上下文变量

**处理**：

1. **模板填充**：将对象信息填充到模板中
2. **参数调整**：根据对象特性调整 Action 参数
3. **上下文注入**：注入必要的上下文变量

**输出**：

- 实例化的 Action 配置
- 可执行的 Action 队列

### 3.2 核心组件设计

#### **TopicConsciousness 模块**

```typescript
interface TopicConsciousness {
  // 第一阶段：对象识别与队列规划
  analyzeSituation(context: TopicContext): Promise<SituationAnalysis>;

  // 第二阶段：Action模板实例化
  instantiateActions(
    analysis: SituationAnalysis,
    templates: ActionTemplate[]
  ): Promise<ActionQueue>;

  // 动态调整
  adjustQueue(currentQueue: ActionQueue, newInput: UserInput): Promise<QueueAdjustment>;
}
```

#### **SituationAnalysis 数据结构**

```typescript
interface SituationAnalysis {
  // 识别到的对象
  identifiedObjects: Array<{
    id: string;
    type: string;
    name: string;
    attributes: Record<string, any>;
    priority: number;
    confidence: number;
  }>;

  // 队列规划
  queuePlan: {
    processingOrder: string[]; // 对象ID数组
    templateMapping: Record<string, string>; // 对象ID → 模板ID
    adjustmentType: 'append' | 'skip' | 'merge' | 'none';
  };

  // 决策依据
  rationale: {
    evidence: string[]; // 支持决策的证据
    reasoning: string; // 推理过程
    confidence: number; // 置信度
  };
}
```

## 4. 场景A：一对多实体展开

### 4.1 场景描述

**用户场景**：在收集童年抚养者信息时，用户提到"我小时候主要是妈妈带，但爸爸和外婆也经常照顾我"。

**传统脚本问题**：

- 需要预先为每个可能的抚养者编写重复的 Action
- 无法动态识别用户提到的抚养者数量
- 脚本冗长且难以维护

**智能解决方案**：

1. 识别出三个抚养者：妈妈、爸爸、外婆
2. 为每个抚养者实例化相同的"收集抚养者信息" Action 模板
3. 按优先级顺序执行三个 Action 子队列

### 4.2 实现细节

#### **对象识别规则**

```yaml
object_recognition:
  entity_types:
    - name: 'caregiver'
      patterns:
        - '([妈妈|父亲|爸爸|外婆|外公|奶奶|爷爷|阿姨|叔叔])带'
        - '([妈妈|父亲|爸爸|外婆|外公|奶奶|爷爷|阿姨|叔叔])照顾'
      extraction_method: 'llm_ner'

  context_rules:
    - if: "topic_goal contains '抚养者'"
      then: 'prioritize caregiver entities'
    - if: 'user mentions multiple entities'
      then: 'extract all entities'
```

#### **Action模板定义**

```yaml
action_templates:
  - template_id: 'collect_caregiver_info'
    base_action: 'ai_ask'
    config_template: |
      core_prompt: "关于{{caregiver_name}}，{{question}}"
      tone: "温和"
      ai_role: "关心你的咨询师"
      max_rounds: 3
      output_variables:
        - name: "{{caregiver_name}}_relationship"
          type: "text"
        - name: "{{caregiver_name}}_influence"
          type: "text"

    variable_mapping:
      caregiver_name: 'object.name'
      question: '根据topic_goal动态生成'
```

#### **队列调整策略**

```typescript
class QueueAdjustmentStrategy {
  // 追加新对象
  appendNewObjects(currentQueue: ActionQueue, newObjects: IdentifiedObject[]): ActionQueue {
    // 为新对象创建Action子队列
    const newSubqueues = newObjects.map((obj) => this.createSubqueueForObject(obj));

    // 插入到当前队列的适当位置
    return this.insertSubqueues(currentQueue, newSubqueues);
  }

  // 跳过已处理对象
  skipProcessedObjects(currentQueue: ActionQueue, processedObjects: string[]): ActionQueue {
    // 移除已处理对象的Action
    return currentQueue.filter((action) => !processedObjects.includes(action.metadata.objectId));
  }
}
```

## 5. 扩展场景设计

### 5.1 场景B：多维度信息收集

**场景描述**：收集工作压力信息时，需要从多个维度（工作环境、人际关系、工作负荷）收集信息。

**能力需求**：

1. 识别信息收集的多个维度
2. 为每个维度实例化不同的 Action 模板
3. 根据用户回答动态调整维度优先级

### 5.2 场景C：条件分支展开

**场景描述**：根据用户回答的不同，展开不同的追问路径。

**能力需求**：

1. 识别用户回答中的关键信息
2. 根据条件选择不同的 Action 模板
3. 动态生成条件分支队列

### 5.3 框架扩展性

```typescript
// 场景处理器接口
interface SceneProcessor {
  sceneType: string;

  // 场景识别
  canHandle(context: TopicContext): boolean;

  // 场景处理
  process(context: TopicContext): Promise<SceneProcessingResult>;
}

// 场景注册表
class SceneRegistry {
  private processors: Map<string, SceneProcessor> = new Map();

  registerProcessor(sceneType: string, processor: SceneProcessor) {
    this.processors.set(sceneType, processor);
  }

  findProcessor(context: TopicContext): SceneProcessor | null {
    for (const processor of this.processors.values()) {
      if (processor.canHandle(context)) {
        return processor;
      }
    }
    return null;
  }
}
```

## 6. 实现指南

### 6.1 第一阶段实现

#### **对象识别实现**

```typescript
class ObjectRecognizer {
  async identifyObjects(context: TopicContext): Promise<IdentifiedObject[]> {
    // 1. 使用LLM进行命名实体识别
    const entities = await this.llm.extractEntities(context.conversationHistory);

    // 2. 过滤与Topic相关的实体
    const relevantEntities = this.filterRelevantEntities(entities, context.topicGoal);

    // 3. 聚类相似实体
    const clusteredEntities = this.clusterEntities(relevantEntities);

    // 4. 计算优先级
    return this.calculatePriorities(clusteredEntities, context);
  }
}
```

#### **队列规划实现**

```typescript
class QueuePlanner {
  async planQueue(objects: IdentifiedObject[], context: TopicContext): Promise<QueuePlan> {
    // 1. 确定处理顺序
    const processingOrder = this.determineProcessingOrder(objects);

    // 2. 选择Action模板
    const templateMapping = this.selectTemplates(objects, context);

    // 3. 决定调整类型
    const adjustmentType = this.determineAdjustmentType(objects, context.currentQueue);

    return {
      processingOrder,
      templateMapping,
      adjustmentType,
    };
  }
}
```

### 6.2 第二阶段实现

#### **Action模板实例化**

```typescript
class ActionInstantiator {
  async instantiateTemplate(
    template: ActionTemplate,
    object: IdentifiedObject,
    context: TopicContext
  ): Promise<ActionConfig> {
    // 1. 填充模板变量
    const filledConfig = this.fillTemplateVariables(template.configTemplate, object, context);

    // 2. 调整Action参数
    const adjustedConfig = this.adjustActionParameters(filledConfig, object, context);

    // 3. 注入上下文
    const finalConfig = this.injectContext(adjustedConfig, context);

    return finalConfig;
  }
}
```

## 7. 测试与验证

### 7.1 单元测试

#### **对象识别测试**

```typescript
describe('ObjectRecognizer', () => {
  it('应该识别多个抚养者', async () => {
    const context = createTestContext(
      '用户说："我小时候主要是妈妈带，但爸爸和外婆也经常照顾我"',
      '收集童年抚养者信息'
    );

    const recognizer = new ObjectRecognizer();
    const objects = await recognizer.identifyObjects(context);

    expect(objects).toHaveLength(3);
    expect(objects.map((o) => o.name)).toEqual(expect.arrayContaining(['妈妈', '爸爸', '外婆']));
  });
});
```

#### **队列规划测试**

```typescript
describe('QueuePlanner', () => {
  it('应该为每个抚养者规划Action子队列', async () => {
    const objects = [
      { id: '1', name: '妈妈', type: 'caregiver', priority: 1 },
      { id: '2', name: '爸爸', type: 'caregiver', priority: 2 },
      { id: '3', name: '外婆', type: 'caregiver', priority: 3 },
    ];

    const planner = new QueuePlanner();
    const plan = await planner.planQueue(objects, testContext);

    expect(plan.processingOrder).toEqual(['1', '2', '3']);
    expect(plan.templateMapping['1']).toBe('collect_caregiver_info');
    expect(plan.adjustmentType).toBe('append');
  });
});
```

### 7.2 集成测试

#### **端到端场景测试**

```typescript
describe('TopicConsciousness 端到端测试', () => {
  it('应该完成一对多实体展开完整流程', async () => {
    // 1. 设置测试场景
    const scenario = createCaregiverScenario();

    // 2. 执行Topic意识层
    const consciousness = new TopicConsciousness();
    const analysis = await consciousness.analyzeSituation(scenario.context);

    // 3. 实例化Action
    const actions = await consciousness.instantiateActions(analysis, scenario.templates);

    // 4. 验证结果
    expect(actions.queue).toHaveLength(3); // 三个抚养者
    expect(actions.queue[0].config.core_prompt).toContain('妈妈');
    expect(actions.queue[1].config.core_prompt).toContain('爸爸');
    expect(actions.queue[2].config.core_prompt).toContain('外婆');

    // 5. 验证可观测性
    expect(analysis.rationale.evidence).not.toBeEmpty();
    expect(analysis.rationale.reasoning).not.toBeEmpty();
  });
});
```

## 8. 部署与监控

### 8.1 性能指标

#### **第一阶段指标**

- 对象识别准确率：> 85%
- 识别响应时间：< 500ms
- 队列规划合理率：> 80%

#### **第二阶段指标**

- 模板实例化准确率：> 90%
- 实例化响应时间：< 300ms
- Action执行成功率：> 95%

#### **整体指标**

- 端到端响应时间：< 1s
- 用户满意度：> 4/5
- 调试信息完整性：100%

### 8.2 监控仪表板

```yaml
monitoring_dashboard:
  metrics:
    - name: 'object_recognition_accuracy'
      query: 'successful_recognitions / total_recognitions'
      threshold: 0.85
      alert: '低于阈值时告警'

    - name: 'queue_adjustment_frequency'
      query: 'count(queue_adjustments) / count(topics)'
      threshold: '动态阈值'
      alert: '异常波动时告警'

    - name: 'action_instantiation_time'
      query: 'avg(instantiation_duration_ms)'
      threshold: 300
      alert: '超过阈值时告警'

  logs:
    - level: 'DEBUG'
      include: ['object_identification', 'queue_planning', 'template_instantiation']
    - level: 'INFO'
      include: ['queue_adjustments', 'scene_transitions']
    - level: 'ERROR'
      include: ['recognition_failures', 'instantiation_errors']
```

## 9. 总结与路线图

### 9.1 本 Story 成果

1. **架构演进**：从"二分类决策+单提示词"演进为"两阶段 LLM Pipeline"
2. **核心能力**：实现了 Topic 层 Action 队列动态调整的智能能力
3. **场景实现**：完整实现了场景A（一对多实体展开）
4. **扩展框架**：设计了可扩展的场景处理器框架
5. **质量保障**：建立了完整的测试和监控体系

### 9.2 后续工作

#### **短期（1-2周）**

1. 优化对象识别准确率
2. 完善调试信息输出
3. 性能调优和监控增强

#### **中期（3-4周）**

1. 实现场景B（多维度信息收集）
2. 实现场景C（条件分支展开）
3. 开发场景配置工具

#### **长期（1-2月）**

1. 支持更多场景类型
2. 实现跨Topic的队列协调
3. 开发可视化队列编辑工具

### 9.3 成功标准

1. **功能标准**：
   - 场景A在生产环境稳定运行
   - 对象识别准确率 > 85%
   - 用户满意度 > 4/5

2. **性能标准**：
   - 端到端响应时间 < 1s
   - 系统可用性 > 99.9%
   - 错误率 < 1%

3. **扩展标准**：
   - 支持至少3种场景类型
   - 新增场景开发时间 < 3天
   - 配置变更部署时间 < 1小时

---

**文档版本**：v1.0  
**最后更新**：2026-03-09  
**相关文档**：

- [Topic动态展开Action队列-DDD战术设计](../tactical/topic-action-queue-ddd-tactical-design.md)
- [Action层与Topic层的职能边界](../tactical/action-topic-responsibility-boundary.md)
- [两阶段LLM重构设计文档](../../plans/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md)
- [五层架构实现指南](../../architecture/layer-implementation-guide.md)
