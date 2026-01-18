# LLM 调试信息功能状态说明

## 当前状态

### ✅ 已完成
1. **后端 LLM 调试信息捕获机制** - 完整实现
   - [LLM Orchestrator](file:///c:/CBT/HeartRule-Qcoder/packages/core-engine/src/engines/llm-orchestration/orchestrator.ts) 捕获完整提示词和响应
   - [ActionResult](file:///c:/CBT/HeartRule-Qcoder/packages/core-engine/src/actions/base-action.ts) 支持 `debugInfo` 字段
   - [ExecutionState](file:///c:/CBT/HeartRule-Qcoder/packages/core-engine/src/engines/script-execution/script-executor.ts) 保存 `lastLLMDebugInfo`
   - [Session Manager](file:///c:/CBT/HeartRule-Qcoder/packages/api-server/src/services/session-manager.ts) 在 API 响应中返回 `debugInfo`

2. **前端 LLM 调试信息展示** - 完整实现
   - [LLMPromptBubble](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugBubbles/LLMPromptBubble.tsx) 组件（蓝色）
   - [LLMResponseBubble](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx) 组件（紫色）
   - [DebugChatPanel](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugChatPanel/index.tsx) 解析和渲染逻辑
   - 默认配置已开启显示（[debug.ts](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/types/debug.ts) L175-176）

### ⚠️ 待完成
**Actions 尚未真正集成 LLM**

目前的 Action 实现状态：

| Action 类型 | 当前实现 | LLM 集成状态 | 说明 |
|-----------|---------|------------|------|
| `ai_say` | ✅ 模板替换 | ⏳ 部分支持 | 支持 `use_llm` 配置但需传递 LLMOrchestrator |
| `ai_ask` | ✅ 提问验证 | ❌ 未集成 | 只做提问和输入验证，不调用 LLM |
| `ai_think` | ⚠️ MVP占位符 | ❌ 未集成 | 返回占位符，不调用 LLM |

## 问题原因

您看不到 LLM 调试信息气泡的根本原因：

**当前脚本中的 Actions 都不调用 LLM，所以不会产生 `debugInfo`**

从您的日志可以看到：
```javascript
[DebugChat] ✅ API Response received: {
  aiMessage: '向来访者询问如何称呼', 
  sessionStatus: 'active', 
  executionStatus: 'waiting_input', 
  hasVariables: true
  // ❌ 缺少 debugInfo 字段
}
```

API 响应中没有 `debugInfo` 字段，是因为：
1. 您的脚本中使用的 Actions（如 `ai_say`、`ai_ask`）没有调用 LLM
2. 它们只是使用模板替换或直接配置的文本
3. 所以不会生成 LLM 调试信息

## 解决方案

### 方案1：修改脚本启用 LLM（推荐用于测试）

在您的脚本 YAML 文件中，为 `ai_say` Action 添加 `use_llm: true` 配置：

```yaml
session:
  session_id: test_llm_debug
  session_name: LLM 调试测试
  phases:
    - phase_id: phase_1
      phase_name: 测试阶段
      topics:
        - topic_id: topic_1
          topic_name: 测试话题
          actions:
            - action_id: action_1
              action_type: ai_say
              config:
                content: "欢迎来到咨询会话"
                use_llm: true  # ⭐ 开启 LLM 生成
                require_acknowledgment: false
```

**注意**：目前这个功能还需要完整集成才能工作，因为 ScriptExecutor 还没有传递 LLMOrchestrator 给 Actions。

### 方案2：完成 LLM 集成（需要进一步开发）

需要修改以下组件：

1. **ScriptExecutor** - 创建并传递 LLMOrchestrator
   ```typescript
   // 在 ScriptExecutor 中
   private llmOrchestrator: LLMOrchestrator;
   
   constructor() {
     this.llmOrchestrator = new LLMOrchestrator({
       provider: 'volcano',
       model: 'deepseek-chat',
       // ... 配置
     });
   }
   ```

2. **Action 创建** - 传递 LLMOrchestrator
   ```typescript
   private createAction(actionConfig: any): BaseAction {
     const actionType = actionConfig.action_type;
     const actionId = actionConfig.action_id;
     const config = actionConfig.config || {};
     
     // 特殊处理需要 LLM 的 Actions
     if (actionType === 'ai_say') {
       return new AiSayAction(actionId, config, this.llmOrchestrator);
     }
     
     return createAction(actionType, actionId, config);
   }
   ```

3. **所有需要 LLM 的 Actions** - 接收并使用 LLMOrchestrator
   - ai_say ✅ 已修改（支持 `use_llm` 配置）
   - ai_ask ⏳ 待修改（可选：使用 LLM 生成更自然的问题）
   - ai_think ⏳ 待修改（使用 LLM 进行推理）

## 当前状态总结

| 组件 | 状态 | 说明 |
|-----|------|------|
| LLM 调试信息捕获 | ✅ 完成 | 已在 LLMOrchestrator 中实现 |
| 调试信息传递链路 | ✅ 完成 | Action → ExecutionState → SessionManager → API |
| 前端展示组件 | ✅ 完成 | 气泡组件、过滤器、渲染逻辑 |
| Actions LLM 集成 | ⏳ 进行中 | ai_say 部分支持，需完整集成 |
| ScriptExecutor 集成 | ❌ 待开发 | 需要创建并传递 LLMOrchestrator |

## 临时验证方法

如果要验证前端展示功能是否正常（不依赖真实 LLM 调用），可以在前端手动添加测试数据：

在 [DebugChatPanel/index.tsx](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugChatPanel/index.tsx) 的 `handleSendMessage` 函数中，临时添加：

```typescript
// 临时测试：手动创建 debugInfo
const testDebugInfo = {
  prompt: "System: 你是一位专业的心理咨询师\\n\\nUser: 你好\\n\\n请向用户询问姓名。",
  response: {
    text: response.aiMessage,
    finishReason: "stop",
    usage: {
      promptTokens: 125,
      completionTokens: 12,
      totalTokens: 137
    }
  },
  model: "deepseek-chat",
  config: { maxTokens: 1000, temperature: 0.7 },
  timestamp: new Date().toISOString(),
  tokensUsed: 137
};

// 使用测试数据创建气泡
if (true) {  // 临时：总是创建测试气泡
  const debugInfo = testDebugInfo;
  // ... 后续创建气泡的代码
}
```

这样可以先验证前端展示是否正常，然后再完成后端集成。

## 下一步建议

1. **短期目标**：完成 `ai_say` Action 的 LLM 集成
   - 修改 ScriptExecutor 创建 LLMOrchestrator
   - 修改 createAction 传递 LLMOrchestrator
   - 测试 `use_llm: true` 配置

2. **中期目标**：为其他 Actions 添加 LLM 支持
   - ai_think：实现真正的 LLM 推理
   - ai_ask：可选使用 LLM 生成更自然的问题

3. **长期目标**：优化 LLM 调用策略
   - 缓存重复提示词
   - 批量处理
   - 错误重试机制

## 相关文档

- [LLM 调试信息实现总结](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/LLM-DEBUG-IMPLEMENTATION-SUMMARY.md)
- [LLM 调试信息排查指南](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/CHECK_LLM_DEBUG.md)

---

**最后更新**: 2026-01-18  
**状态**: 前端完成，后端 Actions 需要完整集成 LLM
