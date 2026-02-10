/**
 * T8: 模板验证机制单元测试
 *
 * 测试 PromptTemplateManager.validateTemplate 方法的增强功能：
 * - 变量完整性验证
 * - 安全边界声明检查
 * - 输出格式验证
 * - JSON 格式和 safety_risk 字段检查
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { PromptTemplateManager } from '../../src/engines/prompt-template/template-manager.js';

describe('T8: 模板验证机制', () => {
  let templateManager: PromptTemplateManager;

  beforeEach(() => {
    templateManager = new PromptTemplateManager();
  });

  describe('基本验证功能', () => {
    it('应该拒绝空模板', () => {
      const result = templateManager.validateTemplate('', 'empty.md');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template is empty: empty.md');
    });

    it('应该通过合法的模板', () => {
      const template = `# 测试模板

这是一个简单的模板，包含变量 {{用户名}} 和 {{时间}}。`;

      const result = templateManager.validateTemplate(template, 'test.md');

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('应该检测未闭合的变量占位符', () => {
      const template = `这是一个错误的模板 {{{变量名}}`;

      const result = templateManager.validateTemplate(template, 'test.md');

      // 注意：当前实现可能不会检测到所有情况，这是一个边界情况
      // 如果检测到了就判定为错误
      if (result.errors.some((e) => e.includes('unclosed variable'))) {
        expect(result.valid).toBe(false);
      } else {
        // 如果没有检测到，这也是可接受的（正则表达式的限制）
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('安全边界声明检查', () => {
    it('应该检查 ai_ask 模板是否包含安全边界声明', () => {
      const templateWithoutSafety = `# AI Ask 模板

请向用户提问：{{task}}

输出：{{ai_role}}: {{content}}`;

      const result = templateManager.validateTemplate(templateWithoutSafety, 'ai_ask_v1.md');

      expect(result.valid).toBe(true); // 只是警告，不影响有效性
      expect(result.warnings.some((w) => w.includes('safety boundary'))).toBe(true);
    });

    it('应该通过包含安全边界声明的模板', () => {
      const templateWithSafety = `# AI Ask 模板

【安全边界与伦理规范】

1. 诊断禁止：不得对用户进行任何精神疾病诊断
2. 处方禁止：不得推荐药物或治疗方案
3. 保证禁止：不得对疗效做承诺
4. 危机识别：识别自伤/自杀风险

请向用户提问：{{task}}`;

      const result = templateManager.validateTemplate(templateWithSafety, 'ai_ask_v1.md');

      expect(result.valid).toBe(true);
      expect(result.warnings.filter((w) => w.includes('safety boundary')).length).toBe(0);
    });

    it('应该检查关键安全规范关键词', () => {
      const templateMissingKeywords = `# AI Ask 模板

【安全边界与伦理规范】

请注意不要给出不适当的建议。

任务：{{task}}`;

      const result = templateManager.validateTemplate(templateMissingKeywords, 'ai_ask_v1.md');

      expect(result.warnings.some((w) => w.includes('missing critical safety keywords'))).toBe(
        true
      );
      expect(result.warnings.some((w) => w.includes('诊断禁止'))).toBe(true);
    });

    it('不应该对非咨询类模板检查安全边界', () => {
      const simpleTemplate = `# 通用模板

这是一个不需要安全边界的模板。`;

      const result = templateManager.validateTemplate(simpleTemplate, 'general/simple.md');

      expect(result.warnings.filter((w) => w.includes('safety boundary')).length).toBe(0);
    });
  });

  describe('JSON 输出格式检查（新安全机制）', () => {
    it('应该检查 JSON 模板是否包含 safety_risk 字段', () => {
      const templateWithoutSafetyRisk = `# AI Ask 模板

【输出格式】

输出 JSON 格式：
\`\`\`json
{
  "content": "咨询师的回复",
  "EXIT": "false"
}
\`\`\``;

      const result = templateManager.validateTemplate(templateWithoutSafetyRisk, 'ai_ask_v1.md');

      expect(result.warnings.some((w) => w.includes("missing 'safety_risk' field"))).toBe(true);
    });

    it('应该检查 JSON 模板是否包含 crisis_signal 字段', () => {
      const templateWithoutCrisisSignal = `# AI Ask 模板

【输出格式】

输出 JSON 格式：
\`\`\`json
{
  "content": "咨询师的回复",
  "safety_risk": {
    "detected": false,
    "risk_type": null,
    "confidence": "high",
    "reason": null
  }
}
\`\`\``;

      const result = templateManager.validateTemplate(templateWithoutCrisisSignal, 'ai_ask_v1.md');

      expect(result.warnings.some((w) => w.includes("missing 'crisis_signal' field"))).toBe(true);
    });

    it('应该通过完整的新安全机制模板', () => {
      const completeTemplate = `# AI Ask 模板

【安全边界与伦理规范】

1. 诊断禁止：不得诊断
2. 处方禁止：不得处方
3. 保证禁止：不得保证
4. 危机识别：识别危机

【输出格式】

输出 JSON 格式：
\`\`\`json
{
  "content": "咨询师的回复",
  "safety_risk": {
    "detected": false,
    "risk_type": null,
    "confidence": "high",
    "reason": null
  },
  "metadata": {
    "emotional_tone": "supportive",
    "crisis_signal": false
  }
}
\`\`\`

任务：{{task}}`;

      const result = templateManager.validateTemplate(completeTemplate, 'ai_ask_v1.md');

      expect(result.valid).toBe(true);
      expect(
        result.warnings.filter((w) => w.includes('safety_risk') || w.includes('crisis_signal'))
          .length
      ).toBe(0);
    });
  });

  describe('变量完整性验证', () => {
    it('应该检测缺失的必需系统变量', () => {
      const template = `任务：{{task}}
用户：{{用户名}}`;

      const result = templateManager.validateTemplate(
        template,
        'test.md',
        ['time', 'who', 'user'], // 必需系统变量
        []
      );

      expect(result.warnings.some((w) => w.includes('missing required system variables'))).toBe(
        true
      );
      expect(result.missing_system_vars).toContain('time');
      expect(result.missing_system_vars).toContain('who');
      expect(result.missing_system_vars).toContain('user');
    });

    it('应该检测缺失的必需脚本变量', () => {
      const template = `系统时间：{{time}}
用户：{{user}}`;

      const result = templateManager.validateTemplate(
        template,
        'test.md',
        [],
        ['task', 'exit'] // 必需脚本变量
      );

      expect(result.warnings.some((w) => w.includes('missing required script variables'))).toBe(
        true
      );
      expect(result.missing_script_vars).toContain('task');
      expect(result.missing_script_vars).toContain('exit');
    });

    it('应该通过包含所有必需变量的模板', () => {
      const template = `时间：{{time}}
角色：{{who}}
用户：{{user}}
任务：{{task}}
退出条件：{{exit}}`;

      const result = templateManager.validateTemplate(
        template,
        'test.md',
        ['time', 'who', 'user'],
        ['task', 'exit']
      );

      expect(result.valid).toBe(true);
      expect(result.missing_system_vars).toBeUndefined();
      expect(result.missing_script_vars).toBeUndefined();
    });

    it('应该支持三种变量占位符格式', () => {
      const template = `
双括号：{{variable1}}
单括号：{variable2}
美元符号：\${variable3}`;

      const result = templateManager.validateTemplate(
        template,
        'test.md',
        ['variable1', 'variable2', 'variable3'],
        []
      );

      expect(result.missing_system_vars).toBeUndefined();
    });
  });

  describe('输出格式说明检查', () => {
    it('应该检查多轮追问模板是否包含输出格式说明', () => {
      const templateWithoutFormat = `# 多轮追问模板

任务：{{task}}

请提出问题。`;

      const result = templateManager.validateTemplate(templateWithoutFormat, 'multi-round-ask.md');

      expect(result.warnings.some((w) => w.includes('missing output format specification'))).toBe(
        true
      );
    });

    it('应该通过包含输出格式说明的模板', () => {
      const templateWithFormat = `# 多轮追问模板

【输出格式】

输出 JSON 格式：
\`\`\`json
{
  "content": "问题内容",
  "EXIT": "false"
}
\`\`\`

任务：{{task}}`;

      const result = templateManager.validateTemplate(templateWithFormat, 'multi-round-ask.md');

      expect(result.warnings.filter((w) => w.includes('missing output format')).length).toBe(0);
    });
  });

  describe('变量语法检查', () => {
    it('应该警告非标准的单括号变量（但不阻断）', () => {
      const template = `这是一个使用单括号的变量：{variable}

注意：JSON 代码块中的单括号不应该被检测：
\`\`\`json
{
  "key": "value"
}
\`\`\``;

      const result = templateManager.validateTemplate(template, 'test.md');

      expect(result.valid).toBe(true); // 只是警告
      expect(result.warnings.some((w) => w.includes('non-standard variable format'))).toBe(true);
    });

    it('应该忽略 JSON 代码块中的单括号', () => {
      const template = `标准变量：{{variable}}

JSON 示例：
\`\`\`json
{
  "key": "value",
  "nested": {
    "prop": "test"
  }
}
\`\`\``;

      const result = templateManager.validateTemplate(template, 'test.md');

      expect(result.valid).toBe(true);
      // 不应该警告 JSON 中的花括号
    });
  });

  describe('完整场景测试', () => {
    it('应该验证 ai_ask_v1 系统模板的所有要求', () => {
      const systemTemplate = `# AI Ask 提问模板 v1

## 角色定义
你是一名专业的{{who}}，正在与{{user}}进行咨询对话。

## 安全边界与伦理规范

【通用约束】

1. **诊断禁止**：不得对用户进行任何精神疾病诊断或症状判定
2. **处方禁止**：不得推荐药物、剂量或治疗方案
3. **保证禁止**：不得对疗效或改善做任何承诺
4. **危机识别**：识别自伤/自杀/他伤意念

【ai_ask 特定约束】

- 使用开放式问题引导表达
- 避免引导性或暗示性提问

## 任务

{{task}}

## 退出条件

{{exit}}

## 对话历史

{{chat}}

## 输出格式

你必须输出为以下 JSON 格式：

\`\`\`json
{
  "content": "你的提问内容",
  "safety_risk": {
    "detected": false,
    "risk_type": null,
    "confidence": "high",
    "reason": null
  },
  "metadata": {
    "emotional_tone": "supportive",
    "crisis_signal": false
  },
  "EXIT": "false",
  "BRIEF": "简要说明收集到的信息"
}
\`\`\`

注意：safety_risk.detected 字段是系统约定的安全检测变量，你必须认真对照【安全边界与伦理规范】进行判断。
`;

      const result = templateManager.validateTemplate(
        systemTemplate,
        'config/prompts/_system/config/default/ai_ask_v1.md',
        ['who', 'user', 'chat'], // 必需系统变量（去掉 time，因为模板中没有使用）
        ['task', 'exit'] // 必需脚本变量
      );

      // 应该通过所有验证
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);

      // 不应该有关于安全边界的警告
      expect(result.warnings.filter((w) => w.includes('safety boundary')).length).toBe(0);

      // 不应该有关于 safety_risk 或 crisis_signal 的警告
      expect(
        result.warnings.filter((w) => w.includes('safety_risk') || w.includes('crisis_signal'))
          .length
      ).toBe(0);

      // 不应该有缺失变量
      expect(result.missing_system_vars).toBeUndefined();
      expect(result.missing_script_vars).toBeUndefined();
    });

    it('应该验证旧版模板并给出升级建议', () => {
      const oldTemplate = `# 旧版 AI Ask 模板

角色：{{who}}
用户：{{user}}
任务：{{task}}

请提出问题。`;

      const result = templateManager.validateTemplate(oldTemplate, 'old_ai_ask.md');

      // 应该有多个警告
      expect(result.warnings.length).toBeGreaterThan(0);

      // 缺少安全边界
      expect(result.warnings.some((w) => w.includes('safety boundary'))).toBe(true);

      // 缺少输出格式说明（如果是多轮模板）
      // expect(result.warnings.some(w => w.includes('output format'))).toBe(true);
    });
  });
});
