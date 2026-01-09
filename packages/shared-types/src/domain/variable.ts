import { z } from 'zod';
import {
  VariableScope,
  VariableScopeSchema,
  VariableUpdateMode,
  VariableUpdateModeSchema,
} from '../enums.js';

/**
 * 变量状态接口
 */
export interface VariableState {
  variableId: string;
  variableName: string;
  scope: VariableScope;
  value: unknown;
  valueType: string;
  updateMode: VariableUpdateMode;
  source: string;
  history: VariableHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 变量历史条目接口
 */
export interface VariableHistoryEntry {
  value: unknown;
  source: string;
  timestamp: Date;
}

/**
 * 变量历史条目 Schema
 */
export const VariableHistoryEntrySchema = z.object({
  value: z.unknown(),
  source: z.string(),
  timestamp: z.date(),
});

/**
 * 变量状态 Schema
 */
export const VariableStateSchema = z.object({
  variableId: z.string(),
  variableName: z.string(),
  scope: VariableScopeSchema,
  value: z.unknown(),
  valueType: z.string(),
  updateMode: VariableUpdateModeSchema,
  source: z.string(),
  history: z.array(VariableHistoryEntrySchema),
  createdAt: z.date(),
  updatedAt: z.date(),
});
