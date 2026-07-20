/**
 * BaseLLMProvider JSON 强制输出 + 回退逻辑测试
 *
 * 覆盖 orchestrator.ts 中 generateObject ↔ generateText 的切换逻辑：
 *   1. responseFormat: { type: 'json_object' } → 调用 generateObject
 *   2. generateObject 成功 → metrics.jsonEnforceSuccess++
 *   3. generateObject 失败 → 回退 generateText → metrics.jsonEnforceFallback++
 *   4. 无 responseFormat → 直接 generateText → metrics.regularCalls++
 *   5. metrics 计数器准确性
 *
 * 背景（见 CLAUDE.md 设计哲学）：
 *   "Cognitive Anchoring — Low-entropy symbols (YAML) anchor high-entropy LLM"
 *   本测试验证 JSON 输出的『低熵锚点』—— API 级别的 response_format 强制执行。
 */
import type { LanguageModel } from 'ai';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { LLMConfig } from '../../../application/ports/outbound/llm-provider.port.js';
import { BaseLLMProvider } from '../orchestrator.js';

// ────────────────────────────────────────
// Mock ai package
// ────────────────────────────────────────
const mockGenerateObject = vi.fn();
const mockGenerateText = vi.fn();

vi.mock('ai', () => ({
  generateObject: (...args: any[]) => mockGenerateObject(...args),
  generateText: (...args: any[]) => mockGenerateText(...args),
  streamText: vi.fn(),
}));

// ────────────────────────────────────────
// 具体 Provider 子类（用于测试）
// ────────────────────────────────────────
class TestProvider extends BaseLLMProvider {
  constructor(config?: Partial<LLMConfig>) {
    super(config as LLMConfig);
  }

  getModel(_modelName?: string): LanguageModel {
    return { provider: 'test', modelId: 'test-model' } as unknown as LanguageModel;
  }

  /** 暴露 metrics 用于断言 */
  exposeMetrics() {
    return this.getMetrics();
  }
}

// ────────────────────────────────────────
// 辅助函数
// ────────────────────────────────────────
function createProvider(config?: Partial<LLMConfig>): TestProvider {
  return new TestProvider({
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    model: 'test-model',
    ...config,
  });
}

function makeGenerateObjectResult(object: Record<string, any>) {
  return {
    object,
    finishReason: 'stop' as const,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    request: {
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'test' }] }),
    },
    response: { id: 'resp-1', timestamp: new Date(), modelId: 'test-model', headers: {} },
  };
}

function makeGenerateTextResult(text: string) {
  return {
    text,
    finishReason: 'stop' as const,
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    request: {
      body: JSON.stringify({ model: 'test', messages: [{ role: 'user', content: 'test' }] }),
    },
    response: { id: 'resp-1', timestamp: new Date(), modelId: 'test-model', headers: {} },
  };
}

describe('BaseLLMProvider — JSON enforcement & fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────
  // 路径选择
  // ────────────────────────────────────────
  describe('routing', () => {
    it('should call generateObject when responseFormat is json_object', async () => {
      mockGenerateObject.mockResolvedValueOnce(
        makeGenerateObjectResult({ content: 'hello', exit: 'false' })
      );

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      await provider.generateText('test prompt');

      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('should call generateText when responseFormat is NOT set', async () => {
      mockGenerateText.mockResolvedValueOnce(makeGenerateTextResult('{"content": "hello"}'));

      const provider = createProvider();
      await provider.generateText('test prompt');

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(mockGenerateObject).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────
  // 回退逻辑
  // ────────────────────────────────────────
  describe('fallback on generateObject failure', () => {
    it('should fall back to generateText when generateObject throws', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('NoObjectGeneratedError'));
      mockGenerateText.mockResolvedValueOnce(
        makeGenerateTextResult('{"content": "fallback text", "exit": "false"}')
      );

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      const result = await provider.generateText('test prompt');

      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(result.text).toBe('{"content": "fallback text", "exit": "false"}');
    });

    it('should propagate error if both generateObject AND generateText fail', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('NoObjectGeneratedError'));
      mockGenerateText.mockRejectedValueOnce(new Error('Network error'));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });

      await expect(provider.generateText('test prompt')).rejects.toThrow('Network error');
      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────
  // Metrics 计数器
  // ────────────────────────────────────────
  describe('metrics counters', () => {
    it('should count successful JSON enforcement calls', async () => {
      mockGenerateObject.mockResolvedValueOnce(
        makeGenerateObjectResult({ content: 'hi', exit: 'false' })
      );

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      await provider.generateText('prompt 1');

      const metrics = provider.exposeMetrics();
      expect(metrics.jsonEnforceCalls).toBe(1);
      expect(metrics.jsonEnforceSuccess).toBe(1);
      expect(metrics.jsonEnforceFallback).toBe(0);
      expect(metrics.regularCalls).toBe(0);
    });

    it('should count fallback calls', async () => {
      mockGenerateObject.mockRejectedValueOnce(new Error('fail'));
      mockGenerateText.mockResolvedValueOnce(makeGenerateTextResult('fallback'));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      await provider.generateText('prompt 1');

      const metrics = provider.exposeMetrics();
      expect(metrics.jsonEnforceCalls).toBe(1);
      expect(metrics.jsonEnforceSuccess).toBe(0);
      expect(metrics.jsonEnforceFallback).toBe(1);
      expect(metrics.regularCalls).toBe(0);
    });

    it('should count regular (non-JSON) calls', async () => {
      mockGenerateText.mockResolvedValue(makeGenerateTextResult('plain text'));

      const provider = createProvider();
      await provider.generateText('p1');
      await provider.generateText('p2');
      await provider.generateText('p3');

      const metrics = provider.exposeMetrics();
      expect(metrics.jsonEnforceCalls).toBe(0);
      expect(metrics.regularCalls).toBe(3);
    });

    it('should track mixed calls correctly', async () => {
      // 2 JSON enforce (1 success, 1 fallback) + 2 regular
      mockGenerateObject
        .mockResolvedValueOnce(makeGenerateObjectResult({ a: 1 }))
        .mockRejectedValueOnce(new Error('fail'));
      mockGenerateText
        .mockResolvedValueOnce(makeGenerateTextResult('fallback'))
        .mockResolvedValueOnce(makeGenerateTextResult('plain 1'))
        .mockResolvedValueOnce(makeGenerateTextResult('plain 2'));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });

      // JSON enforce — success
      await provider.generateText('json prompt 1');
      // JSON enforce — fallback
      await provider.generateText('json prompt 2');
      // Regular calls
      const plainProvider = createProvider();
      await plainProvider.generateText('plain prompt 1');
      await plainProvider.generateText('plain prompt 2');

      const jsonMetrics = provider.exposeMetrics();
      expect(jsonMetrics.jsonEnforceCalls).toBe(2);
      expect(jsonMetrics.jsonEnforceSuccess).toBe(1);
      expect(jsonMetrics.jsonEnforceFallback).toBe(1);
      expect(jsonMetrics.regularCalls).toBe(0);

      const plainMetrics = plainProvider.exposeMetrics();
      expect(plainMetrics.jsonEnforceCalls).toBe(0);
      expect(plainMetrics.regularCalls).toBe(2);
    });
  });

  // ────────────────────────────────────────
  // 返回值正确性
  // ────────────────────────────────────────
  describe('return value correctness', () => {
    it('should return stringified JSON from generateObject result', async () => {
      const obj = { content: '你好世界', exit: 'false', brief: '你好' };
      mockGenerateObject.mockResolvedValueOnce(makeGenerateObjectResult(obj));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      const result = await provider.generateText('prompt');

      // 应该返回序列化的 JSON 字符串
      expect(typeof result.text).toBe('string');
      const parsed = JSON.parse(result.text);
      expect(parsed.content).toBe('你好世界');
      expect(parsed.exit).toBe('false');
    });

    it('should include debugInfo with correct structure', async () => {
      mockGenerateObject.mockResolvedValueOnce(makeGenerateObjectResult({ content: 'hello' }));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      const result = await provider.generateText('test prompt');

      expect(result.debugInfo).toBeDefined();
      expect(result.debugInfo.model).toBe('test-model');
      expect(result.debugInfo.tokensUsed).toBe(150);
      expect(result.debugInfo.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.debugInfo.timestamp).toBe('string');
    });
  });

  // ────────────────────────────────────────
  // logMetrics 输出
  // ────────────────────────────────────────
  describe('logMetrics', () => {
    it('should not log when no JSON enforce calls have been made', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const provider = createProvider();

      provider.logMetrics();

      // metrics.jsonEnforceCalls === 0, 所以 logMetrics 直接 return
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should log metrics after JSON enforce calls', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockGenerateObject.mockResolvedValueOnce(makeGenerateObjectResult({ content: 'hello' }));

      const provider = createProvider({ responseFormat: { type: 'json_object' } });
      await provider.generateText('prompt');

      provider.logMetrics();
      expect(warnSpy).toHaveBeenCalled();
      const logCall = warnSpy.mock.calls.find((call) =>
        (call[0] as string).startsWith('[LLM Metrics]')
      );
      expect(logCall).toBeDefined();
      expect(logCall![0]).toContain('success (100.0%)');
      warnSpy.mockRestore();
    });
  });
});
