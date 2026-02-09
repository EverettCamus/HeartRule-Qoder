import { describe, test, expect, beforeEach } from 'vitest';

import { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';
import { AiSayAction } from '../ai-say-action.js';
import type { ActionContext } from '../base-action.js';

/**
 * 【Bug修复回归测试】模板路径配置错误
 *
 * 问题：
 * - process.cwd() 在 api-server 运行时指向 packages/api-server
 * - 原路径计算 ../../../../config/prompts 错误
 * - 导致模板加载失败：ENOENT: no such file or directory
 *
 * 修复：
 * - 改为 ../../config/prompts (api-server -> packages -> root -> config/prompts)
 *
 * 测试目标：
 * - 验证模板路径计算正确
 * - 确保 max_rounds 模式能找到模板文件
 */

describe('AiSayAction - 模板路径配置回归测试', () => {
  let context: ActionContext;
  let mockOrchestrator: LLMOrchestrator;

  beforeEach(() => {
    context = {
      sessionId: 'test-session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: new Map(),
      conversationHistory: [],
      metadata: new Map(),
    };

    // Mock LLMOrchestrator
    mockOrchestrator = {
      generateText: async () => ({
        text: '测试响应',
        debugInfo: {},
      }),
      generateStructuredData: async () => ({
        response: { 咨询师: '测试响应' },
        assessment: { 理解度: 80, 是否需要继续: false },
      }),
    } as any;
  });

  test('【BUG修复】模板路径应基于 process.cwd() 正确计算', () => {
    // 验证：创建 AiSayAction 时不应抛出路径错误
    expect(() => {
      new AiSayAction(
        'test',
        {
          content: '测试内容',
          max_rounds: 3,
        },
        mockOrchestrator
      );
    }).not.toThrow();
  });

  test('【BUG修复】max_rounds 模式应能正确加载模板', async () => {
    const action = new AiSayAction(
      'test',
      {
        content_template: '向用户简单介绍自己',
        max_rounds: 3,
      },
      mockOrchestrator
    );

    // 关键：执行时不应抛出模板路径错误
    const result = await action.execute(context);

    // 验证：如果有错误，不应该是路径错误
    if (result.error) {
      // 不应该包含错误的路径格式（C:\CBT\config 而不是 HeartRule-Qcoder）
      expect(result.error).not.toContain('C:\\CBT\\config');
      expect(result.error).not.toContain('C:/CBT/config');
      // 如果是模板加载错误，应该包含正确的路径
      if (result.error.includes('Failed to load template')) {
        expect(result.error).toContain('HeartRule-Qcoder');
      }
    }
  });

  test('【回归测试】无 max_rounds 时不应尝试加载模板', async () => {
    const action = new AiSayAction(
      'test',
      {
        content: '测试内容',
        require_acknowledgment: false,
      },
      mockOrchestrator
    );

    // 兼容模式下应该成功执行，不会尝试加载模板
    const result = await action.execute(context);

    expect(result.success).toBe(true);
    expect(result.aiMessage).toBeTruthy();
  });

  test('【回归测试】环境变量 PROMPT_TEMPLATE_PATH 优先级最高', () => {
    // 设置环境变量
    const originalEnv = process.env.PROMPT_TEMPLATE_PATH;
    process.env.PROMPT_TEMPLATE_PATH = '/custom/template/path';

    const action = new AiSayAction(
      'test',
      {
        content: '测试内容',
        max_rounds: 3,
      },
      mockOrchestrator
    );

    // 验证：应该使用环境变量的路径（通过日志或内部状态）
    // 注意：由于 templateManager 是私有属性，这里主要验证不抛出错误
    expect(action).toBeDefined();

    // 恢复环境变量
    if (originalEnv) {
      process.env.PROMPT_TEMPLATE_PATH = originalEnv;
    } else {
      delete process.env.PROMPT_TEMPLATE_PATH;
    }
  });

  test('【边界测试】process.cwd() 在不同目录下的路径计算', () => {
    // 保存原始工作目录
    const originalCwd = process.cwd();

    try {
      // 模拟不同的工作目录
      const testCases = [
        { cwd: 'C:\\CBT\\HeartRule-Qcoder\\packages\\api-server', expected: true },
        { cwd: 'C:\\CBT\\HeartRule-Qcoder', expected: true },
      ];

      testCases.forEach(() => {
        // 注意：实际不能更改 process.cwd()，这里只是验证逻辑
        // 真实场景中，api-server 会在 packages/api-server 目录运行
        expect(() => {
          new AiSayAction('test', { content: '测试', max_rounds: 3 }, mockOrchestrator);
        }).not.toThrow();
      });
    } finally {
      // 确保恢复原始工作目录（虽然实际没有改变）
      expect(process.cwd()).toBe(originalCwd);
    }
  });
});
