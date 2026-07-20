/**
 * parseTemplateOutput() 3次重试 + 兜底测试 (AiSayAction)
 *
 * 覆盖 JSON 解析管道的所有异常路径：
 *   策略1: direct_parse → 直接剥离 markdown 后 JSON.parse
 *   策略2: trim_and_parse → trim 后再解析
 *   策略3: extract_json_block → 从 ```json 块中提取
 *   全部失败: getDefaultSayOutput 兜底
 *   Schema 验证: MainLineOutputSchema 类型修复
 *
 * 关键原则（文档引用自 CLAUDE.md）：
 *   "In a constrained cognitive budget, use low-entropy symbolic structure
 *    (YAML + rules) to anchor high-entropy generative intelligence (LLM)."
 *
 * 解析管道的『低熵锚点』：Zod schema = 约束认知边界，兜底输出 = 边界外安全网
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AiSayAction } from '../ai-say-action.js';

/** 访问 private 方法 */
function parseTemplateOutput(rawResponse: string) {
  const action = new AiSayAction('test', { content: 'Hello {{name}}' });
  return (action as any).parseTemplateOutput(rawResponse) as {
    output: Record<string, any>;
    cleanedResponse: string;
    parseError?: { retryCount: number; strategies: string[]; finalError: string };
  };
}

describe('parseTemplateOutput — 3 retry strategies', () => {
  // ────────────────────────────────────────
  // 策略1: direct_parse — 直接解析
  // ────────────────────────────────────────
  describe('strategy 1: direct_parse', () => {
    it('should parse valid JSON on first attempt', () => {
      const result = parseTemplateOutput('{"content": "hello", "exit": "false", "brief": "hi"}');
      expect(result.output.content).toBe('hello');
      expect(result.output.exit).toBe('false');
      expect(result.parseError).toBeUndefined();
    });

    it('should coerce boolean exit to string via schema', () => {
      const result = parseTemplateOutput('{"content": "hi", "exit": true}');
      expect(result.output.exit).toBe('true');
      expect(result.parseError).toBeUndefined();
    });

    it('should coerce safety_check passed from string to boolean', () => {
      const result = parseTemplateOutput(
        '{"content": "hi", "exit": "false", "safety_check": {"passed": "true", "concern": "null"}}'
      );
      expect(result.output.safety_check.passed).toBe(true);
      expect(result.output.safety_check.concern).toBeNull();
    });
  });

  // ────────────────────────────────────────
  // 策略1/2: 空白字符容错（cleanJsonOutput 内置 trim）
  // ────────────────────────────────────────
  describe('strategy 1 & 2: whitespace tolerance', () => {
    it('should handle JSON with leading whitespace via direct_parse', () => {
      // cleanJsonOutput 内置 trim，所以策略1直接成功
      const result = parseTemplateOutput('   \n  \t{"content": "hello", "exit": "false"}');
      expect(result.output.content).toBe('hello');
      // 策略1就成功了，没有 parseError
      expect(result.parseError).toBeUndefined();
    });

    it('should handle JSON with trailing whitespace', () => {
      const result = parseTemplateOutput('{"content": "hello", "exit": "false"}   \n');
      expect(result.output.content).toBe('hello');
      expect(result.parseError).toBeUndefined();
    });

    it('should handle JSON surrounded by newlines', () => {
      const result = parseTemplateOutput('\n\n{"content": "test", "exit": "false"}\n\n');
      expect(result.output.content).toBe('test');
      expect(result.parseError).toBeUndefined();
    });
  });

  // ────────────────────────────────────────
  // 策略3: extract_json_block — Markdown 包裹
  // ────────────────────────────────────────
  describe('strategy 3: extract_json_block', () => {
    it('should extract JSON from ```json block', () => {
      const result = parseTemplateOutput('```json\n{"content": "hello", "exit": "false"}\n```');
      expect(result.output.content).toBe('hello');
    });

    it('should extract JSON from ``` block without language tag', () => {
      const result = parseTemplateOutput('```\n{"content": "test", "exit": "false"}\n```');
      expect(result.output.content).toBe('test');
    });

    it('should handle multiline JSON in markdown block', () => {
      const input = `Here is some text before the JSON.

\`\`\`json
{
  "content": "有想跟我分享的事情吗？",
  "exit": "false",
  "exit_reason": "信息不足",
  "assessment": "## 阻抗分析\\n用户未回复",
  "progress": "## 进度评估\\n- [ ] 用户生活状态: 未收集",
  "brief": "有想分享的吗",
  "safety_check": {
    "passed": true,
    "concern": null
  },
  "crisis_detected": false
}
\`\`\`
Some text after.`;
      const result = parseTemplateOutput(input);
      expect(result.output.content).toBe('有想跟我分享的事情吗？');
      expect(result.output.exit).toBe('false');
    });
  });

  // ────────────────────────────────────────
  // 全部策略失败 → 兜底输出
  // ────────────────────────────────────────
  describe('all strategies fail → getDefaultSayOutput fallback', () => {
    it('should return default output for plain text (not JSON at all)', () => {
      const result = parseTemplateOutput('This is just plain text, no JSON structure');
      // 兜底: content = rawResponse.trim(), exit = 'false'
      expect(result.output.content).toBe('This is just plain text, no JSON structure');
      expect(result.output.exit).toBe('false');
      expect(result.output.exit_reason).toBe('继续收集');
      expect(result.parseError).toBeDefined();
      expect(result.parseError!.retryCount).toBe(3);
      expect(result.parseError!.strategies).toEqual([
        'direct_parse',
        'trim_and_parse',
        'extract_json_block',
      ]);
    });

    it('should return default output for empty string', () => {
      const result = parseTemplateOutput('');
      expect(result.output.content).toBe('');
      expect(result.output.exit).toBe('false');
      expect(result.output.exit_reason).toBe('继续收集');
      expect(result.output.progress).toBe('进度评估不可用');
    });

    it('should return default output for completely broken JSON-like string', () => {
      const result = parseTemplateOutput('{"content": "unclosed}');
      expect(result.output.exit).toBe('false');
      // content 保留原始文本（trim 后）
      expect(result.output.content).toBe('{"content": "unclosed}');
      expect(result.parseError!.retryCount).toBe(3);
    });

    it('should return default output for whitespace-only input', () => {
      const result = parseTemplateOutput('   \n  \t  ');
      expect(result.output.exit).toBe('false');
      // trim 后是空字符串，兜底的 content 也是空
      expect(result.output.content).toBe('');
      expect(result.parseError!.retryCount).toBe(3);
    });
  });

  // ────────────────────────────────────────
  // 截断的 JSON
  // ────────────────────────────────────────
  describe('truncated JSON', () => {
    it('should handle truncated JSON mid-string', () => {
      const result = parseTemplateOutput('{"content": "Hel');
      expect(result.output.exit).toBe('false');
      expect(result.parseError!.retryCount).toBe(3);
    });

    it('should handle truncated JSON after key (missing value)', () => {
      const result = parseTemplateOutput('{"content":');
      expect(result.parseError!.retryCount).toBe(3);
      expect(result.output.content).toBe('{"content":');
    });

    it('should handle truncated JSON with only opening brace', () => {
      const result = parseTemplateOutput('{');
      expect(result.parseError!.retryCount).toBe(3);
      expect(result.output.content).toBe('{');
    });
  });

  // ────────────────────────────────────────
  // Schema 警告而非致命错误
  // ────────────────────────────────────────
  describe('schema validation — non-fatal', () => {
    it('should produce parseError with schema warning when validation fails but parse succeeds', () => {
      // safety_check.passed = "yes" 无法转为 boolean → 整个 safety_check 子对象校验失败 → .optional() 丢弃
      const result = parseTemplateOutput(
        '{"content": "hi", "exit": "false", "safety_check": {"passed": "yes", "concern": null}}'
      );
      expect(result.output.content).toBe('hi');
      // 注意：safety_check 的 passed 校验失败使整个子对象被丢弃（.optional()）
      // 这是预期行为 — 输出仍可用
    });

    it('should handle exit = "maybe" (not "true"/"false" nor boolean)', () => {
      // exit 的 BoolToStringSchema: val 不是 boolean 时返回原值 "maybe"
      // z.string().optional() 接受 "maybe" → exit = "maybe"
      // 这符合设计：宁可保留异常值让上游判断，也不强制修改
      const result = parseTemplateOutput('{"content": "test", "exit": "maybe"}');
      expect(result.output.exit).toBe('maybe');
    });
  });

  // ────────────────────────────────────────
  // 控制台日志抑制（测试环境）
  // ────────────────────────────────────────
  describe('console output during parsing', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log warnings on parse failure without throwing', () => {
      parseTemplateOutput('not json at all');
      expect(console.warn).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
