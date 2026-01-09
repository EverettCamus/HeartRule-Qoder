import { z } from 'zod';
import { MessageRole, MessageRoleSchema } from '../enums.js';

/**
 * 消息接口
 */
export interface Message {
  messageId: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  actionId?: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

/**
 * 消息 Schema
 */
export const MessageSchema = z.object({
  messageId: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  actionId: z.string().optional(),
  metadata: z.record(z.unknown()),
  timestamp: z.date(),
});

/**
 * 创建消息输入
 */
export interface CreateMessageInput {
  sessionId: string;
  role: MessageRole;
  content: string;
  actionId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 创建消息输入 Schema
 */
export const CreateMessageInputSchema = z.object({
  sessionId: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.string(),
  actionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
