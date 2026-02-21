/**
 * E2E测试：验证 ai_say max_rounds=1 的完整行为
 * 期望：
 * - 第1轮：AI说话 → waiting_input，currentRound=1
 * - 第2轮：用户确认 → 推进到下一个action（ai_ask）
 */

import { v4 as uuidv4 } from 'uuid';
import { db, closeConnection } from './src/db/index.js';
import { sessions, messages } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';
import { eq } from 'drizzle-orm';

async function testAiSayMaxRounds1() {
  try {
    console.log('🧪 E2E测试：ai_say max_rounds=1 行为验证');
    console.log('='.repeat(60));

    const sessionManager = new SessionManager();
    const sessionId = uuidv4();

    // 1. 使用 hello-world 项目（已经修改为 max_rounds: 1）
    const _projectId = '4ba2d417-6cc7-4f23-bf47-6b207f741612';
    const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';

    // 2. 创建会话
    await db.insert(sessions).values({
      id: sessionId,
      userId: 'test-user',
      scriptId: scriptId,
      status: 'active',
      executionStatus: 'running',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log('✅ 会话已创建:', sessionId);

    // 3. 初始化会话（第1轮：ai_say 第1次）
    console.log('\n📊 【第1轮】初始化会话 - AI应该说话并等待确认');
    const result1 = await sessionManager.initializeSession(sessionId);
    console.log(
      '   AI消息:',
      result1.aiMessage ? result1.aiMessage.substring(0, 50) + '...' : 'null'
    );
    console.log('   状态:', result1.executionStatus);
    console.log('   当前Action:', result1.position?.actionId);
    console.log('   当前轮次:', result1.position?.currentRound);
    console.log('   最大轮次:', result1.position?.maxRounds);

    // 验证第1轮
    if (result1.executionStatus !== 'waiting_input') {
      throw new Error(`❌ 第1轮应该返回 waiting_input，实际: ${result1.executionStatus}`);
    }
    if (result1.position?.actionId !== 'say_welcome') {
      throw new Error(`❌ 第1轮应该在 say_welcome action，实际: ${result1.position?.actionId}`);
    }
    if (!result1.aiMessage) {
      throw new Error('❌ 第1轮应该有 AI 消息');
    }
    if (result1.position?.currentRound !== 1) {
      throw new Error(`❌ 第1轮 currentRound 应该是 1，实际: ${result1.position?.currentRound}`);
    }
    if (result1.position?.maxRounds !== 1) {
      throw new Error(`❌ maxRounds 应该是 1，实际: ${result1.position?.maxRounds}`);
    }

    console.log('✅ 第1轮验证通过');

    // 4. 查询数据库中的消息
    const messagesAfterRound1 = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (fields, { asc }) => [asc(fields.timestamp)],
    });
    console.log('\n📋 数据库消息（第1轮后）:', messagesAfterRound1.length);
    messagesAfterRound1.forEach((m, i) => {
      console.log(
        `   [${i + 1}] ${m.role}: ${m.content.substring(0, 40)}... (actionId: ${m.actionId})`
      );
    });

    // 5. 第2轮：用户确认（空输入或任意输入）
    console.log('\n📊 【第2轮】用户确认 - 应该推进到 ai_ask');
    const result2 = await sessionManager.processUserInput(sessionId, '好的');
    console.log(
      '   AI消息:',
      result2.aiMessage ? result2.aiMessage.substring(0, 50) + '...' : 'null'
    );
    console.log('   状态:', result2.executionStatus);
    console.log('   当前Action:', result2.position?.actionId);
    console.log('   当前轮次:', result2.position?.currentRound);
    console.log('   最大轮次:', result2.position?.maxRounds);

    // 验证第2轮 - 关键！应该推进到 ai_ask
    if (result2.position?.actionId !== 'ask_status') {
      throw new Error(`❌ 第2轮应该推进到 ask_status，实际: ${result2.position?.actionId}`);
    }
    if (result2.executionStatus !== 'waiting_input') {
      throw new Error(`❌ 第2轮应该返回 waiting_input，实际: ${result2.executionStatus}`);
    }
    if (!result2.aiMessage) {
      throw new Error('❌ 第2轮应该有 AI 消息（来自 ai_ask）');
    }

    console.log('✅ 第2轮验证通过');

    // 6. 查询数据库中的消息
    const messagesAfterRound2 = await db.query.messages.findMany({
      where: eq(messages.sessionId, sessionId),
      orderBy: (fields, { asc }) => [asc(fields.timestamp)],
    });
    console.log('\n📋 数据库消息（第2轮后）:', messagesAfterRound2.length);
    messagesAfterRound2.forEach((m, i) => {
      console.log(
        `   [${i + 1}] ${m.role}: ${m.content.substring(0, 40)}... (actionId: ${m.actionId})`
      );
    });

    // 验证消息数量
    const sayWelcomeMessages = messagesAfterRound2.filter(
      (m) => m.actionId === 'say_welcome' && m.role === 'assistant'
    );
    const askStatusMessages = messagesAfterRound2.filter(
      (m) => m.actionId === 'ask_status' && m.role === 'assistant'
    );

    console.log(`\n🔍 say_welcome 的 AI 消息数量: ${sayWelcomeMessages.length}`);
    console.log(`🔍 ask_status 的 AI 消息数量: ${askStatusMessages.length}`);

    if (sayWelcomeMessages.length !== 1) {
      throw new Error(`❌ 应该有1条 say_welcome 的 AI 消息，实际: ${sayWelcomeMessages.length}`);
    }
    if (askStatusMessages.length !== 1) {
      throw new Error(`❌ 应该有1条 ask_status 的 AI 消息，实际: ${askStatusMessages.length}`);
    }

    console.log('\n✅✅✅ 所有测试通过！');
    console.log('   - 第1轮：AI说话（say_welcome），waiting_input，currentRound=1');
    console.log('   - 第2轮：用户确认，推进到 ai_ask，返回 ai_ask 的消息');
    console.log('   - 数据库：1条 say_welcome 消息 + 1条 ask_status 消息');
  } catch (error) {
    console.error('\n❌❌❌ 测试失败:', error);
    console.error('Stack:', (error as Error).stack);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

testAiSayMaxRounds1();
