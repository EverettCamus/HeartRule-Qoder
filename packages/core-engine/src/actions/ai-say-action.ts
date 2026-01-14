/**
 * AiSayAction - AI向用户传达信息
 * 
 * 参照: legacy-python/src/actions/ai_say.py
 * 
 * 行为说明：
 * - 默认 require_acknowledgment=true，需要用户确认后才继续
 * - 当 require_acknowledgment=false 时，消息会发送给用户，但脚本立即推进到下一个 action
 * - 无论是否需要确认，消息都会被保存并发送给客户端
 * - TODO: 未来集成LLM处理 content_template，生成更自然的表达
 */

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

export class AiSayAction extends BaseAction {
  static actionType = 'ai_say';

  async execute(context: ActionContext, _userInput?: string | null): Promise<ActionResult> {
    try {
      // 1. 选择原始模板（优先 prompt_template，其次 content_template，再次 content）
      let rawContent = this.config.prompt_template || this.config.promptTemplate;
      if (!rawContent) {
        rawContent = this.config.content_template || this.config.contentTemplate;
      }
      if (!rawContent) {
        rawContent = this.config.content || '';
      }

      // 明确检查 require_acknowledgment 是否被设置
      // 默认为 true（需要用户确认）
      let requireAcknowledgment = true;
      
      if (this.config.require_acknowledgment !== undefined) {
        requireAcknowledgment = this.config.require_acknowledgment;
      } else if (this.config.requireAcknowledgment !== undefined) {
        requireAcknowledgment = this.config.requireAcknowledgment;
      }
      
      // 🔵 调试日志
      console.log(`[AiSayAction] 🔵 Executing:`, {
        actionId: this.actionId,
        requireAcknowledgment,
        config_require_acknowledgment: this.config.require_acknowledgment,
        config_requireAcknowledgment: this.config.requireAcknowledgment,
        configKeys: Object.keys(this.config),
        currentRound: this.currentRound,
        maxRounds: this.maxRounds,
      });

      // 2. 变量替换
      const content = this.substituteVariables(rawContent, context);

      // 如果不需要确认，发送消息后立即完成
      // 消息仍会被保存并发送给客户端，只是不等待用户回复
      if (!requireAcknowledgment) {
        console.log(`[AiSayAction] ⚡ No acknowledgment required, message will be sent and script continues`);
        return {
          success: true,
          completed: true,  // 立即完成，脚本继续执行
          aiMessage: content,  // 消息仍会被发送给用户
          metadata: {
            actionType: AiSayAction.actionType,
            requireAcknowledgment: false,
          },
        };
      }

      // 需要确认的情况
      if (this.currentRound === 0) {
        // 第一轮：发送消息并等待确认
        this.currentRound += 1;
        return {
          success: true,
          completed: false, // 等待用户确认
          aiMessage: content,
          metadata: {
            actionType: AiSayAction.actionType,
            requireAcknowledgment: true,
            waitingFor: 'acknowledgment',
          },
        };
      } else {
        // 第二轮：用户已确认（无论用户说什么都算确认）
        this.currentRound = 0; // 重置
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
    } catch (e: any) {
      return {
        success: false,
        completed: true,
        error: `ai_say execution error: ${e.message}`,
      };
    }
  }
}
