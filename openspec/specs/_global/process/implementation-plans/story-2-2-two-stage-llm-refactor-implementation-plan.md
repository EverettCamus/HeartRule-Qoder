---
document_id: openspec-specs-_global-process-implementation-plans-story-2-2-two-stage-llm-refactor-implementation-plan-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/_global/process/implementation-plans/story-2-2-two-stage-llm-refactor-implementation-plan.md
tags: [authoritative, current, specification]
search_priority: high
---

# Story 2.2 Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Topic Action queue dynamic adjustment from code-level logic to two-stage LLM-driven prompt architecture (Decision → Planner → Execution).

**Architecture:** Introduce two-stage LLM pipeline where Decision LLM analyzes conversation and generates JSON adjustment plan, Planner LLM converts plan to Action YAML scripts, and code layer only handles orchestration, validation, and execution. Remove all hardcoded business logic (entity regex patterns, mechanical queue expansion) and move to prompts.

**Tech Stack:** TypeScript, Zod (Schema validation), JS-YAML (YAML parsing), LLMOrchestrator (LLM calls), Vitest (testing)

---

## Context

**Design Document:** `docs/design/plans/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md`

**Current State Issues:**

- Hardcoded entity regex: `/caregiverPattern/` only matches Chinese kinship terms
- Mechanical queue expansion: for-each loop with fixed append logic
- Empty implementation: `generateReplannedActions()` returns `[]`

**Target State:**

- Two LLM prompts (Decision + Planner) handle all business logic
- Code layer: orchestration, validation, execution only
- Zero-code scenario expansion (prompt editing only)

---

## Task 1: Add Decision Output Schema Types

**Files:**

- Create: `packages/shared-types/src/domain/topic-decision-v2.ts`
- Test: `packages/shared-types/test/unit/topic-decision-v2-schema.test.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
import { describe, it, expect } from 'vitest';
import {
  DecisionOutputSchema,
  AdjustmentPlanSchema,
  EntityPlanSchema,
  ActionDescriptionSchema,
} from '@heartrule/shared-types';

describe('DecisionOutputSchema', () => {
  it('should validate correct DecisionOutput', () => {
    const data = {
      needsAdjustment: true,
      strategy: 'NEW_ENTITIES',
      reasoning: '发现新实体',
      adjustmentPlan: {
        entities: [],
        insertionStrategy: 'APPEND_TO_END',
      },
    };

    const result = DecisionOutputSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject invalid strategy', () => {
    const data = {
      needsAdjustment: true,
      strategy: 'INVALID',
      reasoning: '发现新实体',
      adjustmentPlan: {
        entities: [],
        insertionStrategy: 'APPEND_TO_END',
      },
    };

    const result = DecisionOutputSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should validate EntityPlan with actionsNeeded', () => {
    const data = {
      entityName: '妈妈',
      intent: 'NEW',
      actionsNeeded: [
        {
          type: 'ai_ask',
          purpose: '询问基本信息',
          priority: 'high',
        },
      ],
    };

    const result = EntityPlanSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should validate ActionDescription with variableTargets', () => {
    const data = {
      type: 'ai_ask',
      purpose: '询问基本信息',
      priority: 'high',
      variableTargets: [
        {
          name: 'mother_name',
          type: 'text',
          extractionMethod: 'direct',
          description: '妈妈的姓名',
        },
      ],
    };

    const result = ActionDescriptionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- packages/shared-types/test/unit/topic-decision-v2-schema.test.ts
```

Expected: FAIL with error "Cannot find module '@heartrule/shared-types' or DecisionOutputSchema undefined"

**Step 3: Write minimal implementation**

Create_schema file:

```typescript
import { z } from 'zod';

/**
 * Decision Output Schema - Stage 1 LLM output
 */
export interface DecisionOutput {
  needsAdjustment: boolean;
  strategy: 'NEW_ENTITIES' | 'DEEPEN_ENTITY' | 'SKIP_ENTITY' | 'REORDER_ACTIONS' | 'CUSTOM';
  reasoning: string;
  adjustmentPlan: AdjustmentPlan;
  constraints?: Constraints;
}

export interface AdjustmentPlan {
  entities: EntityPlan[];
  insertionStrategy: 'APPEND_TO_END' | 'INSERT_AFTER_CURRENT' | 'INSERT_BEFORE_TOPIC_END';
  targetPosition?: {
    afterActionId?: string;
    positionIndex?: number;
  };
}

export interface EntityPlan {
  entityName: string;
  intent: 'NEW' | 'EXTEND' | 'DEEPEN' | 'SKIP';
  actionsNeeded: ActionDescription[];
  context?: {
    conversationSnippet?: string;
    existingKnowledge?: string;
    emotionalTone?: string;
  };
}

export interface ActionDescription {
  type: 'ai_ask' | 'ai_say' | 'ai_think' | 'use_skill';
  purpose: string;
  priority: 'high' | 'medium' | 'low';
  variableTargets?: VariableTarget[];
}

export interface VariableTarget {
  name: string;
  type: 'text' | 'number' | 'rating' | 'boolean' | 'array';
  extractionMethod: 'direct' | 'pattern' | 'llm';
  description: string;
}

export interface Constraints {
  maxTotalActions?: number;
  maxActionsPerEntity?: number;
  timeBudgetMinutes?: number;
  forbiddenActionTypes?: string[];
}

// Zod Schemas
export const ActionDescriptionSchema = z.object({
  type: z.enum(['ai_ask', 'ai_say', 'ai_think', 'use_skill']),
  purpose: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  variableTargets: z
    .array(
      z
        .object({
          name: z.string(),
          type: z.enum(['text', 'number', 'rating', 'boolean', 'array']),
          extractionMethod: z.enum(['direct', 'pattern', 'llm']),
          description: z.string(),
        })
        .optional()
    )
    .optional(),
});

export const EntityPlanSchema = z.object({
  entityName: z.string(),
  intent: z.enum(['NEW', 'EXTEND', 'DEEPEN', 'SKIP']),
  actionsNeeded: z.array(ActionDescriptionSchema),
  context: z
    .object({
      conversationSnippet: z.string().optional(),
      existingKnowledge: z.string().optional(),
      emotionalTone: z.string().optional(),
    })
    .optional(),
});

export const AdjustmentPlanSchema = z.object({
  entities: z.array(EntityPlanSchema),
  insertionStrategy: z.enum(['APPEND_TO_END', 'INSERT_AFTER_CURRENT', 'INSERT_BEFORE_TOPIC_END']),
  targetPosition: z
    .object({
      afterActionId: z.string().optional(),
      positionIndex: z.number().optional(),
    })
    .optional(),
});

export const ConstraintsSchema = z
  .object({
    maxTotalActions: z.number().optional(),
    maxActionsPerEntity: z.number().optional(),
    timeBudgetMinutes: z.number().optional(),
    forbiddenActionTypes: z.array(z.string()).optional(),
  })
  .optional();

export const DecisionOutputSchema = z.object({
  needsAdjustment: z.boolean(),
  strategy: z.enum(['NEW_ENTITIES', 'DEEPEN_ENTITY', 'SKIP_ENTITY', 'REORDER_ACTIONS', 'CUSTOM']),
  reasoning: z.string(),
  adjustmentPlan: AdjustmentPlanSchema,
  constraints: ConstraintsSchema.optional(),
});
```

Update index.ts (add export):

```typescript
export * from './domain/topic-decision-v2.js';
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test -- packages/shared-types/test/unit/topic-decision-v2-schema.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared-types/src/domain/topic-decision-v2.ts packages/shared-types/test/unit/topic-decision-v2-schema.test.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add DecisionOutput schema for Stage 1 LLM

Add DecisionOutput, AdjustmentPlan, EntityPlan, ActionDescription schemas
to support two-stage LLM pipeline architecture.

Allows Stage 1 LLM to output structured adjustment plan in JSON format.
"
```

---

## Task 2: Create TopicPlannerService Domain Service

**Files:**

- Create: `packages/core-engine/src/domain/services/topic-planner-service.ts`
- Test: `packages/core-engine/test/unit/domain/topic-planner-service.test.ts`

**Step 1: Write the failing test**

Create test file:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { TopicPlannerService } from '@heartrule/core-engine/src/domain/services/topic-planner-service.js';
import type { AdjustmentPlan } from '@heartrule/shared-types';
import { LLMOrchestrator } from '@heartrule/core-engine/src/engines/llm-orchestration/orchestrator.js';

vi.mock('@heartrule/core-engine/src/engines/llm-orchestration/orchestrator.js');

describe('TopicPlannerService', () => {
  let service: TopicPlannerService;
  let mockLLMOrchestrator: any;

  beforeEach(() => {
    mockLLMOrchestrator = {
      generateText: vi.fn().mockResolvedValue({
        text: `actions:
  - action_type: ai_say
    action_id: test_say
    config:
      content: "测试"
      max_rounds: 1`,
      }),
    };
    service = new TopicPlannerService(mockLLMOrchestrator);
  });

  it('should parse YAML output into ActionConfig array', async () => {
    const adjustmentPlan: AdjustmentPlan = {
      entities: [],
      insertionStrategy: 'APPEND_TO_END',
    };

    const actions = await service.generateActions(adjustmentPlan, {
      topicGoal: '测试目标',
      strategy: '测试策略',
    });

    expect(actions).toHaveLength(1);
    expect(actions[0].action_type).toBe('ai_say');
    expect(actions[0].action_id).toBe('test_say');
  });

  it('should throw error if YAML is invalid', async () => {
    mockLLMOrchestrator.generateText.mockResolvedValue({
      text: 'invalid yaml content',
    });

    const adjustmentPlan: AdjustmentPlan = {
      entities: [],
      insertionStrategy: 'APPEND_TO_END',
    };

    await expect(
      service.generateActions(adjustmentPlan, { topicGoal: '测试', strategy: '测试' })
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- packages/core-engine/test/unit/domain/topic-planner-service.test.ts
```

Expected: FAIL with "TopicPlannerService not defined"

**Step 3: Write minimal implementation**

Create service file:

```typescript
import yaml from 'js-yaml';
import type { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';
import type { AdjustmentPlan, ActionConfig } from '@heartrule/shared-types';

export interface PlannerContext {
  topicGoal: string;
  strategy: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  entityMapping?: Record<string, number>;
}

export class TopicPlannerService {
  private llmOrchestrator?: LLMOrchestrator;

  constructor(llmOrchestrator?: LLMOrchestrator) {
    this.llmOrchestrator = llmOrchestrator;
  }

  /**
   * Generate Actions from adjustment plan
   */
  async generateActions(
    adjustmentPlan: AdjustmentPlan,
    context: PlannerContext
  ): Promise<ActionConfig[]> {
    if (!this.llmOrchestrator) {
      console.warn('[TopicPlannerService] LLMOrchestrator未提供，返回空数组');
      return [];
    }

    try {
      // Build planner prompt
      const prompt = this.buildPlannerPrompt(adjustmentPlan, context);

      // Call LLM
      const result = await this.llmOrchestrator.generateText(prompt, {
        temperature: 0.3,
        maxTokens: 2000,
      });

      // Parse YAML
      const yamlContent = result.text.trim();
      const parsed = yaml.load(yamlContent) as any;

      if (!parsed || !parsed.actions || !Array.isArray(parsed.actions)) {
        throw new Error('YAML output格式无效：缺少actions数组');
      }

      return parsed.actions;
    } catch (error) {
      console.error('[TopicPlannerService] 生成Actions失败:', error);
      throw new Error(`生成Actions失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private buildPlannerPrompt(adjustmentPlan: AdjustmentPlan, context: PlannerContext): string {
    const { topicGoal, strategy, entityMapping } = context;

    // TODO: Load from template file
    return `你是一个AI咨询引擎的Action规划器。你的任务是将"调整计划"转换为可执行的Action YAML脚本。

## Topic信息

**Topic目标**：
${topicGoal}

**Topic策略指导**：
${strategy}

## 调整计划

${JSON.stringify(adjustmentPlan, null, 2)}

## 实体索引分配

${JSON.stringify(entityMapping || {}, null, 2)}

## 输出格式

必须以严格的YAML格式输出（不要有markdown代码块标记，直接输出YAML）：

\`\`\`yaml
actions:
  - action_type: "ai_say"
    action_id: "唯一ID"
    config:
      content: "内容"
      max_rounds: 1
\`\`\`

请直接输出YAML，不要有任何其他文字。`;
  }
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test -- packages/core-engine/test/unit/domain/topic-planner-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core-engine/src/domain/services/topic-planner-service.ts packages/core-engine/test/unit/domain/topic-planner-service.test.ts
git commit -m "feat(core-engine): add TopicPlannerService for Stage 2 LLM

Add TopicPlannerService to convert AdjustmentPlan to Action YAML
using LLM. Supports YAML parsing and validation.
"
```

---

## Task 3: Integrate Two-Stage Pipeline into IntelligentTopicPlanner

**Files:**

- Modify: `packages/core-engine/src/application/planning/intelligent-topic-planner.ts:45-147`

**Step 1: Write the failing test**

Update integration test:

```typescript
it('should execute two-stage LLM pipeline when adjustment needed', async () => {
  const mockDecisionOutput = {
    needsAdjustment: true,
    strategy: 'NEW_ENTITIES',
    reasoning: '发现新实体',
    adjustmentPlan: {
      entities: [],
      insertionStrategy: 'APPEND_TO_END' as const,
    },
  };

  mockDecisionService.makeDecision.mockResolvedValueOnce(mockDecisionOutput);
  mockPlannerService.generateActions.mockResolvedValueOnce([
    {
      action_type: 'ai_ask',
      action_id: 'test_action',
      config: { content: 'test' },
    },
  ]);

  const plan = await planner.plan(context);

  expect(mockDecisionService.makeDecision).toHaveBeenCalledTimes(1);
  expect(mockPlannerService.generateActions).toHaveBeenCalledTimes(1);
  expect(plan.instantiatedActions).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
```

Expected: FAIL (current implementation doesn't call PlannerService)

**Step 3: Write minimal implementation**

Replace plan() method logic:

```typescript
async plan(context: TopicPlanningContext): Promise<TopicPlan> {
  const { topicConfig, variableStore, sessionContext } = context;

  console.log(`[IntelligentTopicPlanner] 🧠 规划Topic: ${topicConfig.topic_id}`);

  // If no entity_type configured, use basic planning
  const entityType = topicConfig.entity_type;
  if (!entityType) {
    console.log(`[IntelligentTopicPlanner] ⚠️ Topic未配置entity_type，使用基础规划逻辑`);
    return this.fallbackToBasicPlanning(topicConfig, variableStore, sessionContext);
  }

  // Create or restore entity list manager
  const entityListManager = this.getOrCreateEntityListManager(
    entityType,
    topicConfig.topic_id,
    variableStore
  );

  // Detect entity changes
  const entityChanges = await this.detectEntityChanges(
    entityListManager,
    variableStore,
    sessionContext,
    entityType,
    topicConfig.topic_id
  );

  // Build cognitive context for Stage 1 (Decision)
  const cognitiveContext = this.buildCognitiveContext(
    topicConfig,
    entityListManager,
    sessionContext
  );

  // Stage 1: Decision LLM
  const decision = await this.decisionService.makeDecision(cognitiveContext);
  console.log(`[IntelligentTopicPlanner] 🤖 Stage 1决策: ${decision.decision} - ${decision.reason}`);

  // If no adjustment needed, return current queue
  if (decision.decision !== 'REPLAN_ACTION_QUEUE') {
    console.log(`[IntelligentTopicPlanner] ✅ 无需调整队列`);
    const result = this.queueExpansionService.appendActions([], topicConfig.actions);
    return {
      topicId: topicConfig.topic_id,
      plannedAt: new Date().toISOString(),
      instantiatedActions: result.queue,
      planningContext: {
        variableSnapshot: this.captureVariableSnapshot(variableStore),
        strategyUsed: topicConfig.strategy || '',
        entityChanges,
        decision
      }
    };
  }

  // Stage 2: Planner LLM
  console.log(`[IntelligentTopicPlanner] 🔄 调用Stage 2生成Actions`);
  const newActions = await this.plannerService.generateActions(
    decision.queueReplanHint as any, // TODO: Convert TopicDecision to AdjustmentPlan
    {
      topicGoal: topicConfig.topic_goal || '',
      strategy: topicConfig.strategy || '',
      conversationHistory: sessionContext.conversationHistory,
      entityMapping: this.buildEntityMapping(entityListManager)
    }
  );

  // Apply actions to queue
  const result = this.queueExpansionService.appendActions([], newActions);

  // Build expansion record
  const expansionRecord = this.expansionRecordBuilder
    .setTopicId(topicConfig.topic_id)
    .setTrigger('strategy_driven')
    .setEntityChanges(entityChanges.added, [], 0, newActions.length)
    .setExpansionResult(newActions, undefined, 0)
    .setDecision(decision)
    .build();

  this.expansionRecordBuilder.reset();

  return {
    topicId: topicConfig.topic_id,
    plannedAt: new Date().toISOString(),
    instantiatedActions: result.queue,
    planningContext: {
      variableSnapshot: this.captureVariableSnapshot(variableStore),
      strategyUsed: topicConfig.strategy || '',
      entityChanges,
      decision,
      expansionRecord
    }
  };
}
```

Add helper method:

```typescript
private buildEntityMapping(entityListManager: any): Record<string, number> {
  const entities = entityListManager.getEntities();
  const mapping: Record<string, number> = {};
  entities.forEach((e: any, index: number) => {
    mapping[e.name] = index;
  });
  return mapping;
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm test -- packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core-engine/src/application/planning/intelligent-topic-planner.ts packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
git commit -m "refactor(core-engine): integrate two-stage LLM pipeline in IntelligentTopicPlanner

Replace hardcoded entity detection and queue expansion with two-stage
LLM approach:
- Stage 1: Decision LLM generates adjustment plan
- Stage 2: Planner LLM converts plan to Action YAML
- Code layer only orchestrates and executes

Removes:
- Hardcoded regex patterns for entity detection
- Mechanical for-each queue expansion
- Empty generateReplannedActions() implementation
"
```

---

## Task 4: Remove Hardcoded Entity Detection Logic

**Files:**

- Modify: `packages/core-engine/src/application/planning/intelligent-topic-planner.ts:254-280`

**Step 1: Remove extractEntitiesFromConversation method**

Delete the method entirely:

```typescript
// DELETE this entire method (lines 254-280)
private extractEntitiesFromConversation(
  conversationHistory: Array<{ role: string; content: string }>,
  entityType: string
): string[] {
  // Simple implementation removed - handled by LLM now
  return [];
}
```

**Step 2: Update detectEntityChanges to use only variable-based detection**

```typescript
private async detectEntityChanges(
  entityListManager: EntityListManager,
  variableStore: VariableStore,
  _sessionContext: TopicPlanningContext['sessionContext'], // No longer needed
  entityType: string,
  topicId: string
): Promise<{ added: string[]; removed: string[]; unchanged: string[] }> {
  const added: string[] = [];
  const unchanged: string[] = [];

  // 1. Extract entities from variables only (LLM will handle conversation)
  const entityListKey = `${entityType}_list`;
  const topicVars = variableStore.topic[topicId] || {};
  const variableEntities = topicVars[entityListKey]?.value as string[] | undefined;

  // 2. Detect new entities
  const currentEntities = entityListManager.getEntities();
  const currentNames = currentEntities.map((e) => e.name);

  if (variableEntities) {
    for (const entityName of variableEntities) {
      if (!currentNames.includes(entityName)) {
        added.push(entityName);
      } else {
        unchanged.push(entityName);
      }
    }
  }

  // 3. Update entity list manager
  if (added.length > 0) {
    entityListManager.detectNewEntities(added);
  }

  return { added, removed: [], unchanged };
}
```

**Step 3: Update tests**

Update integration test to not depend on regex-based extraction:

```typescript
it('should not use regex patterns for entity detection', async () => {
  const context = {
    topicConfig: createMockTopicConfig('test_topic'),
    variableStore: createMockVariableStore(),
    sessionContext: {
      conversationHistory: [{ role: 'user', content: '提到爸爸和妈妈' }],
    },
  };

  const plan = await planner.plan(context);

  // Verify no regex patterns were used (no hardcoded entity extraction)
  expect(plan.planningContext?.entityChanges?.added).toEqual([]);
  // Entity detection now handled by Stage 1 Decision LLM
});
```

**Step 4: Run tests**

Run:

```bash
pnpm test -- packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core-engine/src/application/planning/intelligent-topic-planner.ts
git commit -m "refactor(core-engine): remove hardcoded entity detection regex logic

Remove extractEntitiesFromConversation() method which used hardcoded
regex patterns (/(爸爸|妈妈|...)/). Entity detection now fully
delegated to Stage 1 Decision LLM prompt.

Simplifies detectEntityChanges() to only check variables.
"
```

---

## Task 5: Implement Decision Prompt Template

**Files:**

- Create: `packages/core-engine/config/prompts/topic/decision-llm-prompt.md`
- Modify: `packages/core-engine/src/domain/services/topic-decision-service.ts:106-155`

**Step 1: Create Decision Prompt Template**

Create template file:

```markdown
# Decision Prompt Template

你是一个AI咨询引擎的Topic策略决策器。你需要分析当前对话状态，判断是否需要调整Topic的Action队列，如果需要，则生成详细的调整计划。

---

## 当前Topic信息

**Topic目标**：
{{topic_goal}}

**Topic策略**：
{{strategy}}

---

## 对话上下文

**最近3条用户消息**：
{{conversation_summary}}

**已处理的实体列表**：
{{entity_list}}

**当前Action进度**：

- 已执行：{{executed_actions}} 个
- 待执行：{{pending_actions}} 个
- 总计：{{total_actions}} 个

---

## 输出格式

**必须以严格的JSON格式输出**：

\`\`\`json
{
"needsAdjustment": true/false,
"strategy": "NEW_ENTITIES|DEEPEN_ENTITY|SKIP_ENTITY|REORDER_ACTIONS|CUSTOM",
"reasoning": "50字内说明决策原因",
"adjustmentPlan": {
"entities": [...],
"insertionStrategy": "APPEND_TO_END|INSERT_AFTER_CURRENT|INSERT_BEFORE_TOPIC_END"
}
}
\`\`\`

请直接输出JSON，不要有任何其他文字。
```

**Step 2: Update DecisionService to load template**

Modify buildDecisionPrompt():

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

private buildDecisionPrompt(context: TopicCognitiveContext): string {
  // Load template
  const templatePath = join(
    process.cwd(),
    'config',
    'prompts',
    'topic',
    'decision-llm-prompt.md'
  );

  let template = '';
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    // Fallback to inline template
    template = this.getFallbackDecisionPrompt();
  }

  const {
    goal,
    strategy,
    currentAction,
    topicPlan,
    entityList,
    conversationSummary,
    timeAndState
  } = context;

  // Replace variables
  return template
    .replace('{{topic_goal}}', goal || '未指定')
    .replace('{{strategy}}', strategy || '未指定')
    .replace('{{conversation_summary}}', conversationSummary || '无')
    .replace('{{entity_list}}', JSON.stringify(entityList.map(e => e.name), null, 2))
    .replace('{{executed_actions}}', topicPlan.executedActions.toString())
    .replace('{{pending_actions}}', topicPlan.pendingActions.toString())
    .replace('{{total_actions}}', topicPlan.totalActions.toString());
}

private getFallbackDecisionPrompt(): string {
  const {
    goal,
    strategy,
    topicPlan,
    entityList
  } = this.context;

  // Return inline fallback prompt from design document
  // (Copy full prompt from design doc section 5.1)
  return `你是一个AI咨询引擎的Topic策略决策器...

[Full prompt content]
`;
}
```

**Step 3: Write test for template loading**

```typescript
it('should load decision prompt from template file', () => {
  const service = new TopicDecisionService();
  const context = {
    topicId: 'test',
    goal: '测试目标',
    strategy: '测试策略',
    topicPlan: { executedActions: 1, pendingActions: 2, totalActions: 3 },
    entityList: [],
    conversationSummary: '测试摘要',
    timeAndState: { remainingTimeMinutes: 30, userEngagement: 'medium' },
  };

  const prompt = service.buildDecisionPrompt(context);

  expect(prompt).toContain('Topic策略决策器');
  expect(prompt).toContain('测试目标');
  expect(prompt).toContain('JSON格式输出');
});
```

**Step 4: Run tests**

Run:

```bash
pnpm test -- packages/core-engine/test/unit/domain/topic-decision-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core-engine/config/prompts/topic/decision-llm-prompt.md packages/core-engine/src/domain/services/topic-decision-service.ts packages/core-engine/test/unit/domain/topic-decision-service.test.ts
git commit -m "feat(core-engine): implement Decision Prompt Template

Load decision prompt from template file instead of inline string.
Allows domain experts to iterate on prompt without code changes.

Template validates JSON output format with detailed examples.
"
```

---

## Task 6: Implement Planner Prompt Template

**Files:**

- Create: `packages/core-engine/config/prompts/topic/planner-llm-prompt.md`
- Modify: `packages/core-engine/src/domain/services/topic-planner-service.ts:96-135`

**Step 1: Create Planner Prompt Template**

Create template file:

```markdown
# Planner Prompt Template

你是一个AI咨询引擎的Action规划器。你的任务是将"调整计划"转换为可执行的Action YAML脚本。

---

## Topic信息

**Topic目标**：
{{topic_goal}}

**Topic策略指导**：
{{strategy}}

---

## 调整计划

\`\`\`json
{{adjustment_plan_json}}
\`\`\`

---

## 实体索引分配

{{entity_mapping_table}}

---

## 输出格式

必须以严格的YAML格式输出：

\`\`\`yaml
actions:

- action_type: "ai_say"
  action_id: "唯一ID"
  config:
  content: "内容"
  \`\`\`

请直接输出YAML，不要有任何其他文字。
```

**Step 2: Update PlannerService to load template**

Modify buildPlannerPrompt():

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

private buildPlannerPrompt(
  adjustmentPlan: AdjustmentPlan,
  context: PlannerContext
): string {
  // Load template
  const templatePath = join(
    process.cwd(),
    'config',
    'prompts',
    'topic',
    'planner-llm-prompt.md'
  );

  let template = '';
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    template = this.getFallbackPlannerPrompt();
  }

  const { topicGoal, strategy, entityMapping } = context;

  // Build entity mapping table
  const mappingTable = JSON.stringify(entityMapping || {}, null, 2);

  return template
    .replace('{{topic_goal}}', topicGoal)
    .replace('{{strategy}}', strategy)
    .replace('{{adjustment_plan_json}}', JSON.stringify(adjustmentPlan, null, 2))
    .replace('{{entity_mapping_table}}', mappingTable);
}

private getFallbackPlannerPrompt(): string {
  // Return inline fallback prompt from design document section 5.2
  return `你是一个AI咨询引擎的Action规划器...

[Full prompt content]
`;
}
```

**Step 3: Write test for template loading**

```typescript
it('should load planner prompt from template file', () => {
  const service = new TopicPlannerService();
  const adjustmentPlan = {
    entities: [],
    insertionStrategy: 'APPEND_TO_END' as const,
  };
  const context = {
    topicGoal: '测试目标',
    strategy: '测试策略',
    entityMapping: {},
  };

  const prompt = service.buildPlannerPrompt(adjustmentPlan, context);

  expect(prompt).toContain('Action规划器');
  expect(prompt).toContain('测试目标');
  expect(prompt).toContain('YAML格式输出');
});
```

**Step 4: Run tests**

Run:

```bash
pnpm test -- packages/core-engine/test/unit/domain/topic-planner-service.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core-engine/config/prompts/topic/planner-llm-prompt.md packages/core-engine/src/domain/services/topic-planner-service.ts packages/core-engine/test/unit/domain/topic-planner-service.test.ts
git commit -m "feat(core-engine): implement Planner Prompt Template

Load planner prompt from template file for Action YAML generation.
Provides detailed Action type documentation and examples.

Enables domain experts to modify prompt for different scenarios.
"
```

---

## Task 7: Update Documentation

**Files:**

- Modify: `docs/DEVELOPMENT_GUIDE.md`
- Create: `docs/adapters/TOPIC_LLM_PIPELINE.md`

**Step 1: Update DEVELOPMENT_GUIDE**

Add new section:

````markdown
## Topic Layer - Two-Stage LLM Pipeline

The Topic layer uses a two-stage LLM pipeline for intelligent Action queue adjustment:

### Stage 1: Decision LLM

- **Purpose**: Analyze conversation and decide whether to adjust Action queue
- **Input**: Conversation history, topic goal/strategy, entity status
- **Output**: JSON adjustment plan (DecisionOutput schema)
- **Template**: `packages/core-engine/config/prompts/topic/decision-llm-prompt.md`

### Stage 2: Planner LLM

- **Purpose**: Convert adjustment plan to executable Action YAML scripts
- **Input**: Adjustment plan from Stage 1, topic configuration
- **Output**: ActionConfig array (YAML)
- **Template**: `packages/core-engine/config/prompts/topic/planner-llm-prompt.md`

### Code Layer Responsibilities

- LLM orchestration (sequence, error handling)
- Schema validation (Zod)
- Queue execution (QueueExpansionService)
- No business logic in code

### Extending to New Scenarios

To support new scenarios (emotion response, resistance handling, etc.):

1. Update Decision Prompt with new strategy type
2. Update Planner Prompt with corresponding Action generation rules
3. No code changes required

### Example: Adding Emotion Response Scenario

Update `decision-llm-prompt.md`:

```markdown
**策略类型选择**：

- EMOTION_DETECTION: 检测用户情绪波动，需要插入安抚类Action
```
````

Update `planner-llm-prompt.md`:

````markdown
**emotion_detected时生成 Actions**：

```yaml
- action_type: ai_say
  action_id: acknowledge_emotion
  config:
    content: "我注意到...
```
````

```

```

**Step 2: Create adapter documentation**

Create guide:

````markdown
# Topic LLM Pipeline Adapter Guide

## Overview

This guide explains how to adapt the Topic two-stage LLM pipeline for different scenarios.

## Decision Prompt Customization

### File: `packages/core-engine/config/prompts/topic/decision-llm-prompt.md`

### Adding New Strategy Type

1. Add strategy to DecisionOutput schema:
   ```typescript
   strategy: 'NEW_ENTITIES' | 'EMOTION_RESPONSE' | 'YOUR_NEW_STRATEGY';
   ```
````

2. Add guidance in Decision Prompt:

   ```markdown
   - YOUR_NEW_STRATEGY: [Description]
     - Trigger condition: [When to use]
     - Expected output: [What to generate]
   ```

3. Add example in Decision Prompt:
   ```json
   {
     "strategy": "YOUR_NEW_STRATEGY",
     "reasoning": "...",
     "adjustmentPlan": { ... }
   }
   ```

## Planner Prompt Customization

### File: `packages/core-engine/config/prompts/topic/planner-llm-prompt.md`

### Adding New Action Generation Rules

1. Define Action pattern:

   ```yaml
   - action_type: your_action_type
     action_id: naming_convention
     config:
       required_field: value
   ```

2. Add to Action配置规范 section

3. Add example case

## Testing

After customization:

1. Run unit tests:

   ```bash
   pnpm test -- packages/core-engine/test/unit/domain/topic-decision-service.test.ts
   pnpm test -- packages/core-engine/test/unit/domain/topic-planner-service.test.ts
   ```

2. Run integration tests:

   ```bash
   pnpm test -- packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
   ```

3. Manual test with real conversation

## Common Patterns

### Conditional Logic in Planner Prompt

```markdown
{% for entity in entities %}
{% if entity.intent == 'NEW' %}

# Generate 3-4 actions for new entity

{% elif entity.intent == 'EXTEND' %}

# Generate 1-2 actions for existing entity

{% endif %}
{% endfor %}
```

Note: Current implementation uses LLM to handle logic, not template variables.

````

**Step 3: Commit**

```bash
git add docs/DEVELOPMENT_GUIDE.md docs/adapters/TOPIC_LLM_PIPELINE.md
git commit -m "docs: add Topic LLM pipeline documentation

Add comprehensive documentation for two-stage LLM pipeline.
Extensibility guide for domain experts to add new scenarios
without code changes.
"
````

---

## Task 8: Final Integration Testing

**Files:**

- Modify: `packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts`

**Step 1: Add end-to-end test**

```typescript
describe('Story 2.2 Full Pipeline E2E', () => {
  it('should handle complete workflow: detect → plan → execute', async () => {
    // Setup
    const mockDecisionOutput = {
      needsAdjustment: true,
      strategy: 'NEW_ENTITIES',
      reasoning: '发现新实体: 妈妈和外公',
      adjustmentPlan: {
        entities: [
          {
            entityName: '妈妈',
            intent: 'NEW',
            actionsNeeded: [
              {
                type: 'ai_ask',
                purpose: '询问妈妈的基本信息',
                priority: 'high',
                variableTargets: [
                  {
                    name: 'mother_name',
                    type: 'text',
                    extractionMethod: 'direct',
                    description: '妈妈的姓名',
                  },
                ],
              },
            ],
          },
        ],
        insertionStrategy: 'APPEND_TO_END' as const,
      },
    };

    const mockYamlOutput = `actions:
  - action_type: ai_ask
    action_id: mother_0_ask_basic
    config:
      content: "请问您妈妈的姓名是什么？"
      output:
        - get: caregiver_0_name
          define: "妈妈的姓名"
          extraction_method: direct
      max_rounds: 2`;

    mockDecisionService.makeDecision.mockResolvedValueOnce(mockDecisionOutput);
    mockPlannerService.generateActions.mockResolvedValueOnce(yaml.load(mockYamlOutput) as any);

    // Execute
    const plan = await planner.plan(context);

    // Verify
    expect(mockDecisionService.makeDecision).toHaveBeenCalled();
    expect(mockPlannerService.generateActions).toHaveBeenCalledWith(
      mockDecisionOutput.adjustmentPlan,
      expect.objectContaining({
        topicGoal: context.topicConfig.topic_goal,
      })
    );
    expect(plan.instantiatedActions).toHaveLength(1);
    expect(plan.instantiatedActions[0].action_type).toBe('ai_ask');
    expect(plan.instantiatedActions[0].action_id).toBe('mother_0_ask_basic');
  });

  it('should handle no adjustment needed path', async () => {
    const mockDecisionOutput = {
      needsAdjustment: false,
      strategy: 'NO_CHANGE' as any,
      reasoning: '无需调整',
      adjustMentPlan: {} as any,
    };

    mockDecisionService.makeDecision.mockResolvedValueOnce(mockDecisionOutput);

    const plan = await planner.plan(context);

    expect(mockPlannerService.generateActions).not.toHaveBeenCalled();
    expect(plan.instantiatedActions).toHaveLength(context.topicConfig.actions.length);
  });

  it('should propagate entity mapping to Planner LLM', async () => {
    const mockDecisionOutput = {
      needsAdjustment: true,
      strategy: 'NEW_ENTITIES',
      reasoning: '测试',
      adjustmentPlan: {
        entities: [
          { entityName: '爸爸', intent: 'NEW', actionsNeeded: [] },
          { entityName: '妈妈', intent: 'NEW', actionsNeeded: [] },
        ],
        insertionStrategy: 'APPEND_TO_END' as const,
      },
    };

    mockDecisionService.makeDecision.mockResolvedValueOnce(mockDecisionOutput);
    mockPlannerService.generateActions.mockResolvedValueOnce([]);

    await planner.plan(context);

    expect(mockPlannerService.generateActions).toHaveBeenCalledWith(
      mockDecisionOutput.adjustmentPlan,
      expect.objectContaining({
        entityMapping: expect.objectContaining({
          爸爸: 0,
          妈妈: 1,
        }),
      })
    );
  });
});
```

**Step 2: Run all tests**

```bash
pnpm test -- packages/shared-types/test/unit/topic-decision-v2-schema.test.ts
pnpm test -- packages/core-engine/test/unit/domain/topic-planner-service.test.ts
pnpm test -- packages/core-engine/test/unit/domain/topic-decision-service.test.ts
pnpm test -- packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
```

Expected: All PASS

**Step 3: Type check**

```bash
pnpm --filter @heartrule/core-engine typecheck
pnpm --filter @heartrule/shared-types typecheck
```

Expected: No errors

**Step 4: Commit**

```bash
git add packages/core-engine/test/integration/story-2.2-intelligent-topic-planner-integration.test.ts
git commit -m "test(core-engine): add comprehensive E2E tests for two-stage pipeline

Test complete workflows:
- Full pipeline (detect → plan → execute)
- No adjustment needed path
- Entity mapping propagation

All tests pass with mock LLM responses.
"
```

---

## Task 9: Cleanup and Verification

**Files:**

- Remove: `packages/core-engine/src/application/planning/intelligent-topic-planner.ts:318-350` (expandQueueForEntities method)
- Verify: All tests pass

**Step 1: Verify no unused code**

Check for removed method references:

```bash
grep -r "expandQueueForEntities" packages/core-engine/src/
```

Expected: No references (method was only used internally)

**Step 2: Verify no hardcoded logic**

Search for regex patterns:

```bash
grep -r "caregiverPattern\|/爸爸\|/妈妈" packages/core-engine/src/
```

Expected: No matches

**Step 3: Run full test suite**

```bash
pnpm test -- packages/core-engine/
```

Expected: All PASS

**Step 4: Commit**

```bash
git commit --allow-empty -m "chore(core-engine): cleanup after refactor

Remove expandQueueForEntities method (no longer needed).
Verify no hardcoded entity logic remains.

All tests passing.
"
```

---

## Completion Criteria

- [x] DecisionOutput schema defined and tested
- [x] TopicPlannerService implemented with YAML parsing
- [x] Two-stage pipeline integrated into IntelligentTopicPlanner
- [x] Hardcoded entity detection removed
- [x] Both prompt templates implemented
- [x] Documentation updated
- [x] Integration tests passing
- [x] Type checking passing
- [x] No unused code remaining

---

## Rollback Plan

If issues arise:

```bash
# Reset to working commit before refactor
git revert <latest_commit>

# Or rollback specific files
git checkout HEAD~1 -- packages/core-engine/src/application/planning/intelligent-topic-planner.ts
git checkout HEAD~1 -- packages/core-engine/src/domain/services/
```

---

## Next Steps

After implementation:

1. **Prompt Optimization**: Run with real conversations, collect feedback, iterate prompts
2. **Performance Monitoring**: Track LLM call latency, implement caching if needed
3. **New Scenarios**: Add emotion response, resistance handling scenarios
4. **Domain Review**: Have psychology domain experts review prompt quality

---

## Resources

- Design Document: `docs/design/plans/2026-03-06-topic-dynamic-action-queue-two-stage-llm-refactor-design.md`
- Original Story: `docs/design/thinking/Story-2.2-Topic动态展开Action队列-智能能力需求.md`
- Zod Documentation: https://zod.dev/
- JS-YAML: https://github.com/nodeca/js-yaml
