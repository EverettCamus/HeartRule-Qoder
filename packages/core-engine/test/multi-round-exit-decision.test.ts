/**
 * 多轮对话智能终止判断测试
 * 
 * 测试目标：
 * - BaseAction.evaluateExitCondition 的四级优先级判定
 * - AiSayAction 和 AiAskAction 的退出决策集成
 * - ExecutionState.metadata 的退出历史记录
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAction } from '../src/actions/base-action.js';
import type { ActionContext, ActionResult } from '../src/actions/base-action.js';
import type { ExitDecision, VariableStore } from '@heartrule/shared-types';
import { VariableScope } from '@heartrule/shared-types';
import { VariableScopeResolver } from '../src/engines/variable-scope/variable-scope-resolver.js';

// 创建测试用的 Action 子类
class TestInteractiveAction extends BaseAction {
  static actionType = 'test_interactive';

  constructor(actionId: string, config: Record<string, any>) {
    super(actionId, config);
    // 设置为交互型 Action
    this.exitPolicy = {
      supportsExit: true,
      enabledSources: ['max_rounds', 'exit_flag', 'exit_criteria', 'llm_suggestion'],
    };
  }

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
    this.currentRound++;
    
    // 模拟 LLM 输出
    const llmOutput = {
      EXIT: 'false',
      response: 'Test response',
      assessment: {
        understanding_level: 85,
        has_questions: false,
      },
    };

    // 使用统一的退出决策
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

  async execute(context: ActionContext, userInput?: string | null): Promise<ActionResult> {
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
      action.currentRound = 3; // 达到最大轮次

      const llmOutput = {
        EXIT: 'false',
        should_exit: false,
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('max_rounds');
      expect(exitDecision.reason).toContain('最大轮次限制');
    });

    it('优先级2: 应该在 EXIT 标志为 true 时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
      });
      action.currentRound = 1;

      const llmOutput = {
        EXIT: 'true',
        exit_reason: '用户已充分理解',
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('exit_flag');
      expect(exitDecision.reason).toBe('用户已充分理解');
    });

    it('优先级3: 应该在满足 exit_criteria 时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 80,
          has_questions: false,
        },
      });
      action.currentRound = 1;

      const llmOutput = {
        EXIT: 'false',
        assessment: {
          understanding_level: 85,
          has_questions: false,
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('exit_criteria');
      expect(exitDecision.reason).toContain('理解度达标');
    });

    it('优先级4: 应该在 LLM 建议退出时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
      });
      action.currentRound = 1;

      const llmOutput = {
        EXIT: 'false',
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
        exit_criteria: {
          understanding_threshold: 90,
        },
      });
      action.currentRound = 1;

      const llmOutput = {
        EXIT: 'false',
        should_exit: false,
        assessment: {
          understanding_level: 70, // 未达到阈值
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
      // 现在会返回具体的失败原因而不是通用消息
      expect(exitDecision.reason).toContain('理解度未达标');
      expect(exitDecision.decision_source).toBe('exit_criteria');
    });
  });

  describe('2. exit_criteria 详细测试', () => {
    it('应该检查最小轮次要求', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 10,
        exit_criteria: {
          min_rounds: 3,
          understanding_threshold: 80,
        },
      });
      action.currentRound = 1; // 未达到最小轮次

      const llmOutput = {
        assessment: {
          understanding_level: 90, // 理解度已达标
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('未达到最小轮次要求');
    });

    it('应该检查理解度阈值', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 80,
        },
      });
      action.currentRound = 2;

      const llmOutput = {
        assessment: {
          understanding_level: 75, // 未达到阈值
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('理解度未达标');
    });

    it('应该检查是否允许有疑问时退出', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 80,
          has_questions: false, // 不允许有疑问
        },
      });
      action.currentRound = 2;

      const llmOutput = {
        assessment: {
          understanding_level: 85,
          has_questions: true, // 用户有疑问
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('用户仍有疑问');
    });

    it('应该评估自定义退出条件', () => {
      // 设置一个变量
      scopeResolver.setVariable('用户情绪', '平和', VariableScope.SESSION, {
        phaseId: 'phase_1',
        topicId: 'topic_1',
        actionId: 'action_1',
      });

      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          custom_conditions: [
            {
              variable: '用户情绪',
              operator: '==',
              value: '平和',
            },
          ],
        },
      });
      action.currentRound = 2;

      const exitDecision = action['evaluateExitCondition'](context, {});

      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.reason).toContain('满足退出条件');
      expect(exitDecision.reason).toContain('用户情绪 == 平和');
    });

    it('应该在自定义条件不满足时继续', () => {
      scopeResolver.setVariable('用户情绪', '焦虑', VariableScope.SESSION, {
        phaseId: 'phase_1',
        topicId: 'topic_1',
        actionId: 'action_1',
      });

      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          custom_conditions: [
            {
              variable: '用户情绪',
              operator: '==',
              value: '平和',
            },
          ],
        },
      });
      action.currentRound = 2;

      const exitDecision = action['evaluateExitCondition'](context, {});

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('自定义条件不满足');
    });
  });

  describe('3. ExitPolicy 支持测试', () => {
    it('交互型 Action 应该支持退出机制', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 3,
      });

      expect(action.exitPolicy.supportsExit).toBe(true);
      expect(action.exitPolicy.enabledSources).toContain('max_rounds');
    });

    it('非交互型 Action 不应该触发退出判定', () => {
      const action = new TestNonInteractiveAction('test_action', {
        max_rounds: 3,
      });

      expect(action.exitPolicy.supportsExit).toBe(false);

      // 即使达到最大轮次，也不应该退出（因为不支持）
      action.currentRound = 3;
      const exitDecision = action['evaluateExitCondition'](context, {});

      expect(exitDecision.should_exit).toBe(false);
      expect(exitDecision.reason).toContain('does not support exit mechanism');
    });

    it('应该支持选择性启用退出来源', () => {
      class CustomAction extends BaseAction {
        static actionType = 'custom';

        constructor(actionId: string, config: Record<string, any>) {
          super(actionId, config);
          // 只启用 max_rounds 和 exit_flag
          this.exitPolicy = {
            supportsExit: true,
            enabledSources: ['max_rounds', 'exit_flag'],
          };
        }

        async execute(context: ActionContext): Promise<ActionResult> {
          return { success: true, completed: true };
        }
      }

      const action = new CustomAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 80,
        },
      });
      action.currentRound = 2;

      // LLM 建议退出，但未启用 llm_suggestion
      const llmOutput = {
        should_exit: true,
        assessment: {
          understanding_level: 85,
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      // 应该检查 exit_criteria（未启用），然后检查 llm_suggestion（也未启用）
      // 最终不应该退出
      expect(exitDecision.should_exit).toBe(false);
    });
  });

  describe('4. 综合场景测试', () => {
    it('应该在 CBT 会话场景中正确应用退出决策', async () => {
      const action = new TestInteractiveAction('concept_intro', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 80,
          has_questions: false,
          min_rounds: 2,
        },
      });

      // 第一轮：用户理解度不足
      let result = await action.execute(context, '我不太明白');
      expect(result.completed).toBe(false);
      expect(result.metadata?.exitDecision?.should_exit).toBe(false);

      // 第二轮：用户理解但有疑问
      const llmOutput2 = {
        EXIT: 'false',
        assessment: {
          understanding_level: 85,
          has_questions: true,
        },
      };
      action.currentRound = 1;
      const exitDecision2 = action['evaluateExitCondition'](context, llmOutput2);
      expect(exitDecision2.should_exit).toBe(false);

      // 第三轮：用户理解且无疑问
      const llmOutput3 = {
        EXIT: 'false',
        assessment: {
          understanding_level: 90,
          has_questions: false,
        },
      };
      action.currentRound = 2;
      const exitDecision3 = action['evaluateExitCondition'](context, llmOutput3);
      expect(exitDecision3.should_exit).toBe(true);
      expect(exitDecision3.decision_source).toBe('exit_criteria');
    });

    it('应该处理 EXIT 标志优先级高于 exit_criteria', () => {
      const action = new TestInteractiveAction('test_action', {
        max_rounds: 5,
        exit_criteria: {
          understanding_threshold: 90, // 高阈值
        },
      });
      action.currentRound = 1;

      const llmOutput = {
        EXIT: 'true', // 显式退出标志
        exit_reason: '检测到用户不适合继续',
        assessment: {
          understanding_level: 50, // 未达到阈值
        },
      };

      const exitDecision = action['evaluateExitCondition'](context, llmOutput);

      // 应该因为 EXIT 标志而退出，而不是 exit_criteria
      expect(exitDecision.should_exit).toBe(true);
      expect(exitDecision.decision_source).toBe('exit_flag');
      expect(exitDecision.reason).toBe('检测到用户不适合继续');
    });
  });
});
