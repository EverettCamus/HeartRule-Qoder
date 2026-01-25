/**
 * AiAskAction - AI向用户提问并提取答案
 *
 * 参照: legacy-python/src/actions/ai_ask.py
 */

import { VariableScope } from '@heartrule/shared-types';

import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager } from '../engines/prompt-template/template-manager.js';

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

interface AskLLMOutput {
  EXIT: string;
  [key: string]: any; // 支持动态的 ai_role 字段
  BRIEF?: string;
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
  private templateType: AskTemplateType;

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.maxRounds = this.getConfig('max_rounds', 3);
    this.llmOrchestrator = llmOrchestrator;

    // 计算模板路径
    const templateBasePath = this.resolveTemplatePath();
    console.log(`[AiAskAction] 📁 Template path: ${templateBasePath}`);
    this.templateManager = new PromptTemplateManager(templateBasePath);

    // 选择模板类型：有 exit 或 output 使用多轮追问模板，否则使用简单问答模板
    this.templateType =
      this.getConfig('output')?.length > 0 || this.getConfig('exit')
        ? AskTemplateType.MULTI_ROUND
        : AskTemplateType.SIMPLE;

    console.log(`[AiAskAction] 🔧 Constructor: templateType=${this.templateType}, config:`, {
      hasOutput: !!this.getConfig('output')?.length,
      hasExit: !!this.getConfig('exit'),
      maxRounds: this.maxRounds,
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

    // 达到最大轮次，强制退出
    if (this.currentRound >= this.maxRounds) {
      console.log(`[AiAskAction] 🏁 Reached max_rounds (${this.maxRounds}), force exit`);
      return this.finishAction(context, userInput);
    }

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

    // 调用 LLM 判断是否退出
    const llmOutput = await this.generateQuestionFromTemplate(context, AskTemplateType.MULTI_ROUND);
    const shouldExit = llmOutput.metadata?.shouldExit || false;

    if (shouldExit) {
      console.log(`[AiAskAction] ✅ LLM decided to exit`);
      return this.finishAction(context, userInput);
    }

    // 继续追问
    this.currentRound += 1;
    return {
      ...llmOutput,
      completed: false,
      metadata: {
        ...llmOutput.metadata,
        waitingFor: 'answer',
        continueAsking: true,
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
   * 使用模板生成问题
   */
  private async generateQuestionFromTemplate(
    context: ActionContext,
    templateType: AskTemplateType
  ): Promise<ActionResult> {
    // 1. 加载模板
    const templatePath = `ai-ask/${templateType}.md`;
    const template = await this.templateManager.loadTemplate(templatePath);
    console.log(`[AiAskAction] 📝 Loading template: ${templatePath}`);

    // 2. 准备变量
    const scriptVariables = this.extractScriptVariables(context);
    const systemVariables = this.buildSystemVariables(context);

    // 3. 替换变量
    const prompt = this.templateManager.substituteVariables(
      template.content,
      scriptVariables,
      systemVariables
    );

    console.log(`[AiAskAction] 📝 Prompt prepared (${prompt.length} chars)`);

    // 4. 调用 LLM
    const llmResult = await this.llmOrchestrator!.generateText(prompt, {
      temperature: 0.7,
      maxTokens: 800,
    });

    // 5. 解析响应
    if (templateType === AskTemplateType.SIMPLE) {
      // 简单模式：直接返回问题文本
      return {
        success: true,
        completed: false,
        aiMessage: llmResult.text.trim(),
        debugInfo: llmResult.debugInfo,
        metadata: {
          actionType: AiAskAction.actionType,
          currentRound: this.currentRound,
        },
      };
    } else {
      // 多轮模式：解析 JSON 响应
      const jsonText = this.cleanJsonOutput(llmResult.text);

      let llmOutput: AskLLMOutput;
      try {
        llmOutput = JSON.parse(jsonText);
      } catch (error: any) {
        console.error(`[AiAskAction] ❌ Failed to parse LLM output:`, llmResult.text);
        throw new Error(`Failed to parse LLM output: ${error.message}`);
      }

      // 🔧 立即提取 output 中配置的变量
      const extractedVariables = this.extractVariablesFromJson(llmOutput);

      // 判断是否退出
      const shouldExit = llmOutput.EXIT === 'true';

      // 提取 AI 消息
      const aiRole = this.getConfig('ai_role', '咨询师');
      const aiMessage = llmOutput[aiRole] || llmOutput.response || '';

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
          brief: llmOutput.BRIEF,
          currentRound: this.currentRound,
          llmRawOutput: jsonText,
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
}
