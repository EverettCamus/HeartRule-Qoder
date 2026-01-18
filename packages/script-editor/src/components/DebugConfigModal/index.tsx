import { Modal, Form, Select, Input, Alert, message } from 'antd';
import React, { useState, useEffect } from 'react';

import { debugApi } from '../../api/debug';
import type { Project, ScriptFile } from '../../api/projects';

const { Option } = Select;

interface DebugConfigModalProps {
  visible: boolean;
  currentProject: Project | null;
  sessionFiles: ScriptFile[];
  onStart: (sessionId: string, aiMessage: string, debugInfo?: any) => void;
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

  // 重置表单和状态
  useEffect(() => {
    if (visible) {
      form.resetFields();
      setError(null);
      // 设置默认值
      form.setFieldsValue({
        userId: 'debug_user',
      });
    }
  }, [visible, form]);

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
  
      // 查找选中的文件
      console.log('[DebugConfig] 🔍 Finding selected file:', values.sessionFileId);
      const selectedFile = sessionFiles.find((f) => f.id === values.sessionFileId);
      if (!selectedFile) {
        console.error('[DebugConfig] ❌ Selected file not found in list');
        setError('Selected file not found');
        return;
      }
      console.log('[DebugConfig] ✅ Selected file found:', {
        id: selectedFile.id,
        fileName: selectedFile.fileName,
        fileType: selectedFile.fileType,
        hasContent: !!selectedFile.yamlContent,
        contentLength: selectedFile.yamlContent?.length || 0,
      });
  
      // 检查文件内容
      if (!selectedFile.yamlContent) {
        console.error('[DebugConfig] ❌ File has no YAML content');
        setError('Selected file has no content');
        return;
      }
  
      setLoading(true);
  
      try {
        // 步顤1: 导入脚本到数据库，获取scriptId
        console.log('[DebugConfig] 🔵 Step 1: Importing script to database...');
        console.log('[DebugConfig] 📡 API Call: importScript', {
          fileName: selectedFile.fileName,
          contentLength: selectedFile.yamlContent.length,
          contentPreview: selectedFile.yamlContent.substring(0, 100) + '...',
        });
        const importResult = await debugApi.importScript(
          selectedFile.yamlContent,
          selectedFile.fileName
        );
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
        console.log('[DebugConfig] 🎉 Calling onStart callback with:', {
          sessionId: sessionResult.sessionId,
          aiMessage: sessionResult.aiMessage || '',
          hasDebugInfo: !!sessionResult.debugInfo,
          debugInfo: sessionResult.debugInfo,
        });
        onStart(sessionResult.sessionId, sessionResult.aiMessage || '', sessionResult.debugInfo);
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
