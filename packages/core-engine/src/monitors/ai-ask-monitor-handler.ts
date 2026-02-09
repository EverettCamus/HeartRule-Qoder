/**
 * AiAskMonitorHandler - ai_ask Action监控处理器
 * 
 * 监控ai_ask Action执行状态，识别信息收集障碍，生成策略建议
 */

import path from 'path';

import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import { PromptTemplateManager } from '../engines/prompt-template/index.js';

import { BaseMonitorHandler, type MonitorAnalysis, type MonitorContext } from './base-monitor-handler.js';
import { MonitorTemplateResolver, type MonitorTemplateProvider } from './monitor-template-resolver.js';
import type { ActionMetrics, ActionResult } from '../actions/base-action.js';

/**
 * ai_ask监控处理器
 */
export class AiAskMonitorHandler extends BaseMonitorHandler {
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
      console.warn('[AiAskMonitorHandler] ActionResult缺少metrics字段');
      return {};
    }

    return {
      information_completeness: result.metrics.information_completeness || '',
      user_engagement: result.metrics.user_engagement || '',
      emotional_intensity: result.metrics.emotional_intensity || '',
      reply_relevance: result.metrics.reply_relevance || '',
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
        'ai_ask',
        sessionConfig
      );

      console.log('[AiAskMonitorHandler] 监控模板解析:', {
        path: resolution.path,
        layer: resolution.layer,
        scheme: resolution.scheme,
        exists: resolution.exists,
      });

      if (!resolution.exists) {
        console.warn('[AiAskMonitorHandler] 监控模板不存在，返回空反馈');
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

      console.log(`[AiAskMonitorHandler] 监控提示词准备完成 (${prompt.length} chars)`);

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

      console.log('[AiAskMonitorHandler] 监控分析完成:', {
        intervention_needed: parseResult.analysis.intervention_needed,
        intervention_reason: parseResult.analysis.intervention_reason,
        parseError: (parseResult.parseError?.retryCount || 0) > 1,
      });

      return parseResult.analysis;
    } catch (error: any) {
      console.error('[AiAskMonitorHandler] 监控分析失败:', error);
      
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
      target_variables: this.extractTargetVariables(context),
      information_completeness: metrics.information_completeness || '',
      user_engagement: metrics.user_engagement || '',
      emotional_intensity: metrics.emotional_intensity || '',
      reply_relevance: metrics.reply_relevance || '',
      progress_suggestion: context.actionResult.progress_suggestion || '',
    };

    // Topic策略配置（可选）
    if (context.topicStrategy) {
      vars.min_completeness_requirement = context.topicStrategy.min_completeness_requirement || '';
      vars.retry_strategy = context.topicStrategy.retry_strategy || '';
      vars.max_retry_count = context.topicStrategy.max_retry_count?.toString() || '';
    }

    // 历史趋势（可选）
    if (context.metricsHistory && context.metricsHistory.length > 0) {
      vars.engagement_trend = this.buildEngagementTrend(context.metricsHistory);
      vars.emotion_trend = this.buildEmotionTrend(context.metricsHistory);
    }

    return vars;
  }

  /**
   * 提取目标变量
   */
  private extractTargetVariables(context: MonitorContext): string {
    const outputConfig = context.metadata?.outputConfig;
    if (!outputConfig || !Array.isArray(outputConfig)) {
      return '未指定';
    }

    const varNames = outputConfig.map((v: any) => v.get || '').filter(Boolean);
    return varNames.join(', ') || '未指定';
  }

  /**
   * 构建投入度趋势
   */
  private buildEngagementTrend(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '';
    
    const recent = history.slice(-3);
    const trends = recent.map((h, i) => 
      `第${h.round}轮: ${h.metrics.user_engagement || '未评估'}`
    );
    
    return trends.join(' → ');
  }

  /**
   * 构建情绪趋势
   */
  private buildEmotionTrend(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '';
    
    const recent = history.slice(-3);
    const trends = recent.map((h, i) => 
      `第${h.round}轮: ${h.metrics.emotional_intensity || '未评估'}`
    );
    
    return trends.join(' → ');
  }
}
