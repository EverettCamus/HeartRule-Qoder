import { SessionStatus, ExecutionStatus, type ExecutionPosition } from '@heartrule/shared-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 会话领域模型
 */
export class Session {
  public sessionId: string;
  public userId: string;
  public scriptId: string;
  public status: SessionStatus;
  public executionStatus: ExecutionStatus;
  public position: ExecutionPosition;
  public variables: Map<string, unknown>;
  public metadata: Map<string, unknown>;
  public createdAt: Date;
  public updatedAt: Date;
  public completedAt?: Date;

  constructor(params: {
    sessionId?: string;
    userId: string;
    scriptId: string;
    status?: SessionStatus;
    executionStatus?: ExecutionStatus;
    position?: ExecutionPosition;
    variables?: Map<string, unknown>;
    metadata?: Map<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date;
  }) {
    this.sessionId = params.sessionId || uuidv4();
    this.userId = params.userId;
    this.scriptId = params.scriptId;
    this.status = params.status || SessionStatus.ACTIVE;
    this.executionStatus = params.executionStatus || ExecutionStatus.RUNNING;
    this.position = params.position || { phaseIndex: 0, topicIndex: 0, actionIndex: 0 };
    this.variables = params.variables || new Map();
    this.metadata = params.metadata || new Map();
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
    this.completedAt = params.completedAt;
  }

  /**
   * 启动会话
   */
  start(): void {
    this.status = SessionStatus.ACTIVE;
    this.executionStatus = ExecutionStatus.RUNNING;
    this.updatedAt = new Date();
  }

  /**
   * 暂停会话
   */
  pause(): void {
    this.status = SessionStatus.PAUSED;
    this.executionStatus = ExecutionStatus.PAUSED;
    this.updatedAt = new Date();
  }

  /**
   * 恢复会话
   */
  resume(): void {
    if (this.status === SessionStatus.PAUSED) {
      this.status = SessionStatus.ACTIVE;
      this.executionStatus = ExecutionStatus.RUNNING;
      this.updatedAt = new Date();
    }
  }

  /**
   * 完成会话
   */
  complete(): void {
    this.status = SessionStatus.COMPLETED;
    this.executionStatus = ExecutionStatus.COMPLETED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /**
   * 会话失败
   */
  fail(error: string): void {
    this.status = SessionStatus.FAILED;
    this.executionStatus = ExecutionStatus.ERROR;
    this.metadata.set('error', error);
    this.updatedAt = new Date();
  }

  /**
   * 更新执行位置
   */
  updatePosition(position: ExecutionPosition): void {
    this.position = position;
    this.updatedAt = new Date();
  }

  /**
   * 设置变量
   */
  setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
    this.updatedAt = new Date();
  }

  /**
   * 获取变量
   */
  getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  /**
   * 转换为JSON对象
   */
  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      scriptId: this.scriptId,
      status: this.status,
      executionStatus: this.executionStatus,
      position: this.position,
      variables: Object.fromEntries(this.variables),
      metadata: Object.fromEntries(this.metadata),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
