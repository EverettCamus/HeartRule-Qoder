---
document_id: 'docs-archive-misc-editor-validation-integration'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/design/editor-validation-integration.md'
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
**原始路径**: docs/design/editor-validation-integration.md

---

---

document_id: docs-design-editor-validation-integration-md
authority: historical
status: archived
version: 0.9.0
last_updated: 2026-02-10
archived_date: 2026-03-12
source: docs
path: design/editor-validation-integration.md
tags: [historical, reference, archived]
search_priority: medium

---

# 编辑器 Schema 验证集成设计

## 1. 概述

本文档描述如何在脚本编辑器中集成 YAML Schema 验证，提供友好的错误提示和合理的验证触发点。

## 2. 验证触发点设计

### 2.1 触发点列表

| 触发点             | 时机             | 延迟       | 用途             | 优先级 |
| ------------------ | ---------------- | ---------- | ---------------- | ------ |
| **FILE_OPEN**      | 打开脚本文件时   | 立即       | 快速发现现有问题 | 高     |
| **CONTENT_CHANGE** | 编辑器内容变更时 | 500ms 防抖 | 实时反馈编辑错误 | 高     |
| **BEFORE_SAVE**    | 保存脚本之前     | 立即       | 阻止保存无效脚本 | 最高   |
| **MANUAL**         | 用户手动触发     | 立即       | 主动检查脚本     | 中     |

### 2.2 触发点详细说明

#### FILE_OPEN（文件打开）

**触发时机**：

- 用户在编辑器中打开一个脚本文件
- 从项目列表中选择并加载脚本
- 刷新页面后恢复编辑器状态

**行为**：

```typescript
// 伪代码
editor.onFileOpen((content) => {
  const result = validationService.validateOnOpen(content);

  if (!result.valid) {
    // 展示错误列表面板
    showErrorPanel(result.errors);
    // 标记编辑器状态为 "有错误"
    editor.setStatus('error');
  }
});
```

**UI 反馈**：

- 在编辑器顶部显示验证状态条
- 如果有错误，显示错误数量：`❌ 发现 5 个问题`
- 在错误列表面板中展示所有错误

---

#### CONTENT_CHANGE（内容变更）

**触发时机**：

- 用户在编辑器中输入、删除、粘贴内容
- 使用防抖机制，停止编辑 500ms 后触发

**行为**：

```typescript
// 伪代码
let debounceTimer = null;

editor.onChange((content) => {
  clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    const result = validationService.validateOnChange(content);

    // 更新错误标记
    updateErrorMarkers(result.errors);

    // 更新错误列表
    updateErrorPanel(result.errors);
  }, 500);
});
```

**UI 反馈**：

- 在错误行旁边显示红色波浪线或图标
- 鼠标悬停时显示错误提示 Tooltip
- 实时更新错误列表面板

**防抖原因**：

- 避免频繁验证影响性能
- 减少用户编辑时的干扰
- 500ms 是平衡响应速度和性能的最佳值

---

#### BEFORE_SAVE（保存前验证）

**触发时机**：

- 用户点击"保存"按钮
- 使用快捷键 Ctrl+S / Cmd+S

**行为**：

```typescript
// 伪代码
editor.onSave(async (content) => {
  // 立即执行验证，不使用防抖
  const result = await validationService.validateBeforeSave(content);

  if (!result.valid) {
    // 阻止保存
    showErrorDialog({
      title: '脚本验证失败',
      message: `发现 ${result.errors.length} 个错误，请修复后再保存`,
      errors: result.errors,
    });
    return false; // 取消保存
  }

  // 验证通过，继续保存
  await saveScript(content);
  showSuccessMessage('脚本保存成功');
  return true;
});
```

**UI 反馈**：

- 如果验证失败，显示模态对话框列出所有错误
- 用户必须先修复错误才能保存
- 验证通过后显示成功提示

---

#### MANUAL（手动验证）

**触发时机**：

- 用户点击"验证脚本"按钮
- 使用快捷键（如 Ctrl+Shift+V）

**行为**：

```typescript
// 伪代码
validateButton.onClick(() => {
  const content = editor.getContent();
  const result = validationService.validateManual(content);

  if (result.valid) {
    showSuccessMessage('✅ 脚本验证通过');
  } else {
    showErrorPanel(result.errors);
    focusFirstError();
  }
});
```

**UI 反馈**：

- 显示验证进度指示器
- 验证完成后显示结果摘要
- 如果有错误，自动聚焦到第一个错误位置

---

## 3. 废弃字段错误提示设计

### 3.1 问题场景

用户打开旧脚本，包含已废弃的字段：

```yaml
- action_id: action_2
  action_type: ai_ask
  config:
    content_template: 向来访者询问如何称呼 # 已重命名为 content
    question_template: 向来访者询问如何称呼 # 已废弃
    exit: 收到到来访者的称呼
    target_variable: user_name # 已废弃
    extraction_prompt: 来访者可以接受的称呼 # 已废弃
    required: false # 已废弃
    max_rounds: 3
```

### 3.2 错误提示内容

#### 错误 1：content_template 已重命名

```
[路径] phases[0].topics[0].actions[1].config.content_template

[错误类型] STRUCTURE_ERROR

[错误信息] 包含不允许的额外字段 'content_template'

[建议] 字段 'content_template' 已废弃（该字段已重命名）。请使用 'content' 代替。请将 content_template 重命名为 content

[示例]
config:
  content: 向来访者询问如何称呼  # 使用 content 代替 content_template
  exit: 收到到来访者的称呼
  max_rounds: 3
```

---

#### 错误 2：question_template 已废弃

```
[路径] phases[0].topics[0].actions[1].config.question_template

[错误类型] STRUCTURE_ERROR

[错误信息] 包含不允许的额外字段 'question_template'

[建议] 字段 'question_template' 已废弃（该字段已被废弃）。请使用 'content' 代替。请使用 content 字段代替 question_template

[示例]
config:
  content: 向来访者询问如何称呼  # 使用 content 代替 question_template
  exit: 收到到来访者的称呼
```

---

#### 错误 3：target_variable 已废弃

```
[路径] phases[0].topics[0].actions[1].config.target_variable

[错误类型] STRUCTURE_ERROR

[错误信息] 包含不允许的额外字段 'target_variable'

[建议] 字段 'target_variable' 已废弃（该字段已被 output 配置取代）。请使用 'output' 代替。请使用 output 数组配置变量提取，例如：
output:
  - variable: user_name
    instruction: 提取用户称呼

[示例]
config:
  content: 向来访者询问如何称呼
  exit: 收到到来访者的称呼
  output:
    - variable: user_name
      instruction: 提取用户称呼
  max_rounds: 3
```

---

#### 错误 4：extraction_prompt 已废弃

```
[路径] phases[0].topics[0].actions[1].config.extraction_prompt

[错误类型] STRUCTURE_ERROR

[错误信息] 包含不允许的额外字段 'extraction_prompt'

[建议] 字段 'extraction_prompt' 已废弃（该字段已被 output.instruction 取代）。请使用 'output[].instruction' 代替。请在 output 数组中使用 instruction 字段

[示例]
config:
  content: 向来访者询问如何称呼
  output:
    - variable: user_name
      instruction: 来访者可以接受的称呼
```

---

#### 错误 5：required 已废弃

```
[路径] phases[0].topics[0].actions[1].config.required

[错误类型] STRUCTURE_ERROR

[错误信息] 包含不允许的额外字段 'required'

[建议] 字段 'required' 已废弃（该字段无实际作用已废弃）。请直接移除该字段，所有 ai_ask 动作都是可选的

[示例]
config:
  content: 向来访者询问如何称呼
  exit: 收到到来访者的称呼
  max_rounds: 3
  # 移除 required 字段
```

---

### 3.3 修复后的正确脚本

```yaml
- action_id: action_2
  action_type: ai_ask
  config:
    content: 向来访者询问如何称呼 # ✅ 使用 content
    exit: 收到到来访者的称呼
    output: # ✅ 使用 output 数组
      - variable: user_name
        instruction: 提取用户称呼
    max_rounds: 3
    # ✅ 移除 question_template, target_variable, extraction_prompt, required
```

---

## 4. UI 组件设计

### 4.1 错误列表面板 (ErrorListPanel)

**位置**：编辑器右侧或底部面板

**内容**：

```
脚本验证结果
────────────────────────────────────
❌ 发现 5 个问题

📍 phases[0].topics[0].actions[1].config
  ❌ content_template (已废弃字段)
     → 字段 'content_template' 已重命名为 'content'

  ❌ question_template (已废弃字段)
     → 字段 'question_template' 已被废弃，请使用 'content'

  ❌ target_variable (已废弃字段)
     → 该字段已被 output 配置取代
     [查看迁移示例]

  ❌ extraction_prompt (已废弃字段)
     → 请在 output 数组中使用 instruction 字段

  ❌ required (已废弃字段)
     → 该字段无实际作用，请直接移除
```

**交互**：

- 点击错误项跳转到对应行
- 展开/折叠错误详情
- 复制错误信息
- 一键修复（如果支持自动修复）

---

### 4.2 行内错误标记 (InlineErrorMarker)

**样式**：

- 在错误字段下方显示红色波浪线
- 行号左侧显示红色错误图标 `❌`

**示例**：

```yaml
10 │   config:
11 │ ❌  content_template: 向来访者询问如何称呼
  ~~~~~~~~~~~~~~~~
  字段已废弃，请使用 'content'
```

---

### 4.3 错误悬停提示 (ErrorTooltip)

**触发**：鼠标悬停在错误字段上

**内容**：

```
┌─────────────────────────────────────────┐
│ ❌ 字段 'content_template' 已废弃       │
│                                         │
│ 原因：该字段已重命名                     │
│ 替代：请使用 'content' 字段              │
│                                         │
│ 修复建议：                               │
│ 将 content_template 重命名为 content    │
│                                         │
│ ✅ 正确示例：                            │
│ config:                                 │
│   content: 向来访者询问如何称呼          │
│                                         │
│ [查看详情] [快速修复]                    │
└─────────────────────────────────────────┘
```

---

### 4.4 验证状态条 (ValidationStatusBar)

**位置**：编辑器顶部

**状态**：

- ✅ 验证通过（绿色）

  ```
  ✅ 脚本验证通过 | 最后验证: 2026-01-29 14:30:45
  ```

- ❌ 有错误（红色）

  ```
  ❌ 发现 5 个问题 | [查看详情] [修复建议]
  ```

- ⏳ 验证中（黄色）
  ```
  ⏳ 正在验证脚本...
  ```

---

## 5. 验证服务集成示例

### 5.1 在编辑器组件中集成

```typescript
import { validationService, ValidationTrigger } from '@/services/validation-service';
import { useState, useEffect } from 'react';

function ScriptEditor() {
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<ValidationErrorDetail[]>([]);
  const [validating, setValidating] = useState(false);

  // 文件打开时验证
  useEffect(() => {
    if (content) {
      const result = validationService.validateOnOpen(content);
      setErrors(result.errors);
    }
  }, []); // 只在首次加载时执行

  // 内容变更时验证（防抖）
  const handleContentChange = (newContent: string) => {
    setContent(newContent);

    setValidating(true);
    validationService.validateOnChange(newContent, (result) => {
      setErrors(result.errors);
      setValidating(false);
    });
  };

  // 保存前验证
  const handleSave = async () => {
    const result = await validationService.validateBeforeSave(content);

    if (!result.valid) {
      alert(`验证失败，发现 ${result.errors.length} 个错误`);
      return;
    }

    // 继续保存
    await saveScript(content);
  };

  return (
    <div>
      <ValidationStatusBar
        validating={validating}
        errors={errors}
      />

      <CodeEditor
        value={content}
        onChange={handleContentChange}
        errors={errors}
      />

      <ErrorListPanel errors={errors} />

      <button onClick={handleSave}>保存</button>
    </div>
  );
}
```

---

## 6. 实现清单

### 6.1 核心功能

- [x] 增强 ErrorFormatter 识别废弃字段
- [x] 创建 ValidationService 服务
- [ ] 实现 ErrorListPanel 组件
- [ ] 实现 InlineErrorMarker 组件
- [ ] 实现 ErrorTooltip 组件
- [ ] 实现 ValidationStatusBar 组件

### 6.2 编辑器集成

- [ ] 集成 FILE_OPEN 触发点
- [ ] 集成 CONTENT_CHANGE 触发点（防抖）
- [ ] 集成 BEFORE_SAVE 触发点
- [ ] 集成 MANUAL 触发点

### 6.3 UI/UX 优化

- [ ] 错误分组和排序
- [ ] 错误跳转和高亮
- [ ] 自动修复建议（可选）
- [ ] 验证性能优化

---

## 7. 测试计划

### 7.1 单元测试

- [ ] 测试 ValidationService 各触发点
- [ ] 测试防抖机制
- [ ] 测试废弃字段识别

### 7.2 集成测试

- [ ] 测试完整的编辑器验证流程
- [ ] 测试多个错误的展示
- [ ] 测试保存阻止机制

### 7.3 用户体验测试

- [ ] 测试错误提示的可读性
- [ ] 测试验证性能（大型脚本）
- [ ] 测试防抖延迟的用户体验

---

## 8. 附录

### 8.1 废弃字段完整列表

| 废弃字段            | 原因       | 替代方案               | 影响范围       |
| ------------------- | ---------- | ---------------------- | -------------- |
| `content_template`  | 字段重命名 | `content`              | ai_ask, ai_say |
| `question_template` | 功能重复   | `content`              | ai_ask         |
| `target_variable`   | 设计改进   | `output[].variable`    | ai_ask         |
| `extraction_prompt` | 设计改进   | `output[].instruction` | ai_ask         |
| `required`          | 无实际作用 | 移除                   | ai_ask         |

### 8.2 验证性能指标

- 单次验证时间：< 100ms（中等脚本）
- 防抖延迟：500ms
- UI 更新延迟：< 50ms

### 8.3 错误提示多语言支持（未来）

当前仅支持中文，未来可扩展：

- 英文错误提示
- 根据用户设置切换语言
