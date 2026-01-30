import {
  FileTextOutlined,
  PlusOutlined,
  LeftOutlined,
  RightOutlined,
  HistoryOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { Layout, Typography, Tree, Button, Space, Divider, Dropdown, Menu, Tag } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';

import type { ScriptFile } from '../../api/projects';

const { Sider } = Layout;
const { Title, Text } = Typography;

interface FileTreeNode extends DataNode {
  key: string;
  title: string;
  icon?: React.ReactNode;
  isLeaf?: boolean;
  fileId?: string;
  fileType?: string;
  children?: FileTreeNode[];
}

interface FileTreeSidebarProps {
  selectedFile: ScriptFile | null;
  collapsed: boolean;
  treeData: FileTreeNode[];
  expandedKeys: React.Key[];
  selectedKeys: React.Key[];
  onCollapse: (collapsed: boolean) => void;
  onTreeSelect: (selectedKeys: React.Key[], info: any) => void;
  onCreateSession: () => void;
  onFormatYaml: () => void;
  onValidate: () => void;
  onVersionHistoryClick: () => void;
}

const FileTreeSidebar: React.FC<FileTreeSidebarProps> = ({
  selectedFile,
  collapsed,
  treeData,
  expandedKeys,
  selectedKeys,
  onCollapse,
  onTreeSelect,
  onCreateSession,
  onFormatYaml,
  onValidate,
  onVersionHistoryClick,
}) => {
  return (
    <Sider
      width={300}
      collapsedWidth={50}
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      theme="light"
      style={{
        borderRight: '1px solid #f0f0f0',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 折叠按钮 */}
      <div
        style={{
          padding: '8px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-end',
        }}
      >
        <Button
          type="text"
          icon={collapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => onCollapse(!collapsed)}
          size="small"
        />
      </div>

      {/* 工程文件树区域 - 可滚动 */}
      <div
        style={{
          padding: collapsed ? '8px' : '16px',
          display: collapsed ? 'none' : 'block',
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <Text strong>Project Files</Text>
          <Dropdown
            overlay={
              <Menu
                onClick={({ key }) => {
                  if (key === 'session') {
                    onCreateSession();
                  }
                }}
              >
                <Menu.Item key="session" icon={<FileTextOutlined />}>
                  New Session Script
                </Menu.Item>
              </Menu>
            }
          >
            <Button size="small" icon={<PlusOutlined />} />
          </Dropdown>
        </div>
        <Tree
          showIcon
          treeData={treeData}
          expandedKeys={expandedKeys}
          selectedKeys={selectedKeys}
          onExpand={() => {
            // 通过父组件的回调更新expandedKeys
            // 这里需要父组件传递setExpandedKeys
          }}
          onSelect={onTreeSelect}
        />
      </div>

      {/* 文件属性区域 - 固定底部，独立滚动 */}
      {!collapsed && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            padding: '16px',
            maxHeight: '40vh',
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <Title level={5} style={{ marginTop: 0 }}>
            File Details
          </Title>
          {selectedFile ? (
            <div>
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <Text type="secondary">File Name</Text>
                  <div>
                    <Text>{selectedFile.fileName}</Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary">File Type</Text>
                  <div>
                    <Tag>{selectedFile.fileType}</Tag>
                  </div>
                </div>
                <div>
                  <Text type="secondary">Created At</Text>
                  <div>
                    <Text>{new Date(selectedFile.createdAt).toLocaleString()}</Text>
                  </div>
                </div>
                <div>
                  <Text type="secondary">Updated At</Text>
                  <div>
                    <Text>{new Date(selectedFile.updatedAt).toLocaleString()}</Text>
                  </div>
                </div>
              </Space>

              <Divider />

              <Title level={5}>Quick Actions</Title>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button block icon={<HistoryOutlined />} onClick={onVersionHistoryClick}>
                  View Version History
                </Button>
                <Button
                  block
                  icon={<FormOutlined />}
                  onClick={onFormatYaml}
                  disabled={!selectedFile}
                >
                  Format YAML
                </Button>
                <Button block onClick={onValidate}>
                  Validate Script
                </Button>
              </Space>
            </div>
          ) : (
            <Text type="secondary">No file selected</Text>
          )}
        </div>
      )}
    </Sider>
  );
};

export default FileTreeSidebar;
