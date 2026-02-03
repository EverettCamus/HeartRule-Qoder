import React, { useState } from 'react';
import { Modal, Form, Input, Select, message } from 'antd';
import { projectsApi } from '../../api/projects';

const { TextArea } = Input;
const { Option } = Select;

interface TemplateScheme {
  name: string;
  description: string;
  isDefault: boolean;
}

interface CreateSchemeModalProps {
  visible: boolean;
  projectId: string;
  existingSchemes: TemplateScheme[];
  onSuccess: () => void;
  onCancel: () => void;
}

const CreateSchemeModal: React.FC<CreateSchemeModalProps> = ({
  visible,
  projectId,
  existingSchemes,
  onSuccess,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      await projectsApi.createTemplateScheme(projectId, {
        name: values.name,
        description: values.description,
        copyFrom: values.copyFrom,
      });

      message.success(`方案 "${values.name}" 创建成功`);
      form.resetFields();
      onSuccess();
    } catch (error: any) {
      console.error('Failed to create scheme:', error);
      if (error?.response?.data?.error) {
        message.error(error.response.data.error);
      } else if (error?.errorFields) {
        // 表单验证错误，不需要显示message
      } else {
        message.error('创建方案失败');
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
      title="创建模板方案"
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText="创建"
      cancelText="取消"
      width={800}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          copyFrom: 'default',
        }}
      >
        <Form.Item
          name="name"
          label="方案名称"
          rules={[
            { required: true, message: '请输入方案名称' },
            {
              pattern: /^[a-zA-Z0-9_-]+$/,
              message: '方案名称只能包含字母、数字、下划线和连字符',
            },
            {
              validator: (_, value) => {
                if (value && existingSchemes.some((s) => s.name === value)) {
                  return Promise.reject(new Error('方案名称已存在'));
                }
                if (value === 'default') {
                  return Promise.reject(new Error('不能使用保留名称 "default"'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Input placeholder="例如: crisis_intervention" />
        </Form.Item>

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

        <Form.Item
          name="copyFrom"
          label="复制自"
          tooltip="选择一个现有方案作为模板，新方案会复制该方案的所有模板文件"
        >
          <Select placeholder="选择要复制的方案">
            {existingSchemes.map((scheme) => (
              <Option key={scheme.name} value={scheme.name}>
                {scheme.name} {scheme.isDefault && '(系统默认)'}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateSchemeModal;
