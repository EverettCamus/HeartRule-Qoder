/**
 * ActionFactory - Phase 2 重构
 *
 * 将Action创建逻辑从ScriptExecutor中解耦，提高可测试性和可扩展性
 */

import type { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';

import { createAction } from './action-registry.js';
import { AiAskAction } from '../../domain/actions/ai-ask-action.js';
import { AiSayAction } from '../../domain/actions/ai-say-action.js';
import type { BaseAction } from '../../domain/actions/base-action.js';

/**
 * Action工厂接口
 *
 * 定义Action创建的统一接口，支持依赖注入和自定义实现
 */
export interface ActionFactory {
  /**
   * 创建Action实例
   *
   * @param actionType Action类型（如'ai_say', 'ai_ask'）
   * @param actionId Action唯一标识
   * @param config Action配置对象
   * @returns Action实例
   */
  create(actionType: string, actionId: string, config: any): BaseAction;
}

/**
 * 默认Action工厂实现
 *
 * 【Phase 2】支持LLM注入，优先处理ai_say/ai_ask，回退到通用注册表
 */
export class DefaultActionFactory implements ActionFactory {
  constructor(
    private llmOrchestrator?: LLMOrchestrator,
    private registry?: any // ActionRegistry，可选
  ) {}

  /**
   * 创建Action实例
   */
  create(actionType: string, actionId: string, config: any): BaseAction {
    console.log(`[ActionFactory] 🏭 Creating action:`, {
      actionType,
      actionId,
      hasLLM: !!this.llmOrchestrator,
      hasRegistry: !!this.registry,
    });

    // 优先使用注册表（如果提供）
    if (this.registry) {
      const ActionClass = this.registry.get(actionType);
      if (ActionClass) {
        console.log(`[ActionFactory] ✅ Using registry for: ${actionType}`);
        return new ActionClass(actionId, config);
      }
    }

    // 回退到硬编码（向后兼容）
    switch (actionType) {
      case 'ai_say':
        if (!this.llmOrchestrator) {
          throw new Error('LLMOrchestrator required for ai_say');
        }
        return new AiSayAction(actionId, config, this.llmOrchestrator);

      case 'ai_ask':
        if (!this.llmOrchestrator) {
          throw new Error('LLMOrchestrator required for ai_ask');
        }
        return new AiAskAction(actionId, config, this.llmOrchestrator);

      default:
        // 使用通用注册表创建
        console.log(`[ActionFactory] 🔄 Fallback to createAction for: ${actionType}`);
        return createAction(actionType, actionId, config);
    }
  }
}
