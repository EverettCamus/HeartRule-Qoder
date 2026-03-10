/**
 * 双线程Action基类
 *
 * 【五层架构 - Action层双线程模型】
 * 实现"主线程+监控线程"双轨制，平衡执行效率与质量监控
 *
 * 核心设计：
 * 1. 主线程：执行主要提示词，与用户交互，发出动作结束信号
 * 2. 监控线程：识别动作策略、进度节奏调整、退出动作信息，不涉及目标改变
 * 3. 每个动作类型至少有两个提示词模板（主线LLM + 监控LLM）
 *
 * 技术实现：
 * - 使用Node.js worker_threads实现真正的并行执行
 * - 线程间通过消息传递通信
 * - 支持线程池管理，避免频繁创建销毁
 *
 * 参照设计文档：
 * - docs/decisions/2026-03-09-five-layer-implementation-decisions.md
 * - docs/plans/2026-03-10-five-layer-mvp-implementation.md
 */

import { BaseAction } from './base-action.js';
import type { ActionContext, ActionResult } from './base-action.js';
import { ThreadManager } from './thread-manager.js';

/**
 * 双线程Action执行结果
 */
export interface DualThreadActionResult {
  mainThreadResult: ActionResult;
  monitorThreadResult: ActionResult;
  mergedResult: ActionResult;
  executionTime: number;
}

/**
 * 双线程Action抽象基类
 *
 * 所有需要双线程执行的Action应继承此类
 * 子类需要实现：
 * 1. executeMainThread - 主线程执行逻辑
 * 2. executeMonitorThread - 监控线程执行逻辑
 * 3. mergeResults - 结果合并逻辑
 */
export abstract class DualThreadAction extends BaseAction {
  protected threadManager: ThreadManager;
  protected readonly enableDualThread: boolean;

  constructor(actionId: string, config: Record<string, any>) {
    super(actionId, config);

    // 是否启用双线程（可通过配置控制）
    this.enableDualThread = config.enableDualThread !== false;

    // 初始化线程管理器
    this.threadManager = new ThreadManager({
      maxWorkers: config.maxWorkers || 2,
      workerTimeout: config.workerTimeout || 30000, // 30秒超时
    });
  }

  /**
   * 执行Action（双线程版本）
   *
   * 如果启用双线程，则并行执行主线程和监控线程
   * 如果禁用双线程，则只执行主线程
   */
  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    const startTime = Date.now();

    if (!this.enableDualThread) {
      // 单线程模式：只执行主线程
      try {
        const mainResult = await this.executeMainThread(context, userInput);
        return this.createSingleThreadResult(mainResult, startTime);
      } catch (error: any) {
        // 主线程执行失败，返回错误
        console.warn(`[DualThreadAction] Single-thread execution failed: ${error.message}`);
        return {
          success: false,
          completed: false,
          error: error.message,
          metadata: {
            dualThreadEnabled: false,
            executionTime: Date.now() - startTime,
            singleThreadFailed: true,
          },
        };
      }
    }

    try {
      // 双线程模式：并行执行主线程和监控线程
      const [mainResult, monitorResult] = await Promise.all([
        this.executeInWorker('main', context, userInput),
        this.executeInWorker('monitor', context, userInput),
      ]);

      // 合并结果
      const mergedResult = this.mergeResults(mainResult, monitorResult);

      // 添加执行时间信息
      const executionTime = Date.now() - startTime;
      mergedResult.metadata = {
        ...mergedResult.metadata,
        dualThreadEnabled: true,
        executionTime,
        mainThreadSuccess: mainResult.success,
        monitorThreadSuccess: monitorResult.success,
      };

      return mergedResult;
    } catch (error: any) {
      // 双线程执行失败，降级到单线程
      console.warn(
        `[DualThreadAction] Dual-thread execution failed, falling back to single-thread: ${error.message}`
      );

      try {
        const mainResult = await this.executeMainThread(context, userInput);
        return this.createSingleThreadResult(mainResult, startTime, error.message);
      } catch (fallbackError: any) {
        // 单线程也失败，返回错误
        return {
          success: false,
          completed: false,
          error: `Dual-thread failed: ${error.message}, Single-thread fallback also failed: ${fallbackError.message}`,
          metadata: {
            dualThreadEnabled: false,
            executionTime: Date.now() - startTime,
            fallbackFailed: true,
          },
        };
      }
    }
  }

  /**
   * 在Worker线程中执行任务
   */
  private async executeInWorker(
    threadType: 'main' | 'monitor',
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult> {
    const workerData = {
      threadType,
      actionType: this.constructor.name,
      actionId: this.actionId,
      context: this.serializeContext(context),
      userInput,
      config: this.config,
    };

    return this.threadManager.executeInWorker<ActionResult>(threadType, workerData);
  }

  /**
   * 序列化上下文（用于Worker线程间传递）
   */
  private serializeContext(context: ActionContext): any {
    // 简化上下文，只传递必要信息
    return {
      sessionId: context.sessionId,
      phaseId: context.phaseId,
      topicId: context.topicId,
      actionId: context.actionId,
      variables: context.variables,
      // 注意：不传递函数或复杂对象
    };
  }

  /**
   * 创建单线程结果
   */
  private createSingleThreadResult(
    mainResult: ActionResult,
    startTime: number,
    fallbackReason?: string
  ): ActionResult {
    const executionTime = Date.now() - startTime;

    return {
      ...mainResult,
      metadata: {
        ...mainResult.metadata,
        dualThreadEnabled: false,
        executionTime,
        fallbackReason,
      },
    };
  }

  /**
   * 抽象方法：执行主线程逻辑
   *
   * 子类必须实现此方法，定义主线程的具体执行逻辑
   */
  protected abstract executeMainThread(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult>;

  /**
   * 抽象方法：执行监控线程逻辑
   *
   * 子类必须实现此方法，定义监控线程的具体执行逻辑
   * 监控线程专注于：
   * - 识别动作策略
   * - 进度节奏调整
   * - 退出动作信息
   * - 不改变动作根本目标
   */
  protected abstract executeMonitorThread(
    context: ActionContext,
    userInput?: string | null
  ): Promise<ActionResult>;

  /**
   * 抽象方法：合并主线程和监控线程的结果
   *
   * 子类必须实现此方法，定义如何整合两个线程的结果
   */
  protected abstract mergeResults(
    mainResult: ActionResult,
    monitorResult: ActionResult
  ): ActionResult;

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.threadManager.cleanup();
  }

  /**
   * 获取线程状态
   */
  getThreadStatus(): {
    enabled: boolean;
    workerCount: number;
    activeWorkers: number;
  } {
    return {
      enabled: this.enableDualThread,
      workerCount: this.threadManager.getWorkerCount(),
      activeWorkers: this.threadManager.getActiveWorkerCount(),
    };
  }
}
