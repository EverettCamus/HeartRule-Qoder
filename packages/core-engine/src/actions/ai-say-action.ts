/**
 * AiSayAction - AI向用户传达信息
 * 
 * 参照: legacy-python/src/actions/ai_say.py
 * 
 * 行为说明：
 * - 默认 require_acknowledgment=true，需要用户确认后才继续
 * - 当 require_acknowledgment=false 时，消息会发送给用户，但脚本立即推进到下一个 action
 * - 无论是否需要确认，消息都会被保存并发送给客户端
 * - 默认使用 LLM 生成自然语言表达，提升咨询体验
 */

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';
import { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';

export class AiSayAction extends BaseAction {
  static actionType = 'ai_say';
  private llmOrchestrator?: LLMOrchestrator;

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.llmOrchestrator = llmOrchestrator;
  }

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
      let content = this.substituteVariables(rawContent, context);

      // 3. ai_say 默认使用 LLM 生成更自然的表达
      let debugInfo;
      
      if (this.llmOrchestrator) {
        console.log(`[AiSayAction] 🤖 Using LLM to generate natural expression`);
        
        // 构造 LLM 提示词
        const systemPrompt = `你是一位专业的心理咨询师，请将以下内容改写为更自然、更温暖的表达方式，保持原意不变。`;
        const userPrompt = `请改写：${content}`;
        
        try {
          const result = await this.llmOrchestrator.generateText(
            `${systemPrompt}\n\n${userPrompt}`,
            {
              temperature: 0.7,
              maxTokens: 500,
            }
          );
          
          content = result.text;
          debugInfo = result.debugInfo;
          console.log(`[AiSayAction] ✅ LLM generated: ${content.substring(0, 50)}...`);
        } catch (error: any) {
          console.error(`[AiSayAction] ❌ LLM generation failed:`, error);
          // 失败时使用原内容
        }
      } else {
        console.warn(`[AiSayAction] ⚠️ LLMOrchestrator not available, using template content directly`);
      }

      // 如果不需要确认，发送消息后立即完成
      // 消息仍会被保存并发送给客户端，只是不等待用户回复
      if (!requireAcknowledgment) {
        console.log(`[AiSayAction] ⚡ No acknowledgment required, message will be sent and script continues`);
        return {
          success: true,
          completed: true,  // 立即完成，脚本继续执行
          aiMessage: content,  // 消息仍会被发送给用户
          debugInfo,  // 传递 LLM 调试信息
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
          debugInfo,  // 传递 LLM 调试信息
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
