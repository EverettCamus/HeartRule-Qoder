/**
 * Action 基类和类型定义
 *
 * 【DDD 视角】应用层抽象基类
 * 定义 Action 执行器的通用结构与行为
 * 
 * 核心职责：
 * 1. 执行上下文：封装 Action 执行时需要的所有信息（session/phase/topic/variables）
 * 2. 结果结构：统一返回格式（成功状态/完成标记/AI消息/提取变量）
 * 3. 状态管理：维护 Action 的轮次计数与完成状态
 * 4. 变量操作：提供变量读取与模板替换的通用方法
 * 
 * 设计要点：
 * - ActionContext: 执行上下文，包含 Session 状态、变量、对话历史等
 * - ActionResult: 统一返回结构，支持多轮对话（completed 标记）
 * - BaseAction: 抽象基类，所有具体 Action 继承并实现 execute 方法
 * 
 * 参照 Python 版本: legacy-python/src/actions/base.py
 */

import * as path from 'path';

import type { VariableStore, Position } from '@heartrule/shared-types';

import type { LLMDebugInfo } from '../engines/llm-orchestration/orchestrator.js';
import { VariableScopeResolver } from '../engines/variable-scope/variable-scope-resolver.js';

/**
 * Action 执行上下文
 * 
 * 封装 Action 执行时需要的所有上下文信息：
 * - 位置信息：sessionId, phaseId, topicId, actionId
 * - 变量状态：variables (旧版) + variableStore (新版分层结构)
 * - 作用域解析：scopeResolver 用于变量的作用域查找与写入
 * - 对话历史：conversationHistory 用于 LLM 上下文构建
 * - 元数据：metadata 用于储存额外状态（如 Action 内部状态）
 */
export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Record<string, any>;
  // 新增：分层变量存储
  variableStore?: VariableStore;
  // 新增：作用域解析器
  scopeResolver?: VariableScopeResolver;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
}

/**
 * Action 执行结果
 * 
 * 统一的返回结构，支持多轮对话与变量提取：
 * - success: 执行是否成功（false 表示出错）
 * - completed: Action 是否完成（false 表示需等待用户下一轮输入）
 * - aiMessage: AI 生成的消息（返回给用户）
 * - extractedVariables: 从用户回答中提取的变量（写入 variableStore）
 * - debugInfo: LLM 调试信息（包含 prompt 与 response）
 * - metadata: 额外元数据（如轮次、退出决策等）
 */
export interface ActionResult {
  success: boolean;
  completed: boolean; // Action是否完成（可能需要多轮）
  aiMessage?: string | null; // AI生成的消息
  extractedVariables?: Record<string, any> | null; // 提取的变量
  nextAction?: string | null; // 下一个要执行的Action ID
  error?: string | null; // 错误信息
  metadata?: Record<string, any>; // 额外元数据
  debugInfo?: LLMDebugInfo; // LLM调试信息（可选）
}

/**
 * Action 基类
 *
 * 【DDD 视角】应用层抽象基类
 * 所有 Action 执行器的抽象父类，定义通用行为与接口。
 * 
 * 核心能力：
 * - execute(): 抽象方法，由子类实现具体执行逻辑
 * - substituteVariables(): 变量模板替换，支持作用域查找
 * - getConfig(): 配置读取，兼容 camelCase 和 snake_case
 * - reset(): 重置 Action 状态（轮次计数）
 * 
 * 状态管理：
 * - currentRound: 当前执行轮次（多轮对话场景）
 * - maxRounds: 最大轮次限制
 */
export abstract class BaseAction {
  static actionType: string = 'base';

  public actionId: string;
  public config: Record<string, any>;
  public currentRound: number = 0;
  public maxRounds: number;

  constructor(actionId: string, config: Record<string, any>) {
    this.actionId = actionId;
    this.config = config;
    this.maxRounds = config.maxRounds || config.max_rounds || 5;
  }

  /**
   * 执行Action
   */
  abstract execute(context: ActionContext, userInput?: string | null): Promise<ActionResult>;

  /**
   * 重置Action状态
   */
  reset(): void {
    this.currentRound = 0;
  }

  /**
   * 判断Action是否完成
   */
  isCompleted(): boolean {
    return this.currentRound >= this.maxRounds;
  }

  /**
   * 从上下文获取变量值
   */
  getVariable(context: ActionContext, varName: string, defaultValue: any = null): any {
    return context.variables[varName] ?? defaultValue;
  }

  /**
   * 替换模板中的变量
   *
   * 支持 {{variable_name}}, {variable_name}, ${variable_name} 格式
   * 优先使用 scopeResolver 按作用域查找，否则使用旧的 variables
   */
  substituteVariables(template: string, context: ActionContext): string {
    // 提取模板中的变量名
    const variablePattern = /\{\{([^}]+)\}\}|\{([^}]+)\}|\$\{([^}]+)\}/g;
    const matches = template.matchAll(variablePattern);
    const varNames = new Set<string>();

    for (const match of matches) {
      const varName = match[1] || match[2] || match[3];
      if (varName) {
        varNames.add(varName.trim());
      }
    }

    // 替换变量
    let result = template;
    for (const varName of varNames) {
      let varValue: any;

      // 优先使用 scopeResolver
      if (context.scopeResolver && context.variableStore) {
        const position: Position = {
          phaseId: context.phaseId,
          topicId: context.topicId,
          actionId: context.actionId,
        };
        const variableValue = context.scopeResolver.resolveVariable(varName, position);
        varValue = variableValue?.value;
      } else {
        // 向后兼容：使用旧的 variables
        varValue = context.variables[varName];
      }

      // 转义变量名中的特殊字符用于正则
      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // 支持三种占位符格式: {{var}}, {var}, ${var}
      const patterns = [
        `\\{\\{${escapedVarName}\\}\\}`,
        `\\{${escapedVarName}\\}`,
        `\\$\\{${escapedVarName}\\}`,
      ];

      for (const pattern of patterns) {
        result = result.replace(new RegExp(pattern, 'g'), String(varValue ?? ''));
      }
    }

    return result;
  }

  /**
   * 从配置中获取值，支持 camelCase 和 snake_case
   */
  protected getConfig(key: string, defaultValue: any = undefined): any {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

    return this.config[key] ?? this.config[snakeKey] ?? this.config[camelKey] ?? defaultValue;
  }

  /**
   * 解析模板基础路径
   */
  protected resolveTemplatePath(): string {
    let templateBasePath = process.env.PROMPT_TEMPLATE_PATH;

    if (!templateBasePath) {
      const cwd = process.cwd();
      // 检测运行目录：适配 monorepo 结构
      if (cwd.includes('packages/api-server') || cwd.includes('packages\\api-server')) {
        templateBasePath = path.resolve(cwd, '../../config/prompts');
      } else {
        templateBasePath = path.resolve(cwd, './config/prompts');
      }
    }
    return templateBasePath;
  }

  /**
   * 提取通用的用户画像变量
   */
  protected extractCommonProfileVariables(context: ActionContext): Map<string, any> {
    const variables = new Map<string, any>();
    const commonVars = [
      '用户名',
      '教育背景',
      '心理学知识',
      '学习风格',
      '咨询师名',
      '认知特点',
      '情感特点',
      '词汇水平',
      '语言风格',
      '用户常用表达',
    ];

    commonVars.forEach((varName) => {
      const value = context.variables[varName];
      if (value !== undefined) {
        variables.set(varName, value);
      }
    });

    return variables;
  }

  /**
   * 清理 LLM 输出的 JSON 文本（移除 Markdown 代码块标记）
   */
  protected cleanJsonOutput(text: string): string {
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }
    return jsonText.trim();
  }
}
