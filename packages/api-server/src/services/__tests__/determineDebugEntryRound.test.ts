import { describe, it, expect } from 'vitest';

import { determineDebugEntryRound } from '../session-manager';

/**
 * Unit tests for determineDebugEntryRound.
 *
 * This function determines the round number for debug entries saved to the
 * debug_entries table. Correct round determination is critical for matching
 * debug entries with per-position variable state in the frontend.
 *
 * Bug context: After rerun/rollback, stale actionRoundInfo from pre-rollback
 * execution caused debug entries to be saved with round=2 instead of round=1.
 * The frontend's per-position variable store key used position.currentRound=1
 * (from the API response), creating a key mismatch (...|1 vs ...|2).
 *
 * Fix: rerunAction now deletes actionRoundInfo before re-execution.
 */
describe('determineDebugEntryRound', () => {
  it('returns 1 when metadata is undefined', () => {
    expect(determineDebugEntryRound(undefined, 'action_1')).toBe(1);
  });

  it('returns 1 when metadata has no round info', () => {
    expect(determineDebugEntryRound({}, 'action_1')).toBe(1);
    expect(determineDebugEntryRound({ otherKey: 'value' }, 'action_1')).toBe(1);
  });

  it('returns the action-specific round from actionRoundInfo', () => {
    const metadata = {
      actionRoundInfo: {
        action_1: { currentRound: 3 },
        action_2: { currentRound: 2 },
      },
    };
    expect(determineDebugEntryRound(metadata, 'action_1')).toBe(3);
    expect(determineDebugEntryRound(metadata, 'action_2')).toBe(2);
  });

  it('falls back to lastActionRoundInfo when actionRoundInfo has no entry for actionId', () => {
    const metadata = {
      actionRoundInfo: {
        action_1: { currentRound: 1 },
      },
      lastActionRoundInfo: { currentRound: 4 },
    };
    // action_2 is not in actionRoundInfo, so fallback to lastActionRoundInfo
    expect(determineDebugEntryRound(metadata, 'action_2')).toBe(4);
  });

  it('falls back to 1 when actionRoundInfo exists but has no entry for actionId and no lastActionRoundInfo', () => {
    const metadata = {
      actionRoundInfo: {
        action_1: { currentRound: 1 },
      },
    };
    expect(determineDebugEntryRound(metadata, 'action_2')).toBe(1);
  });

  it('returns 1 after actionRoundInfo is cleared (simulating rerun cleanup)', () => {
    // This is the critical regression test.
    // After rerun/rollback, actionRoundInfo and lastActionRoundInfo should be deleted.
    // The function should return 1 (fresh start) instead of stale values.
    const metadata: Record<string, any> = {
      // actionRoundInfo and lastActionRoundInfo are intentionally absent
      // (they were deleted by rerunAction)
      variableStore: { global: {}, session: {} },
      actionSnapshots: { action_1: { messageCount: 0 } },
      currentRunId: 'new-run-id',
    };
    expect(determineDebugEntryRound(metadata, 'action_1')).toBe(1);
    expect(determineDebugEntryRound(metadata, 'action_2')).toBe(1);
  });

  it('uses lastActionRoundInfo when actionRoundInfo is completely absent', () => {
    const metadata = {
      lastActionRoundInfo: { currentRound: 5 },
    };
    expect(determineDebugEntryRound(metadata, 'action_1')).toBe(5);
  });

  it('handles zero values correctly (0 is falsy, falls through to next fallback)', () => {
    // If currentRound is 0, the || operator treats it as falsy
    const metadata = {
      actionRoundInfo: {
        action_1: { currentRound: 0 },
      },
      lastActionRoundInfo: { currentRound: 2 },
    };
    // 0 || 2 || 1 = 2 (falls through because 0 is falsy)
    // Note: in practice, currentRound should never be 0, but worth documenting
    expect(determineDebugEntryRound(metadata, 'action_1')).toBe(2);
  });
});
