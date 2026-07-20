# Core Engine DDD Architectural Boundary Violations -- Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four categories of DDD architectural violations in the `core-engine` package to enforce clean layer dependencies, introduce proper factory abstraction for execution state, and reduce excessive `any` typing.

**Architecture:** The `core-engine` package uses a layered architecture (domain -> application -> engines/ports). The four violations break these layer rules: domain types importing from engines, domain interfaces referencing concrete engine classes, application services constructing domain-state inline as untyped objects, and pervasive `any` usage obscuring type boundaries. Fix each violation by rerouting imports to proper port interfaces, extracting port interfaces where none exist, introducing a factory for execution state creation, and replacing `any` with `unknown` or specific types.

**Tech Stack:** TypeScript, Node.js, Vitest

---

## Background: Current Violations

### Violation 1: Domain/ports import LLMDebugInfo from engines (4 files)

`LLMDebugInfo` is properly defined in `application/ports/outbound/llm-provider.port.ts` (the correct port layer), but four files import it from `engines/llm-orchestration/orchestrator.ts` instead:

| File                                                       | Current import                                       | Layer violated                     |
| ---------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `domain/session.ts:9`                                      | `../engines/llm-orchestration/orchestrator.js`       | domain imports from engine         |
| `domain/actions/base-action.ts:31`                         | `../../engines/llm-orchestration/orchestrator.js`    | domain imports from engine         |
| `application/ports/inbound/session-application.port.ts:17` | `../../../engines/llm-orchestration/orchestrator.js` | port imports from implementation   |
| `engines/script-execution/script-executor.ts:29`           | `../llm-orchestration/orchestrator.js`               | engine imports from sibling engine |

### Violation 2: Domain ActionContext depends on concrete VariableScopeResolver class

`domain/actions/base-action.ts:32`:

```typescript
import { VariableScopeResolver } from '../../engines/variable-scope/variable-scope-resolver.js';
```

The `ActionContext` interface uses `VariableScopeResolver` directly at line 55:

```typescript
scopeResolver?: VariableScopeResolver;
```

This ties a domain-layer interface to a concrete engine class. There is no port interface for the scope resolver.

### Violation 3: Application service builds ExecutionState as inline plain objects (no factory)

`application/usecases/session-application-service.ts` has four methods that construct or manipulate execution state as ad-hoc objects returning `any`:

- `createInitialExecutionState()` -- returns `any` (line 165)
- `restoreExecutionState()` -- returns `any` (line 199)
- `buildResponse()` -- accepts `any` (line 299)
- `extractFlatVariables()` -- accepts `any` (line 262)

The `ScriptExecutor` field is also typed as `any` (line 28). An `ExecutionState` interface already exists in `engines/script-execution/script-executor.ts:57-92` but the service never references it.

### Violation 4: Excessive `any` usage

- `domain/actions/base-action.ts`: 17 occurrences
- `domain/actions/ai-ask-action.ts`: 25 occurrences

Common patterns:

- `Record<string, any>` in interface definitions (ActionContext, ActionResult, config, metadata)
- `catch (error: any)` handlers
- `llmOrchestrator?: any` parameter in method signatures
- JSON.parse results typed as `any`
- Config accessors returning `any`

---

## File Structure

### Files to create:

- `packages/core-engine/src/application/ports/outbound/scope-resolver.port.ts` -- port interface for variable scope resolution
- `packages/core-engine/src/application/state/execution-state-factory.ts` -- factory for ExecutionState creation

### Files to modify:

- `packages/core-engine/src/domain/session.ts` -- fix LLMDebugInfo import path
- `packages/core-engine/src/domain/actions/base-action.ts` -- fix import paths, replace VariableScopeResolver with interface, reduce any
- `packages/core-engine/src/domain/actions/ai-ask-action.ts` -- reduce any
- `packages/core-engine/src/application/usecases/session-application-service.ts` -- replace inline state construction with factory, fix any types
- `packages/core-engine/src/application/ports/inbound/session-application.port.ts` -- fix LLMDebugInfo import path
- `packages/core-engine/src/engines/script-execution/script-executor.ts` -- fix LLMDebugInfo import path
- `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts` -- add `implements IScopeResolver`

---

## Task 1: Fix LLMDebugInfo import paths

**Files:**

- Modify: `packages/core-engine/src/domain/session.ts`
- Modify: `packages/core-engine/src/domain/actions/base-action.ts`
- Modify: `packages/core-engine/src/application/ports/inbound/session-application.port.ts`
- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts`

`LLMDebugInfo` is defined in `application/ports/outbound/llm-provider.port.ts`. All four files should import from there instead of from `engines/llm-orchestration/orchestrator.ts`.

- [ ] **Step 1: Fix domain/session.ts import**

Change line 9 in `packages/core-engine/src/domain/session.ts`:

```typescript
// Before:
import type { LLMDebugInfo } from '../engines/llm-orchestration/orchestrator.js';

// After:
import type { LLMDebugInfo } from '../application/ports/outbound/llm-provider.port.js';
```

- [ ] **Step 2: Fix domain/actions/base-action.ts import**

Change line 31 in `packages/core-engine/src/domain/actions/base-action.ts`:

```typescript
// Before:
import type { LLMDebugInfo } from '../../engines/llm-orchestration/orchestrator.js';

// After:
import type { LLMDebugInfo } from '../../application/ports/outbound/llm-provider.port.js';
```

- [ ] **Step 3: Fix application/ports/inbound/session-application.port.ts import**

Change line 17 in `packages/core-engine/src/application/ports/inbound/session-application.port.ts`:

```typescript
// Before:
import type { LLMDebugInfo } from '../../../engines/llm-orchestration/orchestrator.js';

// After:
import type { LLMDebugInfo } from '../../outbound/llm-provider.port.js';
```

- [ ] **Step 4: Fix engines/script-execution/script-executor.ts import**

Change line 29 in `packages/core-engine/src/engines/script-execution/script-executor.ts`:

```typescript
// Before:
import type { LLMDebugInfo } from '../llm-orchestration/orchestrator.js';

// After:
import type { LLMDebugInfo } from '../../application/ports/outbound/llm-provider.port.js';
```

- [ ] **Step 5: Verify compilation**

```bash
cd packages/core-engine && npx tsc --noEmit
```

Expected output: no errors. If other files also import LLMDebugInfo from the orchestrator re-export, they may need similar fixes. The orchestrator.ts `export type { ... LLMDebugInfo }` is a deprecated re-export and should be left in place for backward compatibility.

---

## Task 2: Decouple ActionContext from concrete VariableScopeResolver class

**Files:**

- Create: `packages/core-engine/src/application/ports/outbound/scope-resolver.port.ts`
- Modify: `packages/core-engine/src/domain/actions/base-action.ts`
- Modify: `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`

- [ ] **Step 1: Create IScopeResolver port interface**

Create `packages/core-engine/src/application/ports/outbound/scope-resolver.port.ts`:

```typescript
/**
 * Variable Scope Resolver Port (Outbound)
 *
 * DDD hexagonal architecture: outbound port definition.
 * Defines the contract for variable scope resolution used by ActionContext.
 * The engine implementation (VariableScopeResolver) implements this interface.
 */
import type {
  VariableStore,
  VariableValue,
  VariableDefinition,
  Position,
} from '@heartrule/shared-types';

export interface IScopeResolver {
  /** Resolve a variable value by name, searching scopes in priority order. */
  resolveVariable(varName: string, position: Position): VariableValue | null;

  /** Get variable definition metadata (scope, description). */
  getVariableDefinition(varName: string): VariableDefinition | null;

  /** Check if a variable name is registered as global scope. */
  isGlobalVariable(varName: string): boolean;

  /** Register or update a variable definition. */
  setVariableDefinition(definition: VariableDefinition): void;
}
```

- [ ] **Step 2: Make VariableScopeResolver implement IScopeResolver**

In `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`:

Add the import at the top of the file:

```typescript
import type { IScopeResolver } from '../../application/ports/outbound/scope-resolver.port.js';
```

Change the class declaration from:

```typescript
export class VariableScopeResolver {
```

To:

```typescript
export class VariableScopeResolver implements IScopeResolver {
```

The existing method signatures already match:

- `resolveVariable(varName: string, position: Position): VariableValue | null`
- `getVariableDefinition(varName: string): VariableDefinition | null`
- `isGlobalVariable(varName: string): boolean`
- `setVariableDefinition(definition: VariableDefinition): void`

No implementation changes needed.

- [ ] **Step 3: Change ActionContext.scopeResolver type to IScopeResolver**

In `packages/core-engine/src/domain/actions/base-action.ts`:

Remove the import of `VariableScopeResolver` (line 32):

```typescript
// DELETE this line:
import { VariableScopeResolver } from '../../engines/variable-scope/variable-scope-resolver.js';
```

Add the new import:

```typescript
import type { IScopeResolver } from '../../application/ports/outbound/scope-resolver.port.js';
```

Change the `ActionContext` interface at line 55:

```typescript
// Before:
scopeResolver?: VariableScopeResolver;

// After:
scopeResolver?: IScopeResolver;
```

- [ ] **Step 4: Re-export IScopeResolver from the package entry point**

Add to `packages/core-engine/src/index.ts`, alongside the other type re-exports near line 151:

```typescript
export type { IScopeResolver } from './application/ports/outbound/scope-resolver.port.js';
```

- [ ] **Step 5: Verify compilation**

```bash
cd packages/core-engine && npx tsc --noEmit
```

Expected: no errors. The ai-ask-action.ts file calls `context.scopeResolver?.getVariableDefinition(...)`, `context.scopeResolver?.isGlobalVariable(...)`, `context.scopeResolver!.setVariableDefinition(...)`, and `context.scopeResolver?.resolveVariable(...)` -- all four methods exist on IScopeResolver.

---

## Task 3: Create ExecutionState factory and eliminate inline plain objects

**Files:**

- Create: `packages/core-engine/src/application/state/execution-state-factory.ts`
- Modify: `packages/core-engine/src/application/usecases/session-application-service.ts`

- [ ] **Step 1: Create ExecutionStateFactory**

Create `packages/core-engine/src/application/state/execution-state-factory.ts`:

```typescript
/**
 * ExecutionState Factory
 *
 * Application-layer factory responsible for creating and restoring
 * ExecutionState objects. Eliminates inline construction of execution
 * state as ad-hoc untyped objects in session-application-service.
 */
import type { ExecutionStatus } from '@heartrule/shared-types';

import type { ExecutionState } from '../../engines/script-execution/script-executor.js';

interface VariableStoreEntry {
  value: unknown;
  type: string;
  source: string;
  lastUpdated: string;
}

function extractFlatVariableValues(
  store: ExecutionState['variableStore']
): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (!store) return flat;

  const extractFromScope = (scope: Record<string, unknown> | undefined) => {
    for (const [key, varObj] of Object.entries(scope || {})) {
      if (varObj && typeof varObj === 'object' && 'value' in varObj) {
        flat[key] = (varObj as VariableStoreEntry).value;
      } else {
        flat[key] = varObj;
      }
    }
  };

  extractFromScope(store.global as Record<string, unknown>);
  extractFromScope(store.session as Record<string, unknown>);

  if (store.phase) {
    for (const phaseVars of Object.values(store.phase)) {
      extractFromScope(phaseVars as Record<string, unknown>);
    }
  }
  if (store.topic) {
    for (const topicVars of Object.values(store.topic)) {
      extractFromScope(topicVars as Record<string, unknown>);
    }
  }

  return flat;
}

function wrapVariables(variables: Record<string, unknown>): Record<string, VariableStoreEntry> {
  const wrapped: Record<string, VariableStoreEntry> = {};
  for (const [key, value] of Object.entries(variables)) {
    wrapped[key] = {
      value,
      type: Array.isArray(value) ? 'array' : typeof value,
      source: 'initialization',
      lastUpdated: new Date().toISOString(),
    };
  }
  return wrapped;
}

export class ExecutionStateFactory {
  createInitialExecutionState(
    globalVariables: Record<string, unknown>,
    sessionVariables: Record<string, unknown>,
    conversationHistory: Array<Record<string, unknown>>
  ): ExecutionState {
    return {
      status: 'running' as ExecutionStatus,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {
        ...globalVariables,
        ...sessionVariables,
      },
      variableStore: {
        global: wrapVariables(globalVariables),
        session: wrapVariables(sessionVariables),
        phase: {},
        topic: {},
      },
      conversationHistory: conversationHistory.map((msg) => ({
        role: msg.role as string,
        content: msg.content as string,
        actionId: msg.actionId as string | undefined,
        metadata: (msg.metadata as Record<string, unknown>) || {},
      })),
      metadata: {},
      lastAiMessage: null,
    };
  }

  restoreExecutionState(
    currentState: {
      status: ExecutionStatus;
      position: { phaseIndex: number; topicIndex: number; actionIndex: number };
      variables: Record<string, unknown>;
      variableStore?: Record<string, unknown>;
      conversationHistory: Array<{
        role: string;
        content: string;
        actionId?: string;
        metadata?: Record<string, unknown>;
      }>;
      metadata?: Record<string, unknown>;
    },
    globalVariables: Record<string, unknown>
  ): ExecutionState {
    const variableStoreRaw = currentState.variableStore as
      | ExecutionState['variableStore']
      | undefined;

    const variableStore: ExecutionState['variableStore'] = variableStoreRaw || {
      global: wrapVariables(globalVariables),
      session: {},
      phase: {},
      topic: {},
    };

    if (!variableStore.global) {
      variableStore.global = {};
    }
    for (const [key, value] of Object.entries(globalVariables)) {
      const g = variableStore.global as Record<string, unknown>;
      if (!g[key]) {
        g[key] = {
          value,
          type: typeof value,
          source: 'global_sync',
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    return {
      status: currentState.status,
      currentPhaseIdx: currentState.position.phaseIndex,
      currentTopicIdx: currentState.position.topicIndex,
      currentActionIdx: currentState.position.actionIndex,
      currentAction: null,
      variables: {
        ...globalVariables,
        ...currentState.variables,
      },
      variableStore,
      conversationHistory: currentState.conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
        actionId: msg.actionId,
        metadata: msg.metadata || {},
      })),
      metadata: currentState.metadata || {},
      lastAiMessage: null,
    };
  }

  extractFlatVariables(variableStore: ExecutionState['variableStore']): Record<string, unknown> {
    return extractFlatVariableValues(variableStore);
  }
}
```

- [ ] **Step 2: Refactor session-application-service to use the factory**

Replace the imports in `packages/core-engine/src/application/usecases/session-application-service.ts` (lines 1-19):

```typescript
import type {
  ISessionApplicationService,
  InitializeSessionRequest,
  ProcessUserInputRequest,
  SessionExecutionResponse,
  ExtendedExecutionPosition,
} from '../ports/inbound/session-application.port.js';

import type { ExecutionState } from '../../engines/script-execution/script-executor.js';
import { ExecutionStateFactory } from '../state/execution-state-factory.js';
```

Replace the entire class body with:

```typescript
export class DefaultSessionApplicationService implements ISessionApplicationService {
  private scriptExecutor:
    | import('../../engines/script-execution/script-executor.js').ScriptExecutor
    | null;
  private stateFactory: ExecutionStateFactory;

  constructor(
    scriptExecutor?: import('../../engines/script-execution/script-executor.js').ScriptExecutor
  ) {
    this.scriptExecutor = scriptExecutor || null;
    this.stateFactory = new ExecutionStateFactory();
  }

  async initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse> {
    const startTime = Date.now();

    try {
      if (!this.scriptExecutor) {
        const { ScriptExecutor } =
          await import('../../engines/script-execution/script-executor.js');
        this.scriptExecutor = new ScriptExecutor();
      }

      const scriptContent =
        typeof request.scriptContent === 'string'
          ? request.scriptContent
          : JSON.stringify(request.scriptContent);

      const executionState = this.stateFactory.createInitialExecutionState(
        request.globalVariables || {},
        request.sessionVariables || {},
        request.conversationHistory || []
      );

      console.log('[SessionApplicationService] Initializing session:', {
        sessionId: request.sessionId,
        hasGlobalVars: !!request.globalVariables,
        hasSessionVars: !!request.sessionVariables,
        historyLength: request.conversationHistory?.length || 0,
      });

      const updatedState = await this.scriptExecutor.executeSession(
        scriptContent,
        request.sessionId,
        executionState,
        null
      );

      const response = this.buildResponse(updatedState);

      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[Performance] initializeSession took ${duration}ms`);
      }

      return response;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SessionApplicationService] Initialization failed:', err);
      return this.buildErrorResponse(err);
    }
  }

  async processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse> {
    const startTime = Date.now();

    try {
      if (!this.scriptExecutor) {
        const { ScriptExecutor } =
          await import('../../engines/script-execution/script-executor.js');
        this.scriptExecutor = new ScriptExecutor();
      }

      const scriptContent =
        typeof request.scriptContent === 'string'
          ? request.scriptContent
          : JSON.stringify(request.scriptContent);

      const executionState = this.stateFactory.restoreExecutionState(
        request.currentExecutionState,
        request.globalVariables || {}
      );

      console.log('[SessionApplicationService] Processing user input:', {
        sessionId: request.sessionId,
        userInputLength: request.userInput.length,
        currentStatus: executionState.status,
        position: {
          phase: executionState.currentPhaseIdx,
          topic: executionState.currentTopicIdx,
          action: executionState.currentActionIdx,
        },
      });

      const updatedState = await this.scriptExecutor.executeSession(
        scriptContent,
        request.sessionId,
        executionState,
        request.userInput
      );

      const response = this.buildResponse(updatedState);

      const duration = Date.now() - startTime;
      if (duration > 2000) {
        console.warn(`[Performance] processUserInput took ${duration}ms`);
      }

      return response;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SessionApplicationService] Processing failed:', err);
      return this.buildErrorResponse(err);
    }
  }

  private buildResponse(executionState: ExecutionState): SessionExecutionResponse {
    const flatVariables = this.stateFactory.extractFlatVariables(executionState.variableStore);

    const position: ExtendedExecutionPosition = {
      phaseIndex: executionState.currentPhaseIdx,
      topicIndex: executionState.currentTopicIdx,
      actionIndex: executionState.currentActionIdx,
    };

    if (executionState.currentPhaseId) position.phaseId = executionState.currentPhaseId;
    if (executionState.currentTopicId) position.topicId = executionState.currentTopicId;
    if (executionState.currentActionId) position.actionId = executionState.currentActionId;
    if (executionState.currentActionType) position.actionType = executionState.currentActionType;

    const meta = executionState.metadata as Record<string, unknown>;
    const actionState = meta.actionState as Record<string, unknown> | undefined;
    const lastActionRoundInfo = meta.lastActionRoundInfo as Record<string, unknown> | undefined;
    if (actionState || lastActionRoundInfo) {
      position.currentRound =
        (actionState?.currentRound as number) ?? (lastActionRoundInfo?.currentRound as number);
      position.maxRounds =
        (actionState?.maxRounds as number) ?? (lastActionRoundInfo?.maxRounds as number);
    }

    const response: SessionExecutionResponse = {
      aiMessage: executionState.lastAiMessage || '',
      executionStatus: executionState.status,
      position,
      variables: flatVariables,
    };

    if (executionState.variableStore) {
      response.variableStore = {
        global: executionState.variableStore.global || {},
        session: executionState.variableStore.session || {},
        phase: executionState.variableStore.phase || {},
        topic: executionState.variableStore.topic || {},
      };
    }

    if (executionState.lastLLMDebugInfo && executionState.lastLLMDebugInfo.length > 0) {
      response.debugInfo = executionState.lastLLMDebugInfo;
    }

    return response;
  }

  private buildErrorResponse(error: Error): SessionExecutionResponse {
    return {
      aiMessage: '',
      executionStatus: 'error' as import('@heartrule/shared-types').ExecutionStatus,
      position: {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
      },
      variables: {},
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
        details: error.stack,
      },
    };
  }
}

export function createDefaultSessionApplicationService(): ISessionApplicationService {
  return new DefaultSessionApplicationService();
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd packages/core-engine && npx tsc --noEmit
```

Expected output: no errors. If type mismatches appear in `ExecutionState`, check that the `ExecutionState` interface in `script-executor.ts` has all fields the factory assigns.

- [ ] **Step 4: Run existing tests**

```bash
cd packages/core-engine && npx vitest run --reporter verbose 2>&1 | head -80
```

Expected output: all tests pass.

---

## Task 4: Reduce `any` usage in base-action.ts

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`

The file has 17 `any` occurrences. This task replaces unsafe ones with `unknown` or specific types.

- [ ] **Step 1: Replace Record<string, any> in ActionContext with Record<string, unknown>**

In the `ActionContext` interface at lines 49, 51, 61, 62:

```typescript
export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Record<string, unknown>;
  systemVariables?: Record<string, unknown>;
  variableStore?: VariableStore;
  scopeResolver?: IScopeResolver;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}
```

- [ ] **Step 2: Replace Record<string, any> in ActionResult with Record<string, unknown>**

At lines 96 and 100:

```typescript
export interface ActionResult {
  success: boolean;
  completed: boolean;
  aiMessage?: string | null;
  extractedVariables?: Record<string, unknown> | null;
  safety_check?: SafetyCheckResult | null;
  nextAction?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  debugInfo?: LLMDebugInfo;
}
```

- [ ] **Step 3: Fix `getVariable` and `getConfig` return types**

Line 196:

```typescript
  getVariable(context: ActionContext, varName: string, defaultValue: unknown = null): unknown {
    return context.variables[varName] ?? defaultValue;
  }
```

Line 290:

```typescript
  protected getConfig(key: string, defaultValue: unknown = undefined): unknown {
```

- [ ] **Step 4: Replace `varValue: any` in `substituteVariables`**

Line 249:

```typescript
let varValue: unknown;
```

Also update the `variables.set(...)` calls and the `String(varValue)` concatenation at line 280 to use `String(varValue)` which already handles `unknown` safely.

- [ ] **Step 5: Replace `llmOrchestrator?: any` with typed parameter**

In `confirmSafetyViolation` at lines 662-667, change the method signature:

```typescript
  protected async confirmSafetyViolation(
    originalResponse: string,
    riskType: string,
    reason: string,
    llmOrchestrator?: {
      generateText(
        prompt: string,
        config?: { temperature?: number; maxTokens?: number }
      ): Promise<{ text: string }>;
    }
  ): Promise<SafetyConfirmationResult> {
```

- [ ] **Step 6: Replace `catch (error: any)` with `catch (error: unknown)`**

Lines 633 and 730:

```typescript
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[BaseAction] ...', errMsg);
```

- [ ] **Step 7: Fix `extractCommonProfileVariables` return type**

Line 355:

```typescript
  protected extractCommonProfileVariables(context: ActionContext): Map<string, unknown> {
    const variables = new Map<string, unknown>();
```

- [ ] **Step 8: Replace evaluateExitCondition llmOutput parameter type**

Line 408:

```typescript
  protected evaluateExitCondition(
    context: ActionContext,
    llmOutput?: Record<string, unknown>
  ): ExitDecision {
```

- [ ] **Step 9: Verify compilation**

```bash
cd packages/core-engine && npx tsc --noEmit
```

Expected: no errors. Some callers of `getConfig` or `getVariable` may need explicit type assertions where they previously relied on `any` inference.

---

## Task 5: Reduce `any` usage in ai-ask-action.ts

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

The file has 25 `any` occurrences. This task replaces them.

- [ ] **Step 1: Fix constructor config parameter type**

Line 57:

```typescript
  constructor(actionId: string, config: Record<string, unknown>, llmOrchestrator?: LLMOrchestrator) {
```

- [ ] **Step 2: Fix catch clauses**

Lines 113 and 538:

```typescript
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error('[execute] Exception caught:', {
        message,
        stack: e instanceof Error ? e.stack?.split('\n').slice(0, 3).join('\n') : '',
      });
```

- [ ] **Step 3: Fix extractedVariables types**

Line 313:

```typescript
const extractedVariables: Record<string, unknown> = {};
```

Line 390:

```typescript
  private extractVariablesFromJson(llmOutput: EnhancedAskLLMOutput): Record<string, unknown> {
    const extractedVariables: Record<string, unknown> = {};
    const outputConfig = (this.getConfig('output', []) as Array<Record<string, unknown>>);
```

- [ ] **Step 4: Fix buildSystemVariables return type**

Line 571:

```typescript
  private buildSystemVariables(context: ActionContext): Record<string, unknown> {
```

- [ ] **Step 5: Fix loadTemplate return type**

Line 887:

```typescript
  private async loadTemplate(
    context: ActionContext
  ): Promise<{
    resolution: Record<string, unknown>;
    template: Record<string, unknown>;
  }> {
```

- [ ] **Step 6: Fix callLLM return type**

Line 1008:

```typescript
  private async callLLM(
    prompt: string,
    context?: ActionContext
  ): Promise<import('../../application/ports/outbound/llm-provider.port.js').LLMGenerateResult> {
```

- [ ] **Step 7: Fix parseLLMResponse parameter types**

Lines 1035-1039:

```typescript
  private parseLLMResponse(
    llmResult: import('../../application/ports/outbound/llm-provider.port.js').LLMGenerateResult,
    templateType: AskTemplateType,
    resolution: Record<string, unknown>,
    safetyCheck: { passed: boolean; violations: Array<unknown> }
  ): ActionResult {
```

Line 1044:

```typescript
let llmOutput: Record<string, unknown>;
```

- [ ] **Step 8: Fix lambda parameter types for output config iteration**

Lines 1126-1127, 1151, 1172:

```typescript
      // Line 1126-1127
      required_variables: (this.getConfig('output', []) as Array<Record<string, unknown>>)
        ?.map((v) => v.get as string)
        .filter(Boolean),

      // Line 1151
      .map((v) => (v as Record<string, unknown>).get as string)

      // Line 1172
    return outputConfig.every((v) => {
```

- [ ] **Step 9: Fix areAllRequiredVarsCollected parameter type**

Line 1164:

```typescript
    freshlyExtracted?: Record<string, unknown>
```

- [ ] **Step 10: Verify compilation**

```bash
cd packages/core-engine && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Run full test suite**

```bash
cd packages/core-engine && npx vitest run --reporter verbose 2>&1 | tail -30
```

Expected output: all tests pass.

---

## Final Verification

After all tasks are complete, run the full verification:

```bash
# TypeScript compilation
cd packages/core-engine && npx tsc --noEmit

# Unit tests
cd packages/core-engine && npx vitest run

# Full project build (if available)
pnpm build --filter=@heartrule/core-engine
```

### Expected any count reduction

After the refactoring, re-count:

```bash
grep -n '\bany\b' packages/core-engine/src/domain/actions/base-action.ts | wc -l
# Expected: 17 -> approximately 6-8 remaining (JSON.parse config access, valid dynamic patterns)

grep -n '\bany\b' packages/core-engine/src/domain/actions/ai-ask-action.ts | wc -l
# Expected: 25 -> approximately 10-12 remaining (catch clauses, JSON.parse)
```

Remaining `any` usages should be limited to:

1. `JSON.parse()` results (inherently untyped)
2. Dynamic config access where `as` casts are explicit
3. Third-party library return values without typed wrappers

### Import dependency check

Verify the layer violations are fixed:

```bash
# domain/ should no longer import from engines/
grep -rn "from.*engines/" packages/core-engine/src/domain/
# Expected output: none

# ports/ should no longer import from engines/
grep -rn "from.*engines/" packages/core-engine/src/application/ports/
# Expected output: none
```
