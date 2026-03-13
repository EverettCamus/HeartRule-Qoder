# Database Architecture Migration Guide

> **Target Version**: v2.1 (Pure Database Architecture)  
> **Applicable Scenarios**: Upgrading from v1.x or v2.0 hybrid architecture to v2.1 pure database architecture  
> **Completion Date**: 2026-02-07

---

## 1. Overview

### 1.1 Migration Objectives

Migrate HeartRule AI Consulting Engine from disk/hybrid architecture to pure database architecture, achieving:

- ✅ All project resources (templates, scripts) stored in PostgreSQL database
- ✅ Remove dependency on physical workspace directory
- ✅ Remove PROJECTS_WORKSPACE environment variable
- ✅ Implement single source of truth, facilitating distributed deployment and backup

### 1.2 Architecture Comparison

| Feature                | v1.0 Disk Mode                           | v2.0 Hybrid Mode       | v2.1 Database Mode ✅      |
| ---------------------- | ---------------------------------------- | ---------------------- | -------------------------- |
| Template Storage       | workspace directory                      | Database + disk sync   | Database                   |
| Script Storage         | workspace directory                      | Database               | Database                   |
| PROJECTS_WORKSPACE     | Required                                 | Required               | Removed                    |
| Deployment Complexity  | High (requires directory initialization) | Medium (requires sync) | Low (database only)        |
| Multi-tenant Isolation | Poor (shared directory)                  | Average                | Excellent (database-level) |
| Backup & Recovery      | Complex (files + database)               | Complex                | Simple (database only)     |

---

## 2. Pre-Migration Preparation

### 2.1 Confirm Current Version

Check system version:

```bash
# Check package.json version
cat package.json | grep version

# Check if syncTemplatesToDisk method exists
grep -r "syncTemplatesToDisk" packages/api-server/src/services/
```

**Determination Criteria**:

- If `syncTemplatesToDisk` is found, it's v2.0 hybrid mode
- If PROJECTS_WORKSPACE is used without database templates, it's v1.0 disk mode

### 2.2 Database Backup

**Important**: You must backup the database before migration!

```bash
# PostgreSQL backup
pg_dump -U postgres -d heartrule > backup_before_migration_$(date +%Y%m%d).sql

# Verify backup file
ls -lh backup_before_migration_*.sql
```

### 2.3 Check Workspace Projects

List existing project directories:

```bash
# Check workspace directory
ls -la workspace/projects/

# Count template files
find workspace/projects -name "*.md" -path "*/_system/config/*" | wc -l
```

Record the list of projects and template file counts to be migrated.

---

## 3. Migration Steps

### 3.1 Step 1: Upgrade Code to v2.1

```bash
# Pull latest code
git fetch origin
git checkout v2.1.0  # or corresponding release branch

# Install dependencies
pnpm install

# Build all packages
pnpm run build
```

### 3.2 Step 2: Execute Database Migration

```bash
# Run database migration script
cd packages/api-server
pnpm db:migrate

# Verify schema update
pnpm db:studio  # Open Drizzle Studio to check table structure
```

**Verification Points**:

- `script_files` table exists
- `projects` table contains `metadata` field
- Related indexes created

### 3.3 Step 3: Import Disk Templates to Database

Use migration tool to import historical templates:

```bash
cd packages/api-server

# Method 1: Import system default templates
npx tsx import-disk-templates-to-db.ts

# Method 2: Import custom templates for specific project
# (Need to modify script to specify projectId and source path)
```

**Import Verification**:

```sql
-- Check imported template count
SELECT
  project_id,
  file_type,
  COUNT(*) as file_count
FROM script_files
WHERE file_type = 'template'
GROUP BY project_id, file_type;

-- View template file paths
SELECT
  file_name,
  file_path,
  LENGTH(file_content::text) as content_size
FROM script_files
WHERE file_type = 'template'
LIMIT 10;
```

### 3.4 Step 4: Verify Template Loading

Run E2E tests to verify database template mode:

```bash
cd packages/api-server

# Run database template mode test
npx tsx test-database-template-mode.ts
```

**Expected Output**:

```
🎉 Test passed! Database template mode working correctly

Verification points:
  ✅ Templates loaded from database script_files table
  ✅ ai_ask action correctly uses database templates
  ✅ ai_say action correctly uses database templates
  ✅ Variable extraction and replacement working properly
  ✅ Session state correctly persisted
  ✅ No dependency on filesystem workspace directory
```

### 3.5 Step 5: Test Session Creation and Execution

Test complete session flow:

```bash
# Start API server
pnpm dev

# Run test in another terminal
cd packages/api-server
npx tsx test-project-creation-flow.ts
```

**Verification Checklist**:

- [ ] Can create new project
- [ ] Default templates auto-imported to script_files table
- [ ] Session creation successful
- [ ] AI messages generated normally
- [ ] Variable extraction working properly

### 3.6 Step 6: Remove Workspace Directory (Optional)

**Warning**: Only execute after confirming database migration is completely successful!

```bash
# Rename workspace directory as backup
mv workspace workspace.backup.$(date +%Y%m%d)

# Or delete directly (not recommended)
# rm -rf workspace
```

### 3.7 Step 7: Update Environment Variables

Edit `.env` file, remove PROJECTS_WORKSPACE:

```diff
# .env

# LLM Configuration
VOLCANO_API_KEY=your_key
VOLCANO_ENDPOINT_ID=your_endpoint

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/heartrule

- # Workspace path (deprecated)
- PROJECTS_WORKSPACE=/path/to/workspace/projects
```

Restart service to verify:

```bash
pnpm dev
```

---

## 4. Verification Checklist

### 4.1 Functional Verification

- [ ] Can create new project
- [ ] New project contains default templates (in script_files table)
- [ ] Can create and initialize session
- [ ] AI messages generated normally
- [ ] Variable extraction working properly
- [ ] Multi-turn conversation flow normal
- [ ] Debug panel displays correct information

### 4.2 Data Verification

```sql
-- Check project count
SELECT COUNT(*) FROM projects;

-- Check template file count
SELECT COUNT(*) FROM script_files WHERE file_type = 'template';

-- Check script file count
SELECT COUNT(*) FROM script_files WHERE file_type = 'session';

-- Check session count
SELECT COUNT(*) FROM sessions;
```

### 4.3 Performance Verification

Compare performance metrics before and after migration:

| Metric                 | Before | After | Expected |
| ---------------------- | ------ | ----- | -------- |
| Project creation time  | -      | -     | <500ms   |
| Session initialization | -      | -     | <300ms   |
| Template loading time  | -      | -     | <50ms    |

---

## 5. Rollback Plan

If issues occur during migration, follow these steps to rollback:

### 5.1 Quick Rollback Steps

```bash
# 1. Stop service
pkill -f "tsx.*src/index.ts"

# 2. Restore database backup
psql -U postgres -d heartrule < backup_before_migration_YYYYMMDD.sql

# 3. Switch to old version code
git checkout v2.0.0  # or previous stable version

# 4. Reinstall dependencies and build
pnpm install
pnpm run build

# 5. Restore workspace directory (if deleted)
mv workspace.backup.YYYYMMDD workspace

# 6. Restart service
pnpm dev
```

### 5.2 Verify Rollback Success

```bash
# Run smoke test
curl http://localhost:3000/health

# Test session creation
npx tsx test-session-flow.ts
```

---

## 6. FAQ (Frequently Asked Questions)

### Q1: How to handle existing disk projects?

**A**: Use the `import-disk-templates-to-db.ts` migration tool for one-time import. Steps:

1. Modify `sourceProjectPath` in the script to point to old project directory
2. Specify target `projectId` (existing project in database)
3. Run script to import templates and script files
4. Verify import results

### Q2: Can I delete the workspace directory?

**A**: Yes, but recommended:

1. First rename to `.backup` suffix and keep for 7-14 days
2. Confirm all functionality working normally
3. Verify database backup is usable
4. Then permanently delete

### Q3: Will migration affect performance?

**A**: Expected performance improvement:

- Session initialization reduced by 10-20% (no disk I/O)
- Improved concurrency (no file lock contention)
- More efficient template caching (TemplateManager memory cache)

### Q4: How to test migration in local development environment?

**A**: Recommended process:

```bash
# 1. Create test database
createdb heartrule_test

# 2. Modify .env.test
DATABASE_URL=postgresql://localhost:5432/heartrule_test

# 3. Execute migration in test database
NODE_ENV=test pnpm db:migrate

# 4. Import test data
NODE_ENV=test npx tsx import-disk-templates-to-db.ts

# 5. Run E2E tests
NODE_ENV=test npx tsx test-database-template-mode.ts
```

### Q5: Can the migration tool import-disk-templates-to-db.ts still be used?

**A**: Yes, but only for:

- One-time migration of historical disk templates
- Test environment initialization
- Quick import of sample templates in development environment

New project creation no longer depends on this tool, templates are imported directly from database.

### Q6: How to backup and restore projects?

**A**: Simpler under v2.1 architecture:

```bash
# Backup single project
pg_dump -U postgres -d heartrule \
  -t projects -t script_files -t sessions -t messages \
  --data-only \
  --where="project_id='YOUR_PROJECT_ID'" \
  > project_backup.sql

# Restore project
psql -U postgres -d heartrule < project_backup.sql
```

### Q7: How to sync templates across multiple environments?

**A**: Via database replication:

```bash
# Method 1: Database-level replication
pg_dump -U postgres -d heartrule_prod -t script_files | \
  psql -U postgres -d heartrule_staging

# Method 2: API export/import (recommended)
# Use API endpoints GET /api/templates/export and POST /api/templates/import
```

---

## 7. Technical Support

### Issue Reporting

If you encounter issues during migration:

1. Check server logs: `packages/api-server/logs/`
2. Verify database connection: `psql -U postgres -d heartrule`
3. Run diagnostic script: `npx tsx check-database.ts`
4. Submit Issue to GitHub repository

### Related Documentation

- [Development Guide](../../_global/process/development-guide.md) - Architecture evolution section
- [Story 0.5 Design Document](../../../../.qoder/quests/story-0-5-implementation.md) - Detailed technical design
- [Database Schema Design](../../../../packages/api-server/src/db/schema.ts) - Table structure definition

---

## Appendix

### A. Database Table Structure Description

**script_files table**:

```sql
CREATE TABLE script_files (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_type VARCHAR(20) NOT NULL,  -- 'template', 'session', 'form', 'rule', etc.
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT,                   -- Virtual path, e.g. '_system/config/default/ai_ask_v1.md'
  file_content JSONB,               -- Template content: {content: '...'}
  yaml_content TEXT,                -- YAML format content (for script files)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_script_files_project_type ON script_files(project_id, file_type);
CREATE INDEX idx_script_files_project_path ON script_files(project_id, file_path);
```

### B. Migration Tool Usage Example

```typescript
// import-disk-templates-to-db.ts usage example

import { importTemplatesFromDisk } from './src/services/template-importer';

// Import system default templates
await importTemplatesFromDisk({
  projectId: 'system-default',
  sourcePath: './config/prompts',
  targetLayer: 'default',
});

// Import custom template scheme
await importTemplatesFromDisk({
  projectId: 'my-project-id',
  sourcePath: './workspace/projects/old-project/_system/config/custom/crisis_intervention',
  targetLayer: 'custom',
  schemeName: 'crisis_intervention',
});
```

### C. Performance Monitoring SQL

```sql
-- Monitor template loading performance
SELECT
  project_id,
  file_path,
  pg_size_pretty(pg_column_size(file_content)) as content_size,
  created_at
FROM script_files
WHERE file_type = 'template'
ORDER BY pg_column_size(file_content) DESC
LIMIT 10;

-- Count files per project
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

**Document Version**: 1.0  
**Last Updated**: 2026-02-07  
**Maintainer**: HeartRule Development Team
