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
      message.error('加载工程列表失败: ' + (error as any).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (_values: any) => {
    try {
      // TODO: 调用API创建项目
      message.success('工程创建成功');
      setIsCreateModalVisible(false);
      form.resetFields();
      loadProjects();
    } catch (error) {
      message.error('工程创建失败');
    }
  };

  const handleEditProject = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  const handleCopyProject = async (project: Project) => {
    try {
      // TODO: 调用API复制项目
      message.success(`工程"${project.projectName}"已复制`);
      loadProjects();
    } catch (error) {
      message.error('复制失败');
    }
  };

  const handleArchiveProject = async (project: Project) => {
    try {
      // TODO: 调用API归档项目
      message.success(`工程"${project.projectName}"已归档`);
      loadProjects();
    } catch (error) {
      message.error('归档失败');
    }
  };

  const getProjectMenuItems = (project: Project): MenuProps['items'] => [
    {
      key: 'edit',
      icon: <EditOutlined />,
      label: '编辑',
      onClick: () => handleEditProject(project.id),
    },
    {
      key: 'files',
      icon: <FolderOpenOutlined />,
      label: '查看文件',
      onClick: () => navigate(`/projects/${project.id}/files`),
    },
    {
      key: 'copy',
      icon: <CopyOutlined />,
      label: '复制',
      onClick: () => handleCopyProject(project),
    },
    {
      type: 'divider',
    },
    {
      key: 'archive',
      icon: <DeleteOutlined />,
      label: '归档',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '确认归档',
          content: `确定要归档工程"${project.projectName}"吗？`,
          onOk: () => handleArchiveProject(project),
        });
      },
    },
  ];

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      draft: { color: 'default', text: '草稿' },
      published: { color: 'success', text: '已发布' },
      archived: { color: 'error', text: '已归档' },
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
            咨询脚本编辑器
          </Title>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateModalVisible(true)}
            >
              新建工程
            </Button>
          </Space>
        </div>
      </Header>

      <Content className="project-list-content">
        <div className="filter-bar">
          <Space size="large">
            <Input
              placeholder="搜索工程..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}>
              <Option value="all">全部状态</Option>
              <Option value="draft">草稿</Option>
              <Option value="published">已发布</Option>
              <Option value="archived">已归档</Option>
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
                      <Text type="secondary">🔧 引擎 {project.engineVersion}</Text>
                      <Text type="secondary">•</Text>
                      <Text type="secondary">{project.author}</Text>
                      <Text type="secondary">•</Text>
                      <Text type="secondary">{project.updatedAt}</Text>
                    </Space>
                  </div>

                  <div className="project-meta">
                    <Space size="small" wrap>
                      <Text type="secondary">📄 {project.fileCount}个文件</Text>
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
                        编辑
                      </Button>
                      <Button size="small" icon={<PlayCircleOutlined />}>
                        调试
                      </Button>
                      <Button size="small" icon={<CloudUploadOutlined />}>
                        发布
                      </Button>
                      <Button size="small" icon={<FolderOpenOutlined />}>
                        文件
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
        title="创建新工程"
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
            label="工程名称"
            name="projectName"
            rules={[{ required: true, message: '请输入工程名称' }]}
          >
            <Input placeholder="例如: CBT抑郁症评估工程" />
          </Form.Item>

          <Form.Item label="工程描述" name="description">
            <Input.TextArea rows={3} placeholder="简要说明工程的用途和内容" />
          </Form.Item>

          <Form.Item
            label="目标引擎版本"
            name="engineVersion"
            initialValue="1.2.0"
            rules={[{ required: true, message: '请选择引擎版本' }]}
          >
            <Select>
              <Option value="1.0.0">v1.0.0</Option>
              <Option value="1.1.0">v1.1.0</Option>
              <Option value="1.2.0">v1.2.0 (最新稳定版)</Option>
              <Option value="1.3.0">v1.3.0 (测试版)</Option>
            </Select>
          </Form.Item>

          <Form.Item label="标签" name="tags">
            <Select mode="tags" placeholder="输入标签，按回车添加">
              <Option value="CBT">CBT</Option>
              <Option value="抑郁症">抑郁症</Option>
              <Option value="焦虑症">焦虑症</Option>
              <Option value="评估">评估</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default ProjectList;
