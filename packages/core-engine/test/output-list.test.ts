/**
 * 测试 ai_ask 的 output_list 功能
 */

import { describe, test, expect } from 'vitest';
import { AiAskAction } from '../src/actions/ai-ask-action.js';

describe('AiAskAction - output_list 生成', () => {
  test('单个变量时也生成 output_list', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请告诉我你的名字',
      output: [
        { get: '用户名', define: '用户的姓名或昵称' }
      ]
    });

    // 通过反射访问私有方法测试
    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList();
    
    // 单个变量也应该生成 output_list
    expect(result).toContain('"用户名"');
    expect(result).toContain('用户的姓名或昵称');
    
    console.log('单个变量的 output_list:\n', result);
  });

  test('多个变量时生成完整的 output_list', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请描述你的症状',
      output: [
        { get: '症状描述', define: '用户描述的主要症状' },
        { get: '持续时间', define: '症状持续的时间长度' },
        { get: '严重程度', define: '症状的严重程度评估' }
      ]
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList();
    
    // 验证格式（不包含前置逗号，模板中已有）
    expect(result).toContain('"症状描述"');
    expect(result).toContain('"持续时间"');
    expect(result).toContain('"严重程度"');
    expect(result).toContain('用户描述的主要症状');
    expect(result).toContain('症状持续的时间长度');
    // 验证每个变量都在单独的行
    expect(result.split('\n').length).toBeGreaterThanOrEqual(3);
    
    console.log('生成的 output_list:\n', result);
  });

  test('没有 output 配置时返回空字符串', () => {
    const action = new AiAskAction('test_action', {
      question_template: '你好吗？',
      target_variable: 'user_mood'
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList();
    
    expect(result).toBe('');
  });

  test('部分变量没有 define 时也能正确生成', () => {
    const action = new AiAskAction('test_action', {
      question_template: '请提供信息',
      output: [
        { get: '姓名', define: '用户的姓名' },
        { get: '年龄' } // 没有 define
      ]
    });

    const buildOutputList = (action as any).buildOutputList.bind(action);
    const result = buildOutputList();
    
    expect(result).toContain('"姓名"');
    expect(result).toContain('"年龄"');
    expect(result).toContain('用户的姓名');
    
    console.log('部分 define 的 output_list:\n', result);
  });
});
