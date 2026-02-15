import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function updateHelloWorldScheme() {
  const scriptId = 'e8c0b13e-31cb-44da-9709-1242d73f25a7';

  console.log('🔧 更新 hello-world.yaml 的 template_scheme\n');

  const [script] = await db.select().from(scriptFiles).where(eq(scriptFiles.id, scriptId));

  if (!script) {
    console.log('❌ 脚本不存在');
    process.exit(1);
  }

  const fileContent = script.fileContent as any;
  let content = fileContent?.content || fileContent?.yaml;

  if (!content) {
    console.log('❌ 无内容');
    process.exit(1);
  }

  console.log('📄 当前 template_scheme:', content.match(/template_scheme:\s*["']?(\w+)["']?/)?.[1]);

  // 修改为 leo
  content = content.replace(/template_scheme:\s*\w+/, 'template_scheme: leo');

  console.log('✅ 新 template_scheme:', content.match(/template_scheme:\s*["']?(\w+)["']?/)?.[1]);

  // 更新数据库
  await db
    .update(scriptFiles)
    .set({
      fileContent: {
        ...fileContent,
        content: content,
        yaml: content,
      },
      updatedAt: new Date(),
    })
    .where(eq(scriptFiles.id, scriptId));

  console.log('\n✅ 更新成功！');
  console.log('⚠️  请创建新 session 来测试（旧 session 使用缓存的配置）');

  process.exit(0);
}

updateHelloWorldScheme().catch(console.error);
