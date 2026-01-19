# WEB 端自动化回归测试指南

## 概述

本项目已集成 Playwright E2E 自动化测试框架，用于验证脚本编辑器的关键业务逻辑，防止代码变更后逻辑破坏。

## 环境准备

### 1. 安装浏览器（首次使用）

由于网络原因，浏览器安装可能失败。你可以尝试以下方法：

**方法 1：直接安装**
```powershell
npx playwright install chromium
```

**方法 2：使用国内镜像（推荐）**
```powershell
$env:PLAYWRIGHT_DOWNLOAD_HOST="https://npmmirror.com/mirrors/playwright/"
npx playwright install chromium
```

**方法 3：离线安装**
如果网络始终不通，可以手动下载浏览器后放置到指定目录，详见 Playwright 官方文档。

### 2. 验证安装

```powershell
npx playwright --version
```

## 运行测试

### 启动前后端服务

测试需要前后端服务同时运行。你可以：

**选项 1：自动启动（推荐）**
```powershell
pnpm test:e2e
```
配置文件中的 `webServer` 会自动启动前端开发服务器。但你需要手动启动 API 服务器：
```powershell
# 在另一个终端窗口
pnpm dev
```

**选项 2：手动启动**
```powershell
# 终端 1：启动 API 服务器
pnpm dev

# 终端 2：启动前端编辑器
pnpm dev:editor

# 终端 3：运行测试
pnpm test:e2e
```

### 测试命令

| 命令 | 说明 |
|------|------|
| `pnpm test:e2e` | 运行所有 E2E 测试（无头模式） |
| `pnpm test:e2e:ui` | 在 UI 模式下运行测试（可视化调试） |
| `pnpm test:e2e:debug` | 调试模式（逐步执行） |
| `pnpm test:api` | 运行后端 API 测试 |

### 查看测试报告

测试完成后会生成 HTML 报告：

```powershell
npx playwright show-report
```

## 已实现的测试用例

### 1. 版本切换后必须清空撤销栈
- **验证目标**: 防止跨版本撤销导致数据错乱
- **验证方法**: 通过监听控制台日志，确认 `[VersionSwitch]` 标记出现
- **文件**: `packages/script-editor/e2e/version-management.spec.ts`

### 2. 版本切换前有未保存修改时必须弹出警告
- **验证目标**: 确保用户不会误操作丢失未保存内容
- **验证方法**: 修改内容后立即切换版本，检查弹窗标题是否包含"未发布的修改"
- **文件**: `packages/script-editor/e2e/version-management.spec.ts`

### 3. 版本切换后工作区内容与目标版本快照一致
- **验证目标**: 文件列表和内容完全同步到目标版本
- **验证方法**: 对比切换前后的文件列表和版本标识
- **文件**: `packages/script-editor/e2e/version-management.spec.ts`

## 添加新的测试用例

### 创建测试文件

在 `packages/script-editor/e2e/` 目录下创建新的 `.spec.ts` 文件：

```typescript
import { test, expect } from '@playwright/test';
import { waitForEditorReady, selectSessionFile } from './helpers';

test.describe('新功能验证', () => {
  test('测试用例名称', async ({ page }) => {
    // 1. 访问编辑器
    await page.goto('/projects/test-project-id');
    await waitForEditorReady(page);
    
    // 2. 执行操作
    await selectSessionFile(page);
    
    // 3. 验证结果
    expect(await page.title()).toContain('预期标题');
  });
});
```

### 使用工具函数

在 `packages/script-editor/e2e/helpers.ts` 中已提供了常用工具函数：

- `waitForEditorReady(page)` - 等待编辑器加载完成
- `selectSessionFile(page, fileName?)` - 选择会话文件
- `switchEditMode(page, 'yaml' | 'visual')` - 切换编辑模式
- `openVersionPanel(page)` - 打开版本管理面板
- `switchToVersion(page, versionNumber?)` - 切换版本
- `collectConsoleLogs(page, duration)` - 收集控制台日志
- `modifyPhaseName(page, newName)` - 修改 Phase 名称

## 调试技巧

### 1. 可视化调试

```powershell
pnpm test:e2e:ui
```

这会打开 Playwright Inspector，你可以：
- 逐步执行测试
- 查看每一步的 DOM 状态
- 修改选择器并重新运行

### 2. 查看失败截图

失败的测试会自动截图并保存到 `test-results/` 目录。

### 3. 录制测试

使用 Playwright Codegen 自动生成测试代码：

```powershell
npx playwright codegen http://localhost:5173
```

### 4. 调试单个测试

```powershell
npx playwright test version-management.spec.ts --debug
```

## CI/CD 集成

在 GitHub Actions 或其他 CI 环境中运行测试：

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps chromium

- name: Run E2E Tests
  run: pnpm test:e2e
  env:
    CI: true

- name: Upload Test Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## 最佳实践

1. **独立性**: 每个测试应该独立运行，不依赖其他测试的结果
2. **可重复性**: 测试应该可以多次运行并产生相同结果
3. **清理**: 测试创建的数据应该在测试结束后清理
4. **等待策略**: 使用 `waitForSelector` 而不是固定的 `waitForTimeout`
5. **选择器**: 优先使用文本选择器，其次是 data-testid，最后才是 CSS 类名

## 故障排查

### 测试超时
- 增加 `playwright.config.ts` 中的 `timeout` 值
- 检查网络连接和服务器响应速度

### 元素找不到
- 使用 `page.pause()` 暂停测试并检查 DOM
- 在 UI 模式下逐步执行并检查选择器

### 服务器未启动
- 确认 API 服务器在 `http://localhost:8000` 运行
- 确认前端服务器在 `http://localhost:5173` 运行

## 维护建议

- 每次添加重要功能后，同步添加对应的 E2E 测试
- 定期运行测试，确保功能稳定性
- 测试失败时，优先修复功能而不是修改测试
- 保持测试代码的可读性和可维护性
