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

/**
 * 错误类型枚举
 */
export enum ErrorType {
  SYNTAX = 'syntax',
  CONFIGURATION = 'configuration',
  RUNTIME = 'runtime',
  SESSION = 'session',
  SYSTEM = 'system',
}

/**
 * 错误代码枚举
 */
export enum ErrorCode {
  SCRIPT_NOT_FOUND = 'SCRIPT_NOT_FOUND',
  SCRIPT_PARSE_ERROR = 'SCRIPT_PARSE_ERROR',
  SCRIPT_VALIDATION_ERROR = 'SCRIPT_VALIDATION_ERROR',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXECUTION_ERROR = 'SESSION_EXECUTION_ERROR',
  ACTION_EXECUTION_ERROR = 'ACTION_EXECUTION_ERROR',
  LLM_SERVICE_ERROR = 'LLM_SERVICE_ERROR',
  VARIABLE_EXTRACTION_ERROR = 'VARIABLE_EXTRACTION_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
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
export const ErrorTypeSchema = z.nativeEnum(ErrorType);
export const ErrorCodeSchema = z.nativeEnum(ErrorCode);
