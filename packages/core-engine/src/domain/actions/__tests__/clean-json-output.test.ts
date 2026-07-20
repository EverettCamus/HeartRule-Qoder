/**
 * cleanJsonOutput() 单元测试
 *
 * 覆盖 BaseAction.cleanJsonOutput() 在各类异常输入下的行为。
 * 该方法是 JSON 解析管道的第一道防线，负责剥离 LLM 输出中的
 * Markdown 代码块标记。
 */
import { describe, it, expect } from 'vitest';

import { AiSayAction } from '../ai-say-action.js';

/**
 * 创建最小化 AiSayAction 实例用于测试 protected 方法
 */
function createAction(config: Record<string, any> = {}): AiSayAction {
  return new AiSayAction('test-action', {
    content: '测试内容 {{variable}}',
    prompt: '默认提示词',
    ...config,
  });
}

/** 访问 protected 方法 */
function cleanJsonOutput(text: string): string {
  const action = createAction();
  return (action as any).cleanJsonOutput(text);
}

describe('cleanJsonOutput', () => {
  // ────────────────────────────────────────
  // 正常输入
  // ────────────────────────────────────────
  describe('normal JSON', () => {
    it('should leave plain JSON unchanged', () => {
      const input = '{"content": "hello", "exit": "false"}';
      expect(cleanJsonOutput(input)).toBe(input);
    });

    it('should trim leading/trailing whitespace', () => {
      const input = '  {"content": "hi"}  ';
      // cleanJsonOutput 内部先 trim，再处理 markdown
      expect(cleanJsonOutput(input)).toBe('{"content": "hi"}');
    });
  });

  // ────────────────────────────────────────
  // Markdown 代码块 — 带语言标记
  // ────────────────────────────────────────
  describe('markdown ```json fence', () => {
    it('should strip ```json ... ``` wrapper', () => {
      const input = '```json\n{"content": "hello"}\n```';
      expect(cleanJsonOutput(input)).toBe('{"content": "hello"}');
    });

    it('should strip ```json wrapper without trailing newline', () => {
      const input = '```json\n{"content": "hello"}```';
      expect(cleanJsonOutput(input)).toBe('{"content": "hello"}');
    });

    it('should handle JSON on same line as opening fence', () => {
      const input = '```json\n{"content": "hello"}\n```';
      expect(cleanJsonOutput(input)).toBe('{"content": "hello"}');
    });

    it('should handle multiline JSON inside ```json', () => {
      const input =
        '```json\n{\n  "content": "line1",\n  "exit": "false",\n  "safety_check": {\n    "passed": true,\n    "concern": null\n  }\n}\n```';
      const result = cleanJsonOutput(input);
      expect(result).toContain('"content": "line1"');
      expect(result).toContain('"passed": true');
      expect(result).not.toContain('```');
    });
  });

  // ────────────────────────────────────────
  // Markdown 代码块 — 无语言标记
  // ────────────────────────────────────────
  describe('markdown ``` fence (no language)', () => {
    it('should strip ``` ... ``` wrapper without language tag', () => {
      const input = '```\n{"content": "hello"}\n```';
      expect(cleanJsonOutput(input)).toBe('{"content": "hello"}');
    });

    it('should strip ``` wrapper without trailing newline', () => {
      const input = '```\n{"content": "hello"}```';
      expect(cleanJsonOutput(input)).toBe('{"content": "hello"}');
    });
  });

  // ────────────────────────────────────────
  // 异常场景
  // ────────────────────────────────────────
  describe('edge cases', () => {
    it('should return empty string unchanged', () => {
      expect(cleanJsonOutput('')).toBe('');
    });

    it('should handle whitespace-only input', () => {
      // cleanJsonOutput 会先 trim，所以纯空白会变成空字符串
      expect(cleanJsonOutput('   \n  \t  ')).toBe('');
    });

    it('should not strip inline ``` that is not a fence (partial match)', () => {
      const input = '{"code": "some ``` code example"}';
      expect(cleanJsonOutput(input)).toBe(input);
    });

    it('should handle only opening ```json without closing ```', () => {
      // cleanJsonOutput trim 后 startsWith '```json' → 执行 replace
      // 只有开始的 ```json 会被移除，内容保留
      const input = '```json\n{"content": "unclosed"}';
      const result = cleanJsonOutput(input);
      expect(result).not.toContain('```json');
      expect(result).toContain('"content"');
    });

    it('should handle only opening ``` without closing ```', () => {
      // cleanJsonOutput trim 后 startsWith '```'（但不是 '```json'）
      // → 走 else if 分支 → 执行 replace
      const input = '```\n{"content": "unclosed"}';
      const result = cleanJsonOutput(input);
      expect(result).not.toContain('```');
      expect(result).toContain('"content"');
    });

    it('should NOT extract JSON when text precedes ```json block', () => {
      // cleanJsonOutput 先 trim，但 "Here is the JSON:" 不是空白，不会被 trim 掉
      // 因此 startsWith('```json') = false → markdown 标记不会被剥离
      // 这是预期行为 — 提取带前导文本的 JSON 是 extract_json_block 策略的职责
      const input = 'Here is the JSON:\n```json\n{"a": 1}\n```';
      const result = cleanJsonOutput(input);
      expect(result).toContain('Here is the JSON:');
      expect(result).toContain('{"a": 1}');
      expect(result).toContain('```');
    });

    it('should NOT extract JSON when text follows ```json block', () => {
      // cleanJsonOutput trim 后 startsWith('```json') = true
      // replace 会移除 ```json 开头和 ``` 结尾，但保留中间内容和尾随文本
      const input = '```json\n{"a": 1}\n```\nSome extra text';
      const result = cleanJsonOutput(input);
      // 开头的 ```json 和结尾的 ``` 被移除，中间的 JSON 和尾随文本保留
      expect(result).toContain('{"a": 1}');
      expect(result).toContain('Some extra text');
    });
  });

  // ────────────────────────────────────────
  // 真实 LLM 输出模式
  // ────────────────────────────────────────
  describe('realistic LLM output patterns', () => {
    it('should handle DeepSeek multi-line JSON with markdown wrapping', () => {
      const input = `\`\`\`json
{
    "content": "有想跟我分享的事情吗？",
    "exit": "false",
    "exit_reason": "信息不足",
    "assessment": "## 阻抗分析: 用户未回复",
    "progress": "## 进度评估\\n- [ ] 用户生活状态: 未收集",
    "brief": "有想分享的吗",
    "safety_check": {
        "passed": true,
        "concern": null
    },
    "crisis_detected": false
}
\`\`\``;
      const result = cleanJsonOutput(input);
      expect(result).not.toContain('```');
      expect(() => JSON.parse(result)).not.toThrow();
      const parsed = JSON.parse(result);
      expect(parsed.content).toBe('有想跟我分享的事情吗？');
    });

    it('should handle response with no markdown wrapping (LLM outputs raw JSON)', () => {
      const input = `{"content": "你好", "exit": "false", "crisis_detected": false}`;
      const result = cleanJsonOutput(input);
      expect(result).toBe(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});
