import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import EditorContent from './EditorContent';
import { projectsApi } from '../../api/projects';
import type { ScriptFile } from '../../api/projects';

// Mock dependencies
vi.mock('../../api/projects', () => ({
  projectsApi: {
    getTemplateSchemes: vi.fn(),
  },
}));

vi.mock('../../components/ActionNodeList', () => ({
  ActionNodeList: React.forwardRef(() => <div data-testid="action-node-list">ActionNodeList</div>),
}));

vi.mock('../../components/ActionPropertyPanel', () => ({
  ActionPropertyPanel: () => <div data-testid="action-property-panel">ActionPropertyPanel</div>,
}));

vi.mock('../../components/PhaseTopicPropertyPanel', () => ({
  PhaseTopicPropertyPanel: () => <div data-testid="phase-topic-panel">PhaseTopicPropertyPanel</div>,
}));

vi.mock('../../components/SessionPropertyPanel', () => ({
  SessionPropertyPanel: ({ availableSchemes }: { availableSchemes: any[] }) => (
    <div data-testid="session-property-panel">
      <div data-testid="schemes-count">{availableSchemes.length}</div>
    </div>
  ),
}));

describe('EditorContent - Template Scheme Integration', () => {
  const mockProjectId = 'test-project-123';
  const mockFile: ScriptFile = {
    id: 'file-1',
    projectId: mockProjectId,
    fileName: 'test-session.yaml',
    fileType: 'session',
    fileContent: 'session:\n  session_id: test',
    yamlContent: 'session:\n  session_id: test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const defaultProps = {
    projectId: mockProjectId,
    editMode: 'visual' as const,
    selectedFile: mockFile,
    fileContent: 'session:\n  session_id: test\n  template_scheme: default',
    currentPhases: [],
    parsedScript: {
      session: {
        session_id: 'test',
        session_name: 'Test Session',
        template_scheme: 'default',
      },
    },
    validationResult: null,
    showValidationErrors: false,
    selectedActionPath: null,
    selectedPhasePath: null,
    selectedTopicPath: null,
    editingType: 'session' as const,
    actionNodeListRef: { current: null },
    onContentChange: vi.fn(),
    onModeChange: vi.fn(),
    onCloseValidationErrors: vi.fn(),
    onSelectAction: vi.fn(),
    onSelectPhase: vi.fn(),
    onSelectTopic: vi.fn(),
    onAddPhase: vi.fn(),
    onAddTopic: vi.fn(),
    onAddAction: vi.fn(),
    onDeletePhase: vi.fn(),
    onDeleteTopic: vi.fn(),
    onDeleteAction: vi.fn(),
    onMovePhase: vi.fn(),
    onMoveTopic: vi.fn(),
    onMoveAction: vi.fn(),
    onActionSave: vi.fn(),
    onPhaseSave: vi.fn(),
    onTopicSave: vi.fn(),
    onSessionSave: vi.fn(),
    onEditSessionConfig: vi.fn(),
    parseYamlToScript: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T22-1: 应成功加载模板方案列表', async () => {
    const mockSchemes = [
      { name: 'default', description: '系统默认模板', isDefault: true },
      { name: 'crisis_intervention', description: '危机干预专用', isDefault: false },
      { name: 'cbt_counseling', description: 'CBT咨询专用', isDefault: false },
    ];

    vi.mocked(projectsApi.getTemplateSchemes).mockResolvedValue(mockSchemes);

    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(projectsApi.getTemplateSchemes).toHaveBeenCalledWith(mockProjectId);
    });

    await waitFor(() => {
      const schemesCount = screen.getByTestId('schemes-count');
      expect(schemesCount.textContent).toBe('3');
    });
  });

  it('T22-2: API失败时应使用默认方案作为备用', async () => {
    vi.mocked(projectsApi.getTemplateSchemes).mockRejectedValue(new Error('Network error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[EditorContent] 获取模板方案失败:',
        expect.any(Error)
      );
    });

    await waitFor(() => {
      const schemesCount = screen.getByTestId('schemes-count');
      expect(schemesCount.textContent).toBe('1'); // 仅 default 方案
    });

    consoleErrorSpy.mockRestore();
  });

  it('T22-3: projectId变化时应重新加载方案列表', async () => {
    const mockSchemes = [
      { name: 'default', description: '系统默认模板', isDefault: true },
    ];

    vi.mocked(projectsApi.getTemplateSchemes).mockResolvedValue(mockSchemes);

    const { rerender } = render(
      <BrowserRouter>
        <EditorContent {...defaultProps} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(projectsApi.getTemplateSchemes).toHaveBeenCalledWith(mockProjectId);
    });

    // 切换到新项目
    const newProjectId = 'new-project-456';
    rerender(
      <BrowserRouter>
        <EditorContent {...defaultProps} projectId={newProjectId} />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(projectsApi.getTemplateSchemes).toHaveBeenCalledWith(newProjectId);
      expect(projectsApi.getTemplateSchemes).toHaveBeenCalledTimes(2);
    });
  });

  it('T22-4: SessionPropertyPanel应接收动态加载的方案列表', async () => {
    const mockSchemes = [
      { name: 'default', description: '系统默认模板', isDefault: true },
      { name: 'custom1', description: '自定义方案1', isDefault: false },
    ];

    vi.mocked(projectsApi.getTemplateSchemes).mockResolvedValue(mockSchemes);

    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} />
      </BrowserRouter>
    );

    await waitFor(() => {
      const panel = screen.getByTestId('session-property-panel');
      expect(panel).toBeInTheDocument();
    });

    await waitFor(() => {
      const schemesCount = screen.getByTestId('schemes-count');
      expect(schemesCount.textContent).toBe('2');
    });
  });

  it('T22-5: 在YAML模式下不应显示SessionPropertyPanel', () => {
    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} editMode="yaml" />
      </BrowserRouter>
    );

    expect(screen.queryByTestId('session-property-panel')).not.toBeInTheDocument();
  });

  it('T22-6: editingType为null时不应显示任何属性面板', () => {
    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} editingType={null} />
      </BrowserRouter>
    );

    expect(screen.queryByTestId('session-property-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-property-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('phase-topic-panel')).not.toBeInTheDocument();
  });

  it('T22-7: 没有projectId时不应调用API', async () => {
    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} projectId="" />
      </BrowserRouter>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(projectsApi.getTemplateSchemes).not.toHaveBeenCalled();
  });

  it('T22-8: 模板文件加载时应显示文件名', () => {
    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} selectedFile={null} fileContent="test content" />
      </BrowserRouter>
    );

    expect(screen.getByText('模板文件')).toBeInTheDocument();
  });

  it('T22-9: Session配置按钮在visual模式下应可见', () => {
    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} editMode="visual" />
      </BrowserRouter>
    );

    expect(screen.getByText('Session 配置')).toBeInTheDocument();
  });

  it('T22-10: 空方案列表时应正常渲染', async () => {
    vi.mocked(projectsApi.getTemplateSchemes).mockResolvedValue([]);

    render(
      <BrowserRouter>
        <EditorContent {...defaultProps} />
      </BrowserRouter>
    );

    await waitFor(() => {
      const schemesCount = screen.getByTestId('schemes-count');
      expect(schemesCount.textContent).toBe('0');
    });
  });
});
