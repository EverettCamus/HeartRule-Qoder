import { db } from './src/db/index.js';
import { scripts, scriptFiles } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * 查找 test999 工程的所有脚本
 */
async function findTest999Scripts() {
  const test999ProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5';
  
  console.log('🔍 查找 test999 工程的所有脚本\n');
  console.log('='.repeat(80));
  
  // 查找所有脚本
  const allScripts = await db.select().from(scripts);
  
  console.log(`\n数据库中共有 ${allScripts.length} 个脚本\n`);
  
  // 过滤 test999 工程的脚本
  const test999Scripts = allScripts.filter(s => {
    const tags = (s.tags as string[]) || [];
    const projectTag = tags.find(tag => tag.startsWith('project:'));
    const projectId = projectTag ? projectTag.replace('project:', '') : undefined;
    return projectId === test999ProjectId;
  });
  
  console.log(`test999 工程（${test999ProjectId}）的脚本: ${test999Scripts.length} 个\n`);
  
  if (test999Scripts.length === 0) {
    console.log('❌ test999 工程中没有脚本！');
    console.log('\n这就是问题根源：');
    console.log('1. 用户创建了 test999 工程');
    console.log('2. 用户在前端编辑了 hello-world.yaml');
    console.log('3. 但该脚本属于 test project22 工程');
    console.log('4. 前端没有正确隔离不同工程的脚本');
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ 解决方案:\n');
    console.log('需要在前端实现工程隔离机制：');
    console.log('1. 脚本编辑器只显示当前工程的脚本');
    console.log('2. 创建会话时只允许选择当前工程的脚本');
    console.log('3. 脚本列表中显示每个脚本所属的工程');
  } else {
    console.log('test999 工程的脚本列表:\n');
    for (const s of test999Scripts) {
      console.log(`  - ${s.scriptName} (ID: ${s.id})`);
      console.log(`    CreatedAt: ${s.createdAt}`);
      console.log(`    UpdatedAt: ${s.updatedAt}`);
      
      // 检查 template_scheme 配置
      const scriptContent = s.scriptContent;
      if (typeof scriptContent === 'string' && scriptContent.includes('template_scheme')) {
        const match = scriptContent.match(/template_scheme:\s*["']?(\w+)["']?/);
        if (match) {
          console.log(`    template_scheme: ${match[1]}`);
        }
      }
      console.log('');
    }
  }
  
  // 检查 test999 工程的模板文件
  console.log('\n' + '='.repeat(80));
  console.log('🔍 检查 test999 工程的模板文件\n');
  
  const test999Templates = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, test999ProjectId));
  
  console.log(`test999 工程共有 ${test999Templates.length} 个文件\n`);
  
  const customTemplates = test999Templates.filter(t => 
    t.fileType === 'template' && t.filePath?.includes('/custom/')
  );
  
  if (customTemplates.length > 0) {
    console.log('自定义模板:');
    for (const t of customTemplates) {
      console.log(`  - ${t.filePath}`);
    }
  } else {
    console.log('⚠️  没有自定义模板');
  }
  
  process.exit(0);
}

findTest999Scripts().catch(console.error);
