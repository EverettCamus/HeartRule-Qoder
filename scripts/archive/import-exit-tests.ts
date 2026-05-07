/**
 * 导入退出机制测试脚本到指定项目
 *
 * 使用方法：pnpm --filter @heartrule/api-server tsx import-exit-tests.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { eq, and } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

const PROJECT_ID = '9d82fd10-7931-4e47-921b-02c634ff62d2';

const EXIT_TESTS_DIR = join(
  process.cwd(),
  '..',
  '..',
  '.worktrees',
  'ai_ask-exit-decision',
  'scripts',
  'sessions',
  'exit-tests'
);

async function importExitTests() {
  console.log('📥 导入退出机制测试脚本到项目:', PROJECT_ID);
  console.log('📁 测试脚本目录:', EXIT_TESTS_DIR);

  const files = readdirSync(EXIT_TESTS_DIR).filter((f) => f.endsWith('.yaml'));

  console.log(`\n找到 ${files.length} 个测试文件:\n`);

  for (const file of files) {
    const filePath = join(EXIT_TESTS_DIR, file);
    const yamlContent = readFileSync(filePath, 'utf-8');

    console.log(`📄 导入: ${file}`);

    const [existing] = await db
      .select()
      .from(scriptFiles)
      .where(and(eq(scriptFiles.projectId, PROJECT_ID), eq(scriptFiles.fileName, file)));

    if (existing) {
      await db
        .update(scriptFiles)
        .set({
          yamlContent,
          updatedAt: new Date(),
        })
        .where(eq(scriptFiles.id, existing.id));
      console.log(`   ✅ 已更新 (ID: ${existing.id})`);
    } else {
      const [inserted] = await db
        .insert(scriptFiles)
        .values({
          projectId: PROJECT_ID,
          fileType: 'session',
          fileName: file,
          filePath: `sessions/exit-tests/${file}`,
          fileContent: {},
          yamlContent,
        })
        .returning();
      console.log(`   ✅ 已插入 (ID: ${inserted.id})`);
    }
  }

  console.log('\n🎉 导入完成!');
}

importExitTests().catch(console.error);
