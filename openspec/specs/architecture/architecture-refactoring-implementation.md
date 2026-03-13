---
document_id: architecture-architecture-refactoring-implementation
category: architecture
status: active
version: 1.0.0
last_updated: 2026-03-13
source: docs/plans/2026-03-08-architecture-refactoring-implementation.md
tags: [architecture-refactoring, implementation, session-entity, action-base-class, variable-store]
search_priority: high
---

# HeartRule-Qoder Architecture Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Thoroughly resolve architecture issues: eliminate domain model reverse dependencies, unify variable storage, streamline Action base class, unify test directories, migrate script files

**Architecture:** Adopt aggressive refactoring, split Session into Entity + Service, streamline Action base class to abstract definition, extract infrastructure logic to independent modules

**Tech Stack:** TypeScript, Vitest, Drizzle ORM

---

## Phase 1: Session Domain Model Refactoring

### Task 1: Create SessionEntity (Pure Data Object)

**Files:**

- Create: `packages/core-engine/src/domain/entities/session.ts`

**Step 1: Create SessionEntity Class**

```typescript
// packages/core-engine/src/domain/entities/session.ts
import {
  SessionStatus,
  ExecutionStatus,
  type ExecutionPosition,
  type VariableStore,
} from '@heartrule/shared-types';

export interface ConversationEntry {
  role: string;
  content: string;
  actionId?: string;
  metadata?: Record<string, any>;
}

export class SessionEntity {
  public sessionId: string;
  public userId: string;
  public scriptId: string;
  public status: SessionStatus;
  public executionStatus: ExecutionStatus;
  public position: ExecutionPosition;
  public variableStore?: VariableStore;
  public conversationHistory: ConversationEntry[];
  public metadata: Map<string, unknown>;
  public createdAt: Date;
  public updatedAt: Date;
  public completedAt?: Date;

  constructor(params: {
    sessionId: string;
    userId: string;
    scriptId: string;
    status?: SessionStatus;
    executionStatus?: ExecutionStatus;
    position?: ExecutionPosition;
    variableStore?: VariableStore;
    conversationHistory?: ConversationEntry[];
    metadata?: Map<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date;
  }) {
    this.sessionId = params.sessionId;
    this.userId = params.userId;
    this.scriptId = params.scriptId;
    this.status = params.status || SessionStatus.CREATED;
    this.executionStatus = params.executionStatus || ExecutionStatus.IDLE;
    this.position = params.position || { phaseIndex: 0, topicIndex: 0, actionIndex: 0 };
    this.variableStore = params.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
    this.conversationHistory = params.conversationHistory || [];
    this.metadata = params.metadata || new Map();
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      scriptId: this.scriptId,
      status: this.status,
      executionStatus: this.executionStatus,
      position: this.position,
      variableStore: this.variableStore,
      conversationHistory: this.conversationHistory,
      metadata: Object.fromEntries(this.metadata),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
```

**Step 2: Verify Type Check**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: PASS

---

### Task 2: Create SessionService (Domain Service)

**Files:**

- Create: `packages/core-engine/src/domain/services/session-service.ts`
- Modify: `packages/core-engine/src/domain/session.ts` (delete or mark as deprecated)

**Step 1: Create SessionService Class**

```typescript
// packages/core-engine/src/domain/services/session-service.ts
import { SessionStatus, ExecutionStatus } from '@heartrule/shared-types';
import type { SessionEntity, ConversationEntry } from '../entities/session.js';
import type { BaseAction } from '../../domain/actions/base-action.js';
import type { LLMDebugInfo } from '../../engines/llm-orchestration/orchestrator.js';

export class SessionService {
  private session: SessionEntity;
  private currentAction: BaseAction | null = null;
  private lastAiMessage: string | null = null;
  private lastLLMDebugInfo?: LLMDebugInfo;

  constructor(entity: SessionEntity) {
    this.session = entity;
  }

  start(): void {
    this.session.status = SessionStatus.ACTIVE;
    this.session.executionStatus = ExecutionStatus.RUNNING;
    this.session.updatedAt = new Date();
  }

  pause(): void {
    this.session.status = SessionStatus.PAUSED;
    this.session.executionStatus = ExecutionStatus.PAUSED;
    this.session.updatedAt = new Date();
  }

  resume(): void {
    if (this.session.status === SessionStatus.PAUSED) {
      this.session.status = SessionStatus.ACTIVE;
      this.session.executionStatus = ExecutionStatus.RUNNING;
      this.session.updatedAt = new Date();
    }
  }

  complete(): void {
    this.session.status = SessionStatus.COMPLETED;
    this.session.executionStatus = ExecutionStatus.COMPLETED;
    this.session.completedAt = new Date();
    this.session.updatedAt = new Date();
  }

  fail(error: string): void {
    this.session.status = SessionStatus.FAILED;
    this.session.executionStatus = ExecutionStatus.ERROR;
    this.session.metadata.set('error', error);
    this.session.updatedAt = new Date();
  }

  updatePosition(position: { phaseIndex: number; topicIndex: number; actionIndex: number }): void {
    this.session.position = position;
    this.session.updatedAt = new Date();
  }

  setVariable(scope: 'global' | 'session' | 'phase' | 'topic', name: string, value: unknown): void {
    if (!this.session.variableStore) {
      this.session.variableStore = { global: {}, session: {}, phase: {}, topic: {} };
    }
    this.session.variableStore[scope][name] = value;
    this.session.updatedAt = new Date();
  }

  getVariable(scope: 'global' | 'session' | 'phase' | 'topic', name: string): unknown {
    return this.session.variableStore?.[scope]?.[name];
  }

  addConversationEntry(entry: ConversationEntry): void {
    this.session.conversationHistory.push(entry);
    this.session.updatedAt = new Date();
  }

  setCurrentAction(action: BaseAction | null): void {
    this.currentAction = action;
    this.session.updatedAt = new Date();
  }

  waitForInput(): void {
    this.session.executionStatus = ExecutionStatus.WAITING_INPUT;
    this.session.updatedAt = new Date();
  }

  resumeRunning(): void {
    this.session.executionStatus = ExecutionStatus.RUNNING;
    this.session.updatedAt = new Date();
  }

  setLastAiMessage(message: string): void {
    this.lastAiMessage = message;
  }

  setLastLLMDebugInfo(info: LLMDebugInfo): void {
    this.lastLLMDebugInfo = info;
  }

  getEntity(): SessionEntity {
    return this.session;
  }

  getCurrentAction(): BaseAction | null {
    return this.currentAction;
  }

  getLastAiMessage(): string | null {
    return this.lastAiMessage;
  }

  getLastLLMDebugInfo(): LLMDebugInfo | undefined {
    return this.lastLLMDebugInfo;
  }
}
```

**Step 2: Verify Type Check**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: PASS

---

### Task 3: Update Session Interface in shared-types

**Files:**

- Modify: `packages/shared-types/src/domain/session.ts`

**Step 1: Remove Redundant Fields**

Keep interface definitions, but remove the following fields (as they belong to the service layer):

- `currentAction`
- `lastAiMessage`
- `lastLLMDebugInfo`

---

## Phase 2: Variable Storage Unification

### Task 4: Extend VariableStore Interface

**Files:**

- Modify: `packages/shared-types/src/domain/variable.ts`

**Step 1: Add Compatibility Methods**

```typescript
// Add to VariableStore interface
export interface VariableStore {
  global: Record<string, unknown>;
  session: Record<string, unknown>;
  phase: Record<string, unknown>;
  topic: Record<string, unknown>;
  // Compatibility methods
  get(key: string, scope?: 'global' | 'session' | 'phase' | 'topic'): unknown;
  set(key: string, value: unknown, scope?: 'global' | 'session' | 'phase' | 'topic'): void;
}
```

---

### Task 5: Update All Action Variable References

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-say-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-think-action.ts`

**Step 1: Update Variable Substitution Logic in BaseAction**

Remove `context.variables` references, replace with `context.variableStore`

---

## Phase 3: Action Base Class Refactoring

### Task 6: Streamline BaseAction

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`

**Step 1: Extract Variable Substitution Logic**

Create `infrastructure/actions/variable-substitutor.ts`

**Step 2: Extract Exit Condition Evaluation**

Create `infrastructure/actions/exit-condition-evaluator.ts`

**Step 3: Streamline BaseAction**

Keep:

- Abstract `execute` method
- Basic configuration reading `getConfig`
- JSDoc documentation

Remove (extract to infrastructure):

- `substituteVariables` → `VariableSubstitutor`
- `evaluateExitCondition` → `ExitConditionEvaluator`
- `checkSafetyBoundary` → `SafetyChecker`
- `parseStructuredOutput` → `SafetyChecker`
- `resolveTemplatePath` → Remove, use injection instead

---

### Task 7: Create Infrastructure Modules

**Files:**

- Create: `packages/core-engine/src/infrastructure/actions/variable-substitutor.ts`
- Create: `packages/core-engine/src/infrastructure/actions/exit-condition-evaluator.ts`
- Create: `packages/core-engine/src/infrastructure/actions/safety-checker.ts`

**Step 1: VariableSubstitutor Implementation**

```typescript
// packages/core-engine/src/infrastructure/actions/variable-substitutor.ts
import type { VariableStore, Position } from '@heartrule/shared-types';
import type { VariableScopeResolver } from '../../engines/variable-scope/variable-scope-resolver.js';

export class VariableSubstitutor {
  constructor(
    private variableStore?: VariableStore,
    private scopeResolver?: VariableScopeResolver
  ) {}

  substitute(
    template: string,
    context: {
      variables?: Record<string, any>;
      systemVariables?: Record<string, any>;
      variableStore?: VariableStore;
      scopeResolver?: VariableScopeResolver;
      phaseId: string;
      topicId: string;
      actionId: string;
    }
  ): string {
    // Implement variable substitution logic
    // ... (migrated from original BaseAction)
  }
}
```

**Step 2: ExitConditionEvaluator Implementation**

```typescript
// packages/core-engine/src/infrastructure/actions/exit-condition-evaluator.ts
export class ExitConditionEvaluator {
  evaluate(
    context: any,
    exitPolicy: any,
    exitCriteria?: any,
    llmOutput?: Record<string, any>
  ): { should_exit: boolean; reason: string; decision_source: string } {
    // Implement exit condition evaluation logic
    // ... (migrated from original BaseAction)
  }
}
```

**Step 3: SafetyChecker Implementation**

```typescript
// packages/core-engine/src/infrastructure/actions/safety-checker.ts
export class SafetyChecker {
  checkBoundary(message: string): { passed: boolean; violations: any[] } {
    // Implement safety boundary detection
  }

  parseStructuredOutput(aiMessage: string): any {
    // Parse structured output
  }

  async confirmViolation(
    originalResponse: string,
    riskType: string,
    reason: string,
    llmOrchestrator?: any
  ): Promise<any> {
    // Secondary confirmation
  }

  generateSafeFallback(): string {
    return `I apologize, my previous response may not have been accurate. Please note that I am an AI assistant tool and cannot replace professional psychological counselors or doctors.`;
  }
}
```

---

## Phase 4: Directory Standardization

### Task 8: Unify Test Directories

**Files:**

- Modify: Move `packages/core-engine/src/test/` → `packages/core-engine/src/__tests__/`
- Modify: `packages/core-engine/package.json` (update test configuration)

**Step 1: Migrate Test Files**

```bash
# Move files from test directory to __tests__
mv packages/core-engine/src/test/* packages/core-engine/src/__tests__/
rmdir packages/core-engine/src/test
```

**Step 2: Update Vitest Configuration**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', '__tests__/**/*.test.ts'],
  },
});
```

---

### Task 9: Migrate Root Directory Scripts

**Files:**

- Modify: Move root directory .ts scripts → `scripts/` subdirectory

**Step 1: Create Directory Structure**

```bash
mkdir -p scripts/{migration,development,testing,maintenance}
```

**Step 2: Categorize and Migrate**

```bash
# Migrate scripts
mv *migrate*.ts scripts/migration/
mv *update*.ts scripts/migration/
mv test-*.ts scripts/testing/
mv check-*.ts scripts/maintenance/
mv find-*.ts scripts/maintenance/
mv verify-*.ts scripts/maintenance/
mv analyze-*.ts scripts/development/
```

---

## Phase 5: Verification and Testing

### Task 10: Run Type Check

**Step 1: Type Check**

Run: `pnpm typecheck`
Expected: PASS (no errors)

### Task 11: Run Unit Tests

**Step 1: Unit Tests**

Run: `pnpm test`
Expected: PASS (all tests pass)

### Task 12: Build Verification

**Step 1: Build All Packages**

Run: `pnpm build`
Expected: PASS (all packages build successfully)

---

## Execution Method Selection

**Plan complete and saved to `docs/plans/2026-03-08-architecture-refactoring-implementation.md`. Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch each task to a sub-agent, conduct code reviews during the process, and iterate quickly

2. **Parallel Session (separate)** - Use executing-plans in a new session, batch execution with checkpoints

**Which approach?**
