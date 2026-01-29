# Visual Editor YAML 双向同步 Schema 规范修复

## 问题描述

在可视化编辑器（Visual Editor）与 YAML 模式之间切换时，存在三个同步问题：

### 问题 1：YAML → Visual Editor（加载问题）

从 YAML 加载时，`content` 字段没有正确映射到前端，导致可视化编辑器中显示为空。

**具体表现**：

- YAML 中有 `config.content: "欢迎来到咨询"`
- 可视化编辑器中 ai_say 的内容框显示为空

**原因**：`parseYamlToScript` 函数只读取了旧的 `content_template` 字段，没有读取新的 `content` 字段。

### 问题 2：Visual Editor → YAML（生成问题）

在可视化编辑器中编辑后，生成的 YAML 格式不符合最新的 Schema 规范。

**具体表现**：

- ai_ask 的 `content` 字段为空字符串（`content: ''`）
- 使用了已废弃的字段名（如 `content_template`）
- 包含了已废弃的字段（如 `require_acknowledgment`、`tolist` 等）

### 问题 3：`declare` 字段位置错误

在可视化编辑器中添加内容后，生成的 YAML 在文件末尾多了一个 `declare: []`。

**具体表现**：

```yaml
actions:
  - action_type: ai_say
    # ...
declare: [] # ❗ 错误：应该在 actions 之前，且空数组不应该包含
```

**原因**：`syncPhasesToYaml` 函数将 `declare` 字段放在了 Topic 结构的最前面，且没有判断是否为空。

### 具体问题

1. **ai_say Action**：
   - ❌ 使用 `content_template` 字段（应该是 `content`）
   - ❌ 包含已废弃的 `require_acknowledgment` 字段

2. **ai_ask Action**：
   - ❌ 使用 `question_template` 字段（应该是 `content`）
   - ❌ 包含已废弃的字段：`tolist`, `target_variable`, `extraction_prompt`, `required`

3. **ai_think Action**：
   - ❌ 使用 `prompt_template` 字段（应该是 `content`）
   - ❌ 使用 `output_variables` 字段（应该是 `output` 数组）

4. **所有 Action**：
   - ❌ 包含 `undefined` 或 `null` 值的字段

## 最新 Schema 规范

根据 `.qoder/quests/yaml-script-schema-validation.md` 设计文档：

### ai_say Config Schema

| 字段         | 类型   | 必填 | 说明            |
| ------------ | ------ | ---- | --------------- |
| `content`    | string | 是   | 内容模板        |
| `tone`       | string | 否   | 语气风格        |
| `exit`       | string | 否   | 退出条件        |
| `max_rounds` | number | 否   | 最大轮数 (1-10) |

### ai_ask Config Schema

| 字段         | 类型   | 必填 | 说明            |
| ------------ | ------ | ---- | --------------- |
| `content`    | string | 是   | 提问内容模板    |
| `tone`       | string | 否   | 语气风格        |
| `exit`       | string | 否   | 退出条件        |
| `output`     | array  | 否   | 输出变量配置    |
| `max_rounds` | number | 否   | 最大轮数 (1-10) |

### ai_think Config Schema

| 字段      | 类型   | 必填 | 说明           |
| --------- | ------ | ---- | -------------- |
| `content` | string | 是   | 思考提示词模板 |
| `output`  | array  | 否   | 输出变量配置   |

### use_skill Config Schema

| 字段     | 类型   | 必填 | 说明         |
| -------- | ------ | ---- | ------------ |
| `skill`  | string | 是   | 技能名称     |
| `input`  | array  | 否   | 输入参数     |
| `output` | array  | 否   | 输出变量配置 |

## 修复方案

### 修改位置

文件：`packages/script-editor/src/pages/ProjectEditor/index.tsx`

**修复 1**：`parseYamlToScript` 函数（第 255-316 行）- YAML → Visual Editor  
**修复 2**：`syncPhasesToYaml` 函数（第 806-900 行）- Visual Editor → YAML

### 修复内容

#### 修复 1：`parseYamlToScript` - 支持读取 `content` 字段

**修复前**：

```typescript
if (action.action_type === 'ai_say') {
  const contentValue = action.config?.content_template || ''; // ❌ 只读取旧字段
  actions.push({
    type: 'ai_say',
    content: contentValue,
    // ...
  });
}
```

**修复后**：

```typescript
if (action.action_type === 'ai_say') {
  // 优先使用 content，然后回退到 content_template（向后兼容）
  const contentValue = action.config?.content || action.config?.content_template || ''; // ✅ 支持新旧字段
  actions.push({
    type: 'ai_say',
    content: contentValue,
    ai_say: contentValue,
    tone: action.config?.tone,
    exit: action.config?.exit, // ✅ 新增
    condition: action.condition, // ✅ 从 config 外移入
    max_rounds: action.config?.max_rounds,
    action_id: action.action_id,
    _raw: action,
  });
}
```

**ai_ask 同步修复**：

```typescript
if (action.action_type === 'ai_ask') {
  // 优先使用 content，然后回退到 question_template 或 content_template
  const contentValue =
    action.config?.content ||
    action.config?.question_template ||
    action.config?.content_template ||
    '';
  actions.push({
    type: 'ai_ask',
    ai_ask: contentValue,
    tone: action.config?.tone,
    exit: action.config?.exit,
    max_rounds: action.config?.max_rounds,
    output: action.config?.output || [], // ✅ 直接使用 output 数组
    condition: action.condition,
    action_id: action.action_id,
    _raw: action,
  });
}
```

**ai_think 同步修复**：

```typescript
if (action.action_type === 'ai_think') {
  const contentValue =
    action.config?.content || action.config?.prompt_template || action.config?.think_goal || '';
  actions.push({
    type: 'ai_think',
    think: contentValue,
    output: action.config?.output || [], // ✅ 直接使用 output 数组
    condition: action.condition,
    action_id: action.action_id,
    _raw: action,
  });
}
```

**新增 use_skill 支持**：

```typescript
if (action.action_type === 'use_skill') {
  actions.push({
    type: 'use_skill',
    skill: action.config?.skill || '',
    input: action.config?.input || [],
    output: action.config?.output || [],
    condition: action.condition,
    action_id: action.action_id,
    _raw: action,
  });
}
```

#### 修复 2：`syncPhasesToYaml` - 避免空字符串

详见上面的 ai_say/ai_ask/ai_think/use_skill 修复内容。

#### 修复 3：`syncPhasesToYaml` - 修复 `declare` 字段位置

**问题**：`declare` 字段始终显示在文件末尾，且空数组也会显示

**修复前**：

```typescript
return {
  ...originalTopic,
  topic_id: topic.topic_id,
  topic_name: topic.topic_name,
  description: topic.description,
  declare: topic.localVariables, // ❌ 总是包含，包括空数组
  actions: topic.actions.map((action) => {
    // ...
  }),
};
```

**修复后**：

```typescript
const topicResult: any = {
  ...originalTopic,
  topic_id: topic.topic_id,
  topic_name: topic.topic_name,
  description: topic.description,
  actions: topic.actions.map((action) => {
    // ...
  }),
};

// 只在 declare 非空时才添加
if (topic.localVariables && topic.localVariables.length > 0) {
  topicResult.declare = topic.localVariables; // ✅ 只在有值时添加
}

return topicResult;
```

**效果**：

- ✅ `declare` 字段不再显示在末尾
- ✅ 空数组不会被包含在 YAML 中
- ✅ 有变量时会正常显示

#### 1. ai_say Action 修复

**修复前**：

```typescript
return {
  ...rawAction,
  config: {
    ...rawAction.config,
    content_template: contentValue, // ❌ 错误字段名
    tone: action.tone,
    condition: action.condition,
    require_acknowledgment: action.require_acknowledgment, // ❌ 已废弃
    max_rounds: action.max_rounds,
  },
};
```

**修复后**：

```typescript
const config: any = {
  content: contentValue, // ✅ 正确字段名
};

// 只包含非空字段
if (action.tone) config.tone = action.tone;
if (action.exit) config.exit = action.exit;
if (action.max_rounds) config.max_rounds = action.max_rounds;

const result: any = {
  action_type: 'ai_say',
  action_id: rawAction.action_id || action.id,
  config,
};

if (action.condition) result.condition = action.condition;
return result;
```

#### 2. ai_ask Action 修复

**修复前**：

```typescript
return {
  ...rawAction,
  config: {
    ...rawAction.config,
    question_template: action.ai_ask, // ❌ 错误字段名
    tone: action.tone,
    exit: action.exit,
    tolist: action.tolist, // ❌ 已废弃
    target_variable: action.target_variable || action.output?.[0]?.get, // ❌ 已废弃
    extraction_prompt: action.extraction_prompt || action.output?.[0]?.define, // ❌ 已废弃
    required: action.required, // ❌ 已废弃
    max_rounds: action.max_rounds,
    output: action.output && action.output.length > 1 ? action.output : undefined,
    condition: action.condition,
  },
};
```

**修复后**：

```typescript
const config: any = {
  content: action.ai_ask, // ✅ 正确字段名
};

// 只包含非空字段
if (action.tone) config.tone = action.tone;
if (action.exit) config.exit = action.exit;
if (action.max_rounds) config.max_rounds = action.max_rounds;

// 只在有输出变量时才包含 output 数组
if (action.output && action.output.length > 0) {
  config.output = action.output;
}

const result: any = {
  action_type: 'ai_ask',
  action_id: rawAction.action_id || action.id,
  config,
};

if (action.condition) result.condition = action.condition;
return result;
```

#### 3. ai_think Action 修复

**修复前**：

```typescript
return {
  ...rawAction,
  config: {
    ...rawAction.config,
    prompt_template: action.think, // ❌ 错误字段名
    output_variables: action.output?.map((o) => o.get), // ❌ 错误字段名
    condition: action.condition,
  },
};
```

**修复后**：

```typescript
const config: any = {
  content: action.think, // ✅ 正确字段名
};

// 使用 output 数组（不是 output_variables）
if (action.output && action.output.length > 0) {
  config.output = action.output;
}

const result: any = {
  action_type: 'ai_think',
  action_id: rawAction.action_id || action.id,
  config,
};

if (action.condition) result.condition = action.condition;
return result;
```

#### 4. use_skill Action 新增

之前没有 use_skill 的处理逻辑，现在新增：

```typescript
const config: any = {
  skill: action.skill,
};

if (action.input && action.input.length > 0) {
  config.input = action.input;
}

if (action.output && action.output.length > 0) {
  config.output = action.output;
}

const result: any = {
  action_type: 'use_skill',
  action_id: rawAction.action_id || action.id,
  config,
};

if (action.condition) result.condition = action.condition;
return result;
```

## 测试验证

### 测试步骤

1. 打开可视化编辑器
2. 创建或编辑 Phase/Topic/Action
3. 添加 ai_say、ai_ask、ai_think、use_skill 等 Action
4. 切换到 YAML 模式查看生成的代码
5. 运行 YAML 验证

### 预期结果

生成的 YAML 应该符合以下格式：

```yaml
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
                content: '欢迎来到心理咨询'
                tone: '温暖'
                max_rounds: 2

            - action_type: ai_ask
              action_id: action_2
              config:
                content: '请问您的名字是？'
                output:
                  - get: 'user_name'
                    define: '提取用户姓名'
                max_rounds: 3

            - action_type: ai_think
              action_id: action_3
              config:
                content: '分析用户的情绪状态'
                output:
                  - get: 'emotion_state'
                    define: '情绪状态评估结果'

            - action_type: use_skill
              action_id: action_4
              config:
                skill: 'socratic_questioning'
                input:
                  - get: 'user_name'
                output:
                  - get: 'insight'
                    define: '引导出的认知洞察'
```

### 验证要点

✅ 所有 Action 使用 `content` 字段而非旧字段名  
✅ 移除所有已废弃字段  
✅ 不包含 `undefined` 或 `null` 值  
✅ 通过 Schema 验证  
✅ 字段缩进正确

## 影响范围

- **文件**：`packages/script-editor/src/pages/ProjectEditor/index.tsx`
- **函数**：`syncPhasesToYaml`
- **影响功能**：可视化编辑器 → YAML 同步

## 相关文档

- Schema 规范：`.qoder/quests/yaml-script-schema-validation.md`
- 字段标准化规范：用户记忆中的 "AI交互动作配置字段标准化"

## 修复日期

2026-01-29

## 修复人员

Qoder AI Assistant
