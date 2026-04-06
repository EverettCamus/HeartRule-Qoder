/**
 * 多轮对话智能终止判断测试
 *
 * 测试目标：
 * - BaseAction.evaluateExitCondition 的四级优先级判定
 * - AiSayAction 和 AiAskAction 的退出决策集成
 * - ExecutionState.metadata 的退出历史记录
 *
 * 设计原则：
 * - 代码层只处理硬性条件（max_rounds）
 * - 语义理解（阻抗、偏题、理解度）由 LLM 的 exit 字段决定
 */

import type { VariableStore } from '@heartrule/shared-types';
import { describe, it, expect, beforeEach } from 'vitest';

import { BaseAction } from '../../src/domain/actions/base-action.js';
import type { ActionContext, ActionResult } from '../../src/domain/actions/base-action.js';
import { VariableScopeResolver } from '../../src/engines/variable-scope/variable-scope-resolver.js';

// 创建测试用的 Action 子类
class TestInteractiveAction extends BaseAction {
  static actionType = 'test_interactive';

  constructor(actionId: string, config: Record<string, any>) {
    super(actionId, config);
    this.exitPolicy = {
      supportsExit: true,
      enabledSources: ['max_rounds', 'exit_flag', 'exit_criteria', 'llm_suggestion'],
    };
  }

  async execute(context: ActionContext, _userInput?: string | null): Promise<ActionResult> {
    this.currentRound++;

    const llmOutput = {
      exit: 'false',
      response: 'Test response',
    };

    const exitDecision = this.evaluateExitCondition(context, llmOutput);

    return {
      success: true,
      completed: exitDecision.should_exit,
      aiMessage: llmOutput.response,
      metadata: {
        actionType: TestInteractiveAction.actionType,
        currentRound: this.currentRound,
        maxRounds: this.maxRounds,
        exitDecision,
      },
    };
  }
}

class TestNonInteractiveAction extends BaseAction {
  static actionType = 'test_non_interactive';

  async execute(_context: ActionContext, _userInput?: string | null): Promise<ActionResult> {
    return {
      success: true,
      completed: true,
      aiMessage: 'Non-interactive action',
    };
  }
}

describe('多轮对话智能终止判断', () => {
  let variableStore: VariableStore;
  let scopeResolver: VariableScopeResolver;
  let context: ActionContext;

  beforeEach(() => {
    variableStore = {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };
    scopeResolver = new VariableScopeResolver(variableStore);
    context = {
      sessionId: 'test_session',
      phaseId: 'phase_1',
      topicId: 'topic_1',
      actionId: 'action_1',
      variables: {},
      variableStore,
      scopeResolver,
      conversationHistory: [],
      metadata: {},
    };
  });

  describe('1. BaseAction.evaluateExitCondition 四级优先级测试', () => {
    it('优先级1: 应该在达到最大轮次时强制退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 3,
      });
      action.currentRound = 3;

      const llmOutput = {
        exit: 'false',
        should_exit: false,
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('max_rounds');
      expect(exitDecision.reason).toContain('最大轮次限制');
    });

    it('优先级2: 应该在 exit 标志为 true 时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
      });
      action.currentRound = 1;

      const llmOutput = {
        exit: 'true',
        exit_reason: '用户已充分理解',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('exit_flag');
      expect(exitDecision.reason).toBe('用户已充分理解');
    });

    it('优先级3: exit_criteria 不再处理自定义条件（已移除）', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {},
      });
      action.currentRound = 1;

      const llmOutput = {
        exit: 'false',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      // custom_conditions 已移除，exit_criteria 不再触发退出
      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.decision_source).toBe('llm_suggestion');
    });

    it('优先级4: 应该在 LLM 建议退出时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
      });
      action.currentRound = 1;

      const llmOutput = {
        exit: 'false',
        should_exit: true,
        exit_reason: 'LLM 判断用户已理解',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('llm_suggestion');
      expect(exitDecision.reason).toBe('LLM 判断用户已理解');
    });

    it('应该在所有退出条件都不满足时继续', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
      });
      action.currentRound = 1;

      const llmOutput = {
        exit: 'false',
        should_exit: false,
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('未满足退出条件');
    });
  });

  describe('2. exit_criteria 自定义条件已移除', () => {
    it('custom_conditions 已移除，不再检查自定义条件', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {},
      });
      action.currentRound = 2;

      variableStore.topic['topic_1'] = {
        用户情绪: { value: '平和', source: 'test' },
      };

      const llmOutput = {
        exit: 'false',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      // custom_conditions 已移除，即使变量满足条件也不会触发退出
      expect(exitDecision.should_exit).toBe(false);
    });
  });

  describe('3. 不支持退出的 Action', () => {
    it('应该在不支持退出的 Action 中默认继续', () => {
      const action = new TestNonInteractiveAction('test_action', {});

      const llmOutput = {
        exit: 'true',
        exit_reason: '测试',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
    });
  });

  describe('4. 综合场景', () => {
    it('应该在 CBT 会话场景中正确应用退出决策', () => {
      const action = new TestInteractiveAction('cbt_session', {
        max_rounds: 5,
      });

      // 第一轮：LLM 建议继续
      const llmOutput1 = {
        exit: 'false',
        exit_reason: '继续收集',
      };
      action.currentRound = 1;
      const exitDecision1 = action['evaluateExitCondition'](context, llmOutput1);
      expect(exitDecision1.should_exit).toBe(false);

      // 第二轮：LLM 建议退出
      const llmOutput2 = {
        exit: 'true',
        exit_reason: '信息已完整',
      };
      action.currentRound = 2;
      const exitDecision2 = action['evaluateExitCondition'](context, llmOutput2);
      expect(exitDecision2.should_exit).toBe(true);
      expect(exitDecision2.decision_source).toBe('exit_flag');
    });

    it('应该处理 exit 标志优先级高于 exit_criteria', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {},
      });
      action.currentRound = 1;

      const llmOutput = {
        exit: 'true',
        exit_reason: '检测到用户不适合继续',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('exit_flag');
      expect(exitDecision.reason).toBe('检测到用户不适合继续');
    });
  });
});
