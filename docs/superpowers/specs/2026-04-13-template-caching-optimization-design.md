# Template Caching Optimization Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Improve AI response latency in debugging dialog by optimizing template loading

## Problem Statement

Users experience slow response times in the debugging dialog when using `ai_ask` actions. Analysis identified:

1. **Template Manager recreation** - Each action creates a new `PromptTemplateManager` instance (constructor in `ai-ask-action.ts:66`, `ai-say-action.ts:86`)
2. **Cache clearing** - `clearCache()` called when `templateProvider` is available (`ai-ask-action.ts:843`, `ai-say-action.ts:476`)
3. **No session-level caching** - Templates loaded from DB/filesystem on every action round

## Solution

Share `TemplateManager` across action executions via `ActionContext`, enabling session-scoped template caching.

## Implementation Phases

### Phase 1: Timing Instrumentation

Add timing logs to measure each operation's duration.

**Files to modify:**

- `packages/api-server/src/services/session-manager.ts`
- `packages/core-engine/src/domain/actions/ai-ask-action.ts`
- `packages/core-engine/src/domain/actions/ai-say-action.ts`
- `packages/core-engine/src/engines/prompt-template/template-manager.ts`

**Logging format:**

```
[Component] ⏱️ operation took Xms
[TemplateManager] 💾 Cache HIT for: template_id
[TemplateManager] 📥 Cache MISS, loading: template_id
```

### Phase 2: Add TemplateManager to ActionContext

**Files to modify:**

- `packages/core-engine/src/domain/actions/base-action.ts` - Add `templateManager?` and `templateProvider?` to `ActionContext` interface
- `packages/core-engine/src/engines/script-execution/script-executor.ts` - Add `templateManager` to `ExecutionState`, pass via `ActionContext`
- `packages/api-server/src/services/session-manager.ts` - Initialize and manage `TemplateManager`

**ActionContext changes:**

```typescript
export interface ActionContext {
  // ... existing fields ...
  templateManager?: PromptTemplateManager;
  templateProvider?: TemplateProvider;
}
```

### Phase 3: Remove Redundant clearCache()

**Files to modify:**

- `packages/core-engine/src/domain/actions/ai-ask-action.ts` - Remove lines 840-845 (`clearCache` block)
- `packages/core-engine/src/domain/actions/ai-say-action.ts` - Remove similar `clearCache` block

**Behavior change:**

- actions use `context.templateManager` when available
- fallback to creating new instance for backward compatibility (tests, standalone usage)

### Phase 4: Verification with Metrics

Add metrics collection to verify optimization:

```typescript
interface MetricEntry {
  operation: string;
  durationMs: number;
  timestamp: string;
}
```

**Metrics to track:**

- Template cache hit rate
- Total template load time
- Per-operation timing (DB calls, LLM calls, template loads)

## Architecture

```
SessionManager
    │
    ├── TemplateManager (created once per session)
    │       └── templates: Map<string, PromptTemplate> (cached)
    │
    └── ScriptExecutor
            │
            └── ExecutionState
                    │
                    └── templateManager: PromptTemplateManager
                            │
                            └── ActionContext.templateManager
                                    │
                                    └── AiAskAction/AiSayAction (use shared manager)
```

## Backward Compatibility

- If no `templateManager` in `ActionContext`, actions create their own (existing behavior)
- Tests can continue without modification
- No breaking changes to public APIs

## Testing Strategy

1. **Unit tests** - Verify cache is used when `templateManager` provided in context
2. **Integration tests** - Verify templates loaded only once per session acrossmultiple actionrounds
3. **Performance tests** - Compare response times before/after

## Expected Impact

- Template loads reduced from N times per session to 1 time (where N=message rounds)
- Estimated improvement: 50-200ms per action round (depending on DB/filesystem latency)
- No functional changes to AI behavior

## Risks and Mitigations

| Risk                               | Mitigation                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Stale templates during development | Add manual cache clear via environment variable or API                 |
| Memory leak from unbounded cache   | Templates are small; bounded by number of unique templates per session |
| Multi-tenant isolation issues      | Each session has its own `TemplateManager` instance                    |
