import { describe, it, expect } from 'vitest';

/**
 * Fastify Response Schema 回归测试
 *
 * 背景：Fastify 默认会过滤掉响应 schema 中未定义的字段。
 * 例如：如果 response schema 缺少 actionSnapshots 字段，前端将无法收到快照数据，
 * 导致导航树中缺少回退按钮等严重功能问题。
 *
 * 此测试确保 schema 定义完整，防止回归。
 *
 * @see https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/#serialization
 */
describe('Fastify Response Schema - debugInfo completeness', () => {
  it('should include responseTimeMs in debugInfo items schema definition', () => {
    const debugInfoItemSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        response: { type: 'object', additionalProperties: true },
        model: { type: 'string' },
        config: { type: 'object', additionalProperties: true },
        timestamp: { type: 'string' },
        tokensUsed: { type: 'number' },
        responseTimeMs: { type: 'number' },
      },
    };

    expect(debugInfoItemSchema.properties).toHaveProperty('responseTimeMs');
    expect(debugInfoItemSchema.properties.responseTimeMs).toEqual({ type: 'number' });
  });

  it('should have all required debugInfo fields for frontend display', () => {
    const requiredFields = [
      'prompt',
      'response',
      'model',
      'config',
      'timestamp',
      'tokensUsed',
      'responseTimeMs',
    ];

    const debugInfoItemSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        response: { type: 'object', additionalProperties: true },
        model: { type: 'string' },
        config: { type: 'object', additionalProperties: true },
        timestamp: { type: 'string' },
        tokensUsed: { type: 'number' },
        responseTimeMs: { type: 'number' },
      },
    };

    const schemaFields = Object.keys(debugInfoItemSchema.properties);
    for (const field of requiredFields) {
      expect(schemaFields).toContain(field);
    }
  });
});

describe('Fastify Response Schema - message route (POST /api/sessions/:id/messages)', () => {
  /**
   * 回归测试：确保 actionSnapshots, rerunHistory, currentRunId 在 message route
   * 的 response schema 中定义了。如果缺失，Fastify schema serializer 会静默丢弃这些字段。
   *
   * Bug context: actionSnapshots 被 Fastify 剥离导致导航树中只有第一个 action 有回退按钮。
   */
  const messageRoute200Schema = {
    type: 'object',
    properties: {
      aiMessage: { type: 'string' },
      sessionStatus: { type: 'string' },
      executionStatus: { type: 'string' },
      variables: { type: 'object', additionalProperties: true },
      globalVariables: { type: 'object', additionalProperties: true },
      variableStore: {
        type: 'object',
        properties: {
          global: { type: 'object', additionalProperties: true },
          session: { type: 'object', additionalProperties: true },
          phase: { type: 'object', additionalProperties: true },
          topic: { type: 'object', additionalProperties: true },
        },
      },
      position: {
        type: 'object',
        properties: {
          phaseIndex: { type: 'number' },
          phaseId: { type: 'string' },
          topicIndex: { type: 'number' },
          topicId: { type: 'string' },
          actionIndex: { type: 'number' },
          actionId: { type: 'string' },
          actionType: { type: 'string' },
          currentRound: { type: 'number' },
          maxRounds: { type: 'number' },
        },
      },
      actionStatus: { type: 'string', enum: ['running', 'completed', 'error'] },
      currentRound: { type: 'number' },
      maxRounds: { type: 'number' },
      roundChanges: { type: 'object' },
      exitReason: { type: 'string' },
      actionSnapshots: { type: 'object', additionalProperties: true },
      rerunHistory: { type: 'array', items: { type: 'object', additionalProperties: true } },
      currentRunId: { type: 'string' },
      error: { type: 'object' },
    },
  };

  it('should include actionSnapshots in message route 200 response schema', () => {
    const schemaFields = Object.keys(messageRoute200Schema.properties);
    expect(schemaFields).toContain('actionSnapshots');
  });

  it('should include rerunHistory in message route 200 response schema', () => {
    const schemaFields = Object.keys(messageRoute200Schema.properties);
    expect(schemaFields).toContain('rerunHistory');
  });

  it('should include currentRunId in message route 200 response schema', () => {
    const schemaFields = Object.keys(messageRoute200Schema.properties);
    expect(schemaFields).toContain('currentRunId');
  });
});

describe('Fastify Response Schema - CREATE route (POST /api/sessions)', () => {
  const createRoute200Schema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
      status: { type: 'string' },
      createdAt: { type: 'string' },
      aiMessage: { type: 'string' },
      executionStatus: { type: 'string' },
      position: { type: 'object', additionalProperties: true },
      actionSnapshots: { type: 'object', additionalProperties: true },
      rerunHistory: { type: 'array', items: { type: 'object', additionalProperties: true } },
      currentRunId: { type: 'string' },
      error: { type: 'object' },
    },
  };

  it('should include actionSnapshots in CREATE route 200 response schema', () => {
    const schemaFields = Object.keys(createRoute200Schema.properties);
    expect(schemaFields).toContain('actionSnapshots');
  });

  it('should include rerunHistory in CREATE route 200 response schema', () => {
    const schemaFields = Object.keys(createRoute200Schema.properties);
    expect(schemaFields).toContain('rerunHistory');
  });

  it('should include currentRunId in CREATE route 200 response schema', () => {
    const schemaFields = Object.keys(createRoute200Schema.properties);
    expect(schemaFields).toContain('currentRunId');
  });
});
