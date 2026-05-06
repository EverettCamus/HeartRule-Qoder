import {
  ArrowLeftOutlined,
  SaveOutlined,
  RocketOutlined,
  HistoryOutlined,
  BugOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import { Layout, Typography, Button, Space, Tag, Divider, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import React from 'react';

import type { Project, ScriptFile } from '../../api/projects';

const { Header } = Layout;
const { Title, Text } = Typography;

interface ProjectEditorHeaderProps {
  project: Project | null;
  hasUnsavedChanges: boolean;
  saving: boolean;
  versionPanelVisible: boolean;
  files: ScriptFile[];
  hasLastSession: boolean;
  lastSessionUnfinished: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDebug: () => void;
  onContinueDebug: () => void;
  onDebugHistory: () => void;
  onVersionToggle: () => void;
}

const ProjectEditorHeader: React.FC<ProjectEditorHeaderProps> = ({
  project,
  hasUnsavedChanges,
  saving,
  versionPanelVisible,
  files,
  hasLastSession,
  lastSessionUnfinished,
  onBack,
  onSave,
  onPublish,
  onDebug,
  onContinueDebug,
  onDebugHistory,
  onVersionToggle,
}) => {
  void hasLastSession;
  return (
    <Header
      className="editor-header"
      style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <Space size="middle" align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            Back to list
          </Button>
          <Divider type="vertical" />
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Title
              level={4}
              style={{ margin: 0, lineHeight: '1.2', fontSize: '18px', marginBottom: '2px' }}
            >
              {project?.projectName}
            </Title>
            <Text type="secondary" style={{ fontSize: '12px', lineHeight: '1' }}>
              Engine version: {project?.engineVersion}
            </Text>
          </div>
          {project?.status && (
            <Tag color={project.status === 'published' ? 'success' : 'default'}>
              {project.status === 'draft'
                ? 'Draft'
                : project.status === 'published'
                  ? 'Published'
                  : 'Archived'}
            </Tag>
          )}
          {hasUnsavedChanges && <Tag color="warning">Unsaved</Tag>}
        </Space>
        <Space>
          <Button
            icon={<HistoryOutlined />}
            onClick={onVersionToggle}
            type={versionPanelVisible ? 'primary' : 'default'}
          >
            版本管理
          </Button>
          {(() => {
            const sessionFileCount = files.filter((f) => f.fileType === 'session').length;
            const disabled = !project || sessionFileCount === 0;
            const mainLabel = lastSessionUnfinished ? '继续调试' : 'Debug';
            const mainAction = lastSessionUnfinished ? onContinueDebug : onDebug;
            const buttonType = lastSessionUnfinished ? 'primary' : 'default';

            const menuItems: MenuProps['items'] = [
              {
                key: 'new',
                label: '新建调试',
                icon: <BugOutlined />,
                onClick: onDebug,
              },
              {
                key: 'history',
                label: '调试历史',
                icon: <HistoryOutlined />,
                onClick: onDebugHistory,
              },
            ];

            return (
              <Space.Compact>
                <Button
                  type={buttonType}
                  icon={<BugOutlined />}
                  onClick={mainAction}
                  disabled={disabled}
                >
                  {mainLabel}
                </Button>
                <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                  <Button type={buttonType} icon={<CaretDownOutlined />} disabled={disabled} />
                </Dropdown>
              </Space.Compact>
            );
          })()}
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            onClick={onSave}
            disabled={!hasUnsavedChanges}
          >
            Save {hasUnsavedChanges && '(Ctrl+S)'}
          </Button>
          <Button icon={<RocketOutlined />} onClick={onPublish}>
            Publish Version
          </Button>
        </Space>
      </div>
    </Header>
  );
};

export default ProjectEditorHeader;
