/**
 * Schema Prompt Generator - 将JSON Schema转换为LLM Prompt约束
 *
 * 职责：
 * - 将JSON Schema转换为结构化自然语言约束
 * - 生成字段说明、类型约束、枚举值、数值范围等
 * - 生成废弃字段警告
 * - 提供正确示例
 */

import type { JSONSchemaType } from 'ajv';

import { deprecatedFieldsRegistry } from './deprecated-fields-registry.js';
import { schemaRegistry, type SchemaType } from './schema-registry.js';

/**
 * Schema Prompt Generator 服务
 */
export class SchemaPromptGenerator {
  /**
   * 生成指定Schema类型的约束Prompt
   */
  public generatePrompt(schemaType: SchemaType): string {
    const validateFn = schemaRegistry.getSchema(schemaType);
    const schema = validateFn.schema as JSONSchemaType<any>;

    if (!schema) {
      return `未找到Schema: ${schemaType}`;
    }

    const title = this.getSchemaTitle(schemaType);
    const sections: string[] = [];

    sections.push(`YAML脚本格式约束（${title}）：\n`);

    // 1. 必填字段
    const requiredFields = this.formatRequiredFields(schema);
    if (requiredFields) {
      sections.push(requiredFields);
    }

    // 2. 可选字段
    const optionalFields = this.formatOptionalFields(schema);
    if (optionalFields) {
      sections.push(optionalFields);
    }

    // 3. 废弃字段警告
    const deprecatedFields = this.formatDeprecatedFields(schemaType);
    if (deprecatedFields) {
      sections.push(deprecatedFields);
    }

    // 4. 示例
    const example = this.generateExample(schemaType);
    if (example) {
      sections.push(`示例：\n${example}`);
    }

    return sections.join('\n');
  }

  /**
   * 生成特定Action Config的约束Prompt
   */
  public generateActionConfigPrompt(actionType: string): string {
    const schemaTypeMap: Record<string, SchemaType> = {
      ai_ask: 'ai-ask-config',
      ai_say: 'ai-say-config',
      ai_think: 'ai-think-config',
      use_skill: 'use-skill-config',
    };

    const schemaType = schemaTypeMap[actionType];
    if (!schemaType) {
      return `未知的Action类型: ${actionType}`;
    }

    return this.generatePrompt(schemaType);
  }

  /**
   * 生成完整Session脚本的约束Prompt
   */
  public generateFullSessionPrompt(): string {
    const sections: string[] = [];

    sections.push('YAML脚本格式约束（完整Session脚本）：\n');
    sections.push('Session脚本必须包含以下结构：');
    sections.push('- session: 顶层会话节点');
    sections.push('  - session_id (string, 必填): 会话唯一标识');
    sections.push('  - session_name (string, 可选): 会话名称');
    sections.push('  - template_scheme (string, 可选): 模板方案');
    sections.push('  - phases (array, 必填): 阶段数组');
    sections.push('    - phase_id (string, 必填): 阶段标识');
    sections.push('    - phase_name (string, 可选): 阶段名称');
    sections.push('    - topics (array, 必填): 话题数组');
    sections.push('      - topic_id (string, 必填): 话题标识');
    sections.push('      - topic_name (string, 可选): 话题名称');
    sections.push('      - actions (array, 必填): 动作数组');
    sections.push(
      '        - action_type (string, 必填): 动作类型 (ai_say/ai_ask/ai_think/use_skill)'
    );
    sections.push('        - action_id (string, 必填): 动作标识');
    sections.push('        - config (object, 必填): 动作配置，根据action_type而定\n');

    sections.push('各Action类型的config约束如下：\n');
    sections.push('=== ai_ask ===');
    sections.push(this.generatePrompt('ai-ask-config'));
    sections.push('\n=== ai_say ===');
    sections.push(this.generatePrompt('ai-say-config'));
    sections.push('\n=== ai_think ===');
    sections.push(this.generatePrompt('ai-think-config'));

    return sections.join('\n');
  }

  /**
   * 获取Schema标题
   */
  private getSchemaTitle(schemaType: SchemaType): string {
    const titleMap: Record<SchemaType, string> = {
      session: 'Session会话脚本',
      phase: 'Phase阶段配置',
      topic: 'Topic话题配置',
      'action-base': 'Action基础配置',
      'ai-ask-config': 'ai_ask动作配置',
      'ai-say-config': 'ai_say动作配置',
      'ai-think-config': 'ai_think动作配置',
      'use-skill-config': 'use_skill动作配置',
      'output-field': '输出字段配置',
    };
    return titleMap[schemaType] || schemaType;
  }

  /**
   * 格式化必填字段
   */
  private formatRequiredFields(schema: JSONSchemaType<any>): string {
    const required = schema.required as string[] | undefined;
    if (!required || required.length === 0) {
      return '';
    }

    const lines: string[] = ['必填字段：'];
    for (const fieldName of required) {
      const property = schema.properties?.[fieldName];
      if (property) {
        const constraint = this.formatFieldConstraint(fieldName, property);
        lines.push(`- ${constraint}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化可选字段
   */
  private formatOptionalFields(schema: JSONSchemaType<any>): string {
    const required = (schema.required as string[]) || [];
    const properties = schema.properties || {};
    const optionalFields = Object.keys(properties).filter(
      (fieldName) => !required.includes(fieldName)
    );

    if (optionalFields.length === 0) {
      return '';
    }

    const lines: string[] = ['\n可选字段：'];
    for (const fieldName of optionalFields) {
      const property = properties[fieldName];
      const constraint = this.formatFieldConstraint(fieldName, property);
      lines.push(`- ${constraint}`);
    }

    return lines.join('\n');
  }

  /**
   * 格式化单个字段约束
   */
  private formatFieldConstraint(fieldName: string, property: any): string {
    const parts: string[] = [fieldName];

    // 类型
    if (property.type) {
      const typeStr = this.formatType(property.type);
      parts.push(`(${typeStr})`);
    }

    // 描述
    if (property.description) {
      parts.push(`: ${property.description}`);
    }

    // 枚举值
    if (property.enum) {
      const enumStr = this.formatEnumValues(property.enum);
      parts.push(`，可选值：${enumStr}`);
    }

    // 数值范围
    if (property.minimum !== undefined || property.maximum !== undefined) {
      const rangeStr = this.formatRange(property.minimum, property.maximum);
      parts.push(`，${rangeStr}`);
    }

    // 字符串长度
    if (property.minLength !== undefined && property.minLength > 0) {
      parts.push('，不能为空');
    }

    // 数组
    if (property.type === 'array' && property.items) {
      if (typeof property.items === 'object' && '$ref' in property.items) {
        parts.push('，数组元素需符合相应Schema');
      }
    }

    return parts.join('');
  }

  /**
   * 格式化类型
   */
  private formatType(type: string | string[]): string {
    if (Array.isArray(type)) {
      return type.join(' | ');
    }

    const typeMap: Record<string, string> = {
      string: 'string',
      number: 'number',
      boolean: 'boolean',
      array: 'array',
      object: 'object',
    };

    return typeMap[type] || type;
  }

  /**
   * 格式化枚举值
   */
  private formatEnumValues(enumArray: any[]): string {
    return enumArray.map((v) => `"${v}"`).join('、');
  }

  /**
   * 格式化数值范围
   */
  private formatRange(minimum?: number, maximum?: number): string {
    if (minimum !== undefined && maximum !== undefined) {
      return `范围${minimum}-${maximum}`;
    } else if (minimum !== undefined) {
      return `最小值${minimum}`;
    } else if (maximum !== undefined) {
      return `最大值${maximum}`;
    }
    return '';
  }

  /**
   * 格式化废弃字段
   */
  private formatDeprecatedFields(schemaType: SchemaType): string {
    const deprecatedFields = deprecatedFieldsRegistry.getDeprecatedFields(schemaType);
    if (deprecatedFields.length === 0) {
      return '';
    }

    const lines: string[] = ['\n禁止使用的废弃字段：'];
    for (const field of deprecatedFields) {
      let line = `- ${field.fieldName}（${field.reason}`;
      if (field.replacement) {
        line += `，请使用${field.replacement}字段`;
      }
      line += '）';
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * 生成示例
   */
  private generateExample(schemaType: SchemaType): string {
    // 根据Schema类型生成不同示例
    const examples: Record<string, string> = {
      'ai-ask-config': `config:
  content: "请问您的名字是？"
  tone: "温暖"
  output:
    - get: "user_name"
      define: "用户姓名"
  max_rounds: 3`,
      'ai-say-config': `config:
  content: "欢迎您参加本次咨询"
  tone: "友好"
  max_rounds: 2`,
      'ai-think-config': `config:
  content: "分析用户的情绪状态"
  output:
    - get: "emotion_state"
      define: "情绪状态评估"`,
    };

    return examples[schemaType] || '';
  }
}

// 导出单例实例
export const schemaPromptGenerator = new SchemaPromptGenerator();
