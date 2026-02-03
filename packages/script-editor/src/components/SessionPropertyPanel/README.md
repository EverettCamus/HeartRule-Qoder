# SessionPropertyPanel 组件

## 概述

`SessionPropertyPanel` 是用于编辑Session（会谈脚本）级别配置的属性面板组件。

## 功能特性

1. **基本信息编辑**
   - 会谈名称（必填，最大100字符）
   - 版本号（格式验证：x.y.z）
   - 描述（最大500字符）

2. **模板方案配置**
   - 选择模板方案（从 `_system/config/` 目录读取）
   - 显示方案描述
   - 支持"自动选择"（使用default层）

3. **管理功能**
   - 查看方案详情
   - 管理模板方案（打开模板方案管理器）

## Props

```typescript
interface SessionPropertyPanelProps {
  sessionData: SessionData;              // Session数据
  availableSchemes: TemplateScheme[];    // 可用的模板方案列表
  onSave: (data: SessionData) => void;   // 保存回调
  onManageSchemes?: () => void;          // 管理方案回调（可选）
  onViewSchemeDetails?: (schemeName: string) => void;  // 查看详情回调（可选）
}
```

## 使用示例

```tsx
import { SessionPropertyPanel } from '@/components/SessionPropertyPanel';

function MyEditor() {
  const [sessionData, setSessionData] = useState({
    name: 'CBT抑郁症评估会谈',
    description: '基于CBT理论的抑郁症初步评估',
    version: '1.0.0',
    template_scheme: 'default',
  });

  const availableSchemes = [
    { name: 'default', description: '系统默认模板', isDefault: true },
    { name: 'crisis_intervention', description: '危机干预专用', isDefault: false },
  ];

  return (
    <SessionPropertyPanel
      sessionData={sessionData}
      availableSchemes={availableSchemes}
      onSave={(data) => {
        console.log('保存Session配置:', data);
        setSessionData(data);
      }}
      onManageSchemes={() => {
        console.log('打开模板方案管理器');
      }}
      onViewSchemeDetails={(name) => {
        console.log('查看方案详情:', name);
      }}
    />
  );
}
```

## 集成到编辑器

在 `ProjectEditor/EditorContent.tsx` 中集成：

```typescript
// 1. 导入组件
import { SessionPropertyPanel } from '@/components/SessionPropertyPanel';

// 2. 添加状态
const [editingType, setEditingType] = useState<'session' | 'phase' | 'topic' | 'action' | null>(null);
const [availableSchemes, setAvailableSchemes] = useState<TemplateScheme[]>([]);

// 3. 加载可用方案（在组件挂载时）
useEffect(() => {
  if (projectId) {
    projectsApi.getTemplateSchemes(projectId).then(setAvailableSchemes);
  }
}, [projectId]);

// 4. 添加Session配置按钮
<Button 
  type={editingType === 'session' ? 'primary' : 'default'}
  onClick={() => setEditingType('session')}
>
  📄 Session 配置
</Button>

// 5. 在属性面板区域渲染
{editingType === 'session' && parsedScript && (
  <SessionPropertyPanel
    sessionData={parsedScript.script}
    availableSchemes={availableSchemes}
    onSave={handleSessionSave}
    onManageSchemes={() => setSchemeManagerVisible(true)}
  />
)}
```

## 表单验证规则

1. **会谈名称**
   - 必填
   - 最大长度：100字符

2. **版本号**
   - 格式：`x.y.z`（例如：`1.0.0`）
   - 正则验证：`/^\d+\.\d+\.\d+$/`

3. **描述**
   - 可选
   - 最大长度：500字符

4. **模板方案**
   - 可选（不选择时使用default层）
   - 必须是 `availableSchemes` 中的有效方案

## 样式自定义

组件使用独立的CSS文件 (`style.css`)，可以通过以下CSS类进行自定义：

- `.session-property-panel` - 主容器
- `.session-property-header` - 头部区域
- `.session-property-form` - 表单区域
- `.scheme-description` - 方案描述框
- `.scheme-actions` - 管理按钮区域
- `.session-property-actions` - 底部按钮区域

## 测试

测试文件：`SessionPropertyPanel.test.tsx`

运行测试（需要先安装测试依赖）：
```bash
cd packages/script-editor
npm install --save-dev @testing-library/react @testing-library/user-event @vitest/ui
npm test
```

## 状态管理

组件内部维护以下状态：
- `hasChanges` - 表单是否有未保存的修改
- `selectedScheme` - 当前选中的模板方案

当 `sessionData` prop 更新时，组件会自动重置表单并清除 `hasChanges` 状态。

## 注意事项

1. **保存逻辑**：组件不直接修改YAML文件，而是通过 `onSave` 回调将数据传递给父组件处理

2. **方案验证**：选择的 `template_scheme` 应该在后端进行验证，确保对应的目录存在

3. **未保存提示**：当 `hasChanges` 为true时，建议在用户离开页面前显示确认对话框

4. **权限控制**：如果需要，可以通过props传入 `readOnly` 属性禁用编辑功能

## 相关组件

- `TemplateSchemeManager` - 模板方案管理器（T19）
- `TemplateEditor` - 模板编辑器（T20）
- `PhaseTopicPropertyPanel` - Phase/Topic属性面板（已存在）
- `ActionPropertyPanel` - Action属性面板（已存在）

## 更新历史

- **2026-02-01**：初始版本，实现基本的Session配置编辑功能
