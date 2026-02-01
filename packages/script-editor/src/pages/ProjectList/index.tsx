import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  PlayCircleOutlined,
  CloudUploadOutlined,
  MoreOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  DeleteOutlined,
  RollbackOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  Layout,
  Card,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  Modal,
  Form,
  message,
  Dropdown,
  Spin,
} from 'antd';
import type { MenuProps } from 'antd';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { projectsApi } from '../../api/projects';
import type { Project } from '../../api/projects';
import './style.css';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const ProjectList: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [form] = Form.useForm();

  // 加载项目列表
  useEffect(() => {
    loadProjects();
  }, [statusFilter, searchText]); // 添加依赖项，当筛选条件变化时重新加载

  const loadProjects = async () => {
    setLoading(true);
    try {
      console.log('正在请求工程列表...');
      const response = await projectsApi.getProjects({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchText || undefined,
      });
      console.log('API 响应:', response);
      if (response.success) {
        console.log('工程数据:', response.data);
        setProjects(response.data);
      } else {
        console.error('API 返回 success=false');
      }
    } catch (error) {
      console.error('加载工程列表失败:', error);
      message.error('Failed to load project list: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (values: any) => {
    try {
      const response = await projectsApi.createProject({
        projectName: values.projectName,
        description: values.description || '',
        engineVersion: values.engineVersion || '1.2.0',
        engineVersionMin: '1.0.0',
        author: 'LEO', // TODO: 从用户信息获取
        tags: values.tags || [],
        // 添加工程初始化配置
        template: values.template || 'blank',
        language: values.language || 'zh-CN',
      });

      if (response.success) {
        message.success('Project created successfully');
        setIsCreateModalVisible(false);
        form.resetFields();
        loadProjects();
      } else {
        message.error('Failed to create project');
      }
    } catch (error) {
      console.error('创建工程失败:', error);
      message.error('Failed to create project: ' + (error as any).message);
    }
  };

  const handleEditProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleCopyProject = async (project: Project) => {
    try {
      // TODO: 调用API复制项目
      message.success(`Project "${project.projectName}" has been duplicated`);
      loadProjects();
    } catch (error) {
      message.error('Failed to duplicate project');
    }
  };

  // 暂时不使用的归档功能
  // const handleArchiveProject = async (project: Project) => {
  //   try {
  //     // TODO: 调用API归档项目
  //     message.success(`Project "${project.projectName}" has been archived`);
  //     loadProjects();
  //   } catch (error) {
  //     message.error('Failed to archive project');
  //   }
  // };

  const handleDeprecateProject = (project: Project) => {
    Modal.confirm({
      title: '⚠️ Confirm Deprecation',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>
            Are you sure you want to move project <strong>"{project.projectName}"</strong> to trash?
          </p>
          <p style={{ color: '#666', marginTop: '12px', fontSize: '13px' }}>
            • The project will be hidden from the normal list
            <br />
            • All files and configurations will be preserved
            <br />• You can restore it anytime from the "Deprecated" filter
          </p>
        </div>
      ),
      okText: 'Move to Trash',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await projectsApi.deprecateProject(project.id, {
            operator: 'LEO', // TODO: 从用户信息获取
          });
          message.success('Project moved to trash');
          loadProjects();
        } catch (error) {
          message.error('Failed to deprecate project');
        }
      },
    });
  };

  const handleRestoreProject = (project: Project) => {
    Modal.confirm({
      title: '♻️ Confirm Restore',
      icon: <RollbackOutlined />,
      content: (
        <div>
          <p>
            Restore project <strong>"{project.projectName}"</strong> as Draft?
          </p>
          <p style={{ color: '#666', marginTop: '12px', fontSize: '13px' }}>
            The project will be restored to Draft status and appear in the normal list.
          </p>
        </div>
      ),
      okText: 'Restore',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await projectsApi.restoreProject(project.id, {
            operator: 'LEO', // TODO: 从用户信息获取
          });
          message.success('Project restored successfully');
          loadProjects();
        } catch (error) {
          message.error('Failed to restore project');
        }
      },
    });
  };

  const getProjectMenuItems = (project: Project): MenuProps['items'] => {
    const items: MenuProps['items'] = [];

    if (project.status !== 'deprecated') {
      // 正常状态的操作
      items.push(
        {
          key: 'edit',
          icon: <EditOutlined />,
          label: 'Edit',
          onClick: () => handleEditProject(project.id),
        },
        {
          key: 'files',
          icon: <FolderOpenOutlined />,
          label: 'View Files',
          onClick: () => navigate(`/projects/${project.id}/files`),
        },
        {
          key: 'copy',
          icon: <CopyOutlined />,
          label: 'Duplicate',
          onClick: () => handleCopyProject(project),
        },
        {
          type: 'divider',
        },
        {
          key: 'deprecate',
          icon: <DeleteOutlined />,
          label: 'Move to Trash',
          danger: true,
          onClick: () => handleDeprecateProject(project),
        }
      );
    } else {
      // 已作废状态的操作
      items.push(
        {
          key: 'restore',
          icon: <RollbackOutlined />,
          label: 'Restore',
          onClick: () => handleRestoreProject(project),
        },
        {
          type: 'divider',
        },
        {
          key: 'view-only',
          icon: <FolderOpenOutlined />,
          label: 'View Only',
          onClick: () => navigate(`/projects/${project.id}/files`),
        }
      );
    }

    return items;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: 'Draft' },
      published: { color: 'success', text: 'Published' },
      archived: { color: 'error', text: 'Archived' },
      deprecated: { color: 'error', text: '🗑️ Deprecated' },
    };
    const config = statusMap[status] || statusMap.draft;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 直接使用 API 返回的数据，不需要前端再次过滤
  // API 已经根据 status 和 search 参数过滤了数据
  const filteredProjects = projects;

  return (
    <Layout className="project-list-layout">
      <Header className="project-list-header">
        <div className="header-content">
          <Title level={3} style={{ margin: 0, color: '#fff' }}>
            Consultation Script Editor
          </Title>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              New Project
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="project-list-content">
        <div className="filter-bar">
          <Space size="large">
            <Input
              placeholder="Search projects..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 150 }}>
              <Option value="all">All (Active)</Option>
              <Option value="draft">Draft</Option>
              <Option value="published">Published</Option>
              <Option value="archived">Archived</Option>
              <Option value="deprecated">🗑️ Deprecated</Option>
            </Select>
          </Space>
        </div>

        <Spin spinning={loading}>
          <div className="projects-grid">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className={`project-card ${project.status === 'deprecated' ? 'deprecated' : ''}`}
                hoverable={project.status !== 'deprecated'}
                onClick={() => project.status !== 'deprecated' && handleEditProject(project.id)}
                extra={
                  <div onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Dropdown menu={{ items: getProjectMenuItems(project) }} trigger={['click']}>
                      <Button type="text" icon={<MoreOutlined />} />
                    </Dropdown>
                  </div>
                }
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div className="project-header">
                    <Title level={5} style={{ margin: 0 }}>
                      📁 {project.projectName}
                    </Title>
                    <Space size="small">
                      {getStatusTag(project.status)}
                      {project.currentVersionId && <Tag>{project.currentVersionId}</Tag>}
                    </Space>
                  </div>

                  <Paragraph ellipsis={{ rows: 2 }} type="secondary" style={{ margin: 0 }}>
                    {project.description}
                  </Paragraph>

                  <div className="project-meta">
                    <Space size="small" wrap>
                      <Text type="secondary">🔧 Engine {project.engineVersion}</Text>
                      <Text type="secondary">•</Text>
                      <Text type="secondary">{project.author}</Text>
                      <Text type="secondary">•</Text>
                      <Text type="secondary">{project.updatedAt}</Text>
                    </Space>
                  </div>

                  <div className="project-meta">
                    <Space size="small" wrap>
                      <Text type="secondary">📄 {project.fileCount} files</Text>
                      {project.tags.map((tag) => (
                        <Tag key={tag} color="blue">
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  </div>

                  <div className="project-actions" onClick={(e) => e.stopPropagation()}>
                    <Space>
                      <Button
                        type="primary"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditProject(project.id)}
                      >
                        Edit
                      </Button>
                      <Button size="small" icon={<PlayCircleOutlined />}>
                        Debug
                      </Button>
                      <Button size="small" icon={<CloudUploadOutlined />}>
                        Publish
                      </Button>
                      <Button size="small" icon={<FolderOpenOutlined />}>
                        Files
                      </Button>
                    </Space>
                  </div>
                </Space>
              </Card>
            ))}
          </div>
        </Spin>
      </Content>

      {/* 创建工程对话框 */}
      <Modal
        title="Create New Project"
        open={isCreateModalVisible}
        onOk={() => form.submit()}
        onCancel={() => {
          setIsCreateModalVisible(false);
          form.resetFields();
        }}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateProject}>
          <Form.Item
            label="Project Name"
            name="projectName"
            rules={[{ required: true, message: 'Please enter the project name' }]}
          >
            <Input placeholder="e.g. CBT Depression Assessment Project" />
          </Form.Item>

          <Form.Item label="Project Description" name="description">
            <Input.TextArea
              rows={3}
              placeholder="Briefly describe the purpose and content of the project"
            />
          </Form.Item>

          <Form.Item
            label="Target Engine Version"
            name="engineVersion"
            initialValue="1.2.0"
            rules={[{ required: true, message: 'Please select an engine version' }]}
          >
            <Select>
              <Option value="1.0.0">v1.0.0</Option>
              <Option value="1.1.0">v1.1.0</Option>
              <Option value="1.2.0">v1.2.0 (Latest stable)</Option>
              <Option value="1.3.0">v1.3.0 (Beta)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Project Template"
            name="template"
            initialValue="blank"
            tooltip="Choose a template to initialize project with sample scripts and templates"
          >
            <Select>
              <Option value="blank">Blank Project (空白工程)</Option>
              <Option value="cbt-assessment">CBT Assessment (CBT评估会谈)</Option>
              <Option value="cbt-counseling">CBT Counseling (CBT咨询会谈)</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Language" name="language" initialValue="zh-CN">
            <Select>
              <Option value="zh-CN">中文(简体)</Option>
              <Option value="en-US">English</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Tags" name="tags">
            <Select mode="tags" placeholder="Enter tags and press Enter">
              <Option value="CBT">CBT</Option>
              <Option value="Depression">Depression</Option>
              <Option value="Anxiety">Anxiety</Option>
              <Option value="Assessment">Assessment</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default ProjectList;
