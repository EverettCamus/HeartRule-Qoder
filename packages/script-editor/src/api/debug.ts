import axios from 'axios';

const API_BASE_URL = '/api';

// ========== 类型定义 ==========

export interface DebugSession {
  sessionId: string;
  status: string;
  createdAt: string;
  aiMessage: string;
  executionStatus: string;
  variables?: Record<string, unknown>; // 所有变量（已合并）
  globalVariables?: Record<string, unknown>; // 全局变量
  position?: ExecutionPosition;
  debugInfo?: {
    prompt: string;
    response: {
      text: string;
      finishReason: string;
      usage: {
        completionTokens: number;
        promptTokens: number;
        totalTokens: number;
      };
      raw: any;
    };
    model: string;
    config: {
      temperature: number;
      maxTokens: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
      model: string;
    };
    timestamp: string;
    tokensUsed: number;
  };
}

export interface DebugMessage {
  messageId: string;
  role: 'ai' | 'user' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
  // 扩展的 ID 字段（可选，用于导航树定位）
  phaseId?: string;
  topicId?: string;
  actionId?: string;
  actionType?: string;
  // Action 的回合数信息
  currentRound?: number;
  maxRounds?: number;
}

export interface DebugSessionDetail {
  sessionId: string;
  userId: string;
  scriptId: string;
  status: string;
  executionStatus: string;
  position: ExecutionPosition;
  variables: Record<string, unknown>;
  globalVariables?: Record<string, unknown>; // 全局变量
  metadata: Record<string, unknown>;
  messages: DebugMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface DebugMessageResponse {
  aiMessage: string;
  sessionStatus: string;
  executionStatus: string;
  variables?: Record<string, unknown>;
  globalVariables?: Record<string, unknown>; // 全局变量
  variableStore?: {
    // 分层变量存储
    global: Record<string, unknown>;
    session: Record<string, unknown>;
    phase: Record<string, unknown>;
    topic: Record<string, unknown>;
  };
  position?: ExecutionPosition;
  debugInfo?: {
    prompt: string;
    response: {
      text: string;
      finishReason: string;
      usage: {
        completionTokens: number;
        promptTokens: number;
        totalTokens: number;
      };
      raw: any;
    };
    model: string;
    config: {
      temperature: number;
      maxTokens: number;
      topP: number;
      frequencyPenalty: number;
      presencePenalty: number;
      model: string;
    };
    timestamp: string;
    tokensUsed: number;
  };
  error?: any;
}

export interface CreateDebugSessionRequest {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
}

export interface SendDebugMessageRequest {
  content: string;
}

// ========== API方法 ==========

export const debugApi = {
  /**
   * 创建调试会话
   * 注意：由于后端需要scriptId，前端需要先导入脚本文件
   */
  async createDebugSession(data: CreateDebugSessionRequest) {
    const response = await axios.post<DebugSession>(`${API_BASE_URL}/sessions`, data, {
      timeout: 30000, // 30秒超时
    });
    return response.data;
  },

  /**
   * 获取调试会话详情
   */
  async getDebugSession(sessionId: string) {
    const response = await axios.get<DebugSessionDetail>(`${API_BASE_URL}/sessions/${sessionId}`, {
      timeout: 30000,
    });
    return response.data;
  },

  /**
   * 获取会话消息历史
   */
  async getDebugSessionMessages(sessionId: string) {
    const response = await axios.get<{ success: boolean; data: DebugMessage[] }>(
      `${API_BASE_URL}/sessions/${sessionId}/messages`,
      {
        timeout: 30000,
      }
    );
    return response.data;
  },

  /**
   * 发送调试消息
   */
  async sendDebugMessage(sessionId: string, data: SendDebugMessageRequest) {
    const response = await axios.post<DebugMessageResponse>(
      `${API_BASE_URL}/sessions/${sessionId}/messages`,
      data,
      {
        timeout: 30000,
      }
    );
    return response.data;
  },

  /**
   * 导入脚本文件到数据库（辅助方法）
   * 用于将工程文件转换为可用的scriptId
   */
  async importScript(yamlContent: string, scriptName: string, projectId?: string) {
    const response = await axios.post<{ success: boolean; data: { scriptId: string } }>(
      `${API_BASE_URL}/scripts/import`,
      {
        yamlContent,
        scriptName,
        projectId, // 传递 projectId
      },
      {
        timeout: 30000,
      }
    );
    return response.data;
  },
};
