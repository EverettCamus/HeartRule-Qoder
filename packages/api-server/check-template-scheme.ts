import { eq } from 'drizzle-orm';
import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function checkTemplateScheme() {
  const projectId = '0042aed9-a756-4bbf-95f4-3ec355feb651';
  
  const scripts = await db.select().from(scriptFiles)
    .where(eq(scriptFiles.projectId, projectId));
  
  const script = scripts.find(s => s.fileType === 'session' && s.fileName.includes('hello-world'));
  
  if (script) {
    const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
    console.log('📄 YAML Content:');
    console.log(content);
    console.log('\n🔍 Checking template_scheme:');
    const hasTemplateScheme = content.includes('template_scheme');
    console.log('   Contains template_scheme:', hasTemplateScheme);
    
    if (hasTemplateScheme) {
      const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
      if (match) {
        console.log('   ✅ Found template_scheme value:', match[1]);
      }
    }
  } else {
    console.log('❌ Script not found');
  }
  
  process.exit(0);
}

checkTemplateScheme().catch(console.error);
