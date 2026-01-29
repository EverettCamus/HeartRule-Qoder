# Visual Editor 模式验证功能设计

## 问题分析

### 问题 1: Visual Editor 模式下看不到验证错误

**现状**: 验证错误面板只在 YAML Mode 下显示
**需求**: 在 Visual Editor 模式下也要能看到脚本的验证错误

### 问题 2: 废弃字段未被检测

**现状**: 以下脚本中的废弃字段没有被检测到：

```yaml
- action_id: action_2
  action_type: ai_ask
  config:
    content_template: 向来访者询问如何称呼 # ❌ 未检测
    question_template: 向来访者询问如何称呼 # ❌ 未检测
    exit: 收到到来访者的称呼
    target_variable: user_name # ❌ 未检测
    extraction_prompt: 来访者可以接受的称呼 # ❌ 未检测
    required: false # ❌ 未检测
    max_rounds: 3
```

**根本原因**:

- Topic Schema 引用 `action-base.schema.json`
- Action Base Schema 中 `config` 字段只定义为 `type: object`，没有深度验证
- 需要根据 `action_type` 动态引用对应的 Config Schema

## 解决方案设计

### 方案 1: 修复深度验证（解决问题 2）

#### 1.1 使用 JSON Schema 的 if-then-else 条件验证

修改 `action-base.schema.json`，根据 `action_type` 动态引用对应的 Config Schema：

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "action-base.schema.json",
  "title": "Action Base Schema",
  "type": "object",
  "required": ["action_type", "action_id"],
  "properties": {
    "action_type": {
      "type": "string",
      "enum": ["ai_say", "ai_ask", "ai_think", "use_skill"]
    },
    "action_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "condition": {
      "type": "string"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": { "action_type": { "const": "ai_ask" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-ask-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "ai_say" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-say-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "ai_think" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-think-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "use_skill" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "use-skill-config.schema.json" }
        },
        "required": ["config"]
      }
    }
  ],
  "additionalProperties": false
}
```

**优点**:

- 标准的 JSON Schema 方式
- 一次修改解决所有问题
- 废弃字段自动被检测

**缺点**:

- 需要 AJV 正确支持 if-then-else（需测试）
- Schema 文件变复杂

#### 1.2 创建独立的 Schema 文件引用

为每个 Action 类型创建完整的 Schema 文件：

**ai-ask-action.schema.json**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ai-ask-action.schema.json",
  "title": "AI Ask Action Schema",
  "type": "object",
  "required": ["action_type", "action_id", "config"],
  "properties": {
    "action_type": { "const": "ai_ask" },
    "action_id": { "type": "string", "minLength": 1 },
    "condition": { "type": "string" },
    "config": { "$ref": "ai-ask-config.schema.json" }
  },
  "additionalProperties": false
}
```

然后在 Topic Schema 中使用 `oneOf` 选择：

```json
{
  "actions": {
    "type": "array",
    "minItems": 1,
    "items": {
      "oneOf": [
        { "$ref": "ai-ask-action.schema.json" },
        { "$ref": "ai-say-action.schema.json" },
        { "$ref": "ai-think-action.schema.json" },
        { "$ref": "use-skill-action.schema.json" }
      ]
    }
  }
}
```

**优点**:

- 结构清晰，每个 Action 类型独立
- 易于维护和扩展

**缺点**:

- 需要创建更多 Schema 文件
- 可能产生冗余的错误信息（oneOf 失败时）

**推荐**: 使用方案 1.1（if-then-else）

### 方案 2: Visual Editor 模式下展示验证错误（解决问题 1）

#### 2.1 UI 展示位置选择

**选项 A: 在 ActionNodeList 顶部展示全局错误面板**

```
┌─────────────────────────────────┐
│  ⚠️ 发现 6 个脚本验证错误       │
│  [点击查看详情]                 │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  Phase 1: 建立关系              │
│    Topic 1: 欢迎                │
│      Action 1 ✅                 │
│      Action 2 ❌ (有错误)        │  ← 标记有错误的节点
│    Topic 2: ...                 │
└─────────────────────────────────┘
```

**选项 B: 在属性面板中展示当前 Action 的错误**

```
┌─────────────────────────────────┐
│  Action Properties              │
├─────────────────────────────────┤
│  ⚠️ 此 Action 有 5 个验证错误   │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  ❌ 缺少必填字段 'content'      │
│  ❌ 废弃字段 'content_template' │
│  ...                            │
├─────────────────────────────────┤
│  Action ID: action_2            │
│  Action Type: ai_ask            │
│  ...                            │
└─────────────────────────────────┘
```

**选项 C: 在节点列表中直接标记错误**

```
┌─────────────────────────────────┐
│  Phase 1: 建立关系              │
│    Topic 1: 欢迎                │
│      Action 1 ✅                 │
│      ┌───────────────────────┐  │
│      │ Action 2 ❌           │  │
│      │ ⚠️ 5 个字段错误       │  │  ← 悬停显示错误摘要
│      └───────────────────────┘  │
└─────────────────────────────────┘
```

**推荐**: 组合方案

- 在 **ActionNodeList 顶部**展示全局错误摘要（选项 A）
- 在 **节点上**用红色边框或图标标记有错误的 Action（选项 C）
- 在 **属性面板**展示当前选中 Action 的详细错误（选项 B）

#### 2.2 错误数据结构

需要将验证错误按照层级结构分组：

```typescript
interface ValidationErrorsByPath {
  // 全局错误
  global: ValidationErrorDetail[];

  // 按 Phase-Topic-Action 分组
  byAction: Map<
    string,
    {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
      errors: ValidationErrorDetail[];
    }
  >;
}
```

#### 2.3 实现步骤

**步骤 1**: 解析错误路径，提取位置信息

```typescript
/**
 * 从错误路径中提取 Phase/Topic/Action 索引
 * 例如: "phases[0].topics[1].actions[2].config.content"
 * 返回: { phaseIndex: 0, topicIndex: 1, actionIndex: 2 }
 */
function parseErrorPath(path: string): {
  phaseIndex: number | null;
  topicIndex: number | null;
  actionIndex: number | null;
} {
  const phaseMatch = path.match(/phases\[(\d+)\]/);
  const topicMatch = path.match(/topics\[(\d+)\]/);
  const actionMatch = path.match(/actions\[(\d+)\]/);

  return {
    phaseIndex: phaseMatch ? parseInt(phaseMatch[1]) : null,
    topicIndex: topicMatch ? parseInt(topicMatch[1]) : null,
    actionIndex: actionMatch ? parseInt(actionMatch[1]) : null,
  };
}
```

**步骤 2**: 在 ActionNodeList 中展示错误摘要

```tsx
// ActionNodeList 组件
{
  validationResult && !validationResult.valid && (
    <Alert
      message={`发现 ${validationResult.errors.length} 个脚本验证错误`}
      type="error"
      closable
      showIcon
      style={{ margin: '12px' }}
    />
  );
}
```

**步骤 3**: 标记有错误的 Action 节点

```tsx
// 计算每个 Action 的错误数量
const actionErrors = useMemo(() => {
  if (!validationResult) return new Map();

  const errorMap = new Map<string, number>();
  validationResult.errors.forEach((error) => {
    const { phaseIndex, topicIndex, actionIndex } = parseErrorPath(error.path);
    if (phaseIndex !== null && topicIndex !== null && actionIndex !== null) {
      const key = `${phaseIndex}-${topicIndex}-${actionIndex}`;
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
  });

  return errorMap;
}, [validationResult]);

// 渲染 Action 时显示错误标记
const errorCount = actionErrors.get(`${phaseIdx}-${topicIdx}-${actionIdx}`);
{
  errorCount && (
    <Tag color="error" style={{ marginLeft: '8px' }}>
      {errorCount} 个错误
    </Tag>
  );
}
```

**步骤 4**: 在属性面板中展示当前 Action 的错误

```tsx
// ActionPropertyPanel 组件
const currentActionErrors = useMemo(() => {
  if (!validationResult || !selectedActionPath) return [];

  return validationResult.errors.filter((error) => {
    const { phaseIndex, topicIndex, actionIndex } = parseErrorPath(error.path);
    return (
      phaseIndex === selectedActionPath.phaseIndex &&
      topicIndex === selectedActionPath.topicIndex &&
      actionIndex === selectedActionPath.actionIndex
    );
  });
}, [validationResult, selectedActionPath]);

// 在面板顶部展示错误
{
  currentActionErrors.length > 0 && (
    <ValidationErrorPanel errors={currentActionErrors} onClose={() => {}} />
  );
}
```

## 实施计划

### Phase 1: 修复深度验证（高优先级）

1. 修改 `action-base.schema.json`，添加 if-then-else 条件验证
2. 重新编译 core-engine
3. 测试废弃字段是否能被检测

### Phase 2: Visual Editor 错误展示（中优先级）

1. 创建 `parseErrorPath` 工具函数
2. 在 ActionNodeList 顶部添加全局错误摘要
3. 在 Action 节点上添加错误标记
4. 在 ActionPropertyPanel 中展示当前 Action 的错误

### Phase 3: 用户体验优化（低优先级）

1. 点击错误摘要自动跳转到第一个有错误的 Action
2. 悬停在错误标记上显示错误预览
3. 提供一键修复废弃字段的功能

## 测试用例

### 用例 1: 废弃字段检测

**输入**: 包含 5 个废弃字段的 ai_ask Action
**预期**: 检测到 6 个错误（缺少 content + 5 个废弃字段）

### 用例 2: Visual Editor 错误展示

**输入**: 打开包含错误的脚本，切换到 Visual Editor
**预期**:

- ActionNodeList 顶部显示错误摘要
- 有错误的 Action 节点显示红色标记
- 选中错误 Action 时，属性面板显示详细错误

### 用例 3: 错误修复后验证

**输入**: 修复所有废弃字段
**预期**:

- 错误标记消失
- 错误摘要消失
- 可以正常保存

## 已知问题

### 问题 1: AJV 对 if-then-else 的支持

**风险**: 某些版本的 AJV 对 if-then-else 支持不完整
**缓解**: 使用最新版本的 AJV，测试验证

### 问题 2: 性能问题

**风险**: 每次编辑都重新解析所有错误路径可能影响性能
**缓解**: 使用 useMemo 缓存计算结果

## 参考资料

- [JSON Schema Conditionals](https://json-schema.org/understanding-json-schema/reference/conditionals.html)
- [AJV if-then-else support](https://ajv.js.org/json-schema.html#if-then-else)
