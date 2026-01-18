/**
 * Debug Information Types
 * 调试信息类型定义
 */

/**
 * 调试信息气泡类型枚举
 */
export type DebugBubbleType =
  | 'error' // 错误信息
  | 'llm_prompt' // LLM 提示词
  | 'llm_response' // LLM 响应
  | 'variable' // 变量状态
  | 'execution_log' // 执行日志
  | 'position'; // 位置信息

/**
 * 调试信息气泡数据结构
 */
export interface DebugBubble {
  id: string; // 唯一标识
  type: DebugBubbleType; // 气泡类型
  timestamp: string; // 时间戳
  isExpanded: boolean; // 是否展开
  actionId?: string; // 关联的 Action ID
  actionType?: string; // 关联的 Action 类型
  content: DebugBubbleContent; // 内容数据
}

/**
 * 气泡内容联合类型
 */
export type DebugBubbleContent =
  | ErrorBubbleContent
  | LLMPromptBubbleContent
  | LLMResponseBubbleContent
  | VariableBubbleContent
  | ExecutionLogBubbleContent
  | PositionBubbleContent;

/**
 * 错误信息气泡内容
 */
export interface ErrorBubbleContent {
  type: 'error';
  code: string; // 错误代码
  errorType: string; // 错误类型
  message: string; // 简短描述
  details?: string; // 技术详情
  position?: {
    // 执行位置
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
    // 恢复建议
    canRetry: boolean;
    suggestions: string[];
  };
  stackTrace?: string; // 堆栈跟踪
}

/**
 * LLM 提示词气泡内容
 */
export interface LLMPromptBubbleContent {
  type: 'llm_prompt';
  systemPrompt?: string; // 系统提示词
  userPrompt: string; // 用户提示词
  conversationHistory?: Array<{
    // 对话历史
    role: string;
    content: string;
  }>;
  preview: string; // 预览文本（前 100 字符）
}

/**
 * LLM 响应气泡内容
 */
export interface LLMResponseBubbleContent {
  type: 'llm_response';
  model: string; // 模型名称
  tokens: number; // Token 数量
  maxTokens: number; // 最大 Token
  rawResponse: string; // 原始响应
  processedResponse: string; // 处理后响应
  preview: string; // 预览文本
}

/**
 * 变量状态气泡内容
 */
export interface VariableBubbleContent {
  type: 'variable';
  changedVariables: Array<{
    // 变化的变量
    name: string;
    oldValue?: unknown;
    newValue: unknown;
    scope: 'session' | 'phase' | 'topic';
  }>;
  allVariables: {
    // 所有变量
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  summary: string; // 摘要文本
}

/**
 * 执行日志气泡内容
 */
export interface ExecutionLogBubbleContent {
  type: 'execution_log';
  status: 'success' | 'failed'; // 执行状态
  startTime: string; // 开始时间
  endTime: string; // 结束时间
  duration: number; // 耗时（毫秒）
  steps: Array<{
    // 执行步骤
    name: string;
    duration: number;
  }>;
  summary: string; // 摘要文本
}

/**
 * 位置信息气泡内容
 */
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
  };
  summary: string; // 摘要文本
}

/**
 * 调试输出过滤器配置
 */
export interface DebugOutputFilter {
  showError: boolean; // 显示错误信息
  showLLMPrompt: boolean; // 显示LLM提示词
  showLLMResponse: boolean; // 显示LLM响应
  showVariable: boolean; // 显示变量状态
  showExecutionLog: boolean; // 显示执行日志
  showPosition: boolean; // 显示位置信息
}

/**
 * 默认过滤器配置
 */
export const DEFAULT_DEBUG_FILTER: DebugOutputFilter = {
  showError: true, // 默认显示错误
  showLLMPrompt: true, // 默认显示提示词
  showLLMResponse: true, // 默认显示响应
  showVariable: true, // 默认显示变量
  showExecutionLog: false, // 默认不显示日志
  showPosition: false, // 默认不显示位置
};

/**
 * 调试面板状态
 */
export interface DebugPanelState {
  bubbles: DebugBubble[]; // 所有调试信息气泡
  filter: DebugOutputFilter; // 过滤器配置
}
