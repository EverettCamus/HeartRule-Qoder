import React from 'react';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface VariableInserterProps {
  systemVars?: string[];
  scriptVars?: string[];
  onInsert: (variableName: string) => void;
}

const VariableInserter: React.FC<VariableInserterProps> = ({
  systemVars = [],
  scriptVars = [],
  onInsert,
}) => {
  // 构建菜单项
  const menuItems: MenuProps['items'] = [];

  // 添加系统变量分组
  if (systemVars.length > 0) {
    menuItems.push({
      key: 'system-group',
      type: 'group',
      label: '系统变量',
    });

    systemVars.forEach((varName) => {
      menuItems.push({
        key: `system-${varName}`,
        label: `{{${varName}}}`,
        onClick: () => onInsert(varName),
      });
    });
  }

  // 添加脚本变量分组
  if (scriptVars.length > 0) {
    if (menuItems.length > 0) {
      menuItems.push({
        key: 'divider-1',
        type: 'divider',
      });
    }

    menuItems.push({
      key: 'script-group',
      type: 'group',
      label: '脚本变量',
    });

    scriptVars.forEach((varName) => {
      menuItems.push({
        key: `script-${varName}`,
        label: `{{${varName}}}`,
        onClick: () => onInsert(varName),
      });
    });
  }

  // 添加常用变量（通用）
  if (menuItems.length > 0) {
    menuItems.push({
      key: 'divider-2',
      type: 'divider',
    });
  }

  menuItems.push({
    key: 'common-group',
    type: 'group',
    label: '常用变量',
  });

  const commonVars = ['time', 'who', 'user', 'chat', 'task'];
  commonVars.forEach((varName) => {
    // 避免重复
    if (!systemVars.includes(varName) && !scriptVars.includes(varName)) {
      menuItems.push({
        key: `common-${varName}`,
        label: `{{${varName}}}`,
        onClick: () => onInsert(varName),
      });
    }
  });

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomLeft">
      <Button icon={<PlusOutlined />}>插入变量</Button>
    </Dropdown>
  );
};

export default VariableInserter;
