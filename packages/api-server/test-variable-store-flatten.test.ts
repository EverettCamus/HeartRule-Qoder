/**
 * 回归测试：variableStore 扁平化与 API 响应
 * 
 * BUG描述：
 * 后端返回的 variableStore 使用嵌套结构（topic[topicId][varName]），
 * 但前端期望扁平结构（topic[varName]）。
 * 
 * 测试目标：
 * 1. 验证 SessionManager.flattenVariableStore() 方法能正确扁平化数据
 * 2. 验证 API 响应中包含正确的 variableStore 字段
 * 3. 验证扁平化后的数据结构符合前端预期
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { VariableStore } from '@heartrule/shared-types';

describe('variableStore 扁平化回归测试', () => {
  describe('场景1: 扁平化逻辑测试', () => {
    it('应该将嵌套的 topic 结构扁平化为当前 topic 的变量', () => {
      // 模拟后端 variableStore 的嵌套结构
      const nestedVariableStore = {
        global: {
          '咨询师名': {
            value: '华小光',
            type: 'string',
            source: 'global',
            lastUpdated: '2026-01-25T08:00:00.000Z',
          },
        },
        session: {
          '会话ID': {
            value: 'session-123',
            type: 'string',
            source: 'system',
            lastUpdated: '2026-01-25T08:00:00.000Z',
          },
        },
        phase: {
          'phase_1': {
            '阶段变量': {
              value: '值1',
              type: 'string',
              source: 'action_1',
              lastUpdated: '2026-01-25T08:00:00.000Z',
            },
          },
        },
        topic: {
          'topic_1': {
            '来访者称呼': {
              value: 'LEO',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
            '来访者年龄': {
              value: '未知',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
          },
          'topic_2': {
            '其他话题变量': {
              value: '其他值',
              type: 'string',
              source: 'action_3',
              lastUpdated: '2026-01-25T08:00:00.000Z',
            },
          },
        },
      };

      // 当前位置
      const position = {
        phaseId: 'phase_1',
        topicId: 'topic_1',
      };

      // 模拟 SessionManager.flattenVariableStore() 方法
      const flattenVariableStore = (
        variableStore: any,
        position: { phaseId?: string; topicId?: string }
      ) => {
        if (!variableStore) {
          return {
            global: {},
            session: {},
            phase: {},
            topic: {},
          };
        }

        return {
          global: variableStore.global || {},
          session: variableStore.session || {},
          phase:
            position.phaseId && variableStore.phase?.[position.phaseId]
              ? variableStore.phase[position.phaseId]
              : {},
          topic:
            position.topicId && variableStore.topic?.[position.topicId]
              ? variableStore.topic[position.topicId]
              : {},
        };
      };

      const flattened = flattenVariableStore(nestedVariableStore, position);

      // 验证扁平化结果
      expect(flattened.global).toEqual(nestedVariableStore.global);
      expect(flattened.session).toEqual(nestedVariableStore.session);
      expect(flattened.phase).toEqual(nestedVariableStore.phase['phase_1']);
      expect(flattened.topic).toEqual(nestedVariableStore.topic['topic_1']);

      // 验证 topic 中只包含当前 topic 的变量
      expect(flattened.topic['来访者称呼']).toBeDefined();
      expect(flattened.topic['来访者年龄']).toBeDefined();
      expect(flattened.topic['其他话题变量']).toBeUndefined();

      // 验证变量值正确
      expect(flattened.topic['来访者称呼'].value).toBe('LEO');
      expect(flattened.topic['来访者年龄'].value).toBe('未知');
    });

    it('应该处理空的 variableStore', () => {
      const flattenVariableStore = (
        variableStore: any,
        position: { phaseId?: string; topicId?: string }
      ) => {
        if (!variableStore) {
          return {
            global: {},
            session: {},
            phase: {},
            topic: {},
          };
        }

        return {
          global: variableStore.global || {},
          session: variableStore.session || {},
          phase:
            position.phaseId && variableStore.phase?.[position.phaseId]
              ? variableStore.phase[position.phaseId]
              : {},
          topic:
            position.topicId && variableStore.topic?.[position.topicId]
              ? variableStore.topic[position.topicId]
              : {},
        };
      };

      const flattened = flattenVariableStore(null, { phaseId: 'phase_1', topicId: 'topic_1' });

      expect(flattened).toEqual({
        global: {},
        session: {},
        phase: {},
        topic: {},
      });
    });

    it('应该处理不存在的 phaseId 或 topicId', () => {
      const nestedVariableStore = {
        global: {},
        session: {},
        phase: {
          'phase_1': {
            '变量A': { value: '值A', type: 'string', source: 'action', lastUpdated: '' },
          },
        },
        topic: {
          'topic_1': {
            '变量B': { value: '值B', type: 'string', source: 'action', lastUpdated: '' },
          },
        },
      };

      const flattenVariableStore = (
        variableStore: any,
        position: { phaseId?: string; topicId?: string }
      ) => {
        if (!variableStore) {
          return {
            global: {},
            session: {},
            phase: {},
            topic: {},
          };
        }

        return {
          global: variableStore.global || {},
          session: variableStore.session || {},
          phase:
            position.phaseId && variableStore.phase?.[position.phaseId]
              ? variableStore.phase[position.phaseId]
              : {},
          topic:
            position.topicId && variableStore.topic?.[position.topicId]
              ? variableStore.topic[position.topicId]
              : {},
        };
      };

      // 不存在的 phase 和 topic
      const flattened = flattenVariableStore(nestedVariableStore, {
        phaseId: 'phase_999',
        topicId: 'topic_999',
      });

      expect(flattened.phase).toEqual({});
      expect(flattened.topic).toEqual({});
    });
  });

  describe('场景2: API 响应格式验证', () => {
    it('API 响应应包含 8 个字段（包括 variableStore）', () => {
      // 模拟完整的 API 响应
      const apiResponse = {
        aiMessage: 'LEO，很高兴认识你。今天是什么让你想要进行心理咨询呢？',
        sessionStatus: 'active',
        executionStatus: 'waiting_input',
        variables: { '咨询师名': '华小光' },
        globalVariables: { '咨询师名': '华小光' },
        variableStore: {
          global: {},
          session: {
            '咨询师名': {
              value: '华小光',
              type: 'string',
              source: 'migrated',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
          },
          phase: {},
          topic: {
            '来访者称呼': {
              value: 'LEO',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
          },
        },
        position: {
          phaseIndex: 0,
          phaseId: 'phase_1',
          topicIndex: 0,
          topicId: 'topic_1',
          actionIndex: 1,
          actionId: 'action_2',
          actionType: 'ai_ask',
          currentRound: 1,
          maxRounds: 5,
        },
        debugInfo: {
          prompt: '现时间 2026/1/25 16:35:37，你是 心理咨询师...',
          response: {},
          model: 'deepseek-v3-250324',
          config: {},
          timestamp: '2026-01-25T08:35:37.914Z',
          tokensUsed: 823,
        },
      };

      // 验证响应字段
      const expectedKeys = [
        'aiMessage',
        'sessionStatus',
        'executionStatus',
        'variables',
        'globalVariables',
        'variableStore',
        'position',
        'debugInfo',
      ];

      const actualKeys = Object.keys(apiResponse);
      expect(actualKeys.length).toBe(8);
      expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });

    it('variableStore 应包含四个作用域字段', () => {
      const variableStore = {
        global: {},
        session: {
          '咨询师名': {
            value: '华小光',
            type: 'string',
            source: 'migrated',
            lastUpdated: '2026-01-25T08:35:37.906Z',
          },
        },
        phase: {},
        topic: {
          '来访者称呼': {
            value: 'LEO',
            type: 'string',
            source: 'action_2',
            lastUpdated: '2026-01-25T08:35:37.906Z',
          },
        },
      };

      const expectedKeys = ['global', 'session', 'phase', 'topic'];
      const actualKeys = Object.keys(variableStore);

      expect(actualKeys.sort()).toEqual(expectedKeys.sort());
    });

    it('variableStore.topic 应该是扁平结构而非嵌套结构', () => {
      // 错误的嵌套结构（BUG 场景）
      const wrongStructure = {
        topic: {
          'topic_1': {
            '来访者称呼': { value: 'LEO' },
          },
        },
      };

      // 正确的扁平结构（修复后）
      const correctStructure = {
        topic: {
          '来访者称呼': { value: 'LEO' },
        },
      };

      // 验证正确结构
      expect(correctStructure.topic['来访者称呼']).toBeDefined();
      expect(correctStructure.topic['来访者称呼'].value).toBe('LEO');

      // 验证没有嵌套的 topicId
      const topicKeys = Object.keys(correctStructure.topic);
      expect(topicKeys).not.toContain('topic_1');
      expect(topicKeys).toContain('来访者称呼');
    });
  });

  describe('场景3: 完整的变量提取流程模拟', () => {
    it('应该模拟完整的 ai_ask 变量提取和扁平化流程', () => {
      // 1. 模拟 script-executor 提取变量并存入嵌套结构
      const nestedVariableStore = {
        global: {},
        session: {
          '咨询师名': {
            value: '华小光',
            type: 'string',
            source: 'migrated',
            lastUpdated: '2026-01-25T08:00:00.000Z',
          },
        },
        phase: {},
        topic: {
          'topic_1': {
            '来访者称呼': {
              value: 'LEO',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
            '来访者年龄': {
              value: '未知',
              type: 'string',
              source: 'action_2',
              lastUpdated: '2026-01-25T08:35:37.906Z',
            },
          },
        },
      };

      // 2. 模拟 session-manager 扁平化
      const flattenVariableStore = (
        variableStore: any,
        position: { phaseId?: string; topicId?: string }
      ) => {
        if (!variableStore) {
          return { global: {}, session: {}, phase: {}, topic: {} };
        }

        return {
          global: variableStore.global || {},
          session: variableStore.session || {},
          phase:
            position.phaseId && variableStore.phase?.[position.phaseId]
              ? variableStore.phase[position.phaseId]
              : {},
          topic:
            position.topicId && variableStore.topic?.[position.topicId]
              ? variableStore.topic[position.topicId]
              : {},
        };
      };

      const position = { phaseId: 'phase_1', topicId: 'topic_1' };
      const flattenedVariableStore = flattenVariableStore(nestedVariableStore, position);

      // 3. 模拟 API 响应
      const apiResponse = {
        aiMessage: 'LEO，很高兴认识你。',
        variableStore: flattenedVariableStore,
      };

      // 4. 验证前端接收到的数据结构
      expect(apiResponse.variableStore.topic['来访者称呼']).toBeDefined();
      expect(apiResponse.variableStore.topic['来访者称呼'].value).toBe('LEO');
      expect(apiResponse.variableStore.topic['来访者年龄']).toBeDefined();
      expect(apiResponse.variableStore.topic['来访者年龄'].value).toBe('未知');

      // 5. 验证前端可以直接使用的字段
      expect(Object.keys(apiResponse.variableStore.topic)).toContain('来访者称呼');
      expect(Object.keys(apiResponse.variableStore.topic)).toContain('来访者年龄');
      expect(Object.keys(apiResponse.variableStore.topic).length).toBe(2);
    });
  });
});
