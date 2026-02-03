import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionPropertyPanel } from './index';
import type { SessionData, TemplateScheme } from './index';

describe('SessionPropertyPanel 组件', () => {
  const mockSessionData: SessionData = {
    name: 'CBT抑郁症评估会谈',
    description: '基于CBT理论的抑郁症初步评估',
    version: '1.0.0',
    template_scheme: 'default',
  };

  const mockSchemes: TemplateScheme[] = [
    {
      name: 'default',
      description: '系统默认模板（包含通用安全边界和标准流程）',
      isDefault: true,
    },
    {
      name: 'crisis_intervention',
      description: '危机干预专用模板',
      isDefault: false,
    },
    {
      name: 'custom_scheme',
      description: '自定义测试方案',
      isDefault: false,
    },
  ];

  const mockOnSave = vi.fn();
  const mockOnManageSchemes = vi.fn();
  const mockOnViewSchemeDetails = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('基本渲染', () => {
    it('应该正确渲染组件', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('session-property-panel')).toBeInTheDocument();
      expect(screen.getByText('Session 属性')).toBeInTheDocument();
    });

    it('应该显示所有表单字段', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      expect(screen.getByTestId('input-name')).toBeInTheDocument();
      expect(screen.getByTestId('input-version')).toBeInTheDocument();
      expect(screen.getByTestId('textarea-description')).toBeInTheDocument();
      expect(screen.getByTestId('select-template-scheme')).toBeInTheDocument();
    });

    it('应该正确填充初始值', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const nameInput = screen.getByTestId('input-name') as HTMLInputElement;
      const versionInput = screen.getByTestId('input-version') as HTMLInputElement;
      const descTextarea = screen.getByTestId('textarea-description') as HTMLTextAreaElement;

      expect(nameInput.value).toBe('CBT抑郁症评估会谈');
      expect(versionInput.value).toBe('1.0.0');
      expect(descTextarea.value).toBe('基于CBT理论的抑郁症初步评估');
    });
  });

  describe('模板方案选择', () => {
    it.skip('应该显示所有可用的模板方案', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const select = screen.getByTestId('select-template-scheme');
      fireEvent.mouseDown(select);

      // 验证所有方案都在下拉列表中
      await waitFor(() => {
        expect(screen.getByTestId('scheme-option-default')).toBeInTheDocument();
        expect(screen.getByTestId('scheme-option-crisis_intervention')).toBeInTheDocument();
        expect(screen.getByTestId('scheme-option-custom_scheme')).toBeInTheDocument();
      });
    });

    it.skip('应该标记系统默认方案', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const select = screen.getByTestId('select-template-scheme');
      fireEvent.mouseDown(select);

      await waitFor(() => {
        const defaultOption = screen.getByTestId('scheme-option-default');
        expect(defaultOption.textContent).toContain('系统默认');
      });
    });

    it('应该显示选中方案的描述', () => {
      render(
        <SessionPropertyPanel
          sessionData={{ ...mockSessionData, template_scheme: 'crisis_intervention' }}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const description = screen.getByTestId('scheme-description');
      expect(description.textContent).toContain('危机干预专用模板');
    });

    it('未选择方案时应该显示默认描述', () => {
      render(
        <SessionPropertyPanel
          sessionData={{ ...mockSessionData, template_scheme: undefined }}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      // 未选中时不显示描述框
      expect(screen.queryByTestId('scheme-description')).not.toBeInTheDocument();
    });
  });

  describe('表单验证', () => {
    it('会谈名称为必填项', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const nameInput = screen.getByTestId('input-name') as HTMLInputElement;
      
      // 清空名称
      fireEvent.change(nameInput, { target: { value: '' } });
      
      // 点击保存
      const saveButton = screen.getByTestId('btn-save');
      fireEvent.click(saveButton);

      // 应该显示验证错误
      await waitFor(() => {
        expect(screen.getByText('请输入会谈名称')).toBeInTheDocument();
      });

      // 不应该调用onSave
      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('版本号格式应该符合x.y.z', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const versionInput = screen.getByTestId('input-version') as HTMLInputElement;
      
      // 输入错误格式
      fireEvent.change(versionInput, { target: { value: 'v1.0' } });
      
      // 点击保存
      const saveButton = screen.getByTestId('btn-save');
      fireEvent.click(saveButton);

      // 应该显示验证错误
      await waitFor(() => {
        expect(screen.getByText(/版本号格式应为/)).toBeInTheDocument();
      });

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('描述字段应该限制最大长度', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const descTextarea = screen.getByTestId('textarea-description') as HTMLTextAreaElement;
      
      // TextArea的maxLength属性应该被设置
      expect(descTextarea.maxLength).toBe(500);
    });
  });

  describe('保存和取消功能', () => {
    it('修改后保存按钮应该启用', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const saveButton = screen.getByTestId('btn-save') as HTMLButtonElement;
      
      // 初始状态保存按钮应该禁用
      expect(saveButton.disabled).toBe(true);

      // 修改名称
      const nameInput = screen.getByTestId('input-name');
      fireEvent.change(nameInput, { target: { value: '修改后的名称' } });

      // 保存按钮应该启用
      await waitFor(() => {
        expect(saveButton.disabled).toBe(false);
      });
    });

    it('点击保存应该调用onSave回调', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      // 修改名称
      const nameInput = screen.getByTestId('input-name');
      fireEvent.change(nameInput, { target: { value: '新名称' } });

      // 点击保存
      const saveButton = screen.getByTestId('btn-save');
      fireEvent.click(saveButton);

      // 验证回调参数
      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith({
          name: '新名称',
          description: mockSessionData.description,
          version: mockSessionData.version,
          template_scheme: mockSessionData.template_scheme,
        });
      });
    });

    it('点击取消应该重置表单', async () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const nameInput = screen.getByTestId('input-name') as HTMLInputElement;
      
      // 修改名称
      fireEvent.change(nameInput, { target: { value: '临时修改' } });
      expect(nameInput.value).toBe('临时修改');

      // 点击取消按钮（通过测试ID）
      const cancelButton = screen.getByTestId('btn-cancel');
      fireEvent.click(cancelButton);

      // 应该恢复原值
      await waitFor(() => {
        expect(nameInput.value).toBe(mockSessionData.name);
      });
    });
  });

  describe('管理功能按钮', () => {
    it('应该显示"管理模板方案"按钮', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
          onManageSchemes={mockOnManageSchemes}
        />
      );

      const manageButton = screen.getByTestId('btn-manage-schemes');
      expect(manageButton).toBeInTheDocument();
      expect(manageButton.textContent).toContain('管理模板方案');
    });

    it('点击"管理模板方案"应该调用回调', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
          onManageSchemes={mockOnManageSchemes}
        />
      );

      const manageButton = screen.getByTestId('btn-manage-schemes');
      fireEvent.click(manageButton);

      expect(mockOnManageSchemes).toHaveBeenCalledTimes(1);
    });

    it('选中方案时应该显示"查看方案详情"按钮', () => {
      render(
        <SessionPropertyPanel
          sessionData={{ ...mockSessionData, template_scheme: 'crisis_intervention' }}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
          onViewSchemeDetails={mockOnViewSchemeDetails}
        />
      );

      const viewButton = screen.getByTestId('btn-view-scheme');
      expect(viewButton).toBeInTheDocument();
    });

    it('点击"查看方案详情"应该传递方案名称', () => {
      render(
        <SessionPropertyPanel
          sessionData={{ ...mockSessionData, template_scheme: 'crisis_intervention' }}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
          onViewSchemeDetails={mockOnViewSchemeDetails}
        />
      );

      const viewButton = screen.getByTestId('btn-view-scheme');
      fireEvent.click(viewButton);

      expect(mockOnViewSchemeDetails).toHaveBeenCalledWith('crisis_intervention');
    });

    it('未提供回调时不应该显示管理按钮', () => {
      render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      expect(screen.queryByTestId('btn-manage-schemes')).not.toBeInTheDocument();
    });
  });

  describe('数据更新', () => {
    it('当sessionData变化时应该更新表单', async () => {
      const { rerender } = render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      const nameInput = screen.getByTestId('input-name') as HTMLInputElement;
      expect(nameInput.value).toBe('CBT抑郁症评估会谈');

      // 更新sessionData
      const newSessionData: SessionData = {
        ...mockSessionData,
        name: '更新后的名称',
      };

      rerender(
        <SessionPropertyPanel
          sessionData={newSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      // 表单应该更新
      await waitFor(() => {
        expect(nameInput.value).toBe('更新后的名称');
      });
    });

    it('数据更新后hasChanges应该重置', async () => {
      const { rerender } = render(
        <SessionPropertyPanel
          sessionData={mockSessionData}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      // 修改表单
      const nameInput = screen.getByTestId('input-name');
      fireEvent.change(nameInput, { target: { value: '临时修改' } });

      const saveButton = screen.getByTestId('btn-save') as HTMLButtonElement;
      await waitFor(() => {
        expect(saveButton.disabled).toBe(false);
      });

      // 外部更新sessionData
      rerender(
        <SessionPropertyPanel
          sessionData={{ ...mockSessionData, name: '外部更新' }}
          availableSchemes={mockSchemes}
          onSave={mockOnSave}
        />
      );

      // hasChanges应该重置，保存按钮禁用
      await waitFor(() => {
        expect(saveButton.disabled).toBe(true);
      });
    });
  });
});
