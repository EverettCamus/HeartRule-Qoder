import { eq, desc } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { sessions, scriptFiles, projects } from './src/db/schema.js';

async function analyzeSessionBinding() {
  console.log('🔍 分析会话与工程绑定关系\n');
  console.log('='.repeat(70));

  // 1. 获取最新的活动会话
  console.log('\n1️⃣ 查找最近的活动会话');
  const [latestSession] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .orderBy(desc(sessions.createdAt))
    .limit(1);

  if (!latestSession) {
    console.log('❌ 没有找到活动会话');
    process.exit(1);
  }

  console.log(`\n📋 当前活动会话:`);
  console.log(`   Session ID: ${latestSession.id}`);
  console.log(`   Script ID: ${latestSession.scriptId}`);
  console.log(`   Created: ${latestSession.createdAt}`);

  // 2. 获取会话关联的脚本
  console.log('\n2️⃣ 查找会话关联的脚本');
  const [script] = await db
    .select()
    .from(scriptFiles)
    .where(eq(scriptFiles.id, latestSession.scriptId));

  if (!script) {
    console.log('❌ 脚本不存在');
    process.exit(1);
  }

  console.log(`\n📄 脚本信息:`);
  console.log(`   文件名: ${script.fileName}`);
  console.log(`   项目ID: ${script.projectId}`);
  console.log(`   文件类型: ${script.fileType}`);

  // 检查 template_scheme
  const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
  if (content) {
    const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
    if (match) {
      console.log(`   ✅ template_scheme: ${match[1]}`);
    } else {
      console.log(`   ⚠️  未配置 template_scheme`);
    }
  }

  // 3. 获取脚本所属项目
  console.log('\n3️⃣ 查找脚本所属项目');
  const [project] = await db.select().from(projects).where(eq(projects.id, script.projectId));

  if (!project) {
    console.log('❌ 项目不存在');
    process.exit(1);
  }

  console.log(`\n📁 项目信息:`);
  console.log(`   项目名称: ${project.projectName}`);
  console.log(`   项目ID: ${project.id}`);
  console.log(`   创建时间: ${project.createdAt}`);

  // 4. 检查该项目的所有模板
  console.log('\n4️⃣ 检查项目的模板文件');
  const templates = await db
    .select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, script.projectId));

  const templateFiles = templates.filter((f) => f.fileType === 'template');
  console.log(`\n   项目有 ${templateFiles.length} 个模板文件:`);

  // 按路径分组
  const customTemplates = templateFiles.filter((f) => f.filePath?.includes('/custom/'));
  const defaultTemplates = templateFiles.filter((f) => f.filePath?.includes('/default/'));

  console.log(`\n   Default 模板 (${defaultTemplates.length} 个):`);
  for (const tmpl of defaultTemplates) {
    console.log(`      - ${tmpl.filePath}`);
  }

  console.log(`\n   Custom 模板 (${customTemplates.length} 个):`);
  if (customTemplates.length === 0) {
    console.log(`      ⚠️  该项目没有任何自定义模板！`);
  } else {
    const schemes = new Set<string>();
    for (const tmpl of customTemplates) {
      const match = tmpl.filePath?.match(/_system\/config\/custom\/(\w+)\//);
      if (match) {
        schemes.add(match[1]);
      }
      console.log(`      - ${tmpl.filePath}`);
    }
    console.log(`\n   包含的模板方案: ${Array.from(schemes).join(', ')}`);
  }

  // 5. 检查 test999 项目
  console.log('\n5️⃣ 查找 test999 项目');
  const allProjects = await db.select().from(projects);
  const test999Projects = allProjects.filter(
    (p) =>
      p.projectName?.toLowerCase().includes('test999') ||
      p.projectName?.toLowerCase().includes('999')
  );

  if (test999Projects.length > 0) {
    console.log(`\n   找到 ${test999Projects.length} 个 test999 相关项目:\n`);
    for (const p of test999Projects) {
      console.log(`   📁 ${p.projectName}`);
      console.log(`      ID: ${p.id}`);
      console.log(`      创建: ${p.createdAt}`);

      // 检查该项目的模板
      const projTemplates = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.projectId, p.id));

      const projTemplateFiles = projTemplates.filter((f) => f.fileType === 'template');
      const projCustom = projTemplateFiles.filter((f) => f.filePath?.includes('/custom/'));

      if (projCustom.length > 0) {
        const projSchemes = new Set<string>();
        for (const tmpl of projCustom) {
          const match = tmpl.filePath?.match(/_system\/config\/custom\/(\w+)\//);
          if (match) projSchemes.add(match[1]);
        }
        console.log(`      模板方案: ${Array.from(projSchemes).join(', ')}`);
      } else {
        console.log(`      ⚠️  无自定义模板`);
      }
      console.log('');
    }
  } else {
    console.log('   ❌ 未找到 test999 项目');
  }

  // 6. 结论
  console.log('\n' + '='.repeat(70));
  console.log('📊 诊断结论:\n');

  if (project.projectName === 'test project22') {
    console.log('❌ 问题确认：');
    console.log('   当前活动会话绑定到了 "test project22" 项目');
    console.log(`   而不是您期望的 "test999" 项目`);
    console.log('');
    console.log('💡 原因：');
    console.log('   会话创建时使用了 test project22 的脚本');
    console.log('   会话与项目的绑定关系在创建时确定，不会自动切换');
    console.log('');
    console.log('✅ 解决方案：');
    console.log('   1. 在前端切换到 "test999" 项目');
    console.log('   2. 创建新的会话（使用 test999 项目的脚本）');
    console.log('   3. 新会话将正确使用 test999 项目的模板配置');
  } else if (project.projectName?.includes('test999') || project.projectName?.includes('999')) {
    console.log('✅ 会话已正确绑定到 test999 项目');
    console.log(`   项目ID: ${project.id}`);

    if (customTemplates.some((t) => t.filePath?.includes('/leo/'))) {
      console.log('   ✅ 项目包含 leo 模板');
    } else {
      console.log('   ❌ 项目缺少 leo 模板');
      console.log('');
      console.log('💡 需要将 leo 模板添加到该项目');
    }
  }

  process.exit(0);
}

analyzeSessionBinding().catch(console.error);
