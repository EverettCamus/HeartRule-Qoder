import * as yaml from 'js-yaml';

import { schemaValidator } from '../../adapters/inbound/script-schema/index.js';

/**
 * YAML脚本解析器
 */
export class YAMLParser {
  /**
   * 解析YAML字符串
   */
  parse(content: string): unknown {
    try {
      return yaml.load(content);
    } catch (error) {
      throw new Error(`YAML parsing failed: ${(error as Error).message}`);
    }
  }

  /**
   * 序列化为YAML字符串
   */
  stringify(data: unknown): string {
    try {
      return yaml.dump(data);
    } catch (error) {
      throw new Error(`YAML stringification failed: ${(error as Error).message}`);
    }
  }

  /**
   * 验证会谈流程脚本 Schema
   *
   * 使用新的 JSON Schema 验证体系替代原有的 Zod 验证
   * 验证失败时抛出 SchemaValidationError 异常
   */
  validateSessionScript(data: unknown): void {
    schemaValidator.validateSessionOrThrow(data);
  }

  /**
   * 验证咨询技术脚本 Schema
   *
   * 使用新的 JSON Schema 验证体系替代原有的 Zod 验证
   * 验证失败时抛出 SchemaValidationError 异常
   */
  validateTechniqueScript(data: unknown): void {
    schemaValidator.validateTechniqueOrThrow(data);
  }
}
