import type { DebugEntryRecord } from '../../api/debug';
import type { DebugBubbleV2 } from '../../types/debug';
import type { NavigationTree } from '../../types/navigation';

/**
 * Pure function: converts raw debug entries into sorted, named DebugBubbleV2[].
 * Extracted from fetchDebugEntriesV2 for testability and reuse.
 */
export function buildDebugBubbles(
  entries: DebugEntryRecord[],
  tree: NavigationTree | null,
): DebugBubbleV2[] {
  if (entries.length === 0) return [];

  // Group entries by composite key
  const groupKey = (e: DebugEntryRecord) =>
    `${e.phaseId}|${e.topicId}|${e.actionId}|${e.round}|${e.runId}`;

  const grouped = new Map<string, DebugEntryRecord[]>();
  for (const entry of entries) {
    const key = groupKey(entry);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(entry);
  }

  // Build DebugBubbleV2 from each group
  const bubbles: DebugBubbleV2[] = [];
  for (const [, groupEntries] of grouped) {
    const first = groupEntries[0];
    const allEntries = groupEntries.flatMap((e) => e.content.entries || []);

    let phaseName: string | undefined;
    let topicName: string | undefined;
    let actionName: string | undefined;
    if (tree?.phases) {
      for (const phase of tree.phases) {
        if (phase.phaseId === first.phaseId) {
          phaseName = phase.phaseName;
          if (phase.topics) {
            for (const topic of phase.topics) {
              if (topic.topicId === first.topicId) {
                topicName = topic.topicName;
                if (topic.actions) {
                  for (const action of topic.actions) {
                    if (action.actionId === first.actionId) {
                      actionName = action.displayName;
                      break;
                    }
                  }
                }
                break;
              }
            }
          }
          break;
        }
      }
    }

    bubbles.push({
      id: first.id,
      sessionId: first.sessionId,
      runId: first.runId,
      phaseId: first.phaseId,
      topicId: first.topicId,
      actionId: first.actionId,
      actionType: first.actionType,
      round: first.round,
      phaseName,
      topicName,
      actionName,
      entries: allEntries,
      timestamp: first.createdAt,
      isExpanded: false,
    });
  }

  // Sort by position then round
  bubbles.sort((a, b) => {
    const byPhase = a.phaseId.localeCompare(b.phaseId);
    if (byPhase !== 0) return byPhase;
    const byTopic = a.topicId.localeCompare(b.topicId);
    if (byTopic !== 0) return byTopic;
    const byAction = a.actionId.localeCompare(b.actionId);
    if (byAction !== 0) return byAction;
    return a.round - b.round;
  });

  return bubbles;
}
