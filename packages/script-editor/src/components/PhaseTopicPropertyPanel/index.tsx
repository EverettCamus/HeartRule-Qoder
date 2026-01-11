import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Form, Input, Button, Space, Typography, Divider, Card } from 'antd';
import React, { useState, useEffect } from 'react';
import './style.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface Variable {
  name: string;
  type?: string;
  description?: string;
}

interface PhaseTopicData {
  id: string;
  name?: string;
  description?: string;
  localVariables?: Variable[];
}

interface PhaseTopicPropertyPanelProps {
  type: 'phase' | 'topic';
  data: PhaseTopicData | null;
  onSave: (data: PhaseTopicData) => void;
}

export const PhaseTopicPropertyPanel: React.FC<PhaseTopicPropertyPanelProps> = ({
  type,
  data,
  onSave,
}) => {
  const [form] = Form.useForm();
  const [localVariables, setLocalVariables] = useState<Variable[]>([]);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        id: data.id,
        name: data.name || '',
        description: data.description || '',
      });
      setLocalVariables(data.localVariables || []);
    } else {
      form.resetFields();
      setLocalVariables([]);
    }
  }, [data, form]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (data) {
        onSave({
          id: values.id,
          name: values.name,
          description: values.description,
          localVariables: localVariables,
        });
      }
    });
  };

  const addVariable = () => {
    setLocalVariables([...localVariables, { name: '', type: 'string', description: '' }]);
  };

  const updateVariable = (index: number, field: keyof Variable, value: string) => {
    const newVariables = [...localVariables];
    newVariables[index] = { ...newVariables[index], [field]: value };
    setLocalVariables(newVariables);
  };

  const removeVariable = (index: number) => {
    const newVariables = localVariables.filter((_, i) => i !== index);
    setLocalVariables(newVariables);
  };

  if (!data) {
    return (
      <div className="phase-topic-property-panel">
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Text type="secondary">请选择一个 {type === 'phase' ? 'Phase' : 'Topic'}</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="phase-topic-property-panel">
      <div style={{ padding: '16px', height: '100%', overflowY: 'auto' }}>
        <Title level={5}>编辑 {type === 'phase' ? 'Phase' : 'Topic'} 属性</Title>

        <Form form={form} layout="vertical">
          <Form.Item label="ID" name="id" rules={[{ required: true, message: '请输入ID' }]}>
            <Input placeholder="例如: phase_01 或 topic_01" />
          </Form.Item>

          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder={`例如: ${type === 'phase' ? '开场阶段' : '初次见面'}`} />
          </Form.Item>

          <Form.Item label="说明" name="description">
            <TextArea rows={3} placeholder="描述这个阶段/主题的目的和内容..." />
          </Form.Item>
        </Form>

        <Divider />

        <div style={{ marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <Text strong>局部变量定义</Text>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addVariable}>
              添加变量
            </Button>
          </div>

          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {localVariables.length === 0 ? (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                暂无局部变量
              </Text>
            ) : (
              localVariables.map((variable, index) => (
                <Card
                  key={index}
                  size="small"
                  style={{ marginBottom: '8px' }}
                  extra={
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeVariable(index)}
                    />
                  }
                >
                  <Space direction="vertical" style={{ width: '100%' }} size="small">
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        变量名
                      </Text>
                      <Input
                        size="small"
                        value={variable.name}
                        onChange={(e) => updateVariable(index, 'name', e.target.value)}
                        placeholder="例如: user_mood"
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        类型
                      </Text>
                      <Input
                        size="small"
                        value={variable.type}
                        onChange={(e) => updateVariable(index, 'type', e.target.value)}
                        placeholder="例如: string, number, boolean"
                      />
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        说明
                      </Text>
                      <TextArea
                        size="small"
                        rows={2}
                        value={variable.description}
                        onChange={(e) => updateVariable(index, 'description', e.target.value)}
                        placeholder="变量用途说明"
                      />
                    </div>
                  </Space>
                </Card>
              ))
            )}
          </Space>
        </div>

        <Divider />

        <Button type="primary" block onClick={handleSave}>
          保存修改
        </Button>
      </div>
    </div>
  );
};
