import { CloseOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Input, Spin, Alert, Empty, Tag } from 'antd';
import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { debugApi } from '../../api/debug';
import type { DebugMessage } from '../../api/debug';
import type {
  DebugBubble,
  DebugOutputFilter,
  ErrorBubbleContent,
  VariableBubbleContent,
  LLMPromptBubbleContent,
  LLMResponseBubbleContent,
  PositionBubbleContent,
} from '../../types/debug';
import type { DetailedError } from '../../types/error';
import type {
  NavigationTree as NavigationTreeType,
  CurrentPosition,
  PhaseNode,
  TopicNode,
  ActionNode,
} from '../../types/navigation';
import { loadDebugFilter, saveDebugFilter } from '../../utils/debug-filter-storage';
import { analyzeActionVariables, categorizeVariablesByScope } from '../../utils/variableAnalyzer';
import ErrorBubble from '../DebugBubbles/ErrorBubble';
import LLMPromptBubble from '../DebugBubbles/LLMPromptBubble';
import LLMResponseBubble from '../DebugBubbles/LLMResponseBubble';
import { PositionBubble } from '../DebugBubbles/PositionBubble';
import VariableBubble from '../DebugBubbles/VariableBubble';
import DebugFilterModal from '../DebugFilterModal/DebugFilterModal';
import ErrorBanner from '../ErrorBanner/ErrorBanner';
import ErrorDetailModal from '../ErrorDetailModal/ErrorDetailModal';
import NavigationTree from '../NavigationTree/NavigationTree';
import './style.css';

const { TextArea } = Input;

interface DebugChatPanelProps {
  visible: boolean;
  sessionId: string | null;
  initialMessage?: string;
  initialDebugInfo?: any;
  debugTarget?: { type: 'draft' | 'version'; versionId?: string; versionNumber?: string } | null;
  onClose: () => void;
  onSessionRestart?: (newSessionId: string) => void; // 新增：重新开始调试的回调
}

const DebugChatPanel: React.FC<DebugChatPanelProps> = ({
  visible,
  sessionId,
  initialMessage,
  initialDebugInfo,
  debugTarget,
  onClose,
  onSessionRestart, // 新增：接收回调
}) => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 内部状态：当前活跃的会话 ID（用于重新开始后更新）
  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId);

  // 新增：错误和导航树状态
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [navigationTree, setNavigationTree] = useState<NavigationTreeType | null>(null);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | undefined>(undefined);

  // 调试气泡相关状态
  const [debugBubbles, setDebugBubbles] = useState<DebugBubble[]>([]);
  const [debugFilter, setDebugFilter] = useState<DebugOutputFilter>(() => {
    const filter = loadDebugFilter();
    console.log('[DebugChat] 🔍 Loaded debug filter:', filter);
    return filter;
  });
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 从会话数据构建导航树
  const buildNavigationTree = (sessionDetail: any): NavigationTreeType | null => {
    try {
      // 如果会话中没有脚本内容，返回一个基本的导航树
      if (!sessionDetail.metadata?.script) {
        console.log(
          '[DebugChat] No script in metadata, checking session structure:',
          sessionDetail
        );
        return {
          sessionId: sessionDetail.id || sessionDetail.sessionId || 'unknown',
          sessionName: `Session ${(sessionDetail.id || sessionDetail.sessionId || 'unknown').substring(0, 8)}`,
          phases: [],
        };
      }

      const script = sessionDetail.metadata.script;
      const sessionId = sessionDetail.id || sessionDetail.sessionId || 'unknown';
      const phases: PhaseNode[] = [];

      console.log('[DebugChat] Parsing script structure:', {
        hasSession: !!script.session,
        hasPhases: !!script.phases,
        scriptKeys: Object.keys(script),
      });

      // 脚本可能有两种结构：
      // 1. { session: { phases: [...] } }
      // 2. { phases: [...] }
      const scriptData = script.session || script;
      const scriptPhases = scriptData.phases || [];

      // 解析脚本的 phases
      if (Array.isArray(scriptPhases)) {
        scriptPhases.forEach((phase: any, phaseIdx: number) => {
          const topics: TopicNode[] = [];

          if (phase.topics && Array.isArray(phase.topics)) {
            phase.topics.forEach((topic: any, topicIdx: number) => {
              const actions: ActionNode[] = [];

              if (topic.actions && Array.isArray(topic.actions)) {
                topic.actions.forEach((action: any, actionIdx: number) => {
                  actions.push({
                    actionId: action.action_id || `action-${phaseIdx}-${topicIdx}-${actionIdx}`,
                    actionType: action.action_type || action.type || 'unknown',
                    actionIndex: actionIdx,
                    displayName: action.action_id || `Action ${actionIdx}`,
                    status: 'pending',
                    config: action.config || {},
                  });
                });
              }

              topics.push({
                topicId: topic.topic_id || `topic-${phaseIdx}-${topicIdx}`,
                topicName: topic.topic_name || topic.name || `Topic ${topicIdx}`,
                topicIndex: topicIdx,
                actions,
              });
            });
          }

          phases.push({
            phaseId: phase.phase_id || `phase-${phaseIdx}`,
            phaseName: phase.phase_name || phase.name || `Phase ${phaseIdx}`,
            phaseIndex: phaseIdx,
            topics,
          });
        });
      }

      const tree = {
        sessionId,
        sessionName:
          scriptData.session_name || script.name || `Session ${sessionId.substring(0, 8)}`,
        phases,
      };

      console.log('[DebugChat] Navigation tree built:', {
        sessionName: tree.sessionName,
        phaseCount: tree.phases.length,
        topicCount: tree.phases.reduce((sum, p) => sum + p.topics.length, 0),
        actionCount: tree.phases.reduce(
          (sum, p) => sum + p.topics.reduce((s, t) => s + t.actions.length, 0),
          0
        ),
      });

      return tree;
    } catch (error) {
      console.error('[DebugChat] Failed to build navigation tree:', error);
      console.error('[DebugChat] Session detail:', sessionDetail);
      return null;
    }
  };

  // 气泡操作函数
  const addDebugBubble = (bubble: DebugBubble) => {
    setDebugBubbles((prev) => [...prev, bubble]);
  };

  const toggleBubbleExpand = (bubbleId: string) => {
    setDebugBubbles((prev) =>
      prev.map((b) => (b.id === bubbleId ? { ...b, isExpanded: !b.isExpanded } : b))
    );
  };

  const handleFilterChange = (newFilter: DebugOutputFilter) => {
    setDebugFilter(newFilter);
    saveDebugFilter(newFilter);
  };

  const handleExpandAll = () => {
    setDebugBubbles((prev) => prev.map((b) => ({ ...b, isExpanded: true })));
  };

  const handleCollapseAll = () => {
    setDebugBubbles((prev) => prev.map((b) => ({ ...b, isExpanded: false })));
  };

  // 同步 props.sessionId 到 activeSessionId（仅当 props 更新且不为 null 时）
  // 注意：不能双向同步，否则 handleRestartDebug 设置的 activeSessionId 会被覆盖
  useEffect(() => {
    // 仅当 props.sessionId 存在且与上次不同时，才更新 activeSessionId
    // 这样 handleRestartDebug 设置的新 sessionId 不会被覆盖
    if (sessionId && sessionId !== activeSessionId) {
      console.log('[DebugChat] 🔄 Props sessionId changed, syncing to activeSessionId:', {
        propsSessionId: sessionId,
        previousActiveSessionId: activeSessionId,
      });
      setActiveSessionId(sessionId);
    }
  }, [sessionId]); // 仅依赖 sessionId，不依赖 activeSessionId

  // 加载会话数据
  const loadSessionData = async () => {
    console.log('[DebugChat] 🔵 loadSessionData called', {
      sessionId,
      initialMessage,
      timestamp: new Date().toISOString(),
    });

    if (!sessionId) {
      console.error('[DebugChat] ❌ No session ID provided');
      setError('No session ID provided');
      setInitialLoading(false);
      return;
    }

    try {
      setInitialLoading(true);
      setError(null);
      // 🔧 关键修复：清空旧的调试气泡，避免上次会话的气泡残留
      setDebugBubbles([]);
      console.log('[DebugChat] 🧹 Cleared old debug bubbles');
      console.log('[DebugChat] ⏳ Loading session data...');

      // 获取会话详情
      console.log('[DebugChat] 📡 Fetching session detail:', sessionId);
      const sessionDetail = await debugApi.getDebugSession(sessionId);
      console.log('[DebugChat] ✅ Session detail received:', {
        sessionId: sessionDetail.sessionId,
        userId: sessionDetail.userId,
        scriptId: sessionDetail.scriptId,
        status: sessionDetail.status,
        executionStatus: sessionDetail.executionStatus,
      });
      setSessionInfo(sessionDetail);

      // 构建导航树
      const tree = buildNavigationTree(sessionDetail);
      if (tree) {
        setNavigationTree(tree);
      }

      // 更新执行位置（从会话详情中获取）
      if (sessionDetail.position) {
        const pos: CurrentPosition = {
          phaseIndex: sessionDetail.position.phaseIndex || 0,
          phaseId: sessionDetail.position.phaseId || '',
          topicIndex: sessionDetail.position.topicIndex || 0,
          topicId: sessionDetail.position.topicId || '',
          actionIndex: sessionDetail.position.actionIndex || 0,
          actionId: sessionDetail.position.actionId || '',
          actionType: sessionDetail.position.actionType || '',
          currentRound: sessionDetail.position.currentRound,
          maxRounds: sessionDetail.position.maxRounds,
        };
        console.log('[DebugChat] Setting initial position from session:', pos);
        setCurrentPosition(pos);

        // 创建初始位置信息气泡
        let phaseName = `Phase ${pos.phaseIndex + 1}`;
        let topicName = `Topic ${pos.topicIndex + 1}`;

        if (tree && tree.phases && tree.phases[pos.phaseIndex]) {
          const phase = tree.phases[pos.phaseIndex];
          phaseName = phase.phaseName || phaseName;

          if (phase.topics && phase.topics[pos.topicIndex]) {
            const topic = phase.topics[pos.topicIndex];
            topicName = topic.topicName || topicName;
          }
        }

        const positionBubble: DebugBubble = {
          id: uuidv4(),
          type: 'position',
          timestamp: new Date().toISOString(),
          isExpanded: false,
          actionId: pos.actionId,
          actionType: pos.actionType,
          content: {
            type: 'position',
            phase: {
              index: pos.phaseIndex,
              id: pos.phaseId,
              name: phaseName,
            },
            topic: {
              index: pos.topicIndex,
              id: pos.topicId,
              name: topicName,
            },
            action: {
              index: pos.actionIndex,
              id: pos.actionId,
              type: pos.actionType,
              currentRound: sessionDetail.position.currentRound,
              maxRounds: sessionDetail.position.maxRounds,
            },
            summary: `${phaseName} → ${topicName} → ${pos.actionId}`,
          } as PositionBubbleContent,
        };
        addDebugBubble(positionBubble);
        console.log('[DebugChat] ✅ Created initial position bubble');
      }

      // 获取消息历史
      console.log('[DebugChat] 📡 Fetching message history:', sessionId);
      const messagesResult = await debugApi.getDebugSessionMessages(sessionId);
      console.log('[DebugChat] 📨 Messages result:', {
        success: messagesResult.success,
        messageCount: messagesResult.data?.length || 0,
        hasData: !!messagesResult.data,
      });

      if (messagesResult.success && messagesResult.data) {
        console.log('[DebugChat] ✅ Setting messages from API:', messagesResult.data.length);
        setMessages(messagesResult.data);
      } else {
        console.log('[DebugChat] ⚠️ No message history, using initial message');
        // 如果没有消息历史但有初始消息，添加初始AI消息
        if (initialMessage) {
          const initialMsg: DebugMessage = {
            messageId: 'initial',
            role: 'ai',
            content: initialMessage,
            timestamp: new Date().toISOString(),
          };
          console.log('[DebugChat] 💬 Created initial message:', initialMsg);
          setMessages([initialMsg]);
        }
      }

      // 处理初始的 debugInfo（来自会话创建时的第一个 action）
      if (initialDebugInfo) {
        console.log('[DebugChat] 🔍 Processing initial debugInfo:', initialDebugInfo);

        // 创建 LLM 提示词气泡
        const promptBubble: DebugBubble = {
          id: uuidv4(),
          type: 'llm_prompt',
          timestamp: initialDebugInfo.timestamp || new Date().toISOString(),
          isExpanded: false,
          actionId: (sessionDetail.position as any)?.sourceActionId || sessionDetail.position?.actionId,
          actionType: (sessionDetail.position as any)?.sourceActionType || sessionDetail.position?.actionType,
          content: {
            type: 'llm_prompt',
            systemPrompt: '',
            userPrompt: initialDebugInfo.prompt || '',
            conversationHistory: [],
            preview: (initialDebugInfo.prompt || '').substring(0, 100) + '...',
          } as LLMPromptBubbleContent,
        };
        addDebugBubble(promptBubble);
        console.log('[DebugChat] ✅ Created initial LLM prompt bubble');

        // 创建 LLM 响应气泡
        if (initialDebugInfo.response) {
          const responseBubble: DebugBubble = {
            id: uuidv4(),
            type: 'llm_response',
            timestamp: initialDebugInfo.timestamp || new Date().toISOString(),
            isExpanded: false,
            actionId: (sessionDetail.position as any)?.sourceActionId || sessionDetail.position?.actionId,
            actionType: (sessionDetail.position as any)?.sourceActionType || sessionDetail.position?.actionType,
            content: {
              type: 'llm_response',
              model: initialDebugInfo.model || 'unknown',
              tokens: initialDebugInfo.tokensUsed || 0,
              maxTokens: initialDebugInfo.config?.maxTokens || 0,
              rawResponse: JSON.stringify(
                initialDebugInfo.response.raw || initialDebugInfo.response
              ),
              processedResponse: initialDebugInfo.response.text || '',
              preview: (initialDebugInfo.response.text || '').substring(0, 100) + '...',
            } as LLMResponseBubbleContent,
          };
          addDebugBubble(responseBubble);
          console.log('[DebugChat] ✅ Created initial LLM response bubble');
        }
      }

      // 创建初始变量气泡（如果会话有变量）
      if (sessionDetail.variables && Object.keys(sessionDetail.variables).length > 0) {
        console.log('[DebugChat] 📊 Creating initial variable bubble:', sessionDetail.variables);

        // 获取全局变量（优先从直接字段读取，否则从 metadata 读取）
        const globalVariables =
          sessionDetail.globalVariables ||
          (sessionDetail.metadata?.globalVariables as Record<string, unknown>) ||
          {};
        console.log('[DebugChat] 🌐 Using globalVariables for categorization:', globalVariables);

        // 按作用域分层变量
        const categorizedVars = categorizeVariablesByScope(
          sessionDetail.variables,
          globalVariables
        );

        // 分析当前 action 的相关变量
        let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
        if (sessionDetail.position && tree) {
          const analysis = analyzeActionVariables(
            tree,
            sessionDetail.position.phaseIndex || 0,
            sessionDetail.position.topicIndex || 0,
            sessionDetail.position.actionIndex || 0
          );
          relevantVariables = {
            inputVariables: analysis.inputVariables,
            outputVariables: analysis.outputVariables,
          };

          console.log('[DebugChat] 🔍 Initial variable analysis:', {
            actionId: sessionDetail.position.actionId,
            inputVariables: analysis.inputVariables,
            outputVariables: analysis.outputVariables,
          });
        }

        const variableBubble: DebugBubble = {
          id: uuidv4(),
          type: 'variable',
          timestamp: new Date().toISOString(),
          isExpanded: false,
          actionId: sessionDetail.position?.actionId,
          actionType: sessionDetail.position?.actionType,
          content: {
            type: 'variable',
            changedVariables: [],
            allVariables: categorizedVars,
            relevantVariables,
            summary: '初始变量状态',
          } as VariableBubbleContent,
        };
        addDebugBubble(variableBubble);
        console.log('[DebugChat] ✅ Created initial variable bubble');
      }

      // 滚动到底部
      setTimeout(scrollToBottom, 100);
      console.log('[DebugChat] ✅ Session data loaded successfully');
    } catch (err: any) {
      console.error('[DebugChat] ❌ Failed to load session data:', {
        error: err,
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      setError(err.response?.data?.error || err.message || 'Failed to load session');

      // 即使加载失败，如果有初始消息也显示
      if (initialMessage) {
        console.log('[DebugChat] 🔄 Using initial message despite error');
        const initialMsg: DebugMessage = {
          messageId: 'initial',
          role: 'ai',
          content: initialMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages([initialMsg]);
      }
    } finally {
      setInitialLoading(false);
      console.log('[DebugChat] 🏁 loadSessionData completed');
    }
  };

  // 当面板打开或sessionId变化时加载数据
  useEffect(() => {
    if (visible && sessionId) {
      loadSessionData();
    }
  }, [visible, sessionId]);

  // 当消息列表更新时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 发送消息
  // 处理发送消息
  const handleSendMessage = async () => {
    // 优先使用 activeSessionId，如果没有则使用 props.sessionId
    const currentSessionId = activeSessionId || sessionId;

    console.log('[DebugChat] 🔵 handleSendMessage called', {
      inputValue,
      propsSessionId: sessionId,
      activeSessionId,
      currentSessionId,
      timestamp: new Date().toISOString(),
    });

    if (!inputValue.trim() || !currentSessionId) {
      console.warn('[DebugChat] ⚠️ Cannot send message:', {
        hasInput: !!inputValue.trim(),
        hasSessionId: !!currentSessionId,
      });
      return;
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    setError(null);

    // 立即添加用户消息到列表
    const userMsg: DebugMessage = {
      messageId: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    console.log('[DebugChat] 💬 Adding user message to UI:', userMsg);
    setMessages((prev) => [...prev, userMsg]);

    try {
      setLoading(true);
      console.log('[DebugChat] ⏳ Sending message to backend...');

      // 发送消息到后端
      console.log('[DebugChat] 📡 API Call: sendDebugMessage', {
        sessionId: currentSessionId,
        content: userMessage,
      });
      const response = await debugApi.sendDebugMessage(currentSessionId, {
        content: userMessage,
      });

      // 🔍 详细调试日志
      console.log('[DebugChat] 🔍 Full response object:', response);
      console.log('[DebugChat] 🔍 Response keys:', Object.keys(response));
      console.log('[DebugChat] 🔍 position field:', response.position);
      console.log(
        '[DebugChat] 🔍 position keys:',
        response.position ? Object.keys(response.position) : 'N/A'
      );
      console.log('[DebugChat] 🔍 globalVariables field:', response.globalVariables);
      console.log('[DebugChat] 🔍 debugInfo value:', response.debugInfo);
      console.log('[DebugChat] 🔍 debugInfo type:', typeof response.debugInfo);

      console.log('[DebugChat] ✅ API Response received:', {
        aiMessage: response.aiMessage,
        sessionStatus: response.sessionStatus,
        executionStatus: response.executionStatus,
        hasVariables: !!response.variables,
        hasDebugInfo: !!response.debugInfo,
        debugInfo: response.debugInfo,
      });

      // 检查响应中是否包含错误信息
      if (response.error) {
        const errorData = response.error;
        setDetailedError(errorData);

        // 创建错误气泡
        const errorBubble: DebugBubble = {
          id: uuidv4(),
          type: 'error',
          timestamp: new Date().toISOString(),
          isExpanded: true, // 错误默认展开
          actionId: response.position?.actionId,
          actionType: response.position?.actionType,
          content: {
            type: 'error',
            code: errorData.code || 'UNKNOWN_ERROR',
            errorType: errorData.errorType || 'execution',
            message: errorData.message || 'An error occurred',
            details: errorData.details,
            position: response.position
              ? {
                  phaseId: response.position.phaseId || '',
                  phaseName: '', // 此字段不在API响应中
                  topicId: response.position.topicId || '',
                  topicName: '', // 此字段不在API响应中
                  actionId: response.position.actionId || '',
                }
              : undefined,
            recovery: errorData.recovery,
            stackTrace: errorData.stackTrace,
          } as ErrorBubbleContent,
        };
        addDebugBubble(errorBubble);
      } else if (response.executionStatus === 'error') {
        // 兜底：executionStatus 是 error 但没有 error 对象
        console.error('[DebugChat] ❌ Backend returned error status but no error object');
        const fallbackError: DebugBubble = {
          id: uuidv4(),
          type: 'error',
          timestamp: new Date().toISOString(),
          isExpanded: true,
          actionId: response.position?.actionId,
          actionType: response.position?.actionType,
          content: {
            type: 'error',
            code: 'BACKEND_ERROR',
            errorType: 'system',
            message: 'Backend returned error status without error details',
            details: 'This is a backend bug. Please check server logs.',
            position: response.position
              ? {
                  phaseId: response.position.phaseId || '',
                  phaseName: '',
                  topicId: response.position.topicId || '',
                  topicName: '',
                  actionId: response.position.actionId || '',
                }
              : undefined,
            recovery: {
              canRetry: true,
              retryAction: 'Restart debugging',
              suggestions: ['Check server logs for detailed error'],
            },
          } as ErrorBubbleContent,
        };
        addDebugBubble(fallbackError);
      }

      // 检查变量变化并创建变量气泡
      if (response.variables) {
        const newVariables = response.variables;
        const globalVariables = response.globalVariables || {};

        console.log('[DebugChat] 📦 Creating variable bubble with:', {
          hasVariables: !!response.variables,
          variablesKeys: Object.keys(newVariables),
          hasGlobalVariables: !!response.globalVariables,
          globalVariablesKeys: Object.keys(globalVariables),
          hasVariableStore: !!response.variableStore,
        });

        // 优先使用 variableStore，否则退回到旧的分层逻辑
        const categorizedVars = response.variableStore
          ? response.variableStore
          : categorizeVariablesByScope(newVariables, globalVariables);

        // 分析当前 action 的相关变量
        let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
        if (response.position) {
          const analysis = analyzeActionVariables(
            navigationTree,
            response.position.phaseIndex || 0,
            response.position.topicIndex || 0,
            response.position.actionIndex || 0
          );
          relevantVariables = {
            inputVariables: analysis.inputVariables,
            outputVariables: analysis.outputVariables,
          };

          console.log('[DebugChat] 🔍 Variable analysis for action:', {
            actionId: response.position.actionId,
            inputVariables: analysis.inputVariables,
            outputVariables: analysis.outputVariables,
          });
        }

        // TODO: 计算变量的变化（需要保存前一状态）
        const variableBubble: DebugBubble = {
          id: uuidv4(),
          type: 'variable',
          timestamp: new Date().toISOString(),
          isExpanded: false, // 变量默认折叠
          actionId: response.position?.actionId,
          actionType: response.position?.actionType,
          content: {
            type: 'variable',
            changedVariables: [], // TODO: 计算变化的变量
            allVariables: categorizedVars,
            relevantVariables,
            summary: '变量更新', // 简单摘要
          } as VariableBubbleContent,
        };
        addDebugBubble(variableBubble);
      }

      // 检查 LLM 调试信息并创建 LLM 气泡
      if (response.debugInfo) {
        const debugInfo = response.debugInfo;
        console.log('[DebugChat] 📍 Received LLM debugInfo:', debugInfo);

        // 创建 LLM 提示词气泡
        const promptBubble: DebugBubble = {
          id: uuidv4(),
          type: 'llm_prompt',
          timestamp: debugInfo.timestamp || new Date().toISOString(),
          isExpanded: false,
          actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
          actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
          content: {
            type: 'llm_prompt',
            systemPrompt: '', // 服务端暂未返回
            userPrompt: debugInfo.prompt || '',
            conversationHistory: [], // 服务端暂未返回
            preview: (debugInfo.prompt || '').substring(0, 100) + '...',
          } as LLMPromptBubbleContent,
        };
        addDebugBubble(promptBubble);

        // 创建 LLM 响应气泡
        const responseBubble: DebugBubble = {
          id: uuidv4(),
          type: 'llm_response',
          timestamp: debugInfo.timestamp || new Date().toISOString(),
          isExpanded: false,
          actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
          actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
          content: {
            type: 'llm_response',
            model: debugInfo.model || 'unknown',
            tokens: debugInfo.tokensUsed || 0,
            maxTokens: debugInfo.config?.maxTokens || 0,
            rawResponse: JSON.stringify(debugInfo.response, null, 2),
            processedResponse: debugInfo.response?.text || response.aiMessage || '',
            preview:
              (debugInfo.response?.text || response.aiMessage || '').substring(0, 100) + '...',
          } as LLMResponseBubbleContent,
        };
        addDebugBubble(responseBubble);

        console.log('[DebugChat] ✅ Created LLM prompt and response bubbles');
      }

      // 更新执行位置（如果响应中包含）
      if (response.position) {
        const pos: CurrentPosition = {
          phaseIndex: response.position.phaseIndex || 0,
          phaseId: response.position.phaseId || '',
          topicIndex: response.position.topicIndex || 0,
          topicId: response.position.topicId || '',
          actionIndex: response.position.actionIndex || 0,
          actionId: response.position.actionId || '',
          actionType: response.position.actionType || '',
          currentRound: response.position.currentRound,
          maxRounds: response.position.maxRounds,
        };
        console.log('[DebugChat] Updating position from response:', pos);
        console.log('[DebugChat] 🔢 Round info from response:', {
          currentRound: response.position.currentRound,
          maxRounds: response.position.maxRounds,
        });
        setCurrentPosition(pos);

        // 创建位置信息气泡
        // 从导航树中获取 Phase/Topic/Action 的名称
        let phaseName = `Phase ${pos.phaseIndex + 1}`;
        let topicName = `Topic ${pos.topicIndex + 1}`;

        if (navigationTree && navigationTree.phases && navigationTree.phases[pos.phaseIndex]) {
          const phase = navigationTree.phases[pos.phaseIndex];
          phaseName = phase.phaseName || phaseName;

          if (phase.topics && phase.topics[pos.topicIndex]) {
            const topic = phase.topics[pos.topicIndex];
            topicName = topic.topicName || topicName;
          }
        }

        const positionBubble: DebugBubble = {
          id: uuidv4(),
          type: 'position',
          timestamp: new Date().toISOString(),
          isExpanded: false, // 位置信息默认折叠
          actionId: pos.actionId,
          actionType: pos.actionType,
          content: {
            type: 'position',
            phase: {
              index: pos.phaseIndex,
              id: pos.phaseId,
              name: phaseName,
            },
            topic: {
              index: pos.topicIndex,
              id: pos.topicId,
              name: topicName,
            },
            action: {
              index: pos.actionIndex,
              id: pos.actionId,
              type: pos.actionType,
              currentRound: response.position.currentRound,
              maxRounds: response.position.maxRounds,
            },
            summary: `${phaseName} → ${topicName} → ${pos.actionId}`,
          } as PositionBubbleContent,
        };
        addDebugBubble(positionBubble);
        console.log('[DebugChat] ✅ Created position bubble');
      }

      // 添加AI回复到消息列表（仅当有非空内容时）
      if (response.aiMessage && response.aiMessage.trim() !== '') {
        const aiMsg: DebugMessage = {
          messageId: `ai-${Date.now()}`,
          role: 'ai',
          content: response.aiMessage,
          timestamp: new Date().toISOString(),
        };
        console.log('[DebugChat] 💬 Adding AI response to UI:', aiMsg);
        setMessages((prev) => [...prev, aiMsg]);
        console.log('[DebugChat] ✅ Message sent successfully');
      } else {
        console.log(
          '[DebugChat] ⚠️ Empty AI message from backend, skip adding message bubble. executionStatus:',
          response.executionStatus
        );
      }
    } catch (err: any) {
      console.error('[DebugChat] ❌ Failed to send message:', {
        error: err,
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        config: {
          url: err.config?.url,
          method: err.config?.method,
          data: err.config?.data,
        },
      });

      // 如果响应中包含详细错误信息，使用它
      if (err.response?.data?.error && typeof err.response.data.error === 'object') {
        setDetailedError(err.response.data.error);
      } else {
        setError(err.response?.data?.error || err.message || 'Failed to send message');
      }

      // 添加错误提示消息
      const errorMsg: DebugMessage = {
        messageId: `error-${Date.now()}`,
        role: 'system',
        content: `Error: ${err.response?.data?.error || err.message || 'Failed to send message'}`,
        timestamp: new Date().toISOString(),
      };
      console.log('[DebugChat] ⚠️ Adding error message to UI:', errorMsg);
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
      console.log('[DebugChat] 🏁 handleSendMessage completed');
    }
  };

  // 处理输入框回车
  const handleKeyPress = (e: React.KeyboardEvent) => {
    // 检查是否是 ai_say max_rounds=1 的确认模式
    const isAcknowledgmentMode = currentPosition?.actionType === 'ai_say' && 
                                  currentPosition?.maxRounds === 1 && 
                                  currentPosition?.currentRound === 1;

    if (isAcknowledgmentMode) {
      // ai_say 确认模式：空格键触发确认
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handleAcknowledgment();
      }
    } else {
      // 正常文本输入模式：回车发送
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  // 处理 ai_say 确认（不需要文本输入）
  const handleAcknowledgment = async () => {
    console.log('[DebugChat] ⏩ Handling acknowledgment for ai_say');
    
    const currentSessionId = activeSessionId || sessionId;
    
    if (!currentSessionId) {
      console.error('[DebugChat] ❌ No session ID available for acknowledgment');
      return;
    }

    try {
      setLoading(true);
      console.log('[DebugChat] 📡 Sending acknowledgment (empty string) to backend');

      // 发送空字符串作为确认
      const response = await debugApi.sendDebugMessage(currentSessionId, {
        content: '',
      });

      console.log('[DebugChat] ✅ Acknowledgment sent, response:', response);

      // 以下复制响应处理逻辑（从 handleSendMessage 中）
      // 检查响应中是否包含错误信息
      if (response.error) {
        const errorData = response.error;
        setDetailedError(errorData);

        const errorBubble: DebugBubble = {
          id: uuidv4(),
          type: 'error',
          timestamp: new Date().toISOString(),
          isExpanded: true,
          actionId: response.position?.actionId,
          actionType: response.position?.actionType,
          content: {
            type: 'error',
            code: errorData.code || 'UNKNOWN_ERROR',
            errorType: errorData.errorType || 'execution',
            message: errorData.message || 'An error occurred',
            details: errorData.details,
            position: response.position
              ? {
                  phaseId: response.position.phaseId || '',
                  phaseName: '',
                  topicId: response.position.topicId || '',
                  topicName: '',
                  actionId: response.position.actionId || '',
                }
              : undefined,
            recovery: errorData.recovery,
            stackTrace: errorData.stackTrace,
          } as ErrorBubbleContent,
        };
        addDebugBubble(errorBubble);
      }

      // 检查变量变化并创建变量气泡
      if (response.variables) {
        const newVariables = response.variables;
        const globalVariables = response.globalVariables || {};
        const categorizedVars = response.variableStore
          ? response.variableStore
          : categorizeVariablesByScope(newVariables, globalVariables);

        let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
        if (response.position) {
          const analysis = analyzeActionVariables(
            navigationTree,
            response.position.phaseIndex || 0,
            response.position.topicIndex || 0,
            response.position.actionIndex || 0
          );
          relevantVariables = {
            inputVariables: analysis.inputVariables,
            outputVariables: analysis.outputVariables,
          };
        }

        const variableBubble: DebugBubble = {
          id: uuidv4(),
          type: 'variable',
          timestamp: new Date().toISOString(),
          isExpanded: false,
          actionId: response.position?.actionId,
          actionType: response.position?.actionType,
          content: {
            type: 'variable',
            changedVariables: [],
            allVariables: categorizedVars,
            relevantVariables,
            summary: '变量更新',
          } as VariableBubbleContent,
        };
        addDebugBubble(variableBubble);
      }

      // 检查 LLM 调试信息并创建 LLM 气泡
      if (response.debugInfo) {
        const debugInfo = response.debugInfo;
        const promptBubble: DebugBubble = {
          id: uuidv4(),
          type: 'llm_prompt',
          timestamp: debugInfo.timestamp || new Date().toISOString(),
          isExpanded: false,
          actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
          actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
          content: {
            type: 'llm_prompt',
            systemPrompt: '',
            userPrompt: debugInfo.prompt || '',
            conversationHistory: [],
            preview: (debugInfo.prompt || '').substring(0, 100) + '...',
          } as LLMPromptBubbleContent,
        };
        addDebugBubble(promptBubble);

        const responseBubble: DebugBubble = {
          id: uuidv4(),
          type: 'llm_response',
          timestamp: debugInfo.timestamp || new Date().toISOString(),
          isExpanded: false,
          actionId: (response.position as any)?.sourceActionId || response.position?.actionId,
          actionType: (response.position as any)?.sourceActionType || response.position?.actionType,
          content: {
            type: 'llm_response',
            model: debugInfo.model || 'unknown',
            tokens: debugInfo.tokensUsed || 0,
            maxTokens: debugInfo.config?.maxTokens || 0,
            rawResponse: JSON.stringify(debugInfo.response, null, 2),
            processedResponse: debugInfo.response?.text || response.aiMessage || '',
            preview: (debugInfo.response?.text || response.aiMessage || '').substring(0, 100) + '...',
          } as LLMResponseBubbleContent,
        };
        addDebugBubble(responseBubble);
      }

      // 更新执行位置
      if (response.position) {
        const pos: CurrentPosition = {
          phaseIndex: response.position.phaseIndex || 0,
          phaseId: response.position.phaseId || '',
          topicIndex: response.position.topicIndex || 0,
          topicId: response.position.topicId || '',
          actionIndex: response.position.actionIndex || 0,
          actionId: response.position.actionId || '',
          actionType: response.position.actionType || '',
          currentRound: response.position.currentRound,
          maxRounds: response.position.maxRounds,
        };
        setCurrentPosition(pos);

        let phaseName = `Phase ${pos.phaseIndex + 1}`;
        let topicName = `Topic ${pos.topicIndex + 1}`;

        if (navigationTree && navigationTree.phases && navigationTree.phases[pos.phaseIndex]) {
          const phase = navigationTree.phases[pos.phaseIndex];
          phaseName = phase.phaseName || phaseName;
          if (phase.topics && phase.topics[pos.topicIndex]) {
            const topic = phase.topics[pos.topicIndex];
            topicName = topic.topicName || topicName;
          }
        }

        const positionBubble: DebugBubble = {
          id: uuidv4(),
          type: 'position',
          timestamp: new Date().toISOString(),
          isExpanded: false,
          actionId: pos.actionId,
          actionType: pos.actionType,
          content: {
            type: 'position',
            phase: {
              index: pos.phaseIndex,
              id: pos.phaseId,
              name: phaseName,
            },
            topic: {
              index: pos.topicIndex,
              id: pos.topicId,
              name: topicName,
            },
            action: {
              index: pos.actionIndex,
              id: pos.actionId,
              type: pos.actionType,
              currentRound: response.position.currentRound,
              maxRounds: response.position.maxRounds,
            },
            summary: `${phaseName} → ${topicName} → ${pos.actionId}`,
          } as PositionBubbleContent,
        };
        addDebugBubble(positionBubble);
      }

      // 添加AI回复到消息列表
      if (response.aiMessage && response.aiMessage.trim() !== '') {
        const aiMsg: DebugMessage = {
          messageId: `ai-${Date.now()}`,
          role: 'ai',
          content: response.aiMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
      
    } catch (err: any) {
      console.error('[DebugChat] ❌ Failed to send acknowledgment:', err);
      if (err.response?.data?.error && typeof err.response.data.error === 'object') {
        setDetailedError(err.response.data.error);
      } else {
        setError('Failed to send acknowledgment: ' + (err.message || 'Unknown error'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 处理重新开始调试
  const handleRestartDebug = async () => {
    if (!sessionInfo?.scriptId) {
      setError('Cannot restart: No script information available');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setDetailedError(null);

      console.log('[DebugChat] 🔄 Starting debug restart...');
      console.log('[DebugChat] Current scriptId:', sessionInfo.scriptId);

      // 创建新会话
      const newSession = await debugApi.createDebugSession({
        userId: sessionInfo.userId || 'user-123',
        scriptId: sessionInfo.scriptId,
        initialVariables: {},
      });

      console.log('[DebugChat] ✅ New session created:', newSession.sessionId);
      console.log('[DebugChat] 🔍 New session debugInfo:', newSession.debugInfo);

      // 清空所有状态
      setMessages([]);
      setDebugBubbles([]);
      setNavigationTree(null);
      setCurrentPosition(undefined); // 使用 undefined 而不是 null

      // 如果有初始消息，添加它
      if (newSession.aiMessage) {
        const initialMsg: DebugMessage = {
          messageId: 'initial',
          role: 'ai',
          content: newSession.aiMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages([initialMsg]);
        console.log('[DebugChat] ✅ Added initial AI message');
      }

      // 通知父组件更新 sessionId
      // 注意：这里需要父组件提供 onSessionChange 回调
      if (onSessionRestart) {
        console.log('[DebugChat] 🔔 Notifying parent component of session change');
        onSessionRestart(newSession.sessionId);
      } else {
        // 如果父组件没有提供回调，更新内部 activeSessionId 并手动加载会话数据
        console.log(
          '[DebugChat] ⚠️ No onSessionRestart callback, updating internal activeSessionId'
        );
        setActiveSessionId(newSession.sessionId);

        // 临时更新内部会话ID（仅用于重新加载数据）
        const tempSessionId = newSession.sessionId;

        // 获取会话详情
        const sessionDetail = await debugApi.getDebugSession(tempSessionId);
        console.log('[DebugChat] ✅ Session detail loaded:', sessionDetail);

        // 构建导航树
        const tree = buildNavigationTree(sessionDetail); // 使用正确的函数名
        if (tree) {
          setNavigationTree(tree);
          console.log('[DebugChat] ✅ Navigation tree rebuilt');
        }

        // 更新执行位置
        if (sessionDetail.position) {
          const pos: CurrentPosition = {
            phaseIndex: sessionDetail.position.phaseIndex || 0,
            phaseId: sessionDetail.position.phaseId || '',
            topicIndex: sessionDetail.position.topicIndex || 0,
            topicId: sessionDetail.position.topicId || '',
            actionIndex: sessionDetail.position.actionIndex || 0,
            actionId: sessionDetail.position.actionId || '',
            actionType: sessionDetail.position.actionType || '',
            currentRound: sessionDetail.position.currentRound,
            maxRounds: sessionDetail.position.maxRounds,
          };
          setCurrentPosition(pos);
          console.log('[DebugChat] ✅ Position updated:', pos);
          console.log('[DebugChat] 🔄 Position round info:', {
            currentRound: sessionDetail.position.currentRound,
            maxRounds: sessionDetail.position.maxRounds,
          });

          // 创建初始位置信息气泡
          let phaseName = `Phase ${pos.phaseIndex + 1}`;
          let topicName = `Topic ${pos.topicIndex + 1}`;

          if (tree && tree.phases && tree.phases[pos.phaseIndex]) {
            const phase = tree.phases[pos.phaseIndex];
            phaseName = phase.phaseName || phaseName;

            if (phase.topics && phase.topics[pos.topicIndex]) {
              const topic = phase.topics[pos.topicIndex];
              topicName = topic.topicName || topicName;
            }
          }

          const positionBubble: DebugBubble = {
            id: uuidv4(),
            type: 'position',
            timestamp: new Date().toISOString(),
            isExpanded: false,
            actionId: pos.actionId,
            actionType: pos.actionType,
            content: {
              type: 'position',
              phase: {
                index: pos.phaseIndex,
                id: pos.phaseId,
                name: phaseName,
              },
              topic: {
                index: pos.topicIndex,
                id: pos.topicId,
                name: topicName,
              },
              action: {
                index: pos.actionIndex,
                id: pos.actionId,
                type: pos.actionType,
                currentRound: sessionDetail.position.currentRound,
                maxRounds: sessionDetail.position.maxRounds,
              },
              summary: `${phaseName} → ${topicName} → ${pos.actionId}`,
            } as PositionBubbleContent,
          };
          addDebugBubble(positionBubble);
          console.log('[DebugChat] ✅ Created initial position bubble');

          // 创建初始变量气泡（如果会话有变量）
          if (newSession.variables && Object.keys(newSession.variables).length > 0) {
            console.log(
              '[DebugChat] 📊 Creating initial variable bubble on restart:',
              newSession.variables
            );
            console.log(
              '[DebugChat] 🔍 globalVariables from newSession:',
              newSession.globalVariables
            );

            // 获取全局变量
            const globalVariables = newSession.globalVariables || {};
            console.log(
              '[DebugChat] 🌐 Using globalVariables for categorization:',
              globalVariables
            );

            // 按作用域分层变量
            const categorizedVars = categorizeVariablesByScope(
              newSession.variables,
              globalVariables
            );

            // 分析当前 action 的相关变量
            let relevantVariables:
              | { inputVariables: string[]; outputVariables: string[] }
              | undefined;
            if (tree) {
              const analysis = analyzeActionVariables(
                tree,
                pos.phaseIndex,
                pos.topicIndex,
                pos.actionIndex
              );
              relevantVariables = {
                inputVariables: analysis.inputVariables,
                outputVariables: analysis.outputVariables,
              };

              console.log('[DebugChat] 🔍 Initial variable analysis on restart:', {
                actionId: pos.actionId,
                inputVariables: analysis.inputVariables,
                outputVariables: analysis.outputVariables,
              });
            }

            const variableBubble: DebugBubble = {
              id: uuidv4(),
              type: 'variable',
              timestamp: new Date().toISOString(),
              isExpanded: false,
              actionId: pos.actionId,
              actionType: pos.actionType,
              content: {
                type: 'variable',
                changedVariables: [],
                allVariables: categorizedVars,
                relevantVariables,
                summary: '初始变量状态',
              } as VariableBubbleContent,
            };
            addDebugBubble(variableBubble);
            console.log('[DebugChat] ✅ Created initial variable bubble on restart');
          }

          // 处理初始的 debugInfo（来自会话创建时的第一个 action）
          if (newSession.debugInfo) {
            console.log(
              '[DebugChat] 🔍 Processing initial debugInfo from restart:',
              newSession.debugInfo
            );

            // 创建 LLM 提示词气泡
            const promptBubble: DebugBubble = {
              id: uuidv4(),
              type: 'llm_prompt',
              timestamp: newSession.debugInfo.timestamp || new Date().toISOString(),
              isExpanded: false,
              actionId: pos.actionId,
              actionType: pos.actionType,
              content: {
                type: 'llm_prompt',
                systemPrompt: '',
                userPrompt: newSession.debugInfo.prompt || '',
                conversationHistory: [],
                preview: (newSession.debugInfo.prompt || '').substring(0, 100) + '...',
              } as LLMPromptBubbleContent,
            };
            addDebugBubble(promptBubble);
            console.log('[DebugChat] ✅ Created initial LLM prompt bubble on restart');

            // 创建 LLM 响应气泡
            if (newSession.debugInfo.response) {
              const responseBubble: DebugBubble = {
                id: uuidv4(),
                type: 'llm_response',
                timestamp: newSession.debugInfo.timestamp || new Date().toISOString(),
                isExpanded: false,
                actionId: pos.actionId,
                actionType: pos.actionType,
                content: {
                  type: 'llm_response',
                  model: newSession.debugInfo.model || 'unknown',
                  tokens: newSession.debugInfo.tokensUsed || 0,
                  maxTokens: newSession.debugInfo.config?.maxTokens || 0,
                  rawResponse: JSON.stringify(
                    newSession.debugInfo.response.raw || newSession.debugInfo.response
                  ),
                  processedResponse: newSession.debugInfo.response.text || '',
                  preview: (newSession.debugInfo.response.text || '').substring(0, 100) + '...',
                } as LLMResponseBubbleContent,
              };
              addDebugBubble(responseBubble);
              console.log('[DebugChat] ✅ Created initial LLM response bubble on restart');
            }
          }
        }

        console.log('[DebugChat] ✅ Internal activeSessionId updated to:', newSession.sessionId);
        console.log(
          '[DebugChat] ⚠️ Warning: sessionId prop not updated. Parent component should provide onSessionRestart callback for better integration.'
        );
      }

      console.log('[DebugChat] ✅ Debug session restarted successfully');
    } catch (err: any) {
      console.error('[DebugChat] ❌ Failed to restart debug:', err);
      setError('Failed to restart debug session: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间戳
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  if (!visible) return null;

  return (
    <div className="debug-chat-panel">
      {/* 左侧导航树 */}
      <div className="debug-navigation-tree">
        <NavigationTree tree={navigationTree} currentPosition={currentPosition} />
      </div>

      {/* 右侧主要内容 */}
      <div className="debug-main-content">
        {/* 标题栏 */}
        <div className="debug-chat-header">
          <div className="debug-chat-title">
            <span>Debug Chat</span>
            {debugTarget && (
              <Tag
                color={debugTarget.type === 'draft' ? 'blue' : 'green'}
                style={{ marginLeft: '8px' }}
              >
                {debugTarget.type === 'draft'
                  ? '调试草稿'
                  : `调试版本: ${debugTarget.versionNumber}`}
              </Tag>
            )}
            {sessionInfo && (
              <span className="debug-chat-session-info">
                Session: {sessionId?.substring(0, 8)}...
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="default"
              onClick={handleRestartDebug}
              disabled={loading || initialLoading}
              title="重新开始调试会话"
              style={{ marginRight: '8px' }}
            >
              🔄 重新开始
            </Button>
            <Button
              type="text"
              icon={<SettingOutlined />}
              onClick={() => setFilterModalVisible(true)}
              title="调试输出选项"
            />
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              className="debug-chat-close-btn"
            />
          </div>
        </div>

        {/* 错误提示 - 使用新的 ErrorBanner */}
        {detailedError && (
          <div style={{ margin: '8px 16px' }}>
            <ErrorBanner
              error={detailedError}
              onViewDetails={() => setShowErrorDetail(true)}
              onRestart={handleRestartDebug}
              onDismiss={() => setDetailedError(null)}
            />
          </div>
        )}

        {/* 简单错误提示（保留向后兼容） */}
        {error && !detailedError && (
          <Alert
            message={error}
            type="error"
            closable
            onClose={() => setError(null)}
            style={{ margin: '8px 16px' }}
          />
        )}

        {/* 消息列表区域 */}
        <div className="debug-chat-messages">
          {initialLoading ? (
            <div className="debug-chat-loading">
              <Spin tip="Loading conversation history..." />
            </div>
          ) : messages.length === 0 && debugBubbles.length === 0 ? (
            <Empty description="No messages yet" style={{ marginTop: 50 }} />
          ) : (
            <>
              {(() => {
                // 合并消息和气泡，按时间顺序排列
                const items: Array<{ type: 'message' | 'bubble'; data: any; timestamp: string }> =
                  [];

                // 添加消息
                messages.forEach((msg) => {
                  items.push({
                    type: 'message',
                    data: msg,
                    timestamp: msg.timestamp,
                  });
                });

                // 添加气泡（并记录过滤统计）
                const bubbleStats = {
                  total: debugBubbles.length,
                  filtered: 0,
                  byType: {} as Record<string, { total: number; filtered: number }>,
                };

                debugBubbles.forEach((bubble) => {
                  // 初始化类型统计
                  if (!bubbleStats.byType[bubble.type]) {
                    bubbleStats.byType[bubble.type] = { total: 0, filtered: 0 };
                  }
                  bubbleStats.byType[bubble.type].total++;

                  // 根据过滤器过滤气泡
                  if (bubble.type === 'error' && !debugFilter.showError) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }
                  if (bubble.type === 'llm_prompt' && !debugFilter.showLLMPrompt) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }
                  if (bubble.type === 'llm_response' && !debugFilter.showLLMResponse) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }
                  if (bubble.type === 'variable' && !debugFilter.showVariable) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }
                  if (bubble.type === 'execution_log' && !debugFilter.showExecutionLog) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }
                  if (bubble.type === 'position' && !debugFilter.showPosition) {
                    bubbleStats.filtered++;
                    bubbleStats.byType[bubble.type].filtered++;
                    return;
                  }

                  items.push({
                    type: 'bubble',
                    data: bubble,
                    timestamp: bubble.timestamp,
                  });
                });

                // 输出过滤统计
                if (bubbleStats.filtered > 0) {
                  console.warn(
                    `[DebugChat] ⚠️ ${bubbleStats.filtered}/${bubbleStats.total} debug bubbles filtered out by user settings. Details:`,
                    bubbleStats.byType
                  );
                  console.warn(
                    '[DebugChat] 🔧 To show all debug info, click the settings icon and enable all options, or click "Reset Default"'
                  );
                }

                // 按时间排序
                items.sort(
                  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                // 渲染
                return items.map((item, index) => (
                  <React.Fragment key={`${item.type}-${index}`}>
                    {item.type === 'message' ? (
                      <div className={`debug-message debug-message-${item.data.role}`}>
                        <div className="debug-message-header">
                          <span className="debug-message-role">
                            {item.data.role === 'ai'
                              ? 'AI'
                              : item.data.role === 'user'
                                ? 'User'
                                : 'System'}
                            :
                          </span>
                          <span className="debug-message-time">
                            {formatTimestamp(item.data.timestamp)}
                          </span>
                        </div>
                        <div className="debug-message-content">{item.data.content}</div>
                      </div>
                    ) : (
                      <div style={{ margin: '8px 0' }}>
                        {item.data.type === 'error' && (
                          <ErrorBubble
                            content={item.data.content as ErrorBubbleContent}
                            isExpanded={item.data.isExpanded}
                            timestamp={item.data.timestamp}
                            onToggleExpand={() => toggleBubbleExpand(item.data.id)}
                            onRestart={handleRestartDebug}
                          />
                        )}
                        {item.data.type === 'variable' && (
                          <VariableBubble
                            content={item.data.content as VariableBubbleContent}
                            isExpanded={item.data.isExpanded}
                            timestamp={item.data.timestamp}
                            actionId={item.data.actionId}
                            onToggleExpand={() => toggleBubbleExpand(item.data.id)}
                          />
                        )}
                        {item.data.type === 'llm_prompt' && (
                          <LLMPromptBubble
                            content={item.data.content as LLMPromptBubbleContent}
                            isExpanded={item.data.isExpanded}
                            timestamp={item.data.timestamp}
                            actionId={item.data.actionId}
                            onToggleExpand={() => toggleBubbleExpand(item.data.id)}
                          />
                        )}
                        {item.data.type === 'llm_response' && (
                          <LLMResponseBubble
                            content={item.data.content as LLMResponseBubbleContent}
                            isExpanded={item.data.isExpanded}
                            timestamp={item.data.timestamp}
                            actionId={item.data.actionId}
                            onToggleExpand={() => toggleBubbleExpand(item.data.id)}
                          />
                        )}
                        {item.data.type === 'position' && (
                          <PositionBubble
                            content={item.data.content as PositionBubbleContent}
                            isExpanded={item.data.isExpanded}
                            timestamp={item.data.timestamp}
                            onToggleExpand={() => toggleBubbleExpand(item.data.id)}
                          />
                        )}
                        {/* TODO: 添加其他类型气泡 (ExecutionLog) */}
                      </div>
                    )}
                  </React.Fragment>
                ));
              })()}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 输入区域 */}
        <div 
          className="debug-chat-input-area"
          onKeyDown={(e) => {
            // 检查是否是 ai_say 的确认模式
            const isAcknowledgmentMode = currentPosition?.actionType === 'ai_say' && 
                                          currentPosition?.currentRound === currentPosition?.maxRounds;

            if (isAcknowledgmentMode && (e.key === ' ' || e.key === 'Spacebar')) {
              e.preventDefault();
              handleAcknowledgment();
            }
          }}
        >
          {(() => {
            // 检查是否是 ai_say 的确认模式
            // max_rounds=1: 第1轮后等待确认
            // max_rounds>1: 最后一轮后等待确认
            const isAcknowledgmentMode = currentPosition?.actionType === 'ai_say' && 
                                          currentPosition?.currentRound === currentPosition?.maxRounds;

            if (isAcknowledgmentMode) {
              // ai_say 确认模式：显示提示和下一步按钮
              return (
                <>
                  <div className="debug-chat-acknowledgment-hint">
                    <span style={{ color: '#666', fontSize: '14px' }}>
                      💡 按<kbd style={{ padding: '2px 6px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', fontFamily: 'monospace' }}>空格</kbd>继续，或点击
                    </span>
                  </div>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleAcknowledgment}
                    loading={loading}
                    disabled={loading || initialLoading}
                    className="debug-chat-send-btn"
                    style={{ minWidth: '100px' }}
                  >
                    下一步
                  </Button>
                </>
              );
            } else {
              // 正常文本输入模式
              return (
                <>
                  <TextArea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    disabled={loading || initialLoading}
                    className="debug-chat-input"
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={handleSendMessage}
                    loading={loading}
                    disabled={!inputValue.trim() || loading || initialLoading}
                    className="debug-chat-send-btn"
                  >
                    Send
                  </Button>
                </>
              );
            }
          })()}
        </div>

        {/* 错误详情弹窗 */}
        {detailedError && (
          <ErrorDetailModal
            error={detailedError}
            isOpen={showErrorDetail}
            onClose={() => setShowErrorDetail(false)}
          />
        )}

        {/* 调试输出过滤器弹窗 */}
        <DebugFilterModal
          visible={filterModalVisible}
          filter={debugFilter}
          onFilterChange={handleFilterChange}
          onClose={() => setFilterModalVisible(false)}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
        />
      </div>
    </div>
  );
};

export default DebugChatPanel;
