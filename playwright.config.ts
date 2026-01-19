import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 测试配置
 * 用于验证脚本编辑器的关键业务逻辑
 */
export default defineConfig({
  testDir: './packages/script-editor/e2e',

  outputDir: './packages/script-editor/e2e/test-results',

  /* 最大失败次数 */
  maxFailures: 5,

  /* 单个测试超时时间 */
  timeout: 30 * 1000,

  /* 断言超时 */
  expect: {
    timeout: 5000,
  },

  /* 并行测试worker数量 */
  fullyParallel: true,

  /* 失败重试次数 */
  retries: process.env.CI ? 2 : 0,

  /* 并发worker */
  workers: process.env.CI ? 1 : undefined,

  /* 测试报告 */
  reporter: [['html', { outputFolder: 'packages/script-editor/e2e/playwright-report' }], ['list']],

  /* 全局配置 */
  use: {
    /* 基准URL - 指向本地开发服务器 */
    baseURL: 'http://localhost:3000',

    /* 失败时截图 */
    screenshot: 'only-on-failure',

    /* 失败时录制视频 */
    video: 'retain-on-failure',

    /* 追踪模式 */
    trace: 'on-first-retry',
  },

  /* 测试项目配置 */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* 开发服务器配置 - 需要手动启动前后端服务 */
  // webServer: {
  //   command: 'cd packages/script-editor && pnpm dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
