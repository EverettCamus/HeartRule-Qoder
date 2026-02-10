/**
 * SchemaValidator 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { SchemaValidator } from '../schema-validator.js';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('validateSession', () => {
    it('应该验证通过完整正确的 Session 脚本', () => {
      const validSession = {
        session: {
          session_id: 'test_session_001',
          session_name: '测试会话',
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
                        content: '你好！',
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const result = validator.validateSession(validSession);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该验证失败：缺少 session_id', () => {
      const invalidSession = {
        session: {
          phases: [
            {
              phase_id: 'phase_1',
              topics: [
                {
                  topic_id: 'topic_1',
                  actions: [],
                },
              ],
            },
          ],
        },
      };

      const result = validator.validateSession(invalidSession);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errorType).toBe('REQUIRED_FIELD_MISSING');
      expect(result.errors[0].message).toContain('session_id');
    });

    it('应该验证失败：session_id 包含非法字符', () => {
      const invalidSession = {
        session: {
          session_id: 'test-session-001', // 不允许破折号
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
                      config: { content: 'hello' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const result = validator.validateSession(invalidSession);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('应该验证失败：phases 为空数组', () => {
      const invalidSession = {
        session: {
          session_id: 'test_session',
          phases: [],
        },
      };

      const result = validator.validateSession(invalidSession);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errorType).toBe('CONSTRAINT_VIOLATION');
    });
  });

  describe('validateAction', () => {
    it('应该验证通过正确的 ai_ask Action', () => {
      const validAction = {
        action_type: 'ai_ask',
        action_id: 'ask_name',
        config: {
          content: '请问您的名字是？',
          max_rounds: 3,
        },
      };

      const result = validator.validateAction(validAction, 'ai_ask');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该验证失败：ai_ask 缺少必填字段 content', () => {
      const invalidAction = {
        action_type: 'ai_ask',
        action_id: 'ask_name',
        config: {
          max_rounds: 3,
        },
      };

      const result = validator.validateAction(invalidAction, 'ai_ask');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('content');
    });

    it('应该验证失败：max_rounds 超出范围', () => {
      const invalidAction = {
        action_type: 'ai_ask',
        action_id: 'ask_age',
        config: {
          content: '请问年龄？',
          max_rounds: 15, // 超过最大值 10
        },
      };

      const result = validator.validateAction(invalidAction, 'ai_ask');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errorType).toBe('CONSTRAINT_VIOLATION');
    });

    it('应该验证失败：action_type 枚举值错误', () => {
      const invalidAction = {
        action_type: 'ai_chat', // 不存在的类型
        action_id: 'chat_1',
      };

      const result = validator.validateAction(invalidAction, 'ai_chat');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].errorType).toBe('ENUM_VALUE_INVALID');
    });

    it('应该验证通过正确的 ai_say Action', () => {
      const validAction = {
        action_type: 'ai_say',
        action_id: 'say_hello',
        config: {
          content: '欢迎来到心理咨询',
          tone: 'friendly',
        },
      };

      const result = validator.validateAction(validAction, 'ai_say');
      expect(result.valid).toBe(true);
    });

    it('应该验证通过正确的 ai_think Action', () => {
      const validAction = {
        action_type: 'ai_think',
        action_id: 'analyze_mood',
        config: {
          content: '分析用户的情绪状态',
          output: [{ get: 'mood_analysis', define: '情绪分析结果' }],
        },
      };

      const result = validator.validateAction(validAction, 'ai_think');
      expect(result.valid).toBe(true);
    });

    it('应该验证通过正确的 use_skill Action', () => {
      const validAction = {
        action_type: 'use_skill',
        action_id: 'use_cbt',
        config: {
          skill: 'cognitive_restructuring',
          input: [{ set: 'negative_thought', value: '我一无是处' }],
          output: [{ get: 'restructured_thought' }],
        },
      };

      const result = validator.validateAction(validAction, 'use_skill');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateYAML', () => {
    it('应该验证通过正确的 YAML 字符串', () => {
      const yamlContent = `
session:
  session_id: test_session
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_type: ai_say
              action_id: say_1
              config:
                content: "Hello"
`;

      const result = validator.validateYAML(yamlContent);
      expect(result.valid).toBe(true);
    });

    it('应该验证失败：YAML 语法错误', () => {
      const invalidYaml = `
session:
  session_id: test
  phases:
    - phase_id: phase_1
      topics: [unclosed array
`;

      const result = validator.validateYAML(invalidYaml);
      expect(result.valid).toBe(false);
      expect(result.errors[0].errorType).toBe('SYNTAX_ERROR');
      expect(result.errors[0].message).toContain('YAML 语法错误');
    });

    it('应该验证失败：无法识别的脚本类型', () => {
      const unknownYaml = `
unknown_type:
  id: test
`;

      const result = validator.validateYAML(unknownYaml);
      expect(result.valid).toBe(false);
      expect(result.errors[0].errorType).toBe('STRUCTURE_ERROR');
      expect(result.errors[0].message).toContain('无法识别的脚本类型');
    });
  });

  describe('validateTechnique', () => {
    it('应该验证通过正确的 Technique 脚本', () => {
      const validTechnique = {
        topic_id: 'socratic_questioning',
        actions: [
          {
            action_type: 'ai_ask',
            action_id: 'ask_evidence',
            config: {
              content: '有什么证据支持这个想法？',
            },
          },
        ],
      };

      const result = validator.validateTechnique(validTechnique);
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePartial', () => {
    it('应该验证通过单个 Topic', () => {
      const validTopic = {
        topic_id: 'topic_1',
        actions: [
          {
            action_type: 'ai_say',
            action_id: 'say_1',
            config: {
              content: 'Test',
            },
          },
        ],
      };

      const result = validator.validatePartial(validTopic, 'topic');
      expect(result.valid).toBe(true);
    });

    it('应该验证失败：Topic 缺少 actions', () => {
      const invalidTopic = {
        topic_id: 'topic_1',
      };

      const result = validator.validatePartial(invalidTopic, 'topic');
      expect(result.valid).toBe(false);
      expect(result.errors[0].errorType).toBe('REQUIRED_FIELD_MISSING');
    });
  });
});
