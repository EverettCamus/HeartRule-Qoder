# YAML 格式自动修订功能使用指南

## 功能概述

在脚本编辑器的 YAML 编辑模式下，新增了"Format YAML"按钮，可以自动修订 YAML 格式问题。

## 功能位置

### 按钮位置

**位置**：左侧边栏（Sider）→ File Details 区域 → Quick Actions 部分 → "Format YAML" 按钮

**显示位置**：

- 在"View Version History"按钮下方
- 在"Validate Script"按钮上方

### 如何找到按钮

**显示条件**（必须同时满足）：

1. ✅ **左侧边栏必须是展开状态**
   - 查看左侧边栏顶部的折叠按钮（`<` 或 `>` 图标）
   - 如果边栏被折叠（只显示一个窄条），点击 `>` 按钮展开
2. ✅ **必须选中一个文件**
   - 在左侧文件树中点击任意文件
   - 文件被选中后会高亮显示
3. ✅ **在 File Details 区域向下滚动**
   - 左侧边栏底部显示 "File Details" 标题
   - 向下滚动找到 "Quick Actions" 部分
   - "Format YAML" 按钮就在这里

**注意**：如果没有选中文件，"File Details" 区域会显示 "No file selected"，此时看不到按钮。

### 可视化说明

```
左侧边栏（Sider）
┌─────────────────────────────┐
│ [<] 折叠按钮                │  ← 确保这里是 [<] (展开状态)
├─────────────────────────────┤
│ Project Files               │
│ ├─ sessions/               │
│ │  └─ test.yaml           │  ← 点击文件选中
│ └─ techniques/             │
├─────────────────────────────┤
│ File Details                │  ← 向下滚动到这里
│ ─────────────────────────── │
│ File Name: test.yaml        │
│ File Type: session          │
│ ─────────────────────────── │
│ Quick Actions               │  ← "Format YAML" 按钮在这里！
│ [View Version History]      │
│ [Format YAML]              │  ← 这就是按钮！
│ [Validate Script]           │
└─────────────────────────────┘
```

## 主要功能

### 1. 自动格式化 YAML

- **统一缩进**：自动将所有缩进统一为 2 空格
- **规范化键值对**：移除键值对之间的多余空格
- **优化行宽**：每行最大 120 字符，超长自动换行
- **保持键顺序**：不改变原有的键顺序

### 2. 自动触发验证

- 格式化完成后自动重新验证脚本
- 显示验证结果和错误提示
- 帮助快速发现格式修复后的剩余问题

### 3. 标记未保存状态

- 格式化后自动标记为未保存
- 提醒用户保存修改

## 使用场景

### 场景 1：修复缩进错误

**问题**：YAML 文件中缩进不一致，导致验证失败

**解决方法**：

1. 在 YAML 编辑模式下打开有问题的文件
2. 点击"Format YAML"按钮
3. 检查格式化后的内容
4. 保存文件

**示例**：

```yaml
# 格式化前（缩进混乱）
session:
  phases:
    - phase_id: 'phase_1'
      topics:
        - topic_id: 'topic_1'
          actions:
            - action_id: action_1
              config:
                content: '内容' # 多余的缩进
```

```yaml
# 格式化后（统一 2 空格）
session:
  phases:
    - phase_id: phase_1
      topics:
        - topic_id: topic_1
          actions:
            - action_id: action_1
              config:
                content: 内容
```

### 场景 2：清理粘贴内容

**问题**：从其他地方复制粘贴的 YAML 代码格式不规范

**解决方法**：

1. 粘贴内容到编辑器
2. 点击"Format YAML"按钮
3. 自动规范化格式
4. 保存文件

### 场景 3：检查废弃字段

**问题**：旧脚本包含废弃字段，但缩进错误导致验证器无法检测

**解决方法**：

1. 点击"Format YAML"修复缩进
2. 查看自动触发的验证结果
3. 根据错误提示修复废弃字段
4. 保存文件

## 格式化配置

当前格式化使用以下配置：

```typescript
{
  indent: 2,           // 使用 2 空格缩进
  lineWidth: 120,      // 每行最大 120 字符
  noRefs: true,        // 不使用引用
  sortKeys: false,     // 保持原有键顺序
  quotingType: '"',    // 统一使用双引号
  forceQuotes: false,  // 仅在必要时使用引号
}
```

## 错误处理

### 情况 1：YAML 语法错误

如果 YAML 文件存在语法错误（如缺少冒号、引号不匹配等），格式化将失败并显示错误消息。

**错误示例**：

```
YAML 格式化失败: unexpected end of the stream within a single quoted scalar
```

**解决方法**：

1. 根据错误提示手动修复语法错误
2. 再次点击"Format YAML"

### 情况 2：空文件

如果当前没有内容，点击按钮会显示警告消息。

**警告消息**：

```
没有内容可以格式化
```

## 技术实现

### 代码位置

- **组件**：`packages/script-editor/src/pages/ProjectEditor/index.tsx`
- **函数**：`handleFormatYAML`（第 908-946 行）
- **按钮**：第 2205-2212 行

### 核心实现

```typescript
const handleFormatYAML = useCallback(() => {
  if (!fileContent) {
    message.warning('没有内容可以格式化');
    return;
  }

  try {
    // 1. 解析 YAML
    const parsedYaml = yaml.load(fileContent);

    // 2. 重新序列化为格式化的 YAML
    const formattedYaml = yaml.dump(parsedYaml, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false,
    });

    // 3. 更新内容
    setFileContent(formattedYaml);
    setHasUnsavedChanges(true);

    // 4. 重新触发验证
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
}, [fileContent, selectedFile]);
```

## 测试

### 测试文件

已准备测试文件：`scripts/sessions/test_format_yaml.yaml`

### 测试步骤

1. 启动编辑器
2. 打开测试项目
3. 选择 `test_format_yaml.yaml` 文件
4. 观察格式不规范的内容
5. 点击"Format YAML"按钮
6. 验证格式化结果

### 预期结果

- 缩进统一为 2 空格
- 键值对之间的多余空格被移除
- 引号规范化
- 自动触发验证并显示结果

## 相关文档

- [Visual Editor 验证功能实现总结](./visual-editor-validation-implementation-summary.md)
- [Visual Editor 验证功能用户指南](./visual-editor-validation-user-guide.md)
- [废弃字段清理文档](../../ai_ask_legacy_fields_cleanup.md)

## 更新日志

- **2026-01-29**：初始版本发布
  - 添加"Format YAML"按钮
  - 实现自动格式化功能
  - 集成验证触发
  - 添加用户指南
