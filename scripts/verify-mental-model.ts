/**
 * 004 校准第 0 步：mental model PoC
 *
 * 验证 Hindsight v0.9.1 的 mental model API 能否承载 HeartRule `MemoryContext.opinions`
 * （结构化、含 confidence），以决定决策 6 的方向：自建 opinions 表 vs mental model 管线。
 *
 * 核心发现背景：SDK 类型化客户端 `createMentalModel`/`updateMentalModel` 的 trigger
 * 只转发 refresh_after_consolidation / tags_match / tag_groups，`response_schema` 被丢弃。
 * 但服务端 `MentalModelTriggerInput.response_schema` 支持结构化输出（存到
 * `reflect_response.structured_output`）。本脚本用 raw HTTP 验证服务端路径是否可用。
 *
 * 前置条件：
 *   - Hindsight Docker 运行：docker compose -f docker-compose.dev.yml up hindsight
 *   - DEEPSEEK_API_KEY 已设置（hindsight 服务用它做 LLM）
 *
 * 使用方式：npx tsx scripts/verify-mental-model.ts
 */
import { HindsightClient } from '@vectorize-io/hindsight-client';

const DEFAULT_HINDSIGHT_URL = 'http://localhost:8888';

// 咨询师观点 schema —— 与 framework 决策 2 的 ReflectionResult 同构
const OPINION_SCHEMA = {
  type: 'object',
  properties: {
    opinions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '咨询师对该来访者的判断/综合观点' },
          confidence: { type: 'number', description: '0-1 信心分数' },
          area: {
            type: 'string',
            description: '所属领域：核心信念/应对模式/防御机制/依恋模式/其他',
          },
          evidence: { type: 'string', description: '支撑该观点的关键记忆摘要' },
        },
        required: ['content', 'confidence', 'area'],
      },
    },
  },
  required: ['opinions'],
} as const;

const SAMPLE_MESSAGES = [
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
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const baseUrl = process.env.HINDSIGHT_URL || DEFAULT_HINDSIGHT_URL;
  const client = new HindsightClient({ baseUrl });
  const bankId = 'mm-poc-' + Date.now();

  console.log('='.repeat(70));
  console.log('mental model PoC — 验证 opinions 结构化承载方案');
  console.log('='.repeat(70));

  // 0. 健康检查
  const health = await fetch(`${baseUrl}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(
      '❌ Hindsight 服务不可达。请先启动：docker compose -f docker-compose.dev.yml up hindsight'
    );
    process.exit(1);
  }
  console.log('✅ Hindsight 服务在线:', baseUrl);

  // 1. 存入示例会谈记忆
  console.log('\n[1] retain 示例会谈记忆...');
  await client.retain(bankId, SAMPLE_MESSAGES.map((m) => `${m.role}: ${m.content}`).join('\n'), {
    tags: ['chat'],
  });
  console.log('   ✅ retain 提交');
  await sleep(4000); // 等 Hindsight 异步提取

  // 2. Path A — raw HTTP 创建带 response_schema 的 mental model
  console.log('\n[2] Path A: raw HTTP 创建带 response_schema 的 mental model...');
  const createResp = await fetch(`${baseUrl}/v1/default/banks/${bankId}/mental-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '来访者核心信念',
      source_query: '综合分析该来访者的核心信念、应对模式与情绪模式，形成咨询师判断',
      max_tokens: 2000,
      trigger: {
        mode: 'full',
        refresh_after_consolidation: false,
        fact_types: ['world', 'experience', 'observation'],
        response_schema: OPINION_SCHEMA,
      },
    }),
  });
  const createJson: any = await createResp.json();
  if (!createResp.ok) {
    console.error('   ❌ raw HTTP 创建失败:', createResp.status, JSON.stringify(createJson));
    process.exit(1);
  }
  console.log('   ✅ 创建成功:', JSON.stringify(createJson));
  const mentalModelId = createJson.mental_model_id;

  // 3. 轮询等待后台 reflect 完成（最多 90s）
  console.log('\n[3] 轮询 mental model 内容生成...');
  let model: any = null;
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    model = await client.getMentalModel(bankId, mentalModelId, { detail: 'full' });
    if (model && model.content) {
      console.log(`   ✅ 内容已生成 (${i * 3}s)`);
      break;
    }
    console.log(`   ⏳ 等待中 (${(i + 1) * 3}s)...`);
  }
  if (!model?.content) {
    console.error('   ❌ 超时：mental model 内容未生成');
    process.exit(1);
  }

  // 4. 读取结构化输出 —— 关键验证点
  console.log('\n[4] 读取 reflect_response.structured_output ...');
  const so = model?.reflect_response?.structured_output;
  if (so) {
    console.log('   ✅ structured_output 存在！mental model 可承载结构化 opinions:');
    console.log('   ' + JSON.stringify(so, null, 2).split('\n').join('\n   '));
  } else {
    console.log('   ⚠️ structured_output 为空 —— response_schema 未生效或未被存储');
    console.log('   reflect_response 字段:', Object.keys(model?.reflect_response ?? {}));
  }
  console.log('\n   markdown content 预览:');
  console.log(
    '   ' +
      (model.content.slice(0, 300) + (model.content.length > 300 ? '...' : ''))
        .split('\n')
        .join('\n   ')
  );

  // 5. Path B — 类型化客户端透传验证（预期：response_schema 被丢弃）
  console.log('\n[5] Path B: 类型化 createMentalModel 透传验证...');
  try {
    const typedResp = await (client as any).createMentalModel(bankId, '测试透传', 'test query', {
      trigger: {
        refreshAfterConsolidation: false,
        response_schema: OPINION_SCHEMA, // 类型断言塞入，预期被运行时过滤
      },
    });
    console.log('   返回:', JSON.stringify(typedResp));
    // 读出该 model 确认 trigger 是否含 response_schema
    const mmId = typedResp.mental_model_id;
    await sleep(3000);
    const mm = await client.getMentalModel(bankId, mmId, { detail: 'full' });
    const hasRs = !!(mm as any).trigger?.response_schema;
    console.log(
      `   ${hasRs ? '✅' : '⚠️'} trigger.response_schema ${hasRs ? '被透传' : '被丢弃（证实类型化客户端阻断）'}`
    );
    await (client as any).deleteMentalModel(bankId, mmId);
  } catch (e: any) {
    console.log('   ⚠️ Path B 异常:', e.message);
  }

  // 6. Path C — reflect + responseSchema 降级路径（客户端原生支持）
  console.log('\n[6] Path C: reflect + responseSchema（客户端原生支持）...');
  try {
    const reflectResp = await client.reflect(
      bankId,
      '综合分析该来访者的核心信念、应对模式与情绪模式，形成咨询师判断',
      {
        response_schema: OPINION_SCHEMA as any,
      }
    );
    const rso = (reflectResp as any).structured_output;
    if (rso) {
      console.log('   ✅ reflect structured_output 可用:');
      console.log('   ' + JSON.stringify(rso, null, 2).split('\n').join('\n   '));
    } else {
      console.log('   ⚠️ reflect structured_output 为空。text 预览:');
      console.log('   ' + String((reflectResp as any).text ?? '').slice(0, 200));
    }
  } catch (e: any) {
    console.log('   ⚠️ Path C 异常:', e.message);
  }

  // 7. 清理
  console.log('\n[7] 清理 mental model...');
  await client.deleteMentalModel(bankId, mentalModelId).catch(() => {});
  console.log('   ✅ 已清理');

  console.log('\n' + '='.repeat(70));
  console.log('PoC 结论对照（供 004 决策 6 使用）:');
  console.log('  - Path A (raw HTTP + response_schema): 验证服务端能否存结构化 opinions');
  console.log('  - Path B (类型化客户端): 验证 response_schema 是否被丢弃');
  console.log('  - Path C (reflect + responseSchema): 验证降级路径是否可用');
  console.log('='.repeat(70));
}

main().catch((err) => {
  console.error('❌ PoC 失败:', err.message);
  process.exit(1);
});
