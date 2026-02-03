import React, { useState } from 'react';
import { Modal, Form, Input, message } from 'antd';
import { projectsApi } from '../../api/projects';

const { TextArea } = Input;

interface TemplateScheme {
  name: string;
  description: string;
  isDefault: boolean;
}

interface EditSchemeModalProps {
  visible: boolean;
  projectId: string;
  scheme: TemplateScheme;
  onSuccess: () => void;
  onCancel: () => void;
}

const EditSchemeModal: React.FC<EditSchemeModalProps> = ({
  visible,
  projectId,
  scheme,
  onSuccess,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      await projectsApi.updateTemplateScheme(projectId, scheme.name, {
        description: values.description,
      });

      message.success(`方案 "${scheme.name}" 更新成功`);
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      console.error('Failed to update scheme:', error);
      if (error?.response?.data?.error) {
        message.error(error.response.data.error);
      } else if (error?.errorFields) {
        // 表单验证错误，不需要显示message
      } else {
        message.error('更新方案失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={`编辑方案: ${scheme.name}`}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      width={600}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          description: scheme.description,
        }}
      >
        <Form.Item
          name="description"
          label="方案描述"
          rules={[{ required: true, message: '请输入方案描述' }]}
        >
          <TextArea
            rows={3}
            placeholder="简要描述这个模板方案的用途和特点"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default EditSchemeModal;
