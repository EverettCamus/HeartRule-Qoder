import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { projects, projectDrafts, scriptFiles, projectVersions } from '../db/schema.js';
import { eq, and, desc, like, or, SQL } from 'drizzle-orm';

// Schema定义
const createProjectSchema = z.object({
  projectName: z.string().min(1).max(255),
  description: z.string().default(''),
  engineVersion: z.string().default('1.2.0'),
  engineVersionMin: z.string().default('1.0.0'),
  author: z.string(),
  tags: z.array(z.string()).default([]),
});

const updateProjectSchema = z.object({
  projectName: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  engineVersion: z.string().optional(),
  engineVersionMin: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const projectsRoutes: FastifyPluginAsync = async (fastify) => {
  // 获取工程列表
  fastify.get('/projects', async (request, reply) => {
    try {
      const { status, search, author } = request.query as {
        status?: string;
        search?: string;
        author?: string;
      };

      // 构建查询条件
      const conditions: SQL[] = [];
      if (status && status !== 'all') {
        conditions.push(eq(projects.status, status as any));
      }
      if (author) {
        conditions.push(eq(projects.author, author));
      }
      if (search) {
        conditions.push(
          or(
            like(projects.projectName, `%${search}%`),
            like(projects.description, `%${search}%`)
          )!
        );
      }

      const result = conditions.length > 0
        ? await db.select().from(projects).where(and(...conditions)!).orderBy(desc(projects.updatedAt))
        : await db.select().from(projects).orderBy(desc(projects.updatedAt));

      // 为每个工程附加文件数量
      const projectsWithFileCount = await Promise.all(
        result.map(async (project) => {
          const files = await db
            .select()
            .from(scriptFiles)
            .where(eq(scriptFiles.projectId, project.id));

          return {
            ...project,
            fileCount: files.length,
          };
        })
      );

      return reply.send({
        success: true,
        data: projectsWithFileCount,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch projects',
      });
    }
  });

  // 获取单个工程详情
  fastify.get('/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id));

      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // 获取工程文件
      const files = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, id));

      // 获取草稿
      const [draft] = await db
        .select()
        .from(projectDrafts)
        .where(eq(projectDrafts.projectId, id));

      // 获取版本历史
      const versions = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, id))
        .orderBy(desc(projectVersions.publishedAt));

      return reply.send({
        success: true,
        data: {
          ...project,
          files,
          draft,
          versions,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch project',
      });
    }
  });

  // 创建新工程
  fastify.post('/projects', async (request, reply) => {
    try {
      const body = createProjectSchema.parse(request.body);

      // 创建工程
      const [newProject] = await db
        .insert(projects)
        .values({
          projectName: body.projectName,
          description: body.description,
          engineVersion: body.engineVersion,
          engineVersionMin: body.engineVersionMin,
          author: body.author,
          tags: body.tags,
          status: 'draft',
        })
        .returning();

      // 创建默认文件
      const defaultFiles = [
        { fileType: 'global', fileName: 'global.yaml', fileContent: { variables: [] } },
        { fileType: 'roles', fileName: 'roles.yaml', fileContent: { roles: [] } },
        { fileType: 'skills', fileName: 'skills.yaml', fileContent: { skills: [] } },
      ];

      await db.insert(scriptFiles).values(
        defaultFiles.map((file) => ({
          projectId: newProject.id,
          fileType: file.fileType as any,
          fileName: file.fileName,
          fileContent: file.fileContent,
        }))
      );

      // 创建初始草稿
      await db.insert(projectDrafts).values({
        projectId: newProject.id,
        draftFiles: {},
        updatedBy: body.author,
        validationStatus: 'unknown',
      });

      return reply.status(201).send({
        success: true,
        data: newProject,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create project',
      });
    }
  });

  // 更新工程信息
  fastify.put('/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateProjectSchema.parse(request.body);

      const [updated] = await db
        .update(projects)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update project',
      });
    }
  });

  // 归档工程
  fastify.delete('/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [archived] = await db
        .update(projects)
        .set({
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      if (!archived) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      return reply.send({
        success: true,
        data: archived,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to archive project',
      });
    }
  });

  // 复制工程
  fastify.post('/projects/:id/copy', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { author } = request.body as { author: string };

      // 获取原工程
      const [originalProject] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id));

      if (!originalProject) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // 创建新工程
      const [newProject] = await db
        .insert(projects)
        .values({
          projectName: `${originalProject.projectName}（副本）`,
          description: originalProject.description,
          engineVersion: originalProject.engineVersion,
          engineVersionMin: originalProject.engineVersionMin,
          author: author || originalProject.author,
          tags: originalProject.tags,
          status: 'draft',
        })
        .returning();

      // 复制文件
      const originalFiles = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, id));

      if (originalFiles.length > 0) {
        await db.insert(scriptFiles).values(
          originalFiles.map((file) => ({
            projectId: newProject.id,
            fileType: file.fileType,
            fileName: file.fileName,
            fileContent: file.fileContent,
            yamlContent: file.yamlContent,
          }))
        );
      }

      // 创建草稿
      await db.insert(projectDrafts).values({
        projectId: newProject.id,
        draftFiles: {},
        updatedBy: author || originalProject.author,
        validationStatus: 'unknown',
      });

      return reply.status(201).send({
        success: true,
        data: newProject,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to copy project',
      });
    }
  });

  // 获取工程文件列表
  fastify.get('/projects/:id/files', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const files = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, id))
        .orderBy(scriptFiles.fileType);

      return reply.send({
        success: true,
        data: files,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch files',
      });
    }
  });

  // 获取单个文件
  fastify.get('/projects/:id/files/:fileId', async (request, reply) => {
    try {
      const { id, fileId } = request.params as { id: string; fileId: string };

      const [file] = await db
        .select()
        .from(scriptFiles)
        .where(and(eq(scriptFiles.projectId, id), eq(scriptFiles.id, fileId))!);

      if (!file) {
        return reply.status(404).send({
          success: false,
          error: 'File not found',
        });
      }

      return reply.send({
        success: true,
        data: file,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch file',
      });
    }
  });

  // 创建新文件
  fastify.post('/projects/:id/files', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { fileType, fileName, fileContent } = request.body as {
        fileType: string;
        fileName: string;
        fileContent: any;
      };

      const [newFile] = await db
        .insert(scriptFiles)
        .values({
          projectId: id,
          fileType: fileType as any,
          fileName,
          fileContent,
        })
        .returning();

      return reply.status(201).send({
        success: true,
        data: newFile,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to create file',
      });
    }
  });

  // 更新文件
  fastify.put('/projects/:id/files/:fileId', async (request, reply) => {
    try {
      const { id, fileId } = request.params as { id: string; fileId: string };
      const { fileName, fileContent, yamlContent } = request.body as {
        fileName?: string;
        fileContent?: any;
        yamlContent?: string;
      };

      const [updated] = await db
        .update(scriptFiles)
        .set({
          ...(fileName && { fileName }),
          ...(fileContent && { fileContent }),
          ...(yamlContent !== undefined && { yamlContent }),
          updatedAt: new Date(),
        })
        .where(and(eq(scriptFiles.projectId, id), eq(scriptFiles.id, fileId))!)
        .returning();

      if (!updated) {
        return reply.status(404).send({
          success: false,
          error: 'File not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update file',
      });
    }
  });

  // 删除文件
  fastify.delete('/projects/:id/files/:fileId', async (request, reply) => {
    try {
      const { id, fileId } = request.params as { id: string; fileId: string };

      const deleted = await db
        .delete(scriptFiles)
        .where(and(eq(scriptFiles.projectId, id), eq(scriptFiles.id, fileId))!)
        .returning();

      if (deleted.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'File not found',
        });
      }

      return reply.send({
        success: true,
        data: deleted[0],
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete file',
      });
    }
  });
};

export default projectsRoutes;
