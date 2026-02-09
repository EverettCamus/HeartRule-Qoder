/**
 * AiSayMonitorHandler - ai_say Action监控处理器
 * 
 * 监控ai_say Action执行状态，识别用户理解困难，生成表达优化建议
 */

import path from 'path';

import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager } from '../engines/prompt-template/index.js';

import { BaseMonitorHandler, type MonitorAnalysis, type MonitorContext } from './base-monitor-handler.js';
import { MonitorTemplateResolver, type MonitorTemplateProvider } from './monitor-template-resolver.js';
import type { ActionMetrics, ActionResult } from '../actions/base-action.js';

/**
 * ai_say监控处理器
 */
export class AiSayMonitorHandler extends BaseMonitorHandler {
  private llmOrchestrator: LLMOrchestrator;
  private templateManager: PromptTemplateManager;
  private templateResolver: MonitorTemplateResolver;

  constructor(
    llmOrchestrator: LLMOrchestrator,
    projectRootOrId: string,
    templateProvider?: MonitorTemplateProvider
  ) {
    super();
    this.llmOrchestrator = llmOrchestrator;
    
    // 初始化模板管理器（传递templateProvider支持数据库模式）
    // 注：MonitorTemplateProvider 和 TemplateProvider 接口不同，但可以共用
    this.templateManager = new PromptTemplateManager(projectRootOrId, templateProvider as any);
    
    // 初始化模板解析器
    this.templateResolver = new MonitorTemplateResolver(projectRootOrId, templateProvider);
  }

  /**
   * 解析并验证metrics
   */
  parseMetrics(result: ActionResult): ActionMetrics {
    if (!result.metrics) {
      console.warn('[AiSayMonitorHandler] ActionResult缺少metrics字段');
      return {};
    }

    return {
      user_engagement: result.metrics.user_engagement || '',
      emotional_intensity: result.metrics.emotional_intensity || '',
      understanding_level: result.metrics.understanding_level || '',
    };
  }

  /**
   * 调用监控LLM进行分析（异步）
   */
  async analyzeWithLLM(metrics: ActionMetrics, context: MonitorContext): Promise<MonitorAnalysis> {
    try {
      // 1. 解析监控模板路径
      const sessionConfig = context.metadata?.sessionConfig;
      const resolution = await this.templateResolver.resolveMonitorTemplatePath(
        'ai_say',
        sessionConfig
      );

      console.log('[AiSayMonitorHandler] 监控模板解析:', {
        path: resolution.path,
        layer: resolution.layer,
        scheme: resolution.scheme,
        exists: resolution.exists,
      });

      if (!resolution.exists) {
        console.warn('[AiSayMonitorHandler] 监控模板不存在，返回空反馈');
        return {
          intervention_needed: false,
          intervention_reason: 'normal',
          intervention_level: 'action_feedback',
          strategy_suggestion: 'continue',
          feedback_for_action: '',
          orchestration_needed: false,
        };
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

      // 3. 准备监控变量
      const monitorVariables = this.buildMonitorVariables(metrics, context);

      // 4. 替换变量
      const prompt = this.templateManager.substituteVariables(
        template.content,
        new Map(Object.entries(monitorVariables)),
        {}
      );

      console.log(`[AiSayMonitorHandler] 监控提示词准备完成 (${prompt.length} chars)`);

      // 5. 调用监控LLM
      const llmResult = await this.llmOrchestrator.generateText(prompt, {
        temperature: 0.5,
        maxTokens: 800,
      });

      // 6. 解析监控LLM输出
      const parseResult = this.parseMonitorOutput(llmResult.text);
      
      // 添加解析错误信息到metadata
      if (parseResult.parseError) {
        parseResult.analysis.metadata = {
          ...parseResult.analysis.metadata,
          parseError: true,
          parseRetryCount: parseResult.parseError.retryCount,
        };
      }

      console.log('[AiSayMonitorHandler] 监控分析完成:', {
        intervention_needed: parseResult.analysis.intervention_needed,
        intervention_level: parseResult.analysis.intervention_level,
        parseError: (parseResult.parseError?.retryCount || 0) > 1,
      });

      return parseResult.analysis;
    } catch (error: any) {
      console.error('[AiSayMonitorHandler] 监控分析失败:', error);
      
      // 返回空反馈，不阻塞主流程
      return {
        intervention_needed: false,
        intervention_reason: 'error',
        intervention_level: 'action_feedback',
        strategy_suggestion: 'continue',
        feedback_for_action: '',
        orchestration_needed: false,
        metadata: {
          parseError: true,
        },
      };
    }
  }

  /**
   * 构建监控变量
   */
  private buildMonitorVariables(metrics: ActionMetrics, context: MonitorContext): Record<string, string> {
    const vars: Record<string, string> = {
      current_round: context.currentRound.toString(),
      max_rounds: context.maxRounds.toString(),
      topic_content: this.extractTopicContent(context),
      user_engagement: metrics.user_engagement || '',
      emotional_intensity: metrics.emotional_intensity || '',
      understanding_level: metrics.understanding_level || '',
      progress_suggestion: context.actionResult.progress_suggestion || '',
    };

    // 用户基础信息（可选）
    if (context.metadata?.userProfile) {
      const profile = context.metadata.userProfile;
      vars.education_background = profile.education_background || '';
      vars.psychology_knowledge = profile.psychology_knowledge || '';
      vars.learning_style = profile.learning_style || '';
    }

    // 历史趋势（可选）
    if (context.metricsHistory && context.metricsHistory.length > 0) {
      vars.understanding_trend = this.buildUnderstandingTrend(context.metricsHistory);
      vars.question_frequency = this.buildQuestionFrequency(context.metricsHistory);
    }

    return vars;
  }

  /**
   * 提取讲解主题
   */
  private extractTopicContent(context: MonitorContext): string {
    return context.metadata?.topicContent || context.actionResult.aiMessage || '未知主题';
  }

  /**
   * 构建理解度趋势
   */
  private buildUnderstandingTrend(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '';
    
    const recent = history.slice(-3);
    const trends = recent.map((h, i) => 
      `第${h.round}轮: ${h.metrics.understanding_level || '未评估'}`
    );
    
    return trends.join(' → ');
  }

  /**
   * 构建提问频率
   */
  private buildQuestionFrequency(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '无历史数据';
    
    // 简化处理：计算最近3轮是否有提问
    const recent = history.slice(-3);
    const questionCount = recent.filter(h => 
      h.metrics.user_engagement && h.metrics.user_engagement.includes('提问')
    ).length;
    
    return `最近${recent.length}轮中有${questionCount}次提问`;
  }
}
