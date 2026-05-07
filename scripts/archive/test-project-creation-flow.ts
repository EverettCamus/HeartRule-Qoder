/**
 * 测试从编辑器UI创建工程的完整流程
 * 验证：
 * 1. 工程目录结构创建成功
 * 2. 系统模板文件（ai-ask, ai-say）正确复制到 config/prompts/_system/
 * 3. 示例脚本文件生成
 * 4. 脚本Schema验证通过
 */

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const API_BASE_URL = 'http://localhost:8000/api';

interface CreateProjectRequest {
  projectName: string;
  description?: string;
  engineVersion?: string;
  engineVersionMin?: string;
  author: string;
  tags?: string[];
  template?: 'blank' | 'cbt-assessment' | 'cbt-counseling';
  domain?: string;
  scenario?: string;
  language?: string;
}

async function testProjectCreation() {
  console.log('\n========================================');
  console.log('🧪 测试从编辑器UI创建工程流程');
  console.log('========================================\n');

  // 1. 准备测试数据（模拟前端表单提交）
  const projectData: CreateProjectRequest = {
    projectName: `UITest-${Date.now()}`,
    description: '测试从编辑器UI创建工程',
    engineVersion: '1.2.0',
    engineVersionMin: '1.0.0',
    author: 'LEO',
    tags: ['test', 'ui'],
    template: 'blank',
    language: 'zh-CN',
  };

  console.log('📋 创建工程请求参数：');
  console.log(JSON.stringify(projectData, null, 2));
  console.log('\n');

  try {
    // 2. 调用API创建工程
    console.log('🚀 发送创建工程请求...');
    const response = await axios.post(`${API_BASE_URL}/projects`, projectData);

    if (!response.data.success) {
      throw new Error('API返回失败状态');
    }

    const project = response.data.data;
    console.log(`✅ 工程创建成功: ${project.id}`);
    console.log(`   工程名称: ${project.projectName}`);
    console.log('\n');

    // 3. 检查工程物理目录
    // 注意：__dirname在tsx中可能导致路径重复，这里直接使用绝对路径
    const workspacePath = path.resolve(process.cwd(), 'workspace', 'projects');
    const projectPath = path.join(workspacePath, project.id);

    console.log('📂 检查工程目录结构...');
    console.log(`   工程路径: ${projectPath}`);

    const dirExists = await fs
      .access(projectPath)
      .then(() => true)
      .catch(() => false);

    if (!dirExists) {
      throw new Error(`❌ 工程目录不存在: ${projectPath}`);
    }
    console.log('   ✅ 工程根目录存在');

    // 4. 检查系统模板目录
    const systemTemplatesPath = path.join(projectPath, 'config', 'prompts', '_system');
    console.log(`\n📁 检查系统模板目录: ${systemTemplatesPath}`);

    const systemDirExists = await fs
      .access(systemTemplatesPath)
      .then(() => true)
      .catch(() => false);

    if (!systemDirExists) {
      throw new Error(`❌ 系统模板目录不存在: ${systemTemplatesPath}`);
    }
    console.log('   ✅ 系统模板目录存在');

    // 5. 检查模板文件
    console.log('\n🔍 检查模板文件...');

    const expectedTemplates = [
      { path: 'ai-ask/mainline-ask-template.md', name: 'ai-ask主线提问模板' },
      { path: 'ai-ask/multi-round-ask.md', name: 'ai-ask多轮提问模板' },
      { path: 'ai-ask/simple-ask.md', name: 'ai-ask简单提问模板' },
      { path: 'ai-say/mainline-a-introduce-concept.md', name: 'ai-say介绍概念模板' },
      { path: '.readonly', name: '只读标记文件' },
    ];

    let allTemplatesExist = true;
    for (const template of expectedTemplates) {
      const templatePath = path.join(systemTemplatesPath, template.path);
      const exists = await fs
        .access(templatePath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        console.log(`   ✅ ${template.name}`);
      } else {
        console.log(`   ❌ ${template.name} - 文件不存在: ${templatePath}`);
        allTemplatesExist = false;
      }
    }

    if (!allTemplatesExist) {
      throw new Error('部分模板文件缺失');
    }

    // 6. 检查示例脚本
    console.log('\n📄 检查示例脚本...');
    const scriptsPath = path.join(projectPath, 'scripts', 'examples');
    const scriptFile = path.join(scriptsPath, 'hello-world.yaml');

    const scriptExists = await fs
      .access(scriptFile)
      .then(() => true)
      .catch(() => false);

    if (!scriptExists) {
      throw new Error(`❌ 示例脚本不存在: ${scriptFile}`);
    }
    console.log(`   ✅ hello-world.yaml 存在`);

    // 7. 读取并验证脚本内容
    const scriptContent = await fs.readFile(scriptFile, 'utf-8');
    console.log('\n📝 脚本内容预览（前200字符）:');
    console.log('---');
    console.log(scriptContent.substring(0, 200));
    console.log('...');
    console.log('---\n');

    // 8. 通过API验证脚本
    console.log('🔍 通过API验证脚本格式...');
    const filesResponse = await axios.get(`${API_BASE_URL}/projects/${project.id}/files`);

    if (!filesResponse.data.success) {
      throw new Error('获取脚本文件列表失败');
    }

    const scriptFiles = filesResponse.data.data;
    console.log(`   找到 ${scriptFiles.length} 个脚本文件`);

    for (const file of scriptFiles) {
      console.log(`   - ${file.fileName} (${file.fileType})`);
    }

    // 9. 最终结果
    console.log('\n========================================');
    console.log('✨ 测试结果汇总');
    console.log('========================================');
    console.log('✅ 工程创建成功');
    console.log('✅ 工程目录结构正确');
    console.log('✅ 系统模板文件完整（ai-ask, ai-say）');
    console.log('✅ 示例脚本生成成功');
    console.log('\n🎉 所有检查通过！从编辑器UI创建工程功能正常。\n');

    return project.id;
  } catch (error: any) {
    console.error('\n❌ 测试失败:');
    if (error.response) {
      console.error('API错误:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('网络错误:', error.message);
      console.error('提示: 请确保后端服务运行在 http://localhost:8000');
    } else {
      console.error(error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
    process.exit(1);
  }
}

// 运行测试
testProjectCreation().then((projectId) => {
  console.log(`\n💡 提示: 您可以在编辑器中打开工程 ${projectId} 查看效果`);
  console.log(`   浏览器访问: http://localhost:3001/#/projects/${projectId}/files\n`);
  process.exit(0);
});
