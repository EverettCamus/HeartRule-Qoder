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
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('max_rounds: 5 > 3');
    });

    it('should exit when max_tokens exceeded', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_tokens: 100 };
      const context: RuleContext = {
        currentRound: 2,
        totalTokens: 150,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('max_tokens: 150 >= 100');
    });

    it('should exit when max_cost exceeded', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_cost: 0.01 };
      const context: RuleContext = {
        currentRound: 2,
        totalTokens: 100,
        estimatedCost: 0.02,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('max_cost: 0.02 >= 0.01');
    });

    it('should exit when min_response_length not met', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { min_response_length: 10 };
      const context: RuleContext = {
        currentRound: 2,
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 5,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('min_response_length: 5 < 10');
    });

    it('should exit when max_silence_rounds exceeded', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_silence_rounds: 2 };
      const context: RuleContext = {
        currentRound: 3,
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 3,
        collectedVariables: [],
        requiredVariables: [],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('max_silence_rounds: 3 >= 2');
    });

    it('should exit when all required variables collected', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { required_variables: ['name', 'age'] };
      const context: RuleContext = {
        currentRound: 2,
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: ['name', 'age'],
        requiredVariables: ['name', 'age'],
      };

      const result = evaluator.evaluate(criteria, context);
      expect(result.shouldExit).toBe(true);
      expect(result.triggeredRules).toContain('required_variables: all collected');
    });

    it('should not exit when no rules triggered', () => {
      const evaluator = new RuleBasedEvaluator();
      const criteria = { max_rounds: 10, min_response_length: 5 };
      const context: RuleContext = {
        currentRound: 3,
        totalTokens: 50,
        estimatedCost: 0.005,
        userInputLength: 20,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
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
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 50,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { EXIT: 'true', BRIEF: '信息已收集完整', crisis_detected: false },
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
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { EXIT: 'false', BRIEF: '继续收集', crisis_detected: false },
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
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 10,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { EXIT: 'true', BRIEF: '信息已收集完整', crisis_detected: false },
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
        totalTokens: 100,
        estimatedCost: 0.01,
        userInputLength: 50,
        silentRounds: 0,
        collectedVariables: [],
        requiredVariables: [],
        llmOutput: { EXIT: 'false', BRIEF: '继续收集更多信息', crisis_detected: false },
      };

      const result = engine.evaluate(criteria, context);
      expect(result.shouldExit).toBe(false);
      expect(result.source).toBe('llm');
      expect(result.reason).toBe('继续对话');
    });
  });
});
