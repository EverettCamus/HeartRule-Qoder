import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function checkAllScripts() {
  const projectId = '0042aed9-a756-4bbf-95f4-3ec355feb651';
  
  const scripts = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.projectId, projectId));
  
  console.log(`Found ${scripts.length} scripts for project ${projectId}\n`);
  
  for (const script of scripts) {
    if (script.fileType !== 'session') continue;
    
    console.log(`📄 ${script.fileName} (ID: ${script.id.substring(0, 8)}...)`);
    
    const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
    if (content && content.includes('template_scheme')) {
      const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
      if (match) {
        console.log(`   ✅ template_scheme: ${match[1]}`);
      }
    } else {
      console.log('   ⚠️  No template_scheme');
    }
  }
  
  process.exit(0);
}

checkAllScripts().catch(console.error);
