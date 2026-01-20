/**
 * AiSayAction Bug修复回归测试
 * 
 * 此文件专门用于测试最近修复的bug，确保不会再次出现
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { AiSayAction } from '../ai-say-action.js';
import type { ActionContext } from '../base-action.js';

describe('AiSayAction - Bug修复回归测试', () => {
  let context: ActionContext;

  beforeEach(() => {
    context = {
      sessionId: 'test-session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: {}, // 使用普通对象而不是 Map
      conversationHistory: [],
      metadata: {},
    };
  });

  /**
   * 【BUG修复】context.variables 使用对象访问而非 Map.get()
   * 
   * 问题：在 extractScriptVariables 和 buildSystemVariables 方法中
   * 错误使用了 context.variables.get()，但 variables 是普通对象
   * 
   * 错误信息：TypeError: context.variables.get is not a function
   * 
   * 修复：改为 context.variables['key'] 对象访问方式
   */
  test('【BUG修复】context.variables 应使用对象访问而非 Map.get()', async () => {
    const context: ActionContext = {
      sessionId: 'test-session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: {
        '咨询师名': '李医生',
        '用户名': '张三',
        '教育背景': '本科',
      },
      conversationHistory: [],
      metadata: {},
    };

    const action = new AiSayAction(
      'test',
      {
        content: '您好，我是咨询师',
        require_acknowledgment: false,
      }
    );

    // 关键：不应抛出 "context.variables.get is not a function" 错误
    await expect(action.execute(context)).resolves.not.toThrow();

    const result = await action.execute(context);
    
    expect(result.success).toBe(true);
    expect(result.aiMessage).toBeTruthy();
  });

  /**
   * 【BUG修复】content_template 字段应被正确读取
   * 
   * 问题：extractScriptVariables 只读取 this.config.content
   * 导致只有 content_template 时内容为空
   * 
   * 修复：支持字段回退 content || content_template || contentTemplate
   */
  test('【BUG修复】content_template 字段应被正确读取', async () => {
    const action = new AiSayAction(
      'test',
      {
        content_template: '向用户简单介绍自己',
        require_acknowledgment: false,
      }
    );

    const result = await action.execute(context);

    expect(result.success).toBe(true);
    expect(result.aiMessage).toBeTruthy();
    expect(result.aiMessage).not.toBe(''); // 不应为空
    expect(result.aiMessage).toContain('介绍自己');
  });

  /**
   * 【BUG修复】contentTemplate (驼峰命名) 应被兼容
   * 
   * 问题：早期版本可能使用驼峰命名
   * 
   * 修复：支持 content || content_template || contentTemplate
   */
  test('【BUG修复】contentTemplate (驼峰命名) 应被兼容', async () => {
    const action = new AiSayAction(
      'test',
      {
        contentTemplate: '使用驼峰命名的内容',
        require_acknowledgment: false,
      }
    );

    const result = await action.execute(context);

    expect(result.success).toBe(true);
    expect(result.aiMessage).toBe('使用驼峰命名的内容');
  });

  /**
   * 【BUG修复】字段优先级应正确: content > content_template > contentTemplate
   */
  test('【BUG修复】字段优先级应正确', async () => {
    // 测试 1：content 优先
    const action1 = new AiSayAction('test', {
      content: '优先级最高',
      content_template: '优先级中等',
      contentTemplate: '优先级最低',
      require_acknowledgment: false,
    });
    
    const result1 = await action1.execute(context);
    expect(result1.aiMessage).toBe('优先级最高');

    // 测试 2：content_template 优先（无 content）
    const action2 = new AiSayAction('test', {
      content_template: '优先级中等',
      contentTemplate: '优先级最低',
      require_acknowledgment: false,
    });
    
    const result2 = await action2.execute(context);
    expect(result2.aiMessage).toBe('优先级中等');

    // 测试 3：contentTemplate 兜底（无 content 和 content_template）
    const action3 = new AiSayAction('test', {
      contentTemplate: '优先级最低',
      require_acknowledgment: false,
    });
    
    const result3 = await action3.execute(context);
    expect(result3.aiMessage).toBe('优先级最低');
  });

  /**
   * 【回归测试】真实场景：cbt_depression_assessment.yaml 第一个 action
   * 
   * 这是触发 bug 的真实场景配置
   */
  test('【回归测试】模拟真实场景：content_template + max_rounds', async () => {
    const context: ActionContext = {
      sessionId: 'test-session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: {
        '咨询师名': 'AI助手',
      },
      conversationHistory: [],
      metadata: {},
    };

    const action = new AiSayAction(
      'action_1',
      {
        content_template: '向用户简单介绍自己，让用户感受到亲和力。\n称呼：{{咨询师名}}',
        require_acknowledgment: true,
        max_rounds: 5,
      }
    );

    const result = await action.execute(context);

    // 关键：不应抛出错误
    expect(result.success).toBe(true);
    expect(result.aiMessage).toBeTruthy();
    expect(result.aiMessage).not.toBe('');
  });

  /**
   * 【回归测试】空 variables 对象不应导致错误
   */
  test('【回归测试】空 variables 对象应正常处理', async () => {
    const context: ActionContext = {
      sessionId: 'test-session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: {}, // 空对象
      conversationHistory: [],
      metadata: {},
    };

    const action = new AiSayAction(
      'test',
      {
        content_template: '测试内容',
        require_acknowledgment: false,
      }
    );

    await expect(action.execute(context)).resolves.not.toThrow();

    const result = await action.execute(context);
    expect(result.success).toBe(true);
  });
});
