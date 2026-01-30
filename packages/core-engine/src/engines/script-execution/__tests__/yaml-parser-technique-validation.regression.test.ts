/**
 * 回归测试：Technique 脚本验证修复
 *
 * Bug描述：
 * - yaml-parser.test.ts 中的 technique 脚本验证失败
 * - 测试用例的数据结构与实际的 technique 脚本格式不符
 * - SchemaValidator.validateTechnique 方法未正确处理 technique 脚本的顶层结构
 *
 * 根本原因：
 * 1. Technique 脚本的实际格式包含顶层的 `topic` 字段（参考 socratic_questioning.yaml）
 * 2. validateTechnique 方法直接验证 topic schema，但未处理包含 topic 字段的完整脚本
 * 3. 测试用例缺少 action config 的必填字段（content）
 *
 * 修复方案：
 * 1. 修改 SchemaValidator.validateTechnique 方法，支持提取 topic 字段进行验证
 * 2. 更新测试用例，使用正确的 technique 脚本格式（包含 topic 字段）
 * 3. 为 action config 添加必填的 content 字段
 *
 * 预期结果：
 * - Technique 脚本验证通过（包含 topic 字段的完整格式）
 * - Topic 对象验证通过（直接传入 topic 对象）
 * - Session 脚本验证通过（包含完整的 config 字段）
 */

import { describe, it, expect } from 'vitest';

import { YAMLParser } from '../yaml-parser.js';

describe('YAML Parser - Technique Validation 回归测试', () => {
  const parser = new YAMLParser();

  it('【回归】应该验证包含 topic 字段的完整 technique 脚本', () => {
    // 这是实际的 technique 脚本格式（参考 socratic_questioning.yaml）
    const techniqueScript = {
      technique_id: 'test_technique',
      technique_name: '测试技术',
      topic: {
        topic_id: 'test_topic',
        topic_name: '测试话题',
        actions: [
          {
            action_type: 'ai_ask',
            action_id: 'test_action',
            config: {
              content: 'Test question?',
            },
          },
        ],
      },
    };

    // 应该不抛出异常
    expect(() => parser.validateTechniqueScript(techniqueScript)).not.toThrow();
  });

  it('【回归】应该验证直接传入的 topic 对象（向后兼容）', () => {
    // 支持直接验证 topic 对象（向后兼容）
    const topicObject = {
      topic_id: 'test_topic',
      actions: [
        {
          action_type: 'ai_say',
          action_id: 'test_say',
          config: {
            content: 'Hello!',
          },
        },
      ],
    };

    // 应该不抛出异常
    expect(() => parser.validateTechniqueScript(topicObject)).not.toThrow();
  });

  it('【回归】应该正确验证包含完整 config 的 session 脚本', () => {
    const sessionScript = {
      session: {
        session_id: 'test_session',
        phases: [
          {
            phase_id: 'test_phase',
            topics: [
              {
                topic_id: 'test_topic',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'test_action',
                    config: {
                      content: 'Welcome message',
                      max_rounds: 1,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    // 应该不抛出异常
    expect(() => parser.validateSessionScript(sessionScript)).not.toThrow();
  });

  it('【回归】应该拒绝缺少必填字段 content 的 action', () => {
    const invalidTechnique = {
      topic: {
        topic_id: 'test_topic',
        actions: [
          {
            action_type: 'ai_ask',
            action_id: 'test_action',
            config: {
              // 缺少必填的 content 字段
              max_rounds: 3,
            },
          },
        ],
      },
    };

    // 应该抛出验证错误
    expect(() => parser.validateTechniqueScript(invalidTechnique)).toThrow(
      'Technique 脚本验证失败'
    );
  });

  it('【回归】应该拒绝没有 topic 字段且不符合 topic schema 的数据', () => {
    const invalidData = {
      // 既不包含 topic 字段，也不符合 topic schema
      some_field: 'invalid',
    };

    // 应该抛出验证错误
    expect(() => parser.validateTechniqueScript(invalidData)).toThrow('Technique 脚本验证失败');
  });
});
