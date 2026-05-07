import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles, projects } from './src/db/schema.js';

async function checkActualScript() {
  // 从日志中提取的实际projectId（session创建时的projectId）
  const projectId = '0042aed9-a756-4bbf-95f4-3ec355feb651';

  console.log('1. 查询项目信息...');
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

  if (!project) {
    console.log('❌ 项目不存在');
    process.exit(1);
  }

  console.log('✅ 项目存在:', project.projectName);

  console.log('\n2. 查询该项目的所有脚本文件...');
  const scripts = await db.select().from(scriptFiles).where(eq(scriptFiles.projectId, projectId));

  console.log(`   找到 ${scripts.length} 个脚本文件\n`);

  for (const script of scripts) {
    if (script.fileType !== 'session') continue;

    console.log(`📄 脚本: ${script.fileName}`);
    console.log(`   ID: ${script.id}`);
    console.log(`   Path: ${script.filePath}`);

    const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
    if (!content) {
      console.log('   ⚠️  无内容\n');
      continue;
    }

    // 检查是否包含 say_welcome
    if (content.includes('say_welcome')) {
      console.log('   ✅ 包含 say_welcome action');

      // 检查 max_rounds
      const maxRoundsMatches = content.match(/max_rounds:\s*\d+/g);
      if (maxRoundsMatches) {
        console.log('   ✅ 包含 max_rounds:', maxRoundsMatches);
      } else {
        console.log('   ❌ 不包含 max_rounds 配置');
      }

      // 显示 say_welcome 配置片段
      const sayWelcomeMatch = content.match(/action_id:\s*say_welcome[\s\S]{0,300}/);
      if (sayWelcomeMatch) {
        console.log('\n   配置片段:');
        console.log('   ' + sayWelcomeMatch[0].split('\n').join('\n   '));
      }
    }

    console.log('');
  }

  process.exit(0);
}

checkActualScript().catch((error) => {
  console.error('执行失败:', error);
  process.exit(1);
});
