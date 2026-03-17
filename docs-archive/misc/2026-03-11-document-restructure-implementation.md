---
document_id: 'docs-archive-misc-2026-03-11-document-restructure-implementation'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/plans/2026-03-11-document-restructure-implementation.md'
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
**原始路径**: docs/plans/2026-03-11-document-restructure-implementation.md

---

# 文档重组计划实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现文档重组计划，将现有分散文档迁移到统一的OpenSpec结构，支持DDD文档化、Scrum集成和中英文混合内容。

**Architecture:** 采用渐进式迁移策略，分四个阶段：1) 分析和准备，2) 核心迁移，3) 批量迁移，4) 优化和自动化。使用OpenSpec作为核心规范格式，集成DDD文档化和Scrum工作流。

**Tech Stack:** TypeScript/Node.js, OpenSpec规范，Markdown，YAML，GitHub Actions，自定义验证脚本

---

## 阶段1：分析和准备

### Task 1: 分析现有文档结构

**Files:**

- Create: `scripts/analyze-docs.js`
- Read: `.qoder/repowiki/zh/`, `docs/`, `openspec/`

**Step 1: 创建文档分析脚本**

```javascript
// scripts/analyze-docs.js
const fs = require('fs');
const path = require('path');

async function analyzeDocumentStructure() {
  const results = {
    totalFiles: 0,
    byExtension: {},
    byDirectory: {},
    brokenLinks: [],
    outdatedDocs: [],
  };

  // 分析.qoder目录
  const qoderPath = path.join(__dirname, '..', '.qoder', 'repowiki', 'zh');
  if (fs.existsSync(qoderPath)) {
    await analyzeDirectory(qoderPath, 'qoder', results);
  }

  // 分析docs目录
  const docsPath = path.join(__dirname, '..', 'docs');
  if (fs.existsSync(docsPath)) {
    await analyzeDirectory(docsPath, 'docs', results);
  }

  // 输出分析结果
  fs.writeFileSync(
    path.join(__dirname, '..', 'docs', 'analysis-report.json'),
    JSON.stringify(results, null, 2)
  );

  console.log('分析完成，结果保存到 docs/analysis-report.json');
}

// 辅助函数
async function analyzeDirectory(dirPath, prefix, results) {
  // 实现目录分析逻辑
}

analyzeDocumentStructure().catch(console.error);
```

**Step 2: 运行分析脚本**

```bash
node scripts/analyze-docs.js
```

**Step 3: 检查分析结果**

```bash
cat docs/analysis-report.json | jq '.'
```

**Step 4: 提交分析结果**

```bash
git add scripts/analyze-docs.js docs/analysis-report.json
git commit -m "feat: add document analysis script and initial report"
```

### Task 2: 设计新目录结构

**Files:**

- Create: `docs/new-structure-design.md`
- Create: `scripts/create-structure.js`

**Step 1: 创建目录结构设计文档**

```markdown
# 新文档目录结构设计

基于分析结果，设计以下结构：

- docs/specs/ - OpenSpec规范
- docs/changes/ - 变更记录
- docs/guides/ - 指南文档（中英文）
- docs/decisions/ - 架构决策记录
- docs/api/ - API文档
- docs/legacy/ - 旧文档（迁移期间）
```

**Step 2: 创建目录结构生成脚本**

```javascript
// scripts/create-structure.js
const fs = require('fs');
const path = require('path');

const structure = {
  'specs/product/epics': [],
  'specs/product/features': [],
  'specs/product/stories': [],
  'specs/architecture/strategic/bounded-contexts': [],
  'specs/architecture/strategic/context-maps': [],
  'specs/architecture/tactical/aggregates': [],
  'specs/architecture/tactical/entities': [],
  'specs/architecture/tactical/value-objects': [],
  'specs/technical/api': [],
  'specs/technical/database': [],
  'specs/technical/components': [],
  'changes/active': [],
  'changes/completed': [],
  'changes/archive': [],
  'guides/en': ['getting-started.md', 'development.md', 'deployment.md'],
  'guides/zh': ['快速开始.md', '开发指南.md', '部署指南.md'],
  decisions: [],
  'api/reference': [],
  'api/examples': [],
  'legacy/.qoder': [],
};

function createStructure() {
  const basePath = path.join(__dirname, '..', 'docs');

  Object.keys(structure).forEach((dir) => {
    const fullPath = path.join(basePath, dir);
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`创建目录: ${dir}`);

    // 创建占位文件
    if (structure[dir].length > 0) {
      structure[dir].forEach((file) => {
        const filePath = path.join(fullPath, file);
        fs.writeFileSync(filePath, `# ${file}\n\n这是占位文件，等待迁移。\n`);
      });
    }
  });

  // 创建README
  fs.writeFileSync(path.join(basePath, 'README.md'), '# 文档中心\n\n这是新的统一文档结构。\n');
}

createStructure();
```

**Step 3: 运行结构创建脚本**

```bash
node scripts/create-structure.js
```

**Step 4: 验证目录结构**

```bash
find docs -type f -name "*.md" | head -20
```

**Step 5: 提交新结构**

```bash
git add docs/ scripts/create-structure.js docs/new-structure-design.md
git commit -m "feat: create new document directory structure"
```

### Task 3: 创建OpenSpec配置文件

**Files:**

- Create: `docs/.openspecrc`
- Create: `docs/.schemas/spec-schema.json`
- Create: `docs/.templates/spec-template.md`

**Step 1: 创建OpenSpec配置文件**

```yaml
# docs/.openspecrc
version: '1.0'
validation:
  enabled: true
  rules:
    - name: 'spec-structure'
      pattern: 'specs/**/*.md'
      schema: '.schemas/spec-schema.json'
    - name: 'change-format'
      pattern: 'changes/**/*.md'
      schema: '.schemas/change-schema.json'
templates:
  spec: '.templates/spec-template.md'
  change: '.templates/change-template.md'
  decision: '.templates/decision-template.md'
i18n:
  default_language: 'en'
  supported_languages: ['en', 'zh']
  translation_path: 'i18n/{lang}.json'
```

**Step 2: 创建Schema文件**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OpenSpec Specification",
  "type": "object",
  "required": ["id", "title", "type", "status"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^spec-[0-9]{3}$"
    },
    "title": {
      "type": "string",
      "minLength": 5,
      "maxLength": 100
    },
    "type": {
      "type": "string",
      "enum": ["epic", "feature", "story", "technical", "architecture"]
    },
    "status": {
      "type": "string",
      "enum": ["draft", "review", "approved", "implemented", "deprecated"]
    }
  }
}
```

**Step 3: 创建模板文件**

```markdown
---
id: 'spec-001'
title: '规范标题'
type: 'feature'
status: 'draft'
priority: 'medium'
domain: 'domain-name'
created: '2024-01-01'
updated: '2024-01-01'
owners: ['team-name']
tags: ['tag1', 'tag2']
---

# {title}

## 业务需求

[描述业务需求...]

## 功能需求

1. [需求1...]
2. [需求2...]

## 验收标准

- [ ] 标准1
- [ ] 标准2

## 技术约束

- [约束1...]
- [约束2...]

## 相关文档

- [链接到相关文档...]
```

**Step 4: 提交OpenSpec配置**

```bash
git add docs/.openspecrc docs/.schemas/ docs/.templates/
git commit -m "feat: add OpenSpec configuration and templates"
```

## 阶段2：核心迁移

### Task 4: 创建文档迁移工具

**Files:**

- Create: `scripts/migrate-docs.js`
- Create: `docs/migration-mapping.json`

**Step 1: 创建迁移映射文件**

```json
{
  "mappings": [
    {
      "source": ".qoder/repowiki/zh/content/开发指南/开发指南.md",
      "target": "docs/guides/zh/开发指南.md",
      "type": "guide"
    },
    {
      "source": "docs/DEVELOPMENT_GUIDE.md",
      "target": "docs/guides/en/development.md",
      "type": "guide"
    },
    {
      "source": "docs/architecture/layer-implementation-guide.md",
      "target": "docs/specs/architecture/strategic/layer-implementation.md",
      "type": "architecture"
    }
  ]
}
```

**Step 2: 创建迁移脚本**

```javascript
// scripts/migrate-docs.js
const fs = require('fs');
const path = require('path');

async function migrateDocuments() {
  const mappingPath = path.join(__dirname, '..', 'docs', 'migration-mapping.json');
  const mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8')).mappings;

  let migrated = 0;
  let failed = 0;

  for (const mapping of mappings) {
    try {
      const sourcePath = path.join(__dirname, '..', mapping.source);
      const targetPath = path.join(__dirname, '..', 'docs', mapping.target);

      if (fs.existsSync(sourcePath)) {
        // 确保目标目录存在
        const targetDir = path.dirname(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });

        // 读取源文件
        let content = fs.readFileSync(sourcePath, 'utf8');

        // 根据类型转换内容
        if (mapping.type === 'spec') {
          content = convertToSpec(content, mapping);
        }

        // 写入目标文件
        fs.writeFileSync(targetPath, content);

        console.log(`迁移成功: ${mapping.source} -> ${mapping.target}`);
        migrated++;
      } else {
        console.warn(`源文件不存在: ${mapping.source}`);
        failed++;
      }
    } catch (error) {
      console.error(`迁移失败 ${mapping.source}:`, error.message);
      failed++;
    }
  }

  console.log(`\n迁移完成: ${migrated} 成功, ${failed} 失败`);
}

function convertToSpec(content, mapping) {
  // 实现Markdown到OpenSpec格式的转换
  return content;
}

migrateDocuments().catch(console.error);
```

**Step 3: 运行迁移脚本（测试模式）**

```bash
node scripts/migrate-docs.js --dry-run
```

**Step 4: 实际运行迁移**

```bash
node scripts/migrate-docs.js
```

**Step 5: 提交迁移结果**

```bash
git add docs/ scripts/migrate-docs.js docs/migration-mapping.json
git commit -m "feat: migrate core documents to new structure"
```

### Task 5: 创建验证工具

**Files:**

- Create: `scripts/validate-docs.js`
- Create: `package.json`中添加验证脚本

**Step 1: 创建验证脚本**

```javascript
// scripts/validate-docs.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

async function validateDocuments() {
  const openspecConfig = yaml.load(
    fs.readFileSync(path.join(__dirname, '..', 'docs', '.openspecrc'), 'utf8')
  );

  const issues = [];

  // 验证spec文件
  const specFiles = globSync('docs/specs/**/*.md');
  for (const file of specFiles) {
    const issues = validateSpecFile(file, openspecConfig);
    if (issues.length > 0) {
      console.log(`问题在 ${file}:`, issues);
    }
  }

  // 验证链接
  const linkIssues = await validateLinks();
  issues.push(...linkIssues);

  // 生成报告
  if (issues.length > 0) {
    fs.writeFileSync(
      'docs/validation-report.md',
      `# 文档验证报告\n\n发现 ${issues.length} 个问题\n\n` +
        issues.map((issue) => `- ${issue}`).join('\n')
    );
    process.exit(1);
  } else {
    console.log('所有文档验证通过');
  }
}

// 辅助函数
function validateSpecFile(filePath, config) {
  const issues = [];
  const content = fs.readFileSync(filePath, 'utf8');

  // 检查frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    issues.push('缺少frontmatter');
    return issues;
  }

  try {
    const frontmatter = yaml.load(frontmatterMatch[1]);

    // 验证必需字段
    const required = ['id', 'title', 'type', 'status'];
    for (const field of required) {
      if (!frontmatter[field]) {
        issues.push(`缺少必需字段: ${field}`);
      }
    }
  } catch (error) {
    issues.push(`frontmatter解析错误: ${error.message}`);
  }

  return issues;
}

validateDocuments().catch(console.error);
```

**Step 2: 添加package.json脚本**

```json
{
  "scripts": {
    "validate:docs": "node scripts/validate-docs.js",
    "migrate:docs": "node scripts/migrate-docs.js"
  }
}
```

**Step 3: 运行验证**

```bash
npm run validate:docs
```

**Step 4: 提交验证工具**

```bash
git add scripts/validate-docs.js package.json
git commit -m "feat: add document validation tool"
```

## 阶段3：批量迁移

### Task 6: 自动化剩余文档迁移

**Files:**

- Modify: `scripts/migrate-docs.js` 添加自动发现功能
- Create: `scripts/discover-docs.js`

**Step 1: 创建文档发现脚本**

```javascript
// scripts/discover-docs.js
const fs = require('fs');
const path = require('path');

function discoverDocuments() {
  const discovered = [];

  // 发现.qoder目录中的文档
  const qoderPath = path.join(__dirname, '..', '.qoder', 'repowiki', 'zh');
  if (fs.existsSync(qoderPath)) {
    const files = findMarkdownFiles(qoderPath);
    files.forEach((file) => {
      discovered.push({
        source: file,
        category: determineCategory(file),
        priority: determinePriority(file),
      });
    });
  }

  // 输出发现结果
  fs.writeFileSync('docs/discovered-docs.json', JSON.stringify(discovered, null, 2));

  return discovered;
}

function findMarkdownFiles(dir) {
  // 递归查找Markdown文件
  const files = [];

  function walk(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (item.endsWith('.md')) {
        files.push(path.relative(path.join(__dirname, '..'), fullPath));
      }
    }
  }

  walk(dir);
  return files;
}

discoverDocuments();
```

**Step 2: 运行发现脚本**

```bash
node scripts/discover-docs.js
```

**Step 3: 更新迁移映射**

```bash
node scripts/update-mapping.js
```

**Step 4: 批量迁移**

```bash
npm run migrate:docs -- --batch
```

**Step 5: 提交批量迁移**

```bash
git add docs/discovered-docs.json scripts/discover-docs.js
git commit -m "feat: batch migrate remaining documents"
```

### Task 7: 创建重定向系统

**Files:**

- Create: `scripts/create-redirects.js`
- Create: `docs/.redirects.json`

**Step 1: 创建重定向脚本**

```javascript
// scripts/create-redirects.js
const fs = require('fs');
const path = require('path');

function createRedirects() {
  const mapping = JSON.parse(fs.readFileSync('docs/migration-mapping.json', 'utf8'));

  const redirects = {};

  mapping.mappings.forEach((m) => {
    if (m.source && m.target) {
      const source = m.source.replace(/^\.qoder\//, '');
      const target = `docs/${m.target}`;
      redirects[source] = target;
    }
  });

  fs.writeFileSync('docs/.redirects.json', JSON.stringify(redirects, null, 2));

  // 创建重定向HTML文件（用于GitHub Pages）
  Object.entries(redirects).forEach(([from, to]) => {
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0; url=/${to}" />
  <link rel="canonical" href="/${to}" />
</head>
<body>
  <p>文档已移动到 <a href="/${to}">${to}</a></p>
</body>
</html>`;

    const htmlPath = path.join(__dirname, '..', from.replace('.md', '.html'));
    fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
    fs.writeFileSync(htmlPath, redirectHtml);
  });
}

createRedirects();
```

**Step 2: 运行重定向创建**

```bash
node scripts/create-redirects.js
```

**Step 3: 测试重定向**

```bash
# 检查生成的HTML文件
find . -name "*.html" -path "*/.qoder/*" | head -5
```

**Step 4: 提交重定向系统**

```bash
git add docs/.redirects.json scripts/create-redirects.js
git commit -m "feat: add document redirect system"
```

## 阶段4：优化和自动化

### Task 8: 集成到CI/CD

**Files:**

- Create: `.github/workflows/validate-docs.yml`
- Modify: `package.json` 添加CI脚本

**Step 1: 创建GitHub Actions工作流**

```yaml
name: Document Validation
on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - '.github/workflows/validate-docs.yml'
  pull_request:
    branches: [main]
    paths:
      - 'docs/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Validate document structure
        run: npm run validate:docs

      - name: Check broken links
        uses: gaurav-nelson/github-action-markdown-link-check@v1
        with:
          use-quiet-mode: 'yes'
          config-file: '.github/markdown-link-check.json'

      - name: Generate documentation report
        run: |
          npm run docs:report
          cat docs/validation-report.md
```

**Step 2: 创建链接检查配置**

```json
{
  "ignorePatterns": [
    {
      "pattern": "^http://localhost"
    },
    {
      "pattern": "^#"
    }
  ]
}
```

**Step 3: 添加package.json脚本**

```json
{
  "scripts": {
    "docs:report": "node scripts/generate-report.js",
    "docs:validate-ci": "npm run validate:docs && npm run docs:report"
  }
}
```

**Step 4: 提交CI配置**

```bash
git add .github/ package.json
git commit -m "feat: add CI/CD integration for document validation"
```

### Task 9: 创建团队培训材料

**Files:**

- Create: `docs/guides/en/documentation-workflow.md`
- Create: `docs/guides/zh/文档工作流.md`

**Step 1: 创建英文工作流指南**

```markdown
# Documentation Workflow

## Creating a New Specification

1. Use the template: `docs/.templates/spec-template.md`
2. Save to appropriate directory: `docs/specs/{category}/{subcategory}/`
3. Fill in all required frontmatter fields
4. Submit for review

## Making Changes

1. Create a change record: `docs/changes/active/change-{id}.md`
2. Reference the spec being changed
3. Update spec status when change is completed
4. Move change to `completed/` directory

## Validation

All documents are automatically validated on:

- Every commit
- Every pull request
- Daily scheduled run
```

**Step 2: 创建中文工作流指南**

```markdown
# 文档工作流

## 创建新规范

1. 使用模板: `docs/.templates/spec-template.md`
2. 保存到适当目录: `docs/specs/{category}/{subcategory}/`
3. 填写所有必需的frontmatter字段
4. 提交评审

## 进行变更

1. 创建变更记录: `docs/changes/active/change-{id}.md`
2. 引用被变更的规范
3. 变更完成后更新规范状态
4. 将变更移动到 `completed/` 目录

## 验证

所有文档在以下情况自动验证：

- 每次提交
- 每个拉取请求
- 每日定时运行
```

**Step 3: 提交培训材料**

```bash
git add docs/guides/
git commit -m "docs: add documentation workflow guides"
```

### Task 10: 监控和报告

**Files:**

- Create: `scripts/generate-report.js`
- Create: `scripts/monitor-docs.js`

**Step 1: 创建报告生成脚本**

```javascript
// scripts/generate-report.js
const fs = require('fs');
const path = require('path');

async function generateReport() {
  const report = {
    generated: new Date().toISOString(),
    metrics: {
      totalSpecs: 0,
      specsByStatus: {},
      specsByType: {},
      validationIssues: 0,
      brokenLinks: 0,
      outdatedDocs: 0,
    },
    recommendations: [],
  };

  // 收集指标
  const specFiles = findMarkdownFiles('docs/specs');
  report.metrics.totalSpecs = specFiles.length;

  // 分析规范状态
  specFiles.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    const frontmatter = extractFrontmatter(content);

    if (frontmatter) {
      const status = frontmatter.status || 'unknown';
      const type = frontmatter.type || 'unknown';

      report.metrics.specsByStatus[status] = (report.metrics.specsByStatus[status] || 0) + 1;
      report.metrics.specsByType[type] = (report.metrics.specsByType[type] || 0) + 1;

      // 检查是否过期（超过30天未更新）
      if (frontmatter.updated) {
        const updated = new Date(frontmatter.updated);
        const daysSinceUpdate = (new Date() - updated) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > 30) {
          report.metrics.outdatedDocs++;
          report.recommendations.push(`规范 ${frontmatter.id} 已超过30天未更新`);
        }
      }
    }
  });

  // 生成报告
  const reportPath = 'docs/monthly-report.md';
  const reportContent = `# 文档健康报告 (${new Date().toLocaleDateString()})

## 指标概览
- 总规范数: ${report.metrics.totalSpecs}
- 验证问题: ${report.metrics.validationIssues}
- 过期文档: ${report.metrics.outdatedDocs}

## 规范状态分布
${Object.entries(report.metrics.specsByStatus)
  .map(([status, count]) => `- ${status}: ${count}`)
  .join('\n')}

## 建议
${report.recommendations.length > 0 ? report.recommendations.join('\n') : '无建议'}

---
*报告生成时间: ${report.generated}*
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`报告已生成: ${reportPath}`);
}

generateReport().catch(console.error);
```

**Step 2: 创建监控脚本**

```javascript
// scripts/monitor-docs.js
const fs = require('fs');

function monitorDocuments() {
  console.log('开始文档监控...');

  // 检查验证状态
  require('./validate-docs.js');

  // 生成报告
  require('./generate-report.js');

  // 发送通知（可选）
  console.log('监控完成');
}

// 设置为每日运行
if (require.main === module) {
  monitorDocuments();
}

module.exports = monitorDocuments;
```

**Step 3: 添加定时任务**

```json
{
  "scripts": {
    "docs:monitor": "node scripts/monitor-docs.js",
    "docs:daily": "npm run docs:monitor"
  }
}
```

**Step 4: 提交监控系统**

```bash
git add scripts/generate-report.js scripts/monitor-docs.js package.json
git commit -m "feat: add document monitoring and reporting system"
```

## 完成标准检查

### 验证步骤

**Step 1: 运行完整验证**

```bash
npm run docs:validate-ci
```

**Step 2: 检查所有迁移文档**

```bash
find docs -name "*.md" -type f | wc -l
```

**Step 3: 测试重定向**

```bash
# 检查重定向文件
find . -name "*.html" -path "*/.qoder/*" | wc -l
```

**Step 4: 生成最终报告**

```bash
npm run docs:report
```

**Step 5: 提交最终状态**

```bash
git add .
git commit -m "feat: complete document restructure implementation"
```

## 执行选项

**计划已完成并保存到 `docs/plans/2026-03-11-document-restructure-implementation.md`。两个执行选项：**

**1. Subagent-Driven（本次会话）** - 我分派新的子代理执行每个任务，任务间进行评审，快速迭代

**2. Parallel Session（单独会话）** - 在新工作树中打开新会话，使用executing-plans进行批量执行和检查点

**哪种方法？**
