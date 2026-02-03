/**
 * 迁移脚本：为现有工程补充两层模板目录结构
 * 
 * 功能：
 * 1. 扫描 workspace/projects 下的所有工程
 * 2. 检查是否缺少 _system/config/default 和 custom 目录
 * 3. 自动创建缺失的目录结构
 * 4. 从系统模板复制 default 层模板
 * 5. 创建 custom 层的 .gitkeep
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const WORKSPACE_PATH = path.join(__dirname, 'workspace', 'projects');
const SYSTEM_TEMPLATES_PATH = path.join(__dirname, '../../config/prompts');

interface MigrationResult {
  projectId: string;
  status: 'migrated' | 'already_exists' | 'failed';
  error?: string;
  details?: string;
}

/**
 * 递归复制目录
 */
async function copyDirectory(source: string, target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });

  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
    } else {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

/**
 * 检查并迁移单个工程
 */
async function migrateProject(projectPath: string): Promise<MigrationResult> {
  const projectId = path.basename(projectPath);
  
  console.log(`\n[${projectId}] 开始检查...`);

  try {
    // 检查 _system/config/default 是否存在
    const defaultPath = path.join(projectPath, '_system', 'config', 'default');
    let defaultExists = false;
    try {
      await fs.access(defaultPath);
      defaultExists = true;
      console.log(`[${projectId}] ✅ default 层已存在`);
    } catch {
      console.log(`[${projectId}] ❌ default 层缺失`);
    }

    // 检查 _system/config/custom 是否存在
    const customPath = path.join(projectPath, '_system', 'config', 'custom');
    let customExists = false;
    try {
      await fs.access(customPath);
      customExists = true;
      console.log(`[${projectId}] ✅ custom 层已存在`);
    } catch {
      console.log(`[${projectId}] ❌ custom 层缺失`);
    }

    // 如果都存在，跳过
    if (defaultExists && customExists) {
      return {
        projectId,
        status: 'already_exists',
        details: '目录结构已完整',
      };
    }

    // 开始迁移
    console.log(`[${projectId}] 🔧 开始迁移...`);

    // 1. 创建 _system/config 目录
    const systemConfigPath = path.join(projectPath, '_system', 'config');
    await fs.mkdir(systemConfigPath, { recursive: true });

    // 2. 复制系统默认模板到 default 层
    if (!defaultExists) {
      console.log(`[${projectId}] 📋 复制系统模板到 default 层...`);
      
      // 检查系统模板是否存在
      try {
        await fs.access(SYSTEM_TEMPLATES_PATH);
      } catch {
        throw new Error(`系统模板路径不存在: ${SYSTEM_TEMPLATES_PATH}`);
      }

      await copyDirectory(SYSTEM_TEMPLATES_PATH, defaultPath);
      
      // 添加只读标记文件
      await fs.writeFile(
        path.join(defaultPath, '.readonly'),
        '# 系统默认模板（Default 层）\n\n此目录包含系统默认模板，请勿直接修改。\n如需自定义，请在 custom/ 目录下创建新的模板方案。'
      );

      console.log(`[${projectId}] ✅ default 层创建成功`);
    }

    // 3. 创建 custom 层和 .gitkeep
    if (!customExists) {
      console.log(`[${projectId}] 📁 创建 custom 层...`);
      
      await fs.mkdir(customPath, { recursive: true });
      
      await fs.writeFile(
        path.join(customPath, '.gitkeep'),
        '# Custom 模板方案目录\n\n请在此目录下创建自定义模板方案。\n例如：custom/cbt_scheme/ai_ask_v1.md'
      );

      console.log(`[${projectId}] ✅ custom 层创建成功`);
    }

    return {
      projectId,
      status: 'migrated',
      details: `已创建 ${!defaultExists ? 'default层 ' : ''}${!customExists ? 'custom层' : ''}`,
    };

  } catch (error: any) {
    console.error(`[${projectId}] ❌ 迁移失败:`, error.message);
    return {
      projectId,
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * 主函数：扫描并迁移所有工程
 */
async function main() {
  console.log('='.repeat(60));
  console.log('工程模板目录结构迁移脚本');
  console.log('='.repeat(60));
  console.log(`工作区路径: ${WORKSPACE_PATH}`);
  console.log(`系统模板路径: ${SYSTEM_TEMPLATES_PATH}`);
  console.log('='.repeat(60));

  try {
    // 检查工作区是否存在
    try {
      await fs.access(WORKSPACE_PATH);
    } catch {
      console.error('❌ 工作区路径不存在:', WORKSPACE_PATH);
      process.exit(1);
    }

    // 检查系统模板是否存在
    try {
      await fs.access(SYSTEM_TEMPLATES_PATH);
    } catch {
      console.error('❌ 系统模板路径不存在:', SYSTEM_TEMPLATES_PATH);
      console.error('请确保 config/prompts 目录存在');
      process.exit(1);
    }

    // 读取所有工程目录
    const entries = await fs.readdir(WORKSPACE_PATH, { withFileTypes: true });
    const projectDirs = entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(WORKSPACE_PATH, entry.name));

    if (projectDirs.length === 0) {
      console.log('⚠️ 未发现任何工程目录');
      return;
    }

    console.log(`\n发现 ${projectDirs.length} 个工程，开始迁移...\n`);

    // 依次迁移每个工程
    const results: MigrationResult[] = [];
    for (const projectPath of projectDirs) {
      const result = await migrateProject(projectPath);
      results.push(result);
    }

    // 输出汇总报告
    console.log('\n' + '='.repeat(60));
    console.log('迁移完成！汇总报告：');
    console.log('='.repeat(60));

    const migrated = results.filter(r => r.status === 'migrated');
    const alreadyExists = results.filter(r => r.status === 'already_exists');
    const failed = results.filter(r => r.status === 'failed');

    console.log(`✅ 成功迁移: ${migrated.length} 个工程`);
    migrated.forEach(r => {
      console.log(`   - ${r.projectId}: ${r.details}`);
    });

    console.log(`ℹ️  已完整: ${alreadyExists.length} 个工程`);
    alreadyExists.forEach(r => {
      console.log(`   - ${r.projectId}`);
    });

    if (failed.length > 0) {
      console.log(`❌ 失败: ${failed.length} 个工程`);
      failed.forEach(r => {
        console.log(`   - ${r.projectId}: ${r.error}`);
      });
    }

    console.log('='.repeat(60));

    // 如果有失败的，退出码为1
    if (failed.length > 0) {
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ 迁移脚本执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行主函数
main();
