import { CloseOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { Button, Input, Select, Spin, Alert, Empty, Tag, message } from 'antd';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { debugApi } from '../../api/debug';
import type { DebugMessage, RerunRequest, RerunResponse, DebugEntryRecord } from '../../api/debug';
import type {
  DebugBubbleV2,
  DebugOutputFilter,
  ErrorBubbleContent,
  VariableBubbleContent,
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
import DebugEntryBubble from '../DebugBubbles/DebugEntryBubble';
import ErrorBubble from '../DebugBubbles/ErrorBubble';
import DebugFilterModal from '../DebugFilterModal/DebugFilterModal';
import ErrorBanner from '../ErrorBanner/ErrorBanner';
import ErrorDetailModal from '../ErrorDetailModal/ErrorDetailModal';
import NavigationTree from '../NavigationTree/NavigationTree';

import RerunModal from './RerunModal';
import {
  computeSeparatorTimestamp,
  determineSnapshotMsgCount,
  insertSeparator,
} from './separatorUtils';
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
  onSessionStatusChange?: (sessionId: string, executionStatus: string) => void; // 会话状态变化回调
}

/**
 * Extract ordered action IDs from the navigation tree (execution order).
 * Used to determine which actions come before/after a rollback target.
 */
function getOrderedActionIds(tree: NavigationTreeType | null, serverIds?: string[]): string[] {
  if (serverIds && serverIds.length > 0) return serverIds;
  const ids: string[] = [];
  if (tree?.phases) {
    for (const phase of tree.phases) {
      if (phase.topics) {
        for (const topic of phase.topics) {
          if (topic.actions) {
            for (const action of topic.actions) {
              ids.push(action.actionId);
            }
          }
        }
      }
    }
  }
  return ids;
}

const DebugChatPanel: React.FC<DebugChatPanelProps> = ({
  visible,
  sessionId,
  initialMessage,
  initialDebugInfo,
  debugTarget,
  onClose,
  onSessionRestart, // 新增：接收回调
  onSessionStatusChange, // 会话状态变化回调
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

  // 错误气泡（V1 中唯一未被 V2 覆盖的类型）
  const [errorBubbles, setErrorBubbles] = useState<ErrorBubbleItem[]>([]);
  const [debugFilter, setDebugFilter] = useState<DebugOutputFilter>(() => {
    const filter = loadDebugFilter();
    console.log('[DebugChat] 🔍 Loaded debug filter:', filter);
    return filter;
  });
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // 重运行/回退相关状态
  const [rerunModalVisible, setRerunModalVisible] = useState(false);
  const [rerunMode, setRerunMode] = useState<'rerun' | 'rollback'>('rerun');
  const [rerunTargetActionId, setRerunTargetActionId] = useState<string>('');
  const [rerunTargetInfo, setRerunTargetInfo] = useState<any>(null);

  // Guard against concurrent loadSessionData calls (prevents duplicate bubbles)
  const loadGenRef = useRef(0);

  // V2 unified debug bubbles (from debug_entries API)
  const [debugBubblesV2, setDebugBubblesV2] = useState<DebugBubbleV2[]>([]);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [availableRunIds, setAvailableRunIds] = useState<string[]>([]);

  // Error bubble (the one V1 bubble type not covered by V2 debug_entries)
  interface ErrorBubbleItem {
    id: string;
    timestamp: string;
    isExpanded: boolean;
    actionId?: string;
    actionType?: string;
    content: ErrorBubbleContent;
  }

  // Timeline history snapshots (client-side only)
  interface TimelineSnapshot {
    snapshotId: string;
    actionId: string;
    mode: 'initial' | 'rerun' | 'rollback';
    timestamp: string;
    label: string;
    messages: DebugMessage[];
    debugBubblesV2: DebugBubbleV2[];
  }
  const [timelineSnapshots, setTimelineSnapshots] = useState<TimelineSnapshot[]>([]);
  const [viewingSnapshotId, setViewingSnapshotId] = useState<string | null>(null);

  // Refs for accessing latest messages/bubbles in snapshot callbacks
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const debugBubblesV2Ref = useRef(debugBubblesV2);
  // Pre-rerun message count for reliable separator insertion
  const preRerunMsgCountRef = useRef<number | undefined>(undefined);
  debugBubblesV2Ref.current = debugBubblesV2;

  // Refs for accessing latest state in fetchDebugEntriesV2
  const navigationTreeRef = useRef(navigationTree);
  navigationTreeRef.current = navigationTree;
  const latestVariableStoreRef = useRef<VariableBubbleContent | null>(null);
  // Per-position variable store map: key = "phaseId|topicId|actionId|round"
  const variableStoreByPositionRef = useRef<
    Map<string, { allVariables: any; variableContent: VariableBubbleContent }>
  >(new Map());

  // Helper: index the latest variable store by position for per-bubble lookup
  const indexVariableStoreByPosition = (position: any, varContent: VariableBubbleContent) => {
    if (!position) return;
    const round = position.currentRound ?? 0;
    const key = `${position.phaseId || ''}|${position.topicId || ''}|${position.actionId || ''}|${round}`;
    variableStoreByPositionRef.current.set(key, {
      allVariables: varContent.allVariables,
      variableContent: varContent,
    });
  };

  // 从 sessionInfo 推导重运行所需的版本历史和快照
  const rerunHistory: any[] = useMemo(
    () => (sessionInfo?.metadata?.rerunHistory as any[]) || [],
    [sessionInfo]
  );

  const actionSnapshots: Record<string, any> = useMemo(() => {
    const snapshots = (sessionInfo?.metadata?.actionSnapshots as Record<string, any>) || {};
    return snapshots;
  }, [sessionInfo]);

  const currentActionConfig = useMemo(() => {
    const actionId = currentPosition?.actionId;
    if (!actionId || !actionSnapshots[actionId]) return {};
    return actionSnapshots[actionId].originalConfig || {};
  }, [currentPosition, actionSnapshots]);

  const currentActionVersions = useMemo(() => {
    const actionId = currentPosition?.actionId;
    if (!actionId) return [];
    return rerunHistory.filter((e: any) => e.actionId === actionId);
  }, [rerunHistory, currentPosition]);

  // Derived display data — when viewing a history snapshot, use its data instead of live state
  const viewingSnapshot = useMemo(
    () =>
      viewingSnapshotId
        ? (timelineSnapshots.find((s) => s.snapshotId === viewingSnapshotId) ?? null)
        : null,
    [viewingSnapshotId, timelineSnapshots]
  );
  const displayMessages = viewingSnapshot ? viewingSnapshot.messages : messages;
  const displayDebugBubblesV2 = viewingSnapshot ? viewingSnapshot.debugBubblesV2 : debugBubblesV2;
  const displayErrorBubbles = viewingSnapshot ? [] : errorBubbles;

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

  // Validate position compatibility against loaded navigation tree
  const validatePosition = (
    tree: NavigationTreeType | null,
    position: any
  ): { compatible: boolean; message?: string } => {
    if (!tree || !position) return { compatible: true };
    const phases = tree.phases || [];
    if (position.phaseIndex >= phases.length) {
      return {
        compatible: false,
        message: `Phase ${position.phaseIndex + 1} 不存在（当前脚本只有 ${phases.length} 个 phase）`,
      };
    }
    const topics = phases[position.phaseIndex]?.topics || [];
    if (position.topicIndex >= topics.length) {
      return {
        compatible: false,
        message: `Topic ${position.topicIndex + 1} 不存在`,
      };
    }
    const actions = topics[position.topicIndex]?.actions || [];
    if (position.actionIndex >= actions.length) {
      return {
        compatible: false,
        message: `Action ${position.actionIndex + 1} 不存在`,
      };
    }
    return { compatible: true };
  };

  // 气泡操作函数
  const addErrorBubble = (bubble: ErrorBubbleItem) => {
    setErrorBubbles((prev) => [...prev, bubble]);
  };

  const handleFilterChange = (newFilter: DebugOutputFilter) => {
    setDebugFilter(newFilter);
    saveDebugFilter(newFilter);
  };

  const handleExpandAll = () => {
    setDebugBubblesV2((prev) => prev.map((b) => ({ ...b, isExpanded: true })));
  };

  const handleCollapseAll = () => {
    setDebugBubblesV2((prev) => prev.map((b) => ({ ...b, isExpanded: false })));
  };

  // V2: Fetch debug entries from new API and build DebugBubbleV2[]
  const fetchDebugEntriesV2 = async (
    runId?: string,
    rollbackFilter?: { excludeStaleForTarget: string; currentRunId: string }
  ) => {
    const currentSessionId = activeSessionId || sessionId;
    if (!currentSessionId) return;

    try {
      console.log('[DebugChat] 📡 Fetching V2 debug entries', {
        sessionId: currentSessionId,
        runId,
      });
      const result = await debugApi.getDebugEntries(currentSessionId, runId);
      if (!result.success) {
        console.warn('[DebugChat] ⚠️ V2 debug entries API returned success=false');
        return;
      }

      console.log('[DebugChat] ✅ V2 debug entries received:', {
        total: result.total,
        entryCount: result.data.length,
      });

      // Filter out stale entries for rollback: entries for actions at or after
      // the rollback target that have an old runId should be excluded.
      // Entries for actions BEFORE the target (any runId) are preserved.
      let entries = result.data;
      if (rollbackFilter) {
        const orderedActionIds = getOrderedActionIds(
          navigationTreeRef.current,
          sessionInfo?.orderedActionIds
        );
        const targetIdx = orderedActionIds.indexOf(rollbackFilter.excludeStaleForTarget);
        if (targetIdx >= 0) {
          const actionsBeforeTarget = new Set(orderedActionIds.slice(0, targetIdx));
          const before = entries.filter((e) => actionsBeforeTarget.has(e.actionId));
          const atOrAfter = entries.filter(
            (e) => !actionsBeforeTarget.has(e.actionId) && e.runId === rollbackFilter.currentRunId
          );
          entries = [...before, ...atOrAfter];
          console.log('[DebugChat] 🔍 Stale entry filter:', {
            targetActionId: rollbackFilter.excludeStaleForTarget,
            totalBefore: result.data.length,
            afterFilter: entries.length,
            keptBefore: before.length,
            keptAtOrAfter: atOrAfter.length,
          });
        }
      }

      // Collect unique runIds for the selector
      const runIds = new Set<string>();
      entries.forEach((entry) => runIds.add(entry.runId));
      setAvailableRunIds(Array.from(runIds));

      // Group entries by position (phaseId-topicId-actionId-round) to build unified bubbles
      const groupKey = (e: DebugEntryRecord) =>
        `${e.phaseId}|${e.topicId}|${e.actionId}|${e.round}|${e.runId}`;

      const grouped = new Map<string, DebugEntryRecord[]>();
      entries.forEach((entry) => {
        const key = groupKey(entry);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(entry);
      });

      // Look up position names from navigation tree
      const tree = navigationTreeRef.current;

      // Build DebugBubbleV2 from each group
      const bubbles: DebugBubbleV2[] = [];
      for (const [, entries] of grouped) {
        const first = entries[0];
        // Merge all entries' content.entries into one array
        const allEntries = entries.flatMap((e) => e.content.entries || []);

        // Look up phase/topic/action names from navigation tree
        let phaseName: string | undefined;
        let topicName: string | undefined;
        let actionName: string | undefined;
        if (tree?.phases) {
          for (const phase of tree.phases) {
            if (phase.phaseId === first.phaseId) {
              phaseName = phase.phaseName;
              if (phase.topics) {
                for (const topic of phase.topics) {
                  if (topic.topicId === first.topicId) {
                    topicName = topic.topicName;
                    if (topic.actions) {
                      for (const action of topic.actions) {
                        if (action.actionId === first.actionId) {
                          actionName = action.displayName;
                          break;
                        }
                      }
                    }
                    break;
                  }
                }
              }
              break;
            }
          }
        }

        bubbles.push({
          id: first.id,
          sessionId: first.sessionId,
          runId: first.runId,
          phaseId: first.phaseId,
          topicId: first.topicId,
          actionId: first.actionId,
          actionType: first.actionType,
          round: first.round,
          phaseName,
          topicName,
          actionName,
          entries: allEntries,
          timestamp: first.createdAt,
          isExpanded: false,
        });
      }

      // Sort by position then round
      bubbles.sort((a, b) => {
        const byPhase = a.phaseId.localeCompare(b.phaseId);
        if (byPhase !== 0) return byPhase;
        const byTopic = a.topicId.localeCompare(b.topicId);
        if (byTopic !== 0) return byTopic;
        const byAction = a.actionId.localeCompare(b.actionId);
        if (byAction !== 0) return byAction;
        return a.round - b.round;
      });

      // Attach per-position variable state to each bubble
      const varStoreMap = variableStoreByPositionRef.current;
      for (const bubble of bubbles) {
        const posKey = `${bubble.phaseId}|${bubble.topicId}|${bubble.actionId}|${bubble.round}`;
        const stored = varStoreMap.get(posKey);
        if (stored) {
          bubble.variableSnapshot = stored.allVariables;
          bubble.variableContent = stored.variableContent;
        }
      }
      // Fallback: attach latest variable state to the most recent bubble if no per-position match
      if (!bubbles.some((b) => b.variableContent)) {
        const varContent = latestVariableStoreRef.current;
        if (varContent && bubbles.length > 0) {
          bubbles[bubbles.length - 1].variableSnapshot = varContent.allVariables;
          bubbles[bubbles.length - 1].variableContent = varContent;
        }
      }

      console.log('[DebugChat] 🫧 Built V2 debug bubbles:', bubbles.length);
      // Safety: preserve previous bubbles if API returned no entries (prevents intermittent data loss)
      if (bubbles.length === 0) {
        console.warn(
          '[DebugChat] ⚠️ 0 V2 bubbles built (total entries:',
          result.total,
          '), keeping previous bubbles'
        );
        return;
      }
      setDebugBubblesV2(bubbles);

      // When viewing a specific run, update currentPosition and navigation tree state
      if (runId && bubbles.length > 0 && tree) {
        const lastBubble = bubbles[bubbles.length - 1];
        let phaseIdx = 0;
        let topicIdx = 0;
        let actionIdx = 0;
        let foundAction: ActionNode | null = null;

        for (let pi = 0; pi < tree.phases.length; pi++) {
          const phase = tree.phases[pi];
          if (phase.phaseId === lastBubble.phaseId) {
            phaseIdx = pi;
            for (let ti = 0; ti < phase.topics.length; ti++) {
              const topic = phase.topics[ti];
              if (topic.topicId === lastBubble.topicId) {
                topicIdx = ti;
                for (let ai = 0; ai < topic.actions.length; ai++) {
                  const action = topic.actions[ai];
                  if (action.actionId === lastBubble.actionId) {
                    actionIdx = ai;
                    foundAction = action;
                    break;
                  }
                }
                break;
              }
            }
            break;
          }
        }

        const pos: CurrentPosition = {
          phaseIndex: phaseIdx,
          phaseId: lastBubble.phaseId,
          topicIndex: topicIdx,
          topicId: lastBubble.topicId,
          actionIndex: actionIdx,
          actionId: lastBubble.actionId,
          actionType: lastBubble.actionType,
          currentRound: lastBubble.round,
          maxRounds: (foundAction?.config as any)?.max_rounds,
        };
        setCurrentPosition(pos);
      }
    } catch (err) {
      console.warn('[DebugChat] ⚠️ Failed to fetch V2 debug entries:', err);
    }
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
    // Bump generation to cancel any in-flight loadSessionData calls
    const loadGen = ++loadGenRef.current;
    console.log('[DebugChat] 🔵 loadSessionData called', {
      sessionId,
      initialMessage,
      loadGen,
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
      setErrorBubbles([]);
      console.log('[DebugChat] 🧹 Cleared old debug bubbles');
      console.log('[DebugChat] ⏳ Loading session data...');

      // 获取会话详情
      console.log('[DebugChat] 📡 Fetching session detail:', sessionId);
      const sessionDetail = await debugApi.getDebugSession(sessionId);
      // Abort if a newer loadSessionData has started (prevents duplicate bubbles)
      if (loadGenRef.current !== loadGen) return;
      console.log('[DebugChat] ✅ Session detail received:', {
        sessionId: sessionDetail.sessionId,
        userId: sessionDetail.userId,
        scriptId: sessionDetail.scriptId,
        status: sessionDetail.status,
        executionStatus: sessionDetail.executionStatus,
        hasMetadata: !!sessionDetail.metadata,
        metadataKeys: sessionDetail.metadata ? Object.keys(sessionDetail.metadata) : [],
        actionSnapshotsKeys: sessionDetail.metadata?.actionSnapshots
          ? Object.keys(sessionDetail.metadata.actionSnapshots)
          : [],
        rerunHistoryCount: (sessionDetail.metadata?.rerunHistory as any[])?.length || 0,
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

        // Validate position compatibility against current script
        const positionValidation = validatePosition(tree, pos);
        if (!positionValidation.compatible) {
          setError(
            `脚本结构已变更，原调试位置无法定位：${positionValidation.message}。建议新建调试。`
          );
          setInitialLoading(false);
          return;
        }

        setCurrentPosition(pos);
      }

      // 获取消息历史
      console.log('[DebugChat] 📡 Fetching message history:', sessionId);
      const messagesResult = await debugApi.getDebugSessionMessages(sessionId);
      // Abort if a newer loadSessionData has started
      if (loadGenRef.current !== loadGen) return;
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

      // 处理初始的 debugInfo（来自会话创建时的第一个 action，支持数组格式）
      if (initialDebugInfo) {
        const initialDebugInfos = Array.isArray(initialDebugInfo)
          ? initialDebugInfo
          : [initialDebugInfo];
        console.log(
          '[DebugChat] 🔍 Processing initial debugInfos:',
          initialDebugInfos.length,
          'entries'
        );
      }

      // Store variable snapshot for V2 debug bubbles
      if (sessionDetail.variables && Object.keys(sessionDetail.variables).length > 0) {
        const globalVariables =
          sessionDetail.globalVariables ||
          (sessionDetail.metadata?.globalVariables as Record<string, unknown>) ||
          {};
        const categorizedVars = categorizeVariablesByScope(
          sessionDetail.variables,
          globalVariables
        );

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
        }

        const actionStatus: 'running' | 'completed' | 'error' =
          sessionDetail.executionStatus === 'completed' || sessionDetail.executionStatus === 'error'
            ? (sessionDetail.executionStatus as 'completed' | 'error')
            : 'running';

        latestVariableStoreRef.current = {
          type: 'variable',
          changedVariables: [],
          allVariables: categorizedVars,
          relevantVariables,
          summary: '初始变量状态',
          actionStatus,
        };
        indexVariableStoreByPosition(sessionDetail.position, latestVariableStoreRef.current);
      }

      // 滚动到底部
      setTimeout(scrollToBottom, 100);
      console.log('[DebugChat] ✅ Session data loaded successfully');

      // V2: Fetch debug entries from the new API
      if (sessionDetail.currentRunId) {
        setCurrentRunId(sessionDetail.currentRunId);
        fetchDebugEntriesV2(sessionDetail.currentRunId);
      }
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

  // 通知父组件会话状态变化
  useEffect(() => {
    const currentSessionId = activeSessionId || sessionId;
    if (currentSessionId && sessionInfo?.executionStatus && onSessionStatusChange) {
      onSessionStatusChange(currentSessionId, sessionInfo.executionStatus);
    }
  }, [sessionInfo?.executionStatus, activeSessionId, sessionId]);

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

      if (sessionInfo) {
        // Merge all updatable fields from response into sessionInfo
        const updates: any = {};
        if (response.executionStatus) updates.executionStatus = response.executionStatus;
        if ((response as any).actionSnapshots) {
          console.log('[DebugChat] 🔍 Merging actionSnapshots from message response:', {
            snapshotKeys: Object.keys((response as any).actionSnapshots),
            prevSnapshotKeys: Object.keys(sessionInfo.metadata?.actionSnapshots || {}),
          });
          updates.metadata = {
            ...(sessionInfo.metadata || {}),
            actionSnapshots: (response as any).actionSnapshots,
          };
        }
        if ((response as any).rerunHistory) {
          console.log('[DebugChat] 🔍 Merging rerunHistory from message response:', {
            historyEntries: (response as any).rerunHistory?.length || 0,
          });
          updates.metadata = {
            ...(updates.metadata || sessionInfo.metadata || {}),
            rerunHistory: (response as any).rerunHistory,
          };
        }
        if (Object.keys(updates).length > 0) {
          console.log('[DebugChat] 📝 Updating sessionInfo with keys:', Object.keys(updates));
          setSessionInfo({ ...sessionInfo, ...updates });
        }
      }

      // 检查响应中是否包含错误信息
      if (response.error) {
        const errorData = response.error;
        setDetailedError(errorData);

        // 创建错误气泡
        const errorBubble: ErrorBubbleItem = {
          id: uuidv4(),
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
        addErrorBubble(errorBubble);
      } else if (response.executionStatus === 'error') {
        // 兜底：executionStatus 是 error 但没有 error 对象
        console.error('[DebugChat] ❌ Backend returned error status but no error object');
        const fallbackError: ErrorBubbleItem = {
          id: uuidv4(),
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
        addErrorBubble(fallbackError);
      }

      // Store variable snapshot for V2 debug bubbles
      if (response.variables) {
        const categorizedVars = response.variableStore
          ? response.variableStore
          : categorizeVariablesByScope(response.variables, response.globalVariables || {});

        let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
        if (response.position && navigationTree) {
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

        const actionStatus = (response as any).actionStatus;
        const roundChanges = (response as any).roundChanges;
        const changedVariables = roundChanges
          ? roundChanges.changes.map((c: any) => ({
              name: c.name,
              oldValue: c.fromValue,
              newValue: c.toValue,
              scope: c.scope as 'global' | 'session' | 'phase' | 'topic',
            }))
          : [];

        latestVariableStoreRef.current = {
          type: 'variable',
          changedVariables,
          allVariables: categorizedVars,
          relevantVariables,
          summary: '变量更新',
          actionStatus,
          currentRound: (response as any).currentRound,
          maxRounds: (response as any).maxRounds,
          scopePath: {
            phaseId:
              actionStatus === 'completed' && (response as any).completedActionContext
                ? (response as any).completedActionContext.phaseId ||
                  response.position?.phaseId ||
                  ''
                : response.position?.phaseId || '',
            phaseName: '',
            topicId:
              actionStatus === 'completed' && (response as any).completedActionContext
                ? (response as any).completedActionContext.topicId ||
                  response.position?.topicId ||
                  ''
                : response.position?.topicId || '',
            topicName: '',
          },
          exitReason: (response as any).exitReason,
        };
        indexVariableStoreByPosition(response.position, latestVariableStoreRef.current);
      }

      // 检查 LLM 调试信息并创建 LLM 气泡（支持多个 action 的 debugInfo）
      // LLM debug infos are now displayed via V2 debug_entries (fetched below)

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

      // V2: Update runId from response and refresh debug entries
      if (response.currentRunId) {
        setCurrentRunId(response.currentRunId);
      }
      console.log('[DebugChat] 🔍 V2 fetch debug entries trigger:', {
        responseCurrentRunId: response.currentRunId,
        stateCurrentRunId: currentRunId,
        resolvedRunId: response.currentRunId || currentRunId || undefined,
      });
      fetchDebugEntriesV2(response.currentRunId || currentRunId || undefined);
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
    const isAcknowledgmentMode =
      currentPosition?.actionType === 'ai_say' &&
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

        const errorBubble: ErrorBubbleItem = {
          id: uuidv4(),
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
        addErrorBubble(errorBubble);
      }

      // Store variable snapshot for V2 debug bubbles
      if (response.variables) {
        const categorizedVars = response.variableStore
          ? response.variableStore
          : categorizeVariablesByScope(response.variables, response.globalVariables || {});

        let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
        if (response.position && navigationTree) {
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

        const ackActionStatus: 'running' | 'completed' | 'error' =
          response.executionStatus === 'completed' || response.executionStatus === 'error'
            ? (response.executionStatus as 'completed' | 'error')
            : 'running';

        latestVariableStoreRef.current = {
          type: 'variable',
          changedVariables: [],
          allVariables: categorizedVars,
          relevantVariables,
          summary: '变量更新',
          actionStatus: ackActionStatus,
        };
        indexVariableStoreByPosition(response.position, latestVariableStoreRef.current);
      }

      // LLM debug infos are now displayed via V2 debug_entries (fetched below)

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

      // V2: Fetch debug entries
      if (response.currentRunId) {
        setCurrentRunId(response.currentRunId);
      }
      fetchDebugEntriesV2(response.currentRunId || currentRunId || undefined);
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
      const projectId = (sessionInfo?.metadata as any)?.projectId;
      const newSession = await debugApi.createDebugSession({
        userId: sessionInfo.userId || 'user-123',
        scriptId: sessionInfo.scriptId,
        initialVariables: {},
        projectId: projectId || undefined,
      });

      console.log('[DebugChat] ✅ New session created:', newSession.sessionId);
      console.log('[DebugChat] 🔍 New session debugInfo:', newSession.debugInfo);
      console.log(
        '[DebugChat] ⏱️ responseTimeMs from API:',
        newSession.debugInfo?.[0]?.responseTimeMs
      );

      // 清空所有状态
      setMessages([]);
      setErrorBubbles([]);
      setDebugBubblesV2([]);
      setCurrentRunId(null);
      setAvailableRunIds([]);
      setNavigationTree(null);
      setCurrentPosition(undefined); // 使用 undefined 而不是 null
      setTimelineSnapshots([]);
      setViewingSnapshotId(null);
      latestVariableStoreRef.current = null;
      variableStoreByPositionRef.current.clear();

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
        setSessionInfo(sessionDetail);
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
          // Store variable snapshot for V2 debug bubbles
          if (newSession.variables && Object.keys(newSession.variables).length > 0) {
            const globalVariables = newSession.globalVariables || {};
            const categorizedVars = categorizeVariablesByScope(
              newSession.variables,
              globalVariables
            );

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
            }

            const restartActionStatus: 'running' | 'completed' | 'error' =
              sessionDetail.executionStatus === 'completed' ||
              sessionDetail.executionStatus === 'error'
                ? (sessionDetail.executionStatus as 'completed' | 'error')
                : 'running';

            latestVariableStoreRef.current = {
              type: 'variable',
              changedVariables: [],
              allVariables: categorizedVars,
              relevantVariables,
              summary: '初始变量状态',
              actionStatus: restartActionStatus,
            };
            indexVariableStoreByPosition(sessionDetail.position, latestVariableStoreRef.current);
          }
        }

        // V2: Fetch debug entries from new session (covers LLM debug info previously in V1 bubbles)
        if (sessionDetail.currentRunId) {
          setCurrentRunId(sessionDetail.currentRunId);
          fetchDebugEntriesV2(sessionDetail.currentRunId);
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

  // 重运行当前 action
  const handleRerunCurrent = () => {
    setRerunMode('rerun');
    setRerunTargetActionId(currentPosition?.actionId || '');
    setRerunTargetInfo(null);
    setRerunModalVisible(true);
  };

  // 回退到指定 action
  const handleRollbackToAction = (actionId: string) => {
    const snapshot = actionSnapshots[actionId];
    if (!snapshot) {
      message.warning('该 action 没有快照，无法回退');
      return;
    }

    const allActionIds = Object.keys(actionSnapshots);
    const snapshotIdx = allActionIds.indexOf(actionId);
    const actionsToClear = allActionIds.slice(snapshotIdx).filter((a) => a !== actionId);

    // Calculate messages to clear based on snapshot.messageCount
    const snapshotMsgCount = snapshot.messageCount ?? snapshot.conversationHistoryLength ?? 0;
    const currentMsgCount = messages.length;
    const toClear = Math.max(0, currentMsgCount - snapshotMsgCount);
    // Save pre-rerun message count for reliable separator insertion
    preRerunMsgCountRef.current = snapshotMsgCount;

    setRerunMode('rollback');
    setRerunTargetActionId(actionId);
    setRerunTargetInfo({
      phasePath: `Phase ${snapshot.phaseIndex + 1} → Topic ${snapshot.topicIndex + 1} → ${actionId}`,
      snapshotTime: new Date(snapshot.timestamp).toLocaleString(),
      messagesToClear: toClear,
      actionsToClear: actionsToClear,
    });
    setRerunModalVisible(true);
  };

  // -- Re-usable steps for handleRerunConfirm --------------------------
  // Extracted so the confirm handler reads as a clear sequence rather than
  // a 250-line monolithic function.

  const clearStaleStateForRerun = (mode: 'rerun' | 'rollback', targetActionId: string) => {
    setErrorBubbles([]);
    setDebugBubblesV2([]);

    if (mode === 'rollback' && targetActionId) {
      const orderedActionIds = getOrderedActionIds(
        navigationTreeRef.current,
        sessionInfo?.orderedActionIds
      );
      const targetIdx = orderedActionIds.indexOf(targetActionId);
      if (targetIdx >= 0) {
        const actionsToClear = new Set(orderedActionIds.slice(targetIdx));
        for (const key of variableStoreByPositionRef.current.keys()) {
          const actionId = key.split('|')[2];
          if (actionId && actionsToClear.has(actionId)) {
            variableStoreByPositionRef.current.delete(key);
          }
        }
      } else {
        variableStoreByPositionRef.current.clear();
      }
    } else {
      variableStoreByPositionRef.current.clear();
    }
  };

  const reloadMessagesWithSeparator = async (
    sessionId: string,
    mode: 'rerun' | 'rollback',
    targetActionId: string,
    resultActionSnapshots: Record<string, any> | undefined
  ) => {
    const separatorContent =
      mode === 'rerun'
        ? `--- 🔄 重运行当前 action ---`
        : `--- ↩️ 回退到 ${targetActionId} 并重新执行 ---`;

    const msgsResult = await debugApi.getDebugSessionMessages(sessionId);
    if (!msgsResult.success || !msgsResult.data) return;

    const activeMessages = msgsResult.data.filter(
      (m) => !((m.metadata as Record<string, any>)?.superseded === true)
    );

    const snapshotMsgCount = determineSnapshotMsgCount(
      preRerunMsgCountRef.current,
      resultActionSnapshots,
      actionSnapshots,
      targetActionId
    );

    const separatorTimestamp = computeSeparatorTimestamp(activeMessages, snapshotMsgCount);
    const separatorMessage = {
      messageId: `separator-${Date.now()}`,
      role: 'system' as const,
      content: separatorContent,
      timestamp: separatorTimestamp,
    };

    setMessages(insertSeparator(activeMessages, separatorMessage, snapshotMsgCount));
  };

  const applyRerunResponse = (
    result: RerunResponse,
    mode: 'rerun' | 'rollback',
    _targetActionId: string
  ) => {
    // Merge new metadata into sessionInfo
    if (sessionInfo) {
      const updates: any = {};
      if (result.executionStatus) updates.executionStatus = result.executionStatus;
      if ((result as any).actionSnapshots) {
        updates.metadata = {
          ...(sessionInfo.metadata || {}),
          actionSnapshots: (result as any).actionSnapshots,
        };
      }
      if ((result as any).rerunHistory) {
        updates.metadata = {
          ...(updates.metadata || sessionInfo.metadata || {}),
          rerunHistory: (result as any).rerunHistory,
        };
      }
      if (Object.keys(updates).length > 0) {
        setSessionInfo({ ...sessionInfo, ...updates });
      }
    }

    // LLM debug infos are now displayed via V2 debug_entries (fetched by refreshSessionAndEntries)

    // Variable snapshot for V2 debug bubbles
    if (result.variables && Object.keys(result.variables).length > 0) {
      const categorizedVars = result.variableStore
        ? result.variableStore
        : categorizeVariablesByScope(result.variables, result.globalVariables || {});

      let relevantVariables: { inputVariables: string[]; outputVariables: string[] } | undefined;
      if (result.position && navigationTree) {
        const analysis = analyzeActionVariables(
          navigationTree,
          result.position.phaseIndex || 0,
          result.position.topicIndex || 0,
          result.position.actionIndex || 0
        );
        relevantVariables = {
          inputVariables: analysis.inputVariables,
          outputVariables: analysis.outputVariables,
        };
      }

      latestVariableStoreRef.current = {
        type: 'variable',
        changedVariables: [],
        allVariables: categorizedVars,
        relevantVariables,
        summary: mode === 'rollback' ? '回退后变量状态' : '重运行后变量状态',
        actionStatus: 'running',
      };
      indexVariableStoreByPosition(result.position, latestVariableStoreRef.current);
    }

    // Update position
    if (result.position) {
      setCurrentPosition({
        phaseIndex: result.position.phaseIndex,
        topicIndex: result.position.topicIndex,
        actionIndex: result.position.actionIndex,
        phaseId: result.position.phaseId || '',
        topicId: result.position.topicId || '',
        actionId: result.position.actionId || '',
        actionType: result.position.actionType || '',
        currentRound: result.position.currentRound ?? 0,
        maxRounds: result.position.maxRounds,
      });
    }
  };

  const refreshSessionAndEntries = async (
    sessionId: string,
    mode: 'rerun' | 'rollback',
    targetActionId: string
  ) => {
    const updatedSession = await debugApi.getDebugSession(sessionId);
    setSessionInfo(updatedSession);

    if (updatedSession.currentRunId) {
      setCurrentRunId(updatedSession.currentRunId);
    }

    if (mode === 'rollback' && targetActionId && updatedSession.currentRunId) {
      fetchDebugEntriesV2(undefined, {
        excludeStaleForTarget: targetActionId,
        currentRunId: updatedSession.currentRunId,
      });
    } else {
      fetchDebugEntriesV2(updatedSession.currentRunId);
    }
  };

  // -- handleRerunConfirm -------------------------------------------------

  const handleRerunConfirm = async (data: RerunRequest) => {
    if (!activeSessionId) {
      message.error('没有活跃的调试会话');
      throw new Error('没有活跃的调试会话');
    }

    data.targetActionId = rerunMode === 'rollback' ? rerunTargetActionId : undefined;

    // Create timeline snapshot before executing rerun/rollback
    const snapshotLabel =
      rerunMode === 'rerun'
        ? `🔄 重运行 ${currentPosition?.actionId || ''}`
        : `↩️ 回退到 ${rerunTargetActionId}`;
    setTimelineSnapshots((prev) => [
      ...prev,
      {
        snapshotId: uuidv4(),
        actionId: rerunTargetActionId || currentPosition?.actionId || '',
        mode: rerunMode === 'rerun' ? 'rerun' : 'rollback',
        timestamp: new Date().toISOString(),
        label: snapshotLabel,
        messages: messagesRef.current.map((m) => ({ ...m })),
        debugBubblesV2: debugBubblesV2Ref.current.map((b) => ({ ...b })),
      },
    ]);

    // Execute rerun/rollback API call
    let result: RerunResponse;
    try {
      result = await debugApi.rerunAction(activeSessionId, data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 400) {
        message.error('目标 action 已被删除，无法回退');
      } else {
        const errMsg = e?.response?.data?.error || e?.message || '重运行失败';
        message.error(errMsg);
      }
      setRerunModalVisible(false);
      return;
    }

    // Step 1: Clear stale UI state (bubbles + variable store)
    clearStaleStateForRerun(rerunMode, rerunTargetActionId);

    // Step 2: Reload messages and insert separator at snapshot boundary
    try {
      await reloadMessagesWithSeparator(
        activeSessionId,
        rerunMode,
        rerunTargetActionId,
        (result as any).actionSnapshots
      );
    } catch (_e) {
      console.warn('[DebugChat] ⚠️ Message reload failed:', _e);
    }

    // Step 3: Apply response — metadata, V1 bubbles, variable state, position
    applyRerunResponse(result, rerunMode, rerunTargetActionId);

    // Step 4: Refresh session detail and V2 debug entries
    if (activeSessionId) {
      try {
        await refreshSessionAndEntries(activeSessionId, rerunMode, rerunTargetActionId);
      } catch (_e) {
        // ignore refresh errors
      }
    }

    setRerunModalVisible(false);
  };

  // 回写配置到 YAML 脚本
  const handleWriteBack = async (
    _versionId: string,
    config: Record<string, any>,
    llmConfig?: Record<string, any>
  ) => {
    if (!sessionInfo?.scriptId || !rerunTargetActionId) return;

    try {
      await debugApi.writeBackActionConfig(sessionInfo.scriptId, rerunTargetActionId, {
        config,
        llmConfig,
      });
      message.success(`已将配置写入脚本文件的 action: ${rerunTargetActionId}`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 409) {
        message.warning('文件冲突，请先保存当前编辑，然后再尝试回写配置');
      } else {
        const errMsg = e?.response?.data?.error || e?.message || '回写配置失败';
        message.error(errMsg);
      }
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
        <NavigationTree
          tree={navigationTree}
          currentPosition={currentPosition}
          executionStatus={sessionInfo?.executionStatus}
          onRerun={handleRerunCurrent}
          onRollback={handleRollbackToAction}
          actionSnapshots={actionSnapshots}
        />
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
            {availableRunIds.length > 1 && (
              <Select
                value={currentRunId || undefined}
                onChange={(val) => {
                  setCurrentRunId(val);
                  fetchDebugEntriesV2(val);
                }}
                style={{ width: 200, marginLeft: 12 }}
                size="small"
                placeholder="Select run"
                options={availableRunIds.map((id, i) => ({
                  value: id,
                  label: `Run ${i + 1}: ${id.substring(0, 8)}...`,
                }))}
              />
            )}
            {timelineSnapshots.length > 0 && (
              <Select
                value={viewingSnapshotId || '__current__'}
                onChange={(val) => setViewingSnapshotId(val === '__current__' ? null : val)}
                style={{ width: 160, marginLeft: 12 }}
                size="small"
                options={[
                  { value: '__current__', label: `v${timelineSnapshots.length} (当前)` },
                  ...timelineSnapshots
                    .slice()
                    .reverse()
                    .map((s, i) => ({
                      value: s.snapshotId,
                      label: `v${timelineSnapshots.length - 1 - i}`,
                    })),
                ]}
              />
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
          ) : displayMessages.length === 0 &&
            displayDebugBubblesV2.length === 0 &&
            errorBubbles.length === 0 ? (
            <Empty description="No messages yet" style={{ marginTop: 50 }} />
          ) : (
            <>
              {(() => {
                // Merge messages, V2 bubbles, and error bubbles into a time-sorted list
                const items: Array<{
                  type: 'message' | 'error' | 'bubble-v2';
                  data: any;
                  timestamp: string;
                }> = [];

                displayMessages.forEach((msg) => {
                  items.push({
                    type: 'message',
                    data: msg,
                    timestamp: msg.timestamp,
                  });
                });

                // Error bubbles (V2-style, filtered by debugFilter.showError)
                if (debugFilter.showError) {
                  displayErrorBubbles.forEach((bubble) => {
                    items.push({
                      type: 'error',
                      data: bubble,
                      timestamp: bubble.timestamp,
                    });
                  });
                }

                // V2 unified debug bubbles
                displayDebugBubblesV2.forEach((bubble) => {
                  items.push({
                    type: 'bubble-v2' as any,
                    data: bubble,
                    timestamp: bubble.timestamp,
                  });
                });

                // Sort by timestamp; within 2s window, messages first, then errors, then V2
                const typeOrder = { message: 0, error: 1, 'bubble-v2': 2 };
                const WINDOW_MS = 2000;
                items.sort((a, b) => {
                  const ta = new Date(a.timestamp).getTime();
                  const tb = new Date(b.timestamp).getTime();
                  if (Math.abs(ta - tb) > WINDOW_MS) return ta - tb;
                  return typeOrder[a.type] - typeOrder[b.type] || ta - tb;
                });

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
                    ) : item.type === 'error' ? (
                      <div style={{ margin: '8px 0' }}>
                        <ErrorBubble
                          content={item.data.content as ErrorBubbleContent}
                          isExpanded={item.data.isExpanded}
                          timestamp={item.data.timestamp}
                          onToggleExpand={() => {
                            setErrorBubbles((prev) =>
                              prev.map((b) =>
                                b.id === item.data.id ? { ...b, isExpanded: !b.isExpanded } : b
                              )
                            );
                          }}
                          onRestart={handleRestartDebug}
                        />
                      </div>
                    ) : item.type === 'bubble-v2' ? (
                      <div style={{ margin: '8px 0' }}>
                        <DebugEntryBubble
                          bubble={item.data as DebugBubbleV2}
                          filter={debugFilter}
                          onToggleExpand={() => {
                            setDebugBubblesV2((prev) =>
                              prev.map((b) =>
                                b.id === item.data.id ? { ...b, isExpanded: !b.isExpanded } : b
                              )
                            );
                            // When viewing a historical snapshot, also update its copy
                            if (viewingSnapshotId) {
                              setTimelineSnapshots((prev) =>
                                prev.map((s) =>
                                  s.snapshotId === viewingSnapshotId
                                    ? {
                                        ...s,
                                        debugBubblesV2: s.debugBubblesV2.map((b) =>
                                          b.id === item.data.id
                                            ? { ...b, isExpanded: !b.isExpanded }
                                            : b
                                        ),
                                      }
                                    : s
                                )
                              );
                            }
                          }}
                          sessionId={activeSessionId || sessionId || undefined}
                          isLatest={!!(item.data as DebugBubbleV2).variableContent}
                          onVariableEdit={(scope, name, newValue) => {
                            setDebugBubblesV2((prev) =>
                              prev.map((b) => {
                                if (!b.variableContent) return b;
                                const vc = { ...b.variableContent };
                                const scopeKey = scope as keyof typeof vc.allVariables;
                                vc.allVariables = {
                                  ...vc.allVariables,
                                  [scopeKey]: {
                                    ...(vc.allVariables[scopeKey] || {}),
                                    [name]: newValue,
                                  },
                                };
                                return { ...b, variableContent: vc };
                              })
                            );
                          }}
                        />
                      </div>
                    ) : null}
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
            // 检查是否是 ai_say max_rounds=1 的确认模式
            const isAcknowledgmentMode =
              currentPosition?.actionType === 'ai_say' &&
              currentPosition?.maxRounds === 1 &&
              currentPosition?.currentRound === 1;

            if (isAcknowledgmentMode && (e.key === ' ' || e.key === 'Spacebar')) {
              e.preventDefault();
              handleAcknowledgment();
            }
          }}
        >
          {(() => {
            // 检查会话是否已结束
            const isSessionEnded =
              sessionInfo?.executionStatus === 'completed' ||
              sessionInfo?.executionStatus === 'error' ||
              sessionInfo?.executionStatus === 'failed';

            if (isSessionEnded) {
              return (
                <div style={{ textAlign: 'center', padding: '16px' }}>
                  <Tag color={sessionInfo?.executionStatus === 'completed' ? 'green' : 'red'}>
                    会话已结束 ({sessionInfo?.executionStatus})
                  </Tag>
                  {onSessionRestart && (
                    <Button
                      type="primary"
                      size="small"
                      style={{ marginLeft: '12px' }}
                      onClick={() => onSessionRestart(activeSessionId || '')}
                    >
                      重新开始调试
                    </Button>
                  )}
                </div>
              );
            }

            // 查看历史快照时，在输入框上方显示提示条（不阻挡输入）
            const historyBanner = viewingSnapshot ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 12px',
                  marginBottom: 8,
                  background: '#e6f7ff',
                  borderRadius: 4,
                  border: '1px solid #91d5ff',
                }}
              >
                <span style={{ fontSize: 12, color: '#1890ff' }}>📜 {viewingSnapshot.label}</span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => setViewingSnapshotId(null)}
                  style={{ marginLeft: 8, fontSize: 12 }}
                >
                  ← 返回当前
                </Button>
              </div>
            ) : null;

            // 检查是否是 ai_say max_rounds=1 的确认模式
            const isAcknowledgmentMode =
              currentPosition?.actionType === 'ai_say' &&
              currentPosition?.maxRounds === 1 &&
              currentPosition?.currentRound === 1;

            if (isAcknowledgmentMode) {
              // ai_say 确认模式：显示提示和下一步按钮
              return (
                <>
                  {historyBanner}
                  <div className="debug-chat-acknowledgment-hint">
                    <span style={{ color: '#666', fontSize: '14px' }}>
                      💡 按
                      <kbd
                        style={{
                          padding: '2px 6px',
                          background: '#f0f0f0',
                          border: '1px solid #ccc',
                          borderRadius: '3px',
                          fontFamily: 'monospace',
                        }}
                      >
                        空格
                      </kbd>
                      继续，或点击
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
                  {historyBanner}
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

        <RerunModal
          visible={rerunModalVisible}
          actionId={rerunTargetActionId}
          actionType={currentPosition?.actionType || ''}
          actionConfig={currentActionConfig}
          sessionDetail={sessionInfo}
          versions={currentActionVersions}
          mode={rerunMode}
          targetInfo={rerunTargetInfo}
          onConfirm={handleRerunConfirm}
          onWriteBack={handleWriteBack}
          onCancel={() => setRerunModalVisible(false)}
        />
      </div>
    </div>
  );
};

export default DebugChatPanel;
