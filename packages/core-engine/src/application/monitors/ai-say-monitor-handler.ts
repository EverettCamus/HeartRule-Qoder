/**
 * AiSayMonitorHandler - ai_say Action监控处理器
 *
 * 监控ai_say Action执行状态，识别用户理解困难，生成表达优化建议
 *
 * 【Phase 3 重构】使用MonitorTemplateService分离模板处理逻辑
 */

import type { ActionResult } from '../../domain/actions/base-action.js';
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
    templateService?: IMonitorTemplateService
  ) {
    super();

    this.templateService =
      templateService ||
      new DefaultMonitorTemplateService(llmOrchestrator, projectRootOrId, templateProvider);
  }

  parseMetrics(result: ActionResult): Record<string, any> {
    return {
      assessment: result.metadata?.assessment || '',
      progress: result.metadata?.progress || '',
      brief: result.metadata?.brief || '',
      shouldExit: result.metadata?.shouldExit || false,
    };
  }

  async analyzeWithLLM(
    metrics: Record<string, any>,
    context: MonitorContext
  ): Promise<MonitorAnalysis> {
    try {
      const monitorVariables = this.buildMonitorVariables(metrics, context);

      const prompt = await this.templateService.generateMonitorPrompt(
        'ai_say',
        monitorVariables,
        context
      );

      if (!prompt) {
        console.warn('[AiSayMonitorHandler] 监控提示词为空，返回空反馈');
        return this.getEmptyAnalysis('normal');
      }

      const llmResponse = await this.templateService.callMonitorLLM(prompt);

      const parseResult = this.parseMonitorOutput(llmResponse);

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

      return this.getEmptyAnalysis('error', { parseError: true });
    }
  }

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

  private buildMonitorVariables(
    metrics: Record<string, any>,
    context: MonitorContext
  ): Record<string, string> {
    const vars: Record<string, string> = {
      current_round: context.currentRound.toString(),
      max_rounds: context.maxRounds.toString(),
      topic_content: this.extractTopicContent(context),
      assessment: metrics.assessment || '',
      progress: metrics.progress || '',
      brief: metrics.brief || '',
    };

    if (context.metadata?.userProfile) {
      const profile = context.metadata.userProfile;
      vars.education_background = profile.education_background || '';
      vars.psychology_knowledge = profile.psychology_knowledge || '';
      vars.learning_style = profile.learning_style || '';
    }

    if (context.metricsHistory && context.metricsHistory.length > 0) {
      vars.assessment_trend = this.buildAssessmentTrend(context.metricsHistory);
    }

    return vars;
  }

  private extractTopicContent(context: MonitorContext): string {
    return context.metadata?.topicContent || context.actionResult.aiMessage || '未知主题';
  }

  private buildAssessmentTrend(history: MonitorContext['metricsHistory']): string {
    if (!history || history.length === 0) return '';

    const recent = history.slice(-3);
    const trends = recent.map((h) => `第${h.round}轮: ${h.assessment || '未评估'}`);

    return trends.join(' → ');
  }
}
