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

import type { VariableStore } from '@heartrule/shared-types';

import { ExecutionResultHandler } from '../../application/handlers/execution-result-handler.js';
import { MonitorOrchestrator } from '../../application/orchestrators/monitor-orchestrator.js';
import { ActionStateManager } from '../../application/state/action-state-manager.js';
import { DefaultActionFactory, type ActionFactory } from '../../domain/actions/action-factory.js';
import type { BaseAction, ActionContext, ActionResult } from '../../domain/actions/base-action.js';
import type { LLMDebugInfo } from '../llm-orchestration/orchestrator.js';
import { LLMOrchestrator } from '../llm-orchestration/orchestrator.js';
import { VolcanoDeepSeekProvider } from '../llm-orchestration/volcano-provider.js';
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
}

/**
 * Script Executor
 *
 * [Phase 1] Supports LLM dependency injection
 * [Phase 2] Supports ActionFactory dependency injection
 * [Phase 5] Supports MonitorOrchestrator dependency injection
 * [Phase 6] Supports ActionStateManager dependency injection
 * [Phase 8] Supports ExecutionResultHandler dependency injection
 */
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;
  private actionFactory: ActionFactory; // [Phase 2] Added
  private monitorOrchestrator: MonitorOrchestrator; // [Phase 5] Added
  private actionStateManager: ActionStateManager; // [Phase 6] Added
  private resultHandler: ExecutionResultHandler; // [Phase 8] Added

  constructor(
    llmOrchestrator?: LLMOrchestrator,
    actionFactory?: ActionFactory, // [Phase 2] New parameter
    monitorOrchestrator?: MonitorOrchestrator, // [Phase 5] New parameter
    actionStateManager?: ActionStateManager, // [Phase 6] New parameter
    resultHandler?: ExecutionResultHandler // [Phase 8] New parameter
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
  }

  /**
   * Create default LLM Orchestrator (backward compatible)
   */
  private createDefaultLLM(): LLMOrchestrator {
    // Initialize LLM Orchestrator
    // Configure LLM provider: supports Volcano, VOLCENGINE, ARK
    const apiKey =
      process.env.VOLCENGINE_API_KEY ||
      process.env.VOLCANO_API_KEY ||
      process.env.ARK_API_KEY ||
      '';
    const endpointId =
      process.env.VOLCENGINE_MODEL || process.env.VOLCANO_ENDPOINT_ID || 'deepseek-v3-250324';
    const baseUrl =
      process.env.VOLCENGINE_BASE_URL ||
      process.env.VOLCANO_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/v3';

    // Create Volcano DeepSeek Provider
    const provider = new VolcanoDeepSeekProvider(
      {
        model: endpointId,
        temperature: 0.7,
        maxTokens: 2000,
      },
      apiKey,
      endpointId,
      baseUrl
    );

    // Create LLM Orchestrator
    const orchestrator = new LLMOrchestrator(provider, 'volcano');

    console.log('[ScriptExecutor] ✅ LLM Orchestrator initialized:', {
      provider: 'volcano',
      endpointId,
      hasApiKey: !!apiKey,
      baseUrl,
    });

    return orchestrator;
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

    this.resultHandler.prepareNext(executionState, phases);
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
    const actions = topic.actions;
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
