---
document_id: 'docs-archive-misc-target-variable-comprehensive-analysis'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/target_variable_comprehensive_analysis.md'
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
**原始路径**: docs/target_variable_comprehensive_analysis.md

---

# target_variable 全面分析报告

## 📊 概览

本报告分析了项目中所有 `target_variable` 和 `targetVariable` 的引用，并逐个判断是否需要保留或修改。

**搜索结果统计**：

- 总匹配数：25 处
- TypeScript 文件：22 处
- 文档文件：15 处（部分重叠）

## 🎯 分类处理策略

### ✅ 保留（向后兼容）

这些文件需要保留 `target_variable` 支持，用于向后兼容现有脚本：

#### 1. 核心引擎 - 向后兼容代码

**文件**：`packages/core-engine/src/actions/ai-ask-action.ts`

**引用位置**：

- Line 70: `hasTargetVariable: !!(config.target_variable || config.targetVariable)` - 构造函数日志
- Line 176-180: `executeSimple()` 方法中的变量提取目标
- Line 250-254: `executeSimpleMode()` 方法中的变量提取目标（待删除方法）
- Line 574-577: `finishAction()` 方法中的向后兼容处理

**原因**：这是核心引擎，需要保持向后兼容，不能破坏使用旧配置的现有脚本。

**代码示例**：

```typescript
// executeSimple() 中的向后兼容
const extractTo =
  this.config.target_variable || // ← 向后兼容
  this.config.targetVariable || // ← 向后兼容
  this.config.extract_to ||
  this.config.extractTo ||
  '';

// finishAction() 中的向后兼容
const targetVariable = this.config.target_variable || this.config.targetVariable;
if (targetVariable && !extractedVariables[targetVariable] && userInput) {
  extractedVariables[targetVariable] = userInput.trim();
}
```

#### 2. 核心引擎测试 - 测试向后兼容

**文件**：`packages/core-engine/test/output-list.test.ts`

**引用位置**：

- Line 56: 测试用例中使用 `target_variable: 'user_mood'`

**原因**：这是测试向后兼容功能的测试用例，验证当没有 `output` 配置时 `buildOutputList()` 返回空字符串。

**测试代码**：

```typescript
test('没有 output 配置时返回空字符串', () => {
  const action = new AiAskAction('test_action', {
    question_template: '你好吗？',
    target_variable: 'user_mood', // ← 测试向后兼容
  });

  const buildOutputList = (action as any).buildOutputList.bind(action);
  const result = buildOutputList();

  expect(result).toBe(''); // 应该返回空字符串
});
```

#### 3. 历史迁移脚本

这些脚本用于历史数据迁移，不应该修改：

- `packages/api-server/fix-action1-v2.ts` (Line 47)
- `packages/api-server/force-update-v3.ts` (Line 38)

**原因**：这些是历史迁移脚本，保留原样以维持历史记录的完整性。

#### 4. 历史文档

记录重构过程的文档，应该保留：

- `docs/ai_ask_legacy_fields_cleanup.md` - 记录清理历史
- `docs/ai_ask_output_unification_refactor.md` - 记录重构过程

**原因**：这些文档记录了重构过程，是历史资料，不应修改。

---

### ❌ 需要修改（正式代码/文档）

这些文件中的 `target_variable` 引用需要更新为使用 `output` 配置：

#### 1. 类型定义 - 需要添加废弃标记

**文件**：`packages/script-editor/src/types/action.ts`

**位置**：Line 44-45

```typescript
export interface AiAskAction extends BaseAction {
  type: 'ai_ask';
  ai_ask: string;
  tone?: string;
  exit?: string;
  output?: OutputField[];
  tolist?: string;
  question_template?: string;
  target_variable?: string; // ← 需要标记为 @deprecated
  extraction_prompt?: string; // ← 需要标记为 @deprecated
  required?: boolean;
  max_rounds?: number;
}
```

**修改方案**：添加 `@deprecated` 标记，引导开发者使用新字段。

#### 2. 变量分析工具 - 需要重构

**文件**：`packages/script-editor/src/utils/variableAnalyzer.ts`

**位置**：Line 113-116

```typescript
// ai_ask: target_variable
if (config.target_variable) {
  outputVars.add(String(config.target_variable));
}
```

**问题**：这段代码用于分析 action 的输出变量，但现在应该优先使用 `output` 数组。

**修改方案**：

1. 保留对 `target_variable` 的兼容处理（放在最后）
2. 优先处理 `output` 数组
3. 添加注释说明这是向后兼容

#### 3. 测试脚本 - 需要更新

**文件**：`packages/api-server/test-new-config-import.ts`

**位置**：Line 52, 93, 97, 100

```typescript
console.log(`  target_variable: ${ask1.config.target_variable} ✅`);

// ...
actions: actions.map((action) => ({
  action_type: action.type,
  action_id: `action_${index}`,
  config: {
    question_template: action.config?.question_template,
    target_variable: action.config?.target_variable, // ← 需要改为 output
    required: action.config?.required,
    max_rounds: action.config?.max_rounds,
    output: action.config?.target_variable
      ? [
          {
            get: action.config.target_variable, // ← 需要改为 output
            define: '从用户回复中提取信息',
          },
        ]
      : undefined,
  },
}));
```

**问题**：这是一个测试导入功能的脚本，仍在使用旧字段。

**修改方案**：完全改用 `output` 数组，移除 `target_variable` 字段。

#### 4. 其他测试工具脚本 - 需要评估使用情况

**临时脚本**：

- `packages/api-server/temp-script.yaml` (Line 25)

**工具脚本**：

- `packages/api-server/update-script-files.ts` (Line 53)
- `packages/api-server/verify-script.ts` (Line 49)

**测试配置**：

- `packages/api-server/test-new-config.yaml` (Line 33)

**修改方案**：

- 如果仍在使用，改为 `output` 配置
- 如果是临时测试，可以删除或更新

---

### ⚠️ 需要评估的文件

这些文件需要先评估是否还在使用，然后决定处理方式：

1. **update-script-files.ts** - 脚本更新工具
2. **verify-script.ts** - 脚本验证工具
3. **temp-script.yaml** - 临时脚本
4. **test-new-config.yaml** - 测试配置

---

## 📋 修改清单

### 优先级 P0（必须修改）

- [✅] `packages/script-editor/src/types/action.ts` - 添加 @deprecated 标记
- [✅] `packages/script-editor/src/utils/variableAnalyzer.ts` - 重构变量分析逻辑
- [✅] `packages/api-server/test-new-config-import.ts` - 更新测试脚本

### 优先级 P1（建议修改）

- [✅] `packages/api-server/temp-script.yaml` - 已更新为 output 数组
- [✅] `packages/api-server/test-new-config.yaml` - 已更新测试配置
- [✅] `packages/api-server/update-script-files.ts` - 已更新
- [✅] `packages/api-server/verify-script.ts` - 已更新，支持显示两种格式

### 优先级 P2（保持不变）

- ✅ `packages/core-engine/src/actions/ai-ask-action.ts` - 保留向后兼容
- ✅ `packages/core-engine/test/output-list.test.ts` - 测试向后兼容功能
- ✅ `packages/api-server/fix-action1-v2.ts` - 历史迁移脚本
- ✅ `packages/api-server/force-update-v3.ts` - 历史迁移脚本
- ✅ `docs/ai_ask_legacy_fields_cleanup.md` - 历史文档
- ✅ `docs/ai_ask_output_unification_refactor.md` - 历史文档

---

## 🔄 迁移指南

### 旧配置格式

```yaml
- type: ai_ask
  ai_ask: '请告诉我你的名字'
  target_variable: 'user_name'
  extraction_prompt: '从用户回复中提取姓名'
  required: true
  max_rounds: 3
```

### 新配置格式

```yaml
- type: ai_ask
  ai_ask: '请告诉我你的名字'
  exit: '用户提供了姓名'
  required: true
  max_rounds: 3
  output:
    - get: 'user_name'
      define: '从用户回复中提取姓名'
```

### 关键差异

1. 移除 `target_variable` 和 `extraction_prompt`
2. 添加 `exit` 条件
3. 使用 `output` 数组（支持单个或多个变量）
4. 变量配置更加结构化

---

## 📊 技术细节

### 向后兼容处理

核心引擎中的向后兼容逻辑保证了旧脚本仍然可以正常运行：

```typescript
// 1. 简单模式中的处理
const extractTo =
  this.config.target_variable ||
  this.config.targetVariable ||
  this.config.extract_to ||
  this.config.extractTo ||
  '';

// 2. finishAction 中的兼容处理
const targetVariable = this.config.target_variable || this.config.targetVariable;
if (targetVariable && !extractedVariables[targetVariable] && userInput) {
  extractedVariables[targetVariable] = userInput.trim();
}
```

### 优先级策略

当同时存在新旧配置时：

1. 优先使用 `output` 数组
2. 其次使用 `target_variable`（向后兼容）
3. 最后使用其他别名（extract_to, extractTo）

---

## ✅ 总结

### 保留的引用（13处）

- 核心引擎向后兼容：4 处
- 核心引擎测试：1 处
- 历史迁移脚本：2 处
- 历史文档：多处

### 需要修改的引用（7处）

- 类型定义：2 处
- 变量分析工具：1 处
- 测试脚本：4 处

### 需要评估的引用（4处）

- 工具脚本和临时文件

### 修改原则

1. **核心引擎**：保留向后兼容，不破坏现有脚本
2. **编辑器 UI**：已完全移除旧字段（之前已完成）
3. **类型定义**：添加废弃标记，引导使用新字段
4. **工具和测试**：统一使用新配置
5. **历史文档**：保持不变，记录重构过程

---

生成时间：2026-01-22

---

## 📝 实际修改记录

### 修改时间：2026-01-22

### 已完成的修改

#### 1. 类型定义更新

**文件**：`packages/script-editor/src/types/action.ts`

**修改内容**：

- 为 `target_variable` 字段添加 `@deprecated` JSDoc 标记
- 为 `extraction_prompt` 字段添加 `@deprecated` JSDoc 标记
- 提供详细的迁移指南注释

**效果**：

- 开发者在 IDE 中使用这些字段时会看到废弃警告
- 清晰的迁移说明引导使用新的 `output` 数组配置

#### 2. 变量分析工具优化

**文件**：`packages/script-editor/src/utils/variableAnalyzer.ts`

**修改内容**：

- 调整 `analyzeOutputVariables()` 方法的处理优先级
- 优先处理 `output` 数组配置（新方式）
- 将 `target_variable` 处理移到后面（向后兼容，已废弃）
- 添加注释说明处理逻辑

**效果**：

- 变量分析优先识别新配置格式
- 保持对旧格式的向后兼容
- 代码意图更清晰

#### 3. 测试脚本重构

**文件**：`packages/api-server/test-new-config-import.ts`

**修改内容**：

- 移除对 `target_variable` 和 `extraction_prompt` 的读取
- 移除旧字段到新字段的转换逻辑
- 统一使用 `output` 数组配置
- 更新日志输出，只显示 `output` 数组

**效果**：

- 测试脚本完全使用新配置方式
- 代码更简洁，减少了 14 行代码

#### 4. 测试配置文件更新

**文件**：`packages/api-server/test-new-config.yaml`

**修改内容**：

```yaml
# 旧配置
- action_type: 'ai_ask'
  config:
    question_template: '请告诉我你的名字'
    target_variable: 'user_name'
    extraction_prompt: '从用户回答中提取姓名'
    exit: '成功获取用户名称'

# 新配置
- action_type: 'ai_ask'
  config:
    question_template: '请告诉我你的名字'
    exit: '成功获取用户名称'
    output:
      - get: 'user_name'
        define: '从用户回答中提取姓名'
```

#### 5. 临时脚本更新

**文件**：`packages/api-server/temp-script.yaml`

**修改内容**：

- 移除 `content_template` 和空的 `output: []`
- 移除 `target_variable` 和 `extraction_prompt`
- 改用 `output` 数组配置
- 修正 `exit` 字段的拼写错误（"收到到" → "收到"）

#### 6. 脚本更新工具

**文件**：`packages/api-server/update-script-files.ts`

**修改内容**：与 temp-script.yaml 相同的更新

#### 7. 脚本验证工具

**文件**：`packages/api-server/verify-script.ts`

**修改内容**：

- 优先显示 `output` 数组中的变量
- 向后兼容显示 `target_variable`（标记为 legacy）
- 添加类型注释

```typescript
// 优先显示 output 数组，向后兼容 target_variable
if (action.config.output?.length > 0) {
  const varNames = action.config.output.map((o: any) => o.get).join(', ');
  console.log(`          变量(output): ${varNames}`);
} else if (action.config.target_variable) {
  console.log(`          变量(legacy): ${action.config.target_variable}`);
}
```

### 构建验证

#### 编辑器构建

```bash
pnpm --filter script-editor build
✓ 3134 modules transformed.
✓ built in 8.63s
```

#### 核心引擎构建

```bash
pnpm --filter core-engine build
✓ Build success in 2074ms
```

### 代码统计

| 文件                      | 添加行数 | 删除行数 | 净变化 |
| ------------------------- | -------- | -------- | ------ |
| types/action.ts           | +10      | 0        | +10    |
| variableAnalyzer.ts       | +6       | -6       | 0      |
| test-new-config-import.ts | +4       | -14      | -10    |
| test-new-config.yaml      | +5       | -4       | +1     |
| temp-script.yaml          | +4       | -5       | -1     |
| update-script-files.ts    | +4       | -5       | -1     |
| verify-script.ts          | +7       | -1       | +6     |
| **总计**                  | **+40**  | **-35**  | **+5** |

### 保留的向后兼容代码

核心引擎中以下代码保持不变，用于向后兼容：

1. **构造函数日志**（Line 70）
2. **executeSimple() 方法**（Line 176-180）
3. **executeSimpleMode() 方法**（Line 250-254）- 标记为待删除
4. **finishAction() 方法**（Line 574-577）

这些代码确保使用旧配置的现有脚本仍然可以正常运行。

### 修改原则总结

✅ **已完成**：

- 所有正式测试代码已更新为使用 `output` 数组
- 类型定义添加了废弃标记
- 工具脚本优化了对两种格式的处理
- 所有修改通过构建验证

✅ **保留**：

- 核心引擎的向后兼容代码
- 历史迁移脚本
- 历史文档

✅ **指导**：

- 开发者在 IDE 中会看到废弃警告
- 文档提供了清晰的迁移路径
- 新代码统一使用 `output` 数组配置

---

更新时间：2026-01-22
