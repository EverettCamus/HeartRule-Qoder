/**
 * Test: AI_Ask Output Type Compatibility
 *
 * Issue: LLM may output exit/safety_check fields as either:
 * - Boolean: false, true
 * - String: "false", "true", "null"
 *
 * Schema defines these as specific types:
 * - exit: z.enum(['true', 'false']) - should be string
 * - safety_check.passed: z.boolean() - should be boolean
 * - safety_check.concern: z.string().nullable() - should be null
 * - crisis_detected: z.boolean() - should be boolean
 *
 * This test validates preprocess conversion.
 */
import { EnhancedAskLLMOutputSchema } from '@heartrule/shared-types';
import { describe, it, expect } from 'vitest';

describe('EnhancedAskLLMOutputSchema - Type Compatibility', () => {
  describe('exit field', () => {
    it('should accept string "false"', () => {
      const input = {
        exit: 'false',
        exit_reason: '继续收集',
        content: '测试内容',
        brief: '测试',
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('false');
    });

    it('should accept string "true"', () => {
      const input = {
        exit: 'true',
        exit_reason: '信息已完整',
        content: '测试内容',
        brief: '测试',
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('true');
    });

    it('should convert boolean false to string "false"', () => {
      const input = {
        exit: false,
        exit_reason: '继续收集',
        content: '测试内容',
        brief: '测试',
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('false');
    });

    it('should convert boolean true to string "true"', () => {
      const input = {
        exit: true,
        exit_reason: '信息已完整',
        content: '测试内容',
        brief: '测试',
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('true');
    });
  });

  describe('safety_check field', () => {
    it('should accept correct types', () => {
      const input = {
        exit: 'false',
        safety_check: {
          passed: true,
          concern: null,
        },
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.safety_check?.passed).toBe(true);
      expect(result.safety_check?.concern).toBeNull();
    });

    it('should convert string "true" to boolean true in passed', () => {
      const input = {
        exit: 'false',
        safety_check: {
          passed: 'true',
          concern: null,
        },
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.safety_check?.passed).toBe(true);
    });

    it('should convert string "false" to boolean false in passed', () => {
      const input = {
        exit: 'false',
        safety_check: {
          passed: 'false',
          concern: '测试担忧',
        },
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.safety_check?.passed).toBe(false);
    });

    it('should convert string "null" to null in concern', () => {
      const input = {
        exit: 'false',
        safety_check: {
          passed: true,
          concern: 'null',
        },
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.safety_check?.concern).toBeNull();
    });
  });

  describe('crisis_detected field', () => {
    it('should accept boolean false', () => {
      const input = {
        exit: 'false',
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.crisis_detected).toBe(false);
    });

    it('should accept boolean true', () => {
      const input = {
        exit: 'true',
        crisis_detected: true,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.crisis_detected).toBe(true);
    });

    it('should convert string "false" to boolean false', () => {
      const input = {
        exit: 'false',
        crisis_detected: 'false',
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.crisis_detected).toBe(false);
    });

    it('should convert string "true" to boolean true', () => {
      const input = {
        exit: 'true',
        crisis_detected: 'true',
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.crisis_detected).toBe(true);
    });
  });

  describe('full LLM output scenario', () => {
    it('should handle LLM output with all correct types', () => {
      const input = {
        assessment: '## 阻抗分析: 无\n## 风险识别: 无\n## 用户理解: 正常',
        progress: '## 进度评估\n- [ ] 变量1: 未收集',
        exit: true,
        exit_reason: '信息已完整',
        content: '感谢您的回答',
        brief: '感谢回答',
        safety_check: {
          passed: true,
          concern: null,
        },
        crisis_detected: false,
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('true');
      expect(result.exit_reason).toBe('信息已完整');
      expect(result.safety_check?.passed).toBe(true);
      expect(result.safety_check?.concern).toBeNull();
      expect(result.crisis_detected).toBe(false);
    });

    it('should handle LLM output with all string types (the bug case)', () => {
      const input = {
        assessment: '## 阻抗分析: 有\n## 风险识别: 无\n## 用户理解: 正常',
        progress: '## 进度评估\n- [x] 变量1: 已收集',
        exit: 'false',
        exit_reason: '继续收集',
        content: '请提供更多信息',
        brief: '请求信息',
        safety_check: {
          passed: 'true',
          concern: 'null',
        },
        crisis_detected: 'false',
      };

      const result = EnhancedAskLLMOutputSchema.parse(input);
      expect(result.exit).toBe('false');
      expect(result.safety_check?.passed).toBe(true);
      expect(result.safety_check?.concern).toBeNull();
      expect(result.crisis_detected).toBe(false);
    });
  });
});
