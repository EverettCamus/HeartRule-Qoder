import { Modal, Checkbox, Button, Space, Divider } from 'antd';
import React from 'react';

import type { DebugOutputFilter } from '../../types/debug';
import { DEFAULT_DEBUG_FILTER } from '../../types/debug';

interface DebugFilterModalProps {
  visible: boolean;
  filter: DebugOutputFilter;
  onFilterChange: (filter: DebugOutputFilter) => void;
  onClose: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

const DebugFilterModal: React.FC<DebugFilterModalProps> = ({
  visible,
  filter,
  onFilterChange,
  onClose,
  onExpandAll,
  onCollapseAll,
}) => {
  const handleCheckboxChange = (key: keyof DebugOutputFilter) => (e: any) => {
    onFilterChange({
      ...filter,
      [key]: e.target.checked,
    });
  };

  const handleExpandAll = () => {
    if (onExpandAll) {
      onExpandAll();
    }
  };

  const handleCollapseAll = () => {
    if (onCollapseAll) {
      onCollapseAll();
    }
  };

  const handleShowErrorOnly = () => {
    onFilterChange({
      showError: true,
      showLLMPrompt: false,
      showLLMResponse: false,
      showVariable: false,
      showExecutionLog: false,
      showPosition: false,
    });
  };

  const handleShowAll = () => {
    onFilterChange({
      showError: true,
      showLLMPrompt: true,
      showLLMResponse: true,
      showVariable: true,
      showExecutionLog: true,
      showPosition: true,
    });
  };

  const handleReset = () => {
    onFilterChange(DEFAULT_DEBUG_FILTER);
  };

  return (
    <Modal
      title="调试输出选项"
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={handleReset}>
          重置默认
        </Button>,
        <Button key="ok" type="primary" onClick={onClose}>
          确定
        </Button>,
      ]}
      width={400}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Checkbox checked={filter.showError} onChange={handleCheckboxChange('showError')}>
          <strong>⚠️ 错误信息</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示执行错误和异常
          </div>
        </Checkbox>

        <Checkbox
          checked={filter.showLLMPrompt}
          onChange={handleCheckboxChange('showLLMPrompt')}
        >
          <strong>💡 LLM 提示词</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示发送给AI的完整提示
          </div>
        </Checkbox>

        <Checkbox
          checked={filter.showLLMResponse}
          onChange={handleCheckboxChange('showLLMResponse')}
        >
          <strong>🤖 LLM 响应</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示AI的原始响应内容
          </div>
        </Checkbox>

        <Checkbox checked={filter.showVariable} onChange={handleCheckboxChange('showVariable')}>
          <strong>📊 变量状态</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示当前会话变量值
          </div>
        </Checkbox>

        <Checkbox
          checked={filter.showExecutionLog}
          onChange={handleCheckboxChange('showExecutionLog')}
        >
          <strong>📝 执行日志</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示Action执行的详细日志
          </div>
        </Checkbox>

        <Checkbox checked={filter.showPosition} onChange={handleCheckboxChange('showPosition')}>
          <strong>🧭 位置信息</strong>
          <div style={{ fontSize: '12px', color: '#666', marginLeft: '24px' }}>
            显示当前执行位置路径
          </div>
        </Checkbox>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
          快捷操作:
        </div>

        <Space wrap>
          <Button size="small" onClick={handleExpandAll}>
            全部展开
          </Button>
          <Button size="small" onClick={handleCollapseAll}>
            全部折叠
          </Button>
          <Button size="small" onClick={handleShowErrorOnly}>
            仅显示错误
          </Button>
          <Button size="small" onClick={handleShowAll}>
            显示全部
          </Button>
        </Space>
      </Space>
    </Modal>
  );
};

export default DebugFilterModal;
