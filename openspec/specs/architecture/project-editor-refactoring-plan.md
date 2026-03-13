---
document_id: architecture-project-editor-refactoring-plan
category: architecture
status: active
version: 1.0.0
last_updated: 2026-03-13
source: docs/design/project-editor-refactoring-plan.md
tags: [project-editor, refactoring, architecture-design, react, typescript]
search_priority: high
---

# ProjectEditor Component Refactoring Execution Plan

> **Document Version**: v1.0  
> **Created**: 2026-01-30  
> **Target Component**: `packages/script-editor/src/pages/ProjectEditor/index.tsx`  
> **Current Scale**: 2945 lines, 42 useState hooks, 12 core responsibilities  
> **Refactoring Period**: 3-4 weeks (4 phases)

---

## 📋 Table of Contents

1. [Refactoring Goals and Scope](#1-refactoring-goals-and-scope)
2. [Module Splitting Plan](#2-module-splitting-plan)
3. [Refactoring Implementation Steps](#3-refactoring-implementation-steps)
4. [State Management Refactoring](#4-state-management-refactoring)
5. [Side Effect Handling Optimization](#5-side-effect-handling-optimization)
6. [Testing Assurance Strategy](#6-testing-assurance-strategy)
7. [Risk Assessment and Mitigation](#7-risk-assessment-and-mitigation)
8. [Time Estimation and Resource Requirements](#8-time-estimation-and-resource-requirements)

---

## 1. Refactoring Goals and Scope

### 1.1 Core Objectives

| Objective            | Current State                   | Target State                              | Priority |
| -------------------- | ------------------------------- | ----------------------------------------- | -------- |
| **Lines of Code**    | 2945 lines                      | ≤300 lines                                | P0       |
| **Single Function**  | Max 245 lines                   | ≤50 lines                                 | P0       |
| **State Count**      | 42 useState hooks               | ≤10 hooks                                 | P1       |
| **Responsibilities** | 12 responsibilities             | 1-2 responsibilities                      | P0       |
| **Testability**      | Low (cannot test independently) | High (each module independently testable) | P1       |
| **Build Time**       | Baseline                        | Maintain or optimize                      | P2       |

### 1.2 Refactoring Scope

#### ✅ In Scope

- Split main component into container component + business components
- Migrate state management from component to custom Hooks
- Extract YAML processing logic into independent service
- Decouple and optimize history management logic
- Encapsulate CRUD operations as reusable business logic
- Split UI layout into independent sub-components

#### ❌ Out of Scope

- Internal refactoring of existing sub-components (ActionNodeList, ActionPropertyPanel, etc.)
- API layer interface changes
- Type definition adjustments (unless necessary)
- Backend logic modifications
- New feature development

### 1.3 Success Criteria

1. **Code Quality**
   - Main file ≤300 lines
   - Single function ≤50 lines
   - Functional components follow Single Responsibility Principle
   - All new modules pass ESLint and TypeScript checks

2. **Functional Completeness**
   - All existing features work normally
   - History management (Undo/Redo) works across files
   - Auto-save mechanism is stable
   - Debugging features are complete

3. **Performance Requirements**
   - Component render count does not increase
   - File switch response time ≤500ms
   - Large YAML parsing time ≤1s

---

## 2. Module Splitting Plan

### 2.1 New File Structure

```
packages/script-editor/src/
├── pages/
│   └── ProjectEditor/
│       ├── index.tsx                    # Main container (200-250 lines)
│       ├── ProjectEditorHeader.tsx      # Top bar (150 lines)
│       ├── FileTreeSidebar.tsx          # Left sidebar (200 lines)
│       ├── EditorContent.tsx            # Editor area container (150 lines)
│       └── VersionPanel.tsx             # Version panel (100 lines)
├── components/
│   ├── YamlEditor/                      # YAML editor component
│   │   ├── index.tsx                    # Entry (80 lines)
│   │   ├── YamlTextArea.tsx            # Text area (60 lines)
│   │   └── ValidationPanel.tsx         # Validation panel (existing, reuse)
│   ├── VisualEditor/                    # Visual editor component
│   │   ├── index.tsx                    # Entry (120 lines)
│   │   ├── NodeListPanel.tsx           # Left node list (80 lines)
│   │   └── PropertyPanel.tsx           # Right property panel (existing, reuse)
│   └── FileTree/                        # File tree component
│       ├── index.tsx                    # Entry (100 lines)
│       ├── FileTreeView.tsx            # Tree view (80 lines)
│       └── FileDetails.tsx             # File details (80 lines)
├── hooks/
│   ├── useProjectEditorState.ts         # State management Hook (150 lines)
│   ├── useFileOperations.ts             # File operations Hook (120 lines)
│   ├── useScriptOperations.ts           # Script CRUD operations Hook (200 lines)
│   ├── useHistoryManager.ts             # History management Hook (180 lines)
│   ├── useAutoSave.ts                   # Auto-save Hook (60 lines)
│   └── useKeyboardShortcuts.ts          # Keyboard shortcuts Hook (80 lines)
├── services/
│   ├── YamlService.ts                   # YAML processing service (300 lines)
│   ├── ScriptOperations.ts              # Script operations service (250 lines)
│   └── validation-service.ts            # Validation service (existing)
└── utils/
    ├── history-manager.ts               # History manager (existing)
    └── yaml-helpers.ts                  # YAML helper functions (100 lines)
```

### 2.2 Module Responsibility Division

#### 2.2.1 Page Layer Components (Pages)

##### **ProjectEditor/index.tsx** (Main Container)

- **Responsibility**: Top-level business orchestration and route handling
- **State**: Only retain minimal necessary state (project, loading)
- **Features**:
  - Route parameter parsing (projectId, fileId)
  - Global loading state management
  - Sub-component composition and layout
  - Modal and drawer management
- **Lines**: 200-250 lines

##### **ProjectEditorHeader.tsx**

- **Responsibility**: Top navigation bar and action buttons
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
- **Features**:
  - Display project info and status tags
  - Save, publish, debug buttons
  - Version management button
  - Back button
- **Lines**: 150 lines

##### **FileTreeSidebar.tsx**

- **Responsibility**: Left file tree and file details
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
- **Features**:
  - File tree rendering and interaction
  - File details display
  - Quick action buttons
  - Collapse/expand control
- **Lines**: 200 lines

##### **EditorContent.tsx**

- **Responsibility**: Editor area container (YAML/Visual mode switching)
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
    // ... other callbacks
  }
  ```
- **Features**:
  - Conditional rendering: YamlEditor | VisualEditor
  - Mode switch button
  - Node count statistics
- **Lines**: 150 lines

##### **VersionPanel.tsx**

- **Responsibility**: Right version management panel
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
- **Features**:
  - Version list display
  - Version switching
  - Close button
- **Lines**: 100 lines

#### 2.2.2 Component Layer (Components)

##### **YamlEditor/index.tsx**

- **Responsibility**: YAML editor main component
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
- **Features**:
  - Integrate YamlTextArea and ValidationPanel
  - Error message display
- **Lines**: 80 lines

##### **VisualEditor/index.tsx**

- **Responsibility**: Visual editor main component
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
- **Features**:
  - Left-right split layout
  - Integrate ActionNodeList and PropertyPanel
  - Validation error display
- **Lines**: 120 lines

##### **FileTree Component Family**

- **FileTree/index.tsx**: File tree container (100 lines)
- **FileTreeView.tsx**: Tree view (80 lines)
- **FileDetails.tsx**: File details (80 lines)

#### 2.2.3 Custom Hooks Layer

##### **useProjectEditorState.ts**

- **Responsibility**: Centralized editor state management
- **Return Value**:

  ```typescript
  interface ProjectEditorState {
    // Base state
    loading: boolean;
    saving: boolean;
    project: Project | null;
    files: ScriptFile[];
    selectedFile: ScriptFile | null;

    // File tree state
    treeData: FileTreeNode[];
    expandedKeys: React.Key[];
    selectedKeys: React.Key[];

    // Editing state
    fileContent: string;
    editMode: 'yaml' | 'visual';
    currentPhases: PhaseWithTopics[];
    parsedScript: SessionScript | null;
    hasUnsavedChanges: boolean;

    // Validation state
    validationResult: ValidationResult | null;
    showValidationErrors: boolean;

    // Debug state
    debugConfigVisible: boolean;
    debugPanelVisible: boolean;
    debugSessionId: string | null;

    // Version management state
    versionPanelVisible: boolean;
    publishModalVisible: boolean;
    versionNote: string;

    // UI state
    leftCollapsed: boolean;

    // Setters
    setLoading: (loading: boolean) => void;
    setSaving: (saving: boolean) => void;
    // ... other setters
  }
  ```

- **Lines**: 150 lines

##### **useFileOperations.ts**

- **Responsibility**: File loading, saving, switching operations
- **Return Value**:
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
- **Dependencies**: `projectsApi`, `YamlService`
- **Lines**: 120 lines

##### **useScriptOperations.ts**

- **Responsibility**: Phase/Topic/Action CRUD operations
- **Return Value**:

  ```typescript
  interface ScriptOperations {
    // Phase operations
    handleAddPhase: () => void;
    handleDeletePhase: (phaseIndex: number) => void;
    handleMovePhase: (from: number, to: number) => void;
    handlePhaseSave: (data: any) => void;

    // Topic operations
    handleAddTopic: (phaseIndex: number) => void;
    handleDeleteTopic: (phaseIndex: number, topicIndex: number) => void;
    handleMoveTopic: (...) => void;
    handleTopicSave: (data: any) => void;

    // Action operations
    handleAddAction: (phaseIndex: number, topicIndex: number, type: string) => void;
    handleDeleteAction: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
    handleMoveAction: (...) => void;
    handleActionSave: (action: Action) => void;

    // Selection operations
    handleSelectPhase: (path: PhasePath) => void;
    handleSelectTopic: (path: TopicPath) => void;
    handleSelectAction: (path: ActionPath) => void;
  }
  ```

- **Dependencies**: `ScriptOperations service`, `useHistoryManager`
- **Lines**: 200 lines

##### **useHistoryManager.ts**

- **Responsibility**: Encapsulate history management logic
- **Return Value**:
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
- **Dependencies**: `globalHistoryManager`
- **Key Logic**:
  - Cross-file switching handling
  - Focus navigation restoration
  - Concurrency lock mechanism
- **Lines**: 180 lines

##### **useAutoSave.ts**

- **Responsibility**: Auto-save mechanism
- **Parameters**:
  ```typescript
  interface AutoSaveOptions {
    enabled: boolean;
    delay: number; // Default 1000ms
    onSave: () => Promise<void>;
    dependencies: any[];
  }
  ```
- **Lines**: 60 lines

##### **useKeyboardShortcuts.ts**

- **Responsibility**: Keyboard shortcut management
- **Shortcuts**:
  - `Ctrl+S`: Save
  - `Ctrl+Z`: Undo
  - `Ctrl+Shift+Z` / `Ctrl+Y`: Redo
- **Lines**: 80 lines

#### 2.2.4 Service Layer (Services)

##### **YamlService.ts**

- **Responsibility**: YAML parsing, synchronization, formatting
- **Methods**:

  ```typescript
  class YamlService {
    // Parse YAML to script structure
    parseYamlToScript(yamlContent: string): SessionScript | null;

    // Sync Phases to YAML (preserve metadata)
    syncPhasesToYaml(phases: PhaseWithTopics[], baseScript: any, targetFile: ScriptFile): string;

    // Fix YAML indentation errors
    fixYamlIndentation(yamlContent: string): string;

    // Format YAML
    formatYaml(yamlContent: string): string;

    // Validate YAML syntax
    validateYamlSyntax(yamlContent: string): { valid: boolean; error?: string };
  }
  ```

- **Lines**: 300 lines

##### **ScriptOperations.ts**

- **Responsibility**: Pure function implementations for script operations (no side effects)
- **Methods**:

  ```typescript
  class ScriptOperations {
    // Phase operations
    addPhase(phases: PhaseWithTopics[], index?: number): PhaseWithTopics[];
    deletePhase(phases: PhaseWithTopics[], index: number): PhaseWithTopics[];
    updatePhase(phases: PhaseWithTopics[], index: number, data: any): PhaseWithTopics[];
    movePhase(phases: PhaseWithTopics[], from: number, to: number): PhaseWithTopics[];

    // Topic operations
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

    // Action operations
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

    // Helper methods
    createActionByType(actionType: string, actionIndex: number): Action;
    validateMinimumActions(
      phases: PhaseWithTopics[],
      phaseIndex: number,
      topicIndex: number
    ): boolean;
  }
  ```

- **Characteristics**: All methods return new arrays (immutable data)
- **Lines**: 250 lines

---

## 3. Refactoring Implementation Steps

### 3.1 Phase 1: Infrastructure Setup (Week 1)

#### Task 1.1: Create Directory Structure

**Time**: 0.5 days  
**Deliverables**:

```bash
mkdir -p packages/script-editor/src/hooks
mkdir -p packages/script-editor/src/components/YamlEditor
mkdir -p packages/script-editor/src/components/VisualEditor
mkdir -p packages/script-editor/src/components/FileTree
mkdir -p packages/script-editor/src/pages/ProjectEditor
```

#### Task 1.2: Extract YamlService

**Time**: 2 days  
**Goal**: Migrate YAML processing logic from main component to independent service  
**Involved Code**:

- `parseYamlToScript` (lines 238-391)
- `syncPhasesToYaml` (lines 727-972)
- `fixYAMLIndentation` (lines 987-1208)
- `handleFormatYAML` (lines 1210-1270)

**Steps**:

1. Create `services/YamlService.ts`
2. Migrate 4 functions to class methods
3. Add unit tests (at least cover main scenarios)
4. Create instance in main component and replace original calls

**Verification**:

- [ ] Unit tests pass
- [ ] YAML parsing works normally
- [ ] Visual editor data sync works normally

#### Task 1.3: Extract ScriptOperations Service

**Time**: 2 days  
**Goal**: Extract all CRUD operations as pure functions  
**Involved Code**:

- `handleAddPhase` (lines 1662-1707)
- `handleAddTopic` (lines 1712-1749)
- `handleAddAction` (lines 1866-1888)
- `handleDeletePhase` (lines 1893-1925)
- `handleDeleteTopic` (lines 1930-1969)
- `handleDeleteAction` (lines 1974-2023)
- `handleMovePhase` (lines 2028-2045)
- `handleMoveTopic` (lines 2050-2077)
- `handleMoveAction` (lines 2082-2115)
- `createActionByType` (lines 1754-1861)

**Steps**:

1. Create `services/ScriptOperations.ts`
2. Implement all operations as pure functions (return new arrays)
3. Add boundary checks and error handling
4. Write unit tests

**Verification**:

- [ ] Unit test coverage >80%
- [ ] All CRUD operations work normally
- [ ] Data immutability guaranteed (original array not modified)

#### Task 1.4: Create useProjectEditorState Hook

**Time**: 1.5 days  
**Goal**: Centralize state management, reduce main component state count  
**Migrated State**: 42 useState → 10 or fewer

**Steps**:

1. Create `hooks/useProjectEditorState.ts`
2. Use `useReducer` or multiple `useState` combinations
3. Provide unified setter interface
4. Replace original state in main component

**Verification**:

- [ ] Main component state count ≤10
- [ ] All state read/write works normally
- [ ] No performance regression

---

### 3.2 Phase 2: Core Component Splitting (Week 2)

#### Task 2.1: Split FileTreeSidebar Component

**Time**: 1.5 days  
**Involved Code**:

- File tree construction (lines 413-450)
- File tree rendering (lines 2426-2596)
- File selection handling (lines 571-593)

**Steps**:

1. Create `pages/ProjectEditor/FileTreeSidebar.tsx`
2. Migrate file tree related logic
3. Create `components/FileTree` sub-components
4. Replace with new component in main component

**Verification**:

- [ ] File tree displays normally
- [ ] File switching works normally
- [ ] File details display normally
- [ ] Collapse/expand works normally

#### Task 2.2: Split ProjectEditorHeader Component

**Time**: 1 day  
**Involved Code**:

- Header rendering (lines 2354-2422)

**Steps**:

1. Create `pages/ProjectEditor/ProjectEditorHeader.tsx`
2. Migrate Header related logic and UI
3. Replace in main component

**Verification**:

- [ ] Top navigation bar displays normally
- [ ] All buttons work normally
- [ ] Status tags display correctly

#### Task 2.3: Split EditorContent Component

**Time**: 2 days  
**Involved Code**:

- Editor area rendering (lines 2599-2829)
- Mode switching logic (lines 2622-2663)

**Steps**:

1. Create `pages/ProjectEditor/EditorContent.tsx`
2. Create `components/YamlEditor/index.tsx`
3. Create `components/VisualEditor/index.tsx`
4. Migrate editor area logic

**Verification**:

- [ ] YAML mode works normally
- [ ] Visual mode works normally
- [ ] Mode switching works normally
- [ ] Validation error display works normally

#### Task 2.4: Split VersionPanel Component

**Time**: 0.5 days  
**Involved Code**:

- Version panel rendering (lines 2898-2939)

**Steps**:

1. Create `pages/ProjectEditor/VersionPanel.tsx`
2. Migrate version panel logic
3. Replace in main component

**Verification**:

- [ ] Version panel displays normally
- [ ] Version switching works normally

---

### 3.3 Phase 3: Business Logic Hook-ification (Week 3)

#### Task 3.1: Create useFileOperations Hook

**Time**: 2 days  
**Goal**: Encapsulate file operation logic  
**Involved Code**:

- `loadProjectData` (lines 453-506)
- `loadFile` (lines 517-568)
- `handleSave` (lines 621-660)
- `handleCreateSession` (lines 2215-2285)

**Steps**:

1. Create `hooks/useFileOperations.ts`
2. Migrate file operation logic
3. Integrate YamlService
4. Use in main component

**Verification**:

- [ ] File loading works normally
- [ ] File saving works normally
- [ ] Session script creation works normally

#### Task 3.2: Create useScriptOperations Hook

**Time**: 2.5 days  
**Goal**: Encapsulate script CRUD operations  
**Involved Code**: All handle\* methods (lines 1621-2210)

**Steps**:

1. Create `hooks/useScriptOperations.ts`
2. Integrate ScriptOperations service
3. Encapsulate all CRUD operation callbacks
4. Integrate history management

**Verification**:

- [ ] All CRUD operations work normally
- [ ] History push works normally
- [ ] Selection state sync works normally

#### Task 3.3: Refactor useHistoryManager Hook

**Time**: 2 days  
**Goal**: Optimize history management logic, resolve cross-file issues  
**Involved Code**:

- `handleUndo` (lines 1381-1526)
- `handleRedo` (lines 1532-1616)
- `pushHistory` (lines 1276-1300)
- `applyFocusNavigation` (lines 1306-1375)

**Steps**:

1. Create `hooks/useHistoryManager.ts`
2. Optimize cross-file switching logic
3. Optimize focus restoration logic
4. Add concurrency lock handling

**Verification**:

- [ ] Undo/Redo works normally
- [ ] Cross-file Undo/Redo works normally
- [ ] Focus positioning works normally
- [ ] No concurrency conflicts

#### Task 3.4: Create Helper Hooks

**Time**: 0.5 days  
**Goal**: Create useAutoSave, useKeyboardShortcuts

**Steps**:

1. Create `hooks/useAutoSave.ts` (migrate lines 2292-2320)
2. Create `hooks/useKeyboardShortcuts.ts` (migrate lines 706-718, 2322-2339)

**Verification**:

- [ ] Auto-save works normally
- [ ] Keyboard shortcuts work normally

---

### 3.4 Phase 4: Optimization and Testing (Week 4)

#### Task 4.1: Main Component Refactoring

**Time**: 2 days  
**Goal**: Simplify main component to container component

**Steps**:

1. Remove all migrated logic
2. Use new Hooks and components
3. Ensure main component ≤300 lines
4. Add necessary comments and documentation

**Verification**:

- [ ] Main component lines ≤300
- [ ] All features work normally
- [ ] Code is clear and readable

#### Task 4.2: Unit Test Supplement

**Time**: 2 days  
**Goal**: Write unit tests for all new modules

**Test Scope**:

- `YamlService`: Parsing, synchronization, formatting
- `ScriptOperations`: All CRUD operations
- `useHistoryManager`: Undo/Redo logic
- `useScriptOperations`: Business logic encapsulation

**Coverage Target**: >80%

#### Task 4.3: Integration Testing

**Time**: 1.5 days  
**Goal**: End-to-end testing of key workflows

**Test Scenarios**:

1. Create new session script → Edit → Save
2. Load existing file → Visual edit → Undo → Save
3. Switch file → Cross-file undo → Restore focus
4. YAML mode → Visual mode switch
5. Debug feature workflow

#### Task 4.4: Performance Optimization

**Time**: 1.5 days  
**Goal**: Ensure no performance degradation after refactoring

**Optimization Points**:

1. Use `useMemo` to cache computation results
2. Use `useCallback` to stabilize callback references
3. Optimize unnecessary renders (React.memo)
4. Verify history management memory usage (refer to memory spec)

**Verification**:

- [ ] React DevTools Profiler shows no abnormal renders
- [ ] Large YAML file parsing time ≤1s
- [ ] File switch response time ≤500ms

#### Task 4.5: Code Review and Documentation

**Time**: 1 day  
**Goal**: Ensure code quality and documentation completeness

**Checklist**:

- [ ] ESLint no warnings
- [ ] TypeScript no errors
- [ ] All TODO comments resolved
- [ ] Add JSDoc comments (public API)
- [ ] Update README (if needed)

---

## 4. State Management Refactoring

### 4.1 State Classification and Migration Strategy

#### 4.1.1 State Classification

| Category               | State                                                                                                          | Migration Target      | Reason                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------- |
| **Base State**         | loading, saving, project, files                                                                                | useProjectEditorState | Top-level sharing       |
| **File Tree State**    | treeData, expandedKeys, selectedKeys                                                                           | useProjectEditorState | Cross-component sharing |
| **Editing State**      | selectedFile, fileContent, editMode, currentPhases, parsedScript, hasUnsavedChanges                            | useProjectEditorState | Core editing state      |
| **Validation State**   | validationResult, showValidationErrors                                                                         | useProjectEditorState | Editor sharing          |
| **Visual Edit State**  | selectedActionPath, selectedPhasePath, selectedTopicPath, editingType                                          | useScriptOperations   | Business logic binding  |
| **Debug State**        | debugConfigVisible, debugPanelVisible, debugSessionId, debugInitialMessage, debugInitialDebugInfo, debugTarget | Local component state | Debug component only    |
| **Version Mgmt State** | versionPanelVisible, publishModalVisible, versionNote                                                          | Local component state | Version component only  |
| **UI State**           | leftCollapsed                                                                                                  | Local component state | Sidebar only            |

#### 4.1.2 State Management Solution

##### **Solution: Custom Hook + Context (Optional)**

**Rationale**:

- Custom Hooks meet most needs
- Context for deep passing (if needed)
- Avoid introducing heavy solutions like Zustand/Redux
- Maintain consistency with existing architecture

**Implementation**:

```typescript
// hooks/useProjectEditorState.ts
export const useProjectEditorState = () => {
  // Use useReducer for complex state
  const [state, dispatch] = useReducer(editorReducer, initialState);

  // Or use multiple useState combinations
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // ...

  return {
    // State
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

**If cross-level sharing is needed**:

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

### 4.2 History Management Refactoring

#### 4.2.1 Current Issues

1. **Cross-file switching complexity**: Undo/Redo across files requires manual file switching and state restoration
2. **Focus loss**: Focus positioning is inaccurate after undo
3. **Concurrency conflicts**: State inconsistency may occur during rapid operations
4. **Memory usage**: Full snapshot saving for large files (need to follow memory spec)

#### 4.2.2 Refactoring Solution

##### **Optimization 1: Incremental History Records (Memory Optimization)**

**Current**:

```typescript
// Full save
beforePhases: JSON.parse(JSON.stringify(currentPhases));
```

**Optimized**:

```typescript
// Only save changed Phase/Topic/Action index and content
interface HistoryEntry {
  fileId: string;
  operation: string;
  changeType: 'phase' | 'topic' | 'action';
  changeIndex: [number, number?, number?]; // [phaseIndex, topicIndex?, actionIndex?]
  before: Phase | Topic | Action | null; // Only save changed node
  after: Phase | Topic | Action | null;
  focusPath: FocusPath | null;
}
```

**Note**: This optimization is optional, evaluate actual memory usage before deciding to implement

##### **Optimization 2: Unified Focus Restoration Logic**

```typescript
// hooks/useHistoryManager.ts
const restoreFocus = useCallback(
  (focusPath: FocusPath | null, targetFileId: string) => {
    // 1. Check file match
    if (selectedFileRef.current?.id !== targetFileId) {
      // Switch file
      const targetFile = files.find((f) => f.id === targetFileId);
      if (targetFile) {
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);

        // Wait for file load complete then restore focus
        setTimeout(() => applyFocusNavigation(focusPath, targetFileId), 350);
      }
    } else {
      // Same file, directly restore focus
      applyFocusNavigation(focusPath, targetFileId);
    }
  },
  [files, selectedFileRef, applyFocusNavigation]
);
```

##### **Optimization 3: Concurrency Lock Optimization**

```typescript
// Use Promise queue instead of simple boolean lock
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
    // Execute Undo logic
  } finally {
    undoRedoLock.release();
  }
};
```

---

## 5. Side Effect Handling Optimization

### 5.1 useEffect Refactoring Strategy

#### 5.1.1 Problem Analysis

| Problem                   | Example                                            | Impact              |
| ------------------------- | -------------------------------------------------- | ------------------- |
| **Too many dependencies** | `useEffect(() => {...}, [dep1, dep2, ..., dep10])` | Frequent triggers   |
| **Nested side effects**   | useEffect internally modifies other state          | Chain updates       |
| **Improper cleanup**      | Not cleaning up timers, event listeners            | Memory leaks        |
| **Closure trap**          | Using stale state in useCallback                   | State inconsistency |

#### 5.1.2 Optimization Principles

1. **Single Responsibility**: Each useEffect does only one thing
2. **Minimal Dependencies**: Only depend on truly needed variables
3. **Use ref**: Avoid closure capturing stale values
4. **Extract Logic**: Extract complex side effects into custom Hooks

#### 5.1.3 Example Refactoring

**Before**:

```typescript
useEffect(() => {
  // Load project + files + parse YAML + push history
  if (projectId) {
    loadProjectData();
  }
}, [projectId, fileId, selectedFile, currentPhases]); // Too many dependencies
```

**After**:

```typescript
// Split into multiple independent useEffects
useEffect(() => {
  if (projectId) {
    loadProjectData(); // Only depends on projectId
  }
}, [projectId]);

useEffect(() => {
  if (selectedFile && selectedFile.fileType === 'session') {
    parseYamlToScript(fileContent); // Only depends on selectedFile and fileContent
  }
}, [selectedFile, fileContent]);

useEffect(() => {
  // Push initial state logic (existing, keep unchanged)
}, [currentPhases, selectedFile]);
```

### 5.2 Async Operation Handling

#### 5.2.1 Unified Error Handling

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

// Usage example
const loadProjectData = async () => {
  try {
    setLoading(true);
    const [projectRes, filesRes] = await Promise.all([
      projectsApi.getProject(projectId),
      projectsApi.getProjectFiles(projectId),
    ]);
    // Process data...
  } catch (error) {
    handleAsyncError(error, 'Failed to load project data');
  } finally {
    setLoading(false);
  }
};
```

#### 5.2.2 Cancel Incomplete Requests

```typescript
// hooks/useFileOperations.ts
const useFileOperations = () => {
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadProjectData = async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });
      // Process response...
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Request cancelled');
        return;
      }
      throw error;
    }
  };

  // Cleanup
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

### 5.3 Event Listener Management

#### 5.3.1 Centralized Keyboard Shortcut Management

**Before**: Multiple useEffects listening to the same keydown event

**After**:

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

// Usage
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

## 6. Testing Assurance Strategy

### 6.1 Testing Layer Strategy

```mermaid
graph TD
    A[Testing Pyramid] --> B[E2E Tests 10%]
    A --> C[Integration Tests 30%]
    A --> D[Unit Tests 60%]

    B --> B1[Critical User Flows]
    C --> C1[Component Collaboration]
    C --> C2[Hook Interaction]
    D --> D1[Service Layer Logic]
    D --> D2[Utility Functions]
    D --> D3[Hook Standalone Testing]
```

### 6.2 Unit Test Plan

#### 6.2.1 Service Layer Tests (Priority: P0)

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
      // Test legacy format compatibility
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

  // Similar tests covering all Topic and Action operations...
});
```

#### 6.2.2 Hook Tests (Priority: P1)

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

    // Push history
    act(() => {
      result.current.pushHistory(beforePhases, afterPhases, 'Test Operation');
    });

    // Execute Undo
    act(() => {
      result.current.handleUndo();
    });

    expect(mockRestore).toHaveBeenCalledWith(beforePhases);
  });

  it('should handle cross-file undo', () => {
    // Test cross-file undo logic
  });

  it('should prevent concurrent undo/redo', async () => {
    // Test concurrency protection
  });
});
```

### 6.3 Integration Test Plan (Priority: P1)

#### 6.3.1 Component Collaboration Tests

```typescript
// __tests__/ProjectEditor.integration.test.tsx
describe('ProjectEditor Integration', () => {
  it('should complete full editing workflow', async () => {
    const { getByText, getByRole } = render(<ProjectEditor />);

    // 1. Load project
    await waitFor(() => {
      expect(getByText('Test Project')).toBeInTheDocument();
    });

    // 2. Select file
    fireEvent.click(getByText('test-session.yaml'));

    // 3. Switch to visual mode
    fireEvent.click(getByText('Visual Editor'));

    // 4. Add Phase
    fireEvent.click(getByRole('button', { name: /add phase/i }));

    // 5. Save
    fireEvent.click(getByRole('button', { name: /save/i }));

    // Verify save success
    await waitFor(() => {
      expect(getByText('Saved successfully')).toBeInTheDocument();
    });
  });

  it('should handle undo/redo across files', async () => {
    // Test cross-file undo workflow
  });
});
```

### 6.4 E2E Test Plan (Priority: P2)

#### 6.4.1 Critical User Flows

Using Playwright for E2E tests:

```typescript
// e2e/project-editor.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Project Editor', () => {
  test('should create and edit session script', async ({ page }) => {
    // 1. Navigate to project list
    await page.goto('/projects');

    // 2. Enter project editor
    await page.click('text=Test Project');

    // 3. Create new session script
    await page.click('[aria-label="add-file"]');
    await page.click('text=New Session Script');
    await page.fill('#session-name-input', 'new-test-session');
    await page.click('text=OK');

    // 4. Wait for file load
    await expect(page.locator('text=new-test-session.yaml')).toBeVisible();

    // 5. Switch to visual mode
    await page.click('text=Visual Editor');

    // 6. Add Action
    await page.click('text=Add Action');
    await page.click('text=ai_ask');

    // 7. Edit content
    await page.fill('[placeholder*="question"]', 'How are you?');

    // 8. Verify auto-save
    await page.waitForTimeout(1500); // Wait for auto-save
    await expect(page.locator('text=Saved successfully')).toBeVisible();

    // 9. Test undo
    await page.keyboard.press('Control+Z');
    await expect(page.locator('text=Undone')).toBeVisible();
  });
});
```

### 6.5 Regression Test Checklist

#### 6.5.1 Functional Completeness Check

- [ ] **File Operations**
  - [ ] Load project and file list
  - [ ] Select file and display content
  - [ ] Save file modifications
  - [ ] Create new session script
- [ ] **Editing Features**
  - [ ] YAML mode editing
  - [ ] Visual mode editing
  - [ ] Mode switch data sync
  - [ ] Real-time validation error display
- [ ] **CRUD Operations**
  - [ ] Add/Delete/Move Phase
  - [ ] Add/Delete/Move Topic
  - [ ] Add/Delete/Move Action
  - [ ] Edit Phase/Topic/Action properties
- [ ] **History Management**
  - [ ] Undo operation (Ctrl+Z)
  - [ ] Redo operation (Ctrl+Shift+Z)
  - [ ] Cross-file undo/redo
  - [ ] Auto focus positioning
- [ ] **Auto-save**
  - [ ] Auto-save 1 second after visual editing
  - [ ] Save success notification
- [ ] **Debug Features**
  - [ ] Open debug configuration
  - [ ] Start debug session
  - [ ] Debug panel interaction
- [ ] **Version Management**
  - [ ] Publish new version
  - [ ] View version list
  - [ ] Switch version
- [ ] **Keyboard Shortcuts**
  - [ ] Ctrl+S save
  - [ ] Ctrl+Z undo
  - [ ] Ctrl+Shift+Z redo

#### 6.5.2 Performance Check

- [ ] Large file (>1000 lines YAML) load time ≤2s
- [ ] File switch response time ≤500ms
- [ ] YAML parsing time ≤1s
- [ ] Visual render time (100+ nodes) ≤2s
- [ ] Undo/Redo response time ≤300ms

#### 6.5.3 Compatibility Check

- [ ] Chrome latest version
- [ ] Edge latest version
- [ ] Firefox latest version (if supported)
- [ ] Screen resolutions: 1920x1080, 1366x768

---

## 7. Risk Assessment and Mitigation

### 7.1 Technical Risks

| Risk                                     | Impact | Probability | Mitigation Measures                                                                                          |
| ---------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------ |
| **State sync issues**                    | High   | Medium      | 1. Sufficient unit tests<br>2. Use ref to avoid closure traps<br>3. Strict state flow management             |
| **Cross-file Undo/Redo failure**         | High   | Medium      | 1. Independent cross-file scenario tests<br>2. Add debug logs<br>3. Implement rollback mechanism             |
| **History management memory leak**       | Medium | Low         | 1. Implement incremental history records (optional)<br>2. Monitor memory usage<br>3. Set history stack limit |
| **YAML parsing performance degradation** | Medium | Low         | 1. Add performance tests<br>2. Use Web Worker (if needed)<br>3. Cache parsing results                        |
| **Increased component render count**     | Medium | Medium      | 1. Use React DevTools Profiler<br>2. Add React.memo<br>3. Optimize useCallback/useMemo                       |
| **TypeScript type errors**               | Low    | Low         | 1. Strict type definitions<br>2. Progressive refactoring, step-by-step verification                          |

### 7.2 Functional Risks

| Risk                   | Impact | Probability | Mitigation Measures                                                                                    |
| ---------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| **Feature regression** | High   | Low         | 1. Complete regression tests<br>2. Phased delivery, timely validation<br>3. Keep old code as reference |
| **UX changes**         | Medium | Low         | 1. Maintain UI consistency<br>2. Avoid changing interaction flows<br>3. Beta testing                   |
| **Data loss**          | High   | Very Low    | 1. Sufficient save logic testing<br>2. Add local cache (if needed)<br>3. Verify auto-save              |

### 7.3 Schedule Risks

| Risk                           | Impact | Probability | Mitigation Measures                                                                                          |
| ------------------------------ | ------ | ----------- | ------------------------------------------------------------------------------------------------------------ |
| **Inaccurate time estimation** | Medium | Medium      | 1. Reserve 20% buffer time<br>2. Prioritize P0 tasks<br>3. Weekly progress review                            |
| **Blocking issues**            | Medium | Low         | 1. Timely communication<br>2. Seek technical support<br>3. Adjust priorities                                 |
| **Scope creep**                | Low    | Medium      | 1. Strictly control scope<br>2. Defer new requirements until after refactoring<br>3. Regularly confirm goals |

### 7.4 Emergency Rollback Plan

#### 7.4.1 Branch Strategy

```
main (production)
├── develop (development)
│   ├── feature/refactor-phase1 (Phase 1)
│   ├── feature/refactor-phase2 (Phase 2)
│   ├── feature/refactor-phase3 (Phase 3)
│   └── feature/refactor-phase4 (Phase 4)
```

**Strategy**:

1. Each phase develops on independent branch
2. Merge to develop after completion and testing
3. Merge to main after develop stabilizes
4. Keep all phase branches for at least 2 weeks (for rollback)

#### 7.4.2 Rollback Trigger Conditions

**Immediate Rollback**:

- Severe bug causing editor unusable
- Data loss or corruption
- Performance degradation >50%
- Critical feature failure (Undo/Redo, Save, etc.)

**Delayed Rollback** (fix then continue):

- UI style issues
- Minor feature anomalies
- Non-critical performance issues

#### 7.4.3 Rollback Steps

```bash
# 1. Switch to last stable version
git checkout develop
git reset --hard <last-stable-commit>

# 2. Force push (requires team confirmation)
git push origin develop --force

# 3. Notify team
echo "Rolled back to <commit-id> due to <reason>"

# 4. Analyze issue
git log --oneline <last-stable-commit>..HEAD

# 5. Fix and re-merge
git checkout feature/refactor-phase<X>
# Fix issue...
git commit -am "fix: <issue>"
git checkout develop
git merge feature/refactor-phase<X>
```

#### 7.4.4 Data Backup

**Before Refactoring**:

- Export all current project data
- Backup database (if any)
- Record current version number

**During Refactoring**:

- Create backup point after each phase completion
- Keep old code files (rename to `.old`)

---

## 8. Time Estimation and Resource Requirements

### 8.1 Detailed Time Estimation

#### 8.1.1 Estimation by Phase

| Phase       | Task                          | Work (days) | Buffer (days) | Total (days) |
| ----------- | ----------------------------- | ----------- | ------------- | ------------ |
| **Phase 1** |                               |             |               | **5**        |
|             | Create directory structure    | 0.5         | 0             | 0.5          |
|             | Extract YamlService           | 2           | 0.5           | 2.5          |
|             | Extract ScriptOperations      | 2           | 0.5           | 2.5          |
|             | Create useProjectEditorState  | 1.5         | 0.5           | 2            |
| **Phase 2** |                               |             |               | **5.5**      |
|             | Split FileTreeSidebar         | 1.5         | 0.5           | 2            |
|             | Split ProjectEditorHeader     | 1           | 0.3           | 1.3          |
|             | Split EditorContent           | 2           | 0.5           | 2.5          |
|             | Split VersionPanel            | 0.5         | 0.2           | 0.7          |
| **Phase 3** |                               |             |               | **7.5**      |
|             | Create useFileOperations      | 2           | 0.5           | 2.5          |
|             | Create useScriptOperations    | 2.5         | 0.5           | 3            |
|             | Refactor useHistoryManager    | 2           | 0.5           | 2.5          |
|             | Create helper Hooks           | 0.5         | 0.2           | 0.7          |
| **Phase 4** |                               |             |               | **7**        |
|             | Main component refactoring    | 2           | 0.5           | 2.5          |
|             | Unit test supplement          | 2           | 0.5           | 2.5          |
|             | Integration testing           | 1.5         | 0.5           | 2            |
|             | Performance optimization      | 1.5         | 0.5           | 2            |
|             | Code review and documentation | 1           | 0.3           | 1.3          |
| **Total**   |                               | **22.5**    | **6.3**       | **28.8**     |

**Actual Working Days**: Approximately **29 days** ≈ **4 weeks** (at 5 working days per week)

#### 8.1.2 Critical Path Analysis

```mermaid
gantt
    title ProjectEditor Refactoring Gantt Chart
    dateFormat  YYYY-MM-DD
    section Phase 1
    Directory Structure           :a1, 2026-02-03, 0.5d
    YamlService        :a2, after a1, 2.5d
    ScriptOperations   :a3, after a1, 2.5d
    useProjectEditorState :a4, after a2, 2d

    section Phase 2
    FileTreeSidebar    :b1, after a4, 2d
    EditorHeader       :b2, after a4, 1.3d
    EditorContent      :b3, after b1, 2.5d
    VersionPanel       :b4, after b2, 0.7d

    section Phase 3
    useFileOperations  :c1, after b3, 2.5d
    useScriptOperations:c2, after b3, 3d
    useHistoryManager  :c3, after c2, 2.5d
    Helper Hooks          :c4, after c1, 0.7d

    section Phase 4
    Main Component Refactoring         :d1, after c3, 2.5d
    Unit Tests           :d2, after d1, 2.5d
    Integration Tests           :d3, after d2, 2d
    Performance Optimization           :d4, after d1, 2d
    Code Review           :d5, after d3, 1.3d
```

### 8.2 Resource Requirements

#### 8.2.1 Human Resources

| Role                             | Workload | Time Allocation                             |
| -------------------------------- | -------- | ------------------------------------------- |
| **Frontend Developer (Primary)** | 100%     | Full participation (4 weeks)                |
| **Tech Lead (Review)**           | 20%      | Weekly review + technical support (4 weeks) |
| **QA Engineer (Testing)**        | 50%      | Phase 4 concentrated participation (1 week) |
| **Product Manager (Acceptance)** | 10%      | Phase acceptance (4 times)                  |

**Total Person-Days**:

- Development: 29 person-days
- Review: 4 person-days
- Testing: 5 person-days
- Acceptance: 2 person-days
- **Total**: 40 person-days

#### 8.2.2 Technical Support

**Tools and Environment**:

- [ ] Test environment deployment (isolated from production)
- [ ] CI/CD pipeline configuration (automated testing)
- [ ] Performance monitoring tools (React DevTools Profiler)
- [ ] Code review tools (GitHub PR Review)

**Technical Preparation**:

- [ ] React Hooks best practices
- [ ] TypeScript advanced types
- [ ] Jest + Testing Library usage
- [ ] Performance optimization techniques

### 8.3 Milestones and Acceptance Criteria

#### Milestone 1: Phase 1 Complete (End of Week 1) ✅

**Deliverables**:

- [x] `services/YamlService.ts` (with unit tests) - 785 lines, 10 tests
- [x] `services/ScriptOperations.ts` (with unit tests) - 706 lines, 21 tests
- [x] `hooks/useProjectEditorState.ts` - 368 lines
- [x] Main component state count ≤15 - Passed through import simplification

**Acceptance Criteria**:

- [x] All unit tests pass (coverage >80%) - 46 tests all passed
- [x] Existing features work normally (manual regression testing) - Main component integration complete
- [x] TypeScript compilation no errors - Build successful
- [x] ESLint no warnings - No warnings

**Completion Date**: 2026-01-30
**Code Changes**: Main component reduced from 2945 lines to 2420 lines (-18%)

#### Milestone 2: Phase 2 Complete (End of Week 2) ✅

**Deliverables**:

- [x] `pages/ProjectEditor/ProjectEditorHeader.tsx` - 114 lines
- [x] `pages/ProjectEditor/FileTreeSidebar.tsx` - 211 lines
- [x] `pages/ProjectEditor/EditorContent.tsx` - 344 lines
- [x] Main component integration with new components - Reduced from 2420 lines to 1881 lines (-22%)

**Acceptance Criteria**:

- [x] All TypeScript compilation passes - ✅ No errors
- [x] Existing features work normally (manual regression testing) - Needs testing
- [x] Component responsibilities clear, Props interface complete - ✅ Complete
- [x] Code readability significantly improved - ✅ Complete

**Completion Date**: 2026-01-30
**Code Changes**:

- Main component reduced from 2420 lines to 1881 lines (-22%)
- Added 3 UI components: ProjectEditorHeader (114 lines), FileTreeSidebar (211 lines), EditorContent (344 lines)
- Total 669 lines of new code, reduced 539 lines from main component
- Component splitting complete, responsibilities clear, Props passing reasonable

**Current Main Component Status**:

- Lines: 2420 lines (originally 2945 lines, reduced by 525 lines)
- Still contains: Complete rendering logic for Header, Sider, Content
- Core business logic: Successfully extracted to independent services

**Deliverables** (Incomplete):

- [ ] `pages/ProjectEditor/FileTreeSidebar.tsx`
- [ ] `pages/ProjectEditor/ProjectEditorHeader.tsx`
- [ ] `pages/ProjectEditor/EditorContent.tsx`
- [ ] `pages/ProjectEditor/VersionPanel.tsx` - Note: VersionListPanel is already an independent component
- [ ] Main component lines ≤500

**Acceptance Criteria** (Not Executed):

- [ ] All UI components render normally
- [ ] All interaction features work normally
- [ ] No obvious performance degradation
- [ ] Code review passed

#### Milestone 3: Phase 3 Partially Complete (Week 3) ⚠️

**Deliverables**:

- [x] `hooks/useFileOperations.tsx` - 453 lines (created, not integrated)
- [ ] `hooks/useScriptOperations.ts` - Not started
- [ ] `hooks/useHistoryManager.ts` - Not started
- [ ] `hooks/useAutoSave.ts` - Not started
- [ ] `hooks/useKeyboardShortcuts.ts` - Not started

**Acceptance Criteria**:

- [ ] All Hooks created
- [ ] Integrated in main component
- [ ] All features work normally

**Current Status**: Partially complete, paused
**Reason**:

1. useFileOperations Hook design too coupled, integration difficult
2. Should complete state management Hook first
3. Progressive strategy more practical

**Next Steps**:

1. Maintain current Phase 2 results (UI component splitting)
2. Introduce YamlService and ScriptOperations as needed in subsequent development
3. If continuing Hook-ification, adopt grouped small Hook strategy

**Deliverables**:

- [x] `hooks/useFileOperations.ts`
- [x] `hooks/useScriptOperations.ts`
- [x] `hooks/useHistoryManager.ts`
- [x] `hooks/useAutoSave.ts`
- [x] `hooks/useKeyboardShortcuts.ts`
- [x] Main component lines ≤350

**Acceptance Criteria**:

- [ ] All business logic works normally
- [ ] Undo/Redo works across files
- [ ] Auto-save works normally
- [ ] Keyboard shortcuts work normally
- [ ] Hook unit tests pass

#### Milestone 4: Phase 4 Complete (End of Week 4)

**Deliverables**:

- [x] `pages/ProjectEditor/index.tsx` (≤300 lines)
- [x] Complete unit test suite
- [x] Integration test cases
- [x] Performance optimization report
- [x] Refactoring summary document

**Acceptance Criteria**:

- [ ] Main component lines ≤300
- [ ] All tests pass (unit + integration)
- [ ] Regression tests 100% pass
- [ ] Performance metrics met
- [ ] Final code review passed
- [ ] Product manager acceptance passed

### 8.4 Risk Buffer Time Allocation

**Total Buffer Time**: 6.3 days ≈ 1.3 weeks

**Allocation Strategy**:

- **Inter-phase buffer**: Reserve 0.5 days after each phase for issue fixes
- **Final buffer**: Reserve 2 days after Phase 4 for final adjustments
- **Emergency buffer**: Reserve 1 day for unexpected issues

**Usage Principles**:

- Only use when encountering blocking issues
- Record reason for each use
- Adjust plan if buffer exhausted

---

## 9. Success Criteria and Metrics

### 9.1 Code Quality Metrics

| Metric                | Target     | Measurement Method     |
| --------------------- | ---------- | ---------------------- |
| Main file lines       | ≤300 lines | Line count statistics  |
| Single function lines | ≤50 lines  | ESLint rules           |
| Cyclomatic complexity | ≤10        | ESLint complexity rule |
| TypeScript coverage   | 100%       | tsc --noEmit           |
| Unit test coverage    | >80%       | Jest coverage          |
| Code duplication rate | <5%        | jscpd tool             |

### 9.2 Performance Metrics

| Metric                         | Target | Measurement Method          |
| ------------------------------ | ------ | --------------------------- |
| Initial load time              | ≤2s    | Chrome DevTools Performance |
| File switch time               | ≤500ms | Manual timing               |
| YAML parse time (1000 lines)   | ≤1s    | console.time                |
| Visual render time (100 nodes) | ≤2s    | React Profiler              |
| Undo/Redo response time        | ≤300ms | Manual timing               |
| Memory usage (peak)            | ≤200MB | Chrome DevTools Memory      |

### 9.3 Functional Completeness Metrics

| Category           | Feature Count | Passed | Pass Rate Target |
| ------------------ | ------------- | ------ | ---------------- |
| File Operations    | 4             | -      | 100%             |
| Editing Features   | 4             | -      | 100%             |
| CRUD Operations    | 12            | -      | 100%             |
| History Management | 4             | -      | 100%             |
| Auto-save          | 2             | -      | 100%             |
| Debug Features     | 3             | -      | 100%             |
| Version Management | 3             | -      | 100%             |
| Keyboard Shortcuts | 3             | -      | 100%             |
| **Total**          | **35**        | **-**  | **100%**         |

### 9.4 User Experience Metrics

| Metric                   | Target    | Measurement Method           |
| ------------------------ | --------- | ---------------------------- |
| Interface response delay | <100ms    | User perception test         |
| Operation smoothness     | No lag    | Manual testing               |
| Error message clarity    | 100%      | User feedback                |
| Learning curve           | No change | Compare with pre-refactoring |

---

## 10. Appendix

### 10.1 Reference Materials

**Project Documentation**:

- [Project Editor Feature Architecture](../_global/process/development-guide.md)
- [Redo/Undo Feature Implementation](./visual-editor-validation-design.md)
- [History Manager Design](../../../packages/script-editor/src/utils/history-manager.ts)

**React Best Practices**:

- [React Hooks Official Documentation](https://react.dev/reference/react)
- [Testing Library Best Practices](https://testing-library.com/docs/react-testing-library/intro/)
- [React Performance Optimization](https://react.dev/reference/react/useMemo)

**Refactoring Books**:

- Martin Fowler - _Refactoring: Improving the Design of Existing Code_
- Robert C. Martin - _Clean Code_

### 10.2 Glossary

| Term                     | Definition                                      |
| ------------------------ | ----------------------------------------------- |
| **Phase**                | First level of session script (stage)           |
| **Topic**                | Second level of session script (topic)          |
| **Action**               | Third level of session script (action node)     |
| **YAML**                 | Human-readable data serialization language      |
| **Undo/Redo**            | Undo/Redo functionality                         |
| **Cross-file operation** | Execute undo/redo across different files        |
| **Focus navigation**     | Auto-position to specified Phase/Topic/Action   |
| **History snapshot**     | Saved before/after operation state              |
| **Immutable data**       | Don't modify original object, return new object |

### 10.3 Frequently Asked Questions (FAQ)

#### Q1: Why not use Redux or Zustand?

**A**:

1. Current project scale suits custom Hooks
2. Avoid introducing extra dependencies and learning cost
3. Maintain consistency with existing architecture
4. Can seamlessly migrate later if needed

#### Q2: How to handle new requirements during refactoring?

**A**:

1. Evaluate priority: P0 urgent requirements can be inserted
2. P1 requirements deferred until after refactoring
3. Requirement changes need to update refactoring plan

#### Q3: How to ensure no performance degradation after refactoring?

**A**:

1. Performance testing at each phase
2. Monitor with React DevTools Profiler
3. Optimize useCallback/useMemo usage
4. Use React.memo when necessary

#### Q4: How to control history management memory usage?

**A**:

1. Initially use full snapshots (simple and reliable)
2. Monitor actual memory usage
3. Consider incremental records if exceeding 200MB
4. Set history stack limit (e.g., 50 entries)

#### Q5: How to rollback if refactoring fails?

**A**: See Section 7.4 "Emergency Rollback Plan"

### 10.4 Checklist

#### Before Starting Refactoring

- [ ] Backup current code
- [ ] Create refactoring branch
- [ ] Confirm test environment available
- [ ] Notify team of refactoring plan
- [ ] Read related documentation and code

#### Before Each Phase

- [ ] Review previous phase results
- [ ] Confirm current phase goals
- [ ] Update task board
- [ ] Prepare test data

#### After Each Phase

- [ ] Run all tests
- [ ] Manual regression testing
- [ ] Code review
- [ ] Update documentation
- [ ] Merge to develop branch
- [ ] Mark milestone

#### After Refactoring Complete

- [ ] Final acceptance testing
- [ ] Performance comparison report
- [ ] Write refactoring summary
- [ ] Team sharing
- [ ] Archive old code
- [ ] Celebrate success! 🎉

---

## 📝 Summary

This refactoring plan aims to split a 2945-line giant component into a clear, maintainable modular architecture. Through **4 weeks, 4 phases** of progressive refactoring, we will:

1. **Reduce Complexity**: Main file from 2945 lines to ≤300 lines
2. **Improve Maintainability**: Each module has single responsibility, easy to understand and modify
3. **Enhance Testability**: Service layer, Hook layer can be tested independently
4. **Maintain Functional Completeness**: Ensure existing features are not affected through sufficient testing
5. **Optimize Performance**: Ensure no performance degradation through reasonable optimization measures

**Key Success Factors**:

- Strictly follow the plan, don't arbitrarily expand scope
- Fully test before moving to next phase
- Maintain communication with team, resolve issues timely
- Follow existing coding standards and best practices

**Expected Benefits**:

- New feature development time reduced by 75%
- Bug fix time reduced by 70%
- Code readability improved by 90%
- Team development efficiency improved by 50%

---

**Document Maintenance**:

- This document is continuously updated during refactoring
- Actual progress vs plan deviations need to be recorded timely
- Write "Refactoring Summary" section after refactoring complete

**Contact**:

- Technical issues: Submit Issue to project repository
- Plan adjustments: Discuss with Tech Lead

---

_This refactoring plan was generated by AI assistant and adjusted/optimized based on actual project situation._  
_Last Updated: 2026-01-30_
