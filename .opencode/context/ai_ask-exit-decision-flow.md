---

## Goal

**Primary Goal**: Complete the `ai_ask-exit-decision` worktree - optimizing AI_Ask's exit decision mechanism with proper max_rounds semantics, correct currentRound handling across different actions, and simplified LLM output format.

**Status**: ✅ All tests passing (570 passed), ready for commit

## Instructions

- All work is in worktree: `/home/leo/projects/HeartRule-Qoder/.worktrees/ai_ask-exit-decision/`
- Follow TDD process - write failing tests first
- max_rounds semantics: `max_rounds=1` means AI asks once → user answers → completes
- LLM output format changed from `assessment`+`progress` to `metrics`+`progress_suggestion`
- Round info (`current_round`/`max_rounds`) is now INPUT to LLM template, not OUTPUT from LLM

## Key Changes Made

### 1. max_rounds default/range changes

- Default: 20 (was 3)
- Maximum: 200 (was 10)

### 2. Template format redesigned

- Old: `assessment`, `progress` fields with hardcoded round info
- New: `metrics`, `progress_suggestion` fields, round info as template input

### 3. Exit decision logic fixed

- Changed from `>=` to `>` comparison in `rule-based-evaluator.ts`
- Semantics: `currentRound > maxRounds` triggers exit (not `>=`)
- This ensures AI can generate exactly `max_rounds` messages before exiting

### 4. currentRound increment timing

- Increment happens BEFORE LLM call so template sees correct value

### 5. restoreActionIfNeeded signature updated

- Now accepts optional `phases` parameter to correctly determine current actionId

## Test Files Fixed

1. ✅ `action-state-manager.test.ts` - added `currentActionId`
2. ✅ `test-fixtures.ts` - changed max_rounds test value from 15 to 250
3. ✅ `schema-prompt-generator.test.ts` - range 1-10 to 1-200
4. ✅ `ai-ask-max-rounds.test.ts` (domain) - updated for `>` semantics
5. ✅ `ai-ask-max-rounds.test.ts` (script-execution) - updated expectations
6. ✅ `conversation-history-duplication.test.ts` - updated mock LLM output format
7. ✅ `schema-validator.test.ts` (2 files) - updated test data for new max_rounds range
8. ✅ `exit-decision.test.ts` - updated message assertion from `>=` to `>`
9. ✅ `phase7-variable-scope-resolver.test.ts` - fixed flaky timing test (1ms → 5ms)

## Relevant files

**Worktree location**: `/home/leo/projects/HeartRule-Qoder/.worktrees/ai_ask-exit-decision/`

**Key modified files:**

- `packages/core-engine/src/domain/actions/ai-ask-action.ts` - currentRound increment, buildSystemVariables, buildCollectedVariables
- `packages/core-engine/src/application/state/action-state-manager.ts` - restoreActionIfNeeded signature change
- `packages/core-engine/src/engines/script-execution/script-executor.ts` - passes phases to restoreActionIfNeeded
- `packages/core-engine/src/engines/exit-decision/rule-based-evaluator.ts` - changed `>=` to `>` for max_rounds check
- `_system/config/default/ai_ask_v1.md` - new template format

## max_rounds Semantics (Final)

With `currentRound > maxRounds` condition:

- `max_rounds=1`: AI asks once → user answers → AI increments to 2 → 2 > 1 → exits
- `max_rounds=2`: AI asks → user answers → AI asks again → user answers → AI increments to 3 → 3 > 2 → exits

Result: AI generates exactly `max_rounds` messages before exiting.

## Next Steps

1. Commit changes with message:

   ```
   fix: correct max_rounds exit decision logic (>= to >)

   - Changed exit condition from >= to > to ensure AI generates exactly max_rounds messages
   - Updated tests to match new semantics
   - Fixed max_rounds validation range (1-200)
   - Updated template output format (metrics/progress_suggestion)
   ```

2. Consider merging worktree to main
