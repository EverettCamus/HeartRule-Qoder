import { v4 as uuidv4 } from 'uuid';
import { MessageRole } from '@heartrule/shared-types';

/**
 * 消息领域模型
 */
export class Message {
  public messageId: string;
  public sessionId: string;
  public role: MessageRole;
  public content: string;
  public actionId?: string;
  public metadata: Map<string, unknown>;
  public timestamp: Date;

  constructor(params: {
    messageId?: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    actionId?: string;
    metadata?: Map<string, unknown>;
    timestamp?: Date;
  }) {
    this.messageId = params.messageId || uuidv4();
    this.sessionId = params.sessionId;
    this.role = params.role;
    this.content = params.content;
    this.actionId = params.actionId;
    this.metadata = params.metadata || new Map();
    this.timestamp = params.timestamp || new Date();
  }

  /**
   * 转换为JSON对象
   */
  toJSON(): Record<string, unknown> {
    return {
      messageId: this.messageId,
      sessionId: this.sessionId,
      role: this.role,
      content: this.content,
      actionId: this.actionId,
      metadata: Object.fromEntries(this.metadata),
      timestamp: this.timestamp.toISOString(),
    };
  }
}
