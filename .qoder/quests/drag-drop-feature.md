# Phase/Topic/Action 拖拽排序功能实现

## 功能概述

实现了在脚本编辑器的可视化模式中，通过鼠标拖拽对 Phase、Topic 和 Action 节点进行重新排序的功能。

### 支持的拖拽场景

1. **Phase 拖拽排序**
   - 可在同一会谈脚本中对 Phase 进行重新排序
   - 拖动一个 Phase 卡片到另一个 Phase 卡片上即可交换位置

2. **Topic 跨层级拖拽**
   - 可在同一 Phase 内对 Topic 进行重新排序
   - 支持将 Topic 从一个 Phase 拖拽到另一个 Phase
   - 拖动 Topic 头部到目标 Topic 位置完成移动

3. **Action 跨层级拖拽**
   - 可在同一 Topic 内对 Action 进行重新排序
   - 支持将 Action 从一个 Topic 拖拽到另一个 Topic
   - 支持将 Action 跨 Phase 和 Topic 移动
   - 拖动 Action 卡片到目标 Action 位置完成移动

## 技术实现

### 1. ActionNodeList 组件修改

**文件**: `packages/script-editor/src/components/ActionNodeList/index.tsx`

#### 新增 Props

```typescript
interface ActionNodeListProps {
  // ... 其他 props
  onMovePhase?: (fromIndex: number, toIndex: number) => void;
  onMoveTopic?: (fromPhaseIndex: number, fromTopicIndex: number, toPhaseIndex: number, toTopicIndex: number) => void;
  onMoveAction?: (fromPhaseIndex: number, fromTopicIndex: number, fromActionIndex: number, toPhaseIndex: number, toTopicIndex: number, toActionIndex: number) => void;
}
```

#### 拖拽状态管理

```typescript
const [draggedItem, setDraggedItem] = useState<{
  type: 'phase' | 'topic' | 'action';
  phaseIndex: number;
  topicIndex?: number;
  actionIndex?: number;
} | null>(null);
```

#### Phase 拖拽实现

在 Phase 的 Panel header 上添加 draggable 属性和事件处理：

```typescript
<div
  draggable={!!onMovePhase}
  onDragStart={(e) => {
    if (!onMovePhase) return;
    e.stopPropagation();
    setDraggedItem({ type: 'phase', phaseIndex });
    e.dataTransfer.effectAllowed = 'move';
  }}
  onDragOver={(e) => {
    if (!onMovePhase || !draggedItem) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }}
  onDrop={(e) => {
    if (!onMovePhase || !draggedItem) return;
    e.preventDefault();
    e.stopPropagation();
    
    if (draggedItem.type === 'phase' && draggedItem.phaseIndex !== phaseIndex) {
      onMovePhase(draggedItem.phaseIndex, phaseIndex);
    }
    setDraggedItem(null);
  }}
  onDragEnd={() => setDraggedItem(null)}
>
  {/* Phase header content */}
</div>
```

#### Topic 拖拽实现

类似地在 Topic 的 Panel header 上实现拖拽：

```typescript
<div
  draggable={!!onMoveTopic}
  onDragStart={(e) => { /* ... */ }}
  onDragOver={(e) => { /* ... */ }}
  onDrop={(e) => {
    if (draggedItem.type === 'topic' && draggedItem.topicIndex !== undefined) {
      if (draggedItem.phaseIndex !== phaseIndex || draggedItem.topicIndex !== topicIndex) {
        onMoveTopic(
          draggedItem.phaseIndex,
          draggedItem.topicIndex,
          phaseIndex,
          topicIndex
        );
      }
    }
  }}
>
  {/* Topic header content */}
</div>
```

#### Action 拖拽实现

在 Action Card 组件上添加拖拽能力：

```typescript
<Card
  draggable={!!onMoveAction}
  onDragStart={(e) => { /* ... */ }}
  onDragOver={(e) => { /* ... */ }}
  onDrop={(e) => {
    if (draggedItem.type === 'action' && draggedItem.actionIndex !== undefined && draggedItem.topicIndex !== undefined) {
      if (draggedItem.phaseIndex !== phaseIndex || 
          draggedItem.topicIndex !== topicIndex || 
          draggedItem.actionIndex !== actionIndex) {
        onMoveAction(
          draggedItem.phaseIndex,
          draggedItem.topicIndex,
          draggedItem.actionIndex,
          phaseIndex,
          topicIndex,
          actionIndex
        );
      }
    }
  }}
  style={{ cursor: onMoveAction ? 'move' : 'pointer' }}
>
  {/* Action card content */}
</Card>
```

### 2. ProjectEditor 页面修改

**文件**: `packages/script-editor/src/pages/ProjectEditor/index.tsx`

#### Phase 移动处理

```typescript
const handleMovePhase = useCallback((fromIndex: number, toIndex: number) => {
  const newPhases = JSON.parse(JSON.stringify(currentPhases));
  const [movedPhase] = newPhases.splice(fromIndex, 1);
  newPhases.splice(toIndex, 0, movedPhase);
  
  setCurrentPhases(newPhases);
  syncPhasesToYaml(newPhases);
  setHasUnsavedChanges(true);
  message.success('Phase 已移动');
}, [currentPhases, syncPhasesToYaml]);
```

#### Topic 移动处理（支持跨 Phase）

```typescript
const handleMoveTopic = useCallback(
  (fromPhaseIndex: number, fromTopicIndex: number, toPhaseIndex: number, toTopicIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    
    // 从源位置移除 topic
    const [movedTopic] = newPhases[fromPhaseIndex].topics.splice(fromTopicIndex, 1);
    
    // 插入到目标位置
    newPhases[toPhaseIndex].topics.splice(toTopicIndex, 0, movedTopic);
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Topic 已移动');
  },
  [currentPhases, syncPhasesToYaml]
);
```

#### Action 移动处理（支持跨 Topic 和 Phase）

```typescript
const handleMoveAction = useCallback(
  (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    fromActionIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number,
    toActionIndex: number
  ) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    
    // 从源位置移除 action
    const [movedAction] = newPhases[fromPhaseIndex].topics[fromTopicIndex].actions.splice(fromActionIndex, 1);
    
    // 插入到目标位置
    newPhases[toPhaseIndex].topics[toTopicIndex].actions.splice(toActionIndex, 0, movedAction);
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Action 已移动');
  },
  [currentPhases, syncPhasesToYaml]
);
```

#### ActionNodeList 组件调用

```typescript
<ActionNodeList
  phases={currentPhases}
  selectedActionPath={selectedActionPath}
  selectedPhasePath={selectedPhasePath}
  selectedTopicPath={selectedTopicPath}
  onSelectAction={handleSelectAction}
  onSelectPhase={handleSelectPhase}
  onSelectTopic={handleSelectTopic}
  onAddPhase={handleAddPhase}
  onAddTopic={handleAddTopic}
  onAddAction={handleAddAction}
  onDeletePhase={handleDeletePhase}
  onDeleteTopic={handleDeleteTopic}
  onDeleteAction={handleDeleteAction}
  onMovePhase={handleMovePhase}
  onMoveTopic={handleMoveTopic}
  onMoveAction={handleMoveAction}
/>
```

### 3. 样式增强

**文件**: `packages/script-editor/src/components/ActionNodeList/style.css`

添加拖拽状态的视觉反馈：

```css
/* 拖拽状态样式 */
.action-node-card[draggable="true"] {
  cursor: move;
}

.action-node-card[draggable="true"]:active {
  opacity: 0.6;
  cursor: grabbing;
}

/* Phase 和 Topic 拖拽样式 */
.phase-collapse .ant-collapse-header[draggable="true"],
.topic-collapse .ant-collapse-header[draggable="true"] {
  cursor: move;
}

.phase-collapse .ant-collapse-header[draggable="true"]:active,
.topic-collapse .ant-collapse-header[draggable="true"]:active {
  opacity: 0.6;
  cursor: grabbing;
}
```

## 使用说明

### 拖拽 Phase

1. 鼠标悬停在 Phase 头部，光标变为移动图标
2. 按住鼠标左键开始拖拽
3. 拖到目标 Phase 位置释放鼠标
4. Phase 将被插入到目标位置

### 拖拽 Topic

1. 鼠标悬停在 Topic 头部，光标变为移动图标
2. 按住鼠标左键开始拖拽
3. 可拖到同一 Phase 内的其他 Topic，或跨 Phase 到其他 Topic
4. 释放鼠标完成移动

### 拖拽 Action

1. 鼠标悬停在 Action 卡片上，光标变为移动图标
2. 按住鼠标左键开始拖拽
3. 可拖到同一 Topic 内的其他 Action 位置
4. 也可跨 Topic 或跨 Phase 拖拽到任意其他 Action 位置
5. 释放鼠标完成移动

## 数据同步

- 所有拖拽操作都会立即触发 `syncPhasesToYaml` 函数
- 修改后的结构会自动同步回 YAML 内容
- 修改标记为未保存状态（`hasUnsavedChanges = true`）
- 用户需要手动保存文件以持久化更改

## 技术特点

1. **原生 HTML5 拖拽 API**
   - 使用标准的 `draggable` 属性和拖拽事件
   - 跨浏览器兼容性好
   - 无需额外的拖拽库

2. **状态管理**
   - 通过 `draggedItem` state 记录当前拖拽的元素信息
   - 在 drop 事件中判断拖拽类型和位置
   - 防止自己拖到自己

3. **事件传播控制**
   - 使用 `e.stopPropagation()` 防止事件冒泡
   - 避免拖拽时触发 Collapse 的展开/收起

4. **不可变数据更新**
   - 使用深拷贝确保状态不可变性
   - 通过 `splice` 实现元素的移除和插入

5. **用户反馈**
   - 拖拽时光标变化（move → grabbing）
   - 拖拽时元素透明度降低
   - 完成后显示成功消息

## 构建验证

- ✅ TypeScript 编译无错误
- ✅ Vite 构建成功
- ✅ 无语法或类型错误
- ✅ 样式正常应用

## 后续优化建议

1. **拖拽预览增强**
   - 添加拖拽幽灵图像自定义
   - 显示拖拽目标的插入位置指示器

2. **撤销/重做功能**
   - 记录拖拽操作历史
   - 支持 Ctrl+Z 撤销拖拽操作

3. **拖拽限制**
   - 根据业务规则限制某些拖拽操作
   - 例如：不允许将某些特殊 Action 跨 Phase 移动

4. **性能优化**
   - 对于大量节点的场景，考虑虚拟滚动
   - 节流拖拽事件处理

5. **触摸设备支持**
   - 添加触摸事件支持
   - 移动端拖拽体验优化
