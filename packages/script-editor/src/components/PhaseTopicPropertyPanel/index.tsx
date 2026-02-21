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
  topic_goal?: string; // Story 2.1: Topic目标描述
  strategy?: string; // Story 2.1: Topic执行策略
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
  const lastDataIdRef = useRef<string | null>(null); // 仅存储data.id，用于判断是否切换了对象
  const isSavingRef = useRef<boolean>(false); // 标记是否正在保存中（包括保存后的数据回流）

  useEffect(() => {
    if (data) {
      // 如果正在执行自动保存或保存后数据回流中，跳过表单更新以避免清空用户输入
      if (autoSaveTimerRef.current !== null || isSavingRef.current) {
        console.log('[PhaseTopicPropertyPanel] ⏳ 保存进行中，跳过表单更新', {
          hasTimer: autoSaveTimerRef.current !== null,
          isSaving: isSavingRef.current,
        });
        return;
      }

      // 关键修复：只有当data.id变化时才更新表单（切换Topic/Phase）
      // 或者是Undo后的数据恢复（通过比较topic_goal/strategy字段）
      const idChanged = data.id !== lastDataIdRef.current;
      const currentFormGoal = form.getFieldValue('topic_goal') || '';
      const currentFormStrategy = form.getFieldValue('strategy') || '';
      const dataGoal = data.topic_goal || '';
      const dataStrategy = data.strategy || '';
      const contentChanged =
        type === 'topic' && (currentFormGoal !== dataGoal || currentFormStrategy !== dataStrategy);

      console.log('[PhaseTopicPropertyPanel] useEffect检查:', {
        dataId: data.id,
        lastDataId: lastDataIdRef.current,
        idChanged,
        contentChanged,
        currentFormGoal,
        dataGoal,
        currentFormStrategy,
        dataStrategy,
      });

      if (idChanged || contentChanged) {
        console.log(
          '[PhaseTopicPropertyPanel] 🔄 更新表单，原因:',
          idChanged ? 'ID变化' : 'Content变化'
        );
        form.setFieldsValue({
          id: data.id,
          name: data.name || '',
          description: data.description || '',
          topic_goal: data.topic_goal || '',
          strategy: data.strategy || '',
        });
        setLocalVariables(data.localVariables || []);
        lastDataIdRef.current = data.id;
      }
    } else {
      form.resetFields();
      setLocalVariables([]);
      lastDataIdRef.current = null;
    }
  }, [data, form, type]);

  // 保存函数
  const handleSave = useCallback(() => {
    console.log('[PhaseTopicPropertyPanel] 💾 开始保存...');
    isSavingRef.current = true; // 标记保存开始

    form
      .validateFields()
      .then((values) => {
        if (data) {
          // 检查数据是否真的变化了，避免无意义的更新
          const hasChanged =
            values.id !== data.id ||
            values.name !== data.name ||
            values.description !== data.description ||
            values.topic_goal !== data.topic_goal ||
            values.strategy !== data.strategy ||
            JSON.stringify(localVariables) !== JSON.stringify(data.localVariables || []);

          console.log('[PhaseTopicPropertyPanel] 保存检查:', {
            hasChanged,
            formTopicGoal: values.topic_goal,
            dataTopicGoal: data.topic_goal,
            formStrategy: values.strategy,
            dataStrategy: data.strategy,
          });

          if (hasChanged) {
            const savedData: PhaseTopicData = {
              id: values.id,
              name: values.name,
              description: values.description,
              localVariables: localVariables,
            };

            // 只在Topic类型且有值时才包含topic_goal和strategy
            if (type === 'topic') {
              // 使用 !== undefined 检查,允许空字符串
              if (values.topic_goal !== undefined) savedData.topic_goal = values.topic_goal;
              if (values.strategy !== undefined) savedData.strategy = values.strategy;
            }

            console.log('[PhaseTopicPropertyPanel] ✅ 调用 onSave，保存数据:', savedData);
            onSave(savedData);

            // 延迟清除保存标志，给足够时间让数据回流完成
            // 200ms足以让 syncPhasesToYaml → setFileContent → 父组件重渲染 完成
            setTimeout(() => {
              isSavingRef.current = false;
              console.log('[PhaseTopicPropertyPanel] 🏁 保存标志清除');
            }, 200);
          } else {
            console.log('[PhaseTopicPropertyPanel] ⏭️ 数据未变化，跳过保存');
            isSavingRef.current = false; // 立即清除标志
          }
        } else {
          isSavingRef.current = false;
        }
      })
      .catch(() => {
        isSavingRef.current = false; // 验证失败时也清除标志
      });
  }, [form, data, localVariables, onSave, type]);

  // 自动保存函数
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    console.log('[PhaseTopicPropertyPanel] ⏰ 触发自动保存（600ms后执行）');
    autoSaveTimerRef.current = setTimeout(() => {
      console.log('[PhaseTopicPropertyPanel] ⏰ 自动保存定时器触发');
      handleSave();
      autoSaveTimerRef.current = null; // 清空定时器引用
    }, 600); // 600ms 防抖延迟
  }, [handleSave]);

  // 监听 localVariables 变化触发自动保存
  useEffect(() => {
    // 使用 JSON.stringify 深度比较,避免引用比较导致的无限循环
    const currentVars = JSON.stringify(localVariables);
    const initialVars = JSON.stringify(data?.localVariables || []);

    // 只有在实际内容变化时才触发自动保存
    if (data && currentVars !== initialVars) {
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

          {/* Story 2.1: Topic专属字段 */}
          {type === 'topic' && (
            <>
              <Form.Item label="Topic目标" name="topic_goal" tooltip="描述该Topic要达成的具体目标">
                <TextArea
                  rows={2}
                  placeholder="例如: 收集来访者童年期主要抚养者及关系模式"
                  maxLength={500}
                />
              </Form.Item>

              <Form.Item
                label="执行策略"
                name="strategy"
                tooltip="供TopicPlanner规划时参考的策略要点(Story 2.1)"
              >
                <TextArea
                  rows={6}
                  placeholder={`例如:\n1. 优先收集主要抚养者信息\n2. 每位抚养者需收集:称呼、同住情况、深刻记忆\n3. 时间不足时保证主要抚养者完整信息`}
                  maxLength={2000}
                />
              </Form.Item>
            </>
          )}
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
