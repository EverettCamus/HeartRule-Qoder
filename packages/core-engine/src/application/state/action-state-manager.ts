/**
 * Action State Manager - Manages action state persistence
 *
 * [Phase 6] Extracted from ScriptExecutor state management methods
 *
 * Responsibilities:
 * - Serialize/deserialize action state
 * - Restore action state from metadata
 * - Restore execution position IDs
 * - Setup session metadata
 */

import type { ActionFactory } from '../../domain/actions/action-factory.js';
import type { BaseAction } from '../../domain/actions/base-action.js';
import type { TemplateProvider } from '../../engines/prompt-template/template-provider.js';
import type { ExecutionState } from '../../engines/script-execution/script-executor.js';

/**
 * Action State Snapshot
 *
 * Serializable representation of action state for persistence
 */
export interface ActionStateSnapshot {
  actionId: string;
  actionType: string;
  config: any;
  currentRound: number;
  maxRounds: number;
}

/**
 * Action State Manager
 *
 * Manages action state lifecycle: serialize, deserialize, restore
 */
export class ActionStateManager {
  constructor(private actionFactory: ActionFactory) {}

  /**
   * Serialize action state for persistence
   */
  serialize(action: BaseAction): ActionStateSnapshot {
    return {
      actionId: action.actionId,
      actionType: (action.constructor as any).actionType,
      config: action['config'],
      currentRound: action['currentRound'] || 0,
      maxRounds: action['maxRounds'] || 3,
    };
  }

  /**
   * Deserialize action state and restore action instance
   */
  deserialize(actionState: ActionStateSnapshot): BaseAction {
    const action = this.actionFactory.create(
      actionState.actionType,
      actionState.actionId,
      actionState.config
    );
    action.currentRound = actionState.currentRound || 0;
    action.maxRounds = actionState.maxRounds || 3;
    return action;
  }

  /**
   * Restore action state from metadata if exists
   */
  restoreActionIfNeeded(executionState: ExecutionState): void {
    if (executionState.metadata.actionState && !executionState.currentAction) {
      console.log('[ActionStateManager] 🔄 Deserializing action state:', {
        actionId: executionState.metadata.actionState.actionId,
        currentRound: executionState.metadata.actionState.currentRound,
      });
      executionState.currentAction = this.deserialize(executionState.metadata.actionState);
    }
  }

  /**
   * Restore position IDs from script phases
   */
  restorePositionIds(executionState: ExecutionState, phases: any[]): void {
    const resumedPhase = phases[executionState.currentPhaseIdx];
    if (resumedPhase) {
      executionState.currentPhaseId = resumedPhase.phase_id;
      const resumedTopic = resumedPhase.topics[executionState.currentTopicIdx];
      if (resumedTopic) {
        executionState.currentTopicId = resumedTopic.topic_id;
        const resumedActionConfig = resumedTopic.actions[executionState.currentActionIdx];
        if (resumedActionConfig) {
          executionState.currentActionId = resumedActionConfig.action_id;
          executionState.currentActionType = resumedActionConfig.action_type;
        }
      }
    }
  }

  /**
   * Setup session metadata from script config
   */
  setupSessionMetadata(
    executionState: ExecutionState,
    sessionData: any,
    projectId?: string,
    templateProvider?: TemplateProvider
  ): void {
    if (!executionState.metadata.sessionConfig) {
      executionState.metadata.sessionConfig = {
        template_scheme: sessionData.template_scheme,
      };
    }
    if (projectId) {
      executionState.metadata.projectId = projectId;
    }
    if (templateProvider) {
      executionState.metadata.templateProvider = templateProvider;
    }
  }
}
