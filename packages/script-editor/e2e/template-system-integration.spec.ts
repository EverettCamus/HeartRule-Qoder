/**
 * 两层模板系统集成测试
 * 
 * 测试场景：
 * 1. 工程创建时选择模板方案
 * 2. Session配置中选择模板方案
 * 3. 创建和管理自定义模板方案
 * 4. 模板编辑器功能验证
 */

import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 测试配置
const BASE_URL = 'http://localhost:5173';
const API_BASE_URL = 'http://localhost:3000/api';
const TEST_PROJECT_NAME = 'Template System Test Project';

test.describe('两层模板系统集成测试', () => {
  let testProjectId: string;

  test.beforeAll(async () => {
    console.log('🚀 准备测试环境...');
  });

  test.afterAll(async () => {
    console.log('🧹 清理测试数据...');
    // TODO: 清理创建的测试工程
  });

  /**
   * 场景4：工程创建向导 - 选择模板方案
   */
  test('场景4：创建工程并选择crisis_intervention模板方案', async ({ page }) => {
    console.log('\n📋 测试场景4：工程创建向导');

    // 1. 访问工程列表页
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 2. 点击"创建工程"按钮
    const createButton = page.getByRole('button', { name: /create.*project/i });
    await expect(createButton).toBeVisible();
    await createButton.click();

    // 3. 等待创建对话框出现
    await page.waitForSelector('.ant-modal-content', { timeout: 5000 });

    // 4. 填写工程基本信息
    await page.fill('[name="projectName"]', TEST_PROJECT_NAME);
    await page.fill('[name="description"]', '测试工程 - 验证模板方案初始化');

    // 5. 选择工程模板（blank）
    await page.selectOption('[name="template"]', 'blank');

    // 6. 选择模板方案（crisis_intervention）
    const templateSchemeSelector = page.locator('[name="templateScheme"]');
    await expect(templateSchemeSelector).toBeVisible();
    await templateSchemeSelector.selectOption('crisis_intervention');

    // 7. 选择语言
    await page.selectOption('[name="language"]', 'zh-CN');

    // 8. 提交创建
    const submitButton = page.getByRole('button', { name: /create|创建/i }).last();
    await submitButton.click();

    // 9. 等待创建成功提示
    await page.waitForSelector('.ant-message-success', { timeout: 10000 });

    // 10. 验证工程已创建
    await page.waitForTimeout(2000); // 等待列表刷新
    const projectCard = page.locator(`text=${TEST_PROJECT_NAME}`);
    await expect(projectCard).toBeVisible();

    // 11. 记录工程ID（从URL或DOM中提取）
    const projectLink = page.locator(`a:has-text("${TEST_PROJECT_NAME}")`).first();
    const href = await projectLink.getAttribute('href');
    testProjectId = href?.split('/')[2] || '';
    console.log(`✅ 工程已创建，ID: ${testProjectId}`);

    // 12. 验证工程目录结构（通过API）
    const response = await page.request.get(`${API_BASE_URL}/projects/${testProjectId}`);
    expect(response.ok()).toBeTruthy();

    // 13. 检查工程物理目录（需要后端API支持）
    // TODO: 验证 _system/config/custom/crisis_intervention/ 目录存在
    console.log('✅ 场景4测试通过：工程创建并初始化模板方案');
  });

  /**
   * 场景1：编辑Session配置并保存
   */
  test('场景1：编辑Session配置选择模板方案', async ({ page }) => {
    console.log('\n📋 测试场景1：Session配置编辑');

    // 前置条件：需要先创建工程（跳过，使用上一个测试的工程）
    test.skip(!testProjectId, '需要先运行场景4创建工程');

    // 1. 进入工程编辑器
    await page.goto(`${BASE_URL}/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 2. 打开或创建一个Session脚本
    const filesTab = page.getByRole('tab', { name: /files|文件/i });
    await filesTab.click();

    // 3. 创建新Session文件
    const newFileButton = page.getByRole('button', { name: /new.*file|新建/i });
    await newFileButton.click();

    await page.selectOption('[name="fileType"]', 'session');
    await page.fill('[name="fileName"]', 'test-session.yaml');
    await page.click('button:has-text("Create")');

    // 4. 等待编辑器加载
    await page.waitForTimeout(2000);

    // 5. 切换到可视化编辑模式
    const visualModeButton = page.getByRole('button', { name: /visual|可视化/i });
    if (await visualModeButton.isVisible()) {
      await visualModeButton.click();
    }

    // 6. 点击"Session配置"按钮
    const sessionConfigButton = page.getByRole('button', { name: /session.*config|session.*属性/i });
    await expect(sessionConfigButton).toBeVisible();
    await sessionConfigButton.click();

    // 7. 等待Session属性面板出现
    await page.waitForSelector('[data-testid="session-property-panel"]', { timeout: 5000 });

    // 8. 填写Session基本信息
    await page.fill('[data-testid="input-name"]', '测试会谈');
    await page.fill('[data-testid="input-version"]', '1.0.0');

    // 9. 选择模板方案
    const templateSchemeSelect = page.locator('[data-testid="select-template-scheme"]');
    await templateSchemeSelect.selectOption('crisis_intervention');

    // 10. 保存配置
    const saveButton = page.getByRole('button', { name: /save|保存/i });
    await saveButton.click();

    // 11. 等待保存成功
    await page.waitForSelector('.ant-message-success', { timeout: 5000 });

    // 12. 验证YAML内容已更新
    const yamlModeButton = page.getByRole('button', { name: /yaml|代码/i });
    if (await yamlModeButton.isVisible()) {
      await yamlModeButton.click();
    }

    // 检查YAML内容包含template_scheme字段
    const yamlContent = await page.locator('.monaco-editor').textContent();
    expect(yamlContent).toContain('template_scheme: crisis_intervention');

    console.log('✅ 场景1测试通过：Session配置编辑和保存');
  });

  /**
   * 场景2：创建和使用自定义模板方案
   */
  test('场景2：创建自定义模板方案', async ({ page }) => {
    console.log('\n📋 测试场景2：自定义模板方案管理');

    test.skip(!testProjectId, '需要先运行场景4创建工程');

    // 1. 进入工程编辑器
    await page.goto(`${BASE_URL}/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 2. 打开模板方案管理器
    const manageButton = page.getByRole('button', { name: /manage.*template.*scheme|管理模板方案/i });
    
    // 如果管理按钮在Session配置面板中，需要先打开面板
    const sessionConfigButton = page.getByRole('button', { name: /session.*config|session.*属性/i });
    if (await sessionConfigButton.isVisible()) {
      await sessionConfigButton.click();
      await page.waitForTimeout(1000);
    }

    await expect(manageButton).toBeVisible({ timeout: 10000 });
    await manageButton.click();

    // 3. 等待模板方案管理器对话框出现
    await page.waitForSelector('.ant-modal-content', { timeout: 5000 });

    // 4. 创建新方案
    const createSchemeButton = page.getByRole('button', { name: /create.*scheme|创建方案/i });
    await createSchemeButton.click();

    // 5. 填写方案信息
    await page.fill('[data-testid="input-scheme-name"]', 'my_test_scheme');
    await page.fill('[data-testid="textarea-scheme-description"]', '自动化测试方案');

    // 6. 选择复制来源（从default复制）
    const copyFromSelect = page.locator('[data-testid="select-copy-from"]');
    if (await copyFromSelect.isVisible()) {
      await copyFromSelect.selectOption('default');
    }

    // 7. 确认创建
    const confirmButton = page.getByRole('button', { name: /confirm|确定/i });
    await confirmButton.click();

    // 8. 等待创建成功
    await page.waitForSelector('.ant-message-success', { timeout: 5000 });

    // 9. 验证方案已出现在列表中
    const schemeCard = page.locator('[data-testid="scheme-my_test_scheme"]');
    await expect(schemeCard).toBeVisible();

    // 10. 关闭管理器
    const closeButton = page.getByRole('button', { name: /close|关闭/i });
    await closeButton.click();

    console.log('✅ 场景2测试通过：自定义模板方案创建');
  });

  /**
   * 场景3：模板编辑器功能验证
   */
  test('场景3：模板编辑和验证', async ({ page }) => {
    console.log('\n📋 测试场景3：模板编辑器');

    test.skip(!testProjectId, '需要先运行场景4创建工程');

    // 1. 进入工程编辑器
    await page.goto(`${BASE_URL}/projects/${testProjectId}`);
    await page.waitForLoadState('networkidle');

    // 2. 打开模板方案管理器
    const sessionConfigButton = page.getByRole('button', { name: /session.*config/i });
    if (await sessionConfigButton.isVisible()) {
      await sessionConfigButton.click();
    }

    const manageButton = page.getByRole('button', { name: /manage.*template/i });
    await manageButton.click();
    await page.waitForTimeout(1000);

    // 3. 选择一个模板方案
    const schemeCard = page.locator('[data-testid^="scheme-"]').first();
    await schemeCard.click();

    // 4. 点击"编辑模板"按钮
    const editTemplateButton = page.getByRole('button', { name: /edit.*template|编辑模板/i });
    await editTemplateButton.click();

    // 5. 等待模板编辑器对话框出现
    await page.waitForSelector('.ant-modal-content:has-text("模板编辑")', { timeout: 5000 });

    // 6. 验证编辑器UI元素
    const markdownEditor = page.locator('.w-md-editor');
    await expect(markdownEditor).toBeVisible();

    // 7. 编辑模板内容（故意删除必需变量）
    const textArea = page.locator('.w-md-editor-text-input');
    await textArea.clear();
    await textArea.fill('# 测试模板\n\n这是一个测试模板，缺少必需变量。');

    // 8. 等待验证错误提示（防抖500ms）
    await page.waitForTimeout(600);

    // 9. 验证错误提示显示
    const errorAlert = page.locator('.ant-alert-error');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText('缺少必需的系统变量');

    // 10. 修复错误（添加必需变量）
    await textArea.fill(`# 测试模板

当前时间: {{time}}
角色: {{who}}
用户: {{user}}

## 任务
{{task}}
`);

    // 11. 等待验证通过
    await page.waitForTimeout(600);
    await expect(errorAlert).not.toBeVisible();

    // 12. 尝试保存
    const saveButton = page.getByRole('button', { name: /save|保存/i }).last();
    await saveButton.click();

    // 13. 等待保存成功
    await page.waitForSelector('.ant-message-success', { timeout: 5000 });

    console.log('✅ 场景3测试通过：模板编辑和验证');
  });
});
