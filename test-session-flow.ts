/**
 * 会话流程 CLI 测试
 * 用于测试 Action 状态持久化和多轮对话
 */

import * as fs from 'fs';

import * as yaml from 'yaml';

import { ScriptExecutor, ExecutionStatus } from '@heartrule/core-engine';
import type { ExecutionState } from '@heartrule/core-engine';

async function testSessionFlow() {
  console.log('='.repeat(60));
  console.log('开始测试会话流程');
  console.log('='.repeat(60));

  // 1. 读取脚本
  const scriptPath = './scripts/sessions/cbt_depression_assessment.yaml';
  const scriptYaml = fs.readFileSync(scriptPath, 'utf-8');
  const scriptParsed = yaml.parse(scriptYaml);
  const scriptJson = JSON.stringify(scriptParsed);

  console.log('\n✅ 脚本加载成功');

  // 2. 创建执行器
  const executor = new ScriptExecutor();
  const sessionId = 'test-session-001';

  // 3. 第一次执行：初始化会话
  console.log('\n' + '-'.repeat(60));
  console.log('第一次执行：初始化会话（无用户输入）');
  console.log('-'.repeat(60));

  let executionState: ExecutionState = ScriptExecutor.createInitialState();
  executionState = await executor.executeSession(scriptJson, sessionId, executionState, null);

  console.log('\n📊 执行状态:');
  console.log('  - status:', executionState.status);
  console.log('  - position:', {
    phase: executionState.currentPhaseIdx,
    topic: executionState.currentTopicIdx,
    action: executionState.currentActionIdx,
  });
  console.log('  - AI 消息:', executionState.lastAiMessage);
  console.log(
    '  - metadata.actionState:',
    JSON.stringify(executionState.metadata.actionState, null, 2)
  );

  // 4. 模拟保存到数据库（这里只是打印）
  console.log('\n💾 模拟保存到数据库...');
  const savedState = {
    position: {
      phaseIndex: executionState.currentPhaseIdx,
      topicIndex: executionState.currentTopicIdx,
      actionIndex: executionState.currentActionIdx,
    },
    variables: executionState.variables,
    metadata: executionState.metadata,
    executionStatus: executionState.status,
  };
  console.log('  保存的状态:', JSON.stringify(savedState, null, 2));

  // 5. 第二次执行：用户输入名字
  console.log('\n' + '-'.repeat(60));
  console.log('第二次执行：用户回复名字');
  console.log('-'.repeat(60));

  // 模拟从数据库恢复状态
  console.log('\n🔄 从数据库恢复状态...');
  const restoredState: ExecutionState = {
    status: savedState.executionStatus as ExecutionStatus,
    currentPhaseIdx: savedState.position.phaseIndex,
    currentTopicIdx: savedState.position.topicIndex,
    currentActionIdx: savedState.position.actionIndex,
    currentAction: null, // 会从 metadata 恢复
    variables: savedState.variables,
    conversationHistory: [],
    metadata: savedState.metadata,
    lastAiMessage: null,
  };

  console.log(
    '  恢复的 metadata.actionState:',
    JSON.stringify(restoredState.metadata.actionState, null, 2)
  );

  // 用户输入
  const userInput = '我叫 LEO';
  console.log('\n👤 用户输入:', userInput);

  // 执行
  executionState = await executor.executeSession(scriptJson, sessionId, restoredState, userInput);

  console.log('\n📊 执行状态:');
  console.log('  - status:', executionState.status);
  console.log('  - position:', {
    phase: executionState.currentPhaseIdx,
    topic: executionState.currentTopicIdx,
    action: executionState.currentActionIdx,
  });
  console.log('  - AI 消息:', executionState.lastAiMessage);
  console.log('  - 提取的变量:', executionState.variables);
  console.log(
    '  - metadata.actionState:',
    JSON.stringify(executionState.metadata.actionState, null, 2)
  );

  // 6. 检查是否正确进入下一个 Action
  if (executionState.currentActionIdx === 1) {
    console.log('\n✅ 测试成功：已经进入下一个 Action（询问年龄）');
  } else if (executionState.currentActionIdx === 0) {
    console.log('\n❌ 测试失败：仍然停留在第一个 Action（询问名字）');
    console.log('   这意味着 Action 状态没有正确恢复！');
  }

  // 7. 如果有 AI 消息，检查是否是询问年龄
  if (executionState.lastAiMessage) {
    if (
      executionState.lastAiMessage.includes('年龄') ||
      executionState.lastAiMessage.includes('多大')
    ) {
      console.log('✅ AI 消息正确：询问年龄');
    } else if (
      executionState.lastAiMessage.includes('名字') ||
      executionState.lastAiMessage.includes('称呼')
    ) {
      console.log('❌ AI 消息错误：仍在询问名字（重复问题）');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
}

// 运行测试
testSessionFlow().catch(console.error);
