/**
 * ValidationErrorPanel - YAML Schema 验证错误面板
 *
 * 展示脚本验证错误列表
 */

import { ExclamationCircleOutlined, WarningOutlined } from '@ant-design/icons';
import type { ValidationErrorDetail } from '@heartrule/core-engine';
import { Alert, Collapse, Typography, Tag, Space } from 'antd';
import React from 'react';

const { Panel } = Collapse;
const { Text, Paragraph } = Typography;

export interface ValidationErrorPanelProps {
  errors: ValidationErrorDetail[];
  onClose?: () => void;
}

/**
 * 根据错误类型返回对应的图标和颜色
 */
const getErrorTypeConfig = (errorType: string) => {
  const configs: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    TYPE_ERROR: {
      icon: <ExclamationCircleOutlined />,
      color: 'error',
      label: '类型错误',
    },
    REQUIRED_ERROR: {
      icon: <ExclamationCircleOutlined />,
      color: 'error',
      label: '必填字段缺失',
    },
    STRUCTURE_ERROR: {
      icon: <WarningOutlined />,
      color: 'warning',
      label: '结构错误',
    },
    FORMAT_ERROR: {
      icon: <ExclamationCircleOutlined />,
      color: 'error',
      label: '格式错误',
    },
    ENUM_ERROR: {
      icon: <WarningOutlined />,
      color: 'warning',
      label: '枚举值错误',
    },
    SYNTAX_ERROR: {
      icon: <ExclamationCircleOutlined />,
      color: 'error',
      label: 'YAML语法错误',
    },
  };

  return (
    configs[errorType] || {
      icon: <ExclamationCircleOutlined />,
      color: 'error',
      label: '未知错误',
    }
  );
};

/**
 * 验证错误面板组件
 */
const ValidationErrorPanel: React.FC<ValidationErrorPanelProps> = ({ errors, onClose }) => {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <Alert
        message={
          <Space>
            <ExclamationCircleOutlined />
            <span>发现 {errors.length} 个脚本验证错误</span>
          </Space>
        }
        description={
          <div style={{ marginTop: '12px' }}>
            <Collapse
              defaultActiveKey={errors.length <= 3 ? errors.map((_, idx) => `error-${idx}`) : []}
              ghost
            >
              {errors.map((error, index) => {
                const config = getErrorTypeConfig(error.errorType);
                return (
                  <Panel
                    header={
                      <Space>
                        <Tag color={config.color}>{config.label}</Tag>
                        <Text strong>{error.path || 'root'}</Text>
                      </Space>
                    }
                    key={`error-${index}`}
                  >
                    <div style={{ paddingLeft: '12px' }}>
                      {/* 错误消息 */}
                      <Paragraph>
                        <Text type="danger">{error.message}</Text>
                      </Paragraph>

                      {/* 期望值 */}
                      {error.expected && (
                        <Paragraph>
                          <Text type="secondary">期望值: </Text>
                          <Text code>{error.expected}</Text>
                        </Paragraph>
                      )}

                      {/* 实际值 */}
                      {error.actual && (
                        <Paragraph>
                          <Text type="secondary">实际值: </Text>
                          <Text code>{error.actual}</Text>
                        </Paragraph>
                      )}

                      {/* 修复建议 */}
                      {error.suggestion && (
                        <Alert
                          message="💡 修复建议"
                          description={
                            <Text style={{ whiteSpace: 'pre-line' }}>{error.suggestion}</Text>
                          }
                          type="info"
                          showIcon
                          style={{ marginTop: '8px' }}
                        />
                      )}

                      {/* 示例代码 */}
                      {error.example && (
                        <div style={{ marginTop: '8px' }}>
                          <Text type="secondary">正确示例:</Text>
                          <pre
                            style={{
                              backgroundColor: '#f5f5f5',
                              padding: '8px',
                              borderRadius: '4px',
                              marginTop: '4px',
                              fontSize: '12px',
                              overflow: 'auto',
                            }}
                          >
                            {error.example}
                          </pre>
                        </div>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </Collapse>
          </div>
        }
        type="error"
        closable
        onClose={onClose}
        style={{ maxHeight: '400px', overflow: 'auto' }}
      />
    </div>
  );
};

export default ValidationErrorPanel;
