/**
 * Action 基类和类型定义
 * 
 * 参照 Python 版本: legacy-python/src/actions/base.py
 */

export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Record<string, any>;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
}

export interface ActionResult {
  success: boolean;
  completed: boolean; // Action是否完成（可能需要多轮）
  aiMessage?: string | null; // AI生成的消息
  extractedVariables?: Record<string, any> | null; // 提取的变量
  nextAction?: string | null; // 下一个要执行的Action ID
  error?: string | null; // 错误信息
  metadata?: Record<string, any>; // 额外元数据
}

/**
 * Action 基类
 * 
 * 所有Action类型都需要继承此基类并实现execute方法
 */
export abstract class BaseAction {
  static actionType: string = 'base';
  
  public actionId: string;
  public config: Record<string, any>;
  public currentRound: number = 0;
  public maxRounds: number;

  constructor(actionId: string, config: Record<string, any>) {
    this.actionId = actionId;
    this.config = config;
    this.maxRounds = config.maxRounds || config.max_rounds || 5;
  }

  /**
   * 执行Action
   */
  abstract execute(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult>;

  /**
   * 重置Action状态
   */
  reset(): void {
    this.currentRound = 0;
  }

  /**
   * 判断Action是否完成
   */
  isCompleted(): boolean {
    return this.currentRound >= this.maxRounds;
  }

  /**
   * 从上下文获取变量值
   */
  getVariable(context: ActionContext, varName: string, defaultValue: any = null): any {
    return context.variables[varName] ?? defaultValue;
  }

  /**
   * 替换模板中的变量
   * 
   * 支持 ${variable_name} 格式
   */
  substituteVariables(template: string, context: ActionContext): string {
    let result = template;
    for (const [varName, varValue] of Object.entries(context.variables)) {
      const placeholder = `\${${varName}}`;
      if (result.includes(placeholder)) {
        result = result.replace(new RegExp(`\\$\\{${varName}\\}`, 'g'), String(varValue));
      }
    }
    return result;
  }
}
