import type { TemplateProvider } from './template-provider.js';

/**
 * 提示词模板定义
 */
export interface PromptTemplate {
  templateId: string;
  content: string;
  variables: {
    scriptVars: string[];
    systemVars: string[];
  };
}

/**
 * 提示词模板管理器
 * 负责加载提示词模板并进行两层变量替换
 * 支持数据库和文件系统两种模板源
 */
export class PromptTemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private templateBasePath?: string;
  private projectId?: string;
  private templateProvider?: TemplateProvider;

  constructor(templateBasePathOrProjectId?: string, templateProvider?: TemplateProvider) {
    // 兼容旧版本：如果传入的是路径（包含 / 或 \），则作为templateBasePath
    if (templateBasePathOrProjectId && (templateBasePathOrProjectId.includes('/') || templateBasePathOrProjectId.includes('\\'))) {
      this.templateBasePath = templateBasePathOrProjectId;
    } else {
      this.projectId = templateBasePathOrProjectId;
    }
    this.templateProvider = templateProvider;
  }

  /**
   * 加载提示词模板
   * @param templatePath 相对于 templateBasePath 的路径，如 'ai-say/mainline-a-introduce-concept.md'
   */
  async loadTemplate(templatePath: string): Promise<PromptTemplate> {
    const templateId = templatePath.replace(/\//g, '_').replace('.md', '');

    // 检查缓存
    if (this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    // 如果有 TemplateProvider，使用数据库模式
    if (this.templateProvider && this.projectId) {
      return await this.loadTemplateFromDatabase(templatePath, templateId);
    }
    
    // 否则使用文件系统模式（兼容旧版本）
    return await this.loadTemplateFromFilesystem(templatePath, templateId);
  }

  /**
   * 从数据库加载模板
   */
  private async loadTemplateFromDatabase(templatePath: string, templateId: string): Promise<PromptTemplate> {
    if (!this.templateProvider || !this.projectId) {
      throw new Error('[TemplateManager] Template provider or project ID not configured');
    }

    try {
      const templateData = await this.templateProvider.getTemplate(this.projectId, templatePath);
      
      if (!templateData) {
        throw new Error(`Template not found in database: ${templatePath}`);
      }

      const content = templateData.content;
      const variables = this.extractVariables(content);

      // 开发模式下验证模板
      if (process.env.NODE_ENV === 'development') {
        const validation = this.validateTemplate(content, templatePath);
        if (!validation.valid) {
          console.error(`[TemplateManager] ❌ Template validation failed for ${templatePath}:`, validation.errors);
        }
        if (validation.warnings.length > 0) {
          console.warn(`[TemplateManager] ⚠️ Template validation warnings for ${templatePath}:`, validation.warnings);
        }
      }

      const template: PromptTemplate = {
        templateId,
        content,
        variables,
      };

      // 缓存模板
      this.templates.set(templateId, template);
      return template;
    } catch (error: any) {
      throw new Error(`Failed to load template from database ${templatePath}: ${error.message}`);
    }
  }

  /**
   * 从文件系统加载模板（兼容旧版本）
   */
  private async loadTemplateFromFilesystem(templatePath: string, templateId: string): Promise<PromptTemplate> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const basePath = this.templateBasePath || path.join(process.cwd(), 'config', 'prompts');
    const fullPath = path.join(basePath, templatePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const variables = this.extractVariables(content);

      // 开发模式下验证模板
      if (process.env.NODE_ENV === 'development') {
        const validation = this.validateTemplate(content, templatePath);
        if (!validation.valid) {
          console.error(`[TemplateManager] ❌ Template validation failed for ${templatePath}:`, validation.errors);
        }
        if (validation.warnings.length > 0) {
          console.warn(`[TemplateManager] ⚠️ Template validation warnings for ${templatePath}:`, validation.warnings);
        }
      }

      const template: PromptTemplate = {
        templateId,
        content,
        variables,
      };

      // 缓存模板
      this.templates.set(templateId, template);
      return template;
    } catch (error: any) {
      throw new Error(`Failed to load template from ${fullPath}: ${error.message}`);
    }
  }

  /**
   * 获取已加载的模板
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * 两层变量替换
   * @param template 原始模板内容
   * @param scriptVariables 脚本层变量
   * @param systemVariables 系统层变量
   * @returns 完成替换的提示词
   */
  substituteVariables(
    template: string,
    scriptVariables: Map<string, any>,
    systemVariables: Record<string, any>
  ): string {
    let result = template;

    // 内部辅助函数：支持三种占位符格式 {{var}}, {var}, ${var}
    const replaceWithAllPatterns = (text: string, key: string, value: any): string => {
      const escapedKey = this.escapeRegex(key);
      const patterns = [
        `\\{\\{${escapedKey}\\}\\}`,
        `\\{${escapedKey}\\}`,
        `\\$\{${escapedKey}\\}`,
      ];
      let updatedText = text;
      patterns.forEach((patternStr) => {
        updatedText = updatedText.replace(new RegExp(patternStr, 'g'), String(value ?? ''));
      });
      return updatedText;
    };

    // 第一层：替换系统变量
    Object.entries(systemVariables).forEach(([key, value]) => {
      result = replaceWithAllPatterns(result, key, value);
    });

    // 第二层：替换脚本变量
    scriptVariables.forEach((value, key) => {
      result = replaceWithAllPatterns(result, key, value);
    });

    return result;
  }

  /**
   * 提取模板中的变量
   * @param template 模板内容
   * @returns 统一的变量列表（统一使用 {{变量名}} 格式）
   */
  extractVariables(template: string): {
    scriptVars: string[];
    systemVars: string[];
  } {
    const scriptVars: string[] = [];
    const systemVars: string[] = [];

    // 匹配 {{变量名}} 格式的变量
    const unifiedPattern = /\{\{([^{}]+?)\}\}/g;
    let match;
    while ((match = unifiedPattern.exec(template)) !== null) {
      const varName = match[1].trim();
      // 根据变量名判断是系统变量还是脚本变量
      if (this.isSystemVariable(varName)) {
        if (!systemVars.includes(varName)) {
          systemVars.push(varName);
        }
      } else {
        if (!scriptVars.includes(varName)) {
          scriptVars.push(varName);
        }
      }
    }

    return { scriptVars, systemVars };
  }

  /**
   * 判断是否为系统变量
   * 系统变量通常是固定的几个
   */
  private isSystemVariable(varName: string): boolean {
    const systemVariables = [
      'time',
      'who',
      'user',
      'chat_history',
      'tone',
      'topic_content',
      'understanding_threshold',
      'current_round',
      'max_rounds',
    ];
    return systemVariables.includes(varName);
  }

  /**
   * 验证变量是否完整替换
   * @param text 替换后的文本
   * @returns 未替换的变量列表
   */
  validateSubstitution(text: string): string[] {
    const unreplacedVars: string[] = [];

    // 检查未替换的统一变量格式 {{变量名}}
    const unifiedPattern = /\{\{([^{}]+?)\}\}/g;
    let match;
    while ((match = unifiedPattern.exec(text)) !== null) {
      unreplacedVars.push(`{{${match[1].trim()}}}`);
    }

    return unreplacedVars;
  }

  /**
   * 清空模板缓存
   */
  clearCache(): void {
    this.templates.clear();
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 验证模板内容（增强版，符合 T8 要求）
   * 
   * 验证规则：
   * 1. 模板是否为空
   * 2. 安全边界声明检查（ai-ask/ai-say 模板）
   * 3. 变量占位符语法检查
   * 4. 未闭合的变量占位符检查
   * 5. 输出格式说明检查（结构化输出模板）
   * 6. JSON 输出格式检查（新安全机制）
   * 
   * @param templateContent 模板内容
   * @param templatePath 模板路径（用于错误提示）
   * @param requiredSystemVars 必需的系统变量列表（可选）
   * @param requiredScriptVars 必需的脚本变量列表（可选）
   * @returns 验证结果
   */
  validateTemplate(
    templateContent: string,
    templatePath: string,
    requiredSystemVars?: string[],
    requiredScriptVars?: string[]
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    missing_system_vars?: string[];
    missing_script_vars?: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const missing_system_vars: string[] = [];
    const missing_script_vars: string[] = [];

    // 1. 检查模板是否为空
    if (!templateContent || templateContent.trim() === '') {
      errors.push(`Template is empty: ${templatePath}`);
      return { valid: false, errors, warnings };
    }

    // 2. 检查安全边界声明（仅对 ai-ask 和 ai-say 模板）
    const isConsultingTemplate = templatePath.includes('ai_ask') || templatePath.includes('ai_say') ||
      templatePath.includes('ai-ask/') || templatePath.includes('ai-say/');
    
    if (isConsultingTemplate) {
      const hasSafetyBoundary = templateContent.includes('【安全边界与伦理规范】') ||
        templateContent.includes('安全边界') ||
        templateContent.includes('Safety Boundary');
      
      if (!hasSafetyBoundary) {
        warnings.push(
          `Template missing safety boundary declaration: ${templatePath}. ` +
          `Consider adding 【安全边界与伦理规范】 section.`
        );
      }

      // 检查是否包含关键安全规范
      const criticalKeywords = ['诊断禁止', '处方禁止', '保证禁止', '危机识别'];
      const missingKeywords = criticalKeywords.filter(keyword => !templateContent.includes(keyword));
      
      if (missingKeywords.length > 0) {
        warnings.push(
          `Template missing critical safety keywords in ${templatePath}: ${missingKeywords.join(', ')}`
        );
      }

      // T8 新增：检查 JSON 输出格式中是否包含 safety_risk 字段
      if (templateContent.includes('JSON') || templateContent.includes('输出格式')) {
        const hasSafetyRiskField = templateContent.includes('safety_risk') || 
          templateContent.includes('"safety_risk"');
        
        if (!hasSafetyRiskField) {
          warnings.push(
            `Template ${templatePath} uses JSON output but missing 'safety_risk' field. ` +
            `This is required for the new safety detection mechanism.`
          );
        }

        // 检查是否包含 crisis_signal 字段
        const hasCrisisSignal = templateContent.includes('crisis_signal') || 
          templateContent.includes('"crisis_signal"');
        
        if (!hasCrisisSignal) {
          warnings.push(
            `Template ${templatePath} missing 'crisis_signal' field in metadata. ` +
            `This is recommended for crisis detection.`
          );
        }
      }
    }

    // 3. 检查变量占位符语法是否正确
    // 检测非标准的变量格式（如只有单个花括号的变量）
    const singleBracePattern = /(?<!\{)\{([^{}]+?)\}(?!\})/g;
    const singleBraceMatches = templateContent.match(singleBracePattern);
    
    if (singleBraceMatches && singleBraceMatches.length > 0) {
      // 过滤掉 JSON 示例中的花括号（通常在代码块中）
      const codeBlockPattern = /```[\s\S]*?```/g;
      const contentWithoutCodeBlocks = templateContent.replace(codeBlockPattern, '');
      const validMatches = contentWithoutCodeBlocks.match(singleBracePattern);
      
      if (validMatches && validMatches.length > 0) {
        warnings.push(
          `Template may contain non-standard variable format in ${templatePath}. ` +
          `Found single-brace variables: ${validMatches.slice(0, 3).join(', ')}... ` +
          `Consider using double braces {{var}} for consistency.`
        );
      }
    }

    // 4. 检查是否有未闭合的变量占位符
    const unclosedDoubleBrace = /\{\{[^}]*$|^[^{]*\}\}/g;
    if (unclosedDoubleBrace.test(templateContent)) {
      errors.push(`Template has unclosed variable placeholders in ${templatePath}`);
    }

    // 5. 检查是否包含必要的输出格式说明（仅对需要结构化输出的模板）
    if (templatePath.includes('multi-round-ask') || templatePath.includes('mainline')) {
      const hasOutputFormat = templateContent.includes('JSON') || 
        templateContent.includes('输出格式') ||
        templateContent.includes('Output Format');
      
      if (!hasOutputFormat) {
        warnings.push(
          `Template ${templatePath} may be missing output format specification. ` +
          `Structured output templates should include JSON format examples.`
        );
      }
    }

    // T8 新增：6. 变量完整性验证
    if (requiredSystemVars && requiredSystemVars.length > 0) {
      for (const varName of requiredSystemVars) {
        const patterns = [
          `\\{\\{${this.escapeRegex(varName)}\\}\\}`,
          `\\{${this.escapeRegex(varName)}\\}`,
          `\\$\\{${this.escapeRegex(varName)}\\}`,
        ];
        
        const found = patterns.some(pattern => new RegExp(pattern).test(templateContent));
        
        if (!found) {
          missing_system_vars.push(varName);
        }
      }

      if (missing_system_vars.length > 0) {
        warnings.push(
          `Template ${templatePath} missing required system variables: ${missing_system_vars.join(', ')}`
        );
      }
    }

    if (requiredScriptVars && requiredScriptVars.length > 0) {
      for (const varName of requiredScriptVars) {
        const patterns = [
          `\\{\\{${this.escapeRegex(varName)}\\}\\}`,
          `\\{${this.escapeRegex(varName)}\\}`,
          `\\$\\{${this.escapeRegex(varName)}\\}`,
        ];
        
        const found = patterns.some(pattern => new RegExp(pattern).test(templateContent));
        
        if (!found) {
          missing_script_vars.push(varName);
        }
      }

      if (missing_script_vars.length > 0) {
        warnings.push(
          `Template ${templatePath} missing required script variables: ${missing_script_vars.join(', ')}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missing_system_vars: missing_system_vars.length > 0 ? missing_system_vars : undefined,
      missing_script_vars: missing_script_vars.length > 0 ? missing_script_vars : undefined,
    };
  }
}
