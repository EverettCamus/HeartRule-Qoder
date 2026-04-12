import { createLogger } from '../../utils/logger.js';

import type { TemplateProvider } from './template-provider.js';

const logger = createLogger('TemplateResolver');

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
 * 模板解析器
 *
 * 负责模板路径解析：
 * - 文件系统模式：从 config/templates/default/ 读取
 * - 数据库模式：使用虚拟路径 _system/config/default/
 *
 * 设计原则：
 * - 独立模块，不与 BaseAction 耦合
 * - 模板文件名固定：ai_ask_v1.md, ai_say_v1.md
 * - 支持数据库和文件系统两种模板源
 */
export class TemplateResolver {
  private projectId?: string;
  private projectPath?: string;
  private templateProvider?: TemplateProvider;

  constructor(projectIdOrPath?: string, templateProvider?: TemplateProvider) {
    // 兼容旧版本：如果传入的是路径（包含 / 或 \），则作为projectPath
    if (projectIdOrPath && (projectIdOrPath.includes('/') || projectIdOrPath.includes('\\'))) {
      this.projectPath = projectIdOrPath;
    } else {
      this.projectId = projectIdOrPath;
    }
    this.templateProvider = templateProvider;
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

    // 如果有 TemplateProvider，使用数据库模式
    if (this.templateProvider && this.projectId) {
      return await this.resolveTemplateFromDatabase(actionType, templateFileName, sessionConfig);
    }

    // 否则使用文件系统模式（兼容旧版本）
    return await this.resolveTemplateFromFilesystem(templateFileName, sessionConfig);
  }

  /**
   * 从数据库解析模板
   */
  private async resolveTemplateFromDatabase(
    _actionType: string,
    templateFileName: string,
    sessionConfig?: SessionConfig
  ): Promise<TemplateResolutionResult> {
    if (!this.templateProvider || !this.projectId) {
      throw new Error('[TemplateResolver] Template provider or project ID not configured');
    }

    logger.debug('🔍 Resolving template from database:', {
      projectId: this.projectId,
      templateFileName,
      template_scheme: sessionConfig?.template_scheme,
    });

    // 第1层：Custom 层（优先级高）
    if (sessionConfig?.template_scheme) {
      const customPath = `_system/config/custom/${sessionConfig.template_scheme}/${templateFileName}`;

      logger.debug(`🔍 Checking custom layer: ${customPath}`);
      logger.debug(`🎯 Using projectId: ${this.projectId}`);
      const exists = await this.templateProvider.hasTemplate(this.projectId, customPath);
      logger.debug(`📋 Custom layer exists: ${exists}`);

      if (exists) {
        logger.debug(`✅ Using custom layer template: ${customPath}`);
        return {
          path: customPath,
          layer: 'custom',
          scheme: sessionConfig.template_scheme,
          exists: true,
        };
      }

      // Custom 层模板不存在，记录警告并回退到 default 层
      logger.warn(
        `Custom template not found: ${customPath}. ` + `Falling back to default template.`
      );
    } else {
      logger.debug('ℹ️ No template_scheme configured, using default layer');
    }

    // 第2层：Default 层（倕底）
    const defaultPath = `_system/config/default/${templateFileName}`;

    const exists = await this.templateProvider.hasTemplate(this.projectId, defaultPath);
    if (!exists) {
      throw new Error(
        `[TemplateResolver] Default template not found: ${defaultPath}. ` +
          `This indicates a project initialization issue.`
      );
    }

    return {
      path: defaultPath,
      layer: 'default',
      exists: true,
    };
  }

  /**
   * 从文件系统解析模板
   */
  private async resolveTemplateFromFilesystem(
    templateFileName: string,
    _sessionConfig?: SessionConfig
  ): Promise<TemplateResolutionResult> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const projectPath = this.projectPath || process.cwd();

    // 从 config/templates/default/ 读取
    const defaultAbsPath = path.join(projectPath, 'config/templates/default', templateFileName);

    const exists = await this.fileExists(defaultAbsPath, fs);
    if (!exists) {
      throw new Error(
        `[TemplateResolver] Default template not found: ${defaultAbsPath}. ` +
          `This indicates a project initialization issue.`
      );
    }

    // 返回相对于项目根目录的路径，不包含 config/templates
    const relativePath = path.join('config/templates/default', templateFileName);

    return {
      path: relativePath,
      layer: 'default',
      exists: true,
    };
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string, fs: any): Promise<boolean> {
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
    return this.projectPath || process.cwd();
  }

  /**
   * 设置项目路径（用于测试）
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
  }

  /**
   * 设置项目ID（用于数据库模式）
   */
  setProjectId(projectId: string): void {
    this.projectId = projectId;
  }

  /**
   * 设置模板提供器
   */
  setTemplateProvider(provider: TemplateProvider): void {
    this.templateProvider = provider;
  }
}
