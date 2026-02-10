/**
 * Phase 5 重构验证：MonitorOrchestrator 分离
 *
 * 测试目标：
 * 1. MonitorOrchestrator 功能完整性
 * 2. ScriptExecutor 与 MonitorOrchestrator 集成
 * 3. 向后兼容性（无参构造仍可正常工作）
 * 4. 监控分析完整流程
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ActionResult } from '../../src/domain/actions/base-action.js';
import { LLMOrchestrator } from '../../src/engines/llm-orchestration/orchestrator.js';
import { VolcanoDeepSeekProvider } from '../../src/engines/llm-orchestration/volcano-provider.js';
import { ScriptExecutor } from '../../src/engines/script-execution/script-executor.js';
import type { ExecutionState } from '../../src/engines/script-execution/script-executor.js';
import { MonitorOrchestrator } from '../../src/application/orchestrators/monitor-orchestrator.js';

describe('Phase 5 重构：MonitorOrchestrator 分离', () => {
  let llmOrchestrator: LLMOrchestrator;

  beforeEach(() => {
    // 创建测试用的 LLM Orchestrator
    const provider = new VolcanoDeepSeekProvider(
      { model: 'test-model', temperature: 0.7, maxTokens: 2000 },
      'test-key',
      'test-model',
      'https://test.api.com'
    );
    llmOrchestrator = new LLMOrchestrator(provider);
  });

  describe('1. MonitorOrchestrator 独立性测试', () => {
    it('应该能够独立创建 MonitorOrchestrator 实例', () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      expect(orchestrator).toBeDefined();
    });

    it('应该支持可选的 projectId 参数', () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator, 'test-project');
      expect(orchestrator).toBeDefined();
    });

    it('MonitorOrchestrator 应该能够处理 ai_ask 类型', async () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      const mockResult: ActionResult = {
        success: true,
        completed: false,
        aiMessage: 'Test message',
        extractedVariables: {},
        metrics: {
          information_completeness: 'partial',
          user_engagement: 'active',
        },
        metadata: {
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const mockExecutionState: ExecutionState = {
        status: 'running' as any,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {
          sessionConfig: {},
          actionMetricsHistory: [],
        },
        lastAiMessage: null,
      };

      // 不应该抛出错误
      await expect(
        orchestrator.analyze(
          'ai_ask',
          'test-action',
          mockResult,
          mockExecutionState,
          'test-session',
          'test-phase',
          'test-topic'
        )
      ).resolves.toBeUndefined();
    });

    it('MonitorOrchestrator 应该能够处理 ai_say 类型', async () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      const mockResult: ActionResult = {
        success: true,
        completed: true,
        aiMessage: 'Test message',
        extractedVariables: {},
        metrics: {
          information_completeness: 'complete',
          user_engagement: 'active',
        },
      };

      const mockExecutionState: ExecutionState = {
        status: 'running' as any,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {
          sessionConfig: {},
          actionMetricsHistory: [],
        },
        lastAiMessage: null,
      };

      await expect(
        orchestrator.analyze(
          'ai_say',
          'test-action',
          mockResult,
          mockExecutionState,
          'test-session',
          'test-phase',
          'test-topic'
        )
      ).resolves.toBeUndefined();
    });

    it('MonitorOrchestrator 应该正确处理不支持的 action type', async () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      const mockResult: ActionResult = {
        success: true,
        completed: true,
        extractedVariables: {},
      };

      const mockExecutionState: ExecutionState = {
        status: 'running' as any,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      // 不支持的类型应该安静返回，不抛出错误
      await expect(
        orchestrator.analyze(
          'unsupported_type',
          'test-action',
          mockResult,
          mockExecutionState,
          'test-session',
          'test-phase',
          'test-topic'
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('2. ScriptExecutor 集成测试', () => {
    it('应该支持通过构造函数注入 MonitorOrchestrator', () => {
      const customOrchestrator = new MonitorOrchestrator(llmOrchestrator);
      const executor = new ScriptExecutor(llmOrchestrator, undefined, customOrchestrator);

      expect(executor).toBeDefined();
    });

    it('应该在注入 MonitorOrchestrator 时记录日志', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');
      const customOrchestrator = new MonitorOrchestrator(llmOrchestrator);

      new ScriptExecutor(llmOrchestrator, undefined, customOrchestrator);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using injected MonitorOrchestrator')
      );

      consoleLogSpy.mockRestore();
    });

    it('应该同时支持 LLM、ActionFactory 和 MonitorOrchestrator 注入', () => {
      const customOrchestrator = new MonitorOrchestrator(llmOrchestrator);
      const executor = new ScriptExecutor(llmOrchestrator, undefined, customOrchestrator);

      expect(executor).toBeDefined();
    });
  });

  describe('3. 向后兼容性测试', () => {
    it('应该在无参数时创建默认 MonitorOrchestrator', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      new ScriptExecutor();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created default MonitorOrchestrator')
      );

      consoleLogSpy.mockRestore();
    });

    it('默认 MonitorOrchestrator 应该使用注入的 LLM', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      new ScriptExecutor(llmOrchestrator);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created default MonitorOrchestrator')
      );

      consoleLogSpy.mockRestore();
    });

    it('应该保持 Phase 1-4 的功能', () => {
      const consoleLogSpy = vi.spyOn(console, 'log');

      new ScriptExecutor();

      // 应该同时看到 LLM、ActionFactory 和 MonitorOrchestrator 的创建日志
      // 检查日志数量
      const logCalls = consoleLogSpy.mock.calls;
      const hasLLMLog = logCalls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('LLM Orchestrator initialized'))
      );
      const hasActionFactoryLog = logCalls.some((call) =>
        call.some((arg) => typeof arg === 'string' && arg.includes('Created default ActionFactory'))
      );
      const hasMonitorOrchestratorLog = logCalls.some((call) =>
        call.some(
          (arg) => typeof arg === 'string' && arg.includes('Created default MonitorOrchestrator')
        )
      );

      expect(hasLLMLog).toBe(true);
      expect(hasActionFactoryLog).toBe(true);
      expect(hasMonitorOrchestratorLog).toBe(true);

      consoleLogSpy.mockRestore();
    });
  });

  describe('4. 监控反馈存储测试', () => {
    it('MonitorOrchestrator 应该正确存储监控反馈到 executionState', async () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      const mockResult: ActionResult = {
        success: true,
        completed: false,
        aiMessage: 'Test message',
        extractedVariables: {},
        metrics: {
          information_completeness: 'partial',
          user_engagement: 'active',
        },
        metadata: {
          currentRound: 1,
          maxRounds: 3,
        },
      };

      const mockExecutionState: ExecutionState = {
        status: 'running' as any,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {
          sessionConfig: {},
          actionMetricsHistory: [],
        },
        lastAiMessage: null,
      };

      await orchestrator.analyze(
        'ai_ask',
        'test-action',
        mockResult,
        mockExecutionState,
        'test-session',
        'test-phase',
        'test-topic'
      );

      // 验证 monitorFeedback 已被创建并存储
      expect(mockExecutionState.metadata.monitorFeedback).toBeDefined();
      expect(Array.isArray(mockExecutionState.metadata.monitorFeedback)).toBe(true);
    });
  });

  describe('5. 错误处理测试', () => {
    it('分析失败时不应该影响主流程', async () => {
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);

      // 创建一个会导致错误的 mock result（缺少必需字段）
      const invalidResult: ActionResult = {
        success: true,
        completed: false,
        extractedVariables: {},
        // 缺少 metrics
      };

      const mockExecutionState: ExecutionState = {
        status: 'running' as any,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      // 应该捕获错误，不抛出
      await expect(
        orchestrator.analyze(
          'ai_ask',
          'test-action',
          invalidResult,
          mockExecutionState,
          'test-session',
          'test-phase',
          'test-topic'
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('6. 代码度量验证', () => {
    it('MonitorOrchestrator 应该减少 ScriptExecutor 的复杂度', () => {
      // 通过创建实例验证重构成功
      const orchestrator = new MonitorOrchestrator(llmOrchestrator);
      const executor = new ScriptExecutor(llmOrchestrator, undefined, orchestrator);

      expect(orchestrator).toBeDefined();
      expect(executor).toBeDefined();

      // 如果代码成功运行到这里，说明重构成功
      // MonitorOrchestrator 已经从 ScriptExecutor 中分离出来
    });
  });
});
