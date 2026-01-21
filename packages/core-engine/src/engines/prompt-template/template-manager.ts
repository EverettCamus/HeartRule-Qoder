import fs from 'fs/promises';
import path from 'path';

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
 */
export class PromptTemplateManager {
  private templates: Map<string, PromptTemplate> = new Map();
  private templateBasePath: string;

  constructor(templateBasePath?: string) {
    // 默认模板路径：config/prompts
    this.templateBasePath = templateBasePath || path.join(process.cwd(), 'config', 'prompts');
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

    const fullPath = path.join(this.templateBasePath, templatePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const variables = this.extractVariables(content);

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
   * @param scriptVariables 脚本层变量 {{变量名}}
   * @param systemVariables 系统层变量 {{变量名}}（统一格式）
   * @returns 完成替换的提示词
   */
  substituteVariables(
    template: string,
    scriptVariables: Map<string, any>,
    systemVariables: Record<string, any>
  ): string {
    let result = template;

    // 第一层：替换系统变量 {{变量名}}
    Object.entries(systemVariables).forEach(([key, value]) => {
      const pattern = new RegExp(`\\{\\{${this.escapeRegex(key)}\\}\\}`, 'g');
      const replacement = String(value ?? '');
      result = result.replace(pattern, replacement);
    });

    // 第二层：替换脚本变量 {{变量名}}
    scriptVariables.forEach((value, key) => {
      const pattern = new RegExp(`\\{\\{${this.escapeRegex(key)}\\}\\}`, 'g');
      const replacement = String(value ?? '');
      result = result.replace(pattern, replacement);
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
}
