#!/usr/bin/env node

/**
 * 准备 E2E 测试数据
 * 1. 创建测试项目
 * 2. 创建 session 文件
 * 3. 发布版本 v1.0.0
 * 4. 修改内容
 * 5. 发布版本 v2.0.0
 */

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

  if (!data.success) {
    throw new Error(`API Error: ${data.error || 'Unknown error'}`);
  }

  return data.data;
}

async function prepareE2EData() {
  try {
    console.log('🚀 开始准备 E2E 测试数据...\n');

    // 1. 创建测试项目
    console.log('📝 步骤 1: 创建测试项目');
    const project = await request('POST', `${API_BASE}/projects`, {
      projectName: 'E2E Test Project',
      description: 'Automated test project for E2E testing',
      engineVersion: '1.0.0',
      engineVersionMin: '1.0.0',
      author: 'E2E Test',
      tags: ['test', 'e2e']
    });
    console.log(`✅ 项目创建成功，ID: ${project.id}\n`);

    const projectId = project.id;

    // 2. 创建 session 文件
    console.log('📝 步骤 2: 创建 session 文件');
    const sessionFile = await request('POST', `${API_BASE}/projects/${projectId}/files`, {
      fileType: 'session',
      fileName: 'test-session.yaml',
      fileContent: {
        session: {
          session_id: 'test_session',
          session_name: 'Test Session V1',
          phases: [
            {
              phase_id: 'phase_1',
              phase_name: 'Phase 1',
              topics: [
                {
                  topic_id: 'topic_1',
                  topic_name: 'Topic 1',
                  actions: [
                    {
                      action_id: 'action_1',
                      action_name: 'Action 1',
                      action_type: 'ai_say',
                      config: { content: 'Hello V1' }
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    });
    console.log(`✅ Session 文件创建成功，ID: ${sessionFile.id}\n`);

    // 3. 发布版本 v1.0.0
    console.log('📝 步骤 3: 发布版本 v1.0.0');
    const version1 = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v1.0.0',
      releaseNote: '初始版本',
      publishedBy: 'E2E Test'
    });
    console.log(`✅ 版本 v1.0.0 发布成功，ID: ${version1.id}\n`);

    // 4. 修改 session 文件内容
    console.log('📝 步骤 4: 修改 session 文件');
    await request('PUT', `${API_BASE}/projects/${projectId}/files/${sessionFile.id}`, {
      fileContent: {
        session: {
          session_id: 'test_session',
          session_name: 'Test Session V2',
          phases: [
            {
              phase_id: 'phase_1',
              phase_name: 'Phase 1 Modified',
              topics: [
                {
                  topic_id: 'topic_1',
                  topic_name: 'Topic 1',
                  actions: [
                    {
                      action_id: 'action_1',
                      action_name: 'Action 1',
                      action_type: 'ai_say',
                      config: { content: 'Hello V2' }
                    }
                  ]
                },
                {
                  topic_id: 'topic_2',
                  topic_name: 'Topic 2 New',
                  actions: []
                }
              ]
            },
            {
              phase_id: 'phase_2',
              phase_name: 'Phase 2 New',
              topics: []
            }
          ]
        }
      }
    });
    console.log('✅ Session 文件修改成功\n');

    // 5. 发布版本 v2.0.0
    console.log('📝 步骤 5: 发布版本 v2.0.0');
    const version2 = await request('POST', `${API_BASE}/projects/${projectId}/publish`, {
      versionNumber: 'v2.0.0',
      releaseNote: '增加了 Phase 2 和 Topic 2',
      publishedBy: 'E2E Test'
    });
    console.log(`✅ 版本 v2.0.0 发布成功，ID: ${version2.id}\n`);

    // 输出结果
    console.log('🎉 测试数据准备完成！\n');
    console.log('═══════════════════════════════════');
    console.log('测试项目信息：');
    console.log(`  项目 ID: ${projectId}`);
    console.log(`  项目名称: ${project.projectName}`);
    console.log(`  版本 1: v1.0.0 (${version1.id})`);
    console.log(`  版本 2: v2.0.0 (${version2.id})`);
    console.log('═══════════════════════════════════\n');
    console.log('请设置环境变量并运行测试：');
    console.log(`$env:TEST_PROJECT_ID="${projectId}"`);
    console.log('pnpm test:e2e\n');

  } catch (error) {
    console.error('❌ 准备失败:', error.message);
    process.exit(1);
  }
}

prepareE2EData();
