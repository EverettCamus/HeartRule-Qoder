/**
 * 执行数据库迁移脚本
 * 用于添加 deprecated 状态到 project_status 枚举
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import * as dotenv from 'dotenv';
import postgres from 'postgres';

// ESM 模块路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 Starting migration: Add deprecated status to project_status enum...');

  const sql = postgres(connectionString!);

  try {
    // 读取迁移脚本
    const migrationPath = path.join(__dirname, 'drizzle', '0003_add_deprecated_status.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded:', migrationPath);

    // 执行迁移
    await sql.unsafe(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // 验证枚举值
    const result = await sql`
      SELECT e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid 
      WHERE t.typname = 'project_status'
      ORDER BY e.enumsortorder
    `;

    console.log(
      '✓ Current project_status enum values:',
      result.map((r) => r.enumlabel)
    );
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
