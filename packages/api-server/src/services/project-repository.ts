/**
 * Project Repository
 *
 * All database I/O for project, draft, version, and script file management.
 * Extracted from routes/versions.ts and routes/projects.ts.
 */

import { eq, desc, and, inArray, ne, like, or, type SQL } from 'drizzle-orm';

import { db } from '../db/index.js';
import { projects, projectDrafts, projectVersions, scriptFiles } from '../db/schema.js';

// ---- Types ----

export type ProjectRow = typeof projects.$inferSelect;
export type DraftRow = typeof projectDrafts.$inferSelect;
export type VersionRow = typeof projectVersions.$inferSelect;
export type ScriptFileRow = typeof scriptFiles.$inferSelect;

export interface CreateVersionData {
  projectId: string;
  versionNumber: string;
  versionFiles: Record<string, any>;
  releaseNote: string;
  publishedBy: string;
  isRollback?: string;
  rollbackFromVersionId?: string;
}

export interface UpsertDraftData {
  draftFiles: Record<string, any>;
  updatedBy: string;
}

// ---- Interface ----

export interface IProjectRepository {
  // Project
  findProjectById(id: string): Promise<ProjectRow | null>;
  updateProject(id: string, data: Record<string, any>): Promise<void>;

  // Draft
  findDraftByProjectId(projectId: string): Promise<DraftRow | null>;
  upsertDraft(projectId: string, data: UpsertDraftData): Promise<DraftRow>;

  // Version
  findVersionsByProjectId(projectId: string): Promise<VersionRow[]>;
  findVersionById(projectId: string, versionId: string): Promise<VersionRow | null>;
  createVersion(data: CreateVersionData): Promise<VersionRow>;

  // Script Files
  findScriptFilesByProjectId(projectId: string): Promise<ScriptFileRow[]>;
  findScriptFileIdsByProjectId(projectId: string): Promise<string[]>;
  deleteScriptFiles(ids: string[]): Promise<void>;
  upsertScriptFiles(
    files: Array<{
      id: string;
      fileName: string;
      fileType: 'session' | 'global' | 'roles' | 'skills' | 'forms' | 'rules' | 'template';
      fileContent: any;
      yamlContent: any;
    }>,
    projectId: string
  ): Promise<void>;

  // Project list / create
  listProjects(filters?: {
    status?: string;
    author?: string;
    search?: string;
    includeDeprecated?: boolean;
  }): Promise<(ProjectRow & { fileCount: number })[]>;

  createProject(data: {
    projectName: string;
    description?: string;
    engineVersion?: string;
    engineVersionMin?: string;
    author: string;
    tags?: string[];
  }): Promise<ProjectRow>;

  // Script file CRUD (single)
  findProjectFileById(projectId: string, fileId: string): Promise<ScriptFileRow | null>;
  createProjectFile(data: {
    projectId: string;
    fileType: string;
    fileName: string;
    fileContent: any;
    filePath?: string;
    yamlContent?: string;
  }): Promise<ScriptFileRow>;
  updateProjectFile(
    projectId: string,
    fileId: string,
    data: {
      fileName?: string;
      fileContent?: any;
      yamlContent?: string;
    }
  ): Promise<ScriptFileRow | null>;
  deleteProjectFile(projectId: string, fileId: string): Promise<ScriptFileRow | null>;

  // Template files
  findTemplateFiles(projectId: string): Promise<ScriptFileRow[]>;
  findTemplateFilesByPathLike(projectId: string, pathLike: string): Promise<ScriptFileRow[]>;
  findTemplateFileByExactPath(projectId: string, filePath: string): Promise<ScriptFileRow | null>;
  insertScriptFiles(
    files: Array<{
      projectId: string;
      fileType: string;
      fileName: string;
      fileContent: any;
      filePath?: string;
      yamlContent?: string;
    }>
  ): Promise<void>;

  getFileCountByProjectId(projectId: string): Promise<number>;
}

// ---- Implementation ----

export class ProjectRepository implements IProjectRepository {
  // ==================== Project ====================

  async findProjectById(id: string): Promise<ProjectRow | null> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project ?? null;
  }

  async updateProject(id: string, data: Record<string, any>): Promise<void> {
    await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id));
  }

  // ==================== Draft ====================

  async findDraftByProjectId(projectId: string): Promise<DraftRow | null> {
    const [draft] = await db
      .select()
      .from(projectDrafts)
      .where(eq(projectDrafts.projectId, projectId));
    return draft ?? null;
  }

  async upsertDraft(projectId: string, data: UpsertDraftData): Promise<DraftRow> {
    const existing = await this.findDraftByProjectId(projectId);

    if (existing) {
      const [result] = await db
        .update(projectDrafts)
        .set({
          draftFiles: data.draftFiles,
          updatedBy: data.updatedBy,
          updatedAt: new Date(),
          validationStatus: 'unknown',
        })
        .where(eq(projectDrafts.projectId, projectId))
        .returning();
      return result;
    }

    const [result] = await db
      .insert(projectDrafts)
      .values({
        projectId,
        draftFiles: data.draftFiles,
        updatedBy: data.updatedBy,
        validationStatus: 'unknown',
      })
      .returning();
    return result;
  }

  // ==================== Version ====================

  async findVersionsByProjectId(projectId: string): Promise<VersionRow[]> {
    return db
      .select()
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId))
      .orderBy(desc(projectVersions.publishedAt));
  }

  async findVersionById(projectId: string, versionId: string): Promise<VersionRow | null> {
    const [version] = await db
      .select()
      .from(projectVersions)
      .where(and(eq(projectVersions.projectId, projectId), eq(projectVersions.id, versionId))!);
    return version ?? null;
  }

  async createVersion(data: CreateVersionData): Promise<VersionRow> {
    const [version] = await db
      .insert(projectVersions)
      .values({
        projectId: data.projectId,
        versionNumber: data.versionNumber,
        versionFiles: data.versionFiles,
        releaseNote: data.releaseNote,
        publishedBy: data.publishedBy,
        isRollback: data.isRollback || 'false',
        rollbackFromVersionId: data.rollbackFromVersionId || null,
      })
      .returning();
    return version;
  }

  // ==================== Script Files ====================

  async findScriptFilesByProjectId(projectId: string): Promise<ScriptFileRow[]> {
    return db.select().from(scriptFiles).where(eq(scriptFiles.projectId, projectId));
  }

  async findScriptFileIdsByProjectId(projectId: string): Promise<string[]> {
    const files = await db
      .select({ id: scriptFiles.id })
      .from(scriptFiles)
      .where(eq(scriptFiles.projectId, projectId));
    return files.map((f) => f.id);
  }

  async deleteScriptFiles(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(scriptFiles).where(inArray(scriptFiles.id, ids));
  }

  async upsertScriptFiles(
    files: Array<{
      id: string;
      fileName: string;
      fileType: 'session' | 'global' | 'roles' | 'skills' | 'forms' | 'rules' | 'template';
      fileContent: any;
      yamlContent: any;
    }>,
    projectId: string
  ): Promise<void> {
    const existingIds = await this.findScriptFileIdsByProjectId(projectId);

    for (const file of files) {
      if (existingIds.includes(file.id)) {
        await db
          .update(scriptFiles)
          .set({
            fileName: file.fileName,
            fileType: file.fileType,
            fileContent: file.fileContent,
            yamlContent: file.yamlContent,
            updatedAt: new Date(),
          })
          .where(eq(scriptFiles.id, file.id));
      } else {
        await db.insert(scriptFiles).values({
          id: file.id,
          projectId,
          fileName: file.fileName,
          fileType: file.fileType,
          fileContent: file.fileContent,
          yamlContent: file.yamlContent,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
    }
  }

  // ==================== Project List / Create ====================

  async listProjects(filters?: {
    status?: string;
    author?: string;
    search?: string;
    includeDeprecated?: boolean;
  }): Promise<(ProjectRow & { fileCount: number })[]> {
    const conditions: SQL[] = [];

    if (filters?.status && filters.status !== 'all') {
      conditions.push(eq(projects.status, filters.status as any));
    } else if (!filters?.includeDeprecated) {
      conditions.push(ne(projects.status, 'deprecated'));
    }

    if (filters?.author) {
      conditions.push(eq(projects.author, filters.author));
    }
    if (filters?.search) {
      conditions.push(
        or(
          like(projects.projectName, `%${filters.search}%`),
          like(projects.description, `%${filters.search}%`)
        )!
      );
    }

    const result =
      conditions.length > 0
        ? await db
            .select()
            .from(projects)
            .where(and(...conditions)!)
            .orderBy(desc(projects.updatedAt))
        : await db.select().from(projects).orderBy(desc(projects.updatedAt));

    const projectsWithCount = await Promise.all(
      result.map(async (project) => {
        const files = await db
          .select()
          .from(scriptFiles)
          .where(eq(scriptFiles.projectId, project.id));
        return { ...project, fileCount: files.length };
      })
    );

    return projectsWithCount;
  }

  async createProject(data: {
    projectName: string;
    description?: string;
    engineVersion?: string;
    engineVersionMin?: string;
    author: string;
    tags?: string[];
  }): Promise<ProjectRow> {
    const [newProject] = await db
      .insert(projects)
      .values({
        projectName: data.projectName,
        description: data.description || '',
        engineVersion: data.engineVersion || '1.2.0',
        engineVersionMin: data.engineVersionMin || '1.0.0',
        author: data.author,
        tags: data.tags || [],
        status: 'draft',
      })
      .returning();
    return newProject;
  }

  // ==================== Script File CRUD (single) ====================

  async findProjectFileById(projectId: string, fileId: string): Promise<ScriptFileRow | null> {
    const [file] = await db
      .select()
      .from(scriptFiles)
      .where(and(eq(scriptFiles.projectId, projectId), eq(scriptFiles.id, fileId))!);
    return file ?? null;
  }

  async createProjectFile(data: {
    projectId: string;
    fileType: string;
    fileName: string;
    fileContent: any;
    filePath?: string;
    yamlContent?: string;
  }): Promise<ScriptFileRow> {
    const [file] = await db
      .insert(scriptFiles)
      .values({
        projectId: data.projectId,
        fileType: data.fileType as any,
        fileName: data.fileName,
        fileContent: data.fileContent,
        filePath: data.filePath,
        yamlContent: data.yamlContent,
      })
      .returning();
    return file;
  }

  async updateProjectFile(
    projectId: string,
    fileId: string,
    data: {
      fileName?: string;
      fileContent?: any;
      yamlContent?: string;
    }
  ): Promise<ScriptFileRow | null> {
    const setData: Record<string, any> = { updatedAt: new Date() };
    if (data.fileName) setData.fileName = data.fileName;
    if (data.fileContent !== undefined) setData.fileContent = data.fileContent;
    if (data.yamlContent !== undefined) setData.yamlContent = data.yamlContent;

    const [updated] = await db
      .update(scriptFiles)
      .set(setData)
      .where(and(eq(scriptFiles.projectId, projectId), eq(scriptFiles.id, fileId))!)
      .returning();
    return updated ?? null;
  }

  async deleteProjectFile(projectId: string, fileId: string): Promise<ScriptFileRow | null> {
    const [deleted] = await db
      .delete(scriptFiles)
      .where(and(eq(scriptFiles.projectId, projectId), eq(scriptFiles.id, fileId))!)
      .returning();
    return deleted ?? null;
  }

  // ==================== Template Files ====================

  async findTemplateFiles(projectId: string): Promise<ScriptFileRow[]> {
    return db
      .select()
      .from(scriptFiles)
      .where(and(eq(scriptFiles.projectId, projectId), eq(scriptFiles.fileType, 'template')));
  }

  async findTemplateFilesByPathLike(projectId: string, pathLike: string): Promise<ScriptFileRow[]> {
    return db
      .select()
      .from(scriptFiles)
      .where(
        and(
          eq(scriptFiles.projectId, projectId),
          eq(scriptFiles.fileType, 'template'),
          like(scriptFiles.filePath, pathLike)
        )
      );
  }

  async findTemplateFileByExactPath(
    projectId: string,
    filePath: string
  ): Promise<ScriptFileRow | null> {
    const [file] = await db
      .select()
      .from(scriptFiles)
      .where(
        and(
          eq(scriptFiles.projectId, projectId),
          eq(scriptFiles.fileType, 'template'),
          eq(scriptFiles.filePath, filePath)
        )
      )
      .limit(1);
    return file ?? null;
  }

  // ==================== Bulk ====================

  async insertScriptFiles(
    files: Array<{
      projectId: string;
      fileType: string;
      fileName: string;
      fileContent: any;
      filePath?: string;
      yamlContent?: string;
    }>
  ): Promise<void> {
    if (files.length === 0) return;
    await db.insert(scriptFiles).values(
      files.map((f) => ({
        projectId: f.projectId,
        fileType: f.fileType as any,
        fileName: f.fileName,
        fileContent: f.fileContent,
        filePath: f.filePath,
        yamlContent: f.yamlContent,
      }))
    );
  }

  async getFileCountByProjectId(projectId: string): Promise<number> {
    const files = await db
      .select({ id: scriptFiles.id })
      .from(scriptFiles)
      .where(eq(scriptFiles.projectId, projectId));
    return files.length;
  }
}
