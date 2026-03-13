# Story 2.2: Topic Dynamic Expansion of Action Queue - DDD Tactical Design

## 1. Design Goals

This document is based on "Story 2.2: Topic Layer Intelligent Capability for Dynamic Expansion of Action Queue Based on Entity List", transforming business requirements into an implementation solution conforming to DDD tactical design. The core goal is to implement **one-to-many entity queue expansion capability**, enabling the Topic layer to dynamically generate and adjust Action execution queues based on runtime-identified entity lists.

---

## 2. Domain Model Design

### 2.1 Core Entities

#### 2.1.1 Entity List Manager (EntityListManager)

```typescript
// Domain Entity: Entity List
// Responsibility: Manage lifecycle, state tracking, and incremental detection of a single entity list
export class EntityListManager {
  private entityList: Map<string, EntityItem> = new Map();
  private readonly entityType: string;  // e.g., "caregiver", "department", "role"
  private readonly topicId: string;

  // Entity item structure
  interface EntityItem {
    id: string;                    // Unique identifier
    name: string;                  // Display name
    canonicalName: string;        // Normalized name (for deduplication)
    status: EntityStatus;         // Entity processing status
    createdAt: Date;
    updatedAt: Date;
  }

  // Entity status enum
  enum EntityStatus {
    DISCOVERED = 'discovered',    // Newly discovered
    PROCESSING = 'processing',    // Processing
    COMPLETED = 'completed',      // Completed
    SKIPPED = 'skipped'           // Skipped
  }

  // Core methods
  addEntity(name: string): EntityItem;
  removeEntity(entityId: string): boolean;
  getEntities(): EntityItem[];
  getEntitiesByStatus(status: EntityStatus): EntityItem[];
  updateEntityStatus(entityId: string, status: EntityStatus): void;
  detectNewEntities(newNames: string[]): EntityItem[];  // Incremental detection
  normalizeEntityName(name: string): string;            // Name normalization
}
```

**Design Rationale**:

- EntityListManager as an independent domain entity, responsible for encapsulating all entity list operations
- Normalization logic is cohesive within the entity manager, facilitating unified handling of aliases like "dad, father, daddy"
- State tracking supports the complete lifecycle of "not started/in progress/completed/skipped"

#### 2.1.2 Action Template (ActionTemplate)

```typescript
// Domain Entity: Action Template
// Responsibility: Encapsulate Action sequence template for a single entity
export class ActionTemplate {
  readonly templateId: string;
  readonly entityType: string;              // Associated entity type
  readonly actionSequence: ActionConfig[];   // Action config sequence
  readonly variableBindings: VariableBinding[];  // Variable binding rules

  // Variable binding definition
  interface VariableBinding {
    sourceVariable: string;    // Placeholder in template
    entityProperty: string;    // Corresponding entity property
    defaultValue?: string;
  }

  // Core methods
  instantiateForEntity(entity: EntityItem): ActionConfig[];
  getMaxActionsPerEntity(): number;
}
```

**Design Rationale**:

- ActionTemplate is a read-only template object, does not contain runtime state
- variableBindings defines the mapping between template placeholders and entity properties
- instantiateForEntity generates Action config copies for a specific entity

#### 2.1.3 Topic Cognitive Context (TopicCognitiveContext)

```typescript
// Domain Entity: Topic Cognitive Context
// Responsibility: Encapsulate runtime state snapshot needed by Topic consciousness layer
export class TopicCognitiveContext {
  readonly topicId: string;
  readonly goal: string;
  readonly strategy: string;

  private currentAction: ActionSummary | null;
  private topicPlan: TopicPlanSummary;
  private entityListManager: EntityListManager;
  private conversationSummary: string;
  private timeAndState: TimeAndState;

  // Action summary structure
  interface ActionSummary {
    actionId: string;
    actionType: string;
    purpose: string;
    outputTargets: string[];
    currentRound: number;
    maxRounds: number;
  }

  // Topic plan summary
  interface TopicPlanSummary {
    executedActions: ActionSummary[];
    pendingActions: ActionSummary[];
    totalCount: number;
  }

  // Time and state
  interface TimeAndState {
    remainingTimeMinutes: number;
    userEngagement: 'high' | 'medium' | 'low';
    emotionalIntensity: 'calm' | 'mild' | 'intense';
  }

  // Core methods
  snapshot(): TopicCognitiveContextData;
  updateWithActionResult(result: ActionResult): void;
  updateWithEntityChanges(added: EntityItem[], removed: EntityItem[]): void;
}
```

**Design Rationale**:

- TopicCognitiveContext aggregates all context information needed for Topic execution
- Generate snapshot before each LLM call to ensure decision consistency
- Contains sufficient information to support three types of decisions (NO_CHANGE/TUNE_CURRENT_ACTION/REPLAN_ACTION_QUEUE)

### 2.2 Value Objects

#### 2.2.1 Decision Result (TopicDecision)

```typescript
// Value Object: Topic Strategy Decision
// Immutable object, representing Topic consciousness layer decision result
export interface TopicDecision {
  readonly decision: 'NO_CHANGE' | 'TUNE_CURRENT_ACTION' | 'REPLAN_ACTION_QUEUE';
  readonly reason: string; // Decision reason (within 50 characters)
  readonly tuneHint?: TuneCurrentActionHint; // Tuning hint
  readonly queueReplanHint?: QueueReplanHint; // Queue replan hint
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

#### 2.2.2 Queue Operation Command (QueueOperation)

```typescript
// Value Object: Queue Operation Command
// Describes specific operations on Topic Action queue
export interface QueueOperation {
  readonly operationType: QueueOperationType;
  readonly targetPosition: QueuePosition;
  readonly actionsToInsert?: ActionConfig[];
  readonly actionsToRemove?: string[]; // actionIds
  readonly actionsToReorder?: ReorderSpec[];
}

export type QueueOperationType =
  | 'APPEND' // Append to end
  | 'INSERT_AFTER' // Insert after specified position
  | 'REPLACE_RANGE' // Replace specified range
  | 'REORDER'; // Reorder

export interface QueuePosition {
  afterActionId?: string; // Insert position
  beforeActionId?: string; // Or before position
  index?: number; // Or directly specify index
}

export interface ReorderSpec {
  actionId: string;
  newIndex: number;
}
```

#### 2.2.3 Expansion Record (ExpansionRecord)

```typescript
// Value Object: Expansion Record
// For observability and debugging
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
    insertedAt: number; // Queue position
  };
  readonly decision: TopicDecision;
}

export type ExpansionTrigger =
  | 'initial_discovery' // First discovery of entity
  | 'incremental_update' // Incremental update
  | 'strategy_driven'; // Strategy driven
```

### 2.3 Domain Services

#### 2.3.1 Entity Awareness Service (EntityAwarenessService)

```typescript
// Domain Service: Entity Awareness
// Responsibility: Identify and track entities from variables and conversations
export interface EntityAwarenessService {
  // Extract entity list from variable
  extractEntitiesFromVariable(variableName: string, variableValue: any): string[];

  // Parse potential entities from conversation history
  extractEntitiesFromConversation(
    conversationHistory: ConversationEntry[],
    entityType: string
  ): Promise<string[]>;

  // Detect entity list changes
  detectEntityChanges(currentList: string[], previousList: string[]): EntityChangeResult;

  // Normalize entity name
  normalizeEntityName(name: string, entityType: string): string;
}

export interface EntityChangeResult {
  added: string[];
  removed: string[];
  unchanged: string[];
  changeType: 'initial' | 'incremental' | 'none';
}
```

**Design Rationale**:

- Entity awareness is an independent core capability, encapsulating detection and normalization logic
- Supports multiple sources: variable extraction, conversation parsing
- Incremental detection avoids reprocessing existing entities

#### 2.3.2 Queue Expansion Service (QueueExpansionService)

```typescript
// Domain Service: Queue Expansion
// Responsibility: Expand Action template into concrete queue for entity list
export interface QueueExpansionService {
  // Initial expansion: When entities first discovered
  initialExpansion(
    template: ActionTemplate,
    entities: EntityItem[],
    insertPosition: QueuePosition
  ): QueueOperation;

  // Incremental expansion: When new entities discovered at runtime
  incrementalExpansion(
    template: ActionTemplate,
    newEntities: EntityItem[],
    currentQueueLength: number,
    lastEntityIndex: number
  ): QueueOperation;

  // Validate expansion result
  validateExpansion(operation: QueueOperation, existingActions: ActionConfig[]): ValidationResult;

  // Generate Action config with entity binding
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

#### 2.3.3 Topic Strategy Decision Service (TopicStrategyDecisionService)

```typescript
// Domain Service: Topic Strategy Decision
// Responsibility: Encapsulate LLM call and decision logic
export interface TopicStrategyDecisionService {
  // Make one of three decision types
  makeDecision(context: TopicCognitiveContext): Promise<TopicDecision>;

  // When decision is REPLAN_ACTION_QUEUE, generate new Action segments
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

### 2.4 Aggregate Root

#### 2.4.1 Topic Execution Aggregate (TopicExecutionAggregate)

```typescript
// Aggregate Root: Topic Execution Aggregate
// Encapsulates all domain logic during Topic execution
export class TopicExecutionAggregate {
  readonly topicId: string;
  readonly topicConfig: TopicConfig;

  private entityListManager: EntityListManager;
  private actionTemplates: Map<string, ActionTemplate>; // templateId -> template
  private instantiatedQueue: ActionConfig[];
  private currentPlan: TopicPlanSummary;
  private cognitiveContext: TopicCognitiveContext;
  private expansionHistory: ExpansionRecord[];

  // Core methods
  initialize(entityType: string, templates: ActionTemplate[]): void;

  // Domain methods
  registerDiscoveredEntities(entityNames: string[]): EntityChangeResult;

  expandQueueForEntities(change: EntityChangeResult): QueueOperation[];

  makeStrategicDecision(): Promise<TopicDecision>;

  applyQueueOperations(operations: QueueOperation[]): void;

  getExecutionProgress(): TopicExecutionProgress;

  recordExpansion(record: ExpansionRecord): void;

  // State queries
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

**Design Rationale**:

- TopicExecutionAggregate is the core aggregate root, encapsulating all domain logic coordination for Topic execution
- EntityListManager, ActionTemplate, QueueExpansionService
- Guarantees immutability: all state changes through explicit domain methods
- ExpansionHistory supports observability requirements

---

## 3. Application Layer Design

### 3.1 Application Service: Intelligent Topic Planner (IntelligentTopicPlanner)

```typescript
// Application Service: Intelligent Topic Planner
// Coordinates domain objects to complete intelligent planning use case
// DDD Position: Application Layer Service
export class IntelligentTopicPlanner implements ITopicPlanner {
  private readonly entityAwarenessService: EntityAwarenessService;
  private readonly queueExpansionService: QueueExpansionService;
  private readonly decisionService: TopicStrategyDecisionService;
  private readonly templateManager: PromptTemplateManager;
  private readonly llmOrchestrator: LLMOrchestrator;

  // Planning entry point
  async plan(context: TopicPlanningContext): Promise<TopicPlan> {
    // 1. Initialize or restore Topic execution aggregate
    const aggregate = this.getOrCreateAggregate(context.topicId);

    // 2. Entity awareness: Detect entities from variables and conversations
    const entityChanges = await this.detectEntityChanges(context);

    // 3. If new entities discovered, execute queue expansion
    if (entityChanges.changeType !== 'none') {
      const expansionOps = aggregate.expandQueueForEntities(entityChanges);
      aggregate.applyQueueOperations(expansionOps);
    }

    // 4. Strategy decision: Call Topic consciousness layer
    const decision = await aggregate.makeStrategicDecision();

    // 5. Execute corresponding operations based on decision
    switch (decision.decision) {
      case 'NO_CHANGE':
        // Keep existing queue unchanged
        break;

      case 'TUNE_CURRENT_ACTION':
        // Adjust current Action execution strategy (handled by Action layer)
        await this.applyTuningHint(decision.tuneHint, context);
        break;

      case 'REPLAN_ACTION_QUEUE':
        // Generate new Action segments and insert into queue
        const newActions = await this.decisionService.generateReplannedActions(
          decision,
          aggregate.getCognitiveContext(),
          this.getSchemaConstraints()
        );
        aggregate.appendActions(newActions);
        break;
    }

    // 6. Return final TopicPlan
    return aggregate.toTopicPlan();
  }

  // Detect entity changes
  private async detectEntityChanges(context: TopicPlanningContext): Promise<EntityChangeResult> {
    // Extract from variables
    const variableEntities = this.entityAwarenessService.extractEntitiesFromVariable(
      context.entityType + '_list',
      context.variableStore.topic[context.topicId]?.get(context.entityType + '_list')?.value
    );

    // Parse from conversation (optional, reduce LLM calls)
    const conversationEntities = await this.entityAwarenessService.extractEntitiesFromConversation(
      context.sessionContext.conversationHistory,
      context.entityType
    );

    // Merge and detect changes
    const allEntities = [...new Set([...variableEntities, ...conversationEntities])];
    return this.entityAwarenessService.detectEntityChanges(
      allEntities,
      this.getPreviousEntityList(context.topicId)
    );
  }
}
```

### 3.2 Application Service: Template Variable Injector (TemplateVariableInjector)

```typescript
// Application Service: Template Variable Injector
// Responsible for injecting runtime context into LLM prompt templates
export class TemplateVariableInjector {
  // Variable injection for Template A (Decision Layer)
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
      new Map(), // No script layer variables
      systemVars
    );
  }

  // Variable injection for Template B (Queue Generation Layer)
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
      per_entity_action_outline: context.strategy, // Extracted from strategy
      action_schema_constraints: this.formatSchemaConstraints(schemaConstraints),
      allowed_action_types: schemaConstraints.allowedActionTypes.join(', '),
      max_actions_per_entity: schemaConstraints.maxActionsPerEntity,
      insert_position_description: 'End of current queue',
    };

    return this.templateManager.substituteVariables(template.content, new Map(), systemVars);
  }

  // Format Schema constraints as human-readable text
  private formatSchemaConstraints(constraints: SchemaConstraints): string {
    // Convert JSON Schema to natural language description
    // For LLM to understand allowed fields and types
  }
}
```

### 3.3 Coordination Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ScriptExecutor                                   │
│  [Story 2.1] Call TopicPlanner.plan()                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    IntelligentTopicPlanner                               │
│                                                                          │
│  1. Get/Create TopicExecutionAggregate                                    │
│  2. detectEntityChanges() ──────────────────────────────────────┐       │
│     │                                                              │       │
│     ▼                                                              ▼       │
│  ┌──────────────────┐                            ┌────────────────────┐ │
│  │EntityAwareness   │                            │  aggregate.register │ │
│  │Service           │                            │  DiscoveredEntities │ │
│  │ - Variable       │                            │  → EntityChange     │ │
│  │   extraction     │                            └────────────────────┘ │
│  │ - Conversation   │                                       │           │
│  │   parsing        │                                       ▼           │
│  │ - Incremental    │                            ┌────────────────────┐  │
│  │   detection      │                            │ aggregate.expand  │  │
│  └──────────────────┘                            │ QueueForEntities │  │
│     Returns: EntityChangeResult                  └────────────────────┘  │
│                                                                           │
│  3. makeStrategicDecision() ─────────────────────────────────────────┘   │
│     │                                                                 │   │
│     ▼                                                                 │   │
│  ┌────────────────────┐                            ┌─────────────────────┐│
│  │ TemplateVariable   │                            │  aggregate.make     ││
│  │ Injector           │                            │  StrategicDecision  ││
│  │ - Inject Template A│                            │  → TopicDecision    ││
│  └────────────────────┘                            └─────────────────────┘│
│     │                                                                 │   │
│     ▼                                                                 │   │
│  ┌────────────────────┐                                   ┌────────────┴┐ │
│  │ LLM Call           │                                   │ switch      │ │
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
│  Return existing  Apply tuneHint  aggregate.appendActions()              │
│  queue                                       │                           │
│                                              ▼                           │
│                                      Return TopicPlan                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Division and File Organization

### 4.1 New Module Structure

```
packages/core-engine/src/
├── domain/
│   ├── entity-list/
│   │   ├── entity-list-manager.ts      # Entity List Manager
│   │   ├── entity-item.ts              # Entity Item Value Object
│   │   └── index.ts
│   ├── action-template/
│   │   ├── action-template.ts          # Action Template Entity
│   │   ├── variable-binding.ts        # Variable Binding Definition
│   │   └── index.ts
│   ├── topic-cognitive/
│   │   ├── topic-cognitive-context.ts  # Topic Cognitive Context
│   │   ├── topic-decision.ts           # Strategy Decision Value Object
│   │   ├── queue-operation.ts          # Queue Operation Command
│   │   ├── expansion-record.ts         # Expansion Record
│   │   └── index.ts
│   ├── topic-execution/
│   │   ├── topic-execution-aggregate.ts # Topic Execution Aggregate Root
│   │   └── index.ts
│   └── services/
│       ├── entity-awareness.service.ts  # Entity Awareness Domain Service
│       ├── queue-expansion.service.ts   # Queue Expansion Domain Service
│       ├── topic-strategy.service.ts     # Topic Strategy Decision Domain Service
│       └── index.ts
│
├── application/
│   ├── planning/
│   │   ├── intelligent-topic-planner.ts # Intelligent Topic Planner (Application Service)
│   │   └── template-variable-injector.ts # Template Variable Injector
│   └── orchestration/
│       └── topic-action-orchestrator.ts  # [Existing] Extended to support entity expansion
│
├── engines/
│   ├── prompt-template/
│   │   ├── templates/                    # New Story 2.2 templates
│   │   │   ├── topic-decision-prompt.md
│   │   │   └── queue-replan-prompt.md
│   │   └── template-manager.ts          # [Existing] Extended to support system variables
│   └── script-execution/
│       └── script-executor.ts           # [Existing] Integrate intelligent planner
│
└── infrastructure/
    └── validation/
        └── action-schema-validator.ts   # Action Config Schema Validation
```

### 4.2 Core Class Exports

```typescript
// packages/core-engine/src/index.ts new exports
export {
  // Domain Entities
  EntityListManager,
  ActionTemplate,
  TopicCognitiveContext,
  TopicExecutionAggregate,
} from './domain/index.js';

export {
  // Value Objects
  TopicDecision,
  QueueOperation,
  ExpansionRecord,
  EntityStatus,
} from './domain/index.js';

export {
  // Domain Services
  EntityAwarenessService,
  QueueExpansionService,
  TopicStrategyDecisionService,
} from './domain/services/index.js';

export {
  // Application Services
  IntelligentTopicPlanner,
  TemplateVariableInjector,
} from './application/planning/index.js';
```

---

## 5. Type Definition Extensions

### 5.1 shared-types Extensions

```typescript
// packages/shared-types/src/domain/script.ts additions

/**
 * Topic Config Extension - Story 2.2
 */
export interface TopicConfigV2 {
  topic_id: string;
  topic_name?: string;
  topic_goal?: string;
  strategy?: string;

  // Story 2.2 new fields
  entity_type?: string; // Associated entity type
  action_templates?: ActionTemplateRef[]; // Action template references

  actions: ActionConfig[];
  description?: string;
}

/**
 * Action Template Reference
 */
export interface ActionTemplateRef {
  template_id: string;
  entity_type: string; // Applicable entity type
  variable_bindings?: VariableBinding[]; // Variable bindings
  max_actions_per_entity?: number; // Max Actions per entity
}

/**
 * Topic Execution Progress - Story 2.2
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

### 5.2 Execution State Extension

```typescript
// packages/core-engine/src/engines/script-execution/script-executor.ts extension

export interface ExecutionState {
  // ... existing fields ...

  // Story 2.2 additions
  topicExecutionAggregate?: TopicExecutionAggregate; // Topic execution aggregate
  lastDecision?: TopicDecision; // Last strategy decision
  expansionHistory: ExpansionRecord[]; // Expansion history
}
```

---

## 6. Integration Point Design

### 6.1 ScriptExecutor Integration

```typescript
// Integrate IntelligentTopicPlanner in ScriptExecutor
export class ScriptExecutor {
  private topicPlanner: ITopicPlanner = new IntelligentTopicPlanner();

  // Original logic remains unchanged, just ensure correct entity_type is passed
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
        // Story 2.2 addition
        entity_type: topicConfig.entity_type,
        action_templates: topicConfig.action_templates,
      },
      variableStore: executionState.variableStore!,
      sessionContext: {
        sessionId,
        phaseId,
        conversationHistory: executionState.conversationHistory,
      },
      // Story 2.2 addition: Pass existing aggregate for incremental expansion
      existingAggregate: executionState.topicExecutionAggregate,
    };

    const topicPlan = await this.topicPlanner.plan(context);
    executionState.currentTopicPlan = topicPlan;

    // Save aggregate instance for later use
    executionState.topicExecutionAggregate = topicPlan.executionAggregate;
    executionState.expansionHistory = topicPlan.expansionHistory;
  }
}
```

### 6.2 Template System Integration

```typescript
// Template manager extension: Support system variables {%var%} format
// Existing implementation see template-manager.ts
// Story 2.2 needs to ensure Decision/Replan templates use correct variable format
```

### 6.3 Variable System Integration

```typescript
// Automatic recognition of entity list variables
// VariableScopeResolver extension
export class VariableScopeResolver {
  // Story 2.2: Auto-detect entity list variables
  detectEntityListVariables(topicId: string): string[] {
    const topicVars = this.variableStore.topic[topicId] || {};
    const entityListVars: string[] = [];

    for (const [varName, varValue] of Object.entries(topicVars)) {
      // Match common naming patterns: xxx_list, xxxs, xxxes
      if (/(?:_list|s|es)$/.test(varName) && Array.isArray(varValue.value)) {
        entityListVars.push(varName);
      }
    }

    return entityListVars;
  }
}
```

---

## 7. Core Flow Sequence

### 7.1 First Entry to Topic Flow

```
User: Enter "Childhood Caregiver Information Collection" Topic
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
                    ├─► 1. Create TopicExecutionAggregate
                    │       - Register action_templates
                    │       - Initialize EntityListManager
                    │
                    ├─► 2. detectEntityChanges()
                    │       - Extract from variables: None (first time)
                    │       - Parse from conversation: "爸爸"
                    │       - Return: { added: ["爸爸"], ... }
                    │
                    ├─► 3. aggregate.expandQueueForEntities()
                    │       - ActionTemplate.instantiateForEntity("爸爸")
                    │       - Generate: [ask_caregiver_basic_爸爸, ask_caregiver_relationship_爸爸]
                    │       - Return: APPEND operation
                    │
                    ├─► 4. aggregate.makeStrategicDecision()
                    │       - TemplateVariableInjector inject Template A
                    │       - LLM call
                    │       - Return: NO_CHANGE (no change first time)
                    │
                    └─► 5. aggregate.toTopicPlan()
                            - Return: TopicPlan with expanded actions
                    │
                    ▼
Return TopicPlan
```

### 7.2 Runtime Entity Append Flow

```
Action3(爸爸) execution complete, user mentions "妈妈、外公"
                    │
                    ▼
Detect entity changes after Action completion
                    │
                    ▼
IntelligentTopicPlanner.plan()  ← Pass existingAggregate
                    │
                    ├─► 1. Reuse existing aggregate
                    │
                    ├─► 2. detectEntityChanges()
                    │       - Variable: "爸爸" → ["爸爸", "妈妈", "外公"]
                    │       - Conversation new: "妈妈、外公"
                    │       - Return: { added: ["妈妈", "外公"], ... }
                    │
                    ├─► 3. aggregate.expandQueueForEntities()
                    │       - Incremental expansion:
                    │         * ActionTemplate.instantiateForEntity("妈妈")
                    │         * ActionTemplate.instantiateForEntity("外公")
                    │       - Insert at end of current queue
                    │
                    ├─► 4. aggregate.makeStrategicDecision()
                    │       - LLM determines if replan needed
                    │       - Return: REPLAN_ACTION_QUEUE or NO_CHANGE
                    │
                    └─► 5. Return updated TopicPlan
                    │
                    ▼
ScriptExecutor continues execution
```

---

## 8. Boundaries and Constraints

### 8.1 Responsibility Boundaries

| Layer                 | Responsibility                                                         | Not Included                 |
| --------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| **Domain Layer**      | Entity management, queue expansion, strategy decision domain logic     | LLM calls, persistence       |
| **Application Layer** | Use case orchestration, template variable injection, Schema validation | Specific business rules      |
| **Engine Layer**      | Action execution, variable read/write, session state management        | Entity recognition logic     |
| **LLM**               | Decision judgment, Action segment generation                           | Queue structure modification |

### 8.2 Constraints

1. **Same Entity Action Continuity**: Expanded Action sub-queues for the same entity must execute continuously
2. **Incremental Expansion Priority**: When new entities discovered at runtime, prioritize appending over reordering
3. **Schema Validation**: LLM-generated Action segments must pass JSON Schema validation
4. **Deduplication Detection**: Entity names must be deduplicated after normalization to avoid duplicate expansion
5. **Max Entity Count**: Single Topic entity count recommended not to exceed 20 (configurable)

### 8.3 Scope Definition

| Feature                         | Story 2.2 | Subsequent Story |
| ------------------------------- | --------- | ---------------- |
| Entity list dynamic expansion   | ✅        | -                |
| Resistance/Emotion detection    | -         | Story 2.3        |
| Information sufficiency control | -         | Story 2.4        |
| Time budget management          | -         | Story 2.5        |
| Cross-Topic transition          | -         | -                |

---

## 9. Observability Design

### 9.1 Expansion Record

```typescript
// Record each time entity list changes and queue expands
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

### 9.2 Debug Interface

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

## 10. Implementation Checklist

- [ ] **Domain Layer**
  - [ ] Implement EntityListManager entity
  - [ ] Implement ActionTemplate entity
  - [ ] Implement TopicCognitiveContext entity
  - [ ] Implement TopicExecutionAggregate aggregate root
  - [ ] Implement EntityAwarenessService domain service
  - [ ] Implement QueueExpansionService domain service
  - [ ] Implement TopicStrategyDecisionService domain service

- [ ] **Application Layer**
  - [ ] Implement IntelligentTopicPlanner application service
  - [ ] Implement TemplateVariableInjector application service

- [ ] **Infrastructure**
  - [ ] Write topic-decision-prompt.md template
  - [ ] Write queue-replan-prompt.md template
  - [ ] Implement ActionConfig JSON Schema validation
  - [ ] Extend shared-types type definitions

- [ ] **Integration**
  - [ ] ScriptExecutor integrate IntelligentTopicPlanner
  - [ ] Persist ExpansionRecord to session state

- [ ] **Testing**
  - [ ] Unit test: EntityListManager
  - [ ] Unit test: QueueExpansionService
  - [ ] Integration test: Complete entity expansion flow
  - [ ] E2E test: Multiple caregiver scenario
