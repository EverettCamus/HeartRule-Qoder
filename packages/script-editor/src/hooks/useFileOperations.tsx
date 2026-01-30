import { message, Modal, Input } from 'antd';
import yaml from 'js-yaml';
import { useCallback } from 'react';
import { NavigateFunction } from 'react-router-dom';

import { projectsApi, versionsApi } from '../api/projects';
import type { Project, ScriptFile } from '../api/projects';

import type { EditorState } from './useEditorState';
import type { FileTreeState } from './useFileTreeState';

/**
 * useFileOperations Hook (重构版)
 * 封装文件操作逻辑：加载工程、加载文件、保存文件、创建会谈脚本、YAML格式化
 *
 * 设计改进：
 * - 接收状态Hook返回值，降低参数耦合
 * - 从27个参数减少到6个参数
 */
interface UseFileOperationsParams {
  projectId: string | undefined;
  fileId: string | undefined;
  navigate: NavigateFunction;
  editorState: EditorState;
  fileTreeState: FileTreeState;
  buildFileTree: (fileList: ScriptFile[]) => any[];
  parseYamlToScript: (content: string) => void;
  fixYAMLIndentation: (content: string) => string;
}

interface UseFileOperationsReturn {
  loadProjectData: () => Promise<void>;
  loadFile: (file: ScriptFile) => void;
  handleSave: () => Promise<void>;
  handleCreateSession: () => void;
  handleFormatYAML: () => void;
  handlePublish: (versionNote: string, project: Project | null) => Promise<void>;
}

export const useFileOperations = (params: UseFileOperationsParams): UseFileOperationsReturn => {
  const {
    projectId,
    fileId,
    navigate,
    editorState,
    fileTreeState,
    buildFileTree,
    parseYamlToScript,
    fixYAMLIndentation,
  } = params;

  // 解构状态（提高可读性）
  const {
    fileContent,
    selectedFileRef,
    fileYamlBaseRef,
    validationServiceRef,
    setFileContent,
    setHasUnsavedChanges,
    setEditMode,
    setParsedScript,
    setCurrentPhases,
    setSelectedActionPath,
    setSelectedPhasePath,
    setSelectedTopicPath,
    setEditingType,
    setValidationResult,
    setShowValidationErrors,
  } = editorState;

  const {
    setLoading,
    setProject,
    setFiles,
    setSelectedFile,
    setSelectedKeys,
    setTreeData,
    setExpandedKeys,
    setSaving,
  } = fileTreeState;

  /**
   * 加载工程和文件列表
   */
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
  }, [
    projectId,
    fileId,
    buildFileTree,
    selectedFileRef,
    setLoading,
    setProject,
    setFiles,
    setTreeData,
    setExpandedKeys,
  ]);

  /**
   * 加载文件内容
   */
  const loadFile = useCallback(
    (file: ScriptFile) => {
      setSelectedFile(file);
      setSelectedKeys([file.id]);

      // 切换文件时重置可视化编辑状态
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
          content = JSON.stringify(file.fileContent, null, 2);
        } catch {
          content = String(file.fileContent);
        }
      }
      setFileContent(content);
      setHasUnsavedChanges(false);

      // 为该文件记录YAML基线
      if (file.fileType === 'session') {
        fileYamlBaseRef.current.set(file.id, content || '');
        console.log(`[loadFile] 保存文件 ${file.fileName} 的YAML基线，长度: ${content.length}`);
      }

      // 如果是会谈脚本，尝试解析为可视化结构，并默认进入可视化编辑模式
      if (file.fileType === 'session' && content) {
        parseYamlToScript(content);
        setEditMode('visual');

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
        setEditMode('yaml');
        setValidationResult(null);
      }
    },
    [
      fileYamlBaseRef,
      validationServiceRef,
      parseYamlToScript,
      setSelectedFile,
      setSelectedKeys,
      setSelectedActionPath,
      setSelectedPhasePath,
      setSelectedTopicPath,
      setEditingType,
      setFileContent,
      setHasUnsavedChanges,
      setEditMode,
      setParsedScript,
      setCurrentPhases,
      setValidationResult,
      setShowValidationErrors,
    ]
  );

  /**
   * 保存文件
   */
  const handleSave = useCallback(async () => {
    const selectedFile = selectedFileRef.current;
    if (!selectedFile || !projectId) return;

    try {
      // 触发点 3: 保存前验证（阻塞式）
      if (selectedFile.fileType === 'session') {
        const result = await validationServiceRef.current.validateBeforeSave(fileContent);
        setValidationResult(result);
        setShowValidationErrors(true);

        if (!result.valid) {
          console.log(`[Validation] 保存前验证失败，发现 ${result.errors.length} 个错误`);
          message.error(`验证失败，发现 ${result.errors.length} 个错误，请修复后再保存`);
          return;
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
  }, [
    projectId,
    fileContent,
    selectedFileRef,
    validationServiceRef,
    setValidationResult,
    setShowValidationErrors,
    setSaving,
    setHasUnsavedChanges,
    setFiles,
    setSelectedFile,
  ]);

  /**
   * 创建会谈脚本
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
            await loadProjectData();
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
  }, [projectId, loadProjectData, loadFile, navigate, setSaving]);

  /**
   * 格式化YAML
   */
  const handleFormatYAML = useCallback(() => {
    const selectedFile = selectedFileRef.current;

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
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
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
  }, [
    fileContent,
    selectedFileRef,
    fixYAMLIndentation,
    validationServiceRef,
    setFileContent,
    setHasUnsavedChanges,
    setValidationResult,
    setShowValidationErrors,
  ]);

  /**
   * 发布版本
   */
  const handlePublish = useCallback(
    async (versionNote: string, project: Project | null) => {
      if (!projectId || !versionNote.trim()) {
        message.warning('Please enter release notes');
        return;
      }

      try {
        setSaving(true);

        // 获取当前最新版本号
        let newVersion = 'v1.0.0';
        try {
          const versionsRes = await versionsApi.getVersions(projectId);
          if (versionsRes.success && versionsRes.data.length > 0) {
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
        await loadProjectData();
      } catch (error) {
        console.error('发布失败:', error);
        message.error('Publish failed');
      } finally {
        setSaving(false);
      }
    },
    [projectId, loadProjectData, setSaving]
  );

  return {
    loadProjectData,
    loadFile,
    handleSave,
    handleCreateSession,
    handleFormatYAML,
    handlePublish,
  };
};
