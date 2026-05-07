/**
 * 测试模板方案API
 * 
 * 测试 GET /api/projects/:projectId/template-schemes
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3002/api';

async function testTemplateSchemes() {
  try {
    console.log('=== 测试模板方案API ===\n');

    // 1. 获取所有工程列表
    console.log('1. 获取工程列表...');
    const projectsRes = await axios.get(`${API_BASE_URL}/projects`);
    
    if (!projectsRes.data.success || projectsRes.data.data.length === 0) {
      console.log('❌ 没有找到工程');
      return;
    }

    const firstProject = projectsRes.data.data[0];
    console.log(`✅ 找到工程: ${firstProject.projectName} (ID: ${firstProject.id})\n`);

    // 2. 获取模板方案列表
    console.log('2. 获取模板方案列表...');
    const schemesRes = await axios.get(`${API_BASE_URL}/projects/${firstProject.id}/template-schemes`);
    
    if (!schemesRes.data.success) {
      console.log(`❌ 获取失败: ${schemesRes.data.error}`);
      return;
    }

    console.log('✅ 成功获取模板方案列表\n');
    console.log('返回的方案：');
    console.log(JSON.stringify(schemesRes.data.data.schemes, null, 2));

    // 3. 验证返回格式
    console.log('\n3. 验证返回格式...');
    const schemes = schemesRes.data.data.schemes;
    
    let hasDefault = false;
    let customCount = 0;

    for (const scheme of schemes) {
      if (!scheme.name || typeof scheme.description !== 'string' || typeof scheme.isDefault !== 'boolean') {
        console.log(`❌ 方案格式错误: ${JSON.stringify(scheme)}`);
        return;
      }

      if (scheme.isDefault) {
        hasDefault = true;
      } else {
        customCount++;
      }
    }

    console.log(`✅ 找到 default 方案: ${hasDefault}`);
    console.log(`✅ 找到 ${customCount} 个自定义方案`);

    console.log('\n🎉 所有测试通过！');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

testTemplateSchemes();
