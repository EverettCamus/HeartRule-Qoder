import { z } from 'zod';

import { ScriptType, ScriptTypeSchema, ScriptStatus, ScriptStatusSchema } from '../enums.js';

/**
 * 脚本接口
 */
export interface Script {
  scriptId: string;
  scriptName: string;
  scriptType: ScriptType;
  scriptContent: string;
  parsedContent?: unknown;
  version: string;
  status: ScriptStatus;
  author: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 脚本 Schema
 */
export const ScriptSchema = z.object({
  scriptId: z.string().uuid(),
  scriptName: z.string().min(1),
  scriptType: ScriptTypeSchema,
  scriptContent: z.string(),
  parsedContent: z.unknown().optional(),
  version: z.string(),
  status: ScriptStatusSchema,
  author: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * 创建脚本输入
 */
export interface CreateScriptInput {
  scriptName: string;
  scriptType: ScriptType;
  scriptContent: string;
  author: string;
  description?: string;
  tags?: string[];
}

/**
 * 创建脚本输入 Schema
 */
export const CreateScriptInputSchema = z.object({
  scriptName: z.string().min(1),
  scriptType: ScriptTypeSchema,
  scriptContent: z.string(),
  author: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
