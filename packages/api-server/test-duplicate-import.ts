/**
 * 测试重复导入同名脚本（UPSERT功能）
 */

const API_BASE = 'http://localhost:8000/api';

const testScriptName = 'duplicate-test.yaml';
const testScriptV1 = `metadata:
  name: "重复导入测试 V1"
  version: "1.0"

session:
  session_id: "test_v1"
  session_name: "版本1"
  phases:
    - phase_id: "phase_1"
      phase_name: "阶段1"
      phase_goal: "测试V1"
      topics:
        - topic_id: "topic_1"
          topic_name: "话题1"
          topic_goal: "V1内容"
          actions:
            - action_type: "ai_say"
              action_id: "say_v1"
              config:
                content_template: "这是版本1的内容"
                say_goal: "测试"
                max_rounds: 1`;

const testScriptV2 = `metadata:
  name: "重复导入测试 V2"
  version: "2.0"

session:
  session_id: "test_v2"
  session_name: "版本2"
  phases:
    - phase_id: "phase_1"
      phase_name: "阶段1"
      phase_goal: "测试V2"
      topics:
        - topic_id: "topic_1"
          topic_name: "话题1"
          topic_goal: "V2内容"
          actions:
            - action_type: "ai_say"
              action_id: "say_v2"
              config:
                content_template: "这是版本2的更新内容"
                say_goal: "测试"
                max_rounds: 1`;

async function testDuplicateImport() {
  try {
    console.log('🧪 测试重复导入同名脚本（UPSERT功能）...\n');
    
    // 第一次导入
    console.log('📝 第一次导入: ' + testScriptName);
    const import1 = await fetch(`${API_BASE}/scripts/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yamlContent: testScriptV1,
        scriptName: testScriptName,
        description: 'First import',
      }),
    });
    
    const result1 = await import1.json();
    console.log('✅ 第一次导入结果:', result1);
    const scriptId1 = result1.data.scriptId;
    
    // 第二次导入（相同文件名，不同内容）
    console.log('\n📝 第二次导入: ' + testScriptName + ' (更新内容)');
    const import2 = await fetch(`${API_BASE}/scripts/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yamlContent: testScriptV2,
        scriptName: testScriptName,
        description: 'Second import (updated)',
      }),
    });
    
    const result2 = await import2.json();
    console.log('✅ 第二次导入结果:', result2);
    const scriptId2 = result2.data.scriptId;
    
    // 验证结果
    console.log('\n🔍 验证结果:');
    if (scriptId1 === scriptId2) {
      console.log('✅ scriptId 相同 (UPSERT成功):', scriptId1);
    } else {
      console.log('❌ scriptId 不同 (预期应该相同)');
      console.log('   第一次:', scriptId1);
      console.log('   第二次:', scriptId2);
    }
    
    // 获取最新脚本内容
    console.log('\n📖 获取最新脚本内容...');
    const getScript = await fetch(`${API_BASE}/scripts/${scriptId2}`);
    const scriptData = await getScript.json();
    
    if (scriptData.scriptContent.includes('版本2')) {
      console.log('✅ 内容已更新为版本2');
    } else {
      console.log('❌ 内容未更新');
    }
    
    console.log('\n🎉 UPSERT功能测试完成！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

testDuplicateImport();
