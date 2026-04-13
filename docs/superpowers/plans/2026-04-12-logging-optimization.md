# Logging Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce server log verbosity from 66k+ chars to ~4-6k chars per interaction, while maintaining debugging capability through proper log levels.

**Architecture:** Create a unified Logger utility with log level control, replace direct console.log calls in core-engine, and establish a logging specification for future development.

**Tech Stack:** TypeScript, Node.js console API

---

## File Structure

| File                                                                         | Action | Purpose                                    |
| ---------------------------------------------------------------------------- | ------ | ------------------------------------------ |
| `packages/core-engine/src/utils/logger.ts`                                   | Create | Unified logging utility with level control |
| `packages/core-engine/src/index.ts`                                          | Modify | Export Logger                              |
| `packages/core-engine/src/engines/script-execution/script-executor.ts`       | Modify | Replace console.log with Logger            |
| `packages/core-engine/src/domain/actions/ai-ask-action.ts`                   | Modify | Replace console.log with Logger            |
| `packages/api-server/src/services/session-manager.ts`                        | Modify | Replace console.log with Logger            |
| `packages/core-engine/src/engines/prompt-template/template-manager.ts`       | Modify | Replace console.log with Logger            |
| `packages/core-engine/src/engines/prompt-template/template-resolver.ts`      | Modify | Replace console.log with Logger            |
| `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts` | Modify | Replace console.log with Logger            |
| `docs/logging-specification.md`                                              | Create | Logging specification document             |

---

## Task 1: Create Logger Utility

**Files:**

- Create: `packages/core-engine/src/utils/logger.ts`

- [ ] **Step 1: Create Logger utility with level control**

```typescript
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL];
}

function truncate(str: string, maxLen: number = 200): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, 100) + `... (${str.length} chars total)`;
}

function summarize(data: unknown, maxDepth: number = 2): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    return truncate(data);
  }

  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (data.length <= 3) return data.map((item) => summarize(item, maxDepth - 1));
    return {
      _type: 'array',
      length: data.length,
      sample: data.slice(0, 2).map((item) => summarize(item, maxDepth - 1)),
    };
  }

  if (maxDepth <= 0) {
    return { _type: 'object', keys: Object.keys(data as object).slice(0, 5) };
  }

  const obj = data as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  const keys = Object.keys(obj);

  for (const key of keys.slice(0, 10)) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 200) {
      summary[key] = truncate(value);
    } else if (typeof value === 'object' && value !== null) {
      summary[key] = summarize(value, maxDepth - 1);
    } else {
      summary[key] = value;
    }
  }

  if (keys.length > 10) {
    summary['_additionalKeys'] = keys.length - 10;
  }

  return summary;
}

export class Logger {
  constructor(private prefix: string) {}

  private formatMessage(level: LogLevel, message: string): string {
    return `[${this.prefix}] ${level.toUpperCase()}: ${message}`;
  }

  debug(message: string, data?: unknown): void {
    if (!shouldLog('debug')) return;
    const formatted = this.formatMessage('debug', message);
    if (data !== undefined) {
      console.log(formatted, JSON.stringify(summarize(data), null, 2));
    } else {
      console.log(formatted);
    }
  }

  info(message: string, data?: unknown): void {
    if (!shouldLog('info')) return;
    const formatted = this.formatMessage('info', message);
    if (data !== undefined) {
      console.info(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.info(formatted);
    }
  }

  warn(message: string, data?: unknown): void {
    if (!shouldLog('warn')) return;
    const formatted = this.formatMessage('warn', message);
    if (data !== undefined) {
      console.warn(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.warn(formatted);
    }
  }

  error(message: string, data?: unknown): void {
    if (!shouldLog('error')) return;
    const formatted = this.formatMessage('error', message);
    if (data !== undefined) {
      console.error(
        formatted,
        typeof data === 'object' ? JSON.stringify(summarize(data), null, 2) : data
      );
    } else {
      console.error(formatted);
    }
  }

  raw(message: string): void {
    console.log(formatLogPrefix(this.prefix), message);
  }
}

export function formatLogPrefix(prefix: string): string {
  return `[${prefix}]`;
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

export const LOG_LEVEL_ORDER = LOG_LEVELS;
export const CURRENT_LOG_LEVEL = LOG_LEVEL;
```

- [ ] **Step 2: Create index export for logger**

Modify `packages/core-engine/src/index.ts` to add Logger export:

```typescript
// Add to existing exports
export {
  Logger,
  createLogger,
  formatLogPrefix,
  type LogLevel,
  CURRENT_LOG_LEVEL,
  LOG_LEVEL_ORDER,
} from './utils/logger.js';
```

---

## Task 2: Convert ScriptExecutor to Logger

**Files:**

- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts`

- [ ] **Step 1: Import Logger at top of file**

Add after existing imports:

```typescript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ScriptExecutor');
```

- [ ] **Step 2: Replace console.log calls with logger**

Key replacements (examples):

| Original                                                   | Replacement                                |
| ---------------------------------------------------------- | ------------------------------------------ |
| `console.log('[ScriptExecutor] 🔵 Executing topic:', ...)` | `logger.info('🔵 Executing topic', ...)`   |
| `console.log('[ScriptExecutor] 🎯 Executing action', ...)` | `logger.debug('🎯 Executing action', ...)` |
| `console.error('[ScriptExecutor] ❌ Error:', ...)`         | `logger.error('❌ Error', ...)`            |

**Rule: Debug-level logs (detailed execution tracking) → `logger.debug()`, Important business events → `logger.info()`**

- [ ] **Step 3: Simplify large object logging**

Before:

```typescript
console.log('[ScriptExecutor] ✅ Action result:', {
  actionId,
  completed,
  success,
  hasAiMessage,
  aiMessage,
});
```

After:

```typescript
logger.debug('✅ Action result', { actionId, completed, success, hasAiMessage });
logger.debug('AI response', { aiMessage: aiMessage?.substring(0, 100) + '...' });
```

---

## Task 3: Convert AiAskAction to Logger

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

- [ ] **Step 1: Import Logger**

```typescript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AiAskAction');
```

- [ ] **Step 2: Replace console.log with logger**

Key changes:

- Template loading: `logger.debug('📄 Template resolved', { path, layer, scheme })`
- Prompt content: `logger.debug('📝 Prompt prepared', { chars: prompt.length, model })`
- Variable extraction: `logger.info('✅ Extracted variable', { name, value })`
- Full prompts: Only log character count, not content

- [ ] **Step 3: Remove full prompt content from debug output**

Before logging `prompt`, transform it:

```typescript
logger.debug('📝 Prompt prepared', { chars: prompt.length, currentRound, maxRounds });
```

Instead of logging the entire prompt text.

---

## Task 4: Convert SessionManager to Logger

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

- [ ] **Step 1: Import Logger**

```typescript
import { createLogger } from '@heartrule/core-engine';

const logger = createLogger('SessionManager');
```

- [ ] **Step 2: Replace console calls**

- Session found: `logger.info('✅ Session found', { id, scriptId, status })`
- Script execution: `logger.debug('⏳ Executing script')`
- Debug info: Move to debug level, summarize large objects

- [ ] **Step 3: Summarize debugInfo in responses**

Before logging full `debugInfo` with prompt/response:

```typescript
logger.debug('Debug info summary', {
  tokensUsed: debugInfo.tokensUsed,
  model: debugInfo.model,
  finishReason: debugInfo.response?.finishReason,
});
```

---

## Task 5: Convert TemplateResolver and TemplateManager

**Files:**

- Modify: `packages/core-engine/src/engines/prompt-template/template-resolver.ts`
- Modify: `packages/core-engine/src/engines/prompt-template/template-manager.ts`

- [ ] **Step 1: Import Logger in template-resolver.ts**

```typescript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TemplateResolver');
```

- [ ] **Step 2: Import Logger in template-manager.ts**

```typescript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('TemplateManager');
```

- [ ] **Step 3: Replace console calls**

Template paths and resolution steps use `logger.debug()` for detailed tracking.

---

## Task 6: Convert VariableScopeResolver

**Files:**

- Modify: `packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`

- [ ] **Step 1: Import Logger**

```typescript
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('VariableScopeResolver');
```

- [ ] **Step 2: Replace console calls**

Variable registration: `logger.debug('📝 Registered variable', { name, scope })`

---

## Task 7: Create Logging Specification Document

**Files:**

- Create: `docs/logging-specification.md`

- [ ] **Step 1: Write logging specification**

````markdown
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
````

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
3. 原始 API 响应headers/timestamps
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
logger.info('message'); // 缺少组名前缀（已由 Logger 处理）
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

````

---

## Task 8: TypeScript Type Check and Build

- [ ] **Step 1: Run type check**

Run: `pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Run tests**

Run: `pnpm test`
Expected: All tests pass

---

## Task 9: Verify Log Reduction

- [ ] **Step 1: Set LOG_LEVEL=info and test**

Run with production log level:
```bash
LOG_LEVEL=info pnpm dev
````

- [ ] **Step 2: Test same scenario (2 user messages)**

Verify:

- Log output is reduced from ~66k chars to ~4-6k chars
- Critical debugging information is preserved
- Session lifecycle events are visible
- Action execution positions are tracked

---

## Summary

| Metric                    | Before             | After                 |
| ------------------------- | ------------------ | --------------------- |
| Log chars per interaction | ~66,000            | ~4,000-6,000          |
| Log levels                | None (all output)  | debug/info/warn/error |
| Production noise          | High               | Low (info+)           |
| Debug capability          | Full logs required | Set LOG_LEVEL=debug   |
