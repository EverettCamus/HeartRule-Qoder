import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';

async function findTest999Project() {
  console.log('🔍 查找 "test999" 工程\n');

  // 搜索包含 "test999" 的项目
  const allProjects = await db.select().from(projects);
  const test999Projects = allProjects.filter(
    (p) =>
      p.projectName?.toLowerCase().includes('test999') ||
      p.projectName?.toLowerCase().includes('999')
  );

  if (test999Projects.length === 0) {
    console.log('❌ 未找到名称包含 "test999" 的项目\n');
    console.log('📋 所有项目列表:');
    for (const p of allProjects) {
      console.log(`   - ${p.projectName} (ID: ${p.id.substring(0, 8)}...)`);
    }
  } else {
    console.log(`✅ 找到 ${test999Projects.length} 个相关项目:\n`);
    for (const project of test999Projects) {
      console.log(`📁 ${project.projectName}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   Created: ${project.createdAt}`);

      // 检查该项目的模板
      const templates = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, project.id));

      const templateFiles = templates.filter((f) => f.fileType === 'template');
      console.log(`   模板数量: ${templateFiles.length}\n`);

      for (const tmpl of templateFiles) {
        console.log(`   📄 ${tmpl.filePath}`);
      }
      console.log('');
    }
  }

  // 检查 leo 模板的实际归属
  console.log('\n🎯 检查 "leo" 模板的实际归属:\n');
  const leoProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5';
  const [leoProject] = await db.select().from(projects).where(eq(projects.id, leoProjectId));

  if (leoProject) {
    console.log(`📁 Leo 模板所属项目: ${leoProject.projectName}`);
    console.log(`   ID: ${leoProject.id}`);
    console.log(`   Created: ${leoProject.createdAt}`);
  }

  process.exit(0);
}

findTest999Project().catch(console.error);
