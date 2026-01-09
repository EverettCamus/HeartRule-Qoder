import { z } from 'zod';

/**
 * 会话状态枚举
 */
export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * 执行状态枚举
 */
export enum ExecutionStatus {
  RUNNING = 'running',
  WAITING_INPUT = 'waiting_input',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * 消息角色枚举
 */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

/**
 * 脚本类型枚举
 */
export enum ScriptType {
  SESSION = 'session',
  TECHNIQUE = 'technique',
  AWARENESS = 'awareness',
}

/**
 * 脚本状态枚举
 */
export enum ScriptStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

/**
 * 变量作用域枚举
 */
export enum VariableScope {
  GLOBAL = 'global',
  SESSION = 'session',
  PHASE = 'phase',
  TOPIC = 'topic',
}

/**
 * 变量更新模式枚举
 */
export enum VariableUpdateMode {
  OVERWRITE = 'overwrite',
  APPEND = 'append',
  MERGE = 'merge',
}

/**
 * Action类型枚举
 */
export enum ActionType {
  AI_SAY = 'ai_say',
  AI_ASK = 'ai_ask',
  AI_THINK = 'ai_think',
  USE_SKILL = 'use_skill',
}

// Zod Schema 枚举验证
export const SessionStatusSchema = z.nativeEnum(SessionStatus);
export const ExecutionStatusSchema = z.nativeEnum(ExecutionStatus);
export const MessageRoleSchema = z.nativeEnum(MessageRole);
export const ScriptTypeSchema = z.nativeEnum(ScriptType);
export const ScriptStatusSchema = z.nativeEnum(ScriptStatus);
export const VariableScopeSchema = z.nativeEnum(VariableScope);
export const VariableUpdateModeSchema = z.nativeEnum(VariableUpdateMode);
export const ActionTypeSchema = z.nativeEnum(ActionType);
