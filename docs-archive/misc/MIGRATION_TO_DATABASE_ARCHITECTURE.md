---
document_id: 'docs-archive-misc-migration-to-database-architecture'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/MIGRATION_TO_DATABASE_ARCHITECTURE.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'misc']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/MIGRATION_TO_DATABASE_ARCHITECTURE.md

---

# 数据库架构迁移指南

> **目标版本**: v2.1 (纯数据库架构)  
> **适用场景**: 从v1.x或v2.0混合架构升级到v2.1纯数据库架构  
> **完成日期**: 2026-02-07

---

## 1. 概述

### 1.1 迁移目标

将HeartRule AI咨询引擎从磁盘/混合架构迁移至纯数据库架构,实现:

- ✅ 所有工程资源(模板、脚本)存储于PostgreSQL数据库
- ✅ 移除对物理workspace目录的依赖
- ✅ 移除PROJECTS_WORKSPACE环境变量
- ✅ 实现单一数据源,便于分布式部署和备份

### 1.2 架构对比

| 特性               | v1.0 磁盘模式     | v2.0 混合模式   | v2.1 数据库模式 ✅ |
| ------------------ | ----------------- | --------------- | ------------------ |
| 模板存储           | workspace目录     | 数据库+磁盘同步 | 数据库             |
| 脚本存储           | workspace目录     | 数据库          | 数据库             |
| PROJECTS_WORKSPACE | 必需              | 必需            | 已移除             |
| 部署复杂度         | 高(需初始化目录)  | 中(需同步)      | 低(仅需数据库)     |
| 多租户隔离         | 差(共享目录)      | 一般            | 优(数据库级)       |
| 备份恢复           | 复杂(文件+数据库) | 复杂            | 简单(仅数据库)     |

---

## 2. 迁移前准备

### 2.1 确认当前版本

检查系统版本:

```bash
# 检查package.json版本
cat package.json | grep version

# 检查是否存在syncTemplatesToDisk方法
grep -r "syncTemplatesToDisk" packages/api-server/src/services/
```

**判断标准**:

- 若找到`syncTemplatesToDisk`,说明为v2.0混合模式
- 若使用PROJECTS_WORKSPACE且无数据库模板,说明为v1.0磁盘模式

### 2.2 数据库备份

**重要**: 迁移前必须备份数据库!

```bash
# PostgreSQL备份
pg_dump -U postgres -d heartrule > backup_before_migration_$(date +%Y%m%d).sql

# 验证备份文件
ls -lh backup_before_migration_*.sql
```

### 2.3 检查workspace工程

列出现有工程目录:

```bash
# 检查workspace目录
ls -la workspace/projects/

# 统计模板文件数量
find workspace/projects -name "*.md" -path "*/_system/config/*" | wc -l
```

记录需要迁移的工程列表和模板文件数量。

---

## 3. 迁移步骤

### 3.1 步骤1: 升级代码到v2.1

```bash
# 拉取最新代码
git fetch origin
git checkout v2.1.0  # 或对应的发布分支

# 安装依赖
pnpm install

# 构建所有包
pnpm run build
```

### 3.2 步骤2: 执行数据库迁移

```bash
# 运行数据库迁移脚本
cd packages/api-server
pnpm db:migrate

# 验证schema更新
pnpm db:studio  # 打开Drizzle Studio检查表结构
```

**验证要点**:

- `script_files`表存在
- `projects`表包含`metadata`字段
- 相关索引已创建

### 3.3 步骤3: 导入磁盘模板到数据库

使用迁移工具导入历史模板:

```bash
cd packages/api-server

# 方式1: 导入系统默认模板
npx tsx import-disk-templates-to-db.ts

# 方式2: 导入特定工程的自定义模板
# (需修改脚本指定projectId和源路径)
```

**导入验证**:

```sql
-- 检查导入的模板数量
SELECT
  project_id,
  file_type,
  COUNT(*) as file_count
FROM script_files
WHERE file_type = 'template'
GROUP BY project_id, file_type;

-- 查看模板文件路径
SELECT
  file_name,
  file_path,
  LENGTH(file_content::text) as content_size
FROM script_files
WHERE file_type = 'template'
LIMIT 10;
```

### 3.4 步骤4: 验证模板加载

运行E2E测试验证数据库模板模式:

```bash
cd packages/api-server

# 运行数据库模板模式测试
npx tsx test-database-template-mode.ts
```

**预期输出**:

```
🎉 测试通过！数据库模板模式工作正常

验证要点：
  ✅ 模板从数据库 script_files 表加载
  ✅ ai_ask 动作正确使用数据库模板
  ✅ ai_say 动作正确使用数据库模板
  ✅ 变量提取和替换正常工作
  ✅ 会话状态正确持久化
  ✅ 不依赖文件系统 workspace 目录
```

### 3.5 步骤5: 测试会话创建和执行

测试完整会话流程:

```bash
# 启动API服务器
pnpm dev

# 在另一个终端运行测试
cd packages/api-server
npx tsx test-project-creation-flow.ts
```

**验证清单**:

- [ ] 可以创建新工程
- [ ] 默认模板自动导入到script_files表
- [ ] 创建会话成功
- [ ] AI消息正常生成
- [ ] 变量提取正常工作

### 3.6 步骤6: 移除workspace目录(可选)

**警告**: 确认数据库迁移完全成功后再执行!

```bash
# 重命名workspace目录作为备份
mv workspace workspace.backup.$(date +%Y%m%d)

# 或直接删除(不推荐)
# rm -rf workspace
```

### 3.7 步骤7: 更新环境变量

编辑`.env`文件,移除PROJECTS_WORKSPACE:

```diff
# .env

# LLM 配置
VOLCANO_API_KEY=your_key
VOLCANO_ENDPOINT_ID=your_endpoint

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/heartrule

- # 工作区路径(已废弃)
- PROJECTS_WORKSPACE=/path/to/workspace/projects
```

重启服务验证:

```bash
pnpm dev
```

---

## 4. 验证检查清单

### 4.1 功能验证

- [ ] 可以创建新工程
- [ ] 新工程包含默认模板(在script_files表中)
- [ ] 可以创建会话并初始化
- [ ] AI消息正常生成
- [ ] 变量提取正常工作
- [ ] 多轮对话流程正常
- [ ] 调试面板显示正确信息

### 4.2 数据验证

```sql
-- 检查工程数量
SELECT COUNT(*) FROM projects;

-- 检查模板文件数量
SELECT COUNT(*) FROM script_files WHERE file_type = 'template';

-- 检查脚本文件数量
SELECT COUNT(*) FROM script_files WHERE file_type = 'session';

-- 检查会话数量
SELECT COUNT(*) FROM sessions;
```

### 4.3 性能验证

对比迁移前后的性能指标:

| 指标           | 迁移前 | 迁移后 | 期望   |
| -------------- | ------ | ------ | ------ |
| 工程创建耗时   | -      | -      | <500ms |
| 会话初始化耗时 | -      | -      | <300ms |
| 模板加载耗时   | -      | -      | <50ms  |

---

## 5. 回滚方案

如果迁移过程中遇到问题,可以按以下步骤回滚:

### 5.1 快速回滚步骤

```bash
# 1. 停止服务
pkill -f "tsx.*src/index.ts"

# 2. 恢复数据库备份
psql -U postgres -d heartrule < backup_before_migration_YYYYMMDD.sql

# 3. 切换到旧版本代码
git checkout v2.0.0  # 或之前的稳定版本

# 4. 重新安装依赖并构建
pnpm install
pnpm run build

# 5. 恢复workspace目录(如果已删除)
mv workspace.backup.YYYYMMDD workspace

# 6. 重启服务
pnpm dev
```

### 5.2 验证回滚成功

```bash
# 运行冒烟测试
curl http://localhost:3000/health

# 测试会话创建
npx tsx test-session-flow.ts
```

---

## 6. 常见问题(FAQ)

### Q1: 原有磁盘工程如何处理?

**A**: 使用`import-disk-templates-to-db.ts`迁移工具一次性导入。步骤:

1. 修改脚本中的`sourceProjectPath`指向旧工程目录
2. 指定目标`projectId`(数据库中已存在的工程)
3. 运行脚本导入模板和脚本文件
4. 验证导入结果

### Q2: 是否可以删除workspace目录?

**A**: 可以,但建议:

1. 先重命名为`.backup`后缀保留7-14天
2. 确认所有功能正常运行
3. 验证数据库备份可用
4. 再永久删除

### Q3: 迁移后性能是否有影响?

**A**: 预期性能提升:

- 会话初始化减少10-20%耗时(无磁盘IO)
- 并发性能提升(无文件锁竞争)
- 模板缓存更高效(TemplateManager内存缓存)

### Q4: 如何在本地开发环境测试迁移?

**A**: 建议流程:

```bash
# 1. 创建测试数据库
createdb heartrule_test

# 2. 修改.env.test
DATABASE_URL=postgresql://localhost:5432/heartrule_test

# 3. 在测试库执行迁移
NODE_ENV=test pnpm db:migrate

# 4. 导入测试数据
NODE_ENV=test npx tsx import-disk-templates-to-db.ts

# 5. 运行E2E测试
NODE_ENV=test npx tsx test-database-template-mode.ts
```

### Q5: 迁移工具import-disk-templates-to-db.ts还能用吗?

**A**: 可以,但仅用于:

- 一次性迁移历史磁盘模板
- 测试环境初始化
- 开发环境快速导入示例模板

新工程创建不再依赖此工具,模板直接从数据库导入。

### Q6: 如何备份和恢复工程?

**A**: v2.1架构下更简单:

```bash
# 备份单个工程
pg_dump -U postgres -d heartrule \
  -t projects -t script_files -t sessions -t messages \
  --data-only \
  --where="project_id='YOUR_PROJECT_ID'" \
  > project_backup.sql

# 恢复工程
psql -U postgres -d heartrule < project_backup.sql
```

### Q7: 多环境部署如何同步模板?

**A**: 通过数据库复制:

```bash
# 方案1: 数据库级别复制
pg_dump -U postgres -d heartrule_prod -t script_files | \
  psql -U postgres -d heartrule_staging

# 方案2: API导出导入(推荐)
# 使用API端点 GET /api/templates/export 和 POST /api/templates/import
```

---

## 7. 技术支持

### 问题反馈

如果迁移过程中遇到问题:

1. 查看服务器日志: `packages/api-server/logs/`
2. 检查数据库连接: `psql -U postgres -d heartrule`
3. 运行诊断脚本: `npx tsx check-database.ts`
4. 提交Issue到GitHub仓库

### 相关文档

- [开发指南](./DEVELOPMENT_GUIDE.md) - 架构演进章节
- [Story 0.5设计文档](../.qoder/quests/story-0-5-implementation.md) - 详细技术设计
- [数据库Schema设计](../packages/api-server/src/db/schema.ts) - 表结构定义

---

## 附录

### A. 数据库表结构说明

**script_files表**:

```sql
CREATE TABLE script_files (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_type VARCHAR(20) NOT NULL,  -- 'template', 'session', 'form', 'rule'等
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT,                   -- 虚拟路径,如'_system/config/default/ai_ask_v1.md'
  file_content JSONB,               -- 模板内容: {content: '...'}
  yaml_content TEXT,                -- YAML格式内容(脚本文件专用)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_script_files_project_type ON script_files(project_id, file_type);
CREATE INDEX idx_script_files_project_path ON script_files(project_id, file_path);
```

### B. 迁移工具使用示例

```typescript
// import-disk-templates-to-db.ts 使用示例

import { importTemplatesFromDisk } from './src/services/template-importer';

// 导入系统默认模板
await importTemplatesFromDisk({
  projectId: 'system-default',
  sourcePath: './config/prompts',
  targetLayer: 'default',
});

// 导入自定义模板方案
await importTemplatesFromDisk({
  projectId: 'my-project-id',
  sourcePath: './workspace/projects/old-project/_system/config/custom/crisis_intervention',
  targetLayer: 'custom',
  schemeName: 'crisis_intervention',
});
```

### C. 性能监控SQL

```sql
-- 监控模板加载性能
SELECT
  project_id,
  file_path,
  pg_size_pretty(pg_column_size(file_content)) as content_size,
  created_at
FROM script_files
WHERE file_type = 'template'
ORDER BY pg_column_size(file_content) DESC
LIMIT 10;

-- 统计各工程的文件数量
SELECT
  p.project_name,
  COUNT(sf.id) as total_files,
  SUM(CASE WHEN sf.file_type = 'template' THEN 1 ELSE 0 END) as templates,
  SUM(CASE WHEN sf.file_type = 'session' THEN 1 ELSE 0 END) as sessions
FROM projects p
LEFT JOIN script_files sf ON p.id = sf.project_id
GROUP BY p.id, p.project_name
ORDER BY total_files DESC;
```

---

**文档版本**: 1.0  
**最后更新**: 2026-02-07  
**维护者**: HeartRule开发团队
