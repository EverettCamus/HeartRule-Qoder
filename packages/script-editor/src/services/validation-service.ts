/**
 * ValidationService - 脚本编辑器验证服务
 *
 * 职责：
 * - 管理编辑器中的验证触发点
 * - 协调 YAML 解析和 Schema 验证
 * - 提供防抖控制
 * - 格式化验证错误以供 UI 展示
 */

import { schemaValidator } from '@heartrule/core-engine';
import type { ValidationErrorDetail } from '@heartrule/core-engine';

/**
 * 验证触发类型
 */
export enum ValidationTrigger {
  FILE_OPEN = 'FILE_OPEN', // 文件打开时
  CONTENT_CHANGE = 'CONTENT_CHANGE', // 内容变更时（防抖）
  MANUAL = 'MANUAL', // 手动触发
  BEFORE_SAVE = 'BEFORE_SAVE', // 保存前
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
  trigger: ValidationTrigger;
  timestamp: number;
}

/**
 * 验证服务配置
 */
export interface ValidationServiceConfig {
  debounceMs?: number; // 防抖延迟，默认 500ms
  enableAutoValidation?: boolean; // 是否启用自动验证，默认 true
}

/**
 * 脚本编辑器验证服务
 */
export class ValidationService {
  private debounceTimer: number | null = null;
  private config: Required<ValidationServiceConfig>;
  private lastValidationResult: ValidationResult | null = null;

  constructor(config: ValidationServiceConfig = {}) {
    this.config = {
      debounceMs: config.debounceMs ?? 500,
      enableAutoValidation: config.enableAutoValidation ?? true,
    };
  }

  /**
   * 验证 YAML 内容
   */
  public validate(yamlContent: string, trigger: ValidationTrigger): ValidationResult {
    try {
      const result = schemaValidator.validateYAML(yamlContent);

      const validationResult: ValidationResult = {
        valid: result.valid,
        errors: result.errors,
        trigger,
        timestamp: Date.now(),
      };

      this.lastValidationResult = validationResult;
      return validationResult;
    } catch (error) {
      // 处理 YAML 语法错误或其他异常
      const validationResult: ValidationResult = {
        valid: false,
        errors: [
          {
            path: 'root',
            errorType: 'SYNTAX_ERROR',
            message: error instanceof Error ? error.message : '未知错误',
            expected: '合法的 YAML 格式',
            actual: '解析失败',
            suggestion: '请检查 YAML 语法是否正确，注意缩进和格式',
          },
        ],
        trigger,
        timestamp: Date.now(),
      };

      this.lastValidationResult = validationResult;
      return validationResult;
    }
  }

  /**
   * 文件打开时验证
   */
  public validateOnOpen(yamlContent: string): ValidationResult {
    return this.validate(yamlContent, ValidationTrigger.FILE_OPEN);
  }

  /**
   * 内容变更时验证（带防抖）
   */
  public validateOnChange(yamlContent: string, callback: (result: ValidationResult) => void): void {
    if (!this.config.enableAutoValidation) {
      return;
    }

    // 清除之前的定时器
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    // 设置新的防抖定时器
    this.debounceTimer = window.setTimeout(() => {
      const result = this.validate(yamlContent, ValidationTrigger.CONTENT_CHANGE);
      callback(result);
      this.debounceTimer = null;
    }, this.config.debounceMs);
  }

  /**
   * 手动触发验证
   */
  public validateManual(yamlContent: string): ValidationResult {
    return this.validate(yamlContent, ValidationTrigger.MANUAL);
  }

  /**
   * 保存前验证（阻塞式）
   */
  public async validateBeforeSave(yamlContent: string): Promise<ValidationResult> {
    // 清除防抖定时器，立即执行验证
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    return this.validate(yamlContent, ValidationTrigger.BEFORE_SAVE);
  }

  /**
   * 取消防抖中的验证
   */
  public cancelPendingValidation(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * 获取最后一次验证结果
   */
  public getLastResult(): ValidationResult | null {
    return this.lastValidationResult;
  }

  /**
   * 清除验证结果
   */
  public clearResult(): void {
    this.lastValidationResult = null;
  }

  /**
   * 格式化错误消息用于 UI 展示
   */
  public formatErrorForUI(error: ValidationErrorDetail): {
    title: string;
    message: string;
    code: string;
    severity: 'error' | 'warning';
  } {
    return {
      title: `[${error.path}] ${error.errorType}`,
      message: error.message,
      code: error.suggestion || '',
      severity: 'error',
    };
  }

  /**
   * 分组错误（按路径前缀分组）
   */
  public groupErrors(errors: ValidationErrorDetail[]): Map<string, ValidationErrorDetail[]> {
    const groups = new Map<string, ValidationErrorDetail[]>();

    errors.forEach((error) => {
      // 提取路径的顶层部分作为分组键
      const topLevelPath = this.extractTopLevelPath(error.path);

      if (!groups.has(topLevelPath)) {
        groups.set(topLevelPath, []);
      }

      const group = groups.get(topLevelPath);
      if (group) {
        group.push(error);
      }
    });

    return groups;
  }

  /**
   * 提取顶层路径
   */
  private extractTopLevelPath(path: string): string {
    if (path === 'root') return 'root';

    // 提取第一层路径，例如 "phases[0].topics[0].actions[1]" -> "phases[0]"
    const match = path.match(/^([^.[]+(?:\[\d+])?)/);
    return match ? match[1] : path;
  }

  /**
   * 销毁服务
   */
  public dispose(): void {
    this.cancelPendingValidation();
    this.lastValidationResult = null;
  }
}

// 导出默认实例
export const validationService = new ValidationService();
