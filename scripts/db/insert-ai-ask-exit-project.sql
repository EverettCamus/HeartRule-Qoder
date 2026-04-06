-- ====================================================================
-- HeartRule AI-Ask Exit Decision Test Project
-- 项目名称：smart-ai-ask-exit
-- 日期：2026-03-20
-- ====================================================================

-- 第一步：创建项目记录
INSERT INTO projects (
  id,
  project_name,
  description,
  engine_version,
  engine_version_min,
  current_version_id,
  status,
  author,
  tags,
  metadata,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'smart-ai-ask-exit',
  'AI-Ask 退出决策机制测试项目 (v1.2) - 测试5个核心退出场景：正常退出、阻抗退出、偏题退出、最大轮次安全网、综合条件退出',
  '1.0',
  '0.9',
  NULL,
  'published'::project_status,
  'Test Suite',
  '["exit-decision", "ai-ask", "test-scenarios", "2026-03-20"]'::jsonb,
  '{
    "created_by": "ai-ask-exit-testing",
    "test_framework": "comprehensive",
    "design_doc": "docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md",
    "scenarios": 5,
    "focus_areas": ["required_variables", "impedance_threshold", "topic_drift_threshold", "max_rounds", "crisis_detected"]
  }'::jsonb,
  NOW(),
  NOW()
);

-- ====================================================================
-- 第二步：为每个场景创建脚本文件
-- ====================================================================

-- 场景1：正常退出 - 信息完整
INSERT INTO script_files (
  id,
  project_id,
  file_type,
  file_name,
  file_path,
  file_content,
  yaml_content,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440001'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'session'::file_type,
  'scenario-1-normal-exit.yaml',
  '_system/test-scenarios/scenario-1-normal-exit.yaml',
  '{}'::jsonb,
  (SELECT yaml_content FROM stdin LIMIT 1),
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- 场景2：阻抗退出 - 用户回避
INSERT INTO script_files (
  id,
  project_id,
  file_type,
  file_name,
  file_path,
  file_content,
  yaml_content,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440002'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'session'::file_type,
  'scenario-2-impedance-exit.yaml',
  '_system/test-scenarios/scenario-2-impedance-exit.yaml',
  '{}'::jsonb,
  (SELECT yaml_content FROM stdin LIMIT 1),
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- 场景3：偏题退出 - 用户离题
INSERT INTO script_files (
  id,
  project_id,
  file_type,
  file_name,
  file_path,
  file_content,
  yaml_content,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440003'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'session'::file_type,
  'scenario-3-topic-drift.yaml',
  '_system/test-scenarios/scenario-3-topic-drift.yaml',
  '{}'::jsonb,
  (SELECT yaml_content FROM stdin LIMIT 1),
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- 场景4：最大轮次退出 - 安全网触发
INSERT INTO script_files (
  id,
  project_id,
  file_type,
  file_name,
  file_path,
  file_content,
  yaml_content,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440004'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'session'::file_type,
  'scenario-4-max-rounds-safety.yaml',
  '_system/test-scenarios/scenario-4-max-rounds-safety.yaml',
  '{}'::jsonb,
  (SELECT yaml_content FROM stdin LIMIT 1),
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- 场景5：综合条件退出 - 混合评估
INSERT INTO script_files (
  id,
  project_id,
  file_type,
  file_name,
  file_path,
  file_content,
  yaml_content,
  created_at,
  updated_at
) VALUES (
  '550e8400-e29b-41d4-a716-446655440005'::uuid,
  '550e8400-e29b-41d4-a716-446655440000'::uuid,
  'session'::file_type,
  'scenario-5-comprehensive.yaml',
  '_system/test-scenarios/scenario-5-comprehensive.yaml',
  '{}'::jsonb,
  (SELECT yaml_content FROM stdin LIMIT 1),
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- ====================================================================
-- 验证插入
-- ====================================================================

SELECT
  'Project Created:' as status,
  project_name,
  status,
  (SELECT count(*) FROM script_files WHERE project_id = '550e8400-e29b-41d4-a716-446655440000'::uuid) as script_count
FROM projects
WHERE project_name = 'smart-ai-ask-exit';
