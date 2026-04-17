# LLM 响应时间显示实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在编辑器的LLM响应气泡中显示LLM调用响应时间

**Architecture:** 后端在LLM调用时计算响应时间，通过debugInfo传递到前端，前端气泡组件显示该时间

**Tech Stack:** TypeScript, React, Fastify

---

## Task 1: 扩展 core-engine 类型定义

**Files:**

- Modify: `packages/core-engine/src/application/ports/outbound/llm-provider.port.ts:23-30`

- [ ] **Step 1: 添加 responseTimeMs 字段到 LLMDebugInfo 接口**

修改文件 `packages/core-engine/src/application/ports/outbound/llm-provider.port.ts`:

```typescript
export interface LLMDebugInfo {
  prompt: string;
  response: any;
  model: string;
  config: Partial<LLMConfig>;
  timestamp: string;
  tokensUsed?: number;
  responseTimeMs?: number;
}
```

- [ ] **Step 2: 构建验证**

Run: `pnpm --filter @heartrule/core-engine build`
Expected: 构建成功，无类型错误

- [ ] **Step 3: 提交**

```bash
git add packages/core-engine/src/application/ports/outbound/llm-provider.port.ts
git commit -m "feat(core-engine): add responseTimeMs to LLMDebugInfo"
```

---

## Task 2: 后端添加响应时间计算

**Files:**

- Modify: `packages/api-server/src/adapters/outbound/llm/base-provider.ts`

- [ ] **Step 1: 在 generateText 方法中添加计时逻辑**

修改文件 `packages/api-server/src/adapters/outbound/llm/base-provider.ts`:

在 `generateText` 方法开头添加 `startTime` 变量：

```typescript
async generateText(prompt: string, config?: Partial<LLMConfig>): Promise<LLMGenerateResult> {
  const model = this.getModel();
  const mergedConfig = { ...this.config, ...config };
  const timestamp = new Date().toISOString();
  const startTime = Date.now();
```

在 `debugInfo` 对象中添加 `responseTimeMs` 字段：

```typescript
const debugInfo: LLMDebugInfo = {
  prompt: actualPrompt,
  response: {
    text: result.text,
    finishReason: result.finishReason,
    usage: result.usage,
    raw: result,
  },
  model: mergedConfig.model,
  config: mergedConfig,
  timestamp,
  tokensUsed: result.usage?.totalTokens,
  responseTimeMs: Date.now() - startTime,
};
```

- [ ] **Step 2: 构建验证**

Run: `pnpm --filter @heartrule/api-server build`
Expected: 构建成功，无类型错误

- [ ] **Step 3: 提交**

```bash
git add packages/api-server/src/adapters/outbound/llm/base-provider.ts
git commit -m "feat(api-server): add response time calculation to LLM provider"
```

---

## Task 3: 扩展前端类型定义

**Files:**

- Modify: `packages/script-editor/src/types/debug.ts:87-95`

- [ ] **Step 1: 添加 responseTimeMs 和 ttftMs 字段**

修改文件 `packages/script-editor/src/types/debug.ts`:

```typescript
export interface LLMResponseBubbleContent {
  type: 'llm_response';
  model: string;
  tokens: number;
  maxTokens: number;
  rawResponse: string;
  processedResponse: string;
  preview: string;
  responseTimeMs?: number;
  ttftMs?: number;
}
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @heartrule/script-editor typecheck`
Expected: 无类型错误

- [ ] **Step 3: 提交**

```bash
git add packages/script-editor/src/types/debug.ts
git commit -m "feat(script-editor): add responseTimeMs to LLMResponseBubbleContent"
```

---

## Task 4: 前端数据传递

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: 在第一个构建位置添加 responseTimeMs 字段 (约407-417行)**

修改文件 `packages/script-editor/src/components/DebugChatPanel/index.tsx`:

找到第一个 `LLMResponseBubbleContent` 构建位置（约407行），在 `preview` 字段后添加：

```typescript
content: {
  type: 'llm_response',
  model: initialDebugInfo.model || 'unknown',
  tokens: initialDebugInfo.tokensUsed || 0,
  maxTokens: initialDebugInfo.config?.maxTokens || 0,
  rawResponse: JSON.stringify(
    initialDebugInfo.response.raw || initialDebugInfo.response
  ),
  processedResponse: initialDebugInfo.response.text || '',
  preview: (initialDebugInfo.response.text || '').substring(0, 100) + '...',
  responseTimeMs: initialDebugInfo.responseTimeMs,
} as LLMResponseBubbleContent,
```

- [ ] **Step 2: 在第二个构建位置添加 responseTimeMs 字段 (约799-808行)**

```typescript
content: {
  type: 'llm_response',
  model: debugInfo.model || 'unknown',
  tokens: debugInfo.tokensUsed || 0,
  maxTokens: debugInfo.config?.maxTokens || 0,
  rawResponse: JSON.stringify(debugInfo.response, null, 2),
  processedResponse: debugInfo.response?.text || response.aiMessage || '',
  preview:
    (debugInfo.response?.text || response.aiMessage || '').substring(0, 100) + '...',
  responseTimeMs: debugInfo.responseTimeMs,
} as LLMResponseBubbleContent,
```

- [ ] **Step 3: 在第三个构建位置添加 responseTimeMs 字段 (约1082-1091行)**

```typescript
content: {
  type: 'llm_response',
  model: debugInfo.model || 'unknown',
  tokens: debugInfo.tokensUsed || 0,
  maxTokens: debugInfo.config?.maxTokens || 0,
  rawResponse: JSON.stringify(debugInfo.response, null, 2),
  processedResponse: debugInfo.response?.text || response.aiMessage || '',
  preview:
    (debugInfo.response?.text || response.aiMessage || '').substring(0, 100) + '...',
  responseTimeMs: debugInfo.responseTimeMs,
} as LLMResponseBubbleContent,
```

- [ ] **Step 4: 在第四个构建位置添加 responseTimeMs 字段 (约1413-1423行)**

```typescript
content: {
  type: 'llm_response',
  model: newSession.debugInfo.model || 'unknown',
  tokens: newSession.debugInfo.tokensUsed || 0,
  maxTokens: newSession.debugInfo.config?.maxTokens || 0,
  rawResponse: JSON.stringify(
    newSession.debugInfo.response.raw || newSession.debugInfo.response
  ),
  processedResponse: newSession.debugInfo.response.text || '',
  preview: (newSession.debugInfo.response.text || '').substring(0, 100) + '...',
  responseTimeMs: newSession.debugInfo.responseTimeMs,
} as LLMResponseBubbleContent,
```

- [ ] **Step 5: 提交**

```bash
git add packages/script-editor/src/components/DebugChatPanel/index.tsx
git commit -m "feat(script-editor): pass responseTimeMs to LLMResponseBubble"
```

---

## Task 5: 前端显示组件修改

**Files:**

- Modify: `packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx`

- [ ] **Step 1: 在收起状态的元数据区域添加响应时间显示**

修改文件 `packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx`:

在 `Collapsed Content` 区域（约95-122行），在 `模型:` 行之后添加：

```tsx
{
  /* Collapsed Content */
}
{
  !isExpanded && (
    <div style={{ color: '#595959', fontSize: '13px' }}>
      <div style={{ marginBottom: '4px' }}>
        <strong>模型:</strong> {content.model}
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>响应时间:</strong> {content.responseTimeMs ?? '-'}ms
      </div>
      <div style={{ marginBottom: '4px' }}>
        <strong>Token 使用:</strong> {content.tokens} / {content.maxTokens}
      </div>
      {actionId && (
        <div style={{ marginBottom: '4px' }}>
          <strong>Action:</strong> {actionId}
        </div>
      )}
      <div
        style={{
          backgroundColor: '#fff',
          padding: '8px',
          borderRadius: '4px',
          marginTop: '8px',
          maxHeight: '60px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {content.preview}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在展开状态的元数据区域添加响应时间显示**

在 `Expanded Content` 区域（约125-140行），在 `模型:` 行之后添加：

```tsx
{
  /* Expanded Content */
}
{
  isExpanded && (
    <div style={{ color: '#595959', fontSize: '13px' }}>
      {/* Metadata */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>模型:</strong> {content.model}
        </div>
        <div style={{ marginBottom: '4px' }}>
          <strong>响应时间:</strong> {content.responseTimeMs ?? '-'}ms
        </div>
        <div style={{ marginBottom: '4px' }}>
          <strong>Token 使用:</strong> {content.tokens} / {content.maxTokens}
        </div>
        {actionId && (
          <div style={{ marginBottom: '4px' }}>
            <strong>Action:</strong> {actionId}
          </div>
        )}
      </div>
      {/* ... rest of expanded content ... */}
    </div>
  );
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @heartrule/script-editor typecheck`
Expected: 无类型错误

- [ ] **Step 4: 提交**

```bash
git add packages/script-editor/src/components/DebugBubbles/LLMResponseBubble.tsx
git commit -m "feat(script-editor): display response time in LLMResponseBubble"
```

---

## Task 6: 集成测试验证

- [ ] **Step 1: 启动开发环境**

Run: `pnpm docker:dev && pnpm dev:all`
Expected: 服务启动成功

- [ ] **Step 2: 手动验证**

1. 打开编辑器界面
2. 创建或加载一个会话
3. 发送消息触发LLM调用
4. 检查LLM响应气泡中是否显示响应时间

Expected: 响应时间正确显示在气泡中

- [ ] **Step 3: 完成提交**

```bash
git add -A
git commit -m "feat: complete LLM response time display feature"
```

---

## 影响范围总结

| 包            | 文件                                                  | 修改类型 |
| ------------- | ----------------------------------------------------- | -------- |
| core-engine   | `src/application/ports/outbound/llm-provider.port.ts` | 类型扩展 |
| api-server    | `src/adapters/outbound/llm/base-provider.ts`          | 计时逻辑 |
| script-editor | `src/types/debug.ts`                                  | 类型扩展 |
| script-editor | `src/components/DebugChatPanel/index.tsx`             | 数据传递 |
| script-editor | `src/components/DebugBubbles/LLMResponseBubble.tsx`   | UI显示   |
