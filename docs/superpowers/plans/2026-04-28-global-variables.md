# Global Variables System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a per-project global variable definition system with per-user persistence, where variables defined in `global.yaml` are substituted in all script contexts and persisted to `user_global_variables` table.

**Architecture:** Extend existing four-tier variable scope (topic > phase > session > global). Definitions in project's `global.yaml` dictate scope: variables listed there get global scope and trigger DB persistence on write. A callback pattern decouples core-engine (no DB) from api-server (DB access), injected via `executionState.metadata`.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest

---

## File Map

| File                                                                | Responsibility                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `shared-types/src/domain/variable.ts`                               | `GlobalVariableDefinition` and `OnGlobalVariableChange` types                     |
| `config/prompt-defaults/` (renamed)                                 | Runtime prompt template files                                                     |
| `config/project-defaults/global.yaml` (new)                         | Default global variable definitions                                               |
| `api-server/src/db/schema.ts`                                       | `user_global_variables` table definition                                          |
| `api-server/drizzle/`                                               | New migration SQL                                                                 |
| `core-engine/src/engines/variable-scope/variable-scope-resolver.ts` | `globalVariableNames` set, `onGlobalVariableChange` callback, value-change guard  |
| `core-engine/src/engines/script-execution/script-executor.ts`       | Configure resolver from metadata                                                  |
| `core-engine/src/domain/actions/ai-ask-action.ts`                   | Check global registry in `registerOutputVariables()`                              |
| `api-server/src/services/session-manager.ts`                        | Extended `loadGlobalVariables()`, fix `variableStore.global` gap, inject callback |
| `api-server/src/routes/projects.ts`                                 | Copy global.yaml from `project-defaults/`, update template paths                  |
| `api-server/src/services/project-initializer.ts`                    | Update template path reference                                                    |
| `core-engine/src/engines/prompt-template/template-resolver.ts`      | Update path reference                                                             |
| `core-engine/src/domain/actions/base-action.ts`                     | Update path reference                                                             |
| Various test files                                                  | Unit and integration tests                                                        |

---

### Task 1: Add shared types

**Files:**

- Modify: `packages/shared-types/src/domain/variable.ts`
- Modify: `packages/shared-types/src/enums.ts` (check if VariableScope enum exists)

- [ ] **Step 1: Add types to `variable.ts`**

Read `packages/shared-types/src/domain/variable.ts` to find the insertion point (near other type exports). Add these types:

```typescript
/** Variable definition from global.yaml */
export interface GlobalVariableDefinition {
  name: string;
  define?: string;
  defaultValue?: unknown;
}

/** Callback invoked when a global-scope variable value changes */
export type OnGlobalVariableChange = (name: string, value: unknown) => void | Promise<void>;
```

- [ ] **Step 2: Verify types export from shared-types barrel**

Read `packages/shared-types/src/index.ts` and confirm `domain/variable.ts` is already re-exported. If not, add the export.

- [ ] **Step 3: Build and typecheck shared-types**

```bash
pnpm --filter @heartrule/shared-types typecheck
```

Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared-types/src/domain/variable.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add GlobalVariableDefinition and OnGlobalVariableChange types"
```

---

### Task 2: Restructure config directories

**Files:**

- Rename: `config/templates/default/` → `config/prompt-defaults/`
- Create: `config/project-defaults/global.yaml`

- [ ] **Step 1: Rename the directory**

```bash
mv config/templates/default config/prompt-defaults
rmdir config/templates 2>/dev/null || true
```

Expected: `config/prompt-defaults/` exists with the 4 `.md` files.

- [ ] **Step 2: Create `config/project-defaults/` directory and `global.yaml`**

```bash
mkdir -p config/project-defaults
```

Write `config/project-defaults/global.yaml`:

```yaml
variables:
  - name: 来访者名
    define: 来访者的称呼，通常从用户首次对话中自我介绍的姓名/昵称中获取
    defaultValue: 来访者
  - name: 咨询师名
    define: 咨询师在对话中的自称，用于建立专业关系
    defaultValue: 咨询师
```

- [ ] **Step 3: Commit**

```bash
git add config/prompt-defaults/ config/project-defaults/ config/templates/
git commit -m "refactor(config): rename templates/default to prompt-defaults, add project-defaults/global.yaml"
```

---

### Task 3: Add user_global_variables table to Drizzle schema

**Files:**

- Modify: `packages/api-server/src/db/schema.ts`

- [ ] **Step 1: Add table definition**

Read `packages/api-server/src/db/schema.ts` to find the end of table definitions (before any index/relation definitions). Add after the last table:

```typescript
/**
 * User-level global variable persistence
 * Stores per-user-per-project global variable values across sessions
 */
export const userGlobalVariables = pgTable(
  'user_global_variables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    variables: jsonb('variables').notNull().default({}),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    userProjectUnique: uniqueIndex('user_project_unique').on(table.userId, table.projectId),
  })
);
```

Note: import `uniqueIndex` from `drizzle-orm/pg-core` if not already imported (check line 1 of schema.ts).

- [ ] **Step 2: Typecheck api-server**

```bash
pnpm --filter @heartrule/api-server typecheck
```

Expected: PASS or a constraint name warning (may need to adjust index name format).

- [ ] **Step 3: Commit**

```bash
git add packages/api-server/src/db/schema.ts
git commit -m "feat(db): add user_global_variables table for per-user global variable persistence"
```

---

### Task 4: Create database migration

**Files:**

- Create: `packages/api-server/drizzle/XXXX_user_global_variables.sql`

- [ ] **Step 1: Generate migration**

```bash
npx drizzle-kit generate --config packages/api-server/drizzle.config.ts
```

If this fails, create the migration manually. Check the last migration number in `packages/api-server/drizzle/`:

```bash
ls packages/api-server/drizzle/*.sql | sort | tail -1
```

Create the next migration file, e.g., `0004_user_global_variables.sql`:

```sql
CREATE TABLE user_global_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    variables JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX user_project_unique ON user_global_variables(user_id, project_id);
```

- [ ] **Step 2: Run migration**

```bash
pnpm --filter @heartrule/api-server db:migrate
```

Expected: Migration applied successfully.

- [ ] **Step 3: Verify table exists**

```bash
psql -h localhost -U postgres -d heartrule -c "\d user_global_variables"
```

Expected: Table definition shown.

- [ ] **Step 4: Commit**

```bash
git add packages/api-server/drizzle/
git commit -m "feat(db): add user_global_variables migration"
```

---

### Task 5: Extend VariableScopeResolver with global variable support

**Files:**

- Modify: `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`

- [ ] **Step 1: Add new properties**

Read the file. Find the constructor and the property declarations (around line 40-55). Add two new properties:

```typescript
/** Variable names that should be treated as global scope */
public globalVariableNames: Set<string> = new Set();

/** Callback invoked when a global scope variable changes */
public onGlobalVariableChange: OnGlobalVariableChange | null = null;
```

Import `OnGlobalVariableChange` from shared-types:

```typescript
import type { OnGlobalVariableChange } from '@heartrule/shared-types';
```

- [ ] **Step 2: Add `isGlobalVariable()` method**

Add after the existing `getVariableDefinition()` method (around line 178):

```typescript
/** Check if a variable name is registered as global scope */
public isGlobalVariable(varName: string): boolean {
  return this.globalVariableNames.has(varName);
}
```

- [ ] **Step 3: Override `determineScope()` to check global registry**

The current `determineScope()` (around line 95-107) already checks `variableDefinitions` and falls back to TOPIC. We need to ensure definitions for global variables are registered. Since `globalVariableNames` is populated at init, we should register them as definitions too for consistency. Add this logic in a new method:

```typescript
/** Pre-register global variable names as definitions with GLOBAL scope */
public registerGlobalVariables(names: string[]): void {
  for (const name of names) {
    this.globalVariableNames.add(name);
    if (!this.variableDefinitions.has(name)) {
      this.setVariableDefinition({
        name,
        scope: 'global' as VariableScope,
        define: `Global variable: ${name}`,
      });
    }
  }
}
```

- [ ] **Step 4: Add value-change guard in `setVariable()`**

In `setVariable()` (around line 250), before creating the `VariableValue` for global scope, add a guard:

In the `case 'global':` block (around line 314-319), change from:

```typescript
case 'global':
  this.variableStore.global[varName] = variableValue;
  logger.debug(`✅ Set variable "${varName}" in global scope`, { value });
  break;
```

To:

```typescript
case 'global': {
  // Value-change guard: skip if value unchanged
  const existingValue = this.variableStore.global[varName]?.value;
  if (existingValue === value) {
    logger.debug(`⏭️ Skipped duplicate global write for "${varName}": value unchanged`);
    return;
  }
  this.variableStore.global[varName] = variableValue;
  logger.debug(`✅ Set variable "${varName}" in global scope`, { value });

  // Trigger persistence callback
  if (this.onGlobalVariableChange) {
    try {
      void this.onGlobalVariableChange(varName, value);
    } catch (error: any) {
      logger.error(`❌ onGlobalVariableChange callback failed for "${varName}":`, error.message);
    }
  }
  break;
}
```

- [ ] **Step 5: Typecheck core-engine**

```bash
pnpm --filter @heartrule/core-engine typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts
git commit -m "feat(core-engine): add global variable support to VariableScopeResolver"
```

---

### Task 6: Configure resolver from execution metadata in ScriptExecutor

**Files:**

- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts`

- [ ] **Step 1: Find all `new VariableScopeResolver()` sites**

There are 4 instantiation sites:

- Line 232: `updateVariablesWithScope()`
- Line 967: `processExtractedVariables()`
- Line 1031: `executeAction()`
- Line ~1069: `continueAction()` (check exact line)

- [ ] **Step 2: Create a helper method to configure resolver**

Add a private method to the ScriptExecutor class (before `executeAction`):

```typescript
/** Configure VariableScopeResolver with global variable settings from metadata */
private configureScopeResolver(scopeResolver: VariableScopeResolver, executionState: ExecutionState): void {
  const metadata = executionState.metadata as any;
  const globalNames: string[] | undefined = metadata.globalVariableDefinitions?.map(
    (d: any) => d.name
  );
  if (globalNames && globalNames.length > 0) {
    scopeResolver.registerGlobalVariables(globalNames);
    logger.debug('🌐 Registered global variable names:', globalNames);
  }
  if (metadata.globalVariableCallback) {
    scopeResolver.onGlobalVariableChange = metadata.globalVariableCallback;
    logger.debug('🔗 Registered global variable change callback');
  }
}
```

- [ ] **Step 3: Call `configureScopeResolver()` at each instantiation site**

After each `const scopeResolver = new VariableScopeResolver(...)` line, add:

```typescript
this.configureScopeResolver(scopeResolver, executionState);
```

This applies to all 4 sites. Check the `continueAction` method — it may have a similar pattern.

- [ ] **Step 4: Typecheck and run existing tests**

```bash
pnpm --filter @heartrule/core-engine typecheck
pnpm --filter @heartrule/core-engine test -- test/unit/engines/variable-scope-resolver
pnpm --filter @heartrule/core-engine test -- test/unit/phase7-variable-scope-resolver
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/engines/script-execution/script-executor.ts
git commit -m "feat(core-engine): configure VariableScopeResolver from execution metadata"
```

---

### Task 7: Extend SessionManager with user persistence and variableStore.global population

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

- [ ] **Step 1: Read the current file structure**

Identify these methods in the file:

- `loadGlobalVariables()` (around line 880)
- `createInitialExecutionState()` (around line 446)
- `initializeSession()` (around line 939)
- `restoreExecutionState()` (around line 488)
- `processUserInput()` (around line 1009)

- [ ] **Step 2: Extend `loadGlobalVariables()` to return definitions and query user_global_variables**

Replace the current method body (lines 880-933). The new method reads `global.yaml` definitions, queries `user_global_variables` for stored user values, resolves values (stored value > defaultValue), and returns both:

```typescript
private async loadGlobalVariables(
  scriptName: string,
  userId: string
): Promise<{
  values: Record<string, any>;
  definitions: Array<{ name: string; define?: string; defaultValue?: unknown }>;
}> {
  try {
    // 查找包含该脚本文件的项目
    const sessionFile = await db.query.scriptFiles.findFirst({
      where: eq(scriptFiles.fileName, scriptName),
    });

    if (!sessionFile) {
      return { values: {}, definitions: [] };
    }

    // 查找该项目的 global.yaml 文件
    const globalFile = await db.query.scriptFiles.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.projectId, sessionFile.projectId), eq(fields.fileType, 'global')),
    });

    if (!globalFile) {
      return { values: {}, definitions: [] };
    }

    // 解析变量定义
    const definitions: Array<{ name: string; define?: string; defaultValue?: unknown }> = [];

    if (globalFile.yamlContent) {
      const parsed = yaml.parse(globalFile.yamlContent);
      if (parsed && parsed.variables && Array.isArray(parsed.variables)) {
        for (const varDef of parsed.variables) {
          if (varDef.name) {
            definitions.push({
              name: varDef.name,
              define: varDef.define,
              defaultValue: varDef.defaultValue,
            });
          }
        }
      }
    } else if (globalFile.fileContent) {
      const content = globalFile.fileContent as any;
      if (content.variables && Array.isArray(content.variables)) {
        for (const varDef of content.variables) {
          if (varDef.name) {
            definitions.push({
              name: varDef.name,
              define: varDef.define,
              defaultValue: varDef.defaultValue,
            });
          }
        }
      }
    }

    // 查询用户已存储的全局变量值
    let storedValues: Record<string, any> = {};
    if (userId && sessionFile.projectId) {
      const userVars = await db.query.userGlobalVariables.findFirst({
        where: (fields, { and, eq }) =>
          and(
            eq(fields.userId, userId),
            eq(fields.projectId, sessionFile.projectId)
          ),
      });
      if (userVars?.variables) {
        storedValues = userVars.variables as Record<string, any>;
      }
    }

    // 解析最终值：已存值 > defaultValue
    const values: Record<string, any> = {};
    for (const def of definitions) {
      if (def.name in storedValues) {
        values[def.name] = storedValues[def.name];
      } else if (def.defaultValue !== undefined) {
        values[def.name] = def.defaultValue;
      }
    }

    logger.debug('📋 Loaded global variables from global.yaml:', Object.keys(values));
    logger.debug('📋 Global variable definitions:', definitions.length);

    return { values, definitions };
  } catch (error) {
    logger.error('❌ Error loading global variables:', error);
    return { values: {}, definitions: [] };
  }
}
```

Also add the import for `userGlobalVariables` at the top:

```typescript
import { ..., userGlobalVariables } from '../db/schema.js';
```

- [ ] **Step 3: Fix `createInitialExecutionState()` — populate `variableStore.global`**

In `createInitialExecutionState()`, after the existing `executionState.variables = { ... }` line (around line 453), add population of `variableStore.global`:

```typescript
// Populate variableStore.global with loaded global variables
if (executionState.variableStore) {
  if (!executionState.variableStore.global) executionState.variableStore.global = {};
  for (const [key, value] of Object.entries(globalVariables)) {
    executionState.variableStore.global[key] = {
      value,
      type: typeof value,
      source: 'global_init',
      lastUpdated: new Date().toISOString(),
      scope: VariableScope.GLOBAL,
    };
  }
}
```

Import `VariableScope` at the top of the file (check if already imported; if not, add):

```typescript
import { VariableScope } from '@heartrule/shared-types';
```

- [ ] **Step 4: Update `initializeSession()` to call new `loadGlobalVariables` signature**

In `initializeSession()` (around line 948), change:

```typescript
const globalVariables = await this.loadGlobalVariables(script.scriptName);
```

To:

```typescript
const { values: globalVariables, definitions: globalVariableDefinitions } =
  await this.loadGlobalVariables(script.scriptName, session.userId);
```

Then after `createInitialExecutionState()` call, add callback injection:

```typescript
// Inject global variable persistence callback and definitions into metadata
executionState.metadata.globalVariableDefinitions = globalVariableDefinitions;
executionState.metadata.globalVariableCallback = async (name: string, value: unknown) => {
  try {
    const existing = await db.query.userGlobalVariables.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.userId, session.userId), eq(fields.projectId, script.projectId)),
    });

    const merged = {
      ...((existing?.variables as Record<string, unknown>) || {}),
      [name]: value,
    };

    if (existing) {
      await db
        .update(userGlobalVariables)
        .set({ variables: merged, updatedAt: new Date() })
        .where(
          and(
            eq(userGlobalVariables.userId, session.userId),
            eq(userGlobalVariables.projectId, script.projectId)
          )
        );
    } else {
      await db.insert(userGlobalVariables).values({
        userId: session.userId,
        projectId: script.projectId,
        variables: { [name]: value },
      });
    }
  } catch (err: any) {
    console.error(`[SessionManager] Failed to persist global variable "${name}":`, err.message);
  }
};
```

Note: Import `and`, `eq` from `drizzle-orm` (already imported in the file).

- [ ] **Step 5: Update `processUserInput()` similarly**

`processUserInput()` (around line 1018) also calls `loadGlobalVariables()`. Update the call signature to match the new return type:

```typescript
const { values: globalVariables } = await this.loadGlobalVariables(
  script.scriptName,
  session.userId
);
```

Do NOT inject callbacks here — they were already set during `initializeSession()` and persist in `executionState.metadata`. Only `initializeSession()` injects callbacks (once per session lifecycle).

- [ ] **Step 6: Typecheck api-server**

```bash
pnpm --filter @heartrule/api-server typecheck
```

Expected: Fix any type errors. The `onConflictDoUpdate` signature may differ slightly per Drizzle version.

- [ ] **Step 7: Commit**

```bash
git add packages/api-server/src/services/session-manager.ts
git commit -m "feat(api-server): extend loadGlobalVariables with user persistence and variableStore population"
```

---

### Task 8: Update project creation to use new paths and default global.yaml

**Files:**

- Modify: `packages/api-server/src/routes/projects.ts`
- Modify: `packages/api-server/src/services/project-initializer.ts`

- [ ] **Step 1: Update `projects.ts` — template copy path**

In the `POST /projects` handler (around line 194), change:

```typescript
const systemTemplatesPath = path.resolve(__dirname, '../../../../config/templates/default');
```

To:

```typescript
const systemTemplatesPath = path.resolve(__dirname, '../../../../config/prompt-defaults');
```

- [ ] **Step 2: Update `projects.ts` — `global.yaml` initialization**

At line 169, change the hardcoded `global.yaml` from:

```typescript
{ fileType: 'global', fileName: 'global.yaml', fileContent: { variables: [] } },
```

To reading from `config/project-defaults/global.yaml`:

```typescript
// Read default global.yaml from project-defaults
const globalYamlPath = path.resolve(__dirname, '../../../../config/project-defaults/global.yaml');
let globalContent: any = { variables: [] };
try {
  const yamlContent = await fs.readFile(globalYamlPath, 'utf-8');
  const parsed = yaml.parse(yamlContent);
  globalContent = parsed;
  // Also store raw yaml for later editing
  defaultFiles.push({
    fileType: 'global',
    fileName: 'global.yaml',
    fileContent: parsed,
    yamlContent: yamlContent,
  });
  // Skip the hardcoded one
  defaultFiles.splice(0, 1); // Remove first element (the old hardcoded global)
} catch {
  // Fallback to hardcoded
}
```

Actually, simplify: just replace the line:

```typescript
// Read default global.yaml from project-defaults
let globalVars: any = { variables: [] };
try {
  const globalYamlPath = path.resolve(__dirname, '../../../../config/project-defaults/global.yaml');
  const yamlContent = await fs.readFile(globalYamlPath, 'utf-8');
  globalVars = yaml.parse(yamlContent);
} catch {
  globalVars = { variables: [] };
}

const defaultFiles = [
  { fileType: 'global', fileName: 'global.yaml', fileContent: globalVars },
  { fileType: 'roles', fileName: 'roles.yaml', fileContent: { roles: [] } },
  { fileType: 'skills', fileName: 'skills.yaml', fileContent: { skills: [] } },
];
```

- [ ] **Step 3: Update `projects.ts` — auto-create template path (second reference)**

At line 917-920, change:

```typescript
const templatePath = path.resolve(__dirname, '../../../../config/templates/default', templateName);
```

To:

```typescript
const templatePath = path.resolve(__dirname, '../../../../config/prompt-defaults', templateName);
```

- [ ] **Step 4: Update `project-initializer.ts` — template path**

At line 54 (constructor), the `this.systemTemplatesPath` is set. Find where it's initialized and update. Check lines around 40-55 for:

```typescript
this.systemTemplatesPath = path.join(projectRoot, 'config/templates');
```

Or similar. Change `'config/templates'` to `'config/prompt-defaults'`.

Then in `importDefaultTemplates()` (line 114), the `default` subdirectory is joined:

```typescript
const defaultTemplatePath = path.join(this.systemTemplatesPath, 'default');
```

Since we renamed `config/templates/default` to `config/prompt-defaults`, remove the `'default'` subdirectory join:

```typescript
const defaultTemplatePath = this.systemTemplatesPath;
```

- [ ] **Step 5: Update all remaining path references** (see Task 10 for full list)

Files to update (one commit group):

- `core-engine/src/engines/prompt-template/template-resolver.ts` lines 149, 160: `'config/templates/default'` → `'config/prompt-defaults'`
- `core-engine/src/domain/actions/base-action.ts` lines 301, 303, 305: `'config/templates'` → `'config/prompt-defaults'`
- `core-engine/test/unit/template-validation.test.ts` line 400: `'config/templates/default/ai_ask_v1.md'` → `'config/prompt-defaults/ai_ask_v1.md'`
- `core-engine/test/unit/engines/template-resolver.test.ts` line 128: `'config/templates/default/ai_ask_v1.md'` → `'config/prompt-defaults/ai_ask_v1.md'`
- `scripts/db/import-ai-ask-exit-project.ts` line 150: `'config/templates/default'` → `'config/prompt-defaults'`

- [ ] **Step 6: Typecheck and test**

```bash
pnpm typecheck
pnpm --filter @heartrule/core-engine test
```

Expected: All typechecks and tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/api-server/src/routes/projects.ts packages/api-server/src/services/project-initializer.ts
git add packages/core-engine/src/engines/prompt-template/template-resolver.ts
git add packages/core-engine/src/domain/actions/base-action.ts
git add packages/core-engine/test/unit/template-validation.test.ts
git add packages/core-engine/test/unit/engines/template-resolver.test.ts
git add scripts/db/import-ai-ask-exit-project.ts
git commit -m "refactor: rename config/templates/default to config/prompt-defaults across all references"
```

---

### Task 9: Check global registry in ai-ask-action registerOutputVariables

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

- [ ] **Step 1: Update `registerOutputVariables()`**

In `registerOutputVariables()` (around line 797), currently all undefiled variables default to TOPIC scope. Add a check for the global registry:

After the check `if (!existingDef)` (line 808), change the scope assignment from hardcoded `VariableScope.TOPIC` to:

```typescript
if (!existingDef) {
  // Check if this variable is registered as global
  const scope = context.scopeResolver?.isGlobalVariable(varName)
    ? VariableScope.GLOBAL
    : VariableScope.TOPIC;

  context.scopeResolver!.setVariableDefinition({
    name: varName,
    scope,
    define: varConfig.define || `Auto-registered from ai_ask output: ${varName}`,
  });
  logger.info(`✅ Auto-registered variable "${varName}" in ${scope} scope`);
}
```

- [ ] **Step 2: Typecheck core-engine**

```bash
pnpm --filter @heartrule/core-engine typecheck
```

Expected: PASS.

- [ ] **Step 3: Run existing ai-ask tests**

```bash
pnpm --filter @heartrule/core-engine test -- -t "ai.ask|AiAsk|ai_ask"
```

Expected: All PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "feat(core-engine): check global registry in ai_ask registerOutputVariables"
```

---

### Task 10: Write unit tests for VariableScopeResolver changes

**Files:**

- Modify: `packages/core-engine/test/unit/engines/variable-scope-resolver.test.ts`

- [ ] **Step 1: Add test for `isGlobalVariable()` and `registerGlobalVariables()`**

Append to the test file:

```typescript
describe('Global variable support', () => {
  it('should register global variable names', () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);
    resolver.registerGlobalVariables(['来访者名', '咨询师名']);

    expect(resolver.isGlobalVariable('来访者名')).toBe(true);
    expect(resolver.isGlobalVariable('咨询师名')).toBe(true);
    expect(resolver.isGlobalVariable('未知变量')).toBe(false);
  });

  it('should register definitions with GLOBAL scope for global variables', () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);
    resolver.registerGlobalVariables(['来访者名']);

    const def = resolver.getVariableDefinition('来访者名');
    expect(def).not.toBeNull();
    expect(def!.scope).toBe('global');
  });

  it('determineScope should return global for registered names', () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);
    resolver.registerGlobalVariables(['来访者名']);

    expect(resolver.determineScope('来访者名')).toBe('global');
    expect(resolver.determineScope('未知变量')).toBe('topic');
  });

  it('should invoke onGlobalVariableChange callback on global write', async () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);
    resolver.registerGlobalVariables(['来访者名']);

    let callbackCalled = false;
    let callbackName = '';
    let callbackValue = '';

    resolver.onGlobalVariableChange = async (name, value) => {
      callbackCalled = true;
      callbackName = name;
      callbackValue = value as string;
    };

    resolver.setVariable('来访者名', '小明', 'global', {
      phaseId: 'p1',
      topicId: 't1',
      actionId: 'a1',
    });

    expect(callbackCalled).toBe(true);
    expect(callbackName).toBe('来访者名');
    expect(callbackValue).toBe('小明');
  });

  it('should skip callback when global variable value unchanged', async () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);
    resolver.registerGlobalVariables(['来访者名']);

    let callbackCount = 0;
    resolver.onGlobalVariableChange = async () => {
      callbackCount++;
    };

    const pos = { phaseId: 'p1', topicId: 't1', actionId: 'a1' };

    // First write
    resolver.setVariable('来访者名', '小明', 'global', pos);
    expect(callbackCount).toBe(1);

    // Second write with same value
    resolver.setVariable('来访者名', '小明', 'global', pos);
    expect(callbackCount).toBe(1); // Skipped

    // Third write with different value
    resolver.setVariable('来访者名', '小红', 'global', pos);
    expect(callbackCount).toBe(2);
  });

  it('should not invoke callback for topic-scope writes', async () => {
    const variableStore = createEmptyStore();
    const resolver = new VariableScopeResolver(variableStore);

    let callbackCalled = false;
    resolver.onGlobalVariableChange = async () => {
      callbackCalled = true;
    };

    resolver.setVariable('普通变量', 'test', 'topic', {
      phaseId: 'p1',
      topicId: 't1',
      actionId: 'a1',
    });

    expect(callbackCalled).toBe(false);
  });
});

function createEmptyStore(): VariableStore {
  return {
    global: {},
    session: {},
    phase: {},
    topic: {},
  };
}
```

Add import at top:

```typescript
import type { VariableStore } from '@heartrule/shared-types';
```

(Check if already imported; add if needed.)

- [ ] **Step 2: Run new tests**

```bash
pnpm --filter @heartrule/core-engine test -- test/unit/engines/variable-scope-resolver.test.ts
```

Expected: All tests PASS, including new test block.

- [ ] **Step 3: Run full test suite to check for regressions**

```bash
pnpm --filter @heartrule/core-engine test
```

Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core-engine/test/unit/engines/variable-scope-resolver.test.ts
git commit -m "test(core-engine): add tests for global variable support in resolver"
```

---

### Task 11: Run full verification

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: All packages PASS.

- [ ] **Step 2: Full lint**

```bash
pnpm lint
```

Expected: No errors (fix any if found).

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: All tests PASS.

- [ ] **Step 4: Verify project creation copies global.yaml**

```bash
# Start dev services
pnpm docker:dev
pnpm --filter @heartrule/api-server db:migrate
pnpm dev

# Create a project via API (manual or script)
# curl -X POST http://localhost:8000/api/projects \
#   -H "Content-Type: application/json" \
#   -d '{"projectName":"Test Global Vars","template":"blank","author":"test"}'
#
# Then check script_files table:
# psql -h localhost -U postgres -d heartrule -c \
#   "SELECT file_name, file_content FROM script_files WHERE file_type='global' AND file_name='global.yaml';"
```

Expected: The `file_content` should contain `variables` with `来访者名` and `咨询师名` (not empty array).

- [ ] **Step 5: Commit any remaining changes and verify git status**

```bash
git status
```

Expected: Clean working tree.

---

## Verification Checklist

- [ ] `config/prompt-defaults/` exists with 4 `.md` files
- [ ] `config/project-defaults/global.yaml` exists
- [ ] All `config/templates/default` references updated to `config/prompt-defaults`
- [ ] `user_global_variables` table exists in DB
- [ ] `loadGlobalVariables()` returns `{ values, definitions }`
- [ ] `createInitialExecutionState` populates `variableStore.global`
- [ ] `VariableScopeResolver.isGlobalVariable()` works
- [ ] `setVariable(global)` triggers callback only on value change
- [ ] `registerOutputVariables()` uses global scope for registered names
- [ ] New projects get `global.yaml` with predefined variables (not empty)
- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test` passes for all packages
