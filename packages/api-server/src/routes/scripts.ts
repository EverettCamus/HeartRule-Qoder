import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { scripts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * 注册脚本管理路由
 */
export async function registerScriptRoutes(app: FastifyInstance) {
  // 创建脚本
  app.post(
    '/api/scripts',
    {
      schema: {
        tags: ['scripts'],
        description: '创建新的YAML脚本',
        body: {
          type: 'object',
          required: ['scriptName', 'scriptType', 'scriptContent', 'author'],
          properties: {
            scriptName: { type: 'string', minLength: 1 },
            scriptType: { type: 'string' },
            scriptContent: { type: 'string' },
            author: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        scriptName: string;
        scriptType: string;
        scriptContent: string;
        author: string;
        description?: string;
        tags?: string[];
      };

      try {
        const scriptId = uuidv4();
        const now = new Date();

        await db.insert(scripts).values({
          id: scriptId,
          scriptName: body.scriptName,
          scriptType: body.scriptType as 'session' | 'technique' | 'awareness',
          scriptContent: body.scriptContent,
          version: '1.0.0',
          status: 'draft',
          author: body.author,
          description: body.description || '',
          tags: body.tags || [],
          createdAt: now,
          updatedAt: now,
        });

        const script = await db.query.scripts.findFirst({
          where: eq(scripts.id, scriptId),
        });

        return script;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to create script',
          details: (error as Error).message,
        });
      }
    }
  );

  // 获取脚本详情
  app.get(
    '/api/scripts/:id',
    {
      schema: {
        tags: ['scripts'],
        description: '获取脚本详细信息',
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
        const script = await db.query.scripts.findFirst({
          where: eq(scripts.id, id),
        });

        if (!script) {
          return reply.status(404).send({
            error: 'Script not found',
          });
        }

        return script;
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to get script',
        });
      }
    }
  );

  // 列出脚本
  app.get(
    '/api/scripts',
    {
      schema: {
        tags: ['scripts'],
        description: '列出所有脚本',
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['session', 'technique', 'awareness'] },
            status: { type: 'string', enum: ['draft', 'published', 'archived'] },
          },
        },
      },
    },
    async (_request, reply) => {
      // TODO: 实现type和status过滤
      // const { type, status } = _request.query as {
      //   type?: 'session' | 'technique' | 'awareness';
      //   status?: 'draft' | 'published' | 'archived';
      // };

      try {
        let query = db.query.scripts.findMany({
          orderBy: (scripts, { desc }) => [desc(scripts.createdAt)],
        });

        // TODO: 根据type和status过滤
        const allScripts = await query;

        return {
          scripts: allScripts,
          total: allScripts.length,
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to list scripts',
        });
      }
    }
  );

  // 验证脚本
  app.post(
    '/api/scripts/:id/validate',
    {
      schema: {
        tags: ['scripts'],
        description: '验证YAML脚本的正确性',
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
        const script = await db.query.scripts.findFirst({
          where: eq(scripts.id, id),
        });

        if (!script) {
          return reply.status(404).send({
            error: 'Script not found',
          });
        }

        // TODO: 使用YAMLParser验证脚本
        // 目前返回模拟结果
        return {
          valid: true,
          message: 'Script validation successful (mock)',
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to validate script',
        });
      }
    }
  );
}
