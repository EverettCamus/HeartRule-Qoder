import { schemaValidator } from '@heartrule/core-engine';
import type { FastifyInstance } from 'fastify';
import * as yaml from 'yaml';

import { ScriptRepository } from '../services/script-repository.js';

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
        // 解析 YAML 内容
        let parsedContent: Record<string, unknown> | null = null;
        try {
          parsedContent = yaml.parse(body.scriptContent);

          // 执行 Schema 验证
          const validationResult = schemaValidator.validateYAML(body.scriptContent);
          if (!validationResult.valid) {
            app.log.warn({ errors: validationResult.errors }, 'Schema validation failed');
            return reply.status(400).send({
              success: false,
              error: 'SCHEMA_VALIDATION_FAILED',
              message: '脚本 Schema 验证失败',
              errors: validationResult.errors,
            });
          }
        } catch (parseError) {
          app.log.warn({ error: parseError }, 'Failed to parse YAML');
          return reply.status(400).send({
            success: false,
            error: 'YAML_PARSE_ERROR',
            message: 'YAML 解析失败',
            details: (parseError as Error).message,
          });
        }

        const repo = new ScriptRepository();
        const script = await repo.create({
          scriptName: body.scriptName,
          scriptType: body.scriptType as 'session' | 'technique' | 'awareness',
          scriptContent: body.scriptContent,
          parsedContent,
          author: body.author,
          description: body.description,
          tags: body.tags,
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
        const repo = new ScriptRepository();
        const script = await repo.findById(id);

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
        const repo = new ScriptRepository();
        const allScripts = await repo.listAll();

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

  // 导入脚本（用于调试功能）
  app.post(
    '/api/scripts/import',
    {
      schema: {
        tags: ['scripts'],
        description: '导入YAML脚本内容到数据库（用于调试）',
        body: {
          type: 'object',
          required: ['yamlContent', 'scriptName'],
          properties: {
            yamlContent: { type: 'string', minLength: 1 },
            scriptName: { type: 'string', minLength: 1 },
            description: { type: 'string' },
            projectId: { type: 'string', format: 'uuid' }, // 添加 projectId
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  scriptId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { yamlContent, scriptName, description, projectId } = request.body as {
        yamlContent: string;
        scriptName: string;
        description?: string;
        projectId?: string; // 添加 projectId
      };

      try {
        const repo = new ScriptRepository();

        // 检查脚本是否已存在
        const existingScript = await repo.findByName(scriptName);

        let scriptId: string;

        // 解析 YAML 内容
        let parsedContent: Record<string, unknown> | null = null;
        try {
          parsedContent = yaml.parse(yamlContent);
          app.log.info({ scriptName }, 'YAML parsed successfully for import');

          // 执行 Schema 验证
          const validationResult = schemaValidator.validateYAML(yamlContent);
          if (!validationResult.valid) {
            app.log.warn(
              { scriptName, errors: validationResult.errors },
              'Schema validation failed during import'
            );
            return reply.status(400).send({
              success: false,
              error: 'SCHEMA_VALIDATION_FAILED',
              message: '脚本 Schema 验证失败',
              errors: validationResult.errors,
            });
          }
          app.log.info({ scriptName }, 'Schema validation passed for import');
        } catch (parseError) {
          app.log.warn({ scriptName, error: parseError }, 'Failed to parse YAML during import');
          return reply.status(400).send({
            success: false,
            error: 'YAML_PARSE_ERROR',
            message: 'YAML 解析失败',
            details: (parseError as Error).message,
          });
        }

        if (existingScript) {
          // 脚本已存在，更新内容
          scriptId = existingScript.id;

          const updateData: {
            scriptContent: string;
            parsedContent: Record<string, unknown> | null;
            description: string;
            tags?: string[];
          } = {
            scriptContent: yamlContent,
            parsedContent,
            description: description || existingScript.description,
          };

          if (projectId) {
            updateData.tags = ['debug', `project:${projectId}`];
          }

          await repo.update(scriptId, updateData);

          app.log.info({ scriptId, scriptName, projectId }, 'Script updated successfully');
        } else {
          // 脚本不存在，插入新记录
          const created = await repo.create({
            scriptName,
            scriptType: 'session',
            scriptContent: yamlContent,
            parsedContent,
            author: 'debug_user',
            description: description || `Debug script: ${scriptName}`,
            tags: projectId ? ['debug', `project:${projectId}`] : ['debug'],
          });
          scriptId = created.id;

          app.log.info({ scriptId, scriptName, projectId }, 'Script imported successfully');
        }

        return {
          success: true,
          data: {
            scriptId: scriptId,
          },
        };
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to import script',
          details: (error as Error).message,
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
        const repo = new ScriptRepository();
        const script = await repo.findById(id);

        if (!script) {
          return reply.status(404).send({
            error: 'Script not found',
          });
        }

        // 使用 SchemaValidator 验证脚本
        const validationResult = schemaValidator.validateYAML(script.scriptContent);

        if (validationResult.valid) {
          return {
            valid: true,
            message: '脚本验证成功',
          };
        } else {
          return reply.status(400).send({
            valid: false,
            message: '脚本验证失败',
            errors: validationResult.errors,
          });
        }
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: 'Failed to validate script',
        });
      }
    }
  );

  // Write back action config to YAML script
  app.post(
    '/api/scripts/:scriptId/actions/:actionId/config',
    {
      schema: {
        tags: ['scripts'],
        description: '将调试后的 action config 回写到 YAML 脚本文件',
        params: {
          type: 'object',
          required: ['scriptId', 'actionId'],
          properties: {
            scriptId: { type: 'string', format: 'uuid' },
            actionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            config: { type: 'object' },
            llmConfig: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { scriptId, actionId } = request.params as {
          scriptId: string;
          actionId: string;
        };
        const body = request.body as {
          config?: Record<string, any>;
          llmConfig?: Record<string, any>;
        };

        const repo = new ScriptRepository();

        // Load script
        const script = await repo.findById(scriptId);
        if (!script) {
          return reply.status(404).send({ error: 'Script not found' });
        }

        // Parse YAML with Document API to preserve formatting
        const doc = yaml.parseDocument(script.scriptContent);
        const phases = doc.getIn(['session', 'phases'], true) as yaml.YAMLSeq | null;
        if (!phases) {
          return reply.status(400).send({ error: '脚本格式异常，缺少 phases 节点' });
        }

        // Find and update the target action within the YAML node tree
        let found = false;
        for (const phaseNode of phases.items as yaml.YAMLMap[]) {
          const topics = phaseNode.get('topics') as yaml.YAMLSeq | undefined;
          if (!topics) continue;
          for (const topicNode of topics.items as yaml.YAMLMap[]) {
            const actions = topicNode.get('actions') as yaml.YAMLSeq | undefined;
            if (!actions) continue;
            for (const actionNode of actions.items as yaml.YAMLMap[]) {
              if (actionNode.get('action_id') === actionId) {
                if (body.config) {
                  for (const [key, val] of Object.entries(body.config)) {
                    actionNode.set(key, val);
                  }
                }
                if (body.llmConfig) {
                  actionNode.set('llm_config', doc.createNode(body.llmConfig));
                }
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (found) break;
        }

        if (!found) {
          return reply.status(400).send({
            error: '目标 action 已被删除，无法回写',
          });
        }

        // Serialize back to YAML preserving original formatting
        const updatedYaml = doc.toString();
        await repo.update(scriptId, { scriptContent: updatedYaml });

        return { success: true };
      } catch (error: any) {
        app.log.error(error);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}
