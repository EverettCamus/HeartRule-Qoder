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

- When scope is `global`, invoke the registered `onGlobalVariableChange` callback
- The callback pattern decouples core-engine (no DB access) from api-server (DB access)

```
setVariable(name, value, "global", position)
  → VariableStore.global[name] = value
  → this.onGlobalVariableChange?.(name, value)  // callback to api-server
    → api-server: UPSERT user_global_variables
```

**Callback injection chain**:

```
api-server/session-manager.ts                  core-engine
────────────────────────────                   ──────────
createSession()
  → new SessionApplicationService()
  → session.start()
    → VariableScopeResolver created
    → resolver.onGlobalVariableChange =
        async (name, value) => {
          db.upsert(user_global_variables, {
            userId, projectId, variables: { [name]: value }
          })
        }
    → resolver.setGlobalVariableNames([...])
    → resolver.setVariable(...)               ← triggers callback on global writes
```

The `onGlobalVariableChange` callback receives `name` and `value` only.
The `userId` and `projectId` are captured via closure when the callback is
registered in `session-manager.ts`.

**Upsert logic** (PostgreSQL):

```sql
INSERT INTO user_global_variables (user_id, project_id, variables)
VALUES ($1, $2, jsonb_build_object($3, $4))
ON CONFLICT (user_id, project_id)
DO UPDATE SET variables = jsonb_set(
  user_global_variables.variables, ARRAY[$3], to_jsonb($4)
), updated_at = NOW();
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

### 6. Scope Assignment Rule — "Definition Determines Scope"

Variables defined in `global.yaml` are automatically treated as **global** scope.
The mechanism works as follows:

```
1. Session init: loadGlobalVariables() reads global.yaml definitions
   → scopeResolver.setGlobalVariableNames(["来访者名", "咨询师名"])

2. ai_ask extracts variable "来访者名" = "小明"
   → registerOutputVariables() checks: is "来访者名" in global registry?
   → YES → setVariable("来访者名", "小明", "global", position)
           → VariableStore.global + persistence callback
   → NO  → setVariable("来访者名", "小明", "topic", position)   (default)
```

**Change in `ai-ask-action.ts:registerOutputVariables()`**: Currently all output variables
default to TOPIC scope. Add a check: if the variable name is in the resolver's global
registry, use `VariableScope.GLOBAL` instead.

**New method in `VariableScopeResolver`**: `setGlobalVariableNames(names: string[])` —
maintains a set of variable names that should be treated as global scope. Used by
`setVariable()` and externally by `registerOutputVariables()` via a getter.

Variables NOT defined in `global.yaml` continue to default to TOPIC scope as before.

## Files to Modify

### New files

| File                                  | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `config/project-defaults/global.yaml` | Default global variable definitions for new projects |

### Filesystem rename

| Before                      | After                     |
| --------------------------- | ------------------------- |
| `config/templates/default/` | `config/prompt-defaults/` |

All references must be updated:

| File                                                           | Current path reference                                             | Change                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `core-engine/src/engines/prompt-template/template-resolver.ts` | `config/templates/default` (lines 149, 160)                        | → `config/prompt-defaults`              |
| `core-engine/src/domain/actions/base-action.ts`                | `../../config/templates`, `./config/templates` (lines 301,303,305) | → `../../config/prompt-defaults` etc.   |
| `core-engine/test/unit/template-validation.test.ts`            | `config/templates/default/ai_ask_v1.md` (line 400)                 | → `config/prompt-defaults/ai_ask_v1.md` |
| `core-engine/test/unit/engines/template-resolver.test.ts`      | `config/templates/default/ai_ask_v1.md` (line 128)                 | → `config/prompt-defaults/ai_ask_v1.md` |
| `api-server/src/routes/projects.ts`                            | `../../../../config/templates/default` (lines 194, 920)            | → `../../../../config/prompt-defaults`  |
| `api-server/src/services/project-initializer.ts`               | `config/templates` (line 54)                                       | → `config/prompt-defaults`              |
| `scripts/db/import-ai-ask-exit-project.ts`                     | `config/templates/default` (line 150)                              | → `config/prompt-defaults`              |

> **Note**: Database virtual path `_system/config/default/` is a naming contract and is **NOT** affected by this filesystem rename.

### Schema & migration

| File                             | Change                                          |
| -------------------------------- | ----------------------------------------------- |
| `api-server/src/db/schema.ts`    | Add `user_global_variables` table definition    |
| `api-server/drizzle/migrations/` | New migration for `user_global_variables` table |

### Runtime

| File                                                                  | Change                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `api-server/src/routes/projects.ts`                                   | Copy `global.yaml` from `project-defaults/` instead of hardcoding empty           |
| `api-server/src/services/session-manager.ts`                          | Extend `loadGlobalVariables()` with user-value lookup and `defaultValue` fallback |
| `core-engine/src/engines/variable-scope/variable-scope-resolver.ts`   | Add `onGlobalVariableChange` callback, invoke on global-scope writes              |
| `core-engine/src/domain/actions/ai-ask-action.ts`                     | In `registerOutputVariables()`, check global registry before defaulting to TOPIC  |
| `core-engine/src/application/usecases/session-application-service.ts` | Register global variable definitions in resolver; inject persistence callback     |
| `shared-types/src/domain/variable.ts`                                 | Add `GlobalVariableDefinition` and `OnGlobalVariableChange` types                 |

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
- Unit: `registerOutputVariables()` uses global scope for registered variables (ai-ask-action)
- Unit: `setGlobalVariableNames()` / `isGlobalVariable()` in resolver
- Integration: Session init with existing `user_global_variables` record
- Integration: Session init without existing record (first-time user)
- Integration: Variable write during session persists to `user_global_variables`
- Integration: Cross-session value retention (second session uses stored value)
- E2E: New project creation copies `global.yaml` from `project-defaults/`
