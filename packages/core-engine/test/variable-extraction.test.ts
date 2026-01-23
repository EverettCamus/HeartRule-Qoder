/**
 * 测试 ai_ask 的 output 变量提取和作用域存储功能
 *
 * 测试覆盖：
 * 1. 从 LLM JSON 响应中提取变量
 * 2. 变量存储到正确的作用域（topic/phase/session/global）
 * 3. 同名变量的优先级规则（topic > phase > session > global）
 * 4. 未 declare 的变量默认存入 topic
 */

import { VariableScope } from '@heartrule/shared-types';
import type { VariableStore, VariableDefinition, Position } from '@heartrule/shared-types';
import { describe, it, expect, beforeEach } from 'vitest';

import { VariableScopeResolver } from '../src/engines/variable-scope/variable-scope-resolver.js';

describe('变量提取与作用域存储', () => {
  let variableStore: VariableStore;
  let position: Position;

  beforeEach(() => {
    // 初始化变量存储结构
    variableStore = {
      global: {},
      session: {},
      phase: {},
      topic: {},
    };

    // 初始化执行位置
    position = {
      phaseId: 'phase_1',
      topicId: 'topic_1_1',
      actionId: 'action_ask_1',
    };
  });

  describe('1. 变量提取逻辑测试', () => {
    it('应该从 JSON 中提取单个变量', () => {
      const llmOutput: Record<string, any> = {
        用户名: 'LEO',
        咨询师: '继续询问用户的年龄和职业',
        EXIT: 'false',
        BRIEF: '用户自称LEO',
      };

      const outputConfig = [{ get: '用户名', define: '用户的姓名或昵称' }];

      const extractedVariables: Record<string, any> = {};

      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        if (
          (llmOutput as any)[varName] !== undefined &&
          (llmOutput as any)[varName] !== null &&
          (llmOutput as any)[varName] !== ''
        ) {
          extractedVariables[varName] = (llmOutput as any)[varName];
        }
      }

      expect(extractedVariables).toEqual({
        用户名: 'LEO',
      });
    });

    it('应该从 JSON 中提取多个变量', () => {
      const llmOutput: Record<string, any> = {
        用户名: 'LEO',
        用户年龄: 28,
        用户职业: '程序员',
        咨询师: '继续询问',
        EXIT: 'false',
        BRIEF: '收集了用户基本信息',
      };

      const outputConfig = [
        { get: '用户名', define: '用户的姓名' },
        { get: '用户年龄', define: '用户的年龄' },
        { get: '用户职业', define: '用户的职业' },
      ];

      const extractedVariables: Record<string, any> = {};

      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        if (
          (llmOutput as any)[varName] !== undefined &&
          (llmOutput as any)[varName] !== null &&
          (llmOutput as any)[varName] !== ''
        ) {
          extractedVariables[varName] = (llmOutput as any)[varName];
        }
      }

      expect(extractedVariables).toEqual({
        用户名: 'LEO',
        用户年龄: 28,
        用户职业: '程序员',
      });
    });

    it('应该跳过空值、null 和 undefined', () => {
      const llmOutput: Record<string, any> = {
        用户名: 'LEO',
        用户年龄: '', // 空字符串
        用户职业: null, // null
        // '用户地址' 未定义    // undefined
        咨询师: '继续询问',
        EXIT: 'false',
      };

      const outputConfig = [
        { get: '用户名' },
        { get: '用户年龄' },
        { get: '用户职业' },
        { get: '用户地址' },
      ];

      const extractedVariables: Record<string, any> = {};

      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        if (
          (llmOutput as any)[varName] !== undefined &&
          (llmOutput as any)[varName] !== null &&
          (llmOutput as any)[varName] !== ''
        ) {
          extractedVariables[varName] = (llmOutput as any)[varName];
        }
      }

      // 只提取了有效值
      expect(extractedVariables).toEqual({
        用户名: 'LEO',
      });
      expect(Object.keys(extractedVariables).length).toBe(1);
    });

    it('应该保留数字 0 和布尔值 false', () => {
      const llmOutput: Record<string, any> = {
        抑郁评分: 0,
        是否需要转介: false,
        咨询师: '评分正常',
        EXIT: 'true',
      };

      const outputConfig = [{ get: '抑郁评分' }, { get: '是否需要转介' }];

      const extractedVariables: Record<string, any> = {};

      for (const varConfig of outputConfig) {
        const varName = varConfig.get;
        if (!varName) continue;

        // 特别注意：0 和 false 是有效值
        if (
          (llmOutput as any)[varName] !== undefined &&
          (llmOutput as any)[varName] !== null &&
          (llmOutput as any)[varName] !== ''
        ) {
          extractedVariables[varName] = (llmOutput as any)[varName];
        }
      }

      expect(extractedVariables).toEqual({
        抑郁评分: 0,
        是否需要转介: false,
      });
    });
  });

  describe('2. 变量作用域存储测试', () => {
    it('应该将未 declare 的变量默认存入 topic 作用域', () => {
      const resolver = new VariableScopeResolver(variableStore);

      // 确定作用域（没有 variableDefinitions）
      const scope = resolver.determineScope('用户名');
      expect(scope).toBe(VariableScope.TOPIC);

      // 写入变量
      resolver.setVariable('用户名', 'LEO', scope, position);

      // 验证存储位置
      expect(variableStore.topic['topic_1_1']).toBeDefined();
      expect(variableStore.topic['topic_1_1']['用户名']).toBeDefined();
      expect(variableStore.topic['topic_1_1']['用户名'].value).toBe('LEO');
      expect(variableStore.topic['topic_1_1']['用户名'].type).toBe('string');
      expect(variableStore.topic['topic_1_1']['用户名'].source).toBe('action_ask_1');

      // 验证其他作用域为空
      expect(Object.keys(variableStore.session).length).toBe(0);
      expect(Object.keys(variableStore.phase).length).toBe(0);
      expect(Object.keys(variableStore.global).length).toBe(0);
    });

    it('应该将 declare 在 session 的变量存入 session 作用域', () => {
      const variableDefinitions = new Map<string, VariableDefinition>();
      variableDefinitions.set('用户ID', {
        name: '用户ID',
        scope: VariableScope.SESSION,
        define: '用户的唯一标识',
      });

      const resolver = new VariableScopeResolver(variableStore, variableDefinitions);

      // 确定作用域（有 declare 定义）
      const scope = resolver.determineScope('用户ID');
      expect(scope).toBe(VariableScope.SESSION);

      // 写入变量
      resolver.setVariable('用户ID', 'user_12345', scope, position);

      // 验证存储位置
      expect(variableStore.session['用户ID']).toBeDefined();
      expect(variableStore.session['用户ID'].value).toBe('user_12345');

      // 验证其他作用域为空
      expect(Object.keys(variableStore.topic).length).toBe(0);
      expect(Object.keys(variableStore.phase).length).toBe(0);
      expect(Object.keys(variableStore.global).length).toBe(0);
    });

    it('应该将 declare 在 phase 的变量存入 phase 作用域', () => {
      const variableDefinitions = new Map<string, VariableDefinition>();
      variableDefinitions.set('主诉问题', {
        name: '主诉问题',
        scope: VariableScope.PHASE,
        define: '用户的主要心理困扰',
      });

      const resolver = new VariableScopeResolver(variableStore, variableDefinitions);

      const scope = resolver.determineScope('主诉问题');
      expect(scope).toBe(VariableScope.PHASE);

      resolver.setVariable('主诉问题', '焦虑', scope, position);

      // 验证存储位置
      expect(variableStore.phase['phase_1']).toBeDefined();
      expect(variableStore.phase['phase_1']['主诉问题']).toBeDefined();
      expect(variableStore.phase['phase_1']['主诉问题'].value).toBe('焦虑');
    });

    it('应该将 declare 在 global 的变量存入 global 作用域', () => {
      const variableDefinitions = new Map<string, VariableDefinition>();
      variableDefinitions.set('咨询师名', {
        name: '咨询师名',
        scope: VariableScope.GLOBAL,
        define: '咨询师的称呼',
        value: '小爱',
      });

      const resolver = new VariableScopeResolver(variableStore, variableDefinitions);

      const scope = resolver.determineScope('咨询师名');
      expect(scope).toBe(VariableScope.GLOBAL);

      resolver.setVariable('咨询师名', '小爱', scope, position);

      // 验证存储位置
      expect(variableStore.global['咨询师名']).toBeDefined();
      expect(variableStore.global['咨询师名'].value).toBe('小爱');
    });

    it('应该支持批量写入多个变量到不同作用域', () => {
      const variableDefinitions = new Map<string, VariableDefinition>();
      variableDefinitions.set('用户ID', {
        name: '用户ID',
        scope: VariableScope.SESSION,
      });
      variableDefinitions.set('主诉问题', {
        name: '主诉问题',
        scope: VariableScope.PHASE,
      });

      const resolver = new VariableScopeResolver(variableStore, variableDefinitions);

      const extractedVariables = {
        用户ID: 'user_001', // session
        主诉问题: '焦虑', // phase
        用户名: 'LEO', // topic (未 declare)
        用户年龄: 28, // topic (未 declare)
      };

      // 批量写入
      for (const [varName, varValue] of Object.entries(extractedVariables)) {
        const scope = resolver.determineScope(varName);
        resolver.setVariable(varName, varValue, scope, position);
      }

      // 验证 session
      expect(variableStore.session['用户ID']?.value).toBe('user_001');

      // 验证 phase
      expect(variableStore.phase['phase_1']?.['主诉问题']?.value).toBe('焦虑');

      // 验证 topic
      expect(variableStore.topic['topic_1_1']?.['用户名']?.value).toBe('LEO');
      expect(variableStore.topic['topic_1_1']?.['用户年龄']?.value).toBe(28);
    });
  });

  describe('3. 同名变量优先级规则测试', () => {
    it('应该按 topic > phase > session > global 顺序查找', () => {
      // 在所有作用域都创建同名变量
      variableStore.global['用户情绪'] = {
        value: '正常',
        type: 'string',
        source: 'global',
      };

      variableStore.session['用户情绪'] = {
        value: '一般',
        type: 'string',
        source: 'session',
      };

      variableStore.phase['phase_1'] = {
        用户情绪: {
          value: '紧张',
          type: 'string',
          source: 'phase',
        },
      };

      variableStore.topic['topic_1_1'] = {
        用户情绪: {
          value: '焦虑',
          type: 'string',
          source: 'topic',
        },
      };

      const resolver = new VariableScopeResolver(variableStore);

      // 查找变量（应返回 topic 的值）
      const result = resolver.resolveVariable('用户情绪', position);

      expect(result).not.toBeNull();
      expect(result?.value).toBe('焦虑'); // topic 优先级最高
      expect(result?.source).toBe('topic');
    });

    it('topic 不存在时应查找 phase', () => {
      variableStore.global['用户情绪'] = {
        value: '正常',
        type: 'string',
        source: 'global',
      };

      variableStore.session['用户情绪'] = {
        value: '一般',
        type: 'string',
        source: 'session',
      };

      variableStore.phase['phase_1'] = {
        用户情绪: {
          value: '紧张',
          type: 'string',
          source: 'phase',
        },
      };

      // topic 中没有这个变量

      const resolver = new VariableScopeResolver(variableStore);
      const result = resolver.resolveVariable('用户情绪', position);

      expect(result?.value).toBe('紧张'); // 返回 phase 的值
      expect(result?.source).toBe('phase');
    });

    it('topic 和 phase 都不存在时应查找 session', () => {
      variableStore.global['用户情绪'] = {
        value: '正常',
        type: 'string',
        source: 'global',
      };

      variableStore.session['用户情绪'] = {
        value: '一般',
        type: 'string',
        source: 'session',
      };

      // topic 和 phase 中都没有

      const resolver = new VariableScopeResolver(variableStore);
      const result = resolver.resolveVariable('用户情绪', position);

      expect(result?.value).toBe('一般'); // 返回 session 的值
      expect(result?.source).toBe('session');
    });

    it('只有 global 存在时应返回 global 的值', () => {
      variableStore.global['咨询师名'] = {
        value: '小爱',
        type: 'string',
        source: 'global',
      };

      const resolver = new VariableScopeResolver(variableStore);
      const result = resolver.resolveVariable('咨询师名', position);

      expect(result?.value).toBe('小爱');
      expect(result?.source).toBe('global');
    });

    it('所有作用域都不存在时应返回 null', () => {
      const resolver = new VariableScopeResolver(variableStore);
      const result = resolver.resolveVariable('不存在的变量', position);

      expect(result).toBeNull();
    });
  });

  describe('4. 变量元数据测试', () => {
    it('应该正确推断变量类型', () => {
      const resolver = new VariableScopeResolver(variableStore);

      resolver.setVariable('字符串变量', 'hello', VariableScope.TOPIC, position);
      resolver.setVariable('数字变量', 42, VariableScope.TOPIC, position);
      resolver.setVariable('布尔变量', true, VariableScope.TOPIC, position);
      resolver.setVariable('数组变量', [1, 2, 3], VariableScope.TOPIC, position);
      resolver.setVariable('对象变量', { key: 'value' }, VariableScope.TOPIC, position);
      resolver.setVariable('null变量', null, VariableScope.TOPIC, position);

      expect(variableStore.topic['topic_1_1']['字符串变量'].type).toBe('string');
      expect(variableStore.topic['topic_1_1']['数字变量'].type).toBe('number');
      expect(variableStore.topic['topic_1_1']['布尔变量'].type).toBe('boolean');
      expect(variableStore.topic['topic_1_1']['数组变量'].type).toBe('array');
      expect(variableStore.topic['topic_1_1']['对象变量'].type).toBe('object');
      expect(variableStore.topic['topic_1_1']['null变量'].type).toBe('null');
    });

    it('应该记录变量的来源和时间戳', () => {
      const resolver = new VariableScopeResolver(variableStore);

      const beforeTime = new Date().toISOString();
      resolver.setVariable('测试变量', 'test', VariableScope.TOPIC, position, 'test_action');
      const afterTime = new Date().toISOString();

      const variable = variableStore.topic['topic_1_1']['测试变量'];

      expect(variable.source).toBe('test_action');
      expect(variable.lastUpdated).toBeDefined();
      expect(variable.lastUpdated! >= beforeTime).toBe(true);
      expect(variable.lastUpdated! <= afterTime).toBe(true);
    });
  });

  describe('5. 边界情况测试', () => {
    it('应该拒绝在缺少 topicId 时写入 topic 作用域', () => {
      const resolver = new VariableScopeResolver(variableStore);
      const invalidPosition: Position = {
        phaseId: 'phase_1',
        // topicId 缺失
        actionId: 'action_1',
      };

      // 控制台会输出错误，但不会抛出异常
      resolver.setVariable('测试变量', 'test', VariableScope.TOPIC, invalidPosition);

      // 验证没有写入
      expect(Object.keys(variableStore.topic).length).toBe(0);
    });

    it('应该拒绝在缺少 phaseId 时写入 phase 作用域', () => {
      const resolver = new VariableScopeResolver(variableStore);
      const invalidPosition: Position = {
        // phaseId 缺失
        topicId: 'topic_1',
        actionId: 'action_1',
      };

      resolver.setVariable('测试变量', 'test', VariableScope.PHASE, invalidPosition);

      // 验证没有写入
      expect(Object.keys(variableStore.phase).length).toBe(0);
    });

    it('应该支持覆盖已存在的变量', () => {
      const resolver = new VariableScopeResolver(variableStore);

      // 第一次写入
      resolver.setVariable('用户名', 'LEO', VariableScope.TOPIC, position);
      expect(variableStore.topic['topic_1_1']['用户名'].value).toBe('LEO');

      // 第二次写入（覆盖）
      resolver.setVariable('用户名', 'Alice', VariableScope.TOPIC, position);
      expect(variableStore.topic['topic_1_1']['用户名'].value).toBe('Alice');

      // 验证只有一个变量
      expect(Object.keys(variableStore.topic['topic_1_1']).length).toBe(1);
    });

    it('应该支持在不同 topic 中存储同名变量', () => {
      const resolver = new VariableScopeResolver(variableStore);

      const position1: Position = {
        phaseId: 'phase_1',
        topicId: 'topic_1',
        actionId: 'action_1',
      };

      const position2: Position = {
        phaseId: 'phase_1',
        topicId: 'topic_2',
        actionId: 'action_2',
      };

      resolver.setVariable('临时变量', 'value1', VariableScope.TOPIC, position1);
      resolver.setVariable('临时变量', 'value2', VariableScope.TOPIC, position2);

      expect(variableStore.topic['topic_1']['临时变量'].value).toBe('value1');
      expect(variableStore.topic['topic_2']['临时变量'].value).toBe('value2');
    });
  });
});
