/**
 * Debug Error Types
 * 调试错误相关类型定义
 */

import type { ErrorCode, ErrorType } from '@heartrule/shared-types';

/**
 * 执行位置信息
 */
export interface ExecutionPosition {
  phaseIndex: number;
  phaseId: string;
  topicIndex: number;
  topicId: string;
  actionIndex: number;
  actionId: string;
  actionType: string;
}

/**
 * 错误上下文
 */
export interface ErrorContext {
  scriptId?: string;
  scriptName?: string;
  sessionId?: string;
  position?: ExecutionPosition;
  timestamp: string;
}

/**
 * 错误恢复建议
 */
export interface ErrorRecovery {
  canRetry: boolean;
  retryAction?: string;
  suggestion?: string;
}

/**
 * 详细错误信息
 */
export interface DetailedError {
  code: ErrorCode;
  type: ErrorType;
  message: string;
  details?: string;
  context?: ErrorContext;
  recovery?: ErrorRecovery;
}

/**
 * 调试错误状态
 */
export interface DebugErrorState {
  hasError: boolean;
  currentError?: DetailedError;
  errorHistory: DetailedError[];
}
