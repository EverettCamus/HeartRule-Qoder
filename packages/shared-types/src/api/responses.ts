import { z } from 'zod';

import type { Message } from '../domain/message.js';
import type { Script } from '../domain/script.js';
import type { Session } from '../domain/session.js';
import { ErrorCode, ErrorCodeSchema, ErrorType, ErrorTypeSchema } from '../enums.js';

/**
 * 扩展的执行位置信息（包含ID字段）
 */
export interface DetailedExecutionPosition {
  phaseIndex: number;
  phaseId: string;
  topicIndex: number;
  topicId: string;
  actionIndex: number;
  actionId: string;
  actionType: string;
}

export const DetailedExecutionPositionSchema = z.object({
  phaseIndex: z.number(),
  phaseId: z.string(),
  topicIndex: z.number(),
  topicId: z.string(),
  actionIndex: z.number(),
  actionId: z.string(),
  actionType: z.string(),
});

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  scriptId?: string;
  scriptName?: string;
  sessionId?: string;
  position?: DetailedExecutionPosition;
  timestamp: string;
}

export const ErrorContextSchema = z.object({
  scriptId: z.string().optional(),
  scriptName: z.string().optional(),
  sessionId: z.string().optional(),
  position: DetailedExecutionPositionSchema.optional(),
  timestamp: z.string(),
});

/**
 * 错误恢复建议
 */
export interface ErrorRecovery {
  canRetry: boolean;
  retryAction?: string;
  suggestion?: string;
}

export const ErrorRecoverySchema = z.object({
  canRetry: z.boolean(),
  retryAction: z.string().optional(),
  suggestion: z.string().optional(),
});

/**
 * 详细的API错误接口
 */
export interface DetailedApiError {
  code: ErrorCode;
  type: ErrorType;
  message: string;
  details?: string;
  context?: ErrorContext;
  recovery?: ErrorRecovery;
}

export const DetailedApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  type: ErrorTypeSchema,
  message: z.string(),
  details: z.string().optional(),
  context: ErrorContextSchema.optional(),
  recovery: ErrorRecoverySchema.optional(),
});

/**
 * API响应基础接口
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError | DetailedApiError;
}

/**
 * API错误接口
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

/**
 * 会话响应
 */
export interface SessionResponse {
  sessionId: string;
  status: string;
  createdAt: string;
  aiMessage?: string;
  executionStatus?: string;
  position?: DetailedExecutionPosition;
}

export const SessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.string(),
  createdAt: z.string(),
  aiMessage: z.string().optional(),
  executionStatus: z.string().optional(),
  position: DetailedExecutionPositionSchema.optional(),
});

/**
 * 聊天响应
 */
export interface ChatResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  extractedVariables?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  position?: DetailedExecutionPosition;
}

export const ChatResponseSchema = z.object({
  aiMessage: z.string(),
  sessionStatus: z.string(),
  executionStatus: z.string(),
  extractedVariables: z.record(z.unknown()).optional(),
  variables: z.record(z.unknown()).optional(),
  position: DetailedExecutionPositionSchema.optional(),
});

/**
 * 完整会话详情响应
 */
export interface SessionDetailResponse extends Session {
  messages: Message[];
}

/**
 * 脚本列表响应
 */
export interface ScriptListResponse {
  scripts: Script[];
  total: number;
}
