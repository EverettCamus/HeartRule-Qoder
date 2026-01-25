# ai_ask 变量提取回归测试文档

## BUG 概述

**问题**：在 ai_ask 动作的多轮对话过程中，提取的变量（如"来访者称呼"）未能存储到 variableStore 的 topic 级别，导致前端变量气泡无法显示这些变量。

**根本原因**：
- `script-executor.ts` 的 `continueAction` 分支中，当 `result.completed = false` 时直接返回
- 跳过了变量写入 variableStore 的逻辑（第253-309行）
- 变量提取成功但未持久化到状态中

**修复方案**：
- 在 `result.completed = false` 分支内添加变量提取和写入 variableStore 的逻辑
- 确保即使 action 未完成也能处理已提取的变量

## 测试文件

### 1. 核心引擎层测试

**文件路径**: `packages/core-engine/test/ai-ask-incomplete-action.test.ts`

**测试覆盖**:

#### 场景1: ai_ask 未完成时的变量提取
- ✓ 应该在 action 未完成时也能提取并存储变量到 topic 作用域
- ✓ 应该在多轮对话中累积提取变量
- ✓ 应该在变量值更新时保留历史元数据

#### 场景2: variableStore 嵌套结构验证
- ✓ 应该正确创建嵌套的 phase/topic 结构
- ✓ 应该支持跨作用域的变量存储

#### 场景3: 默认作用域规则
- ✓ 未定义的变量应默认存入 topic 作用域
- ✓ output 配置中的变量应遵循默认 topic 作用域

#### 场景4: 边界条件测试
- ✓ 应该处理空的 extractedVariables
- ✓ 应该处理特殊字符的变量名
- ✓ 应该处理 null 和 undefined 值

**测试运行**:
```bash
pnpm test -- ai-ask-incomplete-action
```

### 2. API 层测试

**文件路径**: `packages/api-server/test-variable-store-flatten.test.ts`

**测试覆盖**:

#### 场景1: 扁平化逻辑测试
- ✓ 应该将嵌套的 topic 结构扁平化为当前 topic 的变量
- ✓ 应该处理空的 variableStore
- ✓ 应该处理不存在的 phaseId 或 topicId

#### 场景2: API 响应格式验证
- ✓ API 响应应包含 8 个字段（包括 variableStore）
- ✓ variableStore 应包含四个作用域字段
- ✓ variableStore.topic 应该是扁平结构而非嵌套结构

#### 场景3: 完整的变量提取流程模拟
- ✓ 应该模拟完整的 ai_ask 变量提取和扁平化流程

**测试运行**:
```bash
pnpm test -- variable-store-flatten
```

## 测试结果

```
✓ packages/core-engine/test/ai-ask-incomplete-action.test.ts (10 passed)
✓ packages/api-server/test-variable-store-flatten.test.ts (7 passed)

Total: 17 tests passed
```

## 关键测试点

### 1. 变量提取时机验证
测试确认即使 `action.completed = false`，提取的变量也能正确存储到 variableStore。

### 2. 作用域规则验证
测试确认未定义的变量默认存入 topic 作用域，符合最小生命周期原则。

### 3. 数据结构验证
测试确认：
- 后端使用嵌套结构存储（`topic[topicId][varName]`）
- 扁平化后返回平面结构（`topic[varName]`）
- 前端接收到正确的数据格式

### 4. 边界条件验证
测试覆盖：
- 空变量集合
- 特殊字符变量名
- null/undefined 值处理
- 跨作用域变量存储

## 防御性编程建议

### 1. 在修改 script-executor 时
确保在所有返回点之前都处理了 `extractedVariables`：
```typescript
if (result.extractedVariables && executionState.variableStore) {
  // 写入 variableStore
}
```

### 2. 在修改 session-manager 时
确保返回前调用 `flattenVariableStore`：
```typescript
variableStore: this.flattenVariableStore(executionState.variableStore, {
  phaseId: executionState.currentPhaseId,
  topicId: executionState.currentTopicId,
})
```

### 3. 在修改 API schema 时
确保响应 schema 包含 variableStore 字段：
```typescript
variableStore: {
  type: 'object',
  properties: {
    global: { type: 'object', additionalProperties: true },
    session: { type: 'object', additionalProperties: true },
    phase: { type: 'object', additionalProperties: true },
    topic: { type: 'object', additionalProperties: true },
  },
}
```

## 相关文件

### 修改的核心文件
1. `packages/core-engine/src/engines/script-execution/script-executor.ts` (行200-260)
   - 添加了未完成 action 的变量提取逻辑

2. `packages/api-server/src/services/session-manager.ts` (行38-62, 614-617)
   - 添加了 `flattenVariableStore` 方法
   - 在返回时调用扁平化方法

3. `packages/api-server/src/routes/sessions.ts` (行378-386, 499)
   - 添加了 API schema 的 variableStore 字段定义
   - 确保响应包含 variableStore

4. `packages/script-editor/src/api/debug.ts`
   - 添加了 TypeScript 类型定义

5. `packages/script-editor/src/components/DebugChatPanel/index.tsx` (行651-657)
   - 优先使用 variableStore 而非旧的分类逻辑
   - 添加了调试日志

### 测试文件
1. `packages/core-engine/test/ai-ask-incomplete-action.test.ts` (新增)
2. `packages/api-server/test-variable-store-flatten.test.ts` (新增)

## 运行所有相关测试

```bash
# 运行所有测试
pnpm test

# 仅运行回归测试
pnpm test -- ai-ask-incomplete-action
pnpm test -- variable-store-flatten

# 监视模式
pnpm test:watch
```

## 持续集成建议

建议在 CI/CD 流程中：
1. 每次提交自动运行这些回归测试
2. 覆盖率要求：变量提取相关代码覆盖率 > 90%
3. 禁止在未通过测试的情况下合并到主分支

## 相关文档

- [变量作用域设计文档](../design/variable-scope-design.md)
- [ai_ask 配置文档](../design/ai-ask-configuration.md)
- [调试气泡设计文档](../design/debug-bubbles-design.md)
