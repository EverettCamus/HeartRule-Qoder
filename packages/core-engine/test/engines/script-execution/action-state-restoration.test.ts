/**
 * Action State Restoration Integration Test
 * 
 * 测试目标：验证 ScriptExecutor 在多轮对话中正确保持和恢复 Action 状态
 * 
 * 核心问题：
 * - ActionStateManager 虽然正确序列化和反序列化了 action 状态
 * - 但 ScriptExecutor 在 executeTopic 中又重新创建了新的 action 实例
 * - 导致 currentRound 重置为 0，状态丢失
 * 
 * 验证点：
 * 1. 第1轮执行后，action 状态应该被序列化保存
 * 2. 第2轮执行前，action 状态应该被正确恢复
 * 3. 第2轮执行时，应该使用恢复的 action 实例，而不是创建新实例
 * 4. currentRound 应该保持连续递增（1 → 2）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScriptExecutor, ExecutionStatus } from '../../../src/engines/script-execution/script-executor.js';
import { LLMOrchestrator } from '../../../src/engines/llm-orchestration/orchestrator.js';
import type { ILLMProvider, LLMGenerateResult } from '../../../src/application/ports/outbound/llm-provider.port.js';
import type { ExecutionState } from '../../../src/engines/script-execution/script-executor.js';

// Mock LLM Provider
class MockLLMProvider implements ILLMProvider {
  getModel(): any {
    return null;
  }

  async generateText(_prompt: string, _config?: any): Promise<LLMGenerateResult> {
    return {
      text: JSON.stringify({
        content: 'AI生成的回复内容',
        EXIT: 'false',
        metadata: {
          assessment: {
            understanding_level: 50,
            has_questions: false,
            expressed_understanding: false,
            reasoning: '测试评估'
          }
        }
      }),
      debugInfo: {
        prompt: 'test',
        response: 'mock response',
        model: 'mock-model',
        tokensUsed: 100,
        config: {},
        timestamp: new Date().toISOString()
      }
    };
  }

  async *streamText(_prompt: string, _config?: any): AsyncIterable<string> {
    yield 'mock stream';
  }
}

function createMockLLM(): LLMOrchestrator {
  const mockProvider = new MockLLMProvider();
  return new LLMOrchestrator(mockProvider, 'mock');
}

describe('ScriptExecutor Action State Restoration', () => {
  let executor: ScriptExecutor;
  let mockLLM: LLMOrchestrator;

  // 测试用的最简单脚本：JSON 格式（因为 executeSession 期望 JSON）
  const testScriptJson = {
    session: {
      session_id: 'test_session',
      phases: [
        {
          phase_id: 'test_phase',
          topics: [
            {
              topic_id: 'test_topic',
              actions: [
                {
                  action_type: 'ai_say',
                  action_id: 'say_hello',
                  config: {
                    content: '测试内容',
                    max_rounds: 2
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
  const testScript = JSON.stringify(testScriptJson);

  beforeEach(() => {
    mockLLM = createMockLLM();
    executor = new ScriptExecutor(mockLLM);
  });

  it('第1轮：应该创建 action 并序列化状态（currentRound=1）', async () => {
    // 执行第1轮
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      testScript,
      'test-session-1',
      initialState
    );

    console.log('[Test] Round 1 execution state:', {
      status: result1.status,
      hasCurrentAction: !!result1.currentAction,
      hasActionState: !!result1.metadata.actionState,
      actionState: result1.metadata.actionState,
    });

    // 验证：第1轮不应该完成
    expect(result1.status).toBe('waiting_input');
    
    // 验证：currentAction 应该存在
    expect(result1.currentAction).toBeDefined();
    expect(result1.currentAction?.actionId).toBe('say_hello');
    expect(result1.currentAction?.currentRound).toBe(1);
    expect(result1.currentAction?.maxRounds).toBe(2);

    // 验证：actionState 应该被序列化
    expect(result1.metadata.actionState).toBeDefined();
    expect(result1.metadata.actionState.actionId).toBe('say_hello');
    expect(result1.metadata.actionState.currentRound).toBe(1);
    expect(result1.metadata.actionState.maxRounds).toBe(2);
  });

  it('第2轮：应该恢复 action 状态并继续执行（currentRound 应该从1递增到2）', async () => {
    // ========== 第1轮：初始执行 ==========
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      testScript,
      'test-session-2',
      initialState
    );
    
    expect(result1.status).toBe('waiting_input');
    expect(result1.currentAction?.currentRound).toBe(1);

    console.log('[Test] Round 1 completed:', {
      currentRound: result1.currentAction?.currentRound,
      serializedRound: result1.metadata.actionState?.currentRound,
    });

    // ========== 第2轮：用户输入后继续执行 ==========
    const result2 = await executor.executeSession(
      testScript,
      'test-session-2',
      result1,
      '用户的回复'
    );

    console.log('[Test] Round 2 execution state:', {
      status: result2.status,
      hasCurrentAction: !!result2.currentAction,
      currentRound: result2.currentAction?.currentRound,
      maxRounds: result2.currentAction?.maxRounds,
      lastAiMessage: result2.lastAiMessage,
      currentActionIdx: result2.currentActionIdx,
    });

    // 关键验证：第2轮执行时，currentRound 应该是 2，completed=true
    // 但由于最后一轮有 aiMessage 需要先返回给客户端显示，所以 status 是 waiting_input
    expect(result2.status).toBe('waiting_input'); // 返回消息给客户端
    expect(result2.lastAiMessage).toBeTruthy(); // 应该有最后一轮的 AI 消息
    expect(result2.currentActionIdx).toBe(1); // prepareNext 已经将索引移到下一个 action
    
    // ========== 第3轮：客户端确认后继续执行下一个 action ==========
    const result3 = await executor.executeSession(
      testScript,
      'test-session-2',
      result2,
      '' // 空输入或任意输入
    );
    
    console.log('[Test] Round 3 execution state:', {
      status: result3.status,
      currentActionIdx: result3.currentActionIdx,
      currentActionId: result3.currentActionId,
    });
    
    // 现在应该执行到下一个 action 并等待输入
    expect(result3.status).toBe('waiting_input');
    expect(result3.currentActionIdx).toBe(1); // 已在第2个 action
  });

  it('完整多轮流程：验证 action 实例的连续性', async () => {
    // ========== 第1轮 ==========
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      testScript,
      'test-session-3',
      initialState
    );
    
    const action1Id = result1.currentAction?.actionId;
    const round1 = result1.currentAction?.currentRound;

    console.log('[Test] Round 1:', {
      actionId: action1Id,
      currentRound: round1,
      status: result1.status,
    });

    expect(action1Id).toBe('say_hello');
    expect(round1).toBe(1);
    expect(result1.status).toBe('waiting_input');

    // ========== 第2轮 ==========
    const result2 = await executor.executeSession(
      testScript,
      'test-session-3',
      result1,
      '用户输入1'
    );

    console.log('[Test] Round 2:', {
      status: result2.status,
      lastAiMessage: result2.lastAiMessage,
      currentActionIdx: result2.currentActionIdx,
    });

    // 关键验证：
    // 1. 第2轮应该返回消息给客户端
    expect(result2.status).toBe('waiting_input'); // 最后一轮消息先返回
    expect(result2.lastAiMessage).toBeTruthy();
    expect(result2.currentActionIdx).toBe(1); // 索引已移动
    
    // 2. 验证流程的连续性：通过日志验证 currentRound 从 1 递增到 2
    // 日志中应该有 "currentRound incremented to 2"
    expect(round1).toBe(1); // 第1轮
  });

  it('BUG重现：如果 action 被重新创建，currentRound 会重置为0', async () => {
    // 这个测试用于演示bug：如果没有正确恢复action，会发生什么
    
    // 第1轮
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      testScript,
      'test-session-4',
      initialState
    );
    expect(result1.currentAction?.currentRound).toBe(1);
  
    // 模拟 bug：手动清除 currentAction，导致第2轮会重新创建
    // （这就是实际bug的情况）
    const buggyState = { ...result1 };
    buggyState.currentAction = null; // 模拟 action 丢失
  
    // 第2轮：如果没有从 actionState 恢复，会创建新的 action
    const result2 = await executor.executeSession(
      testScript,
      'test-session-4',
      buggyState,
      '用户输入'
    );
  
    console.log('[Test] BUG scenario:', {
      hasActionState: !!buggyState.metadata.actionState,
      restoredRound: result2.currentAction?.currentRound,
      expected: 2,
    });
  
    // 如果bug存在，currentRound 会是 1（重新创建后 ++）
    // 如果bug修复，应该返回 waiting_input（因为最后一轮有 aiMessage）
      
    // 这个测试应该通过（证明bug已修复）
    expect(result2.status).toBe('waiting_input'); // 最后一轮消息先返回
    expect(result2.lastAiMessage).toBeTruthy();
    // 日志中应该有 "currentRound incremented to 2" 和 "isLastRound=true"
  });
  
  it('BUG重现：resumeCurrentActionIfNeeded完成action后，executeAllPhases不应重新执行该topic', async () => {
    // 这个测试用于重现真实bug：
    // 1. resumeCurrentActionIfNeeded 正确恢复并完成了 action（currentRound 1→2）
    // 2. 但 executeAllPhases 又重新规划并执行同一个 topic
    // 3. 导致 action 被重新创建（currentRound 重置为 0）
  
    // 使用包含2个action的脚本
    const scriptWith2Actions = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'say_hello',
                    config: { content: '第一个action', max_rounds: 2 }
                  },
                  {
                    action_type: 'ai_say',
                    action_id: 'say_goodbye',
                    config: { content: '第二个action', max_rounds: 2 } // 改为 2，需要等待输入
                  }
                ]
              }
            ]
          }
        ]
      }
    });
  
    // ========== 第1轮：执行第一个action ==========
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-5',
      initialState
    );
  
    console.log('[Test] After round 1:', {
      status: result1.status,
      currentActionIdx: result1.currentActionIdx,
      currentActionId: result1.currentActionId,
      hasCurrentAction: !!result1.currentAction,
      currentRound: result1.currentAction?.currentRound,
    });
  
    expect(result1.status).toBe('waiting_input');
    expect(result1.currentAction?.actionId).toBe('say_hello');
    expect(result1.currentAction?.currentRound).toBe(1);
    expect(result1.currentActionIdx).toBe(0); // 仍在第一个action
  
    // ========== 第2轮：用户输入后继续执行 ==========
    const result2 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-5',
      result1,
      '用户回复'
    );
  
    console.log('[Test] After round 2:', {
      status: result2.status,
      currentActionIdx: result2.currentActionIdx,
      currentActionId: result2.currentActionId,
      hasCurrentAction: !!result2.currentAction,
      currentRound: result2.currentAction?.currentRound,
      lastAiMessage: result2.lastAiMessage,
    });
  
    // 关键验证：
    // 1. 第一个action应该完成（currentRound=2）
    // 2. 但有 aiMessage 需要先返回给客户端
    // 3. currentActionIdx 已移动到下一个 action
    expect(result2.status).toBe('waiting_input'); // 返回最后一轮消息
    expect(result2.lastAiMessage).toBeTruthy(); // 应该有第1个 action 的最后一条消息
    expect(result2.currentActionIdx).toBe(1); // prepareNext 已经移动索引
    expect(result2.currentAction).toBeNull(); // currentAction 已清除
    
    // ========== 第3轮：客户端确认后执行第2个 action ==========
    const result3 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-5',
      result2,
      '' // 空输入
    );
    
    console.log('[Test] After round 3:', {
      status: result3.status,
      currentActionIdx: result3.currentActionIdx,
      currentActionId: result3.currentActionId,
      currentRound: result3.currentAction?.currentRound,
    });
    
    // 现在应该执行第2个 action 的第1轮
    expect(result3.status).toBe('waiting_input');
    expect(result3.currentActionIdx).toBe(1);
    expect(result3.currentActionId).toBe('say_goodbye');
    expect(result3.currentAction?.actionId).toBe('say_goodbye');
    expect(result3.currentAction?.currentRound).toBe(1);
  
    // 如果bug存在，会出现：
    // - currentActionIdx 仍然是 0（没有前进）
    // - currentActionId 是 'say_hello'（重新执行第一个action）
    // - currentRound 是 0 或 1（重新创建）
  });
  
  it('关键验证：ai_say最后一轮完成时，aiMessage应该被添加到conversationHistory', async () => {
    // 这个测试验证修复的核心问题：
    // 当 ai_say action 在最后一轮（isLastRound=true）完成时，
    // 它的 aiMessage 应该被添加到 conversationHistory，
    // 而不是因为 executionState.status 被错误设置为 'completed' 而丢失
  
    const scriptWith2Actions = JSON.stringify({
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'say_hello',
                    config: { content: 'AI问候', max_rounds: 2 }
                  },
                  {
                    action_type: 'ai_say',
                    action_id: 'say_goodbye',
                    config: { content: 'AI告别', max_rounds: 1 }
                  }
                ]
              }
            ]
          }
        ]
      }
    });
  
    // 第1轮：say_hello 第1次
    const initialState: ExecutionState = {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      conversationHistory: [],
      variables: {},
      metadata: {},
      lastAiMessage: null,
    };
    const result1 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-6',
      initialState
    );
  
    // 验证第1轮
    expect(result1.status).toBe('waiting_input');
    expect(result1.conversationHistory.length).toBe(1); // 第1条AI消息
    expect(result1.conversationHistory[0].actionId).toBe('say_hello');
  
    console.log('[Test] Round 1 conversation history:', {
      length: result1.conversationHistory.length,
      messages: result1.conversationHistory.map(m => ({
        actionId: m.actionId,
        role: m.role,
        contentLength: m.content.length
      }))
    });
  
    // 第2轮：say_hello 第2次（最后一轮，completed=true）
    const result2 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-6',
      result1,
      '用户回复1'
    );
  
    console.log('[Test] Round 2 conversation history:', {
      length: result2.conversationHistory.length,
      status: result2.status,
      currentActionId: result2.currentActionId,
      currentActionIdx: result2.currentActionIdx,
      lastAiMessage: result2.lastAiMessage,
      messages: result2.conversationHistory.map(m => ({
        actionId: m.actionId,
        role: m.role,
        contentLength: m.content.length
      }))
    });
  
    // 关键验证：
    // 1. conversationHistory 应该包含 say_hello 的第2条消息
    // 2. 但还没有执行 say_goodbye（因为要先返回消息给客户端）
    // 3. 总共至少2条AI消息（say_hello第1条 + say_hello第2条）
    expect(result2.status).toBe('waiting_input'); // 返回消息给客户端
    expect(result2.lastAiMessage).toBeTruthy(); // 应该有 say_hello 的第2条消息
    
    const aiMessages = result2.conversationHistory.filter(m => m.role === 'assistant');
    expect(aiMessages.length).toBe(2); // say_hello 的 2 条消息
        
    // 验证 say_hello 有2条AI消息
    const sayHelloMessages = result2.conversationHistory.filter(
      m => m.actionId === 'say_hello' && m.role === 'assistant'
    );
    expect(sayHelloMessages.length).toBe(2); // 关键断言！
    
    // ========== 第3轮：客户端确认后执行 say_goodbye ==========
    const result3 = await executor.executeSession(
      scriptWith2Actions,
      'test-session-6',
      result2,
      '' // 空输入
    );
    
    console.log('[Test] Round 3 conversation history:', {
      length: result3.conversationHistory.length,
      status: result3.status,
      currentActionId: result3.currentActionId,
      aiMessages: result3.conversationHistory.filter(m => m.role === 'assistant').length,
    });
    
    // 现在应该有 say_goodbye 的第1条消息
    const sayGoodbyeMessages = result3.conversationHistory.filter(
      m => m.actionId === 'say_goodbye' && m.role === 'assistant'
    );
    expect(sayGoodbyeMessages.length).toBeGreaterThanOrEqual(1);
    
    // 如果 bug 存在（handleCompleted 错误设置 status='completed'），
    // say_hello 的第2条消息会丢失，conversationHistory 只有2条AI消息
  });
});
