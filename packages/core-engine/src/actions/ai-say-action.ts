/**
 * AiSayAction - AI向用户传达信息（增强版）
 *
 * 【DDD 视角】应用层服务 - Action 执行器
 * 负责将脚本中的 ai_say 动作定义转化为实际执行过程
 *
 * 核心能力：
 * 1. 多轮对话：基于 max_rounds 控制，支持与用户多轮交互直到理解
 * 2. 提示词模板：两层变量替换（脚本变量 + 系统变量）
 * 3. 理解度评估：LLM 智能判断用户是否已理解内容
 * 4. 智能退出：基于 exit_criteria 自动决策是否结束对话
 * 5. 向后兼容：保留 require_acknowledgment 机制
 *
 * 业务规则：
 * - 模板模式：当配置 max_rounds 或 exit_criteria 时启用
 * - 兼容模式：简单单轮对话，仅输出静态内容
 * - 退出决策顺序：max_rounds > exit_criteria > llm_suggestion
 */

import { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager, TemplateResolver } from '../engines/prompt-template/index.js';

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

/**
 * LLM 输出格式（支持新旧两种格式）
 */
interface MainLineOutput {
  // 新格式字段
  content?: string;
  EXIT?: string;
  BRIEF?: string;
  safety_risk?: {
    detected: boolean;
    risk_type: string | null;
    confidence: 'high' | 'medium' | 'low';
    reason: string | null;
  };
  metadata?: {
    emotional_tone?: string;
    crisis_signal?: boolean;
    assessment?: {
      understanding_level: number;
      has_questions: boolean;
      expressed_understanding: boolean;
      reasoning: string;
    };
  };
  
  // 旧格式字段（向后兼容）
  assessment?: {
    understanding_level: number;
    has_questions: boolean;
    expressed_understanding: boolean;
    reasoning: string;
  };
  response?: {
    [key: string]: string; // 支持动态角色名
  };
  should_exit?: boolean;
  exit_reason?: string;
}

export class AiSayAction extends BaseAction {
  static actionType = 'ai_say';
  private llmOrchestrator?: LLMOrchestrator;
  private templateManager: PromptTemplateManager;
  private templateResolver: TemplateResolver;
  private useTemplateMode: boolean = false; // 是否使用模板模式

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.llmOrchestrator = llmOrchestrator;

    const templateBasePath = this.resolveTemplatePath();
    console.log(`[AiSayAction] 📁 Template path: ${templateBasePath}`);

    this.templateManager = new PromptTemplateManager(templateBasePath);
    // TemplateResolver 需要项目根目录，但此时还没有context，暂不初始化
    this.templateResolver = null as any; // 延迟初始化

    // maxRounds 和 exitCriteria 已在 BaseAction 中设置
    // 判断是否使用模板模式：有 max_rounds 或 exit_criteria 配置
    this.useTemplateMode =
      this.getConfig('max_rounds') !== undefined || this.getConfig('exit_criteria') !== undefined;

    // 设置退出策略：ai_say 支持多轮退出
    this.exitPolicy = {
      supportsExit: true,
      enabledSources: ['max_rounds', 'exit_criteria', 'llm_suggestion'],
    };
  }

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    try {
      console.log(`[AiSayAction] 🔵 Executing:`, {
        actionId: this.actionId,
        currentRound: this.currentRound,
        maxRounds: this.maxRounds,
        useTemplateMode: this.useTemplateMode,
      });

      // 模式选择：模板模式 vs 兼容模式
      if (this.useTemplateMode && this.llmOrchestrator) {
        return await this.executeTemplateMode(context, userInput);
      } else {
        return await this.executeLegacyMode(context, userInput);
      }
    } catch (e: any) {
      console.error(`[AiSayAction] ❌ Execution error:`, e);
      return {
        success: false,
        completed: true,
        error: `ai_say execution error: ${e.message}`,
      };
    }
  }

  /**
   * 模板模式执行（新功能：多轮对话 + 理解度评估）
   */
  private async executeTemplateMode(
    context: ActionContext,
    _userInput?: string | null
  ): Promise<ActionResult> {
    // 增加轮次计数
    this.currentRound++;

    // 规则1: 检查是否达到最大轮次
    if (this.currentRound > this.maxRounds) {
      console.log(`[AiSayAction] ⚠️ Reached max_rounds (${this.maxRounds}), force exit`);
      return {
        success: true,
        completed: true,
        aiMessage: null,
        metadata: {
          actionType: AiSayAction.actionType,
          exitDecision: {
            should_exit: true,
            reason: `达到最大轮次限制 (${this.maxRounds})`,
            decision_source: 'max_rounds',
          },
        },
      };
    }

    // 1. 加载提示词模板
    const { template, resolution } = await this.loadPromptTemplate(context);

    // 2. 准备变量
    const scriptVariables = this.extractScriptVariables(context);
    const systemVariables = this.buildSystemVariables(context);

    // 3. 两层变量替换
    const prompt = this.templateManager.substituteVariables(
      template.content,
      scriptVariables,
      systemVariables
    );

    console.log(`[AiSayAction] 📝 Prompt prepared (${prompt.length} chars)`);

    // 4. 调用 LLM
    const llmResult = await this.llmOrchestrator!.generateText(prompt, {
      temperature: 0.7,
      maxTokens: 1000,
    });

    // 5. 安全边界检测
    const safetyCheck = this.checkSafetyBoundary(llmResult.text);
    if (!safetyCheck.passed) {
      console.warn(`[AiSayAction] ⚠️ Safety boundary violations detected:`, safetyCheck.violations);
    }

    // 6. 解析 LLM 响应（处理 markdown 代码块）
    const jsonText = this.cleanJsonOutput(llmResult.text);

    let llmOutput: MainLineOutput;
    try {
      llmOutput = JSON.parse(jsonText);
    } catch (error: any) {
      console.error(`[AiSayAction] ❌ Failed to parse LLM output:`, llmResult.text);
      throw new Error(`Failed to parse LLM output: ${error.message}`);
    }

    // 7. 退出决策（使用统一的 evaluateExitCondition 方法）
    const exitDecision = this.evaluateExitCondition(context, llmOutput);

    console.log(`[AiSayAction] 🎯 Exit decision:`, exitDecision);

    // 提取 AI 消息：优先使用 content 字段（新格式），兼容旧格式
    const aiRole = this.getConfig('ai_role', '咨询师');
    const aiMessage = llmOutput.content || 
                      (llmOutput.response && llmOutput.response[aiRole]) || 
                      '';

    // 提取安全风险信息
    const safetyRisk = llmOutput.safety_risk || {
      detected: false,
      risk_type: null,
      confidence: 'high',
      reason: null,
    };

    // 提取元数据
    const llmMetadata = llmOutput.metadata || {};

    // 8. 返回结果（包含 debugInfo 和模板解析信息）
    // 如果达到最大轮次，强制标记为已完成
    const isLastRound = this.currentRound >= this.maxRounds;
    if (isLastRound) {
      console.log(`[AiSayAction] 🏁 Reached max_rounds (${this.maxRounds}), finishing action`);
    }
    
    // 修正：ai_say 在第一次输出时应该等待用户确认，而不是直接完成
    const shouldWaitForAcknowledgment = aiMessage && this.currentRound === 1;
    
    return {
      success: true,
      completed: shouldWaitForAcknowledgment ? false : (exitDecision.should_exit || isLastRound),
      aiMessage,
      debugInfo: llmResult.debugInfo, // ✅ 添加 debugInfo
      metadata: {
        actionType: AiSayAction.actionType,
        currentRound: this.currentRound,
        maxRounds: this.maxRounds,
        waitingFor: shouldWaitForAcknowledgment ? 'acknowledgment' : undefined,
        assessment: llmOutput.assessment || llmMetadata.assessment,
        template_path: resolution.path,
        template_layer: resolution.layer,
        template_scheme: resolution.scheme,
        safety_check: safetyCheck,
        safety_risk: safetyRisk,
        llm_metadata: llmMetadata,
        exitDecision: isLastRound
          ? {
              should_exit: true,
              reason: `达到最大轮次限制 (${this.maxRounds})`,
              decision_source: 'max_rounds',
            }
          : exitDecision,
      },
    };
  }

  /**
   * 兼容模式执行（保留原有的 require_acknowledgment 逻辑）
   */
  private async executeLegacyMode(
    context: ActionContext,
    _userInput?: string | null
  ): Promise<ActionResult> {
    // 1. 选择原始模板（优先级：content > content_template > prompt_template）
    const rawContent = this.getConfig('content') || this.getConfig('content_template') || '';

    // 明确检查 require_acknowledgment
    const requireAcknowledgment = this.getConfig('require_acknowledgment', true);

    // 需要确认的情况 - 检查是否是第二轮
    if (requireAcknowledgment && this.currentRound > 0) {
      console.log(`[AiSayAction] ✅ User acknowledged, action completed`);
      this.currentRound = 0;
      return {
        success: true,
        completed: true,
        aiMessage: null,
        metadata: {
          actionType: AiSayAction.actionType,
          userAcknowledged: true,
        },
      };
    }

    // 2. 变量替换 (使用统一的模板管理器进行两层替换)
    const scriptVariables = this.extractScriptVariables(context);
    const systemVariables = this.buildSystemVariables(context);
    let content = this.templateManager.substituteVariables(
      rawContent,
      scriptVariables,
      systemVariables
    );

    // 3. ai_say 默认使用 LLM 生成更自然的表达
    let debugInfo;

    if (this.llmOrchestrator) {
      console.log(`[AiSayAction] 🤖 Using LLM to generate natural expression`);

      const systemPrompt = `你是一位专业的心理咨询师，请将以下内容改写为更自然、更温暖的表达方式，保持原意不变。`;
      const userPrompt = `请改写：${content}`;

      try {
        const result = await this.llmOrchestrator.generateText(`${systemPrompt}\n\n${userPrompt}`, {
          temperature: 0.7,
          maxTokens: 500,
        });

        content = result.text;
        debugInfo = result.debugInfo;
        console.log(`[AiSayAction] ✅ LLM generated: ${content.substring(0, 50)}...`);
      } catch (error: any) {
        console.error(`[AiSayAction] ❌ LLM generation failed:`, error);
      }
    } else {
      console.warn(
        `[AiSayAction] ⚠️ LLMOrchestrator not available, using template content directly`
      );
    }

    // 需要确认的情况
    if (requireAcknowledgment) {
      this.currentRound += 1;
      return {
        success: true,
        completed: false,
        aiMessage: content,
        debugInfo,
        metadata: {
          actionType: AiSayAction.actionType,
          requireAcknowledgment: true,
          waitingFor: 'acknowledgment',
        },
      };
    }

    // 不需要确认
    return {
      success: true,
      completed: true,
      aiMessage: content,
      debugInfo,
      metadata: {
        actionType: AiSayAction.actionType,
        requireAcknowledgment: false,
      },
    };
  }

  /**
   * 加载提示词模板（两层方案机制）
   */
  private async loadPromptTemplate(context: ActionContext) {
    // 1. 从 session 配置读取 template_scheme
    const sessionConfig = {
      template_scheme: context.metadata?.sessionConfig?.template_scheme,
    };
    
    // 2. 初始化 TemplateResolver（延迟初始化）
    if (!this.templateResolver) {
      const projectRoot = this.resolveProjectRoot(context);
      this.templateResolver = new TemplateResolver(projectRoot);
    }
    
    // 3. 解析模板路径（使用两层解析）
    const resolution = await this.templateResolver.resolveTemplatePath(
      'ai_say', // 注意：模板文件名为 ai_say_v1.md
      sessionConfig
    );
    
    console.log(`[AiSayAction] 📝 Template resolved:`, {
      path: resolution.path,
      layer: resolution.layer,
      scheme: resolution.scheme,
      exists: resolution.exists,
    });
    
    const template = await this.templateManager.loadTemplate(resolution.path);
    
    return {
      template,
      resolution,
    };
  }

  /**
   * 提取脚本层变量
   */
  private extractScriptVariables(context: ActionContext): Map<string, any> {
    const variables = this.extractCommonProfileVariables(context);

    // 添加核心内容（支持多个字段名）
    const rawContent = this.getConfig('content') || this.getConfig('content_template') || '';
    const contentWithVars = this.substituteVariables(rawContent, context);
    variables.set('topic_content', contentWithVars);

    return variables;
  }

  /**
   * 构建系统层变量
   */
  private buildSystemVariables(context: ActionContext): Record<string, any> {
    return {
      time: new Date().toISOString(),
      who: context.variables['咨询师名'] || 'AI咨询师',
      user: context.variables['用户名'] || '来访者',
      chat_history: this.formatChatHistory(context.conversationHistory),
      tone: this.getConfig('tone', '专业、温暖、平和'),
      topic_content: this.extractTopicContent(context),
      understanding_threshold: this.exitCriteria?.understanding_threshold ?? 80,
      current_round: this.currentRound,
      max_rounds: this.maxRounds,
    };
  }

  /**
   * 提取话题内容
   */
  private extractTopicContent(context: ActionContext): string {
    const rawContent = this.getConfig('content') || this.getConfig('content_template') || '';
    return this.substituteVariables(rawContent, context);
  }

  /**
   * 格式化对话历史
   */
  private formatChatHistory(history: any[]): string {
    if (!history || history.length === 0) {
      return '（暂无对话历史）';
    }

    // 获取最近 10 条消息
    const recent = history.slice(-10);
    return recent.map((msg) => `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`).join('\n');
  }
}
