import { SettingOutlined, EyeOutlined } from '@ant-design/icons';
import { Form, Input, Select, Button, Space, Typography, Divider, message } from 'antd';
import React, { useState, useEffect } from 'react';
import './style.css';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { Option } = Select;

/**
 * Session数据接口
 */
export interface SessionData {
  name: string;
  description?: string;
  version?: string;
  template_scheme?: string;
}

/**
 * 模板方案接口
 */
export interface TemplateScheme {
  name: string;
  description: string;
  isDefault: boolean;
}

/**
 * SessionPropertyPanel组件Props
 */
export interface SessionPropertyPanelProps {
  /** Session数据 */
  sessionData: SessionData;

  /** 可用的模板方案列表 */
  availableSchemes: TemplateScheme[];

  /** 保存回调 */
  onSave: (data: SessionData) => void;

  /** 管理模板方案的回调（可选） */
  onManageSchemes?: () => void;

  /** 查看方案详情的回调（可选） */
  onViewSchemeDetails?: (schemeName: string) => void;
}

/**
 * Session属性面板组件
 *
 * 用于编辑Session级别的配置，包括：
 * - 会谈名称
 * - 描述
 * - 版本号
 * - 模板方案配置（template_scheme）
 *
 * @example
 * ```tsx
 * <SessionPropertyPanel
 *   sessionData={{
 *     name: 'CBT抑郁症评估会谈',
 *     description: '基于CBT理论的抑郁症初步评估',
 *     version: '1.0.0',
 *     template_scheme: 'crisis_intervention'
 *   }}
 *   availableSchemes={[
 *     { name: 'default', description: '系统默认模板', isDefault: true },
 *     { name: 'crisis_intervention', description: '危机干预专用', isDefault: false }
 *   ]}
 *   onSave={(data) => console.log('保存:', data)}
 *   onManageSchemes={() => console.log('打开管理器')}
 * />
 * ```
 */
export const SessionPropertyPanel: React.FC<SessionPropertyPanelProps> = ({
  sessionData,
  availableSchemes,
  onSave,
  onManageSchemes,
  onViewSchemeDetails,
}) => {
  const [form] = Form.useForm();
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedScheme, setSelectedScheme] = useState<string | undefined>(
    sessionData.template_scheme
  );

  // 当sessionData变化时更新表单
  useEffect(() => {
    form.setFieldsValue({
      name: sessionData.name,
      description: sessionData.description || '',
      version: sessionData.version || '',
      template_scheme: sessionData.template_scheme || undefined,
    });
    setSelectedScheme(sessionData.template_scheme);
    setHasChanges(false);
  }, [sessionData, form]);

  // 监听表单值变化
  const handleValuesChange = () => {
    setHasChanges(true);
  };

  // 处理模板方案选择
  const handleSchemeChange = (value: string | undefined) => {
    setSelectedScheme(value);
    setHasChanges(true);
  };

  // 保存表单
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // 构建Session数据
      const updatedData: SessionData = {
        name: values.name,
        description: values.description || undefined,
        version: values.version || undefined,
        template_scheme: values.template_scheme || undefined,
      };

      onSave(updatedData);
      setHasChanges(false);
      message.success('Session配置已保存');
    } catch (error) {
      console.error('表单验证失败:', error);
      message.error('请检查表单输入');
    }
  };

  // 取消编辑（重置表单）
  const handleCancel = () => {
    form.setFieldsValue({
      name: sessionData.name,
      description: sessionData.description || '',
      version: sessionData.version || '',
      template_scheme: sessionData.template_scheme || undefined,
    });
    setSelectedScheme(sessionData.template_scheme);
    setHasChanges(false);
  };

  // 获取当前选中方案的描述
  const getSchemeDescription = (schemeName: string | undefined): string => {
    if (!schemeName) return '使用系统默认模板（包含通用安全边界和标准流程）';

    const scheme = availableSchemes.find((s) => s.name === schemeName);
    return scheme?.description || '自定义模板方案';
  };

  return (
    <div className="session-property-panel" data-testid="session-property-panel">
      <div className="session-property-header">
        <Title level={4}>Session 属性</Title>
        <Text type="secondary">编辑会谈脚本的基本信息和模板配置</Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        className="session-property-form"
      >
        {/* 基本信息 */}
        <Divider orientation="left">基本信息</Divider>

        <Form.Item
          label="会谈名称"
          name="name"
          rules={[
            { required: true, message: '请输入会谈名称' },
            { max: 100, message: '名称不能超过100个字符' },
          ]}
          data-testid="form-item-name"
        >
          <Input placeholder="例如：CBT抑郁症评估会谈" data-testid="input-name" />
        </Form.Item>

        <Form.Item
          label="版本号"
          name="version"
          rules={[
            {
              pattern: /^\d+\.\d+\.\d+$/,
              message: '版本号格式应为 x.y.z（如 1.0.0）',
            },
          ]}
          data-testid="form-item-version"
        >
          <Input placeholder="1.0.0" data-testid="input-version" />
        </Form.Item>

        <Form.Item label="描述" name="description" data-testid="form-item-description">
          <TextArea
            rows={3}
            placeholder="简要描述这个会谈脚本的目标和适用场景"
            maxLength={500}
            showCount
            data-testid="textarea-description"
          />
        </Form.Item>

        {/* 模板方案配置 */}
        <Divider orientation="left">模板方案配置</Divider>

        <Form.Item
          label="使用模板方案"
          name="template_scheme"
          tooltip="选择模板方案后，会谈中的AI Action将使用该方案下的模板文件"
          data-testid="form-item-template-scheme"
        >
          <Select
            placeholder="自动选择（使用default层）"
            allowClear
            onChange={handleSchemeChange}
            data-testid="select-template-scheme"
          >
            {availableSchemes.map((scheme) => (
              <Option
                key={scheme.name}
                value={scheme.name}
                data-testid={`scheme-option-${scheme.name}`}
              >
                {scheme.isDefault ? '🔧 ' : '⚙️ '}
                {scheme.name}
                {scheme.isDefault && ' (系统默认)'}
              </Option>
            ))}
          </Select>
        </Form.Item>

        {/* 方案描述 */}
        {selectedScheme && (
          <div className="scheme-description" data-testid="scheme-description">
            <Text type="secondary" style={{ fontSize: '12px' }}>
              📝 {getSchemeDescription(selectedScheme)}
            </Text>
          </div>
        )}

        {/* 管理按钮 */}
        <div className="scheme-actions">
          <Space>
            {selectedScheme && onViewSchemeDetails && (
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onViewSchemeDetails(selectedScheme)}
                data-testid="btn-view-scheme"
              >
                查看方案详情
              </Button>
            )}

            {onManageSchemes && (
              <Button
                type="link"
                size="small"
                icon={<SettingOutlined />}
                onClick={onManageSchemes}
                data-testid="btn-manage-schemes"
              >
                管理模板方案...
              </Button>
            )}
          </Space>
        </div>

        {/* 保存/取消按钮 */}
        <Divider />
        <div className="session-property-actions">
          <Space>
            <Button onClick={handleCancel} disabled={!hasChanges} data-testid="btn-cancel">
              取消
            </Button>
            <Button
              type="primary"
              onClick={handleSave}
              disabled={!hasChanges}
              data-testid="btn-save"
            >
              保存
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default SessionPropertyPanel;
