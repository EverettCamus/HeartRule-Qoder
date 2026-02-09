import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function checkScriptConfig() {
  const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';
  
  const [script] = await db.select()
    .from(scriptFiles)
    .where(eq(scriptFiles.id, scriptId));
  
  if (script) {
    console.log('📄 Script Info:');
    console.log('   ID:', script.id);
    console.log('   Name:', script.fileName);
    console.log('   Project:', script.projectId);
    console.log('');
    
    const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
    if (content) {
      console.log('📝 YAML Content (first 1000 chars):');
      console.log(content.substring(0, 1000));
      console.log('');
      
      const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
      if (match) {
        console.log('🔍 Found template_scheme:', match[1]);
      } else {
        console.log('❌ No template_scheme found in content');
      }
    }
  } else {
    console.log('❌ Script not found');
  }
  
  process.exit(0);
}

checkScriptConfig().catch(console.error);
