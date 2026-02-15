/**
 * Test Fixtures - 测试数据工厂
 *
 * 提供可复用的测试脚本模板和数据
 */

/**
 * 创建合法的Session脚本对象
 */
export function createValidSession() {
  return {
    session: {
      session_id: 'test_session',
      session_name: 'Test Session',
      phases: [
        {
          phase_id: 'phase_1',
          phase_name: 'Phase 1',
          topics: [
            {
              topic_id: 'topic_1',
              topic_name: 'Topic 1',
              actions: [
                {
                  action_type: 'ai_say',
                  action_id: 'action_1',
                  config: {
                    content: '欢迎来到心理咨询',
                    tone: '温暖',
                    max_rounds: 2,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

/**
 * 创建合法的Technique脚本对象
 */
export function createValidTechnique() {
  return {
    topic: {
      topic_id: 'socratic_questioning',
      topic_name: 'Socratic Questioning',
      actions: [
        {
          action_type: 'ai_ask',
          action_id: 'action_1',
          config: {
            content: '请分享您的想法',
            max_rounds: 3,
          },
        },
      ],
    },
  };
}

/**
 * 创建合法的Action对象
 */
export function createValidAction(actionType: string = 'ai_ask') {
  const configs: Record<string, any> = {
    ai_ask: {
      content: '请问您的名字是？',
      tone: '友好',
      output: [{ get: 'user_name', define: '用户姓名' }],
      max_rounds: 3,
    },
    ai_say: {
      content: '欢迎您参加咨询',
      tone: '温暖',
      max_rounds: 2,
    },
    ai_think: {
      content: '分析用户情绪',
      output: [{ get: 'emotion', define: '情绪状态' }],
    },
    use_skill: {
      skill: 'socratic_questioning',
      input: [{ get: 'user_thought' }],
      output: [{ get: 'insight', define: '认知洞察' }],
    },
  };

  return {
    action_type: actionType,
    action_id: 'action_1',
    config: configs[actionType] || configs['ai_ask'],
  };
}

/**
 * 创建缺少指定字段的Session
 */
export function createSessionWithMissingField(fieldToRemove: string) {
  const session = createValidSession();
  const sessionObj = session.session as any;

  if (fieldToRemove === 'session_id') {
    delete sessionObj.session_id;
  } else if (fieldToRemove === 'phases') {
    delete sessionObj.phases;
  } else if (fieldToRemove === 'action_type') {
    delete sessionObj.phases[0].topics[0].actions[0].action_type;
  } else if (fieldToRemove === 'action_id') {
    delete sessionObj.phases[0].topics[0].actions[0].action_id;
  } else if (fieldToRemove === 'config') {
    delete sessionObj.phases[0].topics[0].actions[0].config;
  } else if (fieldToRemove === 'content') {
    delete sessionObj.phases[0].topics[0].actions[0].config.content;
  }

  return session;
}

/**
 * 创建包含废弃字段的Action
 */
export function createActionWithDeprecatedField(actionType: string, deprecatedField: string) {
  const action = createValidAction(actionType);
  const config = action.config as any;

  // 添加废弃字段
  const deprecatedValues: Record<string, any> = {
    content_template: '模板内容',
    question_template: '提问模板',
    target_variable: 'user_name',
    extraction_prompt: '提取用户称呼',
    required: false,
    prompt_template: '思考模板',
  };

  config[deprecatedField] = deprecatedValues[deprecatedField];

  return action;
}

/**
 * 创建无效的YAML字符串
 */
export function createInvalidYAML(): string {
  return `
session:
  session_id: test
  phases:
    - phase_id: phase1
      topics:
        - topic_id: topic1
          actions:
            - action_type: ai_say
              config:
                content: "未闭合的引号
  `;
}

/**
 * 创建包含非法枚举值的Action
 */
export function createActionWithInvalidEnum() {
  const action = createValidAction('ai_ask');
  action.action_type = 'invalid_type' as any;
  return action;
}

/**
 * 创建max_rounds超出范围的Action
 */
export function createActionWithOutOfRangeValue() {
  const action = createValidAction('ai_ask');
  action.config.max_rounds = 15; // 超过最大值10
  return action;
}

/**
 * 创建无法识别类型的脚本
 */
export function createUnrecognizedScript() {
  return {
    unknown_field: 'value',
    data: {
      id: 'test',
    },
  };
}

/**
 * 创建合法的Session YAML字符串
 */
export function createValidSessionYAML(): string {
  return `
session:
  session_id: test_session
  session_name: Test Session
  phases:
    - phase_id: phase_1
      phase_name: Phase 1
      topics:
        - topic_id: topic_1
          topic_name: Topic 1
          actions:
            - action_type: ai_say
              action_id: action_1
              config:
                content: 欢迎来到心理咨询
                tone: 温暖
                max_rounds: 2
  `;
}

/**
 * 创建包含废弃字段的YAML字符串
 */
export function createYAMLWithDeprecatedFields(): string {
  return `
session:
  session_id: test_deprecated
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_type: ai_ask
              action_id: action_1
              config:
                content: 请问您的名字？
                question_template: 向来访者询问称呼
                target_variable: user_name
                extraction_prompt: 来访者可以接受的称呼
                required: false
                max_rounds: 3
  `;
}
