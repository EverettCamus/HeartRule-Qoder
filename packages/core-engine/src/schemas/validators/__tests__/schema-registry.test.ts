/**
 * SchemaRegistry 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SchemaRegistry } from '../schema-registry.js';

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  describe('getSchema', () => {
    it('应该返回 session Schema', () => {
      const schema = registry.getSchema('session');
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('function');
    });

    it('应该返回 ai-ask-config Schema', () => {
      const schema = registry.getSchema('ai-ask-config');
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('function');
    });

    it('应该返回 ai-say-config Schema', () => {
      const schema = registry.getSchema('ai-say-config');
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('function');
    });

    it('应该返回 ai-think-config Schema', () => {
      const schema = registry.getSchema('ai-think-config');
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('function');
    });

    it('应该返回 use-skill-config Schema', () => {
      const schema = registry.getSchema('use-skill-config');
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('function');
    });

    it('应该缓存编译后的 Schema', () => {
      const schema1 = registry.getSchema('session');
      const schema2 = registry.getSchema('session');
      expect(schema1).toBe(schema2); // 应该返回同一个实例
    });
  });

  describe('registerSchema', () => {
    it('应该能够注册自定义 Schema', () => {
      const customSchema = {
        type: 'object',
        properties: {
          custom_field: { type: 'string' },
        },
        required: ['custom_field'],
      };

      expect(() => {
        registry.registerSchema('custom-test', customSchema);
      }).not.toThrow();
    });
  });

  describe('reloadSchemas', () => {
    it('应该能够重新加载所有 Schemas', () => {
      expect(() => {
        registry.reloadSchemas();
      }).not.toThrow();

      // 验证重新加载后仍然可以获取 Schema
      const schema = registry.getSchema('session');
      expect(schema).toBeDefined();
    });
  });

  describe('getAjvInstance', () => {
    it('应该返回 AJV 实例', () => {
      const ajv = registry.getAjvInstance();
      expect(ajv).toBeDefined();
      expect(typeof ajv.compile).toBe('function');
    });
  });

  describe('Schema 验证功能', () => {
    it('session Schema 应该验证通过正确数据', () => {
      const validate = registry.getSchema('session');
      const validData = {
        session: {
          session_id: 'test_session',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'ai_say',
                      action_id: 'say_1',
                      config: {
                        content: 'Hello',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const result = validate(validData);
      expect(result).toBe(true);
    });

    it('session Schema 应该验证失败缺少必填字段', () => {
      const validate = registry.getSchema('session');
      const invalidData = {
        session: {
          // 缺少 session_id
          phases: [],
        },
      };

      const result = validate(invalidData);
      expect(result).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors && validate.errors.length).toBeGreaterThan(0);
    });

    it('ai-ask-config Schema 应该验证通过正确配置', () => {
      const validate = registry.getSchema('ai-ask-config');
      const validConfig = {
        content: '请问您的名字？',
        max_rounds: 3,
        output: [
          {
            get: 'user_name',
            define: '用户姓名',
          },
        ],
      };

      const result = validate(validConfig);
      expect(result).toBe(true);
    });

    it('ai-ask-config Schema 应该验证失败缺少 content', () => {
      const validate = registry.getSchema('ai-ask-config');
      const invalidConfig = {
        max_rounds: 3,
      };

      const result = validate(invalidConfig);
      expect(result).toBe(false);
    });

    it('ai-say-config Schema 应该验证通过正确配置', () => {
      const validate = registry.getSchema('ai-say-config');
      const validConfig = {
        content: '欢迎！',
        tone: 'friendly',
        max_rounds: 2,
      };

      const result = validate(validConfig);
      expect(result).toBe(true);
    });

    it('ai-think-config Schema 应该验证通过正确配置', () => {
      const validate = registry.getSchema('ai-think-config');
      const validConfig = {
        content: '分析用户情绪',
        output: [
          {
            get: 'emotion_state',
          },
        ],
      };

      const result = validate(validConfig);
      expect(result).toBe(true);
    });

    it('use-skill-config Schema 应该验证通过正确配置', () => {
      const validate = registry.getSchema('use-skill-config');
      const validConfig = {
        skill: 'cognitive_restructuring',
        input: [
          {
            set: 'thought',
            value: '负面想法',
          },
        ],
        output: [
          {
            get: 'restructured',
          },
        ],
      };

      const result = validate(validConfig);
      expect(result).toBe(true);
    });

    it('action-base Schema 应该验证枚举值', () => {
      const validate = registry.getSchema('action-base');
      const invalidAction = {
        action_type: 'invalid_type',
        action_id: 'test',
      };

      const result = validate(invalidAction);
      expect(result).toBe(false);
      expect(validate.errors).toBeDefined();
      const enumError = validate.errors && validate.errors.find((e) => e.keyword === 'enum');
      expect(enumError).toBeDefined();
    });
  });
});
