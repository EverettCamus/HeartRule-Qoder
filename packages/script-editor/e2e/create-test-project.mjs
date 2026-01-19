#!/usr/bin/env node

/**
 * 创建 E2E 测试项目
 */

const API_BASE = 'http://localhost:8000/api';

async function createTestProject() {
  try {
    const response = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName: 'E2E Test Project',
        description: 'Automated test project for E2E testing',
        engineVersion: '1.0.0',
        engineVersionMin: '1.0.0',
        author: 'E2E Test',
        tags: ['test', 'e2e']
      }),
    });

    const data = await response.json();

    if (data.success) {
      console.log('✅ 测试项目创建成功');
      console.log('项目 ID:', data.data.id);
      console.log('项目名称:', data.data.projectName);
      console.log('\n请设置环境变量：');
      console.log(`$env:TEST_PROJECT_ID="${data.data.id}"`);
      return data.data.id;
    } else {
      console.error('❌ 创建失败:', data.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error.message);
    process.exit(1);
  }
}

createTestProject();
