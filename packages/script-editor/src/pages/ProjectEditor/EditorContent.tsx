import { CodeOutlined, AppstoreOutlined, FileOutlined } from '@ant-design/icons';
import { Layout, Typography, Space, Button, Divider, Input, Alert } from 'antd';
import React, { useState, useEffect } from 'react';

import { projectsApi } from '../../api/projects';
import type { ScriptFile } from '../../api/projects';
import { ActionNodeList } from '../../components/ActionNodeList';
import type { ActionNodeListRef } from '../../components/ActionNodeList';
import { ActionPropertyPanel } from '../../components/ActionPropertyPanel';
import { PhaseTopicPropertyPanel } from '../../components/PhaseTopicPropertyPanel';
import { SessionPropertyPanel } from '../../components/SessionPropertyPanel';
import type { SessionData, TemplateScheme } from '../../components/SessionPropertyPanel';
import ValidationErrorPanel from '../../components/ValidationErrorPanel';
import type { ValidationResult } from '../../services/validation-service';
import type { PhaseWithTopics } from '../../services/YamlService';
import type { Action } from '../../types/action';
import { isErrorForAction } from '../../utils/validation-path-parser';

const { Content } = Layout;
const { Text } = Typography;
const { TextArea } = Input;

interface EditorContentProps {
  projectId: string;  // 新增：用于获取模板方案列表
  editMode: 'yaml' | 'visual';
  selectedFile: ScriptFile | null;
  fileContent: string;
  currentPhases: PhaseWithTopics[];
  parsedScript: any;  // YAML解析的原始对象，可能是新格式或旧格式
  validationResult: ValidationResult | null;
  showValidationErrors: boolean;
  selectedActionPath: { phaseIndex: number; topicIndex: number; actionIndex: number } | null;
  selectedPhasePath: { phaseIndex: number } | null;
  selectedTopicPath: { phaseIndex: number; topicIndex: number } | null;
  editingType: 'phase' | 'topic' | 'action' | 'session' | null;
  actionNodeListRef: React.RefObject<ActionNodeListRef>;
  onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onModeChange: (mode: 'yaml' | 'visual') => void;
  onCloseValidationErrors: () => void;
  onSelectAction: (path: { phaseIndex: number; topicIndex: number; actionIndex: number }) => void;
  onSelectPhase: (path: { phaseIndex: number }) => void;
  onSelectTopic: (path: { phaseIndex: number; topicIndex: number }) => void;
  onAddPhase: () => void;
  onAddTopic: (phaseIndex: number) => void;
  onAddAction: (phaseIndex: number, topicIndex: number, actionType: string) => void;
  onDeletePhase: (phaseIndex: number) => void;
  onDeleteTopic: (phaseIndex: number, topicIndex: number) => void;
  onDeleteAction: (phaseIndex: number, topicIndex: number, actionIndex: number) => void;
  onMovePhase: (fromIndex: number, toIndex: number) => void;
  onMoveTopic: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number
  ) => void;
  onMoveAction: (
    fromPhaseIndex: number,
    fromTopicIndex: number,
    fromActionIndex: number,
    toPhaseIndex: number,
    toTopicIndex: number,
    toActionIndex: number
  ) => void;
  onActionSave: (action: Action) => void;
  onPhaseSave: (data: any) => void;
  onTopicSave: (data: any) => void;
  onSessionSave: (data: SessionData) => void;
  onEditSessionConfig: () => void;
  parseYamlToScript: (content: string) => void;
  // 模板管理相关回调
  onManageSchemes?: () => void;
  onViewSchemeDetails?: (schemeName: string) => void;
}

const getFileIcon = (fileType?: string) => {
  switch (fileType) {
    case 'session':
      return <FileOutlined style={{ color: '#1890ff' }} />;
    default:
      return <FileOutlined />;
  }
};

const EditorContent: React.FC<EditorContentProps> = ({
  projectId,
  editMode,
  selectedFile,
  fileContent,
  currentPhases,
  parsedScript,
  validationResult,
  showValidationErrors,
  selectedActionPath,
  selectedPhasePath,
  selectedTopicPath,
  editingType,
  actionNodeListRef,
  onContentChange,
  onModeChange,
  onCloseValidationErrors,
  onSelectAction,
  onSelectPhase,
  onSelectTopic,
  onAddPhase,
  onAddTopic,
  onAddAction,
  onDeletePhase,
  onDeleteTopic,
  onDeleteAction,
  onMovePhase,
  onMoveTopic,
  onMoveAction,
  onActionSave,
  onPhaseSave,
  onTopicSave,
  onSessionSave,
  onEditSessionConfig,
  parseYamlToScript,
  onManageSchemes,
  onViewSchemeDetails,
}) => {
  // 状态：可用的模板方案列表
  const [availableSchemes, setAvailableSchemes] = useState<TemplateScheme[]>([]);

  // 加载模板方案列表
  useEffect(() => {
    const fetchSchemes = async () => {
      if (!projectId) return;
      
      try {
        const schemes = await projectsApi.getTemplateSchemes(projectId);
        setAvailableSchemes(schemes);
        console.log('[EditorContent] 加载模板方案:', schemes);
      } catch (error) {
        console.error('[EditorContent] 获取模板方案失败:', error);
        // 设置默认方案作为备用
        setAvailableSchemes([
          { name: 'default', description: '系统默认模板', isDefault: true },
        ]);
      }
    };

    fetchSchemes();
  }, [projectId]);

  return (
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
        {selectedFile || fileContent ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* 文件面包屑 */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0f0f0' }}>
              <Space>
                {selectedFile && getFileIcon(selectedFile.fileType)}
                <Text strong>{selectedFile?.fileName || '模板文件'}</Text>
                {selectedFile && (
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Last modified: {new Date(selectedFile.updatedAt).toLocaleString()}
                  </Text>
                )}

                {/* 如果是会谈脚本，显示模式切换按钮 */}
                {selectedFile?.fileType === 'session' && (
                  <>
                    <Divider type="vertical" />
                    <Button.Group size="small">
                      <Button
                        icon={<CodeOutlined />}
                        type={editMode === 'yaml' ? 'primary' : 'default'}
                        onClick={() => {
                          console.log('切换到 YAML 模式');
                          onModeChange('yaml');
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
                          onModeChange('visual');
                        }}
                      >
                        Visual Editor
                      </Button>
                    </Button.Group>
                    <Text type="secondary" style={{ fontSize: '12px', marginLeft: '8px' }}>
                      {editMode === 'visual' &&
                        `(${currentPhases.reduce(
                          (total, phase) =>
                            total + phase.topics.reduce((t, topic) => t + topic.actions.length, 0),
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
                {/* 验证错误面板 */}
                {validationResult && !validationResult.valid && showValidationErrors && (
                  <ValidationErrorPanel
                    errors={validationResult.errors}
                    onClose={onCloseValidationErrors}
                  />
                )}

                <TextArea
                  value={fileContent}
                  onChange={onContentChange}
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
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* 验证错误摘要（Visual Editor 模式） */}
                {validationResult && !validationResult.valid && showValidationErrors && (
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                    <Alert
                      message={`发现 ${validationResult.errors.length} 个脚本验证错误`}
                      description="请检查并修复错误后保存。点击有错误的 Action 查看详情。"
                      type="error"
                      showIcon
                      closable
                      onClose={onCloseValidationErrors}
                    />
                  </div>
                )}

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
                    {/* Session 配置按钮 */}
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                      <Button
                        icon={<AppstoreOutlined />}
                        onClick={onEditSessionConfig}
                        block
                        type={editingType === 'session' ? 'primary' : 'default'}
                      >
                        Session 配置
                      </Button>
                    </div>

                    <ActionNodeList
                      ref={actionNodeListRef}
                      phases={currentPhases}
                      selectedActionPath={selectedActionPath}
                      selectedPhasePath={selectedPhasePath}
                      selectedTopicPath={selectedTopicPath}
                      onSelectAction={onSelectAction}
                      onSelectPhase={onSelectPhase}
                      onSelectTopic={onSelectTopic}
                      onAddPhase={onAddPhase}
                      onAddTopic={onAddTopic}
                      onAddAction={onAddAction}
                      onDeletePhase={onDeletePhase}
                      onDeleteTopic={onDeleteTopic}
                      onDeleteAction={onDeleteAction}
                      onMovePhase={onMovePhase}
                      onMoveTopic={onMoveTopic}
                      onMoveAction={onMoveAction}
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
                        onSave={onPhaseSave}
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
                        onSave={onTopicSave}
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
                        onSave={onActionSave}
                        validationErrors={
                          validationResult?.errors.filter((error) =>
                            isErrorForAction(
                              error.path,
                              selectedActionPath.phaseIndex,
                              selectedActionPath.topicIndex,
                              selectedActionPath.actionIndex
                            )
                          ) ?? []
                        }
                      />
                    )}

                    {editingType === 'session' && parsedScript && (
                      <SessionPropertyPanel
                        sessionData={{
                          name: (parsedScript as any).session?.session_name || '',
                          description: (parsedScript as any).session?.description,
                          version: (parsedScript as any).session?.version,
                          template_scheme: (parsedScript as any).session?.template_scheme,
                        }}
                        availableSchemes={availableSchemes}
                        onSave={onSessionSave}
                        onManageSchemes={onManageSchemes}
                        onViewSchemeDetails={onViewSchemeDetails}
                      />
                    )}

                    {editingType === null && (
                      <div style={{ padding: '24px', textAlign: 'center' }}>
                        <Text type="secondary">
                          Please select a Phase, Topic, or Action on the left
                        </Text>
                      </div>
                    )}
                  </div>
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
  );
};

export default EditorContent;
