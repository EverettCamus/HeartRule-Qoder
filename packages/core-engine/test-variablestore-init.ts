/**
 * 测试 variableStore 初始化修复
 * 验证新会话是否正确初始化 variableStore
 */

import { ScriptExecutor, ExecutionStatus } from './src/engines/script-execution/script-executor.js';

console.log('🧪 Testing variableStore initialization fix...\n');

// 测试 1: createInitialState 应该初始化 variableStore
console.log('Test 1: createInitialState should initialize variableStore');
const initialState = ScriptExecutor.createInitialState();

console.log('✅ Initial state created');
console.log('📊 Checking variableStore...');

if (!initialState.variableStore) {
  console.error('❌ FAIL: variableStore is undefined!');
  process.exit(1);
}

console.log('✅ variableStore exists');

// 验证结构
const requiredKeys = ['global', 'session', 'phase', 'topic'];
for (const key of requiredKeys) {
  if (!(key in initialState.variableStore)) {
    console.error(`❌ FAIL: variableStore.${key} is missing!`);
    process.exit(1);
  }
  console.log(`  ✅ variableStore.${key} exists`);
}

console.log('\n📋 variableStore structure:');
console.log(JSON.stringify(initialState.variableStore, null, 2));

// 测试 2: 验证类型
console.log('\nTest 2: Verify variableStore types');

if (typeof initialState.variableStore.global !== 'object') {
  console.error('❌ FAIL: variableStore.global should be an object');
  process.exit(1);
}
console.log('  ✅ global is object');

if (typeof initialState.variableStore.session !== 'object') {
  console.error('❌ FAIL: variableStore.session should be an object');
  process.exit(1);
}
console.log('  ✅ session is object');

if (typeof initialState.variableStore.phase !== 'object') {
  console.error('❌ FAIL: variableStore.phase should be an object');
  process.exit(1);
}
console.log('  ✅ phase is object');

if (typeof initialState.variableStore.topic !== 'object') {
  console.error('❌ FAIL: variableStore.topic should be an object');
  process.exit(1);
}
console.log('  ✅ topic is object');

// 测试 3: 验证初始为空
console.log('\nTest 3: Verify initial state is empty');

if (Object.keys(initialState.variableStore.global).length !== 0) {
  console.error('❌ FAIL: global should be empty initially');
  process.exit(1);
}
console.log('  ✅ global is empty');

if (Object.keys(initialState.variableStore.session).length !== 0) {
  console.error('❌ FAIL: session should be empty initially');
  process.exit(1);
}
console.log('  ✅ session is empty');

if (Object.keys(initialState.variableStore.phase).length !== 0) {
  console.error('❌ FAIL: phase should be empty initially');
  process.exit(1);
}
console.log('  ✅ phase is empty');

if (Object.keys(initialState.variableStore.topic).length !== 0) {
  console.error('❌ FAIL: topic should be empty initially');
  process.exit(1);
}
console.log('  ✅ topic is empty');

// 测试 4: 验证其他字段
console.log('\nTest 4: Verify other initial state fields');

if (initialState.status !== ExecutionStatus.RUNNING) {
  console.error('❌ FAIL: status should be RUNNING');
  process.exit(1);
}
console.log('  ✅ status is RUNNING');

if (initialState.currentPhaseIdx !== 0) {
  console.error('❌ FAIL: currentPhaseIdx should be 0');
  process.exit(1);
}
console.log('  ✅ currentPhaseIdx is 0');

if (Object.keys(initialState.variables).length !== 0) {
  console.error('❌ FAIL: variables should be empty initially');
  process.exit(1);
}
console.log('  ✅ variables is empty (backward compatibility)');

console.log('\n🎉 All tests passed!');
console.log('✅ variableStore initialization fix is working correctly.');
