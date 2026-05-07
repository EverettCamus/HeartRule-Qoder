#!/usr/bin/env node

/**
 * 准备 E2E 测试的数据
 * 创建一个测试项目并发布两个版本
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:8000/api';

async function request(method, url, body) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
  }

  return data;
}

async function prepareTestData() {
  console.log('🧪 开始准备 E2E 测试数据\n');

  let projectId;
  let sessionFileId;
  let version1Id;
  let version2Id;

  try {
    // 1. 创建测试工程
    console.log('📝 步骤 1: 创建测试工程');
    const createResult = await request('POST', `${API_BASE}/projects`, {
      projectName: 'E2E Test Project',
      description: 'Project for E2E testing',
      engineVersion: '1.2.0',
      engineVersionMin: '1.0.0',
      author: 'E2E Tester',
      tags: ['e2e', 'test'],
    });
    projectId = createResult.data.id;
    console.log(`✅ 项目创建成功: ${projectId}\n`);

    // 2. 创建 session 文件
    console.log('📝 步骤 2: 创建 session 文件');
    const createFileResult = await request('POST', `${API_BASE}/projects/${projectId}/files`, {
      fileType: 'session',
      fileName: 'test-session.yaml',
      fileContent: '',
    });
    sessionFileId = createFileResult.data.id;
    console.log(`✅ Session 文件创建成功: ${sessionFileId}\n`);

    // 3. 修改文件内容为版本1（包含1个phase）
    console.log('📝 步骤 3: 设置文件内容为版本1（1个phase）');
    const version1Content = `session:
  session_id: test_session
  session_name: Test Session
  phases:
    - phase_id: phase_1
      phase_name: Phase 1
      actions:
        - action_id: action_1_1
          action_type: ai_say
          config:
            message: "Hello from version 1"
`;
    
    await request('PUT', `${API_BASE}/projects/${projectId}/files/${sessionFileId}`, {
      fileContent: version1Content,
      yamlContent: version1Content,
    });
    console.log('✅ 文件内容更新为版本1\n');

    // 4. 发布版本1
    console.log('📝 步骤 4: 发布版本1');
    const publish1Result = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v1.0.0',
      releaseNote: 'Version 1 with 1 phase',
      publishedBy: 'E2E Tester',
    });
    version1Id = publish1Result.data.id;
    console.log(`✅ 版本1发布成功: ${version1Id}\n`);

    // 5. 修改文件内容为版本2（包含2个phase）
    console.log('📝 步骤 5: 设置文件内容为版本2（2个phases）');
    const version2Content = `session:
  session_id: test_session
  session_name: Test Session
  phases:
    - phase_id: phase_1
      phase_name: Phase 1
      actions:
        - action_id: action_1_1
          action_type: ai_say
          config:
            message: "Hello from version 2"
    - phase_id: phase_2
      phase_name: Phase 2
      actions:
        - action_id: action_2_1
          action_type: ai_say
          config:
            message: "This is phase 2 in version 2"
`;
    
    await request('PUT', `${API_BASE}/projects/${projectId}/files/${sessionFileId}`, {
      fileContent: version2Content,
      yamlContent: version2Content,
    });
    console.log('✅ 文件内容更新为版本2\n');

    // 6. 发布版本2
    console.log('📝 步骤 6: 发布版本2');
    const publish2Result = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v2.0.0',
      releaseNote: 'Version 2 with 2 phases',
      publishedBy: 'E2E Tester',
    });
    version2Id = publish2Result.data.id;
    console.log(`✅ 版本2发布成功: ${version2Id}\n`);

    // 7. 保存项目ID到文件供测试使用
    const testDataPath = path.join(__dirname, 'test-project-id.txt');
    fs.writeFileSync(testDataPath, projectId);
    console.log(`📄 项目ID已保存到: ${testDataPath}\n`);

    console.log('🎉 测试数据准备完成！');
    console.log('\n测试数据摘要:');
    console.log(`  项目ID: ${projectId}`);
    console.log(`  版本1 ID: ${version1Id} (v1.0.0, 1 phase)`);
    console.log(`  版本2 ID: ${version2Id} (v2.0.0, 2 phases)`);
    console.log(`  Session文件ID: ${sessionFileId}`);
    console.log('\n现在可以运行测试:');
    console.log(`  TEST_PROJECT_ID=${projectId} pnpm test:e2e`);

  } catch (error) {
    console.error('❌ 准备测试数据失败:', error);
    throw error;
  }
}

prepareTestData().catch((err) => {
  console.error('执行失败:', err);
  process.exit(1);
});
