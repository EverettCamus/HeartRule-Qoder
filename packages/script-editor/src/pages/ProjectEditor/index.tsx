import {
  FolderOutlined,
  FileOutlined,
  SaveOutlined,
  RocketOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  FileTextOutlined,
  GlobalOutlined,
  UserOutlined,
  ThunderboltOutlined,
  FormOutlined,
  BulbOutlined,
  HistoryOutlined,
  CodeOutlined,
  AppstoreOutlined,
  LeftOutlined,
  RightOutlined,
  BugOutlined,
} from '@ant-design/icons';
import {
  Layout,
  Typography,
  Tree,
  Button,
  Space,
  message,
  Modal,
  Input,
  Spin,
  Tag,
  Divider,
  Dropdown,
  Menu,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import yaml from 'js-yaml';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { projectsApi, versionsApi } from '../../api/projects';
import type { Project, ScriptFile } from '../../api/projects';
import { ActionNodeList } from '../../components/ActionNodeList';
import type { ActionNodeListRef } from '../../components/ActionNodeList';
import { ActionPropertyPanel } from '../../components/ActionPropertyPanel';
import DebugChatPanel from '../../components/DebugChatPanel';
import DebugConfigModal from '../../components/DebugConfigModal';
import { PhaseTopicPropertyPanel } from '../../components/PhaseTopicPropertyPanel';
import VersionListPanel from '../../components/VersionListPanel';
import type { Action, SessionScript, Step } from '../../types/action';
import { globalHistoryManager } from '../../utils/history-manager';
import type { FocusPath } from '../../utils/history-manager';
import './style.css';

const { Header, Sider, Content } = Layout;
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

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ScriptFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ScriptFile | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [treeData, setTreeData] = useState<FileTreeNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [versionNote, setVersionNote] = useState('');
  const [leftCollapsed, setLeftCollapsed] = useState(false); // 左侧文件树折叠状态

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

  // 版本管理面板状态
  const [versionPanelVisible, setVersionPanelVisible] = useState(false);

  // 可视化编辑相关状态
  const [editMode, setEditMode] = useState<'yaml' | 'visual'>('yaml'); // 编辑模式：YAML/可视化
  const [parsedScript, setParsedScript] = useState<SessionScript | null>(null); // 解析后的脚本

  // 层级结构数据和选中路径
  interface TopicWithActions {
    topic_id: string;
    topic_name?: string;
    description?: string;
    localVariables?: Array<{ name: string; type?: string; description?: string }>;
    actions: Action[];
  }

  interface PhaseWithTopics {
    phase_id: string;
    phase_name?: string;
    description?: string;
    topics: TopicWithActions[];
  }

  const [currentPhases, setCurrentPhases] = useState<PhaseWithTopics[]>([]); // 层级结构数据
  const [selectedActionPath, setSelectedActionPath] = useState<{
    phaseIndex: number;
    topicIndex: number;
    actionIndex: number;
  } | null>(null); // 选中的 Action 路径
  const [selectedPhasePath, setSelectedPhasePath] = useState<{ phaseIndex: number } | null>(null); // 选中的 Phase 路径
  const [selectedTopicPath, setSelectedTopicPath] = useState<{
    phaseIndex: number;
    topicIndex: number;
  } | null>(null); // 选中的 Topic 路径
  const [editingType, setEditingType] = useState<'phase' | 'topic' | 'action' | null>(null); // 当前编辑的类型

  // Undo/Redo 历史栈（已废弃，使用全局 globalHistoryManager）
  // const [history, setHistory] = useState<PhaseWithTopics[][]>([]);
  // const [historyIndex, setHistoryIndex] = useState(-1);
  // const [isUndoRedoAction, setIsUndoRedoAction] = useState(false);

  // 自动保存的 debounce timer
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // ActionNodeList 组件引用，用于控制展开和滚动
  const actionNodeListRef = useRef<ActionNodeListRef>(null);
  
  // 正在处理的 undo/redo 操作（防止并发）
  const processingUndoRedoRef = useRef<boolean>(false);
  
  // 使用 ref 追踪当前选中的文件（避免闭包问题）
  const selectedFileRef = useRef<ScriptFile | null>(null);
  
  // 追踪是否已经为当前文件推入过初始状态
  const initialStatePushedRef = useRef<Set<string>>(new Set());
  
  // 为每个文件保存一份YAML基线（避免跨文件污染）
  const fileYamlBaseRef = useRef<Map<string, string>>(new Map());
  
  // 同步 selectedFile 到 ref
  useEffect(() => {
    console.log(`[StateSync] selectedFile 更新: ${selectedFile?.fileName} (id: ${selectedFile?.id})`);
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
    const hasHistory = globalHistoryManager.getEntries().some(e => e.fileId === selectedFile.id);
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
   */
  const parseYamlToScript = useCallback((yamlContent: string) => {
    try {
      const parsed = yaml.load(yamlContent) as any;
      setParsedScript(parsed);

      console.log('解析的完整脚本:', parsed);

      const phases: PhaseWithTopics[] = [];

      // 新格式：session.phases[].topics[].actions[]
      if (parsed?.session?.phases) {
        console.log('检测到新格式脚本 (session.phases)');

        parsed.session.phases.forEach((phase: any) => {
          const topics: TopicWithActions[] = [];

          phase.topics?.forEach((topic: any) => {
            const actions: Action[] = [];

            topic.actions?.forEach((action: any) => {
              // 规范化 Action 类型，将 config 字段映射到前端期望的字段名
              if (action.action_type === 'ai_say') {
                const contentValue = action.config?.content_template || '';
                actions.push({
                  type: 'ai_say',
                  content: contentValue,  // 新字段
                  ai_say: contentValue,   // 旧字段，保持向后兼容
                  tone: action.config?.tone,
                  condition: action.config?.condition,
                  require_acknowledgment: action.config?.require_acknowledgment,
                  max_rounds: action.config?.max_rounds,
                  action_id: action.action_id,
                  _raw: action, // 保留原始数据用于反向转换
                });
              } else if (action.action_type === 'ai_ask') {
                actions.push({
                  type: 'ai_ask',
                  ai_ask: action.config?.question_template || action.config?.content_template || '',
                  tone: action.config?.tone,
                  exit: action.config?.exit,
                  tolist: action.config?.tolist,
                  question_template: action.config?.question_template,
                  target_variable: action.config?.target_variable,
                  extraction_prompt: action.config?.extraction_prompt,
                  required: action.config?.required,
                  max_rounds: action.config?.max_rounds,
                  output: action.config?.target_variable
                    ? [
                        {
                          get: action.config.target_variable,
                          define: action.config.extraction_prompt || '',
                        },
                      ]
                    : action.config?.output || [],
                  condition: action.config?.condition,
                  action_id: action.action_id,
                  _raw: action,
                });
              } else if (action.action_type === 'ai_think') {
                actions.push({
                  type: 'ai_think',
                  think: action.config?.prompt_template || action.config?.think_goal || '',
                  output: (action.config?.output_variables || []).map((v: string) => ({
                    get: v,
                    define: '',
                  })),
                  condition: action.config?.condition,
                  action_id: action.action_id,
                  _raw: action,
                });
              } else if (action.ai_say) {
                // 兼容旧的直接字段格式
                actions.push({ type: 'ai_say', ...action });
              } else if (action.ai_ask) {
                actions.push({ type: 'ai_ask', ...action });
              } else if (action.think) {
                actions.push({ type: 'ai_think', ...action });
              } else {
                actions.push(action);
              }
            });

            topics.push({
              topic_id: topic.topic_id,
              topic_name: topic.topic_name,
              description: topic.description,
              localVariables: topic.declare || [],
              actions,
            });
          });

          phases.push({
            phase_id: phase.phase_id,
            phase_name: phase.phase_name,
            description: phase.description,
            topics,
          });
        });
      }
      // 旧格式：sessions[].stages[].steps[].actions[] - 将其转换为单一 Phase/Topic
      else if (parsed?.sessions?.[0]?.stages?.[0]?.steps) {
        console.log('检测到旧格式脚本 (sessions.stages.steps)');
        const firstStepWithActions = parsed.sessions[0].stages[0].steps.find(
          (step: Step) => step.actions && step.actions.length > 0
        );

        if (firstStepWithActions?.actions) {
          const actions: Action[] = [];
          firstStepWithActions.actions.forEach((action: any) => {
            if (action.ai_say) actions.push({ type: 'ai_say', ...action });
            else if (action.ai_ask) actions.push({ type: 'ai_ask', ...action });
            else if (action.think) actions.push({ type: 'ai_think', ...action });
            else if (action.say) actions.push({ type: 'say', ...action });
            else if (action.user_say) actions.push({ type: 'user_say', ...action });
            else actions.push(action);
          });

          // 将旧格式转换为单一 Phase 和 Topic
          phases.push({
            phase_id: 'legacy_phase',
            phase_name: '会谈阶段',
            topics: [
              {
                topic_id: 'legacy_topic',
                topic_name: '会谈主题',
                actions,
              },
            ],
          });
        }
      }

      const totalActions = phases.reduce(
        (sum, p) => sum + p.topics.reduce((s, t) => s + t.actions.length, 0),
        0
      );
      console.log(`提取到的层级结构: ${phases.length} Phases, 总计 ${totalActions} Actions`);

      setCurrentPhases(phases);
    } catch (error) {
      console.error('YAML 解析失败:', error);
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
  const buildFileTree = useCallback((fileList: ScriptFile[]): FileTreeNode[] => {
    const sessionFiles = fileList.filter((f) => f.fileType === 'session');
    const otherFiles = fileList.filter((f) => f.fileType !== 'session');

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

    return nodes;
  }, []);

  // 加载工程和文件
  const loadProjectData = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      
      // 注意：不在这里 clear，因为切换文件时也会触发 loadProjectData
      // clear 应该在 useEffect 中检测 projectId 变化时执行
      
      const [projectRes, filesRes] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.getProjectFiles(projectId),
      ]);

      if (projectRes.success) {
        setProject(projectRes.data);
      }

      if (filesRes.success) {
        setFiles(filesRes.data);
        const tree = buildFileTree(filesRes.data);
        setTreeData(tree);
        setExpandedKeys(['sessions-folder']);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fileId]);

  // 监听 projectId 变化，切换工程时清空历史栈
  useEffect(() => {
    if (projectId) {
      console.log(`[ProjectEditor] 🏠 工程 ID 变化: ${projectId}，清空历史栈`);
      globalHistoryManager.clear();
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
    } else {
      setParsedScript(null);
      setCurrentPhases([]);
      setSelectedActionPath(null);
      setEditMode('yaml'); // 非会谈脚本只能用 YAML 模式
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 处理树节点选择
  const handleTreeSelect = useCallback(
    (_selectedKeys: React.Key[], info: any) => {
      if (info.node.isLeaf && info.node.fileId) {
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
    },
    [files, hasUnsavedChanges, loadFile, navigate, projectId]
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
      }
    },
    [selectedFile]
  );

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!selectedFile || !projectId) return;

    try {
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
  }, [selectedFile, projectId, fileContent]);

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
      console.log('[syncPhasesToYaml] parsedScript 状态:', parsedScript ? '存在' : 'null');
      console.log('[syncPhasesToYaml] selectedFile:', selectedFile?.fileName);
      
      try {
        let updatedScript: any;
        let baseScript: any = null;

        // 使用显式传入的 targetFileId，或者使用当前文件 ID
        const currentFileId = targetFileId || selectedFile?.id || selectedFileRef.current?.id;
        
        // 获取目标文件信息（用于 session_id）
        let targetFile = selectedFile;
        if (targetFileId && targetFileId !== selectedFile?.id) {
          targetFile = files.find(f => f.id === targetFileId) || selectedFile;
        }
        
        if (currentFileId) {
          const baseYaml = fileYamlBaseRef.current.get(currentFileId);
          if (baseYaml) {
            try {
              baseScript = yaml.load(baseYaml) as any;
              console.log('[syncPhasesToYaml] 使用 fileYamlBaseRef 中的基线脚本');
            } catch (e) {
              console.error('[syncPhasesToYaml] 基线YAML解析失败:', e);
            }
          }
        }

        // 优先级: 文件基线 > parsedScript > 创建新结构
        if (baseScript) {
          updatedScript = JSON.parse(JSON.stringify(baseScript));
        } else if (parsedScript) {
          console.log('[syncPhasesToYaml] 使用现有 parsedScript 作为基线');
          updatedScript = JSON.parse(JSON.stringify(parsedScript)); // 深拷贝
        } else {
          // 如果都没有，创建新的脚本结构
          console.log('[syncPhasesToYaml] 没有可用基线，创建新的脚本结构');
          updatedScript = {
            session: {
              session_id: targetFile?.fileName?.replace('.yaml', '') || 'new-session',
              session_name: targetFile?.fileName?.replace('.yaml', '') || 'New Session',
              phases: [],
            },
          };
          console.log('[syncPhasesToYaml] 创建的新结构:', JSON.stringify(updatedScript, null, 2));
        }

        // 确保 updatedScript 有 session 结构
        if (!updatedScript.session) {
          console.log('[syncPhasesToYaml] 脚本中没有 session 结构，创建新的 session');
          updatedScript.session = {
            session_id: targetFile?.fileName?.replace('.yaml', '') || 'new-session',
            session_name: targetFile?.fileName?.replace('.yaml', '') || 'New Session',
            phases: [],
          };
        }
        
        // 新格式：更新 session.phases
        if (updatedScript?.session) {
          console.log('[syncPhasesToYaml] 检测到 session 结构');
          // 确保 session.phases 存在
          if (!updatedScript.session.phases) {
            updatedScript.session.phases = [];
            console.log('[syncPhasesToYaml] 初始化 session.phases 数组');
          }
          
          console.log('[syncPhasesToYaml] 开始构建 phases 数据...');
          // 重建 phases 结构，保持其他字段不变
          updatedScript.session.phases = phases.map((phase, pi) => {
            const originalPhase = (parsedScript as any)?.session?.phases?.[pi] || {};
            return {
              ...originalPhase,
              phase_id: phase.phase_id,
              phase_name: phase.phase_name,
              description: phase.description,
              topics: phase.topics.map((topic, ti) => {
                const originalTopic = originalPhase.topics?.[ti] || {};
                return {
                  ...originalTopic,
                  topic_id: topic.topic_id,
                  topic_name: topic.topic_name,
                  description: topic.description,
                  declare: topic.localVariables,
                  actions: topic.actions.map((action) => {
                    // 将前端字段映射回 config 格式
                    if (action._raw) {
                      // 使用保留的原始数据
                      const rawAction = action._raw as any;
                      if (action.type === 'ai_say') {
                        // 修复: 优先使用 content 字段，如果没有则回退到 ai_say
                        const contentValue = action.content || action.ai_say || '';
                        return {
                          ...rawAction,
                          config: {
                            ...rawAction.config,
                            content_template: contentValue,
                            tone: action.tone,
                            condition: action.condition,
                            require_acknowledgment: action.require_acknowledgment,
                            max_rounds: action.max_rounds,
                          },
                        };
                      } else if (action.type === 'ai_ask') {
                        return {
                          ...rawAction,
                          config: {
                            ...rawAction.config,
                            question_template: action.ai_ask,
                            tone: action.tone,
                            exit: action.exit,
                            tolist: action.tolist,
                            target_variable: action.target_variable || action.output?.[0]?.get,
                            extraction_prompt: action.extraction_prompt || action.output?.[0]?.define,
                            required: action.required,
                            max_rounds: action.max_rounds,
                            output: action.output && action.output.length > 1 ? action.output : undefined,
                            condition: action.condition,
                          },
                        };
                      } else if (action.type === 'ai_think') {
                        return {
                          ...rawAction,
                          config: {
                            ...rawAction.config,
                            prompt_template: action.think,
                            output_variables: action.output?.map((o) => o.get),
                            condition: action.condition,
                          },
                        };
                      }
                      return rawAction;
                    }
                    return action;
                  }),
                };
              }),
            };
          });
          console.log('[syncPhasesToYaml] phases 数据构建完成，数量:', updatedScript.session.phases.length);
        }
        // 旧格式：更新 sessions[].stages[].steps[].actions[]
        else if (updatedScript.sessions?.[0]?.stages?.[0]?.steps) {
          console.log('[syncPhasesToYaml] 检测到旧格式');
          const stepIndex = updatedScript.sessions[0].stages[0].steps.findIndex(
            (step: Step) => step.actions && step.actions.length > 0
          );

          if (stepIndex !== -1 && phases[0]?.topics[0]?.actions) {
            updatedScript.sessions[0].stages[0].steps[stepIndex].actions =
              phases[0].topics[0].actions;
          }
        }

        console.log('[syncPhasesToYaml] 开始转换为 YAML...');
        // 转换回 YAML
        const newYaml = yaml.dump(updatedScript, {
          lineWidth: -1,
          noRefs: true,
        });
        console.log('[syncPhasesToYaml] YAML 转换完成，长度:', newYaml.length);
        console.log('[syncPhasesToYaml] YAML 内容预览:', newYaml.substring(0, 200));
        
        setFileContent(newYaml);
        console.log('[syncPhasesToYaml] setFileContent 调用完成');
        
        setParsedScript(updatedScript);
        console.log('[syncPhasesToYaml] setParsedScript 调用完成');
        
        console.log('[syncPhasesToYaml] YAML 同步成功，phases 数量:', phases.length);
      } catch (error) {
        console.error('同步到 YAML 失败:', error);
        message.error('Sync failed');
      }
    },
    [parsedScript, selectedFile, files]
  );

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
      console.log(`[FocusNavigation]   当前文件(ref): ${currentFile?.fileName} (id: ${currentFile?.id})`);
      console.log(`[FocusNavigation]   目标文件: targetFileId = ${targetFileId}`);
      console.log(`[FocusNavigation]   匹配结果: ${currentFile?.id === targetFileId}`);
      
      if (currentFile?.id !== targetFileId) {
        console.warn('[FocusNavigation] ⚠️ 当前文件与目标文件不匹配，跳过焦点导航');
        return;
      }

      console.log(`[FocusNavigation] 🎯 应用焦点: type=${focusPath.type}`);
      
      // 应用焦点
      setTimeout(() => {
        if (focusPath.type === 'action' && focusPath.phaseIndex !== undefined && focusPath.topicIndex !== undefined && focusPath.actionIndex !== undefined) {
          console.log(`[FocusNavigation] 🎯 设置 Action 焦点: [${focusPath.phaseIndex}, ${focusPath.topicIndex}, ${focusPath.actionIndex}]`);
          setSelectedActionPath({
            phaseIndex: focusPath.phaseIndex,
            topicIndex: focusPath.topicIndex,
            actionIndex: focusPath.actionIndex,
          });
          setEditingType('action');
        } else if (focusPath.type === 'topic' && focusPath.phaseIndex !== undefined && focusPath.topicIndex !== undefined) {
          console.log(`[FocusNavigation] 🎯 设置 Topic 焦点: [${focusPath.phaseIndex}, ${focusPath.topicIndex}]`);
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
    console.log('\n========== [Undo] 开始执行 ==========')
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
    console.log(`[Undo] 🔍 文件匹配检查: ${currentFile?.id} === ${entry.fileId} ? ${currentFile?.id === entry.fileId}`);
    
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
          console.log(`[Undo-Timeout] 📄 selectedFileRef.current: ${selectedFileRef.current?.fileName}`);
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
        console.error(`[Undo] 当前 files:`, files.map(f => ({ id: f.id, name: f.fileName })));
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
        return sum + phase.topics.reduce((topicSum: number, topic: TopicWithActions) => topicSum + topic.actions.length, 0);
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
   * 新增会谈脚本（需求2）
   */
  const handleCreateSession = useCallback(async () => {
    if (!projectId) return;

    Modal.confirm({
      title: 'Create Session Script',
      content: (
        <div>
          <div style={{ marginBottom: '8px' }}>Please enter the session script name:</div>
          <Input
            id="session-name-input"
            placeholder="e.g. first-day"
            defaultValue="new-session"
          />
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

  // Undo/Redo 快捷键（需求4）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y / Cmd+Y: Redo
      else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
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
      <Header
        className="editor-header"
        style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <Space size="middle" align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
              Back to list
            </Button>
            <Divider type="vertical" />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Title
                level={4}
                style={{ margin: 0, lineHeight: '1.2', fontSize: '18px', marginBottom: '2px' }}
              >
                {project?.projectName}
              </Title>
              <Text type="secondary" style={{ fontSize: '12px', lineHeight: '1' }}>
                Engine version: {project?.engineVersion}
              </Text>
            </div>
            {project?.status && (
              <Tag color={project.status === 'published' ? 'success' : 'default'}>
                {project.status === 'draft'
                  ? 'Draft'
                  : project.status === 'published'
                    ? 'Published'
                    : 'Archived'}
              </Tag>
            )}
            {hasUnsavedChanges && <Tag color="warning">Unsaved</Tag>}
          </Space>
          <Space>
            <Button
              icon={<HistoryOutlined />}
              onClick={() => setVersionPanelVisible(!versionPanelVisible)}
              type={versionPanelVisible ? 'primary' : 'default'}
            >
              版本管理
            </Button>
            <Button
              icon={<BugOutlined />}
              onClick={() => setDebugConfigVisible(true)}
              disabled={!project || files.filter(f => f.fileType === 'session').length === 0}
            >
              Debug
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
            >
              Save {hasUnsavedChanges && '(Ctrl+S)'}
            </Button>
            <Button icon={<RocketOutlined />} onClick={() => setPublishModalVisible(true)}>
              Publish Version
            </Button>
          </Space>
        </div>
      </Header>

      <Layout style={{ height: 'calc(100vh - 64px)' }}>
        {/* 左侧文件树 */}
        <Sider
          width={300}
          collapsedWidth={50}
          collapsible
          collapsed={leftCollapsed}
          onCollapse={setLeftCollapsed}
          trigger={null}
          theme="light"
          style={{
            borderRight: '1px solid #f0f0f0',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 折叠按钮 */}
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: leftCollapsed ? 'center' : 'flex-end',
            }}
          >
            <Button
              type="text"
              icon={leftCollapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              size="small"
            />
          </div>

          {/* 工程文件树区域 - 可滚动 */}
          <div
            style={{
              padding: leftCollapsed ? '8px' : '16px',
              display: leftCollapsed ? 'none' : 'block',
              flex: 1,
              overflow: 'auto',
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
              }}
            >
              <Text strong>Project Files</Text>
              <Dropdown
                overlay={
                  <Menu onClick={({ key }) => {
                    if (key === 'session') {
                      handleCreateSession();
                    }
                  }}>
                    <Menu.Item key="session" icon={<FileTextOutlined />}>
                      New Session Script
                    </Menu.Item>
                  </Menu>
                }
              >
                <Button size="small" icon={<PlusOutlined />} />
              </Dropdown>
            </div>
            <Tree
              showIcon
              treeData={treeData}
              expandedKeys={expandedKeys}
              selectedKeys={selectedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              onSelect={handleTreeSelect}
            />
          </div>

          {/* 文件属性区域 - 固定底部，独立滚动 */}
          {!leftCollapsed && (
            <div
              style={{
                borderTop: '1px solid #f0f0f0',
                padding: '16px',
                maxHeight: '40vh',
                overflow: 'auto',
                flexShrink: 0,
              }}
            >
              <Title level={5} style={{ marginTop: 0 }}>
                File Details
              </Title>
              {selectedFile ? (
                <div>
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Text type="secondary">File Name</Text>
                      <div>
                        <Text>{selectedFile.fileName}</Text>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">File Type</Text>
                      <div>
                        <Tag>{selectedFile.fileType}</Tag>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">Created At</Text>
                      <div>
                        <Text>{new Date(selectedFile.createdAt).toLocaleString()}</Text>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">Updated At</Text>
                      <div>
                        <Text>{new Date(selectedFile.updatedAt).toLocaleString()}</Text>
                      </div>
                    </div>
                  </Space>

                  <Divider />

                  <Title level={5}>Quick Actions</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button 
                      block 
                      icon={<HistoryOutlined />}
                      onClick={() => setVersionPanelVisible(true)}
                    >
                      View Version History
                    </Button>
                    <Button block>Format YAML</Button>
                    <Button block>Validate Script</Button>
                  </Space>
                </div>
              ) : (
                <Text type="secondary">No file selected</Text>
              )}
            </div>
          )}
        </Sider>

        {/* 中间编辑区 */}
        <Layout style={{ padding: '0', overflow: 'hidden' }}>
          <Content
            style={{
              background: '#fff',
              margin: 0,
              minHeight: 280,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {selectedFile ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 文件面包屑 */}
                <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0' }}>
                  <Space>
                    {getFileIcon(selectedFile.fileType)}
                    <Text strong>{selectedFile.fileName}</Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      Last modified: {new Date(selectedFile.updatedAt).toLocaleString()}
                    </Text>

                    {/* 如果是会谈脚本，显示模式切换按钮 */}
                    {selectedFile.fileType === 'session' && (
                      <>
                        <Divider type="vertical" />
                        <Button.Group size="small">
                          <Button
                            icon={<CodeOutlined />}
                            type={editMode === 'yaml' ? 'primary' : 'default'}
                            onClick={() => {
                              console.log('切换到 YAML 模式');
                              setEditMode('yaml');
                            }}
                          >
                            YAML Mode
                          </Button>
                          <Button
                            icon={<AppstoreOutlined />}
                            type={editMode === 'visual' ? 'primary' : 'default'}
                            onClick={() => {
                              console.log('切换到可视化编辑模式');
                              console.log('当前 Phases 数量:', currentPhases.length);
                              console.log('解析的脚本:', parsedScript);
                              
                              // 切换到可视化模式时，重新解析 YAML 内容以确保数据同步
                              if (fileContent) {
                                parseYamlToScript(fileContent);
                              }
                              setEditMode('visual');
                            }}
                          >
                            Visual Editor
                          </Button>
                        </Button.Group>
                        <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
                          {editMode === 'visual' &&
                            `(${currentPhases.reduce(
                              (total, phase) =>
                                total +
                                phase.topics.reduce((t, topic) => t + topic.actions.length, 0),
                              0
                            )} nodes)`}
                        </Text>
                      </>
                    )}
                  </Space>
                </div>

                {/* 编辑器内容 */}
                {editMode === 'yaml' ? (
                  // YAML 编辑器
                  <div style={{ flex: 1, padding: '16px 24px', overflow: 'auto', minHeight: 0 }}>
                    <TextArea
                      value={fileContent}
                      onChange={handleContentChange}
                      placeholder="Edit YAML content..."
                      style={{
                        width: '100%',
                        minHeight: '600px',
                        fontFamily: 'Monaco, Consolas, monospace',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                ) : (
                  // 可视化节点编辑
                  <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
                    {/* 左侧：Action 节点列表 */}
                    <div
                      style={{
                        width: '50%',
                        borderRight: '1px solid #f0f0f0',
                        overflow: 'auto',
                        minHeight: 0,
                      }}
                    >
                      <ActionNodeList
                        ref={actionNodeListRef}
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
                    </div>

                    {/* 右侧：属性编辑面板 */}
                    <div
                      style={{
                        width: '50%',
                        overflow: 'auto',
                        minHeight: 0,
                      }}
                    >
                      {editingType === 'phase' && selectedPhasePath !== null && (
                        <PhaseTopicPropertyPanel
                          type="phase"
                          data={{
                            id: currentPhases[selectedPhasePath.phaseIndex].phase_id,
                            name: currentPhases[selectedPhasePath.phaseIndex].phase_name,
                            description: currentPhases[selectedPhasePath.phaseIndex].description,
                          }}
                          onSave={handlePhaseSave}
                        />
                      )}

                      {editingType === 'topic' && selectedTopicPath !== null && (
                        <PhaseTopicPropertyPanel
                          type="topic"
                          data={{
                            id: currentPhases[selectedTopicPath.phaseIndex].topics[
                              selectedTopicPath.topicIndex
                            ].topic_id,
                            name: currentPhases[selectedTopicPath.phaseIndex].topics[
                              selectedTopicPath.topicIndex
                            ].topic_name,
                            description:
                              currentPhases[selectedTopicPath.phaseIndex].topics[
                                selectedTopicPath.topicIndex
                              ].description,
                            localVariables:
                              currentPhases[selectedTopicPath.phaseIndex].topics[
                                selectedTopicPath.topicIndex
                              ].localVariables,
                          }}
                          onSave={handleTopicSave}
                        />
                      )}

                      {editingType === 'action' && selectedActionPath !== null && (
                        <ActionPropertyPanel
                          action={
                            currentPhases[selectedActionPath.phaseIndex]?.topics[
                              selectedActionPath.topicIndex
                            ]?.actions[selectedActionPath.actionIndex] ?? null
                          }
                          actionIndex={selectedActionPath.actionIndex}
                          onSave={handleActionSave}
                        />
                      )}

                      {editingType === null && (
                        <div style={{ padding: '24px', textAlign: 'center' }}>
                          <Text type="secondary">Please select a Phase, Topic, or Action on the left</Text>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Text type="secondary">Please select a file on the left to edit</Text>
              </div>
            )}
          </Content>
        </Layout>
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
    </Layout>
  );
};

export default ProjectEditor;
