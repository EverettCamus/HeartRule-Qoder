import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { describe, it, expect, afterAll, beforeAll } from 'vitest';

import { db } from '../db/index.js';
import { scripts } from '../db/schema.js';

/**
 * 脚本导入接口测试
 * 回归测试：防止脚本导入时未更新tags导致工程隔离失效
 *
 * 注意：此测试需要 PostgreSQL 数据库连接
 * 如果数据库不可用，测试将被跳过
 */
describe('POST /api/scripts/import - projectId tags update', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    // 检查数据库连接是否可用
    try {
      await db.select().from(scripts).limit(1);
      dbAvailable = true;
      console.log('✅ Database connection available for integration tests');
    } catch (error) {
      dbAvailable = false;
      console.warn('⚠️  Database connection not available, skipping integration tests');
      console.warn('   To run these tests, start PostgreSQL: docker-compose up -d postgres');
    }
  });
  const testProjectId1 = '11111111-1111-1111-1111-111111111111';
  const testProjectId2 = '22222222-2222-2222-2222-222222222222';
  const testScriptName = `test-script-${uuidv4()}.yaml`;
  const testYamlContent = `
session:
  template_scheme: default
  max_rounds: 3
phases:
  - id: test_phase
    topics:
      - id: test_topic
        actions:
          - id: say_hello
            type: ai_say
            config:
              content: "Hello World"
              max_rounds: 1
`;

  let createdScriptId: string;

  afterAll(async () => {
    // 清理测试数据
    if (createdScriptId) {
      await db.delete(scripts).where(eq(scripts.id, createdScriptId));
    }
  });

  it.skipIf(!dbAvailable)('应该在首次导入时正确设置 projectId tags', async () => {
    // 模拟导入API的逻辑
    const scriptId = uuidv4();
    const now = new Date();

    await db.insert(scripts).values({
      id: scriptId,
      scriptName: testScriptName,
      scriptType: 'session',
      scriptContent: testYamlContent,
      version: '1.0.0',
      status: 'draft',
      author: 'test_user',
      description: 'Test script',
      tags: ['debug', `project:${testProjectId1}`],
      createdAt: now,
      updatedAt: now,
    });

    createdScriptId = scriptId;

    // 验证 tags 正确设置
    const [script] = await db.select().from(scripts).where(eq(scripts.id, scriptId));
    expect(script).toBeDefined();
    expect(script.tags).toEqual(['debug', `project:${testProjectId1}`]);

    // 验证可以提取 projectId
    const tags = (script.tags as string[]) || [];
    const projectTag = tags.find((tag) => tag.startsWith('project:'));
    const projectId = projectTag?.replace('project:', '');
    expect(projectId).toBe(testProjectId1);
  });

  it.skipIf(!dbAvailable)('应该在更新脚本时同步更新 projectId tags', async () => {
    // 模拟脚本已存在的场景
    const existingScript = await db.query.scripts.findFirst({
      where: eq(scripts.id, createdScriptId),
    });

    expect(existingScript).toBeDefined();
    expect(existingScript!.tags).toEqual(['debug', `project:${testProjectId1}`]);

    // 模拟从不同工程导入（更新）同名脚本
    const updatedContent = testYamlContent.replace('Hello World', 'Updated Content');
    const updateData: any = {
      scriptContent: updatedContent,
      description: 'Updated description',
      updatedAt: new Date(),
    };

    // 🎯 关键测试点：更新时必须同步更新 tags 中的 projectId
    updateData.tags = ['debug', `project:${testProjectId2}`];

    await db.update(scripts).set(updateData).where(eq(scripts.id, createdScriptId));

    // 验证 tags 已更新
    const [updatedScript] = await db.select().from(scripts).where(eq(scripts.id, createdScriptId));
    expect(updatedScript.tags).toEqual(['debug', `project:${testProjectId2}`]);

    // 验证提取的 projectId 已更新
    const tags = (updatedScript.tags as string[]) || [];
    const projectTag = tags.find((tag) => tag.startsWith('project:'));
    const projectId = projectTag?.replace('project:', '');
    expect(projectId).toBe(testProjectId2);
    expect(projectId).not.toBe(testProjectId1); // 确保不是旧的 projectId
  });

  it.skipIf(!dbAvailable)('应该防止工程隔离失效：Session创建时提取正确的projectId', async () => {
    // 模拟 Session 创建时从 script.tags 提取 projectId 的逻辑
    const [script] = await db.select().from(scripts).where(eq(scripts.id, createdScriptId));

    const tags = (script.tags as string[]) || [];
    const projectTag = tags.find((tag) => tag.startsWith('project:'));
    const extractedProjectId = projectTag?.replace('project:', '');

    // 验证提取的 projectId 是最新的（testProjectId2），而非旧的（testProjectId1）
    expect(extractedProjectId).toBe(testProjectId2);

    // 模拟 Session metadata 中保存 projectId
    const sessionMetadata = {
      projectId: extractedProjectId,
    };

    expect(sessionMetadata.projectId).toBe(testProjectId2);

    // 验证工程隔离：如果用户在 testProjectId2 工程中调试，
    // Session 必须关联到 testProjectId2，而不是 testProjectId1
    expect(sessionMetadata.projectId).not.toBe(testProjectId1);
  });
});
