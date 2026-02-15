/**
 * SchemaPromptGenerator 单元测试
 */

import { describe, expect, it } from 'vitest';

import { SchemaPromptGenerator } from '../validators/schema-prompt-generator.js';

describe('SchemaPromptGenerator', () => {
  const generator = new SchemaPromptGenerator();

  describe('generatePrompt', () => {
    it('应该生成ai-ask-config的完整约束', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('YAML脚本格式约束');
      expect(prompt).toContain('ai_ask动作配置');
      expect(prompt).toContain('必填字段');
      expect(prompt).toContain('content');
      expect(prompt).toContain('可选字段');
      expect(prompt).toContain('tone');
      expect(prompt).toContain('exit');
      expect(prompt).toContain('output');
      expect(prompt).toContain('max_rounds');
    });

    it('应该生成ai-say-config的完整约束', () => {
      const prompt = generator.generatePrompt('ai-say-config');

      expect(prompt).toContain('ai_say动作配置');
      expect(prompt).toContain('必填字段');
      expect(prompt).toContain('content');
      expect(prompt).toContain('可选字段');
      expect(prompt).toContain('tone');
      expect(prompt).toContain('max_rounds');
    });

    it('应该生成ai-think-config的完整约束', () => {
      const prompt = generator.generatePrompt('ai-think-config');

      expect(prompt).toContain('ai_think动作配置');
      expect(prompt).toContain('必填字段');
      expect(prompt).toContain('content');
      expect(prompt).toContain('可选字段');
      expect(prompt).toContain('output');
    });

    it('应该包含数值范围约束', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('max_rounds');
      expect(prompt).toContain('范围1-10');
    });

    it('应该包含废弃字段警告（ai-ask-config）', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('禁止使用的废弃字段');
      expect(prompt).toContain('question_template');
      expect(prompt).toContain('target_variable');
      expect(prompt).toContain('extraction_prompt');
      expect(prompt).toContain('required');
    });

    it('应该包含废弃字段警告（ai-say-config）', () => {
      const prompt = generator.generatePrompt('ai-say-config');

      expect(prompt).toContain('禁止使用的废弃字段');
      expect(prompt).toContain('content_template');
    });

    it('应该包含废弃字段警告（ai-think-config）', () => {
      const prompt = generator.generatePrompt('ai-think-config');

      expect(prompt).toContain('禁止使用的废弃字段');
      expect(prompt).toContain('prompt_template');
    });

    it('应该包含示例代码', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('示例：');
      expect(prompt).toContain('config:');
      expect(prompt).toContain('content:');
    });
  });

  describe('generateActionConfigPrompt', () => {
    it('应该根据action_type生成对应的Prompt', () => {
      const prompt = generator.generateActionConfigPrompt('ai_ask');

      expect(prompt).toContain('ai_ask动作配置');
      expect(prompt).toContain('content');
    });

    it('应该处理ai_say类型', () => {
      const prompt = generator.generateActionConfigPrompt('ai_say');

      expect(prompt).toContain('ai_say动作配置');
    });

    it('应该处理ai_think类型', () => {
      const prompt = generator.generateActionConfigPrompt('ai_think');

      expect(prompt).toContain('ai_think动作配置');
    });

    it('应该处理未知的action类型', () => {
      const prompt = generator.generateActionConfigPrompt('unknown_type');

      expect(prompt).toContain('未知的Action类型');
    });
  });

  describe('generateFullSessionPrompt', () => {
    it('应该生成完整Session脚本约束', () => {
      const prompt = generator.generateFullSessionPrompt();

      expect(prompt).toContain('完整Session脚本');
      expect(prompt).toContain('session:');
      expect(prompt).toContain('session_id');
      expect(prompt).toContain('phases');
      expect(prompt).toContain('topics');
      expect(prompt).toContain('actions');
    });

    it('应该包含所有Action类型的约束', () => {
      const prompt = generator.generateFullSessionPrompt();

      expect(prompt).toContain('=== ai_ask ===');
      expect(prompt).toContain('=== ai_say ===');
      expect(prompt).toContain('=== ai_think ===');
    });

    it('应该包含action_type枚举值说明', () => {
      const prompt = generator.generateFullSessionPrompt();

      expect(prompt).toContain('action_type');
      expect(prompt).toContain('ai_say/ai_ask/ai_think/use_skill');
    });
  });

  describe('Prompt内容质量', () => {
    it('生成的Prompt应该易于LLM理解', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      // 检查是否使用了清晰的结构标识
      expect(prompt).toMatch(/必填字段：/);
      expect(prompt).toMatch(/可选字段：/);
      expect(prompt).toMatch(/禁止使用的废弃字段：/);
      expect(prompt).toMatch(/示例：/);
    });

    it('废弃字段说明应该包含替代方案', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('target_variable');
      expect(prompt).toContain('output');
    });

    it('应该包含字段类型信息', () => {
      const prompt = generator.generatePrompt('ai-ask-config');

      expect(prompt).toContain('(string)');
      expect(prompt).toContain('(number)');
      expect(prompt).toContain('(array)');
    });
  });

  describe('性能测试', () => {
    it('生成Prompt应该在50ms内完成', () => {
      const startTime = Date.now();
      generator.generatePrompt('ai-ask-config');
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50);
    });

    it('生成完整Session Prompt应该在100ms内完成', () => {
      const startTime = Date.now();
      generator.generateFullSessionPrompt();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100);
    });
  });
});
