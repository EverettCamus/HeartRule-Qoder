/**
 * PlaceholderValidator - 占位符验证器
 *
 * Story 2.1: 验证Action配置中的占位符格式和引用有效性
 *
 * 职责:
 * - 验证占位符格式: {变量名}
 * - 验证输入占位符的变量引用有效性
 * - 提取占位符列表
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * 占位符验证器
 */
export class PlaceholderValidator {
  /**
   * 占位符正则: {变量名}
   * 变量名规则: 字母/下划线/中文开头，后接字母/数字/下划线/中文
   */
  private static readonly PLACEHOLDER_REGEX =
    /\{([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\}/g;

  /**
   * 验证占位符格式
   *
   * @param text - 包含占位符的文本
   * @returns 格式验证结果
   */
  validateFormat(text: string): ValidationResult {
    const errors: string[] = [];

    // 查找所有花括号对
    const allBraces = text.match(/\{[^}]*\}/g) || [];

    for (const brace of allBraces) {
      const content = brace.slice(1, -1); // 去除花括号

      if (!this.isValidPlaceholderName(content)) {
        errors.push(
          `占位符 ${brace} 格式无效: 变量名只能包含字母、数字、下划线、中文，且不能以数字开头`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证占位符引用有效性(针对输入占位符)
   *
   * @param text - 包含占位符的文本
   * @param availableVariables - 当前作用域可访问的变量列表
   * @returns 引用验证结果
   */
  validateReferences(text: string, availableVariables: string[]): ValidationResult {
    const placeholders = this.extractPlaceholders(text);
    const warnings: string[] = [];

    for (const placeholder of placeholders) {
      if (!availableVariables.includes(placeholder)) {
        warnings.push(`占位符 {${placeholder}} 引用的变量未定义，请确认变量在此作用域可访问`);
      }
    }

    // 引用校验不阻断，仅warning
    return {
      valid: true,
      errors: [],
      warnings,
    };
  }

  /**
   * 提取文本中的所有占位符
   *
   * @param text - 包含占位符的文本
   * @returns 占位符变量名数组
   */
  extractPlaceholders(text: string): string[] {
    const matches = text.matchAll(PlaceholderValidator.PLACEHOLDER_REGEX);
    return Array.from(matches, (m) => m[1]);
  }

  /**
   * 检查变量名是否有效
   *
   * @param name - 变量名
   * @returns 是否有效
   */
  private isValidPlaceholderName(name: string): boolean {
    // 允许字母、数字、下划线、中文，但不能以数字开头
    return /^[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*$/.test(name);
  }

  /**
   * 验证Action配置中的占位符
   *
   * @param actionConfig - Action配置对象
   * @param availableVariables - 可用变量列表
   * @returns 综合验证结果
   */
  validateActionConfig(
    actionConfig: Record<string, any>,
    availableVariables: string[] = []
  ): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    // 递归遍历配置对象的所有字符串值
    const validateObject = (obj: any, path: string = '') => {
      if (typeof obj === 'string') {
        // 验证格式
        const formatResult = this.validateFormat(obj);
        if (!formatResult.valid) {
          allErrors.push(...formatResult.errors.map((e) => `${path}: ${e}`));
        }

        // 验证引用(仅对输入字段，如content、prompt等)
        if (path.includes('content') || path.includes('prompt') || path.includes('template')) {
          const refResult = this.validateReferences(obj, availableVariables);
          if (refResult.warnings && refResult.warnings.length > 0) {
            allWarnings.push(...refResult.warnings.map((w) => `${path}: ${w}`));
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          validateObject(item, `${path}[${index}]`);
        });
      } else if (obj !== null && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = path ? `${path}.${key}` : key;
          validateObject(value, newPath);
        });
      }
    };

    validateObject(actionConfig, 'config');

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
    };
  }
}

/**
 * 默认导出单例
 */
export const placeholderValidator = new PlaceholderValidator();
