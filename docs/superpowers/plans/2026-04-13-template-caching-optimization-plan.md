# Template Caching Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce AI response latency by sharing TemplateManager across action executions for session-scoped template caching.

**Architecture:** Add `templateManager` to `ActionContext`, initialized once per session in `SessionManager`, passed through `ScriptExecutor` to actions. Remove redundant clearCache() calls.

**Tech Stack:** TypeScript, existing PromptTemplateManager class

---

## File Structure

| File                                                          | Responsibility                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `core-engine/src/domain/actions/base-action.ts`               | Add `templateManager` and `templateProvider` to ActionContext interface |
| `core-engine/src/engines/script-execution/script-executor.ts` | Add templateManager to ExecutionState, passvia ActionContext            |
| `core-engine/src/domain/actions/ai-ask-action.ts`             | Use context.templateManager, remove clearCache() block                  |
| `core-engine/src/domain/actions/ai-say-action.ts`             | Use context.templateManager, remove clearCache() block                  |
| `api-server/src/services/session-manager.ts`                  | Initialize TemplateManager, add to execution state                      |
| `core-engine/src/engines/prompt-template/template-manager.ts` | Add cache hit/miss timing logs                                          |
| `api-server/src/services/session-manager.ts`                  | Add timing instrumentation for each phase                               |

---

### Task 1: Add Timing Instrumentation to TemplateManager

**Files:**

- Modify: `packages/core-engine/src/engines/prompt-template/template-manager.ts:47-62`

**Goal:** Add cache hit/miss logging with timing to measure template loading performance.

- [ ] **Step 1: Add timing log for cache hit in loadTemplate**

Modify `loadTemplate` method to log cache hits:

```typescript
async loadTemplate(templatePath: string): Promise<PromptTemplate> {
  const templateId = templatePath.replace(/\//g, '_').replace('.md', '');
  const startTime = Date.now();

  // Check cache
  if (this.templates.has(templateId)) {
    const duration = Date.now() - startTime;
    logger.debug(`[TemplateManager] 💾 Cache HIT for: ${templateId} (${duration}ms)`);
    return this.templates.get(templateId)!;
  }

  // ... rest of method
}
```

- [ ] **Step 2: Add timing log for cache miss after loading**

At the end of both `loadTemplateFromDatabase` and `loadTemplateFromFilesystem`, before returning:

```typescript
// In loadTemplateFromDatabase (line ~104)
const duration = Date.now() - startTime;
logger.debug(`[TemplateManager] 📥 Cache MISS, loaded from DB: ${templateId} (${duration}ms)`);

// In loadTemplateFromFilesystem (line ~151)
const duration = Date.now() - startTime;
logger.debug(`[TemplateManager] 📥 Cache MISS, loaded from FS: ${templateId} (${duration}ms)`);
```

- [ ] **Step 3: Add startTime tracking at method start**

Add `const startTime = Date.now();` at the start of `loadTemplate` method.

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `pnpm --filter @heartrule/core-engine test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/engines/prompt-template/template-manager.ts
git commit -m "feat(template-manager): add cache hit/miss timing logs"
```

---

### Task 2: Add TemplateManager to ActionContext Interface

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts:44-63`

**Goal:** Extend ActionContext interface to include optional templateManager and templateProvider.

- [ ] **Step 1: Add imports to base-action.ts**

Add at the top of the file after existing imports:

```typescript
import type { PromptTemplateManager } from '../../engines/prompt-template/template-manager.js';
import type { TemplateProvider } from '../../engines/prompt-template/template-provider.js';
```

- [ ] **Step 2: Add templateManager and templateProvider to ActionContext interface**

Modify the ActionContext interface:

```typescript
export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Record<string, any>;
  systemVariables?: Record<string, any>;
  variableStore?: VariableStore;
  scopeResolver?: VariableScopeResolver;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  // NEW: Shared template manager for session-scoped caching
  templateManager?: PromptTemplateManager;
  // NEW: Template provider for DB access
  templateProvider?: TemplateProvider;
}
```

- [ ] **Step 3: Run type check to verify interface changes**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add packages/core-engine/src/domain/actions/base-action.ts
git commit -m "feat(action-context): add templateManager and templateProvider fields"
```

---

### Task 3: Add TemplateManager to ExecutionState and Pass via Context

**Files:**

- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts`

**Goal:** Add templateManager to ExecutionState and pass it to actions via ActionContext.

- [ ] **Step 1: Add import for PromptTemplateManager**

Add after existing imports (around line 32):

```typescript
import { PromptTemplateManager } from '../prompt-template/template-manager.js';
import type { TemplateProvider } from '../prompt-template/template-provider.js';
```

- [ ] **Step 2: Add templateManager to ExecutionState interface**

Modify the ExecutionState interface (around line 66-98):

```typescript
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;
  variableStore?: VariableStore;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  lastAiMessage: string | null;
  currentPhaseId?: string;
  currentTopicId?: string;
  currentActionId?: string;
  currentActionType?: string;
  lastLLMDebugInfo?: LLMDebugInfo;
  currentTopicPlan?: TopicPlan;
  // NEW: Shared template manager for session-scoped caching
  templateManager?: PromptTemplateManager;
  // NEW: Template provider for DB access
  templateProvider?: TemplateProvider;
}
```

- [ ] **Step 3: Pass templateManager via ActionContext in executeAction method**

Modify `executeAction` method (around line 983-1012) to include templateManager:

```typescript
const context: ActionContext = {
  sessionId,
  phaseId,
  topicId,
  actionId: action.actionId,
  variables: { ...executionState.variables },
  variableStore: executionState.variableStore,
  scopeResolver,
  conversationHistory: [...executionState.conversationHistory],
  metadata: { ...executionState.metadata },
  templateManager: executionState.templateManager,
  templateProvider: executionState.templateProvider,
};
```

- [ ] **Step 4: Pass templateManager via ActionContext in continueAction method**

Modify `continueAction` method (around line 1018-1050):

```typescript
const context: ActionContext = {
  sessionId,
  phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
  topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
  actionId: action.actionId,
  variables: { ...executionState.variables },
  variableStore: executionState.variableStore,
  scopeResolver,
  conversationHistory: [...executionState.conversationHistory],
  metadata: { ...executionState.metadata },
  templateManager: executionState.templateManager,
  templateProvider: executionState.templateProvider,
};
```

- [ ] **Step 5: Update createInitialState to include new fields**

Modify `createInitialState` static method (around line 1084-1103):

```typescript
static createInitialState(): ExecutionState {
  return {
    status: ExecutionStatus.RUNNING,
    currentPhaseIdx: 0,
    currentTopicIdx: 0,
    currentActionIdx: 0,
    currentAction: null,
    variables: {},
    variableStore: {
      global: {},
      session: {},
      phase: {},
      topic: {},
    },
    conversationHistory: [],
    metadata: {},
    lastAiMessage: null,
    templateManager: undefined,
    templateProvider: undefined,
  };
}
```

- [ ] **Step 6: Run type check**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add packages/core-engine/src/engines/script-execution/script-executor.ts
git commit -m "feat(script-executor): pass templateManager via ActionContext"
```

---

### Task 4: Update AiAskAction to Use Shared TemplateManager

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

**Goal:** Use context.templateManager when available, remove redundant clearCache() block.

- [ ] **Step 1: Remove TemplateManager constructor initialization**

Modify constructor (lines 63-68). Remove or comment out the traditional initialization:

```typescript
constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
  super(actionId, config);
  this.maxRounds = this.getConfig('max_rounds', 20);
  this.llmOrchestrator = llmOrchestrator;
  this.exitDecisionEngine = new ExitDecisionEngine();

  // Template path resolution (for fallback)
  const templateBasePath = this.resolveTemplatePath();
  // Initialize templateManager as undefined - will be set from context
  this.templateManager = null as any;
  // TemplateResolver needs project context, defer initialization
  this.templateResolver = null as any;

  // ... rest of constructor
}
```

- [ ] **Step 2: Update loadTemplate to use context.templateManager**

Modify `loadTemplate` method (lines 808-877). Use context.templateManager if available:

```typescript
private async loadTemplate(context: ActionContext): Promise<{ resolution: any; template: any }> {
  const sessionConfig = {
    template_scheme: context.metadata?.sessionConfig?.template_scheme,
  };

  logger.debug('📄 Loading template with config', {
    template_scheme: sessionConfig.template_scheme,
    projectId: context.metadata?.projectId,
    hasTemplateProvider: !!context.metadata?.templateProvider,
    hasTemplateManager: !!context.templateManager,
  });

  const projectId = context.metadata?.projectId;
  const templateProvider = context.metadata?.templateProvider ?? context.templateProvider;

  // Use shared TemplateManager from context if available
  if (context.templateManager) {
    this.templateManager = context.templateManager;
    logger.debug('✅ Using shared TemplateManager from context');
  }

  // Initialize TemplateResolver if needed
  if (!this.templateResolver) {
    const projectRoot = this.resolveProjectRoot(context);
    logger.debug('📂 Using project root', { projectRoot });

    if (projectId && templateProvider) {
      logger.debug('💉 Initializing TemplateResolver with projectId and provider');
      this.templateResolver = new TemplateResolver(projectId, templateProvider);
    } else {
      logger.debug('📂 Initializing TemplateResolver with project path (fallback mode)');
      this.templateResolver = new TemplateResolver(projectRoot);
    }
  }

  // Resolve template path
  const resolution = await this.templateResolver.resolveTemplatePath(
    AiAskAction.actionType,
    sessionConfig
  );

  logger.debug('📝 Template resolved', {
    path: resolution.path,
    layer: resolution.layer,
    scheme: resolution.scheme,
    exists: resolution.exists,
  });

  // Load template using TemplateManager
  let template;
  if (projectId && templateProvider) {
    logger.debug('📂 Loading template from database', { path: resolution.path });
    template = await this.templateManager.loadTemplate(resolution.path);
  } else {
    const projectRoot = this.resolveProjectRoot(context);
    const fullPath = path.join(projectRoot, resolution.path);
    logger.debug('📂 Loading template from filesystem', { fullPath });
    template = await this.templateManager.loadTemplate(fullPath);
  }

  return { resolution, template };
}
```

- [ ] **Step 3: Remove the clearCache block**

Delete lines 840-845 that clearcache and recreate TemplateManager:

```typescript
// DELETE THIS BLOCK:
// if (projectId && templateProvider && !this.templateManager['templateProvider']) {
//   logger.debug('💉 Re-initializing TemplateManager with projectId and provider');
//   this.templateManager.clearCache();
//   this.templateManager = new PromptTemplateManager(projectId, templateProvider);
// }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @heartrule/core-engine test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "feat(ai-ask): use shared TemplateManager from context"
```

---

### Task 5: Update AiSayAction to Use Shared TemplateManager

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-say-action.ts`

**Goal:** Same changes as Task 4 but for AiSayAction.

- [ ] **Step 1: Remove TemplateManager constructor initialization**

Similar to Task 4 Step 1, modify constructor to not create new TemplateManager:

```typescript
constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
  super(actionId, config);
  this.llmOrchestrator = llmOrchestrator;

  // Template path resolution (for fallback)
  const templateBasePath = this.resolveTemplatePath();
  // Initialize as null - will be set from context
  this.templateManager = null as any;
  this.templateResolver = null as any;

  // ... rest of constructor
}
```

- [ ] **Step 2: Update loadTemplate to use context.templateManager**

Find the `loadTemplate` method in ai-say-action.ts and apply similar changes as Task 4 Step 2:

```typescript
private async loadTemplate(context: ActionContext): Promise<{ resolution: any; template: any }> {
  // ... existing resolution logic ...

  // Use shared TemplateManager from context if available
  if (context.templateManager) {
    this.templateManager = context.templateManager;
    logger.debug('✅ Using shared TemplateManager from context');
  }

  // ... rest of method ...
}
```

- [ ] **Step 3: Remove the clearCache block**

Delete the similar block in ai-say-action.ts (around lines 473-477):

```typescript
// DELETE THIS BLOCK:
// if (projectId && templateProvider && !this.templateManager['templateProvider']) {
//   logger.debug('💉 Re-initializing TemplateManager with projectId and provider');
//   this.templateManager.clearCache();
//   this.templateManager = new PromptTemplateManager(projectId, templateProvider);
// }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @heartrule/core-engine test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/domain/actions/ai-say-action.ts
git commit -m "feat(ai-say): use shared TemplateManager from context"
```

---

### Task 6: Initialize TemplateManager in SessionManager

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

**Goal:** Create and manage TemplateManager at session level, pass to ScriptExecutor.

- [ ] **Step 1: Add imports**

Add after existing imports:

```typescript
import { PromptTemplateManager } from '@heartrule/core-engine';
import type { TemplateProvider } from '@heartrule/core-engine';
```

- [ ] **Step 2: Add class properties for TemplateManager**

Add as class properties in SessionManager:

```typescript
export class SessionManager {
  private templateProvider: TemplateProvider;
  // ... existing properties ...
```

- [ ] **Step 3: Initialize TemplateManager in initializeSession**

Modify `initializeSession` method (around line 91-152). Add TemplateManager creation:

```typescript
async initializeSession(sessionId: string): Promise<SessionResponse> {
  // ... existing session loading ...

  // Create shared TemplateManager for this session
  const templateManager = new PromptTemplateManager(projectId, this.templateProvider);

  // ... existing execution state creation ...
  executionState.templateManager = templateManager;
  executionState.templateProvider = this.templateProvider;

  // ... rest of method ...
}
```

- [ ] **Step 4: Initialize TemplateManager in processUserInput**

Modify `processUserInput` method (around line 963-1026). Add TemplateManager to execution state:

```typescript
async processUserInput(sessionId: string, userInput: string): Promise<SessionResponse> {
  // ... existing session loading ...

  // Restore TemplateManager from session or create new
  const projectId = session.metadata?.projectId as string | undefined;
  const existingTemplateManager = executionState.templateManager;

  if (!existingTemplateManager && projectId && this.templateProvider) {
    executionState.templateManager = new PromptTemplateManager(projectId, this.templateProvider);
    executionState.templateProvider = this.templateProvider;
  }

  // ... rest of method ...
}
```

- [ ] **Step 5: Restore TemplateManager in restoreExecutionState**

In the `restoreExecutionState` method, ensure templateManager is preserved:

```typescript
private restoreExecutionState(session: any, globalVariables: any, conversationHistory: any[]): ExecutionState {
  // ... existing restoration logic ...

  // TemplateManager will be recreated if needed in executeSession
  // metadata should contain template-related info

  return {
    // ... existing fields ...
    templateManager: undefined, // Will be set in processUserInput/initializeSession
    templateProvider: undefined,
  };
}
```

- [ ] **Step 6: Add timing instrumentation**

Add timing logs at key points:

```typescript
async processUserInput(sessionId: string, userInput: string): Promise<SessionResponse> {
  const totalStart = Date.now();
  logger.info('🔵 processUserInput called', { sessionId, userInput });
  // ... existing ...

  const loadSessionStart = Date.now();
  const session = await this.loadSessionById(sessionId);
  logger.debug(`⏱️ loadSessionById took ${Date.now() - loadSessionStart}ms`);

  const loadScriptStart = Date.now();
  const script = await this.loadScriptById(session.scriptId);
  logger.debug(`⏱️ loadScriptById took ${Date.now() - loadScriptStart}ms`);

  // ... continue for other operations ...

  logger.debug(`🏁 processUserInput completed in ${Date.now() - totalStart}ms`);
}
```

- [ ] **Step 7: Run tests**

Run: `pnpm --filter @heartrule/api-server test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/api-server/src/services/session-manager.ts
git commit -m "feat(session-manager): initialize and pass shared TemplateManager"
```

---

### Task 7: Integration Test and Verification

**Files:**

- Test: Manual testing in debug dialog

**Goal:** Verify template caching works and measure performance improvement.

- [ ] **Step 1: Run type check on all packages**

Run: `pnpm typecheck`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Start development server**

Run: `pnpm dev`

- [ ] **Step 4: Test in debug dialog**

1. Open debug dialog in script editor
2. Send a message to trigger ai_ask action
3. Observe console logs for:
   - `[TemplateManager] 💾 Cache HIT` on subsequent rounds
   - `[TemplateManager] 📥 Cache MISS` only on first round
4. Send another message in same session
5. Verify only cache HIT logs appear (no MISS for same templates)

- [ ] **Step 5: Verify timing improvement**

Compare console log timing before/after:

- First message: Should show `Cache MISS` for template load
- Second message: Should show `Cache HIT` (faster)

- [ ] **Step 6: Commit final verification**

```bash
git add -A
git commit -m "test: verify template caching optimization"
```

---

## Estimated Impact

- Template loads per session: N → 1 (where N = message rounds)
- Expected latency improvement: 50-200ms per action round
- No functional changes to AI behavior

## Rollback Plan

If issues arise:

1. Revert commits in reverse order (Task 6 → Task 1)
2. Each task is independently reversible
3. TemplateManager will fall back to creating new instances if not in context
