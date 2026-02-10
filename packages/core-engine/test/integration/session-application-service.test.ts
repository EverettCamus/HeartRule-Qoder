import { ExecutionStatus } from '@heartrule/shared-types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DefaultSessionApplicationService } from '../../src/application/session-application-service.js';
import type {
  ISessionApplicationService,
  InitializeSessionRequest,
  ProcessUserInputRequest,
} from '../../src/application/session-application-service.js';

/**
 * Session Application Service 测试套件
 * 
 * @remarks
 * DDD 第三阶段重构 - 应用服务接口测试
 * 
 * 测试目标:
 * 1. 验证应用服务接口的正确实现
 * 2. 确保核心引擎与 API 层的边界清晰
 * 3. 覆盖正常流程与错误场景（P0优先级）
 */
describe('SessionApplicationService', () => {
  let service: ISessionApplicationService;
  let mockScriptExecutor: any;

  beforeEach(() => {
    // 创建Mock ScriptExecutor
    mockScriptExecutor = {
      executeSession: vi.fn(),
    };

    // 创建应用服务实例（注入Mock Executor）
    service = new DefaultSessionApplicationService(mockScriptExecutor);
  });

  describe('initializeSession', () => {
    it('[P0] should initialize session and return first AI message', async () => {
      // Arrange
      const request: InitializeSessionRequest = {
        sessionId: 'test-session-001',
        scriptContent: JSON.stringify({
          session: {
            session_id: 'test-script',
            session_name: 'Test Script',
            phases: [
              {
                phase_id: 'phase1',
                phase_name: 'Phase 1',
                topics: [
                  {
                    topic_id: 'topic1',
                    topic_name: 'Topic 1',
                    actions: [
                      {
                        action_id: 'action1',
                        action_type: 'ai_say',
                        content: 'Hello, {{user_name}}!',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        globalVariables: {
          user_name: 'Alice',
        },
      };

      // Mock ScriptExecutor 返回值
      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 1,
        currentPhaseId: 'phase1',
        currentTopicId: 'topic1',
        currentActionId: 'action1',
        currentActionType: 'ai_say',
        currentAction: null,
        variables: { user_name: 'Alice' },
        variableStore: {
          global: { user_name: { value: 'Alice', type: 'string' } },
          session: {},
          phase: {},
          topic: {},
        },
        conversationHistory: [
          {
            role: 'assistant',
            content: 'Hello, Alice!',
            actionId: 'action1',
          },
        ],
        metadata: {},
        lastAiMessage: 'Hello, Alice!',
        lastLLMDebugInfo: {
          prompt: 'System prompt',
          response: { text: 'Hello, Alice!' },
          model: 'test-model',
          config: {},
          timestamp: new Date().toISOString(),
        },
      });

      // Act
      const response = await service.initializeSession(request);

      // Assert
      expect(response.aiMessage).toBe('Hello, Alice!');
      expect(response.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
      expect(response.position).toMatchObject({
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 1,
      });
      expect(response.variables).toEqual({ user_name: 'Alice' });
      expect(response.debugInfo).toBeDefined();
      expect(response.debugInfo?.model).toBe('test-model');

      // 验证调用参数
      expect(mockScriptExecutor.executeSession).toHaveBeenCalledWith(
        expect.any(String), // scriptContent
        'test-session-001', // sessionId
        expect.objectContaining({
          status: 'running',
          currentPhaseIdx: 0,
          currentTopicIdx: 0,
          currentActionIdx: 0,
        }),
        null // userInput (初始化时为null)
      );
    });

    it('[P1] should handle empty conversation history', async () => {
      // Arrange
      const request: InitializeSessionRequest = {
        sessionId: 'test-session-002',
        scriptContent: JSON.stringify({
          session: {
            session_id: 'test-script',
            phases: [
              {
                phase_id: 'phase1',
                topics: [
                  {
                    topic_id: 'topic1',
                    actions: [
                      {
                        action_id: 'action1',
                        action_type: 'ai_say',
                        content: 'Welcome!',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        conversationHistory: [],
      };

      // Mock
      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 1,
        variables: {},
        variableStore: { global: {}, session: {}, phase: {}, topic: {} },
        conversationHistory: [
          { role: 'assistant', content: 'Welcome!', actionId: 'action1' },
        ],
        metadata: {},
        lastAiMessage: 'Welcome!',
      });

      // Act
      const response = await service.initializeSession(request);

      // Assert
      expect(response.aiMessage).toBe('Welcome!');
      expect(response.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
      expect(mockScriptExecutor.executeSession).toHaveBeenCalledWith(
        expect.any(String),
        'test-session-002',
        expect.objectContaining({
          conversationHistory: [],
        }),
        null
      );
    });

    it('[P0] should handle script parsing errors', async () => {
      // Arrange
      const request: InitializeSessionRequest = {
        sessionId: 'test-session-003',
        scriptContent: 'invalid json {]',
      };

      // Mock ScriptExecutor 抛出解析错误
      mockScriptExecutor.executeSession.mockRejectedValue(
        new Error('Script execution failed: Unexpected token')
      );

      // Act
      const response = await service.initializeSession(request);

      // Assert
      expect(response.executionStatus).toBe('error');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('EXECUTION_ERROR');
      expect(response.error?.message).toContain('Unexpected token');
    });
  });

  describe('processUserInput', () => {
    it('[P0] should process user input and extract variables', async () => {
      // Arrange
      const request: ProcessUserInputRequest = {
        sessionId: 'test-session-004',
        userInput: 'My name is Bob',
        scriptContent: JSON.stringify({
          session: {
            session_id: 'test-script',
            phases: [
              {
                phase_id: 'phase1',
                topics: [
                  {
                    topic_id: 'topic1',
                    actions: [
                      {
                        action_id: 'ask1',
                        action_type: 'ai_ask',
                        content: "What's your name?",
                        output_list: [{ name: 'user_name' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }),
        currentExecutionState: {
          status: ExecutionStatus.WAITING_INPUT,
          position: {
            phaseIndex: 0,
            topicIndex: 0,
            actionIndex: 0,
          },
          variables: {},
          conversationHistory: [
            {
              role: 'assistant',
              content: "What's your name?",
              actionId: 'ask1',
            },
          ],
          metadata: {
            actionState: {
              actionId: 'ask1',
              actionType: 'ai_ask',
              currentRound: 1,
            },
          },
        },
      };

      // Mock ScriptExecutor 返回值（变量已提取）
      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 1,
        currentPhaseId: 'phase1',
        currentTopicId: 'topic1',
        currentAction: null,
        variables: { user_name: 'Bob' },
        variableStore: {
          global: {},
          session: {},
          phase: {},
          topic: {
            topic1: {
              user_name: { value: 'Bob', type: 'string', source: 'ask1' },
            },
          },
        },
        conversationHistory: [
          {
            role: 'assistant',
            content: "What's your name?",
            actionId: 'ask1',
          },
          {
            role: 'user',
            content: 'My name is Bob',
          },
          {
            role: 'assistant',
            content: 'Nice to meet you, Bob!',
            actionId: 'say1',
          },
        ],
        metadata: {},
        lastAiMessage: 'Nice to meet you, Bob!',
      });

      // Act
      const response = await service.processUserInput(request);

      // Assert
      expect(response.variables['user_name']).toBe('Bob');
      expect(response.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
      expect(response.variableStore).toBeDefined();
      expect(response.variableStore?.topic['topic1']).toBeDefined();

      // 验证调用参数
      expect(mockScriptExecutor.executeSession).toHaveBeenCalledWith(
        expect.any(String),
        'test-session-004',
        expect.objectContaining({
          status: ExecutionStatus.WAITING_INPUT,
          currentPhaseIdx: 0,
          currentTopicIdx: 0,
          currentActionIdx: 0,
        }),
        'My name is Bob'
      );
    });

    it('[P0] should handle execution errors gracefully', async () => {
      // Arrange
      const request: ProcessUserInputRequest = {
        sessionId: 'test-session-error',
        userInput: 'test input',
        scriptContent: '{}',
        currentExecutionState: {
          status: ExecutionStatus.RUNNING,
          position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
          variables: {},
          conversationHistory: [],
        },
      };

      // Mock ScriptExecutor 抛出错误
      mockScriptExecutor.executeSession.mockRejectedValue(
        new Error('LLM timeout')
      );

      // Act
      const response = await service.processUserInput(request);

      // Assert
      expect(response.executionStatus).toBe('error');
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain('LLM timeout');
    });

    it('[P0] should preserve variableStore across multiple rounds', async () => {
      // Arrange
      const request: ProcessUserInputRequest = {
        sessionId: 'test-session-multi-round',
        userInput: 'I feel anxious',
        scriptContent: '{}',
        currentExecutionState: {
          status: ExecutionStatus.WAITING_INPUT,
          position: { phaseIndex: 0, topicIndex: 0, actionIndex: 1 },
          variables: { user_name: 'Alice' },
          variableStore: {
            global: {},
            session: {
              user_name: { value: 'Alice', type: 'string' },
            },
            phase: {},
            topic: {},
          },
          conversationHistory: [],
        },
      };

      // Mock ScriptExecutor 保留原有变量并新增
      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 2,
        variables: {
          user_name: 'Alice',
          emotion: 'anxious',
        },
        variableStore: {
          global: {},
          session: {
            user_name: { value: 'Alice', type: 'string' },
          },
          phase: {},
          topic: {
            topic1: {
              emotion: { value: 'anxious', type: 'string' },
            },
          },
        },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: 'I understand you feel anxious',
      });

      // Act
      const response = await service.processUserInput(request);

      // Assert
      expect(response.variables['user_name']).toBe('Alice'); // 保留原有变量
      expect(response.variables['emotion']).toBe('anxious'); // 新增变量
      expect(response.variableStore?.session['user_name']).toBeDefined();
      expect(response.variableStore?.topic['topic1']).toBeDefined();
    });
  });

  describe('debugInfo propagation', () => {
    it('[P1] should include debugInfo in response', async () => {
      // Arrange
      const request: InitializeSessionRequest = {
        sessionId: 'test-debug-001',
        scriptContent: JSON.stringify({
          session: {
            phases: [
              {
                phase_id: 'p1',
                topics: [{ topic_id: 't1', actions: [{ action_id: 'a1', action_type: 'ai_say', content: 'Hi' }] }],
              },
            ],
          },
        }),
      };

      // Mock 包含调试信息
      const mockDebugInfo = {
        prompt: 'Test prompt',
        response: { text: 'Hi' },
        model: 'test-model',
        config: { temperature: 0.7 },
        timestamp: new Date().toISOString(),
      };

      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 1,
        variables: {},
        variableStore: { global: {}, session: {}, phase: {}, topic: {} },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: 'Hi',
        lastLLMDebugInfo: mockDebugInfo,
      });

      // Act
      const response = await service.initializeSession(request);

      // Assert
      expect(response.debugInfo).toBeDefined();
      expect(response.debugInfo?.prompt).toBe('Test prompt');
      expect(response.debugInfo?.model).toBe('test-model');
      expect(response.debugInfo?.config.temperature).toBe(0.7);
    });

    it('[P1] should include debugInfo even when action is not completed', async () => {
      // Arrange - ai_ask 第一轮（未完成）
      const request: ProcessUserInputRequest = {
        sessionId: 'test-debug-002',
        userInput: '',
        scriptContent: '{}',
        currentExecutionState: {
          status: ExecutionStatus.RUNNING,
          position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
          variables: {},
          conversationHistory: [],
        },
      };

      const mockDebugInfo = {
        prompt: 'Generate question',
        response: { text: "What's your name?" },
        model: 'test-model',
        config: {},
        timestamp: new Date().toISOString(),
      };

      mockScriptExecutor.executeSession.mockResolvedValue({
        status: ExecutionStatus.WAITING_INPUT,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        variables: {},
        variableStore: { global: {}, session: {}, phase: {}, topic: {} },
        conversationHistory: [
          { role: 'assistant', content: "What's your name?", actionId: 'ask1' },
        ],
        metadata: { actionState: { actionId: 'ask1', currentRound: 1 } },
        lastAiMessage: "What's your name?",
        lastLLMDebugInfo: mockDebugInfo,
      });

      // Act
      const response = await service.processUserInput(request);

      // Assert
      expect(response.executionStatus).toBe(ExecutionStatus.WAITING_INPUT);
      expect(response.debugInfo).toBeDefined();
      expect(response.debugInfo?.prompt).toBe('Generate question');
    });
  });

  describe('error handling', () => {
    it('[P1] should return error in response when execution fails', async () => {
      // Arrange
      const request: InitializeSessionRequest = {
        sessionId: 'test-error-001',
        scriptContent: '{}',
      };

      // Mock 执行失败
      mockScriptExecutor.executeSession.mockRejectedValue(
        new Error('Script execution failed: Phase not found')
      );

      // Act
      const response = await service.initializeSession(request);

      // Assert
      expect(response.executionStatus).toBe('error');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('EXECUTION_ERROR');
      expect(response.error?.message).toContain('Phase not found');
      expect(response.aiMessage).toBe('');
    });

    it('[P1] should handle missing required fields gracefully', async () => {
      // Arrange - 缺少必要字段
      const request: ProcessUserInputRequest = {
        sessionId: '',
        userInput: 'test',
        scriptContent: '',
        currentExecutionState: {
          status: ExecutionStatus.RUNNING,
          position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
          variables: {},
          conversationHistory: [],
        },
      };

      // Mock 参数验证错误
      mockScriptExecutor.executeSession.mockRejectedValue(
        new Error('Invalid session ID')
      );

      // Act
      const response = await service.processUserInput(request);

      // Assert
      expect(response.executionStatus).toBe('error');
      expect(response.error).toBeDefined();
    });
  });
});
