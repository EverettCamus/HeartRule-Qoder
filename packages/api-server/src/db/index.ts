import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import * as dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema.js';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量 - 从项目根目录加载 .env 文件
// 解析到项目根目录: packages/api-server/src/db -> ../../../../
dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// 创建PostgreSQL连接
const queryClient = postgres(connectionString);

// 创建Drizzle实例
export const db = drizzle(queryClient, { schema });

// 导出连接以便在需要时关闭
export const closeConnection = async () => {
  await queryClient.end();
};
