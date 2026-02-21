/**
 * Script Executor - Core execution engine
 *
 * Reference: legacy-python/src/engines/script_execution/executor.py
 * MVP simplified version: supports ai_say and ai_ask
 *
 * DDD Perspective - Refactoring Notes:
 * ExecutionState is a temporary structure during script execution process.
 * Session is the domain model and is not the persistent state carrier.
 *
 * Refactoring Direction:
 * - ExecutionState should be pure execution state snapshot (current position + temporary data)
 * - State persistence logic should be aggregated into Session
 * - Executor only reads/writes state to Session, without maintaining it
 */

import type { VariableStore, TopicPlan } from '@heartrule/shared-types';

import {
  DefaultActionFactory,
  type ActionFactory,
} from '../../application/actions/action-factory.js';
import { ExecutionResultHandler } from '../../application/handlers/execution-result-handler.js';
import { MonitorOrchestrator } from '../../application/orchestrators/monitor-orchestrator.js';
import { BasicTopicPlanner, type ITopicPlanner } from '../../application/planning/topic-planner.js';
import { ActionStateManager } from '../../application/state/action-state-manager.js';
import type { BaseAction, ActionContext, ActionResult } from '../../domain/actions/base-action.js';
import type { LLMDebugInfo } from '../llm-orchestration/orchestrator.js';
import { LLMOrchestrator } from '../llm-orchestration/orchestrator.js';
import type { TemplateProvider } from '../prompt-template/template-provider.js';
import { VariableScopeResolver } from '../variable-scope/variable-scope-resolver.js';

/**
 * Execution Status
 */
export enum ExecutionStatus {
  RUNNING = 'running',
  WAITING_INPUT = 'waiting_input', // Waiting for user input
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * Execution Position
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
}

/**
 * Execution State
 *
 * Temporary structure used to carry state during script execution, not directly persisted.
 * This structure will be further simplified in future refactoring phases, with state maintenance responsibility transferred to Session domain model.
 *
 * Target Direction:
 * - Pure execution snapshot (currentPosition + context + tempCache)
 * - Remove fields duplicated with Session (status, variables, conversationHistory, etc.)
 */
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;

  variableStore?: VariableStore;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  lastAiMessage: string | null;
  // Extended position information
  currentPhaseId?: string;
  currentTopicId?: string;
  currentActionId?: string;
  currentActionType?: string;
  // LLM debug info (from last LLM call)
  lastLLMDebugInfo?: LLMDebugInfo;

  /**
   * 当前Topic的实例化规划 (Story 2.1)
   * - 进入新Topic时由TopicPlanner生成
   * - 存储实例化后的Action队列
   * - undefined表示使用脚本原始actions(向后兼容)
   */
  currentTopicPlan?: TopicPlan;
}

/**
 * Script Executor
 *
 * [Phase 1] Supports LLM dependency injection
 * [Phase 2] Supports ActionFactory dependency injection
 * [Phase 5] Supports MonitorOrchestrator dependency injection
 * [Phase 6] Supports ActionStateManager dependency injection
 * [Phase 8] Supports ExecutionResultHandler dependency injection
 * [Story 2.1] Supports TopicPlanner dependency injection
 */
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;
  private actionFactory: ActionFactory; // [Phase 2] Added
  private monitorOrchestrator: MonitorOrchestrator; // [Phase 5] Added
  private actionStateManager: ActionStateManager; // [Phase 6] Added
  private resultHandler: ExecutionResultHandler; // [Phase 8] Added
  private topicPlanner: ITopicPlanner; // [Story 2.1] Added

  constructor(
    llmOrchestrator?: LLMOrchestrator,
    actionFactory?: ActionFactory, // [Phase 2] New parameter
    monitorOrchestrator?: MonitorOrchestrator, // [Phase 5] New parameter
    actionStateManager?: ActionStateManager, // [Phase 6] New parameter
    resultHandler?: ExecutionResultHandler, // [Phase 8] New parameter
    topicPlanner?: ITopicPlanner // [Story 2.1] New parameter
  ) {
    // [Phase 1] Dependency injection first, keep default creation logic (backward compatible)
    if (llmOrchestrator) {
      this.llmOrchestrator = llmOrchestrator;
      console.log('[ScriptExecutor] ✅ Using injected LLM Orchestrator');
    } else {
      // Default creation logic (keep existing behavior)
      this.llmOrchestrator = this.createDefaultLLM();
    }

    // [Phase 2] ActionFactory initialization
    if (actionFactory) {
      this.actionFactory = actionFactory;
      console.log('[ScriptExecutor] ✅ Using injected ActionFactory');
    } else {
      // Default factory creation (backward compatible)
      this.actionFactory = new DefaultActionFactory(this.llmOrchestrator);
      console.log('[ScriptExecutor] ✅ Created default ActionFactory');
    }

    // [Phase 5] MonitorOrchestrator initialization
    if (monitorOrchestrator) {
      this.monitorOrchestrator = monitorOrchestrator;
      console.log('[ScriptExecutor] ✅ Using injected MonitorOrchestrator');
    } else {
      // Default creation (backward compatible)
      this.monitorOrchestrator = new MonitorOrchestrator(this.llmOrchestrator);
      console.log('[ScriptExecutor] ✅ Created default MonitorOrchestrator');
    }

    // [Phase 6] ActionStateManager initialization
    if (actionStateManager) {
      this.actionStateManager = actionStateManager;
      console.log('[ScriptExecutor] ✅ Using injected ActionStateManager');
    } else {
      // Default creation (backward compatible)
      this.actionStateManager = new ActionStateManager(this.actionFactory);
      console.log('[ScriptExecutor] ✅ Created default ActionStateManager');
    }

    // [Phase 8] ExecutionResultHandler initialization
    if (resultHandler) {
      this.resultHandler = resultHandler;
      console.log('[ScriptExecutor] ✅ Using injected ExecutionResultHandler');
    } else {
      // Default creation (backward compatible)
      this.resultHandler = new ExecutionResultHandler(
        this.monitorOrchestrator,
        this.actionStateManager
      );
      console.log('[ScriptExecutor] ✅ Created default ExecutionResultHandler');
    }

    // [Story 2.1] TopicPlanner initialization
    if (topicPlanner) {
      this.topicPlanner = topicPlanner;
      console.log('[ScriptExecutor] ✅ Using injected TopicPlanner');
    } else {
      // Default creation (backward compatible)
      this.topicPlanner = new BasicTopicPlanner();
      console.log('[ScriptExecutor] ✅ Created default BasicTopicPlanner');
    }
  }

  /**
   * Create default LLM Orchestrator (deprecated)
   *
   * NOTE: This method is deprecated in Phase 4.2 DDD refactoring.
   * LLM providers have been moved to api-server as adapters.
   * Please inject LLMOrchestrator via constructor instead.
   * This method will be removed in Phase 4.3.
   */
  private createDefaultLLM(): LLMOrchestrator {
    throw new Error(
      '[ScriptExecutor] createDefaultLLM is deprecated. ' +
        'LLM providers have been moved to api-server as hexagonal adapters. ' +
        'Please inject LLMOrchestrator via constructor dependency injection.'
    );
  }
  /**
   * Execute session flow script
   */
  /**
   * Update variables with scope resolver
   */
  private updateVariablesWithScope(
    executionState: ExecutionState,
    extractedVariables: Record<string, any>,
    position: { phaseId?: string; topicId?: string; actionId: string },
    isFromContinue: boolean = false
  ): void {
    // Backward compatible: continue updating old variables
    executionState.variables = {
      ...executionState.variables,
      ...extractedVariables,
    };

    if (!executionState.variableStore) {
      console.warn(
        `[ScriptExecutor] ⚠️ variableStore is not initialized, cannot write variables to scopes`
      );
      return;
    }

    this.writeVariablesToScopes(executionState, extractedVariables, position, isFromContinue);
  }

  /**
   * Write variables to their appropriate scopes
   */
  private writeVariablesToScopes(
    executionState: ExecutionState,
    extractedVariables: Record<string, any>,
    position: { phaseId?: string; topicId?: string; actionId: string },
    isFromContinue: boolean
  ): void {
    const logPrefix = isFromContinue ? '(continueAction)' : '';
    console.log(
      `[ScriptExecutor] 🔍 Processing extracted variables ${logPrefix}:`,
      extractedVariables
    );
    console.log(`[ScriptExecutor] 🔍 Current position:`, position);

    const scopeResolver = new VariableScopeResolver(executionState.variableStore!);

    for (const [varName, varValue] of Object.entries(extractedVariables)) {
      this.writeVariableToScope(scopeResolver, varName, varValue, position);
    }

    this.verifyVariablesWritten(executionState, position, logPrefix);
  }

  /**
   * Write a single variable to its target scope
   */
  private writeVariableToScope(
    scopeResolver: VariableScopeResolver,
    varName: string,
    varValue: any,
    position: { phaseId?: string; topicId?: string; actionId: string }
  ): void {
    console.log(`[ScriptExecutor] 🔍 Processing variable "${varName}" with value:`, varValue);

    const targetScope = scopeResolver.determineScope(varName);
    console.log(`[ScriptExecutor] 📋 Target scope for "${varName}":`, targetScope);

    scopeResolver.setVariable(varName, varValue, targetScope, position, position.actionId);
    console.log(`[ScriptExecutor] ✅ Set variable "${varName}" to ${targetScope} scope`);
  }

  /**
   * Verify variables are written successfully
   */
  private verifyVariablesWritten(
    executionState: ExecutionState,
    position: { phaseId?: string; topicId?: string; actionId: string },
    logPrefix: string
  ): void {
    console.log(`[ScriptExecutor] 🔍 Verifying variableStore after writing ${logPrefix}:`);
    console.log(`[ScriptExecutor] - Global:`, Object.keys(executionState.variableStore!.global));
    console.log(`[ScriptExecutor] - Session:`, Object.keys(executionState.variableStore!.session));

    if (position.phaseId) {
      console.log(
        `[ScriptExecutor] - Phase[${position.phaseId}]:`,
        executionState.variableStore!.phase[position.phaseId]
          ? Object.keys(executionState.variableStore!.phase[position.phaseId])
          : 'undefined'
      );
    }

    if (position.topicId) {
      console.log(
        `[ScriptExecutor] - Topic[${position.topicId}]:`,
        executionState.variableStore!.topic[position.topicId]
          ? Object.keys(executionState.variableStore!.topic[position.topicId])
          : 'undefined'
      );
    }
  }

  /**
   * Handle incomplete action result (save intermediate state)
   */
  async executeSession(
    scriptContent: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null,
    projectId?: string,
    templateProvider?: TemplateProvider
  ): Promise<ExecutionState> {
    try {
      const phases = this.initializeSession(
        scriptContent,
        executionState,
        projectId,
        templateProvider
      );

      // Handle resuming current action if exists
      console.log('[ScriptExecutor] 🔍 Before resumeCurrentActionIfNeeded:', {
        hasCurrentAction: !!executionState.currentAction,
        currentActionId: executionState.currentAction?.actionId,
      });
      const shouldContinue = await this.resumeCurrentActionIfNeeded(
        executionState,
        sessionId,
        userInput,
        phases
      );
      if (!shouldContinue) {
        return executionState;
      }

      // Execute all phases
      await this.executeAllPhases(executionState, phases, sessionId, userInput);

      // Only set COMPLETED if not waiting for input
      if (executionState.status !== ExecutionStatus.WAITING_INPUT) {
        executionState.status = ExecutionStatus.COMPLETED;
      }
      return executionState;
    } catch (e: any) {
      executionState.status = ExecutionStatus.ERROR;
      executionState.metadata.error = e.message;
      throw new Error(`Script execution failed: ${e.message}`);
    }
  }

  /**
   * Initialize session: parse script, setup metadata, restore state
   */
  private initializeSession(
    scriptContent: string,
    executionState: ExecutionState,
    projectId?: string,
    templateProvider?: TemplateProvider
  ): any[] {
    VariableScopeResolver.migrateIfNeeded(executionState);

    const parsed = JSON.parse(scriptContent);
    const sessionData = parsed.session;
    const phases = sessionData.phases;

    this.actionStateManager.setupSessionMetadata(
      executionState,
      sessionData,
      projectId,
      templateProvider
    );
    this.actionStateManager.restoreActionIfNeeded(executionState);

    console.log('[ScriptExecutor] 📊 After restoreActionIfNeeded:', {
      hasCurrentAction: !!executionState.currentAction,
      currentAction: executionState.currentAction
        ? {
            actionId: executionState.currentAction.actionId,
            currentRound: executionState.currentAction.currentRound,
            maxRounds: executionState.currentAction.maxRounds,
          }
        : null,
    });

    return phases;
  }

  /**
   * Resume current action if it's not completed yet
   * Returns true if should continue executing, false if should wait for input
   */
  private async resumeCurrentActionIfNeeded(
    executionState: ExecutionState,
    sessionId: string,
    userInput: string | null | undefined,
    phases: any[]
  ): Promise<boolean> {
    if (!executionState.currentAction) {
      return true; // No action to resume, continue normally
    }

    this.actionStateManager.restorePositionIds(executionState, phases);

    console.log('[ScriptExecutor] 🔄 Continuing current action:', {
      actionId: executionState.currentAction.actionId,
      actionIdx: executionState.currentActionIdx,
      phaseId: executionState.currentPhaseId,
      topicId: executionState.currentTopicId,
      currentRound: executionState.currentAction.currentRound,
      maxRounds: executionState.currentAction.maxRounds,
    });

    const result = await this.continueAction(
      executionState.currentAction,
      executionState,
      sessionId,
      userInput
    );

    if (!result.completed) {
      await this.handleIncompleteAction(executionState, result, sessionId);
      return false; // Wait for more input
    }

    this.handleCompletedAction(executionState, result);

    if (!result.success) {
      return false; // Stop execution on error
    }

    // 先调用 prepareNext 更新索引
    this.resultHandler.prepareNext(executionState, phases);

    // 关键修复：如果 action 完成且有 aiMessage，需要先返回给客户端显示
    // 返回 waiting_input，让客户端显示消息后再继续
    if (result.aiMessage) {
      console.log('[ScriptExecutor] ✅ Action completed with aiMessage, returning to client');
      executionState.status = ExecutionStatus.WAITING_INPUT; // 等待客户端确认
      return false; // 返回给客户端
    }

    console.log('[ScriptExecutor] ✅ Action completed, continuing to execute next actions');
    return true; // Continue to next actions
  }

  /**
   * Handle incomplete action result
   */
  private async handleIncompleteAction(
    executionState: ExecutionState,
    result: ActionResult,
    sessionId: string
  ): Promise<void> {
    await this.resultHandler.handleIncomplete(
      executionState,
      result,
      sessionId,
      executionState.currentPhaseId || '',
      executionState.currentTopicId || '',
      (state, vars) => {
        const position = {
          phaseId: state.currentPhaseId,
          topicId: state.currentTopicId,
          actionId: state.currentAction!.actionId,
        };
        this.updateVariablesWithScope(state, vars, position, true);
      }
    );
    console.log('[ScriptExecutor] ⏸️ Action still not completed, waiting for more input');
  }

  /**
   * Handle completed action result
   */
  private handleCompletedAction(executionState: ExecutionState, result: ActionResult): void {
    console.log('[ScriptExecutor] ✅ Action completed via continue:', {
      actionId: executionState.currentAction!.actionId,
      hasAiMessage: !!result.aiMessage,
    });

    this.resultHandler.handleCompleted(executionState, result, (state, vars) => {
      const position = {
        phaseId: state.currentPhaseId,
        topicId: state.currentTopicId,
        actionId: state.currentAction!.actionId,
      };
      this.updateVariablesWithScope(state, vars, position, true);
    });
  }

  /**
   * Execute all phases in the script
   */
  private async executeAllPhases(
    executionState: ExecutionState,
    phases: any[],
    sessionId: string,
    userInput: string | null | undefined
  ): Promise<void> {
    while (executionState.currentPhaseIdx < phases.length) {
      const phase = phases[executionState.currentPhaseIdx];
      executionState.currentPhaseId = phase.phase_id;

      await this.executePhase(phase, sessionId, executionState, userInput);

      if (executionState.status === ExecutionStatus.WAITING_INPUT) {
        return; // Exit and wait for input
      }

      this.moveToNextPhase(executionState, phases);
    }
  }

  /**
   * Move execution position to next phase
   */
  private moveToNextPhase(executionState: ExecutionState, phases: any[]): void {
    executionState.currentPhaseIdx += 1;
    executionState.currentTopicIdx = 0;
    executionState.currentActionIdx = 0;

    if (executionState.currentPhaseIdx < phases.length) {
      this.updatePositionForNextPhase(executionState, phases[executionState.currentPhaseIdx]);
    } else {
      this.clearPositionIds(executionState);
    }
  }

  /**
   * Update position IDs for next phase
   */
  private updatePositionForNextPhase(executionState: ExecutionState, nextPhase: any): void {
    executionState.currentPhaseId = nextPhase.phase_id;

    if (nextPhase.topics && nextPhase.topics.length > 0) {
      const firstTopic = nextPhase.topics[0];
      executionState.currentTopicId = firstTopic.topic_id;

      if (firstTopic.actions && firstTopic.actions.length > 0) {
        const firstActionConfig = firstTopic.actions[0];
        executionState.currentActionId = firstActionConfig.action_id;
        executionState.currentActionType = firstActionConfig.action_type;
        console.log(
          `[ScriptExecutor] ➡️ Moving to next phase: ${nextPhase.phase_id}, first action: ${firstActionConfig.action_id}`
        );
      } else {
        this.clearActionIds(executionState);
      }
    } else {
      this.clearTopicAndActionIds(executionState);
    }
  }

  /**
   * Clear all position IDs
   */
  private clearPositionIds(executionState: ExecutionState): void {
    executionState.currentPhaseId = undefined;
    executionState.currentTopicId = undefined;
    executionState.currentActionId = undefined;
    executionState.currentActionType = undefined;
  }

  /**
   * Clear action IDs only
   */
  private clearActionIds(executionState: ExecutionState): void {
    executionState.currentActionId = undefined;
    executionState.currentActionType = undefined;
  }

  /**
   * Clear topic and action IDs
   */
  private clearTopicAndActionIds(executionState: ExecutionState): void {
    executionState.currentTopicId = undefined;
    executionState.currentActionId = undefined;
    executionState.currentActionType = undefined;
  }

  /**
   * 判断是否需要(重新)规划Topic
   * Story 2.1: Topic默认Action模板语义与策略定义
   *
   * @param state - 执行状态
   * @param topicId - 当前Topic ID
   * @returns 是否需要规划
   */
  private shouldPlanTopic(state: ExecutionState, topicId: string): boolean {
    // 情兵1: 首次进入Topic(无规划记录)
    if (!state.currentTopicPlan) {
      return true;
    }

    // 情兵2: 进入了不同的Topic
    if (state.currentTopicPlan.topicId !== topicId) {
      return true;
    }

    // 情兵3: 已有规划且Topic未变,继续使用现有规划
    return false;
  }

  /**
   * 规划当前Topic
   * Story 2.1: Topic默认Action模板语义与策略定义
   *
   * @param topicConfig - Topic配置
   * @param executionState - 执行状态
   * @param sessionId - 会话ID
   * @param phaseId - Phase ID
   */
  private async planCurrentTopic(
    topicConfig: any,
    executionState: ExecutionState,
    sessionId: string,
    phaseId: string
  ): Promise<void> {
    const context = {
      topicConfig: {
        topic_id: topicConfig.topic_id,
        actions: topicConfig.actions,
        strategy: topicConfig.strategy,
      },
      variableStore: executionState.variableStore!,
      sessionContext: {
        sessionId,
        phaseId,
        conversationHistory: executionState.conversationHistory,
      },
    };

    const topicPlan = await this.topicPlanner.plan(context);

    // 存储规划结果到ExecutionState
    executionState.currentTopicPlan = topicPlan;

    // 重置Action索引,从实例化队列的第一个Action开始执行
    // 注意：只有在首次规划 topic 时才重置索引
    // 如果 topic 已经在执行中（currentActionIdx > 0），不应该重置
    // 这解决了 resumeCurrentActionIfNeeded 后 executeAllPhases 重新执行 topic 的问题
    // 不重置索引，保持当前的 currentActionIdx

    console.log(`[ScriptExecutor] ✅ Topic planned:`, {
      topicId: topicPlan.topicId,
      actionCount: topicPlan.instantiatedActions.length,
      plannedAt: topicPlan.plannedAt,
      hasStrategy: !!topicConfig.strategy,
    });
  }

  /**
   * 获取Topic的Actions(优先使用实例化队列)
   * Story 2.1: Topic默认Action模板语义与策略定义
   *
   * @param topicConfig - Topic配置
   * @param executionState - 执行状态
   * @returns Action配置列表
   */
  private getTopicActions(topicConfig: any, executionState: ExecutionState): any[] {
    // 优先使用实例化队列
    const plan = executionState.currentTopicPlan;
    if (plan && plan.topicId === topicConfig.topic_id) {
      return plan.instantiatedActions;
    }

    // 回退: 使用脚本原始actions(向后兼容)
    return topicConfig.actions;
  }

  /**
   * Execute Phase
   */
  private async executePhase(
    phase: any,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const phaseId = phase.phase_id;
    const topics = phase.topics;

    // Execute Topics
    while (executionState.currentTopicIdx < topics.length) {
      const topic = topics[executionState.currentTopicIdx];
      executionState.currentTopicId = topic.topic_id;

      await this.executeTopic(topic, phaseId, sessionId, executionState, userInput);

      if (executionState.status === ExecutionStatus.WAITING_INPUT) {
        return;
      }

      this.moveToNextTopic(executionState, topics);
    }
  }

  /**
   * Move execution position to next topic
   */
  private moveToNextTopic(executionState: ExecutionState, topics: any[]): void {
    executionState.currentTopicIdx += 1;
    executionState.currentActionIdx = 0;

    if (executionState.currentTopicIdx < topics.length) {
      this.updatePositionForNextTopic(executionState, topics[executionState.currentTopicIdx]);
    } else {
      this.clearTopicAndActionIds(executionState);
    }
  }

  /**
   * Update position IDs for next topic
   */
  private updatePositionForNextTopic(executionState: ExecutionState, nextTopic: any): void {
    executionState.currentTopicId = nextTopic.topic_id;

    if (nextTopic.actions && nextTopic.actions.length > 0) {
      const firstActionConfig = nextTopic.actions[0];
      executionState.currentActionId = firstActionConfig.action_id;
      executionState.currentActionType = firstActionConfig.action_type;
      console.log(
        `[ScriptExecutor] ➡️ Moving to next topic: ${nextTopic.topic_id}, first action: ${firstActionConfig.action_id}`
      );
    } else {
      this.clearActionIds(executionState);
    }
  }

  /**
   * Execute Topic
   */
  private async executeTopic(
    topic: any,
    phaseId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const topicId = topic.topic_id;

    // [Story 2.1] 检测是否需要(重新)规划Topic
    const needsPlanning = this.shouldPlanTopic(executionState, topicId);

    if (needsPlanning) {
      console.log(`[ScriptExecutor] 🧠 Planning topic: ${topicId}`);

      // 保存当前 actionIdx，因为 planCurrentTopic 不再重置它
      const savedActionIdx = executionState.currentActionIdx;

      await this.planCurrentTopic(topic, executionState, sessionId, phaseId);

      // 只有在首次进入 topic 时才重置索引
      // 如果 savedActionIdx > 0，说明 topic 已经在执行中，不应该重置
      if (savedActionIdx === 0) {
        executionState.currentActionIdx = 0;
      } else {
        executionState.currentActionIdx = savedActionIdx;
        console.log(
          `[ScriptExecutor] 🔄 Restored actionIdx to ${savedActionIdx} (topic already in progress)`
        );
      }
    }

    // [Story 2.1] 从实例化队列读取Actions(优先于脚本模板)
    const actions = this.getTopicActions(topic, executionState);

    console.log(
      `[ScriptExecutor] 🔵 Executing topic: ${topicId}, actions count: ${actions.length}, currentActionIdx: ${executionState.currentActionIdx}`
    );

    // Execute Actions
    while (executionState.currentActionIdx < actions.length) {
      const actionConfig = actions[executionState.currentActionIdx];
      console.log(
        `[ScriptExecutor] 🎯 Executing action [${executionState.currentActionIdx}]: ${actionConfig.action_id} (${actionConfig.action_type})`
      );

      // Create or get Action instance
      if (!executionState.currentAction) {
        const action = this.createAction(actionConfig);
        executionState.currentAction = action;
        executionState.currentActionId = actionConfig.action_id;
        executionState.currentActionType = actionConfig.action_type;
        console.log(`[ScriptExecutor] ✅ Created action instance: ${action.actionId}`);
      }

      const action = executionState.currentAction;

      // Execute Action
      const result = await this.executeAction(
        action,
        phaseId,
        topicId,
        sessionId,
        executionState,
        userInput
      );
      console.log(`[ScriptExecutor] ✅ Action result:`, {
        actionId: action.actionId,
        completed: result.completed,
        success: result.success,
        hasAiMessage: !!result.aiMessage,
        aiMessage: result.aiMessage?.substring(0, 50),
      });

      // user_input only used once
      userInput = null;

      // Handle execution result
      if (!result.completed) {
        this.handleActionNotCompleted(executionState, result, action);
        return;
      }

      // Action completed
      if (result.success) {
        this.handleActionCompleted(executionState, result, phaseId, topicId, action);
      } else {
        executionState.status = ExecutionStatus.ERROR;
        executionState.metadata.error = result.error;
        return;
      }

      // Move to next Action
      this.moveToNextAction(executionState, actions);
    }

    // Topic all Actions executed
    console.log(`[ScriptExecutor] ? Topic completed: ${topicId}`);
    executionState.status = ExecutionStatus.RUNNING;
  }

  /**
   * 处理未完成的 action
   */
  private handleActionNotCompleted(
    executionState: ExecutionState,
    result: ActionResult,
    action: BaseAction
  ): void {
    console.log(`[ScriptExecutor] ⏸️ Action not completed, waiting for input`);

    if (result.aiMessage) {
      executionState.lastAiMessage = result.aiMessage;
      executionState.conversationHistory.push({
        role: 'assistant',
        content: result.aiMessage,
        actionId: action.actionId,
        metadata: result.metadata,
      });
    }

    if (result.debugInfo) {
      executionState.lastLLMDebugInfo = result.debugInfo;
      console.log('[ScriptExecutor] 💾 Saved LLM debug info (action not completed):', {
        hasPrompt: !!result.debugInfo.prompt,
        hasResponse: !!result.debugInfo.response,
      });
    }

    executionState.status = ExecutionStatus.WAITING_INPUT;
    executionState.metadata.actionState = this.actionStateManager.serialize(action);
    console.log(`[ScriptExecutor] 💾 Serialized action state:`, {
      actionId: executionState.metadata.actionState.actionId,
      currentRound: executionState.metadata.actionState.currentRound,
      maxRounds: executionState.metadata.actionState.maxRounds,
    });
    console.log(`[ScriptExecutor] 🔴 Returning to wait for user input`);
  }

  /**
   * 处理已完成的 action
   */
  private handleActionCompleted(
    executionState: ExecutionState,
    result: ActionResult,
    phaseId: string,
    topicId: string,
    action: BaseAction
  ): void {
    console.log(`[ScriptExecutor] ? Action completed successfully`);

    // 处理提取的变量
    if (result.extractedVariables) {
      executionState.variables = {
        ...executionState.variables,
        ...result.extractedVariables,
      };

      if (executionState.variableStore) {
        this.processExtractedVariables(
          executionState,
          result.extractedVariables,
          phaseId,
          topicId,
          action
        );
      }
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

    // 保存 LLM debug info
    if (result.debugInfo) {
      executionState.lastLLMDebugInfo = result.debugInfo;
      console.log('[ScriptExecutor] 💾 Saved LLM debug info:', {
        hasPrompt: !!result.debugInfo.prompt,
        hasResponse: !!result.debugInfo.response,
        model: result.debugInfo.model,
      });
    }

    // 保存 round info
    if (result.metadata?.currentRound !== undefined || result.metadata?.maxRounds !== undefined) {
      executionState.metadata.lastActionRoundInfo = {
        currentRound: result.metadata.currentRound,
        maxRounds: result.metadata.maxRounds,
      };
      console.log(
        '[ScriptExecutor] 🔄 Saved action round info:',
        executionState.metadata.lastActionRoundInfo
      );
    }
  }

  /**
   * 处理提取的变量
   */
  private processExtractedVariables(
    executionState: ExecutionState,
    extractedVariables: Record<string, any>,
    phaseId: string,
    topicId: string,
    action: BaseAction
  ): void {
    if (!executionState.variableStore) {
      console.warn(
        `[ScriptExecutor] ⚠️ variableStore is not initialized, cannot write variables to scopes`
      );
      return;
    }

    console.log(`[ScriptExecutor] 🔍 Processing extracted variables:`, extractedVariables);
    console.log(`[ScriptExecutor] 🔍 Current position:`, {
      phaseId,
      topicId,
      actionId: action.actionId,
    });

    const scopeResolver = new VariableScopeResolver(executionState.variableStore);
    const position = { phaseId, topicId, actionId: action.actionId };

    for (const [varName, varValue] of Object.entries(extractedVariables)) {
      console.log(`[ScriptExecutor] 🔍 Processing variable "${varName}" with value:`, varValue);

      const targetScope = scopeResolver.determineScope(varName);
      console.log(`[ScriptExecutor] 📋 Target scope for "${varName}":`, targetScope);

      scopeResolver.setVariable(varName, varValue, targetScope, position, action.actionId);
      console.log(`[ScriptExecutor] ? Set variable "${varName}" to ${targetScope} scope`);
    }

    console.log(`[ScriptExecutor] 🔍 Verifying variableStore after writing:`);
    console.log(`[ScriptExecutor] - Global:`, Object.keys(executionState.variableStore.global));
    console.log(`[ScriptExecutor] - Session:`, Object.keys(executionState.variableStore.session));
    console.log(
      `[ScriptExecutor] - Phase[${phaseId}]:`,
      executionState.variableStore.phase[phaseId]
        ? Object.keys(executionState.variableStore.phase[phaseId])
        : 'undefined'
    );
    console.log(
      `[ScriptExecutor] - Topic[${topicId}]:`,
      executionState.variableStore.topic[topicId]
        ? Object.keys(executionState.variableStore.topic[topicId])
        : 'undefined'
    );
  }

  /**
   * 移动到下一个 action
   */
  private moveToNextAction(executionState: ExecutionState, actions: any[]): void {
    executionState.currentAction = null;
    executionState.currentActionIdx += 1;
    delete executionState.metadata.actionState;

    if (executionState.currentActionIdx < actions.length) {
      const nextActionConfig = actions[executionState.currentActionIdx];
      executionState.currentActionId = nextActionConfig.action_id;
      executionState.currentActionType = nextActionConfig.action_type;
      console.log(
        `[ScriptExecutor] ➡️ Moving to next action: ${nextActionConfig.action_id} (${nextActionConfig.action_type})`
      );
    } else {
      executionState.currentActionId = undefined;
      executionState.currentActionType = undefined;
      console.log(`[ScriptExecutor] ➡️ No more actions in this topic`);
    }
  }

  /**
   * Execute Action
   */
  private async executeAction(
    action: BaseAction,
    phaseId: string,
    topicId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<ActionResult> {
    // Create scope resolver
    let scopeResolver: VariableScopeResolver | undefined;
    if (executionState.variableStore) {
      scopeResolver = new VariableScopeResolver(executionState.variableStore);
    }

    // Build execution context
    const context: ActionContext = {
      sessionId,
      phaseId,
      topicId,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      // 暂不在全局上下文层注入 systemVariables，交由各具体 Action 构建
      variableStore: executionState.variableStore,
      scopeResolver,
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // Execute Action
    return await action.execute(context, userInput);
  }

  /**
   * Continue executing incomplete Action
   */
  private async continueAction(
    action: BaseAction,
    executionState: ExecutionState,
    sessionId: string,
    userInput?: string | null
  ): Promise<ActionResult> {
    // Update conversation history (user input)
    if (userInput) {
      executionState.conversationHistory.push({
        role: 'user',
        content: userInput,
        actionId: action.actionId,
      });
    }

    // Create scope resolver
    let scopeResolver: VariableScopeResolver | undefined;
    if (executionState.variableStore) {
      scopeResolver = new VariableScopeResolver(executionState.variableStore);
    }

    // Build execution context
    const context: ActionContext = {
      sessionId,
      phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
      topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      variableStore: executionState.variableStore,
      scopeResolver,
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // Continue execution
    return await action.execute(context, userInput);
  }

  /**
   * Create Action instance
   *
   * [Phase 2] Delegate to ActionFactory to create
   */
  private createAction(actionConfig: any): BaseAction {
    const actionType = actionConfig.action_type;
    const actionId = actionConfig.action_id;

    // 🎪 Info: Use entire actionConfig as config, not just actionConfig.config
    // This way max_rounds, mode, template fields can all be read by Action
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { action_id, action_type, ...restConfig } = actionConfig;
    const config = actionConfig.config
      ? { ...restConfig, ...actionConfig.config } // If has config field, merge
      : restConfig; // Otherwise use all other fields

    // Create Action instance
    console.log(`[ScriptExecutor] 🛴? Creating action:`, {
      actionType,
      actionId,
      config,
      hasConfig: !!actionConfig.config,
      configKeys: Object.keys(config),
    });

    // [Phase 2] Delegate to ActionFactory to create
    return this.actionFactory.create(actionType, actionId, config);
  }

  /**
   * Create initial execution state
   */
  static createInitialState(): ExecutionState {
    return {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {},
      variableStore: {
        // New hierarchical variable storage structure
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };
  }
}
