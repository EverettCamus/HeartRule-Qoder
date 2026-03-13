---
document_id: docs-design-plans-2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design-md
authority: domain-expert
status: active
version: 1.0.0
last_updated: 2026-03-12
source: docs
path: design/plans/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md
tags:
  - architecture-design
  - llm-pipeline
  - topic-action-queue
  - refactoring
search_priority: high
---

# Story 2.2 Refactoring Design: Two-Stage LLM-Driven Topic Action Queue Dynamic Adjustment

**Document Date**: 2026-03-06
**Designer**: HeartRule Team
**Status**: Pending Implementation

---

## 1. Design Background

### 1.1 Current Implementation Issues

Story 2.2's current implementation hardcodes the "one-to-many entity expansion" business logic in the code layer:

**Issue 1: Hardcoded Entity Recognition**

```typescript
// IntelligentTopicPlanner.extractEntitiesFromConversation (line 267-270)
const caregiverPattern = /(爸爸|妈妈|父亲|母亲|爷爷|奶奶|外公|外婆|祖父|祖母|哥哥|姐姐|弟弟|妹妹)/g;
const matches = message.content.match(caregiverPattern);
```

- Can only match Chinese kinship terms
- Cannot extend to other entity types (e.g., departments, roles)
- New scenarios require code modifications

**Issue 2: Hardcoded Queue Expansion Strategy**

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

- Mechanical "iterate one by one + append to end" logic
- Cannot support complex entity mixing strategies (e.g., 3 actions for dad, 2 for mom, dynamically decided based on conversation)
- Fixed insertion position, cannot be flexibly adjusted

**Issue 3: Action Generation Not Implemented**

```typescript
// TopicDecisionService.generateReplannedActions (line 90-101)
async generateReplannedActions(...): Promise<any[]> {
  // Basic implementation: returns empty array
  // Actual implementation would call LLM to generate new Action configurations
  return [];
}
```

- Currently an empty implementation, should call LLM to generate Action configurations but not completed

### 1.2 Design Goals

Based on discussions with users, this design aims to achieve:

1. **Full Prompt-Driven Decision-to-Execution Pipeline**
   - Introduce two-stage LLM Pipeline: Decision Layer → Planning Layer → Execution Layer
   - Code layer only responsible for LLM orchestration, result validation, and queue operations
   - Almost all business logic transferred to prompts layer

2. **Zero-Code Scenario Extension**
   - Any new scenario in the future (emotion response, resistance handling, conditional skip) only needs prompt updates
   - No code modifications required to support new decision patterns

3. **Domain Expert Iterability**
   - Prompts are strategy documents, domain experts can directly iterate
   - Lower technical barrier, higher iteration efficiency

4. **Flexible Entity Mixing Strategy**
   - Support assigning different numbers of actions to different entities
   - LLM dynamically decides processing depth for each entity based on conversation
   - Support different intents like NEW/EXTEND/DEEPEN/SKIP

---

## 2. Overall Architecture Design

### 2.1 Two-Stage LLM Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  IntelligentTopicPlanner (Application Layer Coordinator)    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Build Context                                      │  │
│  │    - Conversation history + Topic config + Entity state│  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 2. Stage 1: StrategicDecisionLLM                     │  │
│  │    Input: Context + Decision Prompt                   │  │
│  │    Output: {Decision + Adjustment Plan} (JSON)        │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ↓                                  │
│                     needsAdjustment?                       │
│                    ┌───────┴───────┐                       │
│                    │               │                       │
│                 NO YES             NO                       │
│                    │               │                       │
│                    ↓               ↓                       │
│              Return original  ┌────────────────────┐       │
│              queue            │ 3. Stage 2:       │       │
│                              │ ActionPlannerLLM  │       │
│                              │ Input: Adjustment  │       │
│                              │        Plan        │       │
│                              │        + Planner P.│       │
│                              │ Output: Action YAML│       │
│                              └────────────────────┘       │
│                                    ↓                       │
│                      ┌─────────────────────────────┐      │
│                      │ 4. Result Validation &      │      │
│                      │    Conversion               │      │
│                      │    - YAML parsing           │      │
│                      │    - Schema validation      │      │
│                      │    - ActionConfig[]         │      │
│                      └─────────────────────────────┘      │
│                                    ↓                       │
│                      ┌─────────────────────────────┐      │
│                      │ 5. Queue Execution          │      │
│                      │    - QueueExpansionService  │      │
│                      │    - Observability logging  │      │
│                      └─────────────────────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Code Layer Responsibilities (Minimal)

| Responsibility            | Description                                                  |
| ------------------------- | ------------------------------------------------------------ |
| LLM Call Orchestration    | Call two prompts in sequence, pass appropriate context       |
| JSON/YAML Parsing         | Parse LLM output into structured objects                     |
| Schema Validation         | Use Zod to validate ActionConfig legality                    |
| Queue Operation Exec.     | Execute insert/append operations via QueueExpansionService   |
| Error Handling & Fallback | Fall back to NO_CHANGE or keep original queue on LLM failure |

**Key Points**:

- Code layer makes no business decisions ("whether to adjust", "how to adjust" are decided by LLM)
- Code layer only responsible for "orchestration" and "execution"

### 2.3 Core Service Classes

```
IntelligentTopicPlanner (Application Layer Coordinator)
├── TopicDecisionService (Domain Service)
│   ├── buildDecisionPrompt() - Build decision prompt
│   ├── callLLM() - Call decision LLM
│   └── parseDecisionOutput() - Parse decision JSON
│
├── TopicPlannerService (Domain Service, New)
│   ├── buildPlannerPrompt() - Build planner prompt
│   ├── callLLM() - Call planner LLM
│   └── parsePlannerOutput() - Parse Action YAML
│
└── QueueExpansionService (Existing, No Modification)
    └── Actually execute queue operations
```

---

## 3. Decision Prompt Schema Design

### 3.1 Top-Level Schema

```typescript
interface DecisionOutput {
  /**
   * Whether Action queue needs adjustment
   * - Stage 2 condition: Planner Prompt only called when true
   * - Code layer usage: Control flow branching
   */
  needsAdjustment: boolean;

  /**
   * Adjustment strategy type
   * - Stage 2 usage: Guide LLM to choose appropriate YAML generation method
   * - Code layer usage: Logging, observability
   */
  strategy: 'NEW_ENTITIES' | 'DEEPEN_ENTITY' | 'SKIP_ENTITY' | 'REORDER_ACTIONS' | 'CUSTOM';

  /**
   * Decision reasoning process
   * - Code layer usage: Logging, debugging, observability
   */
  reasoning: string;

  /**
   * Adjustment plan (core field)
   * - Stage 2 usage: Input for Planner Prompt
   * - Code layer usage: Validate entity count, estimate Actions count
   */
  adjustmentPlan: AdjustmentPlan;

  /**
   * Execution constraints (optional)
   * - Stage 2 usage: Limit Actions generation boundaries
   * - Code layer usage: Circuit breaker protection, resource control
   */
  constraints?: Constraints;
}
```

### 3.2 AdjustmentPlan Schema

```typescript
interface AdjustmentPlan {
  /**
   * List of entities to process/adjust
   */
  entities: EntityPlan[];

  /**
   * Global Action insertion strategy
   * - Code layer usage: Execute queue operations
   */
  insertionStrategy: 'APPEND_TO_END' | 'INSERT_AFTER_CURRENT' | 'INSERT_BEFORE_TOPIC_END';

  /**
   * Target insertion position (provided as needed)
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
   * Entity name
   * - Stage 2 usage: Reference when generating Actions
   * - Code layer usage: Deduplication normalization
   */
  entityName: string;

  /**
   * Entity processing intent
   */
  intent: 'NEW' | 'EXTEND' | 'DEEPEN' | 'SKIP';

  /**
   * Required Actions description
   * - Stage 2 usage: Main input, determines which Actions to generate
   */
  actionsNeeded: ActionDescription[];

  /**
   * Context information (optional)
   * - Stage 2 usage: Help generate more precise Action content
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
   * Action type
   */
  type: 'ai_ask' | 'ai_say' | 'ai_think' | 'use_skill';

  /**
   * Action purpose description
   * - Stage 2 usage: Guide LLM to generate specific prompt
   */
  purpose: string;

  /**
   * Variable extraction targets (only needed for ai_ask)
   */
  variableTargets?: VariableTarget[];

  /**
   * Priority
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

## 4. Planner Prompt Schema Design

### 4.1 Output Format

Planner Prompt outputs YAML format, which after parsing conforms to `ActionConfig[]` type:

```yaml
actions:
  - action_type: 'ai_say'
    action_id: 'unique ID'
    config:
      content: 'text to say'
      max_rounds: 1

  - action_type: 'ai_ask'
    action_id: 'unique ID'
    config:
      content: 'question text'
      output:
        - get: 'variable name'
          define: 'variable definition'
          extraction_method: 'llm'
      max_rounds: 2
```

### 4.2 Action Type Configuration Specification

#### ai_say

```yaml
Required fields:
  - action_type: 'ai_say'
  - action_id: string
  - config.content: string

Optional fields:
  - config.max_rounds: number (default 1)
  - config.say_goal: string
```

#### ai_ask

```yaml
Required fields:
- action_type: "ai_ask"
- action_id: string
- config.content: string
- config.output: array OR config.target_variable: string

config.output format:
  - get: string (variable name)
    define: string (variable definition)
    extraction_method?: string

Optional fields:
- config.max_rounds: number (default 3)
- config.required: boolean
- config.extraction_prompt: string
```

#### ai_think

```yaml
Required fields:
  - action_type: 'ai_think'
  - action_id: string
  - config.think_goal: string
  - config.input_variables: array<string>
  - config.output_variables: array<string>

Optional fields:
  - config.prompt_template: string
```

#### use_skill

```yaml
Required fields:
  - action_type: 'use_skill'
  - action_id: string
  - config.skill_id: string

Optional fields:
  - config.skill_parameters: object
  - config.output_variables: array<string>
```

### 4.3 Variable Naming Convention

**Nested Entity Variables**:

```
Format: {entity_type}_{index}_{variable_suffix}
Example: caregiver_1_name, caregiver_2_relationship
```

**Dynamic Index Assignment**:

- Assign indices 0, 1, 2... in order of adjustmentPlan.entities
- Existing entities retain original index
- New entities get new indices in sequence

---

## 5. Prompt Template Design

### 5.1 Decision Prompt Template

**Core Functions**:

1. Accept Topic's goal and strategy as guidance
2. Analyze conversation context to identify entity requirements
3. Generate structured adjustment plan
4. Support complex entity mixing strategies

**Main Sections**:

- Current Topic Information
- Conversation Context
- Decision Guidelines (when adjustment is/isn't needed)
- Strategy Type Selection
- Entity Processing Intent Selection
- Action Description Guidance
- Constraints
- Output Format
- Examples

**Key Guiding Principles**:

- Progressive deepening: basic info → relationship history → deep memories
- Natural phrasing: avoid list-style questions
- Flexible adaptation: NEW/EXTEND/DEEPEN different intents correspond to different action counts
- Emotion sensitivity: adjust question tone based on emotionalTone

### 5.1.1 Decision Prompt Template Detailed Structure

````markdown
# Topic Decision Engine - Decision Prompt Template

## System Role and Context

You are the Topic Decision Expert for the HeartRule AI Consulting Engine. Your task is to analyze the current conversation context, determine whether the Action queue needs adjustment, and generate a structured adjustment plan.

## Current Topic Information

- **Topic ID**: {{topic_id}}
- **Topic Goal**: {{topic_goal}}
- **Topic Strategy**: {{topic_strategy}}
- **Current Progress**: {{topic_progress}}%

## Conversation Context

{{conversation_history}}

## Identified Entity Status

{{existing_entities}}

## Decision Guidelines

### When Adjustment is Needed (needsAdjustment = true)

1. **New Entity Discovered**: Entity mentioned in conversation that hasn't been processed (e.g., newly mentioned caregiver)
2. **Entity Needs Deepening**: Already processed entity but information incomplete, need to ask for details
3. **Conversation Shift**: User actively mentions related but unplanned topics
4. **Emotional Signal**: User expresses strong emotions, needs targeted response

### When Adjustment is Not Needed (needsAdjustment = false)

1. **Information Sufficient**: Current entity information collection has reached the goal
2. **User Resistance**: User explicitly indicates unwillingness to continue current topic
3. **Time/Resource Limit**: Session time or resource limit reached
4. **Topic Completed**: Topic goal achieved, no further action needed

## Strategy Type Selection Guide

Choose the appropriate strategy based on adjustment needs:

- **NEW_ENTITIES**: New entities discovered that need processing
- **DEEPEN_ENTITY**: Deepen information collection for existing entities
- **SKIP_ENTITY**: Skip certain entities (user resistance or irrelevant)
- **REORDER_ACTIONS**: Reorder existing Actions
- **CUSTOM**: Custom adjustment strategy

## Entity Processing Intent Selection

Choose the appropriate intent for each entity:

- **NEW**: Brand new entity, needs complete information collection process
- **EXTEND**: Existing entity, supplement additional information
- **DEEPEN**: Deepen emotional/relationship dimensions of existing entity
- **SKIP**: Skip processing for this entity

## Action Description Guidance

Describe needed Actions for each entity:

### ai_say Type

- Purpose: Guide topic, provide explanation, build trust
- Example: "Introduce mom's topic, establish emotional connection"

### ai_ask Type

- Purpose: Collect information, ask for details, explore feelings
- Example: "Ask about mom's basic information (name, relationship, role)"
- Variable extraction: Clearly specify variable names and definitions to extract

### ai_think Type

- Purpose: Internal cognitive processing, emotional analysis, pattern recognition
- Example: "Assess quality of emotional connection with mom"

### use_skill Type

- Purpose: Invoke specific counseling technique
- Example: "Use Socratic questioning to explore parent-child relationship"

## Constraints

{{constraints}}

## Output Format

You must output strict JSON format, conforming to the following Schema:

```json
{
  "needsAdjustment": boolean,
  "strategy": "NEW_ENTITIES" | "DEEPEN_ENTITY" | "SKIP_ENTITY" | "REORDER_ACTIONS" | "CUSTOM",
  "reasoning": "string (decision reasoning process)",
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
            "variableTargets": ["string"]  // only needed for ai_ask
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

## Examples

{{decision_example}}

---

````

### 5.1.2 Variable Substitution Mechanism

Decision Prompt uses a two-layer variable substitution system:

#### System Layer Variables ({%variable_name%})
- Source: Injected at system runtime
- Examples: {%time%}, {%session_id%}, {%user_id%}
- Substitution timing: During prompt construction

#### Template Layer Variables ({{variable_name}})
- Source: Topic configuration or runtime calculation
- Examples: {{topic_goal}}, {{conversation_history}}, {{existing_entities}}
- Substitution timing: During prompt construction

#### Dynamic Content Blocks ({{#if condition}}content{{/if}})
- Purpose: Conditionally include content blocks
- Examples: {{#if has_emotional_tone}}Emotion analysis guidance...{{/if}}
- Implementation: Use ConditionalTemplate class to process

### 5.1.3 Topic Node Configuration Example

```yaml
topic:
  id: "collect_caregiver_info"
  goal: "Collect information about visitor's primary childhood caregivers"
  strategy: "progressive_deepening"
  decision_prompt_config:
    # System layer variable injection
    system_variables:
      time: "{%time%}"
      who: "{%who%}"
      user: "{%user%}"

    # Template layer variable definition
    template_variables:
      topic_goal: "Collect information about visitor's primary childhood caregivers"
      topic_strategy: "Progressive deepening: basic info first, then relationship history, finally deep memories"
      constraints: |
        Max total Actions: 10
        Max Actions per entity: 4
        Time budget: 5 minutes
        Forbidden Action types: []

    # Conditional content block configuration
    conditional_blocks:
      - condition: "has_emotional_context"
        content: |
          Emotion sensitivity guidance:
          Adjust question tone based on user emotion, avoid triggering defensive reactions
      - condition: "has_time_pressure"
        content: |
          Time constraint: Prioritize collecting key information, skip non-essential follow-ups

    # Example configuration
    examples:
      - scenario: "New entity discovered"
        input: "Conversation: 'Mainly dad, later mom came back too. Oh, grandpa also helped often.'"
        output: |
          {
            "needsAdjustment": true,
            "strategy": "NEW_ENTITIES",
            "reasoning": "Discovered two new entities 'mom' and 'grandpa', dad needs relationship history supplement",
            "adjustmentPlan": { ... }
          }
````

---

### 5.2 Planner Prompt Template

**Core Functions**:

1. Accept Stage 1's adjustmentPlan as input
2. Combine Topic's goal and strategy to generate Action YAML
3. Strictly follow ActionConfig Schema for output

### 5.2.1 Planner Prompt Template Detailed Structure

````markdown
# Topic Planning Engine - Planner Prompt Template

## System Role and Context

You are the Topic Planning Expert for the HeartRule AI Consulting Engine. Your task is to generate specific Action YAML configurations based on the decision engine's output.

## Topic Information

- **Topic ID**: {{topic_id}}
- **Topic Goal**: {{topic_goal}}
- **Topic Strategy**: {{topic_strategy}}

## Adjustment Plan Input

The following is the adjustment plan generated by the decision engine:

```json
{{adjustment_plan_json}}
```
````

## Entity Index Assignment Table

Based on adjustmentPlan.entities, assign entity indices:

| Entity Name | Entity Type | Assigned Index | Processing Intent |
| ----------- | ----------- | -------------- | ----------------- |

{{#each entities}}
| {{entityName}} | caregiver | {{@index}} | {{intent}} |
{{/each}}

**Index Assignment Rules**:

1. Assign indices 0, 1, 2... in order of entities array
2. Existing entities retain original index
3. New entities get new indices in sequence

## Action Configuration Specification

### ai_say Action Specification

```yaml
Required fields:
  - action_type: 'ai_say'
  - action_id: '{entity_type}_{index}_{purpose_slug}'
  - config.content: 'string (text to say)'

Optional fields:
  - config.max_rounds: number (default 1)
  - config.say_goal: 'string (speaking purpose)'
```

**Content Design Principles**:

- Natural transition: Naturally introduce new topic from current conversation
- Build trust: Express empathy and understanding
- Clear purpose: Briefly explain why these questions are being asked

### ai_ask Action Specification

```yaml
Required fields:
- action_type: "ai_ask"
- action_id: "{entity_type}_{index}_{variable_suffix}"
- config.content: "string (question text)"
- config.output: array OR config.target_variable: string

config.output format:
  - get: "string (variable name)"
    define: "string (variable definition)"
    extraction_method?: "direct" | "pattern" | "llm"

Optional fields:
- config.max_rounds: number (default 3)
- config.required: boolean
- config.extraction_prompt: string
```

**Question Design Principles**:

1. **Progressive Deepening**: From simple facts → relationship description → emotional experience
2. **Open Guidance**: Use open-ended questions, avoid yes/no answers
3. **Single Focus**: Each question focuses on one topic
4. **Clear Variables**: Clearly specify variable names and definitions to extract

### ai_think Action Specification

```yaml
Required fields:
  - action_type: 'ai_think'
  - action_id: '{entity_type}_{index}_think_{purpose_slug}'
  - config.think_goal: 'string (thinking goal)'
  - config.input_variables: ['string']
  - config.output_variables: ['string']

Optional fields:
  - config.prompt_template: string
```

**Thinking Goal Design**:

- Analyze patterns: Identify relationship patterns, emotional patterns
- Assess quality: Evaluate relationship quality, emotional connection
- Generate insights: Generate professional insights based on existing information

### use_skill Action Specification

```yaml
Required fields:
  - action_type: 'use_skill'
  - action_id: '{entity_type}_{index}_skill_{skill_name}'
  - config.skill_id: 'string'

Optional fields:
  - config.skill_parameters: object
  - config.output_variables: ['string']
```

## Action ID Naming Convention

### Naming Format

```
{entity_type}_{index}_{purpose_slug}
```

**Field Description**:

- `entity_type`: Entity type (e.g., caregiver, department, role)
- `index`: Entity index (starting from 0)
- `purpose_slug`: Purpose abbreviation (lowercase letters + underscores)

### Examples

- `caregiver_0_say_welcome`: ai_say welcoming dad
- `caregiver_1_ask_basic_info`: ai_ask asking about mom's basic info
- `caregiver_2_think_emotional_connection`: ai_think assessing emotional connection with grandpa

## Variable Naming Convention

### Nested Entity Variable Format

```
{entity_type}_{index}_{variable_suffix}
```

**Examples**:

- `caregiver_0_name`: Dad's name
- `caregiver_1_relationship`: Relationship type with mom
- `caregiver_2_childhood_memory`: Childhood memory with grandpa

### Variable Suffix Convention

| Suffix       | Meaning              | Example                          |
| ------------ | -------------------- | -------------------------------- |
| name         | Name                 | caregiver_0_name                 |
| relationship | Relationship type    | caregiver_1_relationship         |
| role         | Role description     | caregiver_2_role                 |
| memory       | Memory description   | caregiver_0_childhood_memory     |
| emotion      | Emotional experience | caregiver_1_emotional_tone       |
| quality      | Relationship quality | caregiver_2_relationship_quality |

## Output Format

You must output strict YAML format, conforming to ActionConfig[] Schema:

```yaml
actions:
  - action_type: 'ai_say'
    action_id: 'caregiver_1_say_welcome'
    config:
      content: |
        Next, I'd like to learn about your mother's situation.
        Understanding childhood caregivers helps understand your growth experience.
      max_rounds: 1

  - action_type: 'ai_ask'
    action_id: 'caregiver_1_ask_basic_info'
    config:
      content: |
        What is your mother's name?
        How is your relationship with her (close/distant/rather complex)?
        What role did she play in your growth process?
      output:
        - get: 'caregiver_1_name'
          define: "Mother's name"
          extraction_method: 'direct'
        - get: 'caregiver_1_relationship'
          define: 'Relationship type with mother'
          extraction_method: 'llm'
      max_rounds: 2

  # ... more actions
```

## Examples

{{planner_example}}

---

````

### 5.2.2 Variable Substitution and Template Inheritance

Planner Prompt inherits Decision Prompt's variable substitution system and adds planning layer specific variables:

#### Input Variables ({{variable_name}})
- `{{adjustment_plan_json}}`: Complete JSON output from Stage 1
- `{{entities}}`: Entity list, used to generate index assignment table
- `{{topic_goal}}`, `{{topic_strategy}}`: Inherited from Topic configuration

#### Template Fragments ({{>fragment_name}})
- Purpose: Reuse common Action configuration templates
- Example: {{>ai_ask_basic_info_template}}
- Implementation: Use ModularTemplate class to compose

#### Loop Structure ({{#each items}}content{{/each}})
- Purpose: Iterate entity list to generate configuration
- Example: {{#each entities}}Generate Actions for {{entityName}}...{{/each}}
- Implementation: Use ConditionalTemplate class to process

### 5.2.3 Topic Node Configuration Example (Continued)

```yaml
topic:
  id: "collect_caregiver_info"
  goal: "Collect information about visitor's primary childhood caregivers"
  strategy: "progressive_deepening"

  planner_prompt_config:
    # Input variable binding
    input_variables:
      adjustment_plan_json: "{{adjustment_plan_json}}"
      entities: "{{adjustment_plan.entities}}"

    # Template fragment registration
    template_fragments:
      ai_ask_basic_info_template: |
        - action_type: "ai_ask"
          action_id: "{entity_type}_{index}_ask_basic_info"
          config:
            content: |
              What is {entity_name}'s name?
              How is your relationship with {entity_name} (close/distant/rather complex)?
              What role did {entity_name} play in your growth process?
            output:
              - get: "{entity_type}_{index}_name"
                define: "{entity_name}'s name"
                extraction_method: "direct"
              - get: "{entity_type}_{index}_relationship"
                define: "Relationship type with {entity_name}"
                extraction_method: "llm"
            max_rounds: 2

      ai_say_transition_template: |
        - action_type: "ai_say"
          action_id: "{entity_type}_{index}_say_transition"
          config:
            content: |
              Next, I'd like to learn about your {entity_name}'s situation.
              Understanding childhood caregivers helps understand your growth experience.
            max_rounds: 1

    # Loop template configuration
    loop_templates:
      - for: "entities"
        template: |
          # Process entity: {{entityName}}
          {{>ai_say_transition_template}}
          {{>ai_ask_basic_info_template}}
          {{#if needs_deepening}}
          {{>ai_ask_deepening_template}}
          {{/if}}

    # Example configuration
    examples:
      - scenario: "New entity processing"
        input: |
          {
            "needsAdjustment": true,
            "strategy": "NEW_ENTITIES",
            "adjustmentPlan": {
              "entities": [
                {
                  "entityName": "Mom",
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
                  Next, I'd like to learn about your mother's situation.
                  Understanding childhood caregivers helps understand your growth experience.
                max_rounds: 1
            # ... more actions
````

---

## 5.3 Boundary Between Script Configuration and Template Logic

### 5.3.1 Separation of Concerns Principle

The two-stage LLM Pipeline follows clear separation of concerns:

| Layer              | Configuration Location | Responsibility                                      | Modification Frequency                     |
| ------------------ | ---------------------- | --------------------------------------------------- | ------------------------------------------ |
| **Script Layer**   | YAML script files      | Define Topic goals, strategies, constraints         | Low (when domain knowledge changes)        |
| **Template Layer** | Prompt template files  | Define decision/planning logic, guiding principles  | Medium (when prompt optimization iterates) |
| **Code Layer**     | TypeScript source code | Implement LLM calls, parsing, validation, execution | Very Low (when architecture changes)       |

### 5.3.2 Script Layer Configuration (YAML)

Script layer is responsible for domain knowledge concretization, configured in Topic YAML files:

```yaml
topic:
  id: 'collect_caregiver_info'
  goal: 'Collect information about visitor's primary childhood caregivers'
  strategy: 'progressive_deepening'

  # Decision prompt configuration
  decision_prompt_config:
    system_variables:
      time: '{%time%}'
      who: '{%who%}'
    template_variables:
      topic_goal: 'Collect information about visitor's primary childhood caregivers'
      topic_strategy: 'Progressive deepening: basic info first, then relationship history, finally deep memories'
    constraints: |
      Max total Actions: 10
      Max Actions per entity: 4
    examples:
      - scenario: 'New entity discovered'
        input: "Conversation: 'Mainly dad, later mom came back too.'"
        output: '{...}'

  # Planner prompt configuration
  planner_prompt_config:
    input_variables:
      adjustment_plan_json: '{{adjustment_plan_json}}'
    template_fragments:
      ai_ask_basic_info_template: '...'
    examples:
      - scenario: 'New entity processing'
        input: '{...}'
        output: 'actions: [...]'
```

**Script Layer Concerns**:

- Specific domain goals (what information to collect)
- Specific strategies (how to collect)
- Specific constraints (resource limits)
- Specific examples (typical scenarios)

### 5.3.3 Template Layer Logic (Prompt Templates)

Template layer is responsible for decision/planning generic logic, stored in separate Prompt template files:

```markdown
# Topic Decision Engine - Decision Prompt Template

## System Role and Context

You are the Topic Decision Expert for the HeartRule AI Consulting Engine...

## Decision Guidelines

### When Adjustment is Needed (needsAdjustment = true)

1. **New Entity Discovered**: Entity mentioned in conversation that hasn't been processed...
2. **Entity Needs Deepening**: Already processed entity but information incomplete...

### When Adjustment is Not Needed (needsAdjustment = false)

1. **Information Sufficient**: Current entity information collection has reached the goal...
2. **User Resistance**: User explicitly indicates unwillingness to continue current topic...

## Strategy Type Selection Guide

Choose the appropriate strategy based on adjustment needs:

- **NEW_ENTITIES**: New entities discovered that need processing
- **DEEPEN_ENTITY**: Deepen information collection for existing entities
- **SKIP_ENTITY**: Skip certain entities...

...
```

**Template Layer Concerns**:

- Generic decision logic (when to adjust, how to choose strategy)
- Generic planning logic (how to generate Actions, naming conventions)
- Generic guiding principles (question design, variable naming)
- Generic output format (JSON/YAML Schema)

### 5.3.4 Code Layer Implementation (TypeScript)

Code layer is responsible for technical implementation, does not contain business logic:

```typescript
// TopicDecisionService - Only responsible for orchestration, does not contain decision logic
class TopicDecisionService {
  async makeDecision(context: DecisionContext): Promise<DecisionOutput> {
    // 1. Build Prompt (combine script config + template)
    const prompt = this.buildDecisionPrompt(context);

    // 2. Call LLM
    const llmResponse = await this.callLLM(prompt);

    // 3. Parse and validate
    const decision = this.parseDecisionOutput(llmResponse);
    this.validateDecisionSchema(decision);

    // 4. Return result
    return decision;
  }

  // Build Prompt: combine template + script config + runtime variables
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

**Code Layer Concerns**:

- LLM call orchestration (sequence, error handling)
- Template rendering (variable substitution, conditional logic)
- Result parsing (JSON/YAML parsing)
- Schema validation (Zod validation)
- Queue operation execution (insert, append)

### 5.3.5 Benefits of Clear Boundaries

1. **Zero-Code Extension**: New scenarios only need YAML config updates, no code changes
2. **Domain Expert Iterability**: Prompt templates are strategy documents, directly readable and editable
3. **Technical Debt Isolation**: Business logic in Prompt layer, technical implementation in code layer
4. **Test Friendly**: Can test Prompt effectiveness and code correctness separately
5. **Version Control**: Prompt templates and script configs can be versioned independently

### 5.3.6 Modification Guide

**When to Modify Script Layer (YAML)**:

- Add new Topic types
- Adjust domain-specific constraint conditions
- Add new example scenarios
- Modify domain goals or strategies

**When to Modify Template Layer (Prompt)**:

- Optimize decision logic (more accurate needsAdjustment judgment)
- Improve planning quality (more natural Action generation)
- Add new strategy types
- Improve variable naming conventions

**When to Modify Code Layer (TypeScript)**:

- Fix technical bugs (parsing errors, memory leaks)
- Performance optimization (caching, parallelization)
- Architecture changes (new LLM Provider, storage backend)
- Add observability (logging, monitoring)

---

## 6. Complete Flow Example

### Scenario: Collecting Caregiver Information, Discovering New Entities

**Input**:

- Topic goal: Collect information about visitor's primary childhood caregivers
- Conversation: "Mainly dad, later mom came back too. Oh, grandpa also helped often."
- Already processed: Dad (basic info completed)

**Stage 1 (Decision) Output**:

```json
{
  "needsAdjustment": true,
  "strategy": "NEW_ENTITIES",
  "reasoning": "Discovered two new entities 'mom' and 'grandpa', dad needs relationship history supplement",
  "adjustmentPlan": {
    "entities": [
      {
        "entityName": "Mom",
        "intent": "NEW",
        "actionsNeeded": [
          { "type": "ai_say", "purpose": "Introduce mom's topic", "priority": "high" },
          { "type": "ai_ask", "purpose": "Ask about mom's basic information", "priority": "high" },
          {
            "type": "ai_ask",
            "purpose": "Ask about early memories with mom",
            "priority": "medium"
          },
          {
            "type": "ai_think",
            "purpose": "Assess emotional connection with mom",
            "priority": "low"
          }
        ]
      },
      {
        "entityName": "Grandpa",
        "intent": "NEW",
        "actionsNeeded": [
          {
            "type": "ai_ask",
            "purpose": "Ask about grandpa's basic information",
            "priority": "medium"
          }
        ]
      },
      {
        "entityName": "Dad",
        "intent": "EXTEND",
        "actionsNeeded": [
          {
            "type": "ai_ask",
            "purpose": "Ask about childhood relationship history with dad",
            "priority": "high"
          }
        ]
      }
    ],
    "insertionStrategy": "APPEND_TO_END"
  }
}
```

**Stage 2 (Planner) Output**:

```yaml
actions:
  - action_type: ai_say
    action_id: mother_1_say_welcome
    config:
      content: |
        Next, I'd like to learn about your mother's situation.
        Understanding childhood caregivers helps understand your growth experience.
      max_rounds: 1

  - action_type: ai_ask
    action_id: mother_1_ask_basic_info
    config:
      content: |
        What is your mother's name?
        How is your relationship with her (close/distant/rather complex)?
        What role did she play in your growth process?
      output:
        - get: caregiver_1_name
          define: "Mother's name"
          extraction_method: direct
        - get: caregiver_1_relationship
          define: 'Relationship type with mother'
          extraction_method: llm
      max_rounds: 2

  # ... more actions
```

---

## 7. Risks and Trade-offs

### 7.1 Advantages

| Aspect                 | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| Flexibility            | Zero-code extension for new scenarios, just update prompt |
| Maintainability        | Domain experts can directly iterate prompts               |
| Extensibility          | Supports complex entity mixing strategies                 |
| Clear Responsibilities | Decision, planning, execution separation                  |

### 7.2 Risks

| Risk                  | Impact                                             | Mitigation                                                       |
| --------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Performance           | Two LLM calls, increased latency                   | Use fast models (GPT-4o-mini for Stage 1), caching               |
| Prompt Design Barrier | Prompt quality directly affects system performance | Establish prompt engineering standards, continuous iteration     |
| Configuration Cost    | Need to carefully design two templates             | Provide rich examples and guidance documentation                 |
| LLM Output Stability  | JSON/YAML parsing may fail                         | Strict Schema validation, error handling and fallback mechanisms |

### 7.3 Trade-off Decisions

**Reasons for Choosing Two-Stage LLM Pipeline**:

1. **Aligns with Core Vision**: User explicitly requested "full prompt-driven decision-to-execution pipeline", option 1 fits best
2. **Zero-Code Extension**: Any new scenario in the future only needs prompt updates, no code changes
3. **Domain Expert Friendly**: Prompts are strategy documents, directly iterable
4. **Clear Architecture**: Decision → Planning → Execution separation, matches cognitive patterns

**Performance Issue Mitigation**:

- Stage 1 uses lightweight model, fast filtering
- Stage 2 can execute asynchronously (not blocking main flow)
- Decision result caching (no repeated calls for same context)

---

## 8. Implementation Plan (Overview)

### Phase 1: Infrastructure

- [ ] Create TopicPlannerService service class
- [ ] Implement Decision Prompt Template
- [ ] Implement Planner Prompt Template
- [ ] Add JSON Schema and YAML Schema validation

### Phase 2: Integration into IntelligentTopicPlanner

- [ ] Rewrite plan() method, implement two-stage flow
- [ ] Remove hardcoded entity recognition logic
- [ ] Remove mechanical iteration in expandQueueForEntities

### Phase 3: Testing and Optimization

- [ ] Write unit tests (Decision output validation)
- [ ] Write unit tests (Planner output validation)
- [ ] Write integration tests (complete flow)
- [ ] Prompt iteration optimization

### Phase 4: Documentation and Observability

- [ ] Update technical documentation
- [ ] Enhance logging
- [ ] Add decision tracing

---

## 9. Future Extension Points

This design reserves extension capabilities for the following scenarios:

- **Scenario B: Topic Extension Handling** - Add strategy description in Decision Prompt
- **Scenario C: Conditional Skip** - Implement via SKIP_ENTITY type and intent='SKIP'
- **Scenario D: Emotion Response** - Add new EMOTION_DETECTION strategy type

All extensions only require:

1. Add guiding principles for new strategies in Decision Prompt
2. Add corresponding Action generation rules in Planner Prompt
3. Update Schema definitions (if new fields exist)

No code logic modifications required.

---

## 10. Appendix

### Appendix A: Schema Definition Files

All Schema definitions should be added to:

- `/packages/shared-types/src/domain/topic-types.ts`

### Appendix B: Prompt Template Storage Location

Two Prompt Templates should be stored as:

- `/config/prompts/topic/decision-llm-v1-draft.md`
- `/config/prompts/topic/planner-llm-v1-draft.md`

### Appendix C: Related Design Documents

- [Story 2.2 Original Requirements Document](../../product/feature-guides/topic-dynamic-action-queue-intelligent-capability-requirements.md)
- [Story 2.2 DDD Tactical Design](../../domain/tactical/topic-action-queue-ddd-tactical-design.md)
