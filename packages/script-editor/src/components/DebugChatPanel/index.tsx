import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Input, Spin, Alert, Empty } from 'antd';
import React, { useState, useEffect, useRef } from 'react';

import { debugApi } from '../../api/debug';
import type { DebugMessage } from '../../api/debug';
import type { DetailedError } from '../../types/error';
import type {
  NavigationTree as NavigationTreeType,
  CurrentPosition,
  PhaseNode,
  TopicNode,
  ActionNode,
} from '../../types/navigation';
import ErrorBanner from '../ErrorBanner/ErrorBanner';
import ErrorDetailModal from '../ErrorDetailModal/ErrorDetailModal';
import NavigationTree from '../NavigationTree/NavigationTree';
import './style.css';

const { TextArea } = Input;

interface DebugChatPanelProps {
  visible: boolean;
  sessionId: string | null;
  initialMessage?: string;
  onClose: () => void;
}

const DebugChatPanel: React.FC<DebugChatPanelProps> = ({
  visible,
  sessionId,
  initialMessage,
  onClose,
}) => {
  const [messages, setMessages] = useState<DebugMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 新增：错误和导航树状态
  const [detailedError, setDetailedError] = useState<DetailedError | null>(null);
  const [showErrorDetail, setShowErrorDetail] = useState(false);
  const [navigationTree, setNavigationTree] = useState<NavigationTreeType | null>(null);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | undefined>(undefined);

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
        };
        console.log('[DebugChat] Setting initial position from session:', pos);
        setCurrentPosition(pos);
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
  const handleSendMessage = async () => {
    console.log('[DebugChat] 🔵 handleSendMessage called', {
      inputValue,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    if (!inputValue.trim() || !sessionId) {
      console.warn('[DebugChat] ⚠️ Cannot send message:', {
        hasInput: !!inputValue.trim(),
        hasSessionId: !!sessionId,
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
        sessionId,
        content: userMessage,
      });
      const response = await debugApi.sendDebugMessage(sessionId, {
        content: userMessage,
      });
      console.log('[DebugChat] ✅ API Response received:', {
        aiMessage: response.aiMessage,
        sessionStatus: response.sessionStatus,
        executionStatus: response.executionStatus,
        hasVariables: !!response.variables,
      });

      // 检查响应中是否包含错误信息
      if ((response as any).error) {
        const errorData = (response as any).error;
        setDetailedError(errorData);
      }

      // 更新执行位置（如果响应中包含）
      if ((response as any).position) {
        const pos: CurrentPosition = {
          phaseIndex: (response as any).position.phaseIndex || 0,
          phaseId: (response as any).position.phaseId || '',
          topicIndex: (response as any).position.topicIndex || 0,
          topicId: (response as any).position.topicId || '',
          actionIndex: (response as any).position.actionIndex || 0,
          actionId: (response as any).position.actionId || '',
          actionType: (response as any).position.actionType || '',
        };
        console.log('[DebugChat] Updating position from response:', pos);
        setCurrentPosition(pos);
      }

      // 添加AI回复到消息列表
      const aiMsg: DebugMessage = {
        messageId: `ai-${Date.now()}`,
        role: 'ai',
        content: response.aiMessage,
        timestamp: new Date().toISOString(),
      };
      console.log('[DebugChat] 💬 Adding AI response to UI:', aiMsg);
      setMessages((prev) => [...prev, aiMsg]);
      console.log('[DebugChat] ✅ Message sent successfully');
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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

      // 创建新会话
      const newSession = await debugApi.createDebugSession({
        userId: sessionInfo.userId || 'user-123',
        scriptId: sessionInfo.scriptId,
        initialVariables: {},
      });

      // 清空消息历史
      setMessages([]);

      // 如果有初始消息，添加它
      if (newSession.aiMessage) {
        const initialMsg: DebugMessage = {
          messageId: 'initial',
          role: 'ai',
          content: newSession.aiMessage,
          timestamp: new Date().toISOString(),
        };
        setMessages([initialMsg]);
      }

      // 更新会话信息（但不改变 sessionId prop，因为那由父组件控制）
      console.log('[DebugChat] ✅ Debug session restarted:', newSession.sessionId);
      alert('Debug session restarted successfully. Session ID: ' + newSession.sessionId);
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
            {sessionInfo && (
              <span className="debug-chat-session-info">
                Session: {sessionId?.substring(0, 8)}...
              </span>
            )}
          </div>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onClose}
            className="debug-chat-close-btn"
          />
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
          ) : messages.length === 0 ? (
            <Empty description="No messages yet" style={{ marginTop: 50 }} />
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.messageId} className={`debug-message debug-message-${msg.role}`}>
                  <div className="debug-message-header">
                    <span className="debug-message-role">
                      {msg.role === 'ai' ? 'AI' : msg.role === 'user' ? 'User' : 'System'}:
                    </span>
                    <span className="debug-message-time">{formatTimestamp(msg.timestamp)}</span>
                  </div>
                  <div className="debug-message-content">{msg.content}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* 输入区域 */}
        <div className="debug-chat-input-area">
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
        </div>

        {/* 错误详情弹窗 */}
        {detailedError && (
          <ErrorDetailModal
            error={detailedError}
            isOpen={showErrorDetail}
            onClose={() => setShowErrorDetail(false)}
          />
        )}
      </div>
    </div>
  );
};

export default DebugChatPanel;
