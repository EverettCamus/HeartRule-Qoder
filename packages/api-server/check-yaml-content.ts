/**
 * 直接查询数据库中 new-session111.yaml 的内容
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function main() {
  try {
    console.log('查询 new-session111.yaml 文件内容...\n');
    
    const file = await db.query.scriptFiles.findFirst({
      where: eq(scriptFiles.fileName, 'new-session111.yaml'),
    });

    if (!file) {
      console.log('❌ 文件未找到');
      return;
    }

    console.log('✅ 文件找到！');
    console.log('文件 ID:', file.id);
    console.log('文件名:', file.fileName);
    console.log('所有字段:', Object.keys(file));
    console.log('yamlContent 字段:', file.yamlContent ? '✅ 存在' : '❌ 为 null');
    console.log('fileContent 字段:', file.fileContent ? '✅ 存在' : '❌ 为 undefined');
    
    const content = file.yamlContent || (file.fileContent as unknown as string);
    if (content) {
      console.log('内容长度:', (content as string).length);
      console.log('\n========== YAML 内容 ==========\n');
      console.log(content);
      console.log('\n========== 内容结束 ==========\n');
    } else {
      console.log('\n❌ 无法找到内容字段');
    }
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    process.exit(0);
  }
}

main();
