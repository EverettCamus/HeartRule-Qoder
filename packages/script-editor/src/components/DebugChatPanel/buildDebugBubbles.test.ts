import { describe, it, expect } from 'vitest';
import type { DebugEntryRecord } from '../../api/debug';
import type { DebugBubbleV2 } from '../../types/debug';
import type { NavigationTree, PhaseNode, TopicNode, ActionNode } from '../../types/navigation';
import { buildDebugBubbles } from './buildDebugBubbles';

function makeTree(): NavigationTree {
  const action1: ActionNode = { actionId: 'action_1', actionType: 'ai_ask', actionIndex: 0, displayName: 'Ask Name', status: 'pending' };
  const action2: ActionNode = { actionId: 'action_2', actionType: 'ai_say', actionIndex: 1, displayName: 'Say Thanks', status: 'pending' };
  const topic: TopicNode = { topicId: 'topic_1', topicName: 'Topic One', topicIndex: 0, actions: [action1, action2] };
  const phase: PhaseNode = { phaseId: 'phase_1', phaseName: 'Phase One', phaseIndex: 0, topics: [topic] };
  return { sessionId: 'test', sessionName: 'Test', phases: [phase] };
}

function makeEntry(overrides: Partial<DebugEntryRecord> = {}): DebugEntryRecord {
  return {
    id: 'entry-1',
    sessionId: 'session-1',
    runId: 'run-1',
    phaseId: 'phase_1',
    topicId: 'topic_1',
    actionId: 'action_1',
    actionType: 'ai_ask',
    round: 1,
    content: { entries: [{ type: 'llm_call', prompt: 'hello', response: 'world', model: 'test', tokensUsed: 100 }] },
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildDebugBubbles', () => {
  it('builds one bubble per group key', () => {
    const entries = [
      makeEntry({ id: 'e1' }),
      makeEntry({ id: 'e2', round: 2 }),
    ];
    const bubbles = buildDebugBubbles(entries, makeTree());
    expect(bubbles).toHaveLength(2);
  });

  it('merges entries with same group key into one bubble', () => {
    const entries = [
      makeEntry({ id: 'e1', content: { entries: [{ type: 'llm_call' as const, model: 'a' }] } }),
      makeEntry({ id: 'e2', content: { entries: [{ type: 'llm_call' as const, model: 'b' }] } }),
    ];
    const bubbles = buildDebugBubbles(entries, makeTree());
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0].entries).toHaveLength(2);
  });

  it('looks up phase/topic/action names from tree', () => {
    const bubbles = buildDebugBubbles([makeEntry()], makeTree());
    expect(bubbles[0].phaseName).toBe('Phase One');
    expect(bubbles[0].topicName).toBe('Topic One');
    expect(bubbles[0].actionName).toBe('Ask Name');
  });

  it('sorts by phaseId, topicId, actionId, then round', () => {
    const entries = [
      makeEntry({ id: 'e1', actionId: 'action_2', round: 1 }),
      makeEntry({ id: 'e2', actionId: 'action_1', round: 2 }),
      makeEntry({ id: 'e3', actionId: 'action_1', round: 1 }),
    ];
    const bubbles = buildDebugBubbles(entries, makeTree());
    expect(bubbles[0].actionId).toBe('action_1');
    expect(bubbles[0].round).toBe(1);
    expect(bubbles[1].actionId).toBe('action_1');
    expect(bubbles[1].round).toBe(2);
    expect(bubbles[2].actionId).toBe('action_2');
  });

  it('preserves all entry fields in bubble', () => {
    const entry = makeEntry();
    const bubbles = buildDebugBubbles([entry], makeTree());
    const b = bubbles[0];
    expect(b.id).toBe('entry-1');
    expect(b.sessionId).toBe('session-1');
    expect(b.runId).toBe('run-1');
    expect(b.phaseId).toBe('phase_1');
    expect(b.topicId).toBe('topic_1');
    expect(b.actionId).toBe('action_1');
    expect(b.actionType).toBe('ai_ask');
    expect(b.round).toBe(1);
    expect(b.isExpanded).toBe(false);
  });

  it('handles empty entries', () => {
    const bubbles = buildDebugBubbles([], makeTree());
    expect(bubbles).toHaveLength(0);
  });

  it('handles unknown tree lookup gracefully', () => {
    const entry = makeEntry({ actionId: 'nonexistent' });
    const bubbles = buildDebugBubbles([entry], makeTree());
    expect(bubbles[0].phaseName).toBeUndefined();
  });
});
