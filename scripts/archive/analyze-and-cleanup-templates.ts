import fs from 'fs/promises';
import path from 'path';

import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';

interface TemplateFileInfo {
  projectId: string;
  projectName: string;
  filePath: string;
  fileName: string;
  existsInDb: boolean;
  existsOnDisk: boolean;
  diskPath: string;
  canDelete: boolean;
  reason: string;
}

interface CleanupReport {
  totalScanned: number;
  canDelete: TemplateFileInfo[];
  mustKeep: TemplateFileInfo[];
  summary: {
    totalInDb: number;
    totalOnDisk: number;
    redundant: number;
    essential: number;
  };
}

async function analyzeTemplates(): Promise<CleanupReport> {
  console.log('🔍 开始分析模板文件...\n');
  console.log('='.repeat(80));

  const report: CleanupReport = {
    totalScanned: 0,
    canDelete: [],
    mustKeep: [],
    summary: {
      totalInDb: 0,
      totalOnDisk: 0,
      redundant: 0,
      essential: 0,
    },
  };

  const allProjects = await db.select().from(projects);
  console.log(`\n📋 找到 ${allProjects.length} 个项目\n`);

  const dbTemplates = await db
    .select()
    .from(scriptFiles)
    .where(eq(scriptFiles.fileType, 'template'));

  report.summary.totalInDb = dbTemplates.length;
  console.log(`📊 数据库中共有 ${dbTemplates.length} 个模板记录\n`);

  const templatesByProject = new Map<string, typeof dbTemplates>();
  for (const template of dbTemplates) {
    if (!templatesByProject.has(template.projectId)) {
      templatesByProject.set(template.projectId, []);
    }
    templatesByProject.get(template.projectId)!.push(template);
  }

  console.log('数据库中的模板分布：');
  console.log('-'.repeat(80));
  for (const [projectId, templates] of templatesByProject) {
    const project = allProjects.find((p) => p.id === projectId);
    console.log(`  项目: ${project?.projectName || 'Unknown'} (${projectId})`);
    console.log(`  模板数量: ${templates.length}`);
    templates.forEach((t) => {
      console.log(`    - ${t.filePath}`);
    });
    console.log('');
  }

  const promptsBasePath = path.resolve(process.cwd(), '..', '..', 'config', 'prompts');
  console.log(`\n🔍 扫描磁盘模板目录: ${promptsBasePath}\n`);

  const diskTemplates = await scanDiskTemplates(promptsBasePath);
  report.summary.totalOnDisk = diskTemplates.length;
  report.totalScanned = diskTemplates.length;

  console.log(`📊 磁盘上共找到 ${diskTemplates.length} 个模板文件\n`);

  for (const diskTemplate of diskTemplates) {
    const analysis = await analyzeTemplateFile(
      diskTemplate,
      dbTemplates,
      allProjects,
      promptsBasePath
    );

    if (analysis.canDelete) {
      report.canDelete.push(analysis);
      report.summary.redundant++;
    } else {
      report.mustKeep.push(analysis);
      report.summary.essential++;
    }
  }

  return report;
}

async function scanDiskTemplates(basePath: string): Promise<string[]> {
  const templates: string[] = [];

  async function scan(dir: string, relativePath: string = '') {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await scan(fullPath, relPath);
        } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
          templates.push(relPath);
        }
      }
    } catch (error) {
      // 目录不存在或无法访问
    }
  }

  await scan(basePath);
  return templates;
}

async function analyzeTemplateFile(
  diskRelativePath: string,
  dbTemplates: any[],
  allProjects: any[],
  basePath: string
): Promise<TemplateFileInfo> {
  const fileName = path.basename(diskRelativePath);
  const diskPath = path.join(basePath, diskRelativePath);

  const virtualPath = diskRelativePath.replace(/\\/g, '/');

  const inDb = dbTemplates.some((t) => t.filePath === virtualPath);

  let canDelete = false;
  let reason = '';
  let projectId = 'N/A';
  let projectName = 'N/A';

  if (inDb) {
    const dbTemplate = dbTemplates.find((t) => t.filePath === virtualPath);
    if (dbTemplate) {
      const project = allProjects.find((p) => p.id === dbTemplate.projectId);
      projectId = dbTemplate.projectId;
      projectName = project?.projectName || 'Unknown';

      // _system/config/default/ 下的文件是新工程初始化的模板源，不应删除
      if (virtualPath.startsWith('_system/config/default/')) {
        canDelete = false;
        reason = '新工程初始化的模板源文件，作为数据库导入的基准';
      } else {
        canDelete = true;
        reason = `已在数据库中（项目: ${projectName}），系统将优先从数据库加载`;
      }
    }
  } else {
    if (virtualPath.startsWith('_system/config/')) {
      reason = '新架构路径但未导入数据库，可能是孤立文件';
      canDelete = false;
    } else if (virtualPath.startsWith('ai-ask/') || virtualPath.startsWith('ai-say/')) {
      reason = '旧架构文件，可能被兼容模式或测试使用';
      canDelete = false;
    } else if (virtualPath === 'ai_ask_v1.md' || virtualPath === 'ai_say_v1.md') {
      reason = '根目录模板，可能被兼容模式或本地开发使用';
      canDelete = false;
    } else {
      reason = '未分类文件，需要人工审查';
      canDelete = false;
    }
  }

  return {
    projectId,
    projectName,
    filePath: virtualPath,
    fileName,
    existsInDb: inDb,
    existsOnDisk: true,
    diskPath,
    canDelete,
    reason,
  };
}

function printReport(report: CleanupReport): void {
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 分析报告');
  console.log('='.repeat(80));

  console.log('\n📈 统计摘要:');
  console.log(`  数据库中的模板: ${report.summary.totalInDb}`);
  console.log(`  磁盘上的模板文件: ${report.summary.totalOnDisk}`);
  console.log(`  可安全删除: ${report.summary.redundant}`);
  console.log(`  必须保留: ${report.summary.essential}`);

  if (report.canDelete.length > 0) {
    console.log('\n\n🗑️  可安全删除的文件（已在数据库中）:');
    console.log('-'.repeat(80));
    report.canDelete.forEach((file, index) => {
      console.log(`\n${index + 1}. ${file.filePath}`);
      console.log(`   项目: ${file.projectName} (${file.projectId})`);
      console.log(`   磁盘路径: ${file.diskPath}`);
      console.log(`   原因: ${file.reason}`);
    });
  } else {
    console.log('\n\n✅ 未发现可删除的冗余文件');
  }

  if (report.mustKeep.length > 0) {
    console.log('\n\n📌 必须保留的文件:');
    console.log('-'.repeat(80));
    report.mustKeep.forEach((file, index) => {
      console.log(`\n${index + 1}. ${file.filePath}`);
      console.log(`   磁盘路径: ${file.diskPath}`);
      console.log(`   在数据库中: ${file.existsInDb ? '是' : '否'}`);
      console.log(`   原因: ${file.reason}`);
    });
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('📝 建议:');
  console.log('='.repeat(80));

  if (report.canDelete.length > 0) {
    console.log('\n1. 可安全删除的文件已在数据库中有备份');
    console.log('2. 运行 `npm run cleanup-templates:execute` 执行实际删除');
    console.log('3. 删除前建议先备份 config/prompts 目录');
    console.log('4. 删除后测试各项功能确保正常工作');
  } else {
    console.log('\n✅ 当前没有冗余文件需要清理');
    console.log('系统正在按照"数据库优先，文件系统回退"策略运行');
  }

  console.log('\n⚠️  保留的文件用途:');
  console.log('  - 兼容旧工程或兼容模式');
  console.log('  - 本地开发和测试');
  console.log('  - 作为数据库模板的源文件备份');

  console.log('\n');
}

async function executeCleanup(report: CleanupReport, dryRun: boolean = true): Promise<void> {
  if (report.canDelete.length === 0) {
    console.log('\n✅ 没有文件需要清理');
    return;
  }

  console.log('\n\n' + '='.repeat(80));
  console.log(dryRun ? '🔍 模拟清理（Dry Run）' : '🗑️  执行清理');
  console.log('='.repeat(80));

  const deletedFiles: string[] = [];
  const failedFiles: { path: string; error: string }[] = [];

  for (const file of report.canDelete) {
    console.log(`\n${dryRun ? '[模拟]' : '[删除]'} ${file.filePath}`);

    if (!dryRun) {
      try {
        await fs.unlink(file.diskPath);
        deletedFiles.push(file.diskPath);
        console.log(`  ✅ 已删除`);
      } catch (error: any) {
        failedFiles.push({ path: file.diskPath, error: error.message });
        console.log(`  ❌ 删除失败: ${error.message}`);
      }
    } else {
      console.log(`  ℹ️  将删除: ${file.diskPath}`);
    }
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('清理结果');
  console.log('='.repeat(80));

  if (dryRun) {
    console.log(`\n📋 模拟删除 ${report.canDelete.length} 个文件`);
    console.log('\n💡 这是模拟运行，没有实际删除任何文件');
    console.log('   使用 --execute 参数执行实际删除');
  } else {
    console.log(`\n✅ 成功删除: ${deletedFiles.length} 个文件`);
    if (failedFiles.length > 0) {
      console.log(`❌ 删除失败: ${failedFiles.length} 个文件`);
      failedFiles.forEach((f) => {
        console.log(`  - ${f.path}: ${f.error}`);
      });
    }
  }

  const logPath = path.resolve(process.cwd(), 'template-cleanup-log.json');
  const logData = {
    timestamp: new Date().toISOString(),
    dryRun,
    deletedFiles,
    failedFiles,
    report,
  };

  await fs.writeFile(logPath, JSON.stringify(logData, null, 2), 'utf-8');
  console.log(`\n📄 清理日志已保存: ${logPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const skipConfirm = args.includes('--yes') || args.includes('-y');

  console.log('🚀 模板文件清理工具');
  console.log('='.repeat(80));
  console.log('\n📖 说明:');
  console.log('  根据"数据库优先，文件系统回退"策略，清理已在数据库中的冗余模板文件');
  console.log('  --execute: 执行实际删除（默认为模拟运行）');
  console.log('  --yes, -y: 跳过确认提示');
  console.log('\n');

  try {
    const report = await analyzeTemplates();
    printReport(report);

    if (report.canDelete.length === 0) {
      process.exit(0);
    }

    if (execute) {
      if (!skipConfirm) {
        console.log('\n⚠️  警告: 即将删除上述文件！');
        console.log('请确认:');
        console.log('  1. 已备份 config/prompts 目录');
        console.log('  2. 数据库中已有这些模板的完整备份');
        console.log('  3. 了解删除操作不可逆');
        console.log('\n按 Ctrl+C 取消，或等待 5 秒后自动继续...\n');

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      await executeCleanup(report, false);
    } else {
      await executeCleanup(report, true);
      console.log('\n💡 提示: 使用 --execute 参数执行实际删除');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 执行失败:', error);
    process.exit(1);
  }
}

main();
