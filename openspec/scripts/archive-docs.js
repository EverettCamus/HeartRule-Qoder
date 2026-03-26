#!/usr/bin/env node

/**
 * 归档docs/目录中未迁移的文档到docs-archive/
 * 添加归档元数据标识，避免AI后续开发时受到影响
 */

const fs = require('fs');
const path = require('path');

// 归档分类映射
const CATEGORY_MAPPING = {
  // 架构设计文档
  'architecture': ['architecture-refactoring', 'layer-implementation', 'project-editor-refactoring', 'stage3-ui-integration', 'topic-dynamic-action-queue', 'visual-editor-validation'],
  
  // DDD领域设计文档
  'domain': ['ai-ask-execution', 'session-intelligence', 'story-2.2-topic', 'system-variable-format'],
  
  // 产品规格文档
  'product': ['productbacklog', 'visual-editor-validation-user-guide'],
  
  // 研究文档
  'research': ['code-quality-audit', 'project-editor-refactoring-analysis', 'story-7.5-schema-validation', 'paper-'],
  
  // 流程文档
  'process': ['development-guide', 'e2e-testing-guide', 'migration-to-database', 'topic-configuration-guide'],
  
  // AI相关技术文档
  'misc': ['ai_ask_', 'target_variable', 'refactor_summary'],
  
  // Bug修复记录
  'bugfix': ['bugfix', 'fix', '修复'],
  
  // 测试报告
  'test': ['test', 'regression', '测试'],
  
  // 临时文档
  'temp': ['temp', '对比', '临时']
};

// 已迁移到openspec的文件列表（从迁移跟踪中获取）
const MIGRATED_FILES = [
  '2026-03-08-architecture-refactoring-design.md',
  '2026-03-08-architecture-refactoring-implementation.md',
  'layer-implementation-guide.md',
  'project-editor-refactoring-plan.md',
  'stage3-ui-integration-plan.md',
  'topic-dynamic-action-queue-two-stage-llm-refactor-design.md',
  'visual-editor-validation-design.md',
  'ai-ask-execution-sequence.md',
  'session-intelligence-guardian-design.md',
  'code-quality-audit-report.md',
  'project-editor-refactoring-analysis.md',
  'story-7.5-schema-validation-completion-report.md',
  'paper-03-Script-Strategy-Aligned-Generation.md',
  'visual-editor-validation-user-guide.md'
];

// 确定文档分类
function determineCategory(filename) {
  const lowerFilename = filename.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_MAPPING)) {
    for (const keyword of keywords) {
      if (lowerFilename.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'misc';
}

// 生成归档元数据
function generateArchiveMetadata(filepath, category) {
  const filename = path.basename(filepath);
  const relativePath = filepath.replace(/^.*?docs\//, 'docs/');
  const documentId = `docs-archive-${category}-${filename.replace(/\.md$/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
  const archivedDate = new Date().toISOString().split('T')[0];
  
  return `---
document_id: "${documentId}"
authority: "historical"
status: "archived"
archived_date: "${archivedDate}"
source: "docs"
path: "${relativePath}"
migrated_to: ""  # 如果已迁移到openspec，填写openspec路径
tags: ["historical", "reference", "archived", "${category}"]
search_priority: "medium"
ai_retrieval_hint: "⚠️ 此文档已归档，请优先参考OpenSpec文档"
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\\\`openspec/specs/\\\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: ${archivedDate}
**原始路径**: ${relativePath}

---
`;
}

// 处理单个文件
function archiveFile(sourcePath, targetDir) {
  try {
    const filename = path.basename(sourcePath);
    
    // 检查是否已迁移
    if (MIGRATED_FILES.includes(filename)) {
      console.log(`⏭️  跳过已迁移文件: ${filename}`);
      return false;
    }
    
    // 确定分类
    const category = determineCategory(filename);
    const targetCategoryDir = path.join(targetDir, category);
    
    // 创建目标目录
    if (!fs.existsSync(targetCategoryDir)) {
      fs.mkdirSync(targetCategoryDir, { recursive: true });
    }
    
    const targetPath = path.join(targetCategoryDir, filename);
    
    // 读取源文件内容
    const content = fs.readFileSync(sourcePath, 'utf8');
    
    // 生成归档内容
    const archiveMetadata = generateArchiveMetadata(sourcePath, category);
    const archivedContent = archiveMetadata + '\n' + content;
    
    // 写入归档文件
    fs.writeFileSync(targetPath, archivedContent, 'utf8');
    
    console.log(`✅ 归档完成: ${filename} → ${category}/`);
    return true;
  } catch (error) {
    console.error(`❌ 归档失败 ${sourcePath}:`, error.message);
    return false;
  }
}

// 处理目录
function archiveDirectory(sourceDir, targetDir) {
  try {
    const items = fs.readdirSync(sourceDir);
    let archivedCount = 0;
    
    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // 递归处理子目录
        const subArchived = archiveDirectory(sourcePath, targetDir);
        archivedCount += subArchived;
      } else if (item.endsWith('.md')) {
        // 处理Markdown文件
        const archived = archiveFile(sourcePath, targetDir);
        if (archived) archivedCount++;
      }
    }
    
    return archivedCount;
  } catch (error) {
    console.error(`❌ 处理目录失败 ${sourceDir}:`, error.message);
    return 0;
  }
}

// 主函数
function main() {
  const docsDir = path.join(__dirname, '../../docs');
  const archiveDir = path.join(__dirname, '../../docs-archive');
  
  console.log('📁 开始归档docs/目录文档...');
  console.log(`源目录: ${docsDir}`);
  console.log(`目标目录: ${archiveDir}`);
  console.log('---');
  
  // 检查目录是否存在
  if (!fs.existsSync(docsDir)) {
    console.error(`❌ 源目录不存在: ${docsDir}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }
  
  // 归档文档
  const archivedCount = archiveDirectory(docsDir, archiveDir);
  
  console.log('---');
  console.log(`📊 归档完成: ${archivedCount} 个文档已归档到 docs-archive/`);
  console.log('');
  console.log('📋 归档分类统计:');
  
  // 统计各分类文档数量
  const categories = fs.readdirSync(archiveDir).filter(item => {
    const itemPath = path.join(archiveDir, item);
    return fs.statSync(itemPath).isDirectory();
  });
  
  for (const category of categories) {
    const categoryPath = path.join(archiveDir, category);
    const files = fs.readdirSync(categoryPath).filter(file => file.endsWith('.md'));
    console.log(`  ${category}/: ${files.length} 个文档`);
  }
  
  console.log('');
  console.log('🔧 后续步骤:');
  console.log('1. 验证归档文档的元数据是否正确');
  console.log('2. 更新AI检索配置，设置openspec/优先级高于docs-archive/');
  console.log('3. 考虑清理或保留原始docs/目录');
}

// 执行主函数
if (require.main === module) {
  main();
}

module.exports = {
  determineCategory,
  generateArchiveMetadata,
  archiveFile,
  archiveDirectory
};