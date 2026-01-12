import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createSampleProject() {
  // 1. 创建工程
  const projectData = {
    projectName: "CBT Depression Assessment Project",
    description: "Cognitive Behavioral Therapy (CBT) initial depression assessment session script project for demonstrating complete consultation workflow",
    engineVersion: "2.0.0",
    engineVersionMin: "2.0.0",
    author: "LEO",
    tags: ["CBT", "Depression", "Assessment", "Sample Project"]
  };

  console.log('正在创建工程...');
  const projectResponse = await fetch('http://localhost:8000/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectData)
  });

  const projectResult = await projectResponse.json();
  if (!projectResult.success) {
    console.error('创建工程失败:', projectResult);
    return;
  }

  const project = projectResult.data;
  console.log('✅ 工程创建成功！');
  console.log('   工程ID:', project.id);
  console.log('   工程名称:', project.projectName);

  // 2. 读取会话脚本文件
  const scriptPath = path.join(__dirname, 'scripts', 'sessions', 'cbt_depression_assessment.yaml');
  const yamlContent = fs.readFileSync(scriptPath, 'utf-8');

  // 3. 创建会话文件
  console.log('\n正在创建会话文件...');
  const fileData = {
    fileType: 'session',
    fileName: 'cbt_depression_assessment.yaml',
    fileContent: {
      metadata: {
        name: "CBT抑郁症初次评估会谈",
        version: "1.0",
        author: "HeartRule Team",
        description: "用于抑郁症患者的初次评估会谈，建立关系并收集基础信息"
      }
    },
    yamlContent: yamlContent
  };

  const fileResponse = await fetch(`http://localhost:8000/api/projects/${project.id}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fileData)
  });

  const fileResult = await fileResponse.json();
  if (!fileResult.success) {
    console.error('创建文件失败:', fileResult);
    return;
  }

  console.log('✅ 会话文件创建成功！');
  console.log('   文件ID:', fileResult.data.id);
  console.log('   文件名:', fileResult.data.fileName);

  console.log('\n🎉 示例工程创建完成！');
  console.log('请在浏览器中刷新 http://localhost:3000 查看工程列表');
}

createSampleProject().catch(console.error);
