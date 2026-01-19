import React, { useState, useEffect } from 'react';
import { Spin, Button, Tag, Empty, message, Modal, Space, Typography, Divider } from 'antd';
import {
  HistoryOutlined,
  CheckCircleOutlined,
  RollbackOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { versionsApi, type ProjectVersion } from '../../api/projects';
import { globalHistoryManager } from '../../utils/history-manager';
import './style.css';

const { Text, Title } = Typography;
const { confirm } = Modal;

interface VersionListPanelProps {
  projectId: string;
  currentVersionId?: string | null;
  onVersionChange?: () => void;
  hasUnsavedChanges?: boolean;
}

interface VersionItem extends ProjectVersion {
  rollbackFromVersionNumber?: string;
}

type LoadingState = 'loading' | 'loaded' | 'error';

const VersionListPanel: React.FC<VersionListPanelProps> = ({
  projectId,
  currentVersionId,
  onVersionChange,
  hasUnsavedChanges,
}) => {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [versionList, setVersionList] = useState<VersionItem[]>([]);
  const [switchingVersionId, setSwitchingVersionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftExists, setDraftExists] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);

  const loadData = async () => {
    setLoadingState('loading');
    setErrorMessage(null);

    try {
      const [versionsRes, draftRes] = await Promise.allSettled([
        versionsApi.getVersions(projectId),
        versionsApi.getDraft(projectId),
      ]);

      if (versionsRes.status === 'fulfilled' && versionsRes.value.success) {
        const versions = versionsRes.value.data;
        const versionNumberMap = new Map<string, string>();
        versions.forEach((v) => {
          versionNumberMap.set(v.id, v.versionNumber);
        });

        const enhancedVersions: VersionItem[] = versions.map((v) => ({
          ...v,
          rollbackFromVersionNumber: v.rollbackFromVersionId
            ? versionNumberMap.get(v.rollbackFromVersionId)
            : undefined,
        }));

        setVersionList(enhancedVersions);
      } else {
        throw new Error('Failed to load versions');
      }

      if (draftRes.status === 'fulfilled' && draftRes.value.success) {
        setDraftExists(true);
        setDraftUpdatedAt(draftRes.value.data.updatedAt);
      } else {
        setDraftExists(false);
        setDraftUpdatedAt(null);
      }

      setLoadingState('loaded');
    } catch (error) {
      console.error('Failed to load version data:', error);
      setErrorMessage('加载版本数据失败');
      setLoadingState('error');
    }
  };

  useEffect(() => {
    if (projectId) {
      loadData();
    }
  }, [projectId]);

  const handleVersionSwitch = async (versionId: string, versionNumber: string) => {
    const performSwitch = async () => {
      setSwitchingVersionId(versionId);
      try {
        const result = await versionsApi.setCurrentVersion(projectId, { versionId });

        if (result.success) {
          // 版本切换后立即清空操作历史，防止跨版本数据错乱
          console.log('[VersionSwitch] 🔄 版本切换成功，清空操作历史栈');
          globalHistoryManager.clear();
          
          message.success('版本切换成功');
          await loadData();
          onVersionChange?.();
        } else {
          throw new Error('Failed to switch version');
        }
      } catch (error) {
        console.error('Failed to switch version:', error);
        message.error('版本切换失败');
      } finally {
        setSwitchingVersionId(null);
      }
    };

    if (hasUnsavedChanges) {
      confirm({
        title: '工作区有未发布的修改',
        icon: <ExclamationCircleOutlined />,
        content: '切换版本将覆盖当前工作区的所有修改，且无法撤销。确认继续吗？',
        okText: '确认覆盖',
        okType: 'danger',
        cancelText: '取消',
        onOk: performSwitch,
      });
    } else {
      confirm({
        title: '切换版本',
        icon: <ExclamationCircleOutlined />,
        content: `确认将当前工作版本切换为 ${versionNumber} 吗？`,
        okText: '确认',
        cancelText: '取消',
        onOk: performSwitch,
      });
    }
  };

  const renderCurrentVersionInfo = () => {
    console.log('[VersionPanel] currentVersionId:', currentVersionId);
    console.log('[VersionPanel] versionList length:', versionList.length);
    
    if (!currentVersionId) {
      return (
        <div className="version-info-section">
          <Text type="secondary">暂无当前版本</Text>
        </div>
      );
    }

    const currentVersion = versionList.find((v) => v.id === currentVersionId);
    console.log('[VersionPanel] Found currentVersion:', currentVersion?.versionNumber);
    
    if (!currentVersion) {
      return (
        <div className="version-info-section">
          <Text type="secondary">加载中...</Text>
        </div>
      );
    }

    return (
      <div className="version-info-section">
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text strong style={{ fontSize: '16px' }}>
              {currentVersion.versionNumber}
            </Text>
            <Tag color="green" icon={<CheckCircleOutlined />}>
              当前版本
            </Tag>
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            发布时间: {new Date(currentVersion.publishedAt).toLocaleString()}
          </Text>
          {currentVersion.releaseNote && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              {currentVersion.releaseNote}
            </Text>
          )}
        </Space>
      </div>
    );
  };

  const renderDraftStatus = () => {
    if (!draftExists) {
      return null;
    }

    return (
      <div className="draft-status-section">
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text>工作区草稿</Text>
            <Tag color="orange" icon={<EditOutlined />}>
              未发布
            </Tag>
          </div>
          {draftUpdatedAt && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              更新时间: {new Date(draftUpdatedAt).toLocaleString()}
            </Text>
          )}
        </Space>
      </div>
    );
  };

  const renderVersionList = () => {
    if (versionList.length === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无版本历史"
          style={{ marginTop: 40 }}
        />
      );
    }

    return (
      <div className="version-list-scroll">
        {versionList.map((version) => {
          const isCurrent = version.id === currentVersionId;
          const isSwitching = version.id === switchingVersionId;
          const isRollback = version.isRollback === 'true';

          return (
            <div
              key={version.id}
              className={`version-item ${isCurrent ? 'version-item-current' : ''} ${isSwitching ? 'version-item-switching' : ''}`}
            >
              <div className="version-item-header">
                <Space size={8}>
                  <Text strong>{version.versionNumber}</Text>
                  {isCurrent && (
                    <Tag color="green" icon={<CheckCircleOutlined />}>
                      当前
                    </Tag>
                  )}
                  {isRollback && (
                    <Tag color="orange" icon={<RollbackOutlined />}>
                      回滚
                    </Tag>
                  )}
                </Space>
                {!isCurrent && (
                  <Button
                    type="link"
                    size="small"
                    loading={isSwitching}
                    onClick={() => handleVersionSwitch(version.id, version.versionNumber)}
                  >
                    切换
                  </Button>
                )}
              </div>

              <div className="version-item-info">
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  发布时间: {new Date(version.publishedAt).toLocaleString()}
                </Text>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  发布人: {version.publishedBy}
                </Text>
              </div>

              {version.releaseNote && (
                <div className="version-item-note">
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {version.releaseNote}
                  </Text>
                </div>
              )}

              {isRollback && version.rollbackFromVersionNumber && (
                <div className="version-item-rollback-info">
                  <Tag color="blue" style={{ fontSize: '11px' }}>
                    回滚自: {version.rollbackFromVersionNumber}
                  </Tag>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (loadingState === 'loading') {
    return (
      <div className="version-panel-loading">
        <Spin tip="加载版本数据..." />
      </div>
    );
  }

  if (loadingState === 'error') {
    return (
      <div className="version-panel-error">
        <Space direction="vertical" align="center">
          <ExclamationCircleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />
          <Text type="danger">{errorMessage}</Text>
          <Button type="primary" onClick={loadData}>
            重试
          </Button>
        </Space>
      </div>
    );
  }

  return (
    <div className="version-list-panel">
      <div className="version-panel-header">
        <Title level={5} style={{ margin: 0 }}>
          <HistoryOutlined /> 版本管理
        </Title>
      </div>

      <div className="version-panel-content">
        {renderCurrentVersionInfo()}
        <Divider style={{ margin: '12px 0' }} />
        {renderDraftStatus()}
        {draftExists && <Divider style={{ margin: '12px 0' }} />}
        <div className="version-list-header">
          <Text strong>版本历史</Text>
          <Button type="text" size="small" icon={<HistoryOutlined />} onClick={loadData}>
            刷新
          </Button>
        </div>
        {renderVersionList()}
      </div>
    </div>
  );
};

export default VersionListPanel;
