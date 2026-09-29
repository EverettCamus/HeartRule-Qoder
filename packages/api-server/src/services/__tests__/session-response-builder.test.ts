import { Session } from '@heartrule/core-engine';
import { ExecutionStatus } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

import { SessionResponseBuilder } from '../session-response-builder.js';
import type { SessionData, ScriptData } from '../session-repository.js';

/**
 * Tests for SessionResponseBuilder.buildSessionResponseFromSession error propagation.
 *
 * Bug context: When ScriptExecutor sets executionState.status = ExecutionStatus.ERROR,
 * the old buildSessionResponseFromSession method never populated result.error.
 * The route handler checked `if (result.error)` — since it was always undefined,
 * no error details reached the client. The client saw executionStatus: 'error'
 * with no error object, triggering the BACKEND_ERROR fallback.
 *
 * Fix: buildSessionResponseFromSession now checks session.executionStatus and
 * builds a DetailedApiError from session.metadata.error when in error state.
 */
describe('SessionResponseBuilder - error propagation', () => {
  const builder = new SessionResponseBuilder();

  const makeScript = (): ScriptData => ({
    id: 'script-1',
    scriptName: 'test.yaml',
    scriptContent: 'session: { phases: [] }',
    projectId: 'proj-1',
  });

  const makeSessionData = (): SessionData => ({
    id: 'sess-1',
    scriptId: 'script-1',
    userId: 'user-1',
    status: 'active',
    executionStatus: 'error',
    variables: {},
    position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
    metadata: {},
  });

  const prevSnapshots = new Map();

  it('propagates error details when executionStatus is ExecutionStatus.ERROR', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: ExecutionStatus.ERROR,
    });
    session.metadata.error = 'LLM JSON parse failed: Unexpected token';

    const result = builder.buildSessionResponseFromSession(
      session,
      makeSessionData(),
      makeScript(),
      {},
      prevSnapshots
    );

    expect(result.executionStatus).toBe(ExecutionStatus.ERROR);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBeDefined();
    expect(result.error!.message).toBeDefined();
    expect(result.error!.details).toContain('LLM JSON parse failed');
  });

  it('propagates error details when executionStatus is the string "error"', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: 'error' as any,
    });
    session.metadata.error = 'Action execution failed: timeout';

    const result = builder.buildSessionResponseFromSession(
      session,
      makeSessionData(),
      makeScript(),
      {},
      prevSnapshots
    );

    expect(result.error).toBeDefined();
    expect(result.error!.details).toContain('timeout');
  });

  it('falls back to metadata.message when metadata.error is absent', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: ExecutionStatus.ERROR,
    });
    // No metadata.error, but metadata.message exists
    session.metadata.message = 'Fallback error message';

    const result = builder.buildSessionResponseFromSession(
      session,
      makeSessionData(),
      makeScript(),
      {},
      prevSnapshots
    );

    expect(result.error).toBeDefined();
    expect(result.error!.details).toContain('Fallback error message');
  });

  it('falls back to "Unknown execution error" when no error metadata exists', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: ExecutionStatus.ERROR,
    });
    // Neither metadata.error nor metadata.message

    const result = builder.buildSessionResponseFromSession(
      session,
      makeSessionData(),
      makeScript(),
      {},
      prevSnapshots
    );

    expect(result.error).toBeDefined();
    expect(result.error!.details).toBe('Unknown execution error');
  });

  it('does NOT set error when executionStatus is not an error state', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: ExecutionStatus.WAITING_INPUT,
    });

    const result = builder.buildSessionResponseFromSession(
      session,
      makeSessionData(),
      makeScript(),
      {},
      prevSnapshots
    );

    expect(result.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
    expect(result.error).toBeUndefined();
  });

  it('includes context info (scriptId, scriptName, sessionId, position) in the error', () => {
    const session = new Session({
      userId: 'user-1',
      scriptId: 'script-1',
      executionStatus: ExecutionStatus.ERROR,
    });
    session.metadata.error = 'test error';
    session.position = {
      phaseIndex: 2,
      topicIndex: 1,
      actionIndex: 0,
      phaseId: 'phase_3',
      topicId: 'topic_2',
      actionId: 'action_1',
      actionType: 'ai_ask',
    };

    const dbSession = makeSessionData();
    const script = makeScript();

    const result = builder.buildSessionResponseFromSession(
      session,
      dbSession,
      script,
      {},
      prevSnapshots
    );

    expect(result.error).toBeDefined();
    expect(result.error!.context).toBeDefined();
    expect(result.error!.context!.scriptId).toBe(script.id);
    expect(result.error!.context!.scriptName).toBe(script.scriptName);
    expect(result.error!.context!.sessionId).toBe(dbSession.id);
    expect(result.error!.context!.position).toBeDefined();
    expect(result.error!.context!.position!.phaseIndex).toBe(2);
    expect(result.error!.context!.position!.actionId).toBe('action_1');
  });
});
