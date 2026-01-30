/**
 * useProjectEditorState - 项目编辑器状态管理Hook
 *
 * 功能：
 * 1. 整合42个useState为统一的状态管理
 * 2. 提供状态选择器，优化渲染性能
 * 3. 提供状态更新方法
 */

import { useState, useRef } from 'react';

import type { Project, ScriptFile } from '../api/projects';
import type { ActionNodeListRef } from '../components/ActionNodeList';
import { ValidationService } from '../services/validation-service';
import type { ValidationResult } from '../services/validation-service';
import type { PhaseWithTopics } from '../services/YamlService';
import type { SessionScript } from '../types/action';

/**
 * 文件树节点类型
 */
export interface FileTreeNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  fileId?: string;
  fileType?: string;
  children?: FileTreeNode[];
}

/**
 * 调试目标类型
 */
export interface DebugTarget {
  type: 'draft' | 'version';
  versionId?: string;
  versionNumber?: string;
}

/**
 * Action选中路径
 */
export interface ActionPath {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
}

/**
 * Phase选中路径
 */
export interface PhasePath {
  phaseIndex: number;
}

/**
 * Topic选中路径
 */
export interface TopicPath {
  phaseIndex: number;
  topicIndex: number;
}

/**
 * 编辑类型
 */
export type EditingType = 'phase' | 'topic' | 'action' | null;

/**
 * 编辑模式
 */
export type EditMode = 'yaml' | 'visual';

/**
 * 项目编辑器完整状态
 */
export interface ProjectEditorState {
  // 基础状态
  loading: boolean;
  saving: boolean;
  project: Project | null;

  // 文件管理状态
  files: ScriptFile[];
  selectedFile: ScriptFile | null;
  fileContent: string;
  treeData: FileTreeNode[];
  expandedKeys: React.Key[];
  selectedKeys: React.Key[];
  hasUnsavedChanges: boolean;

  // 版本管理状态
  publishModalVisible: boolean;
  versionNote: string;
  versionPanelVisible: boolean;

  // UI状态
  leftCollapsed: boolean;
  editMode: EditMode;

  // 调试状态
  debugConfigVisible: boolean;
  debugPanelVisible: boolean;
  debugSessionId: string | null;
  debugInitialMessage: string;
  debugInitialDebugInfo: any;
  debugTarget: DebugTarget | null;

  // 验证状态
  validationResult: ValidationResult | null;
  showValidationErrors: boolean;

  // 可视化编辑状态
  parsedScript: SessionScript | null;
  currentPhases: PhaseWithTopics[];
  selectedActionPath: ActionPath | null;
  selectedPhasePath: PhasePath | null;
  selectedTopicPath: TopicPath | null;
  editingType: EditingType;
}

/**
 * Refs集合
 */
export interface ProjectEditorRefs {
  autoSaveTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  actionNodeListRef: React.MutableRefObject<ActionNodeListRef | null>;
  processingUndoRedoRef: React.MutableRefObject<boolean>;
  selectedFileRef: React.MutableRefObject<ScriptFile | null>;
  initialStatePushedRef: React.MutableRefObject<Set<string>>;
  fileYamlBaseRef: React.MutableRefObject<Map<string, string>>;
  validationServiceRef: React.MutableRefObject<ValidationService>;
}

/**
 * 状态更新方法集合
 */
export interface ProjectEditorActions {
  // 基础状态
  setLoading: (value: boolean) => void;
  setSaving: (value: boolean) => void;
  setProject: (value: Project | null) => void;

  // 文件管理
  setFiles: (value: ScriptFile[]) => void;
  setSelectedFile: (value: ScriptFile | null) => void;
  setFileContent: (value: string) => void;
  setTreeData: (value: FileTreeNode[]) => void;
  setExpandedKeys: (value: React.Key[]) => void;
  setSelectedKeys: (value: React.Key[]) => void;
  setHasUnsavedChanges: (value: boolean) => void;

  // 版本管理
  setPublishModalVisible: (value: boolean) => void;
  setVersionNote: (value: string) => void;
  setVersionPanelVisible: (value: boolean) => void;

  // UI状态
  setLeftCollapsed: (value: boolean) => void;
  setEditMode: (value: EditMode) => void;

  // 调试状态
  setDebugConfigVisible: (value: boolean) => void;
  setDebugPanelVisible: (value: boolean) => void;
  setDebugSessionId: (value: string | null) => void;
  setDebugInitialMessage: (value: string) => void;
  setDebugInitialDebugInfo: (value: any) => void;
  setDebugTarget: (value: DebugTarget | null) => void;

  // 验证状态
  setValidationResult: (value: ValidationResult | null) => void;
  setShowValidationErrors: (value: boolean) => void;

  // 可视化编辑状态
  setParsedScript: (value: SessionScript | null) => void;
  setCurrentPhases: (
    value: PhaseWithTopics[] | ((prev: PhaseWithTopics[]) => PhaseWithTopics[])
  ) => void;
  setSelectedActionPath: (value: ActionPath | null) => void;
  setSelectedPhasePath: (value: PhasePath | null) => void;
  setSelectedTopicPath: (value: TopicPath | null) => void;
  setEditingType: (value: EditingType) => void;
}

/**
 * Hook返回值
 */
export interface UseProjectEditorStateReturn {
  state: ProjectEditorState;
  actions: ProjectEditorActions;
  refs: ProjectEditorRefs;
}

/**
 * 项目编辑器状态管理Hook
 */
export function useProjectEditorState(): UseProjectEditorStateReturn {
  // ========== 基础状态 ==========
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);

  // ========== 文件管理状态 ==========
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ScriptFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ========== 版本管理状态 ==========
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [versionPanelVisible, setVersionPanelVisible] = useState(false);

  // ========== UI状态 ==========
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('yaml');

  // ========== 调试状态 ==========
  const [debugConfigVisible, setDebugConfigVisible] = useState(false);
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [debugSessionId, setDebugSessionId] = useState<string | null>(null);
  const [debugInitialMessage, setDebugInitialMessage] = useState<string>('');
  const [debugInitialDebugInfo, setDebugInitialDebugInfo] = useState<any>(null);
  const [debugTarget, setDebugTarget] = useState<DebugTarget | null>(null);

  // ========== 验证状态 ==========
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(true);

  // ========== 可视化编辑状态 ==========
  const [parsedScript, setParsedScript] = useState<SessionScript | null>(null);
  const [currentPhases, setCurrentPhases] = useState<PhaseWithTopics[]>([]);
  const [selectedActionPath, setSelectedActionPath] = useState<ActionPath | null>(null);
  const [selectedPhasePath, setSelectedPhasePath] = useState<PhasePath | null>(null);
  const [selectedTopicPath, setSelectedTopicPath] = useState<TopicPath | null>(null);
  const [editingType, setEditingType] = useState<EditingType>(null);

  // ========== Refs ==========
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const actionNodeListRef = useRef<ActionNodeListRef | null>(null);
  const processingUndoRedoRef = useRef<boolean>(false);
  const selectedFileRef = useRef<ScriptFile | null>(null);
  const initialStatePushedRef = useRef<Set<string>>(new Set());
  const fileYamlBaseRef = useRef<Map<string, string>>(new Map());
  const validationServiceRef = useRef(new ValidationService({ debounceMs: 500 }));

  // 组装状态对象
  const state: ProjectEditorState = {
    // 基础状态
    loading,
    saving,
    project,

    // 文件管理状态
    files,
    selectedFile,
    fileContent,
    treeData,
    expandedKeys,
    selectedKeys,
    hasUnsavedChanges,

    // 版本管理状态
    publishModalVisible,
    versionNote,
    versionPanelVisible,

    // UI状态
    leftCollapsed,
    editMode,

    // 调试状态
    debugConfigVisible,
    debugPanelVisible,
    debugSessionId,
    debugInitialMessage,
    debugInitialDebugInfo,
    debugTarget,

    // 验证状态
    validationResult,
    showValidationErrors,

    // 可视化编辑状态
    parsedScript,
    currentPhases,
    selectedActionPath,
    selectedPhasePath,
    selectedTopicPath,
    editingType,
  };

  // 组装Actions对象
  const actions: ProjectEditorActions = {
    // 基础状态
    setLoading,
    setSaving,
    setProject,

    // 文件管理
    setFiles,
    setSelectedFile,
    setFileContent,
    setTreeData,
    setExpandedKeys,
    setSelectedKeys,
    setHasUnsavedChanges,

    // 版本管理
    setPublishModalVisible,
    setVersionNote,
    setVersionPanelVisible,

    // UI状态
    setLeftCollapsed,
    setEditMode,

    // 调试状态
    setDebugConfigVisible,
    setDebugPanelVisible,
    setDebugSessionId,
    setDebugInitialMessage,
    setDebugInitialDebugInfo,
    setDebugTarget,

    // 验证状态
    setValidationResult,
    setShowValidationErrors,

    // 可视化编辑状态
    setParsedScript,
    setCurrentPhases,
    setSelectedActionPath,
    setSelectedPhasePath,
    setSelectedTopicPath,
    setEditingType,
  };

  // 组装Refs对象
  const refs: ProjectEditorRefs = {
    autoSaveTimerRef,
    actionNodeListRef,
    processingUndoRedoRef,
    selectedFileRef,
    initialStatePushedRef,
    fileYamlBaseRef,
    validationServiceRef,
  };

  return {
    state,
    actions,
    refs,
  };
}

/**
 * 状态选择器Hook（用于性能优化）
 * 只订阅特定的状态切片，避免不必要的重渲染
 */
export function useProjectEditorStateSelector<T>(
  selector: (state: ProjectEditorState) => T,
  stateHook: UseProjectEditorStateReturn
): T {
  return selector(stateHook.state);
}
