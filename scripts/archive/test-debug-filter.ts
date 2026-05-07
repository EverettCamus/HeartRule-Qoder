/**
 * 测试调试信息过滤器和显示功能
 * 
 * 此脚本用于验证：
 * 1. debugInfo 数据是否正常返回
 * 2. 调试气泡是否正确创建
 * 3. 过滤器默认配置是否正确
 */

import axios from 'axios';

const API_BASE_URL = 'http://localhost:3002/api';

interface DebugSession {
  sessionId: string;
  status: string;
  aiMessage: string;
  debugInfo?: any;
}

interface MessageResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  debugInfo?: any;
  variables?: any;
  position?: any;
}

async function testDebugInfoFlow() {
  console.log('=== 测试调试信息流 ===\n');

  try {
    // 1. 创建调试会话
    console.log('步骤 1: 创建调试会话...');
    const createResponse = await axios.post<DebugSession>(`${API_BASE_URL}/debug/sessions`, {
      userId: 'test-user-debug-filter',
      scriptId: 'test_ai_say_basic', // 使用包含 ai_say 的测试脚本
      initialVariables: {}
    });

    const sessionId = createResponse.data.sessionId;
    console.log(`✅ 会话创建成功: ${sessionId}`);
    console.log('初始 debugInfo:', createResponse.data.debugInfo ? '存在' : '不存在');
    
    if (createResponse.data.debugInfo) {
      console.log('  - Prompt:', createResponse.data.debugInfo.prompt ? '有' : '无');
      console.log('  - Response:', createResponse.data.debugInfo.response ? '有' : '无');
      console.log('  - Model:', createResponse.data.debugInfo.model || 'N/A');
      console.log('  - Tokens:', createResponse.data.debugInfo.tokensUsed || 0);
    }

    // 2. 发送消息以触发更多 debugInfo
    console.log('\n步骤 2: 发送用户消息...');
    const messageResponse = await axios.post<MessageResponse>(
      `${API_BASE_URL}/debug/sessions/${sessionId}/messages`,
      { content: '我想了解更多' }
    );

    console.log('✅ 消息发送成功');
    console.log('AI 响应:', messageResponse.data.aiMessage ? '有' : '无');
    console.log('debugInfo:', messageResponse.data.debugInfo ? '存在' : '不存在');
    
    if (messageResponse.data.debugInfo) {
      console.log('  - Prompt:', messageResponse.data.debugInfo.prompt ? '有' : '无');
      console.log('  - Response:', messageResponse.data.debugInfo.response ? '有' : '无');
      console.log('  - Model:', messageResponse.data.debugInfo.model || 'N/A');
      console.log('  - Tokens:', messageResponse.data.debugInfo.tokensUsed || 0);
    }

    console.log('Variables:', messageResponse.data.variables ? '存在' : '不存在');
    console.log('Position:', messageResponse.data.position ? '存在' : '不存在');

    // 3. 获取会话详情
    console.log('\n步骤 3: 获取会话详情...');
    const sessionDetail = await axios.get(`${API_BASE_URL}/debug/sessions/${sessionId}`);
    console.log('✅ 会话详情获取成功');
    console.log('Position:', sessionDetail.data.position ? '存在' : '不存在');

    // 4. 获取消息历史
    console.log('\n步骤 4: 获取消息历史...');
    const messages = await axios.get(`${API_BASE_URL}/debug/sessions/${sessionId}/messages`);
    console.log(`✅ 消息历史获取成功: ${messages.data.messages.length} 条消息`);

    console.log('\n=== 测试总结 ===');
    console.log('✅ 所有 API 调用成功');
    console.log('\n📝 前端检查清单：');
    console.log('1. 打开浏览器控制台，查找 [DebugChat] 日志');
    console.log('2. 检查 "Loaded debug filter:" 日志，确认所有选项为 true');
    console.log('3. 查看是否有气泡被过滤的警告信息');
    console.log('4. 在调试面板中应该能看到：');
    console.log('   - 🧭 位置信息气泡');
    console.log('   - 💡 LLM 提示词气泡');
    console.log('   - 🤖 LLM 响应气泡');
    console.log('   - 📊 变量状态气泡（如有变量更新）');
    console.log('\n💡 如果看不到气泡，请：');
    console.log('   - 点击调试面板右上角的设置图标（⚙️）');
    console.log('   - 检查各项开关是否都已打开');
    console.log('   - 点击"重置默认"按钮');
    console.log('   - 或在浏览器控制台执行: localStorage.removeItem("debug-output-filter")');

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

// 运行测试
testDebugInfoFlow().catch(console.error);
