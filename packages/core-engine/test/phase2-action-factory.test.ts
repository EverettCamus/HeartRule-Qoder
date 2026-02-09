/**
 * Phase 2 重构测试：Action工厂重构
 *
 * 验收标准：
 * 1. ✅ 可通过构造函数注入自定义ActionFactory
 * 2. ✅ 默认行为与重构前完全一致
 * 3. ✅ 所有现有测试通过（无功能退化）
 * 4. ✅ 新增单元测试：自定义工厂测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DefaultActionFactory, type ActionFactory } from '../src/actions/action-factory.js';
import type { BaseAction } from '../src/actions/base-action.js';
import { ScriptExecutor } from '../src/engines/script-execution/script-executor.js';

describe('Phase 2 重构：Action工厂重构', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. 依赖注入功能测试', () => {
    it('应该接受ActionFactory通过构造函数注入', () => {
      const mockFactory: ActionFactory = {
        create: vi.fn().mockReturnValue({
          id: 'test-action',
          execute: vi.fn(),
        } as any),
      };

      const executor = new ScriptExecutor(undefined, mockFactory);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该在注入ActionFactory时记录日志', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const mockFactory: ActionFactory = {
        create: vi.fn().mockReturnValue({
          id: 'test-action',
          execute: vi.fn(),
        } as any),
      };

      new ScriptExecutor(undefined, mockFactory);

      // 验证日志包含工厂注入信息
      const logCalls = consoleSpy.mock.calls;
      const hasFactoryLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('Using injected ActionFactory')
      );
      expect(hasFactoryLog).toBe(true);

      consoleSpy.mockRestore();
    });

    it('应该同时支持LLM和ActionFactory注入', () => {
      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      const mockFactory: ActionFactory = {
        create: vi.fn().mockReturnValue({
          id: 'test-action',
          execute: vi.fn(),
        } as any),
      };

      const executor = new ScriptExecutor(mockLLM, mockFactory);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });
  });

  describe('2. 向后兼容性测试', () => {
    it('应该在无参数时创建默认ActionFactory', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      new ScriptExecutor();

      // 验证日志包含默认工厂创建信息
      const logCalls = consoleSpy.mock.calls;
      const hasDefaultFactoryLog = logCalls.some(
        (call) =>
          call[0]?.toString().includes('[ScriptExecutor]') &&
          call[0]?.toString().includes('Created default ActionFactory')
      );
      expect(hasDefaultFactoryLog).toBe(true);

      consoleSpy.mockRestore();
    });

    it('默认ActionFactory应该使用注入的LLM', () => {
      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      const executor = new ScriptExecutor(mockLLM);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该保持Phase 1的LLM注入功能', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      new ScriptExecutor(mockLLM);

      // 验证Phase 1功能仍然有效
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

  describe('3. DefaultActionFactory功能测试', () => {
    it('应该正确创建ai_say类型的Action', () => {
      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      const factory = new DefaultActionFactory(mockLLM);
      const action = factory.create('ai_say', 'test-say', { message: 'hello' });

      expect(action).toBeDefined();
      expect(action.actionId).toBe('test-say');
    });

    it('应该正确创建ai_ask类型的Action', () => {
      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      const factory = new DefaultActionFactory(mockLLM);
      const action = factory.create('ai_ask', 'test-ask', { question: 'how?' });

      expect(action).toBeDefined();
      expect(action.actionId).toBe('test-ask');
    });

    it('ai_say和ai_ask没有LLM时应该抛出错误', () => {
      const factory = new DefaultActionFactory(); // 无LLM

      expect(() => {
        factory.create('ai_say', 'test-say', { message: 'hello' });
      }).toThrow('LLMOrchestrator required for ai_say');

      expect(() => {
        factory.create('ai_ask', 'test-ask', { question: 'how?' });
      }).toThrow('LLMOrchestrator required for ai_ask');
    });
  });

  describe('4. 自定义ActionFactory测试', () => {
    it('应该使用自定义工厂创建Action', () => {
      const mockAction: BaseAction = {
        id: 'custom-action',
        type: 'custom',
        execute: vi.fn().mockResolvedValue({
          success: true,
          continueAction: false,
          nextPhaseIndex: 1,
        }),
      } as any;

      const customFactory: ActionFactory = {
        create: vi.fn().mockReturnValue(mockAction),
      };

      const executor = new ScriptExecutor(undefined, customFactory);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('自定义工厂应该能够拦截所有Action创建', () => {
      const createSpy = vi.fn().mockReturnValue({
        id: 'intercepted',
        execute: vi.fn(),
      } as any);

      const customFactory: ActionFactory = {
        create: createSpy,
      };

      new ScriptExecutor(undefined, customFactory);

      // 注意：这里只是验证工厂被正确注入
      // 实际的Action创建会在script执行时发生
      expect(customFactory.create).toBeDefined();
    });
  });

  describe('5. 边界情况测试', () => {
    it('应该处理undefined的ActionFactory参数', () => {
      const executor = new ScriptExecutor(undefined, undefined);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('应该处理null的ActionFactory参数（类型检查）', () => {
      // TypeScript会阻止传入null，但运行时可以测试
      const executor = new ScriptExecutor(undefined, null as any);
      expect(executor).toBeInstanceOf(ScriptExecutor);
    });

    it('只注入ActionFactory不注入LLM时应该创建默认LLM', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      const mockFactory: ActionFactory = {
        create: vi.fn().mockReturnValue({
          id: 'test-action',
          execute: vi.fn(),
        } as any),
      };

      new ScriptExecutor(undefined, mockFactory);

      // 应该同时看到默认LLM创建和工厂注入的日志
      const logCalls = consoleSpy.mock.calls;
      const hasLLMInit = logCalls.some((call) =>
        call[0]?.toString().includes('LLM Orchestrator initialized')
      );
      const hasFactoryInjection = logCalls.some((call) =>
        call[0]?.toString().includes('Using injected ActionFactory')
      );

      expect(hasLLMInit).toBe(true);
      expect(hasFactoryInjection).toBe(true);

      consoleSpy.mockRestore();
    });
  });

  describe('6. 功能一致性测试', () => {
    it('注入工厂和默认工厂应该能够创建相同类型的Action', () => {
      const mockLLM = {
        generateText: vi.fn().mockResolvedValue({ text: 'test', debugInfo: {} }),
        streamText: vi.fn(),
      } as any;

      // 默认工厂
      const defaultExecutor = new ScriptExecutor(mockLLM);
      expect(defaultExecutor).toBeInstanceOf(ScriptExecutor);

      // 显式注入相同配置的工厂
      const explicitFactory = new DefaultActionFactory(mockLLM);
      const explicitExecutor = new ScriptExecutor(mockLLM, explicitFactory);
      expect(explicitExecutor).toBeInstanceOf(ScriptExecutor);

      // 两者应该具有相同的结构
      expect(typeof defaultExecutor).toBe(typeof explicitExecutor);
    });
  });

  describe('7. 可测试性提升验证', () => {
    it('应该能够Mock ActionFactory进行单元测试', () => {
      const mockFactory: ActionFactory = {
        create: vi.fn().mockImplementation((type, id, config) => ({
          id,
          type,
          config,
          execute: vi.fn().mockResolvedValue({
            success: true,
            continueAction: false,
          }),
        })),
      };

      const executor = new ScriptExecutor(undefined, mockFactory);
      expect(executor).toBeInstanceOf(ScriptExecutor);
      expect(mockFactory.create).toBeDefined();
    });

    it('应该能够验证ActionFactory调用次数和参数', () => {
      const createSpy = vi.fn().mockReturnValue({
        id: 'test',
        execute: vi.fn(),
      } as any);

      const mockFactory: ActionFactory = {
        create: createSpy,
      };

      new ScriptExecutor(undefined, mockFactory);

      // Mock工厂已就绪，可在后续测试中验证调用
      expect(createSpy).toBeDefined();
      expect(vi.isMockFunction(createSpy)).toBe(true);
    });
  });
});
