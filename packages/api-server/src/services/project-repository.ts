/**
 * Project Repository
 *
 * All database I/O for project, draft, version, and script file management.
 * Extracted from routes/versions.ts and routes/projects.ts.
 */

import { eq, desc, and, inArray } from 'drizzle-orm';

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
}
