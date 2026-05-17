import { ExecutionStatus, ErrorCode } from '@heartrule/shared-types';
import { eq, sql, count, inArray, and } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';
import { sessions, messages, scripts, debugEntries } from '../db/schema.js';
import { SessionOrchestrator } from '../services/session-orchestrator.js';
import { enhancePositionWithIds } from '../services/session-variable-utils.js';
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
            projectId: { type: 'string', format: 'uuid' },
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
              actionSnapshots: { type: 'object', additionalProperties: true },
              rerunHistory: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              currentRunId: { type: 'string' },
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
      const {
        userId,
        scriptId,
        initialVariables,
        projectId: bodyProjectId,
      } = request.body as {
        userId: string;
        scriptId: string;
        initialVariables?: Record<string, unknown>;
        projectId?: string;
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
        const projectTag = tags.find((tag) => tag.startsWith('project:'));
        const projectId =
          bodyProjectId || (projectTag ? projectTag.replace('project:', '') : undefined);

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

        // Auto-cleanup: keep max 50 sessions per project
        if (projectId) {
          await db.transaction(async (tx) => {
            const projectSessionCountResult = await tx
              .select({ count: count() })
              .from(sessions)
              .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`);
            const projectSessionCount = projectSessionCountResult[0]?.count ?? 0;

            if (projectSessionCount > 50) {
              const excessCount = projectSessionCount - 50;
              const oldestToDelete = await tx
                .select({ id: sessions.id })
                .from(sessions)
                .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`)
                .orderBy(sql`${sessions.updatedAt} ASC`)
                .limit(excessCount);

              for (const old of oldestToDelete) {
                await tx.delete(messages).where(eq(messages.sessionId, old.id));
                await tx.delete(sessions).where(eq(sessions.id, old.id));
              }
              app.log.info({ deletedCount: oldestToDelete.length }, 'Auto-cleaned old sessions');
            }
          });
        }

        // 初始化会话，获取第一条 AI 消息
        const orchestrator = new SessionOrchestrator();
        const initResult = await orchestrator.initializeSession(sessionId);

        // 调试日志
        app.log.info(
          {
            aiMessage: initResult.aiMessage?.substring(0, 100),
            executionStatus: initResult.executionStatus,
            hasError: !!initResult.error,
          },
          'Session initialized'
        );

        const responseData: any = {
          sessionId,
          status: 'active',
          createdAt: now.toISOString(),
          aiMessage: initResult.aiMessage,
          executionStatus: initResult.executionStatus,
          currentRunId: initResult.currentRunId,
          variables: initResult.variables,
          globalVariables: initResult.globalVariables,
          position: initResult.position,
          actionSnapshots: (initResult as any).actionSnapshots,
          rerunHistory: (initResult as any).rerunHistory,
        };

        if (initResult.error) {
          responseData.error = initResult.error;
        }

        app.log.info(
          {
            sessionId,
            status: responseData.status,
            executionStatus: responseData.executionStatus,
          },
          'Returning response'
        );

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

  // 列出项目的调试会话
  app.get(
    '/api/sessions',
    {
      schema: {
        tags: ['sessions'],
        description: '列出项目的调试会话（最近50个）',
        querystring: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
            limit: { type: 'number', default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId, limit = 50 } = request.query as {
        projectId: string;
        limit: number;
      };

      try {
        // Query sessions where metadata->>'projectId' matches
        const projectSessions = await db
          .select({
            id: sessions.id,
            scriptId: sessions.scriptId,
            executionStatus: sessions.executionStatus,
            position: sessions.position,
            createdAt: sessions.createdAt,
            updatedAt: sessions.updatedAt,
          })
          .from(sessions)
          .where(sql`(((${sessions.metadata}#>>'{}'))::jsonb->>'projectId') = ${projectId}`)
          .orderBy(sql`${sessions.updatedAt} DESC`)
          .limit(Math.min(limit, 50));

        // Batch query: all scripts and message counts at once
        const sessionIds = projectSessions.map((s) => s.id);

        // Early return for empty results to avoid inArray() with empty array
        if (sessionIds.length === 0) {
          return { success: true, data: [] };
        }

        const scriptIds = [...new Set(projectSessions.map((s) => s.scriptId).filter(Boolean))];

        const [scriptRows, msgCountRows] = await Promise.all([
          scriptIds.length > 0
            ? db
                .select({ id: scripts.id, scriptName: scripts.scriptName })
                .from(scripts)
                .where(inArray(scripts.id, scriptIds))
            : [],
          db
            .select({ sessionId: messages.sessionId, count: count() })
            .from(messages)
            .where(inArray(messages.sessionId, sessionIds))
            .groupBy(messages.sessionId),
        ]);

        const scriptNameMap = new Map(scriptRows.map((r) => [r.id, r.scriptName]));
        const msgCountMap = new Map(msgCountRows.map((r) => [r.sessionId, r.count]));

        // Enrich with script file name and message count (no per-session queries)
        const enriched = projectSessions.map((s) => ({
          sessionId: s.id,
          scriptId: s.scriptId,
          scriptFileName: scriptNameMap.get(s.scriptId) || 'unknown.yaml',
          executionStatus: s.executionStatus,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
          position: s.position,
          messageCount: msgCountMap.get(s.id) ?? 0,
        }));

        return { success: true, data: enriched };
      } catch (error) {
        logError(app.log, error, { projectId });
        return reply.status(500).send({
          success: false,
          error: 'Failed to list sessions',
        });
      }
    }
  );

  // 删除调试会话
  app.delete(
    '/api/sessions/:id',
    {
      schema: {
        tags: ['sessions'],
        description: '删除调试会话及其消息',
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
          return reply.status(404).send({ success: false, error: 'Session not found' });
        }

        await db.delete(messages).where(eq(messages.sessionId, id));
        await db.delete(sessions).where(eq(sessions.id, id));

        return { success: true };
      } catch (error) {
        logError(app.log, error, { sessionId: id });
        return reply.status(500).send({ success: false, error: 'Failed to delete session' });
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
          const enhanced = enhancePositionWithIds(
            script.parsedContent,
            session.position as any,
            (session.metadata as any) || {}
          );
          if (enhanced) {
            response.position = enhanced;
            app.log.info(
              {
                originalPosition: session.position,
                enhancedPosition: enhanced,
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

        // Filter out superseded messages (created by rerun/rollback)
        const activeMessages = sessionMessages.filter(
          (msg) => !((msg.metadata as Record<string, any>)?.superseded === true)
        );

        // 转换为前端期望的格式
        const formattedMessages = activeMessages.map((msg) => ({
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

  // 获取调试信息条目
  app.get(
    '/api/sessions/:id/debug-entries',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        querystring: {
          type: 'object',
          properties: { runId: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { runId } = request.query as { runId?: string };

      try {
        const conditions = [eq(debugEntries.sessionId, id)];
        if (runId) {
          conditions.push(eq(debugEntries.runId, runId));
        }

        const entries = await db.query.debugEntries.findMany({
          where: and(...conditions),
          orderBy: (debugEntries, { asc }) => [
            asc(debugEntries.phaseId),
            asc(debugEntries.topicId),
            asc(debugEntries.actionId),
            asc(debugEntries.round),
            asc(debugEntries.createdAt),
          ],
        });

        return {
          success: true,
          data: entries,
          total: entries.length,
        };
      } catch (error) {
        logError(app.log, error, { sessionId: id });
        return reply.status(500).send({
          success: false,
          error: 'Failed to get debug entries',
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
            content: { type: 'string' }, // 允许空字符串（用于 ai_say max_rounds=1 确认）
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
              actionStatus: { type: 'string', enum: ['running', 'completed', 'error'] },
              currentRound: { type: 'number' },
              maxRounds: { type: 'number' },
              roundChanges: {
                type: 'object',
                properties: {
                  round: { type: 'number' },
                  timestamp: { type: 'string' },
                  changes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        fromValue: {},
                        toValue: {},
                        scope: { type: 'string' },
                      },
                    },
                  },
                },
              },
              exitReason: { type: 'string' },
              actionSnapshots: { type: 'object', additionalProperties: true },
              rerunHistory: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
              },
              currentRunId: { type: 'string' },
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

        if (
          session.executionStatus === ExecutionStatus.COMPLETED ||
          session.executionStatus === ExecutionStatus.ERROR
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: ErrorCode.SESSION_ENDED,
              type: 'session',
              message: `会话已结束 (${session.executionStatus})，无法继续发送消息`,
              details: `Session execution status is "${session.executionStatus}"`,
              context: {
                sessionId: id,
                executionStatus: session.executionStatus,
                timestamp: new Date().toISOString(),
              },
              recovery: {
                canRetry: false,
                retryAction: 'Create a new debugging session',
                suggestions: ['该会话的脚本已执行完毕，请重新开始调试'],
              },
            },
            aiMessage: '',
            executionStatus: session.executionStatus,
            sessionStatus: session.status,
          };
        }

        // 获取脚本信息
        script = await db.query.scripts.findFirst({
          where: eq(scripts.id, session.scriptId),
        });

        // 调用 SessionOrchestrator 处理用户输入
        const orchestrator = new SessionOrchestrator();
        const result = await orchestrator.processUserInput(id, content);

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
          currentRunId: result.currentRunId,
          variables: result.variables,
          globalVariables: result.globalVariables,
          variableStore: result.variableStore,
          position: result.position,
          // 变量编辑所需字段
          actionStatus: (result as any).actionStatus,
          currentRound: (result as any).currentRound,
          maxRounds: (result as any).maxRounds,
          roundChanges: (result as any).roundChanges,
          exitReason: (result as any).exitReason,
          // 回退/重运行所需字段
          actionSnapshots: (result as any).actionSnapshots,
          rerunHistory: (result as any).rerunHistory,
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

  // 更新会话变量（手动编辑）
  app.patch(
    '/api/sessions/:id/variables',
    {
      schema: {
        tags: ['sessions'],
        description: '手动更新会话变量值',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['variableName', 'scope', 'value'],
          properties: {
            variableName: { type: 'string' },
            scope: { type: 'string', enum: ['global', 'session', 'phase', 'topic'] },
            value: {},
            phaseId: { type: 'string' },
            topicId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { variableName, scope, value, phaseId, topicId } = request.body as {
        variableName: string;
        scope: string;
        value: unknown;
        phaseId?: string;
        topicId?: string;
      };

      try {
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, id),
        });

        if (!session) {
          return reply.status(404).send({ success: false, error: 'Session not found' });
        }

        if (
          session.executionStatus === ExecutionStatus.COMPLETED ||
          session.executionStatus === ExecutionStatus.ERROR
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: ErrorCode.SESSION_ENDED,
              type: 'session',
              message: `会话已结束 (${session.executionStatus})，无法修改变量`,
            },
          };
        }

        const orchestrator = new SessionOrchestrator();
        const result = await orchestrator.updateVariable(session as any, {
          variableName,
          scope,
          value,
          phaseId,
          topicId,
        });

        return { success: true, ...result };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({ success: false, error: 'Failed to update variable' });
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

  // Rerun action
  app.post(
    '/api/sessions/:sessionId/rerun',
    {
      schema: {
        tags: ['sessions'],
        description: '回退到指定 action 起点并重新执行',
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            targetActionId: { type: 'string' },
            config: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                tone: { type: 'string' },
                max_rounds: { type: 'number' },
                output: { type: 'array' },
              },
            },
            llmConfig: {
              type: 'object',
              properties: {
                provider: { type: 'string' },
                model: { type: 'string' },
                temperature: { type: 'number' },
                maxTokens: { type: 'number' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { sessionId } = request.params as { sessionId: string };
        const body =
          (request.body as {
            targetActionId?: string;
            config?: Record<string, any>;
            llmConfig?: Record<string, any>;
          }) || {};

        const orchestrator = new SessionOrchestrator();

        const result = await orchestrator.rerunAction(
          sessionId,
          body.targetActionId,
          body.config,
          body.llmConfig
        );

        return result;
      } catch (error: any) {
        if (error.statusCode === 400) {
          return reply.status(400).send({ error: error.message });
        }
        logError(app.log, error, {
          sessionId: (request.params as any)?.sessionId,
        });
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}
