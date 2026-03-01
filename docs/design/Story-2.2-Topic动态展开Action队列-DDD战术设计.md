# Story 2.2：Topic动态展开Action队列 - DDD战术设计

## 1. 设计目标

本文档基于《Story 2.2：Topic层基于实体列表动态展开Action队列的智能能力需求》，将业务需求转化为符合DDD战术设计的实现方案。核心目标是实现**一对多实体的队列展开能力**，使Topic层能够根据运行时识别的实体列表动态生成和调整Action执行队列。

---

## 2. 领域模型设计

### 2.1 核心实体

#### 2.1.1 实体列表管理器 (EntityListManager)

```typescript
// 领域实体：实体列表
// 职责：管理单个实体列表的生命周期、状态追踪、增量检测
export class EntityListManager {
  private entityList: Map<string, EntityItem> = new Map();
  private readonly entityType: string;  // e.g., "caregiver", "department", "role"
  private readonly topicId: string;

  // 实体项结构
  interface EntityItem {
    id: string;                    // 唯一标识
    name: string;                  // 显示名称
    canonicalName: string;        // 规范化名称（去重用）
    status: EntityStatus;         // 实体处理状态
    createdAt: Date;
    updatedAt: Date;
  }

  // 实体状态枚举
  enum EntityStatus {
    DISCOVERED = 'discovered',    // 新发现
    PROCESSING = 'processing',    // 处理中
    COMPLETED = 'completed',      // 已完成
    SKIPPED = 'skipped'           // 已跳过
  }

  // 核心方法
  addEntity(name: string): EntityItem;
  removeEntity(entityId: string): boolean;
  getEntities(): EntityItem[];
  getEntitiesByStatus(status: EntityStatus): EntityItem[];
  updateEntityStatus(entityId: string, status: EntityStatus): void;
  detectNewEntities(newNames: string[]): EntityItem[];  // 增量检测
  normalizeEntityName(name: string): string;            // 名称规范化
}
```

**设计理由**：

- EntityListManager作为独立的领域实体，负责封装实体列表的所有操作
- 规范化逻辑内聚在实体管理器中，便于统一处理"爸、父亲、爸爸"等别名
- 状态追踪支持"未开始/进行中/已完成/已跳过"的完整生命周期

#### 2.1.2 Action模板 (ActionTemplate)

```typescript
// 领域实体：Action模板
// 职责：封装针对单个实体的Action序列模板
export class ActionTemplate {
  readonly templateId: string;
  readonly entityType: string;              // 关联的实体类型
  readonly actionSequence: ActionConfig[];   // Action配置序列
  readonly variableBindings: VariableBinding[];  // 变量绑定规则

  // 变量绑定定义
  interface VariableBinding {
    sourceVariable: string;    // 模板中的占位符
    entityProperty: string;    // 对应的实体属性
    defaultValue?: string;
  }

  // 核心方法
  instantiateForEntity(entity: EntityItem): ActionConfig[];
  getMaxActionsPerEntity(): number;
}
```

**设计理由**：

- ActionTemplate是只读的模板对象，不包含运行时状态
- variableBindings定义模板占位符与实体属性的映射关系
- instantiateForEntity生成针对特定实体的Action配置副本

#### 2.1.3 Topic认知上下文 (TopicCognitiveContext)

```typescript
// 领域实体：Topic认知上下文
// 职责：封装Topic意识层所需的运行时状态快照
export class TopicCognitiveContext {
  readonly topicId: string;
  readonly goal: string;
  readonly strategy: string;

  private currentAction: ActionSummary | null;
  private topicPlan: TopicPlanSummary;
  private entityListManager: EntityListManager;
  private conversationSummary: string;
  private timeAndState: TimeAndState;

  // Action摘要结构
  interface ActionSummary {
    actionId: string;
    actionType: string;
    purpose: string;
    outputTargets: string[];
    currentRound: number;
    maxRounds: number;
  }

  // Topic计划摘要
  interface TopicPlanSummary {
    executedActions: ActionSummary[];
    pendingActions: ActionSummary[];
    totalCount: number;
  }

  // 时间与状态
  interface TimeAndState {
    remainingTimeMinutes: number;
    userEngagement: 'high' | 'medium' | 'low';
    emotionalIntensity: 'calm' | 'mild' | 'intense';
  }

  // 核心方法
  snapshot(): TopicCognitiveContextData;
  updateWithActionResult(result: ActionResult): void;
  updateWithEntityChanges(added: EntityItem[], removed: EntityItem[]): void;
}
```

**设计理由**：

- TopicCognitiveContext聚合Topic执行所需的全部上下文信息
- 每次调用LLM前生成快照，确保决策一致性
- 包含足够的信息支撑三类决策（NO_CHANGE/TUNE_CURRENT_ACTION/REPLAN_ACTION_QUEUE）

### 2.2 值对象

#### 2.2.1 决策结果 (TopicDecision)

```typescript
// 值对象：Topic策略决策
// 不可变对象，表示Topic意识层的决策结果
export interface TopicDecision {
  readonly decision: 'NO_CHANGE' | 'TUNE_CURRENT_ACTION' | 'REPLAN_ACTION_QUEUE';
  readonly reason: string; // 决策原因（50字以内）
  readonly tuneHint?: TuneCurrentActionHint; // 调整提示
  readonly queueReplanHint?: QueueReplanHint; // 队列重规划提示
}

export interface TuneCurrentActionHint {
  readonly focus: 'tone' | 'question_style' | 'depth' | 'scope';
  readonly suggestedDirection: string;
}

export interface QueueReplanHint {
  readonly needEntityExpansion: boolean;
  readonly targetEntities: string[];
  readonly replanIntent: string;
  readonly constraints?: {
    maxEntities?: number;
    timeBudget?: number;
    priorityOrder?: string[];
  };
}
```

#### 2.2.2 队列操作指令 (QueueOperation)

```typescript
// 值对象：队列操作指令
// 描述对Topic Action队列的具体操作
export interface QueueOperation {
  readonly operationType: QueueOperationType;
  readonly targetPosition: QueuePosition;
  readonly actionsToInsert?: ActionConfig[];
  readonly actionsToRemove?: string[]; // actionIds
  readonly actionsToReorder?: ReorderSpec[];
}

export type QueueOperationType =
  | 'APPEND' // 追加到末尾
  | 'INSERT_AFTER' // 插入到指定位置之后
  | 'REPLACE_RANGE' // 替换指定范围
  | 'REORDER'; // 重排

export interface QueuePosition {
  afterActionId?: string; // 插入位置
  beforeActionId?: string; // 或之前位置
  index?: number; // 或直接指定索引
}

export interface ReorderSpec {
  actionId: string;
  newIndex: number;
}
```

#### 2.2.3 展开记录 (ExpansionRecord)

```typescript
// 值对象：展开记录
// 用于可观测性和调试
export interface ExpansionRecord {
  readonly recordId: string;
  readonly topicId: string;
  readonly timestamp: string;
  readonly trigger: ExpansionTrigger;
  readonly entityChanges: {
    added: string[];
    removed: string[];
    beforeCount: number;
    afterCount: number;
  };
  readonly expansionResult: {
    templateId: string;
    actionsAdded: number;
    actionIds: string[];
    insertedAt: number; // 队列位置
  };
  readonly decision: TopicDecision;
}

export type ExpansionTrigger =
  | 'initial_discovery' // 首次发现实体
  | 'incremental_update' // 增量更新
  | 'strategy_driven'; // 策略驱动
```

### 2.3 领域服务

#### 2.3.1 实体感知服务 (EntityAwarenessService)

```typescript
// 领域服务：实体感知
// 职责：从变量和对话中识别和追踪实体
export interface EntityAwarenessService {
  // 从变量中提取实体列表
  extractEntitiesFromVariable(variableName: string, variableValue: any): string[];

  // 从对话历史中解析潜在实体
  extractEntitiesFromConversation(
    conversationHistory: ConversationEntry[],
    entityType: string
  ): Promise<string[]>;

  // 检测实体列表变化
  detectEntityChanges(currentList: string[], previousList: string[]): EntityChangeResult;

  // 规范化实体名称
  normalizeEntityName(name: string, entityType: string): string;
}

export interface EntityChangeResult {
  added: string[];
  removed: string[];
  unchanged: string[];
  changeType: 'initial' | 'incremental' | 'none';
}
```

**设计理由**：

- 实体感知是独立的核心能力，封装检测和规范化逻辑
- 支持多种来源：变量提取、对话解析
- 增量检测避免重复处理已有实体

#### 2.3.2 队列展开服务 (QueueExpansionService)

```typescript
// 领域服务：队列展开
// 职责：将Action模板针对实体列表展开为具体队列
export interface QueueExpansionService {
  // 初始展开：首次发现实体时
  initialExpansion(
    template: ActionTemplate,
    entities: EntityItem[],
    insertPosition: QueuePosition
  ): QueueOperation;

  // 增量展开：运行时发现新实体时
  incrementalExpansion(
    template: ActionTemplate,
    newEntities: EntityItem[],
    currentQueueLength: number,
    lastEntityIndex: number
  ): QueueOperation;

  // 验证展开结果
  validateExpansion(operation: QueueOperation, existingActions: ActionConfig[]): ValidationResult;

  // 生成带实体绑定的Action配置
  instantiateAction(
    baseAction: ActionConfig,
    entity: EntityItem,
    bindings: VariableBinding[]
  ): ActionConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

#### 2.3.3 Topic策略决策服务 (TopicStrategyDecisionService)

```typescript
// 领域服务：Topic策略决策
// 职责：封装LLM调用和决策逻辑
export interface TopicStrategyDecisionService {
  // 做出三类决策之一
  makeDecision(context: TopicCognitiveContext): Promise<TopicDecision>;

  // 当决策为REPLAN_ACTION_QUEUE时，生成新的Action片段
  generateReplannedActions(
    decision: TopicDecision,
    context: TopicCognitiveContext,
    schemaConstraints: SchemaConstraints
  ): Promise<ActionConfig[]>;
}

export interface SchemaConstraints {
  allowedActionTypes: string[];
  maxActionsPerEntity: number;
  requiredFields: Record<string, string[]>;
}
```

### 2.4 聚合根

#### 2.4.1 Topic执行聚合 (TopicExecutionAggregate)

```typescript
// 聚合根：Topic执行聚合
// 封装Topic执行过程中的所有领域逻辑
export class TopicExecutionAggregate {
  readonly topicId: string;
  readonly topicConfig: TopicConfig;

  private entityListManager: EntityListManager;
  private actionTemplates: Map<string, ActionTemplate>; // templateId -> template
  private instantiatedQueue: ActionConfig[];
  private currentPlan: TopicPlanSummary;
  private cognitiveContext: TopicCognitiveContext;
  private expansionHistory: ExpansionRecord[];

  // 核心方法
  initialize(entityType: string, templates: ActionTemplate[]): void;

  // 领域方法
  registerDiscoveredEntities(entityNames: string[]): EntityChangeResult;

  expandQueueForEntities(change: EntityChangeResult): QueueOperation[];

  makeStrategicDecision(): Promise<TopicDecision>;

  applyQueueOperations(operations: QueueOperation[]): void;

  getExecutionProgress(): TopicExecutionProgress;

  recordExpansion(record: ExpansionRecord): void;

  // 状态查询
  getPendingEntities(): EntityItem[];
  getCompletedEntities(): EntityItem[];
  hasUnexpandedEntities(): boolean;
}

export interface TopicExecutionProgress {
  totalEntities: number;
  completedEntities: number;
  pendingEntities: number;
  totalActions: number;
  completedActions: number;
  currentActionIndex: number;
  currentEntityId?: string;
}
```

**设计理由**：

- TopicExecutionAggregate是核心聚合根，封装Topic执行的全部领域逻辑协调
- EntityListManager、ActionTemplate、QueueExpansionService
- 保证不变性：所有状态变更通过明确的领域方法
- ExpansionHistory支撑可观测性需求

---

## 3. 应用层设计

### 3.1 应用服务：Topic智能规划器 (IntelligentTopicPlanner)

```typescript
// 应用服务：智能Topic规划器
// 协调领域对象完成智能规划用例
// DDD定位：Application Layer Service
export class IntelligentTopicPlanner implements ITopicPlanner {
  private readonly entityAwarenessService: EntityAwarenessService;
  private readonly queueExpansionService: QueueExpansionService;
  private readonly decisionService: TopicStrategyDecisionService;
  private readonly templateManager: PromptTemplateManager;
  private readonly llmOrchestrator: LLMOrchestrator;

  // 规划入口
  async plan(context: TopicPlanningContext): Promise<TopicPlan> {
    // 1. 初始化或恢复Topic执行聚合
    const aggregate = this.getOrCreateAggregate(context.topicId);

    // 2. 实体感知：从变量和对话中检测实体
    const entityChanges = await this.detectEntityChanges(context);

    // 3. 如果发现新实体，执行队列展开
    if (entityChanges.changeType !== 'none') {
      const expansionOps = aggregate.expandQueueForEntities(entityChanges);
      aggregate.applyQueueOperations(expansionOps);
    }

    // 4. 策略决策：调用Topic意识层
    const decision = await aggregate.makeStrategicDecision();

    // 5. 根据决策执行相应操作
    switch (decision.decision) {
      case 'NO_CHANGE':
        // 保持现有队列不变
        break;

      case 'TUNE_CURRENT_ACTION':
        // 调整当前Action的执行策略（由Action层处理）
        await this.applyTuningHint(decision.tuneHint, context);
        break;

      case 'REPLAN_ACTION_QUEUE':
        // 生成新的Action片段并插入队列
        const newActions = await this.decisionService.generateReplannedActions(
          decision,
          aggregate.getCognitiveContext(),
          this.getSchemaConstraints()
        );
        aggregate.appendActions(newActions);
        break;
    }

    // 6. 返回最终的TopicPlan
    return aggregate.toTopicPlan();
  }

  // 检测实体变化
  private async detectEntityChanges(context: TopicPlanningContext): Promise<EntityChangeResult> {
    // 从变量中提取
    const variableEntities = this.entityAwarenessService.extractEntitiesFromVariable(
      context.entityType + '_list',
      context.variableStore.topic[context.topicId]?.get(context.entityType + '_list')?.value
    );

    // 从对话中解析（可选，减少LLM调用）
    const conversationEntities = await this.entityAwarenessService.extractEntitiesFromConversation(
      context.sessionContext.conversationHistory,
      context.entityType
    );

    // 合并并检测变化
    const allEntities = [...new Set([...variableEntities, ...conversationEntities])];
    return this.entityAwarenessService.detectEntityChanges(
      allEntities,
      this.getPreviousEntityList(context.topicId)
    );
  }
}
```

### 3.2 应用服务：模板变量注入器 (TemplateVariableInjector)

```typescript
// 应用服务：模板变量注入器
// 负责将运行时上下文注入到LLM提示词模板
export class TemplateVariableInjector {
  // 模板A（决策层）的变量注入
  injectDecisionTemplate(
    template: PromptTemplate,
    context: TopicCognitiveContext,
    entityStatus: EntityListManager
  ): string {
    const systemVars: Record<string, any> = {
      topic_goal: context.goal,
      topic_strategy: context.strategy,
      current_action_summary: this.formatActionSummary(context.currentAction),
      current_topic_plan_summary: this.formatTopicPlan(context.topicPlan),
      entity_list_status: this.formatEntityStatus(entityStatus),
      time_and_state: this.formatTimeAndState(context.timeAndState),
      conversation_summary: context.conversationSummary,
    };

    return this.templateManager.substituteVariables(
      template.content,
      new Map(), // 无脚本层变量
      systemVars
    );
  }

  // 模板B（队列生成层）的变量注入
  injectQueueReplanTemplate(
    template: PromptTemplate,
    context: TopicCognitiveContext,
    decision: TopicDecision,
    schemaConstraints: SchemaConstraints
  ): string {
    const systemVars: Record<string, any> = {
      topic_goal: context.goal,
      topic_strategy: context.strategy,
      replan_intent: decision.queueReplanHint?.replanIntent,
      target_entities: decision.queueReplanHint?.targetEntities?.join(', '),
      per_entity_action_outline: context.strategy, // 从strategy中提取
      action_schema_constraints: this.formatSchemaConstraints(schemaConstraints),
      allowed_action_types: schemaConstraints.allowedActionTypes.join(', '),
      max_actions_per_entity: schemaConstraints.maxActionsPerEntity,
      insert_position_description: '当前队列末尾',
    };

    return this.templateManager.substituteVariables(template.content, new Map(), systemVars);
  }

  // 格式化Schema约束为人类可读文本
  private formatSchemaConstraints(constraints: SchemaConstraints): string {
    // 将JSON Schema转换为自然语言描述
    // 供LLM理解允许的字段和类型
  }
}
```

### 3.3 协调流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ScriptExecutor                                   │
│  [Story 2.1] 调用 TopicPlanner.plan()                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    IntelligentTopicPlanner                               │
│                                                                          │
│  1. 获取/创建 TopicExecutionAggregate                                    │
│  2. detectEntityChanges() ──────────────────────────────────────┐       │
│     │                                                              │       │
│     ▼                                                              ▼       │
│  ┌──────────────────┐                            ┌────────────────────┐ │
│  │EntityAwareness   │                            │  aggregate.register │ │
│  │Service           │                            │  DiscoveredEntities │ │
│  │ - 变量提取       │                            │  → EntityChange     │ │
│  │ - 对话解析       │                            └────────────────────┘ │
│  │ - 增量检测       │                                       │           │
│  └──────────────────┘                                       ▼           │
│     返回: EntityChangeResult                    ┌────────────────────┐  │
│                                                    │ aggregate.expand  │  │
│                                                    │ QueueForEntities │  │
│                                                    └────────────────────┘  │
│                                                                       │   │
│  3. makeStrategicDecision() ─────────────────────────────────────────┘   │
│     │                                                                 │   │
│     ▼                                                                 │   │
│  ┌────────────────────┐                            ┌─────────────────────┐│
│  │ TemplateVariable   │                            │  aggregate.make     ││
│  │ Injector           │                            │  StrategicDecision  ││
│  │ - 注入模板A        │                            │  → TopicDecision    ││
│  └────────────────────┘                            └─────────────────────┘│
│     │                                                                 │   │
│     ▼                                                                 │   │
│  ┌────────────────────┐                                   ┌────────────┴┐ │
│  │ LLM调用            │                                   │ switch      │ │
│  │ → TopicDecision   │                                   │ (decision)  │ │
│  └────────────────────┘                                   └─────────────┘ │
│                                                                    │      │
│     ┌─────────────────┬─────────────────┬─────────────────────────┘      │
│     │                 │                 │                                 │
│     ▼                 ▼                 ▼                                 │
│  NO_CHANGE      TUNE_CURRENT      REPLAN_ACTION_QUEUE                   │
│     │            ACTION                │                                 │
│     │                 │                 ▼                                 │
│     │                 │         ┌────────────────────┐                   │
│     │                 │         │ decisionService.   │                   │
│     │                 │         │ generateReplanned  │                   │
│     │                 │         │ Actions()          │                   │
│     │                 │         └────────────────────┘                   │
│     │                 │                 │                                 │
│     ▼                 ▼                 ▼                                 │
│  返回现有队列    应用tuneHint    aggregate.appendActions()              │
│                                       │                                  │
│                                       ▼                                  │
│                               返回 TopicPlan                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 模块划分与文件组织

### 4.1 新增模块结构

```
packages/core-engine/src/
├── domain/
│   ├── entity-list/
│   │   ├── entity-list-manager.ts      # 实体列表管理器
│   │   ├── entity-item.ts              # 实体项值对象
│   │   └── index.ts
│   ├── action-template/
│   │   ├── action-template.ts          # Action模板实体
│   │   ├── variable-binding.ts        # 变量绑定定义
│   │   └── index.ts
│   ├── topic-cognitive/
│   │   ├── topic-cognitive-context.ts  # Topic认知上下文
│   │   ├── topic-decision.ts           # 策略决策值对象
│   │   ├── queue-operation.ts          # 队列操作指令
│   │   ├── expansion-record.ts         # 展开记录
│   │   └── index.ts
│   ├── topic-execution/
│   │   ├── topic-execution-aggregate.ts # Topic执行聚合根
│   │   └── index.ts
│   └── services/
│       ├── entity-awareness.service.ts  # 实体感知领域服务
│       ├── queue-expansion.service.ts   # 队列展开领域服务
│       ├── topic-strategy.service.ts     # Topic策略决策领域服务
│       └── index.ts
│
├── application/
│   ├── planning/
│   │   ├── intelligent-topic-planner.ts # 智能Topic规划器（应用服务）
│   │   └── template-variable-injector.ts # 模板变量注入器
│   └── orchestration/
│       └── topic-action-orchestrator.ts  # [已有]扩展为支持实体展开
│
├── engines/
│   ├── prompt-template/
│   │   ├── templates/                    # 新增Story 2.2模板
│   │   │   ├── topic-decision-prompt.md
│   │   │   └── queue-replan-prompt.md
│   │   └── template-manager.ts          # [已有]扩展支持系统变量
│   └── script-execution/
│       └── script-executor.ts           # [已有]集成智能规划器
│
└── infrastructure/
    └── validation/
        └── action-schema-validator.ts   # Action配置Schema校验
```

### 4.2 核心类导出

```typescript
// packages/core-engine/src/index.ts 新增导出
export {
  // 领域实体
  EntityListManager,
  ActionTemplate,
  TopicCognitiveContext,
  TopicExecutionAggregate,
} from './domain/index.js';

export {
  // 值对象
  TopicDecision,
  QueueOperation,
  ExpansionRecord,
  EntityStatus,
} from './domain/index.js';

export {
  // 领域服务
  EntityAwarenessService,
  QueueExpansionService,
  TopicStrategyDecisionService,
} from './domain/services/index.js';

export {
  // 应用服务
  IntelligentTopicPlanner,
  TemplateVariableInjector,
} from './application/planning/index.js';
```

---

## 5. 类型定义扩展

### 5.1 shared-types扩展

```typescript
// packages/shared-types/src/domain/script.ts 新增

/**
 * Topic配置扩展 - Story 2.2
 */
export interface TopicConfigV2 {
  topic_id: string;
  topic_name?: string;
  topic_goal?: string;
  strategy?: string;

  // Story 2.2 新增字段
  entity_type?: string; // 关联的实体类型
  action_templates?: ActionTemplateRef[]; // Action模板引用

  actions: ActionConfig[];
  description?: string;
}

/**
 * Action模板引用
 */
export interface ActionTemplateRef {
  template_id: string;
  entity_type: string; // 适用的实体类型
  variable_bindings?: VariableBinding[]; // 变量绑定
  max_actions_per_entity?: number; // 每个实体最多Action数
}

/**
 * Topic执行进度 - Story 2.2
 */
export interface TopicExecutionProgressVO {
  topicId: string;
  totalEntities: number;
  completedEntities: number;
  pendingEntities: number;
  entityStatusMap: Record<string, EntityStatus>;
  totalActions: number;
  completedActions: number;
  currentActionIndex: number;
  currentEntityId?: string;
}
```

### 5.2 执行状态扩展

```typescript
// packages/core-engine/src/engines/script-execution/script-executor.ts 扩展

export interface ExecutionState {
  // ... 现有字段 ...

  // Story 2.2 新增
  topicExecutionAggregate?: TopicExecutionAggregate; // Topic执行聚合
  lastDecision?: TopicDecision; // 上次策略决策
  expansionHistory: ExpansionRecord[]; // 展开历史
}
```

---

## 6. 集成点设计

### 6.1 ScriptExecutor集成

```typescript
// 在ScriptExecutor中集成IntelligentTopicPlanner
export class ScriptExecutor {
  private topicPlanner: ITopicPlanner = new IntelligentTopicPlanner();

  // 原有逻辑保持不变，只需确保传入正确的entity_type
  private async planCurrentTopic(
    topicConfig: any,
    executionState: ExecutionState,
    sessionId: string,
    phaseId: string
  ): Promise<void> {
    const context = {
      topicConfig: {
        topic_id: topicConfig.topic_id,
        actions: topicConfig.actions,
        strategy: topicConfig.strategy,
        // Story 2.2 新增
        entity_type: topicConfig.entity_type,
        action_templates: topicConfig.action_templates,
      },
      variableStore: executionState.variableStore!,
      sessionContext: {
        sessionId,
        phaseId,
        conversationHistory: executionState.conversationHistory,
      },
      // Story 2.2 新增：传入现有聚合实现增量展开
      existingAggregate: executionState.topicExecutionAggregate,
    };

    const topicPlan = await this.topicPlanner.plan(context);
    executionState.currentTopicPlan = topicPlan;

    // 保存聚合实例供后续使用
    executionState.topicExecutionAggregate = topicPlan.executionAggregate;
    executionState.expansionHistory = topicPlan.expansionHistory;
  }
}
```

### 6.2 模板系统集成

```typescript
// 模板管理器扩展：支持系统变量 {%var%} 格式
// 已有实现见 template-manager.ts
// Story 2.2 需确保 Decision/Replan 模板使用正确的变量格式
```

### 6.3 变量系统集成

```typescript
// 实体列表变量的自动识别
// VariableScopeResolver 扩展
export class VariableScopeResolver {
  // Story 2.2: 自动识别实体列表变量
  detectEntityListVariables(topicId: string): string[] {
    const topicVars = this.variableStore.topic[topicId] || {};
    const entityListVars: string[] = [];

    for (const [varName, varValue] of Object.entries(topicVars)) {
      // 匹配常见命名模式：xxx_list, xxxs, xxxes
      if (/(?:_list|s|es)$/.test(varName) && Array.isArray(varValue.value)) {
        entityListVars.push(varName);
      }
    }

    return entityListVars;
  }
}
```

---

## 7. 核心流程时序

### 7.1 首次进入Topic流程

```
User: 进入"童年抚养者信息收集"Topic
                    │
                    ▼
ScriptExecutor.executeTopic()
                    │
                    ▼
shouldPlanTopic() → true
                    │
                    ▼
planCurrentTopic()
                    │
                    ▼
IntelligentTopicPlanner.plan()
                    │
                    ├─► 1. 创建 TopicExecutionAggregate
                    │       - 注册 action_templates
                    │       - 初始化 EntityListManager
                    │
                    ├─► 2. detectEntityChanges()
                    │       - 从变量提取：无（首次）
                    │       - 从对话解析："爸爸"
                    │       - 返回: { added: ["爸爸"], ... }
                    │
                    ├─► 3. aggregate.expandQueueForEntities()
                    │       - ActionTemplate.instantiateForEntity("爸爸")
                    │       - 生成: [ask_caregiver_basic_爸爸, ask_caregiver_relationship_爸爸]
                    │       - 返回: APPEND操作
                    │
                    ├─► 4. aggregate.makeStrategicDecision()
                    │       - TemplateVariableInjector注入模板A
                    │       - LLM调用
                    │       - 返回: NO_CHANGE（首次无变更）
                    │
                    └─► 5. aggregate.toTopicPlan()
                            - 返回: TopicPlan with expanded actions
                    │
                    ▼
返回 TopicPlan
```

### 7.2 运行时实体追加流程

```
Action3(爸爸) 执行完成，用户提及"妈妈、外公"
                    │
                    ▼
Action完成后检测实体变化
                    │
                    ▼
IntelligentTopicPlanner.plan()  ← 传入 existingAggregate
                    │
                    ├─► 1. 复用现有 aggregate
                    │
                    ├─► 2. detectEntityChanges()
                    │       - 变量："爸爸" → ["爸爸", "妈妈", "外公"]
                    │       - 对话新增："妈妈、外公"
                    │       - 返回: { added: ["妈妈", "外公"], ... }
                    │
                    ├─► 3. aggregate.expandQueueForEntities()
                    │       - 增量展开：
                    │         * ActionTemplate.instantiateForEntity("妈妈")
                    │         * ActionTemplate.instantiateForEntity("外公")
                    │       - 插入到当前队列末尾
                    │
                    ├─► 4. aggregate.makeStrategicDecision()
                    │       - LLM判断是否需要重规划
                    │       - 返回: REPLAN_ACTION_QUEUE 或 NO_CHANGE
                    │
                    └─► 5. 返回更新后的 TopicPlan
                    │
                    ▼
ScriptExecutor 继续执行
```

---

## 8. 边界与约束

### 8.1 职责边界

| 层级       | 职责                                 | 不包含          |
| ---------- | ------------------------------------ | --------------- |
| **领域层** | 实体管理、队列展开、策略决策领域逻辑 | LLM调用、持久化 |
| **应用层** | 用例编排、模板变量注入、Schema校验   | 具体业务规则    |
| **引擎层** | Action执行、变量读写、会话状态管理   | 实体识别逻辑    |
| **LLM**    | 决策判断、Action片段生成             | 队列结构修改    |

### 8.2 约束条件

1. **同一实体Action连续性**：展开后的同一实体Action子队列必须连续执行
2. **增量展开优先**：运行时发现新实体时，优先追加而非重排
3. **Schema校验**：LLM生成的Action片段必须通过JSON Schema校验
4. **去重检测**：实体名称规范化后必须去重，避免重复展开
5. **最大实体数**：单个Topic下实体数建议不超过20个（可配置）

### 8.3 范围界定

| 功能             | Story 2.2 | 后续Story |
| ---------------- | --------- | --------- |
| 实体列表动态展开 | ✅        | -         |
| 阻抗/情绪检测    | -         | Story 2.3 |
| 信息充分度控制   | -         | Story 2.4 |
| 时间预算管理     | -         | Story 2.5 |
| 跨Topic跳转      | -         | -         |

---

## 9. 可观测性设计

### 9.1 展开记录

```typescript
// 每次实体列表变化和队列展开时记录
const record: ExpansionRecord = {
  recordId: uuid(),
  topicId: currentTopicId,
  timestamp: new Date().toISOString(),
  trigger: changeType, // initial_discovery | incremental_update
  entityChanges: {
    added: ['妈妈', '外公'],
    removed: [],
    beforeCount: 1,
    afterCount: 3,
  },
  expansionResult: {
    templateId: 'caregiver_template',
    actionsAdded: 4,
    actionIds: [
      'ask_caregiver_basic_妈妈',
      'ask_caregiver_relationship_妈妈',
      'ask_caregiver_basic_外公',
      'ask_caregiver_relationship_外公',
    ],
    insertedAt: 2,
  },
  decision: lastDecision,
};
```

### 9.2 调试接口

```typescript
// GET /api/sessions/:sessionId/topics/:topicId/debug
interface TopicDebugInfo {
  topicId: string;
  executionProgress: TopicExecutionProgressVO;
  entityList: {
    id: string;
    name: string;
    status: EntityStatus;
    actionsCompleted: number;
  }[];
  expansionHistory: ExpansionRecord[];
  lastDecision: TopicDecision;
}
```

---

## 10. 实现 Checklist

- [ ] **领域层**
  - [ ] 实现 EntityListManager 实体
  - [ ] 实现 ActionTemplate 实体
  - [ ] 实现 TopicCognitiveContext 实体
  - [ ] 实现 TopicExecutionAggregate 聚合根
  - [ ] 实现 EntityAwarenessService 领域服务
  - [ ] 实现 QueueExpansionService 领域服务
  - [ ] 实现 TopicStrategyDecisionService 领域服务

- [ ] **应用层**
  - [ ] 实现 IntelligentTopicPlanner 应用服务
  - [ ] 实现 TemplateVariableInjector 应用服务

- [ ] **基础设施**
  - [ ] 编写 topic-decision-prompt.md 模板
  - [ ] 编写 queue-replan-prompt.md 模板
  - [ ] 实现 ActionConfig JSON Schema 校验
  - [ ] 扩展 shared-types 类型定义

- [ ] **集成**
  - [ ] ScriptExecutor 集成 IntelligentTopicPlanner
  - [ ] 持久化 ExpansionRecord 到会话状态

- [ ] **测试**
  - [ ] 单元测试：EntityListManager
  - [ ] 单元测试：QueueExpansionService
  - [ ] 集成测试：完整实体展开流程
  - [ ] E2E测试：多抚养者场景
