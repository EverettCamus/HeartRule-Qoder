import React from 'react';
import { Alert, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface ValidationResult {
  valid: boolean;
  missingSystemVars?: string[];
  missingScriptVars?: string[];
  warnings?: string[];
}

interface TemplateValidatorProps {
  validationResult: ValidationResult | null;
  systemVars?: string[];
  scriptVars?: string[];
}

const TemplateValidator: React.FC<TemplateValidatorProps> = ({
  validationResult,
  systemVars = [],
  scriptVars = [],
}) => {
  if (!validationResult) {
    return null;
  }

  const { valid, missingSystemVars = [], missingScriptVars = [], warnings = [] } = validationResult;

  // 无问题
  if (valid && warnings.length === 0) {
    return (
      <Alert
        message="模板验证通过"
        description={
          <Space direction="vertical" size="small">
            <Text>✅ 所有必需变量已包含</Text>
            {systemVars.length > 0 && (
              <div>
                <Text type="secondary">系统变量: </Text>
                <Space size="small">
                  {systemVars.map((v) => (
                    <Tag key={v} color="blue">
                      {v}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
            {scriptVars.length > 0 && (
              <div>
                <Text type="secondary">脚本变量: </Text>
                <Space size="small">
                  {scriptVars.map((v) => (
                    <Tag key={v} color="green">
                      {v}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}
          </Space>
        }
        type="success"
        icon={<CheckCircleOutlined />}
        showIcon
        style={{ marginTop: 16 }}
      />
    );
  }

  // 有错误或警告
  return (
    <div style={{ marginTop: 16 }}>
      {/* 缺失变量错误 */}
      {!valid && (
        <Alert
          message="模板验证失败"
          description={
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {missingSystemVars.length > 0 && (
                <div>
                  <Text type="danger">缺失必需的系统变量: </Text>
                  <Space size="small">
                    {missingSystemVars.map((v) => (
                      <Tag key={v} color="red">
                        {v}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
              {missingScriptVars.length > 0 && (
                <div>
                  <Text type="danger">缺失必需的脚本变量: </Text>
                  <Space size="small">
                    {missingScriptVars.map((v) => (
                      <Tag key={v} color="red">
                        {v}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
            </Space>
          }
          type="error"
          icon={<CloseCircleOutlined />}
          showIcon
        />
      )}

      {/* 警告信息 */}
      {warnings.length > 0 && (
        <Alert
          message="模板建议"
          description={
            <Space direction="vertical" size="small">
              {warnings.map((warning, index) => (
                <Text key={index} type="warning">
                  • {warning}
                </Text>
              ))}
            </Space>
          }
          type="warning"
          icon={<WarningOutlined />}
          showIcon
          style={{ marginTop: valid ? 0 : 12 }}
        />
      )}
    </div>
  );
};

export default TemplateValidator;
