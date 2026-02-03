/**
 * ProjectInitializer - 工程初始化服务
 * 
 * 负责在创建新工程时：
 * 1. 创建物理目录结构
 * 2. 复制系统默认模板
 * 3. 生成示例脚本（可选）
 * 4. 创建 project.json 配置文件
 * 
 * 参考设计文档：template-security-boundary-addition.md 第3.10节
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ProjectInitConfig {
  projectId: string;
  projectName: string;
  template?: 'blank' | 'cbt-assessment' | 'cbt-counseling';
  domain?: string;
  scenario?: string;
  language?: string;
  author?: string;
  templateScheme?: string;  // 模板方案（可选）
}

export interface GeneratedScript {
  fileName: string;
  fileType: 'session';
  relativePath: string;
  content: string;
}

export interface ProjectInitResult {
  projectPath: string;
  generatedScripts: GeneratedScript[];
}

export class ProjectInitializer {
  private workspacePath: string;
  private systemTemplatesPath: string;

  constructor(workspacePath?: string, systemTemplatesPath?: string) {
    // 默认工作区路径
    this.workspacePath = workspacePath || path.join(process.cwd(), 'workspace', 'projects');
    
    // 系统模板路径
    if (systemTemplatesPath) {
      this.systemTemplatesPath = systemTemplatesPath;
    } else {
      // 使用 __dirname 确保路径计算稳定，指向工作区根目录的 config/prompts
      const projectRoot = path.resolve(__dirname, '../../../..');
      this.systemTemplatesPath = path.join(projectRoot, 'config', 'prompts');
    }
  }

  /**
   * 初始化新工程目录结构
   */
  async initializeProject(config: ProjectInitConfig): Promise<ProjectInitResult> {
    const projectPath = path.join(this.workspacePath, config.projectId);

    console.log(`[ProjectInitializer] Initializing project at: ${projectPath}`);

    try {
      // 1. 创建工程根目录
      await fs.mkdir(projectPath, { recursive: true });

      // 2. 创建基础目录结构
      await this.createDirectoryStructure(projectPath);

      // 3. 复制系统默认模板
      await this.copySystemTemplates(projectPath);

      // 4. 根据模板类型创建领域模板（如果需要）
      if (config.template && config.template !== 'blank') {
        await this.createDomainTemplates(projectPath, config);
      }

      // 5. 如果指定了模板方案，复制到custom层
      if (config.templateScheme) {
        await this.copyTemplateScheme(projectPath, config.templateScheme);
      }

      // 6. 生成示例脚本
      const generatedScripts = await this.generateSampleScripts(projectPath, config);

      // 7. 创建 project.json 配置文件
      await this.createProjectConfig(projectPath, config);

      // 8. 创建 README.md
      await this.createReadme(projectPath, config);

      // 9. 创建 .gitignore
      await this.createGitignore(projectPath);

      console.log(`[ProjectInitializer] ✅ Project initialized successfully`);

      return {
        projectPath,
        generatedScripts,
      };
    } catch (error: any) {
      console.error(`[ProjectInitializer] ❌ Failed to initialize project:`, error);
      throw new Error(`Failed to initialize project: ${error.message}`);
    }
  }

  /**
   * 创建基础目录结构（两层方案机制）
   */
  private async createDirectoryStructure(projectPath: string): Promise<void> {
    const directories = [
      '_system/config/default',  // 第1层：默认层
      '_system/config/custom',   // 第2层：custom 层（空目录）
      'scripts/examples',
    ];

    for (const dir of directories) {
      const fullPath = path.join(projectPath, dir);
      await fs.mkdir(fullPath, { recursive: true });
      
      // 在 custom 目录中创建 .gitkeep
      if (dir.includes('custom')) {
        await fs.writeFile(
          path.join(fullPath, '.gitkeep'),
          '# Custom 模板方案目录\n\n请在此目录下创建自定义模板方案。\n例如：custom/cbt_scheme/ai_ask_v1.md'
        );
      }
    }
  }

  /**
   * 复制系统默认模板（到 default 层）
   */
  private async copySystemTemplates(projectPath: string): Promise<void> {
    const targetPath = path.join(projectPath, '_system/config/default');
    
    try {
      console.log(`[ProjectInitializer] Copying system templates from: ${this.systemTemplatesPath}`);
      
      // 检查系统模板路径是否存在
      try {
        await fs.access(this.systemTemplatesPath);
      } catch {
        console.warn(`[ProjectInitializer] ⚠️ System templates not found at: ${this.systemTemplatesPath}`);
        console.warn('[ProjectInitializer] Creating empty default directory');
        await fs.mkdir(targetPath, { recursive: true });
        return;
      }

      // 复制整个目录到 default 层
      await this.copyDirectory(this.systemTemplatesPath, targetPath);
      
      // 添加只读标记文件
      await fs.writeFile(
        path.join(targetPath, '.readonly'),
        '# 系统默认模板（Default 层）\n\n此目录包含系统默认模板，请勿直接修改。\n如需自定义，请在 custom/ 目录下创建新的模板方案。'
      );
      
      console.log('[ProjectInitializer] ✅ System templates copied successfully to default layer');
    } catch (error: any) {
      console.error('[ProjectInitializer] ❌ Failed to copy system templates:', error);
      throw error;
    }
  }

  /**
   * 递归复制目录
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * 创建领域模板（已废弃 - 两层方案不再支持领域模板）
   */
  private async createDomainTemplates(_projectPath: string, _config: ProjectInitConfig): Promise<void> {
    // 两层方案不再需要领域模板，此方法保留仅为兼容
    console.log(`[ProjectInitializer] Skipping domain templates (two-layer scheme)`);
  }

  /**
   * 复制预设模板方案到custom层
   */
  private async copyTemplateScheme(projectPath: string, schemeName: string): Promise<void> {
    try {
      console.log(`[ProjectInitializer] Copying template scheme: ${schemeName}`);

      // 构建源路径（从系统模板目录下的_system/config目录）
      const projectRoot = path.resolve(__dirname, '../../..');
      const systemConfigPath = path.join(projectRoot, '_system', 'config');
      const sourcePath = path.join(systemConfigPath, 'custom', schemeName);

      // 检查源模板方案是否存在
      try {
        await fs.access(sourcePath);
      } catch {
        console.warn(`[ProjectInitializer] ⚠️ Template scheme not found: ${schemeName}`);
        console.warn('[ProjectInitializer] Skipping template scheme copy');
        return;
      }

      // 构建目标路径（工程的custom层）
      const targetPath = path.join(projectPath, '_system', 'config', 'custom', schemeName);

      // 复制整个方案目录
      await this.copyDirectory(sourcePath, targetPath);

      console.log(`[ProjectInitializer] ✅ Template scheme copied: ${schemeName}`);
    } catch (error: any) {
      console.error('[ProjectInitializer] ❌ Failed to copy template scheme:', error);
      // 不抛出异常，允许工程创建继续
    }
  }

  /**
   * 生成示例脚本
   */
  private async generateSampleScripts(projectPath: string, config: ProjectInitConfig): Promise<GeneratedScript[]> {
    const scriptsPath = path.join(projectPath, 'scripts', 'examples');
    const generatedScripts: GeneratedScript[] = [];

    // 空白工程：生成 hello-world.yaml
    if (!config.template || config.template === 'blank') {
      const helloWorldScript = `session:
  session_id: hello_world
  session_name: 你好世界
  
  phases:
    - phase_id: greet_phase
      phase_name: 问候阶段
      
      topics:
        - topic_id: greet
          topic_name: 问候
          
          actions:
            - action_type: ai_say
              action_id: say_welcome
              config:
                content: |
                  欢迎来到心流咨询，我是你的AI助手。
                  今天我们可以聊一聊你最近的感受。
                max_rounds: 1
            
            - action_type: ai_ask
              action_id: ask_status
              config:
                content: 你最近过得怎么样？
                output:
                  - get: 用户状态
                max_rounds: 3
`;

      const filePath = path.join(scriptsPath, 'hello-world.yaml');
      await fs.writeFile(filePath, helloWorldScript);
      
      generatedScripts.push({
        fileName: 'hello-world.yaml',
        fileType: 'session',
        relativePath: 'scripts/examples/hello-world.yaml',
        content: helloWorldScript,
      });
    }

    // CBT评估会谈工程：生成 cbt-assessment-demo.yaml
    if (config.template === 'cbt-assessment') {
      const cbtScript = `session:
  session_id: cbt_assessment_demo
  session_name: CBT抑郁症评估会谈示例
  
  phases:
    - phase_id: assessment_phase
      phase_name: 评估阶段
      
      topics:
        - topic_id: mood_assessment
          topic_name: 情绪评估
          
          actions:
            - action_type: ai_ask
              action_id: ask_mood
              config:
                content: 请描述你最近两周的情绪状态
                output:
                  - get: 情绪描述
                max_rounds: 3
            
            - action_type: ai_say
              action_id: say_empathy
              config:
                content: |
                  抑郁情绪是一种常见的心理体验。
                  我们需要更多了解，才能帮助你找到合适的应对方式。
                max_rounds: 1
`;

      const filePath = path.join(scriptsPath, 'cbt-assessment-demo.yaml');
      await fs.writeFile(filePath, cbtScript);
      
      generatedScripts.push({
        fileName: 'cbt-assessment-demo.yaml',
        fileType: 'session',
        relativePath: 'scripts/examples/cbt-assessment-demo.yaml',
        content: cbtScript,
      });
    }

    console.log('[ProjectInitializer] ✅ Sample scripts generated');
    return generatedScripts;
  }

  /**
   * 创建 project.json 配置文件
   */
  private async createProjectConfig(projectPath: string, config: ProjectInitConfig): Promise<void> {
    const projectConfig = {
      projectId: config.projectId,
      name: config.projectName,
      version: '1.0.0',
      description: '',
      domain: config.domain || undefined,
      scenario: config.scenario || undefined,
      language: config.language || 'zh-CN',
      templateVersion: '1.0.0',
      systemTemplateVersion: '1.2.0',
      createdAt: new Date().toISOString(),
      metadata: {
        author: config.author || '',
        organization: '',
        tags: [],
      },
      dependencies: {
        '@心流引擎/core-engine': '^2.0.0',
      },
    };

    await fs.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(projectConfig, null, 2)
    );

    console.log('[ProjectInitializer] ✅ project.json created');
  }

  /**
   * 创建 README.md
   */
  private async createReadme(projectPath: string, config: ProjectInitConfig): Promise<void> {
    const readme = `# ${config.projectName}

## 工程说明

此工程使用心流引擎创建，用于开发和管理咨询脚本。

## 目录结构

- \`_system/config/\` - 模板方案配置目录
  - \`default/\` - 系统默认模板（只读）
  - \`custom/\` - 自定义模板方案
- \`scripts/\` - 咨询脚本目录
  - \`examples/\` - 示例脚本

## 开始使用

1. 在 \`scripts/\` 目录中编辑或创建咨询脚本
2. 使用心流引擎编辑器进行可视化编辑
3. 运行和测试您的咨询脚本

## 模板系统（两层方案机制）

本工程采用两层模板方案机制：

1. **Default 层** (\`_system/config/default/\`) - 系统默认模板，只读，由引擎提供
2. **Custom 层** (\`_system/config/custom/\`) - 自定义模板方案，用户可编辑

### 使用示例

在脚本中指定模板方案：

\`\`\`yaml
actions:
  - action_id: ask1
    action_type: ai_ask
    template_scheme: custom/cbt_scheme  # 使用自定义方案
    template: ai_ask_v1
\`\`\`

引擎将按照以下顺序查找模板：
1. \`_system/config/custom/cbt_scheme/ai_ask_v1.md\` (自定义层)
2. \`_system/config/default/ai_ask_v1.md\` (默认层，回退)

详细文档请参考：[模板系统使用指南](https://docs.heartrule.com/templates)
`;

    await fs.writeFile(path.join(projectPath, 'README.md'), readme);
    console.log('[ProjectInitializer] ✅ README.md created');
  }

  /**
   * 创建 .gitignore
   */
  private async createGitignore(projectPath: string): Promise<void> {
    const gitignore = `# Node modules
node_modules/

# Environment variables
.env
.env.local

# Build outputs
dist/
build/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
`;

    await fs.writeFile(path.join(projectPath, '.gitignore'), gitignore);
    console.log('[ProjectInitializer] ✅ .gitignore created');
  }

  /**
   * 获取工程路径
   */
  getProjectPath(projectId: string): string {
    return path.join(this.workspacePath, projectId);
  }
}
