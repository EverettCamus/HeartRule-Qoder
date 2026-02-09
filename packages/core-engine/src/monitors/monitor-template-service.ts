/**
 * 监控模板服务
 *
 * 封装监控模板的加载、解析和变量替换逻辑
 * 降低MonitorHandler的职责，提高代码复用性
 */

import path from 'path';

import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager } from '../engines/prompt-template/index.js';

import type { MonitorContext } from './base-monitor-handler.js';
import {
  MonitorTemplateResolver,
  type MonitorTemplateProvider,
} from './monitor-template-resolver.js';

/**
 * 监控模板服务接口
 */
export interface IMonitorTemplateService {
  /**
   * 生成监控提示词
   * @param actionType Action类型
   * @param variables 监控变量
   * @param context 监控上下文
   * @returns 最终的监控提示词
   */
  generateMonitorPrompt(
    actionType: string,
    variables: Record<string, string>,
    context: MonitorContext
  ): Promise<string>;

  /**
   * 调用监控LLM
   * @param prompt 监控提示词
   * @returns LLM响应文本
   */
  callMonitorLLM(prompt: string): Promise<string>;
}

/**
 * 默认监控模板服务实现
 */
export class DefaultMonitorTemplateService implements IMonitorTemplateService {
  private templateManager: PromptTemplateManager;
  private templateResolver: MonitorTemplateResolver;
  private llmOrchestrator: LLMOrchestrator;

  constructor(
    llmOrchestrator: LLMOrchestrator,
    projectRootOrId: string,
    templateProvider?: MonitorTemplateProvider
  ) {
    this.llmOrchestrator = llmOrchestrator;
    this.templateManager = new PromptTemplateManager(projectRootOrId, templateProvider as any);
    this.templateResolver = new MonitorTemplateResolver(projectRootOrId, templateProvider);
  }

  /**
   * 生成监控提示词
   */
  async generateMonitorPrompt(
    actionType: string,
    variables: Record<string, string>,
    context: MonitorContext
  ): Promise<string> {
    // 1. 解析监控模板路径
    const sessionConfig = context.metadata?.sessionConfig;
    const resolution = await this.templateResolver.resolveMonitorTemplatePath(
      actionType,
      sessionConfig
    );

    console.log(`[MonitorTemplateService] 监控模板解析 (${actionType}):`, {
      path: resolution.path,
      layer: resolution.layer,
      scheme: resolution.scheme,
      exists: resolution.exists,
    });

    if (!resolution.exists) {
      console.warn('[MonitorTemplateService] 监控模板不存在，返回空提示词');
      return '';
    }

    // 2. 加载监控模板
    let template;
    if (context.metadata?.templateProvider) {
      // 数据库模式
      template = await this.templateManager.loadTemplate(resolution.path);
    } else {
      // 文件系统模式，需要拼接完整路径
      const fullPath = path.join(this.templateResolver['basePath'], resolution.path);
      template = await this.templateManager.loadTemplate(fullPath);
    }

    // 3. 替换变量
    const prompt = this.templateManager.substituteVariables(
      template.content,
      new Map(Object.entries(variables)),
      {}
    );

    console.log(`[MonitorTemplateService] 监控提示词准备完成 (${prompt.length} chars)`);

    return prompt;
  }

  /**
   * 调用监控LLM
   */
  async callMonitorLLM(prompt: string): Promise<string> {
    if (!prompt) {
      return ''; // 空提示词，返回空响应
    }

    const llmResult = await this.llmOrchestrator.generateText(prompt, {
      temperature: 0.5,
      maxTokens: 800,
    });

    return llmResult.text;
  }
}
