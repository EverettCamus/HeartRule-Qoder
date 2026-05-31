/**
 * Session Response Builder
 *
 * DTO construction logic extracted from SessionManager.
 * Builds the API response shape from execution state and session data.
 */

import type { Session } from '@heartrule/core-engine';
import { createLogger } from '@heartrule/core-engine';
import type { DetailedApiError } from '@heartrule/shared-types';
import { ExecutionStatus } from '@heartrule/shared-types';
import yaml from 'yaml';

import { buildDetailedError } from '../utils/error-handler.js';

import type { SessionData, ScriptData } from './session-repository.js';
import {
  flattenVariableStore,
  calculateRoundChanges,
  extractExitReasonFromSession,
} from './session-variable-utils.js';

function extractOrderedActionIds(script: ScriptData): string[] {
  try {
    const scriptObj =
      typeof script.scriptContent === 'string'
        ? (yaml.parse(script.scriptContent) as any)
        : script.scriptContent;
    const sessionData = scriptObj.session || scriptObj;
    const ids: string[] = [];
    for (const phase of sessionData.phases || []) {
      for (const topic of phase.topics || []) {
        for (const action of topic.actions || []) {
          ids.push(action.action_id || action.id);
        }
      }
    }
    return ids;
  } catch {
    return [];
  }
}

const logger = createLogger('SessionResponseBuilder');

// ---- Types ----

export interface SessionResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  currentRunId?: string;
  variables?: Record<string, unknown>;
  globalVariables?: Record<string, unknown>;
  variableStore?: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  position?: {
    phaseIndex: number;
    phaseId: string;
    topicIndex: number;
    topicId: string;
    actionIndex: number;
    actionId: string;
    actionType: string;
    currentRound?: number;
    maxRounds?: number;
  };
  error?: DetailedApiError;
  actionSnapshots?: Record<string, any>;
  rerunHistory?: any[];
  orderedActionIds?: string[];
}

export { type SessionData, type ScriptData } from './session-repository.js';

// ---- Class ----

export class SessionResponseBuilder {
  /**
   * Build session response from a Session domain object.
   */
  buildSessionResponseFromSession(
    session: Session,
    dbSession: SessionData,
    script: ScriptData,
    globalVariables: Record<string, any>,
    prevVariableSnapshots: Map<
      string,
      {
        global: Record<string, any>;
        session: Record<string, any>;
        phase: Record<string, any>;
        topic: Record<string, any>;
      }
    >,
    includeVariableStore: boolean = false
  ): SessionResponse {
    const runId = session.metadata.currentRunId || dbSession.currentRunId || undefined;
    const result: SessionResponse = {
      aiMessage: session.lastAiMessage || '',
      sessionStatus: dbSession.status,
      executionStatus: session.executionStatus,
      currentRunId: runId,
      variables: session.variables,
      globalVariables,
      position: {
        phaseIndex: session.position.phaseIndex,
        phaseId: session.position.phaseId || `phase_${session.position.phaseIndex}`,
        topicIndex: session.position.topicIndex,
        topicId: session.position.topicId || `topic_${session.position.topicIndex}`,
        actionIndex: session.position.actionIndex,
        actionId: session.position.actionId || `action_${session.position.actionIndex}`,
        actionType: session.position.actionType || 'unknown',
        sourceActionId: session.lastAiMessage
          ? session.conversationHistory
              .slice()
              .reverse()
              .find((m: any) => m.role === 'assistant')?.actionId
          : undefined,
        sourceActionType: (() => {
          if (!session.lastAiMessage) return undefined;
          const sourceActionId = session.conversationHistory
            .slice()
            .reverse()
            .find((m: any) => m.role === 'assistant')?.actionId;
          if (!sourceActionId) return undefined;
          try {
            const scriptObj =
              typeof script.scriptContent === 'string'
                ? yaml.parse(script.scriptContent)
                : script.scriptContent;
            const sessionData = scriptObj.session || scriptObj;
            for (const phase of sessionData.phases) {
              for (const topic of phase.topics) {
                const action = topic.actions.find(
                  (a: any) => a.action_id === sourceActionId || a.id === sourceActionId
                );
                if (action) return action.action_type || action.type;
              }
            }
          } catch (e) {
            logger.error('Error parsing script:', e);
          }
          return undefined;
        })(),
        currentRound:
          session.metadata?.lastActionRoundInfo?.currentRound ??
          (session.metadata?.actionState as any)?.currentRound,
        maxRounds:
          session.metadata?.lastActionRoundInfo?.maxRounds ??
          (session.metadata?.actionState as any)?.maxRounds,
      } as any,
    };

    const currentAction = session.currentAction;
    const outputVariables: string[] = currentAction?.config?.output?.map((v: any) => v.get) || [];

    const actionStatus: 'running' | 'completed' | 'error' =
      session.executionStatus === 'error'
        ? 'error'
        : session.executionStatus === 'completed'
          ? 'completed'
          : 'running';

    const currentRound =
      (session.metadata?.actionRoundInfo as any)?.[currentAction?.actionId || '']?.currentRound ||
      (session.metadata?.actionState as any)?.currentRound;
    const maxRounds =
      currentAction?.config?.max_rounds || (session.metadata?.actionState as any)?.maxRounds;

    (result as any).actionStatus = actionStatus;
    (result as any).currentRound = currentRound;
    (result as any).maxRounds = maxRounds;
    (result as any).outputVariables = outputVariables;

    if (includeVariableStore) {
      result.variableStore = flattenVariableStore(session.variableStore, {
        phaseId: session.position.phaseId,
        topicId: session.position.topicId,
      });
    } else {
      result.variableStore = session.variableStore as any;
    }

    const prevSnapshot = prevVariableSnapshots.get(dbSession.id);
    const roundChanges =
      includeVariableStore && outputVariables.length > 0 && currentRound
        ? calculateRoundChanges(
            prevSnapshot || null,
            result.variableStore as any,
            outputVariables,
            currentRound
          )
        : null;

    if (actionStatus === 'completed') {
      prevVariableSnapshots.delete(dbSession.id);
    } else if (includeVariableStore) {
      prevVariableSnapshots.set(dbSession.id, result.variableStore as any);
    }

    if (roundChanges) {
      (result as any).roundChanges = roundChanges;
    }
    if (actionStatus === 'completed') {
      (result as any).exitReason = extractExitReasonFromSession(session);
    }

    if (session.metadata.actionSnapshots) {
      result.actionSnapshots = session.metadata.actionSnapshots;
    }
    if (session.metadata.rerunHistory) {
      result.rerunHistory = session.metadata.rerunHistory;
    }

    result.orderedActionIds = extractOrderedActionIds(script);

    return result;
  }

  /**
   * 构建错误响应
   */
  buildErrorResponse(
    error: unknown,
    session: SessionData,
    script: ScriptData,
    sessionId: string
  ): SessionResponse {
    const detailedError = buildDetailedError(error, {
      scriptId: script.id,
      scriptName: script.scriptName,
      sessionId: sessionId,
      position: {
        phaseIndex: ((session.position as Record<string, unknown>)?.phaseIndex as number) || 0,
        topicIndex: ((session.position as Record<string, unknown>)?.topicIndex as number) || 0,
        actionIndex: ((session.position as Record<string, unknown>)?.actionIndex as number) || 0,
      },
    });

    const cachedGlobalVariables =
      ((session.metadata as any)?.globalVariables as Record<string, unknown>) || {};
    const pos = session.position as Record<string, unknown> | null;

    return {
      aiMessage: '',
      sessionStatus: session.status,
      executionStatus: ExecutionStatus.ERROR,
      error: detailedError,
      variables: (session.variables as Record<string, unknown>) || {},
      globalVariables: cachedGlobalVariables,
      position: {
        phaseIndex: (pos?.phaseIndex as number) || 0,
        phaseId: (pos?.phaseId as string) || 'phase_0',
        topicIndex: (pos?.topicIndex as number) || 0,
        topicId: (pos?.topicId as string) || 'topic_0',
        actionIndex: (pos?.actionIndex as number) || 0,
        actionId: (pos?.actionId as string) || 'action_0',
        actionType: (pos?.actionType as string) || 'unknown',
      },
    };
  }
}
