/**
 * 数据库模板提供器
 * 从数据库 script_files 表中读取模板内容
 */

import { db } from '../db/index.js';
import { scriptFiles } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { TemplateProvider, TemplateContent } from '@heartrule/core-engine';

/**
 * 数据库模板提供器实现
 */
export class DatabaseTemplateProvider implements TemplateProvider {
  /**
   * 根据项目ID和文件路径读取模板内容
   * @param projectId 项目ID
   * @param filePath 模板文件虚拟路径（如 _system/config/default/ai_ask_v1.md）
   * @returns 模板内容
   */
  async getTemplate(projectId: string, filePath: string): Promise<TemplateContent | null> {
    try {
      const [templateFile] = await db
        .select()
        .from(scriptFiles)
        .where(
          and(
            eq(scriptFiles.projectId, projectId),
            eq(scriptFiles.fileType, 'template'),
            eq(scriptFiles.filePath, filePath)
          )
        );

      if (!templateFile) {
        return null;
      }

      const content = (templateFile.fileContent as { content?: string })?.content || '';

      return {
        content,
        filePath: templateFile.filePath || filePath,
        fileName: templateFile.fileName || '',
      };
    } catch (error) {
      console.error(`[DatabaseTemplateProvider] Error loading template ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 检查模板是否存在
   * @param projectId 项目ID
   * @param filePath 模板文件虚拟路径
   * @returns 是否存在
   */
  async hasTemplate(projectId: string, filePath: string): Promise<boolean> {
    try {
      const [templateFile] = await db
        .select({ id: scriptFiles.id })
        .from(scriptFiles)
        .where(
          and(
            eq(scriptFiles.projectId, projectId),
            eq(scriptFiles.fileType, 'template'),
            eq(scriptFiles.filePath, filePath)
          )
        );

      return !!templateFile;
    } catch (error) {
      console.error(`[DatabaseTemplateProvider] Error checking template ${filePath}:`, error);
      return false;
    }
  }
}
