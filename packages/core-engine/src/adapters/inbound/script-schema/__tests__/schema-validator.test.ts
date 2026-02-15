/**
 * SchemaValidator 单元测试
 */

import { describe, expect, it } from 'vitest';

import { SchemaValidator } from '../validators/schema-validator.js';

import {
  createActionWithDeprecatedField,
  createActionWithInvalidEnum,
  createActionWithOutOfRangeValue,
  createInvalidYAML,
  createSessionWithMissingField,
  createValidAction,
  createValidSession,
  createValidSessionYAML,
  createValidTechnique,
  createYAMLWithDeprecatedFields,
} from './test-fixtures.js';

describe('SchemaValidator', () => {
  const validator = new SchemaValidator();

  describe('validateYAML', () => {
    it('应该成功验证合法的Session脚本', () => {
      const yamlContent = createValidSessionYAML();
      const result = validator.validateYAML(yamlContent);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测YAML语法错误', () => {
      const invalidYAML = createInvalidYAML();
      const result = validator.validateYAML(invalidYAML);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('SYNTAX_ERROR');
      expect(result.errors[0].message).toContain('YAML 语法错误');
    });

    it('应该检测无法识别的脚本类型', () => {
      const yamlContent = `unknown_field: value\ndata:\n  id: test`;
      const result = validator.validateYAML(yamlContent);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('无法识别的脚本类型');
    });

    it('应该检测废弃字段', () => {
      const yamlContent = createYAMLWithDeprecatedFields();
      const result = validator.validateYAML(yamlContent);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      // 检查是否识别了废弃字段
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('question_template');
    });
  });

  describe('validateSession', () => {
    it('应该成功验证合法的Session脚本', () => {
      const session = createValidSession();
      const result = validator.validateSession(session);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少session_id字段', () => {
      const session = createSessionWithMissingField('session_id');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('REQUIRED_FIELD_MISSING');
      expect(result.errors[0].message).toContain('session_id');
    });

    it('应该检测缺少phases字段', () => {
      const session = createSessionWithMissingField('phases');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('phases');
    });

    it('应该检测缺少action_type字段', () => {
      const session = createSessionWithMissingField('action_type');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('action_type');
    });

    it('应该检测缺少action_id字段', () => {
      const session = createSessionWithMissingField('action_id');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('action_id');
    });

    it('应该检测缺少config字段', () => {
      const session = createSessionWithMissingField('config');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('config');
    });

    it('应该检测缺少content字段', () => {
      const session = createSessionWithMissingField('content');
      const result = validator.validateSession(session);

      expect(result.valid).toBe(false);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('content');
    });

    it('应该检测无法识别的action类型', () => {
      const result = validator.validateSession({
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'phase_1',
            topics: [
              {
                topic_id: 'topic_1',
                actions: [
                  {
                    action_type: 'unknown_action',
                    content: 'Test content',
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('unknown_action');
    });
  });

  describe('validateTechnique', () => {
    it('应该成功验证合法的Technique脚本', () => {
      const technique = createValidTechnique();
      const result = validator.validateTechnique(technique);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateAction', () => {
    it('应该成功验证合法的ai_ask Action', () => {
      const action = createValidAction('ai_ask');
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该成功验证合法的ai_say Action', () => {
      const action = createValidAction('ai_say');
      const result = validator.validateAction(action, 'ai_say');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该成功验证合法的ai_think Action', () => {
      const action = createValidAction('ai_think');
      const result = validator.validateAction(action, 'ai_think');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测非法的action_type枚举值', () => {
      const action = createActionWithInvalidEnum();
      const result = validator.validateAction(action, 'invalid_type');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该检测max_rounds超出范围', () => {
      const action = createActionWithOutOfRangeValue();
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('15');
    });

    it('应该检测废弃字段question_template', () => {
      const action = createActionWithDeprecatedField('ai_ask', 'question_template');
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('question_template');
    });

    it('应该检测废弃字段target_variable', () => {
      const action = createActionWithDeprecatedField('ai_ask', 'target_variable');
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('target_variable');
    });

    it('应该检测废弃字段extraction_prompt', () => {
      const action = createActionWithDeprecatedField('ai_ask', 'extraction_prompt');
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('extraction_prompt');
    });

    it('应该检测废弃字段required', () => {
      const action = createActionWithDeprecatedField('ai_ask', 'required');
      const result = validator.validateAction(action, 'ai_ask');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('required');
    });

    it('应该检测废弃字段content_template', () => {
      const action = createActionWithDeprecatedField('ai_say', 'content_template');
      const result = validator.validateAction(action, 'ai_say');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('content_template');
    });

    it('应该检测废弃字段prompt_template', () => {
      const action = createActionWithDeprecatedField('ai_think', 'prompt_template');
      const result = validator.validateAction(action, 'ai_think');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      const errorMessages = result.errors.map((e) => e.message).join(' ');
      expect(errorMessages).toContain('prompt_template');
    });
  });

  describe('validatePartial', () => {
    it('应该支持部分验证ai-ask-config', () => {
      const config = {
        content: '请问您的名字是？',
        max_rounds: 3,
      };
      const result = validator.validatePartial(config, 'ai-ask-config');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测部分验证中的错误', () => {
      const config = {
        // 缺少必填字段content
        max_rounds: 3,
      };
      const result = validator.validatePartial(config, 'ai-ask-config');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('异常处理', () => {
    it('validateSessionOrThrow应该在验证失败时抛出异常', () => {
      const session = createSessionWithMissingField('session_id');

      expect(() => {
        validator.validateSessionOrThrow(session);
      }).toThrow('Session 脚本验证失败');
    });

    it('validateTechniqueOrThrow应该在验证失败时抛出异常', () => {
      const invalidTechnique = { topic: {} }; // 缺少必填字段

      expect(() => {
        validator.validateTechniqueOrThrow(invalidTechnique);
      }).toThrow('Technique 脚本验证失败');
    });

    it('validateYAMLOrThrow应该在验证失败时抛出异常', () => {
      const invalidYAML = createInvalidYAML();

      expect(() => {
        validator.validateYAMLOrThrow(invalidYAML);
      }).toThrow('YAML 脚本验证失败');
    });

    it('validateYAMLOrThrow应该在验证成功时返回解析后的数据', () => {
      const yamlContent = createValidSessionYAML();
      const data = validator.validateYAMLOrThrow(yamlContent);

      expect(data).toBeDefined();
      expect(typeof data).toBe('object');
    });
  });

  describe('性能测试', () => {
    it('验证Session脚本应该在100ms内完成', () => {
      const session = createValidSession();
      const startTime = Date.now();
      validator.validateSession(session);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });

    it('验证YAML字符串应该在100ms内完成', () => {
      const yamlContent = createValidSessionYAML();
      const startTime = Date.now();
      validator.validateYAML(yamlContent);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
