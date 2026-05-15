/**
 * Session variable utility functions
 *
 * Pure functions extracted from SessionManager for:
 * - Variable unwrapping and placeholder detection
 * - Variable store flattening and scope resolution
 * - Round change calculation
 * - Exit reason extraction
 * - Variable snapshot building
 * - Debug entry round determination
 */

import type { ExecutionState } from '@heartrule/core-engine';

import type { NewVariable } from '../db/schema.js';

// ---- Constants ----

export const PLACEHOLDER_PATTERNS = [
  /^\(?(未收集|未提供|暂无|无|N\/A|n\/a|null)\)?$/i,
  /^\(未收集\)$/,
  /^\(未提供\)$/,
];

// ---- Value utilities ----

export function isPlaceholderValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function unwrapVariableValue(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'value' in (value as object)) {
    const unwrapped = (value as { value: unknown }).value;
    if (isPlaceholderValue(unwrapped)) {
      return undefined;
    }
    return unwrapped;
  }
  if (isPlaceholderValue(value)) {
    return undefined;
  }
  return value;
}

export function unwrapScopeValues(
  scopeData: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!scopeData) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(scopeData)) {
    const unwrapped = unwrapVariableValue(value);
    if (unwrapped !== undefined) {
      result[key] = unwrapped;
    }
  }
  return result;
}

// ---- Scope resolution ----

export function findFirstNonEmptyScope(
  scopes: Record<string, Record<string, unknown>> | undefined
): Record<string, unknown> | null {
  if (!scopes) return null;
  for (const scopeKey of Object.keys(scopes)) {
    const scopeData = scopes[scopeKey];
    if (scopeData && typeof scopeData === 'object' && Object.keys(scopeData).length > 0) {
      return scopeData;
    }
  }
  return null;
}

/**
 * 扁平化 variableStore，将嵌套的 phase/topic 结构转为当前位置的扁平结构
 *
 * 当 action 完成后，position 可能已跳到下一个 topic/phase，
 * 但变量存储在源 action 的 topic/phase 中。
 * 此时需要回退到有数据的 topic/phase，确保变量不丢失。
 */
export function flattenVariableStore(
  variableStore:
    | {
        global?: Record<string, unknown>;
        session?: Record<string, unknown>;
        phase?: Record<string, Record<string, unknown>>;
        topic?: Record<string, Record<string, unknown>>;
      }
    | null
    | undefined,
  position: { phaseId?: string; topicId?: string }
): {
  global: Record<string, unknown>;
  session: Record<string, unknown>;
  phase: Record<string, unknown>;
  topic: Record<string, unknown>;
} {
  if (!variableStore) {
    return {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
  }

  const hasPhaseDataAtPosition =
    position.phaseId &&
    variableStore.phase?.[position.phaseId] &&
    Object.keys(variableStore.phase[position.phaseId]).length > 0;
  const hasTopicDataAtPosition =
    position.topicId &&
    variableStore.topic?.[position.topicId] &&
    Object.keys(variableStore.topic[position.topicId]).length > 0;

  const rawPhaseData = hasPhaseDataAtPosition
    ? variableStore.phase![position.phaseId!]
    : findFirstNonEmptyScope(variableStore.phase);
  const rawTopicData = hasTopicDataAtPosition
    ? variableStore.topic![position.topicId!]
    : findFirstNonEmptyScope(variableStore.topic);

  const globalData = unwrapScopeValues(variableStore.global || {});
  const sessionData = unwrapScopeValues(variableStore.session || {});
  const phaseData = unwrapScopeValues(rawPhaseData);
  const topicData = unwrapScopeValues(rawTopicData);

  return {
    global: globalData,
    session: sessionData,
    phase: phaseData,
    topic: topicData,
  };
}

// ---- Round changes ----

export function calculateRoundChanges(
  prevState: {
    global: Record<string, any>;
    session: Record<string, any>;
    phase: Record<string, any>;
    topic: Record<string, any>;
  } | null,
  currentState: {
    global: Record<string, any>;
    session: Record<string, any>;
    phase: Record<string, any>;
    topic: Record<string, any>;
  },
  outputVariables: string[],
  round: number
): {
  round: number;
  timestamp: string;
  changes: Array<{
    name: string;
    fromValue?: any;
    toValue: any;
    scope: string;
  }>;
} | null {
  if (!outputVariables || outputVariables.length === 0) {
    return null;
  }

  const changes: Array<{
    name: string;
    fromValue?: any;
    toValue: any;
    scope: string;
  }> = [];

  for (const varName of outputVariables) {
    let found = false;
    for (const scope of ['topic', 'phase', 'session', 'global'] as const) {
      const currentScopedVars = currentState[scope];
      if (currentScopedVars && varName in currentScopedVars) {
        const currentValue = currentScopedVars[varName];
        const prevValue = prevState?.[scope]?.[varName];

        if (JSON.stringify(prevValue) !== JSON.stringify(currentValue)) {
          changes.push({
            name: varName,
            fromValue: prevValue,
            toValue: currentValue,
            scope,
          });
        }
        found = true;
        break;
      }
    }

    if (!found) {
      for (const scope of ['topic', 'phase', 'session', 'global'] as const) {
        const currentScopedVars = currentState[scope];
        if (currentScopedVars && varName in currentScopedVars) {
          changes.push({
            name: varName,
            toValue: currentScopedVars[varName],
            scope,
          });
          break;
        }
      }
    }
  }

  if (changes.length === 0) {
    return null;
  }

  return {
    round,
    timestamp: new Date().toISOString(),
    changes,
  };
}

// ---- Exit reason ----

export function extractExitReason(
  executionState: ExecutionState
): 'collected' | 'resistance' | 'crisis' | 'max_rounds' | 'user_interrupt' | undefined {
  const exitDecisions = executionState.metadata?.exitDecisions;
  if (exitDecisions && exitDecisions.length > 0) {
    const lastDecision = exitDecisions[exitDecisions.length - 1];
    const reason = (lastDecision?.decision as any)?.reason;
    if (
      reason === 'collected' ||
      reason === 'resistance' ||
      reason === 'crisis' ||
      reason === 'max_rounds' ||
      reason === 'user_interrupt'
    ) {
      return reason;
    }
  }
  return undefined;
}

// ---- Variable snapshots ----

/**
 * 构建全量变量快照（每次 action 执行完存完整四层变量状态）
 */
export function buildVariableSnapshots(
  sessionId: string,
  executionState: ExecutionState
): NewVariable[] {
  const variableStore = executionState.variableStore || {};
  const fullSnapshot: Record<string, unknown> = {};

  for (const scope of ['global', 'session', 'phase', 'topic'] as const) {
    const scopeData = (variableStore as any)[scope] || {};
    // 展平作用域内的变量（去除 Drizzle 包装的 value/type/source 元数据）
    const flatScope: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(scopeData)) {
      flatScope[key] = (entry as any)?.value ?? entry;
    }
    fullSnapshot[scope] = flatScope;
  }

  const actionId = executionState.currentActionId || `action_${executionState.currentActionIdx}`;
  const phaseId = executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`;
  const topicId = executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`;
  const round =
    executionState.metadata.actionRoundInfo?.[actionId]?.currentRound ||
    executionState.metadata.lastActionRoundInfo?.currentRound ||
    1;

  return [
    {
      sessionId,
      variableName: actionId,
      value: fullSnapshot,
      scope: 'session',
      valueType: 'object',
      source: 'script_executor',
      actionId,
      phaseId,
      topicId,
      round,
    },
  ];
}

// ---- Debug entry round ----

/**
 * Determine the round number for a debug entry.
 *
 * Extracted for testability. After rerun/rollback, actionRoundInfo must be cleared
 * (see rerunAction) so that re-executed actions start at round 1 instead of stale values.
 */
export function determineDebugEntryRound(
  metadata: Record<string, any> | undefined,
  actionId: string
): number {
  if (!metadata) return 1;
  return (
    (metadata.actionRoundInfo as any)?.[actionId]?.currentRound ||
    (metadata.lastActionRoundInfo as any)?.currentRound ||
    1
  );
}
