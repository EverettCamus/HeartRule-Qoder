/**
 * PromptTemplateManager 单元测试
 */

import { describe, test, expect, beforeEach } from 'vitest';

import { PromptTemplateManager } from '../src/engines/prompt-template/template-manager.js';

describe('PromptTemplateManager', () => {
  let manager: PromptTemplateManager;

  beforeEach(() => {
    manager = new PromptTemplateManager();
  });

  describe('变量替换', () => {
    test('应正确替换脚本变量', () => {
      const template = '用户的教育背景是{{教育背景}}';
      const scriptVars = new Map([['教育背景', '本科']]);
      const result = manager.substituteVariables(template, scriptVars, {});
      expect(result).toBe('用户的教育背景是本科');
    });

    test('应正确替换系统变量', () => {
      const template = '当前时间是{{time}}';
      const sysVars = { time: '2025-01-20' };
      const result = manager.substituteVariables(template, new Map(), sysVars);
      expect(result).toBe('当前时间是2025-01-20');
    });

    test('应按顺序执行两层替换', () => {
      const template = '{{用户名}}，现在是{{time}}';
      const scriptVars = new Map([['用户名', '小明']]);
      const sysVars = { time: '10:00' };
      const result = manager.substituteVariables(template, scriptVars, sysVars);
      expect(result).toBe('小明，现在是10:00');
    });

    test('应正确提取变量', () => {
      const template = '欢迎 {{user}}，今天是 {{time}}，您的教育背景是 {{教育背景}}';
      const { scriptVars, systemVars } = manager.extractVariables(template);

      expect(scriptVars).toContain('教育背景');
      expect(systemVars).toContain('user');
      expect(systemVars).toContain('time');
    });

    test('应正确验证替换结果', () => {
      const text = '欢迎 {{user}}，今天是 2025-01-20';
      const unreplaced = manager.validateSubstitution(text);
      expect(unreplaced).toContain('{{user}}');

      const completedText = '欢迎 小明，今天是 2025-01-20';
      const noUnreplaced = manager.validateSubstitution(completedText);
      expect(noUnreplaced).toHaveLength(0);
    });

    test('应处理未定义的变量', () => {
      const template = '{{未定义变量}}';
      const result = manager.substituteVariables(template, new Map(), {});
      expect(result).toBe('{{未定义变量}}');
    });

    test('应处理特殊字符', () => {
      const template = '{{变量1}} + {{变量2}}';
      const scriptVars = new Map([
        ['变量1', '1+1'],
        ['变量2', '2*2'],
      ]);
      const result = manager.substituteVariables(template, scriptVars, {});
      expect(result).toBe('1+1 + 2*2');
    });
  });

  describe('变量提取', () => {
    test('应提取脚本变量', () => {
      const template = '你好{{用户名}}，你的{{教育背景}}是？';
      const vars = manager.extractVariables(template);
      expect(vars.scriptVars).toEqual(['用户名', '教育背景']);
    });

    test('应提取系统变量', () => {
      const template = '时间{{time}}，轮次{{current_round}}';
      const vars = manager.extractVariables(template);
      expect(vars.systemVars).toEqual(['time', 'current_round']);
    });

    test('应同时提取两种变量', () => {
      const template = '{{用户名}}在{{time}}说话';
      const vars = manager.extractVariables(template);
      expect(vars.scriptVars).toEqual(['用户名']);
      expect(vars.systemVars).toEqual(['time']);
    });

    test('应去重变量', () => {
      const template = '{{变量1}} {{变量1}} {{time}} {{time}}';
      const vars = manager.extractVariables(template);
      expect(vars.scriptVars).toEqual(['变量1']);
      expect(vars.systemVars).toEqual(['time']);
    });
  });

  describe('变量验证', () => {
    test('应检测未替换的脚本变量', () => {
      const text = '你好{{用户名}}';
      const unreplaced = manager.validateSubstitution(text);
      expect(unreplaced).toEqual(['{{用户名}}']);
    });

    test('应检测未替换的系统变量', () => {
      const text = '当前时间{{time}}';
      const unreplaced = manager.validateSubstitution(text);
      expect(unreplaced).toEqual(['{{time}}']);
    });

    test('完全替换后不应有未替换变量', () => {
      const text = '你好小明，现在是10:00';
      const unreplaced = manager.validateSubstitution(text);
      expect(unreplaced).toEqual([]);
    });
  });
});
