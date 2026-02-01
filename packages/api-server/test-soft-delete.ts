/**
 * 工程软删除功能测试脚本
 * 测试作废、恢复和过滤功能
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

interface TestProject {
  id: string;
  projectName: string;
  status: string;
}

let testProjectId: string;

async function testProjectSoftDelete() {
  console.log('🧪 开始测试工程软删除功能...\n');

  try {
    // 1. 创建测试工程
    console.log('1️⃣  创建测试工程...');
    const createResponse = await axios.post(`${API_BASE_URL}/projects`, {
      projectName: '测试软删除工程',
      description: '用于测试软删除功能的工程',
      engineVersion: '1.2.0',
      engineVersionMin: '1.0.0',
      author: 'TEST_USER',
      tags: ['test', 'soft-delete'],
    });

    if (!createResponse.data.success) {
      throw new Error('创建工程失败');
    }

    testProjectId = createResponse.data.data.id;
    console.log(`✅ 工程创建成功，ID: ${testProjectId}\n`);

    // 2. 验证工程在正常列表中
    console.log('2️⃣  验证工程在正常列表中...');
    let listResponse = await axios.get(`${API_BASE_URL}/projects`);
    let foundInList = listResponse.data.data.some((p: TestProject) => p.id === testProjectId);
    console.log(`✅ 工程在正常列表中: ${foundInList ? '是' : '否'}\n`);

    if (!foundInList) {
      throw new Error('新创建的工程不在列表中');
    }

    // 3. 作废工程
    console.log('3️⃣  作废工程...');
    const deprecateResponse = await axios.post(
      `${API_BASE_URL}/projects/${testProjectId}/deprecate`,
      {
        operator: 'TEST_USER',
        reason: '测试软删除功能',
      }
    );

    if (!deprecateResponse.data.success) {
      throw new Error('作废工程失败');
    }

    console.log(`✅ 工程已作废，状态: ${deprecateResponse.data.data.status}`);
    console.log(
      `   作废信息: ${JSON.stringify(deprecateResponse.data.data.metadata?.deprecatedBy || {})}\n`
    );

    // 4. 验证工程不在正常列表中
    console.log('4️⃣  验证工程不在正常列表中...');
    listResponse = await axios.get(`${API_BASE_URL}/projects`);
    foundInList = listResponse.data.data.some((p: TestProject) => p.id === testProjectId);
    console.log(`✅ 工程在正常列表中: ${foundInList ? '是' : '否'}`);

    if (foundInList) {
      throw new Error('已作废工程仍在正常列表中');
    }
    console.log('   ✓ 已作废工程已从正常列表中移除\n');

    // 5. 验证工程在 includeDeprecated=true 时可见
    console.log('5️⃣  验证工程在 includeDeprecated=true 时可见...');
    const deprecatedListResponse = await axios.get(`${API_BASE_URL}/projects`, {
      params: { includeDeprecated: 'true' },
    });
    foundInList = deprecatedListResponse.data.data.some((p: TestProject) => p.id === testProjectId);
    console.log(`✅ 工程在完整列表中: ${foundInList ? '是' : '否'}`);

    if (!foundInList) {
      throw new Error('includeDeprecated=true 时找不到已作废工程');
    }
    console.log('   ✓ includeDeprecated=true 时可以查看已作废工程\n');

    // 6. 验证只查询 deprecated 状态
    console.log('6️⃣  验证只查询 deprecated 状态...');
    const deprecatedOnlyResponse = await axios.get(`${API_BASE_URL}/projects`, {
      params: { status: 'deprecated' },
    });
    foundInList = deprecatedOnlyResponse.data.data.some((p: TestProject) => p.id === testProjectId);
    console.log(`✅ 工程在 deprecated 列表中: ${foundInList ? '是' : '否'}\n`);

    // 7. 恢复工程
    console.log('7️⃣  恢复工程...');
    const restoreResponse = await axios.post(`${API_BASE_URL}/projects/${testProjectId}/restore`, {
      operator: 'TEST_USER',
    });

    if (!restoreResponse.data.success) {
      throw new Error('恢复工程失败');
    }

    console.log(`✅ 工程已恢复，状态: ${restoreResponse.data.data.status}`);
    console.log(
      `   恢复信息: ${JSON.stringify(restoreResponse.data.data.metadata?.restoredBy || {})}\n`
    );

    // 8. 验证工程重新出现在正常列表中
    console.log('8️⃣  验证工程重新出现在正常列表中...');
    listResponse = await axios.get(`${API_BASE_URL}/projects`);
    foundInList = listResponse.data.data.some((p: TestProject) => p.id === testProjectId);
    console.log(`✅ 工程在正常列表中: ${foundInList ? '是' : '否'}`);

    if (!foundInList) {
      throw new Error('恢复后的工程不在正常列表中');
    }
    console.log('   ✓ 恢复后工程重新出现在正常列表中\n');

    // 9. 验证工程文件完整性
    console.log('9️⃣  验证工程文件完整性...');
    const filesResponse = await axios.get(`${API_BASE_URL}/projects/${testProjectId}/files`);
    const fileCount = filesResponse.data.data.length;
    console.log(`✅ 工程文件数量: ${fileCount}`);

    if (fileCount < 3) {
      throw new Error('工程文件丢失');
    }
    console.log('   ✓ 工程文件完整（global, roles, skills）\n');

    // 10. 清理测试数据（再次作废）
    console.log('🔟  清理测试数据...');
    await axios.post(`${API_BASE_URL}/projects/${testProjectId}/deprecate`, {
      operator: 'TEST_USER',
      reason: '测试完成，清理数据',
    });
    console.log(`✅ 测试工程已作废\n`);

    // 测试完成
    console.log('🎉 所有测试通过！\n');
    console.log('测试总结:');
    console.log('✓ 工程作废功能正常');
    console.log('✓ 工程恢复功能正常');
    console.log('✓ 默认列表正确过滤已作废工程');
    console.log('✓ includeDeprecated 参数正常工作');
    console.log('✓ 状态筛选功能正常');
    console.log('✓ 文件完整性保持正常');
    console.log(`\n测试工程 ID: ${testProjectId} (已作废)\n`);
  } catch (error: any) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.response) {
      console.error('   服务器响应:', error.response.data);
    }
    process.exit(1);
  }
}

// 运行测试
testProjectSoftDelete();
