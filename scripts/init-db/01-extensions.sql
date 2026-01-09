-- PostgreSQL初始化脚本
-- 启用必要的扩展

-- 启用UUID生成
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 启用pgcrypto用于加密
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 启用pg_trgm用于全文检索
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 为未来向量检索准备（可选，需要手动安装pgvector）
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- 创建初始数据库结构将由Drizzle迁移处理
