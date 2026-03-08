# HeartRule-Qoder 架构重构实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 彻底解决架构问题：消除领域模型反向依赖、统一变量存储、精简 Action 基类、统一测试目录、迁移脚本文件

**Architecture:** 采用激进式重构，拆分 Session 为 Entity + Service，将 Action 基类精简为抽象定义，提取基础设施逻辑到独立模块

**Tech Stack:** TypeScript, Vitest, Drizzle ORM

---

## Phase 1: Session 领域模型重构

### Task 1: 创建 SessionEntity (纯数据对象)

**Files:**

- Create: `packages/core-engine/src/domain/entities/session.ts`

**Step 1: 创建 SessionEntity 类**

```typescript
// packages/core-engine/src/domain/entities/session.ts
import {
  SessionStatus,
  ExecutionStatus,
  type ExecutionPosition,
  type VariableStore,
} from '@heartrule/shared-types';

export interface ConversationEntry {
  role: string;
  content: string;
  actionId?: string;
  metadata?: Record<string, any>;
}

export class SessionEntity {
  public sessionId: string;
  public userId: string;
  public scriptId: string;
  public status: SessionStatus;
  public executionStatus: ExecutionStatus;
  public position: ExecutionPosition;
  public variableStore?: VariableStore;
  public conversationHistory: ConversationEntry[];
  public metadata: Map<string, unknown>;
  public createdAt: Date;
  public updatedAt: Date;
  public completedAt?: Date;

  constructor(params: {
    sessionId: string;
    userId: string;
    scriptId: string;
    status?: SessionStatus;
    executionStatus?: ExecutionStatus;
    position?: ExecutionPosition;
    variableStore?: VariableStore;
    conversationHistory?: ConversationEntry[];
    metadata?: Map<string, unknown>;
    createdAt?: Date;
    updatedAt?: Date;
    completedAt?: Date;
  }) {
    this.sessionId = params.sessionId;
    this.userId = params.userId;
    this.scriptId = params.scriptId;
    this.status = params.status || SessionStatus.CREATED;
    this.executionStatus = params.executionStatus || ExecutionStatus.IDLE;
    this.position = params.position || { phaseIndex: 0, topicIndex: 0, actionIndex: 0 };
    this.variableStore = params.variableStore || {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
    this.conversationHistory = params.conversationHistory || [];
    this.metadata = params.metadata || new Map();
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  toJSON(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      scriptId: this.scriptId,
      status: this.status,
      executionStatus: this.executionStatus,
      position: this.position,
      variableStore: this.variableStore,
      conversationHistory: this.conversationHistory,
      metadata: Object.fromEntries(this.metadata),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString(),
    };
  }
}
```

**Step 2: 验证类型检查**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: PASS

---

### Task 2: 创建 SessionService (领域服务)

**Files:**

- Create: `packages/core-engine/src/domain/services/session-service.ts`
- Modify: `packages/core-engine/src/domain/session.ts` (删除或标记废弃)

**Step 1: 创建 SessionService 类**

```typescript
// packages/core-engine/src/domain/services/session-service.ts
import { SessionStatus, ExecutionStatus } from '@heartrule/shared-types';
import type { SessionEntity, ConversationEntry } from '../entities/session.js';
import type { BaseAction } from '../../domain/actions/base-action.js';
import type { LLMDebugInfo } from '../../engines/llm-orchestration/orchestrator.js';

export class SessionService {
  private session: SessionEntity;
  private currentAction: BaseAction | null = null;
  private lastAiMessage: string | null = null;
  private lastLLMDebugInfo?: LLMDebugInfo;

  constructor(entity: SessionEntity) {
    this.session = entity;
  }

  start(): void {
    this.session.status = SessionStatus.ACTIVE;
    this.session.executionStatus = ExecutionStatus.RUNNING;
    this.session.updatedAt = new Date();
  }

  pause(): void {
    this.session.status = SessionStatus.PAUSED;
    this.session.executionStatus = ExecutionStatus.PAUSED;
    this.session.updatedAt = new Date();
  }

  resume(): void {
    if (this.session.status === SessionStatus.PAUSED) {
      this.session.status = SessionStatus.ACTIVE;
      this.session.executionStatus = ExecutionStatus.RUNNING;
      this.session.updatedAt = new Date();
    }
  }

  complete(): void {
    this.session.status = SessionStatus.COMPLETED;
    this.session.executionStatus = ExecutionStatus.COMPLETED;
    this.session.completedAt = new Date();
    this.session.updatedAt = new Date();
  }

  fail(error: string): void {
    this.session.status = SessionStatus.FAILED;
    this.session.executionStatus = ExecutionStatus.ERROR;
    this.session.metadata.set('error', error);
    this.session.updatedAt = new Date();
  }

  updatePosition(position: { phaseIndex: number; topicIndex: number; actionIndex: number }): void {
    this.session.position = position;
    this.session.updatedAt = new Date();
  }

  setVariable(scope: 'global' | 'session' | 'phase' | 'topic', name: string, value: unknown): void {
    if (!this.session.variableStore) {
      this.session.variableStore = { global: {}, session: {}, phase: {}, topic: {} };
    }
    this.session.variableStore[scope][name] = value;
    this.session.updatedAt = new Date();
  }

  getVariable(scope: 'global' | 'session' | 'phase' | 'topic', name: string): unknown {
    return this.session.variableStore?.[scope]?.[name];
  }

  addConversationEntry(entry: ConversationEntry): void {
    this.session.conversationHistory.push(entry);
    this.session.updatedAt = new Date();
  }

  setCurrentAction(action: BaseAction | null): void {
    this.currentAction = action;
    this.session.updatedAt = new Date();
  }

  waitForInput(): void {
    this.session.executionStatus = ExecutionStatus.WAITING_INPUT;
    this.session.updatedAt = new Date();
  }

  resumeRunning(): void {
    this.session.executionStatus = ExecutionStatus.RUNNING;
    this.session.updatedAt = new Date();
  }

  setLastAiMessage(message: string): void {
    this.lastAiMessage = message;
  }

  setLastLLMDebugInfo(info: LLMDebugInfo): void {
    this.lastLLMDebugInfo = info;
  }

  getEntity(): SessionEntity {
    return this.session;
  }

  getCurrentAction(): BaseAction | null {
    return this.currentAction;
  }

  getLastAiMessage(): string | null {
    return this.lastAiMessage;
  }

  getLastLLMDebugInfo(): LLMDebugInfo | undefined {
    return this.lastLLMDebugInfo;
  }
}
```

**Step 2: 验证类型检查**

Run: `pnpm --filter @heartrule/core-engine typecheck`
Expected: PASS

---

### Task 3: 更新 shared-types 中 Session 接口

**Files:**

- Modify: `packages/shared-types/src/domain/session.ts`

**Step 1: 移除冗余字段**

保留接口定义，但移除以下字段（因为它们属于服务层）：

- `currentAction`
- `lastAiMessage`
- `lastLLMDebugInfo`

---

## Phase 2: 变量存储统一

### Task 4: 扩展 VariableStore 接口

**Files:**

- Modify: `packages/shared-types/src/domain/variable.ts`

**Step 1: 添加兼容方法**

```typescript
// 在 VariableStore 接口中添加
export interface VariableStore {
  global: Record<string, unknown>;
  session: Record<string, unknown>;
  phase: Record<string, unknown>;
  topic: Record<string, unknown>;
  // 兼容方法
  get(key: string, scope?: 'global' | 'session' | 'phase' | 'topic'): unknown;
  set(key: string, value: unknown, scope?: 'global' | 'session' | 'phase' | 'topic'): void;
}
```

---

### Task 5: 更新所有 Action 的变量引用

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-say-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`
- Modify: `packages/core-engine/src/domain/actions/ai-think-action.ts`

**Step 1: 更新 BaseAction 中的变量替换逻辑**

移除 `context.variables` 引用，改为 `context.variableStore`

---

## Phase 3: Action 基类重构

### Task 6: 精简 BaseAction

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`

**Step 1: 提取变量替换逻辑**

创建 `infrastructure/actions/variable-substitutor.ts`

**Step 2: 提取退出条件评估**

创建 `infrastructure/actions/exit-condition-evaluator.ts`

**Step 3: 精简 BaseAction**

保留：

- 抽象 `execute` 方法
- 基础配置读取 `getConfig`
- JSDoc 文档

移除（提取到 infrastructure）：

- `substituteVariables` → `VariableSubstitutor`
- `evaluateExitCondition` → `ExitConditionEvaluator`
- `checkSafetyBoundary` → `SafetyChecker`
- `parseStructuredOutput` → `SafetyChecker`
- `resolveTemplatePath` → 移除，改为注入

---

### Task 7: 创建基础设施模块

**Files:**

- Create: `packages/core-engine/src/infrastructure/actions/variable-substitutor.ts`
- Create: `packages/core-engine/src/infrastructure/actions/exit-condition-evaluator.ts`
- Create: `packages/core-engine/src/infrastructure/actions/safety-checker.ts`

**Step 1: VariableSubstitutor 实现**

```typescript
// packages/core-engine/src/infrastructure/actions/variable-substitutor.ts
import type { VariableStore, Position } from '@heartrule/shared-types';
import type { VariableScopeResolver } from '../../engines/variable-scope/variable-scope-resolver.js';

export class VariableSubstitutor {
  constructor(
    private variableStore?: VariableStore,
    private scopeResolver?: VariableScopeResolver
  ) {}

  substitute(
    template: string,
    context: {
      variables?: Record<string, any>;
      systemVariables?: Record<string, any>;
      variableStore?: VariableStore;
      scopeResolver?: VariableScopeResolver;
      phaseId: string;
      topicId: string;
      actionId: string;
    }
  ): string {
    // 实现变量替换逻辑
    // ... (从原 BaseAction 迁移)
  }
}
```

**Step 2: ExitConditionEvaluator 实现**

```typescript
// packages/core-engine/src/infrastructure/actions/exit-condition-evaluator.ts
export class ExitConditionEvaluator {
  evaluate(
    context: any,
    exitPolicy: any,
    exitCriteria?: any,
    llmOutput?: Record<string, any>
  ): { should_exit: boolean; reason: string; decision_source: string } {
    // 实现退出条件评估逻辑
    // ... (从原 BaseAction 迁移)
  }
}
```

**Step 3: SafetyChecker 实现**

```typescript
// packages/core-engine/src/infrastructure/actions/safety-checker.ts
export class SafetyChecker {
  checkBoundary(message: string): { passed: boolean; violations: any[] } {
    // 实现安全边界检测
  }

  parseStructuredOutput(aiMessage: string): any {
    // 解析结构化输出
  }

  async confirmViolation(
    originalResponse: string,
    riskType: string,
    reason: string,
    llmOrchestrator?: any
  ): Promise<any> {
    // 二次确认
  }

  generateSafeFallback(): string {
    return `抱歉，我刚才的回复可能不够准确。请注意，我是一个 AI 辅助工具，不能替代专业心理咨询师或医生。`;
  }
}
```

---

## Phase 4: 目录规范化

### Task 8: 统一测试目录

**Files:**

- Modify: 移动 `packages/core-engine/src/test/` → `packages/core-engine/src/__tests__/`
- Modify: `packages/core-engine/package.json` (更新 test 配置)

**Step 1: 迁移测试文件**

```bash
# 移动 test 目录下的文件到 __tests__
mv packages/core-engine/src/test/* packages/core-engine/src/__tests__/
rmdir packages/core-engine/src/test
```

**Step 2: 更新 Vitest 配置**

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', '__tests__/**/*.test.ts'],
  },
});
```

---

### Task 9: 迁移根目录脚本

**Files:**

- Modify: 移动根目录 .ts 脚本 → `scripts/` 子目录

**Step 1: 创建目录结构**

```bash
mkdir -p scripts/{migration,development,testing,maintenance}
```

**Step 2: 分类迁移**

```bash
# 迁移脚本
mv *migrate*.ts scripts/migration/
mv *update*.ts scripts/migration/
mv test-*.ts scripts/testing/
mv check-*.ts scripts/maintenance/
mv find-*.ts scripts/maintenance/
mv verify-*.ts scripts/maintenance/
mv analyze-*.ts scripts/development/
```

---

## Phase 5: 验证与测试

### Task 10: 运行类型检查

**Step 1: 类型检查**

Run: `pnpm typecheck`
Expected: PASS (无错误)

### Task 11: 运行单元测试

**Step 1: 单元测试**

Run: `pnpm test`
Expected: PASS (所有测试通过)

### Task 12: 构建验证

**Step 1: 构建所有包**

Run: `pnpm build`
Expected: PASS (所有包构建成功)

---

## 执行方式选择

**Plan complete and saved to `docs/plans/2026-03-08-architecture-refactoring-implementation.md`. Two execution options:**

1. **Subagent-Driven (this session)** - 我 dispatch 每个任务到子 agent，期间进行代码审查，快速迭代

2. **Parallel Session (separate)** - 在新 session 中使用 executing-plans，批量执行带检查点

**Which approach?**
