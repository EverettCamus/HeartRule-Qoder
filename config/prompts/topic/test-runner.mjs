#!/usr/bin/env node
/**
 * HeartRule Prompt测试框架 - 测试运行器 (Node.js版本)
 * 支持实践导向的迭代开发工作流：测试 → 分析 → 优化 → 重测
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const SCRIPT_DIR = __dirname;
const TEST_DATA_DIR = path.join(SCRIPT_DIR, 'test-data');
const OUTPUT_DIR = path.join(SCRIPT_DIR, 'test-results');
const DECISION_PROMPT = path.join(SCRIPT_DIR, 'decision-llm-v1-draft.md');
const PLANNER_PROMPT = path.join(SCRIPT_DIR, 'planner-llm-v1-draft.md');

// 颜色输出
const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  reset: '\x1b[0m',
};

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${timestamp}] [${level}] ${message}`);
}

function init() {
  console.log(`${colors.blue}初始化测试环境...${colors.reset}`);

  // 创建输出目录
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 检查测试数据
  if (!fs.existsSync(TEST_DATA_DIR)) {
    console.log(`${colors.red}错误: 测试数据目录不存在: ${TEST_DATA_DIR}${colors.reset}`);
    process.exit(1);
  }

  // 检查提示词文件
  if (!fs.existsSync(DECISION_PROMPT)) {
    console.log(`${colors.yellow}警告: 决策提示词文件不存在: ${DECISION_PROMPT}${colors.reset}`);
  }

  if (!fs.existsSync(PLANNER_PROMPT)) {
    console.log(`${colors.yellow}警告: 规划提示词文件不存在: ${PLANNER_PROMPT}${colors.reset}`);
  }

  console.log(`${colors.green}✓ 测试环境初始化完成${colors.reset}`);
}

function buildDecisionInput(scenarioData) {
  return {
    topic_config: scenarioData.topic_config,
    conversation_history: scenarioData.conversation_history,
    existing_entities: scenarioData.existing_entities,
    system_variables: {
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      session_id: `test-session-${Date.now()}`,
      user_id: 'test-user',
    },
  };
}

function callDecisionLLM(input) {
  log('调用决策LLM（模拟）');

  // 从输入中提取场景标识 - 检查所有对话内容
  const conversationHistory = input.conversation_history || [];
  const allContent = conversationHistory.map(m => m.content).join(' ');

  // 根据对话内容选择模拟响应
  if (allContent.includes('妈妈也回来了') || allContent.includes('外公也经常来帮忙')) {
    return loadExpectedOutput('new-entities-scenario.json', 'decision');
  } else if (allContent.includes('有时候我晚上都见不到他')) {
    return loadExpectedOutput('deepen-entity-scenario.json', 'decision');
  } else if (allContent.includes('我不想谈爷爷')) {
    return loadExpectedOutput('skip-entity-scenario.json', 'decision');
  }

  // 默认：不需要调整
  return { needsAdjustment: false, reasoning: '测试默认响应' };
}

function loadExpectedOutput(scenarioFile, type) {
  const filePath = path.join(TEST_DATA_DIR, scenarioFile);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return type === 'decision' ? data.expected_decision_output : data.expected_planner_output;
}

function validateDecisionOutput(actualOutput, scenarioFile) {
  log('验证决策输出');

  const scenarioData = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
  const expectedOutput = scenarioData.expected_decision_output;

  const validation = {
    is_valid_json: true,
    has_required_fields: true,
    strategy_valid: true,
    needs_adjustment_correct: true,
    matches_expected: false,
    issues: [],
  };

  // 检查必需字段
  const requiredFields = ['needsAdjustment', 'strategy', 'reasoning', 'adjustmentPlan'];
  for (const field of requiredFields) {
    if (actualOutput[field] === undefined) {
      validation.has_required_fields = false;
      validation.issues.push(`缺少必需字段: ${field}`);
    }
  }

  // 检查策略有效性
  const validStrategies = [
    'NEW_ENTITIES',
    'DEEPEN_ENTITY',
    'SKIP_ENTITY',
    'REORDER_ACTIONS',
    'CUSTOM',
  ];
  if (!validStrategies.includes(actualOutput.strategy)) {
    validation.strategy_valid = false;
    validation.issues.push(`无效的策略: ${actualOutput.strategy}`);
  }

  // 检查needsAdjustment是否正确
  if (actualOutput.needsAdjustment !== expectedOutput.needsAdjustment) {
    validation.needs_adjustment_correct = false;
    validation.issues.push('needsAdjustment不正确');
  }

  // 检查是否完全匹配
  validation.matches_expected = JSON.stringify(actualOutput) === JSON.stringify(expectedOutput);

  return validation;
}

function buildPlannerInput(decisionOutput, scenarioData) {
  return {
    topic_config: scenarioData.topic_config,
    adjustment_plan_json: decisionOutput,
    system_variables: {
      time: new Date().toISOString().replace('T', ' ').substring(0, 19),
      session_id: `test-session-${Date.now()}`,
    },
  };
}

function callPlannerLLM(input) {
  log('调用规划LLM（模拟）');

  const strategy = input.adjustment_plan_json?.strategy || '';

  switch (strategy) {
    case 'NEW_ENTITIES':
      return loadExpectedOutput('new-entities-scenario.json', 'planner');
    case 'DEEPEN_ENTITY':
      return loadExpectedOutput('deepen-entity-scenario.json', 'planner');
    case 'SKIP_ENTITY':
      return loadExpectedOutput('skip-entity-scenario.json', 'planner');
    default:
      return { actions: [] };
  }
}

function validatePlannerOutput(actualOutput, scenarioFile) {
  log('验证规划输出');

  const validation = {
    is_valid_yaml: true,
    has_actions_array: true,
    action_ids_valid: true,
    variable_names_valid: true,
    matches_expected: false,
    issues: [],
  };

  // 检查是否有actions数组
  if (!actualOutput.actions || !Array.isArray(actualOutput.actions)) {
    validation.has_actions_array = false;
    validation.issues.push('缺少actions数组');
    return validation;
  }

  // 检查Action ID格式
  // 支持两种格式：
  // 1. 实体相关：{entity_type}_{index}_{purpose_slug}
  // 2. 通用Action：general_{purpose_slug}
  const entityActionIdPattern = /^[a-z]+_[0-9]+_[a-z_]+$/;
  const generalActionIdPattern = /^general_[a-z_]+$/;
  
  for (const action of actualOutput.actions) {
    if (action.action_id) {
      const isValidEntityAction = entityActionIdPattern.test(action.action_id);
      const isValidGeneralAction = generalActionIdPattern.test(action.action_id);
      
      if (!isValidEntityAction && !isValidGeneralAction) {
        validation.action_ids_valid = false;
        validation.issues.push(`无效的Action ID格式: ${action.action_id}`);
      }
    }
  }

  // 检查是否匹配期望输出
  const scenarioData = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
  validation.matches_expected =
    JSON.stringify(actualOutput) === JSON.stringify(scenarioData.expected_planner_output);

  return validation;
}

function generateReport(
  scenarioName,
  scenarioData,
  decisionOutput,
  decisionValidation,
  plannerOutput,
  plannerValidation
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFile = path.join(OUTPUT_DIR, `${scenarioName}-report-${timestamp}.json`);

  // 计算分数
  let decisionScore = 0;
  let plannerScore = 0;

  // 决策分数
  if (decisionValidation.is_valid_json) decisionScore += 25;
  if (decisionValidation.has_required_fields) decisionScore += 25;
  if (decisionValidation.strategy_valid) decisionScore += 25;
  if (decisionValidation.needs_adjustment_correct) decisionScore += 25;

  // 规划分数
  if (plannerValidation.is_valid_yaml) plannerScore += 25;
  if (plannerValidation.has_actions_array) plannerScore += 25;
  if (plannerValidation.action_ids_valid) plannerScore += 25;
  if (plannerValidation.variable_names_valid) plannerScore += 25;

  const overallScore = Math.round((decisionScore + plannerScore) / 2);

  const report = {
    test_run: {
      scenario: scenarioName,
      timestamp: new Date().toISOString(),
      description: scenarioData.description,
    },
    scores: {
      decision: decisionScore,
      planner: plannerScore,
      overall: overallScore,
    },
    validation: {
      decision: decisionValidation,
      planner: plannerValidation,
    },
    outputs: {
      decision: decisionOutput,
      planner: plannerOutput,
    },
    recommendations: [
      '检查决策输出是否符合JSON Schema',
      '验证规划输出的YAML格式',
      '确保Action ID遵循命名规范',
    ],
  };

  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  log(`测试报告已生成: ${reportFile}`);

  // 打印摘要
  console.log(`\n${colors.blue}=== 测试摘要 ===${colors.reset}`);
  console.log(`场景: ${scenarioName}`);
  console.log(`决策分数: ${decisionScore}/100`);
  console.log(`规划分数: ${plannerScore}/100`);
  console.log(`总体分数: ${overallScore}/100`);

  if (overallScore >= 80) {
    console.log(`${colors.green}✓ 测试通过${colors.reset}`);
    return true;
  } else if (overallScore >= 60) {
    console.log(`${colors.yellow}⚠ 测试警告 - 需要改进${colors.reset}`);
    return false;
  } else {
    console.log(`${colors.red}✗ 测试失败${colors.reset}`);
    return false;
  }
}

function runScenario(scenarioFile) {
  const scenarioName = path.basename(scenarioFile, '.json');
  log(`运行测试场景: ${scenarioName}`);

  // 检查场景文件
  if (!fs.existsSync(scenarioFile)) {
    log(`错误: 场景文件不存在: ${scenarioFile}`, 'ERROR');
    return false;
  }

  // 解析场景文件
  const scenarioData = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));
  log(`场景描述: ${scenarioData.description}`);

  // 构建决策提示词输入
  const decisionInput = buildDecisionInput(scenarioData);

  // 调用决策LLM（模拟）
  const decisionOutput = callDecisionLLM(decisionInput);

  // 验证决策输出
  const decisionValidation = validateDecisionOutput(decisionOutput, scenarioFile);

  // 如果决策需要调整，调用规划LLM
  let plannerOutput = {};
  let plannerValidation = {
    is_valid_yaml: true,
    has_actions_array: true,
    action_ids_valid: true,
    variable_names_valid: true,
    issues: [],
  };

  if (decisionOutput.needsAdjustment) {
    log('决策需要调整，调用规划LLM');

    // 构建规划提示词输入
    const plannerInput = buildPlannerInput(decisionOutput, scenarioData);

    // 调用规划LLM（模拟）
    plannerOutput = callPlannerLLM(plannerInput);

    // 验证规划输出
    plannerValidation = validatePlannerOutput(plannerOutput, scenarioFile);
  } else {
    log('决策不需要调整，跳过规划阶段');
  }

  // 生成测试报告
  const passed = generateReport(
    scenarioName,
    scenarioData,
    decisionOutput,
    decisionValidation,
    plannerOutput,
    plannerValidation
  );

  log(`测试场景完成: ${scenarioName}`);
  return passed;
}

function runAllTests() {
  log('开始运行所有测试');

  let totalScenarios = 0;
  let passedScenarios = 0;

  // 查找所有测试场景
  const files = fs
    .readdirSync(TEST_DATA_DIR)
    .filter((f) => f.endsWith('.json') && !f.includes('template'));

  if (files.length === 0) {
    log('错误: 未找到测试场景文件', 'ERROR');
    process.exit(1);
  }

  for (const file of files) {
    totalScenarios++;

    const scenarioFile = path.join(TEST_DATA_DIR, file);
    if (runScenario(scenarioFile)) {
      passedScenarios++;
    }

    console.log(''); // 空行分隔
  }

  // 汇总报告
  console.log(`\n${colors.blue}=== 测试汇总 ===${colors.reset}`);
  console.log(`总场景数: ${totalScenarios}`);
  console.log(`通过场景: ${passedScenarios}`);
  console.log(`失败场景: ${totalScenarios - passedScenarios}`);

  if (passedScenarios === totalScenarios) {
    console.log(`${colors.green}✓ 所有测试通过${colors.reset}`);
    return 0;
  } else {
    console.log(`${colors.red}✗ 部分测试失败${colors.reset}`);
    return 1;
  }
}

function showHelp() {
  console.log(`HeartRule Prompt测试框架 - 测试运行器

用法: node test-runner.mjs [选项]

选项:
  --all              运行所有测试场景
  --scenario NAME    运行指定测试场景
  --help             显示此帮助信息

示例:
  node test-runner.mjs --all                    # 运行所有测试
  node test-runner.mjs --scenario new-entities  # 运行新实体场景测试

工作流:
  1. 测试: 运行测试收集数据
  2. 分析: 分析测试结果识别问题
  3. 优化: 优化提示词模板
  4. 重测: 重新运行测试验证改进

测试数据位置: ${TEST_DATA_DIR}
测试结果位置: ${OUTPUT_DIR}`);
}

// 主函数
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  // 初始化
  init();

  // 解析参数
  switch (args[0]) {
    case '--all':
      process.exit(runAllTests());
      break;
    case '--scenario':
      if (!args[1]) {
        console.log(`${colors.red}错误: 请指定场景名称${colors.reset}`);
        process.exit(1);
      }

      let scenarioFile = path.join(TEST_DATA_DIR, `${args[1]}.json`);
      if (!fs.existsSync(scenarioFile)) {
        scenarioFile = path.join(TEST_DATA_DIR, `${args[1]}-scenario.json`);
      }

      if (!fs.existsSync(scenarioFile)) {
        console.log(`${colors.red}错误: 未找到场景文件: ${args[1]}${colors.reset}`);
        process.exit(1);
      }

      process.exit(runScenario(scenarioFile) ? 0 : 1);
      break;
    case '--help':
      showHelp();
      process.exit(0);
      break;
    default:
      console.log(`${colors.red}错误: 未知选项: ${args[0]}${colors.reset}`);
      showHelp();
      process.exit(1);
  }
}

main();
