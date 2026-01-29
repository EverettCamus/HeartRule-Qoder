# YAML 验证功能使用指南

## 快速开始

### 启动编辑器

```bash
cd c:\CBT\HeartRule-Qcoder
pnpm --filter @heartrule/script-editor dev
```

## 验证功能如何工作

### 自动验证时机

1. **打开文件时** 🔍
   - 从文件树选择任意会谈脚本
   - 编辑器自动验证并显示错误

2. **编辑内容时** ⌨️
   - 在 YAML 编辑器中修改内容
   - 停止输入 500ms 后自动验证
   - 错误面板实时更新

3. **保存文件前** 💾
   - 点击保存按钮或按 Ctrl+S
   - 如果有验证错误，保存被阻止
   - 必须修复所有错误才能保存

4. **手动验证** 🔘
   - 点击左侧面板的 "Validate Script" 按钮
   - 立即执行验证并显示结果

## 验证错误面板

### 位置

YAML 编辑器上方，红色警告框

### 功能

- 显示错误数量
- 可展开每个错误查看详情
- 显示错误路径、类型、消息
- 提供修复建议和正确示例
- 可点击右上角 ✖ 关闭面板

## 废弃字段提示

如果你的脚本包含以下废弃字段，会收到友好的迁移建议：

### 1. content_template → content

```yaml
# ❌ 旧写法
config:
  content_template: 向来访者询问如何称呼

# ✅ 新写法
config:
  content: 向来访者询问如何称呼
```

### 2. question_template → content

```yaml
# ❌ 旧写法
config:
  question_template: 请问如何称呼您？

# ✅ 新写法
config:
  content: 请问如何称呼您？
```

### 3. target_variable → output

```yaml
# ❌ 旧写法
config:
  target_variable: user_name

# ✅ 新写法
config:
  output:
    - get: user_name
      define: 提取用户称呼
```

### 4. extraction_prompt → output[].instruction

```yaml
# ❌ 旧写法
config:
  extraction_prompt: 来访者可以接受的称呼

# ✅ 新写法
config:
  output:
    - get: user_name
      instruction: 来访者可以接受的称呼
```

### 5. required（直接移除）

```yaml
# ❌ 旧写法
config:
  required: false

# ✅ 新写法
config:
  # 直接移除该字段
```

## 常见问题

### Q: 为什么我修改了内容但没立即显示错误？

A: 内容变更验证有 500ms 防抖延迟，停止输入半秒后才会触发。

### Q: 错误面板太占空间怎么办？

A: 点击面板右上角的 ✖ 按钮关闭，错误仍会在保存时阻止你。

### Q: 为什么有些文件没有验证？

A: 目前只对 fileType === 'session' 的会谈脚本启用验证。

### Q: 验证通过但保存失败？

A: 保存失败可能是其他原因（如网络问题），查看控制台日志。

## 测试示例

### 测试脚本（包含多个错误）

```yaml
session_id: test_deprecated_fields
session_name: 测试废弃字段验证
phases:
  - phase_id: phase_1
    topics:
      - topic_id: topic_1
        actions:
          - action_id: action_1
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

**预期验证结果**: 6 个错误

1. 缺少 `content` 字段（必填）
2. 废弃字段 `content_template`
3. 废弃字段 `question_template`
4. 废弃字段 `target_variable`
5. 废弃字段 `extraction_prompt`
6. 废弃字段 `required`

### 修复后的脚本

```yaml
session_id: test_deprecated_fields
session_name: 测试废弃字段验证
phases:
  - phase_id: phase_1
    topics:
      - topic_id: topic_1
        actions:
          - action_id: action_1
            action_type: ai_ask
            config:
              content: 向来访者询问如何称呼
              exit: 收到到来访者的称呼
              output:
                - get: user_name
                  define: 提取用户称呼
                  instruction: 来访者可以接受的称呼
              max_rounds: 3
```

**预期验证结果**: ✅ 验证通过

## 下一步

尝试打开你的旧脚本文件，查看是否有需要迁移的废弃字段！
