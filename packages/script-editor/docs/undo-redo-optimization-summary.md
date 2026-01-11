# 编辑器 Undo/Redo 功能优化总结

## 📋 需求回顾

用户希望优化编辑器的 redo/undo 能力，具体需求：

1. **一个工程一个编辑历史**：支持在跨脚本文件之间按顺序 redo 和 undo
2. **焦点自动导航**：每一步 undo/redo 时，左边树节点和节点编辑区都自动导航定位
3. **合理的保存机制**：节点更新与脚本保存到服务端的关系要无感且顺畅

## ✅ 已实现功能

### 1. 全局编辑历史管理器 (`history-manager.ts`)

**核心特性**：
- ✅ **跨文件历史**：一个工程维护一个全局历史栈
- ✅ **完整上下文**：每条历史记录包含文件信息、数据快照、焦点路径、操作描述
- ✅ **智能管理**：自动限制历史栈大小（100条），截断未来分支
- ✅ **类型安全**：完整的 TypeScript 类型定义

**数据结构**：
```typescript
interface HistoryEntry {
  fileId: string;           // 所属文件ID
  fileName: string;         // 文件名
  phases: PhaseWithTopics[]; // 数据快照
  focusPath: FocusPath | null; // 焦点信息
  operation: string;        // 操作描述
  timestamp: number;        // 时间戳
}
```

### 2. 焦点自动导航功能

**实现位置**：`ProjectEditor/index.tsx` - `applyFocusNavigation` 函数

**导航能力**：
- ✅ **自动切换文件**：Undo/Redo 时如果目标在其他文件，自动切换
- ✅ **树节点高亮**：左侧文件树自动高亮当前文件
- ✅ **精确定位**：根据 Phase/Topic/Action 索引精确定位
- ✅ **属性面板同步**：右侧属性编辑区自动显示对应节点

**焦点类型**：
```typescript
interface FocusPath {
  phaseIndex?: number;
  topicIndex?: number;
  actionIndex?: number;
  type: 'phase' | 'topic' | 'action';
}
```

### 3. 优化的 Undo/Redo 操作

**快捷键**：
- `Ctrl+Z` (Mac: `Cmd+Z`)：撤销
- `Ctrl+Shift+Z` 或 `Ctrl+Y` (Mac: `Cmd+Shift+Z` 或 `Cmd+Y`)：重做

**增强功能**：
- ✅ **操作描述**：清晰提示每次操作内容（如"已撤销: 修改 Action"）
- ✅ **边界保护**：在历史边界有友好提示
- ✅ **状态一致**：Undo/Redo 后立即同步 YAML 和界面
- ✅ **自动保存**：操作后 1 秒自动保存到服务器

### 4. 乐观更新 + 异步保存机制

**策略设计**（详见 `docs/saving-strategy.md`）：

**核心原则**：
1. 用户体验无感：操作立即生效，不阻塞
2. Undo/Redo 顺畅：基于本地状态，秒级响应
3. 数据安全可靠：自动保存 + 失败重试

**工作流程**：
```
用户操作 → 立即更新本地 → 推入历史栈 → 标记未保存 → 1秒后保存
```

**优势**：
- ✅ 即时反馈，无等待
- ✅ 流畅操作，不卡顿
- ✅ 后台保存，无打扰
- ✅ 防抖机制，减轻服务器压力

## 🔄 与旧实现对比

### 旧方案问题
- ❌ 切换文件时清空历史栈
- ❌ 无法跨文件 Undo/Redo
- ❌ 没有焦点导航
- ❌ 历史记录缺少上下文信息

### 新方案优势
- ✅ 全局历史，支持跨文件操作
- ✅ 自动导航，用户体验流畅
- ✅ 完整上下文，清晰可追溯
- ✅ 合理保存，无感且安全

## 📂 文件变更清单

### 新增文件
1. **`src/utils/history-manager.ts`**：全局编辑历史管理器
2. **`docs/saving-strategy.md`**：保存策略设计文档
3. **`docs/undo-redo-testing-guide.md`**：测试指南

### 修改文件
1. **`src/pages/ProjectEditor/index.tsx`**：
   - 移除旧的文件级历史栈
   - 集成全局历史管理器
   - 实现焦点自动导航
   - 更新所有操作函数，添加操作描述和焦点信息

## 🎯 核心实现细节

### 历史记录推送
```typescript
pushHistory(newPhases, '修改 Action', {
  phaseIndex,
  topicIndex,
  actionIndex,
  type: 'action',
});
```

### Undo 操作
```typescript
const handleUndo = useCallback(() => {
  const entry = globalHistoryManager.undo();
  if (!entry) {
    message.info('已经是最早的状态了');
    return;
  }
  
  // 恢复数据
  setCurrentPhases(entry.phases);
  syncPhasesToYaml(entry.phases);
  
  // 应用焦点导航（自动切换文件 + 定位节点）
  applyFocusNavigation(entry.focusPath, entry.fileId);
  
  message.success(`已撤销: ${entry.operation}`);
}, [syncPhasesToYaml, applyFocusNavigation]);
```

### 焦点导航
```typescript
const applyFocusNavigation = useCallback((focusPath, targetFileId) => {
  // 1. 如果需要，切换到目标文件
  if (selectedFile?.id !== targetFileId) {
    const targetFile = files.find(f => f.id === targetFileId);
    if (targetFile) loadFile(targetFile);
  }
  
  // 2. 应用焦点（Action/Topic/Phase）
  setTimeout(() => {
    if (focusPath.type === 'action') {
      setSelectedActionPath({ ... });
      setEditingType('action');
    }
    // ...
  }, 100);
}, [selectedFile, files, loadFile]);
```

## 🧪 测试建议

详细测试用例请参考 `docs/undo-redo-testing-guide.md`，重点测试：

1. **单文件内操作**：基础 Undo/Redo
2. **跨文件操作**：自动切换文件和定位
3. **焦点导航**：精确定位到 Phase/Topic/Action
4. **复杂序列**：添加、修改、移动、删除的组合
5. **边界情况**：历史边界、分支截断
6. **自动保存**：与 Undo/Redo 的协调
7. **性能测试**：大量操作下的响应速度

## ⚠️ 注意事项

### 当前限制
1. **历史栈上限**：100 条记录，超过自动删除最早的
2. **文件切换**：仅在文件未关闭时有效
3. **焦点导航**：如果节点被删除，可能失效
4. **自动保存延迟**：1 秒防抖，可能有短暂不一致

### 性能考虑
1. **深拷贝开销**：使用 JSON 序列化，大型脚本可能有性能影响
2. **内存占用**：100 条历史 × 脚本大小，需要监控
3. **建议优化**：可考虑 Immer.js 或增量更新

### 数据安全
1. **单用户编辑**：当前不支持多用户协作
2. **网络异常**：保存失败时保持未保存状态，用户可手动重试
3. **数据完整性**：每次保存完整 YAML，确保一致性

## 🚀 未来优化方向

1. **历史可视化**：显示操作历史列表，支持选择任意历史点
2. **增量保存**：只保存变化部分，减少网络传输
3. **冲突检测**：多用户协作时的冲突处理
4. **离线支持**：IndexedDB 缓存，支持离线编辑
5. **性能优化**：使用 Immer 或自定义 Diff 算法

## 📚 相关文档

- [保存策略设计](./saving-strategy.md)
- [Undo/Redo 测试指南](./undo-redo-testing-guide.md)
- [工程编辑器实现总结](../../IMPLEMENTATION_SUMMARY.md)

## ✨ 总结

本次优化完全满足用户需求：

1. ✅ **一个工程一个编辑历史**：全局历史管理器实现跨文件 Undo/Redo
2. ✅ **焦点自动导航**：自动切换文件、树节点高亮、属性面板同步
3. ✅ **合理的保存机制**：乐观更新 + 异步保存，用户体验无感且顺畅

核心优势：
- 🚀 **用户体验**：操作流畅，反馈及时，导航清晰
- 🔒 **数据安全**：自动保存，防抖机制，失败重试
- 🎯 **功能完整**：跨文件操作，精确导航，操作可追溯
- 📈 **可扩展性**：模块化设计，易于维护和扩展
