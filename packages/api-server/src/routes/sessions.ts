import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';
import { sessions, messages, scripts } from '../db/schema.js';
import { SessionManager } from '../services/session-manager.js';

/**
 * 注册会话相关路由
 */
export async function registerSessionRoutes(app: FastifyInstance) {
  // 创建会话
  app.post(
    '/api/sessions',
    {
      schema: {
        tags: ['sessions'],
        description: '创建新的咨询会话',
        body: {
          type: 'object',
          required: ['userId', 'scriptId'],
          properties: {
            userId: { type: 'string', minLength: 1 },
            scriptId: { type: 'string', format: 'uuid' },
            initialVariables: { type: 'object', additionalProperties: true },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', format: 'uuid' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
              aiMessage: { type: 'string' },
              executionStatus: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId, scriptId, initialVariables } = request.body as {
        userId: string;
        scriptId: string;
        initialVariables?: Record<string, unknown>;
      };

      try {
        // 验证脚本是否存在
        const script = await db.query.scripts.findFirst({
          where: eq(scripts.id, scriptId),
        });

        if (!script) {
          return reply.status(404).send({
            error: 'Script not found',
          });
        }

        // 创建会话
        const sessionId = uuidv4();
        const now = new Date();

        await db.insert(sessions).values({
          id: sessionId,
          userId,
          scriptId,
          status: 'active',
          executionStatus: 'running',
          position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
          variables: initialVariables || {},
          metadata: {},
          createdAt: now,
          updatedAt: now,
        });

        // 初始化会话，获取第一条 AI 消息
        const sessionManager = new SessionManager();
        const initResult = await sessionManager.initializeSession(sessionId);

        // 调试日志
        app.log.info(
          {
            aiMessage: initResult.aiMessage,
            executionStatus: initResult.executionStatus,
            fullResult: initResult,
          },
          'Session initialized'
        );

        const responseData = {
          sessionId,
          status: 'active',
          createdAt: now.toISOString(),
          aiMessage: initResult.aiMessage,
          executionStatus: initResult.executionStatus,
        };

        app.log.info({ responseData }, 'Returning response');

        return responseData;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to create session',
          details: (error as Error).message,
        });
      }
    }
  );

  // 获取会话详情
  app.get(
    '/api/sessions/:id',
    {
      schema: {
        tags: ['sessions'],
        description: '获取会话详细信息',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, id),
        });

        if (!session) {
          return reply.status(404).send({
            error: 'Session not found',
          });
        }

        return session;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get session',
        });
      }
    }
  );

  // 获取会话消息历史
  app.get(
    '/api/sessions/:id/messages',
    {
      schema: {
        tags: ['sessions'],
        description: '获取会话的所有消息',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const sessionMessages = await db.query.messages.findMany({
          where: eq(messages.sessionId, id),
          orderBy: (messages, { asc }) => [asc(messages.timestamp)],
        });

        return sessionMessages;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get messages',
        });
      }
    }
  );

  // 获取会话变量
  app.get(
    '/api/sessions/:id/variables',
    {
      schema: {
        tags: ['sessions'],
        description: '获取会话的所有变量',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, id),
        });

        if (!session) {
          return reply.status(404).send({
            error: 'Session not found',
          });
        }

        return session.variables;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get variables',
        });
      }
    }
  );

  // 列出用户的所有会话
  app.get(
    '/api/users/:userId/sessions',
    {
      schema: {
        tags: ['sessions'],
        description: '获取用户的所有会话',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };

      try {
        const userSessions = await db.query.sessions.findMany({
          where: eq(sessions.userId, userId),
          orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
        });

        return userSessions;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to list sessions',
        });
      }
    }
  );
}
