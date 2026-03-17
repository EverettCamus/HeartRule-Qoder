---
document_id: 'docs-archive-misc-deprecated-fields-validation-example'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/examples/deprecated-fields-validation-example.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'misc']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/examples/deprecated-fields-validation-example.md

---

---

document_id: docs-examples-deprecated-fields-validation-example-md
authority: historical
status: archived
version: 1.0.0
last_updated: 2026-03-12
archived_date: 2026-03-12
source: docs
path: examples/deprecated-fields-validation-example.md
tags: [historical, reference, archived, example]
search_priority: low

---

# 废弃字段验证示例

本文档展示编辑器中对废弃字段的验证和提示效果。

## 场景 1：打开包含废弃字段的旧脚本

### 用户操作

用户在编辑器中打开一个旧的 YAML 脚本文件。

### 原始脚本内容

```yaml
topic_id: welcome_topic
topic_name: 欢迎话题
actions:
  - action_id: action_1
    action_type: ai_say
    config:
      content: 欢迎来访

  - action_id: action_2
    action_type: ai_ask
    config:
      content_template: 向来访者询问如何称呼
      question_template: 向来访者询问如何称呼
      exit: 收到到来访者的称呼
      target_variable: user_name
      extraction_prompt: 来访者可以接受的称呼
      required: false
      max_rounds: 3
```

### 验证触发

- **触发点**: FILE_OPEN (文件打开)
- **延迟**: 立即执行

### 错误列表展示

```
┌─────────────────────────────────────────────────────────────────┐
│ 脚本验证结果                                                    │
├─────────────────────────────────────────────────────────────────┤
│ ❌ 发现 6 个问题                                                │
│                                                                 │
│ 📍 actions[1].config                                           │
│                                                                 │
│   ❌ 缺少必填字段 'content'                                     │
│      → 请添加 content 字段                                     │
│                                                                 │
│   ❌ 包含不允许的额外字段 'content_template'                   │
│      字段 'content_template' 已废弃（该字段已重命名）          │
│      → 请使用 'content' 代替                                   │
│      → 请将 content_template 重命名为 content                  │
│      [查看示例]                                                 │
│                                                                 │
│   ❌ 包含不允许的额外字段 'question_template'                  │
│      字段 'question_template' 已废弃（该字段已被废弃）         │
│      → 请使用 'content' 代替                                   │
│      → 请使用 content 字段代替 question_template               │
│                                                                 │
│   ❌ 包含不允许的额外字段 'target_variable'                    │
│      字段 'target_variable' 已废弃（该字段已被 output 配置取代）│
│      → 请使用 'output' 代替                                    │
│      → 请使用 output 数组配置变量提取，例如：                  │
│         output:                                                 │
│           - get: user_name                                      │
│             define: 提取用户称呼                               │
│      [查看示例]                                                 │
│                                                                 │
│   ❌ 包含不允许的额外字段 'extraction_prompt'                  │
│      字段 'extraction_prompt' 已废弃（该字段已被 output.instruction 取代）│
│      → 请使用 'output[].define' 代替                           │
│      → 请在 output 数组中使用 define 字段                      │
│                                                                 │
│   ❌ 包含不允许的额外字段 'required'                           │
│      字段 'required' 已废弃（该字段无实际作用已废弃）          │
│      → 请直接移除该字段，所有 ai_ask 动作都是可选的            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 场景 2：编辑器中实时验证

### 用户操作

用户正在编辑 `action_2` 的配置，删除了 `question_template` 字段。

### 当前编辑状态

```yaml
- action_id: action_2
  action_type: ai_ask
  config:
    content_template: 向来访者询问如何称呼
    # question_template 已删除
    exit: 收到到来访者的称呼
    target_variable: user_name
    extraction_prompt: 来访者可以接受的称呼
    required: false
    max_rounds: 3
```

### 验证触发

- **触发点**: CONTENT_CHANGE (内容变更)
- **延迟**: 500ms 防抖后执行

### 实时错误更新

```
┌─────────────────────────────────────────────────────────────────┐
│ ❌ 发现 5 个问题                            [最后验证: 14:30:45] │
└─────────────────────────────────────────────────────────────────┘

行内标记：
    11 │     config:
    12 │ ❌    content_template: 向来访者询问如何称呼
              ~~~~~~~~~~~~~~~~
              字段已废弃，请使用 'content'
    13 │       exit: 收到到来访者的称呼
    14 │ ❌    target_variable: user_name
              ~~~~~~~~~~~~~~~
              该字段已被 output 配置取代
    15 │ ❌    extraction_prompt: 来访者可以接受的称呼
              ~~~~~~~~~~~~~~~~~
              该字段已被 output.define 取代
    16 │ ❌    required: false
              ~~~~~~~~
              该字段无实际作用已废弃
    17 │       max_rounds: 3
```

---

## 场景 3：鼠标悬停查看错误详情

### 用户操作

鼠标悬停在 `target_variable` 字段上。

### 悬停提示 (Tooltip)

```
┌─────────────────────────────────────────────────────────────┐
│ ❌ 字段 'target_variable' 已废弃                            │
│                                                             │
│ 原因：该字段已被 output 配置取代                            │
│ 替代：请使用 'output' 字段                                  │
│                                                             │
│ 修复建议：                                                  │
│ 请使用 output 数组配置变量提取，例如：                      │
│                                                             │
│ ✅ 正确示例：                                               │
│ config:                                                     │
│   content: 向来访者询问如何称呼                             │
│   exit: 收到称呼                                            │
│   output:                                                   │
│     - get: user_name                                        │
│       define: 提取用户称呼                                  │
│                                                             │
│ [快速修复] [了解更多]                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 场景 4：尝试保存包含错误的脚本

### 用户操作

用户点击保存按钮 (或按 Ctrl+S)。

### 验证触发

- **触发点**: BEFORE_SAVE (保存前)
- **延迟**: 立即执行（阻塞式）

### 保存阻止对话框

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️  无法保存脚本                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 脚本验证失败，发现 5 个错误，请修复后再保存。               │
│                                                             │
│ 主要问题：                                                  │
│ • 缺少必填字段 'content'                                    │
│ • 包含 4 个废弃字段 (content_template, target_variable...)  │
│                                                             │
│ [查看所有错误] [取消保存]                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 场景 5：修复所有错误后保存

### 用户操作

用户按照提示修复了所有错误，再次保存。

### 修复后的脚本

```yaml
topic_id: welcome_topic
topic_name: 欢迎话题
actions:
  - action_id: action_1
    action_type: ai_say
    config:
      content: 欢迎来访

  - action_id: action_2
    action_type: ai_ask
    config:
      content: 向来访者询问如何称呼 # ✅ 使用 content
      exit: 收到到来访者的称呼
      output: # ✅ 使用 output 数组
        - get: user_name
          define: 提取用户称呼
      max_rounds: 3
      # ✅ 移除所有废弃字段
```

### 验证结果

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ 脚本验证通过                         [最后验证: 14:35:22] │
└─────────────────────────────────────────────────────────────┘

脚本已成功保存！
```

---

## 废弃字段完整对照表

| 废弃字段            | 原因       | 替代方案          | 迁移说明                                     |
| ------------------- | ---------- | ----------------- | -------------------------------------------- |
| `content_template`  | 字段重命名 | `content`         | 直接将 `content_template` 重命名为 `content` |
| `question_template` | 功能重复   | `content`         | 使用 `content` 字段代替 `question_template`  |
| `target_variable`   | 设计改进   | `output[].get`    | 使用 `output` 数组配置变量提取               |
| `extraction_prompt` | 设计改进   | `output[].define` | 在 `output` 数组中使用 `define` 字段         |
| `required`          | 无实际作用 | 移除              | 直接删除该字段                               |

---

## 验证触发点总结

### FILE_OPEN (文件打开)

- **时机**: 打开脚本文件时
- **延迟**: 立即执行
- **用途**: 快速发现现有问题
- **UI 反馈**: 显示错误列表面板和状态条

### CONTENT_CHANGE (内容变更)

- **时机**: 编辑器内容变化时
- **延迟**: 500ms 防抖
- **用途**: 实时反馈编辑错误
- **UI 反馈**: 更新行内错误标记和错误列表

### BEFORE_SAVE (保存前)

- **时机**: 点击保存按钮或 Ctrl+S
- **延迟**: 立即执行（阻塞）
- **用途**: 阻止保存无效脚本
- **UI 反馈**: 显示错误对话框或成功提示

### MANUAL (手动验证)

- **时机**: 点击"验证脚本"按钮
- **延迟**: 立即执行
- **用途**: 主动检查脚本
- **UI 反馈**: 显示验证结果摘要

---

## 开发者使用示例

### 在编辑器组件中集成

```typescript
import { validationService } from '@/services/validation-service';

function ScriptEditor() {
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState([]);

  // 文件打开时验证
  useEffect(() => {
    if (content) {
      const result = validationService.validateOnOpen(content);
      setErrors(result.errors);
    }
  }, []);

  // 内容变更时验证（防抖）
  const handleChange = (newContent) => {
    setContent(newContent);

    validationService.validateOnChange(newContent, (result) => {
      setErrors(result.errors);
    });
  };

  // 保存前验证
  const handleSave = async () => {
    const result = await validationService.validateBeforeSave(content);

    if (!result.valid) {
      alert(`无法保存，发现 ${result.errors.length} 个错误`);
      return;
    }

    await saveScript(content);
  };

  return (
    <div>
      <ValidationStatusBar errors={errors} />
      <CodeEditor value={content} onChange={handleChange} />
      <ErrorListPanel errors={errors} />
      <button onClick={handleSave}>保存</button>
    </div>
  );
}
```

---

## 相关文档

- [编辑器验证集成设计](./editor-validation-integration.md)
- [实现总结](./editor-validation-implementation-summary.md)
- [Schema 定义](../../packages/core-engine/src/schemas/)
