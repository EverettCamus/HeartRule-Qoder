# TemplateEditor 组件

模板编辑器组件，用于编辑工程的提示词模板文件（Markdown格式）。

## 功能特性

- **Markdown编辑**：集成 @uiw/react-md-editor，支持实时预览
- **变量插入**：快速插入系统变量和脚本变量占位符
- **实时验证**：防抖机制，自动验证必需变量和模板格式
- **只读保护**：系统默认模板不可修改，需复制到自定义方案
- **未保存提示**：关闭时自动检测未保存更改

## 使用示例

```tsx
import TemplateEditor from './components/TemplateEditor';

function MyComponent() {
  const [editorVisible, setEditorVisible] = useState(false);

  return (
    <>
      <Button onClick={() => setEditorVisible(true)}>
        编辑模板
      </Button>

      <TemplateEditor
        visible={editorVisible}
        projectId="project-123"
        schemeName="custom-scheme1"
        templatePath="ai_ask_v1"
        requiredSystemVars={['who', 'chat']}
        requiredScriptVars={['topic']}
        onClose={() => setEditorVisible(false)}
        onSaved={() => {
          message.success('模板已更新');
          // 刷新相关数据...
        }}
      />
    </>
  );
}
```

## API

### Props

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| visible | boolean | 是 | - | 是否显示编辑器对话框 |
| projectId | string | 是 | - | 工程ID |
| schemeName | string | 是 | - | 模板方案名称（如 'default', 'custom-scheme1'） |
| templatePath | string | 是 | - | 模板文件路径（如 'ai_ask_v1', 'ai_say_v1'） |
| templateType | string | 否 | - | 模板类型标识（未来扩展） |
| requiredSystemVars | string[] | 否 | [] | 必需的系统变量列表 |
| requiredScriptVars | string[] | 否 | [] | 必需的脚本变量列表 |
| onClose | () => void | 是 | - | 关闭编辑器回调 |
| onSaved | () => void | 否 | - | 保存成功后回调 |

### 模板路径说明

模板文件存储在工程的 `_system/config` 目录下：

- **default方案**：`_system/config/default/{templatePath}.md`
- **自定义方案**：`_system/config/custom/{schemeName}/{templatePath}.md`

常见模板路径：
- `ai_ask_v1` - AI问询模板
- `ai_say_v1` - AI陈述模板

### 验证规则

组件会自动验证以下内容：

1. **必需变量**（错误）
   - 检查 `requiredSystemVars` 中的变量是否存在
   - 检查 `requiredScriptVars` 中的变量是否存在
   - 格式：`{{variable_name}}`

2. **推荐内容**（警告）
   - 安全边界声明
   - 输出格式说明

## 子组件

### VariableInserter

变量插入工具，提供下拉菜单快速插入变量占位符。

**Props:**
- `systemVars: string[]` - 系统变量列表
- `scriptVars: string[]` - 脚本变量列表
- `onInsert: (varName: string) => void` - 插入回调

### TemplateValidator

模板验证结果显示组件，实时显示验证状态。

**Props:**
- `validationResult: ValidationResult | null` - 验证结果
- `systemVars: string[]` - 系统变量列表
- `scriptVars: string[]` - 脚本变量列表

## 样式

组件使用独立的 CSS 文件 `style.css`，包含以下样式类：

- `.template-editor-container` - 主容器
- `.template-editor-toolbar` - 工具栏
- `.template-editor-readonly-warning` - 只读警告
- `.template-editor-content` - 编辑器内容区
- `.template-editor-footer` - 底部按钮区

## 注意事项

1. **只读保护**
   - `schemeName === 'default'` 时，模板为只读
   - 保存按钮自动禁用，显示只读警告

2. **防抖验证**
   - 内容变化后500ms触发验证
   - 避免频繁验证影响性能

3. **未保存提示**
   - 关闭时自动检测 `hasChanges`
   - 提示用户确认是否放弃更改

4. **错误处理**
   - 加载模板失败：显示错误提示
   - 模板不存在（404）：自定义方案创建空模板
   - 保存失败：显示具体错误信息

## 开发建议

- 与 `TemplateSchemeManager` 组件配合使用
- 通过 `onSaved` 回调刷新方案列表
- 根据 Action 类型动态设置 `requiredSystemVars`

## 未来扩展

- [ ] 支持光标位置插入变量（而非追加）
- [ ] 支持变量自动补全
- [ ] 支持模板历史版本查看
- [ ] 支持批量模板编辑
