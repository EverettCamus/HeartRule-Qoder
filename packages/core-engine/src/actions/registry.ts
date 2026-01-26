/**
 * @deprecated 旧版 Action 注册表，将在第二阶段迁移到 action-registry.ts
 * 
 * 请使用 action-registry.ts 中的新版接口：
 * - createAction() 支持自动注入 LLMOrchestrator
 * - 支持更灵活的注册机制
 * 
 * 迁移计划：
 * 1. 首先将所有 registerAction 调用迁移到新注册表
 * 2. 更新 api-server 中的引用
 * 3. 删除此文件
 */

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
