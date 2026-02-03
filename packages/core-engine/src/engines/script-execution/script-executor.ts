/**
 * 鑴氭湰鎵ц�寮曟搸鏍稿績鎵ц�鍣?
 *
 * 鍙傜収: legacy-python/src/engines/script_execution/executor.py
 * MVP 绠€鍖栫増鏈�細鏀�寔 ai_say 鍜?ai_ask
 *
 * 銆怐DD 瑙嗚� - 閲嶆瀯杩涜�涓�€?
 * ExecutionState 鏄�墽琛屽櫒鐨勪复鏃惰繍琛屾椂缁撴瀯锛岀敤浜庨┍鍔ㄨ剼鏈�墽琛屾祦绋嬨€?
 * Session 棰嗗煙妯″瀷鎵嶆槸鎸佷箙鍖栫殑鐘舵€佹壙杞借€呫€?
 *
 * 閲嶆瀯鏂瑰悜锛?
 * - ExecutionState 绠€鍖栦负绾�补鐨勬墽琛岃�鍥撅紙褰撳墠浣嶇疆 + 涓存椂涓婁笅鏂囷級
 * - 鐘舵€佸彉鏇撮€昏緫鏀舵暃鍒?Session 鑱氬悎鏍?
 * - 鎵ц�鍣ㄤ粠 Session 璇诲彇/鏇存柊鐘舵€侊紝鑰岄潪鑷��缁存姢鍓�湰
 */

import type { VariableStore } from '@heartrule/shared-types';

import { createAction } from '../../actions/action-registry.js';
import { AiAskAction } from '../../actions/ai-ask-action.js';
import { AiSayAction } from '../../actions/ai-say-action.js';
import type { BaseAction, ActionContext, ActionResult } from '../../actions/base-action.js';
import type { LLMDebugInfo } from '../llm-orchestration/orchestrator.js';
import { LLMOrchestrator } from '../llm-orchestration/orchestrator.js';
import { VolcanoDeepSeekProvider } from '../llm-orchestration/volcano-provider.js';
import type { TemplateProvider } from '../prompt-template/template-provider.js';
import { VariableScopeResolver } from '../variable-scope/variable-scope-resolver.js';

/**
 * 鎵ц�鐘舵€?
 */
export enum ExecutionStatus {
  RUNNING = 'running',
  WAITING_INPUT = 'waiting_input', // 络夊緟鐢ㄦ埛杈撳叆
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
}

/**
 * 鎵ц�浣嶇疆
 */
export interface ExecutionPosition {
  phaseIndex: number;
  topicIndex: number;
  actionIndex: number;
}

/**
 * 鎵ц�鐘舵€?
 *
 * 銆愪复鏃剁粨鏋勩€戠敤浜庡湪鑴氭湰鎵ц�杩囩▼涓�紶閫掔姸鎬侊紝涓嶇洿鎺ユ寔涔呭寲銆?
 * 璇ョ粨鏋勫皢鍦ㄩ噸鏋勭�浜岄樁娈佃繘涓€姝ョ畝鍖栵紝鐘舵€佺淮鎶よ亴璐ｈ浆绉诲埌 Session 棰嗗煙妯″瀷銆?
 *
 * 鏈�瑰悜锛?
 * - 绠€鍖栦负鎵ц�瑙嗗浘锛歝urrentPosition + context + tempCache
 * - 绉婚櫎涓?Session 閲嶅�鐨勫瓧娈碉紙status, variables, conversationHistory 络夛級
 */
export interface ExecutionState {
  status: ExecutionStatus;
  currentPhaseIdx: number;
  currentTopicIdx: number;
  currentActionIdx: number;
  currentAction: BaseAction | null;
  variables: Record<string, any>;
  // 鏂板�锛氬バー灞傚彉閲忓瓨鍌ㄧ粨鏋?
  variableStore?: VariableStore;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  lastAiMessage: string | null;
  // 鎵╁睍浣嶇疆淇℃伅
  currentPhaseId?: string;
  currentTopicId?: string;
  currentActionId?: string;
  currentActionType?: string;
  // LLM璋冭瘯淇℃伅锛堟渶杩戜竴娆�LM璋冪敤锛?
  lastLLMDebugInfo?: LLMDebugInfo;
}

/**
 * 鑴氭湰鎵ц�鍣?
 */
export class ScriptExecutor {
  private llmOrchestrator: LLMOrchestrator;

  constructor() {
    // 鍒濆�鍖?LLM 缂栨帓鍣?
    // 浠庣幆澧冨彉閲忚�鍙栭厤缃�紙鍏煎� VOLCANO 鍜?VOLCENGINE 鍓嶇紑锛?
    const apiKey =
      process.env.VOLCENGINE_API_KEY ||
      process.env.VOLCANO_API_KEY ||
      process.env.ARK_API_KEY ||
      '';
    const endpointId =
      process.env.VOLCENGINE_MODEL || process.env.VOLCANO_ENDPOINT_ID || 'deepseek-v3-250324';
    const baseUrl =
      process.env.VOLCENGINE_BASE_URL ||
      process.env.VOLCANO_BASE_URL ||
      'https://ark.cn-beijing.volces.com/api/v3';

    // 鍒涘缓鐏�北寮曟搸 DeepSeek Provider
    const provider = new VolcanoDeepSeekProvider(
      {
        model: endpointId,
        temperature: 0.7,
        maxTokens: 2000,
      },
      apiKey,
      endpointId,
      baseUrl
    );

    // 鍒涘缓 LLM Orchestrator
    this.llmOrchestrator = new LLMOrchestrator(provider, 'volcano');

    console.log('[ScriptExecutor] 馃� LLM Orchestrator initialized:', {
      provider: 'volcano',
      endpointId,
      hasApiKey: !!apiKey,
      baseUrl,
    });
  }
  /**
   * 鎵ц�浼氳皥娴佺▼鑴氭湰
   */
  async executeSession(
    scriptContent: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null,
    projectId?: string,
    templateProvider?: TemplateProvider
  ): Promise<ExecutionState> {
    try {
      // 娓愯繘寮忚縼绉伙細濡傛灉娌℃湁 variableStore锛屼粠 variables 杩佺Щ鏁版嵁
      if (!executionState.variableStore && executionState.variables) {
        console.log('[ScriptExecutor] 馃攧 Migrating variables to variableStore');
        executionState.variableStore = {
          global: {},
          session: {},
          phase: {},
          topic: {},
        };

        // 灏嗘棫鏁版嵁杩佺Щ鍒?session 浣滅敤鍩?
        for (const [key, value] of Object.entries(executionState.variables)) {
          executionState.variableStore.session[key] = {
            value,
            type: this.inferType(value),
            source: 'migrated',
            lastUpdated: new Date().toISOString(),
          };
        }

        console.log(
          '[ScriptExecutor] 鉁?Migrated',
          Object.keys(executionState.variables).length,
          'variables to session scope'
        );
      }

      // 瑙ｆ瀽鑴氭湰
      const parsed = JSON.parse(scriptContent);
      const sessionData = parsed.session;
      const phases = sessionData.phases;

      // ?? 提取 session 配置(包括 template_scheme)并保存到 metadata
      if (!executionState.metadata.sessionConfig) {
        executionState.metadata.sessionConfig = {
          template_scheme: sessionData.template_scheme,
        };
        console.log('[ScriptExecutor] ?? Extracted session config:', {
          template_scheme: sessionData.template_scheme,
        });
      }

      // 💉 将 projectId 和 templateProvider 注入到 metadata (WI-2)
      if (projectId) {
        executionState.metadata.projectId = projectId;
        console.log('[ScriptExecutor] 💉 Injected projectId to metadata:', projectId);
      }
      if (templateProvider) {
        executionState.metadata.templateProvider = templateProvider;
        console.log('[ScriptExecutor] 💉 Injected templateProvider to metadata');
      }

      // 濡傛灉 metadata 涓�湁淇濆瓨鐨?Action 鐘舵€侊紝鎭㈠�瀹?
      if (executionState.metadata.actionState && !executionState.currentAction) {
        console.log('[ScriptExecutor] 馃攧 Deserializing action state:', {
          actionId: executionState.metadata.actionState.actionId,
          actionType: executionState.metadata.actionState.actionType,
          currentRound: executionState.metadata.actionState.currentRound,
          currentActionIdx: executionState.currentActionIdx,
        });
        executionState.currentAction = this.deserializeActionState(
          executionState.metadata.actionState
        );
      } else {
        console.log(
          '[ScriptExecutor] 馃數 No action state to restore, currentActionIdx:',
          executionState.currentActionIdx
        );
      }

      // 濡傛灉鏈夊綋鍓岮ction姝ｅ湪鎵ц�锛岀户缁�墽琛?
      if (executionState.currentAction) {
        // 鎭㈠�浣嶇疆 ID 淇℃伅
        const resumedPhase = phases[executionState.currentPhaseIdx];
        if (resumedPhase) {
          executionState.currentPhaseId = resumedPhase.phase_id;
          const resumedTopic = resumedPhase.topics[executionState.currentTopicIdx];
          if (resumedTopic) {
            executionState.currentTopicId = resumedTopic.topic_id;
            const resumedActionConfig = resumedTopic.actions[executionState.currentActionIdx];
            if (resumedActionConfig) {
              executionState.currentActionId = resumedActionConfig.action_id;
              executionState.currentActionType = resumedActionConfig.action_type;
            }
          }
        }

        console.log('[ScriptExecutor] 馃攧 Continuing current action:', {
          actionId: executionState.currentAction.actionId,
          actionIdx: executionState.currentActionIdx,
          phaseId: executionState.currentPhaseId,
          topicId: executionState.currentTopicId,
        });
        const result = await this.continueAction(
          executionState.currentAction,
          executionState,
          sessionId,
          userInput
        );

        if (!result.completed) {
          // Action鏈�畬鎴愶紝缁х画绛夊緟
          executionState.status = ExecutionStatus.WAITING_INPUT;

          // 鈿狅笍 鍏抽敭淇��锛氬嵆浣緼ction鏈�畬鎴愶紝涔�悊宸叉彁鍙栫殑鍙橀噺
          if (result.extractedVariables) {
            // 鍚戝悗鍏煎�锛氱户缁�洿鏂版棫鐨?variables
            executionState.variables = {
              ...executionState.variables,
              ...result.extractedVariables,
            };

            // 鏂伴€昏緫锛氫娇鐢?VariableScopeResolver 鍐欏叆鍒嗗眰鍙橀噺
            if (executionState.variableStore) {
              const scopeResolver = new VariableScopeResolver(executionState.variableStore);
              const position = {
                phaseId: executionState.currentPhaseId,
                topicId: executionState.currentTopicId,
                actionId: executionState.currentAction.actionId,
              };

              for (const [varName, varValue] of Object.entries(result.extractedVariables)) {
                // 纭�畾鐩�爣浣滅敤鍩?
                const targetScope = scopeResolver.determineScope(varName);

                // 鍐欏叆鍙橀噺
                scopeResolver.setVariable(
                  varName,
                  varValue,
                  targetScope,
                  position,
                  executionState.currentAction.actionId
                );
              }
            }
          }

          // Action鏈�畬鎴愶紝浣嗗彲鑳芥湁 AI 娑堟伅锛堝� ai_ask 鐨勯棶棰樻垨 ai_say 鐨勪笅涓€杞��璇濆唴瀹癸級
          if (result.aiMessage) {
            executionState.lastAiMessage = result.aiMessage;
            // 涔熸坊鍔犲埌瀵硅瘽鍘嗗彶
            executionState.conversationHistory.push({
              role: 'assistant',
              content: result.aiMessage,
              actionId: executionState.currentAction.actionId,
              metadata: result.metadata,
            });
            console.log(
              '[ScriptExecutor] 馃摜 Saved intermediate AI message from continued action'
            );
          }

          // 淇濆瓨LLM璋冭瘯淇℃伅锛堝�鏋滄湁锛?
          if (result.debugInfo) {
            executionState.lastLLMDebugInfo = result.debugInfo;
            console.log(
              '[ScriptExecutor] 馃捑 Saved intermediate LLM debug info from continued action'
            );
          }

          // 淇濆瓨鍥炲悎鏁颁俊鎭�紙浠?result.metadata 鎻愬彇锛?
          if (
            result.metadata?.currentRound !== undefined ||
            result.metadata?.maxRounds !== undefined
          ) {
            executionState.metadata.lastActionRoundInfo = {
              actionId: executionState.currentAction.actionId,
              currentRound: result.metadata.currentRound,
              maxRounds: result.metadata.maxRounds,
              exitDecision: result.metadata.exitDecision,
            };
            console.log(
              '[ScriptExecutor] 馃攧 Saved intermediate action round info:',
              executionState.metadata.lastActionRoundInfo
            );
          }

          // 璁板綍閫€鍑哄喅绛栧埌鍘嗗彶锛堝�鏋滄湁锛?
          if (result.metadata?.exitDecision) {
            if (!executionState.metadata.exitHistory) {
              executionState.metadata.exitHistory = [];
            }
            executionState.metadata.exitHistory.push({
              actionId: executionState.currentAction.actionId,
              round: result.metadata.currentRound || executionState.currentAction.currentRound || 0,
              decision: result.metadata.exitDecision,
              timestamp: new Date().toISOString(),
            });
            console.log(
              '[ScriptExecutor] 馃搳 Recorded exit decision to history:',
              result.metadata.exitDecision
            );
          }

          // 淇濆瓨 Action 鍐呴鐘舵€?
          executionState.metadata.actionState = this.serializeActionState(
            executionState.currentAction
          );
          console.log('[ScriptExecutor] 鈴革笍 Action still not completed, waiting for more input');
          return executionState;
        }

        // Action瀹屾垚锛屽�鐞嗙粨鏋?
        console.log('[ScriptExecutor] 鉁?Action completed via continue:', {
          actionId: executionState.currentAction.actionId,
          hasAiMessage: !!result.aiMessage,
        });
        if (result.success) {
          // 鏇存柊鍙橀噺锛氫娇鐢?VariableScopeResolver 鍐欏叆鍒版�纭�殑浣滅敤鍩?
          if (result.extractedVariables) {
            // 鍚戝悗鍏煎�锛氱户缁�洿鏂版棫鐨?variables
            executionState.variables = {
              ...executionState.variables,
              ...result.extractedVariables,
            };

            // 鏂伴€昏緫锛氫娇鐢?VariableScopeResolver 鍐欏叆鍒嗗眰鍙橀噺
            if (executionState.variableStore) {
              console.log(
                `[ScriptExecutor] 馃攳 Processing extracted variables (continueAction):`,
                result.extractedVariables
              );
              console.log(`[ScriptExecutor] 馃攳 Current position:`, {
                phaseId: executionState.currentPhaseId,
                topicId: executionState.currentTopicId,
                actionId: executionState.currentAction.actionId,
              });

              const scopeResolver = new VariableScopeResolver(executionState.variableStore);
              const position = {
                phaseId: executionState.currentPhaseId,
                topicId: executionState.currentTopicId,
                actionId: executionState.currentAction.actionId,
              };

              for (const [varName, varValue] of Object.entries(result.extractedVariables)) {
                console.log(
                  `[ScriptExecutor] 馃攳 Processing variable "${varName}" with value:`,
                  varValue
                );

                // 纭�畾鐩�爣浣滅敤鍩?
                const targetScope = scopeResolver.determineScope(varName);
                console.log(`[ScriptExecutor] 馃搵 Target scope for "${varName}":`, targetScope);

                // 鍐欏叆鍙橀噺
                scopeResolver.setVariable(
                  varName,
                  varValue,
                  targetScope,
                  position,
                  executionState.currentAction.actionId
                );
                console.log(
                  `[ScriptExecutor] 鉁?Set variable "${varName}" to ${targetScope} scope`
                );
              }

              // 楠岃瘉鍙橀噺鏄�惁鐪熺殑鍐欏叆鎴愬姛
              console.log(
                `[ScriptExecutor] 馃攳 Verifying variableStore after writing (continueAction):`
              );
              console.log(
                `[ScriptExecutor] - Global:`,
                Object.keys(executionState.variableStore.global)
              );
              console.log(
                `[ScriptExecutor] - Session:`,
                Object.keys(executionState.variableStore.session)
              );
              if (executionState.currentPhaseId) {
                console.log(
                  `[ScriptExecutor] - Phase[${executionState.currentPhaseId}]:`,
                  executionState.variableStore.phase[executionState.currentPhaseId]
                    ? Object.keys(executionState.variableStore.phase[executionState.currentPhaseId])
                    : 'undefined'
                );
              }
              if (executionState.currentTopicId) {
                console.log(
                  `[ScriptExecutor] - Topic[${executionState.currentTopicId}]:`,
                  executionState.variableStore.topic[executionState.currentTopicId]
                    ? Object.keys(executionState.variableStore.topic[executionState.currentTopicId])
                    : 'undefined'
                );
              }
            } else {
              console.warn(
                `[ScriptExecutor] 鈿狅笍 variableStore is not initialized, cannot write variables to scopes`
              );
            }
          }

          // 娣诲姞AI娑堟伅鍒板�璇濆巻鍙?
          if (result.aiMessage) {
            executionState.conversationHistory.push({
              role: 'assistant',
              content: result.aiMessage,
              actionId: executionState.currentAction.actionId,
              metadata: result.metadata,
            });
            executionState.lastAiMessage = result.aiMessage;
          }

          // 淇濆瓨LLM璋冭瘯淇℃伅锛堝�鏋滄湁锛?
          if (result.debugInfo) {
            executionState.lastLLMDebugInfo = result.debugInfo;
          }
        } else {
          // Action鎵ц�澶辫触
          executionState.status = ExecutionStatus.ERROR;
          executionState.metadata.error = result.error;
          return executionState;
        }

        // 缁х画涓嬩竴涓?
        executionState.currentAction = null;
        executionState.currentActionIdx += 1;
        // 娓呴櫎淇濆瓨鐨?Action 鐘舵€?
        delete executionState.metadata.actionState;

        console.log(
          '[ScriptExecutor] 鉃★笍 Action completed via continueAction, moved to next index:',
          executionState.currentActionIdx
        );

        // 棰勮�缃�笅涓€涓?Action 鐨?ID锛堝�鏋滃瓨鍦�級
        const currentPhase = phases[executionState.currentPhaseIdx];
        if (currentPhase) {
          const currentTopic = currentPhase.topics[executionState.currentTopicIdx];
          if (currentTopic && executionState.currentActionIdx < currentTopic.actions.length) {
            const nextActionConfig = currentTopic.actions[executionState.currentActionIdx];
            executionState.currentActionId = nextActionConfig.action_id;
            executionState.currentActionType = nextActionConfig.action_type;
            console.log(
              `[ScriptExecutor] 鉃★笍 Continue: moving to next action: ${nextActionConfig.action_id}`
            );
          } else {
            executionState.currentActionId = undefined;
            executionState.currentActionType = undefined;
          }
        }

        // 鈿狅笍 Action瀹屾垚鍚庣户缁�墽琛屼笅涓€涓?action
        // 杩欐牱 ai_say 纭��鍚庡彲浠ョ鍗虫墽琛屼笅涓€涓?action
        // 娉ㄦ剰锛氫笉瑕?return锛岃�浠ｇ爜缁х画鎵ц�涓嬮潰鐨?executePhase
        console.log('[ScriptExecutor] 鉁?Action completed, continuing to execute next actions');
      }

      // 鎵ц�鑴氭湰娴佺▼
      while (executionState.currentPhaseIdx < phases.length) {
        const phase = phases[executionState.currentPhaseIdx];
        executionState.currentPhaseId = phase.phase_id;

        // 鎵ц�Phase
        await this.executePhase(phase, sessionId, executionState, userInput);

        if (executionState.status === ExecutionStatus.WAITING_INPUT) {
          return executionState;
        }

        // Phase瀹屾垚锛岃繘鍏ヤ笅涓€涓?
        executionState.currentPhaseIdx += 1;
        executionState.currentTopicIdx = 0;
        executionState.currentActionIdx = 0;

        // 棰勮�缃�笅涓€涓?Phase 鐨勭�涓€涓?Topic 鐨勭�涓€涓?Action ID锛堝�鏋滃瓨鍦�級
        if (executionState.currentPhaseIdx < phases.length) {
          const nextPhase = phases[executionState.currentPhaseIdx];
          executionState.currentPhaseId = nextPhase.phase_id;
          if (nextPhase.topics && nextPhase.topics.length > 0) {
            const firstTopic = nextPhase.topics[0];
            executionState.currentTopicId = firstTopic.topic_id;
            if (firstTopic.actions && firstTopic.actions.length > 0) {
              const firstActionConfig = firstTopic.actions[0];
              executionState.currentActionId = firstActionConfig.action_id;
              executionState.currentActionType = firstActionConfig.action_type;
              console.log(
                `[ScriptExecutor] 鉃★笍 Moving to next phase: ${nextPhase.phase_id}, first action: ${firstActionConfig.action_id}`
              );
            } else {
              executionState.currentActionId = undefined;
              executionState.currentActionType = undefined;
            }
          } else {
            executionState.currentTopicId = undefined;
            executionState.currentActionId = undefined;
            executionState.currentActionType = undefined;
          }
        } else {
          executionState.currentPhaseId = undefined;
          executionState.currentTopicId = undefined;
          executionState.currentActionId = undefined;
          executionState.currentActionType = undefined;
        }
      }

      // 鎵€鏈塒hase鎵ц�瀹屾垚
      executionState.status = ExecutionStatus.COMPLETED;
      return executionState;
    } catch (e: any) {
      executionState.status = ExecutionStatus.ERROR;
      executionState.metadata.error = e.message;
      throw new Error(`Script execution failed: ${e.message}`);
    }
  }

  /**
   * 鎵ц�Phase
   */
  private async executePhase(
    phase: any,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const phaseId = phase.phase_id;
    const topics = phase.topics;

    // 鎵ц�Topics
    while (executionState.currentTopicIdx < topics.length) {
      const topic = topics[executionState.currentTopicIdx];
      executionState.currentTopicId = topic.topic_id;

      await this.executeTopic(topic, phaseId, sessionId, executionState, userInput);

      if (executionState.status === ExecutionStatus.WAITING_INPUT) {
        return;
      }

      // Topic瀹屾垚锛岃繘鍏ヤ笅涓€涓?
      executionState.currentTopicIdx += 1;
      executionState.currentActionIdx = 0;

      // 棰勮�缃�笅涓€涓?Topic 鐨勭�涓€涓?Action ID锛堝�鏋滃瓨鍦�級
      if (executionState.currentTopicIdx < topics.length) {
        const nextTopic = topics[executionState.currentTopicIdx];
        executionState.currentTopicId = nextTopic.topic_id;
        if (nextTopic.actions && nextTopic.actions.length > 0) {
          const firstActionConfig = nextTopic.actions[0];
          executionState.currentActionId = firstActionConfig.action_id;
          executionState.currentActionType = firstActionConfig.action_type;
          console.log(
            `[ScriptExecutor] 鉃★笍 Moving to next topic: ${nextTopic.topic_id}, first action: ${firstActionConfig.action_id}`
          );
        } else {
          executionState.currentActionId = undefined;
          executionState.currentActionType = undefined;
        }
      } else {
        executionState.currentTopicId = undefined;
        executionState.currentActionId = undefined;
        executionState.currentActionType = undefined;
      }
    }
  }

  /**
   * 鎵ц�Topic
   */
  private async executeTopic(
    topic: any,
    phaseId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<void> {
    const topicId = topic.topic_id;
    const actions = topic.actions;
    console.log(
      `[ScriptExecutor] 馃數 Executing topic: ${topicId}, actions count: ${actions.length}, currentActionIdx: ${executionState.currentActionIdx}`
    );

    // 鎵ц�Actions
    while (executionState.currentActionIdx < actions.length) {
      const actionConfig = actions[executionState.currentActionIdx];
      console.log(
        `[ScriptExecutor] 馃幆 Executing action [${executionState.currentActionIdx}]: ${actionConfig.action_id} (${actionConfig.action_type})`
      );

      // 鍒涘缓鎴栬幏鍙朅ction瀹炰緥
      if (!executionState.currentAction) {
        const action = this.createAction(actionConfig);
        executionState.currentAction = action;
        executionState.currentActionId = actionConfig.action_id;
        executionState.currentActionType = actionConfig.action_type;
        console.log(`[ScriptExecutor] 鉁?Created action instance: ${action.actionId}`);
      }

      const action = executionState.currentAction;

      // 鎵ц�Action
      const result = await this.executeAction(
        action,
        phaseId,
        topicId,
        sessionId,
        executionState,
        userInput
      );
      console.log(`[ScriptExecutor] 鉁?Action result:`, {
        actionId: action.actionId,
        completed: result.completed,
        success: result.success,
        hasAiMessage: !!result.aiMessage,
        aiMessage: result.aiMessage?.substring(0, 50),
      });

      // user_input 鍙�敤涓€娆?
      userInput = null;

      // 澶勭悊鎵ц�缁撴灉
      if (!result.completed) {
        console.log(`[ScriptExecutor] 鈴革笍 Action not completed, waiting for input`);
        // Action鏈�畬鎴愶紝浣嗗彲鑳芥湁 AI 娑堟伅锛堝� ai_ask 鐨勯棶棰橈級
        if (result.aiMessage) {
          executionState.lastAiMessage = result.aiMessage;
          // 涔熸坊鍔犲埌瀵硅瘽鍘嗗彶
          executionState.conversationHistory.push({
            role: 'assistant',
            content: result.aiMessage,
            actionId: action.actionId,
            metadata: result.metadata,
          });
        }
        // 淇濆瓨LLM璋冭瘯淇℃伅锛堝嵆浣緼ction鏈�畬鎴愶級
        if (result.debugInfo) {
          executionState.lastLLMDebugInfo = result.debugInfo;
          console.log('[ScriptExecutor] 馃捑 Saved LLM debug info (action not completed):', {
            hasPrompt: !!result.debugInfo.prompt,
            hasResponse: !!result.debugInfo.response,
          });
        }
        // 闇€瑕佺瓑寰呯敤鎴疯緭鍏?
        executionState.status = ExecutionStatus.WAITING_INPUT;
        // 淇濆瓨 Action 鍐呴鐘舵€?
        executionState.metadata.actionState = this.serializeActionState(action);
        console.log(`[ScriptExecutor] 馃敶 Returning to wait for user input`);
        return;
      }

      // Action瀹屾垚锛屽�鐞嗙粨鏋?
      console.log(`[ScriptExecutor] 鉁?Action completed successfully`);
      if (result.success) {
        // 鏇存柊鍙橀噺锛氫娇鐢?VariableScopeResolver 鍐欏叆鍒版�纭�殑浣滅敤鍩?
        if (result.extractedVariables) {
          // 鍚戝悗鍏煎�锛氱户缁�洿鏂版棫鐨?variables
          executionState.variables = {
            ...executionState.variables,
            ...result.extractedVariables,
          };

          // 鏂伴€昏緫锛氫娇鐢?VariableScopeResolver 鍐欏叆鍒嗗眰鍙橀噺
          if (executionState.variableStore) {
            console.log(
              `[ScriptExecutor] 馃攳 Processing extracted variables:`,
              result.extractedVariables
            );
            console.log(`[ScriptExecutor] 馃攳 Current position:`, {
              phaseId,
              topicId,
              actionId: action.actionId,
            });

            const scopeResolver = new VariableScopeResolver(executionState.variableStore);
            const position = {
              phaseId,
              topicId,
              actionId: action.actionId,
            };

            for (const [varName, varValue] of Object.entries(result.extractedVariables)) {
              console.log(
                `[ScriptExecutor] 馃攳 Processing variable "${varName}" with value:`,
                varValue
              );

              // 纭�畾鐩�爣浣滅敤鍩?
              const targetScope = scopeResolver.determineScope(varName);
              console.log(`[ScriptExecutor] 馃搵 Target scope for "${varName}":`, targetScope);

              // 鍐欏叆鍙橀噺
              scopeResolver.setVariable(varName, varValue, targetScope, position, action.actionId);
              console.log(`[ScriptExecutor] 鉁?Set variable "${varName}" to ${targetScope} scope`);
            }

            // 楠岃瘉鍙橀噺鏄�惁鐪熺殑鍐欏叆鎴愬姛
            console.log(`[ScriptExecutor] 馃攳 Verifying variableStore after writing:`);
            console.log(
              `[ScriptExecutor] - Global:`,
              Object.keys(executionState.variableStore.global)
            );
            console.log(
              `[ScriptExecutor] - Session:`,
              Object.keys(executionState.variableStore.session)
            );
            console.log(
              `[ScriptExecutor] - Phase[${phaseId}]:`,
              executionState.variableStore.phase[phaseId]
                ? Object.keys(executionState.variableStore.phase[phaseId])
                : 'undefined'
            );
            console.log(
              `[ScriptExecutor] - Topic[${topicId}]:`,
              executionState.variableStore.topic[topicId]
                ? Object.keys(executionState.variableStore.topic[topicId])
                : 'undefined'
            );
          } else {
            console.warn(
              `[ScriptExecutor] 鈿狅笍 variableStore is not initialized, cannot write variables to scopes`
            );
          }
        }

        // 娣诲姞鍒板�璇濆巻鍙?
        if (result.aiMessage) {
          executionState.conversationHistory.push({
            role: 'assistant',
            content: result.aiMessage,
            actionId: action.actionId,
            metadata: result.metadata,
          });
          executionState.lastAiMessage = result.aiMessage;
        }

        // 淇濆瓨LLM璋冭瘯淇℃伅锛堝�鏋滄湁锛?
        if (result.debugInfo) {
          executionState.lastLLMDebugInfo = result.debugInfo;
          console.log('[ScriptExecutor] 馃捑 Saved LLM debug info:', {
            hasPrompt: !!result.debugInfo.prompt,
            hasResponse: !!result.debugInfo.response,
            model: result.debugInfo.model,
          });
        }

        // 淇濆瓨鍥炲悎鏁颁俊鎭�紙浠?result.metadata 鎻愬彇锛?
        if (
          result.metadata?.currentRound !== undefined ||
          result.metadata?.maxRounds !== undefined
        ) {
          executionState.metadata.lastActionRoundInfo = {
            currentRound: result.metadata.currentRound,
            maxRounds: result.metadata.maxRounds,
          };
          console.log(
            '[ScriptExecutor] 馃攧 Saved action round info:',
            executionState.metadata.lastActionRoundInfo
          );
        }
      } else {
        // Action鎵ц�澶辫触
        executionState.status = ExecutionStatus.ERROR;
        executionState.metadata.error = result.error;
        return;
      }

      // 绉诲姩鍒颁笅涓€涓ction
      executionState.currentAction = null;
      executionState.currentActionIdx += 1;
      // 娓呴櫎淇濆瓨鐨?Action 鐘舵€?
      delete executionState.metadata.actionState;

      // 棰勮�缃�笅涓€涓?Action 鐨?ID锛堝�鏋滃瓨鍦�級
      if (executionState.currentActionIdx < actions.length) {
        const nextActionConfig = actions[executionState.currentActionIdx];
        executionState.currentActionId = nextActionConfig.action_id;
        executionState.currentActionType = nextActionConfig.action_type;
        console.log(
          `[ScriptExecutor] 鉃★笍 Moving to next action: ${nextActionConfig.action_id} (${nextActionConfig.action_type})`
        );
      } else {
        // Topic 涓�病鏈夋洿澶?Action 浜?
        executionState.currentActionId = undefined;
        executionState.currentActionType = undefined;
        console.log(`[ScriptExecutor] 鉃★笍 No more actions in this topic`);
      }
    }

    // Topic 鎵€鏈?Actions 宸叉墽琛屽畬鎴?
    console.log(`[ScriptExecutor] 鉁?Topic completed: ${topicId}`);
    executionState.status = ExecutionStatus.RUNNING;
  }

  /**
   * 鎵ц�Action
   */
  private async executeAction(
    action: BaseAction,
    phaseId: string,
    topicId: string,
    sessionId: string,
    executionState: ExecutionState,
    userInput?: string | null
  ): Promise<ActionResult> {
    // 鍒涘缓浣滅敤鍩�В鏋愬櫒
    let scopeResolver: VariableScopeResolver | undefined;
    if (executionState.variableStore) {
      scopeResolver = new VariableScopeResolver(executionState.variableStore);
    }

    // 鏋勫缓鎵ц�涓婁笅鏂?
    const context: ActionContext = {
      sessionId,
      phaseId,
      topicId,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      variableStore: executionState.variableStore,
      scopeResolver,
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // 鎵ц�Action
    return await action.execute(context, userInput);
  }

  /**
   * 缁х画鎵ц�鏈�畬鎴愮殑Action
   */
  private async continueAction(
    action: BaseAction,
    executionState: ExecutionState,
    sessionId: string,
    userInput?: string | null
  ): Promise<ActionResult> {
    // 鏇存柊瀵硅瘽鍘嗗彶锛堢敤鎴疯緭鍏ワ級
    if (userInput) {
      executionState.conversationHistory.push({
        role: 'user',
        content: userInput,
        actionId: action.actionId,
      });
    }

    // 鍒涘缓浣滅敤鍩�В鏋愬櫒
    let scopeResolver: VariableScopeResolver | undefined;
    if (executionState.variableStore) {
      scopeResolver = new VariableScopeResolver(executionState.variableStore);
    }

    // 鏋勫缓鎵ц�涓婁笅鏂?
    const context: ActionContext = {
      sessionId,
      phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
      topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
      actionId: action.actionId,
      variables: { ...executionState.variables },
      variableStore: executionState.variableStore,
      scopeResolver,
      conversationHistory: [...executionState.conversationHistory],
      metadata: { ...executionState.metadata },
    };

    // 缁х画鎵ц�
    return await action.execute(context, userInput);
  }

  /**
   * 鍒涘缓 Action 瀹炰緥
   */
  private createAction(actionConfig: any): BaseAction {
    const actionType = actionConfig.action_type;
    const actionId = actionConfig.action_id;

    // 馃帾 淇℃伅锛氬皢鏁翠釜 actionConfig 浣滀负 config锛岃€屼笉鍙槸 actionConfig.config
    // 杩欐牱 max_rounds銆乵ode銆乼emplate 绞夊瓧娈甸兘鑳借 Action 璇诲彇
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { action_id, action_type, ...restConfig } = actionConfig;
    const config = actionConfig.config
      ? { ...restConfig, ...actionConfig.config } // 如果有 config 字段，合并
      : restConfig; // 否则使用所有其他字段

    // 馃數 璋冭瘯鏃ュ織
    console.log(`[ScriptExecutor] 馃洿锔?Creating action:`, {
      actionType,
      actionId,
      config,
      hasConfig: !!actionConfig.config,
      configKeys: Object.keys(config),
    });

    // 瀵逛簬 ai_say 鍜?ai_ask Action锛屼紶閫?LLMOrchestrator
    if (actionType === 'ai_say') {
      return new AiSayAction(actionId, config, this.llmOrchestrator);
    }

    if (actionType === 'ai_ask') {
      return new AiAskAction(actionId, config, this.llmOrchestrator);
    }

    // 鍏朵粬 Action 绫诲瀷浣跨敤榛樿�鍒涘缓鏂瑰紡
    return createAction(actionType, actionId, config);
  }

  /**
   * 鍒涘缓鍒濆�鎵ц�鐘舵€?
   */
  static createInitialState(): ExecutionState {
    return {
      status: ExecutionStatus.RUNNING,
      currentPhaseIdx: 0,
      currentTopicIdx: 0,
      currentActionIdx: 0,
      currentAction: null,
      variables: {},
      variableStore: {
        // 馃敡 鍒濆�鍖?variableStore
        global: {},
        session: {},
        phase: {},
        topic: {},
      },
      conversationHistory: [],
      metadata: {},
      lastAiMessage: null,
    };
  }

  /**
   * 搴忓垪鍖?Action 鐘舵€侊紙淇濆瓨 currentRound 络夊唴閮ㄧ姸鎬侊級
   */
  private serializeActionState(action: BaseAction): any {
    return {
      actionId: action.actionId,
      actionType: (action.constructor as any).actionType,
      config: action['config'],
      currentRound: action['currentRound'] || 0,
      maxRounds: action['maxRounds'] || 3,
    };
  }

  /**
   * 浠庝繚瀛樼殑鐘舵€佹仮澶?Action 瀹炰緥
   */
  private deserializeActionState(actionState: any): BaseAction {
    // 浣跨敤 this.createAction 鑰屼笉鏄?createAction锛岀‘淇?ai_say 鑳借幏寰?LLMOrchestrator
    const action = this.createAction({
      action_type: actionState.actionType,
      action_id: actionState.actionId,
      config: actionState.config,
    });
    // 鎭㈠�鍐呴鐘舵€?
    console.log('[ScriptExecutor] 馃數 Before restoring state:', {
      actionId: action.actionId,
      currentRound: action.currentRound,
      maxRounds: action.maxRounds,
    });
    action.currentRound = actionState.currentRound || 0;
    action.maxRounds = actionState.maxRounds || 3;
    console.log('[ScriptExecutor] 鉁?After restoring state:', {
      actionId: action.actionId,
      currentRound: action.currentRound,
      maxRounds: action.maxRounds,
      actionStateCurrentRound: actionState.currentRound,
    });
    return action;
  }

  /**
   * 鎺ㄦ柇鍊肩殑绫诲瀷
   */
  private inferType(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }
}
