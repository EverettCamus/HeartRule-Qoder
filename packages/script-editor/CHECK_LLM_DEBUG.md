# LLM 调试信息显示问题排查指南

## 问题现象
只能看到变量状态气泡，看不到 LLM 提示词和 LLM 响应气泡。

## 原因分析
默认情况下，LLM 调试信息的过滤器是关闭的（已修复为默认开启）。

## 解决方案

### 方案1：清除浏览器缓存（推荐）

如果您之前已经使用过调试面板并保存了过滤器配置，旧的配置会保存在浏览器的 localStorage 中。需要清除它：

1. **打开浏览器开发者工具**
   - 按 `F12` 或右键点击页面选择"检查"

2. **打开控制台（Console）标签**

3. **执行以下命令清除旧配置**：
   ```javascript
   localStorage.removeItem('debugOutputFilter');
   console.log('✅ 已清除旧的过滤器配置');
   ```

4. **刷新页面**
   - 按 `F5` 或 `Ctrl+R`

5. **重新开始调试会话**
   - 发送一条消息
   - 现在应该能看到 LLM 调试信息气泡了

### 方案2：手动开启过滤器

如果不想清除缓存，可以手动开启：

1. **打开调试面板**
   - 在调试聊天面板的右上角

2. **点击设置图标**
   - 齿轮图标（⚙️）

3. **勾选以下选项**：
   - ✅ LLM 提示词
   - ✅ LLM 响应

4. **点击保存**

5. **发送消息测试**

### 方案3：验证后端是否返回 debugInfo

如果上述方案都不行，可能是后端没有返回调试信息：

1. **打开浏览器开发者工具**

2. **切换到 Network（网络）标签**

3. **发送一条调试消息**

4. **找到 API 请求**
   - 查找 `/api/debug/sessions/{sessionId}/messages` 请求
   - 或者 `/api/sessions/{sessionId}/messages` 请求

5. **查看响应内容**
   - 点击该请求
   - 切换到 "Response" 或 "Preview" 标签
   - 检查响应中是否有 `debugInfo` 字段

6. **期望看到的结构**：
   ```json
   {
     "aiMessage": "...",
     "sessionStatus": "active",
     "executionStatus": "waiting_input",
     "variables": {...},
     "position": {...},
     "debugInfo": {
       "prompt": "完整的提示词内容...",
       "response": {
         "text": "AI的响应...",
         "finishReason": "stop",
         "usage": {...}
       },
       "model": "deepseek-chat",
       "config": {...},
       "timestamp": "2026-01-18T...",
       "tokensUsed": 137
     }
   }
   ```

7. **如果没有 debugInfo 字段**：
   - 检查后端是否正确实现了 LLM 调试信息捕获
   - 查看后端日志是否有错误
   - 确认使用的是最新编译的代码

### 方案4：查看前端控制台日志

前端代码会输出详细的调试日志：

1. **打开浏览器控制台**

2. **发送一条消息**

3. **查找以下日志**：
   ```
   [DebugChat] 📍 Received LLM debugInfo: {...}
   [DebugChat] ✅ Created LLM prompt and response bubbles
   ```

4. **如果看到这些日志**：
   - 说明气泡已创建，问题出在过滤器
   - 按方案1清除 localStorage

5. **如果没有这些日志**：
   - 检查是否有 `debugInfo` 对象
   - 查看是否有其他错误日志

## 预期效果

配置正确后，发送消息时应该看到：

1. **蓝色气泡** - LLM 提示词
   - 显示发送给 AI 的完整提示词
   - 包括系统提示、用户提示、对话历史
   - 可以展开查看详情
   - 可以复制内容

2. **紫色气泡** - LLM 响应
   - 显示 AI 的原始响应（JSON 格式）
   - 显示模型名称和 token 使用量
   - 可以展开查看完整 JSON
   - 可以复制 JSON 内容

3. **绿色气泡** - 变量状态（已经能看到）

## 常见问题

### Q: 为什么默认不显示 LLM 调试信息？
A: 之前的设计是为了减少界面干扰，只在需要时显示。现在已经改为默认显示。

### Q: 如何再次隐藏 LLM 调试信息？
A: 通过过滤器设置（齿轮图标）取消勾选即可。

### Q: LLM 调试信息会影响性能吗？
A: 会增加少量内存占用（存储完整提示词和响应），但不会影响执行性能。如果不需要可以随时关闭。

### Q: 为什么有时看不到 debugInfo？
A: 可能的原因：
- Action 类型不是 LLM 相关的（如 ai_say, ai_ask, ai_think）
- 后端执行出错，没有成功调用 LLM
- LLM 调用失败

## 技术细节

### 数据流
```
LLM 调用
  ↓
LLM Orchestrator 捕获 debugInfo
  ↓
ActionResult 包含 debugInfo
  ↓
ExecutionState 保存 lastLLMDebugInfo
  ↓
Session Manager 返回 debugInfo
  ↓
API 响应包含 debugInfo
  ↓
前端解析并创建气泡
  ↓
根据过滤器决定是否显示
```

### 文件修改
已修改的默认配置文件：
- `packages/script-editor/src/types/debug.ts` (第175-176行)
  - `showLLMPrompt: true`
  - `showLLMResponse: true`

## 联系与反馈

如果问题仍然存在，请提供以下信息：
1. 浏览器控制台的完整日志
2. Network 标签中 API 响应的内容
3. localStorage 中 `debugOutputFilter` 的值
4. 使用的浏览器类型和版本
