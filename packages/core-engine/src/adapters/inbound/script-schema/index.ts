/**
 * YAML 脚本 Schema 验证体系
 *
 * 统一导出所有验证相关服务和类型
 */

export {
  SchemaValidator,
  schemaValidator,
  type ValidationResult,
} from './validators/schema-validator.js';
export { SchemaRegistry, schemaRegistry, type SchemaType } from './validators/schema-registry.js';
export {
  ErrorFormatter,
  errorFormatter,
  ErrorType,
  type FormattedError,
} from './validators/error-formatter.js';
export {
  SchemaValidationError,
  type ValidationErrorDetail,
} from './validators/schema-validation-error.js';
export {
  SchemaPromptGenerator,
  schemaPromptGenerator,
} from './validators/schema-prompt-generator.js';
export {
  DeprecatedFieldsRegistry,
  deprecatedFieldsRegistry,
  type DeprecatedField,
} from './validators/deprecated-fields-registry.js';
