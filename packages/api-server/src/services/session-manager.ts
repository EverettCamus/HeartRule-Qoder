/**
 * 会话管理服务
 * 
 * 集成脚本执行引擎，提供基于 YAML 脚本的会话管理
 */

import { ScriptExecutor, ExecutionStatus } from '@heartrule/core-engine';
import type { ExecutionState } from '@heartrule/core-engine';
import { db } from '../db/index.js';
import { sessions, messages, scripts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import yaml from 'yaml';

/**
 * 会话管理器
 */
export class SessionManager {
  private scriptExecutor: ScriptExecutor;

  constructor() {
    this.scriptExecutor = new ScriptExecutor();
  }

  /**
   * 初始化会话 - 获取初始 AI 消息
   */
  async initializeSession(
    sessionId: string
  ): Promise<{
    aiMessage: string;
    sessionStatus: string;
    executionStatus: string;
    variables?: Record<string, unknown>;
  }> {
    // 获取会话
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      throw new Error('Script not found');
    }

    // 创建初始执行状态
    let executionState: ExecutionState = ScriptExecutor.createInitialState();
    executionState.variables = (session.variables as Record<string, any>) || {};

    // 转换 YAML 为 JSON
    const scriptContent = yaml.parse(script.scriptContent);
    const scriptJson = JSON.stringify(scriptContent);

    // 执行脚本（初始化，没有用户输入）
    executionState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      null
    );

    // 保存 AI 消息
    if (executionState.lastAiMessage) {
      const aiMessageId = uuidv4();
      await db.insert(messages).values({
        id: aiMessageId,
        sessionId,
        role: 'assistant',
        content: executionState.lastAiMessage,
        metadata: {},
        timestamp: new Date(),
      });
    }

    // 更新会话状态
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

    return {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      variables: executionState.variables,
    };
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
    // 获取会话
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      throw new Error('Session not found');
    }

    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.id, session.scriptId),
    });

    if (!script) {
      throw new Error('Script not found');
    }

    // 保存用户消息
    const userMessageId = uuidv4();
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
      currentPhaseIdx: (session.position as any)?.phaseIndex || 0,
      currentTopicIdx: (session.position as any)?.topicIndex || 0,
      currentActionIdx: (session.position as any)?.actionIndex || 0,
      currentAction: null, // 会在执行器中重建
      variables: (session.variables as Record<string, any>) || {},
      conversationHistory: [],
      metadata: (session.metadata as Record<string, any>) || {},
      lastAiMessage: null,
    };

    // 转换 YAML 为 JSON
    const scriptContent = yaml.parse(script.scriptContent);
    const scriptJson = JSON.stringify(scriptContent);

    // 执行脚本（传入用户输入）
    executionState = await this.scriptExecutor.executeSession(
      scriptJson,
      sessionId,
      executionState,
      userInput
    );

    // 保存 AI 消息
    if (executionState.lastAiMessage) {
      const aiMessageId = uuidv4();
      await db.insert(messages).values({
        id: aiMessageId,
        sessionId,
        role: 'assistant',
        content: executionState.lastAiMessage,
        metadata: {},
        timestamp: new Date(),
      });
    }

    // 更新会话状态
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

    return {
      aiMessage: executionState.lastAiMessage || '',
      sessionStatus: session.status,
      executionStatus: executionState.status,
      variables: executionState.variables,
    };
  }
}
