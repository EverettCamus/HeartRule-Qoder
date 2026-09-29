import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载根目录的 .env 文件
dotenv.config({ path: resolve(__dirname, '.env') });

// 确保关键环境变量存在
if (!process.env.DATABASE_URL) {
  console.warn('⚠️  WARNING: DATABASE_URL not set in .env file');
  // 从 .env.example 读取默认值
  process.env.DATABASE_URL =
    'postgresql://heartrule:heartrule_dev_2024@localhost:5432/heartrule_ai';
}

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

// Enable debug-level logging in tests so logger.debug() calls are visible
process.env.LOG_LEVEL = 'debug';

console.log('✅ Vitest environment setup completed');
console.log(`📊 NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`📊 LOG_LEVEL: ${process.env.LOG_LEVEL}`);
console.log(`🗄️  DATABASE_URL: ${process.env.DATABASE_URL ? '***configured***' : 'not set'}`);
