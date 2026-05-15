/**
 * Separator insertion helpers for rerun/rollback debug bubble display.
 *
 * Extracted as pure functions for testability.
 */

export interface SeparatorMessage {
  messageId: string;
  role: 'system';
  content: string;
  timestamp: string;
}

/**
 * Determine the message count at the snapshot boundary.
 *
 * Priority:
 *   1. preRerunMsgCount — set by handleRollbackToAction from snapshot.messageCount
 *   2. resultActionSnapshots[targetActionId]?.messageCount — from rerun API response
 *   3. stateActionSnapshots[targetActionId]?.messageCount — from React state
 *
 * Returns undefined if the boundary cannot be determined.
 */
export function determineSnapshotMsgCount(
  preRerunMsgCount: number | undefined,
  resultActionSnapshots: Record<string, any> | undefined,
  stateActionSnapshots: Record<string, any>,
  rerunTargetActionId: string
): number | undefined {
  if (preRerunMsgCount !== undefined) {
    return preRerunMsgCount;
  }
  const snapshots = resultActionSnapshots || stateActionSnapshots;
  return snapshots?.[rerunTargetActionId]?.messageCount;
}

/**
 * Compute a timestamp for the separator so it sorts correctly between
 * old (pre-snapshot) and new (post-snapshot) messages when the renderer
 * merges messages and bubbles into a single timestamp-sorted list.
 *
 * - Between messages: midpoint between last-old and first-new timestamps
 * - Append (no new messages): 1ms after last old message
 * - Prepend (snapshotMsgCount === 0): 1ms before first message
 * - Fallback: current time
 */
export function computeSeparatorTimestamp(
  messages: Array<{ timestamp: string }>,
  snapshotMsgCount: number | undefined
): string {
  if (
    snapshotMsgCount !== undefined &&
    snapshotMsgCount > 0 &&
    snapshotMsgCount < messages.length
  ) {
    // Between last old message and first new message
    const prevTs = new Date(messages[snapshotMsgCount - 1].timestamp).getTime();
    const nextTs = new Date(messages[snapshotMsgCount].timestamp).getTime();
    return new Date(prevTs + (nextTs - prevTs) / 2).toISOString();
  }
  if (snapshotMsgCount !== undefined && snapshotMsgCount > 0) {
    // After last old message (no new messages yet — append case)
    const prevTs = new Date(messages[snapshotMsgCount - 1].timestamp).getTime();
    return new Date(prevTs + 1).toISOString();
  }
  if (snapshotMsgCount !== undefined && messages.length > 0) {
    // snapshotMsgCount === 0, separator before first message
    const nextTs = new Date(messages[0].timestamp).getTime();
    return new Date(nextTs - 1).toISOString();
  }
  // Fallback: no messages or no snapshot boundary
  return new Date().toISOString();
}

/**
 * Split messages array at snapshot boundary and insert separator.
 *
 * If snapshotMsgCount is undefined, the separator is appended at the end.
 * snapshotMsgCount can legitimately be 0 (for the first action's snapshot,
 * where conversation history was empty).
 */
export function insertSeparator<T extends { messageId: string }>(
  messages: T[],
  separator: T,
  snapshotMsgCount: number | undefined
): T[] {
  if (snapshotMsgCount !== undefined) {
    const before = messages.slice(0, snapshotMsgCount);
    const after = messages.slice(snapshotMsgCount);
    return [...before, separator, ...after];
  }
  // Fallback: append at end if boundary cannot be determined
  return [...messages, separator];
}
