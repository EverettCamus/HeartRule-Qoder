---
document_id: 'docs-archive-misc-ai-ask-legacy-fields-cleanup'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/ai_ask_legacy_fields_cleanup.md'
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
**原始路径**: docs/ai_ask_legacy_fields_cleanup.md

---

# ai_ask 遗留字段清理与编辑器增强

## 清理背景

在统一化重构后，项目中仍存在大量使用 `target_variable` 和 `extraction_prompt` 遗留字段的代码和文档。为了保持代码的一致性和可维护性，需要：

1. **清理代码中的遗留字段引用**
2. **更新编辑器UI，强化 `output` 数组的可视化显示**
3. **更新测试脚本和示例**

## 完成的工作

### 1. 编辑器 UI 重构 ✅

#### 文件：`packages/script-editor/src/components/ActionPropertyPanel/index.tsx`

**移除的内容**：

- ❌ "Target Variable" 输入框
- ❌ "Extraction Prompt" 文本框
- ❌ 相关的表单字段和值处理

**新增的功能**：

1. **优化布局**：将字段重新组织为更紧凑的 3 列布局

   ```tsx
   <Row gutter={16}>
     <Col span={8}>Tone Style</Col>
     <Col span={8}>Max Rounds</Col>
     <Col span={8}>Required</Col>
   </Row>
   ```

2. **强化 Output 配置区域**：
   - 中文标题："变量提取配置（Output）"
   - 添加说明文字："配置需要从用户回答中提取的变量，支持提取单个或多个变量"
   - 每个变量卡片显示序号和状态标签（单变量/多变量）
3. **改进的变量卡片设计**：

   ```tsx
   <Card
     title={
       <Space>
         <Text strong>变量 #{index + 1}</Text>
         {fields.length === 1 && <Tag color="blue">单变量</Tag>}
         {fields.length > 1 && <Tag color="green">多变量</Tag>}
       </Space>
     }
   >
     <Form.Item label="变量名（get）" rules={[{ required: true }]} tooltip="需要提取的变量名称">
       <Input placeholder="例：用户姓名、症状描述" />
     </Form.Item>
     <Form.Item label="变量定义（define）" tooltip="帮助 AI 理解如何提取该变量的描述">
       <TextArea rows={2} placeholder="例：从用户回复中提取姓名或昵称" />
     </Form.Item>
   </Card>
   ```

4. **空状态提示**：
   - 当没有配置变量时，显示友好的空状态提示
   - 引导用户添加变量配置

5. **防护机制**：
   - 禁止删除唯一的变量（至少保留一个）
   - 变量名必填验证

**UI 截图示意**：

```
┌─ ai_ask Action 属性面板 ───────────────────┐
│                                             │
│ 📝 Question Template                        │
│ ┌─────────────────────────────────────┐    │
│ │ [文本框，6行]                        │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ ┌───────┬───────┬───────┐                  │
│ │ Tone  │ Max   │ Req'd │                  │
│ │ Style │ Rounds│   ☑   │                  │
│ └───────┴───────┴───────┘                  │
│                                             │
│ 📤 Exit Condition                           │
│ ┌─────────────────────────────────────┐    │
│ │ [文本框，2行]                        │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ ─ 变量提取配置（Output） ─────────────      │
│ 配置需要从用户回答中提取的变量，支持单个  │
│ 或多个变量                                  │
│                                             │
│ ┌─ 变量 #1 ─────[单变量]──────── [×] ┐    │
│ │ 变量名（get）                       │    │
│ │ ┌───────────────────────────────┐  │    │
│ │ │ [例：用户姓名、症状描述]       │  │    │
│ │ └───────────────────────────────┘  │    │
│ │ 变量定义（define）                 │    │
│ │ ┌───────────────────────────────┐  │    │
│ │ │ [例：从用户回复中提取姓名]     │  │    │
│ │ └───────────────────────────────┘  │    │
│ └───────────────────────────────────┘    │
│                                             │
│ [+ 添加输出变量]                            │
│                                             │
└─────────────────────────────────────────┘
```

### 2. 测试脚本更新 ✅

#### 文件：`packages/api-server/update-sample-script.ts`

**修改前**：

```typescript
{
  action_type: 'ai_ask',
  action_id: 'ask_name',
  config: {
    target_variable: 'user_name',
    question_template: '可以告诉我你的名字吗？',
    extraction_prompt: '从用户的回复中提取用户的名字或昵称',
    required: true,
    max_rounds: 3,
  },
}
```

**修改后**：

```typescript
{
  action_type: 'ai_ask',
  action_id: 'ask_name',
  config: {
    question_template: '可以告诉我你的名字吗？',
    exit: '用户提供了姓名或昵称',
    required: true,
    max_rounds: 3,
    output: [
      {
        get: 'user_name',
        define: '从用户的回复中提取用户的名字或昵称',
      },
    ],
  },
}
```

**关键变更**：

- ✅ 移除 `target_variable` 和 `extraction_prompt`
- ✅ 添加 `output` 数组配置
- ✅ 添加 `exit` 条件（模板模式需要）
- ✅ `extraction_prompt` 内容移到 `output[0].define`

#### 文件：`packages/api-server/test-import-api.ts`

同样的模式，更新了测试脚本中的 YAML 内容：

**修改前**：

```yaml
- action_type: 'ai_ask'
  action_id: 'ask_help'
  config:
    target_variable: 'user_need'
    question_template: '请问有什么可以帮助你的吗？'
    extraction_prompt: '提取用户的主要需求'
    required: true
    max_rounds: 3
```

**修改后**：

```yaml
- action_type: 'ai_ask'
  action_id: 'ask_help'
  config:
    question_template: '请问有什么可以帮助你的吗？'
    exit: '用户描述了主要需求'
    required: true
    max_rounds: 3
    output:
      - get: 'user_need'
        define: '提取用户的主要需求'
```

### 3. 剩余的遗留引用

以下文件仍包含 `target_variable` / `extraction_prompt` 引用，但**不需要修改**：

#### 保留原因说明

1. **数据库迁移脚本**（历史记录，不应修改）：
   - `packages/api-server/fix-action1-v2.ts`
   - `packages/api-server/force-update-v3.ts`
   - `packages/api-server/temp-script.yaml`
   - `packages/api-server/update-script-files.ts`

2. **兼容性测试**（验证向后兼容性）：
   - `packages/api-server/test-new-config-import.ts`
   - `packages/api-server/verify-script.ts`

3. **核心引擎**（保留向后兼容支持）：
   - `packages/core-engine/src/actions/ai-ask-action.ts`
   - 保留对 `target_variable` 的读取支持
   - 用于向后兼容旧脚本

4. **文档**（记录历史和迁移指南）：
   - `docs/ai_ask_output_unification_refactor.md`
   - 记录重构历史和迁移方法

## 技术细节

### 编辑器数据流

**表单初始化**：

```typescript
React.useEffect(() => {
  if (action && action.type === 'ai_ask') {
    const formValues = {
      ai_ask: action.ai_ask,
      tone: action.tone || '',
      exit: action.exit || '',
      tolist: action.tolist || '',
      question_template: action.question_template || action.ai_ask,
      required: action.required ?? false,
      max_rounds: action.max_rounds ?? 3,
      output: action.output || [], // 直接使用 output 数组
    };
    form.setFieldsValue(formValues);
  }
}, [action, form]);
```

**表单保存**：

```typescript
if (action.type === 'ai_ask') {
  Object.assign(updatedAction, {
    ai_ask: values.ai_ask,
    tone: values.tone || undefined,
    exit: values.exit || undefined,
    tolist: values.tolist || undefined,
    question_template: values.question_template || values.ai_ask,
    required: values.required,
    max_rounds: values.max_rounds,
    output: values.output || undefined, // 只保存 output
  });
}
```

**关键改进**：

- ❌ 移除了 `target_variable` 和 `extraction_prompt` 的读取和写入
- ✅ 简化了数据流，避免字段转换
- ✅ 直接操作 `output` 数组

### Form.List 动态表单

使用 Ant Design 的 `Form.List` 实现动态增删变量：

```tsx
<Form.List name="output">
  {(fields, { add, remove }) => (
    <>
      {fields.map((field, index) => (
        <Card key={field.key}>
          <Form.Item name={[field.name, 'get']} />
          <Form.Item name={[field.name, 'define']} />
        </Card>
      ))}
      <Button onClick={() => add()}>添加</Button>
    </>
  )}
</Form.List>
```

**特性**：

- 自动管理表单数组状态
- 支持动态添加/删除
- 每个字段独立验证
- 序列化为正确的数组格式

## 用户体验提升

### 1. 更清晰的视觉层次

**之前**：

- Target Variable 和 Extraction Prompt 平铺在表单中
- 不明显的单/多变量区分
- 英文标签，理解成本高

**现在**：

- 独立的"变量提取配置"区域
- 每个变量有自己的卡片
- 明确的单变量/多变量标签
- 中文标签和提示，降低理解成本

### 2. 更好的引导

**添加的提示信息**：

- "配置需要从用户回答中提取的变量，支持提取单个或多个变量"
- 占位符示例："例：用户姓名、症状描述"
- Tooltip 提示："帮助 AI 理解如何提取该变量的描述"

### 3. 防错设计

**安全保护**：

- 至少保留一个变量（禁用唯一删除按钮）
- 变量名必填验证
- 空状态友好提示

## 构建验证

### 编辑器构建

```bash
pnpm --filter script-editor build
```

**结果**：✅ 构建成功

```
✓ 3134 modules transformed.
dist/index.html                     0.47 kB
dist/assets/index-BEJI9rSW.css     10.11 kB
dist/assets/index-D8VAASQd.js   1,186.48 kB
✓ built in 24.34s
```

### 核心引擎构建

之前已通过：

```bash
pnpm --filter core-engine build
✓ Build success in 42ms
```

### 单元测试

之前已通过：

```bash
pnpm test test/output-list
✓ 4 tests passed
```

## 影响范围总结

### ✅ 已更新的文件

1. **编辑器 UI**：
   - `packages/script-editor/src/components/ActionPropertyPanel/index.tsx`

2. **测试脚本**：
   - `packages/api-server/update-sample-script.ts`
   - `packages/api-server/test-import-api.ts`

3. **文档**：
   - `docs/ai_ask_output_unification_refactor.md`（之前创建）
   - `docs/ai_ask_output_list_feature.md`（之前更新）

### ⏸️ 保留的文件（向后兼容）

1. **历史迁移脚本**（不应修改）
2. **兼容性测试**（验证向后兼容）
3. **核心引擎**（保留向后兼容支持）

### 🔄 下一步建议

1. **逐步迁移现有脚本**：
   - 使用 `update-sample-script.ts` 更新数据库中的示例脚本
   - 通知用户更新他们的自定义脚本

2. **标记废弃字段**：
   - 在未来版本中添加 `@deprecated` 注释
   - 在文档中标记为"不推荐使用"

3. **监控使用情况**：
   - 添加日志，监控旧字段的使用情况
   - 为迁移准备数据

## 迁移指南（给用户）

### 如何更新现有的 ai_ask 配置

**步骤1：识别旧配置**

```yaml
# 旧配置
- action_type: 'ai_ask'
  config:
    target_variable: 'user_name'
    extraction_prompt: '提取用户名'
```

**步骤2：转换为新配置**

```yaml
# 新配置
- action_type: 'ai_ask'
  config:
    exit: '用户提供了姓名' # 新增
    output: # 新增
      - get: 'user_name'
        define: '提取用户名'
```

**步骤3：在编辑器中验证**

1. 打开脚本编辑器
2. 选择 ai_ask action
3. 在右侧属性面板中查看"变量提取配置（Output）"区域
4. 确认变量正确显示

## 总结

本次清理工作完成了以下目标：

1. ✅ **编辑器现代化**：移除遗留字段，强化 output 数组的可视化
2. ✅ **代码一致性**：更新测试脚本，使用统一的配置方式
3. ✅ **用户体验**：更清晰的布局、更好的引导、更友好的提示
4. ✅ **向后兼容**：保留核心引擎的兼容性支持
5. ✅ **构建验证**：所有构建和测试通过

**统一化重构现已完成**，项目全面采用 `output` 数组配置方式！

---

**更新时间**：2026-01-22  
**相关文档**：

- [变量闭环统一化重构总结](./ai_ask_output_unification_refactor.md)
- [ai_ask 多变量输出功能说明](./ai_ask_output_list_feature.md)
