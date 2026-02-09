# ScriptExecutor 重构方案

## 文档元数据

- **创建时间**: 2026-02-09
- **文档版本**: 1.0
- **状态**: 待评审
- **优先级**: P2 (中优先级)
- **负责人**: 待指派

---

## 1. 问题描述

### 1.1 发现的问题

在 `packages/core-engine/src/engines/script-execution/` 目录下存在**两个同名但功能差异巨大的 ScriptExecutor 类**：

| 文件                   | 代码行数 | 架构模式         | 生产状态      | 功能完整度                 |
| ---------------------- | -------- | ---------------- | ------------- | -------------------------- |
| **script-executor.ts** | 1146 行  | 直接创建依赖     | ✅ 生产使用中 | **完整**：Story 1.4 全功能 |
| **executor.ts**        | 298 行   | DDD架构+依赖注入 | ❌ 未投入生产 | **基础**：仅基本执行流程   |

### 1.2 代码冲突点

当前通过 `index.ts` 的别名导出机制避免命名冲突：

```typescript
// packages/core-engine/src/engines/script-execution/index.ts
export type { ExecutionState as LegacyExecutionState } from './executor.js';
export { ScriptExecutor as LegacyScriptExecutor } from './executor.js';
export * from './script-executor.js'; // 默认导出
```

### 1.3 架构差异分析

#### **script-executor.ts（生产版本）**

**优点**：

- ✅ **功能完整**：包含 Story 1.4 异步监控机制、变量四层作用域、metrics历史存储、监控反馈闭环
- ✅ **生产验证**：已在 api-server 和所有测试中使用，稳定可靠
- ✅ **LLM集成**：内置 `LLMOrchestrator`，支持多轮对话、变量提取、JSON重试
- ✅ **状态序列化**：支持 Action 状态持久化、断点续跑

**缺点**：

- ❌ **架构问题**：直接在构造函数中创建依赖（`new LLMOrchestrator`），违反 DDD 依赖注入原则
- ❌ **可测试性差**：依赖写死，难以进行单元测试（需要环境变量配置 LLM）
- ❌ **耦合度高**：与具体 LLM Provider（VolcanoDeepSeekProvider）强耦合
- ❌ **代码冗长**：1146 行代码，维护成本高

#### **executor.ts（设计蓝图）**

**优点**：

- ✅ **架构优雅**：遵循 DDD 原则，依赖通过构造函数注入（`ActionRegistry`）
- ✅ **可测试性强**：依赖可 Mock，易于单元测试
- ✅ **代码简洁**：298 行，逻辑清晰，易维护
- ✅ **解耦良好**：Action 创建通过注册表，不依赖具体实现

**缺点**：

- ❌ **功能缺失**：缺少 Story 1.4 监控机制、变量作用域、metrics历史、LLM集成
- ❌ **未投入生产**：没有实际使用场景，可能存在未发现的问题
- ❌ **数据结构差异**：`ExecutionState` 使用 `Map` 而非对象，与生产版本不兼容
- ❌ **缺少领域模型**：依赖 `Script` 和 `Session` 领域对象，但实际 api-server 使用数据库模型

### 1.4 使用情况分析

通过 grep 搜索 `new ScriptExecutor` 的调用位置：

```typescript
// 生产代码使用（script-executor.ts）
packages/api-server/src/services/session-manager.ts:81
packages/core-engine/src/application/session-application-service.ts:189, 247

// 测试代码使用（script-executor.ts）
packages/core-engine/test/*.test.ts (8处)
packages/api-server/*.ts (测试脚本 2处)

// executor.ts 使用情况：0处（完全未被使用）
```

**结论**：`executor.ts` 是设计阶段的产物，从未投入实际使用。

---

## 2. 重构设计方案

### 2.1 策略选择

基于上述分析，提出**三种重构策略**：

| 策略       | 描述                                      | 风险等级  | 时间投入 | 推荐度              |
| ---------- | ----------------------------------------- | --------- | -------- | ------------------- |
| **策略 A** | 保留 script-executor.ts，删除 executor.ts | 🟢 低风险 | 2 小时   | ⭐⭐⭐⭐⭐ **推荐** |
| **策略 B** | 重构 script-executor.ts，迁移到 DDD 架构  | 🟡 中风险 | 3-5 天   | ⭐⭐⭐              |
| **策略 C** | 将 Story 1.4 功能迁移到 executor.ts       | 🔴 高风险 | 5-7 天   | ⭐⭐                |

### 2.2 推荐方案：策略 A（清理未使用代码）

**理由**：

1. **零风险**：不影响生产代码，仅删除未使用的文件
2. **快速交付**：2 小时内完成，无需复杂测试
3. **清晰架构**：消除歧义，避免未来维护困惑
4. **YAGNI 原则**：executor.ts 从未被使用，违反"你不需要它"原则

**执行步骤**：

1. 确认 executor.ts 无外部引用
2. 备份到 `docs/archive/` 目录
3. 删除文件和导出别名
4. 更新相关文档说明

### 2.3 备选方案：策略 B（渐进式重构）

**适用场景**：长期架构优化，改善代码质量

**重构方向**：

1. **Phase 1**: 提取 LLM 依赖注入（1天）
   - 构造函数接收 `LLMOrchestrator` 参数
   - 保留默认创建逻辑（向后兼容）
2. **Phase 2**: 提取 Action 创建逻辑（1天）
   - 引入 `ActionFactory` 接口
   - 迁移 `createAction` 到工厂类
3. **Phase 3**: 分离监控逻辑（1天）
   - 提取 `MonitorService` 接口
   - 将 `triggerMonitorAnalysis` 迁移到独立服务
4. **Phase 4**: 简化 ExecutionState（1天）
   - 拆分为 `ExecutionContext` + `ExecutionPosition`
   - 减少临时状态存储

**风险点**：

- 需要全量回归测试（E2E + 单元测试）
- 可能影响现有功能稳定性
- 改动范围大，需要多人协作

---

## 3. 详细执行步骤

### 3.1 策略 A 执行清单

#### 阶段 1：备份与确认（30分钟）

```bash
# 1. 创建归档目录
mkdir -p docs/archive/script-executor-legacy

# 2. 备份 executor.ts 及相关文件
cp packages/core-engine/src/engines/script-execution/executor.ts \
   docs/archive/script-executor-legacy/

# 3. 添加归档说明
echo "# ScriptExecutor Legacy Code Archive

**归档日期**: 2026-02-09
**原因**: 该文件从未投入生产使用，保留备份供未来参考

## 原始文件路径
- packages/core-engine/src/engines/script-execution/executor.ts

## 架构价值
该设计体现了 DDD 架构原则，可作为未来重构的参考蓝图。
" > docs/archive/script-executor-legacy/README.md

# 4. 检查是否有隐藏引用
grep -r "from.*executor.js" packages/ --include="*.ts"
grep -r "LegacyScriptExecutor" packages/ --include="*.ts"
```

#### 阶段 2：代码清理（30分钟）

**修改文件清单**：

1. **删除 executor.ts**

   ```bash
   rm packages/core-engine/src/engines/script-execution/executor.ts
   ```

2. **更新 index.ts 导出**

   ```typescript
   // packages/core-engine/src/engines/script-execution/index.ts
   /**
    * 脚本执行引擎
    */
   export * from './yaml-parser.js';
   export * from './script-executor.js';

   // 注：旧版 executor.ts 已归档至 docs/archive/script-executor-legacy/
   // 如需参考 DDD 架构设计，请查看归档文件
   ```

3. **更新文档说明**
   - `docs/DEVELOPMENT_GUIDE.md` - 删除对 executor.ts 的引用
   - `docs/design/story-1.4-async-verification.md` - 明确说明使用 script-executor.ts

#### 阶段 3：验证与测试（1小时）

```bash
# 1. 重新构建 core-engine
pnpm --filter @heartrule/core-engine build

# 2. 运行单元测试
pnpm --filter @heartrule/core-engine test

# 3. 运行集成测试
pnpm --filter @heartrule/api-server test

# 4. 启动本地服务验证
pnpm --filter @heartrule/api-server dev
# 手动测试：创建会话 → 发送消息 → 验证变量提取 → 验证监控反馈
```

#### 阶段 4：提交与记录（10分钟）

```bash
git add .
git commit -m "refactor: remove unused executor.ts and archive to docs/

BREAKING CHANGE: Removed LegacyScriptExecutor and LegacyExecutionState exports

- executor.ts has never been used in production
- Archived to docs/archive/script-executor-legacy/ for reference
- Updated index.ts exports to only include script-executor.ts
- No impact on existing functionality as executor.ts had zero usage

Ref: docs/design/script-executor-refactoring-plan.md"
```

---

### 3.2 策略 B 执行计划（可选）

#### Phase 1: LLM 依赖注入（1天）

**修改点**：

```typescript
// script-executor.ts
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;

  constructor(llmOrchestrator?: LLMOrchestrator) {
    // 依赖注入优先，保留默认创建逻辑（向后兼容）
    if (llmOrchestrator) {
      this.llmOrchestrator = llmOrchestrator;
    } else {
      // 默认创建逻辑（保持现有行为）
      const apiKey = process.env.VOLCENGINE_API_KEY || /* ... */;
      const provider = new VolcanoDeepSeekProvider(/* ... */);
      this.llmOrchestrator = new LLMOrchestrator(provider, 'volcano');
    }
  }
}
```

**测试验证**：

```typescript
// 新增单元测试
describe('ScriptExecutor with injected LLM', () => {
  it('should accept LLM orchestrator via constructor', () => {
    const mockOrchestrator = createMockLLMOrchestrator();
    const executor = new ScriptExecutor(mockOrchestrator);
    // 验证使用注入的实例
  });

  it('should create default LLM orchestrator when not provided', () => {
    const executor = new ScriptExecutor();
    // 验证默认创建逻辑
  });
});
```

#### Phase 2: Action 创建逻辑重构（1天）

**目标**：解耦 Action 创建逻辑，引入工厂模式

**当前问题**：

```typescript
// script-executor.ts L941-973
private createAction(actionConfig: any): BaseAction {
  const actionType = actionConfig.action_type;
  const actionId = actionConfig.action_id;

  // 硬编码：直接判断类型并创建实例
  if (actionType === 'ai_say') {
    return new AiSayAction(actionId, config, this.llmOrchestrator);
  }
  if (actionType === 'ai_ask') {
    return new AiAskAction(actionId, config, this.llmOrchestrator);
  }
  return createAction(actionType, actionId, config);
}
```

**重构方案**：

```typescript
// 新建: packages/core-engine/src/actions/action-factory.ts
export interface ActionFactory {
  create(actionType: string, actionId: string, config: any): BaseAction;
}

export class DefaultActionFactory implements ActionFactory {
  constructor(
    private llmOrchestrator?: LLMOrchestrator,
    private registry?: ActionRegistry
  ) {}

  create(actionType: string, actionId: string, config: any): BaseAction {
    // 优先使用注册表
    if (this.registry) {
      const ActionClass = this.registry.get(actionType);
      if (ActionClass) {
        return new ActionClass(actionId, config);
      }
    }

    // 回退到硬编码（向后兼容）
    switch (actionType) {
      case 'ai_say':
        if (!this.llmOrchestrator) {
          throw new Error('LLMOrchestrator required for ai_say');
        }
        return new AiSayAction(actionId, config, this.llmOrchestrator);
      case 'ai_ask':
        if (!this.llmOrchestrator) {
          throw new Error('LLMOrchestrator required for ai_ask');
        }
        return new AiAskAction(actionId, config, this.llmOrchestrator);
      default:
        return createAction(actionType, actionId, config);
    }
  }
}

// 修改 script-executor.ts
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;
  private actionFactory: ActionFactory; // 新增

  constructor(
    llmOrchestrator?: LLMOrchestrator,
    actionFactory?: ActionFactory // 新增参数
  ) {
    // LLM 初始化（Phase 1 已完成）
    this.llmOrchestrator = llmOrchestrator || this.createDefaultLLM();

    // Action工厂初始化
    this.actionFactory = actionFactory || new DefaultActionFactory(this.llmOrchestrator);
  }

  // 简化 createAction 方法
  private createAction(actionConfig: any): BaseAction {
    const actionType = actionConfig.action_type;
    const actionId = actionConfig.action_id;
    const { action_id, action_type, ...restConfig } = actionConfig;
    const config = actionConfig.config ? { ...restConfig, ...actionConfig.config } : restConfig;

    return this.actionFactory.create(actionType, actionId, config);
  }
}
```

**修改文件清单**：

1. 新建 `packages/core-engine/src/actions/action-factory.ts`
2. 修改 `packages/core-engine/src/engines/script-execution/script-executor.ts`
3. 导出工厂接口 `packages/core-engine/src/actions/index.ts`

**验收标准**：

- ✅ 所有现有测试通过（无功能退化）
- ✅ 可通过构造函数注入自定义 ActionFactory
- ✅ 默认行为与重构前完全一致
- ✅ 新增单元测试：自定义工厂测试

**测试用例**：

```typescript
// packages/core-engine/test/action-factory.test.ts
describe('ActionFactory', () => {
  it('应使用默认工厂创建ai_ask', () => {
    const mockLLM = createMockLLM();
    const factory = new DefaultActionFactory(mockLLM);
    const action = factory.create('ai_ask', 'test_ask', {});
    expect(action).toBeInstanceOf(AiAskAction);
  });

  it('应支持自定义工厂注入', () => {
    class CustomFactory implements ActionFactory {
      create(type: string, id: string, config: any) {
        return new MockAction(id, config);
      }
    }
    const executor = new ScriptExecutor(undefined, new CustomFactory());
    // 验证使用自定义工厂
  });

  it('应保持向后兼容性', async () => {
    const executor = new ScriptExecutor(); // 无参数
    // 执行完整会话流程，验证功能正常
  });
});
```

**工时估算**：

- 编写工厂代码：2h
- 修改 ScriptExecutor：1h
- 编写单元测试：2h
- 集成测试验证：2h
- 代码审查修改：1h

---

#### Phase 3: 监控逻辑分离（1天）

**目标**：将监控分析逻辑提取为独立服务，降低 ScriptExecutor 职责

**当前问题**：

```typescript
// script-executor.ts L1055-1144 (90行监控逻辑)
private async triggerMonitorAnalysis(
  actionType: string,
  actionId: string,
  result: ActionResult,
  executionState: ExecutionState,
  sessionId: string,
  phaseId: string,
  topicId: string
): Promise<void> {
  // 构建上下文、选择处理器、调用LLM、存储结果...
  // 职责过多，应独立为服务
}
```

**重构方案**：

```typescript
// 新建: packages/core-engine/src/services/monitor-service.ts
export interface MonitorService {
  analyze(
    actionType: string,
    actionResult: ActionResult,
    context: MonitorAnalysisContext
  ): Promise<MonitorAnalysisResult>;
}

export interface MonitorAnalysisContext {
  sessionId: string;
  actionId: string;
  phaseId: string;
  topicId: string;
  currentRound: number;
  maxRounds: number;
  metricsHistory: any[];
  sessionConfig?: any;
  projectId?: string;
  templateProvider?: any;
}

export interface MonitorAnalysisResult {
  intervention_needed: boolean;
  intervention_level?: string;
  feedbackPrompt?: string;
  shouldTriggerOrchestration: boolean;
}

export class DefaultMonitorService implements MonitorService {
  constructor(
    private llmOrchestrator: LLMOrchestrator,
    private projectId: string = '.',
    private templateProvider?: any
  ) {}

  async analyze(
    actionType: string,
    actionResult: ActionResult,
    context: MonitorAnalysisContext
  ): Promise<MonitorAnalysisResult> {
    // 选择监控处理器
    let handler: BaseMonitorHandler;
    if (actionType === 'ai_ask') {
      handler = new AiAskMonitorHandler(
        this.llmOrchestrator,
        context.projectId || this.projectId,
        context.templateProvider || this.templateProvider
      );
    } else if (actionType === 'ai_say') {
      handler = new AiSayMonitorHandler(
        this.llmOrchestrator,
        context.projectId || this.projectId,
        context.templateProvider || this.templateProvider
      );
    } else {
      throw new Error(`不支持的Action类型: ${actionType}`);
    }

    // 解析metrics
    const metrics = handler.parseMetrics(actionResult);

    // 构建监控上下文
    const monitorContext: MonitorContext = {
      sessionId: context.sessionId,
      actionId: context.actionId,
      actionType,
      currentRound: context.currentRound,
      maxRounds: context.maxRounds,
      actionResult,
      metricsHistory: context.metricsHistory,
      metadata: {
        sessionConfig: context.sessionConfig,
        templateProvider: context.templateProvider,
        projectId: context.projectId,
        phaseId: context.phaseId,
        topicId: context.topicId,
      },
    };

    // 调用监控LLM分析
    const analysis = await handler.analyzeWithLLM(metrics, monitorContext);

    // 生成反馈提示词
    let feedbackPrompt: string | undefined;
    if (analysis.intervention_needed) {
      feedbackPrompt = handler.buildFeedbackPrompt(analysis);
    }

    // 检查是否需要编排
    const shouldTriggerOrchestration = handler.shouldTriggerOrchestration(analysis);

    return {
      intervention_needed: analysis.intervention_needed,
      intervention_level: analysis.intervention_level,
      feedbackPrompt,
      shouldTriggerOrchestration,
    };
  }
}

// 修改 script-executor.ts
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;
  private actionFactory: ActionFactory;
  private monitorService: MonitorService; // 新增

  constructor(
    llmOrchestrator?: LLMOrchestrator,
    actionFactory?: ActionFactory,
    monitorService?: MonitorService // 新增参数
  ) {
    this.llmOrchestrator = llmOrchestrator || this.createDefaultLLM();
    this.actionFactory = actionFactory || new DefaultActionFactory(this.llmOrchestrator);
    this.monitorService = monitorService || new DefaultMonitorService(this.llmOrchestrator);
  }

  // 简化监控触发逻辑
  private async triggerMonitorAnalysis(
    actionType: string,
    actionId: string,
    result: ActionResult,
    executionState: ExecutionState,
    sessionId: string,
    phaseId: string,
    topicId: string
  ): Promise<void> {
    console.log('[ScriptExecutor] 🔍 触发监控分析');

    try {
      // 构建上下文
      const context: MonitorAnalysisContext = {
        sessionId,
        actionId,
        phaseId,
        topicId,
        currentRound: result.metadata?.currentRound || 1,
        maxRounds: result.metadata?.maxRounds || 3,
        metricsHistory: executionState.metadata.actionMetricsHistory || [],
        sessionConfig: executionState.metadata.sessionConfig,
        projectId: executionState.metadata.projectId,
        templateProvider: executionState.metadata.templateProvider,
      };

      // 调用服务
      const analysisResult = await this.monitorService.analyze(actionType, result, context);

      // 存储结果
      if (!executionState.metadata.monitorFeedback) {
        executionState.metadata.monitorFeedback = [];
      }
      executionState.metadata.monitorFeedback.push({
        actionId,
        actionType,
        timestamp: new Date().toISOString(),
        analysis: analysisResult,
      });

      // 存储反馈提示词
      if (analysisResult.feedbackPrompt) {
        executionState.metadata.latestMonitorFeedback = analysisResult.feedbackPrompt;
      }

      console.log('[ScriptExecutor] ✅ 监控分析完成:', analysisResult);
    } catch (error: any) {
      console.error('[ScriptExecutor] ❌ 监控分析失败:', error);
    }
  }
}
```

**修改文件清单**：

1. 新建 `packages/core-engine/src/services/monitor-service.ts`
2. 修改 `packages/core-engine/src/engines/script-execution/script-executor.ts`（简化90行→30行）
3. 导出服务接口 `packages/core-engine/src/services/index.ts`

**验收标准**：

- ✅ 监控分析功能完全保持（对比原功能）
- ✅ `triggerMonitorAnalysis` 代码减少 60% 以上
- ✅ 可通过构造函数注入自定义 MonitorService
- ✅ 所有监控相关测试通过
- ✅ 新增单元测试：Mock MonitorService

**测试用例**：

```typescript
// packages/core-engine/test/monitor-service.test.ts
describe('MonitorService', () => {
  it('应正确分析ai_ask监控指标', async () => {
    const service = new DefaultMonitorService(mockLLM, 'test-project');
    const result = await service.analyze('ai_ask', mockActionResult, mockContext);
    expect(result.intervention_needed).toBeDefined();
  });

  it('应支持自定义监控服务注入', () => {
    class CustomMonitor implements MonitorService {
      async analyze() {
        return { intervention_needed: false, shouldTriggerOrchestration: false };
      }
    }
    const executor = new ScriptExecutor(undefined, undefined, new CustomMonitor());
    // 验证使用自定义服务
  });

  it('监控失败不应阻塞主流程', async () => {
    const failingService = new MockFailingMonitorService();
    const executor = new ScriptExecutor(undefined, undefined, failingService);
    // 执行会话，验证继续运行
  });
});
```

**工时估算**：

- 提取服务代码：3h
- 修改 ScriptExecutor：1h
- 编写单元测试：2h
- 集成测试验证：1h
- 代码审查修改：1h

---

#### Phase 4: ExecutionState 结构简化（1天）

**目标**：拆分臃肿的 ExecutionState，分离关注点

**当前问题**：

```typescript
// script-executor.ts L62-86 (25个字段)
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;
  variableStore?: VariableStore;
  conversationHistory: Array<{...}>;
  metadata: Record<string, any>; // 内部存储了10+种数据
  lastAiMessage: string | null;
  currentPhaseId?: string;
  currentTopicId?: string;
  currentActionId?: string;
  currentActionType?: string;
  lastLLMDebugInfo?: LLMDebugInfo;
  // 职责混乱：位置、状态、缓存、调试信息全部混在一起
}
```

**重构方案**：

```typescript
// 新建: packages/core-engine/src/engines/script-execution/execution-context.ts

/**
 * 执行位置 - 纯粹的位置标记
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
  phaseId?: string;
  topicId?: string;
  actionId?: string;
  actionType?: string;
}

/**
 * 执行运行时 - 临时运行状态
 */
export interface ExecutionRuntime {
  currentAction: BaseAction | null;
  lastAiMessage: string | null;
  lastLLMDebugInfo?: LLMDebugInfo;
}

/**
 * 执行上下文 - 重构后的统一结构
 */
export interface ExecutionContext {
  // 状态
  status: ExecutionStatus;

  // 位置（分离）
  position: ExecutionPosition;

  // 运行时（分离）
  runtime: ExecutionRuntime;

  // 数据存储
  variableStore: VariableStore;
  conversationHistory: Array<ConversationMessage>;

  // 元数据（结构化）
  metadata: ExecutionMetadata;
}

/**
 * 执行元数据 - 结构化存储
 */
export interface ExecutionMetadata {
  // Session 配置
  sessionConfig?: {
    template_scheme?: string;
  };

  // 项目信息
  projectId?: string;
  templateProvider?: any;

  // Action 状态
  actionState?: SerializedActionState;
  lastActionRoundInfo?: ActionRoundInfo;

  // 监控相关
  actionMetricsHistory?: ActionMetricsHistoryEntry[];
  monitorFeedback?: MonitorFeedbackEntry[];
  latestMonitorFeedback?: string;

  // 退出决策历史
  exitHistory?: ExitDecisionEntry[];

  // 错误信息
  error?: string;
}

/**
 * 迁移适配器 - 向后兼容
 */
export class ExecutionStateAdapter {
  /**
   * 从旧格式转换为新格式
   */
  static fromLegacy(oldState: LegacyExecutionState): ExecutionContext {
    return {
      status: oldState.status,
      position: {
        phaseIndex: oldState.currentPhaseIdx,
        topicIndex: oldState.currentTopicIdx,
        actionIndex: oldState.currentActionIdx,
        phaseId: oldState.currentPhaseId,
        topicId: oldState.currentTopicId,
        actionId: oldState.currentActionId,
        actionType: oldState.currentActionType,
      },
      runtime: {
        currentAction: oldState.currentAction,
        lastAiMessage: oldState.lastAiMessage,
        lastLLMDebugInfo: oldState.lastLLMDebugInfo,
      },
      variableStore: oldState.variableStore || {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: oldState.conversationHistory,
      metadata: this.extractMetadata(oldState.metadata),
    };
  }

  /**
   * 转换回旧格式（向后兼容）
   */
  static toLegacy(newContext: ExecutionContext): LegacyExecutionState {
    return {
      status: newContext.status,
      currentPhaseIdx: newContext.position.phaseIndex,
      currentTopicIdx: newContext.position.topicIndex,
      currentActionIdx: newContext.position.actionIndex,
      currentPhaseId: newContext.position.phaseId,
      currentTopicId: newContext.position.topicId,
      currentActionId: newContext.position.actionId,
      currentActionType: newContext.position.actionType,
      currentAction: newContext.runtime.currentAction,
      lastAiMessage: newContext.runtime.lastAiMessage,
      lastLLMDebugInfo: newContext.runtime.lastLLMDebugInfo,
      variables: this.flattenVariables(newContext.variableStore),
      variableStore: newContext.variableStore,
      conversationHistory: newContext.conversationHistory,
      metadata: this.flattenMetadata(newContext.metadata),
    };
  }
}

// 修改 script-executor.ts
export class ScriptExecutor {
  // ...

  async executeSession(
    scriptContent: string,
    sessionId: string,
    executionState: ExecutionState | ExecutionContext, // 兼容两种格式
    userInput?: string | null,
    projectId?: string,
    templateProvider?: TemplateProvider
  ): Promise<ExecutionState> {
    // 内部统一使用新格式
    let context: ExecutionContext;
    if (this.isLegacyState(executionState)) {
      context = ExecutionStateAdapter.fromLegacy(executionState);
    } else {
      context = executionState as ExecutionContext;
    }

    // 执行逻辑使用新格式...
    // 访问位置：context.position.phaseIndex
    // 访问运行时：context.runtime.currentAction
    // 访问元数据：context.metadata.sessionConfig

    // 返回时转换回旧格式（向后兼容）
    return ExecutionStateAdapter.toLegacy(context);
  }

  /**
   * 创建初始执行上下文（新格式）
   */
  static createInitialContext(): ExecutionContext {
    return {
      status: ExecutionStatus.RUNNING,
      position: {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
      },
      runtime: {
        currentAction: null,
        lastAiMessage: null,
      },
      variableStore: {
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
    };
  }

  // 保持旧接口向后兼容
  static createInitialState(): ExecutionState {
    return ExecutionStateAdapter.toLegacy(this.createInitialContext());
  }
}
```

**修改文件清单**：

1. 新建 `packages/core-engine/src/engines/script-execution/execution-context.ts`
2. 修改 `packages/core-engine/src/engines/script-execution/script-executor.ts`
3. 保留 `ExecutionState` 类型别名（向后兼容）
4. 更新所有内部访问代码（`state.currentPhaseIdx` → `context.position.phaseIndex`）

**验收标准**：

- ✅ 所有现有 API 接口保持不变（外部兼容）
- ✅ 内部代码可读性提升（清晰的关注点分离）
- ✅ 所有测试通过（零功能退化）
- ✅ 新增结构验证测试
- ✅ 文档更新反映新结构

**测试用例**：

```typescript
// packages/core-engine/test/execution-context.test.ts
describe('ExecutionContext', () => {
  it('应正确从旧格式迁移到新格式', () => {
    const legacy = createLegacyState();
    const context = ExecutionStateAdapter.fromLegacy(legacy);
    expect(context.position.phaseIndex).toBe(legacy.currentPhaseIdx);
    expect(context.runtime.currentAction).toBe(legacy.currentAction);
  });

  it('应正确转换回旧格式', () => {
    const context = createExecutionContext();
    const legacy = ExecutionStateAdapter.toLegacy(context);
    expect(legacy.currentPhaseIdx).toBe(context.position.phaseIndex);
  });

  it('往返转换应保持数据一致', () => {
    const original = createLegacyState();
    const context = ExecutionStateAdapter.fromLegacy(original);
    const restored = ExecutionStateAdapter.toLegacy(context);
    expect(restored).toEqual(original);
  });

  it('新API应与旧API完全兼容', async () => {
    const executor = new ScriptExecutor();
    // 使用旧格式调用
    const legacyState = ScriptExecutor.createInitialState();
    const result1 = await executor.executeSession(script, id, legacyState);
    // 使用新格式调用
    const newContext = ScriptExecutor.createInitialContext();
    const result2 = await executor.executeSession(script, id, newContext);
    // 两者行为应完全一致
  });
});
```

**渐进式迁移策略**：

1. **Week 1**: 引入新结构，内部使用适配器
2. **Week 2**: 逐步迁移内部代码使用新格式
3. **Week 3**: 标记旧格式为 `@deprecated`
4. **Week 4**: 完全移除适配器（breaking change）

**工时估算**：

- 设计新结构：2h
- 实现适配器：2h
- 修改 ScriptExecutor：2h
- 编写测试用例：1h
- 全量回归测试：1h

---

## 4. 风险评估与应对措施

### 4.1 策略 A 风险矩阵

| 风险项                   | 可能性   | 影响 | 应对措施                            |
| ------------------------ | -------- | ---- | ----------------------------------- |
| executor.ts 有隐藏引用   | 低 (5%)  | 中   | 执行前全局搜索确认，保留归档备份    |
| 文档引用未更新           | 中 (30%) | 低   | 使用 grep 搜索所有 .md 文件检查引用 |
| 未来需要恢复 executor.ts | 低 (10%) | 低   | 归档保留完整代码，可随时恢复        |

**综合风险评级**：🟢 **低风险**

### 4.2 策略 B 风险矩阵与控制措施

| 风险项                  | 可能性   | 影响 | 风险等级 | 应对措施              | 检测方法         | 回滚方案       |
| ----------------------- | -------- | ---- | -------- | --------------------- | ---------------- | -------------- |
| **Phase 1: LLM注入**    |
| 默认创建逻辑失效        | 低 (10%) | 高   | 🟡 中    | 添加回退逻辑+完整测试 | 启动测试+API调用 | 回滚commit     |
| 环境变量读取问题        | 中 (20%) | 中   | 🟡 中    | 多环境测试验证        | 各环境部署测试   | 保持原逻辑     |
| 依赖注入接口设计缺陷    | 低 (15%) | 高   | 🟡 中    | 架构评审+原型验证     | 单元测试覆盖     | 重新设计接口   |
| **Phase 2: Action工厂** |
| 工厂创建Action失败      | 中 (25%) | 高   | 🟠 中高  | 完整的异常处理+日志   | 集成测试验证     | 回滚到Phase 1  |
| 配置传递丢失            | 中 (30%) | 中   | 🟡 中    | 配置对比测试          | 变量提取测试     | 修复配置传递   |
| 注册表兼容性问题        | 低 (10%) | 中   | 🟢 低    | 双路径验证            | 多类型Action测试 | 保留硬编码路径 |
| **Phase 3: 监控分离**   |
| 监控分析数据丢失        | 中 (20%) | 高   | 🟡 中    | 数据完整性校验        | 对比原逻辑输出   | 恢复嵌入式逻辑 |
| 异步调用时序问题        | 低 (15%) | 中   | 🟡 中    | 严格测试异步流程      | 并发测试         | 改为同步调用   |
| 服务接口设计不合理      | 中 (25%) | 中   | 🟡 中    | 提前原型验证          | API设计评审      | 调整接口设计   |
| **Phase 4: 状态简化**   |
| 适配器转换错误          | 高 (40%) | 高   | 🔴 高    | 双向转换测试+数据校验 | 往返转换测试     | 暂停重构       |
| 字段访问路径错误        | 高 (50%) | 中   | 🟠 中高  | 静态类型检查+重构工具 | 编译时检查       | 批量修正       |
| 性能下降                | 低 (10%) | 中   | 🟢 低    | 性能基准测试          | 压力测试         | 优化适配器     |
| **跨阶段风险**          |
| 阶段间接口不匹配        | 中 (30%) | 高   | 🟡 中    | 阶段间集成测试        | E2E测试          | 回滚到上阶段   |
| 累积技术债务            | 中 (35%) | 中   | 🟡 中    | 每阶段code review     | 代码质量检查     | 重构清理       |
| 测试覆盖不足            | 高 (60%) | 高   | 🔴 高    | 强制80%覆盖率         | Coverage报告     | 补充测试用例   |
| 文档同步延迟            | 高 (70%) | 低   | 🟡 中    | 即时更新文档          | 文档审查         | 集中更新       |

**综合风险评级**：🟡 **中等风险**

#### 风险控制关键点

**1. 每阶段强制检查点**

```bash
# Phase 完成检查清单
[ ] 所有单元测试通过（覆盖率 > 80%）
[ ] 集成测试通过（无回归）
[ ] 性能测试通过（无显著下降）
[ ] 代码审查通过（至少2人review）
[ ] 文档更新完成
[ ] Git tag标记里程碑
```

**2. 回滚触发条件**

- ❌ 核心功能测试失败 → **立即回滚**
- ❌ 性能下降超过15% → **立即回滚**
- ❌ 生产环境异常 → **立即回滚**
- ⚠️ 测试覆盖率低于70% → **暂停推进**
- ⚠️ 代码审查发现严重问题 → **修复后继续**

**3. 分支策略**

```
main (protected)
  ↓
feature/ddd-refactor (protected)
  ↓
  ├── feature/phase1-llm-injection
  ├── feature/phase2-action-factory
  ├── feature/phase3-monitor-service
  └── feature/phase4-state-simplification
```

每个Phase完成后合并到 `feature/ddd-refactor`，通过完整回归测试后再考虑合并到 `main`。

**4. 金丝雀发布策略**

```
Phase 1 完成 → 内部测试环境（1天）
           → 预发布环境（2天）
           → 10%生产流量（1天）
           → 100%生产流量
```

#### 详细回滚方案

**场景1：Phase N 开发中发现问题**

```bash
# 回滚到Phase N开始前的状态
git checkout feature/ddd-refactor
git reset --hard tags/phase-n-start
# 重新分析问题，调整方案
```

**场景2：Phase N 合并后发现问题**

```bash
# 回滚整个Phase N的提交
git revert <phase-n-merge-commit>
# 或使用备份分支
git checkout feature/ddd-refactor-backup-phase-n
git push --force
```

**场景3：生产环境紧急回滚**

```bash
# 使用预先准备的回滚脚本
./scripts/rollback-to-stable.sh
# 或直接回退到上个稳定版本
git checkout tags/v1.4.0-stable
./scripts/deploy.sh
```

---

## 5. 测试计划

### 5.1 策略 A 测试清单

#### 单元测试

- ✅ `pnpm --filter @heartrule/core-engine test` 全部通过
- ✅ 无新增测试用例（无代码功能变更）

#### 集成测试

- ✅ api-server 启动正常
- ✅ 创建会话 API 正常
- ✅ 发送消息 API 正常
- ✅ 变量提取功能正常
- ✅ 监控反馈功能正常

#### 文档测试

- ✅ `DEVELOPMENT_GUIDE.md` 无 404 链接
- ✅ `story-1.4-async-verification.md` 引用正确
- ✅ 归档 README 清晰易懂

### 5.2 策略 B 完整测试计划

#### 5.2.1 Phase 1 测试计划（LLM依赖注入）

**单元测试用例**

```typescript
// packages/core-engine/test/script-executor-llm-injection.test.ts
describe('ScriptExecutor LLM Dependency Injection', () => {
  describe('构造函数注入', () => {
    it('应接受LLM orchestrator通过构造函数注入', () => {
      const mockLLM = createMockLLMOrchestrator();
      const executor = new ScriptExecutor(mockLLM);
      // 验证使用注入的实例
      expect(executor['llmOrchestrator']).toBe(mockLLM);
    });

    it('应在未提供LLM时创建默认orchestrator', () => {
      const executor = new ScriptExecutor();
      expect(executor['llmOrchestrator']).toBeDefined();
      expect(executor['llmOrchestrator'].provider).toBeDefined();
    });

    it('应正确读取环境变量配置', () => {
      process.env.VOLCENGINE_API_KEY = 'test-key';
      process.env.VOLCENGINE_MODEL = 'test-model';
      const executor = new ScriptExecutor();
      // 验证配置正确传递
    });
  });

  describe('Action创建集成', () => {
    it('ai_say应使用注入的LLM', async () => {
      const mockLLM = createMockLLMOrchestrator();
      const executor = new ScriptExecutor(mockLLM);
      // 执行包含ai_say的脚本
      // 验证mockLLM被调用
    });

    it('ai_ask应使用注入的LLM', async () => {
      const mockLLM = createMockLLMOrchestrator();
      const executor = new ScriptExecutor(mockLLM);
      // 执行包含ai_ask的脚本
      // 验证mockLLM被调用
    });
  });

  describe('向后兼容性', () => {
    it('应保持与原有代码完全一致的行为', async () => {
      const executor = new ScriptExecutor();
      const state = ScriptExecutor.createInitialState();
      // 执行完整会话流程，验证功能正常
    });
  });
});
```

**集成测试用例**

- ✅ 完整CBT评估流程（使用默认LLM）
- ✅ 完整CBT评估流程（使用Mock LLM）
- ✅ 多轮对话测试
- ✅ 变量提取验证
- ✅ 监控反馈验证

**验收标准**

- ✅ 单元测试覆盖率 > 85%
- ✅ 所有集成测试通过
- ✅ 无功能回归
- ✅ 性能无明显下降（< 5%）

---

#### 5.2.2 Phase 2 测试计划（Action工厂重构）

**单元测试用例**

```typescript
// packages/core-engine/test/action-factory.test.ts
describe('ActionFactory', () => {
  describe('DefaultActionFactory', () => {
    it('应正确创建ai_say action', () => {
      const factory = new DefaultActionFactory(mockLLM);
      const action = factory.create('ai_say', 'test_id', mockConfig);
      expect(action).toBeInstanceOf(AiSayAction);
      expect(action.actionId).toBe('test_id');
    });

    it('应正确创建ai_ask action', () => {
      const factory = new DefaultActionFactory(mockLLM);
      const action = factory.create('ai_ask', 'test_id', mockConfig);
      expect(action).toBeInstanceOf(AiAskAction);
    });

    it('应通过注册表创建其他类型action', () => {
      const registry = new ActionRegistry();
      registry.register('custom_action', CustomAction);
      const factory = new DefaultActionFactory(mockLLM, registry);
      const action = factory.create('custom_action', 'test_id', {});
      expect(action).toBeInstanceOf(CustomAction);
    });

    it('应正确传递配置到action', () => {
      const factory = new DefaultActionFactory(mockLLM);
      const config = { max_rounds: 5, template: 'test.md' };
      const action = factory.create('ai_say', 'test_id', config);
      expect(action['config'].max_rounds).toBe(5);
    });

    it('配置合并应正确处理嵌套config字段', () => {
      const factory = new DefaultActionFactory(mockLLM);
      const actionConfig = {
        action_id: 'test',
        action_type: 'ai_say',
        max_rounds: 3,
        config: { template: 'test.md' },
      };
      // 验证max_rounds和template都被正确传递
    });
  });

  describe('自定义工厂注入', () => {
    it('ScriptExecutor应支持自定义工厂注入', () => {
      class CustomFactory implements ActionFactory {
        create() {
          return new MockAction('test', {});
        }
      }
      const executor = new ScriptExecutor(undefined, new CustomFactory());
      // 验证使用自定义工厂
    });
  });
});
```

**集成测试用例**

- ✅ 各类型Action创建测试
- ✅ 配置传递完整性测试
- ✅ 注册表兼容性测试
- ✅ 完整会话流程测试

**验收标准**

- ✅ 单元测试覆盖率 > 80%
- ✅ 所有Action类型创建成功
- ✅ 配置传递无丢失
- ✅ 向后兼容无问题

---

#### 5.2.3 Phase 3 测试计划（监控逻辑分离）

**单元测试用例**

```typescript
// packages/core-engine/test/monitor-service.test.ts
describe('MonitorService', () => {
  describe('DefaultMonitorService', () => {
    it('应正确分析ai_ask监控指标', async () => {
      const service = new DefaultMonitorService(mockLLM, 'test-project');
      const context = createMockContext();
      const result = await service.analyze('ai_ask', mockResult, context);
      expect(result.intervention_needed).toBeDefined();
      expect(result.feedbackPrompt).toBeDefined();
    });

    it('应正确分析ai_say监控指标', async () => {
      const service = new DefaultMonitorService(mockLLM, 'test-project');
      const result = await service.analyze('ai_say', mockResult, mockContext);
      expect(result).toHaveProperty('intervention_needed');
    });

    it('分析结果应与原逻辑完全一致', async () => {
      // 对比原嵌入式逻辑和新服务的输出
      const legacyResult = await executeLegacyMonitor();
      const serviceResult = await service.analyze(...);
      expect(serviceResult).toEqual(legacyResult);
    });

    it('应正确处理监控失败场景', async () => {
      const failingService = new MockFailingMonitorService();
      // 验证失败不影响主流程
    });
  });

  describe('自定义监控服务', () => {
    it('ScriptExecutor应支持自定义监控服务注入', () => {
      class CustomMonitor implements MonitorService {
        async analyze() {
          return { intervention_needed: false, shouldTriggerOrchestration: false };
        }
      }
      const executor = new ScriptExecutor(undefined, undefined, new CustomMonitor());
      // 验证使用自定义服务
    });
  });
});
```

**集成测试用例**

- ✅ 监控分析数据完整性测试
- ✅ 监控反馈拼接测试
- ✅ 异步调用时序测试
- ✅ 监控失败容错测试
- ✅ 完整会话+监控流程测试

**对比验证测试**

```typescript
describe('监控逻辑重构对比验证', () => {
  it('重构前后输出应完全一致', async () => {
    // 使用相同输入
    const legacyExecutor = createLegacyExecutor();
    const refactoredExecutor = new ScriptExecutor();

    const legacyState = await legacyExecutor.executeSession(...);
    const refactoredState = await refactoredExecutor.executeSession(...);

    // 对比monitorFeedback
    expect(refactoredState.metadata.monitorFeedback)
      .toEqual(legacyState.metadata.monitorFeedback);
  });
});
```

**验收标准**

- ✅ 监控输出与原逻辑100%一致
- ✅ triggerMonitorAnalysis代码减少60%+
- ✅ 单元测试覆盖率 > 80%
- ✅ 异步调用不阻塞主流程

---

#### 5.2.4 Phase 4 测试计划（状态结构简化）

**单元测试用例**

```typescript
// packages/core-engine/test/execution-context.test.ts
describe('ExecutionContext', () => {
  describe('ExecutionStateAdapter', () => {
    it('应正确从旧格式转换到新格式', () => {
      const legacy = createLegacyState();
      const context = ExecutionStateAdapter.fromLegacy(legacy);

      expect(context.position.phaseIndex).toBe(legacy.currentPhaseIdx);
      expect(context.position.topicIndex).toBe(legacy.currentTopicIdx);
      expect(context.runtime.currentAction).toBe(legacy.currentAction);
      expect(context.metadata.sessionConfig).toEqual(legacy.metadata.sessionConfig);
    });

    it('应正确从新格式转换到旧格式', () => {
      const context = createExecutionContext();
      const legacy = ExecutionStateAdapter.toLegacy(context);

      expect(legacy.currentPhaseIdx).toBe(context.position.phaseIndex);
      expect(legacy.variables).toBeDefined();
    });

    it('往返转换应保持数据完全一致', () => {
      const original = createLegacyState();
      const context = ExecutionStateAdapter.fromLegacy(original);
      const restored = ExecutionStateAdapter.toLegacy(context);

      // 深度对比所有字段
      expect(restored.currentPhaseIdx).toBe(original.currentPhaseIdx);
      expect(restored.metadata.actionMetricsHistory).toEqual(
        original.metadata.actionMetricsHistory
      );
    });

    it('应正确处理可选字段', () => {
      const legacy = { ...createLegacyState(), currentActionId: undefined };
      const context = ExecutionStateAdapter.fromLegacy(legacy);
      expect(context.position.actionId).toBeUndefined();
    });
  });

  describe('新结构访问', () => {
    it('位置访问应更清晰', () => {
      const context = createExecutionContext();
      // 旧方式：state.currentPhaseIdx
      // 新方式：context.position.phaseIndex
      expect(context.position.phaseIndex).toBe(0);
    });

    it('元数据访问应结构化', () => {
      const context = createExecutionContext();
      // 旧方式：state.metadata.sessionConfig
      // 新方式：context.metadata.sessionConfig
      expect(context.metadata.sessionConfig).toBeDefined();
    });
  });

  describe('API兼容性', () => {
    it('旧API应完全兼容', async () => {
      const executor = new ScriptExecutor();
      const legacyState = ScriptExecutor.createInitialState();
      const result = await executor.executeSession(script, id, legacyState);
      expect(result.currentPhaseIdx).toBeDefined();
    });

    it('新API应可用', async () => {
      const executor = new ScriptExecutor();
      const newContext = ScriptExecutor.createInitialContext();
      const result = await executor.executeSession(script, id, newContext);
      // 验证返回旧格式（向后兼容）
      expect(result.currentPhaseIdx).toBeDefined();
    });

    it('新旧API行为应完全一致', async () => {
      const executor = new ScriptExecutor();
      const legacyResult = await executor.executeSession(
        script,
        id,
        ScriptExecutor.createInitialState()
      );
      const newResult = await executor.executeSession(
        script,
        id,
        ScriptExecutor.createInitialContext()
      );
      // 对比所有关键字段
      expect(newResult.status).toBe(legacyResult.status);
      expect(newResult.conversationHistory.length).toBe(legacyResult.conversationHistory.length);
    });
  });
});
```

**集成测试用例**

- ✅ 完整会话流程（使用新格式）
- ✅ 完整会话流程（使用旧格式）
- ✅ 状态序列化/反序列化测试
- ✅ 断点续跑测试
- ✅ 所有内部访问路径测试

**性能测试**

```typescript
describe('性能对比测试', () => {
  it('适配器转换开销应小于5ms', () => {
    const legacy = createLegacyState();
    const start = performance.now();
    const context = ExecutionStateAdapter.fromLegacy(legacy);
    const end = performance.now();
    expect(end - start).toBeLessThan(5);
  });

  it('完整会话性能应无明显下降', async () => {
    const executor = new ScriptExecutor();
    const iterations = 100;

    // 测试旧格式
    const legacyStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await executor.executeSession(...);
    }
    const legacyTime = performance.now() - legacyStart;

    // 测试新格式（实际使用适配器）
    const newStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await executor.executeSession(...);
    }
    const newTime = performance.now() - newStart;

    // 性能差异应小于10%
    expect(newTime / legacyTime).toBeLessThan(1.1);
  });
});
```

**验收标准**

- ✅ 往返转换数据100%一致
- ✅ 所有外部API保持兼容
- ✅ 单元测试覆盖率 > 85%
- ✅ 性能下降 < 10%
- ✅ 内部代码可读性提升（主观评审）

---

#### 5.2.5 跨阶段集成测试

**Phase 1+2 联合测试**

```typescript
describe('Phase 1+2 Integration', () => {
  it('注入的LLM应正确传递给工厂创建的Action', async () => {
    const mockLLM = createMockLLMOrchestrator();
    const factory = new DefaultActionFactory(mockLLM);
    const executor = new ScriptExecutor(mockLLM, factory);
    // 执行包含ai_say和ai_ask的脚本
    // 验证mockLLM被调用
  });
});
```

**Phase 1+2+3 联合测试**

```typescript
describe('Phase 1+2+3 Integration', () => {
  it('监控服务应使用注入的LLM', async () => {
    const mockLLM = createMockLLMOrchestrator();
    const monitorService = new DefaultMonitorService(mockLLM);
    const executor = new ScriptExecutor(mockLLM, undefined, monitorService);
    // 执行会话，验证监控功能正常
  });
});
```

**全阶段E2E测试**

```typescript
describe('Complete Refactor E2E', () => {
  it('完整重构后应保持所有功能正常', async () => {
    // 使用所有新接口
    const mockLLM = createMockLLMOrchestrator();
    const factory = new DefaultActionFactory(mockLLM);
    const monitor = new DefaultMonitorService(mockLLM);
    const executor = new ScriptExecutor(mockLLM, factory, monitor);

    // 执行完整CBT评估流程
    const context = ScriptExecutor.createInitialContext();
    let state = await executor.executeSession(script, sessionId, context);

    // 多轮对话
    for (let i = 0; i < 5; i++) {
      state = await executor.executeSession(script, sessionId, state, userInput);
    }

    // 验证所有核心功能
    expect(state.status).toBe(ExecutionStatus.COMPLETED);
    expect(state.conversationHistory.length).toBeGreaterThan(0);
    expect(Object.keys(state.variableStore.session).length).toBeGreaterThan(0);
    expect(state.metadata.actionMetricsHistory).toBeDefined();
    expect(state.metadata.monitorFeedback).toBeDefined();
  });
});
```

---

#### 5.2.6 回归测试清单

**核心功能回归**

- ✅ 会话初始化
- ✅ ai_say 单轮对话
- ✅ ai_say 多轮对话
- ✅ ai_ask 变量提取
- ✅ ai_ask 多轮追问
- ✅ 变量作用域管理
- ✅ Action状态序列化
- ✅ 断点续跑
- ✅ 监控分析触发
- ✅ 监控反馈拼接
- ✅ 退出决策判断
- ✅ 错误处理

**边界场景测试**

- ✅ 空脚本
- ✅ 单Action脚本
- ✅ 复杂嵌套脚本
- ✅ LLM超时
- ✅ 变量提取失败
- ✅ 监控分析失败
- ✅ 网络异常

**性能回归测试**

- ✅ 100次会话执行时间
- ✅ 内存占用
- ✅ 并发性能

---

#### 5.2.7 测试覆盖率目标

**最低要求**

- 整体覆盖率：≥ 80%
- 语句覆盖率：≥ 85%
- 分支覆盖率：≥ 75%
- 函数覆盖率：≥ 90%

**核心模块要求**

- ScriptExecutor：≥ 90%
- ActionFactory：≥ 85%
- MonitorService：≥ 85%
- ExecutionStateAdapter：≥ 95%

---

## 6. 时间安排与里程碑

### 6.1 策略 A 时间表

| 阶段 | 任务       | 工时 | 负责人 | 截止日期   |
| ---- | ---------- | ---- | ------ | ---------- |
| 1    | 备份与确认 | 0.5h | 待定   | Day 1 上午 |
| 2    | 代码清理   | 0.5h | 待定   | Day 1 上午 |
| 3    | 验证与测试 | 1h   | 待定   | Day 1 下午 |
| 4    | 提交与记录 | 0.2h | 待定   | Day 1 下午 |

**总计**：2.2 小时，可在 1 个工作日内完成

### 6.2 策略 B 详细时间表

#### 第一周：Phase 1 + Phase 2

| 日期  | 时段 | 任务                       | 工时 | 负责人     | 输出物       |
| ----- | ---- | -------------------------- | ---- | ---------- | ------------ |
| Day 1 | 上午 | Phase 1: 设计依赖注入接口  | 2h   | 架构师     | 接口定义文档 |
| Day 1 | 下午 | Phase 1: 实现构造函数注入  | 2h   | 开发者A    | 代码实现     |
| Day 1 | 晚上 | Phase 1: 编写单元测试      | 2h   | 测试工程师 | 测试用例     |
| Day 2 | 上午 | Phase 1: 集成测试+修复     | 2h   | 开发者A    | 测试报告     |
| Day 2 | 下午 | Phase 1: 代码审查+提交     | 1h   | 团队       | Git commit   |
| Day 2 | 下午 | Phase 2: 设计ActionFactory | 2h   | 架构师     | 接口定义     |
| Day 3 | 上午 | Phase 2: 实现工厂类        | 2h   | 开发者B    | 工厂实现     |
| Day 3 | 下午 | Phase 2: 集成到Executor    | 1h   | 开发者B    | 集成代码     |
| Day 3 | 下午 | Phase 2: 编写单元测试      | 2h   | 测试工程师 | 测试用例     |
| Day 4 | 上午 | Phase 2: 集成测试验证      | 2h   | 开发者B    | 测试报告     |
| Day 4 | 下午 | Phase 2: 代码审查+提交     | 1h   | 团队       | Git commit   |
| Day 4 | 下午 | Week 1总结会议             | 1h   | 全员       | 周报         |
| Day 5 | -    | 缓冲时间/问题修复          | 4h   | 全员       | -            |

**Week 1 总计**: 24小时（3工作日）

#### 第二周：Phase 3 + Phase 4

| 日期   | 时段 | 任务                          | 工时 | 负责人     | 输出物     |
| ------ | ---- | ----------------------------- | ---- | ---------- | ---------- |
| Day 6  | 上午 | Phase 3: 设计MonitorService   | 2h   | 架构师     | 接口定义   |
| Day 6  | 下午 | Phase 3: 提取监控逻辑         | 3h   | 开发者A    | 服务实现   |
| Day 7  | 上午 | Phase 3: 集成到Executor       | 1h   | 开发者A    | 集成代码   |
| Day 7  | 下午 | Phase 3: 编写单元测试         | 2h   | 测试工程师 | 测试用例   |
| Day 8  | 上午 | Phase 3: 集成测试验证         | 1h   | 开发者A    | 测试报告   |
| Day 8  | 下午 | Phase 3: 代码审查+提交        | 1h   | 团队       | Git commit |
| Day 8  | 下午 | Phase 4: 设计ExecutionContext | 2h   | 架构师     | 结构定义   |
| Day 9  | 上午 | Phase 4: 实现适配器           | 2h   | 开发者B    | 适配器代码 |
| Day 9  | 下午 | Phase 4: 重构内部访问         | 2h   | 开发者B    | 重构代码   |
| Day 10 | 上午 | Phase 4: 编写测试用例         | 1h   | 测试工程师 | 测试用例   |
| Day 10 | 上午 | Phase 4: 全量回归测试         | 1h   | 测试工程师 | 测试报告   |
| Day 10 | 下午 | Phase 4: 性能基准测试         | 2h   | 性能专家   | 性能报告   |
| Day 10 | 下午 | 代码审查+提交                 | 1h   | 团队       | Git commit |
| Day 10 | 晚上 | Week 2总结+文档更新           | 2h   | 全员       | 完成报告   |

**Week 2 总计**: 23小时（5工作日）

#### 总时间安排

**总工时**: 47小时  
**总工作日**: 10天（2周）  
**人员配置**:

- 架构师：8小时（方案设计）
- 开发者A：16小时（Phase 1 + Phase 3）
- 开发者B：16小时（Phase 2 + Phase 4）
- 测试工程师：10小时（测试编写+验证）
- 性能专家：2小时（性能验证）
- 代码审查：4小时（全员参与）

**关键里程碑**:

- ✅ Week 1 Day 2: Phase 1 完成
- ✅ Week 1 Day 4: Phase 2 完成
- ✅ Week 2 Day 8: Phase 3 完成
- ✅ Week 2 Day 10: Phase 4 完成
- ✅ Week 2 Day 10: 策略B全部完成

---

## 7. 决策建议与执行保障

### 7.1 立即执行（推荐）：策略 A

**适用场景**：

- ✅ 当前生产系统稳定，无架构升级计划
- ✅ 团队资源紧张，无法投入重构时间
- ✅ 希望快速消除技术债务

**执行流程**：

1. 获得团队/负责人批准
2. 按照 3.1 节步骤执行（2小时）
3. 代码审查 + 提交
4. 更新本文档状态为"已完成"

### 7.2 长期规划（本方案推荐）：策略 B

**适用场景**：

- ✅ 计划进行架构升级
- ✅ 团队有充足时间投入重构
- ✅ 需要改善代码可测试性
- ✅ 为未来功能扩展打好基础

**前置条件**：

1. ~~完成策略 A（清理 executor.ts）~~ 可选
2. 补充现有测试覆盖率至 75%+
3. 建立性能基准测试
4. 组建专项重构小组（3-4人）

**执行时机**：

- 建议在 Story 1.5 之后执行（避免功能开发冲突）
- 预留 2 周完整时间窗口
- 避免在版本发布前 1 周执行

---

### 7.3 策略B执行保障措施

#### 7.3.1 组织保障

**团队组建**

```
项目经理（1人）
  ├── 架构师（1人，兼任技术评审）
  ├── 核心开发者A（1人，Phase 1+3）
  ├── 核心开发者B（1人，Phase 2+4）
  ├── 测试工程师（1人，专职测试）
  └── 性能专家（0.5人，性能验证）
```

**角色职责**

- **项目经理**：进度跟踪、风险管控、资源协调
- **架构师**：方案设计、技术评审、难点攻关
- **开发者A/B**：代码实现、单元测试、问题修复
- **测试工程师**：测试用例编写、集成测试、回归测试
- **性能专家**：性能基准建立、性能对比、性能优化

**日常同步机制**

- 每日站会（15分钟）：进度同步、问题暴露
- 每阶段评审会（1小时）：代码审查、验收确认
- 每周总结会（1小时）：里程碑回顾、风险评估

#### 7.3.2 质量保障

**代码审查机制**

```yaml
审查级别:
  Level 1 (Peer Review):
    - 触发：每个PR提交
    - 要求：至少1人review
    - 关注点：代码逻辑、命名规范

  Level 2 (Architecture Review):
    - 触发：每个Phase完成
    - 要求：架构师必须review
    - 关注点：接口设计、职责划分

  Level 3 (Final Review):
    - 触发：合并到main前
    - 要求：全员参与
    - 关注点：整体一致性、文档完整性
```

**测试门禁机制**

```yaml
Phase提交门禁:
  - 单元测试覆盖率 >= 80%
  - 所有集成测试通过
  - 无P0/P1级别bug
  - 代码审查通过
  - 文档更新完成

合并到main门禁:
  - 全量回归测试通过
  - 性能测试通过（无>10%下降）
  - E2E测试通过
  - 安全扫描通过
  - 文档审查通过
```

**持续集成配置**

```yaml
CI Pipeline:
  on_pull_request:
    - 静态代码检查 (ESLint + TypeScript)
    - 单元测试 (Jest)
    - 代码覆盖率报告 (>80%)

  on_phase_merge:
    - 单元测试
    - 集成测试
    - 性能基准测试

  on_main_merge:
    - 全量测试套件
    - E2E测试
    - 构建验证
    - 部署到预发布环境
```

#### 7.3.3 进度保障

**每日追踪**

```markdown
### 每日进度报告模板

**日期**: YYYY-MM-DD  
**阶段**: Phase N  
**负责人**: XXX

#### 今日完成

- [ ] 任务1 (预计2h, 实际Xh)
- [ ] 任务2 (预计1h, 实际Xh)

#### 遇到的问题

1. 问题描述
   - 影响：X小时延期
   - 解决方案：XXX

#### 明日计划

- [ ] 任务3 (预计3h)
- [ ] 任务4 (预计1h)

#### 风险预警

- 🔴 严重风险：XXX
- 🟡 中等风险：XXX
```

**里程碑看板**

```
┌──────────────────────────────────────┐
│  Phase 1: LLM注入 [████████░░] 80%  │
│  状态：开发中                         │
│  预计完成：Day 2                      │
│  风险：🟢 低                          │
├──────────────────────────────────────┤
│  Phase 2: Action工厂 [░░░░░░░░░░] 0% │
│  状态：待开始                         │
│  预计完成：Day 4                      │
├──────────────────────────────────────┤
│  Phase 3: 监控分离 [░░░░░░░░░░] 0%   │
│  状态：待开始                         │
├──────────────────────────────────────┤
│  Phase 4: 状态简化 [░░░░░░░░░░] 0%   │
│  状态：待开始                         │
└──────────────────────────────────────┘
```

#### 7.3.4 沟通保障

**问题升级机制**

```
Level 0 (自行解决) → 30分钟未解决
  ↓
Level 1 (团队讨论) → 1小时未解决
  ↓
Level 2 (架构师介入) → 2小时未解决
  ↓
Level 3 (项目经理决策) → 调整计划/寻求外部支持
```

**文档同步机制**

```yaml
实时文档:
  - 代码注释：实时更新
  - README：每Phase完成后更新
  - API文档：接口变更立即更新

阶段文档:
  - 设计文档：每Phase开始前完成
  - 测试报告：每Phase完成后提交
  - 变更日志：每Phase完成后更新

总结文档:
  - 重构总结：Week 2 Day 10完成
  - 经验总结：项目结束后1周内完成
```

#### 7.3.5 环境保障

**开发环境**

```yaml
本地环境:
  - Node.js >= 18
  - pnpm >= 8
  - TypeScript >= 5
  - 代码编辑器：VSCode + 推荐插件

测试环境:
  - 单元测试：Jest
  - 集成测试：独立测试数据库
  - E2E测试：Playwright

部署环境:
  - 开发环境：feature分支自动部署
  - 预发布环境：ddd-refactor分支手动部署
  - 生产环境：金丝雀发布
```

**工具链**

```yaml
开发工具:
  - Git: 版本控制
  - GitHub: 代码托管 + CI/CD
  - ESLint + Prettier: 代码规范
  - TypeScript: 类型检查

协作工具:
  - Slack/企业微信: 日常沟通
  - 腾讯会议: 视频会议
  - Notion/飞书: 文档协作
  - Jira/Linear: 任务跟踪

监控工具:
  - Jest Coverage: 代码覆盖率
  - Lighthouse: 性能监控
  - Sentry: 错误追踪
```

#### 7.3.6 知识传递

**培训计划**

```
Week 0 (准备周):
  - Day -3: 架构设计培训（2h）
  - Day -2: DDD原则培训（2h）
  - Day -1: 代码走读（2h）

Week 1:
  - Day 2: Phase 1技术分享（1h）
  - Day 4: Phase 2技术分享（1h）

Week 2:
  - Day 8: Phase 3技术分享（1h）
  - Day 10: 总体架构回顾（2h）
```

**文档交付清单**

- [x] 架构设计文档（本文档）
- [ ] 接口变更文档
- [ ] 迁移指南（如何从旧API迁移到新API）
- [ ] 测试指南（如何编写符合新架构的测试）
- [ ] 性能优化指南
- [ ] 常见问题FAQ
- [ ] 代码走读PPT

---

## 8. 参考资料

### 8.1 相关文件

- `packages/core-engine/src/engines/script-execution/script-executor.ts` (1146行)
- `packages/core-engine/src/engines/script-execution/executor.ts` (298行)
- `packages/core-engine/src/engines/script-execution/index.ts`
- `packages/api-server/src/services/session-manager.ts`
- `docs/design/story-1.4-async-verification.md`
- `docs/DEVELOPMENT_GUIDE.md`

### 8.2 技术文档

- [DDD 架构设计原则](docs/DEVELOPMENT_GUIDE.md#领域驱动设计)
- [Story 1.4 实现文档](docs/design/story-1.4-async-verification.md)
- [脚本执行引擎设计](docs/DEVELOPMENT_GUIDE.md#脚本执行引擎)

### 8.3 测试用例

- `packages/core-engine/test/*.test.ts` (27个测试文件)
- `packages/api-server/test-*.ts` (各类集成测试脚本)

---

## 9. 附录

### 9.1 架构对比详细清单

| 特性              | script-executor.ts | executor.ts     |
| ----------------- | ------------------ | --------------- |
| **代码规模**      |
| 总行数            | 1146               | 298             |
| 核心逻辑行数      | ~800               | ~250            |
| 注释行数          | ~200               | ~30             |
| **架构模式**      |
| 依赖注入          | ❌ 直接创建        | ✅ 构造函数注入 |
| DDD 架构          | ❌ 应用层直接操作  | ✅ 领域模型驱动 |
| 单一职责          | ❌ 职责过多        | ✅ 职责清晰     |
| **功能完整度**    |
| 基础执行流程      | ✅                 | ✅              |
| LLM 集成          | ✅ LLMOrchestrator | ❌ 无           |
| 变量四层作用域    | ✅ VariableStore   | ❌ 仅 Map       |
| Story 1.4 监控    | ✅ 完整实现        | ❌ 无           |
| Action 状态序列化 | ✅                 | ❌ 无           |
| JSON 重试机制     | ✅ 3次重试         | ❌ 无           |
| **生产情况**      |
| 实际使用          | ✅ 100% 生产流量   | ❌ 0 使用       |
| 测试覆盖          | ✅ 27个测试文件    | ❌ 0 测试       |
| 稳定性验证        | ✅ 生产环境验证    | ❌ 未验证       |

### 9.2 Git 提交统计

```bash
# script-executor.ts 提交历史
git log --oneline packages/core-engine/src/engines/script-execution/script-executor.ts
# 约 50+ 次提交，持续维护中

# executor.ts 提交历史
git log --oneline packages/core-engine/src/engines/script-execution/executor.ts
# 约 5 次提交，最后提交日期：2024-11-XX（DDD 架构重构期间创建）
```

### 9.3 未来架构演进路径

```mermaid
graph TD
    A[当前状态<br/>script-executor.ts 生产使用<br/>executor.ts 未使用] --> B{选择策略}

    B -->|策略 A| C[删除 executor.ts<br/>归档备份]
    C --> D[清晰架构<br/>消除混淆]

    B -->|策略 B| E[渐进式重构]
    E --> F[Phase 1: LLM注入]
    F --> G[Phase 2: Action工厂]
    G --> H[Phase 3: 监控分离]
    H --> I[Phase 4: 状态简化]
    I --> J[最终状态：DDD架构<br/>保持功能完整]

    D -.未来可选.-> E

    style A fill:#f9f,stroke:#333,stroke-width:2px
    style C fill:#9f9,stroke:#333,stroke-width:2px
    style J fill:#9cf,stroke:#333,stroke-width:2px
```

---

## 10. 审批与执行

### 10.1 审批记录

| 角色       | 姓名 | 审批意见 | 日期 | 签名 |
| ---------- | ---- | -------- | ---- | ---- |
| 架构师     | 待定 | 待审批   | -    | -    |
| 技术负责人 | 待定 | 待审批   | -    | -    |
| 测试负责人 | 待定 | 待审批   | -    | -    |
| 产品负责人 | 待定 | 待审批   | -    | -    |

### 10.2 执行状态

**策略A状态**

- [ ] 需求确认
- [ ] 方案评审
- [ ] 开始执行
- [ ] 执行完成
- [ ] 验收通过

**策略B状态**

- [ ] 需求确认
- [ ] 方案评审（本文档）
- [ ] Phase 1: LLM注入（Day 1-2）
- [ ] Phase 2: Action工厂（Day 3-4）
- [ ] Phase 3: 监控分离（Day 6-8）
- [ ] Phase 4: 状态简化（Day 8-10）
- [ ] 全量测试验证
- [ ] 性能验证
- [ ] 文档交付
- [ ] 验收通过

### 10.3 后续跟踪

**监控指标**

```yaml
开发阶段:
  - 代码提交频率
  - 测试覆盖率趋势
  - Bug数量趋势
  - 进度偏差率

发布后:
  - 生产环境错误率
  - 接口响应时间
  - 资源占用情况
  - 用户反馈
```

**定期评审**

- **Week 1 结束**: 阶段性评审（Phase 1+2）
- **Week 2 结束**: 完成评审（Phase 3+4）
- **发布后1周**: 生产环境监控评审
- **发布后1月**: 效果总结评审

**问题反馈渠道**

- GitHub Issues: 技术问题
- Slack #refactor频道: 日常讨论
- 周会: 重大问题升级

### 10.4 验收标准

**策略A验收标准**

- [x] executor.ts已删除
- [x] 已归档到docs/archive/
- [x] index.ts导出已更新
- [x] 所有测试通过
- [x] 文档已更新
- [x] 无外部引用残留

**策略B验收标准**

**功能验收**

- [ ] 所有Phase单元测试通过（覆盖率>80%）
- [ ] 所有集成测试通过
- [ ] E2E测试通过
- [ ] 回归测试无失败
- [ ] 核心功能无退化

**性能验收**

- [ ] 接口响应时间下降<10%
- [ ] 内存占用增长<5%
- [ ] CPU占用无明显增长
- [ ] 并发处理能力无下降

**代码质量验收**

- [ ] ESLint检查通过
- [ ] TypeScript编译无错误
- [ ] 代码审查通过
- [ ] 无TODO/FIXME注释
- [ ] 代码复杂度降低

**文档验收**

- [ ] API文档完整
- [ ] 迁移指南完整
- [ ] 测试文档完整
- [ ] 变更日志完整
- [ ] README更新

**部署验证**

- [ ] 开发环境验证通过
- [ ] 预发布环境验证通过
- [ ] 10%生产流量验证通过
- [ ] 100%生产流量验证通过
- [ ] 监控指标正常

### 10.5 完成标志

**策略B完全完成的标志**

1. ✅ 所有4个Phase代码合并到main
2. ✅ 100%生产流量运行稳定（7天无P0/P1事故）
3. ✅ 所有文档交付完成
4. ✅ 团队培训完成
5. ✅ executor.ts已标记为deprecated或删除
6. ✅ 性能指标达标
7. ✅ 用户反馈正向

**项目关闭流程**

1. 技术总结会议（2h）
2. 经验教训文档编写（4h）
3. 知识库更新（2h）
4. 项目归档
5. 团队庆祝 🎉

---

## 11. 附录：策略B执行检查清单

### 11.1 Phase 1 执行检查清单

#### 准备阶段

- [ ] 创建feature分支 `feature/phase1-llm-injection`
- [ ] 环境配置检查
- [ ] 依赖版本确认
- [ ] 团队角色分配

#### 开发阶段

- [ ] 设计LLM注入接口
- [ ] 实现构造函数注入
- [ ] 实现默认创建逻辑
- [ ] 更新createAction方法
- [ ] 编写单元测试
- [ ] 代码自测

#### 测试阶段

- [ ] 单元测试通过（覆盖率>85%）
- [ ] 集成测试通过
- [ ] 手动测试通过
- [ ] 性能无退化

#### 审查阶段

- [ ] Peer review完成
- [ ] 架构师review完成
- [ ] 修复review意见
- [ ] 测试工程师验收

#### 交付阶段

- [ ] 合并到ddd-refactor分支
- [ ] Git tag标记: `phase1-complete`
- [ ] 更新文档
- [ ] 技术分享（可选）

### 11.2 Phase 2 执行检查清单

#### 准备阶段

- [ ] 创建feature分支 `feature/phase2-action-factory`
- [ ] 确认Phase 1合并完成
- [ ] 拉取最新ddd-refactor代码

#### 开发阶段

- [ ] 设计ActionFactory接口
- [ ] 实现DefaultActionFactory
- [ ] 集成到ScriptExecutor
- [ ] 更新Action创建逻辑
- [ ] 编写单元测试
- [ ] 编写集成测试

#### 测试阶段

- [ ] 单元测试通过（覆盖率>80%）
- [ ] 集成测试通过
- [ ] 配置传递验证
- [ ] 各类型Action创建验证

#### 审查阶段

- [ ] Code review完成
- [ ] 架构设计review完成
- [ ] 测试验收完成

#### 交付阶段

- [ ] 合并到ddd-refactor
- [ ] Git tag: `phase2-complete`
- [ ] 更新导出文件
- [ ] 更新文档

### 11.3 Phase 3 执行检查清单

#### 准备阶段

- [ ] 创建feature分支 `feature/phase3-monitor-service`
- [ ] 确认Phase 2合并完成

#### 开发阶段

- [ ] 设计MonitorService接口
- [ ] 提取监控逻辑到服务
- [ ] 简化ScriptExecutor.triggerMonitorAnalysis
- [ ] 实现服务注入
- [ ] 编写单元测试
- [ ] 编写对比测试

#### 测试阶段

- [ ] 单元测试通过（覆盖率>80%）
- [ ] 对比测试通过（输出100%一致）
- [ ] 异步调用验证
- [ ] 失败容错验证

#### 审查阶段

- [ ] Code review完成
- [ ] 数据一致性验证
- [ ] 性能影响评估

#### 交付阶段

- [ ] 合并到ddd-refactor
- [ ] Git tag: `phase3-complete`
- [ ] 更新文档
- [ ] 代码精简统计

### 11.4 Phase 4 执行检查清单

#### 准备阶段

- [ ] 创建feature分支 `feature/phase4-state-simplification`
- [ ] 确认Phase 3合并完成
- [ ] 建立性能基准

#### 开发阶段

- [ ] 设计ExecutionContext结构
- [ ] 实现ExecutionStateAdapter
- [ ] 实现双向转换
- [ ] 重构内部访问路径
- [ ] 编写单元测试
- [ ] 编写往返转换测试

#### 测试阶段

- [ ] 单元测试通过（覆盖率>85%）
- [ ] 往返转换测试通过
- [ ] 全量回归测试通过
- [ ] 性能对比测试通过
- [ ] API兼容性验证

#### 审查阶段

- [ ] 架构review完成
- [ ] Code review完成
- [ ] 性能报告评审
- [ ] 全量测试验收

#### 交付阶段

- [ ] 合并到ddd-refactor
- [ ] Git tag: `phase4-complete`
- [ ] 更新所有文档
- [ ] 编写迁移指南

### 11.5 最终集成检查清单

#### 集成测试

- [ ] 所有Phase联合测试
- [ ] 完整E2E测试
- [ ] 性能压力测试
- [ ] 安全扫描

#### 部署验证

- [ ] 合并到main分支
- [ ] 部署到开发环境
- [ ] 部署到预发布环境
- [ ] 10%生产流量验证
- [ ] 100%生产流量验证

#### 文档交付

- [ ] API变更文档
- [ ] 迁移指南
- [ ] 测试指南
- [ ] FAQ文档
- [ ] 总结报告

#### 知识传递

- [ ] 代码走读完成
- [ ] 团队培训完成
- [ ] 文档审查完成
- [ ] 知识库更新完成

#### 项目收尾

- [ ] 所有遗留问题处理
- [ ] 性能监控配置
- [ ] 告警规则配置
- [ ] 项目总结会议
- [ ] 经验文档归档

---

**文档结束**

---

## 变更历史

| 版本 | 日期       | 作者   | 变更说明              |
| ---- | ---------- | ------ | --------------------- |
| 1.0  | 2026-02-09 | AI助手 | 初始版本创建          |
| 1.1  | 2026-02-09 | AI助手 | 补充策略B详细执行计划 |

---

**文档维护说明**

本文档应随着重构进度实时更新：

- Phase完成后更新执行状态
- 发现新风险时补充风险矩阵
- 遇到问题时更新应对措施
- 项目完成后补充经验总结

如有任何疑问或建议，请通过以下渠道反馈：

- GitHub Issues: [项目仓库]/issues
- 技术讨论群: #architecture-refactor
- 邮件: architecture-team@example.com
