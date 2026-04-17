# LLM响应时间显示功能设计

## 概述

在编辑器的LLM响应气泡中显示本次LLM调用的响应时间。

## 需求

- **显示位置**: Header区域（模型下方）
- **时间精度**: 毫秒（ms）
- **显示内容**: 响应时间（预留首字节时间字段，未来流式API支持时使用）

## 技术方案

### 类型修改

#### 1. core-engine: LLMDebugInfo

**文件**: `packages/core-engine/src/application/ports/outbound/llm-provider.port.ts`

```typescript
export interface LLMDebugInfo {
  prompt: string;
  response: any;
  model: string;
  config: Partial<LLMConfig>;
  timestamp: string;
  tokensUsed?: number;
  responseTimeMs?: number; // 新增：响应时间（毫秒）
}
```

#### 2. script-editor: LLMResponseBubbleContent

**文件**: `packages/script-editor/src/types/debug.ts`

```typescript
export interface LLMResponseBubbleContent {
  type: 'llm_response';
  model: string;
  tokens: number;
  maxTokens: number;
  rawResponse: string;
  processedResponse: string;
  preview: string;
  responseTimeMs?: number; // 新增
  ttftMs?: number; // 预留：首字节时间
}
```

### 后端实现

**文件**: `packages/api-server/src/adapters/outbound/llm/base-provider.ts`

修改 `generateText` 方法：

1. 在请求开始前记录 `startTime = Date.now()`
2. 响应返回后计算 `responseTimeMs = Date.now() - startTime`
3. 将 `responseTimeMs` 添加到 `debugInfo` 对象

```typescript
async generateText(prompt: string, config?: Partial<LLMConfig>): Promise<LLMGenerateResult> {
  const startTime = Date.now();  // 添加
  // ... existing code ...

  const debugInfo: LLMDebugInfo = {
    // ... existing fields ...
    responseTimeMs: Date.now() - startTime,  // 添加
  };
}
```

### 前端实现

#### 1. 数据传递

**文件**: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

在构建 `LLMResponseBubbleContent` 时，从 `debugInfo.responseTimeMs` 提取并赋值。

#### 2. 显示组件

**文件**: `packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx`

在模型信息下方添加响应时间显示：

```tsx
<div style={{ marginBottom: '4px' }}>
  <strong>响应时间:</strong> {content.responseTimeMs ?? '-'}ms
</div>
```

显示位置：

```
模型: gpt-4
响应时间: 1234ms
Token 使用: 512 / 2000
```

## 数据流

```
1. 后端 BaseLLMProvider.generateText()
   ├─ 记录 startTime
   ├─ 调用 LLM API
   ├─ 计算 responseTimeMs = Date.now() - startTime
   └─ 返回 { text, debugInfo: { ..., responseTimeMs } }

2. API 响应
   └─ { debugInfo: { responseTimeMs: 1234 } }

3. 前端 DebugChatPanel
   ├─ 解析 debugInfo
   └─ 构建 LLMResponseBubbleContent { ..., responseTimeMs: 1234 }

4. LLMResponseBubble
   └─ 显示: "响应时间: 1234ms"
```

## 影响范围

| 包            | 文件                                                  | 修改类型     |
| ------------- | ----------------------------------------------------- | ------------ |
| core-engine   | `src/application/ports/outbound/llm-provider.port.ts` | 类型扩展     |
| api-server    | `src/adapters/outbound/llm/base-provider.ts`          | 添加计时逻辑 |
| script-editor | `src/types/debug.ts`                                  | 类型扩展     |
| script-editor | `src/components/DebugChatPanel/index.tsx`             | 数据传递     |
| script-editor | `src/components/DebugBubbles/LLMResponseBubble.tsx`   | UI显示       |

## 测试策略

1. **单元测试**: 验证 `LLMDebugInfo` 类型正确传递 `responseTimeMs`
2. **组件测试**: 验证 `LLMResponseBubble` 正确显示响应时间
3. **E2E测试**: 验证完整数据流

## 未来扩展

- **流式API支持**: 当启用 `streamText` 时，`ttftMs` 可用于记录首字节时间
- **响应时间统计**: 可在会话结束时汇总平均响应时间
