/**
 * 清理所有现有会话，强制重新加载脚本
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { sessions } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  try {
    const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';
    
    // 删除所有使用该脚本的会话
    const result = await db
      .delete(sessions)
      .where(eq(sessions.scriptId, scriptId));
    
    console.log('✅ 已删除所有 hello-world.yaml 的会话');
    console.log('   现在创建新会话时会重新加载脚本配置');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
