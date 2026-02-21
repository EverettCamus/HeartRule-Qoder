/**
 * Placeholder Validator Tests
 * Story 2.1: Topic默认Action模板语义与策略定义
 */

import { describe, test, expect } from 'vitest';

import { PlaceholderValidator } from '../placeholder-validator.js';

describe('PlaceholderValidator', () => {
  describe('validateFormat', () => {
    test('验证合法占位符格式', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('您和{抚养者}的关系如何?');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('验证包含多个占位符的文本', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('您好{用户名},我们来聊聊{抚养者}');
      expect(result.valid).toBe(true);
    });

    test('验证英文占位符', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('Hello {user_name}, let us talk about {caregiver}');
      expect(result.valid).toBe(true);
    });

    test('验证混合中英文占位符', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('{user_name}和{抚养者}的关系');
      expect(result.valid).toBe(true);
    });

    test('检测非法占位符格式-以数字开头', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('这是{123非法}占位符');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('格式无效');
    });

    test('检测非法占位符格式-包含特殊字符', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('这是{变量@名}占位符');
      expect(result.valid).toBe(false);
    });

    test('无占位符的文本应验证通过', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateFormat('这是普通文本,没有占位符');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateReferences', () => {
    test('验证占位符引用(变量已定义)', () => {
      const validator = new PlaceholderValidator();
      const availableVars = ['抚养者', '用户名'];
      const result = validator.validateReferences('您好{用户名},我们来聊聊{抚养者}', availableVars);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test('检测未定义变量引用(生成Warning)', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateReferences('您和{不存在的变量}的关系如何?', []);
      expect(result.valid).toBe(true); // 不阻断
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings![0]).toContain('未定义');
    });

    test('部分变量未定义', () => {
      const validator = new PlaceholderValidator();
      const availableVars = ['用户名'];
      const result = validator.validateReferences('您好{用户名},我们来聊聊{抚养者}', availableVars);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings![0]).toContain('抚养者');
    });

    test('无占位符文本不生成警告', () => {
      const validator = new PlaceholderValidator();
      const result = validator.validateReferences('普通文本', []);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('extractPlaceholders', () => {
    test('提取单个占位符', () => {
      const validator = new PlaceholderValidator();
      const placeholders = validator.extractPlaceholders('您和{抚养者}的关系如何?');
      expect(placeholders).toEqual(['抚养者']);
    });

    test('提取多个占位符', () => {
      const validator = new PlaceholderValidator();
      const placeholders = validator.extractPlaceholders('您好{用户名},我们来聊聊{抚养者}');
      expect(placeholders).toEqual(['用户名', '抚养者']);
    });

    test('提取重复占位符(保留重复)', () => {
      const validator = new PlaceholderValidator();
      const placeholders = validator.extractPlaceholders('{抚养者}和{抚养者}的关系,以及{用户名}');
      expect(placeholders).toEqual(['抚养者', '抚养者', '用户名']);
    });

    test('无占位符返回空数组', () => {
      const validator = new PlaceholderValidator();
      const placeholders = validator.extractPlaceholders('普通文本');
      expect(placeholders).toEqual([]);
    });
  });

  describe('validateActionConfig', () => {
    test('验证包含占位符的Action配置', () => {
      const validator = new PlaceholderValidator();
      const actionConfig = {
        action_id: 'ask_relationship_{抚养者}',
        action_type: 'ai_ask',
        config: {
          content: '您和{抚养者}的关系怎么样?',
          output: [
            {
              get: '{抚养者}_关系',
            },
          ],
        },
      };

      const result = validator.validateActionConfig(actionConfig, ['抚养者']);
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    test('检测Action配置中的非法占位符', () => {
      const validator = new PlaceholderValidator();
      const actionConfig = {
        action_id: 'test',
        config: {
          content: '这是{123非法}占位符',
        },
      };

      const result = validator.validateActionConfig(actionConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('检测Action配置中的未定义变量引用(Warning)', () => {
      const validator = new PlaceholderValidator();
      const actionConfig = {
        action_id: 'test',
        config: {
          content: '您和{不存在的变量}的关系',
        },
      };

      const result = validator.validateActionConfig(actionConfig, ['用户名']);
      expect(result.valid).toBe(true); // 不阻断
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    test('递归验证嵌套对象中的占位符', () => {
      const validator = new PlaceholderValidator();
      const actionConfig = {
        action_id: 'test',
        config: {
          content: '您好{用户名}',
          nested: {
            deep: {
              text: '关于{抚养者}的信息',
            },
          },
        },
      };

      const result = validator.validateActionConfig(actionConfig, ['用户名', '抚养者']);
      expect(result.valid).toBe(true);
    });

    test('验证数组中的占位符', () => {
      const validator = new PlaceholderValidator();
      const actionConfig = {
        action_id: 'test',
        config: {
          questions: ['{抚养者}的称呼是什么?', '和{抚养者}住在一起吗?'],
        },
      };

      const result = validator.validateActionConfig(actionConfig, ['抚养者']);
      expect(result.valid).toBe(true);
    });
  });
});
