import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';
import { sessions, messages } from '../db/schema.js';
import { SessionManager } from '../services/session-manager.js';

// 创建SessionManager单例
const sessionManager = new SessionManager();

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
        // 验证会话是否存在
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
        });

        if (!session) {
          return reply.status(404).send({
            error: 'Session not found',
          });
        }

        // 调用SessionManager处理用户输入
        const result = await sessionManager.processUserInput(sessionId, message);

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
        // 验证会话
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
        });

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
        const userMessageId = uuidv4();
        await db.insert(messages).values({
          id: userMessageId,
          sessionId,
          role: 'user',
          content: message,
          metadata: {},
          timestamp: new Date(),
        });

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
