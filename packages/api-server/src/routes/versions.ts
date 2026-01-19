import { eq, desc, and, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { projects, projectDrafts, projectVersions, scriptFiles } from '../db/schema.js';

// Schema定义
const saveDraftSchema = z.object({
  draftFiles: z.record(z.any()),
  updatedBy: z.string(),
});

const publishVersionSchema = z.object({
  versionNumber: z.string(),
  releaseNote: z.string().default(''),
  publishedBy: z.string(),
});

const setCurrentVersionSchema = z.object({
  versionId: z.string().uuid(),
});

const versionsRoutes: FastifyPluginAsync = async (fastify) => {
  // 获取草稿
  fastify.get('/projects/:id/draft', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [draft] = await db.select().from(projectDrafts).where(eq(projectDrafts.projectId, id));

      if (!draft) {
        return reply.status(404).send({
          success: false,
          error: 'Draft not found',
        });
      }

      return reply.send({
        success: true,
        data: draft,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch draft',
      });
    }
  });

  // 保存草稿
  fastify.put('/projects/:id/draft', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = saveDraftSchema.parse(request.body);

      // 检查项目是否存在
      const [project] = await db.select().from(projects).where(eq(projects.id, id));

      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // 更新或插入草稿
      const [existingDraft] = await db
        .select()
        .from(projectDrafts)
        .where(eq(projectDrafts.projectId, id));

      let result;
      if (existingDraft) {
        [result] = await db
          .update(projectDrafts)
          .set({
            draftFiles: body.draftFiles,
            updatedBy: body.updatedBy,
            updatedAt: new Date(),
            validationStatus: 'unknown',
          })
          .where(eq(projectDrafts.projectId, id))
          .returning();
      } else {
        [result] = await db
          .insert(projectDrafts)
          .values({
            projectId: id,
            draftFiles: body.draftFiles,
            updatedBy: body.updatedBy,
            validationStatus: 'unknown',
          })
          .returning();
      }

      // 更新项目的更新时间
      await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id));

      return reply.send({
        success: true,
        data: result,
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
        error: 'Failed to save draft',
      });
    }
  });

  // 发布版本
  fastify.post('/projects/:id/publish', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = publishVersionSchema.parse(request.body);

      // 获取项目和草稿
      const [project] = await db.select().from(projects).where(eq(projects.id, id));

      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      const [draft] = await db.select().from(projectDrafts).where(eq(projectDrafts.projectId, id));

      if (!draft) {
        return reply.status(404).send({
          success: false,
          error: 'Draft not found',
        });
      }

      // 获取所有文件
      const files = await db.select().from(scriptFiles).where(eq(scriptFiles.projectId, id));

      // 创建版本记录
      const versionFiles = files.reduce(
        (acc, file) => {
          acc[file.id] = {
            fileType: file.fileType,
            fileName: file.fileName,
            fileContent: file.fileContent,
            yamlContent: file.yamlContent,
          };
          return acc;
        },
        {} as Record<string, any>
      );

      const [newVersion] = await db
        .insert(projectVersions)
        .values({
          projectId: id,
          versionNumber: body.versionNumber,
          versionFiles,
          releaseNote: body.releaseNote,
          publishedBy: body.publishedBy,
          isRollback: 'false',
        })
        .returning();

      // 更新项目的当前版本和状态
      await db
        .update(projects)
        .set({
          currentVersionId: newVersion.id,
          status: 'published',
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return reply.status(201).send({
        success: true,
        data: newVersion,
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
        error: 'Failed to publish version',
      });
    }
  });

  // 获取版本历史
  fastify.get('/projects/:id/versions', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const versions = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, id))
        .orderBy(desc(projectVersions.publishedAt));

      return reply.send({
        success: true,
        data: versions,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch versions',
      });
    }
  });

  // 获取单个版本详情
  fastify.get('/projects/:id/versions/:versionId', async (request, reply) => {
    try {
      const { id, versionId } = request.params as { id: string; versionId: string };

      const [version] = await db
        .select()
        .from(projectVersions)
        .where(and(eq(projectVersions.projectId, id), eq(projectVersions.id, versionId))!);

      if (!version) {
        return reply.status(404).send({
          success: false,
          error: 'Version not found',
        });
      }

      return reply.send({
        success: true,
        data: version,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch version',
      });
    }
  });

  // 回滚到指定版本
  fastify.post('/projects/:id/rollback', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { targetVersionId, publishedBy } = request.body as {
        targetVersionId: string;
        publishedBy: string;
      };

      // 获取目标版本
      const [targetVersion] = await db
        .select()
        .from(projectVersions)
        .where(and(eq(projectVersions.projectId, id), eq(projectVersions.id, targetVersionId))!);

      if (!targetVersion) {
        return reply.status(404).send({
          success: false,
          error: 'Target version not found',
        });
      }

      // 恢复文件到目标版本
      const versionFiles = targetVersion.versionFiles as Record<string, any>;

      // 1. 获取工作区当前所有文件
      const currentFiles = await db
        .select({ id: scriptFiles.id })
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, id));
      const currentFileIds = currentFiles.map((f) => f.id);

      // 2. 删除工作区中存在但目标版本中不存在的文件
      const idsToDelete = currentFileIds.filter((fileId) => !versionFiles[fileId]);
      if (idsToDelete.length > 0) {
        await db.delete(scriptFiles).where(inArray(scriptFiles.id, idsToDelete));
      }

      // 3. 恢复/更新文件内容
      for (const [fileId, fileData] of Object.entries(versionFiles)) {
        if (currentFileIds.includes(fileId)) {
          // 更新已存在的文件
          await db
            .update(scriptFiles)
            .set({
              fileName: fileData.fileName,
              fileType: fileData.fileType,
              fileContent: fileData.fileContent,
              yamlContent: fileData.yamlContent,
              updatedAt: new Date(),
            })
            .where(eq(scriptFiles.id, fileId));
        } else {
          // 恢复在当前工作区已被删除的文件
          await db.insert(scriptFiles).values({
            id: fileId,
            projectId: id,
            fileName: fileData.fileName,
            fileType: fileData.fileType,
            fileContent: fileData.fileContent,
            yamlContent: fileData.yamlContent,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // 创建新版本（标记为回滚）
      const versions = await db
        .select()
        .from(projectVersions)
        .where(eq(projectVersions.projectId, id))
        .orderBy(desc(projectVersions.publishedAt));

      const latestVersion = versions[0];
      const versionParts = latestVersion.versionNumber.split('.');
      const newVersionNumber = `${versionParts[0]}.${versionParts[1]}.${parseInt(versionParts[2]) + 1}`;

      const [newVersion] = await db
        .insert(projectVersions)
        .values({
          projectId: id,
          versionNumber: newVersionNumber,
          versionFiles: targetVersion.versionFiles,
          releaseNote: `回滚到版本 ${targetVersion.versionNumber}`,
          publishedBy,
          isRollback: 'true',
          rollbackFromVersionId: targetVersionId,
        })
        .returning();

      // 更新项目
      await db
        .update(projects)
        .set({
          currentVersionId: newVersion.id,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));

      return reply.send({
        success: true,
        data: newVersion,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to rollback version',
      });
    }
  });

  // 设置当前版本（版本切换）
  fastify.put('/projects/:id/current-version', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = setCurrentVersionSchema.parse(request.body);
  
      // 检查项目是否存在
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
  
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }
  
      // 检查目标版本是否存在且属于该项目
      const [targetVersion] = await db
        .select()
        .from(projectVersions)
        .where(and(eq(projectVersions.projectId, id), eq(projectVersions.id, body.versionId))!);
  
      if (!targetVersion) {
        return reply.status(404).send({
          success: false,
          error: 'Version not found',
        });
      }
  
      // 记录旧版本 ID
      const previousVersionId = project.currentVersionId;
      
      // 将目标版本的文件快照恢复到工作区
      const versionFiles = targetVersion.versionFiles as Record<string, any>;
      
      // 1. 获取工作区当前所有文件
      const currentFiles = await db
        .select({ id: scriptFiles.id })
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, id));
      const currentFileIds = currentFiles.map((f) => f.id);
      
      // 2. 删除工作区中存在但目标版本中不存在的文件
      const idsToDelete = currentFileIds.filter((fileId) => !versionFiles[fileId]);
      if (idsToDelete.length > 0) {
        await db.delete(scriptFiles).where(inArray(scriptFiles.id, idsToDelete));
      }
      
      // 3. 恢复/更新文件内容
      for (const [fileId, fileData] of Object.entries(versionFiles)) {
        if (currentFileIds.includes(fileId)) {
          // 更新已存在的文件
          await db
            .update(scriptFiles)
            .set({
              fileName: fileData.fileName,
              fileType: fileData.fileType,
              fileContent: fileData.fileContent,
              yamlContent: fileData.yamlContent,
              updatedAt: new Date(),
            })
            .where(eq(scriptFiles.id, fileId));
        } else {
          // 恢复在当前工作区已被删除的文件
          await db.insert(scriptFiles).values({
            id: fileId,
            projectId: id,
            fileName: fileData.fileName,
            fileType: fileData.fileType,
            fileContent: fileData.fileContent,
            yamlContent: fileData.yamlContent,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }
      
      // 更新项目的当前版本
      await db
        .update(projects)
        .set({
          currentVersionId: body.versionId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
  
      return reply.send({
        success: true,
        data: {
          projectId: id,
          previousVersionId,
          currentVersionId: body.versionId,
          updatedAt: new Date().toISOString(),
        },
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
        error: 'Failed to set current version',
      });
    }
  });

  // 对比两个版本
  fastify.get('/projects/:id/versions/:versionId/diff', async (request, reply) => {
    try {
      const { id, versionId } = request.params as { id: string; versionId: string };
      const { compareWith } = request.query as { compareWith?: string };

      const [version] = await db
        .select()
        .from(projectVersions)
        .where(and(eq(projectVersions.projectId, id), eq(projectVersions.id, versionId))!);

      if (!version) {
        return reply.status(404).send({
          success: false,
          error: 'Version not found',
        });
      }

      let compareVersion;
      if (compareWith) {
        [compareVersion] = await db
          .select()
          .from(projectVersions)
          .where(and(eq(projectVersions.projectId, id), eq(projectVersions.id, compareWith))!);
      } else {
        // 默认与前一个版本对比
        const versions = await db
          .select()
          .from(projectVersions)
          .where(eq(projectVersions.projectId, id))
          .orderBy(desc(projectVersions.publishedAt));

        const currentIndex = versions.findIndex((v) => v.id === versionId);
        if (currentIndex < versions.length - 1) {
          compareVersion = versions[currentIndex + 1];
        }
      }

      if (!compareVersion) {
        return reply.status(404).send({
          success: false,
          error: 'No version to compare with',
        });
      }

      // 简单的差异计算（实际应该使用专门的diff库）
      const diff = {
        added: [],
        removed: [],
        modified: [],
      };

      return reply.send({
        success: true,
        data: {
          version,
          compareVersion,
          diff,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to compare versions',
      });
    }
  });
};

export default versionsRoutes;
