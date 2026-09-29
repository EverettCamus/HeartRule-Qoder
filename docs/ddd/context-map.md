# Context Map: HeartRule Debug Branch Management

> Generated: 2026-06-03 | Change log: Initial DDD analysis of rollback/branch management

## Bounded Contexts

### 1. Core Engine (`@heartrule/core-engine`)
- **Type**: Core Domain
- **Responsibility**: Stateless script execution, LLM orchestration, variable extraction
- **Key Aggregates**: `Session` (domain entity — state machine, position, variables, conversation history)
- **Knows about branches?** No. Session has no `branchId`, `currentBranchId`, or branching concept. Branch info passes through `metadata` as opaque `Record<string, any>`.

### 2. Session API (`@heartrule/api-server`)
- **Type**: Supporting Domain (orchestration) + Infrastructure (persistence)
- **Responsibility**: Session lifecycle, message persistence, branch management, API routes
- **Key Services**: `SessionOrchestrator` (application service), `SessionRepository` (repository)
- **Owns**: `branch_id` column on messages table, branch creation/continuation logic

### 3. Script Editor (`@heartrule/script-editor`)
- **Type**: Supporting (UI)
- **Responsibility**: Debug panel, timeline snapshots, navigation tree
- **Owns**: `TimelineSnapshot` interface (client-side), `viewingSnapshotId` state

## Context Relationships

```
┌──────────────┐     HTTP API      ┌──────────────┐    Function calls   ┌──────────────┐
│ Script Editor │ ◄──────────────► │ Session API   │ ◄────────────────► │  Core Engine │
│ (supporting)  │                  │ (supporting)  │                    │   (core)     │
│               │                  │               │                    │              │
│ TimelineSnapshot                 │ SessionOrch-  │                    │ Session      │
│ viewingSnapshotId                │ estrator      │                    │ (no branch   │
│ branchId (UI)                    │ SessionRepo   │                    │  concept)    │
│                                  │ branch_id col │                    │              │
└──────────────┘                   └──────────────┘                    └──────────────┘
```

**Relationship: Customer-Supplier (upstream = Core Engine)**
- Session API depends on Core Engine's `Session` domain class
- When Core Engine changes `Session.toExecutionState()`, Session API must adapt
- BranchId is NOT in the domain model — it's an application-level concern

## Architecture Decision: Where Should `branchId` Live?

**Current**: `branchId` lives exclusively in Session API (orchestrator + repository + routes).
It's stored in messages table, passed through `metadata.currentBranchId`, but the Session domain class
has zero knowledge of it.

**Assessment**: This is a **pragmatic** placement. The Core Engine doesn't need branches — it's a stateless
executor. Branching is a session management concern. However, the `_v0ContinuationBranchId` temp flag
in metadata is a code smell — it uses the metadata dictionary as an ad-hoc parameter passing mechanism.
