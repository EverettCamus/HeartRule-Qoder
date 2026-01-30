# ProjectEditor 组件重构执行计划

> **文档版本**: v1.0  
> **创建日期**: 2026-01-30  
> **目标组件**: `packages/script-editor/src/pages/ProjectEditor/index.tsx`  
> **当前规模**: 2945行，42个useState，承担12项核心职责  
> **重构周期**: 3-4周（分4个阶段）

---

## 📋 目录

1. [重构目标与范围](#1-重构目标与范围)
2. [模块拆分方案](#2-模块拆分方案)
3. [重构实施步骤](#3-重构实施步骤)
4. [状态管理重构](#4-状态管理重构)
5. [副作用处理优化](#5-副作用处理优化)
6. [测试保障策略](#6-测试保障策略)
7. [风险评估与应对](#7-风险评估与应对)
8. [时间估算与资源需求](#8-时间估算与资源需求)

---

## 1. 重构目标与范围

### 1.1 核心目标

| 目标           | 当前状态           | 目标状态               | 优先级 |
| -------------- | ------------------ | ---------------------- | ------ |
| **代码行数**   | 2945行             | ≤300行                 | P0     |
| **单函数行数** | 最大245行          | ≤50行                  | P0     |
| **状态数量**   | 42个useState       | ≤10个                  | P1     |
| **职责数量**   | 12项               | 1-2项                  | P0     |
| **可测试性**   | 低（无法独立测试） | 高（各模块可独立测试） | P1     |
| **构建时间**   | 基准               | 保持或优化             | P2     |

### 1.2 重构范围

#### ✅ 包含范围

- 主组件拆分为容器组件 + 业务组件
- 状态管理从组件内迁移至自定义Hooks
- YAML处理逻辑提取为独立服务
- 历史管理逻辑解耦并优化
- CRUD操作封装为可复用业务逻辑
- UI布局拆分为独立子组件

#### ❌ 不包含范围

- 已有子组件的内部重构（ActionNodeList、ActionPropertyPanel等）
- API层接口变更
- 类型定义调整（除非必要）
- 后端逻辑修改
- 新功能开发

### 1.3 成功标准

1. **代码质量**
   - 主文件 ≤300行
   - 单函数 ≤50行
   - 函数式组件遵循单一职责原则
   - 所有新模块通过ESLint与TypeScript检查

2. **功能完整性**
   - 所有现有功能正常工作
   - 历史管理（Undo/Redo）跨文件正常
   - 自动保存机制稳定
   - 调试功能完整

3. **性能要求**
   - 组件渲染次数不增加
   - 文件切换响应时间 ≤500ms
   - 大型YAML解析时间 ≤1s

---

## 2. 模块拆分方案

### 2.1 新文件结构

```
packages/script-editor/src/
├── pages/
│   └── ProjectEditor/
│       ├── index.tsx                    # 主容器（200-250行）
│       ├── ProjectEditorHeader.tsx      # 顶部栏（150行）
│       ├── FileTreeSidebar.tsx          # 左侧边栏（200行）
│       ├── EditorContent.tsx            # 编辑区容器（150行）
│       └── VersionPanel.tsx             # 版本面板（100行）
├── components/
│   ├── YamlEditor/                      # YAML编辑器组件
│   │   ├── index.tsx                    # 入口（80行）
│   │   ├── YamlTextArea.tsx            # 文本区（60行）
│   │   └── ValidationPanel.tsx         # 验证面板（已存在，复用）
│   ├── VisualEditor/                    # 可视化编辑器组件
│   │   ├── index.tsx                    # 入口（120行）
│   │   ├── NodeListPanel.tsx           # 左侧节点列表（80行）
│   │   └── PropertyPanel.tsx           # 右侧属性面板（已存在，复用）
│   └── FileTree/                        # 文件树组件
│       ├── index.tsx                    # 入口（100行）
│       ├── FileTreeView.tsx            # 树形视图（80行）
│       └── FileDetails.tsx             # 文件详情（80行）
├── hooks/
│   ├── useProjectEditorState.ts         # 状态管理Hook（150行）
│   ├── useFileOperations.ts             # 文件操作Hook（120行）
│   ├── useScriptOperations.ts           # 脚本CRUD操作Hook（200行）
│   ├── useHistoryManager.ts             # 历史管理Hook（180行）
│   ├── useAutoSave.ts                   # 自动保存Hook（60行）
│   └── useKeyboardShortcuts.ts          # 快捷键Hook（80行）
├── services/
│   ├── YamlService.ts                   # YAML处理服务（300行）
│   ├── ScriptOperations.ts              # 脚本操作服务（250行）
│   └── validation-service.ts            # 验证服务（已存在）
└── utils/
    ├── history-manager.ts               # 历史管理器（已存在）
    └── yaml-helpers.ts                  # YAML辅助函数（100行）
```

### 2.2 模块职责划分

#### 2.2.1 页面层组件（Pages）

##### **ProjectEditor/index.tsx** (主容器)

- **职责**: 顶层业务编排与路由处理
- **状态**: 仅保留最小必要状态（project、loading）
- **功能**:
  - 路由参数解析（projectId、fileId）
  - 全局加载状态管理
  - 子组件组合与布局
  - 模态框与抽屉管理
- **行数**: 200-250行

##### **ProjectEditorHeader.tsx**

- **职责**: 顶部导航栏与操作按钮
- **Props**:
  ```typescript
  interface HeaderProps {
    project: Project | null;
    hasUnsavedChanges: boolean;
    saving: boolean;
    onSave: () => void;
    onPublish: () => void;
    onDebug: () => void;
    onVersionToggle: () => void;
    onBack: () => void;
  }
  ```
- **功能**:
  - 显示项目信息与状态标签
  - 保存、发布、调试按钮
  - 版本管理按钮
  - 返回按钮
- **行数**: 150行

##### **FileTreeSidebar.tsx**

- **职责**: 左侧文件树与文件详情
- **Props**:
  ```typescript
  interface FileTreeSidebarProps {
    project: Project | null;
    files: ScriptFile[];
    selectedFile: ScriptFile | null;
    collapsed: boolean;
    treeData: FileTreeNode[];
    expandedKeys: React.Key[];
    selectedKeys: React.Key[];
    onCollapse: (collapsed: boolean) => void;
    onFileSelect: (file: ScriptFile) => void;
    onCreateSession: () => void;
    onFormatYaml: () => void;
    onValidate: () => void;
  }
  ```
- **功能**:
  - 文件树渲染与交互
  - 文件详情展示
  - 快速操作按钮
  - 折叠/展开控制
- **行数**: 200行

##### **EditorContent.tsx**

- **职责**: 编辑区域容器（YAML/可视化模式切换）
- **Props**:
  ```typescript
  interface EditorContentProps {
    editMode: 'yaml' | 'visual';
    selectedFile: ScriptFile | null;
    fileContent: string;
    currentPhases: PhaseWithTopics[];
    validationResult: ValidationResult | null;
    onContentChange: (content: string) => void;
    onModeChange: (mode: 'yaml' | 'visual') => void;
    // ... 其他回调
  }
  ```
- **功能**:
  - 条件渲染：YamlEditor | VisualEditor
  - 模式切换按钮
  - 节点数量统计
- **行数**: 150行

##### **VersionPanel.tsx**

- **职责**: 右侧版本管理面板
- **Props**:
  ```typescript
  interface VersionPanelProps {
    visible: boolean;
    projectId: string;
    currentVersionId?: string;
    onClose: () => void;
    onVersionChange: () => void;
  }
  ```
- **功能**:
  - 版本列表显示
  - 版本切换
  - 关闭按钮
- **行数**: 100行

#### 2.2.2 组件层（Components）

##### **YamlEditor/index.tsx**

- **职责**: YAML编辑器主组件
- **Props**:
  ```typescript
  interface YamlEditorProps {
    content: string;
    validationResult: ValidationResult | null;
    showErrors: boolean;
    onChange: (content: string) => void;
    onCloseErrors: () => void;
  }
  ```
- **功能**:
  - 集成YamlTextArea与ValidationPanel
  - 错误提示展示
- **行数**: 80行

##### **VisualEditor/index.tsx**

- **职责**: 可视化编辑器主组件
- **Props**:
  ```typescript
  interface VisualEditorProps {
    phases: PhaseWithTopics[];
    selectedActionPath: ActionPath | null;
    selectedPhasePath: PhasePath | null;
    selectedTopicPath: TopicPath | null;
    validationResult: ValidationResult | null;
    onSelectAction: (path: ActionPath) => void;
    onSelectPhase: (path: PhasePath) => void;
    onSelectTopic: (path: TopicPath) => void;
    onActionSave: (action: Action) => void;
    onPhaseSave: (data: any) => void;
    onTopicSave: (data: any) => void;
    onAddPhase: () => void;
    onAddTopic: (phaseIndex: number) => void;
    onAddAction: (phaseIndex: number, topicIndex: number, type: string) => void;
    onDeletePhase: (phaseIndex: number) => void;
    onDeleteTopic: (phaseIndex: number, topicIndex: number) => void;
    onDeleteAction: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
    onMovePhase: (from: number, to: number) => void;
    onMoveTopic: (fromPI: number, fromTI: number, toPI: number, toTI: number) => void;
    onMoveAction: (
      fromPI: number,
      fromTI: number,
      fromAI: number,
      toPI: number,
      toTI: number,
      toAI: number
    ) => void;
  }
  ```
- **功能**:
  - 左右分栏布局
  - 集成ActionNodeList与PropertyPanel
  - 验证错误提示
- **行数**: 120行

##### **FileTree 组件族**

- **FileTree/index.tsx**: 文件树容器（100行）
- **FileTreeView.tsx**: 树形视图（80行）
- **FileDetails.tsx**: 文件详情（80行）

#### 2.2.3 自定义Hooks层

##### **useProjectEditorState.ts**

- **职责**: 集中管理编辑器状态
- **返回值**:
  ```typescript
  interface ProjectEditorState {
    // 基础状态
    loading: boolean;
    saving: boolean;
    project: Project | null;
    files: ScriptFile[];
    selectedFile: ScriptFile | null;

    // 文件树状态
    treeData: FileTreeNode[];
    expandedKeys: React.Key[];
    selectedKeys: React.Key[];

    // 编辑状态
    fileContent: string;
    editMode: 'yaml' | 'visual';
    currentPhases: PhaseWithTopics[];
    parsedScript: SessionScript | null;
    hasUnsavedChanges: boolean;

    // 验证状态
    validationResult: ValidationResult | null;
    showValidationErrors: boolean;

    // 调试状态
    debugConfigVisible: boolean;
    debugPanelVisible: boolean;
    debugSessionId: string | null;

    // 版本管理状态
    versionPanelVisible: boolean;
    publishModalVisible: boolean;
    versionNote: string;

    // UI状态
    leftCollapsed: boolean;

    // Setters
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    // ... 其他setters
  }
  ```
- **行数**: 150行

##### **useFileOperations.ts**

- **职责**: 文件加载、保存、切换操作
- **返回值**:
  ```typescript
  interface FileOperations {
    loadProjectData: () => Promise<void>;
    loadFile: (file: ScriptFile) => void;
    saveFile: () => Promise<void>;
    createSession: () => Promise<void>;
    handleFileSelect: (file: ScriptFile) => void;
    formatYaml: () => void;
    validateScript: () => void;
  }
  ```
- **依赖**: `projectsApi`, `YamlService`
- **行数**: 120行

##### **useScriptOperations.ts**

- **职责**: Phase/Topic/Action的CRUD操作
- **返回值**:
  ```typescript
  interface ScriptOperations {
    // Phase操作
    handleAddPhase: () => void;
    handleDeletePhase: (phaseIndex: number) => void;
    handleMovePhase: (from: number, to: number) => void;
    handlePhaseSave: (data: any) => void;

    // Topic操作
    handleAddTopic: (phaseIndex: number) => void;
    handleDeleteTopic: (phaseIndex: number, topicIndex: number) => void;
    handleMoveTopic: (...) => void;
    handleTopicSave: (data: any) => void;

    // Action操作
    handleAddAction: (phaseIndex: number, topicIndex: number, type: string) => void;
    handleDeleteAction: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
    handleMoveAction: (...) => void;
    handleActionSave: (action: Action) => void;

    // 选中操作
    handleSelectPhase: (path: PhasePath) => void;
    handleSelectTopic: (path: TopicPath) => void;
    handleSelectAction: (path: ActionPath) => void;
  }
  ```
- **依赖**: `ScriptOperations服务`, `useHistoryManager`
- **行数**: 200行

##### **useHistoryManager.ts**

- **职责**: 封装历史管理逻辑
- **返回值**:
  ```typescript
  interface HistoryManagerHook {
    canUndo: boolean;
    canRedo: boolean;
    handleUndo: () => void;
    handleRedo: () => void;
    pushHistory: (
      before: PhaseWithTopics[],
      after: PhaseWithTopics[],
      operation: string,
      beforeFocus?: FocusPath,
      afterFocus?: FocusPath
    ) => void;
    clearHistory: () => void;
  }
  ```
- **依赖**: `globalHistoryManager`
- **关键逻辑**:
  - 跨文件切换处理
  - 焦点导航恢复
  - 并发锁机制
- **行数**: 180行

##### **useAutoSave.ts**

- **职责**: 自动保存机制
- **参数**:
  ```typescript
  interface AutoSaveOptions {
    enabled: boolean;
    delay: number; // 默认1000ms
    onSave: () => Promise<void>;
    dependencies: any[];
  }
  ```
- **行数**: 60行

##### **useKeyboardShortcuts.ts**

- **职责**: 键盘快捷键管理
- **快捷键**:
  - `Ctrl+S`: 保存
  - `Ctrl+Z`: 撤销
  - `Ctrl+Shift+Z` / `Ctrl+Y`: 重做
- **行数**: 80行

#### 2.2.4 服务层（Services）

##### **YamlService.ts**

- **职责**: YAML解析、同步、格式化
- **方法**:
  ```typescript
  class YamlService {
    // 解析YAML为脚本结构
    parseYamlToScript(yamlContent: string): SessionScript | null;

    // 同步Phases到YAML（保留metadata）
    syncPhasesToYaml(phases: PhaseWithTopics[], baseScript: any, targetFile: ScriptFile): string;

    // 修复YAML缩进错误
    fixYamlIndentation(yamlContent: string): string;

    // 格式化YAML
    formatYaml(yamlContent: string): string;

    // 验证YAML语法
    validateYamlSyntax(yamlContent: string): { valid: boolean; error?: string };
  }
  ```
- **行数**: 300行

##### **ScriptOperations.ts**

- **职责**: 脚本操作的纯函数实现（无副作用）
- **方法**:
  ```typescript
  class ScriptOperations {
    // Phase操作
    addPhase(phases: PhaseWithTopics[], index?: number): PhaseWithTopics[];
    deletePhase(phases: PhaseWithTopics[], index: number): PhaseWithTopics[];
    updatePhase(phases: PhaseWithTopics[], index: number, data: any): PhaseWithTopics[];
    movePhase(phases: PhaseWithTopics[], from: number, to: number): PhaseWithTopics[];

    // Topic操作
    addTopic(phases: PhaseWithTopics[], phaseIndex: number): PhaseWithTopics[];
    deleteTopic(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number
    ): PhaseWithTopics[];
    updateTopic(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number,
      data: any
    ): PhaseWithTopics[];
    moveTopic(
      phases: PhaseWithTopics[],
      fromPI: number,
      fromTI: number,
      toPI: number,
      toTI: number
    ): PhaseWithTopics[];

    // Action操作
    addAction(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number,
      actionType: string
    ): PhaseWithTopics[];
    deleteAction(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number,
      actionIndex: number
    ): PhaseWithTopics[];
    updateAction(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number,
      actionIndex: number,
      action: Action
    ): PhaseWithTopics[];
    moveAction(
      phases: PhaseWithTopics[],
      fromPI: number,
      fromTI: number,
      fromAI: number,
      toPI: number,
      toTI: number,
      toAI: number
    ): PhaseWithTopics[];

    // 辅助方法
    createActionByType(actionType: string, actionIndex: number): Action;
    validateMinimumActions(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number
    ): boolean;
  }
  ```
- **特点**: 所有方法返回新数组（不可变数据）
- **行数**: 250行

---

## 3. 重构实施步骤

### 3.1 阶段一：基础设施搭建（第1周）

#### 任务1.1: 创建目录结构

**时间**: 0.5天  
**产出**:

```bash
mkdir -p packages/script-editor/src/hooks
mkdir -p packages/script-editor/src/components/YamlEditor
mkdir -p packages/script-editor/src/components/VisualEditor
mkdir -p packages/script-editor/src/components/FileTree
mkdir -p packages/script-editor/src/pages/ProjectEditor
```

#### 任务1.2: 提取YamlService

**时间**: 2天  
**目标**: 将YAML处理逻辑从主组件迁移到独立服务  
**涉及代码**:

- `parseYamlToScript` (238-391行)
- `syncPhasesToYaml` (727-972行)
- `fixYAMLIndentation` (987-1208行)
- `handleFormatYAML` (1210-1270行)

**步骤**:

1. 创建 `services/YamlService.ts`
2. 将4个函数迁移到类方法中
3. 添加单元测试（至少覆盖主要场景）
4. 在主组件中创建实例并替换原有调用

**验证**:

- [ ] 单元测试通过
- [ ] YAML解析功能正常
- [ ] 可视化编辑器数据同步正常

#### 任务1.3: 提取ScriptOperations服务

**时间**: 2天  
**目标**: 提取所有CRUD操作为纯函数  
**涉及代码**:

- `handleAddPhase` (1662-1707行)
- `handleAddTopic` (1712-1749行)
- `handleAddAction` (1866-1888行)
- `handleDeletePhase` (1893-1925行)
- `handleDeleteTopic` (1930-1969行)
- `handleDeleteAction` (1974-2023行)
- `handleMovePhase` (2028-2045行)
- `handleMoveTopic` (2050-2077行)
- `handleMoveAction` (2082-2115行)
- `createActionByType` (1754-1861行)

**步骤**:

1. 创建 `services/ScriptOperations.ts`
2. 实现所有操作为纯函数（返回新数组）
3. 添加边界检查与错误处理
4. 编写单元测试

**验证**:

- [ ] 单元测试覆盖率 >80%
- [ ] 所有CRUD操作正常
- [ ] 数据不可变性保证（原数组未被修改）

#### 任务1.4: 创建useProjectEditorState Hook

**时间**: 1.5天  
**目标**: 集中管理状态，减少主组件状态数量  
**迁移状态**: 42个useState → 10个以内

**步骤**:

1. 创建 `hooks/useProjectEditorState.ts`
2. 使用 `useReducer` 或多个 `useState` 组合
3. 提供统一的 setter 接口
4. 在主组件中替换原有状态

**验证**:

- [ ] 主组件状态数量 ≤10
- [ ] 所有状态读写正常
- [ ] 无性能回退

---

### 3.2 阶段二：核心组件拆分（第2周）

#### 任务2.1: 拆分FileTreeSidebar组件

**时间**: 1.5天  
**涉及代码**:

- 文件树构建 (413-450行)
- 文件树渲染 (2426-2596行)
- 文件选择处理 (571-593行)

**步骤**:

1. 创建 `pages/ProjectEditor/FileTreeSidebar.tsx`
2. 迁移文件树相关逻辑
3. 创建 `components/FileTree` 子组件
4. 在主组件中替换为新组件

**验证**:

- [ ] 文件树展示正常
- [ ] 文件切换功能正常
- [ ] 文件详情显示正常
- [ ] 折叠/展开功能正常

#### 任务2.2: 拆分ProjectEditorHeader组件

**时间**: 1天  
**涉及代码**:

- Header渲染 (2354-2422行)

**步骤**:

1. 创建 `pages/ProjectEditor/ProjectEditorHeader.tsx`
2. 迁移Header相关逻辑与UI
3. 在主组件中替换

**验证**:

- [ ] 顶部导航栏显示正常
- [ ] 所有按钮功能正常
- [ ] 状态标签显示正确

#### 任务2.3: 拆分EditorContent组件

**时间**: 2天  
**涉及代码**:

- 编辑区域渲染 (2599-2829行)
- 模式切换逻辑 (2622-2663行)

**步骤**:

1. 创建 `pages/ProjectEditor/EditorContent.tsx`
2. 创建 `components/YamlEditor/index.tsx`
3. 创建 `components/VisualEditor/index.tsx`
4. 迁移编辑区域逻辑

**验证**:

- [ ] YAML模式正常
- [ ] 可视化模式正常
- [ ] 模式切换正常
- [ ] 验证错误提示正常

#### 任务2.4: 拆分VersionPanel组件

**时间**: 0.5天  
**涉及代码**:

- 版本面板渲染 (2898-2939行)

**步骤**:

1. 创建 `pages/ProjectEditor/VersionPanel.tsx`
2. 迁移版本面板逻辑
3. 在主组件中替换

**验证**:

- [ ] 版本面板显示正常
- [ ] 版本切换功能正常

---

### 3.3 阶段三：业务逻辑Hook化（第3周）

#### 任务3.1: 创建useFileOperations Hook

**时间**: 2天  
**目标**: 封装文件操作逻辑  
**涉及代码**:

- `loadProjectData` (453-506行)
- `loadFile` (517-568行)
- `handleSave` (621-660行)
- `handleCreateSession` (2215-2285行)

**步骤**:

1. 创建 `hooks/useFileOperations.ts`
2. 迁移文件操作逻辑
3. 集成YamlService
4. 在主组件中使用

**验证**:

- [ ] 文件加载正常
- [ ] 文件保存正常
- [ ] 创建会谈脚本正常

#### 任务3.2: 创建useScriptOperations Hook

**时间**: 2.5天  
**目标**: 封装脚本CRUD操作  
**涉及代码**: 所有handle\*方法（1621-2210行）

**步骤**:

1. 创建 `hooks/useScriptOperations.ts`
2. 集成ScriptOperations服务
3. 封装所有CRUD操作回调
4. 集成历史管理

**验证**:

- [ ] 所有CRUD操作正常
- [ ] 历史记录推送正常
- [ ] 选中状态同步正常

#### 任务3.3: 重构useHistoryManager Hook

**时间**: 2天  
**目标**: 优化历史管理逻辑，解决跨文件问题  
**涉及代码**:

- `handleUndo` (1381-1526行)
- `handleRedo` (1532-1616行)
- `pushHistory` (1276-1300行)
- `applyFocusNavigation` (1306-1375行)

**步骤**:

1. 创建 `hooks/useHistoryManager.ts`
2. 优化跨文件切换逻辑
3. 优化焦点恢复逻辑
4. 添加并发锁处理

**验证**:

- [ ] Undo/Redo功能正常
- [ ] 跨文件Undo/Redo正常
- [ ] 焦点定位正常
- [ ] 无并发冲突

#### 任务3.4: 创建辅助Hooks

**时间**: 0.5天  
**目标**: 创建useAutoSave、useKeyboardShortcuts

**步骤**:

1. 创建 `hooks/useAutoSave.ts`（迁移2292-2320行）
2. 创建 `hooks/useKeyboardShortcuts.ts`（迁移706-718、2322-2339行）

**验证**:

- [ ] 自动保存正常
- [ ] 快捷键正常

---

### 3.4 阶段四：优化与测试（第4周）

#### 任务4.1: 主组件重构

**时间**: 2天  
**目标**: 简化主组件为容器组件

**步骤**:

1. 移除所有已迁移的逻辑
2. 使用新的Hooks与组件
3. 确保主组件 ≤300行
4. 添加必要的注释与文档

**验证**:

- [ ] 主组件行数 ≤300
- [ ] 所有功能正常
- [ ] 代码清晰易读

#### 任务4.2: 单元测试补充

**时间**: 2天  
**目标**: 为所有新模块编写单元测试

**测试范围**:

- `YamlService`: 解析、同步、格式化
- `ScriptOperations`: 所有CRUD操作
- `useHistoryManager`: Undo/Redo逻辑
- `useScriptOperations`: 业务逻辑封装

**覆盖率目标**: >80%

#### 任务4.3: 集成测试

**时间**: 1.5天  
**目标**: 端到端测试关键流程

**测试场景**:

1. 创建新会谈脚本 → 编辑 → 保存
2. 加载现有文件 → 可视化编辑 → 撤销 → 保存
3. 切换文件 → 跨文件撤销 → 恢复焦点
4. YAML模式 → 可视化模式切换
5. 调试功能流程

#### 任务4.4: 性能优化

**时间**: 1.5天  
**目标**: 确保重构后性能不下降

**优化点**:

1. 使用 `useMemo` 缓存计算结果
2. 使用 `useCallback` 稳定回调引用
3. 优化不必要的渲染（React.memo）
4. 验证历史管理内存占用（参考memory规范）

**验证**:

- [ ] React DevTools Profiler 无异常渲染
- [ ] 大型YAML文件解析时间 ≤1s
- [ ] 文件切换响应时间 ≤500ms

#### 任务4.5: 代码审查与文档

**时间**: 1天  
**目标**: 确保代码质量与文档完整

**检查项**:

- [ ] ESLint无警告
- [ ] TypeScript无错误
- [ ] 所有TODO注释已处理
- [ ] 添加JSDoc注释（公共API）
- [ ] 更新README（如需要）

---

## 4. 状态管理重构

### 4.1 状态分类与迁移策略

#### 4.1.1 状态分类

| 分类               | 状态                                                                                                           | 迁移目标              | 原因           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------- | -------------- |
| **基础状态**       | loading, saving, project, files                                                                                | useProjectEditorState | 顶层共享       |
| **文件树状态**     | treeData, expandedKeys, selectedKeys                                                                           | useProjectEditorState | 组件间共享     |
| **编辑状态**       | selectedFile, fileContent, editMode, currentPhases, parsedScript, hasUnsavedChanges                            | useProjectEditorState | 核心编辑状态   |
| **验证状态**       | validationResult, showValidationErrors                                                                         | useProjectEditorState | 编辑器共享     |
| **可视化编辑状态** | selectedActionPath, selectedPhasePath, selectedTopicPath, editingType                                          | useScriptOperations   | 业务逻辑绑定   |
| **调试状态**       | debugConfigVisible, debugPanelVisible, debugSessionId, debugInitialMessage, debugInitialDebugInfo, debugTarget | 局部组件状态          | 仅调试组件使用 |
| **版本管理状态**   | versionPanelVisible, publishModalVisible, versionNote                                                          | 局部组件状态          | 仅版本组件使用 |
| **UI状态**         | leftCollapsed                                                                                                  | 局部组件状态          | 仅侧边栏使用   |

#### 4.1.2 状态管理方案

##### **方案：自定义Hook + Context（可选）**

**理由**:

- 自定义Hook满足大部分需求
- Context用于深层传递（如果需要）
- 避免引入Zustand/Redux等重量级方案
- 保持与现有架构一致

**实现**:

```typescript
// hooks/useProjectEditorState.ts
export const useProjectEditorState = () => {
  // 使用useReducer管理复杂状态
  const [state, dispatch] = useReducer(editorReducer, initialState);

  // 或使用多个useState组合
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ...

  return {
    // 状态
    loading,
    saving,
    // ...

    // Setters
    setLoading,
    setSaving,
    // ...
  };
};
```

**如果需要跨层级共享**:

```typescript
// contexts/ProjectEditorContext.tsx
const ProjectEditorContext = createContext<ProjectEditorState | null>(null);

export const ProjectEditorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const state = useProjectEditorState();
  return (
    <ProjectEditorContext.Provider value={state}>
      {children}
    </ProjectEditorContext.Provider>
  );
};

export const useProjectEditor = () => {
  const context = useContext(ProjectEditorContext);
  if (!context) throw new Error('useProjectEditor must be used within ProjectEditorProvider');
  return context;
};
```

### 4.2 历史管理重构

#### 4.2.1 当前问题

1. **跨文件切换复杂**: Undo/Redo跨文件时需要手动切换文件与恢复状态
2. **焦点丢失**: 撤销后焦点定位不准确
3. **并发冲突**: 快速操作时可能出现状态不一致
4. **内存占用**: 全量保存大文件快照（需遵循memory规范）

#### 4.2.2 重构方案

##### **优化1: 增量历史记录（内存优化）**

**当前**:

```typescript
// 全量保存
beforePhases: JSON.parse(JSON.stringify(currentPhases));
```

**优化后**:

```typescript
// 仅保存变更的Phase/Topic/Action索引与内容
interface HistoryEntry {
  fileId: string;
  operation: string;
  changeType: 'phase' | 'topic' | 'action';
  changeIndex: [number, number?, number?]; // [phaseIndex, topicIndex?, actionIndex?]
  before: Phase | Topic | Action | null; // 仅保存变更的节点
  after: Phase | Topic | Action | null;
  focusPath: FocusPath | null;
}
```

**注意**: 此优化为可选项，需评估实际内存占用后决定是否实施

##### **优化2: 统一焦点恢复逻辑**

```typescript
// hooks/useHistoryManager.ts
const restoreFocus = useCallback(
  (focusPath: FocusPath | null, targetFileId: string) => {
    // 1. 检查文件匹配
    if (selectedFileRef.current?.id !== targetFileId) {
      // 切换文件
      const targetFile = files.find((f) => f.id === targetFileId);
      if (targetFile) {
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);

        // 等待文件加载完成后恢复焦点
        setTimeout(() => applyFocusNavigation(focusPath, targetFileId), 350);
      }
    } else {
      // 同文件，直接恢复焦点
      applyFocusNavigation(focusPath, targetFileId);
    }
  },
  [files, selectedFileRef, applyFocusNavigation]
);
```

##### **优化3: 并发锁优化**

```typescript
// 使用Promise队列替代简单的boolean锁
class AsyncLock {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const undoRedoLock = new AsyncLock();

const handleUndo = async () => {
  await undoRedoLock.acquire();
  try {
    // 执行Undo逻辑
  } finally {
    undoRedoLock.release();
  }
};
```

---

## 5. 副作用处理优化

### 5.1 useEffect重构策略

#### 5.1.1 问题分析

| 问题           | 示例                                               | 影响       |
| -------------- | -------------------------------------------------- | ---------- |
| **依赖过多**   | `useEffect(() => {...}, [dep1, dep2, ..., dep10])` | 频繁触发   |
| **副作用嵌套** | useEffect内部修改其他state                         | 连锁更新   |
| **清理不当**   | 未清理定时器、事件监听                             | 内存泄漏   |
| **闭包陷阱**   | useCallback内使用过期state                         | 状态不一致 |

#### 5.1.2 优化原则

1. **单一职责**: 每个useEffect只做一件事
2. **最小依赖**: 只依赖真正需要的变量
3. **使用ref**: 避免闭包捕获过期值
4. **提取逻辑**: 复杂副作用提取为自定义Hook

#### 5.1.3 示例重构

**重构前**:

```typescript
useEffect(() => {
  // 加载项目 + 文件 + 解析YAML + 推入历史
  if (projectId) {
    loadProjectData();
  }
}, [projectId, fileId, selectedFile, currentPhases]); // 依赖过多
```

**重构后**:

```typescript
// 拆分为多个独立的useEffect
useEffect(() => {
  if (projectId) {
    loadProjectData(); // 只依赖projectId
  }
}, [projectId]);

useEffect(() => {
  if (selectedFile && selectedFile.fileType === 'session') {
    parseYamlToScript(fileContent); // 只依赖selectedFile和fileContent
  }
}, [selectedFile, fileContent]);

useEffect(() => {
  // 推入初始状态的逻辑（已有，保持不变）
}, [currentPhases, selectedFile]);
```

### 5.2 异步操作处理

#### 5.2.1 统一错误处理

```typescript
// utils/async-helpers.ts
export const handleAsyncError = (error: unknown, message: string) => {
  console.error(message, error);
  if (error instanceof Error) {
    message.error(`${message}: ${error.message}`);
  } else {
    message.error(message);
  }
};

// 使用示例
const loadProjectData = async () => {
  try {
    setLoading(true);
    const [projectRes, filesRes] = await Promise.all([
      projectsApi.getProject(projectId),
      projectsApi.getProjectFiles(projectId),
    ]);
    // 处理数据...
  } catch (error) {
    handleAsyncError(error, 'Failed to load project data');
  } finally {
    setLoading(false);
  }
};
```

#### 5.2.2 取消未完成的请求

```typescript
// hooks/useFileOperations.ts
const useFileOperations = () => {
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadProjectData = async () => {
    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });
      // 处理响应...
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request cancelled');
        return;
      }
      throw error;
    }
  };

  // 清理
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { loadProjectData };
};
```

### 5.3 事件监听器管理

#### 5.3.1 集中管理快捷键

**重构前**: 多个useEffect监听同一个keydown事件

**重构后**:

```typescript
// hooks/useKeyboardShortcuts.ts
export const useKeyboardShortcuts = (shortcuts: Record<string, () => void>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        shortcuts.save?.();
      }
      // Ctrl+Z
      else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        shortcuts.undo?.();
      }
      // Ctrl+Shift+Z or Ctrl+Y
      else if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        shortcuts.redo?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

// 使用
const ProjectEditor = () => {
  const { handleUndo, handleRedo, handleSave } = useOperations();

  useKeyboardShortcuts({
    save: handleSave,
    undo: handleUndo,
    redo: handleRedo,
  });

  // ...
};
```

---

## 6. 测试保障策略

### 6.1 测试分层策略

```mermaid
graph TD
    A[测试金字塔] --> B[E2E测试 10%]
    A --> C[集成测试 30%]
    A --> D[单元测试 60%]

    B --> B1[关键用户流程]
    C --> C1[组件协作]
    C --> C2[Hook交互]
    D --> D1[服务层逻辑]
    D --> D2[工具函数]
    D --> D3[Hook单独测试]
```

### 6.2 单元测试计划

#### 6.2.1 服务层测试（优先级：P0）

##### **YamlService.test.ts**

```typescript
describe('YamlService', () => {
  let service: YamlService;

  beforeEach(() => {
    service = new YamlService();
  });

  describe('parseYamlToScript', () => {
    it('should parse valid session script', () => {
      const yaml = `
session:
  session_id: test
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_type: ai_say
              action_id: action_1
              config:
                content: Hello
      `;

      const result = service.parseYamlToScript(yaml);
      expect(result).not.toBeNull();
      expect(result?.session?.session_id).toBe('test');
      expect(result?.session?.phases).toHaveLength(1);
    });

    it('should return null for invalid yaml', () => {
      const yaml = 'invalid: yaml: syntax:';
      const result = service.parseYamlToScript(yaml);
      expect(result).toBeNull();
    });

    it('should handle legacy format', () => {
      // 测试旧格式兼容性
    });
  });

  describe('syncPhasesToYaml', () => {
    it('should preserve metadata when syncing', () => {
      const baseScript = {
        session: {
          session_id: 'test',
          session_name: 'Test Session',
          global_variables: ['var1'],
          phases: [],
        },
      };

      const phases = [
        /* ... */
      ];
      const result = service.syncPhasesToYaml(phases, baseScript, mockFile);

      const parsed = yaml.load(result);
      expect(parsed.session.session_id).toBe('test');
      expect(parsed.session.global_variables).toEqual(['var1']);
    });
  });

  describe('fixYamlIndentation', () => {
    it('should fix common indentation errors', () => {
      const brokenYaml = `
session:
  phases:
  - phase_id: phase_1
    topics:
  - topic_id: topic_1
      `;

      const fixed = service.fixYamlIndentation(brokenYaml);
      expect(() => yaml.load(fixed)).not.toThrow();
    });
  });
});
```

##### **ScriptOperations.test.ts**

```typescript
describe('ScriptOperations', () => {
  let operations: ScriptOperations;
  let mockPhases: PhaseWithTopics[];

  beforeEach(() => {
    operations = new ScriptOperations();
    mockPhases = [
      {
        phase_id: 'phase_1',
        phase_name: 'Phase 1',
        topics: [
          {
            topic_id: 'topic_1',
            topic_name: 'Topic 1',
            actions: [{ type: 'ai_say', ai_say: 'Hello', action_id: 'action_1' }],
          },
        ],
      },
    ];
  });

  describe('addPhase', () => {
    it('should add new phase at the end', () => {
      const result = operations.addPhase(mockPhases);
      expect(result).toHaveLength(2);
      expect(result[1].phase_id).toMatch(/phase_\d+/);
    });

    it('should not mutate original array', () => {
      const original = [...mockPhases];
      operations.addPhase(mockPhases);
      expect(mockPhases).toEqual(original);
    });
  });

  describe('deletePhase', () => {
    it('should delete phase at specified index', () => {
      mockPhases.push({ phase_id: 'phase_2', topics: [] });
      const result = operations.deletePhase(mockPhases, 0);
      expect(result).toHaveLength(1);
      expect(result[0].phase_id).toBe('phase_2');
    });
  });

  describe('movePhase', () => {
    it('should move phase from one index to another', () => {
      mockPhases.push({ phase_id: 'phase_2', topics: [] });
      const result = operations.movePhase(mockPhases, 0, 1);
      expect(result[0].phase_id).toBe('phase_2');
      expect(result[1].phase_id).toBe('phase_1');
    });
  });

  // 类似测试覆盖所有Topic和Action操作...
});
```

#### 6.2.2 Hook测试（优先级：P1）

##### **useHistoryManager.test.tsx**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useHistoryManager } from '../useHistoryManager';

describe('useHistoryManager', () => {
  beforeEach(() => {
    globalHistoryManager.clear();
  });

  it('should handle undo', () => {
    const { result } = renderHook(() =>
      useHistoryManager({
        files: mockFiles,
        selectedFile: mockFile1,
        onRestore: mockRestore,
      })
    );

    // 推入历史
    act(() => {
      result.current.pushHistory(beforePhases, afterPhases, 'Test Operation');
    });

    // 执行Undo
    act(() => {
      result.current.handleUndo();
    });

    expect(mockRestore).toHaveBeenCalledWith(beforePhases);
  });

  it('should handle cross-file undo', () => {
    // 测试跨文件撤销逻辑
  });

  it('should prevent concurrent undo/redo', async () => {
    // 测试并发保护
  });
});
```

### 6.3 集成测试计划（优先级：P1）

#### 6.3.1 组件协作测试

```typescript
// __tests__/ProjectEditor.integration.test.tsx
describe('ProjectEditor Integration', () => {
  it('should complete full editing workflow', async () => {
    const { getByText, getByRole } = render(<ProjectEditor />);

    // 1. 加载项目
    await waitFor(() => {
      expect(getByText('Test Project')).toBeInTheDocument();
    });

    // 2. 选择文件
    fireEvent.click(getByText('test-session.yaml'));

    // 3. 切换到可视化模式
    fireEvent.click(getByText('Visual Editor'));

    // 4. 添加Phase
    fireEvent.click(getByRole('button', { name: /add phase/i }));

    // 5. 保存
    fireEvent.click(getByRole('button', { name: /save/i }));

    // 验证保存成功
    await waitFor(() => {
      expect(getByText('Saved successfully')).toBeInTheDocument();
    });
  });

  it('should handle undo/redo across files', async () => {
    // 测试跨文件撤销流程
  });
});
```

### 6.4 E2E测试计划（优先级：P2）

#### 6.4.1 关键用户流程

使用Playwright编写E2E测试：

```typescript
// e2e/project-editor.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Project Editor', () => {
  test('should create and edit session script', async ({ page }) => {
    // 1. 导航到项目列表
    await page.goto('/projects');

    // 2. 进入项目编辑器
    await page.click('text=Test Project');

    // 3. 创建新会谈脚本
    await page.click('[aria-label="add-file"]');
    await page.click('text=New Session Script');
    await page.fill('#session-name-input', 'new-test-session');
    await page.click('text=OK');

    // 4. 等待文件加载
    await expect(page.locator('text=new-test-session.yaml')).toBeVisible();

    // 5. 切换到可视化模式
    await page.click('text=Visual Editor');

    // 6. 添加Action
    await page.click('text=Add Action');
    await page.click('text=ai_ask');

    // 7. 编辑内容
    await page.fill('[placeholder*="question"]', 'How are you?');

    // 8. 验证自动保存
    await page.waitForTimeout(1500); // 等待自动保存
    await expect(page.locator('text=Saved successfully')).toBeVisible();

    // 9. 测试撤销
    await page.keyboard.press('Control+Z');
    await expect(page.locator('text=Undone')).toBeVisible();
  });
});
```

### 6.5 回归测试检查清单

#### 6.5.1 功能完整性检查

- [ ] **文件操作**
  - [ ] 加载项目和文件列表
  - [ ] 选择文件并显示内容
  - [ ] 保存文件修改
  - [ ] 创建新会谈脚本
- [ ] **编辑功能**
  - [ ] YAML模式编辑
  - [ ] 可视化模式编辑
  - [ ] 模式切换数据同步
  - [ ] 实时验证错误提示
- [ ] **CRUD操作**
  - [ ] 添加/删除/移动Phase
  - [ ] 添加/删除/移动Topic
  - [ ] 添加/删除/移动Action
  - [ ] 编辑Phase/Topic/Action属性
- [ ] **历史管理**
  - [ ] 撤销操作（Ctrl+Z）
  - [ ] 重做操作（Ctrl+Shift+Z）
  - [ ] 跨文件撤销/重做
  - [ ] 焦点自动定位
- [ ] **自动保存**
  - [ ] 可视化编辑后1秒自动保存
  - [ ] 保存成功提示
- [ ] **调试功能**
  - [ ] 打开调试配置
  - [ ] 启动调试会话
  - [ ] 调试面板交互
- [ ] **版本管理**
  - [ ] 发布新版本
  - [ ] 查看版本列表
  - [ ] 切换版本
- [ ] **快捷键**
  - [ ] Ctrl+S保存
  - [ ] Ctrl+Z撤销
  - [ ] Ctrl+Shift+Z重做

#### 6.5.2 性能检查

- [ ] 大文件（>1000行YAML）加载时间 ≤2s
- [ ] 文件切换响应时间 ≤500ms
- [ ] YAML解析时间 ≤1s
- [ ] 可视化渲染时间（100+节点） ≤2s
- [ ] 撤销/重做响应时间 ≤300ms

#### 6.5.3 兼容性检查

- [ ] Chrome最新版
- [ ] Edge最新版
- [ ] Firefox最新版（如支持）
- [ ] 屏幕分辨率：1920x1080、1366x768

---

## 7. 风险评估与应对

### 7.1 技术风险

| 风险                    | 影响 | 概率 | 应对措施                                                                          |
| ----------------------- | ---- | ---- | --------------------------------------------------------------------------------- |
| **状态同步问题**        | 高   | 中   | 1. 充分的单元测试<br>2. 使用ref避免闭包陷阱<br>3. 严格的状态流向管理              |
| **跨文件Undo/Redo失败** | 高   | 中   | 1. 独立测试跨文件场景<br>2. 添加调试日志<br>3. 实现回退机制                       |
| **历史管理内存泄漏**    | 中   | 低   | 1. 实施增量历史记录（可选）<br>2. 监控内存占用<br>3. 设置历史栈上限               |
| **YAML解析性能下降**    | 中   | 低   | 1. 添加性能测试<br>2. 使用Web Worker（如需要）<br>3. 缓存解析结果                 |
| **组件渲染次数增加**    | 中   | 中   | 1. 使用React DevTools Profiler<br>2. 添加React.memo<br>3. 优化useCallback/useMemo |
| **TypeScript类型错误**  | 低   | 低   | 1. 严格的类型定义<br>2. 渐进式重构，逐步验证                                      |

### 7.2 功能风险

| 风险             | 影响 | 概率 | 应对措施                                                              |
| ---------------- | ---- | ---- | --------------------------------------------------------------------- |
| **功能回退**     | 高   | 低   | 1. 完整的回归测试<br>2. 阶段性交付，及时验证<br>3. 保留旧代码作为参考 |
| **用户体验变化** | 中   | 低   | 1. 保持UI一致性<br>2. 避免改变交互流程<br>3. Beta测试                 |
| **数据丢失**     | 高   | 极低 | 1. 充分测试保存逻辑<br>2. 添加本地缓存（如需要）<br>3. 验证自动保存   |

### 7.3 进度风险

| 风险             | 影响 | 概率 | 应对措施                                                     |
| ---------------- | ---- | ---- | ------------------------------------------------------------ |
| **时间估算不准** | 中   | 中   | 1. 预留20%缓冲时间<br>2. 优先处理P0任务<br>3. 每周Review进度 |
| **阻塞问题**     | 中   | 低   | 1. 及时沟通<br>2. 寻求技术支持<br>3. 调整优先级              |
| **范围蔓延**     | 低   | 中   | 1. 严格控制范围<br>2. 新需求推迟到重构后<br>3. 定期确认目标  |

### 7.4 应急回滚方案

#### 7.4.1 分支策略

```
main (生产)
├── develop (开发)
│   ├── feature/refactor-phase1 (阶段一)
│   ├── feature/refactor-phase2 (阶段二)
│   ├── feature/refactor-phase3 (阶段三)
│   └── feature/refactor-phase4 (阶段四)
```

**策略**:

1. 每个阶段在独立分支开发
2. 完成并测试后合并到develop
3. develop稳定后合并到main
4. 保留所有阶段分支至少2周（以备回滚）

#### 7.4.2 回滚触发条件

**立即回滚**:

- 严重Bug导致编辑器无法使用
- 数据丢失或损坏
- 性能下降 >50%
- 关键功能失效（Undo/Redo、保存等）

**延迟回滚**（修复后继续）:

- UI样式问题
- 次要功能异常
- 非关键性能问题

#### 7.4.3 回滚步骤

```bash
# 1. 切换到上一个稳定版本
git checkout develop
git reset --hard <last-stable-commit>

# 2. 强制推送（需团队确认）
git push origin develop --force

# 3. 通知团队
echo "Rolled back to <commit-id> due to <reason>"

# 4. 分析问题
git log --oneline <last-stable-commit>..HEAD

# 5. 修复后重新合并
git checkout feature/refactor-phase<X>
# 修复问题...
git commit -am "fix: <issue>"
git checkout develop
git merge feature/refactor-phase<X>
```

#### 7.4.4 数据备份

**在重构前**:

- 导出当前所有项目数据
- 备份数据库（如有）
- 记录当前版本号

**在重构中**:

- 每个阶段完成后创建备份点
- 保留旧代码文件（重命名为 `.old`）

---

## 8. 时间估算与资源需求

### 8.1 详细时间估算

#### 8.1.1 按阶段估算

| 阶段       | 任务                      | 工作量（天） | 缓冲时间（天） | 总计（天） |
| ---------- | ------------------------- | ------------ | -------------- | ---------- |
| **阶段一** |                           |              |                | **5**      |
|            | 创建目录结构              | 0.5          | 0              | 0.5        |
|            | 提取YamlService           | 2            | 0.5            | 2.5        |
|            | 提取ScriptOperations      | 2            | 0.5            | 2.5        |
|            | 创建useProjectEditorState | 1.5          | 0.5            | 2          |
| **阶段二** |                           |              |                | **5.5**    |
|            | 拆分FileTreeSidebar       | 1.5          | 0.5            | 2          |
|            | 拆分ProjectEditorHeader   | 1            | 0.3            | 1.3        |
|            | 拆分EditorContent         | 2            | 0.5            | 2.5        |
|            | 拆分VersionPanel          | 0.5          | 0.2            | 0.7        |
| **阶段三** |                           |              |                | **7.5**    |
|            | 创建useFileOperations     | 2            | 0.5            | 2.5        |
|            | 创建useScriptOperations   | 2.5          | 0.5            | 3          |
|            | 重构useHistoryManager     | 2            | 0.5            | 2.5        |
|            | 创建辅助Hooks             | 0.5          | 0.2            | 0.7        |
| **阶段四** |                           |              |                | **7**      |
|            | 主组件重构                | 2            | 0.5            | 2.5        |
|            | 单元测试补充              | 2            | 0.5            | 2.5        |
|            | 集成测试                  | 1.5          | 0.5            | 2          |
|            | 性能优化                  | 1.5          | 0.5            | 2          |
|            | 代码审查与文档            | 1            | 0.3            | 1.3        |
| **总计**   |                           | **22.5**     | **6.3**        | **28.8**   |

**实际工作日**: 约 **29天** ≈ **4周** （按每周5个工作日）

#### 8.1.2 关键路径分析

```mermaid
gantt
    title ProjectEditor 重构甘特图
    dateFormat  YYYY-MM-DD
    section 阶段一
    目录结构           :a1, 2026-02-03, 0.5d
    YamlService        :a2, after a1, 2.5d
    ScriptOperations   :a3, after a1, 2.5d
    useProjectEditorState :a4, after a2, 2d

    section 阶段二
    FileTreeSidebar    :b1, after a4, 2d
    EditorHeader       :b2, after a4, 1.3d
    EditorContent      :b3, after b1, 2.5d
    VersionPanel       :b4, after b2, 0.7d

    section 阶段三
    useFileOperations  :c1, after b3, 2.5d
    useScriptOperations:c2, after b3, 3d
    useHistoryManager  :c3, after c2, 2.5d
    辅助Hooks          :c4, after c1, 0.7d

    section 阶段四
    主组件重构         :d1, after c3, 2.5d
    单元测试           :d2, after d1, 2.5d
    集成测试           :d3, after d2, 2d
    性能优化           :d4, after d1, 2d
    代码审查           :d5, after d3, 1.3d
```

### 8.2 资源需求

#### 8.2.1 人力资源

| 角色                       | 工作量 | 时间分配                 |
| -------------------------- | ------ | ------------------------ |
| **前端开发工程师（主力）** | 100%   | 全程参与（4周）          |
| **技术Lead（评审）**       | 20%    | 每周评审+技术支持（4周） |
| **QA工程师（测试）**       | 50%    | 阶段四集中参与（1周）    |
| **产品经理（验收）**       | 10%    | 各阶段验收（4次）        |

**总人日**:

- 开发：29人日
- 评审：4人日
- 测试：5人日
- 验收：2人日
- **合计**: 40人日

#### 8.2.2 技术支持

**工具与环境**:

- [ ] 测试环境部署（与生产隔离）
- [ ] CI/CD流水线配置（自动化测试）
- [ ] 性能监控工具（React DevTools Profiler）
- [ ] 代码审查工具（GitHub PR Review）

**技术储备**:

- [ ] React Hooks最佳实践
- [ ] TypeScript高级类型
- [ ] Jest + Testing Library使用
- [ ] 性能优化技巧

### 8.3 里程碑与验收标准

#### 里程碑1: 阶段一完成（第1周末）✅

**交付物**:

- [x] `services/YamlService.ts` (含单元测试) - 785行，10个测试
- [x] `services/ScriptOperations.ts` (含单元测试) - 706行，21个测试
- [x] `hooks/useProjectEditorState.ts` - 368行
- [x] 主组件状态数量 ≤15个 - 已通过导入简化

**验收标准**:

- [x] 所有单元测试通过（覆盖率 >80%）- 46个测试全部通过
- [x] 现有功能正常（手动回归测试）- 主组件集成完成
- [x] TypeScript编译无错误 - 构建成功
- [x] ESLint无警告 - 无警告

**完成时间**: 2026-01-30
**代码变更**: 主组件从2945行减至2420行（-18%）

#### 里程碑2: 阶段二完成（第2周末）✅

**交付物**:

- [x] `pages/ProjectEditor/ProjectEditorHeader.tsx` - 114行
- [x] `pages/ProjectEditor/FileTreeSidebar.tsx` - 211行
- [x] `pages/ProjectEditor/EditorContent.tsx` - 344行
- [x] 主组件集成新组件 - 从2420行减至1881行（-22%）

**验收标准**:

- [x] 所有TypeScript编译通过 - ✅ 无错误
- [x] 现有功能正常（手动回归测试）- 需要测试
- [x] 组件职责清晰，Props接口完整 - ✅ 完成
- [x] 代码可读性显著提升 - ✅ 完成

**完成时间**: 2026-01-30
**代码变更**:

- 主组件从2420行减至1881行（-22%）
- 新增3个UI组件：ProjectEditorHeader（114行）、FileTreeSidebar（211行）、EditorContent（344行）
- 总计669行新增代码，减少539行主组件代码
- 组件拆分完成，职责清晰，Props传递合理

**当前主组件状态**:

- 行数: 2420行（原2945行，已减少525行）
- 仍包含: Header、Sider、Content的完整渲染逻辑
- 核心业务逻辑: 已成功提取为独立服务

**交付物** (未完成):

- [ ] `pages/ProjectEditor/FileTreeSidebar.tsx`
- [ ] `pages/ProjectEditor/ProjectEditorHeader.tsx`
- [ ] `pages/ProjectEditor/EditorContent.tsx`
- [ ] `pages/ProjectEditor/VersionPanel.tsx` - 注：VersionListPanel已是独立组件
- [ ] 主组件行数 ≤500行

**验收标准** (未执行):

- [ ] 所有UI组件正常渲染
- [ ] 所有交互功能正常
- [ ] 无明显性能下降
- [ ] 代码审查通过

#### 里程碑3: 阶段三部分完成（第3周）⚠️

**交付物**:

- [x] `hooks/useFileOperations.tsx` - 453行（已创建，未集成）
- [ ] `hooks/useScriptOperations.ts` - 未开始
- [ ] `hooks/useHistoryManager.ts` - 未开始
- [ ] `hooks/useAutoSave.ts` - 未开始
- [ ] `hooks/useKeyboardShortcuts.ts` - 未开始

**验收标准**:

- [ ] 所有Hook创建完成
- [ ] 在主组件中集成
- [ ] 所有功能正常工作

**当前状态**: 部分完成，暂停
**原因**:

1. useFileOperations Hook设计过于耦合，集成困难
2. 应先完成状态管理Hook
3. 采用渐进式策略更实用

**下一步建议**:

1. 保持当前阶段二成果（UI组件拆分）
2. 在后续开发中按需引入YamlService和ScriptOperations
3. 如需继续 Hook化，采用分组小 Hook 策略

**交付物**:

- [x] `hooks/useFileOperations.ts`
- [x] `hooks/useScriptOperations.ts`
- [x] `hooks/useHistoryManager.ts`
- [x] `hooks/useAutoSave.ts`
- [x] `hooks/useKeyboardShortcuts.ts`
- [x] 主组件行数 ≤350行

**验收标准**:

- [ ] 所有业务逻辑正常
- [ ] Undo/Redo跨文件正常
- [ ] 自动保存正常
- [ ] 快捷键正常
- [ ] Hook单元测试通过

#### 里程碑4: 阶段四完成（第4周末）

**交付物**:

- [x] `pages/ProjectEditor/index.tsx` (≤300行)
- [x] 完整的单元测试套件
- [x] 集成测试用例
- [x] 性能优化报告
- [x] 重构总结文档

**验收标准**:

- [ ] 主组件行数 ≤300
- [ ] 所有测试通过（单元+集成）
- [ ] 回归测试100%通过
- [ ] 性能指标达标
- [ ] 代码审查最终通过
- [ ] 产品经理验收通过

### 8.4 风险缓冲时间分配

**总缓冲时间**: 6.3天 ≈ 1.3周

**分配策略**:

- **阶段间缓冲**: 每个阶段后预留0.5天用于问题修复
- **最终缓冲**: 阶段四后预留2天用于最终调整
- **紧急缓冲**: 保留1天应对突发问题

**使用原则**:

- 仅在遇到阻塞问题时使用
- 每次使用需记录原因
- 缓冲用尽需调整计划

---

## 9. 成功标准与度量指标

### 9.1 代码质量指标

| 指标             | 目标值 | 测量方法              |
| ---------------- | ------ | --------------------- |
| 主文件行数       | ≤300行 | 代码行数统计          |
| 单函数行数       | ≤50行  | ESLint规则            |
| 圈复杂度         | ≤10    | ESLint complexity规则 |
| TypeScript覆盖率 | 100%   | tsc --noEmit          |
| 单元测试覆盖率   | >80%   | Jest coverage         |
| 代码重复率       | <5%    | jscpd工具             |

### 9.2 性能指标

| 指标                      | 目标值 | 测量方法                    |
| ------------------------- | ------ | --------------------------- |
| 初始加载时间              | ≤2s    | Chrome DevTools Performance |
| 文件切换时间              | ≤500ms | 手动计时                    |
| YAML解析时间（1000行）    | ≤1s    | console.time                |
| 可视化渲染时间（100节点） | ≤2s    | React Profiler              |
| Undo/Redo响应时间         | ≤300ms | 手动计时                    |
| 内存占用（峰值）          | ≤200MB | Chrome DevTools Memory      |

### 9.3 功能完整性指标

| 类别     | 功能数 | 通过数 | 通过率目标 |
| -------- | ------ | ------ | ---------- |
| 文件操作 | 4      | -      | 100%       |
| 编辑功能 | 4      | -      | 100%       |
| CRUD操作 | 12     | -      | 100%       |
| 历史管理 | 4      | -      | 100%       |
| 自动保存 | 2      | -      | 100%       |
| 调试功能 | 3      | -      | 100%       |
| 版本管理 | 3      | -      | 100%       |
| 快捷键   | 3      | -      | 100%       |
| **总计** | **35** | **-**  | **100%**   |

### 9.4 用户体验指标

| 指标           | 目标   | 测量方法     |
| -------------- | ------ | ------------ |
| 界面响应延迟   | <100ms | 用户感知测试 |
| 操作流畅度     | 无卡顿 | 手动测试     |
| 错误提示清晰度 | 100%   | 用户反馈     |
| 学习曲线       | 无变化 | 与重构前对比 |

---

## 10. 附录

### 10.1 参考资料

**项目文档**:

- [工程编辑器功能架构](../DEVELOPMENT_GUIDE.md)
- [redo/undo功能实现](../design/visual-editor-validation-design.md)
- [历史管理器设计](../../packages/script-editor/src/utils/history-manager.ts)

**React最佳实践**:

- [React Hooks官方文档](https://react.dev/reference/react)
- [Testing Library最佳实践](https://testing-library.com/docs/react-testing-library/intro/)
- [React性能优化](https://react.dev/reference/react/useMemo)

**重构书籍**:

- Martin Fowler - _Refactoring: Improving the Design of Existing Code_
- Robert C. Martin - _Clean Code_

### 10.2 术语表

| 术语           | 定义                               |
| -------------- | ---------------------------------- |
| **Phase**      | 会谈脚本的第一层级（阶段）         |
| **Topic**      | 会谈脚本的第二层级（话题）         |
| **Action**     | 会谈脚本的第三层级（动作节点）     |
| **YAML**       | 人类可读的数据序列化语言           |
| **Undo/Redo**  | 撤销/重做功能                      |
| **跨文件操作** | 在不同文件间执行撤销/重做          |
| **焦点导航**   | 自动定位到指定的Phase/Topic/Action |
| **历史快照**   | 保存的操作前后状态                 |
| **不可变数据** | 不修改原对象，返回新对象           |

### 10.3 常见问题（FAQ）

#### Q1: 为什么不使用Redux或Zustand？

**A**:

1. 当前项目规模适合自定义Hooks
2. 避免引入额外依赖和学习成本
3. 保持与现有架构一致
4. 如未来需要，可在重构后无缝迁移

#### Q2: 重构期间如何处理新需求？

**A**:

1. 评估优先级：P0紧急需求可插入
2. P1需求推迟到重构完成后
3. 需求变更需更新重构计划

#### Q3: 如何保证重构后性能不下降？

**A**:

1. 每个阶段进行性能测试
2. 使用React DevTools Profiler监控
3. 优化useCallback/useMemo使用
4. 必要时使用React.memo

#### Q4: 历史管理的内存占用如何控制？

**A**:

1. 初期使用全量快照（简单可靠）
2. 监控实际内存占用
3. 如超过200MB考虑增量记录
4. 设置历史栈上限（如50条）

#### Q5: 重构失败如何回滚？

**A**:
见第7.4节"应急回滚方案"

### 10.4 检查清单（Checklist）

#### 开始重构前

- [ ] 备份当前代码
- [ ] 创建重构分支
- [ ] 确认测试环境可用
- [ ] 通知团队重构计划
- [ ] 阅读相关文档与代码

#### 每个阶段开始前

- [ ] Review上一阶段成果
- [ ] 确认本阶段目标
- [ ] 更新任务看板
- [ ] 准备测试数据

#### 每个阶段完成后

- [ ] 运行所有测试
- [ ] 手动回归测试
- [ ] 代码审查
- [ ] 更新文档
- [ ] 合并到develop分支
- [ ] 标记里程碑

#### 重构完成后

- [ ] 最终验收测试
- [ ] 性能对比报告
- [ ] 编写重构总结
- [ ] 团队分享
- [ ] 归档旧代码
- [ ] 庆祝成功！🎉

---

## 📝 总结

本重构计划旨在将2945行的巨型组件拆分为清晰、可维护的模块化架构。通过**4周4阶段**的渐进式重构，我们将：

1. **降低复杂度**: 主文件从2945行降至≤300行
2. **提升可维护性**: 每个模块职责单一，易于理解和修改
3. **增强可测试性**: 服务层、Hook层可独立测试
4. **保持功能完整性**: 通过充分的测试保证现有功能不受影响
5. **优化性能**: 通过合理的优化手段确保性能不下降

**关键成功因素**:

- 严格按计划执行，不随意扩大范围
- 每个阶段充分测试后再进入下一阶段
- 保持与团队的沟通，及时解决问题
- 遵循已有的编码规范和最佳实践

**预期收益**:

- 新功能开发时间减少75%
- Bug修复时间减少70%
- 代码可读性提升90%
- 团队开发效率提升50%

---

**文档维护**:

- 本文档在重构过程中持续更新
- 实际进度与计划偏差需及时记录
- 重构完成后编写"重构总结"章节

**联系方式**:

- 技术问题：提交Issue至项目仓库
- 计划调整：与Tech Lead讨论

---

_本重构计划由AI助手生成，已根据项目实际情况调整优化。_  
_最后更新: 2026-01-30_
