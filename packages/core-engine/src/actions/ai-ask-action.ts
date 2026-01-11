/**
 * AiAskAction - AI向用户提问并提取答案
 *
 * 参照: legacy-python/src/actions/ai_ask.py
 */

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

interface ValidationRule {
  required?: boolean;
  min_length?: number;
  minLength?: number;
  max_length?: number;
  maxLength?: number;
  pattern?: string;
}

export class AiAskAction extends BaseAction {
  static actionType = 'ai_ask';

  constructor(actionId: string, config: Record<string, any>) {
    super(actionId, config);
    this.maxRounds = config.max_rounds || config.maxRounds || 3;
  }

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    try {
      // 1. 选择问题模板（优先 prompt_template，其次 question_template，再次 question）
      let questionTemplate = this.config.prompt_template || this.config.promptTemplate;
      if (!questionTemplate) {
        questionTemplate =
          this.config.question_template ||
          this.config.questionTemplate ||
          this.config.question ||
          '';
      }

      // 2. 变量提取目标
      const extractTo =
        this.config.target_variable ||
        this.config.targetVariable ||
        this.config.extract_to ||
        this.config.extractTo ||
        '';

      // 3. 校验配置
      const validation: ValidationRule = this.config.validation || {};
      if (Object.keys(validation).length === 0) {
        // 构造validation对象
        if ('required' in this.config) validation.required = this.config.required;
        if ('min_length' in this.config) validation.min_length = this.config.min_length;
        if ('minLength' in this.config) validation.minLength = this.config.minLength;
        if ('max_length' in this.config) validation.max_length = this.config.max_length;
        if ('maxLength' in this.config) validation.maxLength = this.config.maxLength;
        if ('pattern' in this.config) validation.pattern = this.config.pattern;
      }

      const retryMessage =
        this.config.retry_message || this.config.retryMessage || '请提供有效的回答。';
      const extractionPrompt = this.config.extraction_prompt || this.config.extractionPrompt || '';

      // 第一轮：发送问题
      if (this.currentRound === 0) {
        const question = this.substituteVariables(questionTemplate, context);
        this.currentRound += 1;

        return {
          success: true,
          completed: false, // 等待用户回答
          aiMessage: question,
          metadata: {
            actionType: AiAskAction.actionType,
            waitingFor: 'answer',
            extractTo,
            extractionPrompt,
          },
        };
      }

      // 后续轮次：处理用户回答
      if (!userInput || userInput.trim() === '') {
        // 用户没有提供输入
        if (validation.required !== false) {
          this.currentRound += 1;

          if (this.isCompleted()) {
            // 达到最大重试次数
            return {
              success: false,
              completed: true,
              error: `Failed to get valid answer after ${this.maxRounds} attempts`,
            };
          }

          // 要求用户重新输入
          return {
            success: true,
            completed: false,
            aiMessage: retryMessage,
            metadata: {
              actionType: AiAskAction.actionType,
              validationFailed: true,
              retryCount: this.currentRound - 1,
            },
          };
        }
      }

      // 验证用户输入
      const [isValid, errorMsg] = this.validateInput(userInput || '', validation);

      if (!isValid) {
        this.currentRound += 1;

        if (this.isCompleted()) {
          // 达到最大重试次数
          return {
            success: false,
            completed: true,
            error: `Failed to get valid answer: ${errorMsg}`,
          };
        }

        // 验证失败，要求重新输入
        return {
          success: true,
          completed: false,
          aiMessage: `${retryMessage} ${errorMsg}`,
          metadata: {
            actionType: AiAskAction.actionType,
            validationFailed: true,
            error: errorMsg,
            retryCount: this.currentRound - 1,
          },
        };
      }

      // 验证成功，提取变量
      const extractedVariables: Record<string, any> = {};
      if (extractTo) {
        extractedVariables[extractTo] = userInput!.trim();
      }

      // 重置状态
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
          extractionPrompt,
        },
      };
    } catch (e: any) {
      return {
        success: false,
        completed: true,
        error: `ai_ask execution error: ${e.message}`,
      };
    }
  }

  private validateInput(userInput: string, validation: ValidationRule): [boolean, string] {
    if (!validation || Object.keys(validation).length === 0) {
      return [true, ''];
    }

    // 检查是否为空
    if (validation.required !== false) {
      if (!userInput || userInput.trim() === '') {
        return [false, '回答不能为空。'];
      }
    }

    // 检查长度
    const minLength = validation.min_length || validation.minLength;
    if (minLength !== undefined) {
      if (userInput.length < minLength) {
        return [false, `回答长度至少需要${minLength}个字符。`];
      }
    }

    const maxLength = validation.max_length || validation.maxLength;
    if (maxLength !== undefined) {
      if (userInput.length > maxLength) {
        return [false, `回答长度不能超过${maxLength}个字符。`];
      }
    }

    // 检查正则表达式
    if (validation.pattern) {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(userInput)) {
        return [false, '回答格式不正确。'];
      }
    }

    return [true, ''];
  }
}
