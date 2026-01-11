import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import yaml from 'js-yaml';
import { projectsApi, versionsApi } from '../../api/projects';
import type { Project, ScriptFile } from '../../api/projects';
import type { Action, SessionScript, Step } from '../../types/action';
import { ActionNodeList } from '../../components/ActionNodeList';
import { ActionPropertyPanel } from '../../components/ActionPropertyPanel';
import { PhaseTopicPropertyPanel } from '../../components/PhaseTopicPropertyPanel';
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
  const [selectedTopicPath, setSelectedTopicPath] = useState<{ phaseIndex: number; topicIndex: number } | null>(null); // 选中的 Topic 路径
  const [editingType, setEditingType] = useState<'phase' | 'topic' | 'action' | null>(null); // 当前编辑的类型

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
        title: `会谈脚本 (${sessionFiles.length})`,
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

        // 如果URL有fileId，加载该文件；否则加载第一个文件
        if (fileId) {
          const file = filesRes.data.find((f) => f.id === fileId);
          if (file) {
            loadFile(file);
          }
        } else if (filesRes.data.length > 0) {
          loadFile(filesRes.data[0]);
        }
      }
    } catch (error) {
      console.error('加载工程数据失败:', error);
      message.error('加载工程数据失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, fileId, buildFileTree]);

  // 加载文件内容
  const loadFile = useCallback((file: ScriptFile) => {
    setSelectedFile(file);
    setSelectedKeys([file.id]);
    
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
    
    // 如果是会谈脚本，尝试解析为可视化结构
    if (file.fileType === 'session' && content) {
      parseYamlToScript(content);
    } else {
      setParsedScript(null);
      setCurrentPhases([]);
      setSelectedActionPath(null);
      setEditMode('yaml'); // 非会谈脚本只能用 YAML 模式
    }
  }, []);

  // 处理树节点选择
  const handleTreeSelect = useCallback(
    (_selectedKeys: React.Key[], info: any) => {
      if (info.node.isLeaf && info.node.fileId) {
        const file = files.find((f) => f.id === info.node.fileId);
        if (file) {
          if (hasUnsavedChanges) {
            Modal.confirm({
              title: '未保存的修改',
              content: '当前文件有未保存的修改，是否放弃修改？',
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
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(e.target.value);
    setHasUnsavedChanges(true);
    
    // YAML 模式下实时解析（可选，仅在用户停止输入一段时间后）
    if (selectedFile?.fileType === 'session') {
      parseYamlToScript(e.target.value);
    }
  }, [selectedFile]);

  // 保存文件
  const handleSave = useCallback(async () => {
    if (!selectedFile || !projectId) return;

    try {
      setSaving(true);
      await projectsApi.updateFile(projectId, selectedFile.id, {
        yamlContent: fileContent,
      });
      message.success('保存成功');
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
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  }, [selectedFile, projectId, fileContent]);

  // 发布版本
  const handlePublish = useCallback(async () => {
    if (!projectId || !versionNote.trim()) {
      message.warning('请填写版本说明');
      return;
    }

    try {
      setSaving(true);
      const currentVersion = project?.currentVersionId || '0.0.0';
      const versionParts = currentVersion.replace(/^v/, '').split('.');
      const newPatch = parseInt(versionParts[2] || '0') + 1;
      const newVersion = `v${versionParts[0]}.${versionParts[1]}.${newPatch}`;

      await versionsApi.publishVersion(projectId, {
        versionNumber: newVersion,
        releaseNote: versionNote,
        publishedBy: project?.author || 'unknown',
      });

      message.success(`版本 ${newVersion} 发布成功`);
      setPublishModalVisible(false);
      setVersionNote('');
      loadProjectData();
    } catch (error) {
      console.error('发布失败:', error);
      message.error('发布失败');
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
                actions.push({
                  type: 'ai_say',
                  ai_say: action.config?.content_template || '',
                  tone: action.config?.tone,
                  condition: action.config?.condition,
                  action_id: action.action_id,
                  _raw: action // 保留原始数据用于反向转换
                });
              } else if (action.action_type === 'ai_ask') {
                actions.push({
                  type: 'ai_ask',
                  ai_ask: action.config?.question_template || '',
                  tone: action.config?.tone,
                  exit: action.config?.exit,
                  tolist: action.config?.tolist,
                  output: action.config?.target_variable
                    ? [{
                        get: action.config.target_variable,
                        define: action.config.extraction_prompt || ''
                      }]
                    : [],
                  condition: action.config?.condition,
                  action_id: action.action_id,
                  _raw: action
                });
              } else if (action.action_type === 'ai_think') {
                actions.push({
                  type: 'ai_think',
                  think: action.config?.prompt_template || action.config?.think_goal || '',
                  output: (action.config?.output_variables || []).map((v: string) => ({
                    get: v,
                    define: ''
                  })),
                  condition: action.config?.condition,
                  action_id: action.action_id,
                  _raw: action
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
              actions
            });
          });
          
          phases.push({
            phase_id: phase.phase_id,
            phase_name: phase.phase_name,
            description: phase.description,
            topics
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
            topics: [{
              topic_id: 'legacy_topic',
              topic_name: '会谈主题',
              actions
            }]
          });
        }
      }
      
      const totalActions = phases.reduce((sum, p) => 
        sum + p.topics.reduce((s, t) => s + t.actions.length, 0), 0
      );
      console.log(`提取到的层级结构: ${phases.length} Phases, 总计 ${totalActions} Actions`);
      
      setCurrentPhases(phases);
    } catch (error) {
      console.error('YAML 解析失败:', error);
      setParsedScript(null);
      setCurrentPhases([]);
    }
  }, []);
  
  /**
   * 将层级结构同步回 YAML 字符串
   */
  const syncPhasesToYaml = useCallback((phases: PhaseWithTopics[]) => {
    if (!parsedScript) return;
    
    try {
      // 更新脚本对象
      const updatedScript: any = JSON.parse(JSON.stringify(parsedScript)); // 深拷贝
      
      // 新格式：更新 session.phases
      if (updatedScript?.session?.phases) {
        // 重建 phases 结构，保持其他字段不变
        updatedScript.session.phases = phases.map((phase, pi) => {
          const originalPhase = (parsedScript as any).session?.phases?.[pi] || {};
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
                actions: topic.actions.map(action => {
                  // 将前端字段映射回 config 格式
                  if (action._raw) {
                    // 使用保留的原始数据
                    const rawAction = action._raw as any;
                    if (action.type === 'ai_say') {
                      return {
                        ...rawAction,
                        config: {
                          ...rawAction.config,
                          content_template: action.ai_say,
                          tone: action.tone,
                          condition: action.condition
                        }
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
                          target_variable: action.output?.[0]?.get,
                          extraction_prompt: action.output?.[0]?.define,
                          condition: action.condition
                        }
                      };
                    } else if (action.type === 'ai_think') {
                      return {
                        ...rawAction,
                        config: {
                          ...rawAction.config,
                          prompt_template: action.think,
                          output_variables: action.output?.map(o => o.get),
                          condition: action.condition
                        }
                      };
                    }
                    return rawAction;
                  }
                  return action;
                })
              };
            })
          };
        });
      }
      // 旧格式：更新 sessions[].stages[].steps[].actions[]
      else if (updatedScript.sessions?.[0]?.stages?.[0]?.steps) {
        const stepIndex = updatedScript.sessions[0].stages[0].steps.findIndex(
          (step: Step) => step.actions && step.actions.length > 0
        );
        
        if (stepIndex !== -1 && phases[0]?.topics[0]?.actions) {
          updatedScript.sessions[0].stages[0].steps[stepIndex].actions = phases[0].topics[0].actions;
        }
      }
      
      // 转换回 YAML
      const newYaml = yaml.dump(updatedScript, {
        lineWidth: -1,
        noRefs: true,
      });
      setFileContent(newYaml);
      setParsedScript(updatedScript);
    } catch (error) {
      console.error('同步到 YAML 失败:', error);
      message.error('同步失败');
    }
  }, [parsedScript]);
  
  /**
   * 保存 Action 修改
   */
  const handleActionSave = useCallback((updatedAction: Action) => {
    if (selectedActionPath === null) return;
    
    const { phaseIndex, topicIndex, actionIndex } = selectedActionPath;
    
    // 更新层级结构
    const newPhases = JSON.parse(JSON.stringify(currentPhases)); // 深拷贝
    newPhases[phaseIndex].topics[topicIndex].actions[actionIndex] = updatedAction;
    setCurrentPhases(newPhases);
    
    // 同步回 YAML
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Action 已更新');
  }, [selectedActionPath, currentPhases, syncPhasesToYaml]);
  
  /**
   * 添加新 Phase
   */
  const handleAddPhase = useCallback(() => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const newPhaseIndex = newPhases.length + 1;
    
    newPhases.push({
      phase_id: `phase_${newPhaseIndex}`,
      phase_name: `新阶段 ${newPhaseIndex}`,
      topics: [
        {
          topic_id: `topic_1`,
          topic_name: '新主题 1',
          actions: [
            {
              type: 'ai_say',
              ai_say: '请编辑此处内容',
              action_id: `action_1`,
              _raw: {
                action_id: `action_1`,
                action_type: 'ai_say',
                config: {
                  content_template: '请编辑此处内容'
                }
              }
            }
          ]
        }
      ]
    });
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('已添加新 Phase');
  }, [currentPhases, syncPhasesToYaml]);
  
  /**
   * 添加新 Topic
   */
  const handleAddTopic = useCallback((phaseIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const phase = newPhases[phaseIndex];
    const newTopicIndex = phase.topics.length + 1;
    
    phase.topics.push({
      topic_id: `topic_${newTopicIndex}`,
      topic_name: `新主题 ${newTopicIndex}`,
      actions: [
        {
          type: 'ai_say',
          ai_say: '请编辑此处内容',
          action_id: `action_1`,
          _raw: {
            action_id: `action_1`,
            action_type: 'ai_say',
            config: {
              content_template: '请编辑此处内容'
            }
          }
        }
      ]
    });
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('已添加新 Topic');
  }, [currentPhases, syncPhasesToYaml]);
  
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
              content_template: '请编辑此处内容'
            }
          }
        };
      
      case 'ai_ask':
        return {
          type: 'ai_ask',
          ai_ask: '请输入问题',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_ask',
            config: {
              content_template: '请输入问题',
              output: []
            }
          }
        };
      
      case 'ai_think':
        return {
          type: 'ai_think',
          think: '请输入思考目标',
          output: [],
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'ai_think',
            config: {
              think_target: '请输入思考目标',
              output: []
            }
          }
        };
      
      case 'use_skill':
        return {
          type: 'use_skill',
          skill: '技能名称',
          action_id: baseActionId,
          _raw: {
            action_id: baseActionId,
            action_type: 'use_skill',
            config: {
              skill_name: '技能名称'
            }
          }
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
              form_id: ''
            }
          }
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
              pic_url: ''
            }
          }
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
              content_template: '请编辑此处内容'
            }
          }
        };
    }
  }, []);

  /**
   * 添加新 Action
   */
  const handleAddAction = useCallback((phaseIndex: number, topicIndex: number, actionType: string) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const topic = newPhases[phaseIndex].topics[topicIndex];
    const newActionIndex = topic.actions.length + 1;
    
    const newAction = createActionByType(actionType, newActionIndex);
    topic.actions.push(newAction);
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success(`已添加新 ${actionType} Action`);
  }, [currentPhases, syncPhasesToYaml, createActionByType]);
  
  /**
   * 删除 Phase
   */
  const handleDeletePhase = useCallback((phaseIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    newPhases.splice(phaseIndex, 1);
    
    // 如果删除的是当前选中的 phase，清空选中状态
    if (selectedActionPath?.phaseIndex === phaseIndex) {
      setSelectedActionPath(null);
    } else if (selectedActionPath && selectedActionPath.phaseIndex > phaseIndex) {
      // 如果选中的 phase 在被删除的后面，需要调整索引
      setSelectedActionPath({
        ...selectedActionPath,
        phaseIndex: selectedActionPath.phaseIndex - 1
      });
    }
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('已删除 Phase');
  }, [currentPhases, selectedActionPath, syncPhasesToYaml]);
  
  /**
   * 删除 Topic
   */
  const handleDeleteTopic = useCallback((phaseIndex: number, topicIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    newPhases[phaseIndex].topics.splice(topicIndex, 1);
    
    // 如果删除的是当前选中的 topic，清空选中状态
    if (selectedActionPath?.phaseIndex === phaseIndex && selectedActionPath?.topicIndex === topicIndex) {
      setSelectedActionPath(null);
    } else if (selectedActionPath && selectedActionPath.phaseIndex === phaseIndex && selectedActionPath.topicIndex > topicIndex) {
      // 如果选中的 topic 在被删除的后面，需要调整索引
      setSelectedActionPath({
        ...selectedActionPath,
        topicIndex: selectedActionPath.topicIndex - 1
      });
    }
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('已删除 Topic');
  }, [currentPhases, selectedActionPath, syncPhasesToYaml]);
  
  /**
   * 删除 Action
   */
  const handleDeleteAction = useCallback((phaseIndex: number, topicIndex: number, actionIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const topic = newPhases[phaseIndex].topics[topicIndex];
    
    // 至少保留一个 action
    if (topic.actions.length <= 1) {
      message.warning('至少需要保留一个 Action');
      return;
    }
    
    topic.actions.splice(actionIndex, 1);
    
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
        actionIndex: selectedActionPath.actionIndex - 1
      });
    }
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('已删除 Action');
  }, [currentPhases, selectedActionPath, syncPhasesToYaml]);

  /**
   * 移动 Phase
   */
  const handleMovePhase = useCallback((fromIndex: number, toIndex: number) => {
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    const [movedPhase] = newPhases.splice(fromIndex, 1);
    newPhases.splice(toIndex, 0, movedPhase);
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Phase 已移动');
  }, [currentPhases, syncPhasesToYaml]);

  /**
   * 移动 Topic（支持跨 Phase）
   */
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
  const handleSelectAction = useCallback((path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => {
    setSelectedPhasePath(null);
    setSelectedTopicPath(null);
    setSelectedActionPath(path);
    setEditingType('action');
  }, []);
  
  /**
   * 保存 Phase 修改
   */
  const handlePhaseSave = useCallback((updatedPhaseData: any) => {
    if (selectedPhasePath === null) return;
    
    const { phaseIndex } = selectedPhasePath;
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    
    newPhases[phaseIndex] = {
      ...newPhases[phaseIndex],
      phase_id: updatedPhaseData.id,
      phase_name: updatedPhaseData.name,
      description: updatedPhaseData.description,
    };
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Phase 已更新');
  }, [selectedPhasePath, currentPhases, syncPhasesToYaml]);
  
  /**
   * 保存 Topic 修改
   */
  const handleTopicSave = useCallback((updatedTopicData: any) => {
    if (selectedTopicPath === null) return;
    
    const { phaseIndex, topicIndex } = selectedTopicPath;
    const newPhases = JSON.parse(JSON.stringify(currentPhases));
    
    newPhases[phaseIndex].topics[topicIndex] = {
      ...newPhases[phaseIndex].topics[topicIndex],
      topic_id: updatedTopicData.id,
      topic_name: updatedTopicData.name,
      description: updatedTopicData.description,
      localVariables: updatedTopicData.localVariables,
    };
    
    setCurrentPhases(newPhases);
    syncPhasesToYaml(newPhases);
    setHasUnsavedChanges(true);
    message.success('Topic 已更新');
  }, [selectedTopicPath, currentPhases, syncPhasesToYaml]);

  // 初始加载
  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  if (loading) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Content style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin size="large" tip="加载中..." />
        </Content>
      </Layout>
    );
  }

  return (
    <Layout className="project-editor">
      {/* 顶部导航栏 */}
      <Header className="editor-header" style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%' }}>
          <Space size="middle" align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
              返回列表
            </Button>
            <Divider type="vertical" />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Title level={4} style={{ margin: 0, lineHeight: '1.2', fontSize: '18px', marginBottom: '2px' }}>
                {project?.projectName}
              </Title>
              <Text type="secondary" style={{ fontSize: '12px', lineHeight: '1' }}>
                引擎版本: {project?.engineVersion}
              </Text>
            </div>
            {project?.status && (
              <Tag color={project.status === 'published' ? 'success' : 'default'}>
                {project.status === 'draft' ? '草稿' : project.status === 'published' ? '已发布' : '已归档'}
              </Tag>
            )}
            {hasUnsavedChanges && <Tag color="warning">未保存</Tag>}
          </Space>
          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
              disabled={!hasUnsavedChanges}
            >
              保存 {hasUnsavedChanges && '(Ctrl+S)'}
            </Button>
            <Button icon={<RocketOutlined />} onClick={() => setPublishModalVisible(true)}>
              发布版本
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
            flexDirection: 'column'
          }}
        >          
          {/* 折叠按钮 */}
          <div style={{ 
            padding: '8px', 
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            justifyContent: leftCollapsed ? 'center' : 'flex-end'
          }}>
            <Button 
              type="text" 
              icon={leftCollapsed ? <RightOutlined /> : <LeftOutlined />}
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              size="small"
            />
          </div>

          {/* 工程文件树区域 - 可滚动 */}
          <div style={{ 
            padding: leftCollapsed ? '8px' : '16px', 
            display: leftCollapsed ? 'none' : 'block',
            flex: 1,
            overflow: 'auto',
            minHeight: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <Text strong>工程文件</Text>
              <Dropdown
                overlay={
                  <Menu>
                    <Menu.Item key="session" icon={<FileTextOutlined />}>
                      新建会谈脚本
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
            <div style={{ 
              borderTop: '1px solid #f0f0f0',
              padding: '16px',
              maxHeight: '40vh',
              overflow: 'auto',
              flexShrink: 0
            }}>
              <Title level={5} style={{ marginTop: 0 }}>文件属性</Title>
              {selectedFile ? (
                <div>
                  <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                      <Text type="secondary">文件名称</Text>
                      <div>
                        <Text>{selectedFile.fileName}</Text>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">文件类型</Text>
                      <div>
                        <Tag>{selectedFile.fileType}</Tag>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">创建时间</Text>
                      <div>
                        <Text>{new Date(selectedFile.createdAt).toLocaleString()}</Text>
                      </div>
                    </div>
                    <div>
                      <Text type="secondary">修改时间</Text>
                      <div>
                        <Text>{new Date(selectedFile.updatedAt).toLocaleString()}</Text>
                      </div>
                    </div>
                  </Space>

                  <Divider />

                  <Title level={5}>快捷操作</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Button block icon={<HistoryOutlined />}>
                      查看版本历史
                    </Button>
                    <Button block>格式化YAML</Button>
                    <Button block>验证脚本</Button>
                  </Space>
                </div>
              ) : (
                <Text type="secondary">未选择文件</Text>
              )}
            </div>
          )}
        </Sider>

        {/* 中间编辑区 */}
        <Layout style={{ padding: '0', overflow: 'hidden' }}>
          <Content style={{ background: '#fff', margin: 0, minHeight: 280, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {selectedFile ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* 文件面包屑 */}
                <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0' }}>
                  <Space>
                    {getFileIcon(selectedFile.fileType)}
                    <Text strong>{selectedFile.fileName}</Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      最后修改: {new Date(selectedFile.updatedAt).toLocaleString()}
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
                            YAML 模式
                          </Button>
                          <Button
                            icon={<AppstoreOutlined />}
                            type={editMode === 'visual' ? 'primary' : 'default'}
                            onClick={() => {
                              console.log('切换到可视化编辑模式');
                              console.log('当前 Phases 数量:', currentPhases.length);
                              console.log('解析的脚本:', parsedScript);
                              setEditMode('visual');
                            }}
                          >
                            可视化编辑
                          </Button>
                        </Button.Group>
                        <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
                          {editMode === 'visual' && (
                            `(${
                              currentPhases.reduce((total, phase) => 
                                total + phase.topics.reduce((t, topic) => t + topic.actions.length, 0), 0
                              )
                            } 个节点)`
                          )}
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
                      placeholder="编辑YAML内容..."
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
                    <div style={{ 
                      width: '50%', 
                      borderRight: '1px solid #f0f0f0',
                      overflow: 'auto',
                      minHeight: 0
                    }}>
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
                    </div>
                    
                    {/* 右侧：属性编辑面板 */}
                    <div style={{ 
                      width: '50%',
                      overflow: 'auto',
                      minHeight: 0
                    }}>
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
                            id: currentPhases[selectedTopicPath.phaseIndex].topics[selectedTopicPath.topicIndex].topic_id,
                            name: currentPhases[selectedTopicPath.phaseIndex].topics[selectedTopicPath.topicIndex].topic_name,
                            description: currentPhases[selectedTopicPath.phaseIndex].topics[selectedTopicPath.topicIndex].description,
                            localVariables: currentPhases[selectedTopicPath.phaseIndex].topics[selectedTopicPath.topicIndex].localVariables,
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
                          <Text type="secondary">请从左侧选择一个 Phase、Topic 或 Action</Text>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Text type="secondary">请从左侧选择一个文件进行编辑</Text>
              </div>
            )}
          </Content>
        </Layout>
      </Layout>

      {/* 发布版本对话框 */}
      <Modal
        title="发布新版本"
        open={publishModalVisible}
        onOk={handlePublish}
        onCancel={() => {
          setPublishModalVisible(false);
          setVersionNote('');
        }}
        okText="确认发布"
        cancelText="取消"
        confirmLoading={saving}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text type="secondary">当前工程:</Text>
            <div>
              <Text strong>{project?.projectName}</Text>
            </div>
          </div>
          <div>
            <Text type="secondary">版本说明 (必填)</Text>
            <TextArea
              value={versionNote}
              onChange={(e) => setVersionNote(e.target.value)}
              placeholder="描述本次发布的主要变更内容..."
              rows={4}
            />
          </div>
        </Space>
      </Modal>
    </Layout>
  );
};

export default ProjectEditor;
