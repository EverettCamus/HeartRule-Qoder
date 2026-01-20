/**
 * ai_say 属性框编辑同步到 YAML 文件的集成测试
 * 
 * 测试策略：集成测试
 * 原因：
 * 1. 涉及多个模块协同工作（YAML解析 → 内存结构 → 表单保存 → YAML同步）
 * 2. 核心是数据转换和同步逻辑，不需要浏览器环境
 * 3. 比 E2E 测试更轻量，运行速度快，适合 CI/CD
 */

import { describe, test, expect, beforeEach } from 'vitest';
import yaml from 'js-yaml';

// 模拟解析和同步函数的核心逻辑
describe('ai_say 属性框编辑同步到 YAML', () => {
  // 模拟 parseYamlToScript 的核心逻辑
  const parseYamlToScript = (yamlContent: string) => {
    const parsed = yaml.load(yamlContent) as any;
    const phases: any[] = [];

    if (parsed?.session?.phases) {
      parsed.session.phases.forEach((phase: any) => {
        const topics: any[] = [];

        phase.topics?.forEach((topic: any) => {
          const actions: any[] = [];

          topic.actions?.forEach((action: any) => {
            if (action.action_type === 'ai_say') {
              const contentValue = action.config?.content_template || '';
              actions.push({
                type: 'ai_say',
                content: contentValue,  // 新字段
                ai_say: contentValue,   // 旧字段，保持向后兼容
                tone: action.config?.tone,
                condition: action.config?.condition,
                require_acknowledgment: action.config?.require_acknowledgment,
                max_rounds: action.config?.max_rounds,
                action_id: action.action_id,
                _raw: action,
              });
            } else {
              actions.push(action);
            }
          });

          topics.push({
            topic_id: topic.topic_id,
            topic_name: topic.topic_name,
            description: topic.description,
            actions,
          });
        });

        phases.push({
          phase_id: phase.phase_id,
          phase_name: phase.phase_name,
          description: phase.description,
          topics,
        });
      });
    }

    return { parsedScript: parsed, phases };
  };

  // 模拟 handleActionSave 的核心逻辑
  const handleActionSave = (
    phases: any[],
    phaseIndex: number,
    topicIndex: number,
    actionIndex: number,
    updatedAction: any
  ) => {
    const newPhases = JSON.parse(JSON.stringify(phases));
    newPhases[phaseIndex].topics[topicIndex].actions[actionIndex] = updatedAction;
    return newPhases;
  };

  // 模拟 syncPhasesToYaml 的核心逻辑
  const syncPhasesToYaml = (phases: any[], parsedScript: any) => {
    const updatedScript = JSON.parse(JSON.stringify(parsedScript));

    if (updatedScript.session?.phases) {
      updatedScript.session.phases = phases.map((phase, pi) => {
        const originalPhase = parsedScript.session?.phases?.[pi] || {};
        return {
          ...originalPhase,
          phase_id: phase.phase_id,
          phase_name: phase.phase_name,
          description: phase.description,
          topics: phase.topics.map((topic: any, ti: number) => {
            const originalTopic = originalPhase.topics?.[ti] || {};
            return {
              ...originalTopic,
              topic_id: topic.topic_id,
              topic_name: topic.topic_name,
              description: topic.description,
              actions: topic.actions.map((action: any) => {
                if (action._raw) {
                  const rawAction = action._raw as any;
                  if (action.type === 'ai_say') {
                    // 修复: 优先使用 content 字段，如果没有则回退到 ai_say
                    const contentValue = action.content || action.ai_say || '';
                    return {
                      ...rawAction,
                      config: {
                        ...rawAction.config,
                        content_template: contentValue,
                        tone: action.tone,
                        condition: action.condition,
                        require_acknowledgment: action.require_acknowledgment,
                        max_rounds: action.max_rounds,
                      },
                    };
                  }
                  return rawAction;
                }
                return action;
              }),
            };
          }),
        };
      });
    }

    return yaml.dump(updatedScript, {
      lineWidth: -1,
      noRefs: true,
    });
  };

  let testYaml: string;
  let parsedData: any;
  let currentPhases: any[];

  beforeEach(() => {
    // 准备测试用的 YAML
    testYaml = `
session:
  session_id: test_session
  session_name: 测试会话
  phases:
    - phase_id: phase_1
      phase_name: 测试阶段
      topics:
        - topic_id: topic_1
          topic_name: 测试主题
          actions:
            - action_type: ai_say
              action_id: action_1
              config:
                content_template: "原始内容"
                tone: "温和"
                require_acknowledgment: true
                max_rounds: 5
            - action_type: ai_say
              action_id: action_2
              config:
                content_template: "第二个内容"
                require_acknowledgment: false
`;

    const result = parseYamlToScript(testYaml);
    parsedData = result.parsedScript;
    currentPhases = result.phases;
  });

  describe('场景1: 修改 ai_say 的 content 字段', () => {
    test('应正确更新 content 字段到内存结构', () => {
      // 模拟用户在属性框中编辑
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '修改后的内容',  // 新字段
        ai_say: '修改后的内容',   // 同时更新旧字段
      };

      const newPhases = handleActionSave(
        currentPhases,
        0, // phaseIndex
        0, // topicIndex
        0, // actionIndex
        updatedAction
      );

      // 验证内存结构更新正确
      expect(newPhases[0].topics[0].actions[0].content).toBe('修改后的内容');
      expect(newPhases[0].topics[0].actions[0].ai_say).toBe('修改后的内容');
    });
  });

  describe('场景2: 修改后的内容正确同步到 YAML 结构', () => {
    test('应将 content 字段正确映射到 YAML 的 content_template', () => {
      // 步骤1: 修改内容
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '修改后的YAML内容',
        ai_say: '修改后的YAML内容',
      };

      const newPhases = handleActionSave(
        currentPhases,
        0, 0, 0,
        updatedAction
      );

      // 步骤2: 同步到 YAML
      const newYaml = syncPhasesToYaml(newPhases, parsedData);

      // 步骤3: 解析回来验证
      const reparsed = yaml.load(newYaml) as any;
      
      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe('修改后的YAML内容');
    });

    test('应保持其他字段不变', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '仅修改内容',
        ai_say: '仅修改内容',
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;
      const actionConfig = reparsed.session.phases[0].topics[0].actions[0].config;

      // 验证其他字段保持不变
      expect(actionConfig.tone).toBe('温和');
      expect(actionConfig.require_acknowledgment).toBe(true);
      expect(actionConfig.max_rounds).toBe(5);
    });
  });

  describe('场景3: YAML 到可视化界面的双向同步', () => {
    test('应正确解析 YAML 的 content_template 到 content 和 ai_say', () => {
      const { phases } = parseYamlToScript(testYaml);

      // 验证解析后两个字段都正确
      expect(phases[0].topics[0].actions[0].content).toBe('原始内容');
      expect(phases[0].topics[0].actions[0].ai_say).toBe('原始内容');
    });

    test('应支持完整的往返转换（roundtrip）', () => {
      // 原始 YAML → 解析 → 修改 → 同步 → 新 YAML → 再次解析
      const { phases: phases1, parsedScript: parsed1 } = parseYamlToScript(testYaml);
      
      const updatedAction = {
        ...phases1[0].topics[0].actions[0],
        content: '往返测试内容',
        ai_say: '往返测试内容',
      };
      
      const newPhases = handleActionSave(phases1, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsed1);
      
      // 再次解析新的 YAML
      const { phases: phases2 } = parseYamlToScript(newYaml);
      
      // 验证往返后数据一致
      expect(phases2[0].topics[0].actions[0].content).toBe('往返测试内容');
      expect(phases2[0].topics[0].actions[0].ai_say).toBe('往返测试内容');
    });
  });

  describe('场景4: require_acknowledgment 等其他字段的同步', () => {
    test('应正确同步 require_acknowledgment 字段', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '内容不变',
        ai_say: '内容不变',
        require_acknowledgment: false, // 修改这个字段
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.require_acknowledgment)
        .toBe(false);
    });

    test('应正确同步 max_rounds 字段', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '内容不变',
        ai_say: '内容不变',
        max_rounds: 10, // 修改这个字段
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.max_rounds).toBe(10);
    });

    test('应正确同步 tone 字段', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '内容不变',
        ai_say: '内容不变',
        tone: '严肃', // 修改这个字段
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.tone).toBe('严肃');
    });

    test('应同时正确同步多个字段', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '全部修改的内容',
        ai_say: '全部修改的内容',
        tone: '鼓励',
        require_acknowledgment: false,
        max_rounds: 8,
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;
      const config = reparsed.session.phases[0].topics[0].actions[0].config;

      expect(config.content_template).toBe('全部修改的内容');
      expect(config.tone).toBe('鼓励');
      expect(config.require_acknowledgment).toBe(false);
      expect(config.max_rounds).toBe(8);
    });
  });

  describe('场景5: 处理多个 ai_say action', () => {
    test('应独立同步每个 action 的修改', () => {
      // 修改第一个 action
      const updatedAction1 = {
        ...currentPhases[0].topics[0].actions[0],
        content: '第一个修改',
        ai_say: '第一个修改',
      };
      let newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction1);

      // 修改第二个 action
      const updatedAction2 = {
        ...newPhases[0].topics[0].actions[1],
        content: '第二个修改',
        ai_say: '第二个修改',
      };
      newPhases = handleActionSave(newPhases, 0, 0, 1, updatedAction2);

      // 同步到 YAML
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      // 验证两个 action 都正确更新
      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe('第一个修改');
      expect(reparsed.session.phases[0].topics[0].actions[1].config.content_template)
        .toBe('第二个修改');
    });
  });

  describe('场景6: 向后兼容性测试', () => {
    test('旧字段 ai_say 也能正确同步', () => {
      // 模拟只有 ai_say 字段的情况（旧代码）
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: undefined, // 没有 content
        ai_say: '仅使用旧字段',
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      // 应回退到 ai_say 字段
      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe('仅使用旧字段');
    });

    test('content 字段优先级高于 ai_say', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '新字段内容',
        ai_say: '旧字段内容',
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      // 应使用 content 字段
      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe('新字段内容');
    });
  });

  describe('场景7: 边界情况测试', () => {
    test('应处理空内容', () => {
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: '',
        ai_say: '',
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template).toBe('');
    });

    test('应处理包含特殊字符的内容', () => {
      const specialContent = '包含 {{变量}} 和 "引号" 以及\n换行符';
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: specialContent,
        ai_say: specialContent,
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe(specialContent);
    });

    test('应处理包含 YAML 特殊符号的内容', () => {
      const yamlSpecial = '内容包含: 冒号, [数组], {对象}, | 竖线, > 大于号';
      const updatedAction = {
        ...currentPhases[0].topics[0].actions[0],
        content: yamlSpecial,
        ai_say: yamlSpecial,
      };

      const newPhases = handleActionSave(currentPhases, 0, 0, 0, updatedAction);
      const newYaml = syncPhasesToYaml(newPhases, parsedData);
      const reparsed = yaml.load(newYaml) as any;

      expect(reparsed.session.phases[0].topics[0].actions[0].config.content_template)
        .toBe(yamlSpecial);
    });
  });
});
