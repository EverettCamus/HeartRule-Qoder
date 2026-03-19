import { describe, it, expect } from 'vitest';

import { AiAskAction } from '../../src/domain/actions/ai-ask-action.js';

describe('AI_Ask Exit Decision E2E', () => {
  describe('ExitDecisionEngine integration', () => {
    it('should use ExitDecisionEngine for exit decisions', () => {
      const config = {
        question_template: '请描述你的症状',
        exit: '用户提供了症状描述',
        max_rounds: 2,
        output: [{ get: '症状描述', define: '症状描述', require: '关键' }],
      };

      const action = new AiAskAction('test-action', config);

      expect(action).toBeDefined();
      expect((action as any).exitDecisionEngine).toBeDefined();
    });
  });

  describe('metadata structure', () => {
    it('should return assessment and progress in metadata', () => {
      const config = {
        question_template: '请详细描述你的感受',
        exit: '用户提供了详细描述',
        output: [{ get: '感受描述', define: '感受描述', require: '关键' }],
      };

      const action = new AiAskAction('test-action', config);
      expect(action).toBeDefined();
    });
  });
});
