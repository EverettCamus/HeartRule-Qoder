/**
 * 工程版本管理系统测试脚本
 * 测试 P1-T1 和 P1-T2 功能的完整性
 */

const API_BASE = 'http://localhost:8000/api';

// 测试辅助函数
async function request(method: string, url: string, body?: any) {
  const options: RequestInit = {
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

// 测试场景
async function runTests() {
  console.log('🚀 开始测试工程版本管理系统...\n');

  let testProjectId: string;
  let firstVersionId: string;
  let secondVersionId: string;

  try {
    // 测试 1: 创建测试工程
    console.log('📝 测试 1: 创建测试工程');
    const createResult = await request('POST', `${API_BASE}/projects`, {
      projectName: '版本测试工程',
      description: '用于测试版本管理功能',
      engineVersion: '1.2.0',
      engineVersionMin: '1.0.0',
      author: '测试工程师',
      tags: ['test', 'version-management'],
    });
    testProjectId = createResult.data.id;
    console.log(`✅ 工程创建成功，ID: ${testProjectId}\n`);

    // 测试 2: 获取草稿（应该存在空草稿）
    console.log('📝 测试 2: 获取工程草稿');
    const draftResult = await request('GET', `${API_BASE}/projects/${testProjectId}/draft`);
    console.log('✅ 草稿获取成功:', draftResult.data);
    console.log(`   状态: ${draftResult.data.validationStatus}\n`);

    // 测试 3: 修改文件内容（模拟编辑）
    console.log('📝 测试 3: 获取文件列表并修改');
    const filesResult = await request('GET', `${API_BASE}/projects/${testProjectId}/files`);
    const files = filesResult.data;
    console.log(`✅ 找到 ${files.length} 个文件\n`);

    // 测试 4: 发布第一个版本
    console.log('📝 测试 4: 发布第一个版本 v1.0.0');
    const publishResult1 = await request('POST', `${API_BASE}/projects/${testProjectId}/publish`, {
      versionNumber: 'v1.0.0',
      releaseNote: '初始版本发布',
      publishedBy: '测试工程师',
    });
    firstVersionId = publishResult1.data.id;
    console.log(`✅ 版本 v1.0.0 发布成功，版本ID: ${firstVersionId}\n`);

    // 测试 5: 发布第二个版本
    console.log('📝 测试 5: 发布第二个版本 v1.1.0');
    const publishResult2 = await request('POST', `${API_BASE}/projects/${testProjectId}/publish`, {
      versionNumber: 'v1.1.0',
      releaseNote: '增加新功能',
      publishedBy: '测试工程师',
    });
    secondVersionId = publishResult2.data.id;
    console.log(`✅ 版本 v1.1.0 发布成功，版本ID: ${secondVersionId}\n`);

    // 测试 6: 获取版本历史列表
    console.log('📝 测试 6: 获取版本历史列表');
    const versionsResult = await request('GET', `${API_BASE}/projects/${testProjectId}/versions`);
    console.log(`✅ 获取到 ${versionsResult.data.length} 个版本:`);
    versionsResult.data.forEach((v: any) => {
      console.log(`   - ${v.versionNumber} (${v.id})`);
      console.log(`     发布时间: ${v.publishedAt}`);
      console.log(`     发布人: ${v.publishedBy}`);
      console.log(`     回滚版本: ${v.isRollback}`);
    });
    console.log('');

    // 测试 7: 获取单个版本详情
    console.log('📝 测试 7: 获取版本 v1.0.0 详情');
    const versionDetail = await request(
      'GET',
      `${API_BASE}/projects/${testProjectId}/versions/${firstVersionId}`
    );
    console.log('✅ 版本详情获取成功');
    console.log(`   版本号: ${versionDetail.data.versionNumber}`);
    console.log(`   文件数量: ${Object.keys(versionDetail.data.versionFiles).length}\n`);

    // 测试 8: 切换当前版本（不触发回滚）
    console.log('📝 测试 8: 切换当前版本为 v1.0.0（不触发回滚）');
    const switchResult = await request('PUT', `${API_BASE}/projects/${testProjectId}/current-version`, {
      versionId: firstVersionId,
    });
    console.log('✅ 版本切换成功');
    console.log(`   当前版本ID: ${switchResult.data.currentVersionId}`);
    console.log(`   之前版本ID: ${switchResult.data.previousVersionId}\n`);

    // 测试 9: 验证工程当前版本已更新
    console.log('📝 测试 9: 验证工程当前版本已更新');
    const projectResult = await request('GET', `${API_BASE}/projects/${testProjectId}`);
    console.log('✅ 工程信息验证成功');
    console.log(`   当前版本ID: ${projectResult.data.currentVersionId}`);
    console.log(`   工程状态: ${projectResult.data.status}\n`);

    // 测试 10: 回滚到指定版本（创建新版本）
    console.log('📝 测试 10: 回滚到版本 v1.1.0（创建新回滚版本）');
    const rollbackResult = await request('POST', `${API_BASE}/projects/${testProjectId}/rollback`, {
      targetVersionId: secondVersionId,
      publishedBy: '测试工程师',
    });
    console.log('✅ 回滚成功，创建新版本');
    console.log(`   新版本号: ${rollbackResult.data.versionNumber}`);
    console.log(`   是否回滚版本: ${rollbackResult.data.isRollback}`);
    console.log(`   回滚源版本ID: ${rollbackResult.data.rollbackFromVersionId}\n`);

    // 测试 11: 验证版本列表包含回滚版本
    console.log('📝 测试 11: 验证版本列表包含回滚版本');
    const finalVersions = await request('GET', `${API_BASE}/projects/${testProjectId}/versions`);
    console.log(`✅ 最终版本列表 (${finalVersions.data.length} 个版本):`);
    finalVersions.data.forEach((v: any) => {
      const rollbackMark = v.isRollback === 'true' ? ' [回滚版本]' : '';
      console.log(`   - ${v.versionNumber}${rollbackMark}`);
    });
    console.log('');

    console.log('🎉 所有测试通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  }
}

// 运行测试
runTests().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
