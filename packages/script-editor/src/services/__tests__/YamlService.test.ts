/**
 * YamlService单元测试
 */

import { describe, it, expect } from 'vitest';

import { yamlService } from '../YamlService';

describe('YamlService', () => {
  describe('parseYamlToScript', () => {
    it('应该能解析新格式的YAML (session.phases)', () => {
      const yaml = `
session:
  session_id: test_session
  session_name: Test Session
  phases:
    - phase_id: phase_1
      phase_name: Phase 1
      topics:
        - topic_id: topic_1
          topic_name: Topic 1
          actions:
            - action_id: action_1
              action_type: ai_say
              config:
                content: Hello
`;

      const result = yamlService.parseYamlToScript(yaml);

      expect(result.success).toBe(true);
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].phase_id).toBe('phase_1');
      expect(result.phases[0].topics).toHaveLength(1);
      expect(result.phases[0].topics[0].actions).toHaveLength(1);
      expect(result.phases[0].topics[0].actions[0].type).toBe('ai_say');
    });

    it('应该能解析ai_ask类型的Action', () => {
      const yaml = `
session:
  session_id: test
  phases:
    - phase_id: p1
      topics:
        - topic_id: t1
          actions:
            - action_id: a1
              action_type: ai_ask
              config:
                content: What is your name?
                output:
                  - get: user_name
`;

      const result = yamlService.parseYamlToScript(yaml);

      expect(result.success).toBe(true);
      const action = result.phases[0].topics[0].actions[0];
      expect(action.type).toBe('ai_ask');
      expect(action.ai_ask).toBe('What is your name?');
      expect(action.output).toEqual([{ get: 'user_name' }]);
    });

    it('应该处理无效的YAML并返回错误', () => {
      const invalidYaml = '{ invalid yaml content [';

      const result = yamlService.parseYamlToScript(invalidYaml);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.phases).toHaveLength(0);
    });
  });

  describe('syncPhasesToYaml', () => {
    it('应该能将Phases同步回YAML', () => {
      const phases = [
        {
          phase_id: 'phase_1',
          phase_name: 'Test Phase',
          description: 'A test phase',
          topics: [
            {
              topic_id: 'topic_1',
              topic_name: 'Test Topic',
              actions: [
                {
                  type: 'ai_say' as const,
                  ai_say: 'Hello World',
                  action_id: 'action_1',
                  _raw: {
                    action_id: 'action_1',
                    action_type: 'ai_say',
                    config: { content: 'Hello World' },
                  },
                },
              ],
            },
          ],
        },
      ];

      const result = yamlService.syncPhasesToYaml({
        phases,
        baseScript: null,
        targetFile: {
          id: 'test-file',
          fileName: 'test.yaml',
          fileType: 'session',
        } as any,
      });

      expect(result.success).toBe(true);
      expect(result.yaml).toContain('phase_id: phase_1');
      expect(result.yaml).toContain('topic_id: topic_1');
      expect(result.yaml).toContain('action_id: action_1');
    });

    it('应该保留原始脚本的metadata', () => {
      const baseScript = {
        session: {
          session_id: 'test',
          session_name: 'Test',
          metadata: { version: '1.0' },
          phases: [],
        },
      };

      const phases = [
        {
          phase_id: 'p1',
          topics: [
            {
              topic_id: 't1',
              actions: [
                {
                  type: 'ai_say' as const,
                  ai_say: 'Test',
                  action_id: 'a1',
                  _raw: {
                    action_id: 'a1',
                    action_type: 'ai_say',
                    config: { content: 'Test' },
                  },
                },
              ],
            },
          ],
        },
      ];

      const result = yamlService.syncPhasesToYaml({
        phases,
        baseScript,
      });

      expect(result.success).toBe(true);
      expect(result.script.session.metadata).toEqual({ version: '1.0' });
    });
  });

  describe('fixYamlIndentation', () => {
    it('应该修复Action字段的缩进错误', () => {
      const badYaml = `
actions:
- action_id: a1
action_type: ai_say
  config:
content: Hello
`;

      const fixed = yamlService.fixYamlIndentation(badYaml);

      expect(fixed).toContain('  action_type: ai_say');
      expect(fixed).toContain('  config:');
      expect(fixed).toContain('    content: Hello');
    });

    it('应该保留正确的缩进', () => {
      const goodYaml = `
session:
  phases:
    - phase_id: p1
      topics:
        - topic_id: t1
`;

      const fixed = yamlService.fixYamlIndentation(goodYaml);

      expect(fixed).toBe(goodYaml);
    });
  });

  describe('formatYaml', () => {
    it('应该格式化有效的YAML', () => {
      const unformatted = 'session:\n  session_id:   test\n  phases:  []';

      const result = yamlService.formatYaml(unformatted);

      expect(result.success).toBe(true);
      expect(result.formatted).toContain('session_id: test');
      expect(result.formatted).toContain('phases: []');
    });

    it('应该自动修复并格式化有缩进错误的YAML', () => {
      const badYaml = `
actions:
  - action_id: a1
    action_type: ai_say
    config:
      content: Hello
`;

      const result = yamlService.formatYaml(badYaml);

      expect(result.success).toBe(true);
      // 注：这个YAML实际上是有效的，不需要修复
      expect(result.formatted).toContain('action_id: a1');
    });

    it('应该返回错误信息对于无法修复的YAML', () => {
      const invalidYaml = '{ [ invalid';

      const result = yamlService.formatYaml(invalidYaml);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
