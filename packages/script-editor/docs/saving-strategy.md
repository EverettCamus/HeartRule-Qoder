# 节点更新与服务端保存协调机制设计

## 总体策略：乐观更新 + 异步保存

### 核心原则
1. **用户体验无感**：所有操作立即生效，不阻塞UI
2. **Undo/Redo顺畅**：基于本地状态，秒级响应
3. **数据安全可靠**：自动保存 + 失败重试机制

## 工作流程

### 1. 用户操作流程
```
用户编辑节点
  ↓
立即更新本地状态 (currentPhases)
  ↓
推入历史栈 (globalHistoryManager)
  ↓
标记未保存 (hasUnsavedChanges = true)
  ↓
触发防抖定时器 (1-2秒)
  ↓
自动保存到服务器
  ↓
保存成功后清除未保存标记
```

### 2. Undo/Redo 流程
```
用户按 Ctrl+Z / Ctrl+Y
  ↓
从历史栈获取目标状态
  ↓
立即应用到本地状态
  ↓
应用焦点导航（自动切换文件 + 定位节点）
  ↓
标记未保存
  ↓
触发防抖定时器
  ↓
自动保存到服务器
```

## 分层保存策略

### 1. 立即保存（同步）
- 格式化操作
- 粘贴大段内容
- 拖拽移动节点

### 2. 快速保存（防抖 1-2秒）
- 输入停止后自动保存
- 普通编辑操作
- **Undo/Redo 操作**

### 3. 强制保存（定时）
- 超过 30 秒未保存
- 内容变化较大（超过阈值）

### 4. 兜底保存
- 页面离开前（beforeunload）
- 切换工程前
- 关闭浏览器前

## 实现细节

### 当前实现
```typescript
// 自动保存（需求3）：监听 currentPhases 变化，1秒后自动保存
useEffect(() => {
  // 只在可视化编辑模式且有未保存变化时才自动保存
  if (editMode !== 'visual' || !hasUnsavedChanges || !selectedFile || selectedFile.fileType !== 'session') {
    return;
  }

  // 清除之前的定时器
  if (autoSaveTimerRef.current) {
    clearTimeout(autoSaveTimerRef.current);
  }

  // 设置新的定时器，1秒后自动保存
  autoSaveTimerRef.current = setTimeout(() => {
    handleSave();
  }, 1000);

  // 清理函数
  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, [currentPhases, editMode, hasUnsavedChanges, selectedFile, handleSave]);
```

### 优势分析

#### ✅ 用户体验优势
- **即时反馈**：操作立即生效，无等待
- **流畅操作**：Undo/Redo 秒级响应
- **无感知保存**：后台自动保存，不打扰用户

#### ✅ 数据安全优势
- **防抖机制**：避免频繁请求，减轻服务器压力
- **本地优先**：即使网络延迟，操作也不受影响
- **错误恢复**：保存失败可重试，不丢失用户操作

#### ✅ 跨文件协调
- **全局历史**：一个工程一个编辑历史
- **文件切换**：Undo/Redo 可自动切换文件并定位
- **状态一致**：历史记录包含完整上下文信息

## 与旧方案对比

### 旧方案：按文件隔离历史
```typescript
// 切换文件时清空历史栈
const loadFile = useCallback((file: ScriptFile) => {
  setHistory([]);  // ❌ 清空历史
  setHistoryIndex(-1);
  // ...
});
```
**问题**：无法跨文件 undo/redo，用户体验差

### 新方案：全局历史 + 焦点导航
```typescript
// 切换文件时保留历史栈
const loadFile = useCallback((file: ScriptFile) => {
  // ✅ 不清空历史，支持跨文件操作
  setSelectedActionPath(null);
  // ...
});

// Undo 时自动切换文件
const handleUndo = useCallback(() => {
  const entry = globalHistoryManager.undo();
  applyFocusNavigation(entry.focusPath, entry.fileId);  // ✅ 自动导航
});
```
**优势**：
- ✅ 跨文件 undo/redo
- ✅ 自动导航到修改位置
- ✅ 清晰的操作历史

## 注意事项

### 1. 并发冲突
- 单用户编辑，无并发冲突
- 如需多用户协作，需要增加版本控制和冲突检测

### 2. 网络异常
- 保存失败时保持 `hasUnsavedChanges` 状态
- 用户可手动重试保存（Ctrl+S）
- 可增加离线缓存机制

### 3. 性能优化
- 历史栈限制 100 条，避免内存溢出
- 深拷贝使用 JSON 序列化，对大型脚本可能有性能影响
- 可考虑使用增量更新或 Immer.js

### 4. 数据完整性
- 每次保存都是完整的 YAML 文件
- 服务端不做增量更新，简化实现
- 确保 Undo 后的状态与服务端同步

## 未来优化方向

1. **增量保存**：只保存变化的部分，减少网络传输
2. **冲突检测**：多用户协作时检测并提示冲突
3. **离线支持**：使用 IndexedDB 缓存，支持离线编辑
4. **性能优化**：使用 Immer 或自定义 Diff 算法
5. **历史可视化**：显示操作历史列表，支持时间旅行
