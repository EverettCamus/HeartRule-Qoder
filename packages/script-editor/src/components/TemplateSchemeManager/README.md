# TemplateSchemeManager 组件

## 概述

模板方案管理器组件，用于创建、编辑、删除模板方案。支持从现有方案复制创建新方案。

## 功能特性

1. **方案列表**
   - 显示所有可用方案（default + custom下的所有方案）
   - 标记系统方案（只读）和自定义方案（可编辑）
   - 支持搜索和过滤

2. **创建方案**
   - 基于现有方案复制创建
   - 输入方案名称和描述
   - 自动创建 `_system/config/custom/{scheme_name}/` 目录
   - 从default或其他方案复制模板文件

3. **编辑方案**
   - 修改方案描述（更新README.md）
   - 仅允许编辑自定义方案

4. **删除方案**
   - 仅允许删除自定义方案
   - 确认对话框
   - 自动刷新方案列表

## 组件接口

```typescript
interface TemplateSchemeManagerProps {
  visible: boolean;          // 是否显示
  projectId: string;          // 工程ID
  onClose: () => void;        // 关闭回调
  onSchemeChange?: () => void; // 方案列表变化时的回调
}
```

## 使用示例

```tsx
import TemplateSchemeManager from './components/TemplateSchemeManager';

function MyComponent() {
  const [managerVisible, setManagerVisible] = useState(false);
  const projectId = 'your-project-id';

  const handleSchemeChange = () => {
    // 重新加载方案列表
    console.log('方案列表已更新');
  };

  return (
    <>
      <Button onClick={() => setManagerVisible(true)}>
        管理模板方案
      </Button>

      <TemplateSchemeManager
        visible={managerVisible}
        projectId={projectId}
        onClose={() => setManagerVisible(false)}
        onSchemeChange={handleSchemeChange}
      />
    </>
  );
}
```

## API依赖

组件依赖以下API：

- `GET /api/projects/:projectId/template-schemes` - 获取方案列表
- `POST /api/projects/:projectId/template-schemes` - 创建方案
- `PATCH /api/projects/:projectId/template-schemes/:schemeName` - 更新方案描述
- `DELETE /api/projects/:projectId/template-schemes/:schemeName` - 删除方案

## 子组件

### CreateSchemeModal

创建方案对话框，支持：
- 输入方案名称（验证格式和唯一性）
- 输入方案描述
- 选择要复制的源方案（默认为default）

### EditSchemeModal

编辑方案对话框，仅支持修改方案描述。

## 样式

样式文件位于 `./style.css`，包含：
- 方案列表样式
- 选中状态样式
- 方案详情面板样式
- 只读提示样式
- 空状态样式

## 权限控制

- **default方案**：系统默认方案，只读，不可编辑或删除
- **自定义方案**：用户创建的方案，可编辑和删除

## 错误处理

- API错误通过 `message.error()` 显示
- 表单验证错误在输入框下方显示
- 网络错误会显示友好的错误提示

## 注意事项

1. 方案名称只能包含字母、数字、下划线和连字符
2. 不能使用保留名称 "default"
3. 删除方案不可恢复，需要用户确认
4. 当前版本暂不支持检查方案是否正在被使用（TODO）
