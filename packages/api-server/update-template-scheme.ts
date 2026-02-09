import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function updateTemplateScheme() {
  const scriptId = 'e8c0b13e-31cb-44da-9709-1242d73f25a7';
  
  console.log('🔧 Updating template_scheme...\n');
  
  const [script] = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.id, scriptId));
  
  if (!script) {
    console.log('❌ Script not found');
    process.exit(1);
  }
  
  const fileContent = script.fileContent as any;
  let content = fileContent?.content || fileContent?.yaml;
  
  if (!content) {
    console.log('❌ No content found');
    process.exit(1);
  }
  
  console.log('📄 Original value:', content.match(/template_scheme:\s*["']?(\w+)["']?/)?.[1]);
  
  // 修改 template_scheme
  content = content.replace(/template_scheme:\s*tttt/, 'template_scheme: sdlf');
  
  console.log('✅ New value:', content.match(/template_scheme:\s*["']?(\w+)["']?/)?.[1]);
  
  // 更新数据库
  await db.update(scriptFiles)
    .set({
      fileContent: {
        ...fileContent,
        content: content,
        yaml: content,
      },
      updatedAt: new Date(),
    })
    .where(eq(scriptFiles.id, scriptId));
  
  console.log('\n✅ Updated successfully!');
  console.log('⚠️  Please create a NEW session to test the change');
  
  process.exit(0);
}

updateTemplateScheme().catch(console.error);
