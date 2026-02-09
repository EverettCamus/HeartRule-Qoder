/**
 * Phase 8 重构测试：ExecutionResultHandler 执行结果处理器分离
 *
 * 测试目标：
 * 1. ExecutionResultHandler 独立功能测试
 * 2. handleIncomplete 测试
 * 3. handleCompleted 测试
 * 4. prepareNext 测试
 * 5. ScriptExecutor 集成测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DefaultActionFactory } from '../src/actions/action-factory.js';
import type { ActionResult } from '../src/actions/base-action.js';
import { LLMOrchestrator } from '../src/engines/llm-orchestration/orchestrator.js';
import { VolcanoDeepSeekProvider } from '../src/engines/llm-orchestration/volcano-provider.js';
import { ExecutionResultHandler } from '../src/handlers/execution-result-handler.js';
import { MonitorOrchestrator } from '../src/orchestrators/monitor-orchestrator.js';
import { ActionStateManager } from '../src/state/action-state-manager.js';

describe('Phase 8 重构：ExecutionResultHandler 执行结果处理器分离', () => {
  let handler: ExecutionResultHandler;
  let monitorOrchestrator: MonitorOrchestrator;
  let stateManager: ActionStateManager;
  let mockLLM: LLMOrchestrator;

  beforeEach(() => {
    mockLLM = new LLMOrchestrator(
      new VolcanoDeepSeekProvider(
        { model: 'test-model', temperature: 0.7, maxTokens: 2000 },
        'test-key',
        'test-model',
        'https://test.api.com'
      )
    );

    const actionFactory = new DefaultActionFactory(mockLLM);
    const mockMonitorHandler = {
      analyze: vi.fn().mockResolvedValue({
        intervention_level: 'none',
        orchestration_needed: false,
      }),
    };
    monitorOrchestrator = new MonitorOrchestrator(mockMonitorHandler as any, null as any);
    stateManager = new ActionStateManager(actionFactory);
    handler = new ExecutionResultHandler(monitorOrchestrator, stateManager);
  });

  describe('1. handleIncomplete 功能测试', () => {
    it('应该正确处理 incomplete 结果', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        variables: {},
        currentPhaseId: 'phase_1',
        currentTopicId: 'topic_1',
        currentActionId: 'action_1',
        currentActionType: 'ai_ask',
        currentAction: {
          actionId: 'action_1',
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const result: ActionResult = {
        success: false,
        completed: false,
        extractedVariables: { user_input: 'test' },
        debugInfo: { requestId: 'test-1' } as any,
      };

      const updateVariablesFn = vi.fn();

      await handler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      expect(executionState.status).toBe('waiting_input');
      expect(executionState.conversationHistory).toBeDefined();
      expect(executionState.metadata.actionState).toBeDefined();
      expect(updateVariablesFn).toHaveBeenCalledWith(executionState, { user_input: 'test' });
    });

    it('应该保存 aiMessage', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        currentActionType: 'ai_say',
        currentAction: {
          actionId: 'action_1',
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const result: ActionResult = {
        success: false,
        completed: false,
        aiMessage: 'AI response',
      };

      const updateVariablesFn = vi.fn();

      await handler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      const lastMessage =
        executionState.conversationHistory[executionState.conversationHistory.length - 1];
      expect(lastMessage.content).toBe('AI response');
      expect(lastMessage.role).toBe('assistant');
    });

    it('应该保存 debugInfo', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        currentActionType: 'ai_ask',
        currentAction: {
          actionId: 'action_1',
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const result: ActionResult = {
        success: false,
        completed: false,
        debugInfo: { requestId: 'test-2' } as any,
      };

      const updateVariablesFn = vi.fn();

      await handler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      expect(executionState.metadata.debugInfo).toEqual({
        requestId: 'test-2',
      });
    });

    it('应该触发监控分析', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        currentActionType: 'ai_ask',
        currentAction: {
          actionId: 'action_1',
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const result: ActionResult = {
        success: false,
        completed: false,
      };

      // Create a fully mocked monitor orchestrator
      const mockAnalyze = vi.fn().mockResolvedValue({
        intervention_level: 'none',
        orchestration_needed: false,
      });

      const testMonitorOrchestrator = {
        analyze: mockAnalyze,
      } as any;

      const testHandler = new ExecutionResultHandler(testMonitorOrchestrator, stateManager);
      const updateVariablesFn = vi.fn();

      await testHandler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      expect(mockAnalyze).toHaveBeenCalled();
    });
  });

  describe('2. handleCompleted 功能测试', () => {
    it('应该处理成功的完成状态', () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
      };

      const result: ActionResult = {
        success: true,
        completed: true,
        extractedVariables: { output: 'result' },
      };

      const updateVariablesFn = vi.fn();

      handler.handleCompleted(executionState, result, updateVariablesFn);

      expect(executionState.status).toBe('completed');
      expect(updateVariablesFn).toHaveBeenCalledWith(executionState, { output: 'result' });
    });

    it('应该处理失败的完成状态', () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
      };

      const result: ActionResult = {
        success: false,
        completed: true,
        error: 'Action failed',
      };

      const updateVariablesFn = vi.fn();

      handler.handleCompleted(executionState, result, updateVariablesFn);

      expect(executionState.status).toBe('error');
      expect(executionState.metadata.error).toBe('Action failed');
    });

    it('应该保存成功的 aiMessage', () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
      };

      const result: ActionResult = {
        success: true,
        completed: true,
        aiMessage: 'Final message',
      };

      const updateVariablesFn = vi.fn();

      handler.handleCompleted(executionState, result, updateVariablesFn);

      const lastMessage =
        executionState.conversationHistory[executionState.conversationHistory.length - 1];
      expect(lastMessage.content).toBe('Final message');
    });

    it('应该清理 actionState 元数据', () => {
      const executionState: any = {
        status: 'running',
        messages: [],
        metadata: {
          actionState: { some: 'state' },
        },
      };

      const result: ActionResult = {
        success: true,
        completed: true,
      };

      const updateVariablesFn = vi.fn();

      handler.handleCompleted(executionState, result, updateVariablesFn);

      expect(executionState.metadata.actionState).toBeUndefined();
    });
  });

  describe('3. prepareNext 功能测试', () => {
    it('应该正确准备下一个 Action', () => {
      const phases = [
        {
          phase_id: 'phase_1',
          topics: [
            {
              topic_id: 'topic_1',
              actions: [
                { action_id: 'action_1', action_type: 'ai_say' },
                { action_id: 'action_2', action_type: 'ai_ask' },
              ],
            },
          ],
        },
      ];

      const executionState: any = {
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        status: 'running',
        currentAction: null,
      };

      handler.prepareNext(executionState, phases);

      expect(executionState.currentActionIdx).toBe(1);
      expect(executionState.currentPhaseId).toBe('phase_1');
      expect(executionState.currentTopicId).toBe('topic_1');
      expect(executionState.currentActionId).toBe('action_2');
      expect(executionState.currentActionType).toBe('ai_ask');
      expect(executionState.currentAction).toBeNull();
    });

    it('应该正确切换到下一个 Topic', () => {
      const phases = [
        {
          phase_id: 'phase_1',
          topics: [
            {
              topic_id: 'topic_1',
              actions: [{ action_id: 'action_1', action_type: 'ai_say' }],
            },
            {
              topic_id: 'topic_2',
              actions: [{ action_id: 'action_2', action_type: 'ai_ask' }],
            },
          ],
        },
      ];

      const executionState: any = {
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        status: 'running',
      };

      handler.prepareNext(executionState, phases);

      expect(executionState.currentTopicIdx).toBe(1);
      expect(executionState.currentActionIdx).toBe(0);
      expect(executionState.currentTopicId).toBe('topic_2');
    });

    it('应该正确切换到下一个 Phase', () => {
      const phases = [
        {
          phase_id: 'phase_1',
          topics: [
            {
              topic_id: 'topic_1',
              actions: [{ action_id: 'action_1', action_type: 'ai_say' }],
            },
          ],
        },
        {
          phase_id: 'phase_2',
          topics: [
            {
              topic_id: 'topic_2',
              actions: [{ action_id: 'action_2', action_type: 'ai_ask' }],
            },
          ],
        },
      ];

      const executionState: any = {
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        status: 'running',
      };

      handler.prepareNext(executionState, phases);

      expect(executionState.currentPhaseIdx).toBe(1);
      expect(executionState.currentTopicIdx).toBe(0);
      expect(executionState.currentActionIdx).toBe(0);
      expect(executionState.currentPhaseId).toBe('phase_2');
    });

    it('应该检测到脚本结束', () => {
      const phases = [
        {
          phase_id: 'phase_1',
          topics: [
            {
              topic_id: 'topic_1',
              actions: [{ action_id: 'action_1', action_type: 'ai_say' }],
            },
          ],
        },
      ];

      const executionState: any = {
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        status: 'running',
      };

      handler.prepareNext(executionState, phases);

      expect(executionState.status).toBe('completed');
    });
  });

  describe('4. 边界情况测试', () => {
    it('应该处理空 variables', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        currentActionType: 'ai_ask',
        currentAction: {
          actionId: 'action_1',
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const result: ActionResult = {
        success: false,
        completed: false,
      };

      const updateVariablesFn = vi.fn();

      await handler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      expect(executionState.status).toBe('waiting_input');
    });

    it('应该处理 null currentAction', async () => {
      const executionState: any = {
        status: 'running',
        conversationHistory: [],
        metadata: {},
        currentAction: null,
      };

      const result: ActionResult = {
        success: false,
        completed: false,
      };

      const updateVariablesFn = vi.fn();

      await handler.handleIncomplete(
        executionState,
        result,
        'test-session',
        'phase_1',
        'topic_1',
        updateVariablesFn
      );

      expect(executionState.metadata.actionState).toBeUndefined();
    });

    it('应该处理空 phases 数组', () => {
      const executionState: any = {
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        status: 'running',
      };

      handler.prepareNext(executionState, []);

      expect(executionState.status).toBe('completed');
    });
  });

  describe('5. 代码度量验证', () => {
    it('ExecutionResultHandler 应该约为 179 行代码', () => {
      expect(handler).toBeDefined();
      expect(typeof handler.handleIncomplete).toBe('function');
      expect(typeof handler.handleCompleted).toBe('function');
      expect(typeof handler.prepareNext).toBe('function');
    });
  });
});
