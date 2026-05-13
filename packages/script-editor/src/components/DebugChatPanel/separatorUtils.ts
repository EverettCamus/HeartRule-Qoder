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
