-- 扩展 project_status 枚举类型，添加 deprecated 状态
-- Migration: Add 'deprecated' status for project soft delete feature
-- Created: 2026-01-30

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'deprecated';

-- 添加注释说明状态语义
COMMENT ON TYPE project_status IS '项目状态: draft=草稿, published=已发布, archived=已归档, deprecated=已作废(软删除)';

-- 验证状态枚举
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'project_status'
        AND e.enumlabel = 'deprecated'
    ) THEN
        RAISE NOTICE '✓ Successfully added deprecated status to project_status enum';
    ELSE
        RAISE EXCEPTION '✗ Failed to add deprecated status';
    END IF;
END $$;
