/**
 * formatMemoryContext() 单元测试
 *
 * 测试 BaseAction.formatMemoryContext() 的四字段格式化逻辑
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
            opinions: [],
            observationSummary: '',
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
          opinions: [],
          observationSummary: '',
        },
      })
    );
    expect(result).toContain('## 已知事实');
    expect(result).toContain('用户报告工作压力');
    expect(result).not.toContain('## 历史经历');
    expect(result).not.toContain('## 综合观察');
  });

  it('formats all four sections when populated', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [{ content: '用户自述失眠3个月' }],
          experiences: [{ content: '第1次会谈讨论了家庭关系' }],
          opinions: [{ content: '可能有完美主义倾向', confidence: 0.75 }],
          observationSummary: '用户面对工作环境时有明显压力反应',
        },
      })
    );
    expect(result).toContain('## 已知事实');
    expect(result).toContain('用户自述失眠3个月');
    expect(result).toContain('## 历史经历');
    expect(result).toContain('第1次会谈讨论了家庭关系');
    expect(result).toContain('## 判断与推论');
    expect(result).toContain('可能有完美主义倾向');
    expect(result).toContain('置信度: 75%');
    expect(result).toContain('## 综合观察');
    expect(result).toContain('用户面对工作环境时有明显压力反应');
  });

  it('renders confidence as percentage', () => {
    const result = action.testFormatMemoryContext(
      makeContext({
        memoryContext: {
          worldFacts: [],
          experiences: [],
          opinions: [{ content: '轻度焦虑', confidence: 0.3 }],
          observationSummary: '',
        },
      })
    );
    expect(result).toContain('置信度: 30%');
  });

  it('handles null/undefined memoryContext gracefully', () => {
    expect(action.testFormatMemoryContext(makeContext({ memoryContext: null }))).toBe('');
    expect(action.testFormatMemoryContext(makeContext({ memoryContext: undefined }))).toBe('');
  });
});
