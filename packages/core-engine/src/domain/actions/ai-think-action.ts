/**
 * AiThinkAction - AI 内部思考并生成结论
 * 
 * MVP 简化版本：直接返回成功，不实际调用 LLM
 * TODO: 后续集成 LLM 进行实际推理
 */

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';

export class AiThinkAction extends BaseAction {
  static actionType = 'ai_think';

  constructor(actionId: string, config: Record<string, any>) {
    super(actionId, config);
  }

  async execute(_context: ActionContext, _userInput?: string | null): Promise<ActionResult> {
    try {
      // MVP: 直接返回成功，不实际执行推理
      // TODO: 后续实现真实的 LLM 推理逻辑
      
      const thinkGoal = this.config.think_goal || this.config.thinkGoal || '';
      const outputVariables = this.config.output_variables || this.config.outputVariables || [];
      
      console.log(`[AiThinkAction] ${this.actionId}: ${thinkGoal}`);
      console.log(`[AiThinkAction] 需要输出变量:`, outputVariables);

      // MVP: 为每个输出变量生成占位符值
      const extractedVariables: Record<string, any> = {};
      for (const varName of outputVariables) {
        if (typeof varName === 'string') {
          extractedVariables[varName] = `[AI思考结果: ${varName}]`;
        }
      }

      return {
        success: true,
        completed: true,
        aiMessage: null, // ai_think 不生成面向用户的消息
        extractedVariables,
        metadata: {
          actionType: AiThinkAction.actionType,
          thinkGoal,
          note: 'MVP版本：占位符实现，未实际调用LLM',
        },
      };
    } catch (e: any) {
      return {
        success: false,
        completed: true,
        error: `ai_think execution error: ${e.message}`,
      };
    }
  }
}
