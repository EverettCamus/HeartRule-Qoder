# LLM 调试信息功能 - 实现完成报告

## ✅ 任务完成状态

### 1. 后端 LLM 集成 - **已完成**

**完成的工作**：

1. **ScriptExecutor 集成 LLMOrchestrator** ✅
   - 在 [script-executor.ts](file:///c:/CBT/HeartRule-Qcoder/packages/core-engine/src/engines/script-execution/script-executor.ts) 中创建 LLMOrchestrator 实例
   - 使用火山引擎 DeepSeek Provider
   - 从环境变量读取配置（VOLCENGINE_API_KEY, VOLCENGINE_MODEL, VOLCENGINE_BASE_URL）

2. **ai_say Action LLM 集成** ✅
   - 修改 [ai-say-action.ts](file:///c:/CBT/HeartRule-Qcoder/packages/core-engine/src/actions/ai-say-action.ts) 接收 LLMOrchestrator
   - 支持 `use_llm: true` 配置选项
   - 通过 LLM 将模板内容改写为更自然、更温暖的表达
   - 返回 LLM 调试信息（prompt、response、model、tokens 等）

3. **调试信息传递链路** ✅
   - ActionResult包含 debugInfo
   - ExecutionState 保存 lastLLMDebugInfo
   - Session Manager API 响应包含 debugInfo
   - 完整的数据流：LLM → Action → ExecutionState → SessionManager → API → 前端

### 2. 前端展示功能 - **已完成**

1. **调试气泡组件** ✅
   - [LLMPromptBubble](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugBubbles/LLMPromptBubble.tsx)（蓝色）- 显示完整提示词
   - [LLMResponseBubble](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx)（紫色）- 显示 JSON 响应

2. **DebugChatPanel 集成** ✅
   - 解析 API 响应中的 debugInfo
   - 创建并渲染 LLM 气泡
   - 支持过滤器控制显示/隐藏

3. **默认配置** ✅
   - 默认开启 LLM 调试信息显示
   - [debug.ts](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/src/types/debug.ts) 中 `showLLMPrompt: true`, `showLLMResponse: true`

## 📋 测试指南

### 准备工作

1. **确认环境变量已配置**：
   ```bash
   # .env 文件中应包含
   VOLCENGINE_API_KEY=your_api_key
   VOLCENGINE_MODEL=deepseek-v3-250324
   VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
   ```

2. **启动服务**：
   ```bash
   pnpm dev
   ```

### 测试方案1：使用编辑器界面

1. 打开编辑器：访问 `http://localhost:5173`

2. 创建或导入测试脚本：
   - 脚本文件：[test_llm_debug.yaml](file:///c:/CBT/HeartRule-Qcoder/scripts/sessions/test_llm_debug.yaml)
   - **关键配置**：在 ai_say Action 中设置 `use_llm: true`

3. 开始调试：
   - 选择项目和脚本
   - 点击"开始调试"
   - 打开调试聊天面板

4. **预期结果**：
   - 看到蓝色的 "LLM 提示词" 气泡
   - 看到紫色的 "LLM 响应" 气泡
   - 气泡可以展开查看完整内容
   - 可以复制提示词和 JSON 响应

### 测试方案2：使用 web/index.html 客户端

1. 打开客户端：`http://localhost:8000/web/index.html`

2. 点击 "Start Consultation"

3. 开始对话，观察 AI 响应

4. **注意**：web/index.html 客户端不显示调试气泡，只用于验证 LLM 调用是否正常工作

### 查看调试信息的位置

在编辑器的调试聊天面板中，每次 LLM 调用后会看到两个气泡：

```
┌─────────────────────────────────────┐
│ 对话消息（白色）                     │
├─────────────────────────────────────┤
│ 🔵 LLM 提示词（蓝色气泡）            │
│    System: 你是一位专业的心理咨询师...│
│    User: ...                         │
│    [展开] [复制]                     │
├─────────────────────────────────────┤
│ 🟣 LLM 响应（紫色气泡）              │
│    Model: deepseek-v3-250324         │
│    Tokens: 137                       │
│    {                                 │
│      "text": "欢迎来到...",           │
│      "usage": {...}                  │
│    }                                 │
│    [展开] [复制JSON]                 │
└─────────────────────────────────────┘
```

## 🔍 故障排查

### 1. 看不到 LLM 调试信息气泡

**可能原因A**: 脚本中未启用 `use_llm`
- **解决**: 在脚本的 ai_say Action 中添加 `use_llm: true`

**可能原因B**: 环境变量未配置
- **解决**: 检查 .env 文件，确保包含 VOLCENGINE_API_KEY

**可能原因C**: 过滤器被关闭
- **解决**: 打开调试面板右上角的设置（齿轮图标），勾选 "LLM 提示词" 和 "LLM 响应"

**可能原因D**: 浏览器缓存
- **解决**: 清除 localStorage 中的 `debugOutputFilter` 键并刷新

### 2. 控制台日志检查

打开浏览器控制台（F12），应该看到：

```javascript
[ScriptExecutor] 🤖 LLM Orchestrator initialized: {provider: 'volcano', endpointId: 'deepseek-v3-250324', ...}
[AiSayAction] 🤖 Using LLM to generate natural expression
[AiSayAction] ✅ LLM generated: ...
[DebugChat] 📍 Received LLM debugInfo: {...}
[DebugChat] ✅ Created LLM prompt and response bubbles
```

如果没有这些日志：
- 检查脚本是否设置了 `use_llm: true`
- 检查环境变量是否正确

### 3. API 响应检查

在浏览器开发者工具的 Network 标签中，查找 `/api/sessions/{sessionId}/messages` 请求：

**正确的响应应包含**：
```json
{
  "aiMessage": "欢迎来到游心谷...",
  "sessionStatus": "active",
  "executionStatus": "waiting_input",
  "variables": {...},
  "debugInfo": {
    "prompt": "System: 你是一位专业的心理咨询师...",
    "response": {...},
    "model": "deepseek-v3-250324",
    "tokensUsed": 137,
    ...
  }
}
```

如果响应中没有 `debugInfo`，说明后端未产生调试信息，需要检查：
1. 脚本配置
2. 环境变量
3. LLM API 连接

## 📝 使用说明

### 在脚本中启用 LLM

```yaml
session:
  session_id: my_session
  session_name: "我的会话"
  phases:
    - phase_id: phase_1
      phase_name: "阶段1"
      topics:
        - topic_id: topic_1
          topic_name: "话题1"
          actions:
            - action_id: action_1
              action_type: ai_say
              config:
                content: "这是原始内容"
                use_llm: true  # ⭐ 关键配置
                require_acknowledgment: false
```

### LLM 处理逻辑

当 `use_llm: true` 时：
1. 原始 content 先进行变量替换
2. 然后发送给 LLM，使用提示词："请将以下内容改写为更自然、更温暖的表达方式"
3. LLM 返回改写后的内容
4. 改写后的内容作为 AI 消息发送给用户
5. **同时返回完整的 LLM 调试信息**（提示词、响应、token 使用量等）

### 控制显示

在调试面板右上角点击设置图标（⚙️），可以控制：
- ✅ LLM 提示词
- ✅ LLM 响应
- ✅ 变量状态
- ✅ 错误信息
- ⬜ 执行日志
- ⬜ 位置信息

## 🎯 完成的核心特性

1. **完整提示词展示** ✅
   - 显示发送给 LLM 的完整提示词
   - 包括系统提示和用户提示
   - 支持展开/折叠和复制

2. **JSON 响应展示** ✅
   - 以 JSON 格式显示 LLM 原始响应
   - 显示模型名称和 token 使用量
   - 支持一键复制 JSON

3. **数据流完整** ✅
   - LLM 层捕获调试信息
   - 通过 Action → ExecutionState → SessionManager → API 传递
   - 前端正确解析和展示

4. **用户体验** ✅
   - 蓝色/紫色主题区分提示词和响应
   - 支持过滤器控制显示
   - 配置持久化到 localStorage

## 📊 当前状态总结

| 组件 | 状态 | 说明 |
|-----|------|------|
| LLM Orchestrator | ✅ 完成 | 已集成到 ScriptExecutor |
| ai_say LLM 集成 | ✅ 完成 | 支持 use_llm 配置 |
| 调试信息捕获 | ✅ 完成 | prompt、response、tokens 等 |
| 调试信息传递 | ✅ 完成 | 完整链路打通 |
| 前端展示组件 | ✅ 完成 | 气泡组件和渲染逻辑 |
| 过滤器控制 | ✅ 完成 | 默认开启，可配置 |
| 编译验证 | ✅ 通过 | core-engine 和 api-server 编译成功 |

## 🚀 下一步建议

### 短期增强（可选）
1. 为 ai_think Action 添加 LLM 集成
2. 为 ai_ask Action 添加 LLM 优化问题生成
3. 添加语法高亮到 JSON 展示
4. 支持搜索和过滤提示词内容

### 长期优化（可选）
1. LLM 调用缓存机制
2. 批量调用优化
3. 错误重试策略
4. 成本统计和监控

## 📚 相关文档

- [LLM 调试信息实现总结](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/LLM-DEBUG-IMPLEMENTATION-SUMMARY.md)
- [LLM 调试信息排查指南](file:///c:/CBT/HeartRule-Qcoder/packages/script-editor/CHECK_LLM_DEBUG.md)
- [测试脚本](file:///c:/CBT/HeartRule-Qcoder/scripts/sessions/test_llm_debug.yaml)

---

**完成时间**: 2026-01-18  
**状态**: ✅ **全部完成** - 后端 + 前端 + 测试脚本
