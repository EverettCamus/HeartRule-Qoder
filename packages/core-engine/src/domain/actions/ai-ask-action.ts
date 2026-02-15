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

import { VariableScope } from '@heartrule/shared-types';

import type { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager, TemplateResolver } from '../../engines/prompt-template/index.js';

import { BaseAction } from './base-action.js';
import type {
  ActionContext,
  ActionResult,
  ActionMetrics,
  ProgressSuggestion,
  ExitReason,
} from './base-action.js';

interface AskLLMOutput {
  // 新格式字段
  content?: string;
  EXIT: string;
  BRIEF?: string;
  metrics?: ActionMetrics; // 精细化状态指标
  progress_suggestion?: ProgressSuggestion; // 进度建议
  safety_risk?: {
    detected: boolean;
    risk_type: string | null;
    confidence: 'high' | 'medium' | 'low';
    reason: string | null;
  };
  metadata?: {
    emotional_tone?: string;
    crisis_signal?: boolean;
    style_adaptation?: {
      user_reply_length: number;
      suggested_style: 'open' | 'choice' | 'example_guided';
      style_used: 'open' | 'choice' | 'example_guided' | 'mixed';
      adaptation_reason: string;
    };
  };

  // 兼容旧格式：支持动态的 ai_role 字段
  [key: string]: any;
}

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

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.maxRounds = this.getConfig('max_rounds', 3);
    this.llmOrchestrator = llmOrchestrator;

    // 计算模板路径
    const templateBasePath = this.resolveTemplatePath();
    console.log(`[AiAskAction] 📁 Template path: ${templateBasePath}`);
    this.templateManager = new PromptTemplateManager(templateBasePath);
    // TemplateResolver 需要项目根目录，但此时还没有context，暂不初始化
    this.templateResolver = null as any; // 延迟初始化

    // 选择模板类型：有 exit 或 output 使用多轮追问模板，否则使用简单问答模板
    this.templateType =
      this.getConfig('output')?.length > 0 || this.getConfig('exit')
        ? AskTemplateType.MULTI_ROUND
        : AskTemplateType.SIMPLE;

    // 设置退出策略：ai_ask 支持多轮退出（仅对多轮追问模式）
    this.exitPolicy = {
      supportsExit: this.templateType === AskTemplateType.MULTI_ROUND,
      enabledSources: ['max_rounds', 'exit_flag', 'llm_suggestion'],
    };

    console.log(`[AiAskAction] 🔧 Constructor: templateType=${this.templateType}, config:`, {
      hasOutput: !!this.getConfig('output')?.length,
      hasExit: !!this.getConfig('exit'),
      maxRounds: this.maxRounds,
      supportsExit: this.exitPolicy.supportsExit,
    });
  }

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    try {
      // 🔧 首次执行时：预注册 output 变量定义到 scopeResolver
      if (this.currentRound === 0 && context.scopeResolver && this.config.output) {
        console.log(`[AiAskAction] 🔧 Registering output variables to scopeResolver`);
        const outputConfig = this.config.output || [];

        for (const varConfig of outputConfig) {
          const varName = varConfig.get;
          if (!varName) continue;

          // 检查是否已经在 variableStore 中定义
          const existingDef = context.scopeResolver.getVariableDefinition(varName);

          if (!existingDef) {
            // 未定义，自动在 topic 作用域中注册
            context.scopeResolver.setVariableDefinition({
              name: varName,
              scope: VariableScope.TOPIC,
              define: varConfig.define || `Auto-registered from ai_ask output: ${varName}`,
            });
            console.log(`[AiAskAction] ✅ Auto-registered variable "${varName}" in topic scope`);
          } else {
            console.log(
              `[AiAskAction] ℹ️ Variable "${varName}" already defined in ${existingDef.scope} scope`
            );
          }
        }
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
    console.log(`[AiAskAction] 📝 Using template mode (round: ${this.currentRound})`);

    // 第一轮：生成初始问题
    if (this.currentRound === 0) {
      this.currentRound += 1;
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

    // 调用 LLM 生成下一轮问题或决定退出
    const llmResult = await this.generateQuestionFromTemplate(context, AskTemplateType.MULTI_ROUND);

    // 提取 metrics 和 progress_suggestion（从 llmResult 中）
    const metrics = llmResult.metrics;
    const progressSuggestion = llmResult.progress_suggestion;

    // 提取 LLM 输出的原始数据
    const llmOutput = llmResult.metadata?.llmRawOutput
      ? JSON.parse(this.cleanJsonOutput(llmResult.metadata.llmRawOutput))
      : {};

    // 使用统一的退出决策方法
    const exitDecision = this.evaluateExitCondition(context, llmOutput);

    // 计算 exit_reason
    let exitReason: ExitReason | undefined;
    if (this.currentRound >= this.maxRounds) {
      exitReason = 'max_rounds_reached';
    } else if (exitDecision.should_exit && exitDecision.decision_source === 'exit_flag') {
      exitReason = 'exit_criteria_met';
    } else if (progressSuggestion === 'blocked') {
      exitReason = 'user_blocked';
    } else if (progressSuggestion === 'off_topic') {
      exitReason = 'off_topic';
    }

    console.log(`[AiAskAction] 🎯 Exit decision:`, exitDecision, `exit_reason:`, exitReason);

    if (exitDecision.should_exit) {
      console.log(`[AiAskAction] ✅ Decided to exit: ${exitDecision.reason}`);
      const finalResult = await this.finishAction(context, userInput);
      return {
        ...finalResult,
        metrics, // 保留metrics
        progress_suggestion: progressSuggestion, // 保留progress_suggestion
        metadata: {
          ...finalResult.metadata,
          exit_reason: exitReason,
        },
      };
    }

    // 继续追问
    this.currentRound += 1;
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
    console.log(`[AiAskAction] 📝 Using simple mode (round: ${this.currentRound})`);

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
    // 1. 从 session 配置读取 template_scheme
    const sessionConfig = {
      template_scheme: context.metadata?.sessionConfig?.template_scheme,
    };

    console.log('[AiAskAction] 📄 Loading template with config:', {
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
      console.log('[AiAskAction] 📂 Using project root:', projectRoot);

      if (projectId && templateProvider) {
        console.log('[AiAskAction] 💉 Initializing TemplateResolver with projectId and provider');
        this.templateResolver = new TemplateResolver(projectId, templateProvider);
      } else {
        console.log(
          '[AiAskAction] 📂 Initializing TemplateResolver with project path (fallback mode)'
        );
        this.templateResolver = new TemplateResolver(projectRoot);
      }
    }

    // 💉 如果 TemplateManager 未初始化 provider，重新初始化
    if (projectId && templateProvider && !this.templateManager['templateProvider']) {
      console.log('[AiAskAction] 💉 Re-initializing TemplateManager with projectId and provider');
      // 🚨 关键修复：清除旧缓存，避免 custom/default 模板缓存冲突
      this.templateManager.clearCache();
      this.templateManager = new PromptTemplateManager(projectId, templateProvider);
    }

    // 4. 解析模板路径（使用两层解析）
    const resolution = await this.templateResolver.resolveTemplatePath(
      'ai_ask', // 注意：模板文件名为 ai_ask_v1.md
      sessionConfig
    );

    console.log(`[AiAskAction] 📝 Template resolved:`, {
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
      console.log(`[AiAskAction] 📂 Loading template from database:`, resolution.path);
      template = await this.templateManager.loadTemplate(resolution.path);
    } else {
      // 文件系统模式：需要拼接项目根目录
      const projectRoot = this.resolveProjectRoot(context);
      const fullPath = path.join(projectRoot, resolution.path);
      console.log(`[AiAskAction] 📂 Loading template from filesystem:`, fullPath);
      template = await this.templateManager.loadTemplate(fullPath);
    }

    // 5. 准备变量
    const scriptVariables = this.extractScriptVariables(context);
    const systemVariables = this.buildSystemVariables(context);

    // 5.1 🔥 新增: 从 metadata 读取监控反馈并拼接到提示词
    let monitorFeedback = '';
    if (context.metadata?.latestMonitorFeedback) {
      monitorFeedback = `\n\n${context.metadata.latestMonitorFeedback}`;
      console.log(
        '[AiAskAction] 📝 检测到监控反馈,已拼接到提示词:',
        monitorFeedback.substring(0, 100) + '...'
      );
    }

    // 4. 替换变量
    let prompt = this.templateManager.substituteVariables(
      template.content,
      scriptVariables,
      systemVariables
    );

    // 5.2 🔥 新增: 将监控反馈拼接到提示词末尾
    if (monitorFeedback) {
      prompt = prompt + monitorFeedback;
    }

    console.log(`[AiAskAction] 📝 Prompt prepared (${prompt.length} chars)`);

    // 5. 调用 LLM
    const llmResult = await this.llmOrchestrator!.generateText(prompt, {
      temperature: 0.7,
      maxTokens: 800,
    });

    // 6. 安全边界检测
    const safetyCheck = this.checkSafetyBoundary(llmResult.text);
    if (!safetyCheck.passed) {
      console.warn(`[AiAskAction] ⚠️ Safety boundary violations detected:`, safetyCheck.violations);
    }

    // 7. 解析响应
    if (templateType === AskTemplateType.SIMPLE) {
      // 简单模式：解析 JSON 响应并提取 content 字段
      const jsonText = this.cleanJsonOutput(llmResult.text);
      let llmOutput: any;
      try {
        llmOutput = JSON.parse(jsonText);
      } catch (error) {
        // 如果解析失败，直接使用原始文本
        console.warn(`[AiAskAction] ⚠️  Failed to parse simple-mode JSON, using raw text`);
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

      // 提取 metrics 和 progress_suggestion
      const metrics = this.extractMetrics(llmOutput);
      const progressSuggestion = this.extractProgressSuggestion(llmOutput);

      // 判断是否退出
      const shouldExit = llmOutput.EXIT === 'true';

      // 提取 AI 消息：优先使用 content 字段（新格式），兼容旧格式
      const aiRole = this.getConfig('ai_role', '咨询师');
      const aiMessage = llmOutput.content || llmOutput[aiRole] || llmOutput.response || '';

      // 提取安全风险信息
      const safetyRisk = llmOutput.safety_risk || {
        detected: false,
        risk_type: null,
        confidence: 'high',
        reason: null,
      };

      // 提取元数据
      const llmMetadata = llmOutput.metadata || {};

      // 提取话术风格适配信息
      const styleAdaptation = llmMetadata.style_adaptation;

      return {
        success: true,
        completed: false,
        aiMessage,
        extractedVariables:
          Object.keys(extractedVariables).length > 0 ? extractedVariables : undefined,
        metrics, // 新增：精细化状态指标
        progress_suggestion: progressSuggestion, // 新增：进度建议
        debugInfo: llmResult.debugInfo,
        metadata: {
          actionType: AiAskAction.actionType,
          shouldExit,
          brief: llmOutput.BRIEF,
          currentRound: this.currentRound,
          llmRawOutput: parseResult.cleanedResponse,
          template_path: resolution.path,
          template_layer: resolution.layer,
          template_scheme: resolution.scheme,
          safety_check: safetyCheck,
          safety_risk: safetyRisk,
          llm_metadata: llmMetadata,
          style_adaptation: styleAdaptation, // 新增：话术风格适配信息
          parseError: (parseResult.parseError?.retryCount || 0) > 1, // 是否发生过解析失败
          parseRetryCount: parseResult.parseError?.retryCount || 0, // 重试次数
          parseErrorDetails: parseResult.parseError, // 解析错误详情
        },
      };
    }
  }

  /**
   * 从 JSON 中提取变量
   */
  private extractVariablesFromJson(llmOutput: AskLLMOutput): Record<string, any> {
    const extractedVariables: Record<string, any> = {};
    const outputConfig = this.getConfig('output', []);

    if (outputConfig.length > 0) {
      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        if (
          llmOutput[varName] !== undefined &&
          llmOutput[varName] !== null &&
          llmOutput[varName] !== ''
        ) {
          extractedVariables[varName] = llmOutput[varName];
          console.log(`[AiAskAction] ✅ Extracted variable from JSON: ${varName}`);
        }
      }
    }
    return extractedVariables;
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
        console.log(`[AiAskAction] ⚠️ Fallback to user input for ${varName}`);
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
      console.error(`[AiAskAction] ❌ LLM extraction failed for ${varName}:`, error);
      return undefined;
    }
  }

  /**
   * 提取脚本层变量
   */
  private extractScriptVariables(context: ActionContext): Map<string, any> {
    const variables = this.extractCommonProfileVariables(context);

    // 提问任务
    const taskTemplate =
      this.getConfig('question_template') || this.getConfig('prompt_template') || '';
    const task = this.substituteVariables(taskTemplate, context);
    variables.set('task', task);

    // 退出条件
    const exitCondition = this.getConfig('exit', '用户提供了足够的信息');
    variables.set('exit', exitCondition);

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

    // 构建 output_list（多变量输出格式）
    const outputList = this.buildOutputList();

    return {
      time,
      who,
      user,
      tone,
      chat,
      ai_role: aiRole,
      output_list: outputList,
    };
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
    output: AskLLMOutput;
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
        const output = JSON.parse(cleanedResponse) as AskLLMOutput;

        // 解析成功，记录日志
        if (parseAttempt > 1) {
          console.warn(
            `[AiAskAction] JSON解析在第${parseAttempt}次尝试成功，使用策略: ${strategy}`
          );
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
        console.warn(
          `[AiAskAction] JSON解析第${parseAttempt}次失败，策略: ${strategy}，错误: ${e.message}`
        );

        if (parseAttempt >= MAX_PARSE_RETRY) {
          // 重试耗尽，使用降级策略
          console.error('[AiAskAction] JSON解析重试耗尽，使用降级默认值');
          console.error('[AiAskAction] 最后错误:', lastError);
          console.error('[AiAskAction] 原始响应:', rawResponse);

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
  private getDefaultAskOutput(rawResponse: string): AskLLMOutput {
    return {
      content: rawResponse.trim(),
      EXIT: 'NO',
      BRIEF: 'LLM输出JSON解析失败',
      metrics: this.getDefaultMetrics(),
      progress_suggestion: 'continue_needed',
    };
  }

  /**
   * 获取默认metrics（解析失败时）
   */
  private getDefaultMetrics(): ActionMetrics {
    return {
      information_completeness: 'LLM输出JSON解析失败，无法评估',
      user_engagement: 'LLM输出JSON解析失败，无法评估',
      emotional_intensity: 'LLM输出JSON解析失败，无法评估',
      reply_relevance: 'LLM输出JSON解析失败，无法评估',
    };
  }

  /**
   * 提取metrics字段，填充缺失值
   */
  private extractMetrics(llmOutput: AskLLMOutput): ActionMetrics {
    const metrics = llmOutput.metrics || {};
    const defaultMetrics = this.getDefaultMetrics();

    return {
      information_completeness:
        metrics.information_completeness || defaultMetrics.information_completeness,
      user_engagement: metrics.user_engagement || defaultMetrics.user_engagement,
      emotional_intensity: metrics.emotional_intensity || defaultMetrics.emotional_intensity,
      reply_relevance: metrics.reply_relevance || defaultMetrics.reply_relevance,
    };
  }

  /**
   * 提取progress_suggestion，验证合法性
   */
  private extractProgressSuggestion(llmOutput: AskLLMOutput): ProgressSuggestion {
    const suggestion = llmOutput.progress_suggestion;
    const validSuggestions: ProgressSuggestion[] = [
      'continue_needed',
      'completed',
      'blocked',
      'off_topic',
    ];

    if (suggestion && validSuggestions.includes(suggestion as ProgressSuggestion)) {
      return suggestion as ProgressSuggestion;
    }

    // 默认返回 continue_needed
    if (suggestion && !validSuggestions.includes(suggestion as ProgressSuggestion)) {
      console.warn(
        `[AiAskAction] 非法的progress_suggestion值: ${suggestion}，使用默认值: continue_needed`
      );
    }

    return 'continue_needed';
  }
}
