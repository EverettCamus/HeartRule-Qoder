/**
 * 监控模板解析器
 * 
 * 解析监控LLM模板路径，支持两层方案（default/custom）
 */

export interface MonitorTemplateResolution {
  path: string;      // 模板相对路径
  layer: 'default' | 'custom';  // 模板层级
  scheme?: string;   // 自定义方案名称（仅custom层）
  exists: boolean;   // 模板是否存在
}

/**
 * 监控模板提供者接口
 * 
 * 用于从数据库获取模板内容
 */
export interface MonitorTemplateProvider {
  getTemplate(path: string): Promise<string | null>;
}

/**
 * 监控模板解析器
 * 
 * 负责解析监控LLM模板路径，支持default/custom两层方案
 */
export class MonitorTemplateResolver {
  private basePath: string;
  private templateProvider?: MonitorTemplateProvider;

  /**
   * 构造函数
   * 
   * @param basePathOrProjectId 文件系统模式：项目根路径；数据库模式：projectId
   * @param templateProvider 可选，数据库模式的模板提供者
   */
  constructor(basePathOrProjectId: string, templateProvider?: MonitorTemplateProvider) {
    this.basePath = basePathOrProjectId;
    this.templateProvider = templateProvider;
  }

  /**
   * 解析监控模板路径
   * 
   * @param actionType Action类型（如'ai_ask', 'ai_say'）
   * @param sessionConfig 会话配置（包含template_scheme）
   * @returns 模板解析结果
   */
  async resolveMonitorTemplatePath(
    actionType: string,
    sessionConfig?: { template_scheme?: string }
  ): Promise<MonitorTemplateResolution> {
    const templateName = `${actionType}_monitor_v1.md`;
    const scheme = sessionConfig?.template_scheme;

    // 优先尝试custom层（如果配置了scheme）
    if (scheme) {
      const customPath = `_system/config/custom/${scheme}/${templateName}`;
      const customExists = await this.checkTemplateExists(customPath);
      
      if (customExists) {
        return {
          path: customPath,
          layer: 'custom',
          scheme,
          exists: true,
        };
      }
    }

    // 回退到default层
    const defaultPath = `_system/config/default/${templateName}`;
    const defaultExists = await this.checkTemplateExists(defaultPath);

    return {
      path: defaultPath,
      layer: 'default',
      exists: defaultExists,
    };
  }

  /**
   * 检查模板是否存在
   * 
   * @param path 模板路径
   * @returns 是否存在
   */
  private async checkTemplateExists(path: string): Promise<boolean> {
    if (this.templateProvider) {
      // 数据库模式：查询模板是否存在
      try {
        const content = await this.templateProvider.getTemplate(path);
        return content !== null;
      } catch {
        return false;
      }
    } else {
      // 文件系统模式：检查文件是否存在
      try {
        const fs = await import('fs/promises');
        const fullPath = `${this.basePath}/${path}`;
        await fs.access(fullPath);
        return true;
      } catch {
        return false;
      }
    }
  }
}
