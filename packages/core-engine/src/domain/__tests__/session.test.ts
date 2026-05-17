import { SessionStatus, ExecutionStatus } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

import { Session, type SessionPersistenceData } from '../session.js';

describe('Session Domain Model', () => {
  it('should create a new session with default values', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    expect(session.userId).toBe('user123');
    expect(session.scriptId).toBe('script456');
    expect(session.status).toBe(SessionStatus.ACTIVE);
    expect(session.executionStatus).toBe(ExecutionStatus.RUNNING);
    expect(session.position).toEqual({ phaseIndex: 0, topicIndex: 0, actionIndex: 0 });
  });

  it('should start a session', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
      status: SessionStatus.PAUSED,
    });

    session.start();

    expect(session.status).toBe(SessionStatus.ACTIVE);
    expect(session.executionStatus).toBe(ExecutionStatus.RUNNING);
  });

  it('should pause and resume a session', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    session.pause();
    expect(session.status).toBe(SessionStatus.PAUSED);
    expect(session.executionStatus).toBe(ExecutionStatus.PAUSED);

    session.resume();
    expect(session.status).toBe(SessionStatus.ACTIVE);
    expect(session.executionStatus).toBe(ExecutionStatus.RUNNING);
  });

  it('should complete a session', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    session.complete();

    expect(session.status).toBe(SessionStatus.COMPLETED);
    expect(session.executionStatus).toBe(ExecutionStatus.COMPLETED);
    expect(session.completedAt).toBeDefined();
  });

  it('should set and get variables (plain object)', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    session.setVariable('name', 'Alice');
    session.setVariable('age', 30);

    expect(session.getVariable('name')).toBe('Alice');
    expect(session.getVariable('age')).toBe(30);
  });

  it('should fail a session and store error in metadata', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    session.fail('Something went wrong');

    expect(session.status).toBe(SessionStatus.FAILED);
    expect(session.executionStatus).toBe(ExecutionStatus.ERROR);
    expect(session.metadata.error).toBe('Something went wrong');
  });

  it('should convert to JSON', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    const json = session.toJSON();

    expect(json).toHaveProperty('sessionId');
    expect(json).toHaveProperty('userId', 'user123');
    expect(json).toHaveProperty('scriptId', 'script456');
    expect(json).toHaveProperty('status', SessionStatus.ACTIVE);
  });

  describe('ExecutionState bridge', () => {
    it('should round-trip through toExecutionState + applyExecutionResult', () => {
      const session = new Session({
        userId: 'user123',
        scriptId: 'script456',
      });
      session.setVariable('name', 'Alice');
      session.metadata.projectId = 'proj-1';
      session.metadata.currentRunId = 'run-abc';
      session.metadata.actionSnapshots = { action1: { messageCount: 3 } as any };
      session.addConversationEntry({ role: 'user', content: 'hello' });

      const execState = session.toExecutionState();

      // Mutate as ScriptExecutor would
      execState.status = ExecutionStatus.WAITING_INPUT;
      execState.currentActionIdx = 2;
      execState.lastAiMessage = 'How can I help?';
      execState.conversationHistory.push({ role: 'assistant', content: 'How can I help?' });
      execState.variables['age'] = 25;

      session.applyExecutionResult(execState);

      expect(session.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
      expect(session.position.actionIndex).toBe(2);
      expect(session.lastAiMessage).toBe('How can I help?');
      expect(session.getVariable('name')).toBe('Alice');
      expect(session.getVariable('age')).toBe(25);
      expect(session.conversationHistory).toHaveLength(2);
      // metadata preserved
      expect(session.metadata.projectId).toBe('proj-1');
      expect(session.metadata.currentRunId).toBe('run-abc');
      expect(session.metadata.actionSnapshots).toBeDefined();
    });

    it('should carry currentTopicPlan through round-trip', () => {
      const session = new Session({
        userId: 'user123',
        scriptId: 'script456',
      });

      const plan = { topicId: 'topic-1', actions: [], metadata: {} };
      session.currentTopicPlan = plan as any;

      const execState = session.toExecutionState();
      expect(execState.currentTopicPlan).toBe(plan);

      session.applyExecutionResult(execState);
      expect(session.currentTopicPlan).toBe(plan);
    });
  });

  describe('fromSessionData factory', () => {
    it('should rebuild Session from persistence shape', () => {
      const data: SessionPersistenceData = {
        id: 'sess-1',
        userId: 'user-1',
        scriptId: 'script-1',
        status: 'active',
        executionStatus: 'running',
        variables: { name: 'Bob' },
        position: { phaseIndex: 1, topicIndex: 2, actionIndex: 0 },
        metadata: {
          projectId: 'proj-1',
          variableStore: {
            global: { theme: { value: 'dark', type: 'string', source: 'init' } },
            session: {},
            phase: {},
            topic: {},
          },
        },
      };

      const session = Session.fromSessionData(data, {
        globalVariables: { lang: 'en' },
        conversationHistory: [{ role: 'user', content: 'hi' }],
      });

      expect(session.sessionId).toBe('sess-1');
      expect(session.userId).toBe('user-1');
      expect(session.scriptId).toBe('script-1');
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.executionStatus).toBe(ExecutionStatus.RUNNING);
      expect(session.position.phaseIndex).toBe(1);
      expect(session.position.topicIndex).toBe(2);
      expect(session.getVariable('name')).toBe('Bob');
      expect(session.getVariable('lang')).toBe('en');
      expect(session.conversationHistory).toHaveLength(1);
      expect(session.metadata.projectId).toBe('proj-1');
    });

    it('should inject currentRunId from data', () => {
      const data: SessionPersistenceData = {
        id: 'sess-1',
        userId: 'user-1',
        scriptId: 'script-1',
        status: 'active',
        executionStatus: 'running',
        variables: null,
        position: null,
        metadata: null,
        currentRunId: 'run-xyz',
      };

      const session = Session.fromSessionData(data, {
        globalVariables: {},
        conversationHistory: [],
      });

      expect(session.metadata.currentRunId).toBe('run-xyz');
    });
  });
});
