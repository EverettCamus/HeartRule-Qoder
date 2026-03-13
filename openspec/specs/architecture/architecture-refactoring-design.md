---
document_id: architecture-architecture-refactoring-design
category: architecture
status: active
version: 1.0.0
last_updated: 2026-03-13
source: docs/plans/2026-03-08-architecture-refactoring-design.md
tags: [architecture-refactoring, design, dependency-inversion, variable-store, action-base-class]
search_priority: high
---

# HeartRule-Qoder Architecture Refactoring Design

**Date**: 2026-03-08  
**Status**: Draft  
**Author**: Sisyphus

---

## 1. Background and Goals

### 1.1 Current Architecture Issues

Through code analysis, the following architecture issues need to be addressed:

| Priority | Issue                                 | Impact                                                                       |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| P0       | Domain Model Bidirectional Dependency | `Session` class references engine layer types (`BaseAction`, `LLMDebugInfo`) |
| P0       | Dual-Track Variable Storage           | `variables: Map<string, unknown>` + `variableStore` coexist                  |
| P1       | Action Base Class Overly Bloated      | 892 lines of code, violates SRP                                              |
| P1       | Inconsistent Test Directories         | `test/` and `__tests__/` coexist                                             |
| P2       | Root Directory Script Chaos           | 70+ .ts script files in root directory                                       |

### 1.2 Refactoring Goals

1. **Eliminate Reverse Dependencies**: Domain layer should not depend on engine implementation layer
2. **Unify Variable Model**: Keep only `variableStore`, deprecate flat variable storage
3. **Separation of Concerns**: Action base class should only retain abstract definitions, infrastructure logic extracted to independent modules
4. **Directory Standardization**: Unified management of test directories and script files

### 1.3 Constraints

- No backward compatibility required (breaking changes acceptable)
- All changes completed in the same iteration

---

## 2. Overall Architecture Design

### 2.1 Layered Architecture

```
┌─────────────────────────────────────────────┐
│  Application Layer: API Server / Script Editor         │
├─────────────────────────────────────────────┤
│  Domain Layer: Domain Models & Services           │
│  - Session (Entity)                         │
│  - Message (Entity)                         │
│  - Script (Entity)                          │
│  - SessionService (Domain Service)          │
├─────────────────────────────────────────────┤
│  Engine Layer: Six Engines (Headless)             │
│  - Script Execution Engine                  │
│  - LLM Orchestration Engine                │
│  - Variable Extraction Engine               │
│  - Memory Engine                            │
│  - Topic Scheduling Engine                  │
│  - Consciousness Trigger Engine             │
├─────────────────────────────────────────────┤
│  Infrastructure Layer: Adapters & Utilities           │
│  - Action Implementations                   │
│  - LLM Providers                            │
│  - Template Resolvers                       │
└─────────────────────────────────────────────┘
```

### 2.2 Dependency Direction

```
Domain Layer (Shared Types)
        ↑
    Services
        ↑
    Engines ← Adapters/Utilities
        ↑
    API Server / Script Editor
```

**Core Principle**: Domain layer is independent infrastructure, not dependent on any upper-layer implementation.

---

## 3. Detailed Design Plans

### 3.1 Session Domain Model Refactoring

#### 3.1.1 Current Problem

```typescript
// core-engine/src/domain/session.ts - Problem code
public currentAction: BaseAction | null;      // ❌ References engine layer
public lastLLMDebugInfo?: LLMDebugInfo;       // ❌ References engine layer
```

#### 3.1.2 Refactoring Solution

**Split Session into:**

1. **SessionEntity** (`shared-types/src/domain/session.ts`)
   - Pure data object (POJO)
   - Contains only state enums and field definitions
   - Does not contain any business logic

2. **SessionService** (`core-engine/src/domain/services/session-service.ts`)
   - State transition logic (start, pause, resume, complete, fail)
   - Variable operation logic
   - Conversation history management
   - **Depends on engine layer** (via interface injection)

#### 3.1.3 File Changes

| File                                         | Change                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| `shared-types/src/domain/session.ts`         | Remove class implementation, keep only interface + Zod Schema |
| `core-engine/src/domain/session.ts`          | Rename to `session-service.ts`, extract as Domain Service     |
| `core-engine/src/domain/entities/session.ts` | Add new pure data Entity                                      |

---

### 3.2 Variable Storage Unification

#### 3.2.1 Current Problem

```typescript
// Dual-track coexistence
public variables: Map<string, unknown>;      // Legacy flat
public variableStore?: VariableStore;         // New layered
```

#### 3.2.2 Refactoring Solution

**Deprecate `variables: Map<string, unknown>`, keep only `variableStore`**

1. Add flat access compatibility methods in `VariableStore`
2. All engines and Actions use only `variableStore`
3. Migration script: Update all code referencing `session.variables`

#### 3.2.3 File Changes

| File                                      | Change                                |
| ----------------------------------------- | ------------------------------------- |
| `shared-types/src/domain/variable.ts`     | Extend `VariableStore` interface      |
| `core-engine/src/engines/variable-scope/` | Unify variable lookup logic           |
| All Action files                          | Remove `context.variables` references |

---

### 3.3 Action Base Class Refactoring

#### 3.3.1 Current Problem

`base-action.ts` (892 lines) contains:

- Variable substitution logic (70+ lines)
- Exit condition evaluation (100+ lines)
- Safety boundary detection (80+ lines, deprecated)
- LLM output parsing
- Template path resolution

#### 3.3.2 Refactoring Solution

**Split into multiple layers:**

```
domain/
└── actions/
    ├── base-action.ts        # Abstract base class (only defines interface + execute abstract method)
    └── interfaces/
        ├── i-action-context.ts
        ├── i-action-result.ts
        └── i-variable-substitutor.ts

infrastructure/
└── actions/
    ├── variable-substitutor.ts    # Variable substitution implementation
    ├── exit-condition-evaluator.ts # Exit condition evaluation
    └── safety-checker.ts          # Safety boundary detection
```

#### 3.3.3 File Changes

| File                                                                 | Change                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `core-engine/src/domain/actions/base-action.ts`                      | Streamline to 100 lines, keep only abstract definitions |
| `core-engine/src/infrastructure/actions/variable-substitutor.ts`     | New file                                                |
| `core-engine/src/infrastructure/actions/exit-condition-evaluator.ts` | New file                                                |
| `core-engine/src/infrastructure/actions/safety-checker.ts`           | New file (refactored from deprecated code)              |

---

### 3.4 Test Directory Unification

#### 3.4.1 Current Problem

- `packages/core-engine/src/test/`
- `packages/core-engine/src/__tests__/`

#### 3.4.2 Refactoring Solution

**Unify to `__tests__/`**

1. Migrate files under `test/` to `__tests__/`
2. Delete `test/` directory
3. Update test paths in configuration files

---

### 3.5 Script File Migration

#### 3.5.1 Current Problem

Root directory has 70+ .ts script files, mixed with:

- Test scripts (`test-*.ts`)
- Migration scripts (`migrate-*.ts`, `update-*.ts`)
- Utility scripts (`check-*.ts`, `find-*.ts`, `verify-*.ts`)

#### 3.5.2 Refactoring Solution

```
scripts/
├── migration/     # Database migration scripts
├── development/  # Development helper scripts
├── testing/      # Test scripts
└── maintenance/  # Maintenance scripts
```

---

## 4. Data Flow Design

### 4.1 Session Lifecycle

```
┌─────────────┐     start()      ┌─────────────┐
│  CREATED    │ ──────────────→  │   ACTIVE    │
└─────────────┘                  └─────────────┘
       ↑                                │
       │                                │ pause()
       │                                ↓
       │                         ┌─────────────┐
       │                         │   PAUSED    │
       │                         └─────────────┘
       │                                │
       │                                │ resume()
       │                                ↓
       │                         ┌─────────────┐
       │                    complete() │   COMPLETED
       │                         ←─────────────┘
       │
       │                         ┌─────────────┐
       └───────────── fail() ──→ │   FAILED   │
                                 └─────────────┘
```

### 4.2 Variable Lookup Priority

```
VariableStore (Layered)
├── global     # Global variables (system-level)
├── session    # Session-level variables
├── phase      # Phase-level variables
└── topic      # Topic-level variables

Lookup order: topic → phase → session → global
Write priority: Explicitly specified by scope
```

---

## 5. Error Handling Design

### 5.1 Error Type Definitions

```typescript
// shared-types/src/errors.ts
export enum ErrorCode {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_INVALID_STATE = 'SESSION_INVALID_STATE',
  VARIABLE_EXTRACTION_FAILED = 'VARIABLE_EXTRACTION_FAILED',
  ACTION_EXECUTION_FAILED = 'ACTION_EXECUTION_FAILED',
  // ...
}
```

### 5.2 Error Propagation

- **Engine Layer Errors**: Wrapped as `EngineError`, includes context information
- **Action Layer Errors**: Returns `ActionResult.success = false`, includes error message
- **API Layer Errors**: Unified handling through `error-handler.ts`

---

## 6. Migration Plan

### Phase 1: Infrastructure Refactoring

1. Create new directory structure
2. Define new interfaces and abstract classes

### Phase 2: Core Module Migration

1. Migrate Session model
2. Unify variable storage
3. Streamline Action base class

### Phase 3: Directory and File Cleanup

1. Unify test directories
2. Migrate root directory scripts

### Phase 4: Validation and Testing

1. Run all tests
2. API integration testing
3. E2E testing

---

## 7. Acceptance Criteria

- [ ] Session model does not depend on engine layer types
- [ ] Only `variableStore` is used, no flat variable references
- [ ] Action base class < 150 lines
- [ ] Test directories unified to `__tests__/`
- [ ] Root directory scripts migrated to `scripts/`
- [ ] All tests pass
- [ ] API build succeeds

---

## 8. Risks and Mitigation

| Risk                            | Impact | Mitigation                  |
| ------------------------------- | ------ | --------------------------- |
| Breaking existing functionality | High   | Comprehensive test coverage |
| Circular dependencies           | Medium | Dependency checking tools   |
| Migration omissions             | Medium | Code search verification    |

---

**Next Step**: Invoke writing-plans skill to create detailed implementation plan
