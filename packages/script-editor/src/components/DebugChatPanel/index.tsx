import { CloseOutlined, SendOutlined } from '@ant-design/icons';
import { Button, Input, Spin, Alert, Empty } from 'antd';
import React, { useState, useEffect, useRef } from 'react';

import { debugApi } from '../../api/debug';
import type { DebugMessage } from '../../api/debug';
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

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      setError(err.response?.data?.error || err.message || 'Failed to send message');
      
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

      {/* 错误提示 */}
      {error && (
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
          <Empty
            description="No messages yet"
            style={{ marginTop: 50 }}
          />
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.messageId}
                className={`debug-message debug-message-${msg.role}`}
              >
                <div className="debug-message-header">
                  <span className="debug-message-role">
                    {msg.role === 'ai' ? 'AI' : msg.role === 'user' ? 'User' : 'System'}:
                  </span>
                  <span className="debug-message-time">
                    {formatTimestamp(msg.timestamp)}
                  </span>
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
    </div>
  );
};

export default DebugChatPanel;
