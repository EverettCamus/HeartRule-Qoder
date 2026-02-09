import { db } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';
import { eq, like } from 'drizzle-orm';

async function diagnoseTemplateIssue() {
  const targetProjectId = '0042aed9-a756-4bbf-95f4-3ec355feb651';
  const searchPath = '_system/config/custom/leo/ai_say_v1.md';
  
  console.log('🔍 模板问题诊断\n');
  console.log('=' .repeat(60));
  
  // 1. 检查项目信息
  console.log('\n1️⃣ 检查项目信息');
  const [project] = await db.select().from(projects).where(eq(projects.id, targetProjectId));
  if (project) {
    console.log(`   ✅ 项目存在: ${project.projectName}`);
  } else {
    console.log(`   ❌ 项目不存在: ${targetProjectId}`);
    process.exit(1);
  }
  
  // 2. 检查项目的所有脚本文件
  console.log('\n2️⃣ 检查项目的脚本文件');
  const allScripts = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, targetProjectId));
  
  console.log(`   找到 ${allScripts.length} 个文件\n`);
  
  for (const script of allScripts) {
    console.log(`   📄 ${script.fileName} (${script.fileType})`);
    console.log(`      ID: ${script.id}`);
    console.log(`      Path: ${script.filePath || 'null'}`);
    
    // 检查是否是模板文件
    if (script.fileType === 'template') {
      console.log(`      🎯 这是模板文件！`);
      if (script.filePath === searchPath) {
        console.log(`      ✅ 路径完全匹配！`);
      } else {
        console.log(`      ⚠️  路径不匹配:`);
        console.log(`         期望: ${searchPath}`);
        console.log(`         实际: ${script.filePath}`);
      }
    }
    
    // 检查是否是session文件
    if (script.fileType === 'session' && script.fileName.includes('hello-world')) {
      const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
      if (content) {
        const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
        if (match) {
          console.log(`      📋 template_scheme: ${match[1]}`);
        }
      }
    }
    console.log('');
  }
  
  // 3. 搜索所有包含"leo"的模板
  console.log('\n3️⃣ 搜索所有包含"leo"的模板');
  const leoTemplates = await db.select()
    .from(scriptFiles)
    .where(like(scriptFiles.filePath, '%leo%'));
  
  if (leoTemplates.length > 0) {
    console.log(`   找到 ${leoTemplates.length} 个包含"leo"的模板:\n`);
    for (const tmpl of leoTemplates) {
      console.log(`   📄 ${tmpl.filePath}`);
      console.log(`      Project: ${tmpl.projectId}`);
      console.log(`      Type: ${tmpl.fileType}`);
      console.log('');
    }
  } else {
    console.log(`   ❌ 未找到任何包含"leo"的模板`);
  }
  
  // 4. 检查是否存在其他custom模板
  console.log('\n4️⃣ 检查所有custom模板');
  const customTemplates = await db.select()
    .from(scriptFiles)
    .where(like(scriptFiles.filePath, '%custom%'));
  
  console.log(`   找到 ${customTemplates.length} 个custom模板:\n`);
  const grouped = new Map<string, number>();
  for (const tmpl of customTemplates) {
    const match = tmpl.filePath?.match(/_system\/config\/custom\/(\w+)\//);
    if (match) {
      const scheme = match[1];
      grouped.set(scheme, (grouped.get(scheme) || 0) + 1);
    }
  }
  
  for (const [scheme, count] of grouped.entries()) {
    console.log(`   📁 ${scheme}: ${count} 个模板`);
  }
  
  // 5. 检查目标项目的所有模板
  console.log('\n5️⃣ 检查目标项目的所有模板文件');
  const projectTemplates = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, targetProjectId));
  
  const templates = projectTemplates.filter(f => f.fileType === 'template');
  console.log(`   项目有 ${templates.length} 个模板文件\n`);
  
  for (const tmpl of templates) {
    console.log(`   📄 ${tmpl.filePath}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 诊断完成');
  
  process.exit(0);
}

diagnoseTemplateIssue().catch(console.error);
