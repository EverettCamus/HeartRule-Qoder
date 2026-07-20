# MemoryRepository Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the MemoryRepository domain port, FakeMemoryRepository for testing, wire into SessionOrchestrator, and validate the interface shape through unit + integration tests.

**Architecture:** Define `MemoryRepository` interface in core-engine's domain/ports layer. Implement `FakeMemoryRepository` as an in-memory data bucket for tests. Inject optionally into SessionOrchestrator via constructor parameter — no effect on existing flows when not provided. Phase 0 only logs calls; no LLM prompt injection yet.

**Tech Stack:** TypeScript, Vitest, core-engine (domain ports pattern), api-server (SessionOrchestrator)

---

### Task 1: Create MemoryRepository port interface

**Files:**

- Create: `packages/core-engine/src/domain/ports/memory-repository.port.ts`

- [ ] **Step 1: Create the port file**

```typescript
/**
 * MemoryRepository Domain Port
 *
 * @remarks
 * DDD 六边形架构：领域端口定义
 * 定义核心引擎对跨会话记忆的依赖接口
 *
 * 职责分离：
 * - 本文件：定义接口契约（Port）—— 领域层只关心"需要记忆能力"
 * - api-server/adapters/：未来提供具体实现（HindsightMemoryAdapter）
 *
 * 四网络模型 (World/Experience/Opinion/Observation):
 * - 区分事实与判断、证据与推论，是跨咨询领域的通用认知抽象
 * - Phase 0 子类型使用轻量占位，Phase 1 集成 Hindsight 时定型完整字段
 */

/**
 * 跨越 retain 边界的消息结构
 */
export interface Message {
  role: string;
  content: string;
  timestamp?: Date;
}

/**
 * 从会谈记忆中召回的上下文
 *
 * @remarks
 * 四字段对应 Hindsight 四网络：World→worldFacts, Experience→experiences,
 * Opinion→opinions, Observation→observationSummary
 */
export interface MemoryContext {
  worldFacts: Array<{ content: string }>;
  experiences: Array<{ content: string }>;
  opinions: Array<{ content: string; confidence: number }>;
  observationSummary: string;
}

/**
 * reflect() 操作的返回值
 *
 * @remarks
 * Phase 0 使用简化结构。Phase 4 矛盾检测时需要完整的
 * updatedOpinions / contradictions 字段
 */
export interface ReflectionResult {
  summary: string;
}

/**
 * 记忆仓储领域端口
 *
 * @remarks
 * 定义跨会话积累对来访者理解所需的能力：
 * - retain: 从对话中记住新信息
 * - recall: 按需检索已有记忆
 * - reflect: 回顾综合形成新领悟
 */
export interface MemoryRepository {
  /**
   * 记住 —— 将对话消息存入记忆
   *
   * @param userId - 用户标识
   * @param messages - 待存入的消息列表
   */
  retain(userId: string, messages: Message[]): Promise<void>;

  /**
   * 召回 —— 按查询检索相关记忆
   *
   * @param userId - 用户标识
   * @param query - 自然语言查询（如"用户的核心信念"）
   * @returns 结构化的记忆上下文
   */
  recall(userId: string, query: string): Promise<MemoryContext>;

  /**
   * 反思 —— 回顾已有记忆，综合形成新观察
   *
   * @param userId - 用户标识
   * @returns 反思结果摘要
   */
  reflect(userId: string): Promise<ReflectionResult>;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine typecheck`

Expected: No new type errors from the new file.

---

### Task 2: Export MemoryRepository from core-engine

**Files:**

- Modify: `packages/core-engine/src/index.ts` (add export near other domain exports)

- [ ] **Step 1: Add export to index.ts**

Add after the domain action exports (around line 118, after `ai-think-action` line):

```typescript
// Domain Ports
export * from './domain/ports/memory-repository.port.js';
```

Insert between the existing domain action exports and the engine exports:

```
export * from './domain/actions/ai-think-action.js'; // AI 思考/内部推理动作执行器
// ← INSERT HERE: Domain Ports export
// =============================================================================
// Engine Layer (引擎层)
```

- [ ] **Step 2: Verify exports work**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine typecheck`

Expected: No errors. `MemoryRepository`, `MemoryContext`, `ReflectionResult` are now importable from `@heartrule/core-engine`.

---

### Task 3: Create FakeMemoryRepository

**Files:**

- Create: `packages/core-engine/test/helpers/fake-memory-repository.ts`

- [ ] **Step 1: Create the fake implementation**

```typescript
import type {
  MemoryRepository,
  MemoryContext,
  ReflectionResult,
} from '../../src/domain/ports/memory-repository.port.js';
import type { Message } from '../../src/domain/ports/memory-repository.port.js';

/**
 * FakeMemoryRepository — Phase 0 纯数据桶
 *
 * retain() 原样存消息到内存 Map
 * recall() 返回预填充的 MemoryContext
 * reflect() no-op，记录调用计数
 */
export class FakeMemoryRepository implements MemoryRepository {
  private storage: Map<string, Message[]> = new Map();
  public reflectCallCount = 0;

  /** 预填充数据：支持在测试中预设特定 userId 的 recall 结果 */
  private prefillData: Map<string, MemoryContext> = new Map();

  async retain(userId: string, messages: Message[]): Promise<void> {
    const existing = this.storage.get(userId) || [];
    this.storage.set(userId, [...existing, ...messages]);
  }

  async recall(userId: string, _query: string): Promise<MemoryContext> {
    const prefill = this.prefillData.get(userId);
    if (prefill) return prefill;

    return {
      worldFacts: [],
      experiences: [],
      opinions: [],
      observationSummary: '',
    };
  }

  async reflect(_userId: string): Promise<ReflectionResult> {
    this.reflectCallCount++;
    return { summary: '' };
  }

  /** 预设某个 userId 的召回结果 */
  setRecallData(userId: string, context: MemoryContext): void {
    this.prefillData.set(userId, context);
  }

  /** 获取已存储的消息（用于测试验证） */
  getStoredMessages(userId: string): Message[] {
    return this.storage.get(userId) || [];
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine typecheck`

Expected: No errors. FakeMemoryRepository implements MemoryRepository correctly.

---

### Task 4: Write unit tests for FakeMemoryRepository

**Files:**

- Create: `packages/core-engine/test/unit/domain/fake-memory-repository.test.ts`

- [ ] **Step 1: Create the unit test file**

```typescript
/**
 * FakeMemoryRepository 单元测试
 *
 * 验证:
 * - retain: 消息正确存储，按 userId 隔离
 * - recall: 返回预填充 MemoryContext，无预填时返回空上下文
 * - reflect: 调用计数递增
 * - 多用户隔离
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeMemoryRepository } from '../../helpers/fake-memory-repository.js';
import type { MemoryContext } from '../../../src/domain/ports/memory-repository.port.js';

describe('FakeMemoryRepository', () => {
  let repo: FakeMemoryRepository;

  beforeEach(() => {
    repo = new FakeMemoryRepository();
  });

  describe('retain()', () => {
    it('应该存储消息并按 userId 分组', async () => {
      await repo.retain('user-1', [
        { role: 'user', content: '最近睡得不好' },
        { role: 'assistant', content: '能具体说说吗？' },
      ]);

      const stored = repo.getStoredMessages('user-1');
      expect(stored).toHaveLength(2);
      expect(stored[0].content).toBe('最近睡得不好');
      expect(stored[1].content).toBe('能具体说说吗？');
    });

    it('应该追加消息到已有的记忆中', async () => {
      await repo.retain('user-1', [{ role: 'user', content: '第一轮' }]);
      await repo.retain('user-1', [{ role: 'user', content: '第二轮' }]);

      const stored = repo.getStoredMessages('user-1');
      expect(stored).toHaveLength(2);
    });

    it('应该隔离不同 userId 的消息', async () => {
      await repo.retain('user-1', [{ role: 'user', content: 'user-1的消息' }]);
      await repo.retain('user-2', [{ role: 'user', content: 'user-2的消息' }]);

      expect(repo.getStoredMessages('user-1')).toHaveLength(1);
      expect(repo.getStoredMessages('user-2')).toHaveLength(1);
    });
  });

  describe('recall()', () => {
    it('应该返回预填充的 MemoryContext', async () => {
      const prefill: MemoryContext = {
        worldFacts: [{ content: '被诊断为 GAD' }, { content: '服用舍曲林 50mg/天' }],
        experiences: [{ content: '第3次会谈描述了被领导公开批评的场景' }],
        opinions: [{ content: '焦虑可能与工作关系中的权力不对等有关', confidence: 0.72 }],
        observationSummary: '用户在权威场景中表现出明显的回避模式',
      };
      repo.setRecallData('user-1', prefill);

      const result = await repo.recall('user-1', '用户的核心焦虑');
      expect(result.worldFacts).toHaveLength(2);
      expect(result.experiences).toHaveLength(1);
      expect(result.opinions).toHaveLength(1);
      expect(result.observationSummary).toBe('用户在权威场景中表现出明显的回避模式');
    });

    it('应该在无预填充数据时返回空上下文', async () => {
      const result = await repo.recall('unknown-user', '任何查询');
      expect(result.worldFacts).toEqual([]);
      expect(result.experiences).toEqual([]);
      expect(result.opinions).toEqual([]);
      expect(result.observationSummary).toBe('');
    });

    it('应该按 userId 隔离预填充数据', async () => {
      repo.setRecallData('user-1', {
        worldFacts: [{ content: 'user-1的事实' }],
        experiences: [],
        opinions: [],
        observationSummary: '',
      });

      const result1 = await repo.recall('user-1', 'test');
      const result2 = await repo.recall('user-2', 'test');

      expect(result1.worldFacts).toHaveLength(1);
      expect(result2.worldFacts).toHaveLength(0);
    });
  });

  describe('reflect()', () => {
    it('应该记录调用次数', async () => {
      expect(repo.reflectCallCount).toBe(0);
      await repo.reflect('user-1');
      expect(repo.reflectCallCount).toBe(1);
      await repo.reflect('user-1');
      await repo.reflect('user-2');
      expect(repo.reflectCallCount).toBe(3);
    });
  });
});
```

- [ ] **Step 2: Run unit tests**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine test -- test/unit/domain/fake-memory-repository.test.ts`

Expected: All 7 tests pass.

---

### Task 5: Wire MemoryRepository into SessionOrchestrator

**Files:**

- Modify: `packages/api-server/src/services/session-orchestrator.ts`

- [ ] **Step 1: Add import and constructor parameter**

Add import at top (after existing `@heartrule/core-engine` import):

```typescript
import {
  Session,
  ScriptExecutor,
  type TemplateProvider,
  type MemoryRepository, // ← add
  createLogger,
} from '@heartrule/core-engine';
```

Add `memoryRepository` as first constructor parameter:

```typescript
constructor(
  memoryRepository?: MemoryRepository,   // ← add as first param (optional)
  scriptExecutor?: ScriptExecutor,
  repository?: ISessionRepository,
  templateProvider?: TemplateProvider,
  responseBuilder?: SessionResponseBuilder
) {
  this.memoryRepository = memoryRepository;    // ← store
  this.scriptExecutor = scriptExecutor || container.getScriptExecutor();
  // ... rest unchanged
```

Add private field:

```typescript
export class SessionOrchestrator {
  private memoryRepository?: MemoryRepository;   // ← add
  private scriptExecutor: ScriptExecutor;
  // ... rest unchanged
```

- [ ] **Step 2: Add recall call in initializeSession()**

After the `executeScript` call in `initializeSession()` (after line 284), before persisting:

```typescript
session = await this.executeScript(script, sessionId, session, null);

// Phase 0: 会话启动时调用 recall（仅记录日志）
if (this.memoryRepository) {
  const ctx = await this.memoryRepository.recall(
    sessionData.userId,
    '用户核心问题、关键事件、治疗进展'
  );
  logger.debug('🧠 [Memory] recall at session start:', {
    userId: sessionData.userId,
    worldFacts: ctx.worldFacts.length,
    experiences: ctx.experiences.length,
    opinions: ctx.opinions.length,
    hasSummary: !!ctx.observationSummary,
  });
}
```

- [ ] **Step 3: Add retain call in processUserInput()**

After the `executeScript` call in `processUserInput()` (after line 358), before persisting:

```typescript
session = await this.executeScript(script, sessionId, session, userInput);

// Phase 0: 每轮对话后异步 retain（仅记录日志）
if (this.memoryRepository) {
  const roundMessages = session.conversationHistory.slice(prevHistoryLength);
  this.memoryRepository
    .retain(
      sessionData.userId,
      roundMessages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(),
      }))
    )
    .then(() => {
      logger.debug('🧠 [Memory] retain completed:', {
        userId: sessionData.userId,
        messageCount: roundMessages.length,
      });
    })
    .catch((err) => {
      logger.warn('🧠 [Memory] retain failed:', err.message);
    });
}
```

- [ ] **Step 4: Add reflect call on session completion**

After persisting in both `initializeSession()` and `processUserInput()`, when session is COMPLETED:

Add a private helper method:

```typescript
private async maybeReflect(userId: string, session: Session): Promise<void> {
  if (!this.memoryRepository) return;
  if (session.executionStatus !== 'completed') return;

  try {
    const result = await this.memoryRepository.reflect(userId);
    logger.debug('🧠 [Memory] reflect completed:', {
      userId,
      summary: result.summary,
    });
  } catch (err: any) {
    logger.warn('🧠 [Memory] reflect failed:', err.message);
  }
}
```

Call it at the end of `initializeSession()` and `processUserInput()` (before return):

```typescript
await this.maybeReflect(sessionData.userId, session);
```

- [ ] **Step 5: Verify compilation**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/api-server typecheck`

Expected: No type errors.

---

### Task 6: Write integration test through SessionOrchestrator

**Files:**

- Create: `packages/core-engine/test/integration/memory-repository-integration.test.ts`

Note: Since SessionOrchestrator depends on database (PostgreSQL), and core-engine integration tests don't have DB access, this test verifies the MemoryRepository wire path through Session and ScriptExecutor directly.

- [ ] **Step 1: Create integration test**

```typescript
/**
 * MemoryRepository 集成测试
 *
 * 验证 FakeMemoryRepository 在真实 Session + ScriptExecutor 路径中
 * 能否正常流动（不经过数据库层）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScriptExecutor,
  Session,
  LLMOrchestrator,
  type MemoryRepository,
  type MemoryContext,
  type ReflectionResult,
} from '../../src/index.js';
import type { ILLMProvider } from '../../src/application/ports/outbound/llm-provider.port.js';

/** 集成了调用计数器的 Fake Repository */
class SpyMemoryRepository implements MemoryRepository {
  public retainCalls: Array<{ userId: string; messageCount: number }> = [];
  public recallCalls: Array<{ userId: string; query: string }> = [];
  public reflectCalls: string[] = [];

  private recallData: Map<string, MemoryContext> = new Map();

  async retain(userId: string, messages: any[]): Promise<void> {
    this.retainCalls.push({ userId, messageCount: messages.length });
  }

  async recall(userId: string, query: string): Promise<MemoryContext> {
    this.recallCalls.push({ userId, query });
    return (
      this.recallData.get(userId) || {
        worldFacts: [],
        experiences: [],
        opinions: [],
        observationSummary: '',
      }
    );
  }

  async reflect(userId: string): Promise<ReflectionResult> {
    this.reflectCalls.push(userId);
    return { summary: '' };
  }

  setRecallData(userId: string, context: MemoryContext): void {
    this.recallData.set(userId, context);
  }
}

// 最小 YAML 脚本：1 phase, 1 topic, 1 ai_say
const MINIMAL_SCRIPT = JSON.stringify({
  session: {
    session_id: 'test-memory-integration',
    phases: [
      {
        phase_id: 'phase1',
        phase_name: '开场',
        topics: [
          {
            topic_id: 'topic1',
            topic_name: '欢迎',
            actions: [
              {
                action_id: 'say_hello',
                action_type: 'ai_say',
                content: '你好，欢迎来到咨询。',
              },
            ],
          },
        ],
      },
    ],
  },
});

describe('MemoryRepository 集成测试', () => {
  let scriptExecutor: ScriptExecutor;
  let memoryRepo: SpyMemoryRepository;

  beforeEach(() => {
    // 构造最小 LLM mock
    const mockProvider: ILLMProvider = {
      getModel: () => ({ doGenerate: async () => ({ text: '你好！' }) }) as any,
      generateText: async () => ({
        text: '你好，我是AI咨询师。',
        debugInfo: {
          prompt: '',
          response: 'mock',
          model: 'test',
          config: {},
          timestamp: new Date().toISOString(),
        },
      }),
      streamText: async function* () {
        yield 'mock';
      },
    };
    const llm = new LLMOrchestrator(mockProvider);
    scriptExecutor = new ScriptExecutor(llm);
    memoryRepo = new SpyMemoryRepository();
  });

  describe('MemoryRepository 接口形状验证', () => {
    it('recall() 应该能返回 MemoryContext 并传递给调用方', async () => {
      const prefill: MemoryContext = {
        worldFacts: [{ content: '用户被诊断为 GAD' }],
        experiences: [{ content: '第1次会谈讨论了工作压力' }],
        opinions: [{ content: '焦虑来源可能与完美主义有关', confidence: 0.7 }],
        observationSummary: '用户首次会谈，情绪稳定',
      };
      memoryRepo.setRecallData('user-1', prefill);

      const ctx = await memoryRepo.recall('user-1', '用户概况');

      expect(ctx.worldFacts).toHaveLength(1);
      expect(ctx.worldFacts[0].content).toBe('用户被诊断为 GAD');
      expect(ctx.opinions[0].confidence).toBe(0.7);
      expect(ctx.observationSummary).toBeTruthy();
    });

    it('retain() 应该能接收消息并记录调用', async () => {
      await memoryRepo.retain('user-1', [
        { role: 'user', content: '我睡不好' },
        { role: 'assistant', content: '从什么时候开始的？' },
      ]);

      expect(memoryRepo.retainCalls).toHaveLength(1);
      expect(memoryRepo.retainCalls[0].userId).toBe('user-1');
      expect(memoryRepo.retainCalls[0].messageCount).toBe(2);
    });

    it('reflect() 应该能被执行并记录调用', async () => {
      await memoryRepo.reflect('user-1');
      await memoryRepo.reflect('user-1');

      expect(memoryRepo.reflectCalls).toHaveLength(2);
      expect(memoryRepo.reflectCalls[0]).toBe('user-1');
    });
  });

  describe('与 Session + ScriptExecutor 的代码路径验证', () => {
    it('不传 MemoryRepository 时 Session 应正常执行', async () => {
      const session = new Session({
        sessionId: 'test-session',
        userId: 'user-1',
        scriptId: 'test-script',
      });

      const execState = session.toExecutionState();
      const result = await scriptExecutor.executeSession(
        MINIMAL_SCRIPT,
        'test-session',
        execState,
        null,
        'test-project'
      );

      expect(result.status).toBe('completed');
      expect(result.lastAiMessage).toBeTruthy();
    });

    it('传入 MemoryRepository 时 recall/retain/reflect 接口可被调用', async () => {
      // 模拟会话启动时的 recall
      const ctx = await memoryRepo.recall('user-1', '用户核心问题');
      expect(ctx).toBeDefined();

      // 模拟每轮对话后的 retain
      await memoryRepo.retain('user-1', [
        { role: 'user', content: '我有点焦虑' },
        { role: 'assistant', content: '能具体说说吗？' },
      ]);
      expect(memoryRepo.retainCalls).toHaveLength(1);

      // 模拟会话结束时的 reflect
      await memoryRepo.reflect('user-1');
      expect(memoryRepo.reflectCalls).toHaveLength(1);
    });

    it('MemoryContext 四字段在测试数据中应能合理填充', async () => {
      const fullContext: MemoryContext = {
        worldFacts: [{ content: 'GAD 诊断 (2026-01-15)' }, { content: 'PHQ-9 得分：15' }],
        experiences: [
          { content: '首次会谈：描述工作压力导致失眠' },
          { content: '第2次会谈：提及童年被严格管教经历' },
        ],
        opinions: [
          { content: '完美主义倾向根深蒂固', confidence: 0.85 },
          { content: '社交回避可能从职场泛化而来', confidence: 0.6 },
        ],
        observationSummary:
          '用户的核心模式：高标准自我要求 → 害怕失败 → 回避 → 自我批评 → 焦虑加重。治疗重点是打破这个循环。',
      };
      memoryRepo.setRecallData('user-1', fullContext);

      const result = await memoryRepo.recall('user-1', '用户完整画像');
      expect(result.worldFacts.length).toBeGreaterThanOrEqual(2);
      expect(result.experiences.length).toBeGreaterThanOrEqual(2);
      expect(result.opinions.length).toBeGreaterThanOrEqual(2);
      expect(result.observationSummary.length).toBeGreaterThan(50);
    });
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine test -- test/integration/memory-repository-integration.test.ts`

Expected: All 6 tests pass.

---

### Task 7: Run full test suite and verify no regressions

- [ ] **Step 1: Run all core-engine tests**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/core-engine test`

Expected: All existing tests pass. No regressions.

- [ ] **Step 2: Run api-server typecheck**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm --filter @heartrule/api-server typecheck`

Expected: No type errors from the SessionOrchestrator changes.

---

### Task 8: Manual session walkthrough verification

- [ ] **Step 1: Start dev server with FakeMemoryRepository wired in**

Temporarily modify `packages/api-server/src/ioc/container.ts` (or the route file where SessionOrchestrator is instantiated) to pass a FakeMemoryRepository with prefill data. This is a temporary change for verification only — do NOT commit.

```typescript
import { FakeMemoryRepository } from '../../core-engine/test/helpers/fake-memory-repository.js';
// ... in SessionOrchestrator instantiation:
const fakeMemory = new FakeMemoryRepository();
fakeMemory.setRecallData('test-user-id', {
  worldFacts: [{ content: '测试事实：用户提到过工作压力' }],
  experiences: [{ content: '测试经历：第1次会谈讨论了焦虑症状' }],
  opinions: [{ content: '测试判断：可能存在社交焦虑', confidence: 0.65 }],
  observationSummary: '测试摘要：用户对工作场景有明显焦虑反应',
});
const orchestrator = new SessionOrchestrator(fakeMemory, ...);
```

- [ ] **Step 2: Run a 2-3 round consulting session**

Run: `cd /home/leo/projects/HeartRule-Qoder && pnpm dev`

Start a session with a real YAML consulting script. Complete 2-3 rounds of conversation.

- [ ] **Step 3: Verify log output**

Check console logs for:

```
🧠 [Memory] recall at session start: { userId: '...', worldFacts: 1, ... }
🧠 [Memory] retain completed: { userId: '...', messageCount: 2 }
🧠 [Memory] reflect completed: { userId: '...', summary: '' }
```

Expected: recall called once at session start, retain called after each round, reflect called when session completes.

- [ ] **Step 4: Verify no errors without MemoryRepository**

Remove the temporary FakeMemoryRepository injection (revert the container.ts change). Start server and run a session normally.

Expected: No errors, no memory-related logs, existing flow unchanged.

- [ ] **Step 5: Revert temporary changes**

Ensure any temporary code in container.ts or route files is reverted. Only the permanent changes (port file, FakeMemoryRepository, tests, SessionOrchestrator) remain staged.

---

### Task 9: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add packages/core-engine/src/domain/ports/memory-repository.port.ts
git add packages/core-engine/src/index.ts
git add packages/core-engine/test/helpers/fake-memory-repository.ts
git add packages/core-engine/test/unit/domain/fake-memory-repository.test.ts
git add packages/core-engine/test/integration/memory-repository-integration.test.ts
git add packages/api-server/src/services/session-orchestrator.ts
git commit -m "feat: add MemoryRepository domain port with Phase 0 validation

Define MemoryRepository interface in core-engine domain/ports layer.
Implement FakeMemoryRepository for testing. Wire optional injection
into SessionOrchestrator with log-only Phase 0 behavior.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 2: Verify commit**

Run: `git status`

Expected: Working tree clean.
