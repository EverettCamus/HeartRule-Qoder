import axios from 'axios';

const API_BASE_URL = '/api';

// ========== 类型定义 ==========

export interface DebugSession {
  sessionId: string;
  status: string;
  createdAt: string;
  aiMessage: string;
  executionStatus: string;
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
}

export interface DebugSessionDetail {
  sessionId: string;
  userId: string;
  scriptId: string;
  status: string;
  executionStatus: string;
  position: ExecutionPosition;
  variables: Record<string, unknown>;
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
  async importScript(yamlContent: string, scriptName: string) {
    const response = await axios.post<{ success: boolean; data: { scriptId: string } }>(
      `${API_BASE_URL}/scripts/import`,
      {
        yamlContent,
        scriptName,
      },
      {
        timeout: 30000,
      }
    );
    return response.data;
  },
};
