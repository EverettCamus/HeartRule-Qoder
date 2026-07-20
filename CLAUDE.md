# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev              # Start API server
pnpm dev:editor       # Start script editor
pnpm dev:all          # Start both concurrently

# Testing
pnpm test             # Run all tests (Vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm test:e2e         # Playwright E2E tests

# Single test file
pnpm --filter @heartrule/core-engine test -- path/to/file.test.ts

# Linting / Type checking
pnpm lint
pnpm lint:fix
pnpm typecheck

# Build
pnpm build

# Database (requires running PostgreSQL)
pnpm db:migrate
pnpm db:studio        # Drizzle Studio UI

# Docker (easiest way to start dependencies)
pnpm docker:dev
```

## Architecture

HeartRule-Qoder is an AI consulting workflow engine. Domain experts define consulting flows as **YAML scripts** (phases → topics → actions); the engine orchestrates LLM calls and user input to execute them.

### Packages

| Package                    | Role                                                    |
| -------------------------- | ------------------------------------------------------- |
| `@heartrule/shared-types`  | Shared Zod schemas and TypeScript types (no logic)      |
| `@heartrule/core-engine`   | Six-engine headless core (no HTTP, no database)         |
| `@heartrule/api-server`    | Fastify REST API + WebSocket, Drizzle ORM, Redis        |
| `@heartrule/script-editor` | React 18 + Ant Design frontend for editing YAML scripts |

### Core Engine — Six Engines

Located in `packages/core-engine/src/engines/`:

1. **script-execution** — Parses YAML scripts, orchestrates Phase→Topic→Action execution
2. **llm-orchestration** — Multi-provider LLM manager (OpenAI, Volcengine/DeepSeek)
3. **variable-extraction** — Extracts variables from dialogue (direct/pattern/LLM methods)
4. **variable-scope** — 4-level hierarchy: global → session → phase → topic
5. **exit-decision** — Rule-based + LLM semantic exit logic for `ai_ask` actions
6. **prompt-template** — Template loading, validation, variable substitution (2-layer: Custom/Default)

#### Engine Responsibilities & Call Relationships

| Engine                  | Responsibility                                                                | Key Methods                                                     | Dependencies                         |
| ----------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **script-execution**    | Main orchestrator; parses YAML, manages Phase→Topic→Action flow               | `executeSession()`, `executeAction()`, `moveToNextAction()`     | All 5 other engines                  |
| **llm-orchestration**   | Unified LLM interface with multi-provider support                             | `generateText()`, `streamText()`, `registerProvider()`          | (No internal dependencies)           |
| **prompt-template**     | Template loading, validation, variable substitution (2-layer: Custom/Default) | `loadTemplate()`, `substituteVariables()`, `validateTemplate()` | TemplateProvider (port)              |
| **variable-extraction** | Extract structured data from user input (direct/pattern/llm methods)          | `extract()`, `extractMultiple()`                                | llm-orchestration (for 'llm' method) |
| **variable-scope**      | Manage 4-layer variable hierarchy and priority lookup                         | `resolveVariable()`, `setVariable()`, `determineScope()`        | (No internal dependencies)           |
| **exit-decision**       | Decide whether to exit current Action or continue                             | `evaluate()`                                                    | RuleBasedEvaluator                   |

**Call Flow During Single Action Execution:**

```
ScriptExecutor.executeAction()
  ├─ TemplateResolver.resolveTemplatePath()      [2-layer: Custom > Default]
  ├─ PromptTemplateManager.loadTemplate()        [+ validation]
  ├─ VariableScopeResolver.resolveVariable()     [4-layer: topic>phase>session>global]
  ├─ PromptTemplateManager.substituteVariables() [{{scriptVar}} + {%systemVar%}]
  ├─ LLMOrchestrator.generateText()              [actual LLM call + debugInfo]
  ├─ VariableExtractor.extract()                 [direct/pattern/llm]
  ├─ VariableScopeResolver.setVariable()         [persist extracted vars]
  └─ ExitDecisionEngine.evaluate()               [LLM EXIT + RuleBasedEvaluator]
```

**Design Pattern: Hexagonal Architecture**

- `TemplateProvider` is a port (interface); `DatabaseTemplateProvider` is the adapter
- Core engine has zero database/HTTP dependencies
- All state is immutable across engine calls (no side effects)

### Memory System — Domain Port (Not an Engine)

Memory is implemented as a **domain port** (`MemoryRepository`), not a separate engine:

```
packages/core-engine/src/domain/ports/memory-repository.port.ts
```

Three operations define the contract:

- **retain(userId, messages, options?)** — Persist conversation messages to long-term memory
- **recall(userId, query, options?)** — Retrieve relevant memories as structured context
- **reflect(userId, query?)** — Synthesize new insights from existing memories

The port models memory via a **four-network model** (World/Experience/Opinion/Observation), adapted from the Hindsight memory system. The adapter lives in `api-server`; tests use `FakeMemoryRepository`.

### DDD Bounded Contexts

Per the strategic design (`docs/ddd/strategic-design.md`), the codebase is organized into 5 bounded contexts + 1 generic subdomain:

| Context                   | Type        | Package       | Core Ubiquitous Language                                                |
| ------------------------- | ----------- | ------------- | ----------------------------------------------------------------------- |
| **Consulting Session**    | Core Domain | core-engine   | Session, Script, Phase, Topic, Action, Position, ExitDecision           |
| **Variable System**       | Supporting  | core-engine   | VariableScope, VariableState, ExtractionMethod                          |
| **Conversational Memory** | Supporting  | core-engine   | retain/recall/reflect, 4-network (World/Experience/Opinion/Observation) |
| **Prompt Engineering**    | Supporting  | core-engine   | Templates, Substitution, Schemes                                        |
| **Script Authoring**      | Supporting  | script-editor | Projects, Versions, Drafts, Files                                       |
| **LLM Integration**       | Generic     | core-engine   | OpenAI, DeepSeek, Volcano (multi-provider)                              |

**Session** is the sole aggregate root in the Consulting Session context.

### Domain Layer Structure

```
packages/core-engine/src/domain/
├── actions/          # Action classes (AiSayAction, AiAskAction, AiThinkAction)
│   └── base-action.ts  # BaseAction abstract class + ActionContext + ActionResult
├── ports/            # Domain ports (MemoryRepository)
├── session.ts        # Session entity (state machine)
├── script.ts         # Script, Phase, Topic value objects
├── variable.ts       # Variable domain logic
└── message.ts        # Message value object
```

### Application Layer

```
packages/core-engine/src/application/
├── actions/          # ActionFactory, ActionRegistry
├── handlers/         # ExecutionResultHandler
├── monitors/         # Monitor system (AiAskMonitor, AiSayMonitor, MonitorOrchestrator)
├── orchestration/    # TopicActionOrchestrator (cross-Action orchestration)
├── orchestrators/    # MonitorOrchestrator
├── planning/         # TopicPlanner (dynamic topic selection)
├── state/            # ActionStateManager (serializable Action state snapshots)
└── ports/            # Outbound ports (ILLMProvider)
```

### YAML Script DSL

Scripts define workflows as phases containing topics containing actions:

```yaml
phases:
  - id: greeting
    topics:
      - id: welcome
        actions:
          - type: ai_say # LLM speaks to user
          - type: ai_ask # LLM asks, waits for user input, extracts variables
          - type: ai_think # Internal LLM reasoning (no user output)
```

Variables use `{{variable_name}}` interpolation in prompts and responses.

### Key Patterns

- **DDD layering**: Domain (Session, Script, Variable) → Application (SessionApplicationService) → Infrastructure (LLM providers, DB)
- **Hexagonal architecture**: Ports (`ILLMProvider`, `TemplateProvider`) with injected adapters
- **Session state machine**: ACTIVE → RUNNING ↔ WAITING_INPUT → COMPLETED/FAILED
- **Provider pattern**: LLMOrchestrator registers providers at runtime; `DatabaseTemplateProvider` loads YAML from DB

## Complete Request Lifecycle

User sends message → HTTP POST `/api/sessions/{id}/messages` → Fastify route calls `SessionManager.processUserInput()`:

```
[1] DB Read: sessions table (position, variables, metadata)
[2] DB Read: messages table (full conversation history)
[3] Save user message to messages table
[4] restoreExecutionState() — rebuild ExecutionState from DB data
[5] ScriptExecutor.executeSession(executionState, userInput)
    ├─ TemplateResolver.resolveTemplatePath()
    ├─ PromptTemplateManager.loadTemplate() + substituteVariables()
    ├─ VariableScopeResolver.resolveVariable() [4-layer priority]
    ├─ LLMOrchestrator.generateText() [HTTP to OpenAI/Volcengine]
    ├─ VariableExtractor.extract() [direct/pattern/llm]
    ├─ VariableScopeResolver.setVariable()
    └─ ExitDecisionEngine.evaluate() [shouldExit = LLM EXIT OR rules]
[6] DB Write: new messages (role=assistant)
[7] DB Write: variable snapshots
[8] DB Write: update sessions table (position, variables, metadata)
[9] Return HTTP 200 with aiMessage + position + variables
```

**Key Design**: core-engine is purely functional (ExecutionState in → ExecutionState out). All persistence is SessionManager's responsibility. This allows core-engine to have zero external dependencies and remain fully testable.

## Design Patterns

### 1. Hexagonal Architecture (Ports & Adapters)

```
core-engine defines ILLMProvider, TemplateProvider (ports)
  ↓
api-server provides OpenAIProvider, VolcanoProvider, DatabaseTemplateProvider (adapters)
  ↓
DI Container injects them at startup
```

Result: core-engine has zero database/API vendor lock-in.

### 2. Dependency Injection (IoC Container)

Location: `packages/api-server/src/ioc/container.ts`

- Singleton `DependencyContainer` instantiates: LLMProvider → LLMOrchestrator → ScriptExecutor
- SessionManager retrieves pre-built ScriptExecutor at request time
- Enables provider selection via environment variables (no code changes needed)

### 3. Strategy Pattern (Multiple Algorithms)

**Variable Extraction** (3 strategies):

```
extractionMethod: 'direct'  → type conversion (text/number/boolean/list)
extractionMethod: 'pattern' → regex matching with capture groups
extractionMethod: 'llm'     → call LLMOrchestrator for semantic extraction
```

**Template Resolution** (2-layer strategy):

```
resolve Custom layer: _system/config/custom/{scheme}/ai_ask.md  [priority]
  → fallback to Default layer: _system/config/default/ai_ask.md
```

### 4. Factory Pattern

`ActionFactory.create(actionType, actionId, config)` creates:

- `ai_say` → AiSayAction
- `ai_ask` → AiAskAction
- `ai_think` → AiThinkAction

Decouples ScriptExecutor from concrete Action classes.

### 5. State Machine

`ExecutionStatus` enum manages session lifecycle:

```
RUNNING → WAITING_INPUT (on ai_ask, await user reply)
        → COMPLETED (all phases done)
        → ERROR (execution failed)
WAITING_INPUT + userInput → RUNNING (resume)
```

Stored in `sessions.executionStatus` and recovered each request.

### 6. Template Method Pattern

`BaseLLMProvider` defines skeleton, subclasses implement key method:

```typescript
abstract class BaseLLMProvider {
  abstract getModel(): LanguageModel; // ← override this

  async generateText(prompt, config) {
    // ← reused logic
    const model = this.getModel();
    // timeout control, debugInfo collection, streaming, etc.
  }
}
```

### 7. Orchestrator Pattern

Six engines are coordinated by ScriptExecutor (no circular dependencies):

```
ScriptExecutor
  ├─ calls LLMOrchestrator (isolated)
  ├─ calls PromptTemplateManager (isolated)
  ├─ calls VariableExtractor (isolated; calls LLMOrchestrator internally)
  ├─ calls VariableScopeResolver (isolated)
  └─ calls ExitDecisionEngine (isolated)
```

Each engine has single responsibility; ScriptExecutor orchestrates workflow.

### 8. DDD Layering

```
Domain Layer (no infrastructure)
  ├─ Session (entity: state machine + business logic)
  ├─ Script, Topic, Action (value objects)
  └─ VariableScopeResolver (domain service: 4-layer variable hierarchy)

Application Layer (orchestration)
  ├─ SessionManager (application service: state bridge)
  └─ ScriptExecutor (application service: engine orchestration)

Infrastructure Layer (external adapters)
  ├─ DatabaseTemplateProvider (implements TemplateProvider port)
  ├─ OpenAIProvider, VolcanoProvider (implement ILLMProvider port)
  └─ Drizzle ORM (PostgreSQL access)
```

## Design Philosophy

HeartRule's core principle: **In a constrained cognitive budget, use low-entropy symbolic structure (YAML + rules) to anchor high-entropy generative intelligence (LLM).**

> Full theoretical framework: `docs/design/heartrule-design-philosophy-v2.md`.
> This section is the **actionable subset** — use it for daily coding decisions.

### Three Core Concepts

**1. U-Shaped Thinking** (Concrete → Abstract → Strategy → Concrete)

```
User says: "I get anxious presenting to my boss"
    ↓ (LLM conceptualizes)
Abstract: social anxiety + cognitive distortion + autonomic hyperactivation
    ↓ (mapped to professional strategy)
Strategy: CBT cognitive reframing technique
    ↓ (LLM generates specific response)
Output: personalized reply acknowledging the pattern
```

Bridges infinite concrete scenarios with finite professional strategies.

**2. Three Decision Zones**

- **Must Determine** (100% rule) — safety, ethics, core flow → use rules
- **Can Be Flexible** — personalization, context adaptation → let LLM free
- **Uncertain** — edge cases → build feedback loop for system learning

**3. Entanglement Reduction Architecture**
The consultation process systematically extracts low-entropy evidence from high-entropy dialogue:

```
VariableExtractor  → "take witness statement" (direct/pattern/llm evidence)
TopicPlanner       → "analyze clues, plan next interrogation"
ExitDecisionEngine → "check if evidence chain is complete"
```

### Nine Design Principles

Ordered by coding frequency — principles you'll use every day come first.

**1. Code-vs-Script Boundary** — When adding _any_ logic, ask: "Is this common to ALL consulting domains, or specific to one?"
Code (`core-engine` + `api-server`) implements the **consulting abstraction layer**: domain-neutral ports, engine orchestration, variable scoping, LLM invocation.
YAML scripts + templates implement **domain-specific consulting**: extraction prompts, recall queries, document templates, knowledge base entries.
If specific → scripts. If universal → code.

**2. Planning-Execution Separation** — 90% execution (scripted, fast), 10% planning (LLM-driven, at key nodes).
**Apply by**: when adding logic, decide — does this fire on every turn (head-down execution) or only at decision points like topic boundaries, crisis signals, impasse (head-up planning)?

**3. Progressive Rulification** — Rules are patches for LLM failures, not cages.
**Apply by**: let the LLM try first. Add a rule only where it _consistently_ fails. Remove rules as LLM capability improves. TDD-style: red (LLM fails) → green (add minimal rule) → refactor (simplify as LLM improves).

**4. Three Decision Zones** — Classify every design choice into one of three zones:

- **Must Determine** — safety, ethics, core flow → lock with rules
- **Can Be Flexible** — personalization, context adaptation → let LLM free
- **Uncertain** — edge cases → build feedback loops, let system learn

**5. Cognitive Anchoring** — Low-entropy symbols (YAML, structured variables) anchor high-entropy LLM output.
**Apply by**: every LLM call must have a structured output contract (JSON schema, typed variables, extraction config).

**6. U-Shaped Thinking** — Concrete user input → abstract concept → professional strategy → concrete response.
**Apply by**: when writing templates, encode the full U-path: the LLM must go through abstraction before generating a response. Don't let it jump directly from input to output.

**7. Entropy Reduction** — Every engine interaction should extract structured information from unstructured dialogue.
**Apply by**: VariableExtractor, TopicPlanner, ExitDecisionEngine all serve this function. When adding a new engine or action, ask: "What low-entropy signal does this extract from high-entropy conversation?"

**8. Experience Container** — The system hosts multiple consulting approaches (scripts) simultaneously.
**Apply by**: never hardcode consulting logic in TypeScript. Different domains/streams coexist as independent YAML scripts. Design for coexistence, not unification.

**9. Co-evolutionary** — Human creates scripts, AI executes, data feeds back, scripts improve.
**Apply by**: every feature needs a feedback channel. When building, ask: "How will a human know if this worked? How will they improve it?"

### API Server

Fastify server in `packages/api-server/src/`:

- Routes: `/api/sessions`, `/api/chat`, `/api/scripts`, `/api/projects`, `/api/versions`
- Database: PostgreSQL 16 via Drizzle ORM (schema in `src/db/schema/`)
- Cache: Redis via ioredis

#### SessionManager: State Bridge

`SessionManager` is the critical bridge between stateless `core-engine` and stateful `api-server`. Each request follows:

1. **State Recovery**: Load position, variables, metadata from `sessions` table + full conversation history from `messages` table
2. **Restore ExecutionState**: Reconstruct in-memory `ExecutionState` with 4-layer `VariableStore`
3. **Execute**: Call `ScriptExecutor.executeSession(executionState, userInput)` with recovered state
4. **Persist**: Save new position, variables, messages, and metadata back to DB

**Key Methods:**

- `initializeSession(sessionId)` — Get first AI message
- `processUserInput(sessionId, userInput)` — Resume & continue execution
- `restoreExecutionState()` — Rebuild execution state from DB
- `updateSessionState()` — Persist updated state to `sessions` table

**SessionManager ensures:**

- Every request is a complete read→restore→execute→write cycle
- core-engine remains fully stateless and testable
- Database schema holds: `sessions` (position, variables, metadata), `messages` (full history), `variables` (snapshots)

## Test Structure

Tests live in two locations:

| Location                         | Purpose                                               |
| -------------------------------- | ----------------------------------------------------- |
| `**/__tests__/` (alongside code) | Unit tests co-located with source                     |
| `packages/core-engine/test/`     | Integration, regression, eval, and unit tests by type |

```
packages/core-engine/test/
├── unit/          # Unit tests by layer (domain, application, engines)
├── integration/   # Cross-engine integration tests
├── regression/    # Bug-fix regression tests
├── eval/          # LLM response quality evals
├── monitoring/    # Monitor system tests
└── helpers/       # Test doubles (FakeMemoryRepository, etc.)
```

Vitest config in root `vitest.config.ts` excludes `script-editor/` and `e2e/` from unit test runs. E2E tests use Playwright separately (`pnpm test:e2e`).

## Code Style

- ESLint + Prettier enforced via pre-commit hooks (Husky + lint-staged)
- `no-console` except `warn`/`error`
- Unused variables must be prefixed with `_`
- Import order: builtin → external → internal → parent → sibling → index
- `printWidth=100`, `singleQuote`, `trailingComma=es5`, 2-space indent

## Active Design Documents

Key architecture documents for ongoing and planned work:

| Document                                         | Topic                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `docs/design/topic-unit-modeling.md`             | Core domain model: topic queue, action atoms, consciousness adjustment |
| `docs/design/script-engine-design-principles.md` | DSL syntax design principles (linearity, no engineering, determinism)  |
| `docs/design/consciousness-system.md`            | Consciousness layer design (triggers, interventions)                   |
| `docs/design/memory-framework.md`                | Full memory system design (Hindsight integration)                      |
| `docs/design/variable-memory-bridge.md`          | Variable ↔ Memory responsibility boundary                              |
| `docs/design/ai-ask-memory-recall.md`            | Memory recall within ai_ask actions                                    |
| `docs/ddd/strategic-design.md`                   | Bounded contexts and domain relationships                              |
| `docs/ddd/context-map.md`                        | Context mapping diagrams                                               |
