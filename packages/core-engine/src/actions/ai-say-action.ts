/**
 * AiSayAction - AI向用户传达信息（增强版）
 *
 * 新增能力：
 * - 支持多轮对话（基于 max_rounds 控制）
 * - 支持提示词模板系统（两层变量替换）
 * - 支持理解度评估与智能退出决策
 * - 保持向后兼容（require_acknowledgment 机制）
 */

import * as path from 'path';

import { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager } from '../engines/prompt-template/index.js';

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

/**
 * ai_say 配置接口
 */
interface AiSayConfig {
  content?: string; // 讲解内容（必填）
  require_acknowledgment?: boolean; // 是否需要用户确认
  max_rounds?: number; // 最大轮数
  exit_criteria?: {
    understanding_threshold?: number; // 理解度阈值
    has_questions?: boolean; // 是否允许有疑问时退出
  };
}

/**
 * LLM 输出格式（主线 A）
 */
interface MainLineOutput {
  assessment: {
    understanding_level: number; // 0-100
    has_questions: boolean;
    expressed_understanding: boolean;
    reasoning: string;
  };
  response: {
    咨询师: string;
  };
  should_exit: boolean;
  exit_reason: string;
}

/**
 * 退出决策结果
 */
interface ExitDecision {
  should_exit: boolean;
  reason: string;
  decision_source: 'max_rounds' | 'exit_criteria' | 'llm_suggestion';
}

export class AiSayAction extends BaseAction {
  static actionType = 'ai_say';
  private llmOrchestrator?: LLMOrchestrator;
  private templateManager: PromptTemplateManager;
  private exitCriteria: AiSayConfig['exit_criteria'];
  private useTemplateMode: boolean = false; // 是否使用模板模式

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.llmOrchestrator = llmOrchestrator;

    // 设置模板根目录：优先使用环境变量，否则智能识别运行目录
    let templateBasePath = process.env.PROMPT_TEMPLATE_PATH;

    if (!templateBasePath) {
      const cwd = process.cwd();
      console.log(`[AiSayAction] 📁 Current working directory: ${cwd}`);

      // 检测运行目录：
      // - 如果在 packages/api-server 下，向上 2 级到 root
      // - 如果在项目根目录，直接使用 ./config/prompts
      if (cwd.endsWith('packages\\api-server') || cwd.endsWith('packages/api-server')) {
        templateBasePath = path.resolve(cwd, '../../config/prompts');
      } else {
        // 假设在项目根目录或测试环境
        templateBasePath = path.resolve(cwd, './config/prompts');
      }

      console.log(`[AiSayAction] 📁 Template path: ${templateBasePath}`);
    }

    this.templateManager = new PromptTemplateManager(templateBasePath);

    // maxRounds 已在 BaseAction 中设置
    this.exitCriteria = config.exit_criteria;

    // 判断是否使用模板模式：有 max_rounds 或 exit_criteria 配置
    this.useTemplateMode = config.max_rounds !== undefined || config.exit_criteria !== undefined;
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
    const template = await this.loadPromptTemplate();

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

    // 解析 LLM 响应（处理 markdown 代码块）
    let jsonText = llmResult.text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    let llmOutput: MainLineOutput;
    try {
      llmOutput = JSON.parse(jsonText);
    } catch (error: any) {
      console.error(`[AiSayAction] ❌ Failed to parse LLM output:`, llmResult.text);
      throw new Error(`Failed to parse LLM output: ${error.message}`);
    }

    // 5. 退出决策
    const exitDecision = this.decideExit(llmOutput);

    console.log(`[AiSayAction] 🎯 Exit decision:`, exitDecision);

    // 6. 返回结果（包含 debugInfo）
    return {
      success: true,
      completed: exitDecision.should_exit,
      aiMessage: llmOutput.response.咨询师,
      debugInfo: llmResult.debugInfo, // ✅ 添加 debugInfo
      metadata: {
        actionType: AiSayAction.actionType,
        currentRound: this.currentRound,
        maxRounds: this.maxRounds,
        assessment: llmOutput.assessment,
        exitDecision,
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
    let rawContent = this.config.content || '';
    if (!rawContent) {
      rawContent = this.config.content_template || this.config.contentTemplate || '';
    }
    if (!rawContent) {
      rawContent = this.config.prompt_template || this.config.promptTemplate || '';
    }

    // 明确检查 require_acknowledgment
    let requireAcknowledgment = true;
    if (this.config.require_acknowledgment !== undefined) {
      requireAcknowledgment = this.config.require_acknowledgment;
    } else if (this.config.requireAcknowledgment !== undefined) {
      requireAcknowledgment = this.config.requireAcknowledgment;
    }

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
   * 加载提示词模板
   */
  private async loadPromptTemplate() {
    // 第一阶段固定使用 introduce_concept 模板
    return await this.templateManager.loadTemplate('ai-say/mainline-a-introduce-concept.md');
  }

  /**
   * 提取脚本层变量
   */
  private extractScriptVariables(context: ActionContext): Map<string, any> {
    const variables = new Map<string, any>();

    // 添加核心内容（支持多个字段名）
    const rawContent =
      this.config.content || this.config.content_template || this.config.contentTemplate || '';
    const contentWithVars = this.substituteVariables(rawContent, context);
    variables.set('topic_content', contentWithVars);

    // 添加用户画像变量（context.variables 是普通对象）
    const userVars = [
      '教育背景',
      '心理学知识',
      '学习风格',
      '用户名',
      '咨询师名',
      '认知特点',
      '情感特点',
      '词汇水平',
      '语言风格',
      '用户常用表达',
    ];
    userVars.forEach((varName) => {
      const value = context.variables[varName];
      if (value !== undefined) {
        variables.set(varName, value);
      }
    });

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
      tone: this.config.tone || '专业、温暖、平和',
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
    const rawContent =
      this.config.content || this.config.content_template || this.config.contentTemplate || '';
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

  /**
   * 退出决策逻辑
   */
  private decideExit(llmOutput: MainLineOutput): ExitDecision {
    // 规则1: 达到最大轮次（已在外层检查）

    // 规则2: LLM 建议退出 + 满足退出条件
    if (llmOutput.should_exit) {
      const { understanding_level, has_questions, expressed_understanding } = llmOutput.assessment;
      const threshold = this.exitCriteria?.understanding_threshold ?? 80;

      // 条件1：理解度达标且无疑问
      if (understanding_level >= threshold && !has_questions) {
        return {
          should_exit: true,
          reason: `理解度${understanding_level}达到${threshold}且无疑问`,
          decision_source: 'exit_criteria',
        };
      }

      // 条件2：理解度70+且明确表达理解
      if (understanding_level >= 70 && expressed_understanding) {
        return {
          should_exit: true,
          reason: `理解度${understanding_level}达到70+且用户明确表达理解`,
          decision_source: 'exit_criteria',
        };
      }
    }

    // 规则3: 继续
    return {
      should_exit: false,
      reason: llmOutput.exit_reason || '继续讲解',
      decision_source: 'llm_suggestion',
    };
  }
}
