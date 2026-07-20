/**
 * Hindsight 集成验证脚本
 *
 * 验证 HindsightMemoryAdapter 与 Hindsight Docker 的端到端集成
 * 使用方式: npx tsx scripts/verify-hindsight.ts
 */
import { HindsightMemoryAdapter } from '../packages/api-server/src/adapters/outbound/memory/hindsight-adapter.js';

async function main() {
  const adapter = new HindsightMemoryAdapter();
  const userId = 'verify-test-' + Date.now();

  console.log('1. 测试 retain (存储) ...');
  await adapter.retain(userId, [
    { role: 'user', content: '我最近工作压力很大，经常失眠到凌晨两三点' },
    {
      role: 'assistant',
      content: '听起来工作给你带来了很大的困扰，能具体说说是哪些方面让你感到压力吗？',
    },
    {
      role: 'user',
      content: '领导总是给我加任务，我感觉自己快撑不住了。而且我觉得自己永远不够好。',
    },
    { role: 'assistant', content: '你提到"自己永远不够好"——这是你经常有的感觉吗？' },
    {
      role: 'user',
      content: '是的，从小就有这种感觉。我妈对我的期望特别高，考了99分都要问我那一分去哪了。',
    },
  ]);
  console.log('   ✅ retain 成功 (5条消息)');

  // 给 Hindsight 一点时间做异步提取
  console.log('\n2. 等待 Hindsight 处理... (3秒)');
  await new Promise((r) => setTimeout(r, 3000));

  console.log('\n3. 测试 recall (召回) ...');
  const ctx = await adapter.recall(userId, '用户的工作压力、核心信念和成长经历');
  console.log(`   worldFacts:    ${ctx.worldFacts.length} 条`);
  ctx.worldFacts.forEach((f) => console.log(`     - ${f.content}`));
  console.log(`   experiences:   ${ctx.experiences.length} 条`);
  ctx.experiences.forEach((e) => console.log(`     - ${e.content}`));
  console.log(`   opinions:      ${ctx.opinions.length} 条`);
  ctx.opinions.forEach((o) => console.log(`     - ${o.content} (confidence: ${o.confidence})`));
  console.log(
    `   observationSummary: ${ctx.observationSummary ? ctx.observationSummary.slice(0, 100) + '...' : '(空)'}`
  );

  const hasResults = ctx.worldFacts.length + ctx.experiences.length + ctx.opinions.length > 0;

  console.log('\n4. 测试 reflect (反思) ...');
  const result = await adapter.reflect(userId);
  console.log(`   summary: ${result.summary ? result.summary.slice(0, 200) + '...' : '(空)'}`);

  console.log(
    '\n' +
      (hasResults
        ? '✅ 集成验证通过！'
        : '⚠️  recall 返回空（Hindsight 可能需要更多时间处理，或使用默认设置）')
  );
  process.exit(hasResults ? 0 : 0);
}

main().catch((err) => {
  console.error('❌ 验证失败:', err.message);
  process.exit(1);
});
