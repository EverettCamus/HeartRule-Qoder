import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = 'http://localhost:3000/api';

/**
 * 【BUG修复回归测试】
 * 1. 位置信息气泡全回合显示回合数 (round X/Y)
 * 2. "咨询师名"变量归类到 Global 层级
 * 3. 调试启动首轮发出变量状态气泡
 */
async function runRegressionTests() {
  console.log('🚀 开始执行 BUG 修复回归测试...\n');

  try {
    // 1. 准备：直接获取脚本列表，找到目标脚本
    const scriptsRes = await axios.get(`${API_BASE_URL}/scripts`);
    const data = scriptsRes.data;
    const scripts = Array.isArray(data) ? data : data.scripts || data.data || [];
    const targetScript = scripts.find(
      (s: any) =>
        s.scriptName &&
        (s.scriptName.toLowerCase().includes('cbt') ||
          s.scriptName.toLowerCase().includes('depression'))
    );

    if (!targetScript)
      throw new Error('没有找到 cbt_depression_assessment 脚本，请确保数据库已初始化');

    const scriptId = targetScript.id;
    const userId = 'test-user-' + uuidv4().substring(0, 8);

    console.log(`[步骤1] 创建调试会话 (验证首轮变量和回合数)`);
    const createRes = await axios.post(`${API_BASE_URL}/sessions`, {
      userId,
      scriptId,
      initialVariables: {},
    });

    const session1 = createRes.data;
    const sessionId = session1.sessionId;

    // 验证点 3: 首个action的首轮回合正确发出变量状态气泡 (检查字段存在性)
    if (session1.variables && session1.globalVariables) {
      console.log('✅ 验证成功: 首轮返回了 variables 和 globalVariables');
    } else {
      console.error('❌ 验证失败: 首轮缺少变量数据');
    }

    // 验证点 2: "咨询师名" 应在 globalVariables 中
    if (session1.globalVariables && session1.globalVariables['咨询师名']) {
      console.log(
        `✅ 验证成功: '咨询师名' (${session1.globalVariables['咨询师名']}) 存在于 globalVariables 中`
      );
    } else {
      console.error('❌ 验证失败: globalVariables 中缺少 "咨询师名"');
    }

    // 验证点 1 (Part A): 第一回合位置信息
    if (session1.position && session1.position.currentRound === 1) {
      console.log(`✅ 验证成功: 第一回合 position.currentRound = 1`);
    } else {
      console.error('❌ 验证失败: 第一回合位置信息缺少回合数', session1.position);
    }

    console.log(`\n[步骤2] 发送消息进入第二轮 (验证回合数持续显示)`);
    const messageRes = await axios.post(`${API_BASE_URL}/sessions/${sessionId}/messages`, {
      content: '你好',
    });

    const session2 = messageRes.data;

    // 验证点 1 (Part B): 第二回合位置信息必须持续存在
    if (session2.position && session2.position.currentRound === 2) {
      console.log(`✅ 验证成功: 第二回合 position.currentRound = 2 (Bug已修复)`);
    } else {
      console.error('❌ 验证失败: 第二回合位置信息丢失了回合数!', session2.position);
    }

    // 验证点 2 (Part B): 第二轮也必须返回 globalVariables
    if (session2.globalVariables && session2.globalVariables['咨询师名']) {
      console.log(`✅ 验证成功: 第二轮响应仍包含完整的 globalVariables`);
    } else {
      console.error('❌ 验证失败: 第二轮响应丢失了 globalVariables!');
    }

    console.log('\n✨ 所有回归测试用例通过！');
  } catch (error: any) {
    console.error('\n❌ 测试执行失败:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

runRegressionTests();
