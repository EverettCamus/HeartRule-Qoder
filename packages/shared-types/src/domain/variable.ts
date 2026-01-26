import { z } from 'zod';

import { VariableScope, VariableScopeSchema } from '../enums.js';

/**
 * 变量值封装
 */
export interface VariableValue {
  /** 实际值 */
  value: any;
  /** 数据类型：string/number/boolean/object/array */
  type?: string;
  /** ISO 时间戳 */
  lastUpdated?: string;
  /** 来源：action_id 或 'global'/'initial' */
  source?: string;
  /** 所属作用域 */
  scope?: VariableScope;
  /** 变量历史记录（可选） */
  history?: VariableHistoryEntry[];
}

/**
 * 变量历史记录项
 */
export interface VariableHistoryEntry {
  /** 变更前的值 */
  previousValue: any;
  /** 变更时间 */
  timestamp: string;
  /** 变更来源 */
  source: string;
}

/**
 * 变量历史记录项 Schema
 */
export const VariableHistoryEntrySchema = z.object({
  previousValue: z.any(),
  timestamp: z.string(),
  source: z.string(),
});

/**
 * 变量值 Schema
 */
export const VariableValueSchema = z.object({
  value: z.any(),
  type: z.string().optional(),
  lastUpdated: z.string().optional(),
  source: z.string().optional(),
  scope: VariableScopeSchema.optional(),
  history: z.array(VariableHistoryEntrySchema).optional(),
});

/**
 * 变量存储结构（分层）
 */
export interface VariableStore {
  /** 全局变量（从 global.yaml 加载） */
  global: Record<string, VariableValue>;
  /** 会话级变量（当前 session 生命周期） */
  session: Record<string, VariableValue>;
  /** Phase 级变量（当前 phase 内有效）{ phaseId: { varName: value } } */
  phase: Record<string, Record<string, VariableValue>>;
  /** Topic 级变量（当前 topic 内有效）{ topicId: { varName: value } } */
  topic: Record<string, Record<string, VariableValue>>;
}

/**
 * 变量存储 Schema
 */
export const VariableStoreSchema = z.object({
  global: z.record(VariableValueSchema),
  session: z.record(VariableValueSchema),
  phase: z.record(z.record(VariableValueSchema)),
  topic: z.record(z.record(VariableValueSchema)),
});

/**
 * 变量定义元数据
 */
export interface VariableDefinition {
  /** 变量名 */
  name: string;
  /** 作用域 */
  scope: VariableScope;
  /** 变量说明（用于 LLM 提取提示） */
  define?: string;
  /** 默认值 */
  value?: any;
  /** 是否自动更新（P2 实现） */
  auto?: boolean;
}

/**
 * 变量定义 Schema
 */
export const VariableDefinitionSchema = z.object({
  name: z.string(),
  scope: VariableScopeSchema,
  define: z.string().optional(),
  value: z.any().optional(),
  auto: z.boolean().optional(),
});

/**
 * 执行位置（用于作用域解析）
 */
export interface Position {
  phaseId?: string;
  topicId?: string;
  actionId?: string;
}

/**
 * 执行位置 Schema
 */
export const PositionSchema = z.object({
  phaseId: z.string().optional(),
  topicId: z.string().optional(),
  actionId: z.string().optional(),
});
