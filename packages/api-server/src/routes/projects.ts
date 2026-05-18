import fs from 'fs/promises';
import path from 'path';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { ProjectInitializer } from '../services/project-initializer.js';
import { ProjectRepository } from '../services/project-repository.js';

// Schema定义
const createProjectSchema = z.object({
  projectName: z.string().min(1).max(255),
  description: z.string().default(''),
  engineVersion: z.string().default('1.2.0'),
  engineVersionMin: z.string().default('1.0.0'),
  author: z.string(),
  tags: z.array(z.string()).default([]),
  // 新增工程初始化配置
  template: z.enum(['blank', 'cbt-assessment', 'cbt-counseling']).default('blank'),
  domain: z.string().optional(),
  scenario: z.string().optional(),
  language: z.string().default('zh-CN'),
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
      const { status, search, author, includeDeprecated } = request.query as {
        status?: string;
        search?: string;
        author?: string;
        includeDeprecated?: string;
      };

      const repo = new ProjectRepository();
      const result = await repo.listProjects({
        status,
        search,
        author,
        includeDeprecated: includeDeprecated === 'true',
      });

      return reply.send({
        success: true,
        data: result,
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
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);

      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // 获取工程文件
      const files = await repo.findScriptFilesByProjectId(id);

      // 获取草稿
      const draft = await repo.findDraftByProjectId(id);

      // 获取版本历史
      const versions = await repo.findVersionsByProjectId(id);

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
      const repo = new ProjectRepository();

      // 创建工程
      const newProject = await repo.createProject({
        projectName: body.projectName,
        description: body.description,
        engineVersion: body.engineVersion,
        engineVersionMin: body.engineVersionMin,
        author: body.author,
        tags: body.tags,
      });

      // 创建默认文件
      let globalVars: any = { variables: [] };
      try {
        const globalYamlPath = path.resolve(
          __dirname,
          '../../../../config/project-defaults/global.yaml'
        );
        const yamlContent = await fs.readFile(globalYamlPath, 'utf-8');
        const yaml = await import('js-yaml');
        globalVars = yaml.load(yamlContent);
      } catch (e: any) {
        console.warn(`[API] ⚠️  Default global.yaml not found: ${e.message}, using empty`);
      }

      await repo.insertScriptFiles([
        {
          projectId: newProject.id,
          fileType: 'global',
          fileName: 'global.yaml',
          fileContent: globalVars,
        },
        {
          projectId: newProject.id,
          fileType: 'roles',
          fileName: 'roles.yaml',
          fileContent: { roles: [] },
        },
        {
          projectId: newProject.id,
          fileType: 'skills',
          fileName: 'skills.yaml',
          fileContent: { skills: [] },
        },
      ]);

      // 创建初始草稿
      await repo.upsertDraft(newProject.id, {
        draftFiles: {},
        updatedBy: body.author,
      });

      // 初始化默认模板到数据库
      try {
        const systemTemplatesPath = path.resolve(__dirname, '../../../../config/prompt-defaults');
        const templateFiles = await fs.readdir(systemTemplatesPath);

        const templates: Array<{
          projectId: string;
          fileType: string;
          fileName: string;
          fileContent: any;
          filePath: string;
        }> = [];

        for (const fileName of templateFiles) {
          if (!fileName.endsWith('.md')) continue;
          const content = await fs.readFile(path.join(systemTemplatesPath, fileName), 'utf-8');
          templates.push({
            projectId: newProject.id,
            fileType: 'template',
            fileName,
            fileContent: { content },
            filePath: `_system/config/default/${fileName}`,
          });
          console.log(`[API]   ✅ Imported template: ${fileName}`);
        }

        if (templates.length > 0) {
          await repo.insertScriptFiles(templates);
        }
      } catch (templateError: any) {
        console.warn(`[API]   ⚠️  System templates not found: ${templateError.message}`);
      }

      // 初始化工程目录结构和模板文件
      try {
        const initializer = new ProjectInitializer();

        const initResult = await initializer.initializeProject({
          projectId: newProject.id,
          projectName: body.projectName,
          template: body.template,
          domain: body.domain,
          scenario: body.scenario,
          language: body.language,
          author: body.author,
        });

        console.log(`[API] ✅ Project directory initialized: ${newProject.id}`);

        if (initResult.generatedScripts.length > 0) {
          console.log(
            `[API] Importing ${initResult.generatedScripts.length} sample scripts to database`
          );

          const yaml = await import('js-yaml');
          const generatedFiles: Array<{
            projectId: string;
            fileType: string;
            fileName: string;
            fileContent: any;
            yamlContent: string;
          }> = [];

          for (const script of initResult.generatedScripts) {
            try {
              const parsedContent = yaml.load(script.content);
              generatedFiles.push({
                projectId: newProject.id,
                fileType: script.fileType,
                fileName: script.fileName,
                fileContent: parsedContent,
                yamlContent: script.content,
              });
              console.log(`[API]   ✅ Imported: ${script.fileName}`);
            } catch (parseError: any) {
              console.error(`[API]   ⚠️ Failed to import ${script.fileName}:`, parseError.message);
            }
          }

          if (generatedFiles.length > 0) {
            await repo.insertScriptFiles(generatedFiles);
          }
        }
      } catch (initError: any) {
        console.error(`[API] ⚠️ Project directory initialization failed:`, initError);
        fastify.log.warn(
          `Project directory initialization failed for ${newProject.id}: ${initError.message}`
        );
      }

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

      const repo = new ProjectRepository();
      await repo.updateProject(id, body);
      const updated = await repo.findProjectById(id);

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

      const repo = new ProjectRepository();
      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      await repo.updateProject(id, { status: 'archived' });
      const archived = await repo.findProjectById(id);

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

  // 作废工程（软删除）
  fastify.post('/projects/:id/deprecate', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { operator, reason } = request.body as { operator?: string; reason?: string };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      const currentMetadata = (project.metadata as Record<string, any>) || {};
      const deprecationHistory = [
        ...(currentMetadata.deprecationHistory || []),
        {
          action: 'deprecate',
          timestamp: new Date().toISOString(),
          operator: operator || 'unknown',
          reason: reason || '',
        },
      ];

      await repo.updateProject(id, {
        status: 'deprecated',
        metadata: {
          ...currentMetadata,
          deprecationHistory,
          deprecatedAt: new Date().toISOString(),
          deprecatedBy: operator || 'unknown',
          deprecationReason: reason || '',
        },
      });
      const deprecated = await repo.findProjectById(id);

      return reply.send({
        success: true,
        data: deprecated,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to deprecate project',
      });
    }
  });

  // 恢复已作废工程
  fastify.post('/projects/:id/restore', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { operator } = request.body as { operator?: string };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      if (project.status !== 'deprecated') {
        return reply.status(400).send({
          success: false,
          error: 'Only deprecated projects can be restored',
        });
      }

      const currentMetadata = (project.metadata as Record<string, any>) || {};
      const deprecationHistory = [
        ...(currentMetadata.deprecationHistory || []),
        {
          action: 'restore',
          timestamp: new Date().toISOString(),
          operator: operator || 'unknown',
        },
      ];

      await repo.updateProject(id, {
        status: 'draft',
        metadata: {
          ...currentMetadata,
          deprecationHistory,
          restoredAt: new Date().toISOString(),
          restoredBy: operator || 'unknown',
        },
      });
      const restored = await repo.findProjectById(id);

      return reply.send({
        success: true,
        data: restored,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to restore project',
      });
    }
  });

  // 复制工程
  fastify.post('/projects/:id/copy', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { author } = request.body as { author: string };
      const repo = new ProjectRepository();

      const originalProject = await repo.findProjectById(id);
      if (!originalProject) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      const newProject = await repo.createProject({
        projectName: `${originalProject.projectName}（副本）`,
        description: originalProject.description,
        engineVersion: originalProject.engineVersion,
        engineVersionMin: originalProject.engineVersionMin,
        author: author || originalProject.author,
        tags: originalProject.tags as string[],
      });

      // 复制文件
      const originalFiles = await repo.findScriptFilesByProjectId(id);
      if (originalFiles.length > 0) {
        await repo.insertScriptFiles(
          originalFiles.map((file) => ({
            projectId: newProject.id,
            fileType: file.fileType,
            fileName: file.fileName,
            fileContent: file.fileContent,
            yamlContent: file.yamlContent ?? undefined,
          }))
        );
      }

      // 创建草稿
      await repo.upsertDraft(newProject.id, {
        draftFiles: {},
        updatedBy: author || originalProject.author,
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
      const repo = new ProjectRepository();
      const files = await repo.findScriptFilesByProjectId(id);

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
      const repo = new ProjectRepository();
      const file = await repo.findProjectFileById(id, fileId);

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
      const repo = new ProjectRepository();

      const newFile = await repo.createProjectFile({
        projectId: id,
        fileType,
        fileName,
        fileContent,
      });

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

      let normalizedFileContent = fileContent;
      if (fileContent && yamlContent) {
        normalizedFileContent = { content: yamlContent };
        console.log(
          `[PUT /projects/${id}/files/${fileId}] 🔧 Normalizing fileContent with yamlContent`
        );
      } else if (fileContent && typeof fileContent === 'object' && !fileContent.content) {
        console.log(
          `[PUT /projects/${id}/files/${fileId}] ℹ️ fileContent is object without 'content' field, keeping as-is`
        );
      }

      const repo = new ProjectRepository();
      const updated = await repo.updateProjectFile(id, fileId, {
        fileName,
        fileContent: normalizedFileContent,
        yamlContent,
      });

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
      const repo = new ProjectRepository();

      const deleted = await repo.deleteProjectFile(id, fileId);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'File not found',
        });
      }

      return reply.send({
        success: true,
        data: deleted,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to delete file',
      });
    }
  });

  // 获取模板方案列表
  fastify.get('/projects/:id/template-schemes', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const templateFiles = await repo.findTemplateFiles(id);

      const schemeMap = new Map<
        string,
        { name: string; description: string; isDefault: boolean }
      >();

      for (const file of templateFiles) {
        if (!file.filePath) continue;
        const parts = file.filePath.split('/');
        if (parts.length >= 4 && parts[0] === '_system' && parts[1] === 'config') {
          const layer = parts[2];
          if (layer === 'default') {
            if (!schemeMap.has('default')) {
              schemeMap.set('default', {
                name: 'default',
                description: 'System default template scheme',
                isDefault: true,
              });
            }
          } else if (layer === 'custom' && parts.length >= 5) {
            const schemeName = parts[3];
            if (!schemeMap.has(schemeName)) {
              schemeMap.set(schemeName, {
                name: schemeName,
                description: `Custom template scheme: ${schemeName}`,
                isDefault: false,
              });
            }
          }
        }
      }

      const schemes = Array.from(schemeMap.values());
      return reply.send(schemes);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to get template schemes' });
    }
  });

  // 获取模板方案的文件列表
  fastify.get('/projects/:id/template-schemes/:schemeName/files', async (request, reply) => {
    try {
      const { id, schemeName } = request.params as { id: string; schemeName: string };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const pathPattern =
        schemeName === 'default'
          ? '_system/config/default/%'
          : `_system/config/custom/${schemeName}/%`;

      const templateFiles = await repo.findTemplateFilesByPathLike(id, pathPattern);

      const files = templateFiles.map((file) => ({
        name: path.basename(file.filePath!),
        path: file.filePath!,
      }));

      return reply.send({
        success: true,
        data: {
          scheme: schemeName,
          files,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to get template files' });
    }
  });

  // 获取模板内容
  fastify.get('/projects/:id/templates/:schemeName/:templatePath', async (request, reply) => {
    try {
      const { id, schemeName, templatePath } = request.params as {
        id: string;
        schemeName: string;
        templatePath: string;
      };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const filePath =
        schemeName === 'default'
          ? `_system/config/default/${templatePath}`
          : `_system/config/custom/${schemeName}/${templatePath}`;

      const templateFile = await repo.findTemplateFileByExactPath(id, filePath);

      if (!templateFile) {
        return reply.status(404).send({ success: false, error: 'Template not found' });
      }

      const content = (templateFile.fileContent as { content?: string })?.content || '';

      return reply.send({
        success: true,
        data: {
          content,
          fileName: path.basename(filePath),
          filePath,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to get template content' });
    }
  });

  // 更新模板内容
  fastify.put('/projects/:id/templates/:schemeName/:templatePath', async (request, reply) => {
    try {
      const { id, schemeName, templatePath } = request.params as {
        id: string;
        schemeName: string;
        templatePath: string;
      };
      const { content } = request.body as { content: string };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      const filePath =
        schemeName === 'default'
          ? `_system/config/default/${templatePath}`
          : `_system/config/custom/${schemeName}/${templatePath}`;

      let templateFile = await repo.findTemplateFileByExactPath(id, filePath);

      if (!templateFile) {
        console.log(`[PUT Template] Template not found in DB, attempting to create: ${filePath}`);

        try {
          const systemTemplatesPath = path.resolve(__dirname, '../../../../config/prompt-defaults');
          const systemFilePath = path.join(systemTemplatesPath, templatePath);

          let initialContent = content;

          if (schemeName !== 'default') {
            try {
              const defaultContent = await fs.readFile(systemFilePath, 'utf-8');
              initialContent = defaultContent;
              console.log(
                `[PUT Template] Using default template as initial content (${defaultContent.length} chars)`
              );
            } catch {
              console.log(`[PUT Template] No default template found, using provided content`);
            }
          }

          templateFile = await repo.createProjectFile({
            projectId: id,
            fileType: 'template',
            fileName: templatePath,
            filePath,
            fileContent: { content: initialContent },
          });

          console.log(`[PUT Template] ✅ Created template: ${filePath}`);
        } catch (createError: any) {
          console.error(`[PUT Template] Failed to create template:`, createError);
          return reply.status(500).send({
            success: false,
            error: `Failed to create template: ${createError.message}`,
          });
        }
      }

      await repo.updateProjectFile(id, templateFile.id, {
        fileContent: { content },
      });

      fastify.log.info(`Updated template: ${schemeName}/${templatePath}`);

      return reply.send({
        success: true,
        data: {
          fileName: path.basename(filePath),
          filePath,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to update template content' });
    }
  });

  // 创建模板方案
  fastify.post('/projects/:id/template-schemes', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, description, copyFrom } = request.body as {
        name: string;
        description?: string;
        copyFrom?: string;
      };
      const repo = new ProjectRepository();

      const project = await repo.findProjectById(id);
      if (!project) {
        return reply.status(404).send({ success: false, error: 'Project not found' });
      }

      if (name === 'default') {
        return reply
          .status(400)
          .send({ success: false, error: 'Cannot use reserved name "default"' });
      }

      const existingFiles = await repo.findTemplateFilesByPathLike(
        id,
        `_system/config/custom/${name}/%`
      );

      if (existingFiles.length > 0) {
        return reply.status(400).send({ success: false, error: `Scheme "${name}" already exists` });
      }

      const sourcePathPattern =
        copyFrom === 'default' ? '_system/config/default/%' : `_system/config/custom/${copyFrom}/%`;

      const sourceFiles = await repo.findTemplateFilesByPathLike(id, sourcePathPattern);

      if (sourceFiles.length === 0) {
        return reply
          .status(404)
          .send({ success: false, error: `Source scheme "${copyFrom}" not found` });
      }

      const newFiles = sourceFiles.map((sourceFile) => ({
        projectId: id,
        fileType: 'template' as string,
        fileName: path.basename(sourceFile.filePath!),
        filePath: `_system/config/custom/${name}/${path.basename(sourceFile.filePath!)}`,
        fileContent: sourceFile.fileContent,
      }));

      await repo.insertScriptFiles(newFiles);

      fastify.log.info(`Created template scheme: ${name}`);

      return reply.send({
        success: true,
        data: {
          name,
          description: description || `Custom template scheme: ${name}`,
          isDefault: false,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to create template scheme' });
    }
  });
};

export default projectsRoutes;
