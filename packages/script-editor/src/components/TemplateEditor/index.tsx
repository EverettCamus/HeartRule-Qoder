import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Space, message, Switch, Typography, Modal as ConfirmModal } from 'antd';
import { SaveOutlined, CloseOutlined, EyeOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import MDEditor from '@uiw/react-md-editor';
import { projectsApi } from '../../api/projects';
import VariableInserter from './VariableInserter';
import TemplateValidator from './TemplateValidator';
import './style.css';

const { Text } = Typography;

interface ValidationResult {
  valid: boolean;
  missingSystemVars?: string[];
  missingScriptVars?: string[];
  warnings?: string[];
}

interface TemplateEditorProps {
  visible: boolean;
  projectId: string;
  schemeName: string;
  templatePath: string; // 如 'ai_ask_v1' 或 'ai_say_v1'
  templateType?: string; // 如 'ai_ask_v1', 'ai_say_v1'
  requiredSystemVars?: string[];
  requiredScriptVars?: string[];
  onClose: () => void;
  onSaved?: () => void;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  visible,
  projectId,
  schemeName,
  templatePath,
  requiredSystemVars = [],
  requiredScriptVars = [],
  onClose,
  onSaved,
}) => {
  const [content, setContent] = useState<string>('');
  const [initialContent, setInitialContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const validateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isReadOnly = schemeName === 'default';

  // 加载模板内容
  useEffect(() => {
    if (visible && projectId && schemeName && templatePath) {
      loadTemplateContent();
    }
  }, [visible, projectId, schemeName, templatePath]);

  const loadTemplateContent = async () => {
    try {
      const response = await projectsApi.getTemplateContent(projectId, schemeName, templatePath);
      const templateContent = response.data.content;
      setContent(templateContent);
      setInitialContent(templateContent);
      setHasChanges(false);
      validateContent(templateContent);
    } catch (error: any) {
      message.error(`加载模板失败: ${error.response?.data?.error || error.message}`);
      // 如果模板文件不存在，创建空模板
      if (error.response?.status === 404 && schemeName !== 'default') {
        setContent('');
        setInitialContent('');
      }
    }
  };

  // 处理内容变化
  const handleContentChange = (value?: string) => {
    const newContent = value || '';
    setContent(newContent);
    setHasChanges(newContent !== initialContent);

    // 防抖验证
    if (validateTimeoutRef.current) {
      clearTimeout(validateTimeoutRef.current);
    }
    validateTimeoutRef.current = setTimeout(() => {
      validateContent(newContent);
    }, 500);
  };

  // 验证模板内容
  const validateContent = (text: string) => {
    const result: ValidationResult = {
      valid: true,
      missingSystemVars: [],
      missingScriptVars: [],
      warnings: [],
    };

    // 检查必需的系统变量
    if (requiredSystemVars && requiredSystemVars.length > 0) {
      requiredSystemVars.forEach((varName) => {
        if (!text.includes(`{{${varName}}}`)) {
          result.missingSystemVars?.push(varName);
          result.valid = false;
        }
      });
    }

    // 检查必需的脚本变量
    if (requiredScriptVars && requiredScriptVars.length > 0) {
      requiredScriptVars.forEach((varName) => {
        if (!text.includes(`{{${varName}}}`)) {
          result.missingScriptVars?.push(varName);
          result.valid = false;
        }
      });
    }

    // 检查安全边界声明（可选警告）
    if (!text.includes('【安全边界') && !text.includes('安全边界与伦理规范')) {
      result.warnings?.push('建议包含安全边界说明');
    }

    // 检查输出格式声明（可选警告）
    if (!text.includes('【输出格式】') && !text.includes('输出格式')) {
      result.warnings?.push('建议包含输出格式说明');
    }

    setValidationResult(result);
  };

  // 保存模板
  const handleSave = async () => {
    if (isReadOnly) {
      message.error('系统默认模板不可修改，请复制到自定义方案后编辑');
      return;
    }

    if (!hasChanges) {
      message.info('模板内容没有变化');
      return;
    }

    // 如果验证失败，提示确认
    if (validationResult && !validationResult.valid) {
      ConfirmModal.confirm({
        title: '模板验证失败',
        icon: <ExclamationCircleOutlined />,
        content: '模板存在验证错误，仍要保存吗？',
        onOk: async () => {
          await doSave();
        },
      });
      return;
    }

    await doSave();
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await projectsApi.updateTemplateContent(projectId, schemeName, templatePath, content);
      message.success('模板保存成功');
      setInitialContent(content);
      setHasChanges(false);
      onSaved?.();
    } catch (error: any) {
      message.error(`保存失败: ${error.response?.data?.error || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // 关闭编辑器
  const handleClose = () => {
    if (hasChanges) {
      ConfirmModal.confirm({
        title: '未保存的更改',
        content: '您有未保存的更改，确定要关闭吗？',
        onOk: () => {
          onClose();
        },
      });
    } else {
      onClose();
    }
  };

  return (
    <Modal
      title={`编辑模板: ${templatePath}`}
      open={visible}
      onCancel={handleClose}
      width="90%"
      style={{ top: 20 }}
      footer={null}
      destroyOnClose
    >
      <div className="template-editor-container">
        {/* 工具栏 */}
        <div className="template-editor-toolbar">
          <div className="template-editor-toolbar-left">
            <VariableInserter
              systemVars={requiredSystemVars}
              scriptVars={requiredScriptVars}
              onInsert={(varName) => {
                // 在光标位置插入变量
                const newContent = content + ` {{${varName}}} `;
                setContent(newContent);
                setHasChanges(newContent !== initialContent);
              }}
            />
            <Switch
              checked={showPreview}
              onChange={setShowPreview}
              checkedChildren={
                <Space>
                  <EyeOutlined />
                  预览
                </Space>
              }
              unCheckedChildren="编辑"
            />
          </div>
          <div className="template-editor-toolbar-right">
            <Text type="secondary">
              方案: {schemeName}
              {isReadOnly && ' (只读)'}
            </Text>
          </div>
        </div>

        {/* 只读警告 */}
        {isReadOnly && (
          <div className="template-editor-readonly-warning">
            <ExclamationCircleOutlined />
            <span>系统默认模板不可编辑，请复制到自定义方案后修改</span>
          </div>
        )}

        {/* 编辑器 */}
        <div className="template-editor-content">
          <MDEditor
            value={content}
            onChange={handleContentChange}
            preview={showPreview ? 'live' : 'edit'}
            height={500}
            visibleDragbar={false}
          />
        </div>

        {/* 验证结果 */}
        <TemplateValidator
          validationResult={validationResult}
          systemVars={requiredSystemVars}
          scriptVars={requiredScriptVars}
        />

        {/* 底部按钮 */}
        <div className="template-editor-footer">
          <div className="template-editor-footer-left">
            {hasChanges && <Text type="warning">内容已修改，请保存</Text>}
          </div>
          <div className="template-editor-footer-right">
            <Button onClick={handleClose} icon={<CloseOutlined />}>
              关闭
            </Button>
            {!isReadOnly && (
              <Button
                type="primary"
                onClick={handleSave}
                loading={saving}
                disabled={!hasChanges}
                icon={<SaveOutlined />}
              >
                保存
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TemplateEditor;
