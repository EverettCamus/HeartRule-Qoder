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

import type {
  VariableStore,
  Position,
  ExitDecision,
  ExitCriteria,
  ExitPolicy,
} from '@heartrule/shared-types';

import type { LLMDebugInfo } from '../../engines/llm-orchestration/orchestrator.js';
import { VariableScopeResolver } from '../../engines/variable-scope/variable-scope-resolver.js';

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
 * Action执行状态精细化指标（系统变量）
 * 
 * 由LLM评估生成，作为字符串描述返回
 * 用于Topic层监控分析和策略决策
 */
export interface ActionMetrics {
  information_completeness?: string; // 信息完整度描述
  user_engagement?: string;          // 用户投入度描述
  emotional_intensity?: string;      // 情绪强度描述
  reply_relevance?: string;          // 回答相关性描述
  understanding_level?: string;      // 理解度描述（ai_say专用）
}

/**
 * 进度建议枚举
 * 
 * LLM提供的进度建议，指导Topic层下一步动作
 */
export type ProgressSuggestion = 
  | 'continue_needed'  // 信息不足，需要继续追问
  | 'completed'        // 信息已充分收集
  | 'blocked'          // 用户遇阻，无法继续
  | 'off_topic';       // 用户回答偏离主题

/**
 * 退出原因分类
 * 
 * 代码层对退出原因进行分类，供Topic层选择不同策略
 */
export type ExitReason = 
  | 'max_rounds_reached' // 达到最大轮次限制
  | 'exit_criteria_met'  // 满足退出条件
  | 'user_blocked'       // 用户遇阻
  | 'off_topic';         // 用户偏题

/**
 * Action 执行结果
 *
 * 统一的返回结构，支持多轮对话与变量提取：
 * - success: 执行是否成功（false 表示出错）
 * - completed: Action 是否完成（false 表示需等待用户下一轮输入）
 * - aiMessage: AI 生成的消息（返回给用户）
 * - extractedVariables: 从用户回答中提取的变量（写入 variableStore）
 * - metrics: 精细化状态指标（系统变量，可选）
 * - progress_suggestion: 进度建议（可选）
 * - debugInfo: LLM 调试信息（包含 prompt 与 response）
 * - metadata: 额外元数据（如轮次、退出决策、exit_reason等）
 */
export interface ActionResult {
  success: boolean;
  completed: boolean; // Action是否完成（可能需要多轮）
  aiMessage?: string | null; // AI生成的消息
  extractedVariables?: Record<string, any> | null; // 提取的变量（用户变量）
  metrics?: ActionMetrics | null; // 精细化状态指标（系统变量）
  progress_suggestion?: ProgressSuggestion | null; // 进度建议
  nextAction?: string | null; // 下一个要执行的Action ID
  error?: string | null; // 错误信息
  metadata?: Record<string, any>; // 额外元数据
  debugInfo?: LLMDebugInfo; // LLM调试信息（可选）
}

/**
 * 结构化 Action 输出（新安全机制）
 *
 * 所有咨询 Action（ai_ask, ai_say）的统一 JSON 输出格式
 * 包含安全风险检测字段和元数据
 */
export interface StructuredActionOutput {
  content: string;
  safety_risk: {
    detected: boolean;
    risk_type: 'diagnosis' | 'prescription' | 'guarantee' | 'inappropriate_advice' | null;
    confidence: 'high' | 'medium' | 'low';
    reason: string | null;
  };
  metadata: {
    emotional_tone?: string;
    crisis_signal: boolean;
  };
}

/**
 * 安全违规二次确认结果
 *
 * 当主 LLM 检测到潜在安全风险时，二次 LLM 确认的返回结果
 */
export interface SafetyConfirmationResult {
  violation_confirmed: boolean;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  detailed_reason: string;
  suggested_action: 'block' | 'warn' | 'allow';
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
 * - evaluateExitCondition(): 辅助方法，用于交互型 Action 的退出决策
 *
 * 状态管理：
 * - currentRound: 当前执行轮次（多轮对话场景）
 * - maxRounds: 最大轮次限制
 * - exitPolicy: 退出策略配置，声明是否支持多轮退出机制
 */
export abstract class BaseAction {
  static actionType: string = 'base';

  public actionId: string;
  public config: Record<string, any>;
  public currentRound: number = 0;
  public maxRounds: number;
  public exitPolicy: ExitPolicy;
  public exitCriteria?: ExitCriteria;

  constructor(actionId: string, config: Record<string, any>) {
    this.actionId = actionId;
    this.config = config;
    this.maxRounds = config.maxRounds || config.max_rounds || 5;
    this.exitCriteria = config.exit_criteria || config.exitCriteria;

    // 默认退出策略：不支持退出机制（由子类覆盖）
    this.exitPolicy = {
      supportsExit: false,
    };
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
   * 解析项目根目录（用于 TemplateResolver）
   */
  protected resolveProjectRoot(context?: ActionContext): string {
    // 从 context.metadata 中读取 projectId
    const projectId = context?.metadata?.projectId;

    if (projectId) {
      // 数据库模式,不需要物理路径
      // TemplateResolver在接收到空字符串时,完全依赖DatabaseTemplateProvider
      console.log(`[BaseAction] 💾 Using database mode for project: ${projectId}`);
      return '';
    }

    // 如果没有 projectId，回退到默认行为（monorepo 结构）
    const cwd = process.cwd();
    // 检测运行目录：适配 monorepo 结构
    if (cwd.includes('packages/api-server') || cwd.includes('packages\\api-server')) {
      return path.resolve(cwd, '../..');
    } else {
      return cwd;
    }
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

  /**
   * 退出条件评估（辅助方法，仅供交互型 Action 内部使用）
   *
   * 按照四级优先级执行退出决策：
   * 1. 硬性上限检查（max_rounds）
   * 2. 退出标志检查（EXIT 变量）
   * 3. 退出条件评估（exit_criteria）
   * 4. LLM 建议（llm_suggestion）
   *
   * @param context - 执行上下文
   * @param llmOutput - LLM 输出结果（可选）
   * @returns 退出决策结果
   */
  protected evaluateExitCondition(
    context: ActionContext,
    llmOutput?: Record<string, any>
  ): ExitDecision {
    // 如果 Action 不支持退出机制，默认不退出
    if (!this.exitPolicy.supportsExit) {
      return {
        should_exit: false,
        reason: 'Action does not support exit mechanism',
        decision_source: 'llm_suggestion',
      };
    }

    const enabledSources = this.exitPolicy.enabledSources || [
      'max_rounds',
      'exit_flag',
      'exit_criteria',
      'llm_suggestion',
    ];

    // 优先级 1: 硬性上限检查（max_rounds）
    if (enabledSources.includes('max_rounds') && this.currentRound >= this.maxRounds) {
      return {
        should_exit: true,
        reason: `达到最大轮次限制 (${this.maxRounds})`,
        decision_source: 'max_rounds',
      };
    }

    // 优先级 2: 退出标志检查（EXIT 字段）
    if (enabledSources.includes('exit_flag') && llmOutput) {
      const exitFlag = llmOutput.EXIT || llmOutput.exit;
      if (exitFlag === 'true' || exitFlag === true) {
        const exitReason = llmOutput.exit_reason || llmOutput.BRIEF || '满足退出标志';
        return {
          should_exit: true,
          reason: exitReason,
          decision_source: 'exit_flag',
        };
      }
    }

    // 优先级 3: 退出条件评估（exit_criteria）
    if (enabledSources.includes('exit_criteria') && this.exitCriteria) {
      const criteriaResult = this.evaluateExitCriteria(context, llmOutput);
      // 如果应该退出，直接返回
      if (criteriaResult.should_exit) {
        return criteriaResult;
      }
      // 如果有明确的不满足原因（非“退出条件不完整”），也直接返回
      if (criteriaResult.reason !== '退出条件不完整') {
        return criteriaResult;
      }
    }

    // 优先级 4: LLM 建议（llm_suggestion）
    if (enabledSources.includes('llm_suggestion') && llmOutput) {
      const shouldExit = llmOutput.should_exit || llmOutput.shouldExit;
      if (shouldExit === true) {
        const exitReason = llmOutput.exit_reason || llmOutput.exitReason || 'LLM 建议退出';
        return {
          should_exit: true,
          reason: exitReason,
          decision_source: 'llm_suggestion',
        };
      }
    }

    // 默认：继续
    return {
      should_exit: false,
      reason: '未满足退出条件，继续执行',
      decision_source: 'llm_suggestion',
    };
  }

  /**
   * 评估退出条件（exit_criteria）
   *
   * @param context - 执行上下文
   * @param llmOutput - LLM 输出结果（可选）
   * @returns 退出决策结果
   */
  private evaluateExitCriteria(
    context: ActionContext,
    llmOutput?: Record<string, any>
  ): ExitDecision {
    if (!this.exitCriteria) {
      return {
        should_exit: false,
        reason: '无退出条件配置',
        decision_source: 'exit_criteria',
      };
    }

    const conditions: string[] = [];

    // 检查最小轮次要求
    if (this.exitCriteria.min_rounds && this.currentRound < this.exitCriteria.min_rounds) {
      return {
        should_exit: false,
        reason: `未达到最小轮次要求 (${this.currentRound}/${this.exitCriteria.min_rounds})`,
        decision_source: 'exit_criteria',
      };
    }

    // 检查理解度阈值
    if (this.exitCriteria.understanding_threshold !== undefined && llmOutput) {
      // 支持新格式（metadata.assessment）和旧格式（assessment）
      const assessment = llmOutput.metadata?.assessment || llmOutput.assessment;
      const understandingLevel = assessment?.understanding_level || 0;

      if (understandingLevel >= this.exitCriteria.understanding_threshold) {
        conditions.push(
          `理解度达标 (${understandingLevel}>=${this.exitCriteria.understanding_threshold})`
        );
      } else {
        return {
          should_exit: false,
          reason: `理解度未达标 (${understandingLevel}<${this.exitCriteria.understanding_threshold})`,
          decision_source: 'exit_criteria',
        };
      }
    }

    // 检查是否允许有疑问时退出
    if (this.exitCriteria.has_questions !== undefined && llmOutput) {
      // 支持新格式（metadata.assessment）和旧格式（assessment）
      const assessment = llmOutput.metadata?.assessment || llmOutput.assessment;
      const hasQuestions = assessment?.has_questions || false;

      if (!this.exitCriteria.has_questions && hasQuestions) {
        return {
          should_exit: false,
          reason: '用户仍有疑问，不允许退出',
          decision_source: 'exit_criteria',
        };
      }

      if (!hasQuestions) {
        conditions.push('无疑问');
      }
    }

    // 检查自定义条件
    if (this.exitCriteria.custom_conditions && context.scopeResolver) {
      for (const condition of this.exitCriteria.custom_conditions) {
        const position = {
          phaseId: context.phaseId,
          topicId: context.topicId,
          actionId: context.actionId,
        };

        const variableValue = context.scopeResolver.resolveVariable(condition.variable, position);
        const actualValue = variableValue?.value;

        const satisfied = this.evaluateCondition(actualValue, condition.operator, condition.value);

        if (!satisfied) {
          return {
            should_exit: false,
            reason: `自定义条件不满足: ${condition.variable} ${condition.operator} ${condition.value}`,
            decision_source: 'exit_criteria',
          };
        }

        conditions.push(`${condition.variable} ${condition.operator} ${condition.value}`);
      }
    }

    // 所有条件满足
    if (conditions.length > 0) {
      return {
        should_exit: true,
        reason: `满足退出条件: ${conditions.join(', ')}`,
        decision_source: 'exit_criteria',
      };
    }

    return {
      should_exit: false,
      reason: '退出条件不完整',
      decision_source: 'exit_criteria',
    };
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(actualValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case '==':
        return actualValue == expectedValue;
      case '!=':
        return actualValue != expectedValue;
      case '>':
        return Number(actualValue) > Number(expectedValue);
      case '<':
        return Number(actualValue) < Number(expectedValue);
      case '>=':
        return Number(actualValue) >= Number(expectedValue);
      case '<=':
        return Number(actualValue) <= Number(expectedValue);
      case 'contains':
        if (typeof actualValue === 'string' && typeof expectedValue === 'string') {
          return actualValue.includes(expectedValue);
        }
        if (Array.isArray(actualValue)) {
          return actualValue.includes(expectedValue);
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * 安全边界检测（已弃用，保留用于向后兼容）
   *
   * @deprecated 使用新的基于 LLM 的安全边界检测机制（parseStructuredOutput + confirmSafetyViolation）
   * 对 AI 生成的消息进行关键词扫描，检测潜在的安全边界违反。
   * 这是事后检测机制，作为 LLM 指令跟随的兜底手段。
   *
   * 注意：关键词检测有误报风险，仅作辅助手段，不直接阻断 Action 执行。
   *
   * @param aiMessage AI 生成的消息
   * @returns 安全检查结果
   */
  protected checkSafetyBoundary(aiMessage: string): {
    passed: boolean;
    violations: Array<{
      category: 'diagnosis' | 'prescription' | 'guarantee' | 'crisis';
      matched_pattern: string;
      severity: 'warning' | 'critical';
    }>;
  } {
    const violations: Array<{
      category: 'diagnosis' | 'prescription' | 'guarantee' | 'crisis';
      matched_pattern: string;
      severity: 'warning' | 'critical';
    }> = [];

    // 诊断禁止检测
    const diagnosisPatterns = [
      /你有.{0,5}(抑郁|焦虑|抑郁症|焦虑症|强迫症|双相障碍)/,
      /这是.{0,10}(症|疾病|障碍)的.{0,5}表现/,
      /诊断为/,
      /患有/,
      /符合.{0,5}(症|疾病|障碍)的标准/,
    ];

    for (const pattern of diagnosisPatterns) {
      if (pattern.test(aiMessage)) {
        violations.push({
          category: 'diagnosis',
          matched_pattern: pattern.source,
          severity: 'warning',
        });
        break; // 同一类别只记录一次
      }
    }

    // 处方禁止检测
    const prescriptionPatterns = [
      /建议服用/,
      /吃.{0,5}药/,
      /剂量/,
      /药物治疗/,
      /可以尝试.{0,5}(药|保健品)/,
    ];

    for (const pattern of prescriptionPatterns) {
      if (pattern.test(aiMessage)) {
        violations.push({
          category: 'prescription',
          matched_pattern: pattern.source,
          severity: 'warning',
        });
        break;
      }
    }

    // 保证禁止检测
    const guaranteePatterns = [
      /一定会.{0,5}(好转|改善|恢复)/,
      /保证.{0,5}(效果|治愈)/,
      /肯定能.{0,5}(治好|解决)/,
    ];

    for (const pattern of guaranteePatterns) {
      if (pattern.test(aiMessage)) {
        violations.push({
          category: 'guarantee',
          matched_pattern: pattern.source,
          severity: 'warning',
        });
        break;
      }
    }

    // 危机信号检测（通过 crisis_detected 字段，由 LLM 输出）
    if (
      aiMessage.includes('crisis_detected: true') ||
      aiMessage.includes('"crisis_detected":true')
    ) {
      violations.push({
        category: 'crisis',
        matched_pattern: 'crisis_detected flag',
        severity: 'critical',
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }

  /**
   * 解析 LLM 输出的结构化 JSON（新安全机制）
   *
   * 从 LLM 输出的 JSON 中提取安全风险检测字段。
   * 支持清理 Markdown 代码块标记。
   *
   * @param aiMessage LLM 返回的原始文本（可能包含 ```json 标记）
   * @returns 结构化输出对象
   */
  protected parseStructuredOutput(aiMessage: string): StructuredActionOutput {
    const jsonText = this.cleanJsonOutput(aiMessage);

    try {
      const parsed = JSON.parse(jsonText);

      // 兼容性处理：确保所有必需字段存在
      return {
        content: parsed.content || '',
        safety_risk: {
          detected: parsed.safety_risk?.detected ?? false,
          risk_type: parsed.safety_risk?.risk_type ?? null,
          confidence: parsed.safety_risk?.confidence ?? 'high',
          reason: parsed.safety_risk?.reason ?? null,
        },
        metadata: {
          emotional_tone: parsed.metadata?.emotional_tone,
          crisis_signal: parsed.metadata?.crisis_signal ?? false,
        },
      };
    } catch (error: any) {
      console.error('[BaseAction] ❌ Failed to parse structured output:', error.message);
      console.error('[BaseAction] Raw text:', aiMessage);

      // 兜底：返回安全的默认值
      return {
        content: aiMessage, // 直接使用原始文本
        safety_risk: {
          detected: false,
          risk_type: null,
          confidence: 'high',
          reason: 'JSON parsing failed, using raw text',
        },
        metadata: {
          crisis_signal: false,
        },
      };
    }
  }

  /**
   * 二次 LLM 确认安全违规
   *
   * 当主 LLM 检测到潜在安全风险时，启动第二次 LLM 调用进行确认。
   * 这个方法需要 LLMOrchestrator 实例，由子类注入。
   *
   * @param originalResponse 原始回复内容
   * @param riskType 风险类型
   * @param reason 初步检测原因
   * @param llmOrchestrator LLM 编排器（由子类提供）
   * @returns 二次确认结果
   */
  protected async confirmSafetyViolation(
    originalResponse: string,
    riskType: string,
    reason: string,
    llmOrchestrator?: any
  ): Promise<SafetyConfirmationResult> {
    // 如果没有提供 LLM 编排器，直接确认违规（保守策略）
    if (!llmOrchestrator) {
      console.warn('[BaseAction] ⚠️ No LLM orchestrator provided, confirming violation by default');
      return {
        violation_confirmed: true,
        risk_level: 'high',
        detailed_reason: `Initial detection: ${reason}. No LLM orchestrator for confirmation.`,
        suggested_action: 'block',
      };
    }

    // 构建二次确认提示词
    const confirmationPrompt = `你是一个心理咨询安全审查专家。请对以下 AI 咨询师的回复进行安全边界检查。

【原始回复】
${originalResponse}

【初步检测结果】
- 风险类型：${riskType}
- 原因：${reason}

【安全边界规范】
1. 诊断禁止：不得对用户进行任何精神疾病诊断或症状判定
2. 处方禁止：不得推荐药物、剂量或治疗方案
3. 保证禁止：不得对疗效或改善做任何承诺或保证
4. 不适当建议：不得给出可能导致心理伤害或误导的建议

【你的任务】
请仔细分析原始回复，判断是否真的违反了安全边界规范。

输出 JSON 格式：
\`\`\`json
{
  "violation_confirmed": false,
  "risk_level": "low",
  "detailed_reason": "详细说明为什么违反或不违反",
  "suggested_action": "allow"
}
\`\`\`

注意：
- violation_confirmed: 是否确认违反（true/false）
- risk_level: 风险等级（critical/high/medium/low）
- suggested_action: 建议操作（block/warn/allow）`;

    try {
      // 调用 LLM
      const result = await llmOrchestrator.generateText(confirmationPrompt, {
        temperature: 0.3,
        maxTokens: 500,
      });

      // 解析响应
      const jsonText = this.cleanJsonOutput(result.text);
      const confirmation = JSON.parse(jsonText);

      return {
        violation_confirmed: confirmation.violation_confirmed ?? true,
        risk_level: confirmation.risk_level ?? 'high',
        detailed_reason: confirmation.detailed_reason ?? 'No reason provided',
        suggested_action: confirmation.suggested_action ?? 'block',
      };
    } catch (error: any) {
      console.error('[BaseAction] ❌ Safety confirmation failed:', error.message);

      // 确认失败，保守策略：确认违规
      return {
        violation_confirmed: true,
        risk_level: 'high',
        detailed_reason: `Confirmation failed: ${error.message}`,
        suggested_action: 'block',
      };
    }
  }

  /**
   * 生成安全兜底回复
   *
   * 当确认违反安全边界时，使用预定义的安全回复替代原始内容。
   *
   * @returns 安全兜底回复文本
   */
  protected generateSafeFallbackResponse(): string {
    return `抱歉，我刚才的回复可能不够准确。请注意，我是一个 AI 辅助工具，不能替代专业心理咨询师或医生。关于你的情况，建议咨询专业人士获取更准确的建议。

如果你需要紧急帮助，请拨打：
- 24小时心理危机干预热线：400-161-9995
- 紧急医疗服务：120`;
  }
}
