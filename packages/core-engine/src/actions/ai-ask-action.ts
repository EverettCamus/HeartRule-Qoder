/**
 * AiAskAction - AI向用户提问并提取答案
 *
 * 参照: legacy-python/src/actions/ai_ask.py
 */

import * as path from 'path';

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
    this.maxRounds = config.max_rounds || config.maxRounds || 3;
    this.llmOrchestrator = llmOrchestrator;

    // 计算模板路径
    let templateBasePath = process.env.PROMPT_TEMPLATE_PATH;
    if (!templateBasePath) {
      const cwd = process.cwd();
      console.log(`[AiAskAction] 📁 Current working directory: ${cwd}`);
      if (cwd.includes('packages/api-server') || cwd.includes('packages\\api-server')) {
        templateBasePath = path.resolve(cwd, '../../config/prompts');
      } else {
        templateBasePath = path.resolve(cwd, './config/prompts');
      }
      console.log(`[AiAskAction] 📁 Template path: ${templateBasePath}`);
    }
    this.templateManager = new PromptTemplateManager(templateBasePath);

    // 选择模板类型：有 exit 或 output 使用多轮追问模板，否则使用简单问答模板
    this.templateType =
      config.output?.length > 0 || config.exit
        ? AskTemplateType.MULTI_ROUND
        : AskTemplateType.SIMPLE;

    console.log(
      `[AiAskAction] 🔧 Constructor: templateType=${this.templateType}, templatePath=${templateBasePath}, config:`,
      {
        hasOutput: !!config.output?.length,
        hasExit: !!config.exit,
        maxRounds: this.maxRounds,
        hasTargetVariable: !!(config.target_variable || config.targetVariable),
      }
    );
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
      let jsonText = llmResult.text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
      }

      let llmOutput: AskLLMOutput;
      try {
        llmOutput = JSON.parse(jsonText);
      } catch (error: any) {
        console.error(`[AiAskAction] ❌ Failed to parse LLM output:`, llmResult.text);
        throw new Error(`Failed to parse LLM output: ${error.message}`);
      }

      // 🔧 立即提取 output 中配置的变量
      const extractedVariables: Record<string, any> = {};
      const outputConfig = this.config.output || [];

      if (outputConfig.length > 0) {
        console.log(`[AiAskAction] 🔍 Extracting variables from LLM JSON output:`, outputConfig);

        for (const varConfig of outputConfig) {
          const varName = varConfig.get;
          if (!varName) continue;

          // 从 JSON 中提取变量值
          if (
            llmOutput[varName] !== undefined &&
            llmOutput[varName] !== null &&
            llmOutput[varName] !== ''
          ) {
            extractedVariables[varName] = llmOutput[varName];
            console.log(
              `[AiAskAction] ✅ Extracted variable from JSON: ${varName} = ${llmOutput[varName]}`
            );
          } else {
            console.log(`[AiAskAction] ⚠️ Variable "${varName}" not found in JSON output`);
          }
        }
      }

      // 判断是否退出
      const shouldExit = llmOutput.EXIT === 'true';

      // 提取 AI 消息
      const aiRole = this.config.ai_role || '咨询师';
      const aiMessage = llmOutput[aiRole] || llmOutput.response || '';

      return {
        success: true,
        completed: false,
        aiMessage,
        extractedVariables:
          Object.keys(extractedVariables).length > 0 ? extractedVariables : undefined, // 🔧 返回提取的变量
        debugInfo: llmResult.debugInfo,
        metadata: {
          actionType: AiAskAction.actionType,
          shouldExit,
          brief: llmOutput.BRIEF,
          currentRound: this.currentRound,
          llmRawOutput: jsonText, // 🔧 保存原始 JSON 以便 finishAction 时使用
        },
      };
    }
  }

  /**
   * 完成动作并提取变量
   */
  private async finishAction(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult> {
    const extractedVariables: Record<string, any> = {};

    // 提取配置的变量
    const outputConfig = this.config.output || [];

    console.log(`[AiAskAction] 🔍 Starting variable extraction, output config:`, outputConfig);

    for (const varConfig of outputConfig) {
      const varName = varConfig.get;
      const varDefine = varConfig.define || '';

      if (!varName) continue;

      // 优先尝试从对话历史中查找 LLM 返回的 JSON 中是否已经包含该变量
      let extractedFromJSON = false;

      // 查找最近的 assistant 消息中的 metadata
      for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
        const msg = context.conversationHistory[i];
        if (msg.role === 'assistant' && msg.metadata?.llmRawOutput) {
          try {
            // 尝试解析 LLM 原始输出中的 JSON
            let jsonText = msg.metadata.llmRawOutput;
            if (jsonText.startsWith('```json')) {
              jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
            } else if (jsonText.startsWith('```')) {
              jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
            }

            const jsonData = JSON.parse(jsonText);
            if (
              jsonData[varName] !== undefined &&
              jsonData[varName] !== null &&
              jsonData[varName] !== ''
            ) {
              extractedVariables[varName] = jsonData[varName];
              extractedFromJSON = true;
              console.log(
                `[AiAskAction] ✅ Extracted variable from JSON: ${varName} = ${jsonData[varName]}`
              );
              break;
            }
          } catch (e) {
            // JSON 解析失败，继续尝试其他方式
          }
        }
      }

      // 如果从 JSON 中没有提取到，尝试使用 LLM 提取
      if (!extractedFromJSON) {
        if (this.llmOrchestrator && varDefine) {
          try {
            const extractPrompt = this.buildExtractionPrompt(context, varName, varDefine);
            const result = await this.llmOrchestrator.generateText(extractPrompt, {
              temperature: 0.3,
              maxTokens: 500,
            });
            extractedVariables[varName] = result.text.trim();
            console.log(
              `[AiAskAction] ✅ Extracted variable via LLM: ${varName} = ${result.text.substring(0, 50)}...`
            );
          } catch (error: any) {
            console.error(`[AiAskAction] ❌ Failed to extract variable ${varName}:`, error);
            // 如果 LLM 提取失败，使用用户最后的输入作为 fallback
            if (userInput) {
              extractedVariables[varName] = userInput.trim();
              console.log(`[AiAskAction] ⚠️ Fallback to user input for ${varName}`);
            }
          }
        } else if (userInput) {
          // 简单提取：使用最后一次用户输入
          extractedVariables[varName] = userInput.trim();
          console.log(`[AiAskAction] ✅ Extracted variable from user input: ${varName}`);
        }
      }
    }

    // 向后兼容：简单模式的 target_variable
    const targetVariable = this.config.target_variable || this.config.targetVariable;
    if (targetVariable && !extractedVariables[targetVariable] && userInput) {
      extractedVariables[targetVariable] = userInput.trim();
      console.log(`[AiAskAction] ✅ Extracted legacy target_variable: ${targetVariable}`);
    }

    this.currentRound = 0;

    console.log(`[AiAskAction] 🎯 Final extracted variables:`, extractedVariables);

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
   * 提取脚本层变量
   */
  private extractScriptVariables(context: ActionContext): Map<string, any> {
    const variables = new Map<string, any>();

    // 提问任务
    const taskTemplate =
      this.config.question_template ||
      this.config.questionTemplate ||
      this.config.prompt_template ||
      this.config.promptTemplate ||
      '';
    const task = this.substituteVariables(taskTemplate, context);
    variables.set('task', task);

    // 退出条件
    const exitCondition = this.config.exit || '用户提供了足够的信息';
    variables.set('exit', exitCondition);

    // 添加用户画像变量
    const userVars = ['用户名', '教育背景', '心理学知识'];
    userVars.forEach((varName) => {
      const value = context.variables[varName];
      if (value !== undefined) {
        variables.set(varName, value);
      }
    });

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
    const aiRole = this.config.ai_role || '咨询师';

    // 用户信息
    const user = context.variables['用户名'] || '来访者';

    // 语气风格
    const tone = this.config.tone || '温和、同理心、专业';

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
    const outputConfig = this.config.output || [];

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
