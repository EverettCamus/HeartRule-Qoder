import Fastify from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * E2E 回归测试：Fastify Schema Serializer 不会剥离 actionSnapshots
 *
 * Bug context: Fastify 的 schema-based serializer 会静默丢弃 response schema
 * 中未声明的字段。当 POST /api/sessions/:id/messages 的 response schema 缺少
 * actionSnapshots 时，前端收到 undefined，导致导航树中只有第一个 action 有回退按钮。
 *
 * 此测试直接验证 Fastify 的序列化行为，不依赖 LLM 或数据库。
 */

async function buildTestApp() {
  const app = Fastify({ logger: false });

  // Mirror the exact response schema from sessions.ts message route
  app.post('/test/messages', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            aiMessage: { type: 'string' },
            executionStatus: { type: 'string' },
            actionSnapshots: { type: 'object', additionalProperties: true },
            rerunHistory: {
              type: 'array',
              items: { type: 'object', additionalProperties: true },
            },
            currentRunId: { type: 'string' },
          },
        },
      },
    },
    handler: async (_request, _reply) => {
      return {
        aiMessage: 'Hello',
        executionStatus: 'WAITING_INPUT',
        actionSnapshots: {
          action_1: {
            messageCount: 0,
            conversationHistoryLength: 0,
            timestamp: new Date().toISOString(),
          },
          action_2: {
            messageCount: 3,
            conversationHistoryLength: 3,
            timestamp: new Date().toISOString(),
          },
        },
        rerunHistory: [{ versionId: 'v1', actionId: 'action_1' }],
        currentRunId: 'run-123',
        // Also return a field NOT in the schema to verify it gets stripped
        notInSchema: 'should-be-stripped',
      };
    },
  });

  // Also test without response schema (like the GET detail route)
  app.get('/test/detail', {
    handler: async (_request, _reply) => {
      return {
        metadata: {
          actionSnapshots: { action_1: { messageCount: 0 } },
        },
      };
    },
  });

  await app.ready();
  return app;
}

describe('Fastify Schema Serializer — actionSnapshots E2E', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should include actionSnapshots in response when declared in schema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/messages',
      payload: { content: 'hello' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // These MUST be present — they are declared in the schema
    expect(body).toHaveProperty('actionSnapshots');
    expect(body.actionSnapshots).toHaveProperty('action_1');
    expect(body.actionSnapshots.action_1).toHaveProperty('messageCount', 0);
    expect(body.actionSnapshots).toHaveProperty('action_2');
    expect(body).toHaveProperty('rerunHistory');
    expect(body.rerunHistory).toHaveLength(1);
    expect(body).toHaveProperty('currentRunId', 'run-123');
  });

  it('should strip fields NOT declared in the response schema', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/messages',
      payload: { content: 'hello' },
    });

    const body = JSON.parse(res.body);
    // This field is in the handler response but NOT in the schema — must be stripped
    expect(body).not.toHaveProperty('notInSchema');
  });

  it('should include all fields when no response schema is defined (GET detail route)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/detail',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Without a response schema, all fields pass through
    expect(body).toHaveProperty('metadata');
    expect(body.metadata).toHaveProperty('actionSnapshots');
  });

  it('should preserve actionSnapshots even when its value includes a valid 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/test/messages',
      payload: { content: 'hello' },
    });

    const body = JSON.parse(res.body);
    // 0 is a valid messageCount for the first action
    expect(body.actionSnapshots.action_1.messageCount).toBe(0);
    expect(typeof body.actionSnapshots.action_1.messageCount).toBe('number');
  });
});
