/**
 * Error Formatter - 格式化 AJV 验证错误为友好的中文提示
 *
 * 职责：
 * - 将 AJV 原始错误转换为结构化错误信息
 * - 生成修复建议
 * - 提供正确示例
 */

import type { ErrorObject } from 'ajv';

/**
 * 错误类别
 */
export enum ErrorType {
  SYNTAX_ERROR = 'SYNTAX_ERROR', // YAML 语法错误
  TYPE_ERROR = 'TYPE_ERROR', // 类型错误
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING', // 缺少必填字段
  ENUM_VALUE_INVALID = 'ENUM_VALUE_INVALID', // 枚举值错误
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION', // 约束错误
  STRUCTURE_ERROR = 'STRUCTURE_ERROR', // 结构错误
}

/**
 * 格式化后的错误信息
 */
export interface FormattedError {
  path: string;
  errorType: ErrorType;
  message: string;
  expected: string;
  actual: string;
  suggestion: string;
  example?: string;
}

/**
 * Error Formatter 服务
 */
export class ErrorFormatter {
  /**
   * 格式化 AJV 错误数组
   */
  public format(ajvErrors: ErrorObject[]): FormattedError[] {
    if (!ajvErrors || ajvErrors.length === 0) {
      return [];
    }

    return ajvErrors.map((error) => this.formatSingleError(error));
  }

  /**
   * 格式化单个错误
   */
  private formatSingleError(error: ErrorObject): FormattedError {
    const path = this.formatPath(error.instancePath, error.params);
    const errorType = this.classifyError(error);
    const message = this.generateMessage(error);
    const expected = this.generateExpected(error);
    const actual = this.generateActual(error);
    const suggestion = this.generateSuggestion(error);
    const example = this.generateExample(error);

    return {
      path,
      errorType,
      message,
      expected,
      actual,
      suggestion,
      example,
    };
  }

  /**
   * 格式化字段路径
   */
  private formatPath(instancePath: string, params: Record<string, unknown>): string {
    let path = instancePath.replace(/^\//, '').replace(/\//g, '.');

    // 处理数组索引
    path = path.replace(/\.(\d+)/g, '[$1]');

    // 处理缺少字段的情况
    if (
      params &&
      typeof params === 'object' &&
      'missingProperty' in params &&
      params.missingProperty
    ) {
      const missingProperty = params.missingProperty as string;
      path = path ? `${path}.${missingProperty}` : missingProperty;
    }

    return path || 'root';
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: ErrorObject): ErrorType {
    switch (error.keyword) {
      case 'required':
        return ErrorType.REQUIRED_FIELD_MISSING;
      case 'enum':
        return ErrorType.ENUM_VALUE_INVALID;
      case 'type':
        return ErrorType.TYPE_ERROR;
      case 'minimum':
      case 'maximum':
      case 'minLength':
      case 'maxLength':
      case 'minItems':
      case 'maxItems':
      case 'pattern':
        return ErrorType.CONSTRAINT_VIOLATION;
      case 'additionalProperties':
        return ErrorType.STRUCTURE_ERROR;
      default:
        return ErrorType.STRUCTURE_ERROR;
    }
  }

  /**
   * 生成错误消息
   */
  private generateMessage(error: ErrorObject): string {
    switch (error.keyword) {
      case 'required':
        return `缺少必填字段 '${error.params.missingProperty}'`;
      case 'enum':
        return `字段值 '${error.data}' 不在允许的枚举范围内`;
      case 'type':
        return `字段类型不正确，期望 ${error.params.type}，实际为 ${typeof error.data}`;
      case 'minimum':
        return `字段值 ${error.data} 小于最小值 ${error.params.limit}`;
      case 'maximum':
        return `字段值 ${error.data} 超过最大值 ${error.params.limit}`;
      case 'minLength': {
        const minLenData = error.data as string | unknown[];
        return `字段长度 ${minLenData?.length || 0} 小于最小长度 ${error.params.limit}`;
      }
      case 'maxLength': {
        const maxLenData = error.data as string | unknown[];
        return `字段长度 ${maxLenData?.length || 0} 超过最大长度 ${error.params.limit}`;
      }
      case 'minItems': {
        const minItemsData = error.data as unknown[];
        return `数组元素数量 ${minItemsData?.length || 0} 小于最小数量 ${error.params.limit}`;
      }
      case 'pattern':
        return `字段值不符合正则表达式模式 ${error.params.pattern}`;
      case 'additionalProperties':
        return `包含不允许的额外字段 '${error.params.additionalProperty}'`;
      default:
        return error.message || '验证失败';
    }
  }

  /**
   * 生成期望值描述
   */
  private generateExpected(error: ErrorObject): string {
    switch (error.keyword) {
      case 'required':
        return `必填字段`;
      case 'enum':
        return error.params.allowedValues?.join(' | ') || '枚举值';
      case 'type':
        return `${error.params.type} 类型`;
      case 'minimum':
        return `>= ${error.params.limit}`;
      case 'maximum':
        return `<= ${error.params.limit}`;
      case 'minLength':
        return `至少 ${error.params.limit} 个字符`;
      case 'maxLength':
        return `最多 ${error.params.limit} 个字符`;
      case 'minItems':
        return `至少 ${error.params.limit} 个元素`;
      case 'pattern':
        return `匹配模式：${error.params.pattern}`;
      default:
        return '符合 Schema 规范';
    }
  }

  /**
   * 生成实际值描述
   */
  private generateActual(error: ErrorObject): string {
    switch (error.keyword) {
      case 'required':
        return '字段不存在';
      case 'enum':
      case 'type':
        return JSON.stringify(error.data);
      case 'minimum':
      case 'maximum':
        return String(error.data);
      case 'minLength': {
        const lenData = error.data as string | unknown[];
        return `${lenData?.length || 0} 个字符`;
      }
      case 'maxLength': {
        const lenData = error.data as string | unknown[];
        return `${lenData?.length || 0} 个字符`;
      }
      case 'minItems': {
        const itemsData = error.data as unknown[];
        return `${itemsData?.length || 0} 个元素`;
      }
      case 'additionalProperties':
        return `存在额外字段 '${error.params.additionalProperty}'`;
      default:
        return JSON.stringify(error.data);
    }
  }

  /**
   * 生成修复建议
   */
  public generateSuggestion(error: ErrorObject): string {
    switch (error.keyword) {
      case 'required':
        return `请添加 ${error.params.missingProperty} 字段`;
      case 'enum': {
        const allowed = error.params.allowedValues?.join('、') || '';
        return `请使用以下值之一：${allowed}`;
      }
      case 'type':
        return `请确保该字段的值为 ${error.params.type} 类型`;
      case 'minimum':
      case 'maximum':
        return `请将值设置在允许的范围内 (${this.generateExpected(error)})`;
      case 'minLength':
      case 'maxLength':
        return `请调整字段长度至 ${this.generateExpected(error)})`;
      case 'minItems':
        return `请至少添加 ${error.params.limit} 个元素`;
      case 'pattern':
        return `请确保字段值符合规则：${error.params.pattern}`;
      case 'additionalProperties':
        return this.generateDeprecatedFieldSuggestion(error);
      default:
        return '请检查字段值是否符合 Schema 规范';
    }
  }

  /**
   * 生成废弃字段的友好提示
   */
  private generateDeprecatedFieldSuggestion(error: ErrorObject): string {
    const fieldName = error.params.additionalProperty;

    // 定义废弃字段映射表
    const deprecatedFields: Record<
      string,
      { reason: string; replacement: string | null; migration?: string }
    > = {
      content_template: {
        reason: '该字段已重命名',
        replacement: 'content',
        migration: '请将 content_template 重命名为 content',
      },
      question_template: {
        reason: '该字段已被废弃',
        replacement: 'content',
        migration: '请使用 content 字段代替 question_template',
      },
      target_variable: {
        reason: '该字段已被 output 配置取代',
        replacement: 'output',
        migration:
          '请使用 output 数组配置变量提取，例如：\noutput:\n  - variable: user_name\n    instruction: 提取用户称呼',
      },
      extraction_prompt: {
        reason: '该字段已被 output.instruction 取代',
        replacement: 'output[].instruction',
        migration: '请在 output 数组中使用 instruction 字段',
      },
      required: {
        reason: '该字段无实际作用已废弃',
        replacement: null,
        migration: '请直接移除该字段，所有 ai_ask 动作都是可选的',
      },
    };

    const deprecatedInfo = deprecatedFields[fieldName];

    if (deprecatedInfo) {
      let suggestion = `字段 '${fieldName}' 已废弃（${deprecatedInfo.reason}）。`;
      if (deprecatedInfo.replacement !== null && deprecatedInfo.replacement !== undefined) {
        suggestion += ` 请使用 '${deprecatedInfo.replacement}' 代替。`;
      }
      if (deprecatedInfo.migration) {
        suggestion += ` ${deprecatedInfo.migration}`;
      }
      return suggestion;
    }

    // 通用的额外字段提示
    return `请移除不允许的字段 '${fieldName}'`;
  }

  /**
   * 生成正确示例
   */
  public generateExample(error: ErrorObject): string | undefined {
    // 根据错误类型生成示例
    switch (error.keyword) {
      case 'required':
        if (error.params.missingProperty === 'action_type') {
          return `action_type: "ai_ask"  # 或 ai_say, ai_think, use_skill`;
        }
        if (error.params.missingProperty === 'content') {
          return `content: "您的内容模板"`;
        }
        break;
      case 'enum':
        if (error.params.allowedValues) {
          return `# 正确的值: ${error.params.allowedValues[0]}`;
        }
        break;
      case 'maximum':
        if (error.schemaPath.includes('max_rounds')) {
          return `max_rounds: 5  # 范围：1-10`;
        }
        break;
    }
    return undefined;
  }
}

// 导出单例实例
export const errorFormatter = new ErrorFormatter();
