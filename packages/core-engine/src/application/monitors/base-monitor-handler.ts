/**
 * 监控处理器基类和接口定义
 *
 * 用于Topic层监控分析，识别Action执行障碍，生成策略建议
 */

import type { ActionResult, ActionMetrics, ProgressSuggestion } from '../../domain/actions/base-action.js';

/**
 * 监控分析结果
 *
 * 监控LLM的输出结果，包含介入判断、策略建议和反馈内容
 */
export interface MonitorAnalysis {
  intervention_needed: boolean; // 是否需要Topic层介入
  intervention_reason: string; // 介入原因：blocked/off_topic/insufficient/normal
  intervention_level: 'action_feedback' | 'topic_orchestration'; // 介入级别
  strategy_suggestion: string; // 推荐策略：rephrase/comfort/accept_partial/skip
  feedback_for_action: string; // 给Action主线程的反馈文本
  modified_approach?: string; // 具体的调整方式建议
  example_suggestion?: string; // 具体例子建议（ai_say专用）
  orchestration_needed: boolean; // 是否需要触发动作编排（本Story固定false）

  // 元数据
  metadata?: {
    parseError?: boolean; // 监控LLM输出解析是否失败
    parseRetryCount?: number; // JSON解析重试次数
  };
}

/**
 * 监控上下文
 *
 * 传递给监控处理器的上下文信息
 */
export interface MonitorContext {
  sessionId: string;
  actionId: string;
  actionType: string;
  currentRound: number;
  maxRounds: number;

  // Action执行结果
  actionResult: ActionResult;

  // 历史metrics（可选）
  metricsHistory?: Array<{
    round: number;
    metrics: ActionMetrics;
    progress_suggestion?: ProgressSuggestion;
    timestamp: string;
  }>;

  // Topic策略配置（可选）
  topicStrategy?: {
    min_completeness_requirement?: string;
    retry_strategy?: string;
    max_retry_count?: number;
  };

  // 其他元数据
  metadata?: Record<string, any>;
}

/**
 * 监控处理器基类
 *
 * 定义监控处理器的通用接口，所有具体监控处理器继承此类
 */
export abstract class BaseMonitorHandler {
  /**
   * 解析并验证metrics
   *
   * @param result ActionResult
   * @returns 提取的metrics对象
   */
  abstract parseMetrics(result: ActionResult): ActionMetrics;

  /**
   * 调用监控LLM进行分析（异步）
   *
   * @param metrics 系统变量
   * @param context 监控上下文
   * @returns 监控分析结果
   */
  abstract analyzeWithLLM(
    metrics: ActionMetrics,
    context: MonitorContext
  ): Promise<MonitorAnalysis>;

  /**
   * 生成反馈提示词片段
   *
   * 将监控分析结果转换为可拼接到Action主线程提示词的文本
   *
   * @param analysis 监控分析结果
   * @returns 反馈提示词文本
   */
  buildFeedbackPrompt(analysis: MonitorAnalysis): string {
    if (!analysis.intervention_needed || !analysis.feedback_for_action) {
      return '';
    }

    let feedback = `【Topic层策略建议】\n${analysis.feedback_for_action}\n`;

    if (analysis.modified_approach) {
      feedback += `\n【建议调整方式】\n${analysis.modified_approach}\n`;
    }

    if (analysis.example_suggestion) {
      feedback += `\n【具体例子】\n${analysis.example_suggestion}\n`;
    }

    feedback += `\n请根据以上建议调整你的回复方式。\n`;

    return feedback;
  }

  /**
   * 判断是否需要触发Topic动作编排（扩展点）
   *
   * 本Story阶段固定返回false，未来实现时根据analysis判断
   *
   * @param analysis 监控分析结果
   * @returns 是否需要触发编排
   */
  shouldTriggerOrchestration(_analysis: MonitorAnalysis): boolean {
    // TODO: 未来实现TopicActionOrchestrator集成
    // 当intervention_level='topic_orchestration'且orchestration_needed=true时返回true
    return false;
  }

  /**
   * 解析监控LLM输出（支持3次重试）
   *
   * @param rawResponse 监控LLM原始响应
   * @returns 解析结果
   */
  protected parseMonitorOutput(rawResponse: string): {
    analysis: MonitorAnalysis;
    parseError?: {
      retryCount: number;
      strategies: string[];
      finalError: string;
    };
  } {
    const MAX_PARSE_RETRY = 3;
    const RETRY_STRATEGIES = ['direct_parse', 'trim_and_parse', 'extract_json_block'];

    let parseAttempt = 0;
    let lastError: Error | null = null;

    for (const strategy of RETRY_STRATEGIES) {
      parseAttempt++;

      try {
        const cleanedResponse = this.applyParseStrategy(rawResponse, strategy);
        const analysis = JSON.parse(cleanedResponse) as MonitorAnalysis;

        // 验证必需字段
        if (typeof analysis.intervention_needed !== 'boolean') {
          analysis.intervention_needed = false;
        }
        if (!analysis.feedback_for_action) {
          analysis.feedback_for_action = '';
        }

        if (parseAttempt > 1) {
          console.warn(
            `[MonitorHandler] JSON解析在第${parseAttempt}次尝试成功，使用策略: ${strategy}`
          );
          return {
            analysis,
            parseError: {
              retryCount: parseAttempt,
              strategies: RETRY_STRATEGIES.slice(0, parseAttempt),
              finalError: '',
            },
          };
        }

        // 第1次就成功，不返回parseError
        return {
          analysis,
        };
      } catch (e: any) {
        lastError = e;
        console.warn(
          `[MonitorHandler] JSON解析第${parseAttempt}次失败，策略: ${strategy}，错误: ${e.message}`
        );

        if (parseAttempt >= MAX_PARSE_RETRY) {
          console.error('[MonitorHandler] 监控LLM解析重试耗尽，返回空反馈');
          console.error('[MonitorHandler] 最后错误:', lastError);
          console.error('[MonitorHandler] 原始响应:', rawResponse);

          // 降级：返回空分析结果，不提供反馈
          return {
            analysis: this.getDefaultAnalysis(),
            parseError: {
              retryCount: parseAttempt,
              strategies: RETRY_STRATEGIES,
              finalError: lastError?.message || 'Unknown error',
            },
          };
        }
      }
    }

    // 应该不会达到这里
    return {
      analysis: this.getDefaultAnalysis(),
      parseError: {
        retryCount: MAX_PARSE_RETRY,
        strategies: RETRY_STRATEGIES,
        finalError: lastError?.message || 'Unknown error',
      },
    };
  }

  /**
   * 应用解析策略
   */
  private applyParseStrategy(rawResponse: string, strategy: string): string {
    switch (strategy) {
      case 'direct_parse':
        return rawResponse;

      case 'trim_and_parse':
        return rawResponse.trim();

      case 'extract_json_block': {
        const match = rawResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          return match[1].trim();
        }
        return rawResponse.trim();
      }

      default:
        return rawResponse;
    }
  }

  /**
   * 获取默认分析结果（解析失败时）
   */
  private getDefaultAnalysis(): MonitorAnalysis {
    return {
      intervention_needed: false,
      intervention_reason: 'normal',
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
