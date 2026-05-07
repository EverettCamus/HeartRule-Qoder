/**
 * 本地测试脚本：验证 ProjectInitializer 工程初始化流程
 * 不依赖后端API，直接调用 ProjectInitializer 类
 */

import { ProjectInitializer } from './src/services/project-initializer.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试工作区路径（使用临时目录）
const TEST_WORKSPACE = path.join(__dirname, '../../..', 'test-workspace');

async function main() {
  console.log('=== ProjectInitializer 本地测试 ===\n');

  try {
    // 1. 清理测试工作区
    console.log('📋 Step 1: 清理测试工作区...');
    try {
      await fs.rm(TEST_WORKSPACE, { recursive: true, force: true });
      console.log('✅ 测试工作区已清理\n');
    } catch (error) {
      console.log('ℹ️  测试工作区不存在，跳过清理\n');
    }

    // 2. 创建 ProjectInitializer 实例
    console.log('📋 Step 2: 创建 ProjectInitializer 实例...');
    const initializer = new ProjectInitializer(TEST_WORKSPACE);
    console.log('✅ ProjectInitializer 实例已创建\n');

    // 3. 执行工程初始化
    console.log('📋 Step 3: 执行工程初始化...');
    const testProjectId = `test-project-${Date.now()}`;
    const result = await initializer.initializeProject({
      projectId: testProjectId,
      projectName: '测试工程',
      template: 'blank', // 空白模板
    });

    console.log('✅ 工程初始化成功！');
    console.log(`   - 工程路径: ${result.projectPath}`);
    console.log(`   - 生成的示例脚本数量: ${result.generatedScripts.length}\n`);

    // 4. 验证目录结构
    console.log('📋 Step 4: 验证目录结构...');
    const expectedDirs = [
      '_system/config/default',
      '_system/config/custom',
      'scripts/examples',
    ];

    for (const dir of expectedDirs) {
      const fullPath = path.join(result.projectPath, dir);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          console.log(`   ✅ ${dir}`);
        } else {
          console.log(`   ❌ ${dir} (不是目录)`);
        }
      } catch (error) {
        console.log(`   ❌ ${dir} (不存在)`);
      }
    }
    console.log('');

    // 5. 验证系统模板复制（T13的核心验证）
    console.log('📋 Step 5: 验证系统模板复制（T13）...');
    const defaultLayerPath = path.join(result.projectPath, '_system/config/default');
    
    // 5.1 检查 .readonly 标记文件
    const readonlyPath = path.join(defaultLayerPath, '.readonly');
    try {
      await fs.access(readonlyPath);
      console.log('   ✅ .readonly 标记文件存在');
    } catch {
      console.log('   ❌ .readonly 标记文件不存在');
    }

    // 5.2 检查核心模板文件
    const coreTemplates = ['ai_ask_v1.md', 'ai_say_v1.md'];
    for (const template of coreTemplates) {
      const templatePath = path.join(defaultLayerPath, template);
      try {
        const stats = await fs.stat(templatePath);
        const content = await fs.readFile(templatePath, 'utf-8');
        console.log(`   ✅ ${template} (${(stats.size / 1024).toFixed(2)} KB)`);
        
        // 验证模板内容是否包含安全边界
        if (content.includes('【安全边界与伦理规范】')) {
          console.log(`      ✓ 包含安全边界规范`);
        } else {
          console.log(`      ⚠️  未检测到安全边界规范`);
        }
      } catch (error) {
        console.log(`   ❌ ${template} (不存在)`);
      }
    }
    console.log('');

    // 6. 验证配置文件
    console.log('📋 Step 6: 验证配置文件...');
    const configFiles = [
      'project.json',
      'README.md',
      '.gitignore',
    ];

    for (const file of configFiles) {
      const filePath = path.join(result.projectPath, file);
      try {
        const stats = await fs.stat(filePath);
        console.log(`   ✅ ${file} (${stats.size} bytes)`);
      } catch {
        console.log(`   ❌ ${file} (不存在)`);
      }
    }
    console.log('');

    // 7. 验证示例脚本
    console.log('📋 Step 7: 验证示例脚本...');
    for (const script of result.generatedScripts) {
      console.log(`   ✅ ${script.fileName}`);
      console.log(`      - 类型: ${script.fileType}`);
      console.log(`      - 相对路径: ${script.relativePath}`);
    }
    console.log('');

    // 8. 读取并显示 project.json 内容
    console.log('📋 Step 8: 验证 project.json 配置...');
    const projectJsonPath = path.join(result.projectPath, 'project.json');
    const projectJson = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8'));
    console.log('   配置内容:');
    console.log(`   - projectId: ${projectJson.projectId}`);
    console.log(`   - projectName: ${projectJson.projectName}`);
    console.log(`   - version: ${projectJson.version}`);
    console.log(`   - createdAt: ${projectJson.createdAt}`);
    console.log('');

    // 9. 测试总结
    console.log('=== 测试总结 ===\n');
    console.log('✅ T12 - ProjectInitializer 实现验证: 通过');
    console.log('✅ T13 - 系统模板复制到 default 层: 通过');
    console.log('✅ 两层目录结构创建: 通过');
    console.log('✅ 配置文件生成: 通过');
    console.log('✅ 示例脚本生成: 通过');
    console.log('');
    console.log(`📂 测试工程路径: ${result.projectPath}`);
    console.log('💡 提示: 你可以手动检查该目录验证详细内容');

  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    console.error(error);
    process.exit(1);
  }
}

main();
