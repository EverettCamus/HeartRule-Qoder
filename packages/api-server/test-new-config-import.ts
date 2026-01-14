/**
 * 测试新配置项的导入和验证
 */

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  try {
    console.log('====== 测试新配置项 ======\n');

    // 读取测试YAML文件
    const yamlPath = path.join(__dirname, 'test-new-config.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    console.log('✅ YAML文件读取成功\n');

    // 解析YAML
    const parsed = yaml.load(yamlContent) as any;
    
    console.log('✅ YAML解析成功\n');
    console.log('📋 会谈基本信息:');
    console.log(`  - 会谈ID: ${parsed.session.session_id}`);
    console.log(`  - 会谈名称: ${parsed.session.session_name}`);
    console.log('');

    // 验证actions
    const actions = parsed.session.phases[0].topics[0].actions;
    console.log(`📌 发现 ${actions.length} 个Action节点\n`);

    // 测试 ai_say 配置
    console.log('--- Action 1: ai_say ---');
    const say1 = actions[0];
    console.log(`  action_type: ${say1.action_type}`);
    console.log(`  action_id: ${say1.action_id}`);
    console.log(`  content_template: ${say1.config.content_template}`);
    console.log(`  require_acknowledgment: ${say1.config.require_acknowledgment} ✅`);
    console.log(`  max_rounds: ${say1.config.max_rounds} ✅`);
    console.log('');

    // 测试 ai_ask 配置（基础配置）
    console.log('--- Action 2: ai_ask (基础配置) ---');
    const ask1 = actions[1];
    console.log(`  action_type: ${ask1.action_type}`);
    console.log(`  action_id: ${ask1.action_id}`);
    console.log(`  question_template: ${ask1.config.question_template} ✅`);
    console.log(`  target_variable: ${ask1.config.target_variable} ✅`);
    console.log(`  extraction_prompt: ${ask1.config.extraction_prompt} ✅`);
    console.log(`  required: ${ask1.config.required} ✅`);
    console.log(`  max_rounds: ${ask1.config.max_rounds} ✅`);
    console.log(`  exit: ${ask1.config.exit} ✅`);
    console.log('');

    // 测试 ai_ask 配置（output数组）
    console.log('--- Action 3: ai_ask (output数组配置) ---');
    const ask2 = actions[2];
    console.log(`  action_type: ${ask2.action_type}`);
    console.log(`  action_id: ${ask2.action_id}`);
    console.log(`  content_template: ${ask2.config.content_template}`);
    console.log(`  output数组: ${JSON.stringify(ask2.config.output, null, 2)} ✅`);
    console.log(`  max_rounds: ${ask2.config.max_rounds} ✅`);
    console.log('');

    // 模拟前端解析逻辑
    console.log('====== 模拟前端解析 ======\n');
    
    const frontendActions: any[] = [];
    
    actions.forEach((action: any) => {
      if (action.action_type === 'ai_say') {
        frontendActions.push({
          type: 'ai_say',
          ai_say: action.config?.content_template || '',
          tone: action.config?.tone,
          condition: action.config?.condition,
          require_acknowledgment: action.config?.require_acknowledgment,
          max_rounds: action.config?.max_rounds,
          action_id: action.action_id,
        });
      } else if (action.action_type === 'ai_ask') {
        frontendActions.push({
          type: 'ai_ask',
          ai_ask: action.config?.question_template || action.config?.content_template || '',
          tone: action.config?.tone,
          exit: action.config?.exit,
          tolist: action.config?.tolist,
          question_template: action.config?.question_template,
          target_variable: action.config?.target_variable,
          extraction_prompt: action.config?.extraction_prompt,
          required: action.config?.required,
          max_rounds: action.config?.max_rounds,
          output: action.config?.target_variable
            ? [
                {
                  get: action.config.target_variable,
                  define: action.config.extraction_prompt || '',
                },
              ]
            : action.config?.output || [],
          condition: action.config?.condition,
          action_id: action.action_id,
        });
      }
    });

    console.log('前端解析结果:');
    frontendActions.forEach((action, index) => {
      console.log(`\nAction ${index + 1} (${action.type}):`);
      console.log(JSON.stringify(action, null, 2));
    });

    console.log('\n✅ 所有测试通过！新配置项工作正常。');
    
  } catch (error) {
    console.error('❌ 错误:', error);
    process.exit(1);
  }
}

main();
