# Variable Bubble Inline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline variable value editing to the debug panel's VariableBubble component. When the LLM mis-extracts a variable, users can correct it directly from the UI. Global variable edits persist to `user_global_variables` for cross-session retention.

**Architecture:** New `PATCH /api/sessions/:id/variables` endpoint writes directly to `variableStore` in `sessions.metadata` and `sessions.variables`. For global scope, also upserts `user_global_variables`. Frontend uses optimistic updates via `onVariableEdit` callback — parent state updates immediately, API call happens in background, revert on failure. Hover-to-reveal pencil icon with inline `<Input>` editing.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, Ant Design, React 18

---

## File Map

| File                                                           | Responsibility                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| `api-server/src/routes/sessions.ts`                            | `PATCH /api/sessions/:id/variables` route with session guard |
| `api-server/src/services/session-manager.ts`                   | `updateVariable()` method, `getScriptTags()` helper          |
| `script-editor/src/api/debug.ts`                               | `debugApi.updateVariable()` typed API client                 |
| `script-editor/src/types/debug.ts`                             | `sessionId?: string` on `VariableBubbleContent`              |
| `script-editor/src/components/DebugBubbles/VariableBubble.tsx` | Inline editing UI: hover icon, Input, save/cancel, feedback  |
| `script-editor/src/components/DebugChatPanel/index.tsx`        | Pass `sessionId` + `onVariableEdit` callback                 |

---

### Task 1: Add SessionManager.updateVariable() service method

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

- [ ] **Step 1: Add imports**

Read the file to verify imports. The method uses `and`, `eq` from `drizzle-orm` (already imported), `userGlobalVariables` from schema (already imported), and the `scripts` table for `getScriptTags()`.

- [ ] **Step 2: Add `updateVariable()` method**

Insert after `processUserInput()` (before the closing `}` of the class). The method:

1. Reads `session.metadata.variableStore` (existing hierarchical structure)
2. Builds a `VariableValue` wrapper with `value`, `type`, `lastUpdated`, `source: 'manual_edit'`, `scope`, and appends previous value to `history[]` if it existed
3. Writes into `variableStore[scope][...]` — for `phase`/`topic`, uses `phaseId`/`topicId` as sub-keys; for `global`/`session`, direct key
4. Updates flat `session.variables` jsonb column
5. For global scope: persists to `user_global_variables` via UPSERT pattern (same as `globalVariableCallback`)
6. Updates `sessions` table: `variables` + `metadata.variableStore`
7. Returns `{ variableName, scope, value, updatedAt }`

```typescript
async updateVariable(
  session: SessionData,
  params: {
    variableName: string;
    scope: string;
    value: unknown;
    phaseId?: string;
    topicId?: string;
  }
): Promise<{ variableName: string; scope: string; value: unknown; updatedAt: string }> {
  const { variableName, scope, value, phaseId, topicId } = params;
  const now = new Date().toISOString();
  const metadata = (session.metadata as Record<string, any>) || {};
  const variableStore = metadata.variableStore || { global: {}, session: {}, phase: {}, topic: {} };

  // Build VariableValue wrapper with history
  const previousValue =
    scope === 'global' || scope === 'session'
      ? variableStore[scope]?.[variableName]
      : variableStore[scope]?.[scope === 'phase' ? (phaseId || '') : (topicId || '')]?.[variableName];

  const history = previousValue?.history || [];
  if (previousValue?.value !== undefined) {
    history.push({
      value: previousValue.value,
      type: previousValue.type,
      lastUpdated: previousValue.lastUpdated,
      source: previousValue.source,
    });
  }

  const variableWrapper = {
    value,
    type: typeof value,
    lastUpdated: now,
    source: 'manual_edit',
    scope,
    history,
  };

  // Write into variableStore at correct level
  if (scope === 'global' || scope === 'session') {
    if (!variableStore[scope]) variableStore[scope] = {};
    variableStore[scope][variableName] = variableWrapper;
  } else if (scope === 'phase' && phaseId) {
    if (!variableStore.phase) variableStore.phase = {};
    if (!variableStore.phase[phaseId]) variableStore.phase[phaseId] = {};
    variableStore.phase[phaseId][variableName] = variableWrapper;
  } else if (scope === 'topic' && topicId) {
    if (!variableStore.topic) variableStore.topic = {};
    if (!variableStore.topic[topicId]) variableStore.topic[topicId] = {};
    variableStore.topic[topicId][variableName] = variableWrapper;
  }

  // Update flat variables
  const flatVariables = {
    ...((session.variables as Record<string, unknown>) || {}),
    [variableName]: value,
  };

  // Global scope: persist to user_global_variables
  if (scope === 'global') {
    try {
      const tags = (await this.getScriptTags(session.scriptId)) || [];
      const projectTag = tags.find((tag: string) => tag.startsWith('project:'));
      const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

      if (projectId) {
        const existing = await db.query.userGlobalVariables.findFirst({
          where: (fields, { and: andFn, eq: eqFn }) =>
            andFn(eqFn(fields.userId, session.userId), eqFn(fields.projectId, projectId)),
        });
        const merged = {
          ...((existing?.variables as Record<string, unknown>) || {}),
          [variableName]: value,
        };
        if (existing) {
          await db
            .update(userGlobalVariables)
            .set({ variables: merged, updatedAt: new Date() })
            .where(
              and(eq(userGlobalVariables.userId, session.userId), eq(userGlobalVariables.projectId, projectId))
            );
        } else {
          await db.insert(userGlobalVariables).values({
            userId: session.userId, projectId, variables: { [variableName]: value },
          });
        }
      }
    } catch (err: any) {
      logger.error(`[updateVariable] Failed to persist global "${variableName}":`, err.message);
    }
  }

  // Update sessions table
  await db
    .update(sessions)
    .set({ variables: flatVariables, metadata: { ...metadata, variableStore }, updatedAt: new Date() })
    .where(eq(sessions.id, session.id));

  return { variableName, scope, value, updatedAt: now };
}
```

- [ ] **Step 3: Add `getScriptTags()` helper**

Add a private helper to fetch script tags:

```typescript
private async getScriptTags(scriptId: string): Promise<string[]> {
  const script = await db.query.scripts.findFirst({
    where: eq(scripts.id, scriptId),
  });
  return (script?.tags as string[]) || [];
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @heartrule/api-server typecheck
```

Expected: PASS.

---

### Task 2: Add PATCH /api/sessions/:id/variables endpoint

**Files:**

- Modify: `packages/api-server/src/routes/sessions.ts`

- [ ] **Step 1: Add route after GET /api/sessions/:id/variables**

Insert the PATCH route between the GET variables route (ends ~line 628) and the GET user sessions route. Structure:

```typescript
app.patch('/api/sessions/:id/variables', { schema: { ... } }, async (request, reply) => {
  // 1. Load session, verify exists
  // 2. Guard: reject if executionStatus is completed/error (reuse SESSION_ENDED pattern)
  // 3. Call sessionManager.updateVariable(session, params)
  // 4. Return { success: true, ...result }
});
```

The body schema requires `variableName` (string), `scope` (enum: global/session/phase/topic), `value` (any), and optional `phaseId`/`topicId`.

- [ ] **Step 2: Reuse existing session guard pattern**

Use the same `ExecutionStatus.COMPLETED` / `ExecutionStatus.ERROR` check and `ErrorCode.SESSION_ENDED` from the POST messages route (already imported).

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @heartrule/api-server typecheck
```

Expected: PASS.

---

### Task 3: Add debugApi.updateVariable() frontend API client

**Files:**

- Modify: `packages/script-editor/src/api/debug.ts`

- [ ] **Step 1: Add method to `debugApi` object**

Insert before `importScript`:

```typescript
async updateVariable(
  sessionId: string,
  data: {
    variableName: string;
    scope: string;
    value: unknown;
    phaseId?: string;
    topicId?: string;
  }
) {
  const response = await axios.patch<{
    success: boolean;
    variableName: string;
    scope: string;
    value: unknown;
    updatedAt: string;
  }>(`${API_BASE_URL}/sessions/${sessionId}/variables`, data, {
    timeout: 10000,
  });
  return response.data;
},
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

Expected: PASS.

---

### Task 4: Add types

**Files:**

- Modify: `packages/script-editor/src/types/debug.ts`

- [ ] **Step 1: Add `sessionId` to `VariableBubbleContent`**

Add `sessionId?: string;` after the `type: 'variable';` line.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

Expected: PASS.

---

### Task 5: Implement VariableBubble inline editing UI

**Files:**

- Modify: `packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx`

- [ ] **Step 1: Add imports and props**

Add imports:

```typescript
import { EditOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';
import { debugApi } from '../../api/debug';
```

Add props to `VariableBubbleProps`:

```typescript
sessionId?: string;
onVariableEdit?: (scope: string, name: string, newValue: unknown) => void;
```

Destructure from component args.

- [ ] **Step 2: Add edit state**

```typescript
const [editingKey, setEditingKey] = useState<string | null>(null);
const [editValue, setEditValue] = useState('');
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
const inputRef = useRef<any>(null);
```

- [ ] **Step 3: Modify `renderScopeVariables` variable row rendering**

Replace the simple `<span>` value display with a `VariableValueRow` that supports two modes:

**Display mode:** `[varName] [tags] : "value"  [✏️ on hover]`
**Edit mode:** `[varName] [tags] : [Input] [status icon]`

Key behaviors:

- `canEdit` = `content.actionStatus === 'running' && !!sessionId`
- Hover: CSS `.variable-row:hover .edit-icon { opacity: 1 !important; }` reveals pencil icon
- Click pencil or double-click value → enters edit mode
- `<Input size="small" autoFocus>` pre-filled with `formatScopeValue(value)`
- Enter → parse (try JSON.parse, fallback to string) → call `handleSave`
- Escape → cancel, revert
- Blur → same as Enter (auto-save)
- `handleSave` guard: `if (saveStatus === 'saving') return;` to prevent double-save
- Pass `phaseId`/`topicId` from `content.scopePath` in API call

Save flow:

```typescript
1. Parse editValue string to JS type
2. Call onVariableEdit(scope, varName, newValue) — optimistic update
3. Call debugApi.updateVariable(sessionId, { variableName, scope, value, phaseId, topicId })
4. Success → setSaveStatus('saved') → 1.5s → clear
5. Failure → setSaveStatus('error') → onVariableEdit revert → 3s → clear
```

- [ ] **Step 4: Add hover CSS**

Add a `<style>` tag inside the main div:

```css
.variable-row:hover .edit-icon {
  opacity: 1 !important;
}
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

Expected: PASS.

---

### Task 6: Wire DebugChatPanel parent

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: Pass new props to VariableBubble**

At the single render site (around line 1670), add to `<VariableBubble>`:

```tsx
sessionId={activeSessionId || sessionId || undefined}
onVariableEdit={(scope, name, newValue) => {
  setDebugBubbles((prev) =>
    prev.map((b) => {
      if (b.type !== 'variable') return b;
      const content = b.content as VariableBubbleContent;
      const updatedAllVars = {
        ...content.allVariables,
        [scope]: {
          ...(content.allVariables[scope as keyof typeof content.allVariables] || {}),
          [name]: newValue,
        },
      };
      return { ...b, content: { ...content, allVariables: updatedAllVars } };
    })
  );
}}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

Expected: PASS.

---

### Task 7: Verify end-to-end

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```

Expected: All packages PASS.

- [ ] **Step 2: Core engine tests (baseline)**

```bash
pnpm --filter @heartrule/core-engine test
```

Expected: 48 test files pass (2 pre-existing schema validator message format failures unrelated to this feature).

- [ ] **Step 3: Manual verification**

Start dev services and test:

1. Start a debug session with a script that has global variables in `global.yaml`
2. Wait for variable bubble to appear after a message exchange
3. Hover over a global variable value → pencil icon appears
4. Click pencil → input field appears with current value, auto-focused
5. Edit value, press Enter → green checkmark, value updates in bubble
6. Send another message → corrected value is used (visible in LLM prompt bubble)
7. Refresh page / start new session → global variable retains corrected value
8. Test with a completed session → no pencil icon appears on variable rows
9. Test with network disconnected → red error icon, value reverts to original
10. Double-click a value → same edit behavior as clicking the pencil icon
11. Press Escape during editing → edit cancels, value unchanged

---

## Verification Checklist

- [ ] `PATCH /api/sessions/:id/variables` returns 200 for active sessions
- [ ] `PATCH /api/sessions/:id/variables` returns 400 for completed/error sessions
- [ ] `SessionManager.updateVariable()` writes to `variableStore` at correct scope level
- [ ] Global edits persist to `user_global_variables` table (UPSERT)
- [ ] Phase/topic edits include `phaseId`/`topicId` from `content.scopePath`
- [ ] Double-save guard: Enter + blur only triggers one API call
- [ ] Edit icon hidden when `actionStatus !== 'running'`
- [ ] Optimistic update works: UI updates immediately
- [ ] Error recovery: failed API call reverts optimistic update
- [ ] `pnpm typecheck` passes for all packages
- [ ] `pnpm test` baseline unchanged (48 pass, 2 pre-existing failures)
