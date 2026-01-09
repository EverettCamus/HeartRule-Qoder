/**
 * 完整测试欢迎流程
 */

import { db, closeConnection } from './src/db/index.js';
import { sessions } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';
import { v4 as uuidv4 } from 'uuid';

const SCRIPT_UUID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = 'test-welcome-flow';

async function testWelcomeFlow() {
  try {
    console.log('完整测试欢迎流程');
    console.log('='.repeat(60));

    // 1. 创建会话
    const sessionId = uuidv4();
    const now = new Date();

    await db.insert(sessions).values({
      id: sessionId,
      userId: USER_ID,
      scriptId: SCRIPT_UUID,
      status: 'active',
      executionStatus: 'running',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: {},
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    console.log('✅ 会话已创建:', sessionId);

    // 2. 初始化会话
    const sessionManager = new SessionManager();
    let result = await sessionManager.initializeSession(sessionId);

    console.log('\n📊 【初始化】');
    console.log('   AI消息:', result.aiMessage);
    console.log('   状态:', result.executionStatus);
    console.log('   是否等待输入:', result.executionStatus === 'waiting_input');

    // 3. 第一轮：用户回复欢迎
    console.log('\n👤 用户发送: "你好"');
    result = await sessionManager.processUserInput(sessionId, '你好');

    console.log('\n📊 【第一轮响应】');
    console.log('   AI消息:', result.aiMessage);
    console.log('   状态:', result.executionStatus);
    
    // 4. 第二轮：用户输入名字
    if (result.aiMessage?.includes('名字') || result.aiMessage?.includes('称呼')) {
      console.log('\n✅ 正确：进入询问名字环节');
      
      console.log('\n👤 用户发送: "我叫 LEO"');
      result = await sessionManager.processUserInput(sessionId, '我叫 LEO');

      console.log('\n📊 【第二轮响应】');
      console.log('   AI消息:', result.aiMessage);
      console.log('   提取的变量:', result.variables);
      
      if (result.aiMessage?.includes('年龄') || result.aiMessage?.includes('多大')) {
        console.log('\n✅ 正确：进入询问年龄环节');
      } else {
        console.log('\n❌ 错误：未进入询问年龄环节');
      }
    } else {
      console.log('\n❌ 错误：未进入询问名字环节');
      console.log('   实际消息:', result.aiMessage);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await closeConnection();
  }
}

testWelcomeFlow();
