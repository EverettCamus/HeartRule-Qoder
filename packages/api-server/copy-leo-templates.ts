import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function copyLeoTemplates() {
  const sourceProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5'; // test999 with leo
  const targetProjectId = '0042aed9-a756-4bbf-95f4-3ec355feb651'; // test project22
  
  console.log('🔧 复制 leo 模板\n');
  console.log(`   源项目: ${sourceProjectId} (test999)`);
  console.log(`   目标项目: ${targetProjectId} (test project22)\n`);
  
  // 获取源项目的 leo 模板
  const sourceTemplates = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, sourceProjectId));
  
  const leoTemplates = sourceTemplates.filter(f => 
    f.fileType === 'template' && f.filePath?.includes('custom/leo')
  );
  
  console.log(`找到 ${leoTemplates.length} 个 leo 模板:\n`);
  
  for (const template of leoTemplates) {
    console.log(`📄 ${template.filePath}`);
    
    // 检查目标项目是否已有该模板
    const existing = await db.select()
      .from(scriptFiles)
      .where(eq(scriptFiles.projectId, targetProjectId));
    
    const alreadyExists = existing.some(f => f.filePath === template.filePath);
    
    if (alreadyExists) {
      console.log(`   ⚠️  目标项目已存在，跳过`);
      continue;
    }
    
    // 复制模板到目标项目
    await db.insert(scriptFiles).values({
      projectId: targetProjectId,
      fileName: template.fileName,
      filePath: template.filePath,
      fileType: template.fileType,
      fileContent: template.fileContent,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log(`   ✅ 已复制到目标项目`);
  }
  
  console.log('\n✅ 复制完成！');
  console.log('⚠️  请创建新 session 来测试');
  
  process.exit(0);
}

copyLeoTemplates().catch(console.error);
