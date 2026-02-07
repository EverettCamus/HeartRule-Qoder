import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { waitForEditorReady } from './helpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 调试气泡会话隔离验证（回归测试）
 *
 * 验证目标：
 * 1. 关闭调试面板后再重新打开，旧的调试气泡不应残留
 * 2. loadSessionData 函数必须清空 debugBubbles 状态
 * 3. 每次打开调试面板都应该是干净的初始状态
 *
 * Bug修复记录：
 * - 问题：用户进行5轮对话后关闭调试，再打开时前5轮的LLM提示词和响应气泡仍然显示
 * - 根因：loadSessionData 未清空旧的 debugBubbles 状态
 * - 修复：在 loadSessionData 开始时调用 setDebugBubbles([])
 * - 修复文件：packages/script-editor/src/components/DebugChatPanel/index.tsx
 *
 * 注意：
 * - 此测试需要完整的Schema符合的session文件
 * - 如果测试失败，请先运行 prepare-test-data.mjs 准备测试数据
 */

// 从文件读取测试项目ID
function getTestProjectId(): string {
  const idFilePath = path.join(__dirname, '../../api-server/test-project-id.txt');

  if (fs.existsSync(idFilePath)) {
    const projectId = fs.readFileSync(idFilePath, 'utf-8').trim();
    console.log(`[E2E-DebugBubbles] 从文件读取项目ID: ${projectId}`);
    return projectId;
  }

  const envProjectId = process.env.TEST_PROJECT_ID;
  if (envProjectId) {
    console.log(`[E2E-DebugBubbles] 从环境变量读取项目ID: ${envProjectId}`);
    return envProjectId;
  }

  throw new Error('未找到测试项目ID。请先运行 prepare-e2e-test.js 创建测试数据');
}

/**
 * 打开调试配置弹窗
 */
async function openDebugModal(page: Page) {
  // 使用更精确的选择器匹配 "Debug" 按钮，避免与其他按钮混淆
  // 查找具有 "debug" 类或包含 debug 图标的按钮
  const debugButton = page.locator('button:has(svg[data-icon="bug"])');
  await debugButton.waitFor({ timeout: 5000 });
  await debugButton.click();
  await page.waitForSelector('.ant-modal', { timeout: 5000 });
  console.log('[E2E-DebugBubbles] 调试配置弹窗已打开');
}

/**
 * 选择调试目标并启动调试会话
 */
async function startDebugSession(page: Page) {
  // 监听控制台日志和网络请求
  const consoleLogs: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[DebugConfig]') || text.includes('error') || text.includes('fail')) {
      console.log('[E2E-Console]', text);
    }
  });

  // 监听网络错误
  page.on('requestfailed', (request) => {
    console.log('[E2E-NetworkError]', request.url(), request.failure()?.errorText);
  });

  try {
    // 检查是否已经选择了会话文件（重新打开时可能已经选择了）
    const sessionSelect = page.locator('.ant-select-selector').first();
    const hasSelected = (await sessionSelect.locator('.ant-select-selection-item').count()) > 0;

    if (!hasSelected) {
      // 选择草稿模式
      const draftRadio = page.locator('input[value="draft"]');
      await draftRadio.check();
      await page.waitForTimeout(300);

      // 选择第一个 session 文件
      await sessionSelect.click();
      await page.waitForTimeout(500);

      const firstOption = page.locator('.ant-select-item-option').first();
      await firstOption.click();
      await page.waitForTimeout(300);
    }

    console.log('[E2E-DebugBubbles] 表单已填写，准备点击 Start Debug');

    // 点击开始调试（注意：按钮文本是 "Start Debug"）
    const startButton = page.locator('button.ant-btn-primary:has-text("Start Debug")');
    await startButton.click();

    console.log('[E2E-DebugBubbles] 已点击 Start Debug，等待调试面板出现...');

    // 等待调试面板出现（忽略配置弹窗的关闭时间）
    await page.waitForSelector('.debug-chat-panel', { state: 'visible', timeout: 15000 });
    console.log('[E2E-DebugBubbles] 调试会话已启动');

    // 等待额外500ms确保面板完全加载
    await page.waitForTimeout(500);
  } catch (error) {
    console.error('[E2E-DebugBubbles] ❌ 启动调试会话失败:', error.message);
    console.error('[E2E-DebugBubbles] 最近的控制台日志:', consoleLogs.slice(-10));

    // 输出当前页面状态
    try {
      const modalVisible = await page.locator('.ant-modal').count();
      const panelVisible = await page.locator('.debug-chat-panel').count();
      console.error('[E2E-DebugBubbles] 当前状态:', { modalVisible, panelVisible });
    } catch (checkError) {
      console.error('[E2E-DebugBubbles] 无法检查页面状态:', checkError.message);
    }

    throw error;
  }
}

/**
 * 打开调试输出设置面板并启用LLM相关气泡
 */
async function enableLLMBubbles(page: Page) {
  // 点击设置按钮
  const settingButton = page.locator('.debug-chat-header button[title="调试输出选项"]');
  await settingButton.click();
  await page.waitForSelector('.ant-modal:has-text("调试输出选项")', { timeout: 3000 });

  // 等待弹窗完全加载
  await page.waitForTimeout(500);

  // 启用 LLM 提示词和 LLM 响应
  const llmPromptCheckbox = page.locator('input[type="checkbox"]').nth(3); // LLM提示词
  const llmResponseCheckbox = page.locator('input[type="checkbox"]').nth(4); // LLM响应

  if (!(await llmPromptCheckbox.isChecked())) {
    await llmPromptCheckbox.check();
  }
  if (!(await llmResponseCheckbox.isChecked())) {
    await llmResponseCheckbox.check();
  }

  // 点击确定按钮关闭设置弹窗
  // AntD Modal 的 primary 按钮通常有 ant-btn-primary 或 css-dev-only-do-not-override 类
  const okButton = page.locator(
    '.ant-modal:has-text("调试输出选项") .ant-modal-footer .ant-btn-primary'
  );
  await okButton.waitFor({ timeout: 3000 });
  await okButton.click();
  await page.waitForTimeout(500);

  console.log('[E2E-DebugBubbles] LLM气泡已启用');
}

/**
 * 进行一轮对话
 */
async function sendMessage(page: Page, message: string, roundNumber: number) {
  // 等待输入框可用 - 使用更精确的选择器，针对调试聊天输入框
  // 通过 placeholder 文本和类名组合来精确定位调试聊天框
  const inputArea = page.locator(
    'textarea[placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"]'
  );
  await inputArea.waitFor({ state: 'visible', timeout: 5000 });

  await inputArea.fill(message);

  const sendButton = page.locator('.debug-chat-send-btn');
  await sendButton.click();

  console.log(`[E2E-DebugBubbles] 第${roundNumber}轮对话已发送: ${message}`);

  // 等待AI响应
  await page.waitForTimeout(5000);
}

/**
 * 统计当前调试气泡数量
 */
async function countDebugBubbles(page: Page): Promise<{
  total: number;
  llmPrompt: number;
  llmResponse: number;
}> {
  // 等待DOM更新
  await page.waitForTimeout(500);

  const allBubbles = page.locator('.debug-bubble');
  const llmPromptBubbles = page.locator('.debug-bubble-llm-prompt');
  const llmResponseBubbles = page.locator('.debug-bubble-llm-response');

  const counts = {
    total: await allBubbles.count(),
    llmPrompt: await llmPromptBubbles.count(),
    llmResponse: await llmResponseBubbles.count(),
  };

  console.log('[E2E-DebugBubbles] 当前气泡数量:', counts);
  return counts;
}

/**
 * 关闭调试面板
 */
async function closeDebugPanel(page: Page) {
  const closeButton = page.locator('.debug-chat-close-btn');
  await closeButton.click();

  // 等待面板关闭
  await page.waitForSelector('.debug-chat-panel', { state: 'hidden', timeout: 3000 });
  console.log('[E2E-DebugBubbles] 调试面板已关闭');
}

/**
 * 重新打开调试面板（使用同一个会话）
 */
async function reopenDebugPanel(page: Page) {
  // 记录当前页面状态
  console.log('[E2E-DebugBubbles] 尝试重新打开调试面板');

  // 检查是否还有打开的调试面板
  const existingPanel = page.locator('.debug-chat-panel');
  const panelExists = (await existingPanel.count()) > 0;

  if (panelExists) {
    console.log('[E2E-DebugBubbles] 调试面板已存在，无需重新打开');
    return;
  }

  // 再次点击调试按钮
  await openDebugModal(page);

  // 检查是否有现有的会话（如果表单验证失败，说明已有活动会话）
  const startButton = page.locator('button:has-text("Start Debug")');
  await startButton.click();

  // 等待调试面板出现，增加超时时间
  try {
    await page.waitForSelector('.debug-chat-panel', { timeout: 15000 });
    console.log('[E2E-DebugBubbles] 调试面板已重新打开');

    // 等待数据加载完成
    await page.waitForTimeout(2000);
  } catch (error) {
    // 检查是否有表单验证错误，这表示已有活动会话
    const validationErrors = page.locator('.ant-form-item-explain-error');
    const hasValidationError = (await validationErrors.count()) > 0;

    if (hasValidationError) {
      console.log('[E2E-DebugBubbles] 检测到表单验证错误，尝试关闭配置弹窗');

      // 尝试关闭配置弹窗
      const closeButtons = page.locator('.ant-modal .ant-modal-close');
      if ((await closeButtons.count()) > 0) {
        await closeButtons.first().click();
        await page.waitForTimeout(1000);
      }

      // 检查是否已有调试面板
      const hasPanel = await page.locator('.debug-chat-panel').isVisible();
      if (hasPanel) {
        console.log('[E2E-DebugBubbles] 调试面板已存在');
        return;
      }
    }

    // 如果仍然没有面板，抛出错误
    throw new Error(`重新打开调试面板失败: ${error.message}`);
  }
}

test.describe('调试气泡会话隔离验证', () => {
  let testProjectUrl: string;
  const TEST_PROJECT_ID = getTestProjectId();

  test.beforeEach(async ({ page }) => {
    testProjectUrl = `/projects/${TEST_PROJECT_ID}`;
    console.log(`[E2E-DebugBubbles] 使用测试项目: ${TEST_PROJECT_ID}`);
  });

  test.skip('验证loadSessionData确实清空了debugBubbles状态', async ({ page }) => {
    // 监听控制台日志来验证清空操作
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      const text = msg.text();
      consoleLogs.push(text);
      if (text.includes('Cleared old debug bubbles')) {
        console.log('[E2E-DebugBubbles] 捕获到清空日志:', text);
      }
    });

    // 1. 进入编辑器并启动调试
    await page.goto(testProjectUrl);
    await waitForEditorReady(page);
    await openDebugModal(page);
    await startDebugSession(page);

    // 2. 启用LLM气泡显示并进行简单对话
    await enableLLMBubbles(page);
    await sendMessage(page, '你好', 1);

    // 等待气泡出现
    await page.waitForTimeout(3000);

    // 验证有气泡产生
    const initialBubbles = await countDebugBubbles(page);
    console.log('[E2E-DebugBubbles] 初始气泡数量:', initialBubbles);

    // 3. 关闭调试面板
    await closeDebugPanel(page);
    await page.waitForTimeout(1000);

    // 4. 重新打开调试面板 - 这会触发loadSessionData
    await openDebugModal(page);
    await startDebugSession(page);

    // 5. 验证loadSessionData清空了debugBubbles状态
    await page.waitForTimeout(1000);

    const hasClearLog = consoleLogs.some(
      (log) => log.includes('Cleared old debug bubbles') || log.includes('🧹')
    );

    console.log('[E2E-DebugBubbles] 捕获的日志数量:', consoleLogs.length);
    console.log('[E2E-DebugBubbles] 包含清空标记:', hasClearLog);

    // 断言：应该有清空气泡的日志
    expect(hasClearLog).toBeTruthy();

    console.log('[E2E-DebugBubbles] ✅ 验证通过：loadSessionData已清空气泡状态');
  });
});
