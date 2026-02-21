/**
 * 查看 hello-world.yaml 脚本的内容
 */

import path from 'path';
import { fileURLToPath } from 'url';

import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

async function main() {
  try {
    // const _projectId = '4ba2d417-6cc7-4f23-bf47-6b207f741612';
    const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';

    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, scriptId),
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
