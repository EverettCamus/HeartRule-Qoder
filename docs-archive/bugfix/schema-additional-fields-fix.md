---
document_id: 'docs-archive-bugfix-schema-additional-fields-fix'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/bugfix/schema-additional-fields-fix.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'bugfix']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/bugfix/schema-additional-fields-fix.md

---

---

document_id: docs-bugfix-schema-additional-fields-fix-md
authority: historical
status: archived
version: 1.0.0
last_updated: 2026-01-29
archived_date: 2026-03-12
source: docs
path: bugfix/schema-additional-fields-fix.md
tags: [historical, reference, archived, bugfix]
search_priority: low

---

# Schema 额外字段验证错误修复

## 问题描述

用户报告在脚本编辑器中遇到 3 个 Schema 验证错误：

1. **Phase 层级错误**
   - 路径：`session.phases[0]`
   - 错误：包含不允许的额外字段 'description'

2. **Action 层级错误（config 字段）**
   - 路径：`session.phases[0].topics[0].actions[0]`
   - 错误：包含不允许的额外字段 'config'

3. **Action 层级错误（config 字段）**
   - 路径：`session.phases[0].topics[0].actions[1]`
   - 错误：包含不允许的额外字段 'config'

## 根本原因

JSON Schema 定义中缺少必要的字段定义：

1. **Phase Schema** (`phase.schema.json`)
   - 缺少 `description` 字段定义
   - 导致编辑器中添加的 description 被视为不允许的字段

2. **Topic Schema** (`topic.schema.json`)
   - 缺少 `description` 字段定义
   - 同样会导致验证失败

3. **Action Base Schema** (`actions/base.schema.json`)
   - 缺少 `config` 字段的基础定义
   - 虽然在 allOf 条件中引用了具体的 config schema，但基础 properties 中没有定义

## 修复方案

### 1. Phase Schema 修复

**文件**：`packages/core-engine/src/schemas/phase.schema.json`

**添加字段**：

```json
"description": {
  "type": "string",
  "maxLength": 1000,
  "description": "阶段描述"
}
```

**位置**：在 `phase_goal` 之后，`entry_condition` 之前

### 2. Topic Schema 修复

**文件**：`packages/core-engine/src/schemas/topic.schema.json`

**添加字段**：

```json
"description": {
  "type": "string",
  "maxLength": 1000,
  "description": "话题描述"
}
```

**位置**：在 `topic_goal` 之后，`actions` 之前

### 3. Action Base Schema 修复

**文件**：`packages/core-engine/src/schemas/actions/base.schema.json`

**添加字段**：

```json
"config": {
  "type": "object",
  "description": "Action 配置对象（具体结构由 action_type 决定）"
}
```

**位置**：在 `condition` 之后，`allOf` 之前

**说明**：

- 在基础 properties 中定义 config 为 object 类型
- 具体的 config 结构验证由 allOf 中的条件判断处理
- 这样既允许 config 字段存在，又能根据 action_type 进行深度验证

## 修复后的文件

### phase.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "phase.schema.json",
  "title": "Phase Schema",
  "description": "Phase 层级 Schema",
  "type": "object",
  "required": ["phase_id", "topics"],
  "properties": {
    "phase_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "阶段唯一标识"
    },
    "phase_name": {
      "type": "string",
      "maxLength": 200,
      "description": "阶段显示名称"
    },
    "phase_goal": {
      "type": "string",
      "maxLength": 500,
      "description": "阶段目标描述"
    },
    "description": {
      "type": "string",
      "maxLength": 1000,
      "description": "阶段描述"
    },
    "entry_condition": {
      "type": "object",
      "description": "进入条件配置"
    },
    "topics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "topic.schema.json"
      },
      "description": "话题列表"
    }
  },
  "additionalProperties": false
}
```

### topic.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "topic.schema.json",
  "title": "Topic Schema",
  "description": "Topic 层级 Schema",
  "type": "object",
  "required": ["topic_id", "actions"],
  "properties": {
    "topic_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "话题唯一标识"
    },
    "topic_name": {
      "type": "string",
      "maxLength": 200,
      "description": "话题显示名称"
    },
    "topic_goal": {
      "type": "string",
      "maxLength": 500,
      "description": "话题目标描述"
    },
    "description": {
      "type": "string",
      "maxLength": 1000,
      "description": "话题描述"
    },
    "actions": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "action-base.schema.json"
      },
      "description": "动作列表"
    }
  },
  "additionalProperties": false
}
```

### actions/base.schema.json

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "action-base.schema.json",
  "title": "Action Base Schema",
  "description": "所有 Action 的基础 Schema，根据 action_type 动态验证 config",
  "type": "object",
  "required": ["action_type", "action_id"],
  "properties": {
    "action_type": {
      "type": "string",
      "enum": ["ai_say", "ai_ask", "ai_think", "use_skill"],
      "description": "动作类型"
    },
    "action_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100,
      "description": "动作唯一标识"
    },
    "condition": {
      "type": "string",
      "description": "执行条件表达式"
    },
    "config": {
      "type": "object",
      "description": "Action 配置对象（具体结构由 action_type 决定）"
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

## 验证测试

### 测试代码

```javascript
const testYaml = {
  session: {
    session_id: 'cbt_depression_assessment',
    phases: [
      {
        phase_id: 'phase_1',
        phase_name: 'New Phase 1',
        description: '', // ✅ 现在允许
        topics: [
          {
            topic_id: 'topic_1',
            topic_name: 'New Topic 1',
            description: '', // ✅ 现在允许
            actions: [
              {
                action_id: 'action_1',
                action_type: 'ai_say',
                config: {
                  // ✅ 现在允许
                  content: '内容',
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

const validator = new SchemaValidator();
const result = validator.validateSession(testYaml);
console.log(result.valid); // ✅ true
```

### 测试结果

```
=== 测试 Schema 验证（修复后）===

验证结果: ✅ 通过

✅ 所有字段验证通过！
  - description 字段已被接受
  - config 字段已被接受
```

## 编译验证

### core-engine 编译

```bash
cd packages/core-engine
pnpm build
```

**结果**：✅ 成功

```
CLI tsup v8.5.1
ESM Build start
ESM ⚡️ Build success in 67ms
DTS Build start
DTS ⚡️ Build success in 3293ms
```

### script-editor 编译

```bash
cd packages/script-editor
pnpm build
```

**结果**：✅ 成功

```
vite v5.4.21 building for production...
✓ 3457 modules transformed.
✓ built in 13.34s
```

## 修复影响范围

### 受影响的组件

1. **脚本编辑器 (script-editor)**
   - ✅ Visual Editor 模式现在可以正常编辑和保存 description 字段
   - ✅ YAML 模式验证不再报告 description 和 config 字段错误

2. **Schema 验证服务**
   - ✅ Phase 层级支持 description 字段
   - ✅ Topic 层级支持 description 字段
   - ✅ Action 层级支持 config 字段基础定义

3. **API 服务器**
   - ✅ 上传脚本时不再拒绝包含 description 的脚本
   - ✅ 验证逻辑更加完善

## 用户指南

### 修复后的使用方法

1. **在 Visual Editor 中添加描述**
   - 选择 Phase 或 Topic
   - 在属性面板中填写 description 字段
   - 保存时不会再报错

2. **在 YAML 模式中编写脚本**
   - 可以自由添加 description 字段
   - 可以正常配置 config 对象
   - 验证通过后保存

3. **验证脚本**
   - 点击"Validate Script"按钮
   - 不会再看到 description 和 config 的错误提示
   - 只会提示真正的格式错误

## 相关文档

- [YAML Schema 验证体系设计](../design/yaml-script-schema-validation.md)
- [Visual Editor 验证功能](../design/visual-editor-validation-user-guide.md)
- [废弃字段清理文档](../../ai_ask_legacy_fields_cleanup.md)

## 更新日志

### v1.0.1 (2026-01-29)

#### 🐛 Bug 修复

- ✅ Phase Schema 添加 description 字段定义
- ✅ Topic Schema 添加 description 字段定义
- ✅ Action Base Schema 添加 config 字段基础定义

#### ✅ 验证测试

- ✅ 所有字段验证通过
- ✅ core-engine 编译成功
- ✅ script-editor 编译成功

#### 📝 文档

- ✅ 创建修复文档
- ✅ 添加验证测试示例
- ✅ 更新用户指南
