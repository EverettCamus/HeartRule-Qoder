/**
 * Schema Validator - 核心验证服务
 *
 * 职责：
 * - 执行 YAML 脚本的 Schema 验证
 * - 协调 SchemaRegistry 和 ErrorFormatter
 * - 提供统一的验证接口
 */

import * as yaml from 'js-yaml';

import { errorFormatter, type FormattedError } from './error-formatter.js';
import { schemaRegistry, type SchemaType } from './schema-registry.js';
import { SchemaValidationError } from './schema-validation-error.js';

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: FormattedError[];
}

/**
 * Schema Validator 服务
 */
export class SchemaValidator {
  /**
   * 验证 Session 脚本
   */
  public validateSession(data: unknown): ValidationResult {
    return this.validate(data, 'session');
  }

  /**
   * 验证 Technique 脚本（使用 topic schema）
   */
  public validateTechnique(data: unknown): ValidationResult {
    // Technique 脚本的顶层结构包含 topic 字段
    // 需要提取 topic 字段进行验证
    if (typeof data === 'object' && data !== null && 'topic' in data) {
      return this.validate((data as Record<string, unknown>).topic, 'topic');
    }
    // 如果直接传入的就是 topic 对象，则直接验证
    return this.validate(data, 'topic');
  }

  /**
   * 验证单个 Action
   */
  public validateAction(action: unknown, actionType: string): ValidationResult {
    // 首先验证 Action 基础结构
    const baseResult = this.validate(action, 'action-base');
    if (!baseResult.valid) {
      return baseResult;
    }

    // 然后验证特定类型的 config
    if (typeof action === 'object' && action !== null && 'config' in action) {
      const configSchemaType = this.getConfigSchemaType(actionType);
      if (configSchemaType) {
        return this.validate((action as Record<string, unknown>).config, configSchemaType);
      }
    }

    return { valid: true, errors: [] };
  }

  /**
   * 部分验证（用于编辑器增量验证）
   */
  public validatePartial(data: unknown, schemaType: SchemaType): ValidationResult {
    return this.validate(data, schemaType);
  }

  /**
   * 解析并验证 YAML 字符串
   */
  public validateYAML(yamlContent: string): ValidationResult {
    try {
      // 解析 YAML
      const data = yaml.load(yamlContent);

      // 检测脚本类型并验证
      if (this.isSessionScript(data)) {
        return this.validateSession(data);
      } else if (this.isTechniqueScript(data)) {
        return this.validateTechnique(data);
      } else {
        return {
          valid: false,
          errors: [
            {
              path: 'root',
              errorType: 'STRUCTURE_ERROR' as any,
              message: '无法识别的脚本类型',
              expected: 'Session 或 Technique 脚本',
              actual: JSON.stringify(data),
              suggestion: '请确保脚本包含 session 或 topic 顶层字段',
            },
          ],
        };
      }
    } catch (error: any) {
      // YAML 语法错误
      return {
        valid: false,
        errors: [
          {
            path: 'root',
            errorType: 'SYNTAX_ERROR' as any,
            message: `YAML 语法错误: ${error.message}`,
            expected: '合法的 YAML 格式',
            actual: 'YAML 解析失败',
            suggestion: '请检查 YAML 语法，确保缩进正确、引号匹配',
          },
        ],
      };
    }
  }

  /**
   * 验证 Session 脚本，失败时抛出异常
   */
  public validateSessionOrThrow(data: unknown): void {
    const result = this.validateSession(data);
    if (!result.valid) {
      throw new SchemaValidationError('Session 脚本验证失败', result.errors);
    }
  }

  /**
   * 验证 Technique 脚本，失败时抛出异常
   */
  public validateTechniqueOrThrow(data: unknown): void {
    const result = this.validateTechnique(data);
    if (!result.valid) {
      throw new SchemaValidationError('Technique 脚本验证失败', result.errors);
    }
  }

  /**
   * 解析并验证 YAML 字符串，失败时抛出异常
   */
  public validateYAMLOrThrow(yamlContent: string): unknown {
    const result = this.validateYAML(yamlContent);
    if (!result.valid) {
      throw new SchemaValidationError('YAML 脚本验证失败', result.errors);
    }
    // 返回解析后的数据
    return yaml.load(yamlContent);
  }

  /**
   * 核心验证逻辑
   */
  private validate(data: unknown, schemaType: SchemaType): ValidationResult {
    const validateFn = schemaRegistry.getSchema(schemaType);
    const valid = validateFn(data);

    if (valid) {
      return { valid: true, errors: [] };
    }

    // 格式化错误
    const ajvErrors = validateFn.errors || [];
    const formattedErrors = errorFormatter.format(ajvErrors);

    return {
      valid: false,
      errors: formattedErrors,
    };
  }

  /**
   * 检查是否为 Session 脚本
   */
  private isSessionScript(data: unknown): boolean {
    return typeof data === 'object' && data !== null && 'session' in data;
  }

  /**
   * 检查是否为 Technique 脚本
   */
  private isTechniqueScript(data: unknown): boolean {
    return typeof data === 'object' && data !== null && 'topic' in data;
  }

  /**
   * 获取 Action Config 的 Schema 类型
   */
  private getConfigSchemaType(actionType: string): SchemaType | null {
    const schemaMap: Record<string, SchemaType> = {
      ai_ask: 'ai-ask-config',
      ai_say: 'ai-say-config',
      ai_think: 'ai-think-config',
      use_skill: 'use-skill-config',
    };
    return schemaMap[actionType] || null;
  }
}

// 导出单例实例
export const schemaValidator = new SchemaValidator();
