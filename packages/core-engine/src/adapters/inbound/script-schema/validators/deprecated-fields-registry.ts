/**
 * Deprecated Fields Registry - 废弃字段注册表
 *
 * 职责：
 * - 维护所有废弃字段的映射关系
 * - 提供废弃字段的查询接口
 * - 统一管理字段迁移指南
 */

import type { SchemaType } from './schema-registry.js';

/**
 * 废弃字段信息
 */
export interface DeprecatedField {
  fieldName: string;
  reason: string;
  replacement: string | null;
  migrationGuide: string;
}

/**
 * Schema类型到废弃字段的映射
 */
const deprecatedFieldsMap: Record<string, DeprecatedField[]> = {
  'ai-say-config': [
    {
      fieldName: 'content_template',
      reason: '该字段已重命名',
      replacement: 'content',
      migrationGuide: '请将 content_template 重命名为 content',
    },
  ],
  'ai-ask-config': [
    {
      fieldName: 'question_template',
      reason: '该字段已被废弃',
      replacement: 'content',
      migrationGuide: '请使用 content 字段代替 question_template',
    },
    {
      fieldName: 'target_variable',
      reason: '该字段已被 output 配置取代',
      replacement: 'output',
      migrationGuide: '请使用 output 数组配置变量提取',
    },
    {
      fieldName: 'extraction_prompt',
      reason: '该字段已被 output.instruction 取代',
      replacement: 'output[].instruction',
      migrationGuide: '请在 output 数组中使用 instruction 字段',
    },
    {
      fieldName: 'required',
      reason: '该字段无实际作用已废弃',
      replacement: null,
      migrationGuide: '请直接移除该字段',
    },
  ],
  'ai-think-config': [
    {
      fieldName: 'prompt_template',
      reason: '该字段已被废弃',
      replacement: 'content',
      migrationGuide: '请使用 content 字段代替 prompt_template',
    },
  ],
};

/**
 * Deprecated Fields Registry 服务
 */
export class DeprecatedFieldsRegistry {
  /**
   * 获取指定Schema类型的废弃字段列表
   */
  public getDeprecatedFields(schemaType: SchemaType): DeprecatedField[] {
    return deprecatedFieldsMap[schemaType] || [];
  }

  /**
   * 获取所有废弃字段
   */
  public getAllDeprecatedFields(): Record<string, DeprecatedField[]> {
    return { ...deprecatedFieldsMap };
  }

  /**
   * 检查字段是否废弃
   */
  public isDeprecated(schemaType: SchemaType, fieldName: string): boolean {
    const fields = this.getDeprecatedFields(schemaType);
    return fields.some((field) => field.fieldName === fieldName);
  }

  /**
   * 获取废弃字段的详细信息
   */
  public getDeprecatedFieldInfo(schemaType: SchemaType, fieldName: string): DeprecatedField | null {
    const fields = this.getDeprecatedFields(schemaType);
    return fields.find((field) => field.fieldName === fieldName) || null;
  }
}

// 导出单例实例
export const deprecatedFieldsRegistry = new DeprecatedFieldsRegistry();
