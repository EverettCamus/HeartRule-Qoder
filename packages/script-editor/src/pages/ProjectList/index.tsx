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
  }, []);

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

  const handleArchiveProject = async (project: Project) => {
    try {
      // TODO: 调用API归档项目
      message.success(`Project "${project.projectName}" has been archived`);
      loadProjects();
    } catch (error) {
      message.error('Failed to archive project');
    }
  };

  const getProjectMenuItems = (project: Project): MenuProps['items'] => [
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
      key: 'archive',
      icon: <DeleteOutlined />,
      label: 'Archive',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: 'Confirm Archive',
          content: `Are you sure you want to archive project "${project.projectName}"?`,
          onOk: () => handleArchiveProject(project),
        });
      },
    },
  ];

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: 'Draft' },
      published: { color: 'success', text: 'Published' },
      archived: { color: 'error', text: 'Archived' },
    };
    const config = statusMap[status] || statusMap.draft;
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      searchText === '' ||
      project.projectName.toLowerCase().includes(searchText.toLowerCase()) ||
      project.description.toLowerCase().includes(searchText.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}>
              <Option value="all">All statuses</Option>
              <Option value="draft">Draft</Option>
              <Option value="published">Published</Option>
              <Option value="archived">Archived</Option>
            </Select>
          </Space>
        </div>

        <Spin spinning={loading}>
          <div className="projects-grid">
            {filteredProjects.map((project) => (
              <Card
                key={project.id}
                className="project-card"
                hoverable
                onClick={() => handleEditProject(project.id)}
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
