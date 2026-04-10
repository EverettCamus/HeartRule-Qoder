/**
 * DatabaseTemplateProvider 测试
 *
 * Bug修复: 模板内容应从 yamlContent 字段读取，而非 fileContent
 */
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { db, closeConnection } from '../db/index.js';
import { scriptFiles, projects } from '../db/schema.js';

import { DatabaseTemplateProvider } from './database-template-provider.js';

// 检查数据库是否可用（带超时）
async function isDatabaseAvailable(): Promise<boolean> {
  const timeout = 3000; // 3秒超时
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timeout')), timeout)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

describe('DatabaseTemplateProvider', () => {
  const testProjectId = uuidv4();
  const testTemplatePath = '_system/config/default/test_template.md';
  const testTemplateContent = '# Test Template\n\nThis is a test template content.';
  let dbAvailable = false;

  beforeAll(async () => {
    // 检查数据库连接
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      console.warn('Database not available, skipping DatabaseTemplateProvider tests');
      return;
    }

    // 先创建测试项目（满足外键约束）
    await db.insert(projects).values({
      id: testProjectId,
      projectName: 'Test Project for Template Provider',
      description: 'Test project',
      engineVersion: '2.0.0',
      engineVersionMin: '2.0.0',
      author: 'test',
      status: 'draft',
    });

    // 插入测试模板数据 - 内容存储在 yamlContent 字段
    await db.insert(scriptFiles).values({
      projectId: testProjectId,
      fileType: 'template',
      fileName: 'test_template.md',
      filePath: testTemplatePath,
      fileContent: {}, // fileContent 为空对象
      yamlContent: testTemplateContent, // 实际内容在 yamlContent
    });
  }, 15000); // 增加超时时间到15秒

  afterAll(async () => {
    if (!dbAvailable) return;

    try {
      // 清理测试数据（先删script_files再删projects）
      await db.delete(scriptFiles).where(eq(scriptFiles.projectId, testProjectId));
      await db.delete(projects).where(eq(projects.id, testProjectId));
    } finally {
      await closeConnection();
    }
  }, 15000); // 增加超时时间到15秒

  it('should read template content from yamlContent field', async () => {
    if (!dbAvailable) return;

    const provider = new DatabaseTemplateProvider();

    const result = await provider.getTemplate(testProjectId, testTemplatePath);

    expect(result).not.toBeNull();
    expect(result?.content).toBe(testTemplateContent);
  });

  it('should return null for non-existent template', async () => {
    if (!dbAvailable) return;

    const provider = new DatabaseTemplateProvider();

    const result = await provider.getTemplate(
      testProjectId,
      '_system/config/default/nonexistent.md'
    );

    expect(result).toBeNull();
  });

  it('should return correct file metadata', async () => {
    if (!dbAvailable) return;

    const provider = new DatabaseTemplateProvider();

    const result = await provider.getTemplate(testProjectId, testTemplatePath);

    expect(result?.fileName).toBe('test_template.md');
    expect(result?.filePath).toBe(testTemplatePath);
  });
});
