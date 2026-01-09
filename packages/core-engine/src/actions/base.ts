import type { Message } from '../domain/message.js';

/**
 * Action执行上下文
 */
export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Map<string, unknown>;
  conversationHistory: Message[];
  metadata: Map<string, unknown>;
}

/**
 * Action执行结果
 */
export interface ActionResult {
  success: boolean;
  completed: boolean;
  aiMessage?: string;
  extractedVariables?: Record<string, unknown>;
  nextAction?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Action基类
 */
export abstract class BaseAction {
  public readonly actionId: string;
  public readonly actionType: string;
  protected config: Record<string, unknown>;

  constructor(actionId: string, config: Record<string, unknown> = {}) {
    this.actionId = actionId;
    this.actionType = this.constructor.name.toLowerCase().replace('action', '');
    this.config = config;
  }

  /**
   * 执行Action
   * 
   * @param context 执行上下文
   * @param userInput 用户输入（可选）
   * @returns 执行结果
   */
  abstract execute(context: ActionContext, userInput?: string): Promise<ActionResult>;

  /**
   * 替换模板变量
   */
  protected replaceVariables(template: string, variables: Map<string, unknown>): string {
    let result = template;
    
    // 替换 {{variable}} 格式的变量
    const regex = /\{\{(\w+)\}\}/g;
    result = result.replace(regex, (_, varName) => {
      const value = variables.get(varName);
      return value !== undefined ? String(value) : '';
    });

    return result;
  }

  /**
   * 获取配置值
   */
  protected getConfig<T = unknown>(key: string, defaultValue?: T): T {
    return (this.config[key] as T) ?? defaultValue as T;
  }
}
