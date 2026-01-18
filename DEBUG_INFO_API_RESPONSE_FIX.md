# LLM 调试信息 API 响应缺失修复

## 问题描述

用户反馈在调试面板中看不到 LLM 提示词和 LLM 响应的蓝色、紫色调试气泡，只能看到变量状态气泡。

## 问题定位

通过前端日志分析，发现 API 响应中 `hasDebugInfo: false`：

```javascript
[DebugChat] ✅ API Response received: {
  aiMessage: '向来访者询问如何称呼', 
  sessionStatus: 'active', 
  executionStatus: 'waiting_input', 
  hasVariables: true, 
  hasDebugInfo: false,  // ❌ 问题所在
  …
}
```

## 根本原因

在 `packages/api-server/src/routes/sessions.ts` 的 **POST /api/sessions/:id/messages** 路由处理中：

1. ✅ **SessionManager 正确返回了 debugInfo**（第428行）：
   ```typescript
   const result = {
     aiMessage: executionState.lastAiMessage || '',
     sessionStatus: session.status,
     executionStatus: executionState.status,
     variables: executionState.variables,
     debugInfo: executionState.lastLLMDebugInfo, // ✅ 这里有
     position: { ... },
   };
   ```

2. ❌ **路由响应对象中缺少 debugInfo 字段**（第441-447行）：
   ```typescript
   const response: any = {
     aiMessage: result.aiMessage,
     sessionStatus: result.sessionStatus,
     executionStatus: result.executionStatus,
     variables: result.variables,
     position: result.position,
     // ❌ 缺少 debugInfo: result.debugInfo
   };
   ```

## 修复方案

在响应对象中添加 `debugInfo` 字段：

```typescript
const response: any = {
  aiMessage: result.aiMessage,
  sessionStatus: result.sessionStatus,
  executionStatus: result.executionStatus,
  variables: result.variables,
  position: result.position,
  debugInfo: result.debugInfo, // ✅ 添加 LLM 调试信息
};
```

## 修复文件

**文件**：`packages/api-server/src/routes/sessions.ts`  
**行数**：第447行（在 `position: result.position,` 之后）  
**修改类型**：添加一行代码

## 验证方法

### 1. 后端验证

编译后端代码（已自动完成）：
```bash
cd c:\CBT\HeartRule-Qcoder
pnpm --filter api-server build
```

服务器应自动重启（使用 tsx watch 模式）。

### 2. 前端验证

刷新编辑器页面，重新开始调试：

1. **创建新调试会话**
2. **发送消息**（如"你好"）
3. **检查前端控制台日志**，应该看到：
   ```javascript
   [DebugChat] ✅ API Response received: {
     aiMessage: '...',
     hasDebugInfo: true,  // ✅ 现在应该是 true
     debugInfo: {
       prompt: '...',
       response: {...},
       model: '...',
       tokensUsed: ...
     }
   }
   [DebugChat] 📍 Received LLM debugInfo: ...
   [DebugChat] ✅ Created LLM prompt and response bubbles
   ```

4. **检查调试面板**，应该看到：
   - 🔵 **蓝色 LLM 提示词气泡**（显示发送给 AI 的完整提示）
   - 🟣 **紫色 LLM 响应气泡**（显示 AI 的原始响应内容）
   - 🟡 **黄色变量状态气泡**（原有的变量提取信息）

### 3. 后端日志验证

后端日志应该显示：

```
[AiSayAction] 🤖 Using LLM to generate natural expression
[AiSayAction] ✅ LLM generated: ...
[ScriptExecutor] 💾 Saved LLM debug info: {
  hasPrompt: true,
  hasResponse: true,
  model: 'deepseek-v3'
}
[SessionManager] 🏁 processUserInput completed: {
  debugInfo: { ... }  // ✅ 应该有内容
}
```

## 相关问题历史

### 之前已修复的问题

1. ✅ **ai_say 不调用 LLM**（已修复）
   - 集成 LLMOrchestrator 到 ScriptExecutor
   - 修改 createAction 方法传递 LLMOrchestrator

2. ✅ **debugInfo 未保存到 executionState**（已修复）
   - 在 executeTopic 方法中添加 debugInfo 保存逻辑

3. ✅ **Action 状态恢复时 LLMOrchestrator 丢失**（已修复）
   - 修改 deserializeActionState 使用 this.createAction

4. ✅ **移除 use_llm 配置要求**（已修复）
   - ai_say 默认调用 LLM，无需额外配置

### 本次修复的问题

5. ✅ **API 响应中缺少 debugInfo 字段**（本次修复）
   - 在路由响应对象中添加 debugInfo 字段

## 技术细节

### 数据流完整路径

```
ai_say Action 执行
  ↓
调用 LLMOrchestrator.generateText()
  ↓
返回 ActionResult { debugInfo: {...} }
  ↓
ScriptExecutor 保存到 executionState.lastLLMDebugInfo
  ↓
SessionManager 返回结果包含 debugInfo
  ↓
sessions.ts 路由包含 debugInfo 在响应中 ← 本次修复点
  ↓
前端接收响应 { debugInfo: {...} }
  ↓
DebugChatPanel 创建 LLM 调试气泡
  ↓
用户看到蓝色和紫色气泡
```

### debugInfo 数据结构

```typescript
interface LLMDebugInfo {
  prompt: string;           // 用户提示词
  systemPrompt?: string;    // 系统提示词（可选）
  conversationHistory?: Array<{
    role: string;
    content: string;
  }>;                       // 对话历史（可选）
  response: {
    text: string;          // LLM 响应文本
    // 其他响应字段
  };
  model: string;           // 使用的模型名称
  tokensUsed?: number;     // 使用的 token 数量
  timestamp: string;       // 调用时间戳
  config?: {
    temperature?: number;
    maxTokens?: number;
  };
}
```

## 修复时间

**修复日期**：2026-01-18  
**修复人员**：Qoder  
**文件数量**：1 个文件  
**代码行数**：+1 行

## 状态

✅ **已完成修复**  
⏳ **等待用户测试验证**

## 下一步

请用户：
1. 刷新编辑器页面
2. 创建新的调试会话
3. 发送消息
4. 检查是否能看到蓝色和紫色的 LLM 调试气泡
5. 如有问题，提供新的前端控制台日志和后端日志
