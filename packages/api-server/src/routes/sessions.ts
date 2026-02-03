import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';
import { sessions, messages, scripts } from '../db/schema.js';
import { SessionManager } from '../services/session-manager.js';
import { sendErrorResponse, logError } from '../utils/error-handler.js';

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
              position: { type: 'object', additionalProperties: true },
              debugInfo: {
                type: 'object',
                properties: {
                  prompt: { type: 'string' },
                  response: { type: 'object', additionalProperties: true },
                  model: { type: 'string' },
                  config: { type: 'object', additionalProperties: true },
                  timestamp: { type: 'string' },
                  tokensUsed: { type: 'number' },
                },
              },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  type: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'string' },
                  context: { type: 'object' },
                  recovery: { type: 'object' },
                },
              },
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

      let script: any = null;

      try {
        // 验证脚本是否存在
        script = await db.query.scripts.findFirst({
          where: eq(scripts.id, scriptId),
        });

        if (!script) {
          return sendErrorResponse(reply, new Error('Script not found'), {
            scriptId,
          });
        }

        // 从 script.tags 中提取 projectId
        const tags = (script.tags as string[]) || [];
        const projectTag = tags.find(tag => tag.startsWith('project:'));
        const projectId = projectTag ? projectTag.replace('project:', '') : undefined;
        
        app.log.info({ scriptId, projectId, tags }, 'Creating session with projectId');

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
          metadata: projectId ? { projectId } : {}, // 保存 projectId 到 metadata
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
            hasError: !!initResult.error,
            fullResult: initResult,
          },
          'Session initialized'
        );

        const responseData: any = {
          sessionId,
          status: 'active',
          createdAt: now.toISOString(),
          aiMessage: initResult.aiMessage,
          executionStatus: initResult.executionStatus,
          variables: initResult.variables, // 返回变量
          globalVariables: initResult.globalVariables, // 返回全局变量
          position: initResult.position,
          debugInfo: initResult.debugInfo, // 添加 LLM 调试信息
        };

        // 如果有错误信息，添加到响应中
        if (initResult.error) {
          responseData.error = initResult.error;
        }

        app.log.info({ responseData }, 'Returning response');

        return responseData;
      } catch (error) {
        logError(app.log, error, { userId, scriptId });
        return sendErrorResponse(reply, error, {
          scriptId,
          scriptName: script?.scriptName,
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

        // 获取脚本信息以便构建导航树
        const script = await db.query.scripts.findFirst({
          where: eq(scripts.id, session.scriptId),
        });

        app.log.info(
          {
            sessionId: id,
            scriptId: session.scriptId,
            hasScript: !!script,
            hasParsedContent: !!script?.parsedContent,
            parsedContentKeys: script?.parsedContent
              ? Object.keys(script.parsedContent as any)
              : [],
          },
          'Session detail - script info'
        );

        // 返回会话信息，包含脚本的解析内容
        const response: any = Object.assign({}, session);
        response.sessionId = session.id; // 显式添加 sessionId 字段
        response.metadata = Object.assign({}, session.metadata || {});
        response.metadata.script = script?.parsedContent || null;

        // 从 metadata 中提取 globalVariables
        const sessionMetadata = (session.metadata as any) || {};
        if (sessionMetadata.globalVariables) {
          response.globalVariables = sessionMetadata.globalVariables;
        }

        // 构建完整的 position 信息（包含 ID 字段）
        if (script?.parsedContent && session.position) {
          const pos = session.position as any;
          const parsedScript = script.parsedContent as any;
          const sessionData = parsedScript.session || parsedScript;
          const phases = sessionData.phases || [];

          // 从 metadata 中提取回合数信息
          const metadata = (session.metadata as any) || {};
          const roundInfo = metadata.lastActionRoundInfo || metadata.actionState || {};

          if (phases.length > pos.phaseIndex) {
            const phase = phases[pos.phaseIndex];
            response.position = {
              phaseIndex: pos.phaseIndex,
              phaseId: phase.phase_id || `phase_${pos.phaseIndex}`,
              topicIndex: pos.topicIndex,
              topicId: '',
              actionIndex: pos.actionIndex,
              actionId: '',
              actionType: '',
              // 添加回合数信息
              currentRound: roundInfo.currentRound,
              maxRounds: roundInfo.maxRounds,
            };

            if (phase.topics && phase.topics.length > pos.topicIndex) {
              const topic = phase.topics[pos.topicIndex];
              response.position.topicId = topic.topic_id || `topic_${pos.topicIndex}`;

              if (topic.actions && topic.actions.length > pos.actionIndex) {
                const action = topic.actions[pos.actionIndex];
                response.position.actionId = action.action_id || `action_${pos.actionIndex}`;
                response.position.actionType = action.action_type || 'unknown';
              }
            }

            app.log.info(
              {
                originalPosition: pos,
                enhancedPosition: response.position,
              },
              'Session detail - enhanced position with IDs'
            );
          }
        }

        app.log.info(
          {
            hasMetadataScript: !!response.metadata.script,
            metadataScriptKeys: response.metadata.script
              ? Object.keys(response.metadata.script)
              : [],
          },
          'Session detail - response metadata'
        );

        return response;
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
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    messageId: { type: 'string' },
                    role: { type: 'string' },
                    content: { type: 'string' },
                    timestamp: { type: 'string' },
                    actionId: { type: 'string' },
                    metadata: { type: 'object' },
                  },
                },
              },
            },
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

        // 转换为前端期望的格式
        const formattedMessages = sessionMessages.map((msg) => ({
          messageId: msg.id,
          role: msg.role === 'assistant' ? 'ai' : msg.role, // 'assistant' -> 'ai'
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
          actionId: msg.actionId,
          metadata: msg.metadata,
        }));

        return {
          success: true,
          data: formattedMessages,
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to get messages',
        });
      }
    }
  );

  // 发送消息到会话（用于调试功能）
  app.post(
    '/api/sessions/:id/messages',
    {
      schema: {
        tags: ['sessions'],
        description: '向会话发送消息并获取AI响应',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string', minLength: 1 },
          },
        },
        response: {
          200: {
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
              debugInfo: {
                type: 'object',
                properties: {
                  prompt: { type: 'string' },
                  response: { type: 'object', additionalProperties: true },
                  model: { type: 'string' },
                  config: { type: 'object', additionalProperties: true },
                  timestamp: { type: 'string' },
                  tokensUsed: { type: 'number' },
                },
              },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  type: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'string' },
                  context: {
                    type: 'object',
                    properties: {
                      scriptId: { type: 'string' },
                      scriptName: { type: 'string' },
                      sessionId: { type: 'string' },
                      timestamp: { type: 'string' },
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
                        },
                      },
                    },
                  },
                  recovery: {
                    type: 'object',
                    properties: {
                      canRetry: { type: 'boolean' },
                      retryAction: { type: 'string' },
                      suggestion: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };

      let session: any = null;
      let script: any = null;

      try {
        // 验证会话是否存在
        session = await db.query.sessions.findFirst({
          where: eq(sessions.id, id),
        });

        if (!session) {
          return sendErrorResponse(reply, new Error('Session not found'), {
            sessionId: id,
          });
        }

        // 获取脚本信息
        script = await db.query.scripts.findFirst({
          where: eq(scripts.id, session.scriptId),
        });

        // 调用SessionManager处理用户输入
        const sessionManager = new SessionManager();
        const result = await sessionManager.processUserInput(id, content);

        app.log.info(
          {
            sessionId: id,
            hasPosition: !!result.position,
            position: result.position,
            hasError: !!result.error,
          },
          'Sending response with position and error'
        );

        const response: any = {
          aiMessage: result.aiMessage,
          sessionStatus: result.sessionStatus,
          executionStatus: result.executionStatus,
          variables: result.variables,
          globalVariables: result.globalVariables, // 返回全局变量
          variableStore: result.variableStore, // 🔧 添加分层变量存储（包含提取的变量）
          position: result.position,
          debugInfo: result.debugInfo, // 添加 LLM 调试信息
        };

        // 记录完整响应（特别是position字段）
        app.log.info(
          {
            sessionId: id,
            responsePosition: response.position,
            hasCurrentRound: response.position?.currentRound !== undefined,
          },
          '📤 Sending response to client'
        );

        // 如果有错误信息，添加到响应中
        if (result.error) {
          response.error = result.error;
        }

        return response;
      } catch (error) {
        logError(app.log, error, { sessionId: id, userInput: content });
        return sendErrorResponse(reply, error, {
          sessionId: id,
          scriptId: session?.scriptId,
          scriptName: script?.scriptName,
          position: session?.position
            ? {
                phaseIndex: session.position.phaseIndex,
                topicIndex: session.position.topicIndex,
                actionIndex: session.position.actionIndex,
              }
            : undefined,
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
