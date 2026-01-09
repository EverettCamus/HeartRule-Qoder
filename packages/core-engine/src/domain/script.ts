import { v4 as uuidv4 } from 'uuid';
import { ScriptType, ScriptStatus } from '@heartrule/shared-types';

/**
 * 脚本领域模型
 */
export class Script {
  public scriptId: string;
  public scriptName: string;
  public scriptType: ScriptType;
  public scriptContent: string;
  public parsedContent?: unknown;
  public version: string;
  public status: ScriptStatus;
  public author: string;
  public description: string;
  public tags: string[];
  public createdAt: Date;
  public updatedAt: Date;

  constructor(params: {
    scriptId?: string;
    scriptName: string;
    scriptType: ScriptType;
    scriptContent: string;
    parsedContent?: unknown;
    version?: string;
    status?: ScriptStatus;
    author: string;
    description?: string;
    tags?: string[];
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.scriptId = params.scriptId || uuidv4();
    this.scriptName = params.scriptName;
    this.scriptType = params.scriptType;
    this.scriptContent = params.scriptContent;
    this.parsedContent = params.parsedContent;
    this.version = params.version || '1.0.0';
    this.status = params.status || ScriptStatus.DRAFT;
    this.author = params.author;
    this.description = params.description || '';
    this.tags = params.tags || [];
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  /**
   * 解析脚本内容
   */
  parse(content: unknown): void {
    this.parsedContent = content;
    this.updatedAt = new Date();
  }

  /**
   * 发布脚本
   */
  publish(): void {
    if (this.status === ScriptStatus.DRAFT) {
      this.status = ScriptStatus.PUBLISHED;
      this.updatedAt = new Date();
    }
  }

  /**
   * 归档脚本
   */
  archive(): void {
    this.status = ScriptStatus.ARCHIVED;
    this.updatedAt = new Date();
  }

  /**
   * 转换为JSON对象
   */
  toJSON(): Record<string, unknown> {
    return {
      scriptId: this.scriptId,
      scriptName: this.scriptName,
      scriptType: this.scriptType,
      scriptContent: this.scriptContent,
      parsedContent: this.parsedContent,
      version: this.version,
      status: this.status,
      author: this.author,
      description: this.description,
      tags: this.tags,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
