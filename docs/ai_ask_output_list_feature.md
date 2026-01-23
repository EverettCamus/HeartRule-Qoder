# ai_ask 多变量输出功能说明

## 概述

`ai_ask` action 现已支持通过 `output_list` 系统变量，在提示词模板中动态嵌入变量的输出格式。无论配置单个还是多个变量，都会自动生成 `output_list` 并嵌入到 JSON 输出格式中，使得 AI 模型能够高效地提取所需变量。

## 功能特性

### 1. 统一的 output 配置方式

所有变量提取都使用 `output` 数组配置，系统会自动生成 `output_list` 并嵌入到提示词模板的 JSON 输出格式中。

**特点**：
- **单个或多个变量**：统一使用 `output` 数组配置
- **自动格式化**：自动生成符合 JSON 规范的变量列表
- **灵活配置**：支持有或无 `define` 说明的变量

### 2. 支持变量说明注释

每个变量可以通过 `define` 字段提供说明，这些说明会作为注释嵌入到 JSON 格式中，帮助 AI 理解如何提取该变量。

## 配置方式

### 基本配置（单个变量）

```yaml
- action_type: "ai_ask"
  action_id: "ask_name"
  config:
    question_template: "请问怎么称呼你？"
    tone: "亲切、自然"
    exit: "用户提供了姓名或昵称"
    required: true
    max_rounds: 3
    output:
      - get: "用户名"
        define: "用户的姓名或昵称"
```

### 多变量配置

```yaml
- action_type: "ai_ask"
  action_id: "ask_symptoms"
  config:
    question_template: "请详细描述你的症状"
    tone: "温和、专业"
    exit: "用户提供了症状、持续时间和严重程度的信息"
    required: true
    max_rounds: 5
    output:
      - get: "症状描述"
        define: "用户描述的主要症状表现"
      - get: "持续时间"
        define: "症状持续的时间长度"
      - get: "严重程度"
        define: "症状严重程度的评估（轻度/中度/重度）"
```

## 模板变化

### 修改前（原模板）

```json
{
  "EXIT": "false",
  "咨询师": "你生成的提问内容...",
  "BRIEF": "提问摘要（10字以内）"
}
```

### 修改后（支持 output_list）

```json
{
  "EXIT": "false",
  "咨询师": "你生成的提问内容...",
  "BRIEF": "提问摘要(10字以内)",
  "症状描述": "提取的症状描述", // 用户描述的主要症状表现
  "持续时间": "提取的持续时间", // 症状持续的时间长度
  "严重程度": "提取的严重程度" // 症状严重程度的评估（轻度/中度/重度）
}
```

**说明**：
- `{{output_list}}` 会被自动替换为所有配置的变量字段
- 每个字段后面会跟随其 `define` 作为注释
- 最后一个字段不带逗号
- 无论单个或多个变量，都会生成 output_list

## 实现原理

### 系统变量 output_list

在 `AiAskAction` 的 `buildSystemVariables` 方法中，新增了 `output_list` 系统变量的生成：

```typescript
private buildSystemVariables(context: ActionContext): Record<string, any> {
  // ... 其他系统变量
  
  // 构建 output_list（多变量输出格式）
  const outputList = this.buildOutputList();
  
  return {
    time,
    who,
    user,
    tone,
    chat,
    ai_role: aiRole,
    output_list: outputList,  // 新增
  };
}
```

### buildOutputList 方法

```typescript
private buildOutputList(): string {
  const outputConfig = this.config.output || [];
  
  // 如果没有配置 output，返回空字符串
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
      // 带注释的格式
      lines.push(`  "${varName}": "提取的${varName}"${comma} // ${varDefine}`);
    } else {
      // 不带注释的格式
      lines.push(`  "${varName}": "提取的${varName}"${comma}`);
    }
  }
  
  // 用换行连接所有行
  if (lines.length > 0) {
    return lines.join('\n');
  }
  
  return '';
}
```

**特点**：
- 统一处理单个和多个变量
- 自动处理 JSON 格式（逗号和注释位置）
- 支持可选的 `define` 字段

## 使用场景

### 场景1：症状评估

一次性收集症状的多个维度信息：

```yaml
- action_type: "ai_ask"
  action_id: "assess_symptoms"
  config:
    question_template: "请详细描述你的情况"
    output:
      - get: "症状类型"
        define: "具体的症状类型"
      - get: "发生频率"
        define: "症状发生的频率"
      - get: "触发因素"
        define: "导致症状出现的因素"
      - get: "缓解方法"
        define: "能够缓解症状的方法"
```

### 场景2：背景信息收集

收集用户的多项背景信息：

```yaml
- action_type: "ai_ask"
  action_id: "collect_background"
  config:
    question_template: "请分享一下你的基本信息"
    output:
      - get: "年龄"
        define: "用户的年龄"
      - get: "职业"
        define: "用户的职业"
      - get: "教育背景"
        define: "用户的学历"
      - get: "家庭状况"
        define: "婚姻和家庭情况"
```

### 场景3：复杂事件描述

收集事件的多个关键要素：

```yaml
- action_type: "ai_ask"
  action_id: "describe_event"
  config:
    question_template: "请描述那次让你印象深刻的事件"
    output:
      - get: "事件时间"
        define: "事件发生的时间"
      - get: "事件地点"
        define: "事件发生的地点"
      - get: "涉及人物"
        define: "事件中的关键人物"
      - get: "具体经过"
        define: "事件的具体过程"
      - get: "情绪反应"
        define: "用户当时的情绪反应"
      - get: "后续影响"
        define: "事件对用户的后续影响"
```

## 注意事项

1. **使用 output 数组配置**：所有变量提取统一使用 `output` 数组配置，系统会自动生成 `output_list`。

2. **变量命名清晰**：`get` 字段应该使用清晰、具有描述性的变量名。

3. **define 提供准确说明**：`define` 字段应该提供准确的提取说明，帮助 AI 理解如何从对话中提取该变量。

4. **合理设置退出条件**：`exit` 字段应该明确说明何时可以退出提问，避免无限循环。

5. **max_rounds 设置合理**：根据变量的复杂度和数量，合理设置最大轮次，建议 3-5 轮。

## 测试示例

参见 `scripts/sessions/test_multi_output.yaml` 获取完整的测试示例。

## 兼容性

- ✅ 统一配置：所有变量提取统一使用 `output` 数组配置
- ✅ 自动生成：无论单个还是多个变量，都自动生成 `output_list`
- ✅ 灵活配置：支持部分变量有 `define`，部分没有的情况

## 相关文件

- 提示词模板：
  - `config/prompts/ai-ask/multi-round-ask.md`
  - `config/prompts/ai-ask/mainline-ask-template.md`
- 实现代码：`packages/core-engine/src/actions/ai-ask-action.ts`
- 测试代码：`packages/core-engine/test/output-list.test.ts`
- 示例脚本：`scripts/sessions/test_multi_output.yaml`
