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
5. **memory** — Short/medium/long-term memory management
6. **exit-decision** — Rule-based + LLM semantic exit logic for `ai_ask` actions

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

### Eight Design Principles

1. **Cognitive Anchoring** — Low-entropy symbols (YAML) anchor high-entropy LLM
2. **Certainty Stratification** — Explicit differentiation of must-lock, can-flex, uncertain zones
3. **Progressive Rulification** — Add rules as LLM fails; remove as it improves (TDD-style)
4. **Experience Container** — System supports multi-stream consulting wisdom coexistence
5. **Entropy Reduction** — Systematic information extraction from dialogue
6. **U-Shaped Thinking** — Bridge concrete situations with abstract strategies
7. **Co-evolutionary** — Human creates/oversees, AI executes/amplifies, feedback loop
8. **Planning-Execution Separation** — 90% deterministic execution (low-head), 10% LLM strategy (high-head) at key nodes
9. **Code-vs-Script Boundary** — Code (`core-engine` + `api-server`) implements the **consulting abstraction layer**: domain-neutral ports (MemoryRepository), engine orchestration, variable scoping, LLM invocation. YAML scripts + templates implement **domain-specific consulting**: extraction prompts, recall queries, document templates, knowledge base entries. When designing, always ask: "Is this common to ALL consulting domains, or specific to one?" If specific — it belongs in scripts, not code.

**See** `docs-archive/misc/HeartRule设计哲学v2.md` for full philosophical framework (in Chinese).

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

## Code Style

- ESLint + Prettier enforced via pre-commit hooks (Husky + lint-staged)
- `no-console` except `warn`/`error`
- Unused variables must be prefixed with `_`
- Import order: builtin → external → internal → parent → sibling → index
- `printWidth=100`, `singleQuote`, `trailingComma=es5`, 2-space indent
