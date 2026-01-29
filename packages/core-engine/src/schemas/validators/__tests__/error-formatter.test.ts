/**
 * ErrorFormatter 单元测试
 */

import type { ErrorObject } from 'ajv';
import { describe, it, expect, beforeEach } from 'vitest';

import { ErrorFormatter, ErrorType } from '../error-formatter.js';

describe('ErrorFormatter', () => {
  let formatter: ErrorFormatter;

  beforeEach(() => {
    formatter = new ErrorFormatter();
  });

  describe('format', () => {
    it('应该返回空数组当没有错误时', () => {
      const result = formatter.format([]);
      expect(result).toHaveLength(0);
    });

    it('应该格式化必填字段缺失错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'required',
        instancePath: '/session',
        schemaPath: '#/properties/session/required',
        params: { missingProperty: 'session_id' },
        message: "must have required property 'session_id'",
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.REQUIRED_FIELD_MISSING);
      expect(result[0].message).toContain('session_id');
      expect(result[0].path).toBe('session.session_id');
    });

    it('应该格式化枚举值错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'enum',
        instancePath: '/action_type',
        schemaPath: '#/properties/action_type/enum',
        params: { allowedValues: ['ai_say', 'ai_ask', 'ai_think', 'use_skill'] },
        message: 'must be equal to one of the allowed values',
        data: 'ai_chat',
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.ENUM_VALUE_INVALID);
      expect(result[0].message).toContain('ai_chat');
      expect(result[0].expected).toContain('ai_say');
    });

    it('应该格式化类型错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'type',
        instancePath: '/max_rounds',
        schemaPath: '#/properties/max_rounds/type',
        params: { type: 'number' },
        message: 'must be number',
        data: '5',
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.TYPE_ERROR);
      expect(result[0].message).toContain('number');
    });

    it('应该格式化数值范围错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'maximum',
        instancePath: '/config/max_rounds',
        schemaPath: '#/properties/config/properties/max_rounds/maximum',
        params: { limit: 10 },
        message: 'must be <= 10',
        data: 15,
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.CONSTRAINT_VIOLATION);
      expect(result[0].message).toContain('超过最大值');
      expect(result[0].expected).toBe('<= 10');
    });

    it('应该格式化最小长度错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'minLength',
        instancePath: '/content',
        schemaPath: '#/properties/content/minLength',
        params: { limit: 1 },
        message: 'must NOT have fewer than 1 characters',
        data: '',
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.CONSTRAINT_VIOLATION);
      expect(result[0].message).toContain('小于最小长度');
    });

    it('应该格式化额外属性错误', () => {
      const ajvError: ErrorObject = {
        keyword: 'additionalProperties',
        instancePath: '/config',
        schemaPath: '#/properties/config/additionalProperties',
        params: { additionalProperty: 'unknown_field' },
        message: 'must NOT have additional properties',
      };

      const result = formatter.format([ajvError]);
      expect(result).toHaveLength(1);
      expect(result[0].errorType).toBe(ErrorType.STRUCTURE_ERROR);
      expect(result[0].message).toContain('unknown_field');
    });
  });

  describe('generateSuggestion', () => {
    it('应该为必填字段生成建议', () => {
      const error: ErrorObject = {
        keyword: 'required',
        instancePath: '/session',
        schemaPath: '',
        params: { missingProperty: 'session_id' },
        message: '',
      };

      const suggestion = formatter.generateSuggestion(error);
      expect(suggestion).toContain('添加');
      expect(suggestion).toContain('session_id');
    });

    it('应该为枚举值生成建议', () => {
      const error: ErrorObject = {
        keyword: 'enum',
        instancePath: '/action_type',
        schemaPath: '',
        params: { allowedValues: ['ai_say', 'ai_ask'] },
        message: '',
      };

      const suggestion = formatter.generateSuggestion(error);
      expect(suggestion).toContain('ai_say');
      expect(suggestion).toContain('ai_ask');
    });
  });

  describe('generateExample', () => {
    it('应该为 action_type 生成示例', () => {
      const error: ErrorObject = {
        keyword: 'required',
        instancePath: '/action',
        schemaPath: '',
        params: { missingProperty: 'action_type' },
        message: '',
      };

      const example = formatter.generateExample(error);
      expect(example).toBeDefined();
      expect(example).toContain('ai_ask');
    });

    it('应该为 content 生成示例', () => {
      const error: ErrorObject = {
        keyword: 'required',
        instancePath: '/config',
        schemaPath: '',
        params: { missingProperty: 'content' },
        message: '',
      };

      const example = formatter.generateExample(error);
      expect(example).toBeDefined();
      expect(example).toContain('content');
    });

    it('应该为 max_rounds 范围错误生成示例', () => {
      const error: ErrorObject = {
        keyword: 'maximum',
        instancePath: '/config/max_rounds',
        schemaPath: '#/properties/config/properties/max_rounds/maximum',
        params: { limit: 10 },
        message: '',
      };

      const example = formatter.generateExample(error);
      expect(example).toBeDefined();
      expect(example).toContain('max_rounds');
    });
  });

  describe('路径格式化', () => {
    it('应该正确格式化嵌套路径', () => {
      const ajvError: ErrorObject = {
        keyword: 'required',
        instancePath: '/session/phases/0/topics/1/actions/2',
        schemaPath: '',
        params: { missingProperty: 'action_id' },
        message: '',
      };

      const result = formatter.format([ajvError]);
      expect(result[0].path).toBe('session.phases[0].topics[1].actions[2].action_id');
    });

    it('应该正确格式化根路径', () => {
      const ajvError: ErrorObject = {
        keyword: 'required',
        instancePath: '',
        schemaPath: '',
        params: { missingProperty: 'session' },
        message: '',
      };

      const result = formatter.format([ajvError]);
      expect(result[0].path).toBe('session');
    });
  });
});
