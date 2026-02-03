import {
  FileTextOutlined,
  PlusOutlined,
  LeftOutlined,
  RightOutlined,
  HistoryOutlined,
  FormOutlined,
  DownOutlined,
  RightOutlined as ArrowRightOutlined,
} from '@ant-design/icons';
import { Layout, Typography, Tree, Button, Space, Dropdown, Menu, Tag } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useState, useRef, useEffect } from 'react';

import type { ScriptFile } from '../../api/projects';

const { Sider } = Layout;
const { Text } = Typography;

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
  onTreeExpand: (expandedKeys: React.Key[]) => void;  // 新增：展开/收起节点回调
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
  onTreeExpand,
  onCreateSession,
  onFormatYaml,
  onValidate,
  onVersionHistoryClick,
}) => {
  // 调试：监听 selectedFile 变化
  useEffect(() => {
    console.log('[FileTreeSidebar] selectedFile 更新:', selectedFile);
  }, [selectedFile]);

  // 折叠面板状态
  const [fileDetailsCollapsed, setFileDetailsCollapsed] = useState(false);
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(false);

  // 面板高度状态
  const [fileDetailsHeight, setFileDetailsHeight] = useState(200);
  const [quickActionsHeight, setQuickActionsHeight] = useState(150);

  // 计算实际占用的高度（考虑折叠状态）
  const titleBarHeight = 29; // 折叠标题栏的高度（减小后）
  const actualFileDetailsHeight = fileDetailsCollapsed ? titleBarHeight : fileDetailsHeight;
  const actualQuickActionsHeight = quickActionsCollapsed ? titleBarHeight : quickActionsHeight;

  // 计算 Project Files 的高度（容器总高度 - 折叠按钮 - File Details - Quick Actions）
  const containerHeight = window.innerHeight; // 视口高度
  const buttonHeight = 41; // 折叠按钮高度
  const projectFilesHeight = containerHeight - buttonHeight - actualFileDetailsHeight - actualQuickActionsHeight;

  // 拖拽相关
  const [isDraggingFileDetails, setIsDraggingFileDetails] = useState(false);
  const [isDraggingQuickActions, setIsDraggingQuickActions] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // 处理拖拽开始
  const handleMouseDown = (panel: 'fileDetails' | 'quickActions', e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartHeight.current = panel === 'fileDetails' ? fileDetailsHeight : quickActionsHeight;

    if (panel === 'fileDetails') {
      setIsDraggingFileDetails(true);
    } else {
      setIsDraggingQuickActions(true);
    }
  };

  // 处理拖拽
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingFileDetails) {
        const delta = dragStartY.current - e.clientY; // 注意：向上拖为正，向下为负
        const newHeight = Math.max(100, Math.min(500, dragStartHeight.current + delta));
        setFileDetailsHeight(newHeight);
      } else if (isDraggingQuickActions) {
        const delta = dragStartY.current - e.clientY;
        const newHeight = Math.max(80, Math.min(400, dragStartHeight.current + delta));
        setQuickActionsHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingFileDetails(false);
      setIsDraggingQuickActions(false);
    };

    if (isDraggingFileDetails || isDraggingQuickActions) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingFileDetails, isDraggingQuickActions]);
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
        height: '100vh', // 关键：设置固定高度
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

      {/* 工程文件树区域 - 固定高度，独立滚动 */}
      <div
        style={{
          display: collapsed ? 'none' : 'flex',
          flexDirection: 'column',
          height: `${projectFilesHeight}px`,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
            flexShrink: 0,
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
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, padding: '4px 12px' }}>
          <Tree
            showIcon
            treeData={treeData}
            expandedKeys={expandedKeys}
            selectedKeys={selectedKeys}
            onExpand={onTreeExpand}
            onSelect={onTreeSelect}
            style={{
              fontSize: '13px',
            }}
            className="compact-tree"
          />
          <style>{`
            .compact-tree .ant-tree-treenode {
              padding: 0 0 2px 0 !important;
            }
            .compact-tree .ant-tree-node-content-wrapper {
              line-height: 20px !important;
              height: 20px !important;
            }
            .compact-tree .ant-tree-switcher {
              line-height: 20px !important;
              height: 20px !important;
            }
            .compact-tree .ant-tree-iconEle {
              line-height: 20px !important;
              height: 20px !important;
            }
          `}</style>
        </div>
      </div>

      {/* File Details 面板 - 固定高度，置底 */}
      {!collapsed && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            height: fileDetailsCollapsed ? 'auto' : `${fileDetailsHeight}px`,
            minHeight: fileDetailsCollapsed ? 'auto' : '100px',
          }}
        >
          {/* 拖拽分隔条 - 在顶部 */}
          {!fileDetailsCollapsed && (
            <div
              style={{
                height: '4px',
                cursor: 'row-resize',
                background: isDraggingFileDetails ? '#1890ff' : 'transparent',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              onMouseDown={(e) => handleMouseDown('fileDetails', e)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d9d9d9';
              }}
              onMouseLeave={(e) => {
                if (!isDraggingFileDetails) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            />
          )}

          {/* 折叠标题栏 */}
          <div
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              background: '#fafafa',
              borderBottom: fileDetailsCollapsed ? 'none' : '1px solid #f0f0f0',
              flexShrink: 0,
            }}
            onClick={() => setFileDetailsCollapsed(!fileDetailsCollapsed)}
          >
            {fileDetailsCollapsed ? (
              <ArrowRightOutlined style={{ fontSize: '12px', marginRight: '8px' }} />
            ) : (
              <DownOutlined style={{ fontSize: '12px', marginRight: '8px' }} />
            )}
            <Text strong style={{ fontSize: '12px' }}>
              File Details
            </Text>
          </div>

          {/* 面板内容 */}
          {!fileDetailsCollapsed && (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '8px 12px',
                minHeight: 0,
              }}
            >
              {selectedFile ? (
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>File Name</Text>
                    <div>
                      <Text style={{ fontSize: '13px' }}>{selectedFile.fileName}</Text>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>File Type</Text>
                    <div>
                      <Tag style={{ fontSize: '12px' }}>{selectedFile.fileType}</Tag>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>Created At</Text>
                    <div>
                      <Text style={{ fontSize: '12px' }}>{new Date(selectedFile.createdAt).toLocaleString()}</Text>
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: '12px' }}>Updated At</Text>
                    <div>
                      <Text style={{ fontSize: '12px' }}>{new Date(selectedFile.updatedAt).toLocaleString()}</Text>
                    </div>
                  </div>
                </Space>
              ) : (
                <Text type="secondary">No file selected</Text>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions 面板 - 固定高度，置底 */}
      {!collapsed && (
        <div
          style={{
            borderTop: '1px solid #f0f0f0',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            height: quickActionsCollapsed ? 'auto' : `${quickActionsHeight}px`,
            minHeight: quickActionsCollapsed ? 'auto' : '80px',
          }}
        >
          {/* 拖拽分隔条 - 在顶部 */}
          {!quickActionsCollapsed && (
            <div
              style={{
                height: '4px',
                cursor: 'row-resize',
                background: isDraggingQuickActions ? '#1890ff' : 'transparent',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              onMouseDown={(e) => handleMouseDown('quickActions', e)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#d9d9d9';
              }}
              onMouseLeave={(e) => {
                if (!isDraggingQuickActions) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            />
          )}

          {/* 折叠标题栏 */}
          <div
            style={{
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              background: '#fafafa',
              borderBottom: quickActionsCollapsed ? 'none' : '1px solid #f0f0f0',
              flexShrink: 0,
            }}
            onClick={() => setQuickActionsCollapsed(!quickActionsCollapsed)}
          >
            {quickActionsCollapsed ? (
              <ArrowRightOutlined style={{ fontSize: '12px', marginRight: '8px' }} />
            ) : (
              <DownOutlined style={{ fontSize: '12px', marginRight: '8px' }} />
            )}
            <Text strong style={{ fontSize: '12px' }}>
              Quick Actions
            </Text>
          </div>

          {/* 面板内容 */}
          {!quickActionsCollapsed && (
            <div
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '8px 12px',
                minHeight: 0,
              }}
            >
              <Space direction="vertical" style={{ width: '100%' }} size="small">
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
          )}
        </div>
      )}
    </Sider>
  );
};

export default FileTreeSidebar;
