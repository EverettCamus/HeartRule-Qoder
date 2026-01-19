import { Modal, Form, Select, Input, Alert, message, Radio, Space, Tag, Spin } from 'antd';
import React, { useState, useEffect } from 'react';

import { debugApi } from '../../api/debug';
import type { Project, ScriptFile, ProjectVersion } from '../../api/projects';
import { versionsApi } from '../../api/projects';

const { Option } = Select;

type DebugTarget = 'draft' | 'version';

interface DebugConfigModalProps {
  visible: boolean;
  currentProject: Project | null;
  sessionFiles: ScriptFile[];
  onStart: (
    sessionId: string,
    aiMessage: string,
    debugInfo?: any,
    debugTarget?: { type: DebugTarget; versionId?: string; versionNumber?: string }
  ) => void;
  onCancel: () => void;
}

const DebugConfigModal: React.FC<DebugConfigModalProps> = ({
  visible,
  currentProject,
  sessionFiles,
  onStart,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugTarget, setDebugTarget] = useState<DebugTarget>('draft');
  const [selectedVersionId, setSelectedVersionId] = useState<string | undefined>(undefined);
  const [versions, setVersions] = useState<ProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // 加载版本列表
  useEffect(() => {
    if (visible && currentProject?.id) {
      setLoadingVersions(true);
      versionsApi
        .getVersions(currentProject.id)
        .then((res) => {
          if (res.success) {
            setVersions(res.data);
            if (res.data.length > 0 && currentProject.currentVersionId) {
              setSelectedVersionId(currentProject.currentVersionId);
            }
          }
        })
        .catch((err) => {
          console.error('[DebugConfig] Failed to load versions:', err);
        })
        .finally(() => {
          setLoadingVersions(false);
        });
    }
  }, [visible, currentProject]);

  // 重置表单和状态
  useEffect(() => {
    if (visible) {
      form.resetFields();
      setError(null);
      setDebugTarget('draft');
      setSelectedVersionId(currentProject?.currentVersionId);
      // 设置默认值
      form.setFieldsValue({
        userId: 'debug_user',
      });
    }
  }, [visible, form, currentProject]);

  // 处理提交
  const handleSubmit = async () => {
    console.log('[DebugConfig] 🔵 handleSubmit called', {
      visible,
      currentProject: currentProject?.projectName,
      sessionFilesCount: sessionFiles.length,
      timestamp: new Date().toISOString(),
    });
  
    try {
      setError(null);
      console.log('[DebugConfig] ⏳ Validating form fields...');
      const values = await form.validateFields();
      console.log('[DebugConfig] ✅ Form validation passed:', values);
  
      // 检查是否选择了Session文件
      if (!values.sessionFileId) {
        console.error('[DebugConfig] ❌ No session file selected');
        setError('Please select a Session script');
        return;
      }
  
      // 根据调试目标获取脚本内容
      console.log('[DebugConfig] 🎯 Debug target:', debugTarget, 'VersionId:', selectedVersionId);
      let scriptContent: string;
      let scriptFileName: string;
      
      if (debugTarget === 'draft') {
        // 使用草稿内容
        const selectedFile = sessionFiles.find((f) => f.id === values.sessionFileId);
        if (!selectedFile) {
          console.error('[DebugConfig] ❌ Selected file not found in list');
          setError('Selected file not found');
          return;
        }
        if (!selectedFile.yamlContent) {
          console.error('[DebugConfig] ❌ File has no YAML content');
          setError('Selected file has no content');
          return;
        }
        scriptContent = selectedFile.yamlContent;
        scriptFileName = selectedFile.fileName;
        console.log('[DebugConfig] ✅ Using draft content:', {
          fileName: scriptFileName,
          contentLength: scriptContent.length,
        });
      } else {
        // 使用版本内容
        if (!selectedVersionId) {
          setError('Please select a version');
          return;
        }
        if (!currentProject?.id) {
          setError('Project ID not available');
          return;
        }
        
        // 先获取选中的文件信息（用于获取文件名）
        const selectedFile = sessionFiles.find((f) => f.id === values.sessionFileId);
        if (!selectedFile) {
          console.error('[DebugConfig] ❌ Selected file not found in list');
          setError('Selected file not found');
          return;
        }
        const targetFileName = selectedFile.fileName;
        
        console.log('[DebugConfig] 🔍 Fetching version content:', selectedVersionId);
        console.log('[DebugConfig] 🎯 Looking for session file:', targetFileName);
        try {
          const versionRes = await versionsApi.getVersion(currentProject.id, selectedVersionId);
          if (!versionRes.success || !versionRes.data) {
            throw new Error('Failed to fetch version content');
          }
          
          const versionFiles = versionRes.data.versionFiles as Record<string, any>;
          console.log('[DebugConfig] 📦 Version files:', Object.keys(versionFiles).map(key => ({
            key,
            fileName: versionFiles[key]?.fileName,
            fileType: versionFiles[key]?.fileType,
          })));
          
          // 按文件名查找session文件（而不是按ID，因为版本快照中的ID可能不同）
          const sessionFileKey = Object.keys(versionFiles).find((key) => {
            const file = versionFiles[key];
            return file.fileType === 'session' && file.fileName === targetFileName;
          });
          
          if (!sessionFileKey || !versionFiles[sessionFileKey]?.yamlContent) {
            throw new Error(`Session file "${targetFileName}" not found in version`);
          }
          
          scriptContent = versionFiles[sessionFileKey].yamlContent;
          scriptFileName = versionFiles[sessionFileKey].fileName;
          console.log('[DebugConfig] ✅ Using version content:', {
            version: versionRes.data.versionNumber,
            fileName: scriptFileName,
            fileKey: sessionFileKey,
            contentLength: scriptContent.length,
          });
        } catch (versionError: any) {
          console.error('[DebugConfig] ❌ Failed to fetch version:', versionError);
          setError(`Failed to load version: ${versionError.message}`);
          return;
        }
      }
  
      setLoading(true);
  
      try {
        // 步骤1: 导入脚本到数据库，获取scriptId
        console.log('[DebugConfig] 🔵 Step 1: Importing script to database...');
        console.log('[DebugConfig] 📡 API Call: importScript', {
          fileName: scriptFileName,
          contentLength: scriptContent.length,
          contentPreview: scriptContent.substring(0, 100) + '...',
          debugTarget,
          versionId: selectedVersionId,
        });
        const importResult = await debugApi.importScript(scriptContent, scriptFileName);
        console.log('[DebugConfig] ✅ Import result:', importResult);
  
        if (!importResult.success || !importResult.data?.scriptId) {
          console.error('[DebugConfig] ❌ Import failed: Invalid response format');
          throw new Error('Failed to import script');
        }
  
        const scriptId = importResult.data.scriptId;
        console.log('[DebugConfig] ✅ Script imported successfully, scriptId:', scriptId);
  
        // 步顤2: 创建调试会话
        console.log('[DebugConfig] 🔵 Step 2: Creating debug session...');
        const sessionData = {
          userId: values.userId || 'debug_user',
          scriptId: scriptId,
          initialVariables: {},
        };
        console.log('[DebugConfig] 📡 API Call: createDebugSession', sessionData);
        const sessionResult = await debugApi.createDebugSession(sessionData);
        console.log('[DebugConfig] ✅ Session created successfully:', {
          sessionId: sessionResult.sessionId,
          status: sessionResult.status,
          executionStatus: sessionResult.executionStatus,
          aiMessage: sessionResult.aiMessage,
        });
  
        // 成功后回调
        message.success('Debug session created successfully');
        const selectedVersion = versions.find((v) => v.id === selectedVersionId);
        const debugTargetInfo = {
          type: debugTarget,
          versionId: selectedVersionId,
          versionNumber: selectedVersion?.versionNumber,
        };
        console.log('[DebugConfig] 🎉 Calling onStart callback with:', {
          sessionId: sessionResult.sessionId,
          aiMessage: sessionResult.aiMessage || '',
          hasDebugInfo: !!sessionResult.debugInfo,
          debugInfo: sessionResult.debugInfo,
          debugTarget: debugTargetInfo,
        });
        onStart(
          sessionResult.sessionId,
          sessionResult.aiMessage || '',
          sessionResult.debugInfo,
          debugTargetInfo
        );
      } catch (apiError: any) {
        console.error('[DebugConfig] ❌ API Error:', {
          error: apiError,
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status,
          config: {
            url: apiError.config?.url,
            method: apiError.config?.method,
            data: apiError.config?.data,
          },
        });
        const errorMsg = apiError.response?.data?.error || apiError.message || 'Unknown error';
        setError(`Failed to create debug session: ${errorMsg}`);
      }
    } catch (validationError) {
      console.error('[DebugConfig] ❌ Form validation error:', validationError);
    } finally {
      setLoading(false);
      console.log('[DebugConfig] 🏁 handleSubmit completed');
    }
  };

  // 处理取消
  const handleCancel = () => {
    form.resetFields();
    setError(null);
    onCancel();
  };

  return (
    <Modal
      title="Debug Configuration"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="Start Debug"
      cancelText="Cancel"
      width={600}
    >
      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical">
        <Form.Item label="Current Project">
          <Input
            value={currentProject?.projectName || 'No project selected'}
            disabled
            style={{ color: '#000' }}
          />
        </Form.Item>

        <Form.Item
          label="Entry Session Script"
          name="sessionFileId"
          rules={[{ required: true, message: 'Please select a Session script' }]}
        >
          <Select placeholder="Select a Session script" disabled={sessionFiles.length === 0}>
            {sessionFiles.map((file) => (
              <Option key={file.id} value={file.id}>
                {file.fileName}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {sessionFiles.length === 0 && (
          <Alert
            message="No Session Scripts Available"
            description="Current project has no Session scripts. Please create one first."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item label="Debug Target">
          <Radio.Group
            value={debugTarget}
            onChange={(e) => {
              setDebugTarget(e.target.value);
              console.log('[DebugConfig] Debug target changed:', e.target.value);
            }}
          >
            <Space direction="vertical">
              <Radio value="draft">Debug Draft (current workspace)</Radio>
              <Radio value="version" disabled={versions.length === 0}>
                Debug Published Version (read-only)
              </Radio>
            </Space>
          </Radio.Group>
        </Form.Item>

        {debugTarget === 'version' && (
          <Form.Item label="Select Version">
            {loadingVersions ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Spin tip="Loading versions..." />
              </div>
            ) : (
              <Select
                value={selectedVersionId}
                onChange={(value) => {
                  setSelectedVersionId(value);
                  console.log('[DebugConfig] Version selected:', value);
                }}
                placeholder="Select a version to debug"
                showSearch
                optionFilterProp="label"
              >
                {versions.map((version) => (
                  <Option
                    key={version.id}
                    value={version.id}
                    label={version.versionNumber}
                  >
                    <Space>
                      <span>{version.versionNumber}</span>
                      {version.id === currentProject?.currentVersionId && (
                        <Tag color="green">Current</Tag>
                      )}
                      {version.isRollback === 'true' && <Tag color="orange">Rollback</Tag>}
                      <span style={{ fontSize: '12px', color: '#999' }}>
                        {new Date(version.publishedAt).toLocaleString()}
                      </span>
                    </Space>
                  </Option>
                ))}
              </Select>
            )}
          </Form.Item>
        )}

        {debugTarget === 'version' && versions.length === 0 && (
          <Alert
            message="No Published Versions"
            description="Current project has no published versions. Please publish a version first or select 'Debug Draft'."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          label="User ID"
          name="userId"
          tooltip="Simulated user identifier for debugging"
        >
          <Input placeholder="debug_user" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DebugConfigModal;
