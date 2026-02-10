/**
 * Schema 验证错误详情
 */
export interface ValidationErrorDetail {
  /** 错误字段路径 */
  path: string;
  /** 错误类型 */
  errorType: string;
  /** 错误描述 */
  message: string;
  /** 期望的值或格式 */
  expected?: string;
  /** 实际提供的值 */
  actual?: string;
  /** 修复建议 */
  suggestion?: string;
  /** 正确示例 */
  example?: string;
}

/**
 * Schema 验证失败异常
 *
 * 在 YAML 脚本的 Schema 验证失败时抛出此异常，包含详细的错误列表。
 *
 * @example
 * try {
 *   validator.validateSession(data);
 * } catch (error) {
 *   if (error instanceof SchemaValidationError) {
 *     console.log(error.errors);
 *   }
 * }
 */
export class SchemaValidationError extends Error {
  /** 详细错误列表 */
  public readonly errors: ValidationErrorDetail[];

  constructor(message: string, errors: ValidationErrorDetail[]) {
    super(message);
    this.name = 'SchemaValidationError';
    this.errors = errors;
    Object.setPrototypeOf(this, SchemaValidationError.prototype);
  }

  toApiResponse() {
    return {
      success: false,
      error: 'SCHEMA_VALIDATION_FAILED',
      message: this.message,
      errors: this.errors,
    };
  }

  getFormattedMessage(): string {
    const errorMessages = this.errors.map((err, index) => {
      const suggestion = err.suggestion ? '\n   建议: ' + err.suggestion : '';
      return index + 1 + '. [' + err.path + '] ' + err.message + suggestion;
    });
    return this.message + '\n\n错误详情:\n' + errorMessages.join('\n');
  }
}
