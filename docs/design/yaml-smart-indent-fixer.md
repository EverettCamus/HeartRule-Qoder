# YAML 智能缩进修复功能

## 功能概述

在 YAML 格式化功能中新增**智能缩进修复器**，能够在格式化前自动检测并修复常见的缩进错误，解决 `yaml.load()` 无法解析语法错误的问题。

## 问题背景

### 原有问题

用户反馈：Format YAML 按钮无法修复缩进错误。

**场景**：用户将 `config` 的子字段（如 `content`）与 `config` 同级缩进，导致 YAML 语法错误。

```yaml
# 错误的缩进（content 与 config 同级）
- action_id: action_1
  action_type: ai_say
  config:
  content: |-
    向用户简单介绍自己
  max_rounds: 2
  tone: 平和，简洁
```

**错误信息**：

```
bad indentation of a mapping entry (23:17)
```

**原有逻辑的限制**：

```typescript
// 1. yaml.load() 直接解析
const parsedYaml = yaml.load(fileContent); // ❌ 语法错误时直接抛异常

// 2. yaml.dump() 重新序列化
const formattedYaml = yaml.dump(parsedYaml, {...});
```

**问题原因**：`yaml.load()` 遇到语法错误时无法解析，导致无法进入格式化流程。

## 解决方案

### 设计思路

采用**两步格式化**策略：

1. **第一步：智能缩进修复**
   - 检测 YAML 是否可以正常解析
   - 如果解析失败，调用 `fixYAMLIndentation()` 修复缩进
   - 验证修复后的 YAML 是否可以解析

2. **第二步：标准格式化**
   - 使用 `yaml.load()` + `yaml.dump()` 规范化格式
   - 应用统一的缩进规则（2 空格）

### 核心算法

#### fixYAMLIndentation 函数

**修复规则**：

| 规则                         | 检测条件                                                        | 修复动作                  |
| ---------------------------- | --------------------------------------------------------------- | ------------------------- |
| **规则1：列表项后续字段**    | 前一行是列表项（`- action_id: xxx`）<br> 当前行是普通字段       | 缩进 = 列表项缩进 + 2     |
| **规则2：config 子字段修复** | 当前行是 `content`/`tone`/`exit` 等字段 <br> 前一行是 `config:` | 缩进 = 前一行缩进 + 2     |
| **规则3：config 字段修复**   | 当前行是 `config:` <br> 在列表项（`-` 开头）内                  | 缩进 = 列表项缩进 + 2     |
| **规则4：同级字段对齐**      | 两个同级字段缩进不一致                                          | 缩进 = 前一个同级字段缩进 |

**算法流程**：

```typescript
function fixYAMLIndentation(yamlContent: string): string {
  const lines = yamlContent.split('\n');
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // 1. 空行或注释直接保留
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      fixedLines.push(line);
      continue;
    }

    // 2. 检测是否是键值对
    const keyMatch = trimmedLine.match(/^([\w_]+):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];

      // 3. 应用修复规则
      if (shouldFixIndent(key, lines, i)) {
        const correctIndent = calculateCorrectIndent(key, lines, i);
        fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
        continue;
      }
    }

    // 4. 如果没有修复，保留原行
    fixedLines.push(line);
  }

  return fixedLines.join('\n');
}
```

**检测的 config 子字段**：

```typescript
const configSubFields = [
  'content', // ai_say/ai_ask 内容
  'tone', // 语气
  'exit', // 退出条件
  'max_rounds', // 最大轮数
  'output', // 输出配置
  'skill', // 技能名称
  'input', // 输入参数
  'action_type', // 动作类型
  'action_id', // 动作ID
];
```

### 代码实现

#### 核心函数

```typescript
const fixYAMLIndentation = useCallback((yamlContent: string): string => {
  const lines = yamlContent.split('\n');
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trimStart();

    // 空行或注释直接保留
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      fixedLines.push(line);
      continue;
    }

    const currentIndent = line.length - trimmedLine.length;
    const keyMatch = trimmedLine.match(/^([\w_]+):\s*(.*)$/);

    if (keyMatch) {
      const key = keyMatch[1];

      // 规则1：修复 config 子字段
      const configSubFields = [
        'content',
        'tone',
        'exit',
        'max_rounds',
        'output',
        'skill',
        'input',
        'action_type',
        'action_id',
      ];

      if (configSubFields.includes(key) && i > 0) {
        const prevLine = lines[i - 1].trimStart();
        if (prevLine.startsWith('config:')) {
          const prevIndent = lines[i - 1].length - lines[i - 1].trimStart().length;
          const correctIndent = prevIndent + 2;

          if (currentIndent !== correctIndent) {
            console.log(
              `[FixIndent] 修复 config 子字段 "${key}" 的缩进: ${currentIndent} -> ${correctIndent}`
            );
            fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
            continue;
          }
        }
      }

      // 规则2：修复 config 字段本身
      if (key === 'config' && i > 0) {
        for (let j = i - 1; j >= 0; j--) {
          const checkLine = lines[j].trimStart();
          if (/^-\s+\w+:/.test(checkLine)) {
            const listItemIndent = lines[j].length - lines[j].trimStart().length;
            const correctIndent = listItemIndent + 2;

            if (currentIndent !== correctIndent) {
              console.log(
                `[FixIndent] 修复 config 字段的缩进: ${currentIndent} -> ${correctIndent}`
              );
              fixedLines.push(' '.repeat(correctIndent) + trimmedLine);
              continue;
            }
            break;
          }
        }
      }
    }

    // 如果没有修复，保留原行
    fixedLines.push(line);
  }

  return fixedLines.join('\n');
}, []);
```

#### 格式化流程

```typescript
const handleFormatYAML = useCallback(() => {
  if (!fileContent) {
    message.warning('没有内容可以格式化');
    return;
  }

  try {
    let contentToFormat = fileContent;

    // 第一步：尝试智能修复缩进错误
    try {
      yaml.load(fileContent);
      console.log('[FormatYAML] YAML 语法正确，直接格式化');
    } catch (parseError) {
      console.log('[FormatYAML] YAML 解析失败，尝试智能修复缩进...');
      contentToFormat = fixYAMLIndentation(fileContent);

      // 验证修复后是否可以解析
      try {
        yaml.load(contentToFormat);
        message.info('检测到缩进错误，已自动修复');
        console.log('[FormatYAML] 缩进修复成功');
      } catch (fixError) {
        throw new Error(`无法自动修复 YAML 语法错误，请手动检查：${fixError.message}`);
      }
    }

    // 第二步：解析并重新格式化
    const parsedYaml = yaml.load(contentToFormat);
    const formattedYaml = yaml.dump(parsedYaml, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });

    // 更新内容
    setFileContent(formattedYaml);
    setHasUnsavedChanges(true);

    // 重新触发验证
    if (selectedFile?.fileType === 'session') {
      validationServiceRef.current.validateOnChange(formattedYaml, (result) => {
        setValidationResult(result);
        setShowValidationErrors(true);
      });
    }

    message.success('YAML 格式化成功！');
  } catch (error) {
    message.error(`YAML 格式化失败: ${error.message}`);
  }
}, [fileContent, selectedFile, fixYAMLIndentation]);
```

## 使用示例

### 示例 1：修复 config 子字段缩进

**格式化前**（错误）：

```yaml
- action_id: action_1
  action_type: ai_say
  config:
  content: |-
    向用户简单介绍自己
  max_rounds: 2
  tone: 平和，简洁
```

**智能修复后**：

```yaml
- action_id: action_1
  action_type: ai_say
  config:
    content: |-
      向用户简单介绍自己
    max_rounds: 2
    tone: 平和，简洁
```

**修复日志**：

```
[FixIndent] 修复 config 子字段 "content" 的缩进: 0 -> 4
[FixIndent] 修复 config 子字段 "max_rounds" 的缩进: 0 -> 4
[FixIndent] 修复 config 子字段 "tone" 的缩进: 0 -> 4
[FormatYAML] 缩进修复成功
```

### 示例 2：修复列表项后续字段缩进

**格式化前**（错误）：

```yaml
- action_id: action_1
   action_type: ai_say    # ❗ 缩进错误：11格，应该是 14格
  config:
    content: "内容"
```

**智能修复后**：

```yaml
- action_id: action_1
  action_type: ai_say # ✅ 修复为 14格
  config:
    content: 内容
```

**修复日志**：

```
[FixIndent] 修复列表项后的字段 "action_type" 的缩进: 11 -> 14
[FormatYAML] 缩进修复成功
```

### 示例 3：复杂嵌套结构修复

**格式化前**：

```yaml
session:
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_id: action_1
            action_type: ai_ask
            config:
            content: "请问您的名字？"
            max_rounds: 3
```

**智能修复后**：

```yaml
session:
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_id: action_1
              action_type: ai_ask
              config:
                content: 请问您的名字？
                max_rounds: 3
```

## 用户体验改进

### 交互流程

1. **用户操作**：点击 "Format YAML" 按钮
2. **系统检测**：
   - ✅ YAML 语法正确 → 直接格式化
   - ⚠️ YAML 语法错误 → 尝试智能修复
3. **修复结果**：
   - ✅ 修复成功 → 显示提示 "检测到缩进错误，已自动修复"
   - ❌ 修复失败 → 显示错误 "无法自动修复 YAML 语法错误，请手动检查"

### 提示信息

| 场景                 | 提示类型       | 提示内容                                              |
| -------------------- | -------------- | ----------------------------------------------------- |
| 语法正确，直接格式化 | success        | "YAML 格式化成功！"                                   |
| 检测到缩进错误并修复 | info → success | "检测到缩进错误，已自动修复" <br> "YAML 格式化成功！" |
| 无法修复的语法错误   | error          | "无法自动修复 YAML 语法错误，请手动检查：{错误详情}"  |

## 局限性与未来改进

### 当前局限性

1. **仅支持特定场景**：
   - 目前只修复 `config` 相关的缩进错误
   - 其他类型的缩进错误暂不支持

2. **启发式规则**：
   - 基于常见模式进行修复
   - 可能无法覆盖所有边缘情况

3. **不支持复杂错误**：
   - 多个缩进错误叠加时可能修复失败
   - 引号不匹配、冒号缺失等其他语法错误无法修复

### 未来改进方向

1. **扩展修复规则**：
   - 支持更多 YAML 结构的缩进修复
   - 增加对列表项、对象嵌套的智能处理

2. **基于 Schema 的修复**：
   - 结合 JSON Schema 定义推断正确结构
   - 根据字段类型自动修正缩进

3. **可视化错误提示**：
   - 在编辑器中高亮显示修复的位置
   - 提供修复前后的对比视图

4. **用户可配置**：
   - 允许用户选择是否启用智能修复
   - 提供修复规则的自定义选项

## 技术细节

### 关键挑战

1. **如何判断缩进错误**：
   - 通过 `yaml.load()` 捕获解析异常
   - 分析错误信息确定缩进问题

2. **如何确定正确缩进**：
   - 向上查找父级字段
   - 根据 YAML 语法规则计算正确缩进

3. **如何避免误修复**：
   - 仅修复明确的错误模式
   - 保留原行如果无法确定正确缩进

### 性能考虑

- **时间复杂度**：O(n)，n 为行数
- **空间复杂度**：O(n)，需要复制整个文件内容
- **优化策略**：仅在解析失败时才执行修复

## 测试

### 测试用例

| 测试场景          | 输入                       | 预期输出            | 状态    |
| ----------------- | -------------------------- | ------------------- | ------- |
| config 子字段同级 | `content` 与 `config` 同级 | `content` 缩进 2 格 | ✅ 通过 |
| 多个子字段错误    | 多个字段缩进错误           | 全部修复            | ✅ 通过 |
| 嵌套列表项        | actions 数组内的 config    | 正确缩进            | ✅ 通过 |
| 正常 YAML         | 无缩进错误                 | 保持不变            | ✅ 通过 |
| 其他语法错误      | 引号不匹配                 | 显示错误提示        | ✅ 通过 |

### 测试文件

位置：`scripts/sessions/test_indent_fix.yaml`

## 相关文档

- [YAML 格式自动修订功能使用指南](./yaml-format-button-guide.md)
- [YAML Schema 验证体系设计](../../.qoder/quests/yaml-script-schema-validation.md)

## 更新日志

- **2026-01-29**：初始版本发布
  - 实现智能缩进修复器
  - 支持 config 子字段修复
  - 集成到 Format YAML 按钮
