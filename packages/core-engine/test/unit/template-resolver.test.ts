/**
 * TemplateResolver 和安全边界检测测试
 *
 * 测试目标：
 * 1. TemplateResolver 两层路径解析
 * 2. BaseAction 安全边界检测
 * 3. TemplateManager 模板验证
 */

import path from 'path';

import { describe, it, expect, beforeAll } from 'vitest';

import { PromptTemplateManager } from '../../src/engines/prompt-template/template-manager.js';
import { TemplateResolver } from '../../src/engines/prompt-template/template-resolver.js';

describe('TemplateResolver - 两层模板路径解析', () => {
  let resolver: TemplateResolver;
  // 使用项目根目录的config/prompts
  const templateBasePath = path.join(process.cwd(), 'config', 'prompts');

  beforeAll(() => {
    resolver = new TemplateResolver(templateBasePath);
  });

  it('应该解析默认层模板', async () => {
    const result = await resolver.resolveTemplatePath('ai_ask');

    expect(result.layer).toBe('default');
    expect(result.path).toContain('ai_ask_v1.md');
    expect(result.exists).toBe(true);
    console.log('✅ 默认层解析成功:', result.path);
  });

  it('应该解析自定义层模板（如果存在）', async () => {
    // 配置了 template_scheme，但不存在该方案，应该回退到 default 层
    const result = await resolver.resolveTemplatePath('ai_ask', {
      template_scheme: 'nonexistent-scheme',
    });

    expect(result.layer).toBe('default');
    expect(result.exists).toBe(true);
    console.log('✅ 回退到默认层:', result.layer);
  });

  it('应该返回正确的路径格式', async () => {
    const result = await resolver.resolveTemplatePath('ai_say');

    expect(result.path).toContain('ai_say_v1.md');
    expect(result.layer).toBe('default');
    console.log('✅ ai_say 模板路径正确');
  });
});

describe('PromptTemplateManager - 模板验证', () => {
  let manager: PromptTemplateManager;
  // 使用项目根目录的config/prompts
  const templateBasePath = path.join(process.cwd(), 'config', 'prompts');

  beforeAll(() => {
    manager = new PromptTemplateManager(templateBasePath);
  });

  it('应该验证模板包含安全边界声明', () => {
    const validTemplate = `
【安全边界与伦理规范】

你必须严格遵守以下安全边界：

**绝对禁止的行为**：
1. 诊断禁止：不得对用户进行任何精神疾病诊断
2. 处方禁止：不得推荐药物
3. 保证禁止：不得对疗效做保证

**危机识别与响应**：
- 如果用户表达自伤、自杀意念，立即标记 crisis_detected: true

这是一个测试模板
    `;

    const result = manager.validateTemplate(validTemplate, 'ai-ask/test.md');

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    console.log('✅ 安全边界声明验证通过');
  });

  it('应该检测缺少安全边界声明的模板', () => {
    const invalidTemplate = `这是一个没有安全边界的模板`;

    const result = manager.validateTemplate(invalidTemplate, 'ai-ask/test.md');

    console.log('警告信息:', result.warnings);
    expect(result.warnings.length).toBeGreaterThan(0);
    // 检查是否包含安全相关的警告
    expect(
      result.warnings.some(
        (w) =>
          w.toLowerCase().includes('safety') ||
          w.includes('安全') ||
          w.includes('boundary') ||
          w.includes('边界')
      )
    ).toBe(true);
    console.log('✅ 缺少安全边界检测正常');
  });

  it('应该检测空模板', () => {
    const emptyTemplate = '';

    const result = manager.validateTemplate(emptyTemplate, 'ai-ask/test.md');

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('empty'))).toBe(true);
    console.log('✅ 空模板检测正常');
  });
});

describe('安全边界检测集成测试', () => {
  it('应该能加载包含安全边界的模板', async () => {
    // 使用项目根目录的config/prompts/_system/config/default
    const templateBasePath = path.join(process.cwd(), 'config', 'prompts');
    const manager = new PromptTemplateManager(templateBasePath);

    // 加载我们更新过的模板（新的两层机制使用 _system/config/default/ai_ask_v1.md）
    const template = await manager.loadTemplate('_system/config/default/ai_ask_v1.md');

    expect(template.content).toContain('【安全边界与伦理规范】');
    expect(template.content).toContain('诊断禁止');
    expect(template.content).toContain('处方禁止');
    expect(template.content).toContain('保证禁止');
    expect(template.content).toContain('危机识别');

    console.log('✅ 模板安全边界内容验证通过');
    console.log('  - 模板包含安全边界声明');
    console.log('  - 包含所有关键约束类型');
  });
});
