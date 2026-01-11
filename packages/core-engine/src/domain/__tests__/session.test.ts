import { SessionStatus, ExecutionStatus } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

import { Session } from '../session.js';

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

  it('should set and get variables', () => {
    const session = new Session({
      userId: 'user123',
      scriptId: 'script456',
    });

    session.setVariable('name', 'Alice');
    session.setVariable('age', 30);

    expect(session.getVariable('name')).toBe('Alice');
    expect(session.getVariable('age')).toBe(30);
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
});
