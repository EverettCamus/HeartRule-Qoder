import fs from 'fs/promises';
import path from 'path';

/**
 * 模板路径解析结果
 */
export interface TemplateResolutionResult {
  path: string; // 最终模板路径
  layer: 'custom' | 'default'; // 使用的层级
  scheme?: string; // 如果是 custom 层，记录方案名
  exists: boolean; // 文件是否存在
}

/**
 * Session 配置（用于读取 template_scheme）
 */
export interface SessionConfig {
  template_scheme?: string; // Session 级模板方案配置
}

/**
 * 模板解析器（两层方案机制）
 * 
 * 负责两层模板路径解析：
 * 1. Custom 层 - 可自定义方案（优先级高）
 * 2. Default 层 - 系统默认模板（兘底层）
 * 
 * 设计原则：
 * - 独立模块，不与 BaseAction 耦合
 * - 简化架构，只保留两层
 * - Session 级配置，通过 template_scheme 指定方案
 * - 模板文件名固定：ai_ask_v1.md, ai_say_v1.md
 * 
 * 参考设计文档：template-security-boundary-addition.md 第3.5-3.7节
 */
export class TemplateResolver {
  private projectPath: string;

  constructor(projectPath?: string) {
    // 默认项目路径：当前工作目录
    this.projectPath = projectPath || process.cwd();
  }

  /**
   * 解析模板路径（两层方案机制）
   * 
   * @param actionType Action类型，如 'ai_ask', 'ai_say'
   * @param sessionConfig Session 配置（包含 template_scheme）
   * @returns 模板解析结果（返回相对路径，相对于 config/prompts）
   */
  async resolveTemplatePath(
    actionType: string,
    sessionConfig?: SessionConfig
  ): Promise<TemplateResolutionResult> {
    // 模板文件名：默认使用 v1 版本
    const templateFileName = `${actionType}_v1.md`;
  
    // 第1层：Custom 层（优先级高）
    if (sessionConfig?.template_scheme) {
      const customAbsPath = path.join(
        this.projectPath,
        '_system/config/custom',
        sessionConfig.template_scheme,
        templateFileName
      );
  
      const exists = await this.fileExists(customAbsPath);
      if (exists) {
        // 返回相对路径：_system/config/custom/{scheme}/{fileName}
        const relativePath = path.join(
          '_system/config/custom',
          sessionConfig.template_scheme,
          templateFileName
        );
          
        return {
          path: relativePath,
          layer: 'custom',
          scheme: sessionConfig.template_scheme,
          exists: true,
        };
      }
  
      // Custom 层模板不存在，记录警告并回退到 default 层
      console.warn(
        `[TemplateResolver] Custom template not found: ${customAbsPath}. ` +
        `Falling back to default template.`
      );
    }
  
    // 第2层：Default 层（兜底）
    const defaultAbsPath = path.join(
      this.projectPath,
      '_system/config/default',
      templateFileName
    );
  
    const exists = await this.fileExists(defaultAbsPath);
    if (!exists) {
      throw new Error(
        `[TemplateResolver] Default template not found: ${defaultAbsPath}. ` +
        `This indicates a project initialization issue.`
      );
    }
  
    // 返回相对路径：_system/config/default/{fileName}
    const relativePath = path.join('_system/config/default', templateFileName);
  
    return {
      path: relativePath,
      layer: 'default',
      exists: true,
    };
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取项目路径
   */
  getProjectPath(): string {
    return this.projectPath;
  }

  /**
   * 设置项目路径（用于测试）
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
  }
}
