/**
 * AiSayAction - AI向用户传达信息
 * 
 * 参照: legacy-python/src/actions/ai_say.py
 * 
 * 更新说明：
 * - 当 require_acknowledgment=false 时，ai_say 会立即完成，不等待用户回复
 * - 这会导致脚本执行器立即推进到下一个 action
 * - 如果想让 ai_say 的消息显示给用户，应该设置 require_acknowledgment=true
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

      const requireAcknowledgment = this.config.require_acknowledgment || this.config.requireAcknowledgment || false;

      // 2. 变量替换
      const content = this.substituteVariables(rawContent, context);

      // 如果不需要确认，直接完成
      if (!requireAcknowledgment) {
        // 注意：这里返回 completed=true，会导致脚本执行器立即推进到下一个 action
        // 如果需要显示这条消息，应设置 require_acknowledgment=true
        return {
          success: true,
          completed: true,
          aiMessage: content,
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
