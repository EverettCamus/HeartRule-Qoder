/**
 * MainLineOutputSchema 运行时校验测试
 *
 * 覆盖 Zod schema 对 LLM 类型不一致的处理：
 * - exit: boolean → string 转换
 * - safety_check.passed: string → boolean 转换
 * - safety_check.concern: 'null' → null 转换
 * - catchall 动态字段保留
 * - 缺失字段容错
 * - 错误类型容错
 */
import { describe, it, expect } from 'vitest';

import { MainLineOutputSchema } from '../ai-say-action.js';

describe('MainLineOutputSchema - Type Coercion', () => {
  // ────────────────────────────────────────
  // exit 字段：接受 boolean 和 string
  // ────────────────────────────────────────
  describe('exit field', () => {
    it('should accept string "false"', () => {
      const result = MainLineOutputSchema.parse({ exit: 'false', content: 'test' });
      expect(result.exit).toBe('false');
    });

    it('should accept string "true"', () => {
      const result = MainLineOutputSchema.parse({ exit: 'true', content: 'test' });
      expect(result.exit).toBe('true');
    });

    it('should convert boolean false to string "false"', () => {
      const result = MainLineOutputSchema.parse({ exit: false, content: 'test' });
      expect(result.exit).toBe('false');
    });

    it('should convert boolean true to string "true"', () => {
      const result = MainLineOutputSchema.parse({ exit: true, content: 'test' });
      expect(result.exit).toBe('true');
    });

    it('should handle missing exit field gracefully (optional)', () => {
      const result = MainLineOutputSchema.parse({ content: 'test' });
      expect(result.exit).toBeUndefined();
    });
  });

  // ────────────────────────────────────────
  // safety_check 字段
  // ────────────────────────────────────────
  describe('safety_check', () => {
    it('should accept correct types', () => {
      const result = MainLineOutputSchema.parse({
        content: 'test',
        exit: 'false',
        safety_check: { passed: true, concern: null },
      });
      expect(result.safety_check?.passed).toBe(true);
      expect(result.safety_check?.concern).toBeNull();
    });

    it('should convert string "true" to boolean true in passed', () => {
      const result = MainLineOutputSchema.parse({
        content: 'test',
        exit: 'false',
        safety_check: { passed: 'true', concern: null },
      });
      expect(result.safety_check?.passed).toBe(true);
    });

    it('should convert string "false" to boolean false in passed', () => {
      const result = MainLineOutputSchema.parse({
        content: 'test',
        exit: 'false',
        safety_check: { passed: 'false', concern: 'test concern' },
      });
      expect(result.safety_check?.passed).toBe(false);
    });

    it('should convert string "null" to null in concern', () => {
      const result = MainLineOutputSchema.parse({
        content: 'test',
        exit: 'false',
        safety_check: { passed: true, concern: 'null' },
      });
      expect(result.safety_check?.concern).toBeNull();
    });
  });

  // ────────────────────────────────────────
  // catchall — 动态字段保留
  // ────────────────────────────────────────
  describe('catchall — dynamic fields', () => {
    it('should preserve unknown fields via catchall', () => {
      const input = {
        exit: 'false',
        content: 'text',
        crisis_detected: false,
        user_lifestyle: 'sedentary',
        user_age: 30,
        response_plan: '自由叙述',
      };
      const result = MainLineOutputSchema.parse(input);
      expect((result as any).crisis_detected).toBe(false);
      expect((result as any).user_lifestyle).toBe('sedentary');
      expect((result as any).user_age).toBe(30);
      expect((result as any)['response_plan']).toBe('自由叙述');
    });
  });

  // ────────────────────────────────────────
  // 完整 LLM 输出场景
  // ────────────────────────────────────────
  describe('realistic LLM outputs', () => {
    it('should handle LLM output with all correct types', () => {
      const input = {
        assessment: '## 阻抗分析: 无明显阻抗\n## 风险识别: 无\n## 用户理解: 正常',
        progress: '## 进度评估\n- [ ] 变量1: 未收集',
        exit: true,
        exit_reason: '信息已完整',
        content: '明白了，感谢您的回答',
        brief: '感谢回答',
        safety_check: { passed: true, concern: null },
        crisis_detected: false,
      };
      const result = MainLineOutputSchema.parse(input);
      expect(result.exit).toBe('true');
      expect(result.content).toBe('明白了，感谢您的回答');
      expect(result.safety_check?.passed).toBe(true);
    });

    it('should handle LLM output with all string types (the bug case)', () => {
      const input = {
        assessment: '## 阻抗分析: 轻微\n## 风险识别: 无\n## 用户理解: 需引导',
        progress: '## 进度评估\n- [x] 变量1: 已收集',
        exit: 'false',
        exit_reason: '继续收集',
        content: '请提供更多信息',
        brief: '请求信息',
        safety_check: { passed: 'true', concern: 'null' },
        crisis_detected: 'false',
      };
      const result = MainLineOutputSchema.parse(input);
      expect(result.exit).toBe('false');
      expect(result.safety_check?.passed).toBe(true);
      expect(result.safety_check?.concern).toBeNull();
    });

    it('should handle minimal output (only content)', () => {
      const result = MainLineOutputSchema.parse({ content: 'minimal' });
      expect(result.content).toBe('minimal');
      expect(result.exit).toBeUndefined();
    });

    it('should handle empty object', () => {
      const result = MainLineOutputSchema.parse({});
      expect(result.content).toBeUndefined();
      expect(result.exit).toBeUndefined();
    });
  });

  // ────────────────────────────────────────
  // 容错 — safeParse 模式
  // ────────────────────────────────────────
  describe('safeParse — graceful degradation', () => {
    it('should succeed even with extra unexpected fields', () => {
      const input = {
        content: 'test',
        exit: 'false',
        nonexistent_field: 'should be preserved by catchall',
        another_extra: 42,
      };
      const result = MainLineOutputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as any).nonexistent_field).toBe('should be preserved by catchall');
      }
    });

    it('should fail safeParse when nested object has invalid types', () => {
      // safety_check.passed = 1 (number): BoolLikeSchema passes through 1,
      // z.boolean().optional() rejects non-boolean type → safety_check 校验失败
      // → 整个 MainLineOutputSchema 校验失败（即使 safety_check 是 optional）
      const input = {
        content: 'test',
        exit: 'false',
        safety_check: { passed: 1, concern: null },
      };
      const result = MainLineOutputSchema.safeParse(input);
      // Zod: optional 字段提供时若值无效，父级 schema 仍会失败
      expect(result.success).toBe(false);
    });

    it('should succeed with safety_check entirely absent', () => {
      const input = { content: 'test', exit: 'false' };
      const result = MainLineOutputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});
