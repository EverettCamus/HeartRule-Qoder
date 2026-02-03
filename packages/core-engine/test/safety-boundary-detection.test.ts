/**
 * T6: 安全边界检测机制单元测试
 *
 * 测试 BaseAction 中的新安全检测方法：
 * - parseStructuredOutput: 解析 JSON 输出
 * - confirmSafetyViolation: 二次 LLM 确认
 * - generateSafeFallbackResponse: 安全兜底回复
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { BaseAction } from '../src/actions/base-action.js';
import type {
  ActionContext,
  ActionResult,
  StructuredActionOutput,
  SafetyConfirmationResult,
} from '../src/actions/base-action.js';

// 创建测试用的 BaseAction 子类
class TestAction extends BaseAction {
  static actionType = 'test';

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    // 使用参数以避免 TypeScript 未使用警告
    if (context && userInput !== undefined) {
      // 在测试中只需要确保参数被引用
    }
    return {
      success: true,
      completed: true,
    };
  }

  // 暴露 protected 方法用于测试
  public testParseStructuredOutput(aiMessage: string): StructuredActionOutput {
    return this.parseStructuredOutput(aiMessage);
  }

  public async testConfirmSafetyViolation(
    originalResponse: string,
    riskType: string,
    reason: string,
    llmOrchestrator?: any
  ): Promise<SafetyConfirmationResult> {
    return this.confirmSafetyViolation(originalResponse, riskType, reason, llmOrchestrator);
  }

  public testGenerateSafeFallbackResponse(): string {
    return this.generateSafeFallbackResponse();
  }
}

describe('T6: 安全边界检测机制', () => {
  let testAction: TestAction;

  beforeEach(() => {
    testAction = new TestAction('test_action', {});
  });

  describe('parseStructuredOutput: 解析 JSON 输出', () => {
    it('应该正确解析标准的 JSON 输出', () => {
      const jsonOutput = JSON.stringify({
        content: '这是咨询师的回复内容',
        safety_risk: {
          detected: false,
          risk_type: null,
          confidence: 'high',
          reason: null,
        },
        metadata: {
          emotional_tone: 'supportive',
          crisis_signal: false,
        },
      });

      const result = testAction.testParseStructuredOutput(jsonOutput);

      expect(result.content).toBe('这是咨询师的回复内容');
      expect(result.safety_risk.detected).toBe(false);
      expect(result.safety_risk.confidence).toBe('high');
      expect(result.metadata.emotional_tone).toBe('supportive');
      expect(result.metadata.crisis_signal).toBe(false);
    });

    it('应该正确解析带 Markdown 代码块标记的 JSON', () => {
      const markdownJson = `\`\`\`json
{
  "content": "测试内容",
  "safety_risk": {
    "detected": true,
    "risk_type": "diagnosis",
    "confidence": "high",
    "reason": "检测到诊断性表述"
  },
  "metadata": {
    "crisis_signal": false
  }
}
\`\`\``;

      const result = testAction.testParseStructuredOutput(markdownJson);

      expect(result.content).toBe('测试内容');
      expect(result.safety_risk.detected).toBe(true);
      expect(result.safety_risk.risk_type).toBe('diagnosis');
      expect(result.safety_risk.reason).toBe('检测到诊断性表述');
    });

    it('应该处理不完整的 JSON（缺少部分字段）', () => {
      const incompleteJson = JSON.stringify({
        content: '内容',
        safety_risk: {
          detected: true,
        },
      });

      const result = testAction.testParseStructuredOutput(incompleteJson);

      expect(result.content).toBe('内容');
      expect(result.safety_risk.detected).toBe(true);
      expect(result.safety_risk.risk_type).toBe(null);
      expect(result.safety_risk.confidence).toBe('high'); // 默认值
      expect(result.metadata.crisis_signal).toBe(false); // 默认值
    });

    it('应该处理 JSON 解析失败（兜底机制）', () => {
      const invalidJson = 'This is not valid JSON';

      const result = testAction.testParseStructuredOutput(invalidJson);

      expect(result.content).toBe(invalidJson); // 使用原始文本
      expect(result.safety_risk.detected).toBe(false);
      expect(result.safety_risk.reason).toContain('JSON parsing failed');
      expect(result.metadata.crisis_signal).toBe(false);
    });

    it('应该正确识别各种风险类型', () => {
      const riskTypes = ['diagnosis', 'prescription', 'guarantee', 'inappropriate_advice'];

      for (const riskType of riskTypes) {
        const jsonOutput = JSON.stringify({
          content: '测试内容',
          safety_risk: {
            detected: true,
            risk_type: riskType,
            confidence: 'high',
            reason: `检测到${riskType}`,
          },
          metadata: {
            crisis_signal: false,
          },
        });

        const result = testAction.testParseStructuredOutput(jsonOutput);

        expect(result.safety_risk.detected).toBe(true);
        expect(result.safety_risk.risk_type).toBe(riskType);
      }
    });

    it('应该正确识别危机信号', () => {
      const jsonOutput = JSON.stringify({
        content: '我注意到您提到了自伤想法',
        safety_risk: {
          detected: false,
          risk_type: null,
          confidence: 'high',
          reason: null,
        },
        metadata: {
          emotional_tone: 'concerned',
          crisis_signal: true,
        },
      });

      const result = testAction.testParseStructuredOutput(jsonOutput);

      expect(result.metadata.crisis_signal).toBe(true);
      expect(result.metadata.emotional_tone).toBe('concerned');
    });
  });

  describe('confirmSafetyViolation: 二次 LLM 确认', () => {
    it('应该在没有 LLM 编排器时默认确认违规（保守策略）', async () => {
      const result = await testAction.testConfirmSafetyViolation(
        '你可能患有抑郁症',
        'diagnosis',
        '检测到诊断性表述'
      );

      expect(result.violation_confirmed).toBe(true);
      expect(result.risk_level).toBe('high');
      expect(result.suggested_action).toBe('block');
      expect(result.detailed_reason).toContain('No LLM orchestrator');
    });

    it('应该正确调用 LLM 进行二次确认', async () => {
      const mockLLMOrchestrator = {
        generateText: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            violation_confirmed: true,
            risk_level: 'critical',
            detailed_reason: '明确违反了诊断禁止规范',
            suggested_action: 'block',
          }),
        }),
      };

      const result = await testAction.testConfirmSafetyViolation(
        '你患有重度抑郁症',
        'diagnosis',
        '使用了诊断性语言',
        mockLLMOrchestrator
      );

      expect(mockLLMOrchestrator.generateText).toHaveBeenCalled();
      expect(result.violation_confirmed).toBe(true);
      expect(result.risk_level).toBe('critical');
      expect(result.suggested_action).toBe('block');
      expect(result.detailed_reason).toBe('明确违反了诊断禁止规范');
    });

    it('应该处理 LLM 确认结果为否定违反', async () => {
      const mockLLMOrchestrator = {
        generateText: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            violation_confirmed: false,
            risk_level: 'low',
            detailed_reason: '回复并未进行诊断，只是陈述了常见症状',
            suggested_action: 'allow',
          }),
        }),
      };

      const result = await testAction.testConfirmSafetyViolation(
        '抑郁情绪是一种常见的心理状态',
        'diagnosis',
        '可能的诊断性表述',
        mockLLMOrchestrator
      );

      expect(result.violation_confirmed).toBe(false);
      expect(result.risk_level).toBe('low');
      expect(result.suggested_action).toBe('allow');
    });

    it('应该在 LLM 调用失败时使用保守策略', async () => {
      const mockLLMOrchestrator = {
        generateText: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
      };

      const result = await testAction.testConfirmSafetyViolation(
        '测试内容',
        'prescription',
        '检测到处方性表述',
        mockLLMOrchestrator
      );

      expect(result.violation_confirmed).toBe(true); // 保守策略：确认违规
      expect(result.risk_level).toBe('high');
      expect(result.suggested_action).toBe('block');
      expect(result.detailed_reason).toContain('Confirmation failed');
    });

    it('应该处理各种风险等级', async () => {
      const riskLevels = ['critical', 'high', 'medium', 'low'] as const;

      for (const riskLevel of riskLevels) {
        const mockLLMOrchestrator = {
          generateText: vi.fn().mockResolvedValue({
            text: JSON.stringify({
              violation_confirmed: true,
              risk_level: riskLevel,
              detailed_reason: `风险等级：${riskLevel}`,
              suggested_action: riskLevel === 'critical' || riskLevel === 'high' ? 'block' : 'warn',
            }),
          }),
        };

        const result = await testAction.testConfirmSafetyViolation(
          '测试内容',
          'guarantee',
          '测试原因',
          mockLLMOrchestrator
        );

        expect(result.risk_level).toBe(riskLevel);
      }
    });
  });

  describe('generateSafeFallbackResponse: 安全兜底回复', () => {
    it('应该生成包含免责声明的兜底回复', () => {
      const fallback = testAction.testGenerateSafeFallbackResponse();

      expect(fallback).toContain('AI 辅助工具');
      expect(fallback).toContain('不能替代');
      expect(fallback).toContain('专业心理咨询师或医生');
    });

    it('应该包含紧急联系方式', () => {
      const fallback = testAction.testGenerateSafeFallbackResponse();

      expect(fallback).toContain('400-161-9995'); // 心理危机热线
      expect(fallback).toContain('120'); // 紧急医疗
    });

    it('应该语气友好且专业', () => {
      const fallback = testAction.testGenerateSafeFallbackResponse();

      expect(fallback).toContain('抱歉');
      expect(fallback).toContain('建议');
    });
  });

  describe('集成测试：完整的安全检测流程', () => {
    it('应该完整执行安全检测流程（检测到高风险违规）', async () => {
      // 1. 主 LLM 生成包含风险检测的 JSON
      const llmOutput = JSON.stringify({
        content: '根据您的症状，您可能患有中度抑郁症',
        safety_risk: {
          detected: true,
          risk_type: 'diagnosis',
          confidence: 'high',
          reason: '使用了明确的诊断性语言',
        },
        metadata: {
          crisis_signal: false,
        },
      });

      // 2. 解析 JSON
      const parsed = testAction.testParseStructuredOutput(llmOutput);
      expect(parsed.safety_risk.detected).toBe(true);
      expect(parsed.safety_risk.confidence).toBe('high');

      // 3. 二次确认（模拟 LLM）
      const mockLLMOrchestrator = {
        generateText: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            violation_confirmed: true,
            risk_level: 'critical',
            detailed_reason: '明确违反诊断禁止规范',
            suggested_action: 'block',
          }),
        }),
      };

      const confirmation = await testAction.testConfirmSafetyViolation(
        parsed.content,
        parsed.safety_risk.risk_type!,
        parsed.safety_risk.reason!,
        mockLLMOrchestrator
      );

      expect(confirmation.violation_confirmed).toBe(true);
      expect(confirmation.risk_level).toBe('critical');

      // 4. 使用安全兜底回复
      const fallback = testAction.testGenerateSafeFallbackResponse();
      expect(fallback).toContain('专业心理咨询师');
    });

    it('应该正确处理安全检测通过的情况', async () => {
      const llmOutput = JSON.stringify({
        content: '抑郁情绪是一种常见的心理体验。我们可以一起探讨应对方法。',
        safety_risk: {
          detected: false,
          risk_type: null,
          confidence: 'high',
          reason: null,
        },
        metadata: {
          emotional_tone: 'supportive',
          crisis_signal: false,
        },
      });

      const parsed = testAction.testParseStructuredOutput(llmOutput);

      expect(parsed.safety_risk.detected).toBe(false);
      expect(parsed.content).toContain('抑郁情绪');
      // 不需要二次确认，直接返回内容
    });

    it('应该正确处理中等置信度的风险检测', () => {
      const llmOutput = JSON.stringify({
        content: '您的情况可能需要进一步评估',
        safety_risk: {
          detected: true,
          risk_type: 'diagnosis',
          confidence: 'medium', // 中等置信度
          reason: '可能暗示需要专业诊断',
        },
        metadata: {
          crisis_signal: false,
        },
      });

      const parsed = testAction.testParseStructuredOutput(llmOutput);

      expect(parsed.safety_risk.detected).toBe(true);
      expect(parsed.safety_risk.confidence).toBe('medium');
      // 设计文档说明：medium/low 置信度记录警告但不阻断
    });
  });
});
