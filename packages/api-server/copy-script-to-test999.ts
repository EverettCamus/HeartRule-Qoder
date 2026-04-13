import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

/**
 * 复制 hello-world.yaml 脚本到 test999 工程
 */
async function copyScriptToTest999() {
  const sourceScriptId = 'ef45f366-b271-4696-870c-44db13d465f7'; // test project22 的脚本
  const targetProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5'; // test999 工程

  console.log('🔄 复制脚本到 test999 工程\n');
  console.log('='.repeat(80));

  // 1. 查询源脚本
  const [sourceScript] = await db.select().from(scripts).where(eq(scripts.id, sourceScriptId));

  if (!sourceScript) {
    console.log('❌ 源脚本不存在');
    return;
  }

  console.log('\n源脚本信息:');
  console.log(`  - scriptName: ${sourceScript.scriptName}`);
  console.log(`  - tags:`, sourceScript.tags);

  // 2. 创建新脚本（使用新的脚本名称避免冲突）
  const newScriptId = uuidv4();
  const now = new Date();
  const newScriptName = `test999-${sourceScript.scriptName}`;

  const newTags = ['debug', `project:${targetProjectId}`];

  await db.insert(scripts).values({
    id: newScriptId,
    scriptName: newScriptName,
    scriptType: sourceScript.scriptType,
    scriptContent: sourceScript.scriptContent,
    version: sourceScript.version,
    status: sourceScript.status,
    author: sourceScript.author || 'system',
    description: sourceScript.description || '',
    tags: newTags,
    createdAt: now,
    updatedAt: now,
  });

  console.log('\n✅ 脚本复制成功:');
  console.log(`  - 新脚本名称: ${newScriptName}`);
  console.log(`  - 新 Script ID: ${newScriptId}`);
  console.log(`  - 目标工程: ${targetProjectId} (test999)`);
  console.log(`  - tags:`, newTags);

  console.log('\n' + '='.repeat(80));
  console.log('📋 使用说明:\n');
  console.log('1. 在前端重新加载脚本列表');
  console.log(`2. 选择 test999 工程的脚本: ${newScriptName}`);
  console.log(`3. 使用新的 scriptId: ${newScriptId}`);
  console.log('4. 创建新会话，系统将正确使用 test999 的模板');
  console.log('\n✅ 成功后，系统将查找: _system/config/custom/leo/ai_say_v1.md');
  console.log('   projectId: 6d38fcc6-977b-423f-abc5-6b590e1942e5 (test999)');

  process.exit(0);
}

copyScriptToTest999().catch(console.error);
