import React, { useState, useEffect } from 'react';
import { Modal, Button, List, Input, Space, Typography, Popconfirm, message, Spin } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SettingOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { projectsApi } from '../../api/projects';
import CreateSchemeModal from './CreateSchemeModal';
import EditSchemeModal from './EditSchemeModal';
import './style.css';

const { Text, Title } = Typography;
const { Search } = Input;

interface TemplateScheme {
  name: string;
  description: string;
  isDefault: boolean;
}

interface TemplateSchemeManagerProps {
  visible: boolean;
  projectId: string;
  onClose: () => void;
  onSchemeChange?: () => void; // 当方案列表变化时的回调
}

const TemplateSchemeManager: React.FC<TemplateSchemeManagerProps> = ({
  visible,
  projectId,
  onClose,
  onSchemeChange,
}) => {
  const [schemes, setSchemes] = useState<TemplateScheme[]>([]);
  const [filteredSchemes, setFilteredSchemes] = useState<TemplateScheme[]>([]);
  const [selectedScheme, setSelectedScheme] = useState<TemplateScheme | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // 加载模板方案列表
  const loadSchemes = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const data = await projectsApi.getTemplateSchemes(projectId);
      setSchemes(data);
      setFilteredSchemes(data);
      
      // 如果当前选中的方案不存在了，重置选择
      if (selectedScheme && !data.find((s) => s.name === selectedScheme.name)) {
        setSelectedScheme(null);
      }
    } catch (error: any) {
      console.error('Failed to load template schemes:', error);
      message.error(error?.response?.data?.error || '加载模板方案列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 监听 visible 变化时加载数据
  useEffect(() => {
    if (visible) {
      loadSchemes();
    }
  }, [visible, projectId]);

  // 搜索过滤
  useEffect(() => {
    if (searchText) {
      setFilteredSchemes(
        schemes.filter(
          (s) =>
            s.name.toLowerCase().includes(searchText.toLowerCase()) ||
            s.description.toLowerCase().includes(searchText.toLowerCase())
        )
      );
    } else {
      setFilteredSchemes(schemes);
    }
  }, [searchText, schemes]);

  // 处理删除方案
  const handleDelete = async (scheme: TemplateScheme) => {
    if (scheme.isDefault) {
      message.error('不能删除系统默认方案');
      return;
    }

    setLoading(true);
    try {
      await projectsApi.deleteTemplateScheme(projectId, scheme.name);
      message.success(`方案 "${scheme.name}" 已删除`);
      
      // 重新加载列表
      await loadSchemes();
      
      // 如果删除的是当前选中的方案，清空选择
      if (selectedScheme?.name === scheme.name) {
        setSelectedScheme(null);
      }

      // 通知父组件方案列表已变化
      onSchemeChange?.();
    } catch (error: any) {
      console.error('Failed to delete scheme:', error);
      message.error(error?.response?.data?.error || '删除方案失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理创建方案成功
  const handleCreateSuccess = () => {
    setCreateModalVisible(false);
    loadSchemes();
    onSchemeChange?.();
  };

  // 处理编辑方案成功
  const handleEditSuccess = () => {
    setEditModalVisible(false);
    loadSchemes();
    onSchemeChange?.();
  };

  return (
    <>
      <Modal
        title="模板方案管理"
        open={visible}
        onCancel={onClose}
        width={900}
        footer={[
          <Button key="close" onClick={onClose}>
            关闭
          </Button>,
        ]}
      >
        <div className="template-scheme-manager">
          <div className="manager-header">
            <Space>
              <Search
                placeholder="搜索方案名称或描述"
                allowClear
                style={{ width: 300 }}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                新建方案
              </Button>
            </Space>
          </div>

          <div className="manager-content">
            <div className="scheme-list-container">
              <Spin spinning={loading}>
                <List
                  dataSource={filteredSchemes}
                  renderItem={(scheme) => (
                    <List.Item
                      className={`scheme-item ${selectedScheme?.name === scheme.name ? 'selected' : ''}`}
                      onClick={() => setSelectedScheme(scheme)}
                      actions={
                        scheme.isDefault
                          ? []
                          : [
                              <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedScheme(scheme);
                                  setEditModalVisible(true);
                                }}
                              >
                                编辑
                              </Button>,
                              <Popconfirm
                                title="确认删除"
                                description={`确定要删除方案 "${scheme.name}" 吗？此操作不可恢复。`}
                                onConfirm={(e) => {
                                  e?.stopPropagation();
                                  handleDelete(scheme);
                                }}
                                onCancel={(e) => e?.stopPropagation()}
                                okText="删除"
                                cancelText="取消"
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  删除
                                </Button>
                              </Popconfirm>,
                            ]
                      }
                    >
                      <List.Item.Meta
                        avatar={
                          scheme.isDefault ? (
                            <LockOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                          ) : (
                            <UnlockOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                          )
                        }
                        title={
                          <Space>
                            {scheme.name}
                            {scheme.isDefault && (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                (系统默认)
                              </Text>
                            )}
                          </Space>
                        }
                        description={scheme.description}
                      />
                    </List.Item>
                  )}
                />

                {filteredSchemes.length === 0 && !loading && (
                  <div className="empty-state">
                    <SettingOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />
                    <p>{searchText ? '未找到匹配的方案' : '暂无模板方案'}</p>
                  </div>
                )}
              </Spin>
            </div>

            {selectedScheme && (
              <div className="scheme-detail">
                  <Title level={5}>方案详情</Title>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                      <Text strong>名称：</Text>
                      <Text>{selectedScheme.name}</Text>
                    </div>
                    <div>
                      <Text strong>描述：</Text>
                      <Text>{selectedScheme.description}</Text>
                    </div>
                    <div>
                      <Text strong>类型：</Text>
                      <Text>{selectedScheme.isDefault ? '系统默认（只读）' : '自定义（可编辑）'}</Text>
                    </div>

                    {selectedScheme.isDefault && (
                      <div className="readonly-tip">
                        <Text type="warning">
                          ⚠️ 系统默认方案为只读，不可修改或删除。如需自定义，请基于此方案创建新的自定义方案。
                        </Text>
                      </div>
                    )}

                    {!selectedScheme.isDefault && (
                      <Space>
                        <Button
                          icon={<EditOutlined />}
                          onClick={() => setEditModalVisible(true)}
                        >
                          编辑描述
                        </Button>
                      </Space>
                    )}
                  </Space>
                </div>
              )}
          </div>
        </div>
      </Modal>

      {/* 创建方案对话框 */}
      <CreateSchemeModal
        visible={createModalVisible}
        projectId={projectId}
        existingSchemes={schemes}
        onSuccess={handleCreateSuccess}
        onCancel={() => setCreateModalVisible(false)}
      />

      {/* 编辑方案对话框 */}
      {selectedScheme && !selectedScheme.isDefault && (
        <EditSchemeModal
          visible={editModalVisible}
          projectId={projectId}
          scheme={selectedScheme}
          onSuccess={handleEditSuccess}
          onCancel={() => setEditModalVisible(false)}
        />
      )}
    </>
  );
};

export default TemplateSchemeManager;
