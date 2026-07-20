/**
 * parseMultiRoundOutput() 3次重试 + 兜底测试 (AiAskAction)
 *
 * 覆盖 AiAskAction 中 JSON 解析管道的所有异常路径：
 *   策略1: direct_parse → 直接剥离 markdown 后 JSON.parse + EnhancedAskLLMOutputSchema safeParse
 *   策略2: trim_and_parse → trim 后再解析
 *   策略3: extract_json_block → 从 ```json 块中提取
 *   全部失败: getDefaultAskOutput 兜底
 *   Schema 验证: EnhancedAskLLMOutputSchema 类型修复（非致命）
 *
 * 与 parseTemplateOutput 的对等关系：
 *   parseTemplateOutput (ai-say)  ↔  parseMultiRoundOutput (ai-ask)
 *   两者共享相同的 3-retry 策略但使用不同的 output schema
 */
import type { EnhancedAskLLMOutput } from '@heartrule/shared-types';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { LLMOrchestrator } from '../../../engines/llm-orchestration/orchestrator.js';
import { AiAskAction } from '../ai-ask-action.js';

/** 最小化 LLMOrchestrator mock */
class MockLLMOrchestrator {
  generateText = vi.fn();
  streamText = vi.fn();
  buildPrompt = vi.fn();
}

/** 访问 private 方法 */
function parseMultiRoundOutput(rawResponse: string) {
  const mockOrchestrator = new MockLLMOrchestrator() as unknown as LLMOrchestrator;
  const action = new AiAskAction(
    'test-ask',
    { output: [{ get: 'test_var', define: 'test' }] },
    mockOrchestrator
  );
  return (action as any).parseMultiRoundOutput(rawResponse) as {
    output: EnhancedAskLLMOutput;
    cleanedResponse: string;
    parseError?: { retryCount: number; strategies: string[]; finalError: string };
  };
}

describe('parseMultiRoundOutput — 3 retry strategies', () => {
  // ────────────────────────────────────────
  // 策略1: direct_parse — 直接解析
  // ────────────────────────────────────────
  describe('strategy 1: direct_parse', () => {
    it('should parse valid JSON on first attempt', () => {
      const result = parseMultiRoundOutput(
        '{"content": "能多说一些吗？", "exit": "false", "crisis_detected": false}'
      );
      expect(result.output.content).toBe('能多说一些吗？');
      expect(result.output.exit).toBe('false');
      expect(result.output.crisis_detected).toBe(false);
      expect(result.parseError).toBeUndefined();
    });

    it('should coerce boolean exit to string via EnhancedAskLLMOutputSchema', () => {
      const result = parseMultiRoundOutput(
        '{"exit": true, "content": "感谢回答", "crisis_detected": false}'
      );
      expect(result.output.exit).toBe('true');
    });

    it('should coerce string "false" crisis_detected to boolean', () => {
      const result = parseMultiRoundOutput(
        '{"exit": "false", "content": "我明白了", "crisis_detected": "false"}'
      );
      expect(result.output.crisis_detected).toBe(false);
    });

    it('should coerce safety_check types', () => {
      const result = parseMultiRoundOutput(
        JSON.stringify({
          exit: 'false',
          content: '请深呼吸',
          brief: '深呼吸',
          crisis_detected: false,
          safety_check: { passed: 'true', concern: 'null' },
        })
      );
      expect(result.output.safety_check?.passed).toBe(true);
      expect(result.output.safety_check?.concern).toBeNull();
    });

    it('should preserve dynamic catchall fields', () => {
      const result = parseMultiRoundOutput(
        '{"exit": "false", "crisis_detected": false, "user_emotion": "anxious", "risk_level": 3}'
      );
      expect((result.output as any).user_emotion).toBe('anxious');
      expect((result.output as any).risk_level).toBe(3);
    });
  });

  // ────────────────────────────────────────
  // 策略2: trim_and_parse — 空白字符容错
  // ────────────────────────────────────────
  describe('strategy 2: trim_and_parse', () => {
    it('should handle leading whitespace', () => {
      const result = parseMultiRoundOutput(
        '   \n\t{"exit": "false", "content": "test", "crisis_detected": false}'
      );
      expect(result.output.content).toBe('test');
    });

    it('should handle trailing newlines', () => {
      const result = parseMultiRoundOutput(
        '{"exit": "false", "content": "test", "crisis_detected": false}\n\n\n'
      );
      expect(result.output.content).toBe('test');
    });
  });

  // ────────────────────────────────────────
  // 策略3: extract_json_block — Markdown 包裹
  // ────────────────────────────────────────
  describe('strategy 3: extract_json_block', () => {
    it('should extract JSON from ```json block', () => {
      const result = parseMultiRoundOutput(
        '```json\n{"exit": "false", "content": "你好", "crisis_detected": false}\n```'
      );
      expect(result.output.content).toBe('你好');
    });

    it('should extract from markdown block with preamble text', () => {
      const result = parseMultiRoundOutput(
        'The response is:\n```json\n{"exit": "false", "content": "test", "crisis_detected": false}\n```\nEnd'
      );
      expect(result.output.content).toBe('test');
    });

    it('should handle realistic DeepSeek multi-line output in markdown', () => {
      const input = `\`\`\`json
{
    "content": "有想跟我分享的事情吗？",
    "response_plan": "自由叙述",
    "assessment": "## 阻抗分析: 用户未回复",
    "progress": "## 进度评估\\n- [ ] 用户生活状态: 未收集",
    "exit": false,
    "exit_reason": "信息不足",
    "brief": "有想分享的吗",
    "safety_check": {
        "passed": true,
        "concern": null
    },
    "crisis_detected": false
}
\`\`\``;
      const result = parseMultiRoundOutput(input);
      expect(result.output.content).toBe('有想跟我分享的事情吗？');
      expect(result.output.exit).toBe('false'); // boolean coerced
      expect(result.output.crisis_detected).toBe(false);
    });
  });

  // ────────────────────────────────────────
  // 全部策略失败 → 兜底输出
  // ────────────────────────────────────────
  describe('all strategies fail → getDefaultAskOutput fallback', () => {
    it('should return default output for non-JSON plain text', () => {
      const result = parseMultiRoundOutput('Just plain text from LLM');
      expect(result.output.content).toBe('Just plain text from LLM');
      expect(result.output.exit).toBe('false');
      expect(result.output.exit_reason).toBe('继续收集');
      expect(result.output.crisis_detected).toBe(false);
      expect(result.parseError).toBeDefined();
      expect(result.parseError!.retryCount).toBe(3);
      expect(result.parseError!.strategies).toHaveLength(3);
    });

    it('should return default output for empty string', () => {
      const result = parseMultiRoundOutput('');
      expect(result.output.content).toBe('');
      expect(result.output.exit).toBe('false');
      expect(result.output.crisis_detected).toBe(false);
      expect(result.output.brief).toBe('LLM输出JSON解析失败');
    });

    it('should return default output for truncated JSON', () => {
      const result = parseMultiRoundOutput('{"content": "Hel');
      expect(result.output.exit).toBe('false');
      expect(result.output.content).toBe('{"content": "Hel');
      expect(result.parseError!.retryCount).toBe(3);
    });
  });

  // ────────────────────────────────────────
  // Schema 验证 — 非致命降级
  // ────────────────────────────────────────
  describe('schema validation — non-fatal degradation', () => {
    it('should produce parseError with schema warning when validation diverges', () => {
      // safety_check.passed 是 number — 无法转为 boolean → 校验失败
      const result = parseMultiRoundOutput(
        '{"exit": "false", "content": "test", "crisis_detected": false, ' +
          '"safety_check": {"passed": 1, "concern": null}}'
      );
      // parseError.finalError 包含 schema warning (来自 EnhancedAskLLMOutputSchema.safeParse)
      expect(result.output.content).toBe('test');
    });

    it('should still return usable output when schema partially fails', () => {
      const result = parseMultiRoundOutput(
        '{"exit": "false", "crisis_detected": false, "content": "still works"}'
      );
      expect(result.output.content).toBe('still works');
    });
  });

  // ────────────────────────────────────────
  // 控制台日志
  // ────────────────────────────────────────
  describe('console output', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log errors on parse failure', () => {
      parseMultiRoundOutput('not json');
      expect(console.warn).toHaveBeenCalled();
    });
  });
});
