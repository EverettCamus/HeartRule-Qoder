# DDD Refactoring Plan: Debug Branch Management

> Created: 2026-06-03 | Based on: `docs/ddd/contexts/session-api.md`

## Pre-requisites
- All existing tests pass (`npx vitest run`)
- `test-branch-isolation.mjs` passes (13/13)

---

## Step 1: Introduce Parameter Object — pass branchId explicitly to saveNewAIMessagesFromSession

| Field | Content |
|-------|---------|
| **Order** | 1 |
| **Files** | `session-repository.ts` (interface + implementation), `session-orchestrator.ts` (2 call sites) |
| **Fowler technique** | Introduce Parameter Object |
| **Blast radius** | ~3 files, 6 lines changed |
| **TDD entry point** | `packages/api-server/src/services/__tests__/session-repository.test.ts` — add test that `saveNewAIMessagesFromSession` stores messages with the provided branchId |
| **Prerequisites** | None |
| **Rollback check** | `test-branch-isolation.mjs` must still pass all 13 tests |

**What changes**:
1. Add `branchId?: string` parameter to `ISessionRepository.saveNewAIMessagesFromSession()` and `SessionRepository.saveNewAIMessagesFromSession()`
2. Replace `const branchId = (session.metadata._v0ContinuationBranchId \|\| session.metadata.currentBranchId \|\| ...)` with the explicit parameter
3. In `session-orchestrator.ts` `processUserInput`: pass `activeBranchId` as the new parameter
4. In `session-orchestrator.ts` `initializeSession` and `rerunAction`: pass `undefined` (defaults to `currentBranchId`)
5. Remove `_v0ContinuationBranchId` assignment and deletion entirely

---

## Step 2: Move Method — metadata parsing and branchId defaulting into repository

| Field | Content |
|-------|---------|
| **Order** | 2 |
| **Files** | `session-repository.ts`, `routes/sessions.ts` |
| **Fowler technique** | Move Method |
| **Blast radius** | 2 files, ~20 lines changed |
| **TDD entry point** | Extend existing test in `session-orchestrator.test.ts` — verify `loadConversationHistory` defaults to current branch when no branchId is passed |
| **Prerequisites** | Step 1 |
| **Rollback check** | `GET /messages` (no branchId) must return current branch messages (test 10 in isolation script) |

**What changes**:
1. Extract `parseMetadata()` helper (already exists in orchestrator) into a shared utility or repository method
2. Move the `currentBranchId` defaulting logic from `routes/sessions.ts` into `SessionRepository.getEffectiveBranchId(sessionId)`
3. Update `loadConversationHistory` to automatically default to current branch when no branchId provided
4. Route becomes a thin pass-through: call repo, format, return

---

## Step 3: Stabilize Select Options — useMemo to prevent Ant Design onChange re-fires

| Field | Content |
|-------|---------|
| **Order** | 3 |
| **Files** | `DebugChatPanel/index.tsx` |
| **Fowler technique** | Replace Temp with Query (stabilize derived data) |
| **Blast radius** | 1 file, ~10 lines changed |
| **TDD entry point** | Manual verification: after V0 send, console shows NO `[SETTER]` auto-fires (only user-initiated Select clicks) |
| **Prerequisites** | None (independent of server changes) |
| **Rollback check** | Select must still work for user-initiated V0/V1 switching |

**What changes**:
1. Wrap the Select `options` array in `useMemo(() => [...], [timelineSnapshots])`
2. This ensures the options array reference is stable unless `timelineSnapshots` actually changes
3. Ant Design's Select won't fire onChange on every unrelated re-render
4. Keep `suppressSelectOnChange` as a safety net, but it should rarely trigger

---

## Step 4: Remove Dead Code — superseded and includeSuperseded remnants

| Field | Content |
|-------|---------|
| **Order** | 4 |
| **Files** | `session-repository.ts`, `routes/sessions.ts`, test mock files |
| **Fowler technique** | Remove Dead Code |
| **Blast radius** | ~3 files, ~10 lines removed |
| **TDD entry point** | Run full test suite — no test should reference `superseded` or `includeSuperseded` |
| **Prerequisites** | Steps 1-3 |
| **Rollback check** | `grep -r "superseded\|includeSuperseded\|flagSuperseded" packages/ --include="*.ts"` returns empty |

**What changes**:
1. Remove `includeSuperseded` from interface type if still present
2. Verify no `superseded` filter in any route or repository method
3. Remove any superseded-related test setup in mock repositories

---

## Verification Suite

After each step, run:

```bash
# Server-side
node test-branch-isolation.mjs    # Must pass 13/13

# Full test suite
npx vitest run                     # No regressions

# Manual client verification
# 1. Create session → send msg → rollback → V0/V1 appear
# 2. Switch V0 → send msg → stays in V0, new content in V0
# 3. Switch V1 → shows only V1 content (no V0 leakage)
# 4. Switch back V0 → V0 content preserved
```
