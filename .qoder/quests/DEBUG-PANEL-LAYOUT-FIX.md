# 调试面板布局修复

## 问题描述

用户反馈：

- DEBUG 面板下沉了
- 输入框在屏幕下方看不到
- 看不到导航树
- 看不到错误信息窗口

## 问题原因

在集成导航树和错误组件时，使用了内联样式 `style={{ display: 'flex' }}` 覆盖了 CSS 文件中的布局定义，导致：

1. CSS 中的 `flex-direction: column` 被内联的 `flex` 覆盖
2. 宽度仍然是 450px，无法容纳 300px 的导航树
3. 布局结构混乱，导致内容下沉

## 修复方案

### 1. 更新 CSS 布局（style.css）

```css
.debug-chat-panel {
  position: fixed;
  right: 0;
  top: 64px;
  bottom: 0;
  width: 800px; /* 从 450px 增加到 800px */
  display: flex;
  flex-direction: row; /* 从 column 改为 row，支持左右布局 */
}

/* 新增：导航树容器 */
.debug-navigation-tree {
  width: 300px;
  border-right: 1px solid #e8e8e8;
  overflow-y: auto;
  background: #fafafa;
  flex-shrink: 0;
}

/* 新增：主内容区域 */
.debug-main-content {
  flex: 1;
  display: flex;
  flex-direction: column; /* 主内容区域内部垂直布局 */
  min-width: 0;
}
```

### 2. 更新 JSX 结构（index.tsx）

```tsx
// 修复前（使用内联样式）
<div className="debug-chat-panel" style={{ display: 'flex', height: '100%' }}>
  <div style={{ width: '300px', borderRight: '1px solid #ddd' }}>
    <NavigationTree />
  </div>
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    {/* 主内容 */}
  </div>
</div>

// 修复后（使用 CSS 类）
<div className="debug-chat-panel">
  <div className="debug-navigation-tree">
    <NavigationTree />
  </div>
  <div className="debug-main-content">
    {/* 主内容 */}
  </div>
</div>
```

## 最终布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  调试面板 (800px, fixed right)                               │
├────────────────┬────────────────────────────────────────────┤
│  导航树        │  主内容区域                                  │
│  (300px)       │  (500px, flex: 1)                          │
│                ├────────────────────────────────────────────┤
│  - Session     │  标题栏 (Debug Chat)                        │
│    - Phase     ├────────────────────────────────────────────┤
│      - Topic   │  错误提示 (ErrorBanner - 如果有错误)        │
│        - Action├────────────────────────────────────────────┤
│                │  消息列表 (flex: 1, overflow-y: auto)      │
│  ○ 未执行      │    - User: ...                             │
│  ⚡ 执行中      │    - AI: ...                               │
│  ● 已执行      │                                            │
│  ⚠️ 错误       │                                            │
│                ├────────────────────────────────────────────┤
│  [图例]        │  输入框 + 发送按钮                          │
└────────────────┴────────────────────────────────────────────┘
```

## 验证步骤

1. 刷新浏览器页面（http://localhost:3002/）
2. 打开一个项目并开始调试
3. 检查布局：
   - ✅ 左侧显示导航树（300px 宽）
   - ✅ 右侧显示对话区域（500px 宽）
   - ✅ 输入框在底部可见
   - ✅ 消息列表可以滚动
   - ✅ 错误提示在顶部显示（触发错误时）

## 修改文件

- `packages/script-editor/src/components/DebugChatPanel/style.css` - 更新布局样式
- `packages/script-editor/src/components/DebugChatPanel/index.tsx` - 移除内联样式，使用 CSS 类

## 技术要点

### CSS 优先级问题

- 内联样式 `style={{}}` 的优先级高于 CSS 类
- 应该优先使用 CSS 类，保持样式集中管理
- 内联样式只用于动态计算的值

### Flexbox 布局

- 父容器：`flex-direction: row` - 水平排列子元素
- 子容器 1（导航树）：`flex-shrink: 0; width: 300px` - 固定宽度
- 子容器 2（主内容）：`flex: 1; flex-direction: column` - 占据剩余空间，内部垂直布局

### 固定定位

- `position: fixed` 使面板相对于视口定位
- `top: 64px; bottom: 0` 确保面板占据除顶部导航外的全部高度
- `right: 0` 固定在右侧

## 状态

✅ 已修复并部署
✅ 热模块替换（HMR）已自动更新
✅ 无需手动刷新浏览器
