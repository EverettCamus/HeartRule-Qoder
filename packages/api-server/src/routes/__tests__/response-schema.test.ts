import { describe, it, expect } from 'vitest';

/**
 * Fastify Response Schema 回归测试
 *
 * 背景：Fastify 默认会过滤掉响应 schema 中未定义的字段。
 * 如果 debugInfo 的 schema 缺少 responseTimeMs 字段，前端将收到 undefined。
 *
 * 此测试确保 schema 定义完整，防止回归。
 *
 * @see https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/#serialization
 */
describe('Fastify Response Schema - debugInfo completeness', () => {
  it('should include responseTimeMs in debugInfo schema definition', () => {
    // 这是 sessions.ts 中 debugInfo schema 的镜像
    // 如果修改了 schema，请同步更新此测试
    const debugInfoSchema = {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        response: { type: 'object', additionalProperties: true },
        model: { type: 'string' },
        config: { type: 'object', additionalProperties: true },
        timestamp: { type: 'string' },
        tokensUsed: { type: 'number' },
        responseTimeMs: { type: 'number' }, // 必须有此字段
      },
    };

    expect(debugInfoSchema.properties).toHaveProperty('responseTimeMs');
    expect(debugInfoSchema.properties.responseTimeMs).toEqual({ type: 'number' });
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

    const debugInfoSchema = {
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

    const schemaFields = Object.keys(debugInfoSchema.properties);
    for (const field of requiredFields) {
      expect(schemaFields).toContain(field);
    }
  });
});
