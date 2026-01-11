import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
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
import React from 'react';

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

  // 当选中的 Action 变化时，更新表单
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

  if (!action) {
    return (
      <div className="action-property-panel-empty">
        <Text type="secondary">请选择一个 Action 节点进行编辑</Text>
      </div>
    );
  }

  return (
    <div className="action-property-panel">
      <Card
        title={
          <Space>
            <Text strong>Action 属性配置</Text>
            <Tag color="blue">#{(actionIndex ?? 0) + 1}</Tag>
          </Space>
        }
        extra={
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>
            保存
          </Button>
        }
        size="small"
      >
        <Form form={form} layout="vertical">
          {/* AI Say 类型 */}
          {action.type === 'ai_say' && (
            <>
              <Form.Item
                label="提示词内容"
                name="ai_say"
                rules={[{ required: true, message: '请输入提示词内容' }]}
              >
                <TextArea rows={8} placeholder="输入 AI 说话的提示词..." showCount />
              </Form.Item>

              <Form.Item label="语气风格" name="tone">
                <Input placeholder="例如: 温柔、鼓励、严肃等" />
              </Form.Item>
            </>
          )}

          {/* AI Ask 类型 */}
          {action.type === 'ai_ask' && (
            <>
              <Form.Item
                label="提示词内容"
                name="ai_ask"
                rules={[{ required: true, message: '请输入提示词内容' }]}
              >
                <TextArea rows={8} placeholder="输入 AI 提问的提示词..." showCount />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="语气风格" name="tone">
                    <Input placeholder="例如: 温柔、鼓励" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="添加到列表" name="tolist">
                    <Input placeholder="列表变量名" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="退出条件" name="exit">
                <TextArea rows={2} placeholder="描述何时退出此 Action..." />
              </Form.Item>

              <Divider orientation="left">输出变量配置</Divider>
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
                          label="变量操作"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="get: 提取变量名" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="变量定义"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="define: 变量说明" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加输出变量
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
                label="思考提示词"
                name="think"
                rules={[{ required: true, message: '请输入思考提示词' }]}
              >
                <TextArea rows={8} placeholder="输入 AI 思考的提示词..." showCount />
              </Form.Item>

              <Divider orientation="left">输出变量配置</Divider>
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
                              label="变量操作"
                              name={[field.name, 'get']}
                              style={{ marginBottom: 8 }}
                            >
                              <Input placeholder="get: 提取" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item
                              {...field}
                              label="或设置"
                              name={[field.name, 'set']}
                              style={{ marginBottom: 8 }}
                            >
                              <Input placeholder="set: 设置" />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item
                          {...field}
                          label="变量定义"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="define: 说明" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="默认值"
                          name={[field.name, 'value']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="value: 默认值" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加输出变量
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
                label="技能名称"
                name="skill"
                rules={[{ required: true, message: '请输入技能名称' }]}
              >
                <Input placeholder="输入要使用的技能名称..." />
              </Form.Item>

              <Divider orientation="left">输入参数配置</Divider>
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
                          label="参数名"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="参数名" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="参数说明"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="参数说明" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加输入参数
                    </Button>
                  </>
                )}
              </Form.List>

              <Divider orientation="left">输出变量配置</Divider>
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
                          label="输出变量名"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="变量名" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="变量说明"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="变量说明" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加输出变量
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
                label="表单 ID"
                name="form_id"
                rules={[{ required: true, message: '请输入表单 ID' }]}
              >
                <Input placeholder="输入要展示的表单 ID..." />
              </Form.Item>

              <Divider orientation="left">输出变量配置</Divider>
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
                          label="表单字段名"
                          name={[field.name, 'get']}
                          style={{ marginBottom: 8 }}
                        >
                          <Input placeholder="字段名" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          label="字段说明"
                          name={[field.name, 'define']}
                          style={{ marginBottom: 0 }}
                        >
                          <Input placeholder="字段说明" />
                        </Form.Item>
                      </Card>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加输出变量
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
                label="图片 URL"
                name="pic_url"
                rules={[{ required: true, message: '请输入图片 URL' }]}
              >
                <Input placeholder="输入图片的 URL 地址..." />
              </Form.Item>

              <Form.Item label="图片说明" name="description">
                <TextArea rows={3} placeholder="输入图片的说明文字（可选）..." />
              </Form.Item>
            </>
          )}

          {/* 通用：执行条件 */}
          <Divider orientation="left">高级配置</Divider>
          <Collapse ghost>
            <Panel header="执行条件（可选）" key="condition">
              <Form.Item name="condition" style={{ marginBottom: 0 }}>
                <TextArea rows={3} placeholder="例如: {变量名} == 'true'" />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>
      </Card>
    </div>
  );
};
