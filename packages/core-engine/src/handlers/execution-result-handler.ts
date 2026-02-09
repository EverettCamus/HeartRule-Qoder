/**
 * Execution Result Handler - Processes action execution results
 *
 * [Phase 8] Extracted from ScriptExecutor result handling methods
 *
 * Responsibilities:
 * - Handle incomplete action results (save intermediate state)
 * - Handle completed action results
 * - Prepare next action in sequence
 */

import type { ActionResult } from '../actions/base-action.js';
import type {
  ExecutionState,
  ExecutionStatus,
} from '../engines/script-execution/script-executor.js';
import type { MonitorOrchestrator } from '../orchestrators/monitor-orchestrator.js';
import type { ActionStateManager } from '../state/action-state-manager.js';

/**
 * Execution Result Handler
 *
 * Manages the processing of action execution results and state transitions
 */
export class ExecutionResultHandler {
  constructor(
    private monitorOrchestrator: MonitorOrchestrator,
    private actionStateManager: ActionStateManager
  ) {}

  /**
   * Handle incomplete action result (save intermediate state)
   */
  async handleIncomplete(
    executionState: ExecutionState,
    result: ActionResult,
    sessionId: string,
    phaseId: string,
    topicId: string,
    updateVariablesFn: (state: ExecutionState, vars: Record<string, any>) => void
  ): Promise<void> {
    executionState.status = 'waiting_input' as ExecutionStatus;

    // Save extracted variables
    if (result.extractedVariables) {
      updateVariablesFn(executionState, result.extractedVariables);
    }

    // Ensure conversationHistory array exists
    if (!executionState.conversationHistory) {
      executionState.conversationHistory = [];
    }

    // Ensure metadata exists
    if (!executionState.metadata) {
      executionState.metadata = {};
    }

    // Save AI message
    if (result.aiMessage) {
      executionState.lastAiMessage = result.aiMessage;
      executionState.conversationHistory.push({
        role: 'assistant',
        content: result.aiMessage,
        actionId: executionState.currentAction?.actionId,
        metadata: result.metadata,
      });
    }

    // Save LLM debug info
    if (result.debugInfo) {
      executionState.lastLLMDebugInfo = result.debugInfo;
      executionState.metadata.debugInfo = result.debugInfo;
    }

    // Save round info
    if (result.metadata?.currentRound !== undefined) {
      if (!executionState.metadata.actionRoundInfo) {
        executionState.metadata.actionRoundInfo = {};
      }
      executionState.metadata.actionRoundInfo[executionState.currentAction?.actionId || 'unknown'] =
        {
          currentRound: result.metadata.currentRound,
          maxRounds: result.metadata.maxRounds || 3,
          lastUpdated: new Date().toISOString(),
        };
    }

    // Record exit decision if exists
    if (result.metadata?.exitDecision) {
      if (!executionState.metadata.exitDecisions) {
        executionState.metadata.exitDecisions = [];
      }
      executionState.metadata.exitDecisions.push({
        actionId: executionState.currentAction?.actionId || 'unknown',
        decision: result.metadata.exitDecision,
        timestamp: new Date().toISOString(),
      });
    }

    // Serialize action state (only if currentAction exists)
    if (executionState.currentAction) {
      executionState.metadata.actionState = this.actionStateManager.serialize(
        executionState.currentAction
      );
    }

    // Store metrics and trigger monitor analysis
    await this.storeMetricsAndTriggerMonitor(executionState, result, sessionId, phaseId, topicId);
  }

  /**
   * Handle completed action result
   */
  handleCompleted(
    executionState: ExecutionState,
    result: ActionResult,
    updateVariablesFn: (state: ExecutionState, vars: Record<string, any>) => void
  ): void {
    // Ensure conversationHistory array exists
    if (!executionState.conversationHistory) {
      executionState.conversationHistory = [];
    }

    // Ensure metadata exists
    if (!executionState.metadata) {
      executionState.metadata = {};
    }

    if (result.success) {
      // Mark as completed
      executionState.status = 'completed' as ExecutionStatus;

      // Update variables
      if (result.extractedVariables) {
        updateVariablesFn(executionState, result.extractedVariables);
      }

      // Add AI message to conversation history
      if (result.aiMessage) {
        executionState.conversationHistory.push({
          role: 'assistant',
          content: result.aiMessage,
          actionId: executionState.currentAction?.actionId,
          metadata: result.metadata,
        });
        executionState.lastAiMessage = result.aiMessage;
      }

      // Save LLM debug info
      if (result.debugInfo) {
        executionState.lastLLMDebugInfo = result.debugInfo;
      }

      // Clear action state after completion
      if (executionState.metadata.actionState) {
        delete executionState.metadata.actionState;
      }
    } else {
      // Action execution failed
      executionState.status = 'error' as ExecutionStatus;
      executionState.metadata.error = result.error;
    }
  }

  /**
   * Prepare next action after current action completes
   */
  prepareNext(executionState: ExecutionState, phases: any[]): void {
    executionState.currentAction = null;
    executionState.currentActionIdx += 1;

    // Ensure metadata exists before trying to delete properties
    if (!executionState.metadata) {
      executionState.metadata = {};
    }

    // Clear action state
    if (executionState.metadata.actionState) {
      delete executionState.metadata.actionState;
    }

    // Pre-load next Action ID
    const currentPhase = phases[executionState.currentPhaseIdx];
    if (currentPhase) {
      const currentTopic = currentPhase.topics[executionState.currentTopicIdx];
      if (currentTopic && executionState.currentActionIdx < currentTopic.actions.length) {
        const nextActionConfig = currentTopic.actions[executionState.currentActionIdx];
        executionState.currentActionId = nextActionConfig.action_id;
        executionState.currentActionType = nextActionConfig.action_type;

        // Use ActionStateManager to restore position IDs
        this.actionStateManager.restorePositionIds(executionState, phases);
      } else {
        // Move to next topic or phase
        executionState.currentTopicIdx += 1;

        // Check if we need to move to next phase
        if (!currentPhase.topics[executionState.currentTopicIdx]) {
          executionState.currentPhaseIdx += 1;
          executionState.currentTopicIdx = 0;

          // Check if script is finished
          if (executionState.currentPhaseIdx >= phases.length) {
            executionState.status = 'completed' as ExecutionStatus;
            executionState.currentPhaseId = undefined;
            executionState.currentTopicId = undefined;
            executionState.currentActionId = undefined;
            executionState.currentActionType = undefined;
            return;
          }
        }

        // Reset action index for new topic
        executionState.currentActionIdx = 0;

        // Restore position IDs
        this.actionStateManager.restorePositionIds(executionState, phases);
      }
    } else {
      // No more phases, mark as completed
      executionState.status = 'completed' as ExecutionStatus;
      executionState.currentPhaseId = undefined;
      executionState.currentTopicId = undefined;
      executionState.currentActionId = undefined;
      executionState.currentActionType = undefined;
    }
  }

  /**
   * Store metrics and trigger monitor analysis
   */
  private async storeMetricsAndTriggerMonitor(
    executionState: ExecutionState,
    result: ActionResult,
    sessionId: string,
    phaseId: string,
    topicId: string
  ): Promise<void> {
    // Ensure metadata exists
    if (!executionState.metadata) {
      executionState.metadata = {};
    }

    // Store action metrics
    if (result.metrics) {
      if (!executionState.metadata.actionMetricsHistory) {
        executionState.metadata.actionMetricsHistory = [];
      }
      executionState.metadata.actionMetricsHistory.push({
        actionId: executionState.currentAction?.actionId || 'unknown',
        actionType: executionState.currentActionType || 'unknown',
        metrics: result.metrics,
        timestamp: new Date().toISOString(),
      });
    }

    // Trigger monitor analysis (only if currentAction and actionType exist)
    if (executionState.currentActionType && executionState.currentAction) {
      await this.monitorOrchestrator.analyze(
        executionState.currentActionType,
        executionState.currentAction.actionId,
        result,
        executionState,
        sessionId,
        phaseId,
        topicId
      );
    }
  }
}
