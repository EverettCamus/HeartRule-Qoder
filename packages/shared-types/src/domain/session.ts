import { z } from 'zod';
import {
  SessionStatus,
  SessionStatusSchema,
  ExecutionStatus,
  ExecutionStatusSchema,
} from '../enums.js';

/**
 * 执行位置接口
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
}

/**
 * 执行位置 Schema
 */
export const ExecutionPositionSchema = z.object({
  phaseIndex: z.number().int().min(0),
  topicIndex: z.number().int().min(0),
  actionIndex: z.number().int().min(0),
});

/**
 * 会话接口
 */
export interface Session {
  sessionId: string;
  userId: string;
  scriptId: string;
  status: SessionStatus;
  executionStatus: ExecutionStatus;
  position: ExecutionPosition;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * 会话 Schema
 */
export const SessionSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().min(1),
  scriptId: z.string().uuid(),
  status: SessionStatusSchema,
  executionStatus: ExecutionStatusSchema,
  position: ExecutionPositionSchema,
  variables: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().optional(),
});

/**
 * 创建会话输入
 */
export interface CreateSessionInput {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
}

/**
 * 创建会话输入 Schema
 */
export const CreateSessionInputSchema = z.object({
  userId: z.string().min(1),
  scriptId: z.string().uuid(),
  initialVariables: z.record(z.unknown()).optional(),
});
