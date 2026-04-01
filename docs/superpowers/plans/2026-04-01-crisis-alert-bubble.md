# Crisis Alert Bubble Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在调试面板中显示危机提醒气泡，当 LLM 返回 `crisis_detected: true` 时触发。

**Architecture:** 纯前端实现，复用现有 Bubble 组件模式。从 `debugInfo.response.crisis_detected` 读取危机标记，创建 CrisisAlertBubble 气泡组件并集成到 DebugChatPanel。

**Tech Stack:** React, TypeScript, Ant Design

---

## File Structure

```
packages/script-editor/src/
├── components/
│   ├── DebugBubbles/
│   │   └── CrisisAlertBubble.tsx    # 新建：危机提醒组件
│   └── DebugChatPanel/
│       └── index.tsx                 # 修改：集成危机检测
```

---

### Task 1: 创建 CrisisAlertBubble 组件

**Files:**

- Create: `packages/script-editor/src/components/DebugBubbles/CrisisAlertBubble.tsx`

- [ ] **Step 1: 创建 CrisisAlertBubble 组件文件**

```tsx
import { Button, Space } from 'antd';
import React from 'react';

import type { CrisisAlertBubbleContent } from '../../types/debug';

interface CrisisAlertBubbleProps {
  content: CrisisAlertBubbleContent;
  isExpanded: boolean;
  timestamp: string;
  onToggleExpand: () => void;
  onCopy?: () => void;
}

const CrisisAlertBubble: React.FC<CrisisAlertBubbleProps> = ({
  content,
  isExpanded,
  timestamp,
  onToggleExpand,
  onCopy,
}) => {
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const getCrisisTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      suicide: '自杀风险',
      self_harm: '自伤风险',
      violence: '暴力倾向',
      other: '其他危机',
    };
    return labels[type] || type;
  };

  const getSeverityLabel = (severity: string): string => {
    const labels: Record<string, string> = {
      high: '高',
      medium: '中',
      low: '低',
    };
    return labels[severity] || severity;
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      high: '#cf1322',
      medium: '#fa8c16',
      low: '#faad14',
    };
    return colors[severity] || colors.medium;
  };

  const handleCopy = () => {
    const text = [
      `危机类型: ${getCrisisTypeLabel(content.crisisType)}`,
      `严重程度: ${getSeverityLabel(content.severity)}`,
      `触发文本: ${content.triggerText}`,
      content.llmAssessment ? `LLM评估: ${content.llmAssessment}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      console.log('危机信息已复制到剪贴板');
    });

    onCopy?.();
  };

  return (
    <div
      style={{
        backgroundColor: '#fff7e6',
        border: '1px solid #fa8c16',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '12px',
        maxWidth: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '16px', marginRight: '8px' }}>⚠️</span>
        <strong style={{ color: '#d46b08', flex: 1 }}>危机警告</strong>
        <span style={{ fontSize: '12px', color: '#999' }}>{formatTime(timestamp)}</span>
      </div>

      {!isExpanded && (
        <div>
          <div style={{ fontSize: '14px', marginBottom: '4px' }}>
            <strong>{getCrisisTypeLabel(content.crisisType)}</strong>
            <span
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                backgroundColor: getSeverityColor(content.severity) + '20',
                color: getSeverityColor(content.severity),
              }}
            >
              严重程度: {getSeverityLabel(content.severity)}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>{content.summary}</div>
        </div>
      )}

      {isExpanded && (
        <div>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              危机类型: {getCrisisTypeLabel(content.crisisType)}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
              严重程度:{' '}
              <span style={{ color: getSeverityColor(content.severity) }}>
                {getSeverityLabel(content.severity)}
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
              触发文本:
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#000',
                backgroundColor: '#fff',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ffd591',
              }}
            >
              {content.triggerText}
            </div>
          </div>

          {content.llmAssessment && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                LLM 评估:
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#666',
                  backgroundColor: '#fafafa',
                  padding: '8px',
                  borderRadius: '4px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {content.llmAssessment}
              </div>
            </div>
          )}
        </div>
      )}

      <Space size="small">
        <Button size="small" onClick={onToggleExpand}>
          {isExpanded ? '折叠 ▲' : '展开详情 ▼'}
        </Button>
        {isExpanded && (
          <Button size="small" onClick={handleCopy}>
            复制信息
          </Button>
        )}
      </Space>
    </div>
  );
};

export default CrisisAlertBubble;
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la packages/script-editor/src/components/DebugBubbles/CrisisAlertBubble.tsx`
Expected: 文件存在

- [ ] **Step 3: 提交组件文件**

```bash
git add packages/script-editor/src/components/DebugBubbles/CrisisAlertBubble.tsx
git commit -m "feat(script-editor): add CrisisAlertBubble component"
```

---

### Task 2: 集成到 DebugChatPanel

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: 添加 CrisisAlertBubble 导入**

在文件顶部的导入区域，找到其他 Bubble 组件导入位置（约第 27-31 行），添加导入：

```typescript
import CrisisAlertBubble from '../DebugBubbles/CrisisAlertBubble';
```

同时需要在类型导入区域（约第 8-16 行）添加 `CrisisAlertBubbleContent`：

```typescript
import type {
  DebugBubble,
  DebugOutputFilter,
  ErrorBubbleContent,
  VariableBubbleContent,
  LLMPromptBubbleContent,
  LLMResponseBubbleContent,
  PositionBubbleContent,
  CrisisAlertBubbleContent, // 添加这行
} from '../../types/debug';
```

- [ ] **Step 2: 在 handleSendMessage 中添加危机检测**

在 `handleSendMessage` 函数中，找到创建 LLM 响应气泡的代码块之后（约第 746 行 `addDebugBubble(responseBubble);` 之后），添加危机检测代码：

```typescript
addDebugBubble(responseBubble);

console.log('[DebugChat] ✅ Created LLM prompt and response bubbles');

// 检查危机信号
if (debugInfo.response?.crisis_detected) {
  console.log('[DebugChat] ⚠️ Crisis detected!');
  const crisisBubble: DebugBubble = {
    id: uuidv4(),
    type: 'crisis_alert',
    timestamp: debugInfo.timestamp || new Date().toISOString(),
    isExpanded: false,
    actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
    actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
    content: {
      type: 'crisis_alert',
      crisisType: 'other',
      severity: 'high',
      triggerText: userMessage,
      summary: '检测到危机信号',
      timestamp: debugInfo.timestamp || new Date().toISOString(),
    } as CrisisAlertBubbleContent,
  };
  addDebugBubble(crisisBubble);
  console.log('[DebugChat] ✅ Created crisis alert bubble');
}
```

- [ ] **Step 3: 在 handleAcknowledgment 中添加相同的危机检测**

在 `handleAcknowledgment` 函数中，找到创建 LLM 响应气泡的代码块之后（约第 1029 行 `addDebugBubble(responseBubble);` 之后），添加危机检测代码：

```typescript
addDebugBubble(responseBubble);

// 检查危机信号
if (debugInfo.response?.crisis_detected) {
  console.log('[DebugChat] ⚠️ Crisis detected in acknowledgment!');
  const crisisBubble: DebugBubble = {
    id: uuidv4(),
    type: 'crisis_alert',
    timestamp: debugInfo.timestamp || new Date().toISOString(),
    isExpanded: false,
    actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
    actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
    content: {
      type: 'crisis_alert',
      crisisType: 'other',
      severity: 'high',
      triggerText: '(空输入确认)',
      summary: '检测到危机信号',
      timestamp: debugInfo.timestamp || new Date().toISOString(),
    } as CrisisAlertBubbleContent,
  };
  addDebugBubble(crisisBubble);
}
```

- [ ] **Step 4: 气泡渲染开关中添加 crisis_alert 处理**

找到气泡渲染的 switch 语句区域，在 `case 'position':` 之后添加新的 case：

```typescript
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
```

- [ ] **Step 5: 验证 TypeScript 编译**

Run: `pnpm --filter @heartrule/script-editor typecheck`
Expected: 无类型错误

- [ ] **Step 6: 提交 DebugChatPanel 修改**

```bash
git add packages/script-editor/src/components/DebugChatPanel/index.tsx
git commit -m "feat(script-editor): integrate crisis alert bubble in DebugChatPanel"
```

---

### Task 3: 手动测试验证

**Files:**

- 无文件修改，仅手动测试

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm dev:all`
Expected: API 服务器和编辑器都启动成功

- [ ] **Step 2: 使用危机检测测试脚本**

1. 打开浏览器访问编辑器
2. 选择测试脚本 `test-crisis-detection.yaml`（数据库项目 `4f752a4d-d5d1-4ff3-b2af-0619d5204212`）
3. 输入触发危机的文本（如表达自杀意念的内容）
4. 观察调试面板是否显示橙黄色危机提醒气泡

Expected:

- 气泡显示橙黄色背景和边框
- 气泡默认折叠，显示危机类型和严重程度
- 点击展开可查看触发文本
- 过滤器可正确过滤危机气泡

- [ ] **Step 3: 完成最终提交（如有修改）**

如果测试中发现问题并修复，提交：

```bash
git add -A
git commit -m "fix(script-editor): fix crisis alert bubble issues"
```

---

## Summary

| Task | Description                 | Files         |
| ---- | --------------------------- | ------------- |
| 1    | 创建 CrisisAlertBubble 组件 | 新建 1 个文件 |
| 2    | 集成到 DebugChatPanel       | 修改 1 个文件 |
| 3    | 手动测试验证                | 无文件修改    |

**Total Changes:**

- 新建: 1 个文件
- 修改: 1 个文件
