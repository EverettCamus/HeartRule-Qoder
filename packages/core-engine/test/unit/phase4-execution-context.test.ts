/**
 * Phase 4 重构测试：ExecutionContext结构简化
 *
 * 验证：
 * 1. ExecutionContext结构的正确性和清晰性
 * 2. ExecutionStateAdapter双向转换的准确性
 * 3. 新旧结构的完全兼容性
 * 4. 边界情况和异常处理
 */

import { describe, it, expect } from 'vitest';

import type {
  ExecutionContext,
  LegacyExecutionState,
  ExecutionPosition,
  ExecutionRuntime,
  ExecutionMetadata,
} from '../../src/engines/script-execution/execution-context.js';
import { ExecutionStateAdapter } from '../../src/engines/script-execution/execution-context.js';
import { ExecutionStatus } from '../../src/engines/script-execution/script-executor.js';

describe('Phase 4 重构：ExecutionContext结构简化', () => {
  describe('1. ExecutionContext 结构测试', () => {
    it('应该正确创建空的ExecutionContext', () => {
      const context = ExecutionStateAdapter.createEmpty();

      expect(context.status).toBe(ExecutionStatus.RUNNING);
      expect(context.position.phaseIndex).toBe(0);
      expect(context.position.topicIndex).toBe(0);
      expect(context.position.actionIndex).toBe(0);
      expect(context.runtime.currentAction).toBeNull();
      expect(context.runtime.lastAiMessage).toBeNull();
      expect(context.variableStore).toEqual({
        global: {},
        session: {},
        phase: {},
        topic: {},
      });
      expect(context.conversationHistory).toEqual([]);
      expect(context.metadata).toEqual({});
    });

    it('ExecutionPosition应该只包含位置信息', () => {
      const position: ExecutionPosition = {
        phaseIndex: 1,
        topicIndex: 2,
        actionIndex: 3,
        phaseId: 'phase-1',
        topicId: 'topic-2',
        actionId: 'action-3',
        actionType: 'ai_say',
      };

      // 验证类型（编译时检查）
      expect(position.phaseIndex).toBe(1);
      expect(position.topicIndex).toBe(2);
      expect(position.actionIndex).toBe(3);
      expect(position.phaseId).toBe('phase-1');
      expect(position.topicId).toBe('topic-2');
      expect(position.actionId).toBe('action-3');
      expect(position.actionType).toBe('ai_say');
    });

    it('ExecutionRuntime应该只包含临时状态', () => {
      const runtime: ExecutionRuntime = {
        currentAction: null,
        lastAiMessage: 'Hello, user!',
        lastLLMDebugInfo: {
          prompt: 'test prompt',
          response: 'test response',
          model: 'deepseek-v3',
          config: { temperature: 0.7 },
          timestamp: new Date().toISOString(),
          tokensUsed: 150,
        },
      };

      expect(runtime.currentAction).toBeNull();
      expect(runtime.lastAiMessage).toBe('Hello, user!');
      expect(runtime.lastLLMDebugInfo?.model).toBe('deepseek-v3');
    });

    it('ExecutionMetadata应该包含配置和扩展信息', () => {
      const metadata: ExecutionMetadata = {
        sessionConfig: {
          template_scheme: 'custom_scheme',
        },
        projectId: 'project-123',
        actionState: {
          actionId: 'action-1',
          actionType: 'ai_ask',
          currentRound: 2,
          maxRounds: 5,
          conversationHistory: [],
        },
        actionMetricsHistory: [
          {
            actionId: 'action-1',
            actionType: 'ai_ask',
            round: 1,
            timestamp: '2024-01-01T00:00:00Z',
            metrics: { user_engagement: 'high' },
          },
        ],
        latestMonitorFeedback: 'User is engaged',
      };

      expect(metadata.sessionConfig?.template_scheme).toBe('custom_scheme');
      expect(metadata.projectId).toBe('project-123');
      expect(metadata.actionState?.actionId).toBe('action-1');
      expect(metadata.actionMetricsHistory?.length).toBe(1);
      expect(metadata.latestMonitorFeedback).toBe('User is engaged');
    });
  });

  describe('2. ExecutionStateAdapter.fromLegacy() 测试', () => {
    it('应该正确转换完整的Legacy结构', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 1,
        currentTopicIdx: 2,
        currentActionIdx: 3,
        currentPhaseId: 'phase-1',
        currentTopicId: 'topic-2',
        currentActionId: 'action-3',
        currentActionType: 'ai_say',
        currentAction: null,
        variables: { name: 'John', age: 30 },
        variableStore: {
          global: { system: 'v1' } as any,
          session: { name: 'John', age: 30 } as any,
          phase: { step: 'intro' } as any,
          topic: { focus: 'greeting' } as any,
        },
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        metadata: {
          sessionConfig: { template_scheme: 'default' },
          projectId: 'proj-1',
          actionState: {
            actionId: 'action-3',
            actionType: 'ai_say',
            currentRound: 1,
            maxRounds: 3,
            conversationHistory: [],
          },
        },
        lastAiMessage: 'Hi there!',
        lastLLMDebugInfo: {
          prompt: 'Say hello',
          response: 'Hi there!',
          model: 'deepseek-v3',
          config: { temperature: 0.7 },
          timestamp: '2024-01-01T00:00:00Z',
          tokensUsed: 15,
        },
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);

      // 验证位置信息
      expect(context.position.phaseIndex).toBe(1);
      expect(context.position.topicIndex).toBe(2);
      expect(context.position.actionIndex).toBe(3);
      expect(context.position.phaseId).toBe('phase-1');
      expect(context.position.topicId).toBe('topic-2');
      expect(context.position.actionId).toBe('action-3');
      expect(context.position.actionType).toBe('ai_say');

      // 验证运行时状态
      expect(context.runtime.currentAction).toBeNull();
      expect(context.runtime.lastAiMessage).toBe('Hi there!');
      expect(context.runtime.lastLLMDebugInfo?.model).toBe('deepseek-v3');

      // 验证变量存储
      expect(context.variableStore.global.system).toBe('v1');
      expect(context.variableStore.session.name).toBe('John');
      expect(context.variableStore.phase.step).toBe('intro');
      expect(context.variableStore.topic.focus).toBe('greeting');

      // 验证对话历史
      expect(context.conversationHistory.length).toBe(2);

      // 验证元数据
      expect(context.metadata.sessionConfig?.template_scheme).toBe('default');
      expect(context.metadata.projectId).toBe('proj-1');
      expect(context.metadata.actionState?.actionId).toBe('action-3');
    });

    it('应该处理没有variableStore的Legacy结构', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: { name: 'Alice' },
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);

      // 应该自动创建variableStore，并将variables迁移到session层
      expect(context.variableStore).toBeDefined();
      expect(context.variableStore.session).toEqual({ name: 'Alice' });
      expect(context.variableStore.global).toEqual({});
      expect(context.variableStore.phase).toEqual({});
      expect(context.variableStore.topic).toEqual({});
    });

    it('应该保留metadata中的未知字段', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {
          customField1: 'value1',
          customField2: { nested: 'value2' },
          projectId: 'proj-1',
        },
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);

      expect(context.metadata.projectId).toBe('proj-1');
      expect(context.metadata.customField1).toBe('value1');
      expect(context.metadata.customField2).toEqual({ nested: 'value2' });
    });
  });

  describe('3. ExecutionStateAdapter.toLegacy() 测试', () => {
    it('应该正确转换完整的Context结构', () => {
      const context: ExecutionContext = {
        status: ExecutionStatus.WAITING_INPUT,
        position: {
          phaseIndex: 2,
          topicIndex: 1,
          actionIndex: 0,
          phaseId: 'phase-2',
          topicId: 'topic-1',
          actionId: 'action-0',
          actionType: 'ai_ask',
        },
        runtime: {
          currentAction: null,
          lastAiMessage: 'What is your name?',
          lastLLMDebugInfo: {
            prompt: 'Ask for name',
            response: 'What is your name?',
            model: 'deepseek-v3',
            config: { temperature: 0.7 },
            timestamp: '2024-01-01T00:00:00Z',
            tokensUsed: 23,
          },
        },
        variableStore: {
          global: { version: '2.0' } as any,
          session: { userId: '123' } as any,
          phase: { phaseStep: 'data_collection' } as any,
          topic: { topicType: 'personal_info' } as any,
        },
        conversationHistory: [{ role: 'assistant', content: 'What is your name?' }],
        metadata: {
          sessionConfig: { template_scheme: 'custom' },
          projectId: 'proj-2',
          actionMetricsHistory: [
            {
              actionId: 'action-0',
              actionType: 'ai_ask',
              round: 1,
              timestamp: '2024-01-01T00:00:00Z',
              metrics: { information_completeness: 'partial' },
            },
          ],
        },
      };

      const legacy = ExecutionStateAdapter.toLegacy(context);

      // 验证位置信息展开
      expect(legacy.currentPhaseIdx).toBe(2);
      expect(legacy.currentTopicIdx).toBe(1);
      expect(legacy.currentActionIdx).toBe(0);
      expect(legacy.currentPhaseId).toBe('phase-2');
      expect(legacy.currentTopicId).toBe('topic-1');
      expect(legacy.currentActionId).toBe('action-0');
      expect(legacy.currentActionType).toBe('ai_ask');

      // 验证运行时状态展开
      expect(legacy.currentAction).toBeNull();
      expect(legacy.lastAiMessage).toBe('What is your name?');
      expect(legacy.lastLLMDebugInfo?.model).toBe('deepseek-v3');

      // 验证变量存储
      expect(legacy.variables).toEqual({ userId: '123' });
      expect(legacy.variableStore?.global.version).toBe('2.0');
      expect(legacy.variableStore?.session.userId).toBe('123');

      // 验证对话历史
      expect(legacy.conversationHistory.length).toBe(1);

      // 验证元数据展开
      expect(legacy.metadata.sessionConfig?.template_scheme).toBe('custom');
      expect(legacy.metadata.projectId).toBe('proj-2');
      expect(legacy.metadata.actionMetricsHistory?.length).toBe(1);
    });

    it('应该正确处理空的variableStore.session', () => {
      const context: ExecutionContext = {
        status: ExecutionStatus.RUNNING,
        position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
        runtime: { currentAction: null, lastAiMessage: null },
        variableStore: {
          global: { key: 'value' } as any,
          session: {},
          phase: {},
          topic: {},
        },
        conversationHistory: [],
        metadata: {},
      };

      const legacy = ExecutionStateAdapter.toLegacy(context);

      expect(legacy.variables).toEqual({});
      expect(legacy.variableStore?.global.key).toBe('value');
    });
  });

  describe('4. 双向转换一致性测试', () => {
    it('Legacy → Context → Legacy 应该保持一致', () => {
      const original: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 1,
        currentTopicIdx: 1,
        currentActionIdx: 1,
        currentPhaseId: 'phase-1',
        currentTopicId: 'topic-1',
        currentActionId: 'action-1',
        currentActionType: 'ai_say',
        currentAction: null,
        variables: { key: 'value' },
        variableStore: {
          global: {},
          session: { key: 'value' } as any,
          phase: {},
          topic: {},
        },
        conversationHistory: [{ role: 'user', content: 'Test' }],
        metadata: {
          projectId: 'test-project',
        },
        lastAiMessage: 'Test message',
      };

      const context = ExecutionStateAdapter.fromLegacy(original);
      const converted = ExecutionStateAdapter.toLegacy(context);

      // 验证关键字段
      expect(converted.status).toBe(original.status);
      expect(converted.currentPhaseIdx).toBe(original.currentPhaseIdx);
      expect(converted.currentTopicIdx).toBe(original.currentTopicIdx);
      expect(converted.currentActionIdx).toBe(original.currentActionIdx);
      expect(converted.currentPhaseId).toBe(original.currentPhaseId);
      expect(converted.currentTopicId).toBe(original.currentTopicId);
      expect(converted.currentActionId).toBe(original.currentActionId);
      expect(converted.currentActionType).toBe(original.currentActionType);
      expect(converted.lastAiMessage).toBe(original.lastAiMessage);
      expect(converted.variables).toEqual(original.variables);
      expect(converted.metadata.projectId).toBe(original.metadata.projectId);
    });

    it('Context → Legacy → Context 应该保持一致', () => {
      const original: ExecutionContext = {
        status: ExecutionStatus.COMPLETED,
        position: {
          phaseIndex: 5,
          topicIndex: 3,
          actionIndex: 2,
          phaseId: 'final-phase',
          topicId: 'final-topic',
        },
        runtime: {
          currentAction: null,
          lastAiMessage: 'Goodbye',
        },
        variableStore: {
          global: {},
          session: { completed: true } as any,
          phase: {},
          topic: {},
        },
        conversationHistory: [],
        metadata: {
          projectId: 'test',
        },
      };

      const legacy = ExecutionStateAdapter.toLegacy(original);
      const converted = ExecutionStateAdapter.fromLegacy(legacy);

      expect(converted.status).toBe(original.status);
      expect(converted.position.phaseIndex).toBe(original.position.phaseIndex);
      expect(converted.position.topicIndex).toBe(original.position.topicIndex);
      expect(converted.position.actionIndex).toBe(original.position.actionIndex);
      expect(converted.position.phaseId).toBe(original.position.phaseId);
      expect(converted.runtime.lastAiMessage).toBe(original.runtime.lastAiMessage);
      expect(converted.variableStore.session).toEqual(original.variableStore.session);
      expect(converted.metadata.projectId).toBe(original.metadata.projectId);
    });

    it('validate()方法应该正确验证等价性', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);

      expect(ExecutionStateAdapter.validate(legacy, context)).toBe(true);
    });

    it('validate()方法应该检测不一致', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 1,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);
      context.position.phaseIndex = 2; // 修改为不一致

      expect(ExecutionStateAdapter.validate(legacy, context)).toBe(false);
    });
  });

  describe('5. 边界情况测试', () => {
    it('应该处理空的conversationHistory', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);
      expect(context.conversationHistory).toEqual([]);

      const converted = ExecutionStateAdapter.toLegacy(context);
      expect(converted.conversationHistory).toEqual([]);
    });

    it('应该处理undefined的可选字段', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {},
        lastAiMessage: null,
        // 可选字段全部undefined
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);

      expect(context.position.phaseId).toBeUndefined();
      expect(context.position.topicId).toBeUndefined();
      expect(context.position.actionId).toBeUndefined();
      expect(context.runtime.lastLLMDebugInfo).toBeUndefined();
    });

    it('应该处理复杂的嵌套metadata', () => {
      const legacy: LegacyExecutionState = {
        status: ExecutionStatus.RUNNING,
        currentPhaseIdx: 0,
        currentTopicIdx: 0,
        currentActionIdx: 0,
        currentAction: null,
        variables: {},
        conversationHistory: [],
        metadata: {
          level1: {
            level2: {
              level3: 'deep value',
            },
          },
          array: [1, 2, 3],
          mixed: {
            str: 'text',
            num: 42,
            bool: true,
            arr: ['a', 'b'],
          },
        },
        lastAiMessage: null,
      };

      const context = ExecutionStateAdapter.fromLegacy(legacy);
      const converted = ExecutionStateAdapter.toLegacy(context);

      expect(converted.metadata.level1).toEqual(legacy.metadata.level1);
      expect(converted.metadata.array).toEqual(legacy.metadata.array);
      expect(converted.metadata.mixed).toEqual(legacy.metadata.mixed);
    });
  });

  describe('6. 性能测试', () => {
    it('大量转换应该在合理时间内完成', () => {
      const legacy = ExecutionStateAdapter.createEmptyLegacy();
      const iterations = 10000;

      const startTime = Date.now();
      for (let i = 0; i < iterations; i++) {
        const context = ExecutionStateAdapter.fromLegacy(legacy);
        ExecutionStateAdapter.toLegacy(context);
      }
      const endTime = Date.now();

      const duration = endTime - startTime;
      const avgTime = duration / iterations;

      console.log(`10000次往返转换耗时: ${duration}ms, 平均: ${avgTime.toFixed(3)}ms/次`);

      // 期望平均每次转换不超过1ms
      expect(avgTime).toBeLessThan(1);
    });
  });

  describe('7. 工厂方法测试', () => {
    it('createEmpty()应该创建正确的初始Context', () => {
      const context = ExecutionStateAdapter.createEmpty();

      expect(context.status).toBe(ExecutionStatus.RUNNING);
      expect(context.position).toEqual({
        phaseIndex: 0,
        topicIndex: 0,
        actionIndex: 0,
      });
      expect(context.runtime).toEqual({
        currentAction: null,
        lastAiMessage: null,
      });
      expect(context.variableStore).toEqual({
        global: {},
        session: {},
        phase: {},
        topic: {},
      });
      expect(context.conversationHistory).toEqual([]);
      expect(context.metadata).toEqual({});
    });

    it('createEmptyLegacy()应该创建正确的初始Legacy', () => {
      const legacy = ExecutionStateAdapter.createEmptyLegacy();

      expect(legacy.status).toBe(ExecutionStatus.RUNNING);
      expect(legacy.currentPhaseIdx).toBe(0);
      expect(legacy.currentTopicIdx).toBe(0);
      expect(legacy.currentActionIdx).toBe(0);
      expect(legacy.currentAction).toBeNull();
      expect(legacy.variables).toEqual({});
      expect(legacy.variableStore).toEqual({
        global: {},
        session: {},
        phase: {},
        topic: {},
      });
      expect(legacy.conversationHistory).toEqual([]);
      expect(legacy.metadata).toEqual({});
      expect(legacy.lastAiMessage).toBeNull();
    });
  });
});
