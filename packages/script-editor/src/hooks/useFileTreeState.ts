import type { DataNode } from 'antd/es/tree';
import { useState } from 'react';

import type { Project, ScriptFile } from '../api/projects';

export interface FileTreeNode extends DataNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  fileId?: string;
  fileType?: string;
  children?: FileTreeNode[];
}

/**
 * useFileTreeState Hook
 * 管理文件树相关的状态：工程信息、文件列表、选中状态等
 */
export interface FileTreeState {
  // 基础数据
  loading: boolean;
  setLoading: (loading: boolean) => void;

  saving: boolean;
  setSaving: (saving: boolean) => void;

  project: Project | null;
  setProject: (project: Project | null) => void;

  files: ScriptFile[];
  setFiles: (files: ScriptFile[]) => void;

  selectedFile: ScriptFile | null;
  setSelectedFile: (file: ScriptFile | null) => void;

  // 文件树
  treeData: FileTreeNode[];
  setTreeData: (data: FileTreeNode[]) => void;

  expandedKeys: React.Key[];
  setExpandedKeys: (keys: React.Key[]) => void;

  selectedKeys: React.Key[];
  setSelectedKeys: (keys: React.Key[]) => void;

  // UI状态
  leftCollapsed: boolean;
  setLeftCollapsed: (collapsed: boolean) => void;
}

export const useFileTreeState = (): FileTreeState => {
  // 基础数据
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ScriptFile | null>(null);

  // 文件树
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  // UI状态
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  return {
    loading,
    setLoading,
    saving,
    setSaving,
    project,
    setProject,
    files,
    setFiles,
    selectedFile,
    setSelectedFile,
    treeData,
    setTreeData,
    expandedKeys,
    setExpandedKeys,
    selectedKeys,
    setSelectedKeys,
    leftCollapsed,
    setLeftCollapsed,
  };
};
