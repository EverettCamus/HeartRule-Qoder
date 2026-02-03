/**
 * 模板提供器接口
 * 用于从不同来源（数据库、文件系统等）读取模板内容
 */

/**
 * 模板内容
 */
export interface TemplateContent {
  content: string;
  filePath: string;
  fileName: string;
}

/**
 * 模板提供器接口
 */
export interface TemplateProvider {
  /**
   * 根据项目ID和文件路径读取模板内容
   * @param projectId 项目ID
   * @param filePath 模板文件虚拟路径（如 _system/config/default/ai_ask_v1.md）
   * @returns 模板内容
   */
  getTemplate(projectId: string, filePath: string): Promise<TemplateContent | null>;

  /**
   * 检查模板是否存在
   * @param projectId 项目ID
   * @param filePath 模板文件虚拟路径
   * @returns 是否存在
   */
  hasTemplate(projectId: string, filePath: string): Promise<boolean>;
}
