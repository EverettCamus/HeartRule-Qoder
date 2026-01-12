import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { Form, Input, Button, Space, Typography, Divider, Card } from 'antd';
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  // 自动保存函数
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 600); // 600ms 防抖延迟
  }, [localVariables, data]);

  // 监听 localVariables 变化触发自动保存
  useEffect(() => {
    // 只有在 data 存在且 localVariables 已初始化后才触发自动保存
    if (data && localVariables !== data.localVariables) {
      triggerAutoSave();
    }
  }, [localVariables, data, triggerAutoSave]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

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

        <Form form={form} layout="vertical" onValuesChange={triggerAutoSave}>
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
            <Text strong>Local Variable Definitions</Text>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addVariable}>
              Add Variable
            </Button>
          </div>

          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {localVariables.length === 0 ? (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                No local variables
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
                        Variable Name
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
                        Type
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
                        Description
                      </Text>
                      <TextArea
                        size="small"
                        rows={2}
                        value={variable.description}
                        onChange={(e) => updateVariable(index, 'description', e.target.value)}
                        placeholder="Variable usage description"
                      />
                    </div>
                  </Space>
                </Card>
              ))
            )}  
          </Space>
        </div>
      </div>
    </div>
  );
};
