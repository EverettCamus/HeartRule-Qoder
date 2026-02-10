/**
 * Schema Registry - 管理所有 JSON Schema 定义
 *
 * 职责：
 * - 注册和管理所有 Schema 定义
 * - 编译 Schema 并缓存结果
 * - 提供 Schema 查询接口
 */

import { default as Ajv, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

// Import JSON Schemas
import aiAskSchema from '../actions/ai-ask.schema.json';
import aiSaySchema from '../actions/ai-say.schema.json';
import aiThinkSchema from '../actions/ai-think.schema.json';
import actionBaseSchema from '../actions/base.schema.json';
import useSkillSchema from '../actions/use-skill.schema.json';
import outputFieldSchema from '../common/output-field.schema.json';
import phaseSchema from '../phase.schema.json';
import sessionSchema from '../session.schema.json';
import topicSchema from '../topic.schema.json';

export type SchemaType =
  | 'session'
  | 'phase'
  | 'topic'
  | 'action-base'
  | 'ai-ask-config'
  | 'ai-say-config'
  | 'ai-think-config'
  | 'use-skill-config'
  | 'output-field';

/**
 * Schema 注册表
 */
export class SchemaRegistry {
  private ajv: Ajv;
  private compiledSchemas: Map<SchemaType, ValidateFunction>;

  constructor() {
    // 初始化 AJV with strict mode and all errors
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: true,
      validateFormats: true,
    });

    // 添加格式验证支持
    addFormats(this.ajv);

    this.compiledSchemas = new Map();
    this.registerAllSchemas();
  }

  /**
   * 注册所有 Schema 定义
   */
  private registerAllSchemas(): void {
    // 注册公共 Schema
    this.ajv.addSchema(outputFieldSchema);

    // 注册 Action Schemas
    this.ajv.addSchema(actionBaseSchema);
    this.ajv.addSchema(aiAskSchema);
    this.ajv.addSchema(aiSaySchema);
    this.ajv.addSchema(aiThinkSchema);
    this.ajv.addSchema(useSkillSchema);

    // 注册层级 Schemas
    this.ajv.addSchema(topicSchema);
    this.ajv.addSchema(phaseSchema);
    this.ajv.addSchema(sessionSchema);

    // 预编译常用 Schema
    this.compileSchema('session');
    this.compileSchema('action-base');
    this.compileSchema('ai-ask-config');
    this.compileSchema('ai-say-config');
    this.compileSchema('ai-think-config');
    this.compileSchema('use-skill-config');
  }

  /**
   * 编译并缓存 Schema
   */
  private compileSchema(type: SchemaType): ValidateFunction {
    if (this.compiledSchemas.has(type)) {
      const cachedSchema = this.compiledSchemas.get(type);
      if (cachedSchema) {
        return cachedSchema;
      }
    }

    const schemaId = this.getSchemaId(type);
    const validate = this.ajv.getSchema(schemaId);

    if (!validate) {
      throw new Error(`Schema not found for type: ${type}`);
    }

    this.compiledSchemas.set(type, validate);
    return validate;
  }

  /**
   * 获取 Schema ID
   */
  private getSchemaId(type: SchemaType): string {
    const idMap: Record<SchemaType, string> = {
      session: 'session.schema.json',
      phase: 'phase.schema.json',
      topic: 'topic.schema.json',
      'action-base': 'action-base.schema.json',
      'ai-ask-config': 'ai-ask-config.schema.json',
      'ai-say-config': 'ai-say-config.schema.json',
      'ai-think-config': 'ai-think-config.schema.json',
      'use-skill-config': 'use-skill-config.schema.json',
      'output-field': 'output-field.schema.json',
    };
    return idMap[type];
  }

  /**
   * 获取编译后的 Schema
   */
  public getSchema(type: SchemaType): ValidateFunction {
    return this.compileSchema(type);
  }

  /**
   * 注册自定义 Schema
   */
  public registerSchema(type: string, schema: object): void {
    this.ajv.addSchema(schema, type);
    // 清除缓存，强制重新编译
    this.compiledSchemas.clear();
  }

  /**
   * 重新加载所有 Schemas
   */
  public reloadSchemas(): void {
    this.compiledSchemas.clear();
    this.ajv.removeSchema();
    this.registerAllSchemas();
  }

  /**
   * 获取 AJV 实例（用于高级用途）
   */
  public getAjvInstance(): Ajv {
    return this.ajv;
  }
}

// 导出单例实例
export const schemaRegistry = new SchemaRegistry();
