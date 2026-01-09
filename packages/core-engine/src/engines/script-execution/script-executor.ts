/**
 * 脚本执行引擎核心执行器
 * 
 * 参照: legacy-python/src/engines/script_execution/executor.py
 * MVP 简化版本：支持 ai_say 和 ai_ask
 */

import { createAction } from '../../actions/action-registry.js';
import type { BaseAction } from '../../actions/base-action.js';
import type { ActionContext, ActionResult } from '../../actions/base-action.js';

/**
 * 执行状态
 */
export enum ExecutionStatus {
  RUNNING = 'running',
  WAITING_INPUT = 'waiting_input', // 等待用户输入
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * 执行位置
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
}

/**
 * 执行状态
 */
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  lastAiMessage: string | null;
}

/**
 * 脚本执行器
 */
export class ScriptExecutor {
  /**
   * 执行会谈流程脚本
   */
  async executeSession(
    scriptContent: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<ExecutionState> {
    try {
      // 解析脚本
      const parsed = JSON.parse(scriptContent);
      const sessionData = parsed.session;
      const phases = sessionData.phases;

      // 如果 metadata 中有保存的 Action 状态，恢复它
      if (executionState.metadata.actionState && !executionState.currentAction) {
        executionState.currentAction = this.deserializeActionState(executionState.metadata.actionState);
      }

      // 如果有当前Action正在执行，继续执行
      if (executionState.currentAction) {
        const result = await this.continueAction(
          executionState.currentAction,
          executionState,
          sessionId,
          userInput
        );

        if (!result.completed) {
          // Action未完成，继续等待
          executionState.status = ExecutionStatus.WAITING_INPUT;
          // 保存 Action 内部状态
          executionState.metadata.actionState = this.serializeActionState(executionState.currentAction);
          return executionState;
        }

        // Action完成，处理结果
        if (result.success) {
          // 更新变量
          if (result.extractedVariables) {
            executionState.variables = {
              ...executionState.variables,
              ...result.extractedVariables,
            };
          }

          // 添加AI消息到对话历史
          if (result.aiMessage) {
            executionState.conversationHistory.push({
              role: 'assistant',
              content: result.aiMessage,
              actionId: executionState.currentAction.actionId,
              metadata: result.metadata,
            });
            executionState.lastAiMessage = result.aiMessage;
          }
        } else {
          // Action执行失败
          executionState.status = ExecutionStatus.ERROR;
          executionState.metadata.error = result.error;
          return executionState;
        }

        // 继续下一个
        executionState.currentAction = null;
        executionState.currentActionIdx += 1;
        // 清除保存的 Action 状态
        delete executionState.metadata.actionState;
      }

      // 执行脚本流程
      while (executionState.currentPhaseIdx < phases.length) {
        const phase = phases[executionState.currentPhaseIdx];

        // 执行Phase
        await this.executePhase(phase, sessionId, executionState, userInput);

        if (executionState.status === ExecutionStatus.WAITING_INPUT) {
          return executionState;
        }

        // Phase完成，进入下一个
        executionState.currentPhaseIdx += 1;
        executionState.currentTopicIdx = 0;
        executionState.currentActionIdx = 0;
      }

      // 所有Phase执行完成
      executionState.status = ExecutionStatus.COMPLETED;
      return executionState;
    } catch (e: any) {
      executionState.status = ExecutionStatus.ERROR;
      executionState.metadata.error = e.message;
      throw new Error(`Script execution failed: ${e.message}`);
    }
  }

  /**
   * 执行Phase
   */
  private async executePhase(
    phase: any,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const phaseId = phase.phase_id;
    const topics = phase.topics;

    // 执行Topics
    while (executionState.currentTopicIdx < topics.length) {
      const topic = topics[executionState.currentTopicIdx];

      await this.executeTopic(topic, phaseId, sessionId, executionState, userInput);

      if (executionState.status === ExecutionStatus.WAITING_INPUT) {
        return;
      }

      // Topic完成，进入下一个
      executionState.currentTopicIdx += 1;
      executionState.currentActionIdx = 0;
    }
  }

  /**
   * 执行Topic
   */
  private async executeTopic(
    topic: any,
    phaseId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const topicId = topic.topic_id;
    const actions = topic.actions;

    // 执行Actions
    while (executionState.currentActionIdx < actions.length) {
      const actionConfig = actions[executionState.currentActionIdx];

      // 创建或获取Action实例
      if (!executionState.currentAction) {
        const action = this.createAction(actionConfig);
        executionState.currentAction = action;
      }

      const action = executionState.currentAction;

      // 执行Action
      const result = await this.executeAction(
        action,
        phaseId,
        topicId,
        sessionId,
        executionState,
        userInput
      );

      // user_input 只用一次
      userInput = null;

      // 处理执行结果
      if (!result.completed) {
        // Action未完成，但可能有 AI 消息（如 ai_ask 的问题）
        if (result.aiMessage) {
          executionState.lastAiMessage = result.aiMessage;
          // 也添加到对话历史
          executionState.conversationHistory.push({
            role: 'assistant',
            content: result.aiMessage,
            actionId: action.actionId,
            metadata: result.metadata,
          });
        }
        // 需要等待用户输入
        executionState.status = ExecutionStatus.WAITING_INPUT;
        // 保存 Action 内部状态
        executionState.metadata.actionState = this.serializeActionState(action);
        return;
      }

      // Action完成，处理结果
      if (result.success) {
        // 更新变量
        if (result.extractedVariables) {
          executionState.variables = {
            ...executionState.variables,
            ...result.extractedVariables,
          };
        }

        // 添加到对话历史
        if (result.aiMessage) {
          executionState.conversationHistory.push({
            role: 'assistant',
            content: result.aiMessage,
            actionId: action.actionId,
            metadata: result.metadata,
          });
          executionState.lastAiMessage = result.aiMessage;
        }
      } else {
        // Action执行失败
        executionState.status = ExecutionStatus.ERROR;
        executionState.metadata.error = result.error;
        return;
      }

      // 移动到下一个Action
      executionState.currentAction = null;
      executionState.currentActionIdx += 1;
      // 清除保存的 Action 状态
      delete executionState.metadata.actionState;
    }

    // Topic 所有 Actions 已执行完成
    executionState.status = ExecutionStatus.RUNNING;
  }

  /**
   * 执行Action
   */
  private async executeAction(
    action: BaseAction,
    phaseId: string,
    topicId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<ActionResult> {
    // 构建执行上下文
    const context: ActionContext = {
      sessionId,
      phaseId,
      topicId,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // 执行Action
    return await action.execute(context, userInput);
  }

  /**
   * 继续执行未完成的Action
   */
  private async continueAction(
    action: BaseAction,
    executionState: ExecutionState,
    sessionId: string,
    userInput?: string | null
  ): Promise<ActionResult> {
    // 构建执行上下文
    const context: ActionContext = {
      sessionId,
      phaseId: `phase_${executionState.currentPhaseIdx}`,
      topicId: `topic_${executionState.currentTopicIdx}`,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // 更新对话历史（用户输入）
    if (userInput) {
      executionState.conversationHistory.push({
        role: 'user',
        content: userInput,
        actionId: action.actionId,
      });
    }

    // 继续执行
    return await action.execute(context, userInput);
  }

  /**
   * 创建Action实例
   */
  private createAction(actionConfig: any): BaseAction {
    const actionType = actionConfig.action_type;
    const actionId = actionConfig.action_id;
    const config = actionConfig.config || {};

    return createAction(actionType, actionId, config);
  }

  /**
   * 创建初始执行状态
   */
  static createInitialState(): ExecutionState {
    return {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {},
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };
  }

  /**
   * 序列化 Action 状态（保存 currentRound 等内部状态）
   */
  private serializeActionState(action: BaseAction): any {
    return {
      actionId: action.actionId,
      actionType: (action.constructor as any).actionType,
      config: action['config'],
      currentRound: action['currentRound'] || 0,
      maxRounds: action['maxRounds'] || 3,
    };
  }

  /**
   * 从保存的状态恢复 Action 实例
   */
  private deserializeActionState(actionState: any): BaseAction {
    const action = createAction(actionState.actionType, actionState.actionId, actionState.config);
    // 恢复内部状态
    action['currentRound'] = actionState.currentRound || 0;
    action['maxRounds'] = actionState.maxRounds || 3;
    return action;
  }
}
