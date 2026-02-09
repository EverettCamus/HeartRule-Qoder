/**
 * AiSayMonitorHandler - ai_say Action监控处理器
 *
 * 监控ai_say Action执行状态，识别用户理解困难，生成表达优化建议
 *
 * 【Phase 3 重构】使用MonitorTemplateService分离模板处理逻辑
 */

import type { ActionMetrics, ActionResult } from '../actions/base-action.js';
import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';

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
 * ai_say监控处理器
 *
 * 【Phase 3 重构】依赖注入MonitorTemplateService，职责更单一
 */
export class AiSayMonitorHandler extends BaseMonitorHandler {
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
   *
   * 【Phase 3 重构】使用MonitorTemplateService简化流程，代码从90行→30行
   */
  async analyzeWithLLM(metrics: ActionMetrics, context: MonitorContext): Promise<MonitorAnalysis> {
    try {
      // 1. 准备监控变量
      const monitorVariables = this.buildMonitorVariables(metrics, context);

      // 2. 生成监控提示词（委托给服务）
      const prompt = await this.templateService.generateMonitorPrompt(
        'ai_say',
        monitorVariables,
        context
      );

      // 提示词为空表示模板不存在，返回空反馈
      if (!prompt) {
        console.warn('[AiSayMonitorHandler] 监控提示词为空，返回空反馈');
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

      console.log('[AiSayMonitorHandler] 监控分析完成:', {
        intervention_needed: parseResult.analysis.intervention_needed,
        intervention_level: parseResult.analysis.intervention_level,
        parseError: (parseResult.parseError?.retryCount || 0) > 1,
      });

      return parseResult.analysis;
    } catch (error: any) {
      console.error('[AiSayMonitorHandler] 监控分析失败:', error);

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
    const trends = recent.map(
      (h) => `第${h.round}轮: ${h.metrics.understanding_level || '未评估'}`
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
    const questionCount = recent.filter(
      (h) => h.metrics.user_engagement && h.metrics.user_engagement.includes('提问')
    ).length;

    return `最近${recent.length}轮中有${questionCount}次提问`;
  }
}
