/**
 * 变量分析工具
 * 用于检测 action 中使用的输入变量和输出变量
 */

import type { NavigationTree, ActionNode } from '../types/navigation';

/**
 * 从导航树中获取指定位置的 action
 */
export function getActionFromTree(
  tree: NavigationTree | null,
  phaseIndex: number,
  topicIndex: number,
  actionIndex: number
): ActionNode | null {
  if (!tree || !tree.phases) return null;

  const phase = tree.phases[phaseIndex];
  if (!phase || !phase.topics) return null;

  const topic = phase.topics[topicIndex];
  if (!topic || !topic.actions) return null;

  return topic.actions[actionIndex] || null;
}

/**
 * 从文本中提取变量引用（格式：{变量名} 或 {{变量名}}）
 */
export function extractVariableReferences(text: string): string[] {
  if (!text) return [];

  const variables = new Set<string>();

  // 匹配 {变量名} 格式
  const pattern1 = /\{([^{}]+)\}/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const varName = match[1].trim();
    if (varName) {
      variables.add(varName);
    }
  }

  // 匹配 {{变量名}} 格式
  const pattern2 = /\{\{([^{}]+)\}\}/g;
  while ((match = pattern2.exec(text)) !== null) {
    const varName = match[1].trim();
    if (varName) {
      variables.add(varName);
    }
  }

  return Array.from(variables);
}

/**
 * 分析 action 中使用的输入变量
 */
export function analyzeInputVariables(action: ActionNode): string[] {
  const inputVars = new Set<string>();

  if (!action || !action.config) return [];

  const config = action.config;

  // 检查各种可能包含变量引用的字段
  const fieldsToCheck: string[] = [];

  // ai_say: content_template
  if (config.content_template) {
    fieldsToCheck.push(String(config.content_template));
  }

  // ai_ask: question_template, prompt_template
  if (config.question_template) {
    fieldsToCheck.push(String(config.question_template));
  }
  if (config.prompt_template) {
    fieldsToCheck.push(String(config.prompt_template));
  }

  // ai_think: think_goal
  if (config.think_goal) {
    fieldsToCheck.push(String(config.think_goal));
  }

  // 条件判断
  if (config.condition) {
    fieldsToCheck.push(String(config.condition));
  }

  // 提取所有字段中的变量引用
  for (const field of fieldsToCheck) {
    const vars = extractVariableReferences(field);
    vars.forEach((v) => inputVars.add(v));
  }

  return Array.from(inputVars);
}

/**
 * 分析 action 中输出的变量
 */
export function analyzeOutputVariables(action: ActionNode): string[] {
  const outputVars = new Set<string>();

  if (!action || !action.config) return [];

  const config = action.config;

  // ai_ask: target_variable
  if (config.target_variable) {
    outputVars.add(String(config.target_variable));
  }

  // output 配置（数组形式）
  if (Array.isArray(config.output)) {
    for (const item of config.output) {
      if (item && typeof item === 'object' && 'get' in item) {
        outputVars.add(String(item.get));
      }
    }
  }

  // output_variables（ai_think）
  if (Array.isArray(config.output_variables)) {
    for (const varName of config.output_variables) {
      if (varName) {
        outputVars.add(String(varName));
      }
    }
  }

  return Array.from(outputVars);
}

/**
 * 分析 action 的相关变量（输入 + 输出）
 */
export function analyzeActionVariables(
  tree: NavigationTree | null,
  phaseIndex: number,
  topicIndex: number,
  actionIndex: number
): {
  inputVariables: string[];
  outputVariables: string[];
  allRelevantVariables: string[];
} {
  const action = getActionFromTree(tree, phaseIndex, topicIndex, actionIndex);

  if (!action) {
    return {
      inputVariables: [],
      outputVariables: [],
      allRelevantVariables: [],
    };
  }

  const inputVariables = analyzeInputVariables(action);
  const outputVariables = analyzeOutputVariables(action);

  // 合并所有相关变量
  const allRelevant = new Set([...inputVariables, ...outputVariables]);

  return {
    inputVariables,
    outputVariables,
    allRelevantVariables: Array.from(allRelevant),
  };
}

/**
 * 根据变量作用域分层变量
 *
 * @param allVariables 后端返回的所有变量（已合并全局变量和会话变量）
 * @param globalVariables 纯粹的全局变量（从 global.yaml 加载）
 * @returns 按作用域分层的变量
 */
export function categorizeVariablesByScope(
  allVariables: Record<string, unknown>,
  globalVariables: Record<string, unknown> = {}
): {
  global: Record<string, unknown>;
  session: Record<string, unknown>;
  phase: Record<string, unknown>;
  topic: Record<string, unknown>;
} {
  // 提取全局变量：只包含在 globalVariables 中的变量
  const global: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allVariables)) {
    if (key in globalVariables) {
      global[key] = value;
    }
  }

  // 提取会话变量：不在 globalVariables 中的变量
  const session: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allVariables)) {
    if (!(key in globalVariables)) {
      session[key] = value;
    }
  }

  // 目前 phase 和 topic 级别为空（后续可以根据变量命名规则扩展）
  const phase: Record<string, unknown> = {};
  const topic: Record<string, unknown> = {};

  return { global, session, phase, topic };
}
