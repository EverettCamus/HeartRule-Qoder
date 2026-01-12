import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  Form,
  Input,
  Button,
  Space,
  Typography,
  Divider,
  Card,
  Tag,
  Row,
  Col,
  Collapse,
} from 'antd';
import React, { useRef } from 'react';

import type { Action } from '../../types/action';
import './style.css';

const { TextArea } = Input;
const { Text } = Typography;
const { Panel } = Collapse;

interface ActionPropertyPanelProps {
  action: Action | null;
  actionIndex: number | null;
  onSave: (updatedAction: Action) => void;
}

export const ActionPropertyPanel: React.FC<ActionPropertyPanelProps> = ({
  action,
  actionIndex,
  onSave,
}) => {
  const [form] = Form.useForm();
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 当选中的 Action 变化时,更新表单
  React.useEffect(() => {
    if (action) {
      // 根据不同类型的 Action 填充表单
      const formValues: any = {
        condition: action.condition || '',
      };

      if (action.type === 'ai_say') {
        formValues.ai_say = action.ai_say;
        formValues.tone = action.tone || '';
      } else if (action.type === 'ai_ask') {
        formValues.ai_ask = action.ai_ask;
        formValues.tone = action.tone || '';
        formValues.exit = action.exit || '';
        formValues.tolist = action.tolist || '';
        formValues.output = action.output || [];
      } else if (action.type === 'ai_think') {
        formValues.think = action.think;
        formValues.output = action.output || [];
      } else if (action.type === 'use_skill') {
        formValues.skill = action.skill;
        formValues.input = action.input || [];
        formValues.output = action.output || [];
      } else if (action.type === 'show_form') {
        formValues.form_id = action.form_id;
        formValues.output = action.output || [];
      } else if (action.type === 'show_pic') {
        formValues.pic_url = action.pic_url;
        formValues.description = action.description || '';
      }

      form.setFieldsValue(formValues);
    } else {
      form.resetFields();
    }
  }, [action, form]);

  const handleSave = () => {
    form.validateFields().then((values) => {
      if (!action) return;

      // 构建更新后的 Action
      const updatedAction: Action = {
        ...action,
        condition: values.condition || undefined,
      };

      if (action.type === 'ai_say') {
        Object.assign(updatedAction, {
          ai_say: values.ai_say,
          tone: values.tone || undefined,
        });
      } else if (action.type === 'ai_ask') {
        Object.assign(updatedAction, {
          ai_ask: values.ai_ask,
          tone: values.tone || undefined,
          exit: values.exit || undefined,
          tolist: values.tolist || undefined,
          output: values.output || undefined,
        });
      } else if (action.type === 'ai_think') {
        Object.assign(updatedAction, {
          think: values.think,
          output: values.output || undefined,
        });
      } else if (action.type === 'use_skill') {
        Object.assign(updatedAction, {
          skill: values.skill,
          input: values.input || undefined,
          output: values.output || undefined,
        });
      } else if (action.type === 'show_form') {
        Object.assign(updatedAction, {
          form_id: values.form_id,
          output: values.output || undefined,
        });
      } else if (action.type === 'show_pic') {
        Object.assign(updatedAction, {
          pic_url: values.pic_url,
          description: values.description || undefined,
        });
      }

      onSave(updatedAction);
    });
  };

  // 自动保存函数
  const triggerAutoSave = React.useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 600); // 600ms 防抖延迟
  }, [action, form]);

  // 清理定时器
  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  if (!action) {
    return (
      <div className="action-property-panel-empty">
        <Text type="secondary">Please select an Action node to edit</Text>
      </div>
    );
  }

  return (
    <div className="action-property-panel">
      <Card
        title={
          <Space>
            <Text strong>Action Property Settings</Text>
            <Tag color="blue">#{(actionIndex ?? 0) + 1}</Tag>
          </Space>
        }
        size="small"
      >
        <Form form={form} layout="vertical" onValuesChange={triggerAutoSave}>
          {/* AI Say 类型 */}
          {action.type === 'ai_say' && (
            <>
              <Form.Item
                label="Prompt Content"
                name="ai_say"
                rules={[{ required: true, message: 'Please enter the prompt content' }]}
              >
                <TextArea rows={8} placeholder="Enter the prompt for AI speaking..." showCount />
              </Form.Item>

              <Form.Item label="Tone Style" name="tone">
                <Input placeholder="e.g. gentle, encouraging, serious" />
              </Form.Item>
            </>
          )}

          {/* AI Ask 类型 */}
          {action.type === 'ai_ask' && (
            <>
              <Form.Item
                label="Prompt Content"
                name="ai_ask"
                rules={[{ required: true, message: 'Please enter the prompt content' }]}
              >
                <TextArea rows={8} placeholder="Enter the prompt for AI questions..." showCount />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Tone Style" name="tone">
                    <Input placeholder="e.g. gentle, encouraging" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Append to List" name="tolist">
                    <Input placeholder="List variable name" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Exit Condition" name="exit">
                <TextArea rows={2} placeholder="Describe when to exit this Action..." />
              </Form.Item>

              <Divider orientation="left">Output Variable Configuration</Divider>
              <Form.List name="output">
                {(fields, { add, remove}) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Form.Item
                          {...field}
                          label="Variable Operation"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="get: variable name to extract" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="Variable Definition"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="define: variable description" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Add Output Variable
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          {/* AI Think 类型 */}
          {action.type === 'ai_think' && (
            <>
              <Form.Item
                label="Thinking Prompt"
                name="think"
                rules={[{ required: true, message: 'Please enter the thinking prompt' }]}
              >
                <TextArea rows={8} placeholder="Enter the prompt for AI thinking..." showCount />
              </Form.Item>

              <Divider orientation="left">Output Variable Configuration</Divider>
              <Form.List name="output">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Row gutter={8}>
                          <Col span={12}>
                            <Form.Item
                              {...field}
                              label="Variable Operation"
                              name={[field.name, 'get']}
                              style={{ marginBottom: 8 }}
                            >
                              <Input placeholder="get: extract" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              {...field}
                              label="Or Set"
                              name={[field.name, 'set']}
                              style={{ marginBottom: 8 }}
                            >
                              <Input placeholder="set: assign" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item
                          {...field}
                          label="Variable Definition"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="define: description" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="Default Value"
                          name={[field.name, 'value']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="value: default value" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Add Output Variable
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          {/* Use Skill 类型 */}
          {action.type === 'use_skill' && (
            <>
              <Form.Item
                label="Skill Name"
                name="skill"
                rules={[{ required: true, message: 'Please enter the skill name' }]}
              >
                <Input placeholder="Enter the skill name to use..." />
              </Form.Item>

              <Divider orientation="left">Input Parameter Configuration</Divider>
              <Form.List name="input">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Form.Item
                          {...field}
                          label="Parameter Name"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="Parameter name" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="Parameter Description"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Parameter description" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Add Input Parameter
                    </Button>
                  </>
                )}
              </Form.List>

              <Divider orientation="left">Output Variable Configuration</Divider>
              <Form.List name="output">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Form.Item
                          {...field}
                          label="Output Variable Name"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="Variable name" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="Variable Description"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Variable description" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Add Output Variable
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          {/* Show Form 类型 */}
          {action.type === 'show_form' && (
            <>
              <Form.Item
                label="Form ID"
                name="form_id"
                rules={[{ required: true, message: 'Please enter the form ID' }]}
              >
                <Input placeholder="Enter the form ID to display..." />
              </Form.Item>

              <Divider orientation="left">Output Variable Configuration</Divider>
              <Form.List name="output">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                          />
                        }
                      >
                        <Form.Item
                          {...field}
                          label="Form Field Name"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="Field name" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="Field Description"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="Field description" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Add Output Variable
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}

          {/* Show Pic 类型 */}
          {action.type === 'show_pic' && (
            <>
              <Form.Item
                label="Image URL"
                name="pic_url"
                rules={[{ required: true, message: 'Please enter the image URL' }]}
              >
                <Input placeholder="Enter the image URL..." />
              </Form.Item>

              <Form.Item label="Image Description" name="description">
                <TextArea rows={3} placeholder="Enter the image description (optional)..." />
              </Form.Item>
            </>
          )}

          {/* 通用：执行条件 */}
          <Divider orientation="left">Advanced Settings</Divider>
          <Collapse ghost>
            <Panel header="Execution Condition (optional)" key="condition">
              <Form.Item name="condition" style={{ marginBottom: 0 }}>
                <TextArea rows={3} placeholder="e.g. {variableName} == 'true'" />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>
      </Card>
    </div>
  );
};
