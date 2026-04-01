# 危机提醒气泡设计

> **日期**: 2026-04-01
> **版本**: v1.0
> **状态**: 已批准

## 1. 背景与目标

### 1.1 问题描述

当 LLM 检测到危机信号（`crisis_detected: true`）时，前端调试面板无法显示危机提醒，导致开发者无法直观看到危机检测信息。

### 1.2 目标

- 在调试面板中显示危机提醒气泡
- 橙黄色警告风格，区别于红色错误气泡
- 可折叠，默认折叠

## 2. 现有架构分析

### 2.1 数据流

```
LLM 输出 (EnhancedAskLLMOutput)
├── content: string
├── assessment: string
├── progress: string
├── EXIT: string
├── BRIEF: string
└── crisis_detected: boolean    ← 危机标记
    ↓
debugInfo.response (传递到前端)
    ↓
DebugChatPanel
└── 可直接读取 debugInfo.response.crisis_detected
```

### 2.2 类型定义（已存在）

**文件**: `packages/script-editor/src/types/debug.ts`

```typescript
export type DebugBubbleType =
  | 'error'
  | 'llm_prompt'
  | 'llm_response'
  | 'variable'
  | 'execution_log'
  | 'position'
  | 'crisis_alert'; // 已定义

export interface CrisisAlertBubbleContent {
  type: 'crisis_alert';
  crisisType: 'suicide' | 'self_harm' | 'violence' | 'other';
  severity: 'high' | 'medium' | 'low';
  triggerText: string;
  llmAssessment?: string;
  timestamp: string;
  summary: string;
}
```

### 2.3 缺失部分

- `CrisisAlertBubble.tsx` 组件不存在
- `DebugChatPanel` 未检测 `crisis_detected` 并创建气泡

## 3. 设计方案

### 3.1 新建 CrisisAlertBubble 组件

**文件**: `packages/script-editor/src/components/DebugBubbles/CrisisAlertBubble.tsx`

**Props**:

```typescript
interface CrisisAlertBubbleProps {
  content: CrisisAlertBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  onToggleExpand: () => void;
}
```

**视觉设计**:

- 背景色: `#fff7e6` (浅橙黄)
- 边框: `1px solid #fa8c16` (橙色)
- 图标: `⚠️` (警告)
- 标题: "危机警告"
- 显示信息:
  - 危机类型 (crisisType)
  - 严重程度 (severity)
  - 触发文本 (triggerText，截断显示)

**交互**:

- 默认折叠，显示简短摘要
- 点击展开查看详情
- 折叠时显示: `[危机类型] [严重程度] summary`

### 3.2 集成到 DebugChatPanel

**文件**: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

**修改点**:

1. 导入组件:

```typescript
import CrisisAlertBubble from '../DebugBubbles/CrisisAlertBubble';
```

2. 在 `handleSendMessage` 中检测危机信号:

```typescript
// 检查 LLM 调试信息并创建 LLM 气泡
if (response.debugInfo) {
  const debugInfo = response.debugInfo;

  // ... 现有的 promptBubble 和 responseBubble 创建代码 ...

  // 检查危机信号
  if (debugInfo.response?.crisis_detected) {
    const crisisBubble: DebugBubble = {
      id: uuidv4(),
      type: 'crisis_alert',
      timestamp: debugInfo.timestamp || new Date().toISOString(),
      isExpanded: false,
      content: {
        type: 'crisis_alert',
        crisisType: 'other',
        severity: 'high',
        triggerText: userMessage, // 当前用户输入
        summary: '检测到危机信号',
      },
    };
    addDebugBubble(crisisBubble);
  }
}
```

3. 渲染气泡:

```typescript
{debugBubbles
  .filter((bubble) => {
    if (bubble.type === 'crisis_alert' && !debugFilter.showCrisisAlert) return false;
    // ... 其他过滤条件 ...
    return true;
  })
  .map((bubble) => {
    switch (bubble.type) {
      // ... 现有 case ...
      case 'crisis_alert':
        return (
          <CrisisAlertBubble
            key={bubble.id}
            content={bubble.content as CrisisAlertBubbleContent}
            isExpanded={bubble.isExpanded}
            timestamp={bubble.timestamp}
            onToggleExpand={() => toggleBubbleExpand(bubble.id)}
          />
        );
    }
  })}
```

### 3.3 同样处理 handleAcknowledgment

在 `handleAcknowledgment` 函数中也需要添加相同的危机检测逻辑（代码与 `handleSendMessage` 相同）。

## 4. 不需要修改的部分

### 4.1 后端

- 无需修改 `LLMDebugInfo` 类型
- 无需修改 `ai-ask-action.ts`
- 无需修改 `session-manager.ts`
- 无需修改 API routes

### 4.2 类型定义

- `debug.ts` 中的类型已完整定义，无需修改

## 5. 文件变更清单

| 文件                                                                       | 操作 | 说明         |
| -------------------------------------------------------------------------- | ---- | ------------ |
| `packages/script-editor/src/components/DebugBubbles/CrisisAlertBubble.tsx` | 新建 | 危机提醒组件 |
| `packages/script-editor/src/components/DebugChatPanel/index.tsx`           | 修改 | 集成危机检测 |

## 6. 测试策略

### 6.1 手动测试

使用现有测试脚本 `test-crisis-detection.yaml`：

1. 启动 API 服务器
2. 启动编辑器
3. 使用危机检测测试脚本调试
4. 验证当 LLM 返回 `crisis_detected: true` 时，调试面板显示橙黄色危机提醒气泡

### 6.2 验收标准

- [ ] 危机气泡显示橙黄色背景和边框
- [ ] 气泡默认折叠，点击可展开
- [ ] 显示危机类型、严重程度、触发文本
- [ ] 过滤器 `showCrisisAlert` 正确工作
