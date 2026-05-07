import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles, projects } from './src/db/schema.js';

async function compareTest999Projects() {
  const projectIds = [
    '133fd913-6cb4-4925-9e7d-8cb338e91221',
    '6d38fcc6-977b-423f-abc5-6b590e1942e5',
  ];

  console.log('🔍 对比两个 test999 项目\n');
  console.log('='.repeat(80));

  for (const projectId of projectIds) {
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));

    console.log(`\n📁 项目: ${project.projectName}`);
    console.log(`   ID: ${projectId}`);
    console.log(`   创建时间: ${project.createdAt}`);

    // 获取所有文件
    const files = await db.select().from(scriptFiles).where(eq(scriptFiles.projectId, projectId));

    console.log(`\n   文件统计:`);
    console.log(`   - 总文件数: ${files.length}`);
    console.log(`   - Session 脚本: ${files.filter((f) => f.fileType === 'session').length}`);
    console.log(`   - 模板文件: ${files.filter((f) => f.fileType === 'template').length}`);

    // 检查模板
    const templates = files.filter((f) => f.fileType === 'template');
    if (templates.length > 0) {
      console.log(`\n   模板文件:`);
      const customTemplates = templates.filter((t) => t.filePath?.includes('/custom/'));
      const defaultTemplates = templates.filter((t) => t.filePath?.includes('/default/'));

      if (defaultTemplates.length > 0) {
        console.log(`   Default 模板:`);
        for (const t of defaultTemplates) {
          console.log(`      - ${t.filePath}`);
        }
      }

      if (customTemplates.length > 0) {
        console.log(`   Custom 模板:`);
        const schemes = new Set<string>();
        for (const t of customTemplates) {
          const match = t.filePath?.match(/_system\/config\/custom\/(\w+)\//);
          if (match) schemes.add(match[1]);
          console.log(`      - ${t.filePath}`);
        }
        console.log(`   ✅ 包含方案: ${Array.from(schemes).join(', ')}`);
      } else {
        console.log(`   ⚠️  无自定义模板`);
      }
    }

    // 检查 hello-world.yaml
    const helloWorld = files.find((f) => f.fileName === 'hello-world.yaml');
    if (helloWorld) {
      console.log(`\n   hello-world.yaml:`);
      const content =
        (helloWorld.fileContent as any)?.content || (helloWorld.fileContent as any)?.yaml;
      if (content) {
        const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
        if (match) {
          console.log(`      template_scheme: ${match[1]}`);
        } else {
          console.log(`      ⚠️  未配置 template_scheme`);
        }
      }
    }

    console.log('\n' + '-'.repeat(80));
  }

  console.log('\n📊 推荐使用:');
  console.log('   项目ID: 6d38fcc6-977b-423f-abc5-6b590e1942e5');
  console.log('   原因: 该项目包含 leo 自定义模板');

  process.exit(0);
}

compareTest999Projects().catch(console.error);
