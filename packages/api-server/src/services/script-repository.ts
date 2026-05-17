/**
 * Script Repository
 *
 * All database I/O for script management. Extracted from routes/scripts.ts
 * to separate persistence concerns from HTTP routing.
 */

import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db } from '../db/index.js';
import { scripts } from '../db/schema.js';

// ---- Types ----

export interface ScriptData {
  id: string;
  scriptName: string;
  scriptType: string;
  scriptContent: string;
  parsedContent?: any;
  version: string;
  status: string;
  author: string;
  description: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScriptData {
  scriptName: string;
  scriptType: 'session' | 'technique' | 'awareness';
  scriptContent: string;
  parsedContent?: Record<string, unknown> | null;
  author: string;
  description?: string;
  tags?: string[];
}

export interface UpdateScriptData {
  scriptContent?: string;
  parsedContent?: Record<string, unknown> | null;
  description?: string;
  tags?: string[];
}

// ---- Interface ----

export interface IScriptRepository {
  findById(id: string): Promise<ScriptData | null>;
  findByName(name: string): Promise<ScriptData | null>;
  listAll(): Promise<ScriptData[]>;
  create(data: CreateScriptData): Promise<ScriptData>;
  update(id: string, data: UpdateScriptData): Promise<void>;
}

// ---- Implementation ----

export class ScriptRepository implements IScriptRepository {
  async findById(id: string): Promise<ScriptData | null> {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, id),
    });
    return (script as ScriptData) ?? null;
  }

  async findByName(name: string): Promise<ScriptData | null> {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, name),
    });
    return (script as ScriptData) ?? null;
  }

  async listAll(): Promise<ScriptData[]> {
    return db.query.scripts.findMany({
      orderBy: (scripts, { desc }) => [desc(scripts.createdAt)],
    }) as Promise<ScriptData[]>;
  }

  async create(data: CreateScriptData): Promise<ScriptData> {
    const id = uuidv4();
    const now = new Date();

    await db.insert(scripts).values({
      id,
      scriptName: data.scriptName,
      scriptType: data.scriptType,
      scriptContent: data.scriptContent,
      parsedContent: data.parsedContent,
      version: '1.0.0',
      status: 'draft',
      author: data.author,
      description: data.description || '',
      tags: data.tags || [],
      createdAt: now,
      updatedAt: now,
    });

    return (await this.findById(id))!;
  }

  async update(id: string, data: UpdateScriptData): Promise<void> {
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (data.scriptContent !== undefined) updateData.scriptContent = data.scriptContent;
    if (data.parsedContent !== undefined) updateData.parsedContent = data.parsedContent;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.tags !== undefined) updateData.tags = data.tags;

    await db.update(scripts).set(updateData).where(eq(scripts.id, id));
  }
}
