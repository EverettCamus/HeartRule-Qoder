import { ExecutionStatus } from '@heartrule/shared-types';

import type { BaseAction, ActionContext, ActionResult } from '../../actions/base.js';
import type { ActionRegistry } from '../../actions/registry.js';
import type { Message } from '../../domain/message.js';
import type { Script } from '../../domain/script.js';
import type { Session } from '../../domain/session.js';

import { YAMLParser } from './yaml-parser.js';

/**
 * 执行状态
 */
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction?: BaseAction;
  variables: Map<string, unknown>;
  conversationHistory: Message[];
  metadata: Map<string, unknown>;
  lastAiMessage?: string;
}

/**
 * 脚本执行器
 */
export class ScriptExecutor {
  private actionRegistry: ActionRegistry;
  private parser: YAMLParser;

  constructor(actionRegistry: ActionRegistry) {
    this.actionRegistry = actionRegistry;
    this.parser = new YAMLParser();
  }

  /**
   * 执行会谈流程脚本
   */
  async executeSession(
    script: Script,
    session: Session,
    executionState: ExecutionState,
    userInput?: string
  ): Promise<ExecutionState> {
    try {
      // 解析脚本
      if (!script.parsedContent) {
        const parsed = this.parser.parse(script.scriptContent);
        this.parser.validateSessionScript(parsed);
        script.parse(parsed);
      }

      const parsed = script.parsedContent as Record<string, unknown>;
      const sessionData = parsed['session'] as Record<string, unknown>;
      const phases = sessionData['phases'] as Array<Record<string, unknown>>;

      // 如果有当前Action正在执行，继续执行
      if (executionState.currentAction) {
        const result = await this.continueAction(
          executionState.currentAction,
          executionState,
          session,
          userInput
        );

        if (!result.completed) {
          executionState.status = ExecutionStatus.WAITING_INPUT;
          return executionState;
        }

        // Action完成，处理结果
        if (result.success) {
          if (result.extractedVariables) {
            Object.entries(result.extractedVariables).forEach(([key, value]) => {
              executionState.variables.set(key, value);
            });
          }

          if (result.aiMessage) {
            executionState.lastAiMessage = result.aiMessage;
          }
        } else {
          executionState.status = ExecutionStatus.ERROR;
          executionState.metadata.set('error', result.error || 'Unknown error');
          return executionState;
        }

        executionState.currentAction = undefined;
        executionState.currentActionIdx++;
      }

      // 执行脚本流程
      while (executionState.currentPhaseIdx < phases.length) {
        const phase = phases[executionState.currentPhaseIdx];

        const state = await this.executePhase(phase, session, executionState, userInput);

        if (state.status === ExecutionStatus.WAITING_INPUT) {
          return state;
        }

        executionState.currentPhaseIdx++;
        executionState.currentTopicIdx = 0;
        executionState.currentActionIdx = 0;
      }

      // 所有Phase执行完成
      executionState.status = ExecutionStatus.COMPLETED;
      return executionState;
    } catch (error) {
      executionState.status = ExecutionStatus.ERROR;
      executionState.metadata.set('error', (error as Error).message);
      throw new Error(`Script execution failed: ${(error as Error).message}`);
    }
  }

  /**
   * 执行Phase
   */
  private async executePhase(
    phase: Record<string, unknown>,
    session: Session,
    executionState: ExecutionState,
    userInput?: string
  ): Promise<ExecutionState> {
    const topics = phase['topics'] as Array<Record<string, unknown>>;

    while (executionState.currentTopicIdx < topics.length) {
      const topic = topics[executionState.currentTopicIdx];

      const state = await this.executeTopic(
        topic,
        phase['phase_id'] as string,
        session,
        executionState,
        userInput
      );

      if (state.status === ExecutionStatus.WAITING_INPUT) {
        return state;
      }

      executionState.currentTopicIdx++;
      executionState.currentActionIdx = 0;
    }

    return executionState;
  }

  /**
   * 执行Topic
   */
  private async executeTopic(
    topic: Record<string, unknown>,
    phaseId: string,
    session: Session,
    executionState: ExecutionState,
    userInput?: string
  ): Promise<ExecutionState> {
    const actions = topic['actions'] as Array<Record<string, unknown>>;

    while (executionState.currentActionIdx < actions.length) {
      const actionConfig = actions[executionState.currentActionIdx];

      // 创建或获取Action实例
      if (!executionState.currentAction) {
        const action = this.createAction(actionConfig);
        executionState.currentAction = action;
      }

      // 执行Action
      const result = await this.executeAction(
        executionState.currentAction,
        phaseId,
        topic['topic_id'] as string,
        session,
        executionState,
        userInput
      );

      // 清除userInput，避免重复使用
      userInput = undefined;

      if (!result.completed) {
        if (result.aiMessage) {
          executionState.lastAiMessage = result.aiMessage;
        }
        executionState.status = ExecutionStatus.WAITING_INPUT;
        return executionState;
      }

      if (result.success) {
        if (result.extractedVariables) {
          Object.entries(result.extractedVariables).forEach(([key, value]) => {
            executionState.variables.set(key, value);
          });
        }

        if (result.aiMessage) {
          executionState.lastAiMessage = result.aiMessage;
        }
      } else {
        executionState.status = ExecutionStatus.ERROR;
        executionState.metadata.set('error', result.error || 'Unknown error');
        return executionState;
      }

      executionState.currentAction = undefined;
      executionState.currentActionIdx++;
    }

    executionState.status = ExecutionStatus.RUNNING;
    return executionState;
  }

  /**
   * 执行Action
   */
  private async executeAction(
    action: BaseAction,
    phaseId: string,
    topicId: string,
    session: Session,
    executionState: ExecutionState,
    userInput?: string
  ): Promise<ActionResult> {
    const context: ActionContext = {
      sessionId: session.sessionId,
      phaseId,
      topicId,
      actionId: action.actionId,
      variables: new Map(executionState.variables),
      conversationHistory: [...executionState.conversationHistory],
      metadata: new Map(executionState.metadata),
    };

    return action.execute(context, userInput);
  }

  /**
   * 继续执行未完成的Action
   */
  private async continueAction(
    action: BaseAction,
    executionState: ExecutionState,
    session: Session,
    userInput?: string
  ): Promise<ActionResult> {
    const context: ActionContext = {
      sessionId: session.sessionId,
      phaseId: `phase_${executionState.currentPhaseIdx}`,
      topicId: `topic_${executionState.currentTopicIdx}`,
      actionId: action.actionId,
      variables: new Map(executionState.variables),
      conversationHistory: [...executionState.conversationHistory],
      metadata: new Map(executionState.metadata),
    };

    return action.execute(context, userInput);
  }

  /**
   * 创建Action实例
   */
  private createAction(actionConfig: Record<string, unknown>): BaseAction {
    const actionType = actionConfig['action_type'] as string;
    const actionId = actionConfig['action_id'] as string;
    const config = (actionConfig['config'] as Record<string, unknown>) || {};

    const ActionClass = this.actionRegistry.get(actionType);
    if (!ActionClass) {
      throw new Error(`Unknown action type: ${actionType}`);
    }

    return new ActionClass(actionId, config);
  }
}
