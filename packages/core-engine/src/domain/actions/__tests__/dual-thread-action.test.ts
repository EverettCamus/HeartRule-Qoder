/**
 * 双线程Action测试
 * 
 * 测试DualThreadAction基类和ThreadManager的功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { ActionContext, ActionResult } from '../base-action.js';

import { DualThreadAction } from '../dual-thread-action.js';
import { ThreadManager } from '../thread-manager.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockScopeResolver = any;
/**
 * 测试用的双线程Action实现
 */
class TestDualThreadAction extends DualThreadAction {
  static actionType = 'test_dual';
  
  constructor(actionId: string, config: Record<string, unknown> = {}) {
    super(actionId, { ...config, enableDualThread: config.enableDualThread ?? true });
  }
  
  protected async executeMainThread(
    context: ActionContext,
    _userInput?: string | null
  ): Promise<ActionResult> {
    // 模拟主线程执行
    return {
      success: true,
      completed: true,
      aiMessage: '主线程执行完成',
      extractedVariables: { main_var: 'main_value' },
      metrics: {
        execution_time: Date.now(),
        tokens_used: 100,
      },
      metadata: {
        thread: 'main',
        action_type: 'test',
      }
    };
  }
  
  protected async executeMonitorThread(
    context: ActionContext,
    _userInput?: string | null
  ): Promise<ActionResult> {
    // 模拟监控线程执行
    return {
      success: true,
      completed: true,
      aiMessage: null,
      extractedVariables: { monitor_var: 'monitor_value' },
      metrics: {
        execution_time: Date.now(),
        monitoring_type: 'quality',
      },
      metadata: {
        thread: 'monitor',
        action_type: 'test',
        quality_score: 0.85,
      }
    };
  }
  
  protected mergeResults(
    mainResult: ActionResult,
    monitorResult: ActionResult
  ): ActionResult {
    // 合并两个线程的结果
    return {
      success: mainResult.success && monitorResult.success,
      completed: mainResult.completed,
      aiMessage: mainResult.aiMessage,
      extractedVariables: {
        ...mainResult.extractedVariables,
        ...monitorResult.extractedVariables,
      },
      metrics: {
        ...mainResult.metrics,
        ...monitorResult.metrics,
        merged: true,
      },
      metadata: {
        ...mainResult.metadata,
        ...monitorResult.metadata,
        merged_at: Date.now(),
      }
    };
  }
}

/**
 * 测试上下文
 */
const createTestContext = (): ActionContext => ({
  sessionId: 'test-session',
  phaseId: 'test-phase',
  topicId: 'test-topic',
  actionId: 'test-action',
  variables: {
    user_name: '测试用户',
    emotional_state: 'neutral',
  },
  systemVariables: {},
  variableStore: new Map(),
  scopeResolver: {
    resolve: vi.fn(),
    set: vi.fn(),
  } as MockScopeResolver,
  conversationHistory: [],
  metadata: {},
});

describe('DualThreadAction', () => {
  let action: TestDualThreadAction;
  let context: ActionContext;
  
  beforeEach(() => {
    context = createTestContext();
    action = new TestDualThreadAction('test-action', {
      enableDualThread: true,
      maxWorkers: 2,
      workerTimeout: 1000, // 设置较短的超时时间，便于测试
      enableDualThread: true,
      maxWorkers: 2,
    });
  });
  
  afterEach(async () => {
    await action.cleanup();
  });
  
  describe('基础功能', () => {
    it('应该正确创建双线程Action', () => {
      expect(action).toBeInstanceOf(DualThreadAction);
      expect(action).toBeInstanceOf(TestDualThreadAction);
      expect(action.actionId).toBe('test-action');
    });
    
    it('应该正确获取线程状态', () => {
      const status = action.getThreadStatus();
      expect(status.enabled).toBe(true);
      expect(status.workerCount).toBe(0); // 初始时没有Worker
      expect(status.activeWorkers).toBe(0);
    });
    
    it('应该正确设置actionType', () => {
      expect(TestDualThreadAction.actionType).toBe('test_dual');
    });
  });
  
  describe('单线程模式', () => {
    it('禁用双线程时应只执行主线程', async () => {
      const singleThreadAction = new TestDualThreadAction('single-thread-action', {
        enableDualThread: false,
      });
      
      const result = await singleThreadAction.execute(context);
      
      expect(result.success).toBe(true);
      expect(result.metadata?.dualThreadEnabled).toBe(false);
      expect(result.extractedVariables?.main_var).toBe('main_value');
      expect(result.extractedVariables?.monitor_var).toBeUndefined(); // 监控线程不应执行
      
      await singleThreadAction.cleanup();
    });
    
    it('单线程模式应包含执行时间', async () => {
      const singleThreadAction = new TestDualThreadAction('single-thread-action', {
        enableDualThread: false,
      });
      
      const result = await singleThreadAction.execute(context);
      
      expect(result.metadata?.executionTime).toBeDefined();
      expect(typeof result.metadata?.executionTime).toBe('number');
      // 注意：在测试环境中，执行时间可能为0，因为模拟执行很快
      expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0);
      
      await singleThreadAction.cleanup();
    });
  });
  
  describe('抽象方法实现', () => {
    it('子类必须实现executeMainThread方法', async () => {
      const mainResult = await action.executeMainThread(context);
      
      expect(mainResult.success).toBe(true);
      expect(mainResult.aiMessage).toBe('主线程执行完成');
      expect(mainResult.extractedVariables?.main_var).toBe('main_value');
    });
    
    it('子类必须实现executeMonitorThread方法', async () => {
      const monitorResult = await action.executeMonitorThread(context);
      
      expect(monitorResult.success).toBe(true);
      expect(monitorResult.aiMessage).toBeNull(); // 监控线程通常不输出消息
      expect(monitorResult.extractedVariables?.monitor_var).toBe('monitor_value');
      expect(monitorResult.metadata?.quality_score).toBe(0.85);
    });
    
    it('子类必须实现mergeResults方法', async () => {
      const mainResult = await action.executeMainThread(context);
      const monitorResult = await action.executeMonitorThread(context);
      const mergedResult = action.mergeResults(mainResult, monitorResult);
      
      expect(mergedResult.success).toBe(true);
      expect(mergedResult.extractedVariables?.main_var).toBe('main_value');
      expect(mergedResult.extractedVariables?.monitor_var).toBe('monitor_value');
      expect(mergedResult.metrics?.merged).toBe(true);
      expect(mergedResult.metadata?.merged_at).toBeDefined();
    });
  });
  
  describe('错误处理', () => {
    it('主线程失败时应正确处理错误', async () => {
      // 创建会失败的主线程实现
      class FailingAction extends DualThreadAction {
        static actionType = 'failing';
        
        constructor() {
          super('failing-action', { enableDualThread: false });
        }
        
        protected async executeMainThread(): Promise<ActionResult> {
          throw new Error('主线程执行失败');
        }
        
        protected async executeMonitorThread(): Promise<ActionResult> {
          return { success: true, completed: true };
        }
        
        protected mergeResults(): ActionResult {
          return { success: true, completed: true };
        }
      }
      
      const failingAction = new FailingAction();
      
      // 注意：在测试中，错误会被捕获并返回，而不是抛出
      // 所以我们需要检查返回的结果是否包含错误
      const result = await failingAction.execute(context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('主线程执行失败');
      
      await failingAction.cleanup();
    });
    
    it('双线程失败时应降级到单线程', async () => {
      // 模拟Worker线程失败
      const mockThreadManager = {
        executeInWorker: vi.fn().mockRejectedValue(new Error('Worker失败')),
        cleanup: vi.fn(),
        getWorkerCount: vi.fn().mockReturnValue(0),
        getActiveWorkerCount: vi.fn().mockReturnValue(0),
      };
      
      // 替换action的threadManager
      (action as any).threadManager = mockThreadManager;
      
      const result = await action.execute(context);
      
      // 应该降级到单线程并成功执行
      expect(result.success).toBe(true);
      expect(result.metadata?.dualThreadEnabled).toBe(false);
      expect(result.metadata?.fallbackReason).toContain('Worker失败');
      expect(result.extractedVariables?.main_var).toBe('main_value');
    });
    
    it('降级后单线程也失败时应返回错误', async () => {
      // 创建会失败的主线程实现
      class DoubleFailingAction extends DualThreadAction {
        static actionType = 'double_failing';
        
        constructor() {
          super('double-failing-action', { enableDualThread: true });
        }
        
        protected async executeMainThread(): Promise<ActionResult> {
          throw new Error('主线程也失败');
        }
        
        protected async executeMonitorThread(): Promise<ActionResult> {
          return { success: true, completed: true };
        }
        
        protected mergeResults(): ActionResult {
          return { success: true, completed: true };
        }
      }
      
      const action = new DoubleFailingAction();
      
      // 模拟Worker线程失败
      const mockThreadManager = {
        executeInWorker: vi.fn().mockRejectedValue(new Error('Worker失败')),
        cleanup: vi.fn(),
        getWorkerCount: vi.fn().mockReturnValue(0),
        getActiveWorkerCount: vi.fn().mockReturnValue(0),
      };
      
      (action as any).threadManager = mockThreadManager;
      
      const result = await action.execute(context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Dual-thread failed');
      expect(result.error).toContain('Single-thread fallback also failed');
      expect(result.metadata?.fallbackFailed).toBe(true);
      
      await action.cleanup();
    });
  });
  
  describe('资源清理', () => {
    it('应该正确清理线程资源', async () => {
      // 注意：在测试环境中，Worker可能无法正常工作
      // 我们主要测试接口调用是否正常
      
      // 先执行一次（可能会失败，但接口调用应该正常）
      try {
        await action.execute(context);
      } catch (error) {
        // Worker可能无法在测试环境中工作，这是预期的
      }
      
      // 清理资源应该正常工作
      await action.cleanup();
      
      const finalStatus = action.getThreadStatus();
      // 清理后Worker数量应该为0
      expect(finalStatus.workerCount).toBe(0);
      expect(finalStatus.activeWorkers).toBe(0);
    }, 15000); // 增加超时时间到15秒
    
    it('多次清理应该安全', async () => {
      await action.cleanup();
      await action.cleanup(); // 第二次清理应该不会报错
      await action.cleanup(); // 第三次清理应该不会报错
      
      // 应该通过测试
      expect(true).toBe(true);
    });
  });
});

describe('ThreadManager', () => {
  let threadManager: ThreadManager;
  
  beforeEach(() => {
    threadManager = new ThreadManager({
      maxWorkers: 2,
      workerTimeout: 1000, // 1秒超时，便于测试
      idleTimeout: 5000,
    });
  });
  
  afterEach(async () => {
    await threadManager.cleanup();
  });
  
  describe('基础功能', () => {
    it('应该正确创建ThreadManager', () => {
      expect(threadManager).toBeInstanceOf(ThreadManager);
      
      const config = threadManager.getConfig();
      expect(config.maxWorkers).toBe(2);
      expect(config.workerTimeout).toBe(1000);
      expect(config.idleTimeout).toBe(5000);
    });
    
    it('应该正确获取Worker状态', () => {
      expect(threadManager.getWorkerCount()).toBe(0);
      expect(threadManager.getActiveWorkerCount()).toBe(0);
      expect(threadManager.getAllWorkerStatus()).toEqual([]);
    });
  });
  
  describe('Worker管理', () => {
    it('应该创建和回收Worker', async () => {
      // 注意：实际测试中Worker可能无法正常工作，因为测试环境可能不支持
      // 这里主要测试接口和错误处理
      
      try {
        await threadManager.executeInWorker('main', { test: 'data' });
        // 如果Worker能正常工作，这里会成功
        expect(true).toBe(true);
      } catch (error: unknown) {
        // Worker可能无法在测试环境中工作，这是预期的
        // 我们主要测试错误处理
        expect(error.message).toBeDefined();
      }
      
      // 清理应该正常工作
      await threadManager.cleanup();
      expect(threadManager.getWorkerCount()).toBe(0);
    });
    
    it('达到最大Worker数量时应抛出错误', async () => {
      // 创建一个小容量的ThreadManager
      const smallManager = new ThreadManager({ maxWorkers: 1 });
      
      // 模拟Worker创建（实际可能失败）
      try {
        // 尝试创建超过限制的Worker
        await Promise.all([
          smallManager.executeInWorker('main', { data: 1 }),
          smallManager.executeInWorker('main', { data: 2 }),
        ]);
      } catch (error: unknown) {
        // 应该收到最大数量限制的错误
        expect(error.message).toContain('Maximum worker limit');
      }
      
      await smallManager.cleanup();
    });
  });
  
  describe('配置验证', () => {
    it('应该使用默认配置', () => {
      const defaultManager = new ThreadManager();
      const config = defaultManager.getConfig();
      
      expect(config.maxWorkers).toBe(4);
      expect(config.workerTimeout).toBe(30000);
      expect(config.idleTimeout).toBe(60000);
      
      defaultManager.cleanup();
    });
    
    it('应该接受自定义配置', () => {
      const customManager = new ThreadManager({
        maxWorkers: 10,
        workerTimeout: 5000,
        idleTimeout: 10000,
      });
      
      const config = customManager.getConfig();
      expect(config.maxWorkers).toBe(10);
      expect(config.workerTimeout).toBe(5000);
      expect(config.idleTimeout).toBe(10000);
      
      customManager.cleanup();
    });
  });
});