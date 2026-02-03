import {
  FolderOutlined,
  FileOutlined,
  FileTextOutlined,
  GlobalOutlined,
  UserOutlined,
  ThunderboltOutlined,
  FormOutlined,
  BulbOutlined,
  HistoryOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Layout, Typography, Button, Space, message, Modal, Input, Spin } from 'antd';
import type { DataNode } from 'antd/es/tree';
import yaml from 'js-yaml';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { projectsApi, versionsApi } from '../../api/projects';
import type { ScriptFile } from '../../api/projects';
import type { ActionNodeListRef } from '../../components/ActionNodeList';
import type { SessionData } from '../../components/SessionPropertyPanel';
import DebugChatPanel from '../../components/DebugChatPanel';
import DebugConfigModal from '../../components/DebugConfigModal';
import VersionListPanel from '../../components/VersionListPanel';
import TemplateSchemeManager from '../../components/TemplateSchemeManager';
import TemplateEditor from '../../components/TemplateEditor';
import { useEditorState } from '../../hooks/useEditorState';
import { useFileTreeState } from '../../hooks/useFileTreeState';
import { yamlService } from '../../services/YamlService';
import type { PhaseWithTopics, TopicWithActions } from '../../services/YamlService';
import type { Action } from '../../types/action';
import { globalHistoryManager } from '../../utils/history-manager';
import type { FocusPath } from '../../utils/history-manager';

import EditorContent from './EditorContent';
import FileTreeSidebar from './FileTreeSidebar';
import ProjectEditorHeader from './ProjectEditorHeader';
import './style.css';

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface FileTreeNode extends DataNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  fileId?: string;
  fileType?: string;
  children?: FileTreeNode[];
}

const ProjectEditor: React.FC = () => {
  const { projectId, fileId } = useParams<{ projectId: string; fileId?: string }>();
  const navigate = useNavigate();

  // 状态管理Hooks
  const editorState = useEditorState();
  const fileTreeState = useFileTreeState();

  // 从状态Hooks解构常用变量（保持兼容性）
  const {
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
  } = editorState;

  const {
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
  } = fileTreeState;

  // 模板方案列表
  const [templateSchemes, setTemplateSchemes] = useState<
    Array<{ name: string; description: string; isDefault: boolean }>
  >([]);

  // UI状态（未纳入Hook）
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [versionPanelVisible, setVersionPanelVisible] = useState(false);
  
  // 模板管理相关状态
  const [templateManagerVisible, setTemplateManagerVisible] = useState(false);
  const [templateEditorVisible, setTemplateEditorVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<{
    schemeName: string;
    templatePath: string;
  } | null>(null);

  // 调试功能相关状态
  const [debugConfigVisible, setDebugConfigVisible] = useState(false);
  const [debugPanelVisible, setDebugPanelVisible] = useState(false);
  const [debugSessionId, setDebugSessionId] = useState<string | null>(null);
  const [debugInitialMessage, setDebugInitialMessage] = useState<string>('');
  const [debugInitialDebugInfo, setDebugInitialDebugInfo] = useState<any>(null);
  const [debugTarget, setDebugTarget] = useState<{
    type: 'draft' | 'version';
    versionId?: string;
    versionNumber?: string;
  } | null>(null);

  // Refs
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const actionNodeListRef = useRef<ActionNodeListRef>(null);
  const processingUndoRedoRef = useRef<boolean>(false);
  const initialStatePushedRef = useRef<Set<string>>(new Set());

  // 文件操作Hook（未使用，保留作为参考）
  // const fileOperations = useFileOperations({
  //   projectId,
  //   fileId,
  //   navigate,
  //   editorState,
  //   fileTreeState,
  //   buildFileTree,
  //   parseYamlToScript,
  //   fixYAMLIndentation,
  // });

  // 同步 selectedFile 到 ref
  useEffect(() => {
    console.log(
      `[StateSync] selectedFile 更新: ${selectedFile?.fileName} (id: ${selectedFile?.id})`
    );
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  // 监听 currentPhases 和 selectedFile，在首次加载时推入初始状态
  useEffect(() => {
    if (!selectedFile || currentPhases.length === 0) {
      return;
    }

    // 检查是否已经为该文件推入过初始状态
    if (initialStatePushedRef.current.has(selectedFile.id)) {
      return;
    }

    // 检查历史栈中是否已有该文件的记录
    const hasHistory = globalHistoryManager.getEntries().some((e) => e.fileId === selectedFile.id);
    if (hasHistory) {
      console.log(`[InitialState] 文件 ${selectedFile.fileName} 已有历史记录，跳过`);
      initialStatePushedRef.current.add(selectedFile.id);
      return;
    }

    // 计算一个合理的初始焦点（如果存在Action）
    let initialFocus: FocusPath | null = null;
    if (
      currentPhases[0]?.topics &&
      currentPhases[0].topics[0]?.actions &&
      currentPhases[0].topics[0].actions.length > 0
    ) {
      initialFocus = {
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
        type: 'action',
      };
    }

    // 推入初始状态（作为第一条操作，其 beforePhases 为空）
    console.log(`[InitialState] 🎉 为文件 ${selectedFile.fileName} 推入初始状态`);
    globalHistoryManager.push({
      fileId: selectedFile.id,
      fileName: selectedFile.fileName,
      beforePhases: [], // 初始状态没有 before，用空数组表示
      afterPhases: JSON.parse(JSON.stringify(currentPhases)), // 深拷贝
      beforeFocusPath: null,
      afterFocusPath: initialFocus,
      operation: '初始状态',
      timestamp: Date.now(),
    });

    initialStatePushedRef.current.add(selectedFile.id);
  }, [currentPhases, selectedFile]);

  // 监控 fileContent 变化，用于调试
  useEffect(() => {
    console.log('[fileContent Changed] fileContent 长度:', fileContent.length);
    console.log('[fileContent Changed] 内容预览:', fileContent.substring(0, 100));
  }, [fileContent]);

  // ========== 可视化编辑相关函数 ==========

  /**
   * 解析 YAML 为脚本结构（保留层级结构）
   * 使用 yamlService 服务
   */
  const parseYamlToScript = useCallback((yamlContent: string) => {
    const result = yamlService.parseYamlToScript(yamlContent);

    if (result.success) {
      setParsedScript(result.parsedScript);
      setCurrentPhases(result.phases);
    } else {
      console.error('YAML 解析失败:', result.error);
      setParsedScript(null);
      setCurrentPhases([]);
    }
  }, []);

  // 获取文件类型图标
  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'global':
        return <GlobalOutlined style={{ color: '#52c41a' }} />;
      case 'roles':
        return <UserOutlined style={{ color: '#1890ff' }} />;
      case 'skills':
        return <ThunderboltOutlined style={{ color: '#faad14' }} />;
      case 'forms':
        return <FormOutlined style={{ color: '#722ed1' }} />;
      case 'rules':
        return <BulbOutlined style={{ color: '#eb2f96' }} />;
      case 'session':
        return <FileTextOutlined style={{ color: '#13c2c2' }} />;
      default:
        return <FileOutlined />;
    }
  };

  // 构建文件树
  const buildFileTree = useCallback(
    async (fileList: ScriptFile[], schemes: Array<{ name: string; description: string; isDefault: boolean }>): Promise<FileTreeNode[]> => {
      const sessionFiles = fileList.filter((f) => f.fileType === 'session');
      const otherFiles = fileList.filter((f) => f.fileType !== 'session' && f.fileType !== 'template'); // 排除模板文件

      const nodes: FileTreeNode[] = [];

      // 添加其他文件
      otherFiles.forEach((file) => {
        nodes.push({
          key: file.id,
          title: file.fileName,
          icon: getFileIcon(file.fileType),
          isLeaf: true,
          fileId: file.id,
          fileType: file.fileType,
        });
      });

      // 添加会谈脚本文件夹
      if (sessionFiles.length > 0) {
        nodes.push({
          key: 'sessions-folder',
          title: `Session Scripts (${sessionFiles.length})`,
          icon: <FolderOutlined style={{ color: '#faad14' }} />,
          children: sessionFiles.map((file) => ({
            key: file.id,
            title: file.fileName,
            icon: getFileIcon(file.fileType),
            isLeaf: true,
            fileId: file.id,
            fileType: file.fileType,
          })),
        });
      }

      // 添加模板文件夹（Template Files）
      if (schemes.length > 0 && projectId) {
        const templateChildren: FileTreeNode[] = [];

        // 添加 default 层（加载文件列表）
        const defaultScheme = schemes.find((s) => s.isDefault);
        if (defaultScheme) {
          try {
            console.log('[buildFileTree] 正在加载 default 方案的文件列表...');
            const defaultFiles = await projectsApi.getTemplateSchemeFiles(projectId, 'default');
            console.log('[buildFileTree] default 文件列表:', defaultFiles);
            console.log('[buildFileTree] defaultFiles.files:', defaultFiles.files);
            console.log('[buildFileTree] defaultFiles.files 长度:', defaultFiles.files?.length);
            
            const fileNodes: FileTreeNode[] = defaultFiles.files.map((file) => ({
              key: `template-default-${file.name}`,
              title: `📝 ${file.name}`,
              icon: <FileTextOutlined style={{ color: '#52c41a' }} />,
              isLeaf: true,
              fileType: 'template',
              filePath: `default/${file.name}`,
            }));

            console.log('[buildFileTree] 生成了', fileNodes.length, '个文件节点');
            console.log('[buildFileTree] fileNodes:', fileNodes);

            templateChildren.push({
              key: 'template-default',
              title: `📁 default (${defaultFiles.files.length} files)`,
              icon: <FolderOutlined style={{ color: '#52c41a' }} />,
              children: fileNodes, // 直接传递，不判断
            });
          } catch (error) {
            console.error('[buildFileTree] Failed to load default template files:', error);
            templateChildren.push({
              key: 'template-default',
              title: `📁 default (${defaultScheme.description})`,
              icon: <FolderOutlined style={{ color: '#52c41a' }} />,
              isLeaf: true,
            });
          }
        }

        // 添加 custom 层下的方案
        const customSchemes = schemes.filter((s) => !s.isDefault);
        if (customSchemes.length > 0) {
          const customChildren: FileTreeNode[] = [];

          for (const scheme of customSchemes) {
            try {
              const schemeFiles = await projectsApi.getTemplateSchemeFiles(projectId, scheme.name);
              const fileNodes: FileTreeNode[] = schemeFiles.files.map((file) => ({
                key: `template-custom-${scheme.name}-${file.name}`,
                title: `📝 ${file.name}`,
                icon: <FileTextOutlined style={{ color: '#722ed1' }} />,
                isLeaf: true,
                fileType: 'template',
                filePath: `custom/${scheme.name}/${file.name}`,
              }));

              customChildren.push({
                key: `template-custom-${scheme.name}`,
                title: `📁 ${scheme.name} (${schemeFiles.files.length} files)`,
                icon: <FolderOutlined style={{ color: '#722ed1' }} />,
                children: fileNodes, // 直接传递
              });
            } catch (error) {
              console.error(`Failed to load ${scheme.name} files:`, error);
              customChildren.push({
                key: `template-custom-${scheme.name}`,
                title: `📁 ${scheme.name} - ${scheme.description}`,
                icon: <FolderOutlined style={{ color: '#722ed1' }} />,
                isLeaf: true,
              });
            }
          }

          templateChildren.push({
            key: 'template-custom-folder',
            title: `📁 custom (${customSchemes.length} schemes)`,
            icon: <FolderOutlined style={{ color: '#1890ff' }} />,
            children: customChildren,
          });
        }

        nodes.push({
          key: 'templates-folder',
          title: `📦 Template Files`,
          icon: <FileTextOutlined style={{ color: '#13c2c2' }} />,
          children: templateChildren,
        });
      }

      return nodes;
    },
    [projectId]
  );

  // 加载工程和文件
  const loadProjectData = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);

      // 注意：不在这里 clear，因为切换文件时也会触发 loadProjectData
      // clear 应该在 useEffect 中检测 projectId 变化时执行

      const [projectRes, filesRes, schemes] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getProjectFiles(projectId),
        projectsApi.getTemplateSchemes(projectId),
      ]);

      if (projectRes.success) {
        setProject(projectRes.data);
      }

      // 保存模板方案列表
      setTemplateSchemes(schemes || []);

      if (filesRes.success) {
        setFiles(filesRes.data);
        const tree = await buildFileTree(filesRes.data, schemes || []);
        setTreeData(tree);
        setExpandedKeys(['sessions-folder', 'templates-folder', 'template-default', 'template-custom-folder']);

        // 优先级：1. 当前选中的文件 2. URL中的fileId 3. 第一个文件
        let targetFile = null;

        // 如果当前有选中的文件，优先重新加载该文件（版本切换场景）
        const currentFileId = selectedFileRef.current?.id;
        if (currentFileId) {
          targetFile = filesRes.data.find((f) => f.id === currentFileId);
        }

        // 如果没有选中文件，检查URL中的fileId
        if (!targetFile && fileId) {
          targetFile = filesRes.data.find((f) => f.id === fileId);
        }

        // 都没有就加载第一个文件
        if (!targetFile && filesRes.data.length > 0) {
          targetFile = filesRes.data[0];
        }

        if (targetFile) {
          loadFile(targetFile);
        }
      }
    } catch (error) {
      console.error('加载工程数据失败:', error);
      message.error('Failed to load project data');
    } finally {
      setLoading(false);
    }
  }, [projectId, fileId, buildFileTree]);

  // 监听 projectId 变化，切换工程时清空历史栈
  useEffect(() => {
    if (projectId) {
      console.log(`[ProjectEditor] 🏠 工程 ID 变化: ${projectId}，清空历史栈`);
      globalHistoryManager.clear();
    }
  }, [projectId]);

  // 加载模板文件内容
  const loadTemplateFile = useCallback(async (templatePath: string) => {
    if (!projectId) return;
    
    try {
      console.log(`[loadTemplateFile] 开始加载模板: ${templatePath}`);
      
      // 解析路径：default/ai_ask_v1.md 或 custom/scheme/ai_ask_v1.md
      const parts = templatePath.split('/');
      const schemeName = parts[0] === 'custom' ? parts[1] : 'default';
      const fileName = parts[parts.length - 1];
      
      // 调用API获取模板文件内容
      const response = await projectsApi.getTemplateContent(projectId, schemeName, fileName);
      
      if (response.success && response.data) {
        // 注意：不清空 selectedFile，保留模板文件对象用于 File Details 显示
        // setSelectedFile(null); // 已删除
        setFileContent(response.data.content);
        setHasUnsavedChanges(false);
        setEditMode('yaml'); // 模板文件只能用YAML模式
        setParsedScript(null);
        setCurrentPhases([]);
        setValidationResult(null);
        
        message.success(`已加载模板: ${fileName}`);
      }
    } catch (error) {
      console.error('[加载模板文件失败]:', error);
      message.error('加载模板文件失败');
    }
  }, [projectId]);

  // 加载文件内容
  const loadFile = useCallback((file: ScriptFile) => {
    setSelectedFile(file);
    setSelectedKeys([file.id]);

    // 切换文件时重置可视化编辑状态（但不清空全局历史栈，支持跨文件 undo/redo）
    setSelectedActionPath(null);
    setSelectedPhasePath(null);
    setSelectedTopicPath(null);
    setEditingType(null);

    // 转换文件内容为YAML字符串
    let content = '';
    if (file.yamlContent) {
      content = file.yamlContent;
    } else if (file.fileContent) {
      try {
        // 如果是对象，转为YAML格式（简化版）
        content = JSON.stringify(file.fileContent, null, 2);
      } catch {
        content = String(file.fileContent);
      }
    }
    setFileContent(content);
    setHasUnsavedChanges(false);

    // 为该文件记录YAML基线（用于后续 syncPhasesToYaml）
    if (file.fileType === 'session') {
      fileYamlBaseRef.current.set(file.id, content || '');
      console.log(`[loadFile] 保存文件 ${file.fileName} 的YAML基线，长度: ${content.length}`);
    }

    // 如果是会谈脚本，尝试解析为可视化结构，并默认进入可视化编辑模式
    if (file.fileType === 'session' && content) {
      parseYamlToScript(content);
      setEditMode('visual'); // 需求1: 会谈脚本默认使用可视化编辑模式

      // 触发点 1: 文件打开时验证
      const result = validationServiceRef.current.validateOnOpen(content);
      setValidationResult(result);
      setShowValidationErrors(true);

      if (!result.valid) {
        console.log(`[Validation] 文件打开验证失败，发现 ${result.errors.length} 个错误`);
      }
    } else {
      setParsedScript(null);
      setCurrentPhases([]);
      setSelectedActionPath(null);
      setEditMode('yaml'); // 非会谈脚本只能用 YAML 模式
      setValidationResult(null); // 清除验证结果
    }
  }, []);

  // 处理树节点选择
  const handleTreeSelect = useCallback(
    (selectedKeys: React.Key[], info: any) => {
      // 更新选中状态
      setSelectedKeys(selectedKeys);
      
      if (info.node.isLeaf) {
        // 处理模板文件选择
        if (info.node.fileType === 'template' && info.node.filePath) {
          const templatePath = info.node.filePath;
          console.log(`[handleTreeSelect] 选择模板文件: ${templatePath}`);
          
          // 创建虚拟文件对象用于File Details显示
          const templateFile = {
            id: `template-${templatePath}`,
            projectId: projectId || '',
            fileName: templatePath.split('/').pop() || templatePath,
            fileType: 'template',
            fileContent: '', // 模板文件内容，待加载
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as unknown as ScriptFile;
          console.log('[handleTreeSelect] 创建模板文件对象:', templateFile);
          console.log('[handleTreeSelect] 调用 setSelectedFile 前，当前 selectedFile:', selectedFile);
          setSelectedFile(templateFile);
          console.log('[handleTreeSelect] 调用 setSelectedFile 后');
          
          // 加载模板文件内容
          loadTemplateFile(templatePath);
          return;
        }
        
        // 处理普通文件选择
        if (info.node.fileId) {
          const file = files.find((f) => f.id === info.node.fileId);
          if (file) {
            if (hasUnsavedChanges) {
              Modal.confirm({
                title: 'Unsaved Changes',
                content: 'The current file has unsaved changes. Discard them?',
                onOk: () => {
                  loadFile(file);
                  navigate(`/projects/${projectId}/files/${file.id}`);
                },
              });
            } else {
              loadFile(file);
              navigate(`/projects/${projectId}/files/${file.id}`);
            }
          }
        }
      }
    },
    [files, hasUnsavedChanges, loadTemplateFile, loadFile, navigate, projectId, selectedFile, setSelectedFile, setSelectedKeys]
  );

  // 处理内容变化
  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setFileContent(e.target.value);
      setHasUnsavedChanges(true);

      // YAML 模式下实时解析（可选，仅在用户停止输入一段时间后）
      if (selectedFile?.fileType === 'session') {
        // 更新该文件的YAML基线（包含metadata的修改）
        fileYamlBaseRef.current.set(selectedFile.id, e.target.value);
        parseYamlToScript(e.target.value);

        // 触发点 2: 内容变更时验证（带防抖）
        validationServiceRef.current.validateOnChange(e.target.value, (result) => {
          setValidationResult(result);
          setShowValidationErrors(true);
          if (!result.valid) {
            console.log(`[Validation] 内容变更验证失败，发现 ${result.errors.length} 个错误`);
          }
        });
      }
    },
    [selectedFile]
  );

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!selectedFile || !projectId) return;

    try {
      // 检测是否是模板文件
      if (selectedFile.id.startsWith('template-')) {
        // 模板文件保存逻辑
        const templatePath = selectedFile.id.replace('template-', '');
        console.log('[handleSave] 保存模板文件:', templatePath);
        
        // 解析路径：default/ai_ask_v1.md 或 custom/test2/ai_ask_v1.md
        const parts = templatePath.split('/');
        const schemeName = parts[0] === 'custom' ? parts[1] : 'default';
        const fileName = parts[parts.length - 1];
        
        // 检查是否是 default 层模板（只读）
        if (parts[0] === 'default') {
          message.warning('系统默认模板不允许修改，请复制到 custom 目录下进行编辑');
          return;
        }
        
        console.log('[handleSave] schemeName:', schemeName, 'fileName:', fileName);
        
        setSaving(true);
        await projectsApi.updateTemplateContent(projectId, schemeName, fileName, fileContent);
        message.success('模板保存成功');
        setHasUnsavedChanges(false);
        return;
      }

      // 触发点 3: 保存前验证（阻塞式）
      if (selectedFile.fileType === 'session') {
        const result = await validationServiceRef.current.validateBeforeSave(fileContent);
        setValidationResult(result);
        setShowValidationErrors(true);

        if (!result.valid) {
          console.log(`[Validation] 保存前验证失败，发现 ${result.errors.length} 个错误`);
          message.error(`验证失败，发现 ${result.errors.length} 个错误，请修复后再保存`);
          return; // 阻止保存
        }
      }

      setSaving(true);
      await projectsApi.updateFile(projectId, selectedFile.id, {
        yamlContent: fileContent,
      });
      message.success('Saved successfully');
      setHasUnsavedChanges(false);

      // 重新加载文件列表
      const filesRes = await projectsApi.getProjectFiles(projectId);
      if (filesRes.success) {
        setFiles(filesRes.data);
        const tree = await buildFileTree(filesRes.data, templateSchemes);
        setTreeData(tree);
        const updatedFile = filesRes.data.find((f) => f.id === selectedFile.id);
        if (updatedFile) {
          setSelectedFile(updatedFile);
        }
      }
    } catch (error) {
      console.error('保存失败:', error);
      message.error('Save failed');
    } finally {
      setSaving(false);
    }
  }, [selectedFile, projectId, fileContent, buildFileTree, templateSchemes]);

  // 发布版本
  const handlePublish = useCallback(async () => {
    if (!projectId || !versionNote.trim()) {
      message.warning('Please enter release notes');
      return;
    }

    try {
      setSaving(true);

      // 获取当前最新版本号
      let newVersion = 'v1.0.0'; // 默认首个版本
      try {
        const versionsRes = await versionsApi.getVersions(projectId);
        if (versionsRes.success && versionsRes.data.length > 0) {
          // 找到最新版本并递增
          const latestVersion = versionsRes.data[0].versionNumber;
          const versionParts = latestVersion.replace(/^v/, '').split('.');
          const newPatch = parseInt(versionParts[2] || '0') + 1;
          newVersion = `v${versionParts[0]}.${versionParts[1]}.${newPatch}`;
        }
      } catch (err) {
        console.warn('Failed to get versions, using default:', err);
      }

      await versionsApi.publishVersion(projectId, {
        versionNumber: newVersion,
        releaseNote: versionNote,
        publishedBy: project?.author || 'unknown',
      });

      message.success(`Version ${newVersion} published successfully`);
      setPublishModalVisible(false);
      setVersionNote('');
      loadProjectData();
    } catch (error) {
      console.error('发布失败:', error);
      message.error('Publish failed');
    } finally {
      setSaving(false);
    }
  }, [projectId, versionNote, project, loadProjectData]);

  // 快捷键保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          handleSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, handleSave]);

  // ========== 上面已定义 parseYamlToScript ==========

  /**
   * 将层级结构同步回 YAML 字符串
   * @param phases - 要同步的 phases 数据
   * @param targetFileId - 目标文件 ID（可选，默认使用当前文件）
   */
  const syncPhasesToYaml = useCallback(
    (phases: PhaseWithTopics[], targetFileId?: string) => {
      console.log('[syncPhasesToYaml] 开始执行');
      console.log('[syncPhasesToYaml] 输入 phases 数量:', phases.length);
      console.log('[syncPhasesToYaml] targetFileId:', targetFileId || '未指定，使用当前文件');

      try {
        // 使用显式传入的 targetFileId，或者使用当前文件 ID
        const currentFileId = targetFileId || selectedFile?.id || selectedFileRef.current?.id;

        // 获取目标文件信息（用于 session_id）
        let targetFile = selectedFile;
        if (targetFileId && targetFileId !== selectedFile?.id) {
          targetFile = files.find((f) => f.id === targetFileId) || selectedFile;
        }

        // 获取基线脚本
        let baseScript: any = null;
        let baseYaml: string | undefined;

        if (currentFileId) {
          baseYaml = fileYamlBaseRef.current.get(currentFileId);
          if (baseYaml) {
            try {
              baseScript = yaml.load(baseYaml) as any;
              console.log('[syncPhasesToYaml] 使用 fileYamlBaseRef 中的基线脚本');
            } catch (e) {
              console.error('[syncPhasesToYaml] 基线YAML解析失败:', e);
            }
          }
        }

        // 优先级: 文件基线 > parsedScript
        if (!baseScript && parsedScript) {
          console.log('[syncPhasesToYaml] 使用现有 parsedScript 作为基线');
          baseScript = parsedScript;
        }

        // 使用 yamlService 同步
        const result = yamlService.syncPhasesToYaml({
          phases,
          baseScript,
          baseYaml,
          targetFile: targetFile || undefined,
        });

        if (result.success) {
          setFileContent(result.yaml);
          setParsedScript(result.script);
          console.log('[syncPhasesToYaml] YAML 同步成功，phases 数量:', phases.length);
        } else {
          console.error('同步到 YAML 失败:', result.error);
          message.error('Sync failed');
        }
      } catch (error) {
        console.error('同步到 YAML 失败:', error);
        message.error('Sync failed');
      }
    },
    [parsedScript, selectedFile, files]
  );

  /**
   * 格式化 YAML 内容
   * 功能：
   * 1. 解析 YAML 并重新格式化
   * 2. 统一缩进为 2 空格
   * 3. 移除多余空行
   * 4. 自动添加标记未保存
   */
  /**
   * 智能修复 YAML 缩进错误
   * 在解析前尝试修复常见的缩进问题
   */
  /**
   * 智能修复 YAML 缩进错误
   * 使用 yamlService 服务
   */
  const fixYAMLIndentation = useCallback((yamlContent: string): string => {
    return yamlService.fixYamlIndentation(yamlContent);
  }, []);

  const handleFormatYAML = useCallback(() => {
    if (!fileContent) {
      message.warning('没有内容可以格式化');
      return;
    }

    try {
      let contentToFormat = fileContent;

      // 第一步：尝试智能修复缩进错误
      try {
        yaml.load(fileContent);
        console.log('[FormatYAML] YAML 语法正确，直接格式化');
      } catch (parseError) {
        console.log('[FormatYAML] YAML 解析失败，尝试智能修复缩进...', parseError);
        contentToFormat = fixYAMLIndentation(fileContent);

        // 验证修复后是否可以解析
        try {
          yaml.load(contentToFormat);
          message.info('检测到缩进错误，已自动修复');
          console.log('[FormatYAML] 缩进修复成功');
        } catch (fixError) {
          console.error('[FormatYAML] 缩进修复失败:', fixError);
          throw new Error(
            `无法自动修复 YAML 语法错误，请手动检查：${fixError instanceof Error ? fixError.message : '未知错误'}`
          );
        }
      }

      // 第二步：解析并重新格式化
      const parsedYaml = yaml.load(contentToFormat);

      const formattedYaml = yaml.dump(parsedYaml, {
        indent: 2, // 使用 2 空格缩进
        lineWidth: 120, // 每行最大 120 字符
        noRefs: true, // 不使用引用
        sortKeys: false, // 保持原有键顺序
        quotingType: '"', // 统一使用双引号
        forceQuotes: false, // 仅在必要时使用引号
      });

      // 更新内容
      setFileContent(formattedYaml);
      setHasUnsavedChanges(true);

      // 重新触发验证
      if (selectedFile?.fileType === 'session') {
        validationServiceRef.current.validateOnChange(formattedYaml, (result) => {
          setValidationResult(result);
          setShowValidationErrors(true);
        });
      }

      message.success('YAML 格式化成功！');
      console.log('[FormatYAML] 格式化完成');
    } catch (error) {
      console.error('[FormatYAML] 格式化失败:', error);
      message.error(`YAML 格式化失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [fileContent, selectedFile, fixYAMLIndentation]);

  /**
   * 推送历史记录（需求4 - 使用全局历史管理器）
   * 修改为接收 before/after 双快照
   */
  const pushHistory = useCallback(
    (
      beforePhases: PhaseWithTopics[],
      afterPhases: PhaseWithTopics[],
      operation: string,
      beforeFocusPath: FocusPath | null = null,
      afterFocusPath: FocusPath | null = null
    ) => {
      if (!selectedFile || globalHistoryManager.isInUndoRedo()) {
        return;
      }

      globalHistoryManager.push({
        fileId: selectedFile.id,
        fileName: selectedFile.fileName,
        beforePhases,
        afterPhases,
        beforeFocusPath,
        afterFocusPath,
        operation,
        timestamp: Date.now(),
      });
    },
    [selectedFile]
  );

  /**
   * 应用焦点导航
   * 注意：不再负责切换文件，只负责设置焦点和展开节点
   */
  const applyFocusNavigation = useCallback(
    (focusPath: FocusPath | null, targetFileId: string) => {
      if (!focusPath) {
        console.log('[FocusNavigation] ⚠️ 无焦点信息，跳过');
        return;
      }

      // 使用 ref 检查文件匹配（不再使用 state）
      const currentFile = selectedFileRef.current;
      console.log(`[FocusNavigation] 🔍 文件匹配检查:`);
      console.log(
        `[FocusNavigation]   当前文件(ref): ${currentFile?.fileName} (id: ${currentFile?.id})`
      );
      console.log(`[FocusNavigation]   目标文件: targetFileId = ${targetFileId}`);
      console.log(`[FocusNavigation]   匹配结果: ${currentFile?.id === targetFileId}`);

      if (currentFile?.id !== targetFileId) {
        console.warn('[FocusNavigation] ⚠️ 当前文件与目标文件不匹配，跳过焦点导航');
        return;
      }

      console.log(`[FocusNavigation] 🎯 应用焦点: type=${focusPath.type}`);

      // 应用焦点
      setTimeout(() => {
        if (
          focusPath.type === 'action' &&
          focusPath.phaseIndex !== undefined &&
          focusPath.topicIndex !== undefined &&
          focusPath.actionIndex !== undefined
        ) {
          console.log(
            `[FocusNavigation] 🎯 设置 Action 焦点: [${focusPath.phaseIndex}, ${focusPath.topicIndex}, ${focusPath.actionIndex}]`
          );
          setSelectedActionPath({
            phaseIndex: focusPath.phaseIndex,
            topicIndex: focusPath.topicIndex,
            actionIndex: focusPath.actionIndex,
          });
          setEditingType('action');
        } else if (
          focusPath.type === 'topic' &&
          focusPath.phaseIndex !== undefined &&
          focusPath.topicIndex !== undefined
        ) {
          console.log(
            `[FocusNavigation] 🎯 设置 Topic 焦点: [${focusPath.phaseIndex}, ${focusPath.topicIndex}]`
          );
          setSelectedTopicPath({
            phaseIndex: focusPath.phaseIndex,
            topicIndex: focusPath.topicIndex,
          });
          setEditingType('topic');
        } else if (focusPath.type === 'phase' && focusPath.phaseIndex !== undefined) {
          console.log(`[FocusNavigation] 🎯 设置 Phase 焦点: [${focusPath.phaseIndex}]`);
          setSelectedPhasePath({
            phaseIndex: focusPath.phaseIndex,
          });
          setEditingType('phase');
        }

        // 调用 ActionNodeList 的展开和滚动方法
        if (actionNodeListRef.current) {
          console.log('[FocusNavigation] 📜 调用 expandAndScrollTo');
          actionNodeListRef.current.expandAndScrollTo(focusPath);
        }
      }, 100);
    },
    [] // 不再依赖 selectedFile，使用 ref
  );

  /**
   * Undo 操作（需求4 - 使用全局历史管理器）
   * 关键修复：使用 entry.beforePhases 恢复到操作前状态
   */
  const handleUndo = useCallback(() => {
    console.log('\n========== [Undo] 开始执行 ==========');
    console.log(`[Undo] 锁状态: ${processingUndoRedoRef.current}`);

    // 防止并发执行
    if (processingUndoRedoRef.current) {
      console.log('[Undo] ❌ 正在处理上一个操作，请稍候');
      return;
    }

    const entry = globalHistoryManager.undo();
    console.log(`[Undo] 历史管理器返回:`, entry);

    if (!entry) {
      console.log('[Undo] ⚠️ 没有可撤销的历史');
      message.info('Already at the earliest state');
      return;
    }

    // 使用 ref 获取最新的 selectedFile
    const currentFile = selectedFileRef.current;
    console.log(`[Undo] 📄 当前文件: ${currentFile?.fileName} (id: ${currentFile?.id})`);
    console.log(`[Undo] 🎯 目标文件: ${entry.fileName} (id: ${entry.fileId})`);
    console.log(`[Undo] 📝 操作描述: ${entry.operation}`);
    console.log(
      `[Undo] 🔍 文件匹配检查: ${currentFile?.id} === ${entry.fileId} ? ${currentFile?.id === entry.fileId}`
    );

    processingUndoRedoRef.current = true;
    console.log('[Undo] 🔒 已加锁');

    // 关键修复：使用 beforePhases 恢复到操作前状态
    const phasesToRestore = entry.beforePhases;
    const focusToRestore = entry.beforeFocusPath;

    console.log(`[Undo] 📊 将恢复到 beforePhases，长度: ${phasesToRestore.length}`);

    // 检查文件是否匹配
    if (currentFile?.id !== entry.fileId) {
      console.log('[Undo] ⚡ 需要跨文件切换');

      const targetFile = files.find((f) => f.id === entry.fileId);
      console.log(`[Undo] 📋 files 数组长度: ${files.length}`);
      console.log(`[Undo] 🔎 查找结果:`, targetFile ? `找到 ${targetFile.fileName}` : '未找到');

      if (targetFile) {
        console.log(`[Undo] ➡️ 切换: ${currentFile?.fileName} -> ${targetFile.fileName}`);

        // 直接更新所有状态
        console.log('[Undo] 📌 开始更新 React 状态...');
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);
        setSelectedActionPath(null);
        setSelectedPhasePath(null);
        setSelectedTopicPath(null);
        setEditingType(null);
        console.log('[Undo] ✅ React 状态更新调用完成（等待批量更新）');

        // 等待 React 批量更新完成
        setTimeout(() => {
          console.log(`\n[Undo-Timeout] ⏰ 延迟回调触发`);
          console.log(
            `[Undo-Timeout] 📄 selectedFileRef.current: ${selectedFileRef.current?.fileName}`
          );
          console.log(`[Undo-Timeout] 🎯 targetFile: ${targetFile.fileName}`);
          console.log(`[Undo-Timeout] 📊 beforePhases 长度: ${phasesToRestore.length}`);

          // 直接恢复历史数据
          console.log('[Undo-Timeout] 💾 开始恢复历史数据...');
          setCurrentPhases(phasesToRestore);
          // 关键修复：跨文件时传入 targetFile.id
          syncPhasesToYaml(phasesToRestore, targetFile.id);
          setHasUnsavedChanges(true);
          setEditMode('visual');
          console.log('[Undo-Timeout] ✅ 数据恢复完成');

          // 应用焦点导航
          console.log('[Undo-Timeout] 🎯 应用焦点导航...');
          applyFocusNavigation(focusToRestore, entry.fileId);

          message.success(`Undone: ${entry.operation} (${targetFile.fileName})`);

          // 释放锁
          processingUndoRedoRef.current = false;
          console.log('[Undo-Timeout] 🔓 释放锁');
          console.log('========== [Undo] 跨文件操作完成 ==========\n');
        }, 350);
      } else {
        console.error(`[Undo] ❌ 无法找到目标文件！`);
        console.error(`[Undo] 目标 fileId: ${entry.fileId}`);
        console.error(
          `[Undo] 当前 files:`,
          files.map((f) => ({ id: f.id, name: f.fileName }))
        );
        message.error('Target file not found');
        processingUndoRedoRef.current = false;
        globalHistoryManager.resetUndoRedoFlag();
        console.log('========== [Undo] 失败结束 ==========\n');
        return;
      }
    } else {
      // 同一文件，直接恢复数据
      console.log('[Undo] ✨ 同文件操作，直接恢复');
      console.log(`[Undo] 📊 beforePhases 长度: ${phasesToRestore.length}`);

      // 计算 beforePhases 中的 Action 总数
      const totalActions = phasesToRestore.reduce((sum: number, phase: PhaseWithTopics) => {
        return (
          sum +
          phase.topics.reduce(
            (topicSum: number, topic: TopicWithActions) => topicSum + topic.actions.length,
            0
          )
        );
      }, 0);
      console.log(`[Undo] 🎯 beforePhases 中的 Action 总数: ${totalActions}`);

      // 输出详细结构
      phasesToRestore.forEach((phase: PhaseWithTopics, pi: number) => {
        phase.topics.forEach((topic: TopicWithActions, ti: number) => {
          console.log(`[Undo]   Phase[${pi}].Topic[${ti}]: ${topic.actions.length} Actions`);
        });
      });

      setCurrentPhases(phasesToRestore);
      console.log('[Undo] ✅ setCurrentPhases 调用完成');

      syncPhasesToYaml(phasesToRestore);
      console.log('[Undo] ✅ syncPhasesToYaml 调用完成');

      setHasUnsavedChanges(true);

      // 应用焦点导航
      applyFocusNavigation(focusToRestore, entry.fileId);

      message.success(`Undone: ${entry.operation}`);

      // 释放锁
      processingUndoRedoRef.current = false;
      console.log('[Undo] 🔓 释放锁');
      console.log('========== [Undo] 同文件操作完成 ==========\n');
    }

    // 重置标记
    setTimeout(() => globalHistoryManager.resetUndoRedoFlag(), 100);
  }, [files, syncPhasesToYaml, applyFocusNavigation]);

  /**
   * Redo 操作（需求4 - 使用全局历史管理器）
   * 关键修复：使用 entry.afterPhases 恢复到操作后状态
   */
  const handleRedo = useCallback(() => {
    // 防止并发执行
    if (processingUndoRedoRef.current) {
      console.log('[Redo] 正在处理上一个操作，请稍候');
      return;
    }

    const entry = globalHistoryManager.redo();
    if (!entry) {
      message.info('Already at the latest state');
      return;
    }

    // 使用 ref 获取最新的 selectedFile
    const currentFile = selectedFileRef.current;
    console.log(`[Redo] 当前文件: ${currentFile?.fileName}, 目标文件ID: ${entry.fileId}`);

    processingUndoRedoRef.current = true;

    // 关键修复：使用 afterPhases 恢复到操作后状态
    const phasesToRestore = entry.afterPhases;
    const focusToRestore = entry.afterFocusPath;

    // 检查文件是否匹配
    if (currentFile?.id !== entry.fileId) {
      const targetFile = files.find((f) => f.id === entry.fileId);
      if (targetFile) {
        console.log(`[Redo] 需要切换文件: ${currentFile?.fileName} -> ${targetFile.fileName}`);

        // 直接更新所有状态
        setSelectedFile(targetFile);
        setSelectedKeys([targetFile.id]);
        setSelectedActionPath(null);
        setSelectedPhasePath(null);
        setSelectedTopicPath(null);
        setEditingType(null);

        // 等待 React 批量更新完成
        setTimeout(() => {
          console.log(`[Redo] 开始恢复数据到: ${targetFile.fileName}`);
          console.log(`[Redo] afterPhases 长度: ${phasesToRestore.length}`);

          // 直接恢复历史数据
          setCurrentPhases(phasesToRestore);
          // 关键修复：跨文件时传入 targetFile.id
          syncPhasesToYaml(phasesToRestore, targetFile.id);
          setHasUnsavedChanges(true);
          setEditMode('visual');

          // 应用焦点导航
          applyFocusNavigation(focusToRestore, entry.fileId);

          message.success(`Redone: ${entry.operation} (${targetFile.fileName})`);

          // 释放锁
          processingUndoRedoRef.current = false;
          console.log('[Redo] 操作完成，释放锁');
        }, 350);
      } else {
        console.error(`[Redo] 无法找到目标文件，fileId: ${entry.fileId}`);
        message.error('Target file not found');
        processingUndoRedoRef.current = false;
        globalHistoryManager.resetUndoRedoFlag();
        return;
      }
    } else {
      // 同一文件，直接恢复数据
      console.log(`[Redo] 同文件恢复: ${currentFile?.fileName}`);
      setCurrentPhases(phasesToRestore);
      syncPhasesToYaml(phasesToRestore);
      setHasUnsavedChanges(true);

      // 应用焦点导航
      applyFocusNavigation(focusToRestore, entry.fileId);

      message.success(`Redone: ${entry.operation}`);

      // 释放锁
      processingUndoRedoRef.current = false;
      console.log('[Redo] 同文件操作完成');
    }

    // 重置标记
    setTimeout(() => globalHistoryManager.resetUndoRedoFlag(), 100);
  }, [selectedFile, files, syncPhasesToYaml, applyFocusNavigation]);

  /**
   * 保存 Action 修改
   */
  const handleActionSave = useCallback(
    (updatedAction: Action) => {
      if (selectedActionPath === null) return;

      const { phaseIndex, topicIndex, actionIndex } = selectedActionPath;

      // 保存 before 状态
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const beforeFocus: FocusPath = {
        phaseIndex,
        topicIndex,
        actionIndex,
        type: 'action',
      };

      // 更新层级结构
      const afterPhases = JSON.parse(JSON.stringify(currentPhases)); // 深拷贝
      afterPhases[phaseIndex].topics[topicIndex].actions[actionIndex] = updatedAction;
      setCurrentPhases(afterPhases);

      const afterFocus: FocusPath = {
        phaseIndex,
        topicIndex,
        actionIndex,
        type: 'action',
      };

      // 推送历史记录，带上操作描述和焦点信息
      pushHistory(beforePhases, afterPhases, '修改 Action', beforeFocus, afterFocus);

      // 同步回 YAML
      syncPhasesToYaml(afterPhases);
      setHasUnsavedChanges(true);
      message.success('Action updated');
    },
    [selectedActionPath, currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 添加新 Phase
   */
  const handleAddPhase = useCallback(() => {
    console.log('[handleAddPhase] 开始添加新 Phase');
    console.log('[handleAddPhase] 当前 currentPhases 数量:', currentPhases.length);
    console.log('[handleAddPhase] parsedScript:', parsedScript ? '存在' : '为null');

    const beforePhases = JSON.parse(JSON.stringify(currentPhases));
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const newPhaseIndex = newPhases.length;

    newPhases.push({
      phase_id: `phase_${newPhaseIndex + 1}`,
      phase_name: `New Phase ${newPhaseIndex + 1}`,
      topics: [
        {
          topic_id: `topic_1`,
          topic_name: 'New Topic 1',
          actions: [
            {
              type: 'ai_say',
              ai_say: 'Please edit this content',
              action_id: `action_1`,
              _raw: {
                action_id: `action_1`,
                action_type: 'ai_say',
                config: {
                  content_template: 'Please edit this content',
                },
              },
            },
          ],
        },
      ],
    });

    console.log('[handleAddPhase] 新 newPhases 数量:', newPhases.length);
    setCurrentPhases(newPhases);
    pushHistory(beforePhases, newPhases, 'Add Phase', null, {
      phaseIndex: newPhaseIndex,
      type: 'phase',
    });
    console.log('[handleAddPhase] 调用 syncPhasesToYaml...');
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('New Phase added');
    console.log('[handleAddPhase] 完成');
  }, [currentPhases, syncPhasesToYaml, pushHistory, parsedScript]);

  /**
   * 添加新 Topic
   */
  const handleAddTopic = useCallback(
    (phaseIndex: number) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const phase = newPhases[phaseIndex];
      const newTopicIndex = phase.topics.length;

      phase.topics.push({
        topic_id: `topic_${newTopicIndex + 1}`,
        topic_name: `New Topic ${newTopicIndex + 1}`,
        actions: [
          {
            type: 'ai_say',
            ai_say: 'Please edit this content',
            action_id: `action_1`,
            _raw: {
              action_id: `action_1`,
              action_type: 'ai_say',
              config: {
                content_template: 'Please edit this content',
              },
            },
          },
        ],
      });

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Add Topic', null, {
        phaseIndex,
        topicIndex: newTopicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('New Topic added');
    },
    [currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 根据类型创建 Action 初始结构
   */
  const createActionByType = useCallback((actionType: string, actionIndex: number): Action => {
    const baseActionId = `action_${actionIndex}`;

    switch (actionType) {
      case 'ai_say':
        return {
          type: 'ai_say',
          ai_say: '请编辑此处内容',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_say',
            config: {
              content_template: '请编辑此处内容',
            },
          },
        };

      case 'ai_ask':
        return {
          type: 'ai_ask',
          ai_ask: 'Please enter a question',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_ask',
            config: {
              question_template: 'Please enter a question',
              output: [],
            },
          },
        };

      case 'ai_think':
        return {
          type: 'ai_think',
          think: 'Please enter the thinking topic',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_think',
            config: {
              think_target: 'Please enter the thinking topic',
              output: [],
            },
          },
        };

      case 'use_skill':
        return {
          type: 'use_skill',
          skill: 'Skill name',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'use_skill',
            config: {
              skill_name: 'Skill name',
            },
          },
        };

      case 'show_form':
        return {
          type: 'show_form',
          form_id: '',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'show_form',
            config: {
              form_id: '',
            },
          },
        };

      case 'show_pic':
        return {
          type: 'show_pic',
          pic_url: '',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'show_pic',
            config: {
              pic_url: '',
            },
          },
        };

      default:
        // 默认返回 ai_say 类型
        return {
          type: 'ai_say',
          ai_say: '请编辑此处内容',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_say',
            config: {
              content_template: '请编辑此处内容',
            },
          },
        };
    }
  }, []);

  /**
   * 添加新 Action
   */
  const handleAddAction = useCallback(
    (phaseIndex: number, topicIndex: number, actionType: string) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const topic = newPhases[phaseIndex].topics[topicIndex];
      const newActionIndex = topic.actions.length;

      const newAction = createActionByType(actionType, newActionIndex + 1);
      topic.actions.push(newAction);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `添加 ${actionType} Action`, null, {
        phaseIndex,
        topicIndex,
        actionIndex: newActionIndex,
        type: 'action',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success(`New ${actionType} Action added`);
    },
    [currentPhases, syncPhasesToYaml, createActionByType, pushHistory]
  );

  /**
   * 删除 Phase
   */
  const handleDeletePhase = useCallback(
    (phaseIndex: number) => {
      // 使用函数式更新，确保基于最新的 state
      setCurrentPhases((prevPhases) => {
        // 关键修复：先保存删除前的状态
        const beforePhases = JSON.parse(JSON.stringify(prevPhases));

        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        newPhases.splice(phaseIndex, 1);

        // 推送历史：before = 删除前，after = 删除后
        pushHistory(beforePhases, newPhases, 'Delete Phase', null, null);

        // 如果删除的是当前选中的 phase，清空选中状态
        if (selectedActionPath?.phaseIndex === phaseIndex) {
          setSelectedActionPath(null);
        } else if (selectedActionPath && selectedActionPath.phaseIndex > phaseIndex) {
          // 如果选中的 phase 在被删除的后面，需要调整索引
          setSelectedActionPath({
            ...selectedActionPath,
            phaseIndex: selectedActionPath.phaseIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Phase deleted');

        return newPhases;
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory]
  );

  /**
   * 删除 Topic
   */
  const handleDeleteTopic = useCallback(
    (phaseIndex: number, topicIndex: number) => {
      // 使用函数式更新，确保基于最新的 state
      setCurrentPhases((prevPhases) => {
        // 关键修复：先保存删除前的状态
        const beforePhases = JSON.parse(JSON.stringify(prevPhases));

        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        newPhases[phaseIndex].topics.splice(topicIndex, 1);

        // 推送历史
        pushHistory(beforePhases, newPhases, 'Delete Topic', null, null);

        // 如果删除的是当前选中的 topic，清空选中状态
        if (
          selectedActionPath?.phaseIndex === phaseIndex &&
          selectedActionPath?.topicIndex === topicIndex
        ) {
          setSelectedActionPath(null);
        } else if (
          selectedActionPath &&
          selectedActionPath.phaseIndex === phaseIndex &&
          selectedActionPath.topicIndex > topicIndex
        ) {
          // 如果选中的 topic 在被删除的后面，需要调整索引
          setSelectedActionPath({
            ...selectedActionPath,
            topicIndex: selectedActionPath.topicIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Topic deleted');

        return newPhases;
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory]
  );

  /**
   * 删除 Action
   */
  const handleDeleteAction = useCallback(
    (phaseIndex: number, topicIndex: number, actionIndex: number) => {
      // 使用函数式更新，确保基于最新的 state
      setCurrentPhases((prevPhases) => {
        const newPhases = JSON.parse(JSON.stringify(prevPhases));
        const topic = newPhases[phaseIndex].topics[topicIndex];

        // 至少保留一个 action
        if (topic.actions.length <= 1) {
          message.warning('At least one Action is required');
          return prevPhases; // 返回原状态，不更新
        }

        // 关键修复：在删除前保存当前状态
        const beforePhases = JSON.parse(JSON.stringify(prevPhases));

        topic.actions.splice(actionIndex, 1);

        // 推送历史
        pushHistory(beforePhases, newPhases, 'Delete Action', null, null);

        // 如果删除的是当前选中的 action，清空选中状态
        if (
          selectedActionPath?.phaseIndex === phaseIndex &&
          selectedActionPath?.topicIndex === topicIndex &&
          selectedActionPath?.actionIndex === actionIndex
        ) {
          setSelectedActionPath(null);
        } else if (
          selectedActionPath &&
          selectedActionPath.phaseIndex === phaseIndex &&
          selectedActionPath.topicIndex === topicIndex &&
          selectedActionPath.actionIndex > actionIndex
        ) {
          // 如果选中的 action 在被删除的后面，需要调整索引
          setSelectedActionPath({
            ...selectedActionPath,
            actionIndex: selectedActionPath.actionIndex - 1,
          });
        }

        syncPhasesToYaml(newPhases);
        setHasUnsavedChanges(true);
        message.success('Action deleted');

        return newPhases; // 返回新状态
      });
    },
    [selectedActionPath, syncPhasesToYaml, pushHistory]
  );

  /**
   * 移动 Phase
   */
  const handleMovePhase = useCallback(
    (fromIndex: number, toIndex: number) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));
      const [movedPhase] = newPhases.splice(fromIndex, 1);
      newPhases.splice(toIndex, 0, movedPhase);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Phase from ${fromIndex} to ${toIndex}`, null, {
        phaseIndex: toIndex,
        type: 'phase',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Phase moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 移动 Topic（支持跨 Phase）
   */
  const handleMoveTopic = useCallback(
    (
      fromPhaseIndex: number,
      fromTopicIndex: number,
      toPhaseIndex: number,
      toTopicIndex: number
    ) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      // 从源位置移除 topic
      const [movedTopic] = newPhases[fromPhaseIndex].topics.splice(fromTopicIndex, 1);

      // 插入到目标位置
      newPhases[toPhaseIndex].topics.splice(toTopicIndex, 0, movedTopic);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Topic`, null, {
        phaseIndex: toPhaseIndex,
        topicIndex: toTopicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Topic moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 移动 Action（支持跨 Topic 和 Phase）
   */
  const handleMoveAction = useCallback(
    (
      fromPhaseIndex: number,
      fromTopicIndex: number,
      fromActionIndex: number,
      toPhaseIndex: number,
      toTopicIndex: number,
      toActionIndex: number
    ) => {
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      // 从源位置移除 action
      const [movedAction] = newPhases[fromPhaseIndex].topics[fromTopicIndex].actions.splice(
        fromActionIndex,
        1
      );

      // 插入到目标位置
      newPhases[toPhaseIndex].topics[toTopicIndex].actions.splice(toActionIndex, 0, movedAction);

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, `Move Action`, null, {
        phaseIndex: toPhaseIndex,
        topicIndex: toTopicIndex,
        actionIndex: toActionIndex,
        type: 'action',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Action moved');
    },
    [currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 处理选中 Phase
   */
  const handleSelectPhase = useCallback((path: { phaseIndex: number }) => {
    setSelectedPhasePath(path);
    setSelectedTopicPath(null);
    setSelectedActionPath(null);
    setEditingType('phase');
  }, []);

  /**
   * 处理选中 Topic
   */
  const handleSelectTopic = useCallback((path: { phaseIndex: number; topicIndex: number }) => {
    setSelectedPhasePath(null);
    setSelectedTopicPath(path);
    setSelectedActionPath(null);
    setEditingType('topic');
  }, []);

  /**
   * 处理选中 Action
   */
  const handleSelectAction = useCallback(
    (path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => {
      setSelectedPhasePath(null);
      setSelectedTopicPath(null);
      setSelectedActionPath(path);
      setEditingType('action');
    },
    []
  );

  /**
   * 保存 Phase 修改
   */
  const handlePhaseSave = useCallback(
    (updatedPhaseData: any) => {
      if (selectedPhasePath === null) return;

      const { phaseIndex } = selectedPhasePath;
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      newPhases[phaseIndex] = {
        ...newPhases[phaseIndex],
        phase_id: updatedPhaseData.id,
        phase_name: updatedPhaseData.name,
        description: updatedPhaseData.description,
      };

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Update Phase', null, {
        phaseIndex,
        type: 'phase',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Phase updated');
    },
    [selectedPhasePath, currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 保存 Topic 修改
   */
  const handleTopicSave = useCallback(
    (updatedTopicData: any) => {
      if (selectedTopicPath === null) return;

      const { phaseIndex, topicIndex } = selectedTopicPath;
      const beforePhases = JSON.parse(JSON.stringify(currentPhases));
      const newPhases = JSON.parse(JSON.stringify(currentPhases));

      newPhases[phaseIndex].topics[topicIndex] = {
        ...newPhases[phaseIndex].topics[topicIndex],
        topic_id: updatedTopicData.id,
        topic_name: updatedTopicData.name,
        description: updatedTopicData.description,
        localVariables: updatedTopicData.localVariables,
      };

      setCurrentPhases(newPhases);
      pushHistory(beforePhases, newPhases, 'Update Topic', null, {
        phaseIndex,
        topicIndex,
        type: 'topic',
      });
      syncPhasesToYaml(newPhases);
      setHasUnsavedChanges(true);
      message.success('Topic updated');
    },
    [selectedTopicPath, currentPhases, syncPhasesToYaml, pushHistory]
  );

  /**
   * 保存 Session 配置修改
   */
  const handleSessionSave = useCallback(
    (updatedSessionData: SessionData) => {
      console.log('[handleSessionSave] 保存 Session 配置:', updatedSessionData);

      try {
        // 获取当前脚本的深拷贝
        const updatedScript = JSON.parse(JSON.stringify(parsedScript));

        // 更新session信息
        if (!updatedScript.session) {
          updatedScript.session = {};
        }

        // 按顺序重建session对象，确保字段顺序
        const orderedSession: any = {
          session_id: updatedScript.session.session_id,
          session_name: updatedSessionData.name,
        };
        
        if (updatedSessionData.description) {
          orderedSession.description = updatedSessionData.description;
        }
        if (updatedSessionData.version) {
          orderedSession.version = updatedSessionData.version;
        }
        if (updatedSessionData.template_scheme) {
          orderedSession.template_scheme = updatedSessionData.template_scheme;
        }
        
        orderedSession.phases = updatedScript.session.phases;
        updatedScript.session = orderedSession;

        // 转换为YAML
        const updatedYaml = yaml.dump(updatedScript, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
          sortKeys: false,
        });

        // 更新状态
        setFileContent(updatedYaml);
        setParsedScript(updatedScript);
        setHasUnsavedChanges(true);

        console.log('[handleSessionSave] Session 配置已更新');
      } catch (error) {
        console.error('[handleSessionSave] 保存失败:', error);
        message.error('Session 配置保存失败');
      }
    },
    [parsedScript]
  );

  /**
   * 切换到 Session 配置编辑模式
   */
  const handleEditSessionConfig = useCallback(() => {
    console.log('[handleEditSessionConfig] 打开 Session 配置面板');
    setEditingType('session');
    setSelectedActionPath(null);
    setSelectedPhasePath(null);
    setSelectedTopicPath(null);
  }, []);

  /**
   * 打开模板方案管理器
   */
  const handleManageSchemes = useCallback(() => {
    setTemplateManagerVisible(true);
  }, []);

  /**
   * 查看模板方案详情（打开模板编辑器）
   */
  const handleViewSchemeDetails = useCallback((schemeName: string) => {
    setEditingTemplate({
      schemeName,
      templatePath: 'ai_ask_v1',  // 默认打开 ai_ask_v1 模板
    });
    setTemplateEditorVisible(true);
  }, []);

  /**
   * 模板方案列表变化回调（重新加载方案列表和文件树）
   */
  const handleSchemeChange = useCallback(async () => {
    if (!projectId) return;
    try {
      const schemes = await projectsApi.getTemplateSchemes(projectId);
      setTemplateSchemes(schemes);
      // 重新加载文件列表（包含模板文件）
      const filesRes = await projectsApi.getProjectFiles(projectId);
      if (filesRes.success) {
        setFiles(filesRes.data);
      }
      // 重新构建文件树（包含模板文件）
      const tree = await buildFileTree(filesRes.success ? filesRes.data : files, schemes);
      setTreeData(tree);
    } catch (error) {
      console.error('重新加载模板方案列表失败:', error);
    }
  }, [projectId, files, buildFileTree]);

  /**
   * 模板编辑器保存回调
   */
  const handleTemplateSaved = useCallback(() => {
    message.success('模板已更新');
    // 可以选择重新加载相关数据
  }, []);

  /**
   * 新增会谈脚本（需求2）
   */
  const handleCreateSession = useCallback(async () => {
    if (!projectId) return;

    Modal.confirm({
      title: 'Create Session Script',
      content: (
        <div>
          <div style={{ marginBottom: '8px' }}>Please enter the session script name:</div>
          <Input id="session-name-input" placeholder="e.g. first-day" defaultValue="new-session" />
        </div>
      ),
      onOk: async () => {
        const input = document.getElementById('session-name-input') as HTMLInputElement;
        const sessionName = input?.value?.trim() || 'new-session';
        const fileName = sessionName.endsWith('.yaml') ? sessionName : `${sessionName}.yaml`;

        try {
          setSaving(true);

          // 创建新的 session 文件，使用默认模板
          const defaultSessionContent = {
            session: {
              session_id: sessionName,
              session_name: sessionName,
              phases: [
                {
                  phase_id: 'phase_1',
                  phase_name: 'New Phase 1',
                  topics: [
                    {
                      topic_id: 'topic_1',
                      topic_name: 'New Topic 1',
                      actions: [
                        {
                          action_id: 'action_1',
                          action_type: 'ai_say',
                          config: {
                            content_template: 'Please edit this content',
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          };

          const res = await projectsApi.createFile(projectId, {
            fileType: 'session',
            fileName,
            fileContent: defaultSessionContent,
          });

          if (res.success) {
            message.success('Session script created successfully');
            // 重新加载文件列表
            await loadProjectData();
            // 自动加载新创建的文件
            loadFile(res.data);
            navigate(`/projects/${projectId}/files/${res.data.id}`);
          }
        } catch (error) {
          console.error('创建会谈脚本失败:', error);
          message.error('Creation failed');
        } finally {
          setSaving(false);
        }
      },
    });
  }, [projectId, loadProjectData, loadFile, navigate]);

  // 初始加载
  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  // 自动保存（需求3）：监听 currentPhases 变化，1秒后自动保存
  useEffect(() => {
    // 只在可视化编辑模式且有未保存变化时才自动保存
    if (
      editMode !== 'visual' ||
      !hasUnsavedChanges ||
      !selectedFile ||
      selectedFile.fileType !== 'session'
    ) {
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

  // Undo/Redo 快捷键（需求4）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y: Redo
      else if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="Loading..." />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className="project-editor">
      {/* 顶部导航栏 */}
      <ProjectEditorHeader
        project={project}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={saving}
        versionPanelVisible={versionPanelVisible}
        files={files}
        onBack={() => navigate('/projects')}
        onSave={handleSave}
        onPublish={() => setPublishModalVisible(true)}
        onDebug={() => setDebugConfigVisible(true)}
        onVersionToggle={() => setVersionPanelVisible(!versionPanelVisible)}
      />

      <Layout style={{ height: 'calc(100vh - 64px)' }}>
        {/* 左侧文件树 */}
        <FileTreeSidebar
          selectedFile={selectedFile}
          collapsed={leftCollapsed}
          treeData={treeData}
          expandedKeys={expandedKeys}
          selectedKeys={selectedKeys}
          onCollapse={setLeftCollapsed}
          onTreeSelect={handleTreeSelect}
          onTreeExpand={setExpandedKeys}  // 新增：传递展开/收起回调
          onCreateSession={handleCreateSession}
          onFormatYaml={handleFormatYAML}
          onValidate={() => {
            if (selectedFile?.fileType === 'session' && fileContent) {
              const result = validationServiceRef.current.validateManual(fileContent);
              setValidationResult(result);
              setShowValidationErrors(true);
              if (result.valid) {
                message.success('验证通过，没有发现错误');
              } else {
                message.error(`验证失败，发现 ${result.errors.length} 个错误`);
              }
            } else {
              message.info('请选择一个会谈脚本文件');
            }
          }}
          onVersionHistoryClick={() => setVersionPanelVisible(true)}
        />

        {/* 中间编辑区 */}
        <EditorContent
          projectId={projectId || ''}
          editMode={editMode}
          selectedFile={selectedFile}
          fileContent={fileContent}
          currentPhases={currentPhases}
          parsedScript={parsedScript}
          validationResult={validationResult}
          showValidationErrors={showValidationErrors}
          selectedActionPath={selectedActionPath}
          selectedPhasePath={selectedPhasePath}
          selectedTopicPath={selectedTopicPath}
          editingType={editingType}
          actionNodeListRef={actionNodeListRef}
          onContentChange={handleContentChange}
          onModeChange={setEditMode}
          onCloseValidationErrors={() => setShowValidationErrors(false)}
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
          onActionSave={handleActionSave}
          onPhaseSave={handlePhaseSave}
          onTopicSave={handleTopicSave}
          onSessionSave={handleSessionSave}
          onEditSessionConfig={handleEditSessionConfig}
          parseYamlToScript={parseYamlToScript}
          onManageSchemes={handleManageSchemes}
          onViewSchemeDetails={handleViewSchemeDetails}
        />
      </Layout>

      {/* 发布版本对话框 */}
      <Modal
        title="Publish New Version"
        open={publishModalVisible}
        onOk={handlePublish}
        onCancel={() => {
          setPublishModalVisible(false);
          setVersionNote('');
        }}
        okText="Confirm Publish"
        cancelText="Cancel"
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary">Current project:</Text>
            <div>
              <Text strong>{project?.projectName}</Text>
            </div>
          </div>
          <div>
            <Text type="secondary">Release Notes (required)</Text>
            <TextArea
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="Describe the main changes in this release..."
              rows={4}
            />
          </div>
        </Space>
      </Modal>

      {/* 调试配置弹窗 */}
      <DebugConfigModal
        visible={debugConfigVisible}
        currentProject={project}
        sessionFiles={files.filter((f) => f.fileType === 'session')}
        onStart={(sessionId, aiMessage, debugInfo, debugTargetInfo) => {
          setDebugSessionId(sessionId);
          setDebugInitialMessage(aiMessage);
          setDebugInitialDebugInfo(debugInfo);
          setDebugTarget(debugTargetInfo || null);
          setDebugConfigVisible(false);
          setDebugPanelVisible(true);
        }}
        onCancel={() => setDebugConfigVisible(false)}
      />

      {/* 调试对话面板 */}
      <DebugChatPanel
        visible={debugPanelVisible}
        sessionId={debugSessionId}
        initialMessage={debugInitialMessage}
        initialDebugInfo={debugInitialDebugInfo}
        debugTarget={debugTarget}
        onClose={() => {
          setDebugPanelVisible(false);
          setDebugSessionId(null);
          setDebugInitialMessage('');
          setDebugInitialDebugInfo(null);
          setDebugTarget(null);
        }}
      />

      {/* 版本管理面板 */}
      {versionPanelVisible && projectId && (
        <div
          style={{
            position: 'fixed',
            right: 0,
            top: '64px',
            bottom: 0,
            width: '400px',
            background: '#fff',
            boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Title level={5} style={{ margin: 0 }}>
              <HistoryOutlined /> 版本管理
            </Title>
            <Button
              type="text"
              icon={<RightOutlined />}
              onClick={() => setVersionPanelVisible(false)}
            />
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <VersionListPanel
              projectId={projectId}
              currentVersionId={project?.currentVersionId}
              onVersionChange={loadProjectData}
            />
          </div>
        </div>
      )}

      {/* 模板方案管理器 */}
      {templateManagerVisible && projectId && (
        <TemplateSchemeManager
          visible={templateManagerVisible}
          projectId={projectId}
          onClose={() => setTemplateManagerVisible(false)}
          onSchemeChange={handleSchemeChange}
        />
      )}

      {/* 模板编辑器 */}
      {templateEditorVisible && editingTemplate && projectId && (
        <TemplateEditor
          visible={templateEditorVisible}
          projectId={projectId}
          schemeName={editingTemplate.schemeName}
          templatePath={editingTemplate.templatePath}
          requiredSystemVars={['who', 'chat']}
          requiredScriptVars={['topic']}
          onClose={() => {
            setTemplateEditorVisible(false);
            setEditingTemplate(null);
          }}
          onSaved={handleTemplateSaved}
        />
      )}
    </Layout>
  );
};

export default ProjectEditor;
