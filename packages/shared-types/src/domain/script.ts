import { z } from 'zod';

import { ScriptType, ScriptTypeSchema, ScriptStatus, ScriptStatusSchema } from '../enums.js';
import type { ActionConfig } from './session.js';

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

/**
 * Topic配置(脚本解析后)
 * Story 2.1: Topic默认Action模板语义与策略定义
 */
export interface TopicConfig {
  topic_id: string;
  topic_name?: string;
  topic_goal?: string;
  /** 新增: Topic执行策略描述 */
  strategy?: string;
  /** 默认Action执行序列(模板) */
  actions: ActionConfig[];
  description?: string;
}

/**
 * Topic配置 Schema
 */
export const TopicConfigSchema = z.object({
  topic_id: z.string(),
  topic_name: z.string().optional(),
  topic_goal: z.string().optional(),
  strategy: z.string().optional(),
  actions: z.array(z.any()), // 简化为any,实际验证由JSON Schema负责
  description: z.string().optional(),
});
