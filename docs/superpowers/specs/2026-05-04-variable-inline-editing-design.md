# Variable Bubble Inline Editing Design Spec

**Date**: 2026-05-04
**Status**: Updated 2026-05-05 — added latest-bubble-only constraint (design decision #8)

## Overview

Add inline variable value editing to the debug panel's VariableBubble component.
When the LLM mis-extracts a variable (e.g., wrong name, age), the user can correct
it directly from the UI without restarting the session. Global variable edits persist
to `user_global_variables`, ensuring corrections carry over to future sessions.

## Design Decisions

### 1. Edit Trigger — Hover + Click

Each variable row reveals a pencil icon (`EditOutlined`) on hover. Clicking the
icon or double-clicking the value enters inline edit mode.

**Rationale**: Hover-only reveal prevents visual clutter in an already dense debug
panel. Double-click as a secondary trigger accommodates power users. Both triggers
are guarded — they only appear on the latest variable bubble when `actionStatus === 'running'` (session is active, see design decision #8).

### 2. Inline Editing UX

When editing is active, the value text is replaced by an `<Input size="small" />`
with `autoFocus`. Keyboard and blur behavior:

| Action   | Behavior                                           |
| -------- | -------------------------------------------------- |
| Enter    | Parse value (JSON.parse, fallback to string), save |
| Escape   | Cancel edit, revert to original value              |
| Blur     | Same as Enter (auto-save on focus loss)            |
| API fail | Revert optimistic update, show error indicator 3s  |
| API ok   | Show green checkmark 1.5s, then return to display  |

**Rationale**: No modal dialog — faster than confirmation flows. Auto-save on blur
matches spreadsheet editing conventions. Optimistic update ensures instant feedback.

### 3. Four-Scope Editing

All four variable scopes are editable: `global`, `session`, `phase`, `topic`.

| Scope     | Write Target                         | DB Persistence                                 |
| --------- | ------------------------------------ | ---------------------------------------------- |
| `global`  | `variableStore.global[name]`         | `sessions.variables` + `user_global_variables` |
| `session` | `variableStore.session[name]`        | `sessions.variables` + `sessions.metadata`     |
| `phase`   | `variableStore.phase[phaseId][name]` | `sessions.variables` + `sessions.metadata`     |
| `topic`   | `variableStore.topic[topicId][name]` | `sessions.variables` + `sessions.metadata`     |

**Rationale**: Global is the most valuable scope (cross-session persistence), but
session/phase/topic edits are equally useful for correcting in-flight extraction
errors without restarting the debug session.

### 4. Backend: Direct DB Write

Variable edits bypass the script execution engine entirely. The new
`SessionManager.updateVariable()` method writes directly to `variableStore` in
`sessions.metadata` and updates the flat `sessions.variables` column.

**Rationale**: Simpler than injecting edits through the executor. The next
`processUserInput` call naturally picks up the corrected values via
`restoreExecutionState()`, which rebuilds `variableStore` from
`sessions.metadata`.

### 5. Optimistic Update Pattern

```
User edits value → Enter
  ├─ [Immediate] Parent state updated via onVariableEdit callback
  ├─ [Background] PATCH /api/sessions/:id/variables
  │   ├─ Success → green checkmark 1.5s → back to display mode
  │   └─ Failure → red icon 3s → revert parent state → back to display mode
```

**Rationale**: Instant UI feedback is essential for a smooth editing experience.
Revert on failure ensures consistency without blocking the user.

### 6. Session Guard

The PATCH endpoint rejects edits when `executionStatus` is `completed` or `error`
(returns 400 with `ErrorCode.SESSION_ENDED`). The frontend hides the edit icon
when `actionStatus !== 'running'`.

**Rationale**: Editing variables on a completed session is meaningless — no more
LLM calls will use them. The guard prevents confusion.

### 7. VariableValue Wrapper

Edited values are wrapped in the same `VariableValue` structure used by the
extraction engine:

```typescript
{
  value: <new value>,
  type: typeof value,
  lastUpdated: ISO timestamp,
  source: 'manual_edit',       // distinguishes from 'llm_extract', 'pattern', etc.
  scope: 'global' | 'session' | 'phase' | 'topic',
  history: [                    // previous value appended if it existed
    { value, type, lastUpdated, source }
  ]
}
```

**Rationale**: Consistent data model. The `source: 'manual_edit'` tag allows
future UIs to distinguish user-corrected values from LLM-extracted ones.
The `history` array preserves the previous value for potential undo.

### 8. Latest Bubble Only

Only the most recent variable bubble in the debug panel shows the edit icon.
Older bubbles from previous rounds are read-only.

**Rationale**: Each bubble carries a `scopePath` snapshot from when it was created.
Older bubbles may point to phase/topic positions that the executor has already
moved past. Editing through them would write variables to stale locations that
the next LLM call won't read. Restricting edits to the latest bubble ensures
`scopePath` always matches the executor's current position and eliminates the
need to synchronize variable values across multiple visible bubbles.

## API Design

### `PATCH /api/sessions/:id/variables`

**Request**:

```typescript
{
  variableName: string;
  scope: 'global' | 'session' | 'phase' | 'topic';
  value: unknown;
  phaseId?: string;   // required when scope is 'phase'
  topicId?: string;   // required when scope is 'topic'
}
```

**Response (200)**:

```typescript
{
  success: true;
  variableName: string;
  scope: string;
  value: unknown;
  updatedAt: string; // ISO timestamp
}
```

**Error (400 — session ended)**:

```typescript
{
  success: false;
  error: {
    code: 'SESSION_ENDED';
    type: 'session';
    message: string;
  }
}
```

## Files to Modify

### Backend

| File                                         | Change                                                           |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `api-server/src/routes/sessions.ts`          | Add `PATCH /api/sessions/:id/variables` route with session guard |
| `api-server/src/services/session-manager.ts` | Add `updateVariable()` method; add `getScriptTags()` helper      |

### Frontend

| File                                                           | Change                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `script-editor/src/api/debug.ts`                               | Add `updateVariable()` method with typed request/response                                                                                     |
| `script-editor/src/types/debug.ts`                             | Add `sessionId?: string` to `VariableBubbleContent`                                                                                           |
| `script-editor/src/components/DebugBubbles/VariableBubble.tsx` | Add inline editing UI: hover icon, Input, save/cancel, status feedback. Accepts `isLatest` prop to restrict editing to the newest bubble only |
| `script-editor/src/components/DebugChatPanel/index.tsx`        | Pass `sessionId`, `onVariableEdit`, and `isLatest` to VariableBubble. Computes latest variable bubble id from `debugBubbles`                  |

## Edge Cases

1. **Session completed/error**: PATCH returns 400, frontend hides edit icon.
   If a race condition occurs (user clicks edit just as session ends), the API
   error triggers a red flash and value revert.

2. **Edit non-existent variable**: Treated as upsert — the variable is created
   in the target scope with `source: 'manual_edit'`.

3. **Invalid JSON input**: `JSON.parse` failure falls back to storing the raw
   string. This allows editing text values without requiring JSON quoting.

4. **Network error**: The optimistic update is rolled back via the
   `onVariableEdit` callback, restoring the previous value. A red
   `CloseCircleFilled` icon displays for 3 seconds.

5. **Concurrent edits**: Two VariableBubble instances editing the same session
   variable — last write wins. Acceptable for a debug tool used by a single user.

6. **phase/topic scope without phaseId/topicId**: The `updateVariable` method
   requires `phaseId`/`topicId` for their respective scopes. The VariableBubble
   UI obtains these from `content.scopePath.phaseId` / `content.scopePath.topicId`
   and passes them in the PATCH request.

7. **Editing a value that looks like JSON but isn't**: User types `{name: 小明}`
   (unquoted keys) — `JSON.parse` fails, stored as string `"{name: 小明}"`. The
   user must type valid JSON (`{"name": "小明"}`) to get an object.

## Verification

1. Start a debug session with a script that has global variables in `global.yaml`
2. Wait for a variable bubble to appear after a message exchange
3. Hover over a global variable value — pencil icon appears
4. Click pencil — input field appears with current value, auto-focused
5. Edit value, press Enter — green checkmark, value updates in bubble
6. Send another message — corrected value is used (visible in LLM prompt bubble)
7. Refresh page / start new session — global variable retains corrected value
8. Test with a completed session — no pencil icon appears on variable rows
9. Test with network disconnected — red error icon, value reverts to original
10. Double-click a value — same edit behavior as clicking the pencil icon
11. Press Escape during editing — edit cancels, value unchanged
12. Observe an older variable bubble from a previous round — no pencil icon appears on hover, only the latest bubble is editable
