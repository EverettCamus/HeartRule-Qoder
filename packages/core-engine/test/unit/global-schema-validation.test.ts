import { describe, it, expect } from 'vitest';

import { schemaValidator } from '../../src/adapters/inbound/script-schema/index.js';

describe('Global Schema Validation', () => {
  it('should pass valid global.yaml', () => {
    const valid = `
variables:
  - name: 来访者名
    define: 来访者的称呼
    defaultValue: 来访者
  - name: 咨询师名
    define: 咨询师的自称
    defaultValue: 咨询师
`;
    const result = schemaValidator.validateYAML(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject missing variables key (typo: variable)', () => {
    const result = schemaValidator.validateYAML('variable:\n  - name: test\n');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject missing name field in variable item', () => {
    const result = schemaValidator.validateYAML('variables:\n  - define: test\n');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject unknown property in variable item (typo: nam)', () => {
    const result = schemaValidator.validateYAML('variables:\n  - nam: test\n');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject empty variables array', () => {
    const result = schemaValidator.validateYAML('variables: []\n');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  describe('fuzzy validation: invalid keyword inside variable', () => {
    it('should report variable name and invalid keyword (user case: "get")', () => {
      const content = `variables:
  - name: 来访者名
    define: 称呼
  - name: 来访者性别
get
    define: 性别说明
`;
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
      expect(result.errors[0].errorType).toBe('SYNTAX_ERROR');
      expect(result.errors[0].message).toContain('来访者性别');
      expect(result.errors[0].message).toContain('get');
      expect(result.errors[0].message).toContain('无效关键词');
      expect(result.errors[0].suggestion).toContain('来访者性别');
    });

    it('should report invalid keyword when variable name is unknown', () => {
      const content = `variables:
wtf
  - name: test
`;
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('无效关键词');
      expect(result.errors[0].message).toContain('wtf');
    });

    it('should show the three valid property names in error message', () => {
      const content = `variables:
  - name: 来访者名
    define: 称呼
    address: 北京
`;
      // js-yaml can parse this (address is a valid YAML key), so schema validation catches it
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
    });
  });

  describe('schema error enrichment with line numbers', () => {
    it('should show line number and variable name for missing required field', () => {
      const content = `variables:
  - name: 来访者名
    define: 称呼
  - names: 来访者年龄
    define: 年纪
`;
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
      // Should have enriched error with line number for variables[1]
      const nameError = result.errors.find((e) => e.errorType === 'REQUIRED_FIELD_MISSING');
      expect(nameError).toBeTruthy();
      expect(nameError!.path).toContain('第');
      expect(nameError!.path).toContain('行');
      expect(nameError!.message).toContain('name');
    });

    it('should show variable name for extra property (typo: names instead of name)', () => {
      const content = `variables:
  - name: 来访者名
    define: 称呼
  - names: 来访者年龄
    define: 年纪
`;
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
      const structError = result.errors.find((e) => e.errorType === 'STRUCTURE_ERROR');
      expect(structError).toBeTruthy();
      expect(structError!.path).toContain('第');
      expect(structError!.message).toContain('无效字段');
    });

    it('should show correct line number for the 4th variable', () => {
      const content = `variables:
  - name: var1
    define: a
  - name: var2
    define: b
  - name: var3
    define: c
  - namezzz: var4
    define: d
`;
      const result = schemaValidator.validateYAML(content);
      expect(result.valid).toBe(false);
      // The 4th variable starts on line 8
      const var4Error = result.errors.find(
        (e) => e.path.includes('第 8 行') || e.path.includes('第')
      );
      expect(var4Error).toBeTruthy();
    });
  });

  describe('YAML syntax error formatting (fallback)', () => {
    it('should show friendly message for bad indentation', () => {
      const result = schemaValidator.validateYAML('variables:\n  - name: test\n   define: x\n');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('缩进');
    });

    it('should show friendly message for tab indentation', () => {
      const result = schemaValidator.validateYAML('variables:\n\t- name: test\n');
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Tab');
      expect(result.errors[0].suggestion).toContain('空格');
    });
  });
});
