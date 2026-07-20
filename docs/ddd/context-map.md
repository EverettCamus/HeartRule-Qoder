# DDD Context Map — HeartRule-Qoder (Full)

> **Updated:** 2026-06-05
> **Scope:** Full engineering analysis

## Bounded Contexts

```
┌──────────────────────────────────────────────────────────────────────┐
│  @heartrule/shared-types (Shared Kernel)                             │
│                                                                      │
│  SessionStatus, ExecutionStatus, MessageRole, ScriptType,            │
│  VariableScope, ActionType, VariableStore, Zod schemas               │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ 被所有包依赖
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ @heartrule/     │  │ @heartrule/     │  │ @heartrule/     │
│ core-engine     │  │ api-server      │  │ script-editor   │
│                 │  │                 │  │                 │
│ 5 contexts:     │  │ Adapters +      │  │ React SPA       │
│ • Consulting    │  │ Routes +        │  │                 │
│   Session (CORE)│  │ Repositories    │  │ Script Authoring│
│ • Variable      │  │                 │  │ (SUPPORTING)    │
│   System        │  │ Implements:     │  │                 │
│ • Prompt        │  │ MemoryRepository│  │ REST API client │
│   Engineering   │  │ ILLMProvider    │  │ to api-server   │
│ • Conversational│  │ TemplateProvider│  │                 │
│   Memory        │  │                 │  │                 │
│ • LLM           │  │                 │  │                 │
│   Integration   │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Relationship Types

| Upstream                            | Downstream                  | Type              | Rationale                                                              |
| ----------------------------------- | --------------------------- | ----------------- | ---------------------------------------------------------------------- |
| shared-types                        | All others                  | Shared Kernel     | Zod schemas + enums — lightweight, no business logic                   |
| core-engine                         | api-server                  | Customer-Supplier | Core defines ports → api-server implements them                        |
| api-server                          | script-editor               | Open Host Service | REST API with OpenAPI docs at /docs                                    |
| core-engine (MemoryRepository port) | Hindsight                   | ACL               | HindsightMemoryAdapter isolates external API                           |
| Script Authoring (editor)           | Consulting Session (engine) | Conformist        | Editor produces YAML → Engine consumes; editor follows engine's schema |

## Domain Classification

| Context               | Classification | Justification                                                   |
| --------------------- | -------------- | --------------------------------------------------------------- |
| Consulting Session    | 🔴 Core        | HeartRule's unique value — YAML DSL → Phase→Topic→Action engine |
| Variable System       | 🟡 Supporting  | Supports core but replaceable                                   |
| Conversational Memory | 🟡 Supporting  | Differentiation potential but built on generic Hindsight        |
| Prompt Engineering    | 🟡 Supporting  | Template management — important but not unique                  |
| Script Authoring      | 🟡 Supporting  | Editor tooling — necessary but not core business logic          |
| LLM Integration       | 🟢 Generic     | Can be replaced by any AI SDK                                   |

## Change Log

| Date       | Change                              |
| ---------- | ----------------------------------- |
| 2026-06-05 | Full engineering strategic analysis |
| 2026-06-03 | Phase 2a memory system update       |
