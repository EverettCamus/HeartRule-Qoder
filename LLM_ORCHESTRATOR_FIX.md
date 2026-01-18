# LLM 调试信息丢失问题修复

## 问题描述

**现象**：
- 首条 ai_say 消息能调用 LLM 并生成自然语言
- 但后续的 ai_say（从序列化状态恢复的）不调用 LLM
- 后端日志显示：`[AiSayAction] ⚠️ LLMOrchestrator not available, using template content directly`
- 前端无法看到 LLM 提示词和响应气泡

## 根本原因

在 `ScriptExecutor.deserializeActionState()` 中，使用了全局的 `createAction` 函数而不是 `this.createAction` 方法。

**问题代码**：
```typescript
private deserializeActionState(actionState: any): BaseAction {
  const action = createAction(actionState.actionType, actionState.actionId, actionState.config);
  // ❌ createAction 是全局函数，不会为 ai_say 传递 LLMOrchestrator
  ...
}
```

**原因分析**：

1. **首次创建 Action**（初始化时）：
   - 调用 `this.createAction(actionConfig)`
   - 对于 ai_say，会传递 `this.llmOrchestrator`
   - ✅ LLM 正常工作

2. **恢复 Action**（从序列化状态）：
   - 调用 `createAction(...)` 全局函数
   - 全局函数不知道 LLMOrchestrator
   - ❌ ai_say 的 `llmOrchestrator` 为 undefined

## 解决方案

修改 `deserializeActionState` 使用 `this.createAction`：

**修复代码**：
```typescript
private deserializeActionState(actionState: any): BaseAction {
  // 使用 this.createAction 而不是 createAction，确保 ai_say 能获得 LLMOrchestrator
  const action = this.createAction({
    action_type: actionState.actionType,
    action_id: actionState.actionId,
    config: actionState.config,
  });
  // ✅ ai_say 现在能获得 LLMOrchestrator
  ...
}
```

## 修复文件

**文件**: `packages/core-engine/src/engines/script-execution/script-executor.ts`

**修改内容**：
- 第 569-575 行：`deserializeActionState` 方法
- 将 `createAction(...)` 改为 `this.createAction({...})`

## 影响范围

**修复后**：
1. ✅ 所有 ai_say Action（包括从序列化状态恢复的）都能调用 LLM
2. ✅ 每次对话都会生成 LLM 调试信息
3. ✅ 前端能看到蓝色的 LLM 提示词气泡和紫色的 LLM 响应气泡
4. ✅ AI 消息都是经过 LLM 改写的自然表达

## 验证方法

1. **重启服务器**（编译后自动重启）
2. **刷新编辑器页面**
3. **开始调试会话**
4. **发送第一条消息**（如"你好"）
5. **观察后端日志**，应该看到：
   ```
   [AiSayAction] 🤖 Using LLM to generate natural expression
   [AiSayAction] ✅ LLM generated: [自然化的文本]
   [ScriptExecutor] 💾 Saved LLM debug info: { hasPrompt: true, hasResponse: true, model: 'deepseek-v3-250324' }
   ```
6. **观察前端控制台**：
   ```javascript
   [DebugChat] ✅ API Response received: {
     ...
     hasDebugInfo: true,  // ✅ 应该是 true
     debugInfo: {...}     // ✅ 应该有完整内容
   }
   [DebugChat] 📍 Received LLM debugInfo: {...}
   [DebugChat] ✅ Created LLM prompt and response bubbles
   ```
7. **在调试面板中看到**：
   - 🔵 蓝色的 LLM 提示词气泡
   - 🟣 紫色的 LLM 响应气泡

## 技术细节

### Action 生命周期

```
1. 首次创建（初始化）
   └─> this.createAction(actionConfig)
       └─> ai_say: new AiSayAction(id, config, llmOrchestrator) ✅

2. 等待用户输入
   └─> serializeActionState(action)
       └─> 保存到 metadata.actionState

3. 恢复执行（用户输入后）
   └─> deserializeActionState(actionState)
       └─> 之前: createAction(...)  ❌ 丢失 llmOrchestrator
       └─> 现在: this.createAction(...) ✅ 保留 llmOrchestrator
```

### this.createAction 方法

```typescript
private createAction(actionConfig: any): BaseAction {
  const actionType = actionConfig.action_type;
  const actionId = actionConfig.action_id;
  const config = actionConfig.config || {};

  // 对于 ai_say Action，传递 LLMOrchestrator
  if (actionType === 'ai_say') {
    return new AiSayAction(actionId, config, this.llmOrchestrator);
  }

  // 其他 Action 类型使用默认创建方式
  return createAction(actionType, actionId, config);
}
```

## 相关修改

1. **ai_say 默认调用 LLM**（已完成）
   - 移除了 `use_llm: true` 配置要求
   - 默认调用 LLM 生成自然语言

2. **LLM 调试信息保存**（已完成）
   - ScriptExecutor 保存 debugInfo 到 executionState
   - SessionManager 返回 debugInfo 在 API 响应中

3. **Action 状态恢复**（本次修复）
   - 确保恢复的 Action 能获得 LLMOrchestrator

---

## 总结

✅ **修复了 Action 状态恢复时 LLMOrchestrator 丢失的问题**  
✅ **现在所有 ai_say 都能调用 LLM**  
✅ **LLM 调试信息完整传递到前端**  
✅ **调试气泡正常显示**
