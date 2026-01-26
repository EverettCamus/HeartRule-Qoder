# 调试信息管道化设计文档

> DDD 第三阶段重构 - Story 2: 调试信息管道化

## 目标

定义统一的调试信息结构与传输路径，确保在脚本编辑器中提供与领域模型一致的调试视图。

## 调试信息流转架构

```
LLMProvider (生成) 
  ↓ LLMDebugInfo
LLMOrchestrator (编排)
  ↓ LLMGenerateResult { text, debugInfo }
Action.execute() (执行)
  ↓ ActionResult { debugInfo }
ScriptExecutor (协调)
  ↓ ExecutionState { lastLLMDebugInfo }
SessionApplicationService (应用服务)
  ↓ SessionExecutionResponse { debugInfo }
API Layer (HTTP 响应)
  ↓ SessionResponse { debugInfo }
Script Editor (前端展示)
```

## 核心类型定义

### 1. LLMDebugInfo (核心调试信息)

**位置**: `packages/core-engine/src/engines/llm-orchestration/orchestrator.ts`

```typescript
export interface LLMDebugInfo {
  prompt: string;              // 完整的提示词
  response: any;               // 原始响应（JSON格式）
  model: string;               // 使用的模型
  config: Partial<LLMConfig>;  // LLM配置
  timestamp: string;           // 调用时间
  tokensUsed?: number;         // 使用的token数
}
```

**职责**:
- 捕获单次 LLM 调用的完整上下文
- 记录 prompt、response、config 等关键信息
- 提供 token 使用统计（如果 LLM 提供者支持）

### 2. ActionResult (Action 执行结果)

**位置**: `packages/core-engine/src/actions/base-action.ts`

```typescript
export interface ActionResult {
  success: boolean;
  completed: boolean;
  aiMessage?: string | null;
  extractedVariables?: Record<string, any> | null;
  nextAction?: string | null;
  error?: string | null;
  metadata?: Record<string, any>;
  debugInfo?: LLMDebugInfo;  // 传递 LLM 调试信息
}
```

**职责**:
- Action 执行后将 LLM 调试信息向上传递
- 保持调试信息与业务结果的关联性

### 3. ExecutionState (临时执行状态)

**位置**: `packages/core-engine/src/engines/script-execution/script-executor.ts`

```typescript
export interface ExecutionState {
  // ... 其他状态字段
  lastLLMDebugInfo?: LLMDebugInfo;  // 最近一次 LLM 调用的调试信息
}
```

**职责**:
- 在脚本执行过程中暂存调试信息
- 支持 Action 未完成时也保留调试信息（如 ai_ask 的多轮对话）

### 4. SessionExecutionResponse (应用服务响应)

**位置**: `packages/core-engine/src/application/session-application-service.ts`

```typescript
export interface SessionExecutionResponse {
  aiMessage: string;
  executionStatus: ExecutionStatus;
  position: ExtendedExecutionPosition;
  variables: Record<string, unknown>;
  variableStore?: { ... };
  debugInfo?: LLMDebugInfo;  // 传递给 API 层
  error?: { ... };
}
```

**职责**:
- 作为防腐层，将核心引擎的调试信息传递给 API 层
- 保持接口的稳定性与版本兼容

### 5. API Layer Response

**位置**: `packages/api-server/src/routes/sessions.ts` (SessionResponse)

```typescript
// 当前实现已包含 debugInfo 字段
interface SessionResponse {
  // ... 其他字段
  debugInfo?: any;  // LLM 调试信息
}
```

**职责**:
- 将调试信息转换为 HTTP 响应
- 根据环境配置决定是否返回调试信息（生产环境可能禁用）

## 调试信息传递规则

### 规则 1: 单一来源原则

调试信息只在 LLMProvider 层生成，所有上层只负责传递，不修改内容。

### 规则 2: 最近调用原则

ExecutionState 和 SessionExecutionResponse 只保留**最近一次** LLM 调用的调试信息。

**原因**:
- 用户通常只关心当前 Action 的 LLM 调用
- 避免调试信息累积导致响应体过大

### 规则 3: 可选传递原则

所有接口中 `debugInfo` 均为可选字段，上层可根据配置决定是否传递。

**场景**:
- 开发环境：完整传递
- 生产环境：可配置为不返回或只返回摘要信息

### 规则 4: Action 未完成也传递

即使 Action 未完成（`completed: false`），也应传递调试信息。

**场景**:
- `ai_ask` 在第一轮提问时，Action 未完成但已调用 LLM 生成问题
- 用户需要查看问题生成的 prompt 与 response

## 实现检查清单

### ✅ 已实现

- [x] LLMDebugInfo 类型定义（orchestrator.ts）
- [x] LLMProvider 中捕获调试信息
- [x] ActionResult 中传递 debugInfo
- [x] ExecutionState 中保存 lastLLMDebugInfo
- [x] ScriptExecutor 在 Action 完成和未完成时都保存调试信息
- [x] SessionExecutionResponse 接口定义（session-application-service.ts）

### ⏳ 待验证

- [ ] API 层是否正确传递 debugInfo 到 HTTP 响应
- [ ] 脚本编辑器是否正确展示调试信息
- [ ] 调试信息是否与领域模型一致（位置信息、Action ID 等）

### 🔜 待增强

- [ ] 添加调试信息过滤器（根据环境配置）
- [ ] 添加调试信息摘要模式（只返回 prompt/response 的前 N 个字符）
- [ ] 添加调试信息持久化机制（可选，用于问题排查）

## 领域模型一致性

调试信息应与以下领域概念保持一致：

### 位置信息关联

调试信息应携带以下上下文：
- **Session ID**: 会话标识
- **Action ID**: 触发 LLM 调用的 Action 标识
- **Phase/Topic/Action Index**: 执行位置

**当前状态**: ❌ LLMDebugInfo 中未包含位置信息

**建议**: 在 ActionResult 或 SessionExecutionResponse 中通过 `metadata` 字段补充位置信息。

### 变量快照关联

调试信息应记录 LLM 调用时的变量快照，用于重现问题。

**当前状态**: ❌ 未实现

**建议**: 在 Action 执行时，将当前 variableStore 的快照附加到 debugInfo 中。

## 使用示例

### 1. 在 Action 中传递调试信息

```typescript
// ai-ask-action.ts
async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
  const result = await this.orchestrator.generateText(prompt, config);
  
  return {
    success: true,
    completed: false,
    aiMessage: result.text,
    debugInfo: result.debugInfo,  // 传递调试信息
  };
}
```

### 2. 在 ScriptExecutor 中保存调试信息

```typescript
// script-executor.ts
if (result.debugInfo) {
  executionState.lastLLMDebugInfo = result.debugInfo;
  console.log('[ScriptExecutor] 💾 Saved LLM debug info');
}
```

### 3. 在应用服务中返回调试信息

```typescript
// session-application-service.ts (未来实现)
async processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse> {
  const executionState = await scriptExecutor.continueExecution(...);
  
  return {
    aiMessage: executionState.lastAiMessage,
    executionStatus: executionState.status,
    position: ...,
    variables: ...,
    debugInfo: executionState.lastLLMDebugInfo,  // 返回调试信息
  };
}
```

### 4. 在 API 层中过滤调试信息

```typescript
// sessions.ts
const response = {
  ...sessionExecutionResponse,
  debugInfo: process.env.NODE_ENV === 'production' 
    ? undefined  // 生产环境禁用
    : sessionExecutionResponse.debugInfo,
};
```

## 测试建议

### 单元测试

1. **LLMProvider 测试**: 验证 debugInfo 包含完整的 prompt/response/config
2. **Action 测试**: 验证 ActionResult.debugInfo 正确传递
3. **ScriptExecutor 测试**: 验证 lastLLMDebugInfo 在 Action 完成和未完成时都能保存

### 集成测试

1. **端到端测试**: 验证调试信息从 LLM 调用到 HTTP 响应的完整流转
2. **多轮对话测试**: 验证 ai_ask 多轮场景下每轮的调试信息都能正确更新

### 回归测试

1. **环境配置测试**: 验证生产环境下调试信息能被正确过滤
2. **性能测试**: 验证调试信息不会显著增加响应体大小

## 版本兼容策略

### 向后兼容

- 所有 debugInfo 字段均为可选，旧版本客户端可忽略
- API 响应中 debugInfo 为 undefined 时不序列化到 JSON（减少体积）

### 向前兼容

- 未来可能扩展 LLMDebugInfo 添加新字段（如 latency, retryCount）
- 新字段应保持可选，避免破坏现有客户端

## 相关文档

- [DDD 分析与重构计划](../../docs/design/ddd-analysis-refactor-plan.md)
- [开发指南 - 架构说明](../../docs/DEVELOPMENT_GUIDE.md)
- [LLM Debug 实现总结](../../packages/script-editor/LLM-DEBUG-IMPLEMENTATION-SUMMARY.md)

## 变更历史

- **2026-01-26**: 初始文档创建，定义调试信息管道化规范（DDD 第三阶段）
