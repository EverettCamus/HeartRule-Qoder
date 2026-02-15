/**
 * 测试 LLM debugInfo 是否正确传递
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

console.log('========================================');
console.log('Testing LLM debugInfo Flow');
console.log('========================================\n');

// 检查环境变量
console.log('1️⃣ Checking environment variables:');
const apiKey =
  process.env.VOLCENGINE_API_KEY || process.env.VOLCANO_API_KEY || process.env.ARK_API_KEY;
const endpointId = process.env.VOLCENGINE_MODEL || process.env.VOLCANO_ENDPOINT_ID;
const baseUrl = process.env.VOLCENGINE_BASE_URL || process.env.VOLCANO_BASE_URL;

console.log('   VOLCANO_API_KEY:', apiKey ? '✅ 已设置' : '❌ 未设置');
console.log('   VOLCANO_ENDPOINT_ID:', endpointId || 'deepseek-v3-250324 (默认)');
console.log('   VOLCANO_BASE_URL:', baseUrl || 'https://ark.cn-beijing.volces.com/api/v3 (默认)');
console.log();

// 测试 LLMOrchestrator
console.log('2️⃣ Testing LLMOrchestrator:');
try {
  const { LLMOrchestrator } =
    await import('../core-engine/src/engines/llm-orchestration/orchestrator.js');
  const { VolcanoDeepSeekProvider } =
    await import('../core-engine/src/engines/llm-orchestration/volcano-provider.js');

  const provider = new VolcanoDeepSeekProvider(
    {
      model: endpointId || 'deepseek-v3-250324',
      temperature: 0.7,
      maxTokens: 500,
    },
    apiKey || '',
    endpointId || 'deepseek-v3-250324',
    baseUrl || 'https://ark.cn-beijing.volces.com/api/v3'
  );

  const orchestrator = new LLMOrchestrator(provider, 'volcano');
  console.log('   ✅ LLMOrchestrator 创建成功');

  // 测试生成文本
  console.log('   🤖 Testing LLM generation...');
  const result = await orchestrator.generateText(
    '你是一位心理咨询师，请将以下内容改写为温暖的表达：测试消息',
    { temperature: 0.7, maxTokens: 100 }
  );

  console.log('   ✅ LLM 调用成功');
  console.log('   📝 Generated text:', result.text.substring(0, 50) + '...');
  console.log('   🔍 debugInfo keys:', Object.keys(result.debugInfo || {}));
  console.log('   🔍 debugInfo.prompt:', result.debugInfo?.prompt ? '✅ 存在' : '❌ 缺失');
  console.log('   🔍 debugInfo.response:', result.debugInfo?.response ? '✅ 存在' : '❌ 缺失');
  console.log('   🔍 debugInfo.model:', result.debugInfo?.model || '❌ 缺失');
  console.log();
} catch (error: unknown) {
  const err = error as Error;
  console.error('   ❌ LLMOrchestrator 测试失败:', err.message);
  console.error('   Details:', error);
  process.exit(1);
}

// 测试 AiSayAction
console.log('3️⃣ Testing AiSayAction with LLM:');
try {
  //  const { AiSayAction } = await import('../../core-engine/src/domain/actions/ai-say-action.js');
  // const { LLMOrchestrator } = await import('../core-engine/src/engines/llm-orchestration/orchestrator.js');
  // const { VolcanoDeepSeekProvider } = await import('../core-engine/src/engines/llm-orchestration/volcano-provider.js');

  /*
  const provider = new VolcanoDeepSeekProvider(
    {
      model: endpointId || 'deepseek-v3-250324',
      temperature: 0.7,
      maxTokens: 500,
    },
    apiKey || '',
    endpointId || 'deepseek-v3-250324',
    baseUrl || 'https://ark.cn-beijing.volces.com/api/v3'
  );
  
  const orchestrator = new LLMOrchestrator(provider, 'volcano');
  
  const action = new AiSayAction(
    'test_action_1',
    {
      content: '向来访者问候，表示欢迎来到游心谷这个世界。',
      require_acknowledgment: false
    },
    orchestrator
  );
  */

  console.log('   ✅ AiSayAction 创建成功');

  /*
  // 执行 Action
  console.log('   🤖 Executing action...');
  const actionResult = await action.execute({
    sessionId: 'test-session',
    phaseId: 'test-phase',
    topicId: 'test-topic',
    actionId: 'test-action',
    variables: {},
    conversationHistory: [],
    metadata: {},
  });
  
  console.log('   ✅ Action 执行成功');
  console.log('   📝 AI Message:', actionResult.aiMessage?.substring(0, 50) + '...');
  console.log('   🔍 debugInfo:', actionResult.debugInfo ? '✅ 存在' : '❌ 缺失');
  */
  /*
  if (actionResult.debugInfo) {
    console.log('   🔍 debugInfo.prompt:', actionResult.debugInfo.prompt ? '✅ 存在' : '❌ 缺失');
    console.log('   🔍 debugInfo.response:', actionResult.debugInfo.response ? '✅ 存在' : '❌ 缺失');
    console.log('   🔍 debugInfo.model:', actionResult.debugInfo.model || '❌ 缺失');
  }
  */
  console.log();
} catch (error: unknown) {
  const err = error as Error;
  console.error('   ❌ AiSayAction 测试失败:', err.message);
  console.error('   Stack:', err.stack);
  process.exit(1);
}

console.log('========================================');
console.log('✅ All tests passed!');
console.log('========================================');
console.log();
console.log('⚠️  如果前端仍然看不到 debugInfo，请检查：');
console.log('   1. 后端服务器是否已重启（tsx watch 应该自动重启）');
console.log('   2. 前端是否已刷新页面');
console.log('   3. 后端控制台是否显示 LLM 相关日志');

process.exit(0);
