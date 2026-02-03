import axios from 'axios';

const API_BASE_URL = '/api';

export interface Project {
  id: string;
  projectName: string;
  description: string;
  engineVersion: string;
  engineVersionMin: string;
  currentVersionId?: string;
  status: 'draft' | 'published' | 'archived' | 'deprecated';
  author: string;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  fileCount?: number;
}

export interface ScriptFile {
  id: string;
  projectId: string;
  fileType: 'global' | 'roles' | 'skills' | 'forms' | 'rules' | 'session' | 'template';
  fileName: string;
  fileContent: any;
  yamlContent?: string;
  filePath?: string; // 模板文件的虚拟路径
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDraft {
  projectId: string;
  draftFiles: Record<string, any>;
  validationStatus: 'valid' | 'invalid' | 'unknown';
  validationErrors?: any[];
  updatedAt: string;
  updatedBy: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  versionNumber: string;
  versionFiles: Record<string, any>;
  releaseNote: string;
  isRollback: string;
  rollbackFromVersionId?: string;
  publishedAt: string;
  publishedBy: string;
}

// 工程管理API
export const projectsApi = {
  // 获取工程列表
  async getProjects(params?: {
    status?: string;
    search?: string;
    author?: string;
    includeDeprecated?: boolean;
  }) {
    const response = await axios.get<{ success: boolean; data: Project[] }>(
      `${API_BASE_URL}/projects`,
      { params: { ...params, includeDeprecated: params?.includeDeprecated?.toString() } }
    );
    return response.data;
  },

  // 获取单个工程详情
  async getProject(id: string) {
    const response = await axios.get<{
      success: boolean;
      data: Project & { files: ScriptFile[]; draft: ProjectDraft; versions: ProjectVersion[] };
    }>(`${API_BASE_URL}/projects/${id}`);
    return response.data;
  },

  // 创建工程
  async createProject(data: {
    projectName: string;
    description?: string;
    engineVersion?: string;
    engineVersionMin?: string;
    author: string;
    tags?: string[];
    // 工程初始化配置
    template?: 'blank' | 'cbt-assessment' | 'cbt-counseling';
    domain?: string;
    scenario?: string;
    language?: string;
    templateScheme?: string;  // 模板方案（可选）
  }) {
    const response = await axios.post<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects`,
      data
    );
    return response.data;
  },

  // 更新工程
  async updateProject(
    id: string,
    data: {
      projectName?: string;
      description?: string;
      engineVersion?: string;
      engineVersionMin?: string;
      tags?: string[];
    }
  ) {
    const response = await axios.put<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects/${id}`,
      data
    );
    return response.data;
  },

  // 归档工程
  async archiveProject(id: string) {
    const response = await axios.delete<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects/${id}`
    );
    return response.data;
  },

  // 作废工程（软删除）
  async deprecateProject(id: string, data?: { operator?: string; reason?: string }) {
    const response = await axios.post<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects/${id}/deprecate`,
      data || {}
    );
    return response.data;
  },

  // 恢复已作废工程
  async restoreProject(id: string, data?: { operator?: string }) {
    const response = await axios.post<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects/${id}/restore`,
      data || {}
    );
    return response.data;
  },

  // 复制工程
  async copyProject(id: string, author: string) {
    const response = await axios.post<{ success: boolean; data: Project }>(
      `${API_BASE_URL}/projects/${id}/copy`,
      { author }
    );
    return response.data;
  },

  // 获取工程文件列表
  async getProjectFiles(id: string) {
    const response = await axios.get<{ success: boolean; data: ScriptFile[] }>(
      `${API_BASE_URL}/projects/${id}/files`
    );
    return response.data;
  },

  // 获取单个文件
  async getFile(projectId: string, fileId: string) {
    const response = await axios.get<{ success: boolean; data: ScriptFile }>(
      `${API_BASE_URL}/projects/${projectId}/files/${fileId}`
    );
    return response.data;
  },

  // 创建文件
  async createFile(
    projectId: string,
    data: { fileType: string; fileName: string; fileContent: any }
  ) {
    const response = await axios.post<{ success: boolean; data: ScriptFile }>(
      `${API_BASE_URL}/projects/${projectId}/files`,
      data
    );
    return response.data;
  },

  // 更新文件
  async updateFile(
    projectId: string,
    fileId: string,
    data: { fileName?: string; fileContent?: any; yamlContent?: string }
  ) {
    const response = await axios.put<{ success: boolean; data: ScriptFile }>(
      `${API_BASE_URL}/projects/${projectId}/files/${fileId}`,
      data
    );
    return response.data;
  },

  // 删除文件
  async deleteFile(projectId: string, fileId: string) {
    const response = await axios.delete<{ success: boolean; data: ScriptFile }>(
      `${API_BASE_URL}/projects/${projectId}/files/${fileId}`
    );
    return response.data;
  },

  // 获取模板方案列表
  async getTemplateSchemes(projectId: string) {
    const response = await axios.get<Array<{
      name: string;
      description: string;
      isDefault: boolean;
    }>>(`${API_BASE_URL}/projects/${projectId}/template-schemes`);
    return response.data;
  },

  // 获取模板方案下的文件列表
  async getTemplateSchemeFiles(projectId: string, schemeName: string) {
    const response = await axios.get<{
      success: boolean;
      data: {
        schemeName: string;
        isDefault: boolean;
        files: Array<{
          name: string;
          path: string;
          size: number;
          isReadonly: boolean;
        }>;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/template-schemes/${schemeName}/files`);
    return response.data.data;
  },

  // 创建模板方案
  async createTemplateScheme(
    projectId: string,
    data: {
      name: string;
      description?: string;
      copyFrom?: string;
    }
  ) {
    const response = await axios.post<{
      success: boolean;
      data: {
        name: string;
        description: string;
        isDefault: boolean;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/template-schemes`, data);
    return response.data;
  },

  // 更新模板方案描述
  async updateTemplateScheme(
    projectId: string,
    schemeName: string,
    data: {
      description: string;
    }
  ) {
    const response = await axios.patch<{
      success: boolean;
      data: {
        name: string;
        description: string;
        isDefault: boolean;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/template-schemes/${schemeName}`, data);
    return response.data;
  },

  // 删除模板方案
  async deleteTemplateScheme(projectId: string, schemeName: string) {
    const response = await axios.delete<{
      success: boolean;
      data: { message: string };
    }>(`${API_BASE_URL}/projects/${projectId}/template-schemes/${schemeName}`);
    return response.data;
  },

  // 获取模板内容
  async getTemplateContent(
    projectId: string,
    schemeName: string,
    templatePath: string
  ) {
    const response = await axios.get<{
      success: boolean;
      data: {
        schemeName: string;
        templatePath: string;
        content: string;
        isDefault: boolean;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/templates/${schemeName}/${templatePath}`);
    return response.data;
  },

  // 更新模板内容
  async updateTemplateContent(
    projectId: string,
    schemeName: string,
    templatePath: string,
    content: string
  ) {
    const response = await axios.put<{
      success: boolean;
      data: {
        schemeName: string;
        templatePath: string;
        message: string;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/templates/${schemeName}/${templatePath}`, { content });
    return response.data;
  },
};

// 版本管理API
export const versionsApi = {
  // 获取草稿
  async getDraft(projectId: string) {
    const response = await axios.get<{ success: boolean; data: ProjectDraft }>(
      `${API_BASE_URL}/projects/${projectId}/draft`
    );
    return response.data;
  },

  // 保存草稿
  async saveDraft(projectId: string, data: { draftFiles: Record<string, any>; updatedBy: string }) {
    const response = await axios.put<{ success: boolean; data: ProjectDraft }>(
      `${API_BASE_URL}/projects/${projectId}/draft`,
      data
    );
    return response.data;
  },

  // 发布版本
  async publishVersion(
    projectId: string,
    data: { versionNumber: string; releaseNote: string; publishedBy: string }
  ) {
    const response = await axios.post<{ success: boolean; data: ProjectVersion }>(
      `${API_BASE_URL}/projects/${projectId}/publish`,
      data
    );
    return response.data;
  },

  // 获取版本历史
  async getVersions(projectId: string) {
    const response = await axios.get<{ success: boolean; data: ProjectVersion[] }>(
      `${API_BASE_URL}/projects/${projectId}/versions`
    );
    return response.data;
  },

  // 获取单个版本
  async getVersion(projectId: string, versionId: string) {
    const response = await axios.get<{ success: boolean; data: ProjectVersion }>(
      `${API_BASE_URL}/projects/${projectId}/versions/${versionId}`
    );
    return response.data;
  },

  // 回滚版本
  async rollbackVersion(projectId: string, data: { targetVersionId: string; publishedBy: string }) {
    const response = await axios.post<{ success: boolean; data: ProjectVersion }>(
      `${API_BASE_URL}/projects/${projectId}/rollback`,
      data
    );
    return response.data;
  },

  // 设置当前版本（版本切换）
  async setCurrentVersion(projectId: string, data: { versionId: string }) {
    const response = await axios.put<{
      success: boolean;
      data: {
        projectId: string;
        previousVersionId: string | null;
        currentVersionId: string;
        updatedAt: string;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/current-version`, data);
    return response.data;
  },

  // 对比版本
  async diffVersions(projectId: string, versionId: string, compareWith?: string) {
    const response = await axios.get<{
      success: boolean;
      data: {
        version: ProjectVersion;
        compareVersion: ProjectVersion;
        diff: any;
      };
    }>(`${API_BASE_URL}/projects/${projectId}/versions/${versionId}/diff`, {
      params: { compareWith },
    });
    return response.data;
  },
};
