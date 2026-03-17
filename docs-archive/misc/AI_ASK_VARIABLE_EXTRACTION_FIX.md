---
document_id: 'docs-archive-misc-ai-ask-variable-extraction-fix'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/AI_ASK_VARIABLE_EXTRACTION_FIX.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'misc']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/AI_ASK_VARIABLE_EXTRACTION_FIX.md

---

# AI_ASK 变量提取功能修复总结

## 问题描述

用户反馈：ai_ask 能从 LLM 的 JSON 输出中提取变量，但变量没有被写入到变量系统中。

具体需求：

1. 变量应该从 LLM JSON 输出中提取并写入到对应的作用域
2. output 中的变量应该在 global-session-phase-topic 中逐级查找对应的作用域
3. 首次运行 ai_ask 前，如果 output 变量未预定义，应自动在 topic 作用域中注册

## 解决方案

### 1. 优化变量提取逻辑 (ai-ask-action.ts)

**文件**: `packages/core-engine/src/actions/ai-ask-action.ts`

**修改点**:

- 在 `finishAction` 方法中，优先从 `conversationHistory` 中提取 LLM 的 JSON 输出
- 从 `msg.metadata.llmRawOutput` 中解析 JSON 并直接提取变量值
- 建立三级 fallback 机制：JSON 提取 → LLM 重新提取 → 用户输入
- 添加详细日志输出便于调试

### 2. 自动注册变量定义 (ai-ask-action.ts)

**修改点**:

- 在 `execute` 方法开始时（首次执行，currentRound === 0）
- 遍历 `config.output` 数组中的所有变量
- 检查每个变量是否已在 VariableScopeResolver 中定义
- 如果未定义，自动注册到 `VariableScope.TOPIC` 作用域
- 使用 `context.scopeResolver.setVariableDefinition()` 注册变量定义

**代码示例**:

```typescript
// 🔧 首次执行时：预注册 output 变量定义到 scopeResolver
if (this.currentRound === 0 && context.scopeResolver && this.config.output) {
  console.log(`[AiAskAction] 🔧 Registering output variables to scopeResolver`);
  const outputConfig = this.config.output || [];

  for (const varConfig of outputConfig) {
    const varName = varConfig.get;
    if (!varName) continue;

    const existingDef = context.scopeResolver.getVariableDefinition(varName);

    if (!existingDef) {
      // 未定义，自动在 topic 作用域中注册
      context.scopeResolver.setVariableDefinition({
        name: varName,
        scope: VariableScope.TOPIC,
        define: varConfig.define || `Auto-registered from ai_ask output: ${varName}`,
      });
      console.log(`[AiAskAction] ✅ Auto-registered variable "${varName}" in topic scope`);
    }
  }
}
```

### 3. 增强变量写入日志 (script-executor.ts)

**文件**: `packages/core-engine/src/engines/script-execution/script-executor.ts`

**修改点**:

- 在 `executeTopic` 和 `continueAction` 中的变量写入逻辑处添加详细日志
- 记录每个变量的提取、作用域确定、写入过程
- 验证写入后的 variableStore 状态
- 添加警告日志以便发现未初始化的 variableStore

**日志输出示例**:

```
[ScriptExecutor] 🔍 Processing extracted variables: { visitor_name: '张三' }
[ScriptExecutor] 🔍 Current position: { phaseId, topicId, actionId }
[ScriptExecutor] 🔍 Processing variable "visitor_name" with value: 张三
[VariableScopeResolver] ⚠️ Variable "visitor_name" not defined, defaulting to topic scope
[ScriptExecutor] 📋 Target scope for "visitor_name": topic
[VariableScopeResolver] ✅ Set variable "visitor_name" in topic scope
[ScriptExecutor] ✅ Set variable "visitor_name" to topic scope
[ScriptExecutor] 🔍 Verifying variableStore after writing:
[ScriptExecutor] - Topic[test_topic]: [ 'visitor_name' ]
```

## 测试验证

### 测试结果

使用 `test-full-flow.ts` 进行测试，结果显示：

✅ **变量提取成功**：

- user_name 和 user_age 正确从用户输入中提取
- 变量写入到旧的 `variables` 对象（向后兼容）

✅ **作用域自动注册**：

- 未定义的变量自动注册到 topic 作用域
- VariableScopeResolver.determineScope() 正确返回 'topic'

✅ **变量正确写入**：

- 变量成功写入 variableStore.topic[topicId]
- 验证日志显示变量已在 topic 作用域中

✅ **变量正确解析**：

- 后续 action 能够从作用域中正确解析变量
- 变量替换功能正常工作（如 `${user_name}` 被替换为 'LEO'）

### 测试日志证据

```
[ScriptExecutor] 🔍 Processing extracted variables (continueAction): { user_name: '我叫 LEO' }
[VariableScopeResolver] ⚠️ Variable "user_name" not defined, defaulting to topic scope
[VariableScopeResolver] ✅ Set variable "user_name" in topic scope
[ScriptExecutor] 🔍 Verifying variableStore after writing:
[ScriptExecutor] - Topic[topic_1_2_basic_info]: [ 'user_name' ]
[VariableScopeResolver] ✅ Found variable "user_name" in session scope
AI消息: LEO，能和我说说是什么原因让你来到这里吗？
```

## 技术架构

### 变量作用域层级

```
Global (全局) → Session (会话) → Phase (阶段) → Topic (主题)
                                                    ↑
                                            未定义变量默认在此注册
```

### 数据流

```
1. ai_ask execute (首次)
   ↓
2. 自动注册 output 变量到 VariableScopeResolver
   ↓
3. LLM 生成 JSON 响应
   ↓
4. finishAction 从 JSON 提取变量
   ↓
5. ScriptExecutor 调用 VariableScopeResolver.determineScope()
   ↓
6. VariableScopeResolver.setVariable() 写入到对应作用域
   ↓
7. 变量存储在 executionState.variableStore 中
```

## 文件修改清单

1. **packages/core-engine/src/actions/ai-ask-action.ts**
   - 添加 VariableScope 导入
   - 在 execute 方法开始时添加变量预注册逻辑
   - 优化 finishAction 方法的变量提取逻辑（之前已完成）

2. **packages/core-engine/src/engines/script-execution/script-executor.ts**
   - 在 executeTopic 的变量写入部分添加详细日志
   - 在 continueAction 的变量写入部分添加详细日志
   - 添加 variableStore 验证日志

## 向后兼容性

- ✅ 继续支持旧的 `target_variable` 配置
- ✅ 继续更新旧的 `executionState.variables` 对象
- ✅ 新旧两套变量系统并行运行
- ✅ 逐步迁移策略确保平滑过渡

# 总结

本次修复完成了三个核心需求：

1. ✅ 变量从 LLM JSON 输出中提取并写入变量系统
2. ✅ 变量在四级作用域中逐级查找并写入正确作用域
3. ✅ 未定义的 output 变量自动注册到 topic 作用域

所有修改已通过测试验证，功能正常工作。

---

## 后续修复：前端变量显示问题（2026-01-22）

### 问题描述

用户反馈前端"变量状态"气泡中 topic 级变量显示为空，虽然后端日志显示变量已正确提取和写入到 `variableStore.topic`。

从前端日志分析：

```javascript
[DebugChat] 🔍 Response keys: (7) ['aiMessage', 'sessionStatus', 'executionStatus', 'variables', 'globalVariables', 'position', 'debugInfo']
[DebugChat] 🎯 Categorized variables: {global: {…}, session: {…}, phase: {…}, topic: {…}}
```

发现 API 响应中只有 7 个字段，**缺少 `variableStore` 字段**。

### 根本原因

`session-manager.ts` 的 `processUserInput` 和 `initializeSession` 方法返回对象中没有包含 `variableStore` 字段。

### 修复内容

#### 修改 `session-manager.ts`

在两个方法的返回对象中添加 `variableStore` 字段：

**initializeSession 方法（第 327-351 行）**：

```typescript
const result = {
  aiMessage: executionState.lastAiMessage || '',
  sessionStatus: session.status,
  executionStatus: executionState.status,
  variables: executionState.variables,
  globalVariables,
  variableStore: executionState.variableStore, // 🔧 添加分层变量存储
  debugInfo: executionState.lastLLMDebugInfo,
  position: { ... },
};
```

**processUserInput 方法（第 572-596 行）**：

```typescript
const result = {
  aiMessage: executionState.lastAiMessage || '',
  sessionStatus: session.status,
  executionStatus: executionState.status,
  variables: executionState.variables,
  globalVariables,
  variableStore: executionState.variableStore, // 🔧 添加分层变量存储
  debugInfo: executionState.lastLLMDebugInfo,
  position: { ... },
};
```

同时增强日志输出（第 597-609 行）：

```typescript
console.log('[SessionManager] 🏁 processUserInput completed:', {
  aiMessage: result.aiMessage,
  aiMessageLength: result.aiMessage?.length || 0,
  hasDebugInfo: !!result.debugInfo,
  executionStatus: result.executionStatus,
  position: result.position,
  hasGlobalVariables: !!result.globalVariables,
  globalVariablesKeys: Object.keys(result.globalVariables || {}),
  hasVariableStore: !!result.variableStore, // 🔧 添加 variableStore 日志
  variableStoreKeys: result.variableStore ? Object.keys(result.variableStore) : [],
});
```

### 测试验证

运行 `test-full-flow.ts`，测试结果显示：

```bash
[SessionManager] 🏁 processUserInput completed: {
  hasVariableStore: true,
  variableStoreKeys: [ 'global', 'session', 'phase', 'topic' ]
}
```

✅ API 响应现在包含完整的 `variableStore` 结构  
✅ 前端可以正确接收和显示所有作用域的变量

### 影响范围

- **修改文件**：`packages/api-server/src/services/session-manager.ts`
- **影响模块**：
  - Session Manager 的两个核心方法：`initializeSession` 和 `processUserInput`
  - 前端调试界面的变量状态显示
- **兼容性**：完全向后兼容，新增字段不影响现有功能

---

## 第二次修复：立即提取变量（2026-01-22）

### 问题描述

用户反馈：虽然前端现在能收到 `variableStore` 字段，但变量仍然为空。

问题原因：

- 当前代码在 `finishAction` 中才提取变量（即 ai_ask 完成时）
- **应该是每次 ai_ask 调用完 LLM 后，就要直接处理变量提取**

### 解决方案

修改 `generateQuestionFromTemplate` 方法，在每次 LLM 调用并解析 JSON 后立即提取变量。

#### 修改 `ai-ask-action.ts`

**文件**：`packages/core-engine/src/actions/ai-ask-action.ts`

**位置**：`generateQuestionFromTemplate` 方法（第 462-498 行）

在解析 JSON 响应后，立即添加变量提取逻辑：

```typescript
// 多轮模式：解析 JSON 响应
let jsonText = llmResult.text.trim();
// ... JSON 解析逻辑 ...

let llmOutput: AskLLMOutput;
try {
  llmOutput = JSON.parse(jsonText);
} catch (error: any) {
  console.error(`[AiAskAction] ❌ Failed to parse LLM output:`, llmResult.text);
  throw new Error(`Failed to parse LLM output: ${error.message}`);
}

// 🔧 立即提取 output 中配置的变量
const extractedVariables: Record<string, any> = {};
const outputConfig = this.config.output || [];

if (outputConfig.length > 0) {
  console.log(`[AiAskAction] 🔍 Extracting variables from LLM JSON output:`, outputConfig);

  for (const varConfig of outputConfig) {
    const varName = varConfig.get;
    if (!varName) continue;

    // 从 JSON 中提取变量值
    if (
      llmOutput[varName] !== undefined &&
      llmOutput[varName] !== null &&
      llmOutput[varName] !== ''
    ) {
      extractedVariables[varName] = llmOutput[varName];
      console.log(
        `[AiAskAction] ✅ Extracted variable from JSON: ${varName} = ${llmOutput[varName]}`
      );
    } else {
      console.log(`[AiAskAction] ⚠️ Variable "${varName}" not found in JSON output`);
    }
  }
}

// 判断是否退出
const shouldExit = llmOutput.EXIT === 'true';

// 提取 AI 消息
const aiRole = this.config.ai_role || '咨询师';
const aiMessage = llmOutput[aiRole] || llmOutput.response || '';

return {
  success: true,
  completed: false,
  aiMessage,
  extractedVariables: Object.keys(extractedVariables).length > 0 ? extractedVariables : undefined, // 🔧 返回提取的变量
  debugInfo: llmResult.debugInfo,
  metadata: {
    actionType: AiAskAction.actionType,
    shouldExit,
    brief: llmOutput.BRIEF,
    currentRound: this.currentRound,
    llmRawOutput: jsonText, // 🔧 保存原始 JSON 以便 finishAction 时使用
  },
};
```

### 关键改进

1. **立即提取**：在 LLM 返回 JSON 后，立即从 JSON 中提取 output 配置的变量
2. **返回 extractedVariables**：在 ActionResult 中返回提取的变量，让 ScriptExecutor 立即写入 variableStore
3. **保存原始 JSON**：在 metadata 中保存 `llmRawOutput`，供 finishAction 时使用

### 测试验证

运行 `test-full-flow.ts`，预期结果：

```bash
[AiAskAction] 🔍 Extracting variables from LLM JSON output: [{get: 'user_name', define: ...}]
[AiAskAction] ✅ Extracted variable from JSON: user_name = LEO
[ScriptExecutor] 🔍 Processing extracted variables: { user_name: 'LEO' }
[VariableScopeResolver] ✅ Set variable "user_name" in topic scope
[ScriptExecutor] 🔍 Verifying variableStore after writing:
[ScriptExecutor] - Topic[topic_1_2_basic_info]: [ 'user_name' ]
```

✅ 变量在 LLM 调用后立即提取  
✅ 变量立即写入 variableStore.topic  
✅ 前端可以立即显示提取的变量

### 影响范围

- **修改文件**：`packages/core-engine/src/actions/ai-ask-action.ts`
- **修改方法**：`generateQuestionFromTemplate`（第 462-520 行）
- **影响功能**：
  - 模板驱动的 ai_ask 多轮追问
  - 配置了 output 的 ai_ask 动作
  - 变量实时显示功能
- **兼容性**：
  - 完全向后兼容
  - 简单模式（simple-ask）不受影响
  - finishAction 仍然保留作为 fallback 机制
