# Tactical Design: Session API Context

> Generated: 2026-06-03 | Focus: Branch Management for Debug Rollback

## DDD Pattern Map

### Application Service: `SessionOrchestrator`
- **Role**: Use-case orchestration (initialize, process user input, rerun, update variable)
- **Branch methods**: `rerunAction()` creates branches, `processUserInput(restoreToActionId)` continues on a branch
- **Port dependencies**: `ISessionRepository`, `TemplateProvider`
- **Injects**: `ScriptExecutor` (from Core Engine)

### Repository: `SessionRepository` (implements `ISessionRepository`)
- **Role**: Persistence adapter — messages, sessions, debug entries
- **Branch operations**: `loadConversationHistory(branchId)`, `saveUserMessage(branchId)`, `getRawMessages(branchId)`
- **Removed**: `flagSupersededMessages()` — replaced by branchId filtering

### Domain Entity: `Session` (from Core Engine)
- **Role**: Aggregate root — holds execution state
- **Branch awareness**: NONE. `metadata: Record<string, any>` carries `currentBranchId`, `_v0ContinuationBranchId` opaquely
- **Lifecycle**: created → active → waiting_input → completed/failed

### Routes: Session Routes (Fastify)
- **`GET /messages?branchId=X`**: Filters by branch
- **`GET /messages`** (no branchId): Defaults to session's `currentBranchId`
- **`POST /messages`**: Accepts `restoreToActionId` for V0 continuation
- **`POST /rerun`**: Creates new branch

## Violation Analysis

### 🔴 Critical: `_v0ContinuationBranchId` temp flag in metadata

**Location**: `session-orchestrator.ts:427` — `session.metadata._v0ContinuationBranchId = activeBranchId`
**Violation**: Metadata dictionary used as ad-hoc parameter passing between application service and repository.
The repository reads `session.metadata._v0ContinuationBranchId` as a side-channel instead of receiving it as an explicit parameter.

**Fowler technique**: **Introduce Parameter Object** — pass `branchId` as an explicit parameter to `saveNewAIMessagesFromSession()`, removing the need for the temp metadata flag.

**Severity**: 🟡 Medium (works correctly but fragile; exception path leaks temp flag into persisted metadata)

### 🟡 Medium: Branch logic split across orchestrator and routes

**Location**: `session-orchestrator.ts` (branch creation, continuation) + `routes/sessions.ts` (branchId → currentBranchId defaulting, double-encoded JSONB parsing)
**Violation**: Branch default logic (when no branchId provided, use currentBranchId) lives in the route, not the orchestrator. The route also has metadata parsing logic (`typeof meta === 'string'` check) that belongs in the repository.

**Fowler technique**: **Move Method** — move `currentBranchId` default logic into repository or orchestrator; move metadata parsing into repository's `loadSessionById`.

### 🟡 Medium: `Session` domain class doesn't model branches

**Location**: `packages/core-engine/src/domain/session.ts`
**Violation**: `branchId` and `currentBranchId` are important domain concepts (a session can have multiple concurrent conversation branches), but the domain model treats them as opaque metadata. The `Session` aggregate has no invariant protection — any code can change `metadata.currentBranchId` without going through domain logic.

**Decision**: **Defer** — The Core Engine doesn't need branch awareness yet. Session is a stateless execution carrier; branching is a session management concern at the application layer. Revisit if branching logic becomes more complex (e.g., branch merge, branch-specific variable scopes).

### 🟢 Minor: Client-side Select oscillation guard

**Location**: `DebugChatPanel/index.tsx` — `suppressSelectOnChange` with 500ms timeout
**Violation**: Time-based guard is a UI workaround, not a domain concern. The Select component's onChange semantics conflict with controlled component pattern.

**Fowler technique**: **Stabilize Options Reference** — use `useMemo` for Select options to prevent unnecessary re-renders that trigger Ant Design's onChange.

## Branch Lifecycle (Current Design)

```
initializeSession()
  └── branchId = uuidv4()           → Branch A (V0)

processUserInput("爸妈")            → Branch A (normal flow)
  └── Messages stored with branch_id = A

rerunAction("action_1")             → Branch B (V1)
  └── previousBranchId = A stored in snapshot
  └── newBranchId = uuidv4()
  └── currentBranchId → B
  └── Rollback AI stored with branch_id = B

processUserInput("V0 msg", restoreToActionId: "action_1")  → Branch A continuation
  └── snapshotBranchId = A (from snapshot metadata)
  └── Messages stored with branch_id = A
  └── currentBranchId stays as B (NOT changed)
  └── AI messages branchId: via _v0ContinuationBranchId temp flag → A
```

## Deprecated / Removed

| Old Pattern | Replacement |
|---|---|
| `flagSupersededMessages()` | `branch_id` column + branch filtering |
| `includeSuperseded` parameter | `branchId` parameter on `loadConversationHistory` |
| `superseded` filter in routes | `branchId` filter in repository queries |
| `continuationRunId = uuidv4()` | Continue on snapshot's existing `branchId` |
