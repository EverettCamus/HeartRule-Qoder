/**
 * ProjectInitializer - 工程初始化服务
 *
 * Story 0.5: 完全数据库化架构
 * 负责在创建新工程时：
 * 1. 导入系统默认模板到数据库
 * 2. 复制模板方案(若指定)
 * 3. 生成示例脚本内容(不写磁盘)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { scriptFiles, projects } from '../db/schema.js';

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
  templateScheme?: string; // 模板方案（可选）
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
  private systemTemplatesPath: string;

  constructor(systemTemplatesPath?: string) {
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
   * 初始化新工程 - 纯数据库操作
   */
  async initializeProject(config: ProjectInitConfig): Promise<ProjectInitResult> {
    console.log(`[ProjectInitializer] Initializing database-based project: ${config.projectId}`);

    try {
      // 1. 验证工程已创建
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, config.projectId),
      });

      if (!project) {
        throw new Error(`Project not found: ${config.projectId}`);
      }

      // 2. 导入默认模板到数据库
      const templateCount = await this.importDefaultTemplates(config.projectId);
      console.log(`[ProjectInitializer] ✅ Imported ${templateCount} default templates`);

      // 3. 处理templateScheme(可选)
      if (config.templateScheme) {
        // 注意: 目前简化实现,仅记录日志
        // 完整实现需要从系统工程或预设位置复制custom方案
        console.log(
          `[ProjectInitializer] ⚠️ Template scheme not yet implemented: ${config.templateScheme}`
        );
      }

      // 4. 生成示例脚本内容(不写磁盘)
      const generatedScripts = await this.generateSampleScriptsContent(config);

      console.log(`[ProjectInitializer] ✅ Project initialized successfully (database mode)`);

      return {
        projectPath: `[DB]project/${config.projectId}`, // 虚拟路径标识
        generatedScripts,
      };
    } catch (error: any) {
      console.error(`[ProjectInitializer] ❌ Failed to initialize project:`, error);
      throw new Error(`Failed to initialize project: ${error.message}`);
    }
  }

  /**
   * 从系统模板目录读取默认模板,导入到script_files表
   */
  private async importDefaultTemplates(projectId: string): Promise<number> {
    console.log(
      `[ProjectInitializer] Importing default templates from: ${this.systemTemplatesPath}`
    );

    try {
      // 检查系统模板路径是否存在
      try {
        await fs.access(this.systemTemplatesPath);
      } catch {
        console.warn(
          `[ProjectInitializer] ⚠️ System templates not found at: ${this.systemTemplatesPath}`
        );
        console.warn('[ProjectInitializer] Skipping template import');
        return 0;
      }

      // 读取模板目录
      const entries = await fs.readdir(this.systemTemplatesPath, { withFileTypes: true });
      let importedCount = 0;

      for (const entry of entries) {
        // 仅处理.md文件
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
          continue;
        }

        try {
          const filePath = path.join(this.systemTemplatesPath, entry.name);
          const content = await fs.readFile(filePath, 'utf-8');
          const virtualPath = `_system/config/default/${entry.name}`;

          // 插入到数据库
          await db.insert(scriptFiles).values({
            projectId,
            fileType: 'template',
            fileName: entry.name,
            filePath: virtualPath,
            fileContent: { content },
          });

          console.log(`[ProjectInitializer]   ✅ Imported: ${entry.name}`);
          importedCount++;
        } catch (error: any) {
          console.error(`[ProjectInitializer]   ❌ Failed to import ${entry.name}:`, error.message);
          // 继续处理其他模板
        }
      }

      return importedCount;
    } catch (error: any) {
      console.error('[ProjectInitializer] ❌ Failed to import templates:', error);
      throw error;
    }
  }

  /**
   * 生成示例脚本内容,返回字符串而非写入磁盘
   */
  private async generateSampleScriptsContent(
    config: ProjectInitConfig
  ): Promise<GeneratedScript[]> {
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

      generatedScripts.push({
        fileName: 'cbt-assessment-demo.yaml',
        fileType: 'session',
        relativePath: 'scripts/examples/cbt-assessment-demo.yaml',
        content: cbtScript,
      });
    }

    console.log('[ProjectInitializer] ✅ Sample scripts content generated');
    return generatedScripts;
  }
}
