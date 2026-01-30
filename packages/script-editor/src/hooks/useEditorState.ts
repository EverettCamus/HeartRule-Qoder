import { useState, useRef } from 'react';

import type { ScriptFile } from '../api/projects';
import type { ValidationResult } from '../services/validation-service';
import { ValidationService } from '../services/validation-service';
import type { PhaseWithTopics } from '../services/YamlService';
import type { SessionScript } from '../types/action';

/**
 * useEditorState Hook
 * 管理编辑相关的状态：编辑模式、内容、脚本解析、验证等
 */
export interface EditorState {
  // 编辑模式
  editMode: 'yaml' | 'visual';
  setEditMode: (mode: 'yaml' | 'visual') => void;

  // 文件内容
  fileContent: string;
  setFileContent: (content: string) => void;

  // 未保存更改标记
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (changed: boolean) => void;

  // 脚本解析
  parsedScript: SessionScript | null;
  setParsedScript: (script: SessionScript | null) => void;

  currentPhases: PhaseWithTopics[];
  setCurrentPhases: React.Dispatch<React.SetStateAction<PhaseWithTopics[]>>;

  // 验证
  validationResult: ValidationResult | null;
  setValidationResult: (result: ValidationResult | null) => void;

  showValidationErrors: boolean;
  setShowValidationErrors: (show: boolean) => void;

  validationServiceRef: React.MutableRefObject<ValidationService>;

  // 选中路径（可视化编辑）
  selectedActionPath: {
    phaseIndex: number;
    topicIndex: number;
    actionIndex: number;
  } | null;
  setSelectedActionPath: (
    path: { phaseIndex: number; topicIndex: number; actionIndex: number } | null
  ) => void;

  selectedPhasePath: { phaseIndex: number } | null;
  setSelectedPhasePath: (path: { phaseIndex: number } | null) => void;

  selectedTopicPath: {
    phaseIndex: number;
    topicIndex: number;
  } | null;
  setSelectedTopicPath: (path: { phaseIndex: number; topicIndex: number } | null) => void;

  editingType: 'phase' | 'topic' | 'action' | null;
  setEditingType: (type: 'phase' | 'topic' | 'action' | null) => void;

  // YAML基线（用于同步）
  fileYamlBaseRef: React.MutableRefObject<Map<string, string>>;

  // 当前选中文件（ref防止闭包）
  selectedFileRef: React.MutableRefObject<ScriptFile | null>;
}

export const useEditorState = (): EditorState => {
  // 编辑模式
  const [editMode, setEditMode] = useState<'yaml' | 'visual'>('yaml');

  // 文件内容
  const [fileContent, setFileContent] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // 脚本解析
  const [parsedScript, setParsedScript] = useState<SessionScript | null>(null);
  const [currentPhases, setCurrentPhases] = useState<PhaseWithTopics[]>([]);

  // 验证
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(true);
  const validationServiceRef = useRef(new ValidationService({ debounceMs: 500 }));

  // 选中路径
  const [selectedActionPath, setSelectedActionPath] = useState<{
    phaseIndex: number;
    topicIndex: number;
    actionIndex: number;
  } | null>(null);

  const [selectedPhasePath, setSelectedPhasePath] = useState<{ phaseIndex: number } | null>(null);

  const [selectedTopicPath, setSelectedTopicPath] = useState<{
    phaseIndex: number;
    topicIndex: number;
  } | null>(null);

  const [editingType, setEditingType] = useState<'phase' | 'topic' | 'action' | null>(null);

  // Refs
  const fileYamlBaseRef = useRef<Map<string, string>>(new Map());
  const selectedFileRef = useRef<ScriptFile | null>(null);

  return {
    editMode,
    setEditMode,
    fileContent,
    setFileContent,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    parsedScript,
    setParsedScript,
    currentPhases,
    setCurrentPhases,
    validationResult,
    setValidationResult,
    showValidationErrors,
    setShowValidationErrors,
    validationServiceRef,
    selectedActionPath,
    setSelectedActionPath,
    selectedPhasePath,
    setSelectedPhasePath,
    selectedTopicPath,
    setSelectedTopicPath,
    editingType,
    setEditingType,
    fileYamlBaseRef,
    selectedFileRef,
  };
};
