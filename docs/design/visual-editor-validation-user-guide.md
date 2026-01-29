# Visual Editor 验证功能使用指南

## 快速开始

Visual Editor 现在已支持脚本验证错误展示功能，包括废弃字段的自动检测和提示。

---

## 功能说明

### 1. 自动检测废弃字段

系统会自动检测以下废弃字段：

| 废弃字段            | 适用 Action    | 新字段            | 说明             |
| ------------------- | -------------- | ----------------- | ---------------- |
| `content_template`  | ai_say, ai_ask | `content`         | 字段重命名       |
| `question_template` | ai_ask         | `content`         | 字段已废弃       |
| `target_variable`   | ai_ask         | `output[].get`    | 使用 output 数组 |
| `extraction_prompt` | ai_ask         | `output[].define` | 使用 output 数组 |
| `required`          | ai_ask         | 无                | 直接移除         |

### 2. 验证错误展示位置

#### YAML Mode

- **位置**: 编辑器下方
- **组件**: ValidationErrorPanel
- **功能**: 列出所有错误，提供详细路径和建议

#### Visual Editor Mode

提供**两级**错误展示：

##### 第一级：全局错误摘要

- **位置**: Visual Editor 顶部（Action 列表上方）
- **显示内容**:
  - 错误总数
  - 提示信息
- **操作**: 可关闭

##### 第二级：Action 详细错误

- **位置**: 属性面板顶部
- **触发**: 选中有错误的 Action
- **显示内容**:
  - 该 Action 的所有错误
  - 每个错误的修复建议（💡 图标）
  - 错误标记（红色 Tag）

---

## 使用流程

### 步骤 1: 打开测试脚本

1. 启动编辑器
2. 打开 `scripts/sessions/test_deprecated_fields.yaml`
3. 或打开任何包含废弃字段的脚本

### 步骤 2: 切换到 Visual Editor 模式

1. 点击顶部的 **Visual Editor** 按钮
2. 如果脚本有错误，顶部会显示红色警告框

```
⚠️ 发现 13 个脚本验证错误
请检查并修复错误后保存。点击有错误的 Action 查看详情。
```

### 步骤 3: 查看具体错误

1. 在左侧 Action 列表中，找到有错误的 Action
2. 点击选中该 Action
3. 右侧属性面板顶部会显示详细错误

```
❌ 此 Action 存在 5 个验证错误

• 包含不允许的额外字段 'content_template'
  💡 字段 'content_template' 已废弃（该字段已重命名）。
     请使用 'content' 代替。请将 content_template 重命名为 content

• 包含不允许的额外字段 'target_variable'
  💡 字段 'target_variable' 已废弃（该字段已被 output 配置取代）。
     请使用 'output' 代替。请使用 output 数组配置变量提取
```

### 步骤 4: 修复错误

根据提示修复错误，例如：

**修复前**:

```yaml
- action_type: 'ai_ask'
  action_id: 'ask_name'
  config:
    content_template: '请告诉我你的名字'
    target_variable: 'user_name'
    extraction_prompt: '提取用户的名字'
    required: true
    max_rounds: 3
```

**修复后**:

```yaml
- action_type: 'ai_ask'
  action_id: 'ask_name'
  config:
    content: '请告诉我你的名字'
    max_rounds: 3
    output:
      - get: 'user_name'
        define: '提取用户的名字'
```

### 步骤 5: 验证修复

1. 切换回 YAML Mode 查看修改
2. 保存文件 (Ctrl+S)
3. 系统会自动重新验证
4. 错误消失后，顶部警告框也会消失

---

## 常见错误修复示例

### 错误 1: content_template (ai_say)

**错误提示**:

```
包含不允许的额外字段 'content_template'
💡 请使用 'content' 代替。请将 content_template 重命名为 content
```

**修复**:

```yaml
# 修复前
config:
  content_template: "欢迎来到心理咨询"

# 修复后
config:
  content: "欢迎来到心理咨询"
```

---

### 错误 2: question_template + target_variable + extraction_prompt (ai_ask)

**错误提示**:

```
包含不允许的额外字段 'question_template'
包含不允许的额外字段 'target_variable'
包含不允许的额外字段 'extraction_prompt'
```

**修复**:

```yaml
# 修复前
config:
  question_template: "你叫什么名字？"
  target_variable: "user_name"
  extraction_prompt: "提取用户名字"
  max_rounds: 3

# 修复后
config:
  content: "你叫什么名字？"
  max_rounds: 3
  output:
    - get: "user_name"
      define: "提取用户名字"
```

---

### 错误 3: required (ai_ask)

**错误提示**:

```
包含不允许的额外字段 'required'
💡 请直接移除该字段，所有 ai_ask 动作都是可选的
```

**修复**:

```yaml
# 修复前
config:
  content: "你的年龄是？"
  required: true
  max_rounds: 3

# 修复后
config:
  content: "你的年龄是？"
  max_rounds: 3
```

---

## 验证触发时机

系统会在以下时机自动触发验证：

1. **文件打开时** - 立即验证
2. **内容变更时** - 防抖 500ms 后验证
3. **保存前** - 阻塞式验证
4. **手动触发** - 点击"Validate Script"按钮

---

## 注意事项

### 1. 错误不会阻止编辑

- 即使有验证错误，仍可继续编辑
- 建议及时修复错误后再保存

### 2. 保存时强制验证

- 保存前会强制验证一次
- 如果有严重错误可能影响保存

### 3. 跨模式同步

- YAML Mode 和 Visual Editor Mode 共享验证结果
- 切换模式时会保留错误状态

### 4. 批量错误

- 如果一个 Action 有多个错误，会全部列出
- 建议从上到下依次修复

---

## 快捷键

| 快捷键 | 功能                 |
| ------ | -------------------- |
| Ctrl+S | 保存（触发验证）     |
| -      | 手动验证（点击按钮） |

---

## 故障排除

### Q: 为什么看不到错误提示？

**A**: 检查以下几点：

1. 是否切换到了 Visual Editor 模式
2. 脚本是否确实有错误
3. 错误面板是否被关闭（点击 X）
4. 尝试重新打开文件

### Q: 修复后错误还在？

**A**:

1. 确保修改已保存
2. 尝试切换模式（YAML → Visual Editor）
3. 检查是否还有其他隐藏错误

### Q: 错误提示是英文的？

**A**:

- core-engine 的错误格式化服务使用中文
- 如果看到英文，可能是旧版本，请重新编译

---

## 相关文档

- [完整实现总结](./visual-editor-validation-implementation-summary.md)
- [原始设计文档](./visual-editor-validation-design.md)
- [Schema 验证规范](../../packages/core-engine/src/schemas/README.md)

---

**最后更新**: 2026-01-29
