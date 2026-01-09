import type { BaseAction } from './base.js';

/**
 * Action注册表类型
 */
export type ActionRegistry = Map<string, new (actionId: string, config: Record<string, unknown>) => BaseAction>;

/**
 * 全局Action注册表
 */
export const ACTION_REGISTRY: ActionRegistry = new Map();

/**
 * 注册Action类型
 */
export function registerAction(
  actionType: string,
  actionClass: new (actionId: string, config: Record<string, unknown>) => BaseAction
): void {
  ACTION_REGISTRY.set(actionType, actionClass);
}

/**
 * 获取Action类
 */
export function getActionClass(actionType: string): (new (actionId: string, config: Record<string, unknown>) => BaseAction) | undefined {
  return ACTION_REGISTRY.get(actionType);
}

/**
 * 创建Action实例
 */
export function createAction(
  actionType: string,
  actionId: string,
  config: Record<string, unknown>
): BaseAction {
  const ActionClass = ACTION_REGISTRY.get(actionType);
  
  if (!ActionClass) {
    throw new Error(`Unknown action type: ${actionType}`);
  }

  return new ActionClass(actionId, config);
}
