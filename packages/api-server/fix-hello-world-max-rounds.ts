/**
 * 修改 hello-world.yaml 脚本的 max_rounds 配置
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
    
    // 修改 max_rounds: 2 → max_rounds: 1
    const updatedContent = script.scriptContent.replace(
      'max_rounds: 2',
      'max_rounds: 1'
    );
    
    console.log('\n==== Original Content ====\n');
    console.log(script.scriptContent);
    
    console.log('\n==== Updated Content ====\n');
    console.log(updatedContent);
    
    // 更新数据库
    await db
      .update(scripts)
      .set({ 
        scriptContent: updatedContent,
        updatedAt: new Date()
      })
      .where(eq(scripts.id, scriptId));
    
    console.log('\n✅ Script updated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
