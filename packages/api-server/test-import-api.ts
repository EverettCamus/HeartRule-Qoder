/**
 * 测试导入脚本 API接口
 */

// 使用立即执行函数避免全局变量冲突
(async function() {
  const API_BASE = 'http://localhost:8000/api';

// 更完整的测试脚本内容（符合引擎要求的格式）
const testScriptContent = `metadata:
  name: "调试测试脚本"
  version: "1.0"
  author: "Debug User"
  description: "用于测试调试功能的会话脚本"

session:
  session_id: "debug_test_session"
  session_name: "调试测试会话"
  
  phases:
    - phase_id: "phase_1_welcome"
      phase_name: "欢迎阶段"
      phase_goal: "欢迎用户并收集基本信息"
      
      topics:
        - topic_id: "topic_1_1_greeting"
          topic_name: "问候"
          topic_goal: "向用户问好"
          
          actions:
            - action_type: "ai_say"
              action_id: "say_hello"
              config:
                content_template: |
                  你好！欢迎来到心理咨询室。我是你的AI咨询助手。
                say_goal: "欢迎用户"
                require_acknowledgment: false
                max_rounds: 1
            
            - action_type: "ai_ask"
              action_id: "ask_help"
              config:
                target_variable: "user_need"
                question_template: "请问有什么可以帮助你的吗？"
                extraction_prompt: "提取用户的主要需求"
                required: true
                max_rounds: 3`;

async function testImportApi() {
  try {
    console.log('🧪 测试脚本导入API接口...\n');
    
    // 步骤1: 测试导入脚本
    console.log('步骤1: 调用 POST /api/scripts/import');
    const importResponse = await fetch(`${API_BASE}/scripts/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        yamlContent: testScriptContent,
        scriptName: 'test_script_' + Date.now() + '.yaml',
        description: 'Test script for debugging',
      }),
    });

    if (!importResponse.ok) {
      throw new Error(`导入失败: ${importResponse.status} ${importResponse.statusText}`);
    }

    const importResult = await importResponse.json();
    console.log('✅ 导入成功:', importResult);
    
    if (!importResult.success || !importResult.data?.scriptId) {
      throw new Error('导入结果格式不正确');
    }

    const scriptId = importResult.data.scriptId;
    console.log(`\n📝 获得 scriptId: ${scriptId}\n`);

    // 步骤2: 测试创建调试会话
    console.log('步骤2: 调用 POST /api/sessions (创建调试会话)');
    const sessionResponse = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'test_debug_user',
        scriptId: scriptId,
        initialVariables: {},
      }),
    });

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      throw new Error(`创建会话失败: ${sessionResponse.status} ${sessionResponse.statusText}\n${errorText}`);
    }

    const sessionResult = await sessionResponse.json();
    console.log('✅ 会话创建成功:', sessionResult);
    
    console.log('\n🎉 完整调试流程测试成功！');
    console.log('\n测试结果总结:');
    console.log(`  - scriptId: ${scriptId}`);
    console.log(`  - sessionId: ${sessionResult.sessionId}`);
    console.log(`  - status: ${sessionResult.status}`);
    console.log(`  - aiMessage: ${sessionResult.aiMessage || '(无初始消息)'}`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

// 执行测试
testImportApi();
})();
