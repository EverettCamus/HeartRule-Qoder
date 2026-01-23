# ai_ask 变量提取统一化重构总结

## 重构背景

之前的 `ai_ask` action 支持两种变量提取方式：
1. **传统方式**：使用 `target_variable` + `extraction_prompt`（单个变量）
2. **新方式**：使用 `output` 数组配置（多个变量）

为了简化配置和统一逻辑，我们决定**移除这种二元性**，统一使用 `output` 数组配置方式。

## 重构目标

- ✅ 统一配置方式：所有变量提取都使用 `output` 数组
- ✅ 自动生成 `output_list`：无论单个还是多个变量，都自动生成
- ✅ 简化代码逻辑：移除单变量的特殊处理
- ✅ 更新文档和示例：反映统一后的配置方式

## 代码变更

### 1. `ai-ask-action.ts` - buildOutputList 方法

**修改前**：
```typescript
private buildOutputList(): string {
  const outputConfig = this.config.output || [];
  
  if (outputConfig.length === 0) {
    return '';
  }
  
  // 如果只有一个变量，不生成 output_list（使用传统方式）
  if (outputConfig.length === 1) {
    return '';
  }
  
  // 多个变量：生成格式化的输出列表
  // ...
}
```

**修改后**：
```typescript
private buildOutputList(): string {
  const outputConfig = this.config.output || [];
  
  if (outputConfig.length === 0) {
    return '';
  }
  
  // 生成格式化的输出列表（包括单个和多个变量）
  const lines: string[] = [];
  for (let i = 0; i < outputConfig.length; i++) {
    const varConfig = outputConfig[i];
    const varName = varConfig.get;
    const varDefine = varConfig.define || '';
    
    if (!varName) continue;
    
    // 构建 JSON 字段
    const isLast = i === outputConfig.length - 1;
    const comma = isLast ? '' : ',';
    
    if (varDefine) {
      lines.push(`  "${varName}": "提取的${varName}"${comma} // ${varDefine}`);
    } else {
      lines.push(`  "${varName}": "提取的${varName}"${comma}`);
    }
  }
  
  if (lines.length > 0) {
    return lines.join('\n');
  }
  
  return '';
}
```

**变更要点**：
- 移除了 `if (outputConfig.length === 1) return '';` 的特殊处理
- 单个变量也会生成 `output_list`

### 2. 测试用例更新

**修改前**：
```typescript
test('单个变量时不生成 output_list', () => {
  // ...
  expect(result).toBe('');
});
```

**修改后**：
```typescript
test('单个变量时也生成 output_list', () => {
  const action = new AiAskAction('test_action', {
    question_template: '请告诉我你的名字',
    output: [
      { get: '用户名', define: '用户的姓名或昵称' }
    ]
  });

  const buildOutputList = (action as any).buildOutputList.bind(action);
  const result = buildOutputList();
  
  // 单个变量也应该生成 output_list
  expect(result).toContain('"用户名"');
  expect(result).toContain('用户的姓名或昵称');
  
  console.log('单个变量的 output_list:\n', result);
});
```

**测试结果**：所有 4 个测试用例全部通过 ✅

### 3. 文档更新

#### `docs/ai_ask_output_list_feature.md`

**主要修改**：

1. **概述部分**：
   - 修改前：强调"多变量"功能
   - 修改后：强调"统一配置"，无论单个还是多个变量

2. **功能特性**：
   - 移除"单变量使用传统方式"的说明
   - 强调统一使用 `output` 数组配置

3. **配置方式**：
   - 标题从"传统方式"改为"基本配置"
   - 单个变量示例也使用 `output` 数组

4. **实现原理**：
   - 更新 `buildOutputList` 方法的代码示例
   - 移除单变量特殊处理的说明

5. **注意事项**：
   - 移除"单变量优先使用传统方式"的建议
   - 改为"使用 output 数组配置"

6. **兼容性**：
   - 移除"向后兼容传统方式"的说明
   - 强调"统一配置"和"自动生成"

### 4. 示例脚本更新

#### `scripts/sessions/test_multi_output.yaml`

**修改前（示例1）**：
```yaml
# 示例1：单个变量（传统方式）
- action_type: "ai_ask"
  action_id: "ask_name"
  config:
    question_template: "你好，请问怎么称呼你？"
    tone: "亲切、自然"
    target_variable: "用户名"
    extraction_prompt: "从用户回复中提取姓名或昵称"
    required: true
    max_rounds: 3
```

**修改后（示例1）**：
```yaml
# 示例1：单个变量（使用 output 数组）
- action_type: "ai_ask"
  action_id: "ask_name"
  config:
    question_template: "你好，请问怎么称呼你？"
    tone: "亲切、自然"
    exit: "用户提供了姓名或昵称"
    required: true
    max_rounds: 3
    output:
      - get: "用户名"
        define: "从用户回复中提取姓名或昵称"
```

## 测试验证

### 构建测试

```bash
pnpm --filter core-engine build
```

**结果**：✅ 构建成功

### 单元测试

```bash
pnpm test test/output-list
```

**结果**：✅ 4 个测试用例全部通过

```
✓ AiAskAction - output_list 生成 (4)
  ✓ 单个变量时也生成 output_list
  ✓ 多个变量时生成完整的 output_list
  ✓ 没有 output 配置时返回空字符串
  ✓ 部分变量没有 define 时也能正确生成
```

### 测试输出示例

**单个变量**：
```
  "用户名": "提取的用户名" // 用户的姓名或昵称
```

**多个变量**：
```
  "症状描述": "提取的症状描述", // 用户描述的主要症状
  "持续时间": "提取的持续时间", // 症状持续的时间长度
  "严重程度": "提取的严重程度" // 症状的严重程度评估
```

## 影响范围

### 修改的文件

1. **核心代码**：
   - `packages/core-engine/src/actions/ai-ask-action.ts`

2. **测试代码**：
   - `packages/core-engine/test/output-list.test.ts`

3. **文档**：
   - `docs/ai_ask_output_list_feature.md`

4. **示例脚本**：
   - `scripts/sessions/test_multi_output.yaml`

### 不受影响的部分

- 提示词模板（`config/prompts/ai-ask/*.md`）：无需修改，因为它们已经使用 `{{output_list}}` 占位符
- 其他 action 实现：不受影响
- 现有脚本：如果使用 `target_variable` 方式，仍然向后兼容（虽然建议迁移）

## 向后兼容性

虽然我们统一了配置方式，但 **`target_variable` 和 `extraction_prompt` 字段仍然向后兼容**，不会破坏现有脚本。

**建议**：逐步将现有脚本迁移到新的 `output` 数组配置方式。

## 迁移指南

### 迁移单个变量的 ai_ask

**旧配置**：
```yaml
config:
  question_template: "请问怎么称呼你？"
  target_variable: "用户名"
  extraction_prompt: "从用户回复中提取姓名"
  required: true
  max_rounds: 3
```

**新配置**：
```yaml
config:
  question_template: "请问怎么称呼你？"
  exit: "用户提供了姓名或昵称"
  required: true
  max_rounds: 3
  output:
    - get: "用户名"
      define: "从用户回复中提取姓名"
```

**变更要点**：
1. 移除 `target_variable` 和 `extraction_prompt`
2. 添加 `output` 数组，包含一个元素
3. 建议添加 `exit` 条件（模板模式需要）
4. `extraction_prompt` 的内容移到 `define` 字段

## 优势总结

1. **配置统一**：无需区分单变量和多变量的配置方式
2. **逻辑简化**：代码更简洁，减少条件判断
3. **易于理解**：新用户不会困惑于两种配置方式
4. **扩展性好**：未来可以轻松添加更多变量，无需修改配置结构
5. **自动格式化**：JSON 输出格式自动生成，无需手动维护

## 后续工作

- [ ] 考虑在未来版本中标记 `target_variable` 和 `extraction_prompt` 为废弃（deprecated）
- [ ] 逐步迁移现有示例脚本到新配置方式
- [ ] 在文档中添加配置迁移的最佳实践

## 相关资源

- [ai_ask 多变量输出功能说明](./ai_ask_output_list_feature.md)
- [测试用例](../packages/core-engine/test/output-list.test.ts)
- [示例脚本](../scripts/sessions/test_multi_output.yaml)
- [核心实现](../packages/core-engine/src/actions/ai-ask-action.ts)

---

**重构完成时间**：2026-01-22  
**测试状态**：✅ 全部通过  
**文档状态**：✅ 已更新
