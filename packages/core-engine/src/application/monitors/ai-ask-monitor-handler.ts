/**
 * AiAskMonitorHandler - ai_ask Action监控处理器
 *
 * 监控ai_ask Action执行状态，识别信息收集障碍，生成策略建议
 *
 * 【Phase 3 重构】使用MonitorTemplateService分离模板处理逻辑
 */

import type { ActionMetrics, ActionResult } from '../../domain/actions/base-action.js';
import type { LLMOrchestrator } from '../../engines/llm-orchestration/orchestrator.js';

import {
  BaseMonitorHandler,
  type MonitorAnalysis,
  type MonitorContext,
} from './base-monitor-handler.js';
import { type MonitorTemplateProvider } from './monitor-template-resolver.js';
import {
  DefaultMonitorTemplateService,
  type IMonitorTemplateService,
} from './monitor-template-service.js';

/**
 * ai_ask监控处理器
 *
 * 【Phase 3 重构】依赖注入MonitorTemplateService，职责更单一
 */
export class AiAskMonitorHandler extends BaseMonitorHandler {
  private templateService: IMonitorTemplateService;

  constructor(
    llmOrchestrator: LLMOrchestrator,
    projectRootOrId: string,
    templateProvider?: MonitorTemplateProvider,
    templateService?: IMonitorTemplateService // 【新增】支持注入自定义服务
  ) {
    super();

    // 使用注入的服务，或创建默认服务（向后兼容）
    this.templateService =
      templateService ||
      new DefaultMonitorTemplateService(llmOrchestrator, projectRootOrId, templateProvider);
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
   *
   * 【Phase 3 重构】使用MonitorTemplateService简化流程，代码从90行→30行
   */
  async analyzeWithLLM(metrics: ActionMetrics, context: MonitorContext): Promise<MonitorAnalysis> {
    try {
      // 1. 准备监控变量
      const monitorVariables = this.buildMonitorVariables(metrics, context);

      // 2. 生成监控提示词（委托给服务）
      const prompt = await this.templateService.generateMonitorPrompt(
        'ai_ask',
        monitorVariables,
        context
      );

      // 提示词为空表示模板不存在，返回空反馈
      if (!prompt) {
        console.warn('[AiAskMonitorHandler] 监控提示词为空，返回空反馈');
        return this.getEmptyAnalysis('normal');
      }

      // 3. 调用监控LLM（委托给服务）
      const llmResponse = await this.templateService.callMonitorLLM(prompt);

      // 4. 解析监控LLM输出
      const parseResult = this.parseMonitorOutput(llmResponse);

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
      return this.getEmptyAnalysis('error', { parseError: true });
    }
  }

  /**
   * 获取空分析结果（提取复用逻辑）
   */
  private getEmptyAnalysis(
    reason: string = 'normal',
    metadata?: Record<string, any>
  ): MonitorAnalysis {
    return {
      intervention_needed: false,
      intervention_reason: reason,
      intervention_level: 'action_feedback',
      strategy_suggestion: 'continue',
      feedback_for_action: '',
      orchestration_needed: false,
      metadata,
    };
  }

  /**
   * 构建监控变量
   */
  private buildMonitorVariables(
    metrics: ActionMetrics,
    context: MonitorContext
  ): Record<string, string> {
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
    const trends = recent.map((h) => `第${h.round}轮: ${h.metrics.user_engagement || '未评估'}`);

    return trends.join(' → ');
  }

  /**
   * 构建情绪趋势
   */
  private buildEmotionTrend(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '';

    const recent = history.slice(-3);
    const trends = recent.map(
      (h) => `第${h.round}轮: ${h.metrics.emotional_intensity || '未评估'}`
    );

    return trends.join(' → ');
  }
}
