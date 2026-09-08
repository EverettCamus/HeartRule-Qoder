/**
 * formatMemoryContext() 单元测试
 *
 * 测试 BaseAction.formatMemoryContext() 的三字段格式化逻辑（ADR 005：无 opinions/observationSummary，
 * observations 为结构化数组，proofCount 作证据强度信号）
 */
import { describe, it, expect } from 'vitest';

import { BaseAction } from '../../../src/domain/actions/base-action.js';
import type { ActionContext, ActionResult } from '../../../src/domain/actions/base-action.js';

class TestAction extends BaseAction {
  async execute(_context: ActionContext): Promise<ActionResult> {
    return { success: true, completed: true };
  }

  public testFormatMemoryContext(context: ActionContext): string {
    return this.formatMemoryContext(context);
  }
}

function makeContext(metadata: Record<string, any>): ActionContext {
  return {
    sessionId: 'test',
    phaseId: 'p1',
    topicId: 't1',
    actionId: 'a1',
    variables: {},
    conversationHistory: [],
    metadata,
  };
}

describe('BaseAction.formatMemoryContext', () => {
  const action = new TestAction('a1', {});

  it('returns empty string when metadata has no memoryContext', () => {
    expect(action.testFormatMemoryContext(makeContext({}))).toBe('');
  });

  it('returns empty string when all memoryContext fields are empty', () => {
    expect(
      action.testFormatMemoryContext(
        makeContext({
          memoryContext: {
            worldFacts: [],
            experiences: [],
            observations: [],
          },
        })
      )
    ).toBe('');
  });

  it('formats worldFacts only', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [{ content: '用户报告工作压力' }],
          experiences: [],
          observations: [],
        },
      })
    );
    expect(result).toContain('## 已知事实');
    expect(result).toContain('用户报告工作压力');
    expect(result).not.toContain('## 历史经历');
    expect(result).not.toContain('## 综合观察');
  });

  it('formats all three sections when populated', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [{ content: '用户自述失眠3个月' }],
          experiences: [{ content: '第1次会谈讨论了家庭关系' }],
          observations: [
            { content: '可能有完美主义倾向' },
            { content: '用户面对工作环境时有明显压力反应' },
          ],
        },
      })
    );
    expect(result).toContain('## 已知事实');
    expect(result).toContain('用户自述失眠3个月');
    expect(result).toContain('## 历史经历');
    expect(result).toContain('第1次会谈讨论了家庭关系');
    expect(result).toContain('## 综合观察');
    expect(result).toContain('可能有完美主义倾向');
    expect(result).toContain('用户面对工作环境时有明显压力反应');
  });

  it('annotates proofCount as evidence strength (ADR 005 决策 3)', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [],
          experiences: [],
          observations: [{ content: '轻度焦虑', proofCount: 3 }, { content: '无证据支撑的猜测' }],
        },
      })
    );
    expect(result).toContain('轻度焦虑（支撑证据 3 条）');
    expect(result).not.toContain('支撑证据 0 条');
  });

  it('annotates source channel/credibility/time on entries (决策 4)', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [
            {
              content: 'PHQ-9 得分：15',
              sourceChannel: 'scale',
              sourceCredibility: 'high',
              occurredStart: '2026-01-15',
            },
          ],
          experiences: [
            {
              content: '第1次会谈讨论家庭关系',
              sourceChannel: 'dialogue',
              sourceCredibility: 'medium',
            },
          ],
          observations: [],
        },
      })
    );
    // worldFacts：来源/可信度/时间标注
    expect(result).toContain('来源: 量表 · 可信度: 高 · 2026-01-15');
    expect(result).toContain('PHQ-9 得分：15');
    // experiences：来源/可信度标注
    expect(result).toContain('来源: 对话 · 可信度: 中');
    expect(result).toContain('第1次会谈讨论家庭关系');
  });

  it('keeps content bare when entry has no source annotations', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [{ content: '用户报告工作压力' }],
          experiences: [],
          observations: [],
        },
      })
    );
    expect(result).toContain('- 用户报告工作压力');
    expect(result).not.toContain('（');
  });

  it('handles null/undefined memoryContext gracefully', () => {
    expect(action.testFormatMemoryContext(makeContext({ memoryContext: null }))).toBe('');
    expect(action.testFormatMemoryContext(makeContext({ memoryContext: undefined }))).toBe('');
  });
});
