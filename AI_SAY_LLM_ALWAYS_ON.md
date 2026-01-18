# ai_say Action 默认调用 LLM

## 修改说明

**修改时间**: 2026-01-18

### 问题

之前 `ai_say` Action 需要显式配置 `use_llm: true` 才会调用 LLM 生成自然语言表达，这导致：

1. **配置繁琐**：每个 ai_say 都需要额外配置
2. **行为不一致**：有些脚本调用 LLM，有些不调用
3. **设计不合理**：ai_say 的核心职责就是生成 AI 回复，本应默认使用 LLM

### 解决方案

**修改 `ai-say-action.ts`，使其默认调用 LLM**：

```typescript
// 之前：需要配置 use_llm: true
const useLLM = this.config.use_llm || this.config.useLLM || false;
if (useLLM && this.llmOrchestrator) {
  // 调用 LLM
}

// 现在：默认调用 LLM
if (this.llmOrchestrator) {
  // 调用 LLM
} else {
  console.warn('⚠️ LLMOrchestrator not available, using template content directly');
}
```

### 影响

1. **所有 ai_say Action 现在都会调用 LLM**
2. **不需要再配置 `use_llm: true`**
3. **首条消息和后续消息行为一致**
4. **LLM 调试信息（提示词和响应）会正常显示**

### 脚本配置示例

**之前（错误）**：
```yaml
- action_id: action_1
  action_type: ai_say
  config:
    content: "欢迎来到游心谷心理咨询服务"
    use_llm: true  # ❌ 不应该需要这个配置
    require_acknowledgment: false
```

**现在（正确）**：
```yaml
- action_id: action_1
  action_type: ai_say
  config:
    content: "欢迎来到游心谷心理咨询服务"
    require_acknowledgment: false
```

### 技术细节

**文件**: `packages/core-engine/src/actions/ai-say-action.ts`

**修改内容**：
1. 移除 `use_llm` 配置检查
2. 默认调用 `this.llmOrchestrator.generateText()`
3. 仅在 LLMOrchestrator 不可用时使用模板内容（并输出警告日志）

**LLM 提示词模板**：
```typescript
const systemPrompt = `你是一位专业的心理咨询师，请将以下内容改写为更自然、更温暖的表达方式，保持原意不变。`;
const userPrompt = `请改写：${content}`;
```

### 验证方法

1. **启动开发服务器**: `pnpm dev`
2. **观察日志**，应该看到：
   ```
   [ScriptExecutor] 🤖 LLM Orchestrator initialized: {
     provider: 'volcano',
     endpointId: 'deepseek-v3-250324',
     hasApiKey: true,
     baseUrl: 'https://ark.cn-beijing.volces.com/api/v3'
   }
   ```
3. **创建调试会话**
4. **观察 ai_say 执行日志**：
   ```
   [AiSayAction] 🤖 Using LLM to generate natural expression
   [AiSayAction] ✅ LLM generated: [自然化的文本]
   [ScriptExecutor] 💾 Saved LLM debug info: { hasPrompt: true, hasResponse: true, model: 'deepseek-v3-250324' }
   ```
5. **在调试面板中看到**：
   - 🔵 蓝色的 LLM 提示词气泡
   - 🟣 紫色的 LLM 响应气泡
   - ✅ AI 消息是经过 LLM 改写的自然表达（不再是硬编码的模板文本）

### 相关文件

- `packages/core-engine/src/actions/ai-say-action.ts` - ai_say Action 实现
- `packages/core-engine/src/engines/script-execution/script-executor.ts` - ScriptExecutor，初始化 LLMOrchestrator
- `packages/api-server/src/services/session-manager.ts` - SessionManager，使用 ScriptExecutor

### 环境配置

确保 `.env` 文件中配置了火山引擎 API：

```env
VOLCANO_API_KEY=your-api-key-here
VOLCANO_ENDPOINT_ID=deepseek-v3-250324
VOLCANO_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

---

## 总结

✅ **ai_say 现在默认调用 LLM**  
✅ **无需额外配置 `use_llm: true`**  
✅ **所有 ai_say 输出都经过 LLM 生成**  
✅ **行为一致性得到保证**  
✅ **LLM 调试信息正常显示**
