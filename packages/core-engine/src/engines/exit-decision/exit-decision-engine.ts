import type { ExitCriteria, EnhancedAskLLMOutput } from '@heartrule/shared-types';

import { RuleBasedEvaluator, type RuleContext } from './rule-based-evaluator.js';

export interface ExitDecisionResult {
  shouldExit: boolean;
  reason: string;
  source: 'llm' | 'rules' | 'combined';
  llmExit: boolean;
  ruleExit: boolean;
}

export interface DecisionContext extends RuleContext {
  llmOutput: EnhancedAskLLMOutput;
}

export class ExitDecisionEngine {
  private ruleEvaluator: RuleBasedEvaluator;

  constructor() {
    this.ruleEvaluator = new RuleBasedEvaluator();
  }

  evaluate(criteria: ExitCriteria, context: DecisionContext): ExitDecisionResult {
    const llmExit = context.llmOutput.EXIT === 'true';
    const llmReason = context.llmOutput.BRIEF || 'LLM建议退出';

    const ruleResult = this.ruleEvaluator.evaluate(criteria, {
      currentRound: context.currentRound,
      totalTokens: context.totalTokens,
      estimatedCost: context.estimatedCost,
      userInputLength: context.userInputLength,
      silentRounds: context.silentRounds,
      collectedVariables: context.collectedVariables,
      requiredVariables: criteria.required_variables || [],
    });

    let shouldExit: boolean;
    let reason: string;
    let source: 'llm' | 'rules' | 'combined' = 'llm';

    if (llmExit && ruleResult.shouldExit) {
      shouldExit = true;
      reason = `LLM与规则均建议退出: ${llmReason}, ${ruleResult.reason}`;
      source = 'combined';
    } else if (llmExit) {
      shouldExit = true;
      reason = llmReason;
      source = 'llm';
    } else if (ruleResult.shouldExit) {
      shouldExit = true;
      reason = ruleResult.reason;
      source = 'rules';
    } else {
      shouldExit = false;
      reason = '继续对话';
    }

    return {
      shouldExit,
      reason,
      source,
      llmExit,
      ruleExit: ruleResult.shouldExit,
    };
  }
}
