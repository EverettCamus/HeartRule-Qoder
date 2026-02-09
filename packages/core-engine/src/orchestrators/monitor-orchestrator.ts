/**
 * Monitor Orchestrator - Coordinates monitor handlers and analysis
 *
 * [Phase 5] Extracted from ScriptExecutor.triggerMonitorAnalysis
 *
 * Responsibilities:
 * - Select appropriate monitor handler based on action type
 * - Trigger LLM-based analysis
 * - Store monitoring feedback
 * - Manage intervention decisions
 */

import type { ActionResult } from '../actions/base-action.js';
import type { LLMOrchestrator } from '../engines/llm-orchestration/orchestrator.js';
import type { ExecutionState } from '../engines/script-execution/script-executor.js';
import { AiAskMonitorHandler } from '../monitors/ai-ask-monitor-handler.js';
import { AiSayMonitorHandler } from '../monitors/ai-say-monitor-handler.js';
import type { MonitorContext } from '../monitors/base-monitor-handler.js';
import type { MonitorTemplateProvider } from '../monitors/monitor-template-resolver.js';

export class MonitorOrchestrator {
  constructor(
    private llmOrchestrator: LLMOrchestrator,
    private projectId?: string
  ) {}

  /**
   * Trigger monitor analysis for action execution result
   */
  async analyze(
    actionType: string,
    actionId: string,
    result: ActionResult,
    executionState: ExecutionState,
    sessionId: string,
    phaseId: string,
    topicId: string
  ): Promise<void> {
    console.log('[MonitorOrchestrator] 📊 Triggering monitor analysis:', {
      actionType,
      actionId,
      hasMetrics: !!result.metrics,
    });

    try {
      // Build monitor context
      const monitorContext: MonitorContext = {
        sessionId,
        actionId,
        actionType,
        currentRound: result.metadata?.currentRound || 1,
        maxRounds: result.metadata?.maxRounds || 3,
        actionResult: result,
        metricsHistory: executionState.metadata.actionMetricsHistory || [],
        metadata: {
          sessionConfig: executionState.metadata.sessionConfig,
          templateProvider: executionState.metadata.templateProvider,
          projectId: executionState.metadata.projectId,
          phaseId,
          topicId,
        },
      };

      // Select appropriate monitor handler
      const projectId = executionState.metadata.projectId;
      const templateProvider = executionState.metadata.templateProvider;
      const monitorHandler = this.selectHandler(actionType, projectId, templateProvider);
      if (!monitorHandler) {
        console.warn('[MonitorOrchestrator] ⚠️ Unsupported Action type:', actionType);
        return;
      }

      // Parse metrics
      const metrics = monitorHandler.parseMetrics(result);

      // Set monitor LLM analysis
      const analysis = await monitorHandler.analyzeWithLLM(metrics, monitorContext);

      console.log('[MonitorOrchestrator] ✅ Monitor analysis result:', {
        intervention_needed: analysis.intervention_needed,
        intervention_level: analysis.intervention_level,
      });

      // Store monitor feedback result
      this.storeFeedback(executionState, actionId, actionType, analysis);

      // If intervention needed, generate feedback prompt
      if (analysis.intervention_needed) {
        const feedbackPrompt = monitorHandler.buildFeedbackPrompt(analysis);
        if (feedbackPrompt) {
          // Store feedback prompt, wait for next Action to append
          executionState.metadata.latestMonitorFeedback = feedbackPrompt;
          console.log(
            '[MonitorOrchestrator] 💬 Generated feedback prompt:',
            feedbackPrompt.substring(0, 100) + '...'
          );
        }
      }

      // Check if need to trigger Topic orchestration (currently fixed to false)
      const needOrchestration = monitorHandler.shouldTriggerOrchestration(analysis);
      if (needOrchestration) {
        console.log('[MonitorOrchestrator] 🎯 Triggering Topic orchestration...');
        // TODO: Not yet implemented TopicActionOrchestrator logic
      }
    } catch (error: any) {
      console.error('[MonitorOrchestrator] ❌ Monitor analysis error:', error);
      // Analysis failure does not affect main process, only log error
    }
  }

  /**
   * Select appropriate monitor handler based on action type
   */
  private selectHandler(
    actionType: string,
    projectId: string | undefined,
    templateProvider: MonitorTemplateProvider | undefined
  ): AiAskMonitorHandler | AiSayMonitorHandler | null {
    const pid = projectId || '.';

    if (actionType === 'ai_ask') {
      return new AiAskMonitorHandler(this.llmOrchestrator, pid, templateProvider);
    } else if (actionType === 'ai_say') {
      return new AiSayMonitorHandler(this.llmOrchestrator, pid, templateProvider);
    }

    return null;
  }

  /**
   * Store monitoring feedback to execution state
   */
  private storeFeedback(
    executionState: ExecutionState,
    actionId: string,
    actionType: string,
    analysis: any
  ): void {
    if (!executionState.metadata.monitorFeedback) {
      executionState.metadata.monitorFeedback = [];
    }

    executionState.metadata.monitorFeedback.push({
      actionId,
      actionType,
      timestamp: new Date().toISOString(),
      analysis,
    });
  }
}
