# 编辑器 Schema 验证实现总结

## 实现概览

根据用户的需求，我已完成编辑器环境中的 Schema 验证方案设计和核心功能实现。

## 已完成的工作

### 1. 增强错误提示 - 废弃字段识别

**文件**: `packages/core-engine/src/schemas/validators/error-formatter.ts`

**功能**:

- 新增 `generateDeprecatedFieldSuggestion()` 方法
- 识别 5 个废弃字段并提供迁移建议：
  - `content_template` → `content`
  - `question_template` → `content`
  - `target_variable` → `output[].get`
  - `extraction_prompt` → `output[].define`
  - `required` → 移除

**示例输出**:

```
错误: 包含不允许的额外字段 'target_variable'

建议: 字段 'target_variable' 已废弃（该字段已被 output 配置取代）。
请使用 'output' 代替。 请使用 output 数组配置变量提取，例如：
output:
  - get: user_name
    define: 提取用户称呼
```

---

### 2. 创建编辑器验证服务

**文件**: `packages/script-editor/src/services/validation-service.ts` (新建)

**功能**:

- 提供 4 种验证触发点：
  - `FILE_OPEN`: 文件打开时立即验证
  - `CONTENT_CHANGE`: 内容变更时防抖验证 (500ms)
  - `BEFORE_SAVE`: 保存前阻塞验证
  - `MANUAL`: 手动触发验证
- 防抖控制避免频繁验证
- 错误分组和格式化
- 支持配置启用/禁用自动验证

**API 示例**:

```typescript
// 文件打开
const result = validationService.validateOnOpen(yamlContent);

// 内容变更（防抖）
validationService.validateOnChange(yamlContent, (result) => {
  showErrors(result.errors);
});

// 保存前验证
const result = await validationService.validateBeforeSave(yamlContent);
if (!result.valid) {
  alert('脚本有错误，无法保存');
  return;
}
```

---

### 3. 设计文档

**文件**: `docs/design/editor-validation-integration.md`

**内容**:

- 详细的验证触发点设计（4 种触发点）
- 废弃字段错误提示示例（5 个字段的具体提示）
- UI 组件设计（ErrorListPanel、InlineErrorMarker、ErrorTooltip、ValidationStatusBar）
- 编辑器集成示例代码
- 实现清单和测试计划

---

## 验证测试结果

### 测试场景：用户提供的旧脚本

**输入** (包含所有废弃字段):

```yaml
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

**验证结果**:

- ❌ 验证失败
- 检测到 **6 个错误**:
  1. 缺少必填字段 `content`
  2. 废弃字段 `content_template`（建议重命名为 content）
  3. 废弃字段 `question_template`（建议使用 content）
  4. 废弃字段 `target_variable`（建议使用 output 数组）
  5. 废弃字段 `extraction_prompt`（建议使用 output[].define）
  6. 废弃字段 `required`（建议直接移除）

**修复后的脚本**:

```yaml
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

**修复后验证结果**: ✅ 验证通过

---

## 验证触发点设计总结

| 触发点             | 时机         | 延迟       | 用途             |
| ------------------ | ------------ | ---------- | ---------------- |
| **FILE_OPEN**      | 打开文件时   | 立即       | 快速发现现有问题 |
| **CONTENT_CHANGE** | 编辑内容时   | 500ms 防抖 | 实时反馈编辑错误 |
| **BEFORE_SAVE**    | 保存之前     | 立即       | 阻止保存无效脚本 |
| **MANUAL**         | 手动点击按钮 | 立即       | 主动检查脚本     |

**用户体验优化**:

- 500ms 防抖避免频繁验证干扰编辑
- 保存前验证确保不保存错误脚本
- 友好的中文错误提示和修复建议
- 分组显示错误便于快速定位

---

## 下一步工作（未完成）

### UI 组件实现

需要在 `packages/script-editor/src/components/` 中创建以下组件：

1. **ErrorListPanel** - 错误列表面板
   - 显示所有验证错误
   - 支持点击跳转到错误位置
   - 显示错误数量统计

2. **InlineErrorMarker** - 行内错误标记
   - 在错误行显示红色波浪线
   - 行号旁显示错误图标

3. **ErrorTooltip** - 错误悬停提示
   - 鼠标悬停时显示详细错误信息
   - 显示修复建议和示例代码

4. **ValidationStatusBar** - 验证状态条
   - 显示验证状态（验证中/通过/有错误）
   - 显示错误数量

### 编辑器集成

需要在现有的脚本编辑器中集成 ValidationService：

- 在文件加载时触发 FILE_OPEN 验证
- 监听编辑器 onChange 事件触发 CONTENT_CHANGE 验证
- 在保存按钮中集成 BEFORE_SAVE 验证
- 添加手动验证按钮触发 MANUAL 验证

---

## 技术细节

### 废弃字段映射表

位于 `error-formatter.ts` 中：

```typescript
const deprecatedFields = {
  content_template: {
    reason: '该字段已重命名',
    replacement: 'content',
    migration: '请将 content_template 重命名为 content',
  },
  question_template: {
    reason: '该字段已被废弃',
    replacement: 'content',
    migration: '请使用 content 字段代替 question_template',
  },
  target_variable: {
    reason: '该字段已被 output 配置取代',
    replacement: 'output',
    migration: '请使用 output 数组配置变量提取...',
  },
  extraction_prompt: {
    reason: '该字段已被 output.instruction 取代',
    replacement: 'output[].instruction',
    migration: '请在 output 数组中使用 instruction 字段',
  },
  required: {
    reason: '该字段无实际作用已废弃',
    replacement: null,
    migration: '请直接移除该字段，所有 ai_ask 动作都是可选的',
  },
};
```

### ValidationService 配置

```typescript
interface ValidationServiceConfig {
  debounceMs?: number; // 防抖延迟，默认 500ms
  enableAutoValidation?: boolean; // 是否启用自动验证，默认 true
}
```

---

## 文件清单

### 新增文件

1. `packages/script-editor/src/services/validation-service.ts` - 验证服务
2. `docs/design/editor-validation-integration.md` - 集成设计文档
3. `docs/design/editor-validation-implementation-summary.md` - 实现总结（本文档）

### 修改文件

1. `packages/core-engine/src/schemas/validators/error-formatter.ts`
   - 添加 `generateDeprecatedFieldSuggestion()` 方法
   - 增强 `generateSuggestion()` 方法调用废弃字段检测

---

## 相关文档

- 详细设计: [editor-validation-integration.md](./editor-validation-integration.md)
- Schema 定义: `packages/core-engine/src/schemas/`
- 错误格式化: `packages/core-engine/src/schemas/validators/error-formatter.ts`
- 验证服务: `packages/core-engine/src/schemas/validators/schema-validator.ts`
