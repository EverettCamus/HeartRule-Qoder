# AI动作配置项新增功能说明

## 概述

本次更新为可视化编辑器的`ai_say`和`ai_ask`动作类型添加了新的配置项支持,使得会谈脚本可以更精细地控制AI的交互行为。

## 新增配置项

### 1. ai_say 动作类型

#### 新增字段

- **require_acknowledgment** (布尔值，默认：true)
  - 说明: 是否需要用户确认后才继续
  - 用途: 控制AI说话后是否必须等待用户响应
  - 示例: `require_acknowledgment: true`

- **max_rounds** (数值，默认：1)
  - 说明: 最大交互轮数
  - 用途: 限制该动作的交互次数
  - 取值范围: 1-10
  - 示例: `max_rounds: 2`

#### YAML配置示例

```yaml
- action_type: "ai_say"
  action_id: "welcome_greeting"
  config:
    content_template: "欢迎来到心理咨询室，我是您的AI助手。"
    require_acknowledgment: true  # 需要用户确认
    max_rounds: 1                 # 最多交互1轮
    tone: "warm"                  # 温暖的语气
```

### 2. ai_ask 动作类型

#### 新增字段

- **question_template** (字符串)
  - 说明: 问题模板（与content_template同义，更语义化）
  - 用途: 定义向用户提问的问题内容
  - 示例: `question_template: "请告诉我你的名字"`

- **target_variable** (字符串)
  - 说明: 目标变量名
  - 用途: 指定将用户回答提取到哪个变量
  - 示例: `target_variable: "user_name"`

- **extraction_prompt** (字符串)
  - 说明: 提取提示词
  - 用途: 指导AI如何从用户回答中提取信息
  - 示例: `extraction_prompt: "从用户回答中提取姓名或昵称"`

- **required** (布尔值，默认：false)
  - 说明: 是否必填
  - 用途: 标记该问题是否必须获得有效回答
  - 示例: `required: true`

- **max_rounds** (数值，默认：3)
  - 说明: 最大交互轮数
  - 用途: 限制提问的最大尝试次数
  - 取值范围: 1-10
  - 示例: `max_rounds: 5`

- **exit** (字符串)
  - 说明: 退出条件
  - 用途: 描述何时结束该动作
  - 示例: `exit: "成功获取用户姓名"`

- **output** (数组，可选)
  - 说明: 高级输出配置
  - 用途: 支持提取多个变量
  - 示例: 见下方

#### YAML配置示例（基础用法）

```yaml
- action_type: "ai_ask"
  action_id: "ask_name"
  config:
    question_template: "可以告诉我你的名字吗？"
    target_variable: "user_name"           # 提取到user_name变量
    extraction_prompt: "提取用户的姓名"    # 提取规则
    required: true                         # 必填
    max_rounds: 3                          # 最多问3次
    exit: "成功获取用户姓名"
```

#### YAML配置示例（高级用法 - 多变量提取）

```yaml
- action_type: "ai_ask"
  action_id: "ask_symptoms"
  config:
    content_template: "请详细描述你的症状"
    output:                                # 提取多个变量
      - get: "symptom_description"
        define: "症状描述"
      - get: "severity_level"
        define: "严重程度评估"
    max_rounds: 5
```

## 可视化编辑器界面

### ai_say 编辑面板

新增的UI控件：

1. **Require Acknowledgment** - 开关控件（Switch）
   - 标签带有tooltip说明："是否需要用户确认后才继续"
   - 默认开启（true）

2. **Max Rounds** - 数字输入框（InputNumber）
   - 范围：1-10
   - 标签带有tooltip说明："最大交互轮数"
   - 默认值：1

### ai_ask 编辑面板

新增的UI控件：

1. **Question Template** - 多行文本框（TextArea）
   - 原"Prompt Content"更名为"Question Template"
   - 更符合提问场景的语义

2. **Target Variable** - 文本输入框（Input）
   - 提示：e.g. user_name
   - Tooltip："将用户回答提取到的变量名"

3. **Required** - 复选框（Checkbox）
   - Tooltip："是否必填"

4. **Extraction Prompt** - 多行文本框（TextArea）
   - Tooltip："如何从用户回答中提取信息的提示词"

5. **Max Rounds** - 数字输入框（InputNumber）
   - 范围：1-10
   - Tooltip："最大交互轮数"
   - 默认值：3

6. **Advanced Output Configuration** - 动态列表（Form.List）
   - 支持添加多个输出变量
   - 每个变量包含：get（变量名）、define（变量说明）

## 数据双向绑定

### YAML → 可视化界面

解析YAML时，系统会自动将config中的字段映射到前端数据结构：

```javascript
// ai_say 映射
{
  type: 'ai_say',
  ai_say: config.content_template,
  tone: config.tone,
  require_acknowledgment: config.require_acknowledgment,  // 新增
  max_rounds: config.max_rounds,                          // 新增
}

// ai_ask 映射
{
  type: 'ai_ask',
  ai_ask: config.question_template || config.content_template,
  target_variable: config.target_variable,                // 新增
  extraction_prompt: config.extraction_prompt,            // 新增
  required: config.required,                              // 新增
  max_rounds: config.max_rounds,                          // 新增
  exit: config.exit,
  output: config.output || [...],
}
```

### 可视化界面 → YAML

保存时，系统会将前端数据映射回YAML的config格式：

```javascript
// ai_say 反向映射
config: {
  content_template: action.ai_say,
  tone: action.tone,
  require_acknowledgment: action.require_acknowledgment,  // 新增
  max_rounds: action.max_rounds,                          // 新增
}

// ai_ask 反向映射
config: {
  question_template: action.ai_ask,
  target_variable: action.target_variable,                // 新增
  extraction_prompt: action.extraction_prompt,            // 新增
  required: action.required,                              // 新增
  max_rounds: action.max_rounds,                          // 新增
  exit: action.exit,
  output: action.output,
}
```

## 兼容性说明

### 向后兼容

- 所有新字段均为可选字段，不影响现有脚本
- 未设置新字段时使用默认值
- 旧版YAML脚本可以正常加载和编辑

### 默认值策略

根据用户偏好记忆，`require_acknowledgment`默认值设为`true`，确保关键操作需要用户显式确认，增强操作安全性。

其他字段的默认值：
- `ai_say.max_rounds`: 1
- `ai_ask.max_rounds`: 3
- `ai_ask.required`: false

## 使用建议

### ai_say 使用场景

1. **重要信息告知**
   ```yaml
   require_acknowledgment: true
   max_rounds: 1
   ```
   适用于：知情同意、重要提醒、关键说明

2. **普通信息展示**
   ```yaml
   require_acknowledgment: false
   max_rounds: 1
   ```
   适用于：一般性说明、过渡性话语

### ai_ask 使用场景

1. **必填信息收集**
   ```yaml
   required: true
   max_rounds: 3
   ```
   适用于：姓名、年龄等必需信息

2. **可选信息收集**
   ```yaml
   required: false
   max_rounds: 2
   ```
   适用于：补充信息、可选问题

3. **复杂信息提取**
   ```yaml
   output:
     - get: "主要症状"
       define: "描述"
     - get: "持续时间"
       define: "天数"
   max_rounds: 5
   ```
   适用于：需要提取多个维度信息的场景

## 实现文件列表

### 类型定义
- `packages/script-editor/src/types/action.ts`
  - 更新AiSayAction和AiAskAction接口

### 解析逻辑
- `packages/script-editor/src/pages/ProjectEditor/index.tsx`
  - parseYamlToScript: YAML → 前端数据结构
  - syncPhasesToYaml: 前端数据结构 → YAML

### UI组件
- `packages/script-editor/src/components/ActionPropertyPanel/index.tsx`
  - 表单字段映射
  - UI控件渲染
  - 数据保存逻辑

## 测试验证

测试文件位置：
- `packages/api-server/test-new-config.yaml` - 测试YAML配置
- `packages/api-server/test-new-config-import.ts` - 测试脚本

运行测试：
```bash
cd packages/api-server
npx tsx test-new-config-import.ts
```

测试覆盖：
- ✅ YAML解析正确性
- ✅ 新字段读取
- ✅ 前端数据映射
- ✅ 类型兼容性
- ✅ 默认值处理

## 总结

本次更新实现了：
1. ✅ 类型定义扩展 - 支持新配置项
2. ✅ YAML双向映射 - 解析和生成均支持新字段
3. ✅ 可视化编辑界面 - 友好的UI控件
4. ✅ 数据验证 - 合理的取值范围和默认值
5. ✅ 向后兼容 - 不影响现有脚本
6. ✅ 测试验证 - 确保功能正常

现在可视化编辑器已经完整支持ai_say和ai_ask的所有新配置项！
