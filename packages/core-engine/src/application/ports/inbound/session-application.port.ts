/**
 * Session Application Service Port (Inbound)
 * 
 * @remarks
 * DDD 六边形架构：入站端口定义
 * 该文件定义核心引擎提供给 API 层的应用服务接口
 * 
 * 职责分离：
 * - 本文件：定义接口契约（Port）
 * - ../usecases/session-application-service.ts：提供具体实现
 * 
 * @see ../usecases/session-application-service.ts 接口实现
 */

import type { ExecutionStatus, ExecutionPosition } from '@heartrule/shared-types';
import type { LLMDebugInfo } from '../../../engines/llm-orchestration/orchestrator.js';

/**
 * 扩展的执行位置信息（包含多轮对话状态）
 * 
 * @remarks
 * 继承 shared-types 中的标准 ExecutionPosition，扩展了多轮对话相关字段
 */
export interface ExtendedExecutionPosition extends ExecutionPosition {
  currentRound?: number;
  maxRounds?: number;
}

/**
 * 会话初始化请求
 */
export interface InitializeSessionRequest {
  /** 会话 ID */
  sessionId: string;
  /** 脚本内容（JSON 字符串或解析后的对象） */
  scriptContent: string | Record<string, any>;
  /** 全局变量 */
  globalVariables?: Record<string, unknown>;
  /** 会话级变量（用于恢复会话） */
  sessionVariables?: Record<string, unknown>;
  /** 对话历史 */
  conversationHistory?: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * 用户输入处理请求
 */
export interface ProcessUserInputRequest {
  /** 会话 ID */
  sessionId: string;
  /** 用户输入内容 */
  userInput: string;
  /** 脚本内容（JSON 字符串或解析后的对象） */
  scriptContent: string | Record<string, any>;
  /** 全局变量 */
  globalVariables?: Record<string, unknown>;
  /** 当前执行状态（用于恢复） */
  currentExecutionState: {
    status: ExecutionStatus;
    position: {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
    };
    variables: Record<string, unknown>;
    variableStore?: any;
    conversationHistory: Array<{
      role: string;
      content: string;
      actionId?: string;
      metadata?: Record<string, any>;
    }>;
    metadata?: Record<string, any>;
  };
}

/**
 * 会话执行响应
 */
export interface SessionExecutionResponse {
  /** AI 生成的消息 */
  aiMessage: string;
  /** 执行状态 */
  executionStatus: ExecutionStatus;
  /** 当前执行位置 */
  position: ExtendedExecutionPosition;
  /** 会话级变量（扁平结构） */
  variables: Record<string, unknown>;
  /** 分层变量存储（用于调试与内部状态同步） */
  variableStore?: {
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  /** LLM 调试信息 */
  debugInfo?: LLMDebugInfo;
  /** 错误信息（如果执行失败） */
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * 会话应用服务接口（入站端口）
 * 
 * @remarks
 * 该接口定义了核心引擎向 API 层暴露的标准能力：
 * 1. 初始化会话并获取第一条 AI 消息
 * 2. 处理用户输入并推进会话执行
 * 
 * API 层应该：
 * - 负责从数据库加载会话与脚本数据
 * - 调用本接口完成核心业务逻辑
 * - 将响应结果转换为 HTTP 响应并持久化状态
 * 
 * 核心引擎应该：
 * - 专注于脚本执行、变量管理、LLM 调用等核心逻辑
 * - 不直接依赖数据库或 HTTP 框架
 * - 通过该接口与外部系统解耦
 */
export interface ISessionApplicationService {
  /**
   * 初始化会话
   * 
   * @param request - 初始化请求
   * @returns 包含第一条 AI 消息的执行响应
   * 
   * @remarks
   * 用于会话的首次启动，执行脚本的第一个 Action 并返回 AI 消息
   */
  initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse>;

  /**
   * 处理用户输入
   * 
   * @param request - 用户输入处理请求
   * @returns 包含 AI 响应的执行结果
   * 
   * @remarks
   * 用于处理用户的后续输入，推进会话执行并返回 AI 回复
   */
  processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse>;
}
