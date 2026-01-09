import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as schema from './schema.js';

// 加载环境变量
dotenv.config({ path: '../../.env' });

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
