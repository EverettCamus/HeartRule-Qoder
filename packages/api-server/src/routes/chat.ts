import type { FastifyInstance } from 'fastify';

import { SessionOrchestrator } from '../services/session-orchestrator.js';
import { SessionRepository } from '../services/session-repository.js';

const orchestrator = new SessionOrchestrator();

/**
 * 注册聊天相关路由
 */
export async function registerChatRoutes(app: FastifyInstance) {
  // 发送消息（非流式）
  app.post(
    '/api/chat',
    {
      schema: {
        tags: ['chat'],
        description: '发送消息到会话（非流式响应）',
        body: {
          type: 'object',
          required: ['sessionId', 'message'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            message: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              aiMessage: { type: 'string' },
              sessionStatus: { type: 'string' },
              executionStatus: { type: 'string' },
              extractedVariables: { type: 'object', additionalProperties: true },
              variableStore: {
                type: 'object',
                properties: {
                  global: { type: 'object', additionalProperties: true },
                  session: { type: 'object', additionalProperties: true },
                  phase: { type: 'object', additionalProperties: true },
                  topic: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { sessionId, message } = request.body as {
        sessionId: string;
        message: string;
      };

      try {
        const repo = new SessionRepository();

        // 验证会话是否存在
        const session = await repo.loadSessionById(sessionId).catch(() => null);

        if (!session) {
          return reply.status(404).send({
            error: 'Session not found',
          });
        }

        const result = await orchestrator.processUserInput(sessionId, message);

        return {
          aiMessage: result.aiMessage,
          sessionStatus: result.sessionStatus,
          executionStatus: result.executionStatus,
          extractedVariables: result.variables,
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to process message',
          details: (error as Error).message,
        });
      }
    }
  );

  // 流式聊天（Server-Sent Events）
  app.post(
    '/api/chat/stream',
    {
      schema: {
        tags: ['chat'],
        description: '发送消息到会话（SSE流式响应）',
        body: {
          type: 'object',
          required: ['sessionId', 'message'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            message: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const { sessionId, message } = request.body as {
        sessionId: string;
        message: string;
      };

      try {
        const repo = new SessionRepository();

        // 验证会话
        const session = await repo.loadSessionById(sessionId).catch(() => null);

        if (!session) {
          return reply.status(404).send({
            error: 'Session not found',
          });
        }

        // 设置SSE响应头
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // 保存用户消息
        await repo.saveUserMessage(sessionId, message);

        // TODO: 实现真实的流式响应
        // 模拟流式输出
        const mockResponse = '这是一个模拟的流式响应。';
        for (let i = 0; i < mockResponse.length; i++) {
          reply.raw.write(`data: ${JSON.stringify({ chunk: mockResponse[i] })}\n\n`);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        reply.raw.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        reply.raw.end();
      } catch (error) {
        app.log.error(error);
        reply.raw.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
        reply.raw.end();
      }
    }
  );
}
