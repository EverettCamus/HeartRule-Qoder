# Phase 0: MemoryRepository 接口验证

> **关联**: [记忆框架设计](../../design/memory-framework.md) · 状态: 待批准
> **创建**: 2026-05-20

## 1. 目标

用最小成本验证 `MemoryRepository` 端口接口的形状和代码路径合理性，在引入 Hindsight 之前冻结接口。

## 2. 设计决策摘要

| 决策      | 选择                                                                     | 理由                                           |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 端口位置  | `domain/ports/`                                                          | 记忆是领域能力（理解来访者），非基础设施调用   |
| 验证方式  | 单元测试 + 集成测试 + 真实会话演练                                       | 形状验证 + 代码路径验证 + 时机验证             |
| 接口签名  | `retain(userId, messages)` / `recall(userId, query)` / `reflect(userId)` | 与设计文档一致，userId 是最小作用域            |
| 注入方式  | SessionOrchestrator 构造函数可选参数                                     | 与现有 pattern（scriptExecutor 可选参数）一致  |
| Fake 行为 | 纯数据桶                                                                 | Phase 0 验证接口形状和调用时机，不验证记忆质量 |
| 成功标准  | 测试全绿 + 真实脚本 2-3 轮对话演练通过                                   | 接口冻结需要实际路径验证                       |

## 3. 文件布局

```
新增:
  packages/core-engine/src/domain/ports/
    memory-repository.port.ts              # MemoryRepository 接口 + 类型

  packages/core-engine/test/helpers/
    fake-memory-repository.ts              # FakeMemoryRepository

  packages/core-engine/test/unit/domain/
    fake-memory-repository.test.ts         # 独立单元测试

  packages/core-engine/test/integration/
    memory-repository-integration.test.ts  # 通过 SessionOrchestrator 集成测试

修改:
  packages/core-engine/src/index.ts                         # 导出新端口
  packages/api-server/src/services/session-orchestrator.ts  # 添加可选 memoryRepository
```

## 4. 接口定义

```typescript
// domain/ports/memory-repository.port.ts

interface MemoryRepository {
  retain(userId: string, messages: Message[]): Promise<void>;
  recall(userId: string, query: string): Promise<MemoryContext>;
  reflect(userId: string): Promise<ReflectionResult>;
}

// Phase 0: MemoryContext 四字段是核心抽象（与 Hindsight 四网络对应）。
// 子类型先用轻量占位，Phase 1 集成 Hindsight 时再定型完整字段。
interface MemoryContext {
  worldFacts: Array<{ content: string }>;
  experiences: Array<{ content: string }>;
  opinions: Array<{ content: string; confidence: number }>;
  observationSummary: string;
}

// Phase 0: reflect 是 no-op，不需要复杂返回值。
// Phase 4 矛盾检测时才需要完整的 ReflectionResult 结构。
interface ReflectionResult {
  summary: string;
}

// 跨越 retain 边界的消息结构。
// 使用简化 Message，不直接耦合 domain/message.ts 的 Message 类。
interface Message {
  role: string;
  content: string;
  timestamp?: Date;
}
```

## 5. FakeMemoryRepository

- `retain()`: 将 messages 存入内存 Map，按 userId 分组
- `recall()`: 从预填充数据返回 MemoryContext（纯数据桶，不做语义检索）
- `reflect()`: no-op，记录调用日志

用于测试和 Phase 0 验证。不依赖任何外部服务。

## 6. SessionOrchestrator 集成

在构造函数添加可选参数 `memoryRepository?: MemoryRepository`：

```
Constructor(memoryRepository?: MemoryRepository, scriptExecutor?, ...)
```

调用时机（Phase 0 仅做日志输出）：

| 时机                       | 操作                            | Phase 0 行为                                                                  |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `initializeSession()` 末尾 | `recall(userId, query)`         | 调用后记录日志，结果暂不注入 LLM 上下文（注入需要模板系统改动，留给 Phase 1） |
| `processUserInput()` 末尾  | `retain(userId, roundMessages)` | 异步调用，记录日志                                                            |
| 会话完成时                 | `reflect(userId)`               | 调用后记录日志                                                                |

## 7. 测试

### 7.1 单元测试 (`fake-memory-repository.test.ts`)

- retain 后可通过检查内部状态验证存储
- recall 返回预填充 MemoryContext
- reflect 记录调用次数
- 多用户隔离验证

### 7.2 集成测试 (`memory-repository-integration.test.ts`)

- 构造 SessionOrchestrator，注入 FakeMemoryRepository
- 使用最小 YAML 脚本（1 phase, 1 topic, 1 ai_say）
- 执行 `executeScript`，验证 retain/recall/reflect 在正确时机被调用
- 验证不传 memoryRepository 时正常执行（向后兼容）

### 7.3 真实会话演练

- 启动 dev server
- 使用真实咨询脚本，走 2-3 轮对话
- 检查 retain/recall/reflect 调用日志是否符合预期时机

## 8. 接口冻结条件

1. 单元测试 + 集成测试全部通过
2. 真实会话演练中 retain/recall/reflect 调用时机正确
3. MemoryContext 四字段在 recall 场景中够用（至少测试数据能合理填充）
4. 不传 memoryRepository 时现有流程不受影响

冻结后，`MemoryRepository` 接口成为 Phase 1 `HindsightMemoryAdapter` 实现的契约基础。

## 9. 不做的事

- 不修改 AiThinkAction（留给 Phase 2）
- 不修改 LLM 模板系统注入记忆上下文（留给 Phase 1）
- 不实现语义检索或向量存储
- 不移除现有 MemoryEngine 存根和 memories 表（留给 Phase 2）
- 不在 Hindsight Docker 中部署
