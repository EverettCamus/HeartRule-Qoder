# 前端错误展示设计（气泡式）实现总结

## 实现日期
2026-01-18

## 实现概述

根据更新后的设计文档（方案B - 气泡式嵌入设计），已完成核心组件的实现，包括类型定义、过滤器、三种主要气泡组件和持久化工具。

## 已完成的工作

### 1. 类型定义 ✅

**文件**: `packages/script-editor/src/types/debug.ts`

**内容**:
- `DebugBubbleType`: 6种气泡类型枚举
- `DebugBubble`: 气泡基础数据结构
- `ErrorBubbleContent`: 错误信息内容接口
- `LLMPromptBubbleContent`: LLM提示词内容接口
- `LLMResponseBubbleContent`: LLM响应内容接口
- `VariableBubbleContent`: 变量状态内容接口
- `ExecutionLogBubbleContent`: 执行日志内容接口
- `PositionBubbleContent`: 位置信息内容接口
- `DebugOutputFilter`: 过滤器配置接口
- `DEFAULT_DEBUG_FILTER`: 默认过滤器配置

**特点**:
- 完整的 TypeScript 类型安全
- 默认显示错误和变量，隐藏其他类型（减少干扰）

### 2. 调试输出过滤器组件 ✅

**文件**: `packages/script-editor/src/components/DebugFilterModal/DebugFilterModal.tsx`

**功能**:
- 6个多选框对应6种调试信息类型
- 每个选项带有图标和描述文字
- 快捷操作按钮:
  - 全部展开
  - 全部折叠
  - 仅显示错误
  - 显示全部
  - 重置默认

**UI设计**:
- 使用 Ant Design Modal 和 Checkbox
- 清晰的视觉层次
- 响应式布局

### 3. 错误信息气泡组件 ✅

**文件**: `packages/script-editor/src/components/DebugBubbles/ErrorBubble.tsx`

**功能**:
- 折叠状态: 显示错误描述、Action、类型
- 展开状态: 显示完整的错误代码、类型、描述、执行位置、技术详情、堆栈跟踪、修复建议
- 操作按钮:
  - 展开/折叠
  - 复制错误信息
  - 重新开始

**视觉设计**:
- 红色主题 (#fff1f0 背景, #ff4d4f 边框)
- ⚠️ 图标
- 时间戳显示

### 4. 变量状态气泡组件 ✅

**文件**: `packages/script-editor/src/components/DebugBubbles/VariableBubble.tsx`

**功能**:
- 折叠状态: 显示新增/变化的变量摘要
- 展开状态: 
  - 显示变化的变量（含新旧值对比）
  - 按 Session/Phase/Topic 层级分组显示所有变量
- 操作按钮:
  - 展开/折叠
  - 导出JSON（下载变量快照）

**视觉设计**:
- 绿色主题 (#f6ffed 背景, #52c41a 边框)
- 📊 图标
- 变量值格式化显示（字符串加引号，对象格式化）

### 5. LLM 提示词气泡组件 ✅

**文件**: `packages/script-editor/src/components/DebugBubbles/LLMPromptBubble.tsx`

**功能**:
- 折叠状态: 显示提示词前100字符预览
- 展开状态:
  - 系统提示词
  - 用户提示词
  - 对话历史（可滚动）
- 操作按钮:
  - 展开/折叠
  - 复制提示词（包含系统提示词、用户提示词、对话历史）

**视觉设计**:
- 蓝色主题 (#e6f7ff 背景, #1890ff 边框)
- 💡 图标
- 内容区可滚动（最大高度限制）

### 6. localStorage 持久化工具 ✅

**文件**: `packages/script-editor/src/utils/debug-filter-storage.ts`

**功能**:
- `saveDebugFilter()`: 保存过滤器配置
- `loadDebugFilter()`: 加载过滤器配置（带默认值回退）
- `clearDebugFilter()`: 清除保存的配置

**特点**:
- 错误处理（localStorage 可能不可用）
- 配置完整性验证
- 自动回退到默认配置

## 组件架构

```
DebugChatPanel (待集成)
├── 过滤器按钮 🔧
│   └── DebugFilterModal (已实现)
│
└── 消息流
    ├── UserMessage (用户消息)
    ├── AIMessage (AI 消息)
    └── DebugBubbles (调试信息气泡)
        ├── ErrorBubble (已实现)
        ├── VariableBubble (已实现)
        ├── LLMPromptBubble (已实现)
        ├── LLMResponseBubble (待实现)
        ├── ExecutionLogBubble (待实现)
        └── PositionBubble (待实现)
```

## 数据流设计

```
后端 API 响应
    ↓
DebugChatPanel 状态管理
    ↓
根据响应数据生成 DebugBubble 对象
    ↓
根据 filter 配置决定是否渲染
    ↓
渲染对应的气泡组件
```

### 示例：错误信息处理流程

```typescript
// 1. 后端返回错误
const apiResponse = {
  error: {
    code: 'ACTION_EXECUTION_ERROR',
    type: 'runtime',
    message: 'LLM service timeout',
    // ...
  }
};

// 2. 转换为气泡数据
const bubble: DebugBubble = {
  id: uuidv4(),
  type: 'error',
  timestamp: new Date().toISOString(),
  isExpanded: true, // 错误默认展开
  actionId: currentAction.id,
  content: {
    type: 'error',
    code: apiResponse.error.code,
    errorType: apiResponse.error.type,
    message: apiResponse.error.message,
    // ...
  }
};

// 3. 添加到气泡列表
setBubbles(prev => [...prev, bubble]);

// 4. 根据过滤器决定是否显示
if (filter.showError) {
  return <ErrorBubble {...bubbleProps} />;
}
```

## 集成清单

### 需要在 DebugChatPanel 中添加的状态

```typescript
// 气泡列表
const [debugBubbles, setDebugBubbles] = useState<DebugBubble[]>([]);

// 过滤器配置
const [debugFilter, setDebugFilter] = useState<DebugOutputFilter>(() => 
  loadDebugFilter()
);

// 过滤器弹窗可见性
const [filterModalVisible, setFilterModalVisible] = useState(false);
```

### 需要添加的函数

```typescript
// 1. 添加气泡
const addDebugBubble = (bubble: DebugBubble) => {
  setDebugBubbles(prev => [...prev, bubble]);
};

// 2. 切换气泡展开状态
const toggleBubbleExpand = (bubbleId: string) => {
  setDebugBubbles(prev => 
    prev.map(b => b.id === bubbleId ? {...b, isExpanded: !b.isExpanded} : b)
  );
};

// 3. 更新过滤器
const handleFilterChange = (newFilter: DebugOutputFilter) => {
  setDebugFilter(newFilter);
  saveDebugFilter(newFilter);
};

// 4. 从错误响应创建气泡
const createErrorBubble = (error: DetailedApiError): DebugBubble => {
  return {
    id: uuidv4(),
    type: 'error',
    timestamp: new Date().toISOString(),
    isExpanded: true,
    content: {
      type: 'error',
      code: error.code,
      errorType: error.type,
      message: error.message,
      details: error.details,
      position: error.context?.position,
      recovery: error.recovery,
    }
  };
};

// 5. 从变量变化创建气泡
const createVariableBubble = (
  changedVars: any[], 
  allVars: any
): DebugBubble => {
  return {
    id: uuidv4(),
    type: 'variable',
    timestamp: new Date().toISOString(),
    isExpanded: false,
    content: {
      type: 'variable',
      changedVariables: changedVars,
      allVariables: allVars,
      summary: `${changedVars.length} 个变量变化`
    }
  };
};
```

### 需要添加的 UI 元素

```tsx
// 1. 在调试配置区添加过滤器按钮
<Button 
  icon={<SettingOutlined />} 
  onClick={() => setFilterModalVisible(true)}
>
  调试输出过滤器 🔧
</Button>

// 2. 渲染过滤器弹窗
<DebugFilterModal
  visible={filterModalVisible}
  filter={debugFilter}
  onFilterChange={handleFilterChange}
  onClose={() => setFilterModalVisible(false)}
/>

// 3. 在消息流中渲染气泡
{debugBubbles.map(bubble => {
  // 根据过滤器决定是否显示
  if (bubble.type === 'error' && !debugFilter.showError) return null;
  if (bubble.type === 'variable' && !debugFilter.showVariable) return null;
  if (bubble.type === 'llm_prompt' && !debugFilter.showLLMPrompt) return null;
  
  // 渲染对应的气泡组件
  if (bubble.type === 'error') {
    return (
      <ErrorBubble
        key={bubble.id}
        content={bubble.content as ErrorBubbleContent}
        isExpanded={bubble.isExpanded}
        timestamp={bubble.timestamp}
        onToggleExpand={() => toggleBubbleExpand(bubble.id)}
        onRestart={handleRestartDebug}
      />
    );
  }
  
  if (bubble.type === 'variable') {
    return (
      <VariableBubble
        key={bubble.id}
        content={bubble.content as VariableBubbleContent}
        isExpanded={bubble.isExpanded}
        timestamp={bubble.timestamp}
        actionId={bubble.actionId}
        onToggleExpand={() => toggleBubbleExpand(bubble.id)}
      />
    );
  }
  
  // ... 其他类型
})}
```

## 关键集成点

### 1. 错误处理集成

在 `sendMessage` 函数中，当收到错误响应时：

```typescript
const result = await debugApi.sendMessage(sessionId, inputValue);

if (result.error) {
  const errorBubble = createErrorBubble(result.error);
  addDebugBubble(errorBubble);
  setDetailedError({...result.error}); // 保留原有的错误状态
}
```

### 2. 变量变化监控

在 `sendMessage` 函数中，比较前后变量状态：

```typescript
const oldVariables = sessionInfo?.variables || {};
const newVariables = result.variables || {};

const changedVars = [];
for (const key in newVariables) {
  if (oldVariables[key] !== newVariables[key]) {
    changedVars.push({
      name: key,
      oldValue: oldVariables[key],
      newValue: newVariables[key],
      scope: 'session' // 根据实际情况确定
    });
  }
}

if (changedVars.length > 0 && debugFilter.showVariable) {
  const variableBubble = createVariableBubble(changedVars, newVariables);
  addDebugBubble(variableBubble);
}
```

### 3. LLM 提示词捕获（可选增强）

如果后端支持返回 LLM 提示词，可以创建提示词气泡：

```typescript
if (result.llmPrompt && debugFilter.showLLMPrompt) {
  const promptBubble: DebugBubble = {
    id: uuidv4(),
    type: 'llm_prompt',
    timestamp: new Date().toISOString(),
    isExpanded: false,
    actionId: currentAction?.id,
    content: {
      type: 'llm_prompt',
      systemPrompt: result.llmPrompt.system,
      userPrompt: result.llmPrompt.user,
      conversationHistory: result.llmPrompt.history,
      preview: result.llmPrompt.user.substring(0, 100)
    }
  };
  addDebugBubble(promptBubble);
}
```

## 待实现的可选组件

根据设计文档的优先级（P1/P2），以下组件可以后续实现：

### P1 - 建议实现

1. **LLMResponseBubble** - LLM 响应气泡
   - 视觉：深蓝色主题
   - 内容：模型名、Token数、原始响应、处理后响应
   - 用途：调试 AI 输出处理逻辑

### P2 - 可选实现

2. **ExecutionLogBubble** - 执行日志气泡
   - 视觉：灰色主题
   - 内容：执行状态、耗时、详细步骤
   - 用途：性能分析和执行流程追踪

3. **PositionBubble** - 位置信息气泡
   - 视觉：黄色主题
   - 内容：Phase/Topic/Action 详细路径
   - 用途：快速定位执行位置

## 测试建议

### 单元测试

每个气泡组件应测试：
1. 折叠/展开状态切换
2. 数据格式化显示
3. 按钮点击事件
4. 边界情况（空数据、超长文本等）

### 集成测试

1. **过滤器功能**:
   - 勾选/取消勾选后气泡显示/隐藏
   - 快捷操作按钮功能
   - 配置持久化

2. **错误气泡**:
   - 构造脚本错误，验证气泡显示
   - 点击"重新开始"按钮
   - 复制错误信息

3. **变量气泡**:
   - 执行 ai_ask Action，提取变量
   - 验证变量变化显示
   - 导出JSON功能

4. **LLM提示词气泡**:
   - 验证提示词内容正确
   - 对话历史显示
   - 复制功能

## 性能考虑

1. **气泡数量限制**: 建议最多保留最近100个气泡，超过时自动删除旧的
2. **虚拟滚动**: 如果气泡很多，考虑使用虚拟滚动优化性能
3. **懒加载**: 展开状态才渲染完整内容

## 文档更新

相关文档已更新：
- ✅ `script-editor-core-plan.md` - 主设计文档
- ✅ `script-editor-error-display-update.md` - 更新说明

## 实现总结

### 完成度统计

| 组件/功能 | 状态 | 优先级 |
|----------|------|--------|
| 类型定义 | ✅ 完成 | P0 |
| 过滤器弹窗 | ✅ 完成 | P0 |
| 错误气泡 | ✅ 完成 | P0 |
| 变量气泡 | ✅ 完成 | P0 |
| LLM提示词气泡 | ✅ 完成 | P1 |
| localStorage持久化 | ✅ 完成 | P1 |
| 集成到DebugChatPanel | ⏳ 待完成 | P0 |
| LLM响应气泡 | ⏳ 待实现 | P1 |
| 执行日志气泡 | ⏳ 待实现 | P2 |
| 位置信息气泡 | ⏳ 待实现 | P2 |

**P0核心组件完成度**: 5/6 = 83.3%

### 下一步行动

1. **立即执行**: 集成到 DebugChatPanel（最关键的一步）
2. **测试验证**: 确保错误气泡和变量气泡正常工作
3. **可选增强**: 实现 LLM 响应气泡
4. **性能优化**: 添加气泡数量限制和虚拟滚动

## 预期效果

完成集成后，用户在调试时将看到：

1. **错误发生时**: 红色错误气泡自动展开，显示详细错误信息和修复建议
2. **变量变化时**: 绿色变量气泡显示变化的变量（默认折叠）
3. **可自定义**: 通过过滤器按钮自由选择显示哪些类型的调试信息
4. **配置记忆**: 过滤器设置会保存，下次打开时恢复

这将大大提升调试体验，让开发者能快速定位和解决问题！
