/**
 * 查看 new-session111.yaml 脚本的内容
 */

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'new-session111.yaml'),
    });

    if (!script) {
      console.log('❌ Script not found in database');
      return;
    }

    console.log('✅ Script found!');
    console.log('Script ID:', script.id);
    console.log('Script Name:', script.scriptName);
    console.log('Content Length:', script.scriptContent.length);
    console.log('\n==== YAML Content ====\n');
    console.log(script.scriptContent);
    console.log('\n==== End of Content ====');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
