import { Page } from '@playwright/test';

/**
 * E2E 测试工具函数集合
 */

/**
 * 等待编辑器完全加载
 */
export async function waitForEditorReady(page: Page) {
  await page.waitForSelector('.editor-header', { timeout: 10000 });
  await page.waitForLoadState('networkidle');
}

/**
 * 选择并打开一个 session 文件
 */
export async function selectSessionFile(page: Page, fileName?: string) {
  // 展开 Session Scripts 文件夹
  const sessionFolder = page.locator('text=Session Scripts');
  await sessionFolder.click();
  await page.waitForTimeout(500);
  
  // 选择文件
  const fileLocator = fileName 
    ? page.locator(`.ant-tree-title:has-text("${fileName}")`)
    : page.locator('.ant-tree-treenode.ant-tree-treenode-leaf').first();
  
  await fileLocator.click();
  await page.waitForTimeout(1000);
}

/**
 * 切换编辑模式
 */
export async function switchEditMode(page: Page, mode: 'yaml' | 'visual') {
  const buttonText = mode === 'yaml' ? 'YAML' : '可视化编辑';
  const button = page.locator(`button:has-text("${buttonText}")`);
  
  if (await button.isVisible()) {
    await button.click();
    await page.waitForTimeout(500);
  }
}

/**
 * 打开版本管理面板
 */
export async function openVersionPanel(page: Page) {
  await page.click('button:has-text("版本管理")');
  await page.waitForSelector('.version-list-panel', { timeout: 5000 });
}

/**
 * 切换到指定版本
 */
export async function switchToVersion(page: Page, versionNumber?: string) {
  const selector = versionNumber
    ? `.version-item:has-text("${versionNumber}") button:has-text("切换")`
    : '.version-item:not(.version-item-current) button:has-text("切换")';
  
  const switchButton = page.locator(selector).first();
  
  if (await switchButton.isVisible()) {
    await switchButton.click();
    
    // 处理确认弹窗
    await page.waitForSelector('.ant-modal-confirm', { timeout: 3000 });
    await page.click('button.ant-btn-primary:has-text("确认")');
    
    // 等待切换完成
    await page.waitForTimeout(2000);
    return true;
  }
  
  return false;
}

/**
 * 获取控制台日志
 */
export async function collectConsoleLogs(page: Page, duration: number = 1000): Promise<string[]> {
  const logs: string[] = [];
  
  const logHandler = (msg: any) => {
    logs.push(msg.text());
  };
  
  page.on('console', logHandler);
  await page.waitForTimeout(duration);
  page.off('console', logHandler);
  
  return logs;
}

/**
 * 验证日志中包含特定标记
 */
export function hasLogMarker(logs: string[], marker: string): boolean {
  return logs.some(log => log.includes(marker));
}

/**
 * 修改 Phase 名称
 */
export async function modifyPhaseName(page: Page, newName: string) {
  const firstPhase = page.locator('.action-node-list .ant-collapse-item').first();
  await firstPhase.click();
  await page.waitForTimeout(500);
  
  const phaseNameInput = page.locator('input[placeholder*="Phase"]').first();
  await phaseNameInput.fill(newName);
  await page.waitForTimeout(1000); // 等待自动保存
}

/**
 * 获取当前项目的所有文件名
 */
export async function getCurrentFileList(page: Page): Promise<string[]> {
  return await page.locator('.ant-tree-treenode-leaf .ant-tree-title').allTextContents();
}

/**
 * 创建新的测试项目（用于独立测试场景）
 */
export async function createTestProject(page: Page, projectName: string) {
  await page.goto('/');
  await page.click('button:has-text("创建工程")');
  
  await page.waitForSelector('.ant-modal');
  await page.fill('input[placeholder*="工程名称"]', projectName);
  await page.fill('input[placeholder*="引擎版本"]', '1.0.0');
  await page.fill('input[placeholder*="最小引擎版本"]', '1.0.0');
  
  await page.click('.ant-modal button.ant-btn-primary');
  await page.waitForTimeout(2000);
  
  // 获取新创建的项目ID
  const firstProjectLink = page.locator('.ant-table-tbody tr a:has-text("编辑")').first();
  const href = await firstProjectLink.getAttribute('href');
  return href?.split('/')[2] || '';
}
