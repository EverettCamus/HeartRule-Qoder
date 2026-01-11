/**
 * 测试会话初始化返回的消息
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, closeConnection } from './src/db/index.js';
import { sessions, scripts } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';

const SCRIPT_UUID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = 'test-user-init';

async function testInitMessage() {
  try {
    console.log('测试会话初始化消息');
    console.log('='.repeat(60));

    // 创建会话
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

    // 初始化会话
    const sessionManager = new SessionManager();
    const result = await sessionManager.initializeSession(sessionId);

    console.log('\n📊 初始化结果:');
    console.log('   AI消息:', result.aiMessage);
    console.log('   状态:', result.executionStatus);

    // 验证
    if (result.aiMessage?.includes('名字') || result.aiMessage?.includes('称呼')) {
      console.log('\n✅ 正确：初始消息询问名字');
    } else if (result.aiMessage?.includes('年龄') || result.aiMessage?.includes('多大')) {
      console.log('\n❌ 错误：初始消息询问年龄（跳过了第一个 Action）');
    } else {
      console.log('\n⚠️  未知消息');
    }

    // 检查数据库状态
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    console.log('\n💾 数据库状态:');
    console.log('   position:', session?.position);
    console.log(
      '   metadata.actionState:',
      session?.metadata ? (session.metadata as any).actionState : null
    );
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await closeConnection();
  }
}

testInitMessage();
