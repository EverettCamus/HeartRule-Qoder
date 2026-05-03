/**
 * Schema Validator - 核心验证服务
 *
 * 职责：
 * - 执行 YAML 脚本的 Schema 验证
 * - 协调 SchemaRegistry 和 ErrorFormatter
 * - 提供统一的验证接口
 */

import * as yaml from 'js-yaml';

import { errorFormatter, ErrorType, type FormattedError } from './error-formatter.js';
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
   * 验证 Global 脚本（global.yaml）
   */
  public validateGlobal(data: unknown): ValidationResult {
    return this.validate(data, 'global');
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
      } else if (this.isGlobalScript(data)) {
        const result = this.validateGlobal(data);
        // 用原始 YAML 内容丰富错误信息，添加行号和变量名
        if (!result.valid) {
          const lineMap = this.buildGlobalLineMap(yamlContent);
          result.errors = this.enrichGlobalErrors(result.errors, lineMap);
        }
        return result;
      } else {
        return {
          valid: false,
          errors: [
            {
              path: 'root',
              errorType: 'STRUCTURE_ERROR' as any,
              message: '无法识别的脚本类型',
              expected: 'Session、Technique 或 Global 脚本',
              actual: JSON.stringify(data),
              suggestion: '请确保脚本包含 session、topic 或 variables 顶层字段',
            },
          ],
        };
      }
    } catch (error: any) {
      // 如果是 global.yaml 且 YAML 解析失败，尝试模糊扫描定位具体问题
      if (this.looksLikeGlobalYAML(yamlContent)) {
        const fuzzyError = this.fuzzyValidateGlobal(yamlContent);
        if (fuzzyError) {
          return { valid: false, errors: [fuzzyError] };
        }
      }
      return {
        valid: false,
        errors: [this.formatYAMLError(error)],
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
   * 验证 Global 脚本，失败时抛出异常
   */
  public validateGlobalOrThrow(data: unknown): void {
    const result = this.validateGlobal(data);
    if (!result.valid) {
      throw new SchemaValidationError('Global 变量定义验证失败', result.errors);
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
   * 格式化 js-yaml 解析错误，提供友好的中文错误信息
   */
  private formatYAMLError(error: any): FormattedError {
    const mark = error.mark as { line: number; column: number; snippet: string } | undefined;
    const rawReason = (error.reason || error.message || '') as string;

    // 翻译常见 YAML 错误
    const { friendlyMessage, fixSuggestion } = this.translateYAMLError(rawReason);

    const line = mark ? mark.line + 1 : undefined; // js-yaml lines are 0-indexed

    let message = line ? `第 ${line} 行: ${friendlyMessage}` : `YAML 语法错误: ${friendlyMessage}`;

    // 附加代码片段
    if (mark?.snippet) {
      message += `\n\n错误位置:\n\`\`\`\n${mark.snippet}\n\`\`\``;
    }

    return {
      path: line ? `第 ${line} 行` : 'root',
      errorType: ErrorType.SYNTAX_ERROR,
      message,
      expected: '合法的 YAML 格式',
      actual: rawReason,
      suggestion: fixSuggestion,
    };
  }

  /**
   * 将 js-yaml 原始错误翻译为友好的中文提示
   */
  private translateYAMLError(reason: string): { friendlyMessage: string; fixSuggestion: string } {
    if (reason.includes('can not read a block mapping entry') || reason.includes('multiline key')) {
      return {
        friendlyMessage: '该行格式错误：只有值没有对应的键名',
        fixSuggestion:
          'YAML 键值对应写成 "键名: 值" 的格式。请检查该行是否缺少键名，例如将单独一行的 "get" 改为 "key: get" 或删除该行',
      };
    }
    if (reason.includes('bad indentation of a sequence entry')) {
      return {
        friendlyMessage: '列表项的缩进不正确，与父级元素未对齐',
        fixSuggestion:
          '请确保列表项（以 "- " 开头）的缩进与同级元素保持一致。建议使用 2 个空格作为统一缩进，不要混用空格和 Tab',
      };
    }
    if (reason.includes('bad indentation of a mapping entry')) {
      return {
        friendlyMessage: '映射键的缩进不正确',
        fixSuggestion: '请确保同级键名对齐，子级属性比父级多缩进 2 个空格',
      };
    }
    if (reason.includes('tab characters must not be used')) {
      return {
        friendlyMessage: '缩进中使用了 Tab 字符，YAML 只允许空格缩进',
        fixSuggestion:
          '请将所有 Tab 字符替换为空格（建议 2 个空格），可在编辑器中设置 "将 Tab 转换为空格"',
      };
    }
    if (reason.includes('duplicated mapping key')) {
      return {
        friendlyMessage: '存在重复的键名',
        fixSuggestion: '同一个对象中不能有相同的键名，请检查并删除或重命名重复的键',
      };
    }
    if (reason.includes('expected a single document')) {
      return {
        friendlyMessage: '文件包含多个 YAML 文档',
        fixSuggestion: '请只保留一个文档内容，删除多余的 "---" 文档分隔符',
      };
    }
    if (reason.includes('mapping values are not allowed')) {
      return {
        friendlyMessage: '该位置不允许出现键值对',
        fixSuggestion:
          '请检查该行的缩进层级是否正确，或是否应该在当前层级使用列表格式（"- " 开头）',
      };
    }
    if (reason.includes('unexpected end of the stream')) {
      return {
        friendlyMessage: 'YAML 内容不完整，存在未闭合的结构',
        fixSuggestion: '请检查是否有未完成的键值对（键名后缺少值），或列表项是否不完整',
      };
    }

    // 默认降级：显示原始错误但保持友好格式
    return {
      friendlyMessage: reason,
      fixSuggestion: '请检查 YAML 语法，确保缩进正确（用空格而非 Tab）、键值对格式完整、引号匹配',
    };
  }

  /** global.yaml 允许的变量属性名 */
  private static readonly GLOBAL_VALID_KEYS = new Set(['name', 'define', 'defaultValue']);

  /**
   * 检查内容是否看起来像 global.yaml（以 variables: 开头）
   */
  private looksLikeGlobalYAML(content: string): boolean {
    return /^\s*variables:/.test(content);
  }

  /**
   * 模糊扫描 global.yaml，在 YAML 解析失败时定位具体业务错误
   *
   * 逐行扫描，追踪当前变量名，报告不在允许列表中的无效关键词。
   * 如果扫描未发现问题（可能是纯缩进等 YAML 语法错误），返回 null。
   */
  private fuzzyValidateGlobal(content: string): FormattedError | null {
    const lines = content.split('\n');
    let currentVariable = '';
    let inBlock = false;
    let lastKeyIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const lineNum = i + 1;
      const trimmed = rawLine.trimStart();
      const indent = rawLine.length - trimmed.length;

      // 跳过空行和注释
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // 顶层 variables:
      if (!inBlock && /^variables:/.test(trimmed)) {
        inBlock = true;
        lastKeyIndent = indent;
        continue;
      }

      if (!inBlock) continue;

      // 新的变量定义项: "- name: <value>"
      const nameMatch = trimmed.match(/^-\s+name:\s*(.*)/);
      if (nameMatch) {
        currentVariable = nameMatch[1].trim() || '(空名称)';
        lastKeyIndent = indent;
        continue;
      }

      // 合法的属性行: "name:", "define:", "defaultValue:"
      if (/^(name|define|defaultValue):/.test(trimmed)) {
        lastKeyIndent = indent;
        continue;
      }

      // 值续行（缩进比上一属性行更深）
      if (indent > lastKeyIndent) {
        continue;
      }

      // 不被识别的行 —— 提取关键词
      const keyword = trimmed.split(':')[0]?.trim() || trimmed;
      if (SchemaValidator.GLOBAL_VALID_KEYS.has(keyword)) {
        // 关键词合法但缩进可能有问题，交给通用 YAML 错误处理
        return null;
      }

      const varLabel = currentVariable ? `变量"${currentVariable}"` : '变量定义区';
      return {
        path: `第 ${lineNum} 行`,
        errorType: ErrorType.SYNTAX_ERROR,
        message: `变量定义格式错误\n\n位置：${varLabel}\n第 ${lineNum} 行出现无效关键词 "${keyword}"\n\nglobal.yaml 中每个变量只允许使用三个属性：name（变量名）、define（变量说明）、defaultValue（默认值）`,
        expected: 'name、define 或 defaultValue',
        actual: trimmed,
        suggestion: currentVariable
          ? `请检查变量"${currentVariable}"中第 ${lineNum} 行的内容。如果 "${keyword}" 的含义是变量说明，请将其写在 define 属性中；如果是多余的，请删除该行`
          : `第 ${lineNum} 行 "${trimmed}" 不是合法的变量属性，请使用 name、define 或 defaultValue`,
      };
    }

    return null;
  }

  /**
   * 构建 global.yaml 的行号映射：数组索引 → { 行号, 变量名 }
   */
  private buildGlobalLineMap(content: string): Map<number, { line: number; name: string }> {
    const lineMap = new Map<number, { line: number; name: string }>();
    const lines = content.split('\n');
    let index = 0;
    let listIndent: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trimStart();
      const indent = rawLine.length - trimmed.length;

      // 从第一个 "- name:" 行确定列表项缩进级别
      if (listIndent === null && /^-\s+name:/.test(trimmed)) {
        listIndent = indent;
      }

      // 同缩进级别的 "- " 开头行视为新变量定义
      if (listIndent !== null && indent === listIndent && /^-/.test(trimmed)) {
        // 尽量提取变量名：匹配 "- key: value" 中的 value 部分
        const nameMatch = trimmed.match(/^-\s+\w+:\s*(.*)/);
        const name = nameMatch?.[1]?.trim() || trimmed.replace(/^-\s+/, '');
        lineMap.set(index, { line: i + 1, name });
        index++;
      }
    }

    return lineMap;
  }

  /**
   * 为 global.yaml 的 schema 验证错误添加行号和变量名
   */
  private enrichGlobalErrors(
    errors: FormattedError[],
    lineMap: Map<number, { line: number; name: string }>
  ): FormattedError[] {
    return errors.map((error) => {
      // 解析路径如 "variables[2]" 或 "variables[2].name"
      const match = error.path.match(/variables\[(\d+)\](?:\.(\w+))?/);
      if (!match) return error;

      const index = parseInt(match[1], 10);
      const fieldName = match[2]; // 具体字段，如 "name"
      const info = lineMap.get(index);

      if (!info) return error;

      const varLabel = info.name ? `变量"${info.name}"` : `第 ${index + 1} 个变量`;
      const lineLabel = `第 ${info.line} 行`;

      // 重新构建 path 和 message
      const path = `${lineLabel} (${varLabel})${fieldName ? '.' + fieldName : ''}`;

      let message = error.message;
      if (fieldName && error.errorType === ErrorType.REQUIRED_FIELD_MISSING) {
        message = `${varLabel}\n${lineLabel}：缺少必填字段 "${fieldName}"\n\n变量定义中必须包含 name 字段来指定变量名称`;
      } else if (error.errorType === ErrorType.STRUCTURE_ERROR) {
        message = `${varLabel}\n${lineLabel}：包含无效字段，只有 name、define、defaultValue 是全局变量允许的属性`;
      } else {
        message = `${varLabel}\n${lineLabel}：${error.message}`;
      }

      let suggestion = error.suggestion;
      if (error.errorType === ErrorType.REQUIRED_FIELD_MISSING && fieldName === 'name') {
        suggestion = `请在 ${lineLabel} 的变量定义中添加 name 字段，例如：\n  - name: 变量名\n    define: 变量说明`;
      }
      if (error.errorType === ErrorType.STRUCTURE_ERROR) {
        suggestion = `请检查 ${lineLabel} 的变量定义，确保只使用 name、define、defaultValue 三个属性。如果该字段含义是变量名，请使用 name 代替`;
      }

      return { ...error, path, message, suggestion };
    });
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
   * 检查是否为 Global 脚本（global.yaml）
   */
  private isGlobalScript(data: unknown): boolean {
    return typeof data === 'object' && data !== null && 'variables' in data;
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
