# 调试信息显示问题修复报告

**日期**: 2026-01-20  
**问题**: 编辑器调试窗口中无法看到调试信息（LLM提示词、响应、变量状态、位置信息等）

---

## 问题分析

### 根本原因

调试信息气泡被**过滤器配置**隐藏了，有两个因素：

1. **默认配置问题**：
   - `showPosition: false` - 位置信息默认不显示
   - `showExecutionLog: false` - 执行日志默认不显示

2. **用户配置持久化**：
   - 过滤器设置保存在 `localStorage` 中（key: `debug-output-filter`）
   - 如果用户之前关闭了某些选项（如LLM提示词、LLM响应、变量状态），这些设置会持续生效
   - 用户可能忘记自己曾经关闭过这些选项

### 技术细节

#### 过滤器数据流
```
loadDebugFilter() 
  → 从 localStorage 读取
  → 应用到 debugFilter state
  → 在渲染时过滤气泡
```

#### 气泡过滤逻辑
位于 [DebugChatPanel/index.tsx#L1033-1047](file:///c:\CBT\HeartRule-Qcoder\packages\script-editor\src\components\DebugChatPanel\index.tsx#L1033-L1047)

```typescript
debugBubbles.forEach((bubble) => {
  if (bubble.type === 'error' && !debugFilter.showError) return;
  if (bubble.type === 'llm_prompt' && !debugFilter.showLLMPrompt) return;
  if (bubble.type === 'llm_response' && !debugFilter.showLLMResponse) return;
  if (bubble.type === 'variable' && !debugFilter.showVariable) return;
  if (bubble.type === 'execution_log' && !debugFilter.showExecutionLog) return;
  if (bubble.type === 'position' && !debugFilter.showPosition) return;
  
  // ... 添加到渲染列表
});
```

---

## 修复方案

### 1. 修改默认过滤器配置

**文件**: `packages/script-editor/src/types/debug.ts`

```typescript
export const DEFAULT_DEBUG_FILTER: DebugOutputFilter = {
  showError: true,         // ✅ 默认显示错误
  showLLMPrompt: true,     // ✅ 默认显示提示词
  showLLMResponse: true,   // ✅ 默认显示响应
  showVariable: true,      // ✅ 默认显示变量
  showExecutionLog: true,  // ✅ 默认显示日志（已修改）
  showPosition: true,      // ✅ 默认显示位置（已修改）
};
```

### 2. 添加调试日志

**文件**: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

#### 过滤器加载日志
```typescript
const [debugFilter, setDebugFilter] = useState<DebugOutputFilter>(() => {
  const filter = loadDebugFilter();
  console.log('[DebugChat] 🔍 Loaded debug filter:', filter);
  return filter;
});
```

#### 过滤统计日志
当有气泡被过滤时，输出警告信息：
```typescript
if (bubbleStats.filtered > 0) {
  console.warn(
    `[DebugChat] ⚠️ ${bubbleStats.filtered}/${bubbleStats.total} debug bubbles filtered out`,
    bubbleStats.byType
  );
  console.warn(
    '[DebugChat] 🔧 To show all debug info, click settings and enable all options'
  );
}
```

---

## 用户操作指南

### 如果调试信息仍然不显示

#### 方法1: 使用调试面板设置（推荐）
1. 打开调试面板
2. 点击右上角的 **设置图标（⚙️）**
3. 确保所有选项都已勾选：
   - ⚠️ 错误信息
   - 💡 LLM 提示词
   - 🤖 LLM 响应
   - 📊 变量状态
   - 📝 执行日志
   - 🧭 位置信息
4. 或直接点击 **"重置默认"** 按钮

#### 方法2: 清除 localStorage（快速）
在浏览器控制台执行：
```javascript
localStorage.removeItem('debug-output-filter')
```
然后刷新页面。

#### 方法3: 检查控制台日志
打开浏览器开发者工具，查看控制台：
- 查找 `[DebugChat] 🔍 Loaded debug filter:` - 检查配置是否正确
- 查找 `⚠️ debug bubbles filtered out` - 确认是否有气泡被过滤

---

## 测试验证

### 运行测试脚本
```bash
cd packages/api-server
npx tsx test-debug-filter.ts
```

### 预期结果
测试脚本会：
1. 创建调试会话
2. 发送消息
3. 验证 debugInfo 存在
4. 输出检查清单

### 前端验证清单
在调试面板中应该能看到：
- ✅ 🧭 位置信息气泡
- ✅ 💡 LLM 提示词气泡
- ✅ 🤖 LLM 响应气泡
- ✅ 📊 变量状态气泡（如有变量更新）
- ✅ ⚠️ 错误信息气泡（如有错误）

---

## 相关文件

### 修改的文件
- `packages/script-editor/src/types/debug.ts` - 默认过滤器配置
- `packages/script-editor/src/components/DebugChatPanel/index.tsx` - 添加日志

### 新增的文件
- `packages/api-server/test-debug-filter.ts` - 测试脚本

### 相关组件
- `DebugChatPanel` - 调试面板主组件
- `DebugFilterModal` - 过滤器配置弹窗
- `debug-filter-storage.ts` - 过滤器持久化工具

---

## 预防措施

### 建议改进（未来优化）
1. **初次使用提示**：首次打开调试面板时显示过滤器说明
2. **过滤状态指示**：在面板标题栏显示当前过滤器状态
3. **快捷重置**：在面板工具栏添加"显示全部"快捷按钮
4. **版本迁移**：在代码更新时检测旧配置并提示用户

### 文档更新
建议在用户文档中添加：
- 调试面板过滤器使用说明
- 常见问题排查（FAQ）
- 快捷操作指南

---

## 总结

此问题是由**过滤器配置**导致的视觉 Bug，而非数据流问题。修复方案：
1. ✅ 修改默认配置，确保所有调试信息默认显示
2. ✅ 添加调试日志，帮助用户快速发现问题
3. ✅ 提供清晰的用户操作指南

**影响范围**：仅影响前端显示，后端 debugInfo 数据流正常。

**向后兼容**：保持 localStorage 配置兼容性，用户可自由选择显示内容。
