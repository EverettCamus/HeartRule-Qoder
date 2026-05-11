/**
 * Debug Information Types
 * 调试信息类型定义
 */

// ============================================================
// V2 Types: 统一调试气泡（基于 debug_entries 表）
// ============================================================

/**
 * 调试条目内容 — 来自 debug_entries.content.entries[]
 */
export interface DebugEntryItem {
  type: 'llm_call' | 'variable_op';
  model?: string;
  tokensUsed?: number;
  responseTimeMs?: number;
  finishReason?: string;
  prompt?: string;
  response?: string;
  description?: string;
}

/**
 * 统一调试气泡（v2）
 * 一个 action 的执行产生一个调试气泡，内部可能包含多个 LLM 调用
 */
export interface DebugBubbleV2 {
  id: string;
  sessionId: string;
  runId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  actionType: string;
  round: number;
  phaseName?: string;
  topicName?: string;
  actionName?: string;
  entries: DebugEntryItem[];
  variableSnapshot?: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  /** Full VariableBubbleContent for embedding VariableBubble inside this debug bubble */
  variableContent?: VariableBubbleContent;
  timestamp: string;
  isExpanded: boolean;
}

/**
 * 调试输出过滤器配置（v2）
 * 控制统一调试气泡内部各 section 的可见性
 */
export interface DebugOutputFilter {
  showError: boolean;
  showLLMPrompt: boolean;
  showLLMResponse: boolean;
  showVariable: boolean;
}

/**
 * 默认过滤器配置
 */
export const DEFAULT_DEBUG_FILTER: DebugOutputFilter = {
  showError: true,
  showLLMPrompt: true,
  showLLMResponse: true,
  showVariable: true,
};

/**
 * 调试面板状态
 */
export interface DebugPanelState {
  filter: DebugOutputFilter;
}

// ============================================================
// V1 Types: 保留用于向后兼容，标记 @deprecated
// ============================================================

/**
 * @deprecated Use DebugBubbleV2 (unified debug bubble) instead.
 */
export type DebugBubbleType =
  | 'error'
  | 'llm_prompt'
  | 'llm_response'
  | 'variable'
  | 'execution_log'
  | 'position';

/**
 * @deprecated Use DebugBubbleV2 instead.
 */
export interface DebugBubble {
  id: string;
  type: DebugBubbleType;
  timestamp: string;
  isExpanded: boolean;
  actionId?: string;
  actionType?: string;
  content: DebugBubbleContent;
}

/**
 * @deprecated Use DebugEntryItem[] instead.
 */
export type DebugBubbleContent =
  | ErrorBubbleContent
  | LLMPromptBubbleContent
  | LLMResponseBubbleContent
  | VariableBubbleContent
  | ExecutionLogBubbleContent
  | PositionBubbleContent;

export interface ErrorBubbleContent {
  type: 'error';
  code: string;
  errorType: string;
  message: string;
  details?: string;
  position?: {
    phaseIndex: number;
    phaseId: string;
    phaseName: string;
    topicIndex: number;
    topicId: string;
    topicName: string;
    actionIndex: number;
    actionId: string;
  };
  recovery?: {
    canRetry: boolean;
    suggestions: string[];
  };
  stackTrace?: string;
}

export interface LLMPromptBubbleContent {
  type: 'llm_prompt';
  systemPrompt?: string;
  userPrompt: string;
  conversationHistory?: Array<{
    role: string;
    content: string;
  }>;
  preview: string;
}

export interface LLMResponseBubbleContent {
  type: 'llm_response';
  model: string;
  tokens: number;
  maxTokens: number;
  rawResponse: string;
  processedResponse: string;
  preview: string;
  responseTimeMs?: number;
  ttftMs?: number;
}

export interface VariableBubbleContent {
  type: 'variable';
  sessionId?: string;
  changedVariables: Array<{
    name: string;
    oldValue?: unknown;
    newValue: unknown;
    scope: 'global' | 'session' | 'phase' | 'topic';
  }>;
  allVariables: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  relevantVariables?: {
    inputVariables: string[];
    outputVariables: string[];
  };
  summary: string;
  actionStatus?: 'running' | 'completed' | 'error';
  currentRound?: number;
  maxRounds?: number;
  collectionHistory?: Array<{
    round: number;
    timestamp: string;
    changes: Array<{
      name: string;
      fromValue?: unknown;
      toValue: unknown;
      scope?: 'global' | 'session' | 'phase' | 'topic';
    }>;
  }>;
  scopePath?: {
    phaseId: string;
    phaseName: string;
    topicId: string;
    topicName: string;
  };
  exitReason?: 'collected' | 'resistance' | 'crisis' | 'max_rounds' | 'user_interrupt';
}

export interface ExecutionLogBubbleContent {
  type: 'execution_log';
  status: 'success' | 'failed';
  startTime: string;
  endTime: string;
  duration: number;
  steps: Array<{
    name: string;
    duration: number;
  }>;
  summary: string;
}

export interface PositionBubbleContent {
  type: 'position';
  phase: {
    index: number;
    id: string;
    name: string;
  };
  topic: {
    index: number;
    id: string;
    name: string;
  };
  action: {
    index: number;
    id: string;
    type: string;
    currentRound?: number;
    maxRounds?: number;
  };
  summary: string;
}
