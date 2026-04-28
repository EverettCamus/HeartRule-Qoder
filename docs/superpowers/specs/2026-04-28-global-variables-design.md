# Global Variables Design Spec

**Date**: 2026-04-28  
**Status**: Approved

## Overview

Introduce a global variable definition system for consultation script projects.
Variables like `{{来访者名}}` and `{{咨询师名}}` are defined once in the project,
persisted per-user across sessions, and substituted in all script contexts (YAML
fields, prompt templates, etc).

## Design Decisions

### 1. Directory Restructuring

Rename `config/templates/default/` → `config/prompt-defaults/` and create
`config/project-defaults/` for files copied into new projects:

```
config/
├── prompt-defaults/              # Runtime prompt templates (for DB virtual path)
│   ├── ai_ask_v1.md
│   ├── ai_ask_monitor_v1.md
│   ├── ai_say_v1.md
│   └── ai_say_monitor_v1.md
└── project-defaults/             # Default files copied into new projects
    └── global.yaml               # Global variable definitions
```

### 2. `global.yaml` File Format

Each variable definition contains:

| Field          | Required | Purpose                                                             |
| -------------- | -------- | ------------------------------------------------------------------- |
| `name`         | Yes      | Variable name, referenced in templates as `{{varName}}`             |
| `define`       | No       | Definition describing what the variable means and how to collect it |
| `defaultValue` | No       | Fallback value when user has no stored value yet                    |

Default template at `config/project-defaults/global.yaml`:

```yaml
variables:
  - name: 来访者名
    define: 来访者的称呼，通常从用户首次对话中自我介绍的姓名/昵称中获取
    defaultValue: 来访者
  - name: 咨询师名
    define: 咨询师在对话中的自称，用于建立专业关系
    defaultValue: 咨询师
```

### 3. Database: User-level Variable Persistence

New table `user_global_variables`:

```sql
user_global_variables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     VARCHAR(255) NOT NULL,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  variables   JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, project_id)
)
```

**Rationale**: Global variable values are per-user-per-project. Definitions live in
the project (`global.yaml`), but actual values are user-specific. Storing them
in a dedicated table ensures they persist across sessions.

### 4. Runtime Integration

#### 4.1 Initialization Flow (Session Start)

In `session-manager.ts:loadGlobalVariables()`:

```
1. Read project's global.yaml from DB → get variable definitions
   [{name, define, defaultValue}, ...]

2. Register variable definitions in VariableScopeResolver
   → mark which variables belong to global scope

3. Query user_global_variables WHERE user_id=X AND project_id=Y
   → stored values: {来访者名: "小明"}

4. For each defined variable:
   ├─ Has stored value → use stored value
   └─ No stored value → use defaultValue

5. Write final values to VariableStore.global
```

#### 4.2 Persistence Trigger (Variable Write)

In `VariableScopeResolver.setVariable()`:

- When scope is `global`, invoke an `onGlobalVariableChange` callback
- The callback pattern decouples core-engine (no DB access) from api-server (DB access)

```
setVariable(name, value, "global", position)
  → VariableStore.global[name] = value
  → onGlobalVariableChange(name, value)  // callback to api-server
    → api-server: UPSERT user_global_variables
```

#### 4.3 Template Substitution (No Changes)

`BaseAction.substituteVariables()` already resolves variables via
`scopeResolver.resolveVariable()`, which walks the four-tier scope chain
(topic → phase → session → global). Variables defined in `global.yaml` and
stored in `VariableStore.global` will be found automatically.

### 5. Project Creation Changes

In `POST /projects` route handler and `ProjectInitializer`:

| Before                                       | After                                                           |
| -------------------------------------------- | --------------------------------------------------------------- |
| Templates from `config/templates/default/`   | Templates from `config/prompt-defaults/`                        |
| `global.yaml` hardcoded as `{variables: []}` | `global.yaml` copied from `config/project-defaults/global.yaml` |

### 6. Scope Assignment Rule

Variables defined in `global.yaml` are automatically treated as **global** scope.
When `ai_ask` extracts a variable and calls `setVariable()`, the resolver checks
whether the variable is registered as global — if yes, it writes to global scope
and triggers persistence.

Variables NOT defined in `global.yaml` continue to default to TOPIC scope as before.

## Files to Modify

| File                                                                | Change                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `config/`                                                           | Rename `templates/default` → `prompt-defaults`, create `project-defaults/global.yaml` |
| `api-server/src/db/schema.ts`                                       | Add `user_global_variables` table definition                                          |
| `api-server/drizzle/migrations/`                                    | New migration for `user_global_variables` table                                       |
| `api-server/src/routes/projects.ts`                                 | Update copy paths for templates and global.yaml                                       |
| `api-server/src/services/project-initializer.ts`                    | Update `importDefaultTemplates()` path reference                                      |
| `api-server/src/services/session-manager.ts`                        | Extend `loadGlobalVariables()` with user-value lookup and `defaultValue` fallback     |
| `core-engine/src/engines/variable-scope/variable-scope-resolver.ts` | Add `onGlobalVariableChange` callback, invoke on global-scope writes                  |
| `shared-types/src/domain/variable.ts`                               | Add `GlobalVariableDefinition` and `OnGlobalVariableChange` types                     |

## Key Type Definitions

```typescript
// In shared-types
interface GlobalVariableDefinition {
  name: string;
  define?: string;
  defaultValue?: unknown;
}

type OnGlobalVariableChange = (name: string, value: unknown) => void | Promise<void>;
```

## Test Coverage

- Unit: `global.yaml` parsing with `define` and `defaultValue` fields
- Unit: `loadGlobalVariables()` default value fallback
- Unit: `setVariable()` triggers callback for global scope
- Integration: Session init with existing `user_global_variables` record
- Integration: Session init without existing record (first-time user)
- E2E: New project creation copies `global.yaml` from `project-defaults/`
