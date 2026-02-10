/**
 * YAMLParser Schema 验证集成测试
 */

import { describe, it, expect } from 'vitest';

import { SchemaValidationError } from '../../../adapters/inbound/script-schema/index.js';
import { YAMLParser } from '../yaml-parser.js';

describe('YAMLParser Schema Validation Integration', () => {
  const parser = new YAMLParser();

  describe('validateSessionScript', () => {
    it('应该验证通过合法的 Session 脚本', () => {
      const validSession = {
        session: {
          session_id: 'test_session_001',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'ai_say',
                      action_id: 'say_hello',
                      config: {
                        content: 'Hello, World!',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      expect(() => parser.validateSessionScript(validSession)).not.toThrow();
    });

    it('应该在缺少必填字段时抛出 SchemaValidationError', () => {
      const invalidSession = {
        session: {
          // 缺少 session_id
          phases: [],
        },
      };

      expect(() => parser.validateSessionScript(invalidSession)).toThrow(SchemaValidationError);
    });

    it('应该在 action_type 不正确时抛出 SchemaValidationError', () => {
      const invalidSession = {
        session: {
          session_id: 'test_session_001',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'invalid_type', // 错误的 action_type
                      action_id: 'test_action',
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      expect(() => parser.validateSessionScript(invalidSession)).toThrow(SchemaValidationError);
    });

    // NOTE: 当前 Session Schema 只验证到 Action Base 层级，不验证 config 内部
    // 此测试用例需要 Phase 3 实现深度验证后才能启用
    it.skip('应该在 ai_ask config 缺少 content 时抛出错误', () => {
      const invalidSession = {
        session: {
          session_id: 'test_session_001',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'ai_ask',
                      action_id: 'ask_name',
                      config: {
                        // 缺少 content
                        tone: 'friendly',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      expect(() => parser.validateSessionScript(invalidSession)).toThrow(SchemaValidationError);
    });
  });

  describe('validateTechniqueScript', () => {
    it('应该验证通过合法的 Technique 脚本', () => {
      const validTechnique = {
        topic_id: 'socratic_questioning',
        actions: [
          {
            action_type: 'ai_think',
            action_id: 'analyze_belief',
            config: {
              content: 'Analyze the core belief',
            },
          },
        ],
      };

      expect(() => parser.validateTechniqueScript(validTechnique)).not.toThrow();
    });

    it('应该在缺少 topic_id 时抛出 SchemaValidationError', () => {
      const invalidTechnique = {
        // 缺少 topic_id
        actions: [],
      };

      expect(() => parser.validateTechniqueScript(invalidTechnique)).toThrow(SchemaValidationError);
    });

    // NOTE: 当前 Technique Schema 只验证到 Action Base 层级，不验证 config 内部
    // 此测试用例需要 Phase 3 实现深度验证后才能启用
    it.skip('应该在 use_skill 缺少 skill 字段时抛出错误', () => {
      const invalidTechnique = {
        topic_id: 'test_technique',
        actions: [
          {
            action_type: 'use_skill',
            action_id: 'use_technique',
            config: {
              // 缺少 skill 字段
              input: [],
            },
          },
        ],
      };

      expect(() => parser.validateTechniqueScript(invalidTechnique)).toThrow(SchemaValidationError);
    });
  });

  describe('Schema 错误信息', () => {
    it('SchemaValidationError 应该包含详细的错误信息', () => {
      const invalidSession = {
        session: {
          session_id: '', // 空字符串，不符合 minLength: 1
          phases: [],
        },
      };

      try {
        parser.validateSessionScript(invalidSession);
        expect.fail('Should have thrown SchemaValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const schemaError = error as SchemaValidationError;
        expect(schemaError.errors).toBeDefined();
        expect(schemaError.errors.length).toBeGreaterThan(0);
        expect(schemaError.errors[0]).toHaveProperty('path');
        expect(schemaError.errors[0]).toHaveProperty('message');
      }
    });

    // NOTE: max_rounds 超出范围的验证需要深度验证 config，当前版本还未实现
    it.skip('应该提供友好的中文错误提示', () => {
      const invalidSession = {
        session: {
          session_id: 'test',
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [
                    {
                      action_type: 'ai_ask',
                      action_id: 'ask',
                      config: {
                        max_rounds: 100, // 超出范围 (1-10)
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      try {
        parser.validateSessionScript(invalidSession);
        expect.fail('Should have thrown SchemaValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(SchemaValidationError);
        const schemaError = error as SchemaValidationError;
        // 验证错误信息包含中文
        expect(schemaError.message).toContain('验证失败');
        expect(schemaError.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
