import { z } from 'zod';
import type { Session } from '../domain/session.js';
import type { Message } from '../domain/message.js';
import type { Script } from '../domain/script.js';

/**
 * API响应基础接口
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
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
}

export const SessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.string(),
  createdAt: z.string(),
});

/**
 * 聊天响应
 */
export interface ChatResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  extractedVariables?: Record<string, unknown>;
}

export const ChatResponseSchema = z.object({
  aiMessage: z.string(),
  sessionStatus: z.string(),
  executionStatus: z.string(),
  extractedVariables: z.record(z.unknown()).optional(),
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
