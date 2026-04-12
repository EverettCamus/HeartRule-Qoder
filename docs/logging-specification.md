# HeartRule Logging Specification

## 概述

本文档定义 HeartRule 项目的日志规范，确保日志输出一致、可调试且性能友好。

## 日志级别

| 级别    | 用途                                    | 生产环境 | 开发环境 |
| ------- | --------------------------------------- | -------- | -------- |
| `debug` | 详细执行追踪、变量值、流程步骤          | 关闭     | 开启     |
| `info`  | 重要业务事件（会话创建/完成、状态变更） | 开启     | 开启     |
| `warn`  | 降级处理、兼容性警告、可恢复错误        | 开启     | 开启     |
| `error` | 错误和异常                              | 开启     | 开启     |

## 环境变量

```bash
LOG_LEVEL=debug|info|warn|error  # 默认: info
```

## 日志格式

### Console 日志格式

```
[组件名] 级别: 消息内容
[组件名] 级别: 消息内容 {"summarized":"data"}
```

**示例:**

```
[SessionManager] INFO: ✅ Session found {"id":"xxx","status":"active"}
[ScriptExecutor] DEBUG: 🎯 Executing action {"actionId":"action_1","type":"ai_ask"}
```

### Emoji 规范

| Emoji | 含义       | 级别  |
| ----- | ---------- | ----- |
| ✅    | 成功操作   | info  |
| ❌    | 错误情况   | error |
| 🔵    | 流程入口   | debug |
| 🏁    | 流程出口   | info  |
| ⏳    | 等待状态   | debug |
| 💾    | 数据持久化 | debug |
| 📝    | 内容处理   | debug |
| 🔍    | 调试信息   | debug |
| ⚠️    | 警告       | warn  |

## 数据摘要规则

### 大对象摘要

超过200字符的字符串只显示前100字符+总长度：

```typescript
// 错误
logger.debug('Prompt', prompt); // 1568字符全部输出

// 正确
logger.debug('Prompt', { chars: prompt.length }); // Prompt: {"chars":1568}
```

### 嵌套对象摘要

对象深度超过2层时截断：

```typescript
// 错误
logger.debug('Response', fullResponse); // 包含raw.response.headers...

// 正确
logger.debug('Response', {
  finishReason: response.finishReason,
  tokens: response.usage?.totalTokens,
});
```

### 重复数据避免

同一数据不应在多处输出：

```typescript
// 错误：同一JSON输出多次
logger.debug('Response text', response.text);
logger.debug('Raw response', response.raw); // raw 包含相同 text

// 正确：只输出一次，保留摘要引用
logger.debug('Response', {
  text: response.text?.substring(0, 100),
  tokens: tokensUsed,
});
```

## 使opencode能高效排查问题的日志规范

### 必须保留的日志

1. **会话生命周期**
   - `[SessionManager] 🔵 initializeSession called { sessionId }`
   - `[SessionManager] ✅ Session found { id, status }`
   - `[SessionManager] 🏁 processUserInput completed { status, position }`

2. **执行位置追踪**
   - `[ScriptExecutor] 🎯 Executing action { actionId, actionType }`
   - `[ScriptExecutor] ✅ Action result { actionId, completed, success }`

3. **变量提取结果**
   - `[AiAskAction] ✅ Extracted variable { name, value }`

4. **模板解析**
   - `[TemplateResolver] ✅ Template resolved { path, layer }`

5. **错误和警告**
   - 所有 `error` 和 `warn` 级别日志

### 可移除到 debug 级别的日志

1. 完整 prompt 内容
2. 完整 LLM 响应 JSON
3. 原始 API 响应 headers/timestamps
4. config 对象完整遍历
5. 每个执行步骤的详细追踪

### debug 级别使用场景

- 循环内的每次迭代
- 详细数据转换过程
- 完整对象内容（需要在开发时检查）
- API 请求/响应详情

## 实现示例

### 创建 Logger 实例

```typescript
import { createLogger } from '@heartrule/core-engine';

const logger = createLogger('MyComponent');

// 正确用法
logger.info('✅ Operation completed', { id, status });
logger.debug('🔍 Processing item', { itemId, step });
logger.warn('⚠️ Fallback used', { reason });
logger.error('❌ Failed', { error: error.message });

// 错误用法
console.log('[MyComponent] message', data); // 不要直接使用 console
logger.info('message'); // 缺少组件名前缀（已由 Logger 处理）
```

### 日志位置追踪

关键位置使用标准格式：

```typescript
// 入口
logger.info('🔵 initializeSession called', { sessionId });

// 状态变更
logger.info('✅ Session found', { id, status, executionStatus });

// 退出
logger.info('🏁 initializeSession completed', { status, hasMessage: !!aiMessage });
```

## 性能考虑

1. 避免在热路径中进行复杂计算生成日志数据
2. 使用 lazy evaluation 仅在需要时计算：
   ```typescript
   if (shouldLog('debug')) {
     logger.debug('Complex data', computeExpensiveSummary());
   }
   ```
3. 大数据使用摘要而非完整输出

## 测试

日志级别可通过环境变量切换：

```bash
# 生产环境
LOG_LEVEL=info pnpm dev

# 调试环境
LOG_LEVEL=debug pnpm dev
```

## 迁移检查清单

- [ ] 无直接 `console.log/error/info` 调用（除工具类）
- [ ] 所有日志使用 Logger 实例
- [ ] 日志格式符合规范
- [ ] 大对象已摘要
- [ ] 生产环境默认 logLevel=info
