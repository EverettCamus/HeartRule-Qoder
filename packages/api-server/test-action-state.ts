/**
 * 测试 Action 状态持久化
 */

import * as fs from 'fs';
import * as path from 'path';

import { ScriptExecutor, ExecutionStatus } from '@heartrule/core-engine';
import type { ExecutionState } from '@heartrule/core-engine';
import * as yaml from 'yaml';

async function testActionStatePersistence() {
  console.log('='.repeat(80));
  console.log('测试 Action 状态持久化');
  console.log('='.repeat(80));

  // 读取脚本
  const scriptPath = path.join(
    process.cwd(),
    '../../scripts/sessions/cbt_depression_assessment.yaml'
  );
  console.log('\n📄 读取脚本:', scriptPath);

  const scriptYaml = fs.readFileSync(scriptPath, 'utf-8');
  const scriptParsed = yaml.parse(scriptYaml);
  const scriptJson = JSON.stringify(scriptParsed);

  console.log('✅ 脚本加载成功');

  // 创建执行器
  const executor = new ScriptExecutor();
  const sessionId = 'test-001';

  // ==================== 第一轮：初始化 ====================
  console.log('\n' + '='.repeat(80));
  console.log('【第一轮】初始化会话');
  console.log('='.repeat(80));

  let state: ExecutionState = ScriptExecutor.createInitialState();
  state = await executor.executeSession(scriptJson, sessionId, state, null);

  console.log('\n📊 执行结果:');
  console.log('  状态:', state.status);
  console.log(
    '  位置: phase=%d, topic=%d, action=%d',
    state.currentPhaseIdx,
    state.currentTopicIdx,
    state.currentActionIdx
  );
  console.log('  AI消息:', state.lastAiMessage);
  console.log('  actionState:', state.metadata.actionState);

  // 检查第一轮是否正确
  if (!state.lastAiMessage?.includes('名字') && !state.lastAiMessage?.includes('称呼')) {
    console.log('\n⚠️  警告：第一轮应该询问名字，但 AI 消息不包含"名字"或"称呼"');
  }

  if (!state.metadata.actionState) {
    console.log('\n❌ 错误：metadata.actionState 未保存！');
    return;
  }

  console.log('\n✅ actionState 已保存:', JSON.stringify(state.metadata.actionState, null, 2));

  // 模拟数据库存储
  const dbRecord = {
    position: {
      phaseIndex: state.currentPhaseIdx,
      topicIndex: state.currentTopicIdx,
      actionIndex: state.currentActionIdx,
    },
    variables: state.variables,
    metadata: state.metadata,
    executionStatus: state.status,
  };

  // ==================== 第二轮：用户回复名字 ====================
  console.log('\n' + '='.repeat(80));
  console.log('【第二轮】用户回复名字');
  console.log('='.repeat(80));

  // 从数据库恢复
  const restoredState: ExecutionState = {
    status: dbRecord.executionStatus as ExecutionStatus,
    currentPhaseIdx: dbRecord.position.phaseIndex,
    currentTopicIdx: dbRecord.position.topicIndex,
    currentActionIdx: dbRecord.position.actionIndex,
    currentAction: null, // 重要：设为 null，测试是否能从 metadata 恢复
    variables: dbRecord.variables,
    conversationHistory: [],
    metadata: dbRecord.metadata,
    lastAiMessage: null,
  };

  console.log('\n🔄 恢复的状态:');
  console.log(
    '  位置: phase=%d, topic=%d, action=%d',
    restoredState.currentPhaseIdx,
    restoredState.currentTopicIdx,
    restoredState.currentActionIdx
  );
  console.log('  metadata.actionState:', restoredState.metadata.actionState);

  const userInput = '我叫 LEO';
  console.log('\n👤 用户输入:', userInput);

  // 执行第二轮
  state = await executor.executeSession(scriptJson, sessionId, restoredState, userInput);

  console.log('\n📊 执行结果:');
  console.log('  状态:', state.status);
  console.log(
    '  位置: phase=%d, topic=%d, action=%d',
    state.currentPhaseIdx,
    state.currentTopicIdx,
    state.currentActionIdx
  );
  console.log('  AI消息:', state.lastAiMessage);
  console.log('  变量:', state.variables);
  console.log('  actionState:', state.metadata.actionState);

  // ==================== 验证结果 ====================
  console.log('\n' + '='.repeat(80));
  console.log('验证结果');
  console.log('='.repeat(80));

  let success = true;

  // 检查 1: Action 索引应该增加
  if (state.currentActionIdx === 1) {
    console.log('✅ Action 索引正确：从 0 变为 1');
  } else {
    console.log('❌ Action 索引错误：应该是 1，实际是', state.currentActionIdx);
    success = false;
  }

  // 检查 2: 变量应该被提取
  if (state.variables.user_name) {
    console.log('✅ 变量提取成功: user_name =', state.variables.user_name);
  } else {
    console.log('❌ 变量提取失败：user_name 未设置');
    success = false;
  }

  // 检查 3: AI 消息应该询问年龄
  if (state.lastAiMessage) {
    if (state.lastAiMessage.includes('年龄') || state.lastAiMessage.includes('多大')) {
      console.log('✅ AI 消息正确：询问年龄');
      console.log('   消息内容:', state.lastAiMessage);
    } else if (state.lastAiMessage.includes('名字') || state.lastAiMessage.includes('称呼')) {
      console.log('❌ AI 消息错误：重复询问名字（这就是 Bug！）');
      console.log('   消息内容:', state.lastAiMessage);
      success = false;
    } else {
      console.log('⚠️  AI 消息未知:', state.lastAiMessage);
    }
  }

  console.log('\n' + '='.repeat(80));
  if (success) {
    console.log('🎉 测试通过：Action 状态持久化正常工作！');
  } else {
    console.log('💥 测试失败：存在问题需要修复');
  }
  console.log('='.repeat(80));
}

// 运行测试
testActionStatePersistence().catch((err) => {
  console.error('❌ 测试执行出错:', err);
  process.exit(1);
});
