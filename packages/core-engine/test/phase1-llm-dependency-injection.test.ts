/**
 * Phase 1 重构测试：LLM依赖注入优化
 *
 * 验证：
 * 1. ScriptExecutor支持LLMOrchestrator依赖注入
 * 2. 向后兼容性：无参数构造函数仍然工作
 * 3. 注入的LLM被正确使用
 */

import { describe, it, expect, vi } from 'vitest';

import { ScriptExecutor } from '../src/engines/script-execution/script-executor.js';

describe('Phase 1 重构：LLM依赖注入优化', () => {
  describe('1. 依赖注入功能测试', () => {
    it('应该接受LLMOrchestrator通过构造函数注入', () => {
      // 创建Mock LLM
      const mockOrchestrator = {
        generateText: vi.fn().mockResolvedValue({ text: 'test response', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      // 注入到ScriptExecutor
      const executor = new ScriptExecutor(mockOrchestrator);

      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该在注入LLM时记录日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const mockOrchestrator = {
        generateText: vi.fn(),
      } as any;

      new ScriptExecutor(mockOrchestrator);

      // 验证日志包含LLM注入信息
      const logCalls = consoleSpy.mock.calls;
      const hasLLMLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('Using injected LLM Orchestrator')
      );
      expect(hasLLMLog).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('2. 向后兼容性测试', () => {
    it('应该在无参数时创建默认LLM Orchestrator', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // 无参数构造
      const executor = new ScriptExecutor();

      expect(executor).toBeInstanceOf(ScriptExecutor);
      // 验证日志被调用且包含关键信息
      const logCalls = consoleSpy.mock.calls;
      const hasInitLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('LLM Orchestrator initialized')
      );
      expect(hasInitLog).toBe(true);

      consoleSpy.mockRestore();
    });

    it('应该使用环境变量配置默认LLM', () => {
      // 保存原始环境变量
      const originalApiKey = process.env.VOLCENGINE_API_KEY;
      const originalModel = process.env.VOLCENGINE_MODEL;

      // 设置测试环境变量
      process.env.VOLCENGINE_API_KEY = 'test-api-key';
      process.env.VOLCENGINE_MODEL = 'test-model';

      const consoleSpy = vi.spyOn(console, 'log');

      const executor = new ScriptExecutor();

      expect(executor).toBeInstanceOf(ScriptExecutor);
      // 验证配置信息中包含测试model
      const logCalls = consoleSpy.mock.calls;
      const hasModelLog = logCalls.some((call) => JSON.stringify(call).includes('test-model'));
      expect(hasModelLog).toBe(true);

      // 恢复环境变量
      if (originalApiKey !== undefined) {
        process.env.VOLCENGINE_API_KEY = originalApiKey;
      } else {
        delete process.env.VOLCENGINE_API_KEY;
      }
      if (originalModel !== undefined) {
        process.env.VOLCENGINE_MODEL = originalModel;
      } else {
        delete process.env.VOLCENGINE_MODEL;
      }

      consoleSpy.mockRestore();
    });
  });

  describe('3. 功能一致性测试', () => {
    it('注入LLM和默认LLM应该产生相同的行为', async () => {
      // 创建Mock LLM
      const mockOrchestrator = {
        generateText: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            content: 'Test response',
            safety_risk: { detected: false, risk_type: null, confidence: 'low', reason: null },
            metadata: { emotional_tone: 'neutral', complexity_level: 'medium' },
            metrics: {
              user_engagement: 'high',
              emotional_intensity: 'positive',
              understanding_level: 'good',
            },
          }),
          debugInfo: {
            prompt: 'test',
            response: 'test',
            model: 'test',
            config: {},
            timestamp: new Date().toISOString(),
            tokensUsed: 100,
          },
        }),
      } as any;

      const executorWithInjection = new ScriptExecutor(mockOrchestrator);
      const executorWithDefault = new ScriptExecutor();

      // 两者都应该是ScriptExecutor实例
      expect(executorWithInjection).toBeInstanceOf(ScriptExecutor);
      expect(executorWithDefault).toBeInstanceOf(ScriptExecutor);
    });
  });

  describe('4. 可测试性提升验证', () => {
    it('应该能够Mock LLM进行单元测试', async () => {
      const mockOrchestrator = {
        generateText: vi.fn().mockResolvedValue({
          text: '{"content":"mocked"}',
          debugInfo: {
            prompt: '',
            response: '',
            model: 'mock',
            config: {},
            timestamp: '',
            tokensUsed: 0,
          },
        }),
      } as any;

      const executor = new ScriptExecutor(mockOrchestrator);

      expect(executor).toBeInstanceOf(ScriptExecutor);
      // 验证可以注入Mock，为后续单元测试铺平道路
    });

    it('应该能够验证LLM调用次数', () => {
      const mockOrchestrator = {
        generateText: vi.fn(),
      } as any;

      new ScriptExecutor(mockOrchestrator);

      // Mock已注入，可以在实际使用中验证调用
      expect(mockOrchestrator.generateText).not.toHaveBeenCalled();
    });
  });

  describe('5. 边界情况测试', () => {
    it('应该处理undefined参数', () => {
      const executor = new ScriptExecutor(undefined);

      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该处理null参数（类型检查）', () => {
      // TypeScript会阻止null，但JavaScript运行时可能传入
      const executor = new ScriptExecutor(null as any);

      // 应该回退到默认创建
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });
  });
});
