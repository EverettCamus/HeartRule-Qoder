/**
 * AiAskAction - AI向用户提问并提取答案
 *
 * 【DDD 视角】应用层服务 - Action 执行器
 * 负责将脚本中的 ai_ask 动作定义转化为实际执行过程
 *
 * 核心能力：
 * 1. 多轮追问：支持根据 exit 条件进行智能追问，直到收集足够信息
 * 2. 变量提取：从用户回答中提取结构化信息并写入合适作用域
 * 3. 提示词模板：支持两种模板（simple-ask / multi-round-ask）
 * 4. 退出决策：LLM 自动判断是否满足 exit 条件
 * 5. 作用域自动注册：自动将 output 变量注册到 topic 作用域
 *
 * 业务规则：
 * - 模板选择：有 exit 或 output 时使用 multi-round-ask，否则使用 simple-ask
 * - 变量作用域：未明确声明的 output 变量默认注册到 topic 作用域
 * - 退出条件：LLM 判断 BRIEF 是否满足 exit 条件
 *
 * 参照: legacy-python/src/actions/ai_ask.py
 */

import path from 'path';

import {
  VariableScope,
  EnhancedAskLLMOutputSchema,
  type EnhancedAskLLMOutput,
  type ExitCriteria,
} from '@heartrule/shared-types';

import { ExitDecisionEngine } from '../../engines/exit-decision/index.js';
import type { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager, TemplateResolver } from '../../engines/prompt-template/index.js';
import { createLogger } from '../../utils/logger.js';

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

const logger = createLogger('AiAskAction');

/**
 * 模板类型枚举
 */
enum AskTemplateType {
  SIMPLE = 'simple-ask', // 单轮简单问答
  MULTI_ROUND = 'multi-round-ask', // 多轮追问
}

export class AiAskAction extends BaseAction {
  static actionType = 'ai_ask';
  private llmOrchestrator?: LLMOrchestrator;
  private templateManager: PromptTemplateManager;
  private templateResolver: TemplateResolver;
  private templateType: AskTemplateType;
  private exitDecisionEngine: ExitDecisionEngine;

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.maxRounds = this.getConfig('max_rounds', 20);
    this.llmOrchestrator = llmOrchestrator;
    this.exitDecisionEngine = new ExitDecisionEngine();

    // 计算模板路径
    const templateBasePath = this.resolveTemplatePath();
    logger.info('📁 Template path:', { path: templateBasePath });
    this.templateManager = new PromptTemplateManager(templateBasePath);
    // TemplateResolver 需要项目根目录，但此时还没有context，暂不初始化
    this.templateResolver = null as any; // 延迟初始化

    // 选择模板类型：有 exit_condition 或 output 使用多轮追问模板，否则使用简单问答模板
    this.templateType =
      this.getConfig('output')?.length > 0 || this.getConfig('exit_condition')
        ? AskTemplateType.MULTI_ROUND
        : AskTemplateType.SIMPLE;

    // 设置退出策略：ai_ask 支持多轮退出（仅对多轮追问模式）
    this.exitPolicy = {
      supportsExit: this.templateType === AskTemplateType.MULTI_ROUND,
      enabledSources: ['max_rounds', 'exit_flag', 'llm_suggestion'],
    };

    logger.debug('🔧 Constructor', {
      templateType: this.templateType,
      hasOutput: !!this.getConfig('output')?.length,
      hasExitCondition: !!this.getConfig('exit_condition'),
      maxRounds: this.maxRounds,
      supportsExit: this.exitPolicy.supportsExit,
    });
  }

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    try {
      // 🔧 首次执行时：预注册 output 变量定义到 scopeResolver
      if (this.currentRound === 0 && context.scopeResolver && this.config.output) {
        this.registerOutputVariables(context);
      }

      // 统一使用模板驱动执行
      if (!this.llmOrchestrator) {
        return {
          success: false,
          completed: true,
          error: 'LLM Orchestrator not available',
        };
      }

      // 多轮追问模板需要循环逻辑
      if (this.templateType === AskTemplateType.MULTI_ROUND) {
        return await this.executeMultiRound(context, userInput);
      } else {
        return await this.executeSimple(context, userInput);
      }
    } catch (e: any) {
      logger.error('❌ [execute] Exception caught:', {
        message: e.message,
        stack: e.stack?.split('\n').slice(0, 3).join('\n'),
      });
      return {
        success: false,
        completed: true,
        error: `ai_ask execution error: ${e.message}`,
      };
    }
  }

  /**
   * 多轮追问模式执行
   */
  private async executeMultiRound(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult> {
    logger.info('🔍 [executeMultiRound] START', { currentRound: this.currentRound });

    // 第一轮：生成初始问题
    if (this.currentRound === 0) {
      this.currentRound += 1;
      logger.info('🔍 [executeMultiRound] Round 0: generating initial question');
      const result = await this.generateQuestionFromTemplate(context, AskTemplateType.MULTI_ROUND);
      return {
        ...result,
        completed: false,
        metadata: {
          ...result.metadata,
          waitingFor: 'answer',
        },
      };
    }

    // 后续轮次：处理用户回答并判断是否继续
    if (!userInput || userInput.trim() === '') {
      return {
        success: true,
        completed: false,
        aiMessage: '请提供您的回答。',
        metadata: {
          actionType: AiAskAction.actionType,
          validationFailed: true,
          retryCount: this.currentRound - 1,
        },
      };
    }

    // 递增轮次，确保 LLM 看到正确的当前轮次
    this.currentRound += 1;

    // 调用 LLM 生成下一轮问题或决定退出
    const llmResult = await this.generateQuestionFromTemplate(context, AskTemplateType.MULTI_ROUND);

    // 提取 LLM 输出的原始数据
    const llmOutput: Partial<EnhancedAskLLMOutput> = llmResult.metadata?.llmRawOutput
      ? EnhancedAskLLMOutputSchema.parse(
          JSON.parse(this.cleanJsonOutput(llmResult.metadata.llmRawOutput))
        )
      : {};

    // 使用ExitDecisionEngine进行综合决策
    const exitCriteria = this.buildExitCriteriaFromConfig();
    const decisionContext = {
      currentRound: this.currentRound,
      totalTokens: this.calculateTokensUsed(context),
      estimatedCost: this.estimateCost(context),
      userInputLength: (userInput || '').length,
      silentRounds: this.calculateSilentRounds(context, userInput),
      collectedVariables: this.getCollectedVariables(context),
      requiredVariables: exitCriteria.required_variables || [],
      llmOutput: llmOutput as EnhancedAskLLMOutput,
    };

    const exitDecision = this.exitDecisionEngine.evaluate(exitCriteria, decisionContext);

    // 计算 exit_reason
    // 优先级：LLM输出的exit_reason > 规则推断
    let exitReason: string | undefined;
    if (llmOutput.exit_reason) {
      exitReason = llmOutput.exit_reason;
    } else if (exitDecision.ruleExit) {
      exitReason = '达到最大轮次';
    } else if (exitDecision.llmExit) {
      exitReason = 'LLM建议退出';
    }

    logger.debug('🎯 Exit decision', { exitDecision, exit_reason: exitReason });

    if (exitDecision.shouldExit) {
      logger.info('✅ Decided to exit', { reason: exitDecision.reason });
      const finalResult = await this.finishAction(context, userInput);

      // LLM 当前轮直接从用户输入提取的变量优先
      // finishAction 从历史 JSON 回退提取，可能返回占位值（如"未收集"）
      // 用 LLM 提取的真实值覆盖 finishAction 的占位值
      const llmExtractedVars = this.extractVariablesFromJson(llmOutput as EnhancedAskLLMOutput);
      const mergedExtractedVariables = {
        ...(finalResult.extractedVariables || {}),
        ...(llmExtractedVars || {}),
      };

      return {
        ...finalResult,
        extractedVariables: mergedExtractedVariables,
        aiMessage: llmResult.aiMessage || finalResult.aiMessage,
        debugInfo: llmResult.debugInfo,
        metadata: {
          ...finalResult.metadata,
          ...llmResult.metadata,
          exit_reason: exitReason,
          exit_decision: exitDecision,
        },
      };
    }

    // 继续追问
    return {
      ...llmResult,
      completed: false,
      metadata: {
        ...llmResult.metadata,
        waitingFor: 'answer',
        continueAsking: true,
        currentRound: this.currentRound,
        exitDecision,
        exit_reason: exitReason, // 添加exit_reason
      },
    };
  }

  /**
   * 简单问答模式执行
   */
  private async executeSimple(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult> {
    logger.debug('📝 Using simple mode', { currentRound: this.currentRound });

    // 变量提取目标
    const extractTo =
      this.config.target_variable ||
      this.config.targetVariable ||
      this.config.extract_to ||
      this.config.extractTo ||
      '';

    // 第一轮：发送问题
    if (this.currentRound === 0) {
      this.currentRound += 1;
      const result = await this.generateQuestionFromTemplate(context, AskTemplateType.SIMPLE);
      return {
        ...result,
        completed: false,
        metadata: {
          ...result.metadata,
          waitingFor: 'answer',
          extractTo,
        },
      };
    }

    // 后续轮次：直接提取用户输入
    if (!userInput || userInput.trim() === '') {
      return {
        success: true,
        completed: false,
        aiMessage: '请提供您的回答。',
        metadata: {
          actionType: AiAskAction.actionType,
          validationFailed: true,
        },
      };
    }

    // 提取变量
    const extractedVariables: Record<string, any> = {};
    if (extractTo) {
      extractedVariables[extractTo] = userInput.trim();
    }

    this.currentRound = 0;

    return {
      success: true,
      completed: true,
      aiMessage: null,
      extractedVariables,
      metadata: {
        actionType: AiAskAction.actionType,
        answerReceived: true,
        extractTo,
      },
    };
  }

  /**
   * 使用模板生成问题（两层方案机制）
   */
  private async generateQuestionFromTemplate(
    context: ActionContext,
    templateType: AskTemplateType
  ): Promise<ActionResult> {
    logger.info('🔍 [generateQuestionFromTemplate] START', {
      templateType,
      round: this.currentRound,
    });

    // 1. 加载模板
    const { resolution, template } = await this.loadTemplate(context);

    // 2. 准备变量
    const scriptVariables = this.extractScriptVariables(context);
    const systemVariables = this.buildSystemVariables(context);
    const monitorFeedback = this.getMonitorFeedback(context);

    // 3. 构造提示词
    const prompt = this.buildPrompt(
      template.content,
      scriptVariables,
      systemVariables,
      monitorFeedback
    );
    logger.info('🔍 [generateQuestionFromTemplate] Prompt built', { promptLength: prompt.length });

    // 4. 调用 LLM
    logger.info('🔍 [generateQuestionFromTemplate] Calling LLM...');
    const llmResult = await this.callLLM(prompt);
    logger.info('🔍 [generateQuestionFromTemplate] LLM response received', {
      textLength: llmResult.text?.length,
    });

    // 5. 安全检测
    const safetyCheck = this.checkSafetyBoundary(llmResult.text);

    // 6. 解析响应
    const result = this.parseLLMResponse(llmResult, templateType, resolution, safetyCheck);
    logger.info('🔍 [generateQuestionFromTemplate] END', {
      success: result.success,
      completed: result.completed,
      aiMessageLength: result.aiMessage?.length,
    });
    return result;
  }

  /**
   * 从 JSON 中提取变量
   */
  private extractVariablesFromJson(llmOutput: EnhancedAskLLMOutput): Record<string, any> {
    const extractedVariables: Record<string, any> = {};
    const outputConfig = this.getConfig('output', []);
    const llmOutputRecord = llmOutput as unknown as Record<string, unknown>;

    if (outputConfig.length > 0) {
      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        const value = llmOutputRecord[varName];
        if (this.isValidVariableValue(value)) {
          extractedVariables[varName] = value;
          logger.info('✅ Extracted variable from JSON', {
            name: varName,
            value: String(value).substring(0, 50),
          });
        } else {
          logger.info('⏭️ Skipped invalid variable value', {
            name: varName,
            value: String(value).substring(0, 50),
            valueType: typeof value,
          });
        }
      }
    }
    return extractedVariables;
  }

  /**
   * 检查变量值是否有效（非空、非占位符）
   */
  private isValidVariableValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value !== 'string') {
      return true;
    }
    const trimmed = value.trim();
    if (trimmed === '') {
      return false;
    }
    const placeholderPatterns = [
      /^\(?(未收集|未提供|暂无|无|N\/A|n\/a|null)\)?$/i,
      /^\(未收集\)$/,
      /^\(未提供\)$/,
    ];
    return !placeholderPatterns.some((pattern) => pattern.test(trimmed));
  }

  /**
   * 完成动作并提取变量
   */
  private async finishAction(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult> {
    const extractedVariables: Record<string, any> = {};
    const outputConfig = this.getConfig('output', []);

    for (const varConfig of outputConfig) {
      const varName = varConfig.get;
      const varDefine = varConfig.define || '';
      if (!varName) continue;

      // 策略1: 从历史 JSON 提取
      let value = this.findVariableInHistory(context, varName);

      // 策略2: LLM 提取
      if (value === undefined && this.llmOrchestrator && varDefine) {
        value = await this.extractVariableByLlm(context, varName, varDefine);
      }

      // 策略3: 兜底最后一次输入
      if (value === undefined && userInput) {
        value = userInput.trim();
        logger.warn('⚠️ Fallback to user input', { varName });
      }

      if (value !== undefined) {
        extractedVariables[varName] = value;
      }
    }

    // 向后兼容
    const targetVariable = this.getConfig('target_variable');
    if (targetVariable && !extractedVariables[targetVariable] && userInput) {
      extractedVariables[targetVariable] = userInput.trim();
    }

    this.currentRound = 0;

    return {
      success: true,
      completed: true,
      aiMessage: null,
      extractedVariables,
      metadata: {
        actionType: AiAskAction.actionType,
        extractedCount: Object.keys(extractedVariables).length,
      },
    };
  }

  /**
   * 从对话历史的 JSON 中寻找变量
   */
  private findVariableInHistory(context: ActionContext, varName: string): any {
    for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
      const msg = context.conversationHistory[i];
      if (msg.role === 'assistant' && msg.metadata?.llmRawOutput) {
        try {
          const jsonData = JSON.parse(this.cleanJsonOutput(msg.metadata.llmRawOutput));
          if (
            jsonData[varName] !== undefined &&
            jsonData[varName] !== null &&
            jsonData[varName] !== ''
          ) {
            return jsonData[varName];
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return undefined;
  }

  /**
   * 通过 LLM 提取变量
   */
  private async extractVariableByLlm(
    context: ActionContext,
    varName: string,
    varDefine: string
  ): Promise<any> {
    try {
      const extractPrompt = this.buildExtractionPrompt(context, varName, varDefine);
      const result = await this.llmOrchestrator!.generateText(extractPrompt, {
        temperature: 0.3,
        maxTokens: 500,
      });
      return result.text.trim();
    } catch (error: any) {
      logger.error('❌ LLM extraction failed', { varName, error: error.message });
      return undefined;
    }
  }

  /**
   * 提取脚本层变量
   */
  private extractScriptVariables(context: ActionContext): Map<string, any> {
    const variables = this.extractCommonProfileVariables(context);

    // 提问任务
    // 提问任务 - 支持 content、question_template、prompt_template 字段，优先级依次降低
    // 提问任务 - 支持 content、question_template、prompt_template 字段，优先级依次降低
    const taskTemplate =
      this.getConfig('content') ||
      this.getConfig('question_template') ||
      this.getConfig('prompt_template') ||
      '';
    const task = this.substituteVariables(taskTemplate, context);
    variables.set('task', task);

    // 退出条件文本描述
    const exitCondition = this.getConfig('exit_condition', '用户提供了足够的信息');
    variables.set('exit_condition', exitCondition);

    return variables;
  }

  /**
   * 构建系统变量
   */
  private buildSystemVariables(context: ActionContext): Record<string, any> {
    // 当前时间
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

    // AI 角色
    const who = '心理咨询师';
    const aiRole = this.getConfig('ai_role', '咨询师');

    // 用户信息
    const user = context.variables['用户名'] || '来访者';

    // 语气风格
    const tone = this.getConfig('tone', '温和、同理心、专业');

    // 对话历史（取最近5条）
    const recentHistory = context.conversationHistory.slice(-5);
    const chat = recentHistory
      .map((msg) => `${msg.role === 'user' ? user : who}: ${msg.content}`)
      .join('\n');

    logger.debug('📊 buildSystemVariables', {
      conversationHistoryLength: context.conversationHistory.length,
      chatLength: chat.length,
    });

    // 构建 output_list（多变量输出格式）
    const outputList = this.buildOutputList();

    // 构建已收集变量列表
    const collectedVariables = this.buildCollectedVariables(context);

    logger.debug('📊 buildSystemVariables', {
      currentRound: this.currentRound,
      maxRounds: this.maxRounds,
    });

    return {
      time,
      who,
      user,
      tone,
      chat,
      ai_role: aiRole,
      output_list: outputList,
      current_round: this.currentRound,
      max_rounds: this.maxRounds,
      collected_variables: collectedVariables,
    };
  }

  /**
   * 构建已收集变量列表
   */
  private buildCollectedVariables(context: ActionContext): string {
    const outputConfig = this.getConfig('output', []);
    if (outputConfig.length === 0) {
      return '';
    }

    const lines: string[] = ['已收集变量：'];
    for (const varConfig of outputConfig) {
      const varName = varConfig.get;
      if (!varName) continue;

      const value = context.variables[varName];
      if (value !== undefined && value !== null && value !== '') {
        lines.push(`- ${varName}: ${String(value).substring(0, 50)}`);
      } else {
        lines.push(`- ${varName}: (未收集)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 构建多变量输出格式字符串
   */
  private buildOutputList(): string {
    const outputConfig = this.getConfig('output', []);

    // 如果没有配置 output，返回空字符串
    if (outputConfig.length === 0) {
      return '';
    }

    // 生成格式化的输出列表（包括单个和多个变量）
    const lines: string[] = [];
    for (let i = 0; i < outputConfig.length; i++) {
      const varConfig = outputConfig[i];
      const varName = varConfig.get;
      const varDefine = varConfig.define || '';

      if (!varName) continue;

      // 构建 JSON 字段
      const isLast = i === outputConfig.length - 1;
      const comma = isLast ? '' : ',';

      if (varDefine) {
        // 带注释的格式
        lines.push(`  "${varName}": "提取的${varName}"${comma} // ${varDefine}`);
      } else {
        // 不带注释的格式
        lines.push(`  "${varName}": "提取的${varName}"${comma}`);
      }
    }

    // 用换行连接所有行，不需要前置逗号（模板中已有）
    if (lines.length > 0) {
      return lines.join('\n');
    }

    return '';
  }

  /**
   * 构建变量提取提示词
   */
  private buildExtractionPrompt(
    context: ActionContext,
    varName: string,
    varDefine: string
  ): string {
    const recentHistory = context.conversationHistory.slice(-10);
    const historyText = recentHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n');

    return `从以下对话中提取信息：

【对话历史】
${historyText}

【提取任务】
变量名：${varName}
提取要求：${varDefine}

请直接输出提取到的内容，不要添加任何解释。`;
  }

  /**
   * 解析多轮JSON输出（支持3次重试机制）
   */
  private parseMultiRoundOutput(rawResponse: string): {
    output: EnhancedAskLLMOutput;
    cleanedResponse: string;
    parseError?: {
      retryCount: number;
      strategies: string[];
      finalError: string;
    };
  } {
    const MAX_PARSE_RETRY = 3;
    const RETRY_STRATEGIES = [
      'direct_parse', // 直接解析
      'trim_and_parse', // 去除空白后解析
      'extract_json_block', // 提取JSON代码块
    ];

    let parseAttempt = 0;
    let lastError: Error | null = null;
    let cleanedResponse = rawResponse;

    for (const strategy of RETRY_STRATEGIES) {
      parseAttempt++;

      try {
        cleanedResponse = this.applyParseStrategy(rawResponse, strategy);
        const parsedJson = JSON.parse(cleanedResponse);

        // 使用 safeParse 进行类型转换和验证
        const schemaResult = EnhancedAskLLMOutputSchema.safeParse(parsedJson);

        if (!schemaResult.success) {
          // Schema验证失败，记录错误但继续处理
          logger.warn('Schema验证失败', { errors: schemaResult.error.errors });
          throw new Error(`Schema validation failed: ${schemaResult.error.message}`);
        }

        const output = schemaResult.data;

        // 解析成功，记录日志
        if (parseAttempt > 1) {
          logger.warn('JSON解析重试成功', { attempt: parseAttempt, strategy });
        }

        return {
          output,
          cleanedResponse,
          parseError:
            parseAttempt > 1
              ? {
                  retryCount: parseAttempt,
                  strategies: RETRY_STRATEGIES.slice(0, parseAttempt),
                  finalError: '',
                }
              : undefined,
        };
      } catch (e: any) {
        lastError = e;
        logger.warn('JSON解析失败', { attempt: parseAttempt, strategy, error: e.message });

        if (parseAttempt >= MAX_PARSE_RETRY) {
          // 重试耗尽，使用降级策略
          logger.error('JSON解析重试耗尽，使用降级默认值');
          logger.error('最后错误:', { error: lastError?.message });
          logger.error('原始响应', { chars: rawResponse.length });

          // 构造降级结果
          return {
            output: this.getDefaultAskOutput(rawResponse),
            cleanedResponse: rawResponse,
            parseError: {
              retryCount: parseAttempt,
              strategies: RETRY_STRATEGIES,
              finalError: lastError?.message || 'Unknown error',
            },
          };
        }
      }
    }

    // 应该不会达到这里，但为了TypeScript类型安全
    return {
      output: this.getDefaultAskOutput(rawResponse),
      cleanedResponse: rawResponse,
      parseError: {
        retryCount: MAX_PARSE_RETRY,
        strategies: RETRY_STRATEGIES,
        finalError: lastError?.message || 'Unknown error',
      },
    };
  }

  /**
   * 应用解析策略
   */
  private applyParseStrategy(rawResponse: string, strategy: string): string {
    switch (strategy) {
      case 'direct_parse':
        return this.cleanJsonOutput(rawResponse);

      case 'trim_and_parse':
        return this.cleanJsonOutput(rawResponse).trim();

      case 'extract_json_block': {
        // 提取markdown代码块中的JSON
        const match = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          return match[1].trim();
        }
        return this.cleanJsonOutput(rawResponse).trim();
      }

      default:
        return this.cleanJsonOutput(rawResponse);
    }
  }

  /**
   * 获取默认Ask输出（解析失败时降级）
   */
  private getDefaultAskOutput(rawResponse: string): EnhancedAskLLMOutput {
    return {
      content: rawResponse.trim(),
      assessment: 'JSON解析失败，使用默认评估',
      progress: '进度评估不可用',
      exit: 'false',
      exit_reason: '继续收集',
      brief: 'LLM输出JSON解析失败',
      crisis_detected: false,
    };
  }

  /**
   * 注册 output 变量到 scopeResolver
   */
  private registerOutputVariables(context: ActionContext): void {
    logger.info('🔧 Registering output variables to scopeResolver');
    const outputConfig = this.config.output || [];

    for (const varConfig of outputConfig) {
      const varName = varConfig.get;
      if (!varName) continue;

      // 检查是否已经在 variableStore 中定义
      const existingDef = context.scopeResolver!.getVariableDefinition(varName);

      if (!existingDef) {
        // Check if this variable is registered as global
        const scope = context.scopeResolver?.isGlobalVariable(varName)
          ? VariableScope.GLOBAL
          : VariableScope.TOPIC;

        context.scopeResolver!.setVariableDefinition({
          name: varName,
          scope,
          define: varConfig.define || `Auto-registered from ai_ask output: ${varName}`,
        });
        logger.info(`✅ Auto-registered variable "${varName}" in ${scope} scope`);
      } else {
        logger.info('ℹ️ Variable already defined', {
          varName,
          scope: existingDef.scope,
        });
      }
    }
  }

  /**
   * 加载模板
   */
  private async loadTemplate(context: ActionContext): Promise<{ resolution: any; template: any }> {
    // 1. 从 session 配置读取 template_scheme
    const sessionConfig = {
      template_scheme: context.metadata?.sessionConfig?.template_scheme,
    };

    logger.debug('📄 Loading template with config', {
      template_scheme: sessionConfig.template_scheme,
      projectId: context.metadata?.projectId,
      hasTemplateProvider: !!context.metadata?.templateProvider,
    });

    // 2. 🎯 WI-3: 从 context 中提取 projectId 和 templateProvider
    const projectId = context.metadata?.projectId;
    const templateProvider = context.metadata?.templateProvider;

    // 3. 初始化 TemplateResolver（延迟初始化）
    if (!this.templateResolver) {
      // 💉 使用 projectId 初始化，如果有 templateProvider 则注入
      const projectRoot = this.resolveProjectRoot(context);
      logger.debug('📂 Using project root', { projectRoot });

      if (projectId && templateProvider) {
        logger.debug('💉 Initializing TemplateResolver with projectId and provider');
        this.templateResolver = new TemplateResolver(projectId, templateProvider);
      } else {
        logger.debug('📂 Initializing TemplateResolver with project path (fallback mode)');
        this.templateResolver = new TemplateResolver(projectRoot);
      }
    }

    // 💉 如果 TemplateManager 未初始化 provider，重新初始化
    if (projectId && templateProvider && !this.templateManager['templateProvider']) {
      logger.debug('💉 Re-initializing TemplateManager with projectId and provider');
      // 🚨 关键修复：清除旧缓存，避免 custom/default 模板缓存冲突
      this.templateManager.clearCache();
      this.templateManager = new PromptTemplateManager(projectId, templateProvider);
    }

    // 4. 解析模板路径（使用两层解析）
    const resolution = await this.templateResolver.resolveTemplatePath(
      AiAskAction.actionType, // 使用静态 actionType
      sessionConfig
    );

    logger.debug('📝 Template resolved', {
      path: resolution.path,
      layer: resolution.layer,
      scheme: resolution.scheme,
      exists: resolution.exists,
    });

    // 5. 加载模板
    //    - 数据库模式：直接使用相对路径（resolution.path）
    //    - 文件系统模式：拼接完整路径
    let template;
    if (projectId && templateProvider) {
      // 数据库模式：TemplateManager 会使用 templateProvider.getTemplate()
      logger.debug('📂 Loading template from database', { path: resolution.path });
      template = await this.templateManager.loadTemplate(resolution.path);
    } else {
      // 文件系统模式：需要拼接项目根目录
      const projectRoot = this.resolveProjectRoot(context);
      const fullPath = path.join(projectRoot, resolution.path);
      logger.debug('📂 Loading template from filesystem', { fullPath });
      template = await this.templateManager.loadTemplate(fullPath);
    }

    return { resolution, template };
  }

  /**
   * 获取监控反馈
   */
  private getMonitorFeedback(context: ActionContext): string {
    let monitorFeedback = '';
    if (context.metadata?.latestMonitorFeedback) {
      monitorFeedback = `\n\n${context.metadata.latestMonitorFeedback}`;
      logger.debug('📝 检测到监控反馈', {
        chars: monitorFeedback.length,
        preview: monitorFeedback.substring(0, 100),
      });
    }
    return monitorFeedback;
  }

  /**
   * 构造提示词
   */
  private buildPrompt(
    templateContent: string,
    scriptVariables: Map<string, any> | Record<string, any>,
    systemVariables: Record<string, any>,
    monitorFeedback: string
  ): string {
    // 将 scriptVariables 转换为 Map（如果它是普通对象）
    const scriptVarsMap =
      scriptVariables instanceof Map ? scriptVariables : new Map(Object.entries(scriptVariables));

    let prompt = this.templateManager.substituteVariables(
      templateContent,
      scriptVarsMap,
      systemVariables
    );
    if (monitorFeedback) {
      prompt = prompt + monitorFeedback;
    }
    const model = this.getConfig('model', 'unknown');
    logger.debug('📝 Prompt prepared', { chars: prompt.length, model });
    return prompt;
  }
  /**
   * 调用 LLM
   */
  private async callLLM(prompt: string) {
    if (!this.llmOrchestrator) {
      throw new Error('[callLLM] LLM Orchestrator is null');
    }
    try {
      return await this.llmOrchestrator.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 4096,
        responseFormat: { type: 'json_object' },
      });
    } catch (e: any) {
      logger.error('❌ [callLLM] LLM call failed:', {
        message: e.message,
        promptLength: prompt.length,
      });
      throw e;
    }
  }

  /**
   * 解析 LLM 响应
   */
  private parseLLMResponse(
    llmResult: any,
    templateType: AskTemplateType,
    resolution: any,
    safetyCheck: any
  ): ActionResult {
    if (templateType === AskTemplateType.SIMPLE) {
      // 简单模式：解析 JSON 响应并提取 content 字段
      const jsonText = this.cleanJsonOutput(llmResult.text);
      let llmOutput: any;
      try {
        llmOutput = JSON.parse(jsonText);
      } catch (error) {
        // 如果解析失败，直接使用原始文本
        logger.warn('⚠️ Failed to parse simple-mode JSON, using raw text');
        llmOutput = { content: llmResult.text.trim() };
      }

      // 提取 content 字段
      const aiMessage = llmOutput.content || llmResult.text.trim();

      return {
        success: true,
        completed: false,
        aiMessage,
        debugInfo: llmResult.debugInfo,
        metadata: {
          actionType: AiAskAction.actionType,
          currentRound: this.currentRound,
          template_path: resolution.path,
          template_layer: resolution.layer,
          template_scheme: resolution.scheme,
          safety_check: safetyCheck,
        },
      };
    } else {
      // 多轮模式：解析 JSON 响应（支持3次重试机制）
      const parseResult = this.parseMultiRoundOutput(llmResult.text);
      const llmOutput = parseResult.output;

      // 🔧 立即提取 output 中配置的变量
      const extractedVariables = this.extractVariablesFromJson(llmOutput);

      // 判断是否退出
      const shouldExit = llmOutput.exit === 'true';

      // 提取 AI 消息：优先使用 content 字段（新格式）
      const aiMessage = llmOutput.content || '';

      // 检查危机信号
      const crisisDetected = llmOutput.crisis_detected || false;

      // 如果检测到明显危机，启动危机处理流程
      if (crisisDetected) {
        // TODO: 同步启动危机处理LLM，评估是否修订回复
        logger.warn('⚠️ 危机信号检测到，启动危机处理流程');
      }

      return {
        success: true,
        completed: false,
        aiMessage,
        extractedVariables:
          Object.keys(extractedVariables).length > 0 ? extractedVariables : undefined,
        debugInfo: llmResult.debugInfo,
        metadata: {
          actionType: AiAskAction.actionType,
          shouldExit,
          exit_reason: llmOutput.exit_reason,
          brief: llmOutput.brief,
          assessment: llmOutput.assessment,
          progress: llmOutput.progress,
          safety_check: llmOutput.safety_check,
          crisis_detected: crisisDetected,
          currentRound: this.currentRound,
          llmRawOutput: parseResult.cleanedResponse,
          template_path: resolution.path,
          template_layer: resolution.layer,
          template_scheme: resolution.scheme,
          parseError: (parseResult.parseError?.retryCount || 0) > 1,
          parseRetryCount: parseResult.parseError?.retryCount || 0,
          parseErrorDetails: parseResult.parseError,
        },
      };
    }
  }

  private buildExitCriteriaFromConfig(): ExitCriteria {
    return {
      max_rounds: this.getConfig('max_rounds'),
      required_variables: this.getConfig('output')
        ?.map((v: any) => v.get)
        .filter(Boolean),
    };
  }

  private calculateTokensUsed(context: ActionContext): number {
    const historyText = context.conversationHistory.map((msg) => msg.content).join(' ');
    return Math.ceil(historyText.length / 4);
  }

  private estimateCost(context: ActionContext): number {
    const tokens = this.calculateTokensUsed(context);
    return (tokens / 1000) * 0.0015;
  }

  private calculateSilentRounds(context: ActionContext, userInput?: string | null): number {
    if (!userInput || userInput.trim().length < 5) {
      return (context.metadata?.silentRounds || 0) + 1;
    }
    return 0;
  }

  private getCollectedVariables(context: ActionContext): string[] {
    const outputConfig = this.getConfig('output', []);
    return outputConfig
      .map((v: any) => v.get)
      .filter((name: string) => {
        const position = { phaseId: '', topicId: '', actionId: this.actionId };
        const value =
          context.scopeResolver?.resolveVariable(name, position)?.value || context.variables[name];
        return this.isValidVariableValue(value);
      });
  }
}
