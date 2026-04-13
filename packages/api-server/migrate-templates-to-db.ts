/**
 * 数据库迁移脚本：添加 template 文件类型和 file_path 字段
 */

import { sql } from 'drizzle-orm';

import { db } from './src/db/index.js';

async function migrate() {
  console.log('🚀 开始数据库迁移...');

  try {
    // 1. 添加 template 到 file_type 枚举
    console.log('1. 添加 template 到 file_type 枚举...');
    try {
      await db.execute(sql`ALTER TYPE "file_type" ADD VALUE IF NOT EXISTS 'template'`);
      console.log('   ✅ template 类型已添加');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('   ℹ️  template 类型已存在，跳过');
      } else {
        throw error;
      }
    }

    // 2. 添加 file_path 字段
    console.log('2. 添加 file_path 字段...');
    try {
      await db.execute(
        sql`ALTER TABLE "script_files" ADD COLUMN IF NOT EXISTS "file_path" varchar(512)`
      );
      console.log('   ✅ file_path 字段已添加');
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        console.log('   ℹ️  file_path 字段已存在，跳过');
      } else {
        throw error;
      }
    }

    // 3. 创建索引
    console.log('3. 创建索引...');
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "script_files_file_path_idx" ON "script_files" ("file_path")`
    );
    console.log('   ✅ 索引已创建');

    console.log('✅ 数据库迁移完成！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  }
}

migrate();
