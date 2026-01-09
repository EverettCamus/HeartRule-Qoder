import { z } from 'zod';

/**
 * 创建会话请求
 */
export interface CreateSessionRequest {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
}

export const CreateSessionRequestSchema = z.object({
  userId: z.string().min(1),
  scriptId: z.string().uuid(),
  initialVariables: z.record(z.unknown()).optional(),
});

/**
 * 发送消息请求
 */
export interface SendMessageRequest {
  sessionId: string;
  message: string;
}

export const SendMessageRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1),
});

/**
 * 创建脚本请求
 */
export interface CreateScriptRequest {
  scriptName: string;
  scriptType: string;
  scriptContent: string;
  author: string;
  description?: string;
  tags?: string[];
}

export const CreateScriptRequestSchema = z.object({
  scriptName: z.string().min(1),
  scriptType: z.string(),
  scriptContent: z.string(),
  author: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
