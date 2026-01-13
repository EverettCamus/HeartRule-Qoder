/**
 * 会话管理服务
 *
 * 集成脚本执行引擎，提供基于 YAML 脚本的会话管理
 */

import { ScriptExecutor, ExecutionStatus } from '@heartrule/core-engine';
import type { ExecutionState } from '@heartrule/core-engine';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

import { db } from '../db/index.js';
import { sessions, messages, scripts, variables, type NewVariable } from '../db/schema.js';

/**
 * 会话管理器
 */
export class SessionManager {
  private scriptExecutor: ScriptExecutor;

  constructor() {
    this.scriptExecutor = new ScriptExecutor();
  }

  /**
   * 推断变量的类型字符串，用于写入 value_type
   */
  private inferValueType(value: unknown): string {
    if (value === null || value === undefined) return 'unknown';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      return t;
    }
    return 'object';
  }

  /**
   * 根据旧值和新值，构造需要写入 variables 表的快照
   */
  private buildVariableSnapshots(
    sessionId: string,
    oldVars: Record<string, unknown> | null,
    newVars: Record<string, unknown>
  ): NewVariable[] {
    const rows: NewVariable[] = [];

    for (const [name, value] of Object.entries(newVars)) {
      const prev = oldVars ? oldVars[name] : undefined;

      // 简单对比：不同才记录快照
      if (prev !== value) {
        rows.push({
          sessionId,
          variableName: name,
          value,
          scope: 'session', // 先全部按会话级变量处理
          valueType: this.inferValueType(value),
          source: 'script_executor', // 后续可以细化来源
        });
      }
    }

    return rows;
  }

  /**
   * 初始化会话 - 获取初始 AI 消息
   */
  async initializeSession(sessionId: string): Promise<{
    aiMessage: string;
    sessionStatus: string;
    executionStatus: string;
    variables?: Record<string, unknown>;
  }> {
    console.log('[SessionManager] 🔵 initializeSession called', { sessionId });

    // 获取会话
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      console.error('[SessionManager] ❌ Session not found:', sessionId);
      throw new Error('Session not found');
    }
    console.log('[SessionManager] ✅ Session found:', {
      id: session.id,
      scriptId: session.scriptId,
      status: session.status,
      executionStatus: session.executionStatus,
    });

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      console.error('[SessionManager] ❌ Script not found:', session.scriptId);
      throw new Error('Script not found');
    }
    console.log('[SessionManager] ✅ Script found:', {
      id: script.id,
      scriptName: script.scriptName,
      contentLength: script.scriptContent.length,
    });

    // 创建初始执行状态
    let executionState: ExecutionState = ScriptExecutor.createInitialState();
    executionState.variables = (session.variables as Record<string, unknown>) || {};
    console.log('[SessionManager] 📋 Initial execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      variables: executionState.variables,
    });

    // 转换 YAML 为 JSON
    const scriptContent = yaml.parse(script.scriptContent);
    const scriptJson = JSON.stringify(scriptContent);
    console.log('[SessionManager] 📄 Parsed YAML script:', {
      sessionId: scriptContent.session?.session_id,
      sessionName: scriptContent.session?.session_name,
      phasesCount: scriptContent.phases?.length || 0,
    });

    // 执行脚本（初始化，没有用户输入）
    console.log('[SessionManager] ⏳ Executing script (initialization)...');
    executionState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      null
    );
    console.log('[SessionManager] ✅ Script execution completed:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      lastAiMessage: executionState.lastAiMessage,
      hasMessage: !!executionState.lastAiMessage,
    });

    // 保存 AI 消息
    if (executionState.lastAiMessage) {
      const aiMessageId = uuidv4();
      console.log('[SessionManager] 💾 Saving AI message (init):', {
        messageId: aiMessageId,
        content: executionState.lastAiMessage,
      });
      await db.insert(messages).values({
        id: aiMessageId,
        sessionId,
        role: 'assistant',
        content: executionState.lastAiMessage,
        metadata: {},
        timestamp: new Date(),
      });
    } else {
      console.log('[SessionManager] ⚠️ No AI message to save (init)');
    }

    // 在更新 sessions 之前，记录变量变化快照
    const previousVars = (session.variables as Record<string, unknown> | null) || null;
    const newVars = (executionState.variables || {}) as Record<string, unknown>;

    const snapshots = this.buildVariableSnapshots(sessionId, previousVars, newVars);
    if (snapshots.length > 0) {
      console.log('[SessionManager] 💾 Saving variable snapshots (init):', snapshots.length);
      await db.insert(variables).values(snapshots);
    }

    // 更新会话状态
    console.log('[SessionManager] 💾 Updating session state in DB (init)');
    await db
      .update(sessions)
      .set({
        position: {
          phaseIndex: executionState.currentPhaseIdx,
          topicIndex: executionState.currentTopicIdx,
          actionIndex: executionState.currentActionIdx,
        },
        variables: executionState.variables,
        executionStatus: executionState.status,
        metadata: executionState.metadata,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    const result = {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      variables: executionState.variables,
    };
    console.log('[SessionManager] 🏁 initializeSession completed:', result);
    return result;
  }

  /**
   * 处理用户输入
   */
  async processUserInput(
    sessionId: string,
    userInput: string
  ): Promise<{
    aiMessage: string;
    sessionStatus: string;
    executionStatus: string;
    variables?: Record<string, unknown>;
  }> {
    console.log('[SessionManager] 🔵 processUserInput called', { sessionId, userInput });

    // 获取会话
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      console.error('[SessionManager] ❌ Session not found:', sessionId);
      throw new Error('Session not found');
    }
    console.log('[SessionManager] ✅ Session found:', {
      id: session.id,
      status: session.status,
      executionStatus: session.executionStatus,
      position: session.position,
    });

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      console.error('[SessionManager] ❌ Script not found:', session.scriptId);
      throw new Error('Script not found');
    }
    console.log('[SessionManager] ✅ Script found:', {
      id: script.id,
      scriptName: script.scriptName,
    });

    // 保存用户消息
    const userMessageId = uuidv4();
    console.log('[SessionManager] 💾 Saving user message:', { messageId: userMessageId, content: userInput });
    await db.insert(messages).values({
      id: userMessageId,
      sessionId,
      role: 'user',
      content: userInput,
      metadata: {},
      timestamp: new Date(),
    });

    // 恢复执行状态
    let executionState: ExecutionState = {
      status: (session.executionStatus as ExecutionStatus) || ExecutionStatus.RUNNING,
      currentPhaseIdx: ((session.position as Record<string, unknown>)?.phaseIndex as number) || 0,
      currentTopicIdx: ((session.position as Record<string, unknown>)?.topicIndex as number) || 0,
      currentActionIdx: ((session.position as Record<string, unknown>)?.actionIndex as number) || 0,
      currentAction: null, // 会在执行器中重建
      variables: (session.variables as Record<string, unknown>) || {},
      conversationHistory: [],
      metadata: (session.metadata as Record<string, unknown>) || {},
      lastAiMessage: null,
    };
    console.log('[SessionManager] 📋 Restored execution state:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
    });

    // 转换 YAML 为 JSON
    const scriptContent = yaml.parse(script.scriptContent);
    const scriptJson = JSON.stringify(scriptContent);

    // 执行脚本（传入用户输入）
    console.log('[SessionManager] ⏳ Executing script with user input...');
    executionState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      userInput
    );
    console.log('[SessionManager] ✅ Script execution completed:', {
      status: executionState.status,
      phaseIdx: executionState.currentPhaseIdx,
      topicIdx: executionState.currentTopicIdx,
      actionIdx: executionState.currentActionIdx,
      lastAiMessage: executionState.lastAiMessage,
      hasMessage: !!executionState.lastAiMessage,
    });

    // 保存 AI 消息
    if (executionState.lastAiMessage) {
      const aiMessageId = uuidv4();
      console.log('[SessionManager] 💾 Saving AI message:', {
        messageId: aiMessageId,
        content: executionState.lastAiMessage,
      });
      await db.insert(messages).values({
        id: aiMessageId,
        sessionId,
        role: 'assistant',
        content: executionState.lastAiMessage,
        metadata: {},
        timestamp: new Date(),
      });
    } else {
      console.log('[SessionManager] ⚠️ No AI message to save');
    }

    // 在更新 sessions 之前，记录变量变化快照
    const previousVars = (session.variables as Record<string, unknown> | null) || null;
    const newVars = (executionState.variables || {}) as Record<string, unknown>;

    const snapshots = this.buildVariableSnapshots(sessionId, previousVars, newVars);
    if (snapshots.length > 0) {
      console.log('[SessionManager] 💾 Saving variable snapshots:', snapshots.length);
      await db.insert(variables).values(snapshots);
    }

    // 更新会话状态
    console.log('[SessionManager] 💾 Updating session state in DB');
    await db
      .update(sessions)
      .set({
        position: {
          phaseIndex: executionState.currentPhaseIdx,
          topicIndex: executionState.currentTopicIdx,
          actionIndex: executionState.currentActionIdx,
        },
        variables: executionState.variables,
        executionStatus: executionState.status,
        metadata: executionState.metadata,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));

    const result = {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      variables: executionState.variables,
    };
    console.log('[SessionManager] 🏁 processUserInput completed:', result);
    return result;
  }
}
