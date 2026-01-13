import { Modal, Form, Select, Input, Alert, message } from 'antd';
import React, { useState, useEffect } from 'react';

import { debugApi } from '../../api/debug';
import type { Project, ScriptFile } from '../../api/projects';

const { Option } = Select;

interface DebugConfigModalProps {
  visible: boolean;
  currentProject: Project | null;
  sessionFiles: ScriptFile[];
  onStart: (sessionId: string, aiMessage: string) => void;
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
    try {
      setError(null);
      const values = await form.validateFields();

      // 检查是否选择了Session文件
      if (!values.sessionFileId) {
        setError('Please select a Session script');
        return;
      }

      // 查找选中的文件
      const selectedFile = sessionFiles.find((f) => f.id === values.sessionFileId);
      if (!selectedFile) {
        setError('Selected file not found');
        return;
      }

      // 检查文件内容
      if (!selectedFile.yamlContent) {
        setError('Selected file has no content');
        return;
      }

      setLoading(true);

      try {
        // 步骤1: 导入脚本到数据库，获取scriptId
        const importResult = await debugApi.importScript(
          selectedFile.yamlContent,
          selectedFile.fileName
        );

        if (!importResult.success || !importResult.data?.scriptId) {
          throw new Error('Failed to import script');
        }

        const scriptId = importResult.data.scriptId;

        // 步骤2: 创建调试会话
        const sessionResult = await debugApi.createDebugSession({
          userId: values.userId || 'debug_user',
          scriptId: scriptId,
          initialVariables: {},
        });

        // 成功后回调
        message.success('Debug session created successfully');
        onStart(sessionResult.sessionId, sessionResult.aiMessage || '');
      } catch (apiError: any) {
        console.error('API Error:', apiError);
        const errorMsg = apiError.response?.data?.error || apiError.message || 'Unknown error';
        setError(`Failed to create debug session: ${errorMsg}`);
      }
    } catch (validationError) {
      console.error('Form validation error:', validationError);
    } finally {
      setLoading(false);
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
