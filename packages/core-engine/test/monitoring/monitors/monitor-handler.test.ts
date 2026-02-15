/**
 * 监控处理器单元测试
 *
 * 测试范围：
 * - JSON解析3次重试机制
 * - 降级策略
 * - 监控异步执行
 * - 模板路径解析
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  BaseMonitorHandler,
  type MonitorAnalysis,
  type MonitorContext,
} from '../../../src/application/monitors/base-monitor-handler.js';
import { MonitorTemplateResolver } from '../../../src/application/monitors/monitor-template-resolver.js';
import type { ActionResult, ActionMetrics } from '../../../src/domain/actions/base-action.js';

// Mock实现用于测试
class TestMonitorHandler extends BaseMonitorHandler {
  parseMetrics(result: ActionResult): ActionMetrics {
    return result.metrics || {};
  }

  async analyzeWithLLM(
    _metrics: ActionMetrics,
    _context: MonitorContext
  ): Promise<MonitorAnalysis> {
    return {
      intervention_needed: false,
      intervention_reason: 'normal',
      intervention_level: 'action_feedback',
      strategy_suggestion: 'continue',
      feedback_for_action: '',
      orchestration_needed: false,
    };
  }
}

describe('BaseMonitorHandler - JSON解析重试机制', () => {
  let handler: TestMonitorHandler;

  beforeEach(() => {
    handler = new TestMonitorHandler();
  });

  it('应该在第1次尝试成功解析有效JSON', () => {
    const validJson = JSON.stringify({
      intervention_needed: true,
      intervention_reason: 'blocked',
      intervention_level: 'action_feedback',
      strategy_suggestion: 'rephrase',
      feedback_for_action: '用户遇阻',
      orchestration_needed: false,
    });

    const result = handler['parseMonitorOutput'](validJson);

    expect(result.analysis.intervention_needed).toBe(true);
    expect(result.analysis.intervention_reason).toBe('blocked');
    expect(result.parseError).toBeUndefined();
  });

  it('应该在第2次尝试成功解析带空白的JSON', () => {
    const jsonWithWhitespace = `
      \uFEFF  
      ${JSON.stringify({
        intervention_needed: false,
        intervention_reason: 'normal',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '',
        orchestration_needed: false,
      })}
      \t\r\n  
    `;

    const result = handler['parseMonitorOutput'](jsonWithWhitespace);

    expect(result.analysis.intervention_needed).toBe(false);
    expect(result.parseError).toBeDefined();
    expect(result.parseError?.retryCount).toBe(2);
    expect(result.parseError?.strategies).toContain('trim_and_parse');
  });

  it('应该在第3次尝试成功解析markdown代码块中的JSON', () => {
    const jsonInMarkdown = `
这是监控分析结果：

\`\`\`json
{
  "intervention_needed": true,
  "intervention_reason": "off_topic",
  "intervention_level": "action_feedback",
  "strategy_suggestion": "rephrase",
  "feedback_for_action": "用户偏题",
  "orchestration_needed": false
}
\`\`\`
    `;

    const result = handler['parseMonitorOutput'](jsonInMarkdown);

    expect(result.analysis.intervention_needed).toBe(true);
    expect(result.analysis.intervention_reason).toBe('off_topic');
    expect(result.parseError).toBeDefined();
    expect(result.parseError?.retryCount).toBe(3);
    expect(result.parseError?.strategies).toContain('extract_json_block');
  });

  it('应该在3次重试失败后使用降级默认值', () => {
    const invalidJson = 'This is not JSON at all!';

    const result = handler['parseMonitorOutput'](invalidJson);

    expect(result.analysis.intervention_needed).toBe(false);
    expect(result.analysis.intervention_reason).toBe('normal');
    expect(result.analysis.feedback_for_action).toBe('');
    expect(result.parseError).toBeDefined();
    expect(result.parseError?.retryCount).toBe(3);
    expect(result.parseError?.finalError).toBeDefined();
    expect(result.analysis.metadata?.parseError).toBe(true);
  });

  it('应该验证必需字段并提供默认值', () => {
    const incompleteJson = JSON.stringify({
      intervention_reason: 'blocked',
      // 缺少 intervention_needed
    });

    const result = handler['parseMonitorOutput'](incompleteJson);

    expect(result.analysis.intervention_needed).toBe(false); // 默认值
    expect(result.analysis.feedback_for_action).toBe(''); // 默认值
  });
});

describe('BaseMonitorHandler - 反馈提示词生成', () => {
  let handler: TestMonitorHandler;

  beforeEach(() => {
    handler = new TestMonitorHandler();
  });

  it('应该为需要介入的分析生成反馈提示词', () => {
    const analysis: MonitorAnalysis = {
      intervention_needed: true,
      intervention_reason: 'blocked',
      intervention_level: 'action_feedback',
      strategy_suggestion: 'rephrase',
      feedback_for_action: '用户对父亲职业话题表现回避',
      modified_approach: '可以先询问家庭氛围',
      orchestration_needed: false,
    };

    const feedback = handler.buildFeedbackPrompt(analysis);

    expect(feedback).toContain('【Topic层策略建议】');
    expect(feedback).toContain('用户对父亲职业话题表现回避');
    expect(feedback).toContain('【建议调整方式】');
    expect(feedback).toContain('可以先询问家庭氛围');
  });

  it('应该为不需要介入的分析返回空字符串', () => {
    const analysis: MonitorAnalysis = {
      intervention_needed: false,
      intervention_reason: 'normal',
      intervention_level: 'action_feedback',
      strategy_suggestion: 'continue',
      feedback_for_action: '',
      orchestration_needed: false,
    };

    const feedback = handler.buildFeedbackPrompt(analysis);

    expect(feedback).toBe('');
  });

  it('应该包含example_suggestion字段（ai_say专用）', () => {
    const analysis: MonitorAnalysis = {
      intervention_needed: true,
      intervention_reason: 'too_abstract',
      intervention_level: 'action_feedback',
      strategy_suggestion: 'add_examples',
      feedback_for_action: '用户对概念理解困难',
      example_suggestion: '可以举考试失利的例子',
      orchestration_needed: false,
    };

    const feedback = handler.buildFeedbackPrompt(analysis);

    expect(feedback).toContain('【具体例子】');
    expect(feedback).toContain('可以举考试失利的例子');
  });
});

describe('BaseMonitorHandler - shouldTriggerOrchestration', () => {
  let handler: TestMonitorHandler;

  beforeEach(() => {
    handler = new TestMonitorHandler();
  });

  it('应该在本Story阶段固定返回false', () => {
    const analysis: MonitorAnalysis = {
      intervention_needed: true,
      intervention_reason: 'blocked',
      intervention_level: 'topic_orchestration',
      strategy_suggestion: 'skip',
      feedback_for_action: '需要跳过当前Topic',
      orchestration_needed: true, // 即使设置为true
    };

    const result = handler.shouldTriggerOrchestration(analysis);

    expect(result).toBe(false); // 本阶段固定返回false
  });
});

describe('MonitorTemplateResolver - 模板路径解析', () => {
  it('应该优先使用custom层模板', async () => {
    const mockProvider = {
      getTemplate: vi.fn().mockResolvedValue('mock template content'),
    };

    const resolver = new MonitorTemplateResolver('test-project-id', mockProvider);

    const result = await resolver.resolveMonitorTemplatePath('ai_ask', {
      template_scheme: 'crisis_intervention',
    });

    expect(result.path).toBe('_system/config/custom/crisis_intervention/ai_ask_monitor_v1.md');
    expect(result.layer).toBe('custom');
    expect(result.scheme).toBe('crisis_intervention');
  });

  it('应该回退到default层模板', async () => {
    const mockProvider = {
      getTemplate: vi
        .fn()
        .mockResolvedValueOnce(null) // custom层不存在
        .mockResolvedValueOnce('default template'), // default层存在
    };

    const resolver = new MonitorTemplateResolver('test-project-id', mockProvider);

    const result = await resolver.resolveMonitorTemplatePath('ai_ask', {
      template_scheme: 'nonexistent_scheme',
    });

    expect(result.path).toBe('_system/config/default/ai_ask_monitor_v1.md');
    expect(result.layer).toBe('default');
    expect(result.scheme).toBeUndefined();
  });

  it('应该在没有scheme配置时直接使用default层', async () => {
    const mockProvider = {
      getTemplate: vi.fn().mockResolvedValue('default template'),
    };

    const resolver = new MonitorTemplateResolver('test-project-id', mockProvider);

    const result = await resolver.resolveMonitorTemplatePath('ai_ask');

    expect(result.path).toBe('_system/config/default/ai_ask_monitor_v1.md');
    expect(result.layer).toBe('default');
    expect(mockProvider.getTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('监控处理器 - 异步执行验证', () => {
  it('应该异步执行不阻塞主流程', async () => {
    const handler = new TestMonitorHandler();
    const startTime = Date.now();

    // 模拟监控分析
    const mockContext: MonitorContext = {
      sessionId: 'test-session',
      actionId: 'test-action',
      actionType: 'ai_ask',
      currentRound: 1,
      maxRounds: 3,
      actionResult: {
        success: true,
        completed: false,
        metrics: {
          information_completeness: '用户提供了部分信息',
          user_engagement: '用户回答详细',
          emotional_intensity: '情绪平静',
          reply_relevance: '回答相关',
        },
        progress_suggestion: 'continue_needed',
      },
    };

    // 异步调用
    const promise = handler.analyzeWithLLM({}, mockContext);

    // 主流程应该立即继续
    const elapsedTime = Date.now() - startTime;
    expect(elapsedTime).toBeLessThan(100); // 主流程不应被阻塞

    // 等待异步完成
    const result = await promise;
    expect(result).toBeDefined();
  });
});
