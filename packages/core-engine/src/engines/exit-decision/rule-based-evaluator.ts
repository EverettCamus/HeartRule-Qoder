import type { ExitCriteria } from '@heartrule/shared-types';

export interface RuleEvaluationResult {
  shouldExit: boolean;
  reason: string;
  triggeredRules: string[];
}

export interface RuleContext {
  currentRound: number;
  totalTokens: number;
  estimatedCost: number;
  userInputLength: number;
  silentRounds: number;
  collectedVariables: string[];
  requiredVariables: string[];
}

export class RuleBasedEvaluator {
  evaluate(criteria: ExitCriteria, context: RuleContext): RuleEvaluationResult {
    const triggeredRules: string[] = [];

    if (criteria.max_rounds && context.currentRound > criteria.max_rounds) {
      triggeredRules.push(`max_rounds: ${context.currentRound} > ${criteria.max_rounds}`);
    }

    if (criteria.max_tokens && context.totalTokens >= criteria.max_tokens) {
      triggeredRules.push(`max_tokens: ${context.totalTokens} >= ${criteria.max_tokens}`);
    }

    if (criteria.max_cost && context.estimatedCost >= criteria.max_cost) {
      triggeredRules.push(`max_cost: ${context.estimatedCost} >= ${criteria.max_cost}`);
    }

    if (criteria.min_response_length && context.userInputLength < criteria.min_response_length) {
      triggeredRules.push(
        `min_response_length: ${context.userInputLength} < ${criteria.min_response_length}`
      );
    }

    if (criteria.max_silence_rounds && context.silentRounds >= criteria.max_silence_rounds) {
      triggeredRules.push(
        `max_silence_rounds: ${context.silentRounds} >= ${criteria.max_silence_rounds}`
      );
    }

    if (criteria.required_variables && criteria.required_variables.length > 0) {
      const missingVars = criteria.required_variables.filter(
        (v) => !context.collectedVariables.includes(v)
      );
      if (missingVars.length === 0) {
        triggeredRules.push('required_variables: all collected');
      }
    }

    const shouldExit = triggeredRules.length > 0;

    return {
      shouldExit,
      reason: shouldExit ? `触发规则: ${triggeredRules.join(', ')}` : '未触发任何硬性规则',
      triggeredRules,
    };
  }
}
