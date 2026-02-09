import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function fixScriptProjectId() {
  const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';
  const correctProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5'; // test999
  
  console.log('🔧 修复脚本 projectId\n');
  console.log('='.repeat(80));
  
  // 查询当前状态
  const [script] = await db.select()
    .from(scripts)
    .where(eq(scripts.id, scriptId));
  
  console.log('\n修复前:');
  console.log(`  scriptId: ${script.id}`);
  console.log(`  scriptName: ${script.scriptName}`);
  console.log(`  tags:`, script.tags);
  
  const oldTags = (script.tags as string[]) || [];
  const oldProjectTag = oldTags.find(tag => tag.startsWith('project:'));
  const oldProjectId = oldProjectTag ? oldProjectTag.replace('project:', '') : undefined;
  console.log(`  projectId: ${oldProjectId}`);
  
  // 更新 tags
  const newTags = ['debug', `project:${correctProjectId}`];
  
  await db.update(scripts)
    .set({
      tags: newTags,
      updatedAt: new Date(),
    })
    .where(eq(scripts.id, scriptId));
  
  // 验证修复结果
  const [updatedScript] = await db.select()
    .from(scripts)
    .where(eq(scripts.id, scriptId));
  
  console.log('\n修复后:');
  console.log(`  tags:`, updatedScript.tags);
  
  const newProjectTag = (updatedScript.tags as string[]).find(tag => tag.startsWith('project:'));
  const newProjectId = newProjectTag ? newProjectTag.replace('project:', '') : undefined;
  console.log(`  projectId: ${newProjectId}`);
  
  if (newProjectId === correctProjectId) {
    console.log('\n✅ 修复成功！脚本现在属于 test999 工程');
  } else {
    console.log('\n❌ 修复失败');
  }
  
  process.exit(0);
}

fixScriptProjectId().catch(console.error);
