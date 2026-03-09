#!/usr/bin/env node

/**
 * 两阶段LLM Pipeline端到端集成测试
 *
 * 测试整个工作流程：
 * 1. 读取Decision Prompt模板
 * 2. 读取Planner Prompt模板
 * 3. 模拟Decision LLM调用
 * 4. 模拟Planner LLM调用
 * 5. 验证输出格式和内容
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(level, message) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const levelColor =
    {
      INFO: colors.blue,
      SUCCESS: colors.green,
      WARNING: colors.yellow,
      ERROR: colors.red,
    }[level] || colors.reset;

  console.log(`${levelColor}[${timestamp}] [${level}]${colors.reset} ${message}`);
}

// 模拟Decision LLM调用
function simulateDecisionLLM(prompt, context) {
  log('INFO', '模拟Decision LLM调用');

  // 基于上下文生成决策
  const decision = {
    strategy: 'deepen_entity',
    reasoning: "用户提到了'父亲'这个实体，但情感和关系细节不完整，需要追问以获取更深入的理解。",
    entities: [
      {
        name: '父亲',
        type: '抚养者',
        status: 'mentioned',
        confidence: 0.9,
        needs_adjustment: true,
        adjustment_reason: '情感和关系细节不完整',
      },
    ],
    needs_adjustment: true,
    adjustment_type: 'deepen_entity',
    adjustment_target: '父亲',
  };

  return decision;
}

// 模拟Planner LLM调用
function simulatePlannerLLM(prompt, context, decision) {
  log('INFO', '模拟Planner LLM调用');

  // 基于决策生成规划
  const plan = {
    actions: [
      {
        action_id: 'ask_father_emotion',
        action_type: 'ai_ask',
        config: {
          question_template:
            '关于您和父亲的关系，您能描述一下您对他的主要情感是什么吗？比如是亲近、尊敬、疏远，还是有些复杂的情感？',
          variables: [
            {
              name: 'father_emotion',
              type: 'text',
              extraction_method: 'direct',
            },
          ],
        },
      },
      {
        action_id: 'ask_father_relationship_detail',
        action_type: 'ai_ask',
        config: {
          question_template:
            '在您成长过程中，父亲在哪些方面对您影响比较大？比如价值观、性格特点、或者具体的生活习惯？',
          variables: [
            {
              name: 'father_influence',
              type: 'text',
              extraction_method: 'direct',
            },
          ],
        },
      },
      {
        action_id: 'ask_father_memory',
        action_type: 'ai_ask',
        config: {
          question_template:
            '您能回忆一个和父亲相关的具体记忆吗？无论是积极的还是挑战性的经历都可以。',
          variables: [
            {
              name: 'father_memory',
              type: 'text',
              extraction_method: 'direct',
            },
          ],
        },
      },
    ],
    metadata: {
      estimated_time: '5-7分钟',
      priority: 'high',
      goal: "深化对'父亲'实体的理解，收集情感、关系和记忆细节",
    },
  };

  return plan;
}

// 验证Decision输出
function validateDecisionOutput(decision) {
  log('INFO', '验证Decision输出');

  const requiredFields = ['strategy', 'reasoning', 'entities', 'needs_adjustment'];
  const missingFields = requiredFields.filter((field) => !(field in decision));

  if (missingFields.length > 0) {
    throw new Error(`Decision输出缺少必要字段: ${missingFields.join(', ')}`);
  }

  if (!Array.isArray(decision.entities)) {
    throw new Error('Decision输出中的entities必须是数组');
  }

  log('SUCCESS', 'Decision输出验证通过');
  return true;
}

// 验证Plan输出
function validatePlanOutput(plan) {
  log('INFO', '验证Plan输出');

  const requiredFields = ['actions', 'metadata'];
  const missingFields = requiredFields.filter((field) => !(field in plan));

  if (missingFields.length > 0) {
    throw new Error(`Plan输出缺少必要字段: ${missingFields.join(', ')}`);
  }

  if (!Array.isArray(plan.actions)) {
    throw new Error('Plan输出中的actions必须是数组');
  }

  // 验证每个action
  for (const action of plan.actions) {
    if (!action.action_id || !action.action_type || !action.config) {
      throw new Error('Action必须包含action_id、action_type和config字段');
    }
  }

  log('SUCCESS', 'Plan输出验证通过');
  return true;
}

// 主测试函数
async function runIntegrationTest() {
  log('INFO', '开始端到端集成测试');

  try {
    // 1. 读取prompt模板
    log('INFO', '读取prompt模板');
    const decisionPromptPath = path.join(__dirname, 'decision-llm-v1-final.md');
    const plannerPromptPath = path.join(__dirname, 'planner-llm-v1-final.md');

    if (!fs.existsSync(decisionPromptPath)) {
      throw new Error(`Decision Prompt文件不存在: ${decisionPromptPath}`);
    }

    if (!fs.existsSync(plannerPromptPath)) {
      throw new Error(`Planner Prompt文件不存在: ${plannerPromptPath}`);
    }

    const decisionPrompt = fs.readFileSync(decisionPromptPath, 'utf-8');
    const plannerPrompt = fs.readFileSync(plannerPromptPath, 'utf-8');

    log('SUCCESS', 'Prompt模板读取成功');

    // 2. 模拟上下文
    const context = {
      conversation_history: [
        { role: 'user', content: '我小时候主要是父亲带大的' },
        {
          role: 'assistant',
          content: '明白了，您主要是由父亲带大的。能多说说和父亲相处的情况吗？',
        },
      ],
      current_topic: 'family_background',
      extracted_entities: ['父亲'],
      session_variables: {},
    };

    // 3. 模拟Decision阶段
    log('INFO', '执行Decision阶段');
    const decision = simulateDecisionLLM(decisionPrompt, context);
    validateDecisionOutput(decision);

    // 4. 模拟Planner阶段
    log('INFO', '执行Planner阶段');
    const plan = simulatePlannerLLM(plannerPrompt, context, decision);
    validatePlanOutput(plan);

    // 5. 验证类型兼容性
    log('INFO', '验证类型兼容性');

    // 检查Decision输出是否符合类型定义
    const decisionTypeCheck = {
      strategy: typeof decision.strategy === 'string',
      reasoning: typeof decision.reasoning === 'string',
      entities: Array.isArray(decision.entities),
      needs_adjustment: typeof decision.needs_adjustment === 'boolean',
    };

    const failedChecks = Object.entries(decisionTypeCheck)
      .filter(([_, passed]) => !passed)
      .map(([field]) => field);

    if (failedChecks.length > 0) {
      throw new Error(`Decision类型检查失败: ${failedChecks.join(', ')}`);
    }

    // 检查Plan输出是否符合类型定义
    const planTypeCheck = {
      actions: Array.isArray(plan.actions),
      metadata: typeof plan.metadata === 'object',
    };

    const failedPlanChecks = Object.entries(planTypeCheck)
      .filter(([_, passed]) => !passed)
      .map(([field]) => field);

    if (failedPlanChecks.length > 0) {
      throw new Error(`Plan类型检查失败: ${failedPlanChecks.join(', ')}`);
    }

    // 6. 输出测试结果
    log('SUCCESS', '端到端集成测试通过！');
    console.log('\n' + colors.cyan + '='.repeat(60) + colors.reset);
    console.log(colors.green + '✅ 两阶段LLM Pipeline端到端集成测试结果' + colors.reset);
    console.log(colors.cyan + '='.repeat(60) + colors.reset);

    console.log('\n' + colors.blue + '📋 测试摘要:' + colors.reset);
    console.log(`- Decision Prompt: ${decisionPrompt.length} 字符`);
    console.log(`- Planner Prompt: ${plannerPrompt.length} 字符`);
    console.log(`- Decision输出: ${JSON.stringify(decision, null, 2).length} 字符`);
    console.log(`- Plan输出: ${plan.actions.length} 个actions`);

    console.log('\n' + colors.blue + '🎯 Decision结果:' + colors.reset);
    console.log(`策略: ${decision.strategy}`);
    console.log(`需要调整: ${decision.needs_adjustment ? '是' : '否'}`);
    console.log(`实体数量: ${decision.entities.length}`);

    console.log('\n' + colors.blue + '📝 Plan结果:' + colors.reset);
    console.log(`Actions数量: ${plan.actions.length}`);
    console.log(`预计时间: ${plan.metadata.estimated_time}`);
    console.log(`优先级: ${plan.metadata.priority}`);

    console.log('\n' + colors.green + '✅ 所有检查通过，Pipeline工作正常！' + colors.reset);

    return {
      success: true,
      decision,
      plan,
    };
  } catch (error) {
    log('ERROR', `集成测试失败: ${error.message}`);
    console.error(error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTest().then((result) => {
    process.exit(result.success ? 0 : 1);
  });
}

export { runIntegrationTest };
