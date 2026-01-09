/**
 * 完整的会话流程测试（模拟 Web 端）
 * 测试：创建会话 → 多轮对话 → 验证状态持久化
 */

import { db, closeConnection } from './src/db/index.js';
import { sessions, messages, scripts } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const SCRIPT_UUID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = 'test-user-001';

async function testFullFlow() {
  try {
    console.log('='.repeat(80));
    console.log('完整会话流程测试（模拟 Web 端）');
    console.log('='.repeat(80));

    // 1. 验证脚本存在
    console.log('\n【步骤 1】验证脚本');
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, SCRIPT_UUID),
    });

    if (!script) {
      console.error('❌ 脚本不存在！请先运行 import-script.ts');
      return;
    }

    console.log('✅ 脚本已加载:', script.scriptName);
    console.log('   脚本ID:', script.id);

    // 2. 创建会话
    console.log('\n' + '='.repeat(80));
    console.log('【步骤 2】创建会话');
    console.log('='.repeat(80));

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

    console.log('✅ 会话已创建');
    console.log('   会话ID:', sessionId);
    console.log('   用户ID:', USER_ID);
    console.log('   脚本ID:', SCRIPT_UUID);

    // 3. 初始化会话（获取第一条消息）
    console.log('\n' + '='.repeat(80));
    console.log('【步骤 3】初始化会话');
    console.log('='.repeat(80));

    const sessionManager = new SessionManager();
    let result = await sessionManager.initializeSession(sessionId);

    console.log('\n📊 初始化结果:');
    console.log('   状态:', result.executionStatus);
    console.log('   AI消息:', result.aiMessage);
    console.log('   变量:', result.variables);

    // 检查数据库中的 metadata
    let session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    console.log('\n💾 数据库状态:');
    console.log('   position:', session?.position);
    console.log('   metadata.actionState:', session?.metadata ? (session.metadata as any).actionState : 'null');

    if (!(session?.metadata as any)?.actionState) {
      console.log('\n❌ 警告：metadata.actionState 未保存！');
    }

    // 4. 第一轮对话：回复名字
    console.log('\n' + '='.repeat(80));
    console.log('【步骤 4】第一轮对话 - 回复名字');
    console.log('='.repeat(80));

    const userInput1 = '我叫 LEO';
    console.log('\n👤 用户输入:', userInput1);

    result = await sessionManager.processUserInput(sessionId, userInput1);

    console.log('\n📊 对话结果:');
    console.log('   状态:', result.executionStatus);
    console.log('   AI消息:', result.aiMessage);
    console.log('   变量:', result.variables);

    // 检查是否询问年龄
    if (result.aiMessage?.includes('年龄') || result.aiMessage?.includes('多大')) {
      console.log('\n✅ 正确：AI 询问年龄（进入下一个 Action）');
    } else if (result.aiMessage?.includes('名字') || result.aiMessage?.includes('称呼')) {
      console.log('\n❌ 错误：AI 重复询问名字（Bug 仍然存在！）');
    } else {
      console.log('\n⚠️  未知消息:', result.aiMessage);
    }

    // 5. 第二轮对话：回复年龄
    console.log('\n' + '='.repeat(80));
    console.log('【步骤 5】第二轮对话 - 回复年龄');
    console.log('='.repeat(80));

    const userInput2 = '我今年49岁';
    console.log('\n👤 用户输入:', userInput2);

    result = await sessionManager.processUserInput(sessionId, userInput2);

    console.log('\n📊 对话结果:');
    console.log('   状态:', result.executionStatus);
    console.log('   AI消息:', result.aiMessage);
    console.log('   变量:', result.variables);

    // 6. 查看最终数据库状态
    console.log('\n' + '='.repeat(80));
    console.log('【步骤 6】最终数据库状态');
    console.log('='.repeat(80));

    session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    console.log('\n💾 会话状态:');
    console.log('   position:', session?.position);
    console.log('   variables:', session?.variables);
    console.log('   executionStatus:', session?.executionStatus);
    console.log('   metadata.actionState:', session?.metadata ? (session.metadata as any).actionState : 'null');

    // 7. 查看消息历史
    const allMessages = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (messages, { asc }) => [asc(messages.timestamp)],
    });

    console.log('\n📝 消息历史 (共 ' + allMessages.length + ' 条):');
    allMessages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
    });

    // 8. 总结
    console.log('\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));

    let success = true;
    const finalPos = session?.position as any;

    // 检查 1: Phase 或 Topic 是否推进
    if (finalPos.phaseIndex > 0 || finalPos.topicIndex > 1 || finalPos.actionIndex >= 2) {
      console.log('✅ 执行位置推进正常:');
      console.log('   Phase:', finalPos.phaseIndex, ', Topic:', finalPos.topicIndex, ', Action:', finalPos.actionIndex);
    } else {
      console.log('❌ 执行位置异常:', finalPos);
      success = false;
    }

    const vars = session?.variables as any;
    if (vars.user_name && vars.user_age) {
      console.log('✅ 变量提取成功: user_name, user_age');
    } else {
      console.log('❌ 变量提取失败:', vars);
      success = false;
    }

    if (success) {
      console.log('\n🎉 测试通过！会话流程正常工作');
    } else {
      console.log('\n💥 测试失败！存在问题需要修复');
    }

    console.log('\n提示：使用此会话ID在 Web 界面继续对话:');
    console.log('   会话ID:', sessionId);

  } catch (error) {
    console.error('\n❌ 测试执行出错:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

// 运行测试
testFullFlow();
