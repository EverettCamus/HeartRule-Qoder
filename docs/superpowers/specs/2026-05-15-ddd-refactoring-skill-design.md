# DDD Refactoring Skill — Design

> Status: approved | Date: 2026-05-15 | Skill type: Technique

## Overview

A Claude Code skill that analyzes a codebase for DDD violations, classifies them by architecture severity,
writes/updates strategic and tactical design documentation, and produces a Martin Fowler-style refactoring
plan with TDD safety net integration.

Core principle: **Static analysis identifies violations → severity-graded report → developer confirmation →
ordered refactoring plan → handed off to writing-plans + TDD for safe execution.**

## Skill Structure

```
~/.claude/skills/ddd-refactoring/
  SKILL.md                              # Main: workflow + analysis framework + severity criteria
  ddd-violation-catalog.md              # Reference: common DDD violation patterns
  templates/
    context-map-template.md             # Strategic: bounded context map template
    tactical-design-template.md         # Tactical: per-context design template
```

### Relationship with Other Skills

```
ddd-refactoring → outputs refactoring plan (WHAT: violations, Fowler techniques, ordering)
        │
        ▼
writing-plans   → outputs executable task list (HOW: file changes, dependencies)
        │
        ▼
executing-plans → dispatches tasks one by one
        │
        └── test-driven-development → safety net per task
            (characterization test → apply one Fowler technique → run all tests →
             pass? commit / fail? rollback → split into smaller sub-technique → retry)
```

## Core Workflow

### Phase 0: Strategic Context Discovery

Auto-discover bounded contexts from the codebase:

**Step 1 — Candidate identification** (multi-signal):

| Signal              | Extraction method                                                                             | Weight |
| ------------------- | --------------------------------------------------------------------------------------------- | ------ |
| Package boundary    | `package.json` name + workspaces; each independent package is a candidate context             | High   |
| Directory structure | Top-level `src/` subdirectories (e.g., `domain/`, `application/`) may be internal contexts    | Medium |
| Port interfaces     | Search for `interface I*` or `export interface` under `ports/`; the defining side is upstream | High   |
| Database ownership  | Search for DDL/Schema files and ORM entities; which directory owns the table                  | High   |
| Deployment units    | Check `Dockerfile`, `docker-compose.yml`; same deploy unit = likely same context              | Medium |
| Shared types        | Cross-package references like `@project/shared-types` are Shared Kernel candidates            | High   |
| API boundaries      | OpenAPI/GraphQL schemas, REST route files                                                     | Medium |

**Step 2 — Boundary validation** for each candidate:

```
Does this candidate have its own domain language?
  → Check: independent entities, value objects, domain events

Does it have well-defined inbound interfaces?
  → Check: ports/inbound/ or application service interfaces

Does it need to evolve independently?
  → Check: different business stakeholders? different release cadence?
```

Any "no" → classify as module (not context), mark for investigation.

**Step 3 — Relationship classification** by dependency direction:

| Dependency pattern                                      | Relationship                                            |
| ------------------------------------------------------- | ------------------------------------------------------- |
| A defines interface, B implements, B→A one-way          | A = Open Host (OHS), B = Conformist / Customer-Supplier |
| A and B cross-reference types (bidirectional)           | Boundary missing, needs Anticorruption Layer            |
| A and B both depend on C, C has no independent business | C = Shared Kernel                                       |
| B explicitly translates A's models before use           | B already has Anticorruption Layer                      |
| One-way + upstream team leads, downstream follows       | Customer-Supplier (upstream dominates)                  |

**Output**: Create or update `docs/ddd/context-map.md` using template. On first run → create. Subsequent → append changes to history, update relationships.

### Phase 1: Tactical Design Mapping

Auto-extract tactical patterns per bounded context:

| DDD pattern         | Code signal                                                                    | Extraction method                                        |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Aggregate Root      | `class` + lifecycle methods (start/pause/complete) + ID + self-contained state | Search: ID-bearing classes with state machine methods    |
| Entity              | `class` + unique identifier + no lifecycle methods                             | Search: ID-bearing classes, non-aggregate                |
| Value Object        | Immutable data + no ID + value-based equality                                  | Search: `interface`/`type` without ID fields             |
| Domain Service      | Stateless + operates on domain objects + in `domain/`                          | Search: `*Service`/`*Resolver` under domain              |
| Domain Event        | `*Event`/`*DomainEvent` classes                                                | Search: event naming patterns                            |
| Application Service | Use-case orchestration + injects ports                                         | Search: `application/usecases/` or `*ApplicationService` |
| Port                | `interface I*` in `ports/`                                                     | Search: port directories                                 |
| Adapter             | Implements port interface + in adapter directory                               | Search: `implements I*`                                  |
| Factory             | `*Factory`/`*Builder` or `static create*`                                      | Search: factory patterns                                 |
| Repository          | `*Repository`/`*Repo` or persistence abstraction                               | Search: persistence interfaces                           |

**Output**: Create or overwrite `docs/ddd/contexts/{name}.md` per context using template.

### Information Gathering (Embedded in Phase 0 & 1)

When code signals are insufficient, ask the developer **one question at a time**.
Each question MUST include a concise suggestion with reasoning.

**Principles**:

- Never ask terminology questions ("Is this aggregate root or entity?")
- Ask scenario questions the developer can answer from business knowledge
- Always provide a best-guess suggestion with one-sentence reason
- Don't ask if code alone can answer

**Information gap triggers** (only these justify asking):

| Gap                          | Example question                                                                                                            | Suggested answer                                                                             | Reason                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Aggregate boundary unclear   | "Can variables be modified from outside Session, or only through Session methods?"                                          | ✅ Yes, outside can modify → consider extracting Session as aggregate with controlled access | Current code shows direct mutation                               |
| Context relationship unknown | "When core-engine changes its port interface, does api-server adjust on their own schedule or must they adapt immediately?" | ✅ Adjust immediately → Customer-Supplier (upstream: core-engine)                            | Shared codebase, single team                                     |
| Core vs supporting domain    | "If the variable extraction engine stopped working, can the business still deliver value through the consulting flow?"      | ✅ Core — extraction is essential for personalization                                        | From CLAUDE.md: variable extraction bridges dialogue to strategy |
| Shared entity authority      | "Which context should define `Script` as its authoritative source — core-engine or api-server?"                             | ✅ core-engine — it owns script parsing and execution                                        | CLAUDE.md: core-engine "orchestrates" scripts                    |

### Phase 2: Violation Scanning

Scan each bounded context against `ddd-violation-catalog.md`:

**Core violation patterns** (detailed in catalog):

1. Dependency inversion violation (domain → infrastructure import)
2. Anemic domain model (entity has getters/setters, business logic in services)
3. Port interface not owned by the consuming side
4. Adapter crosses context boundary without ACL
5. Application service contains domain logic
6. Shared Kernel too large (growing without explicit contract)
7. Repository interface in domain, but entity leaks persistence concerns

### Phase 3: Severity Classification

Sorted by architecture impact:

| Level       | Name                                   | Definition                                     | Example from HeartRule                                                                 |
| ----------- | -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| 🔴 Critical | Dependency direction violated          | Inner layer imports from outer layer           | `Session` (domain) imports `LLMDebugInfo` (engines)                                    |
| 🟡 Medium   | DDD pattern missing or misapplied      | Dependency correct but pattern structure wrong | `SessionApplicationService` builds `ExecutionState` inline (should be factory)         |
| 🟢 Minor    | Code smell, doesn't break architecture | Naming, file placement, style                  | `AiAskAction` in `domain/actions/` but closer to application service in responsibility |

### Phase 4: Developer Confirmation

Present findings per context:

- Code location + snippet
- Which DDD principle is violated
- Recommended Fowler refactoring technique
- Severity level with justification

Developer marks each: **Accept** / **Defer** / **Reject**

### Phase 5: Ordering (for Accepted Items)

Ordering rules:

1. Fix dependency violations first (bottom-up: fix infrastructure → application → domain layers)
2. Then fix entity/model issues (anemic → rich, extract value objects)
3. Finally naming/placement (lowest risk, cosmetic)

Within each category, order by dependency: if fixing A makes B easier, A goes first.

### Phase 6: Handoff

Write the ordered plan as a file consumable by `writing-plans`:

```
docs/superpowers/plans/YYYY-MM-DD-ddd-refactoring.md
```

Content per item:

- Order number
- File(s) to change
- Fowler technique name
- Expected blast radius
- TDD entry point (which module needs characterization tests first)
- Prerequisites (other items that must complete first)

## Document Templates

Defined in skill directory, loaded on demand:

- `templates/context-map-template.md` — Strategic: bounded context map
- `templates/tactical-design-template.md` — Tactical: per-context design

### Document Update Strategy

| Document                       | Strategy                                                                | Reason                                                                             |
| ------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/ddd/context-map.md`      | **Append-update** — first run creates, subsequent add to change history | Long-lived architectural asset                                                     |
| `docs/ddd/strategic-design.md` | **Append-update** — first run creates, subsequent add to change history | Core/supporting/generic classification evolves                                     |
| `docs/ddd/contexts/{name}.md`  | **Overwrite** — each analysis replaces the snapshot                     | Tactical details change frequently; fresh picture is clearer than incremental diff |

### During Refactoring Execution

When a refactoring step modifies class location/name/role:

1. Tactical design doc auto-updates (entity moved from app → domain layer → update the tactical doc)
2. If context boundary changes → update context map relationship table
3. If new context discovered → create new context doc and update map

### Context Map Template

```markdown
# Bounded Context Map

> Last updated: YYYY-MM-DD | Analysis tool: ddd-refactoring

## Context Overview

| Context | Type | Responsibility | Domain classification       |
| ------- | ---- | -------------- | --------------------------- |
| ...     | ...  | ...            | Core / Supporting / Generic |

## Context Relationships

| Upstream | Downstream | Relationship | Description |
| -------- | ---------- | ------------ | ----------- |
| ...      | ...        | OHS/PL       | ...         |

## Change Log

| Date | Change | Trigger |
| ---- | ------ | ------- |
| ...  | ...    | ...     |
```

### Tactical Design Template

```markdown
# {Context Name} — Tactical Design

> Bounded Context: {name} | Analysis Date: YYYY-MM-DD

## Aggregates

| Aggregate Root | Entities | Value Objects | Invariants | File |
| -------------- | -------- | ------------- | ---------- | ---- |
| ...            | ...      | ...           | ...        | ...  |

## Ports

| Port | Type (Inbound/Outbound) | Defined In | Implemented In |
| ---- | ----------------------- | ---------- | -------------- |
| ...  | ...                     | ...        | ...            |

## Domain Services

| Service | Responsibility | Dependencies |
| ------- | -------------- | ------------ |
| ...     | ...            | ...          |

## Application Services

| Service | Use Case | Depends On Ports |
| ------- | -------- | ---------------- |
| ...     | ...      | ...              |

## Layer Dependency Check

| Check                                 | Status  | Violation Detail |
| ------------------------------------- | ------- | ---------------- |
| domain imports no infrastructure      | ✅ / 🔴 | ...              |
| application imports no infrastructure | ...     | ...              |
```

## Key Design Decisions

1. **Skill is analysis + planning only** — execution uses existing skills (TDD, writing-plans, executing-plans)
2. **Documents survive sessions** — strategic/tactical docs are project files, regularly updated, not conversation artifacts
3. **Code signal first, ask later** — only prompt developer when code can't answer; always include suggestions
4. **Severity by architecture violation** — dependency direction > pattern missing > naming/style
5. **One Fowler technique per step** — plan outputs steps sized as single complete refactoring technique; each step has TDD safety net
