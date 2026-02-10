/**
 * Action 注册表
 *
 * 参照: legacy-python/src/actions/registry.py
 */

import { AiAskAction } from './ai-ask-action.js';
import { AiSayAction } from './ai-say-action.js';
import { AiThinkAction } from './ai-think-action.js';
import { BaseAction } from './base-action.js';

export type ActionClass = new (actionId: string, config: Record<string, any>) => BaseAction;

/**
 * Action 类型注册表
 */
export const ACTION_REGISTRY: Record<string, ActionClass> = {
  ai_say: AiSayAction,
  ai_ask: AiAskAction,
  ai_think: AiThinkAction,
  // 后续添加更多 Action 类型
  // use_skill: UseSkillAction,
};

/**
 * 注册新的 Action 类型
 */
export function registerAction(actionType: string, actionClass: ActionClass): void {
  ACTION_REGISTRY[actionType] = actionClass;
}

/**
 * 创建 Action 实例
 */
export function createAction(
  actionType: string,
  actionId: string,
  config: Record<string, any>
): BaseAction {
  const ActionClass = ACTION_REGISTRY[actionType];
  if (!ActionClass) {
    throw new Error(`Unknown action type: ${actionType}`);
  }
  return new ActionClass(actionId, config);
}
