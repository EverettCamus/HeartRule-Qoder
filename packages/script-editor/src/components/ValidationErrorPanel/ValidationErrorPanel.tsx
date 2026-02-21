/**
 * ValidationErrorPanel - YAML Schema 验证错误面板
 *
 * 展示脚本验证错误列表
 */

import { ExclamationCircleOutlined, WarningOutlined, CopyOutlined } from '@ant-design/icons';
import type { ValidationErrorDetail } from '@heartrule/core-engine';
import { Alert, Collapse, Typography, Tag, Space, Button, message } from 'antd';
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
 * 格式化错误信息为文本
 */
const formatErrorsAsText = (errors: ValidationErrorDetail[]): string => {
  return errors
    .map((error, index) => {
      const parts: string[] = [
        `错误 ${index + 1}/${errors.length}`,
        `类型: ${error.errorType}`,
        `路径: ${error.path || 'root'}`,
        `消息: ${error.message}`,
      ];

      if (error.expected) {
        parts.push(`期望值: ${error.expected}`);
      }

      if (error.actual) {
        parts.push(`实际值: ${error.actual}`);
      }

      if (error.suggestion) {
        parts.push(`修复建议: ${error.suggestion}`);
      }

      if (error.example) {
        parts.push(`正确示例:\n${error.example}`);
      }

      return parts.join('\n');
    })
    .join('\n\n' + '='.repeat(50) + '\n\n');
};

/**
 * 验证错误面板组件
 */
const ValidationErrorPanel: React.FC<ValidationErrorPanelProps> = ({ errors, onClose }) => {
  if (errors.length === 0) {
    return null;
  }

  /**
   * 复制所有错误信息到剪贴板
   */
  const handleCopyErrors = async () => {
    try {
      const text = formatErrorsAsText(errors);
      await navigator.clipboard.writeText(text);
      message.success('错误信息已复制到剪贴板');
    } catch (error) {
      message.error('复制失败,请手动选择文本复制');
      console.error('Copy failed:', error);
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <Alert
        message={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <ExclamationCircleOutlined />
              <span>发现 {errors.length} 个脚本验证错误</span>
            </Space>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyErrors}>
              复制错误信息
            </Button>
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
