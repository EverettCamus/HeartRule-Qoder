import { describe, it, expect } from 'vitest';

import {
  ExitDecisionEngine,
  type DecisionContext,
} from '../../../src/engines/exit-decision/exit-decision-engine.js';
import {
  RuleBasedEvaluator,
  type RuleContext,
} from '../../../src/engines/exit-decision/rule-based-evaluator.js';

describe('RuleBasedEvaluator', () => {
  describe('evaluate', () => {
    it('should exit when max_rounds reached', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_rounds: 3 };
      const context: RuleContext = {
        currentRound: 5,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('max_rounds: 5 > 3');
    });

    it('should exit when all required variables collected', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { required_variables: ['name', 'age'] };
      const context: RuleContext = {
        currentRound: 2,
        collectedVariables: ['name', 'age'],
        requiredVariables: ['name', 'age'],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('required_variables: all collected');
    });

    it('should not exit when no rules triggered', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_rounds: 10 };
      const context: RuleContext = {
        currentRound: 3,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(false);
      expect(result.triggeredRules).toHaveLength(0);
    });

    it('should not exit when required variables not all collected', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { required_variables: ['name', 'age', 'email'] };
      const context: RuleContext = {
        currentRound: 3,
        collectedVariables: ['name', 'age'],
        requiredVariables: ['name', 'age', 'email'],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(false);
      expect(result.triggeredRules).toHaveLength(0);
    });
  });
});

describe('ExitDecisionEngine', () => {
  describe('evaluate', () => {
    it('should use LLM suggestion when no rules triggered', () => {
      const engine = new ExitDecisionEngine();
      const criteria = { max_rounds: 10 };
      const context: DecisionContext = {
        currentRound: 3,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { exit: 'true', exit_reason: '信息已完整', crisis_detected: false },
      };

      const result = engine.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.source).toBe('llm');
      expect(result.llmExit).toBe(true);
    });

    it('should use rules when LLM says continue but rules say exit', () => {
      const engine = new ExitDecisionEngine();
      const criteria = { max_rounds: 3 };
      const context: DecisionContext = {
        currentRound: 5,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { exit: 'false', exit_reason: '继续收集', crisis_detected: false },
      };

      const result = engine.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.source).toBe('rules');
      expect(result.ruleExit).toBe(true);
    });

    it('should combine when both LLM and rules say exit', () => {
      const engine = new ExitDecisionEngine();
      const criteria = { max_rounds: 3 };
      const context: DecisionContext = {
        currentRound: 5,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { exit: 'true', exit_reason: '信息已完整', crisis_detected: false },
      };

      const result = engine.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.source).toBe('combined');
      expect(result.llmExit).toBe(true);
      expect(result.ruleExit).toBe(true);
    });

    it('should continue when neither LLM nor rules say exit', () => {
      const engine = new ExitDecisionEngine();
      const criteria = { max_rounds: 10 };
      const context: DecisionContext = {
        currentRound: 3,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { exit: 'false', exit_reason: '继续收集', crisis_detected: false },
      };

      const result = engine.evaluate(criteria, context);
      expect(result.shouldExit).toBe(false);
      expect(result.source).toBe('llm');
      expect(result.reason).toBe('继续对话');
    });
  });
});
