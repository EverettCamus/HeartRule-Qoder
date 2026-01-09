import { describe, it, expect } from 'vitest';
import { YAMLParser } from '../yaml-parser.js';

describe('YAML Parser', () => {
  const parser = new YAMLParser();

  it('should parse valid YAML content', () => {
    const yaml = `
session:
  session_id: test
  phases:
    - phase_id: phase1
      topics:
        - topic_id: topic1
          actions:
            - action_type: ai_say
              action_id: greeting
              config:
                content_template: "Hello"
`;

    const result = parser.parse(yaml);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('session');
  });

  it('should throw error for invalid YAML', () => {
    const invalidYaml = `
session:
  - invalid: [
`;

    expect(() => parser.parse(invalidYaml)).toThrow('YAML parsing failed');
  });

  it('should validate session script schema', () => {
    const validData = {
      session: {
        session_id: 'test',
        phases: [
          {
            phase_id: 'phase1',
            topics: [
              {
                topic_id: 'topic1',
                actions: [
                  {
                    action_type: 'ai_say',
                    action_id: 'action1',
                    config: {},
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    expect(() => parser.validateSessionScript(validData)).not.toThrow();
  });

  it('should reject invalid session script schema', () => {
    const invalidData = {
      session: {
        // missing session_id
        phases: [],
      },
    };

    expect(() => parser.validateSessionScript(invalidData)).toThrow();
  });

  it('should validate technique script schema', () => {
    const validData = {
      topic: {
        topic_id: 'technique1',
        actions: [
          {
            action_type: 'ai_ask',
            action_id: 'question1',
            config: {},
          },
        ],
      },
    };

    expect(() => parser.validateTechniqueScript(validData)).not.toThrow();
  });
});
