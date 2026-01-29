import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ValidationErrorDetail } from '@heartrule/core-engine';
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
  Switch,
  InputNumber,
  Checkbox,
  Alert,
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
  validationErrors?: ValidationErrorDetail[];
}

export const ActionPropertyPanel: React.FC<ActionPropertyPanelProps> = ({
  action,
  actionIndex,
  onSave,
  validationErrors = [],
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
        // 兼容旧字段和新字段
        formValues.content = action.content || action.ai_say || '';
        formValues.tone = action.tone || '';
        formValues.require_acknowledgment = action.require_acknowledgment ?? true;
        formValues.max_rounds = action.max_rounds ?? 5;
        formValues.exit_criteria = {
          understanding_threshold: action.exit_criteria?.understanding_threshold ?? 80,
          has_questions: action.exit_criteria?.has_questions ?? false,
        };
      } else if (action.type === 'ai_ask') {
        formValues.ai_ask = action.ai_ask;
        formValues.tone = action.tone || '';
        formValues.exit = action.exit || '';
        formValues.tolist = action.tolist || '';
        formValues.question_template = action.question_template || action.ai_ask;
        formValues.required = action.required ?? false;
        formValues.max_rounds = action.max_rounds ?? 3;
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
          content: values.content, // 使用新字段
          ai_say: values.content, // 同时更新旧字段以保持向后兼容
          tone: values.tone || undefined,
          require_acknowledgment: values.require_acknowledgment,
          max_rounds: values.max_rounds,
          exit_criteria: values.exit_criteria, // 新增退出条件
        });
      } else if (action.type === 'ai_ask') {
        Object.assign(updatedAction, {
          ai_ask: values.ai_ask,
          tone: values.tone || undefined,
          exit: values.exit || undefined,
          tolist: values.tolist || undefined,
          question_template: values.question_template || values.ai_ask,
          required: values.required,
          max_rounds: values.max_rounds,
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
      {/* 验证错误提示 */}
      {validationErrors.length > 0 && (
        <div style={{ padding: '16px', paddingBottom: 0 }}>
          <Alert
            message={`此 Action 存在 ${validationErrors.length} 个验证错误`}
            description={
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {validationErrors.map((error, index) => (
                  <li key={index}>
                    <Text type="danger">{error.message}</Text>
                    {error.suggestion && (
                      <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
                        💡 {error.suggestion}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            }
            type="error"
            showIcon
            closable={false}
            style={{ marginBottom: '16px' }}
          />
        </div>
      )}

      <Card
        title={
          <Space>
            <Text strong>Action Property Settings</Text>
            <Tag color="blue">#{(actionIndex ?? 0) + 1}</Tag>
            {validationErrors.length > 0 && <Tag color="error">有错误</Tag>}
          </Space>
        }
        size="small"
      >
        <Form form={form} layout="vertical" onValuesChange={triggerAutoSave}>
          {/* AI Say 类型 */}
          {action.type === 'ai_say' && (
            <>
              <Form.Item
                label="Lecture Content"
                name="content"
                rules={[{ required: true, message: 'Please enter the lecture content' }]}
                tooltip="Core content for lecture/persuasion, supports multi-line text and script variables"
              >
                <TextArea
                  rows={10}
                  placeholder="Enter lecture content, can use variables like {variable_name}..."
                  showCount
                />
              </Form.Item>

              <Divider orientation="left">Interaction Settings</Divider>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label="Require Acknowledgment"
                    name="require_acknowledgment"
                    valuePropName="checked"
                    tooltip="Whether user reply is required before continuing"
                  >
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="Max Rounds"
                    name="max_rounds"
                    tooltip="Protection mechanism against infinite loops"
                    rules={[{ type: 'number', min: 1, max: 20 }]}
                  >
                    <InputNumber min={1} max={20} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Tone Style" name="tone">
                <Input placeholder="e.g. gentle, encouraging, serious" />
              </Form.Item>

              <Divider orientation="left">Exit Conditions</Divider>

              <Collapse ghost defaultActiveKey={[]}>
                <Panel header="Advanced Exit Condition Settings (Optional)" key="exit_criteria">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        label="Understanding Threshold"
                        name={['exit_criteria', 'understanding_threshold']}
                        tooltip="Allow exit when user understanding reaches this threshold (0-100)"
                      >
                        <InputNumber
                          min={0}
                          max={100}
                          style={{ width: '100%' }}
                          formatter={(value) => `${value}%`}
                          parser={(value) => value?.replace('%', '') as any}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        label="Allow Exit With Questions"
                        name={['exit_criteria', 'has_questions']}
                        valuePropName="checked"
                        tooltip="Whether to allow exiting topic when user still has questions"
                      >
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                </Panel>
              </Collapse>
            </>
          )}

          {/* AI Ask 类型 */}
          {action.type === 'ai_ask' && (
            <>
              <Form.Item
                label="Question Template"
                name="ai_ask"
                rules={[{ required: true, message: 'Please enter the question template' }]}
                tooltip="向用户提问的问题模板"
              >
                <TextArea rows={6} placeholder="Enter the question template for AI..." showCount />
              </Form.Item>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="Tone Style" name="tone">
                    <Input placeholder="e.g. gentle, encouraging" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="Max Rounds" name="max_rounds" tooltip="最大交互轮数">
                    <InputNumber min={1} max={10} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label="Required"
                    name="required"
                    valuePropName="checked"
                    tooltip="是否必填"
                  >
                    <Checkbox />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Exit Condition" name="exit" tooltip="什么情况下退出该Action">
                <TextArea rows={2} placeholder="Describe when to exit this Action..." />
              </Form.Item>

              <Form.Item label="Append to List" name="tolist" tooltip="将结果添加到列表变量">
                <Input placeholder="List variable name" />
              </Form.Item>

              <Divider orientation="left">变量提取配置（Output）</Divider>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                配置需要从用户回答中提取的变量，支持提取单个或多个变量
              </Text>
              <Form.List name="output">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field, index) => (
                      <Card
                        key={field.key}
                        size="small"
                        style={{ marginBottom: 8 }}
                        title={
                          <Space>
                            <Text strong>变量 #{index + 1}</Text>
                            {fields.length === 1 && <Tag color="blue">单变量</Tag>}
                            {fields.length > 1 && <Tag color="green">多变量</Tag>}
                          </Space>
                        }
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(field.name)}
                            disabled={fields.length === 1}
                          />
                        }
                      >
                        <Form.Item
                          {...field}
                          label="变量名（get）"
                          name={[field.name, 'get']}
                          rules={[{ required: true, message: '请输入变量名' }]}
                          style={{ marginBottom: 8 }}
                          tooltip="需要提取的变量名称"
                        >
                          <Input placeholder="例：用户姓名、症状描述" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="变量定义（define）"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                          tooltip="帮助 AI 理解如何提取该变量的描述"
                        >
                          <TextArea rows={2} placeholder="例：从用户回复中提取姓名或昵称" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() => add()}
                      block
                      icon={<PlusOutlined />}
                      style={{ marginTop: 8 }}
                    >
                      添加输出变量
                    </Button>
                    {fields.length === 0 && (
                      <div
                        style={{
                          padding: '20px',
                          textAlign: 'center',
                          background: '#fafafa',
                          borderRadius: '4px',
                          border: '1px dashed #d9d9d9',
                        }}
                      >
                        <Text type="secondary">暂无变量配置，点击上方按钮添加变量提取配置</Text>
                      </div>
                    )}
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
