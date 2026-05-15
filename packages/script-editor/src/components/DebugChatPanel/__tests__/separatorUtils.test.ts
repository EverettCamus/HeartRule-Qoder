import { describe, it, expect } from 'vitest';

import {
  determineSnapshotMsgCount,
  insertSeparator,
  computeSeparatorTimestamp,
  type SeparatorMessage,
} from '../separatorUtils';

/**
 * Unit tests for separator insertion logic.
 *
 * Bug context: After rollback, the separator bubble appeared AFTER the
 * regenerated AI message instead of BEFORE it. Two bugs caused this:
 *
 * 1. `preRerunMsgCountRef.current || undefined` converted valid 0 to undefined
 *    (0 is falsy in JS). This caused the fallback to resultActionSnapshots,
 *    which also returned messageCount=0, but then...
 *
 * 2. `snapshotMsgCount > 0` rejected 0 as a valid split point.
 *    When rolling back to action_1 (first action), the snapshot's
 *    messageCount is legitimately 0 because conversation history was empty
 *    when the snapshot was taken.
 */

const makeMessage = (id: string, content: string): SeparatorMessage => ({
  messageId: id,
  role: 'system',
  content,
  timestamp: new Date().toISOString(),
});

const makeSeparator = (): SeparatorMessage =>
  makeMessage('separator', '--- ↩️ 回退到 action_1 并重新执行 ---');

describe('determineSnapshotMsgCount', () => {
  const resultSnapshots = {
    action_1: { messageCount: 0, conversationHistoryLength: 0 },
    action_2: { messageCount: 3, conversationHistoryLength: 3 },
  };

  const stateSnapshots = {
    action_1: { messageCount: 0 },
  };

  it('uses preRerunMsgCount when defined (even value 0)', () => {
    // Key regression: 0 is a valid value and must not be treated as "not set"
    expect(determineSnapshotMsgCount(0, resultSnapshots, stateSnapshots, 'action_1')).toBe(0);
  });

  it('uses preRerunMsgCount when positive', () => {
    expect(determineSnapshotMsgCount(3, resultSnapshots, stateSnapshots, 'action_2')).toBe(3);
  });

  it('falls back to resultActionSnapshots when preRerunMsgCount is undefined', () => {
    expect(determineSnapshotMsgCount(undefined, resultSnapshots, stateSnapshots, 'action_1')).toBe(
      0
    );
    expect(determineSnapshotMsgCount(undefined, resultSnapshots, stateSnapshots, 'action_2')).toBe(
      3
    );
  });

  it('falls back to stateActionSnapshots when resultActionSnapshots is undefined', () => {
    expect(determineSnapshotMsgCount(undefined, undefined, stateSnapshots, 'action_1')).toBe(0);
  });

  it('returns undefined when no source has the data', () => {
    expect(determineSnapshotMsgCount(undefined, undefined, {}, 'action_1')).toBeUndefined();
    expect(determineSnapshotMsgCount(undefined, { action_2: {} }, {}, 'action_1')).toBeUndefined();
  });

  it('does not use || falsy coalescing (0 must not become undefined)', () => {
    // This is a design contract test: 0 || undefined === undefined
    // which is WRONG. We must use !== undefined check, not ||.
    const wrongResult = 0 || undefined;
    expect(wrongResult).toBeUndefined(); // demonstrates the bug pattern

    // Our function must NOT exhibit this bug
    expect(determineSnapshotMsgCount(0, undefined, {}, 'action_1')).toBe(0);
  });
});

describe('insertSeparator', () => {
  it('inserts separator at position 0 when snapshotMsgCount is 0', () => {
    const messages = [makeMessage('msg1', 'AI reply after rerun')];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, 0);

    expect(result).toHaveLength(2);
    expect(result[0].messageId).toBe('separator');
    expect(result[1].messageId).toBe('msg1');
  });

  it('inserts separator at the correct split point', () => {
    const messages = [
      makeMessage('m1', 'old msg 1'),
      makeMessage('m2', 'old msg 2'),
      makeMessage('m3', 'new msg 1'),
      makeMessage('m4', 'new msg 2'),
    ];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, 2);

    expect(result).toHaveLength(5);
    expect(result[0].messageId).toBe('m1');
    expect(result[1].messageId).toBe('m2');
    expect(result[2].messageId).toBe('separator');
    expect(result[3].messageId).toBe('m3');
    expect(result[4].messageId).toBe('m4');
  });

  it('inserts separator at end when snapshotMsgCount equals message length', () => {
    const messages = [makeMessage('m1', 'msg 1'), makeMessage('m2', 'msg 2')];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, 2);

    expect(result).toHaveLength(3);
    expect(result[2].messageId).toBe('separator');
  });

  it('appends separator at end when snapshotMsgCount is undefined (fallback)', () => {
    const messages = [makeMessage('m1', 'msg 1')];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, undefined);

    expect(result).toHaveLength(2);
    expect(result[0].messageId).toBe('m1');
    expect(result[1].messageId).toBe('separator');
  });

  it('handles empty messages array with snapshotMsgCount = 0', () => {
    const messages: SeparatorMessage[] = [];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, 0);

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('separator');
  });

  it('handles empty messages array with snapshotMsgCount undefined', () => {
    const messages: SeparatorMessage[] = [];
    const separator = makeSeparator();
    const result = insertSeparator(messages, separator, undefined);

    expect(result).toHaveLength(1);
    expect(result[0].messageId).toBe('separator');
  });
});

describe('computeSeparatorTimestamp', () => {
  const T0 = '2025-01-01T00:00:00.000Z';
  const T1 = '2025-01-01T00:00:01.000Z'; // T0 + 1000ms
  const T2 = '2025-01-01T00:00:02.000Z'; // T0 + 2000ms

  const ts = (s: string) => ({ timestamp: s });

  it('places separator at midpoint between last-old and first-new', () => {
    const messages = [ts(T0), ts(T1), ts(T2)];
    const result = computeSeparatorTimestamp(messages, 2); // split after index 1

    const resultMs = new Date(result).getTime();
    const prevMs = new Date(T1).getTime();
    const nextMs = new Date(T2).getTime();
    expect(resultMs).toBeGreaterThan(prevMs);
    expect(resultMs).toBeLessThan(nextMs);
    expect(resultMs).toBe(prevMs + (nextMs - prevMs) / 2);
  });

  it('appends 1ms after last message when split is at end', () => {
    const messages = [ts(T0), ts(T1)];
    const result = computeSeparatorTimestamp(messages, 2);

    const resultMs = new Date(result).getTime();
    const lastMs = new Date(T1).getTime();
    expect(resultMs).toBe(lastMs + 1);
  });

  it('prepends 1ms before first message when snapshotMsgCount is 0', () => {
    const messages = [ts(T0), ts(T1)];
    const result = computeSeparatorTimestamp(messages, 0);

    const resultMs = new Date(result).getTime();
    const firstMs = new Date(T0).getTime();
    expect(resultMs).toBe(firstMs - 1);
  });

  it('uses current time as fallback when snapshotMsgCount is undefined', () => {
    const messages = [ts(T0), ts(T1)];
    const before = Date.now();
    const result = computeSeparatorTimestamp(messages, undefined);
    const after = Date.now();

    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before - 100);
    expect(resultMs).toBeLessThanOrEqual(after + 100);
  });

  it('uses current time as fallback when messages array is empty', () => {
    const before = Date.now();
    const result = computeSeparatorTimestamp([], 0);
    const after = Date.now();

    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before - 100);
    expect(resultMs).toBeLessThanOrEqual(after + 100);
  });

  it('appends after last message when snapshotMsgCount equals message length (non-zero)', () => {
    const messages = [ts(T0), ts(T1), ts(T2)];
    const result = computeSeparatorTimestamp(messages, 3);

    const resultMs = new Date(result).getTime();
    const lastMs = new Date(T2).getTime();
    expect(resultMs).toBe(lastMs + 1);
  });
});
