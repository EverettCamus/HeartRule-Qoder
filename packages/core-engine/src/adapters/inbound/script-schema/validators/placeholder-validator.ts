/**
 * Placeholder Validator
 * Story 2.1: Topic默认Action模板语义与策略定义
 * 
 * 验证Action配置中的占位符格式和引用有效性
 */

/**
 * 验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * 占位符验证器
 * 验证Action配置中的占位符格式和引用有效性
 */
export class PlaceholderValidator {
  /**
   * 占位符正则: {变量名}
   * 允许字母、数字、下划线、中文,但不能以数字开头
   */
  private static readonly PLACEHOLDER_REGEX = /\{([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)\}/g;

  /**
   * 通用占位符正则(匹配任何{}包裹的内容)
   */
  private static readonly GENERIC_PLACEHOLDER_REGEX = /\{([^}]+)\}/g;

  /**
   * 验证占位符格式
   * 
   * @param text - 包含占位符的文本
   * @returns 格式验证结果
   */
  validateFormat(text: string): ValidationResult {
    const errors: string[] = [];

    // 提取所有{}包裹的内容
    const allPlaceholders = Array.from(
      text.matchAll(PlaceholderValidator.GENERIC_PLACEHOLDER_REGEX),
      (m) => m[1]
    );

    // 验证每个占位符是否合法
    for (const placeholder of allPlaceholders) {
      if (!this.isValidPlaceholderName(placeholder)) {
        errors.push(
          `Placeholder {${placeholder}} format invalid, variable name can only contain letters, numbers, underscores, Chinese characters`
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
        warnings.push(
          `Placeholder {${placeholder}} references undefined variable, please confirm variable is accessible in this scope`
        );
      }
    }

    return {
      valid: true, // 引用校验不阻断,仅warning
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
   * 检查占位符名称是否有效
   * 
   * @param name - 占位符变量名
   * @returns 是否有效
   */
  private isValidPlaceholderName(name: string): boolean {
    // 允许字母、数字、下划线、中文,但不能以数字开头
    return /^[a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*$/.test(name);
  }

  /**
   * 验证Action配置中的所有占位符
   * 
   * @param actionConfig - Action配置对象
   * @param availableVariables - 可用变量列表(可选)
   * @returns 验证结果
   */
  validateActionConfig(
    actionConfig: Record<string, any>,
    availableVariables?: string[]
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 递归检查所有字符串字段中的占位符
    const checkObject = (obj: any, path: string = '') => {
      if (typeof obj === 'string') {
        // 验证格式
        const formatResult = this.validateFormat(obj);
        if (!formatResult.valid) {
          errors.push(...formatResult.errors.map((err) => `${path}: ${err}`));
        }

        // 如果提供了可用变量列表,验证引用
        if (availableVariables && formatResult.valid) {
          const refResult = this.validateReferences(obj, availableVariables);
          if (refResult.warnings && refResult.warnings.length > 0) {
            warnings.push(...refResult.warnings.map((warn) => `${path}: ${warn}`));
          }
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => checkObject(item, `${path}[${index}]`));
      } else if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([key, value]) => {
          const newPath = path ? `${path}.${key}` : key;
          checkObject(value, newPath);
        });
      }
    };

    checkObject(actionConfig, 'actionConfig');

    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
