/**
 * 导入 CBT 评估脚本到数据库
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { eq } from 'drizzle-orm';

import { db, closeConnection } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 固定的 UUID，用于测试
const SCRIPT_UUID = '550e8400-e29b-41d4-a716-446655440001';

async function importScript() {
  try {
    console.log('📦 开始导入 CBT 脚本...');

    // 读取脚本文件
    const scriptPath = resolve(__dirname, '../../scripts/sessions/cbt_depression_assessment.yaml');
    console.log(`📂 读取脚本: ${scriptPath}`);

    const scriptContent = readFileSync(scriptPath, 'utf-8');

    // 检查脚本是否已存在
    const existingScript = await db.query.scripts.findFirst({
      where: eq(scripts.id, SCRIPT_UUID),
    });

    if (existingScript) {
      console.log('⚠️  脚本已存在，更新中...');
      await db
        .update(scripts)
        .set({
          scriptContent: scriptContent,
          updatedAt: new Date(),
        })
        .where(eq(scripts.id, SCRIPT_UUID));
      console.log('✅ 脚本更新成功');
    } else {
      console.log('📝 插入新脚本...');
      await db.insert(scripts).values({
        id: SCRIPT_UUID,
        scriptName: 'CBT抑郁症初次评估会谈',
        scriptType: 'session',
        scriptContent: scriptContent,
        version: '1.0.0',
        status: 'published',
        author: 'HeartRule Team',
        description: '用于抑郁症患者的初次评估会谈',
        tags: ['CBT', '抑郁症', '评估'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('✅ 脚本导入成功');
    }

    console.log('');
    console.log('脚本信息:');
    console.log(`  ID: ${SCRIPT_UUID}`);
    console.log('  名称: CBT抑郁症初次评估会谈');
    console.log('  类型: session');
    console.log('  状态: published');
  } catch (error) {
    console.error('❌ 导入脚本失败:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

importScript();
