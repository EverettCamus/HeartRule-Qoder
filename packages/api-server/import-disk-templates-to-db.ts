/**
 * ⚠️  遗留迁移工具 - Legacy Migration Tool
 *
 * 用途:
 * - 将历史磁盘模板文件一次性导入到数据库(script_files表)
 * - 仅用于从旧架构迁移到数据库架构的过渡期
 *
 * 使用场景:
 * - 首次部署数据库架构时,导入默认系统模板
 * - 从磁盘工程迁移用户自定义模板方案
 *
 * 状态:
 * - ✅ 功能保留,用于历史数据迁移
 * - ⚠️  不应在运行时被业务逻辑调用
 * - ⚠️  新工程创建不再依赖此工具
 *
 * 相关Story: Story 0.5 - 移除磁盘同步机制
 * 相关日期: 2026-02-04
 *
 * ---
 *
 * 将磁盘上的模板文件导入数据库
 *
 * 扫描 workspace/projects/{projectId}/_system/config/ 目录，
 * 将所有模板文件（.md）导入到 script_files 表中
 */

import fs from 'fs/promises';
import path from 'path';

import { eq, and } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';

async function importTemplates() {
  console.log('🚀 开始导入模板文件到数据库...\n');

  // ⚠️  仅用于迁移工具,不再用于运行时逻辑
  const workspacePath =
    process.env.PROJECTS_WORKSPACE || path.resolve(process.cwd(), 'workspace', 'projects');

  // 检查 workspace 目录是否存在
  try {
    await fs.access(workspacePath);
  } catch {
    console.log('⚠️  Workspace 目录不存在，跳过导入');
    process.exit(0);
  }

  // 获取所有项目
  const allProjects = await db.select().from(projects);
  console.log(`📋 找到 ${allProjects.length} 个项目\n`);

  let totalImported = 0;
  let totalSkipped = 0;

  for (const project of allProjects) {
    console.log(`\n📦 处理项目: ${project.projectName} (${project.id})`);

    const projectPath = path.join(workspacePath, project.id);
    const configPath = path.join(projectPath, '_system', 'config');

    // 检查项目目录是否存在
    try {
      await fs.access(configPath);
    } catch {
      console.log(`   ⚠️  模板目录不存在，跳过`);
      continue;
    }

    // 导入 default 层模板
    const defaultPath = path.join(configPath, 'default');
    try {
      await fs.access(defaultPath);
      const defaultFiles = await fs.readdir(defaultPath);

      for (const fileName of defaultFiles) {
        if (!fileName.endsWith('.md') || fileName === 'README.md' || fileName === '.readonly') {
          continue;
        }

        const filePath = path.join(defaultPath, fileName);
        const content = await fs.readFile(filePath, 'utf-8');
        const virtualPath = `_system/config/default/${fileName}`;

        // 检查是否已存在
        const existing = await db
          .select()
          .from(scriptFiles)
          .where(and(eq(scriptFiles.projectId, project.id), eq(scriptFiles.filePath, virtualPath)))
          .limit(1);

        if (existing.length > 0) {
          console.log(`   ⏭️  已存在: ${virtualPath}`);
          totalSkipped++;
          continue;
        }

        // 插入数据库
        await db.insert(scriptFiles).values({
          projectId: project.id,
          fileType: 'template',
          fileName: fileName,
          filePath: virtualPath,
          fileContent: { content }, // 包装为对象
        });

        console.log(`   ✅ 导入: ${virtualPath}`);
        totalImported++;
      }
    } catch (error: any) {
      console.log(`   ⚠️  Default 目录不存在: ${error.message}`);
    }

    // 导入 custom 层模板
    const customPath = path.join(configPath, 'custom');
    try {
      await fs.access(customPath);
      const schemes = await fs.readdir(customPath, { withFileTypes: true });

      for (const schemeEntry of schemes) {
        if (!schemeEntry.isDirectory() || schemeEntry.name === '.gitkeep') {
          continue;
        }

        const schemeName = schemeEntry.name;
        const schemePath = path.join(customPath, schemeName);
        const schemeFiles = await fs.readdir(schemePath);

        for (const fileName of schemeFiles) {
          if (!fileName.endsWith('.md') || fileName === 'README.md') {
            continue;
          }

          const filePath = path.join(schemePath, fileName);
          const content = await fs.readFile(filePath, 'utf-8');
          const virtualPath = `_system/config/custom/${schemeName}/${fileName}`;

          // 检查是否已存在
          const existing = await db
            .select()
            .from(scriptFiles)
            .where(
              and(eq(scriptFiles.projectId, project.id), eq(scriptFiles.filePath, virtualPath))
            )
            .limit(1);

          if (existing.length > 0) {
            console.log(`   ⏭️  已存在: ${virtualPath}`);
            totalSkipped++;
            continue;
          }

          // 插入数据库
          await db.insert(scriptFiles).values({
            projectId: project.id,
            fileType: 'template',
            fileName: fileName,
            filePath: virtualPath,
            fileContent: { content },
          });

          console.log(`   ✅ 导入: ${virtualPath}`);
          totalImported++;
        }
      }
    } catch (error: any) {
      console.log(`   ℹ️  Custom 目录不存在或为空`);
    }
  }

  console.log(`\n\n✅ 导入完成！`);
  console.log(`   📥 已导入: ${totalImported} 个文件`);
  console.log(`   ⏭️  已跳过: ${totalSkipped} 个文件（已存在）`);

  process.exit(0);
}

importTemplates().catch((error) => {
  console.error('❌ 导入失败:', error);
  process.exit(1);
});
