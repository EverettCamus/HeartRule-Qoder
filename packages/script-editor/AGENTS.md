# AGENTS.md - 前端编辑器层

## 技术栈特性

**前端框架**:

- React 18 + TypeScript
- Vite构建工具（热重载、快速构建）
- Tailwind CSS + 自定义样式

**UI架构**:

- 组件化设计，多个子组件有独立README.md
- e2e测试（Playwright）
- 测试结果自动保存到test-results/

**环境隔离**:

- 独立前端包，不耦合后端API
- 通过REST API + WebSocket与后端通信
- 本地开发服务器：Vite Dev Server

## 项目结构

```
src/
├── components/           # React组件
│   ├── TemplateEditor/  # 模板编辑器 + README.md
│   ├── TemplateSchemeManager/ # 方案管理 + README.md
│   ├── SessionPropertyPanel/ # 会话属性面板 + README.md
│   └── ...              # 其他组件
├── pages/               # 页面组件
├── hooks/               # 自定义React Hooks
├── utils/               # 前端工具函数
├── types/               # TypeScript类型定义
├── styles/              # 样式文件（CSS/SCSS）
└── api/                 # API调用封装
e2e/                     # Playwright端到端测试
test-results/            # 测试结果输出目录
docs/                    # 前端特定文档
README.md                # 项目README
package.json             # 前端特定配置
```

## 构建与开发

**开发环境**:

```bash
pnpm --filter @heartrule/script-editor dev    # Vite开发服务器
```

**构建命令**:

- Vite构建（基于Rollup）
- 自动处理TypeScript + JSX
- 支持ES模块和传统打包

**构建优化**:

- 代码分割（Chunk Splitting）
- 按需加载（Dynamic Imports）
- 打包分析报告（Bundle Analysis）

## 组件设计模式

**组件结构示例**:

```typescript
// 标准功能组件的README.md
export interface ComponentProps {
  // 类型定义
}

export const Component: React.FC<ComponentProps> = (props) => {
  // React组件实现
  return (
    // JSX
  );
}
```

**组件约定**:

1. 每个复杂组件应有自己的README.md
2. 组件设计遵循单一职责原则
3. TypeScript接口优先原则
4. 样式使用CSS-in-JS或Tailwind类

## 状态管理策略

**前端状态**:

- React Context用于全局状态
- 自定义Hooks封装业务逻辑
- 本地状态（useState）用于组件内部
- URL状态用于页面参数

**数据流**:

1. API调用 → React Query/Axios
2. WebSocket实时更新 → 推送通知
3. 本地存储 → localStorage/sessionStorage
4. 状态同步 → 乐观更新 + 错误恢复

## API集成模式

**REST API封装**:

```typescript
// api/client.ts
export const api = {
  sessions: {
    create: (data: CreateSessionRequest) => axios.post('/api/sessions', data),
    get: (id: string) => axios.get(`/api/sessions/${id}`),
    list: (userId: string) => axios.get(`/api/users/${userId}/sessions`),
  },
};
```

**WebSocket集成**:

```typescript
// hooks/useWebSocket.ts
export const useWebSocket = (sessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws`);
    ws.onmessage = (event) => {
      setMessages((prev) => [...prev, JSON.parse(event.data)]);
    };
  }, [sessionId]);
};
```

## 测试策略

**单元测试**:

- Vitest + Testing Library
- 组件渲染测试
- Hook测试

**端到端测试**:

```bash
pnpm --filter @heartrule/script-editor e2e:ui
```

- Playwright测试框架
- 多浏览器测试（Chromium, Firefox, WebKit）
- 测试结果保存到test-results/目录

**测试文件结构**:

```
__tests__/
├── components/           # 组件测试
├── pages/               # 页面测试
├── hooks/               # Hook测试
└── utils/               # 工具函数测试
e2e/
├── spec/                # Playwright测试规范
├── fixtures/            # 测试数据
├── utils/               # 测试工具
└── screenshots/         # 测试截图（如有）
```

## 样式与设计系统

**CSS框架**:

- Tailwind CSS 3.x
- 自定义设计令牌（Design Tokens）
- 响应式断点（Breakpoints）

**组件库扩展**:

- 自定义按钮、输入框、卡片等基础组件
- 布局组件（Grid、Flex、Container）
- 反馈组件（Modal、Toast、Alert）

**动画与交互**:

- Framer Motion或CSS Transitions
- 微交互提升用户体验
- 加载状态处理（Skeleton Screens）

## 性能优化

**加载性能**:

- 图片懒加载
- 代码分割
- 预加载关键资源

**运行时性能**:

- React.memo() 防止不必要的重渲染
- useMemo / useCallback 缓存计算结果
- 虚拟化长列表

**构建优化**:

- Tree-shaking（自动移除未使用代码）
- 压缩与混淆
- 预渲染静态页面

## 可访问性

**ARIA属性**:

- 提供适当的role和aria-\*属性
- 键盘导航支持
- 屏幕阅读器友好

**颜色对比**:

- 满足WCAG AA/AAA标准
- 考虑色盲用户
- 高对比度模式支持

## 开发工作流

**组件开发流程**:

1. 创建组件目录 + README.md
2. 实现TypeScript接口
3. 编写组件实现
4. 添加单元测试
5. 更新组件文档

**API集成流程**:

1. 定义TypeScript接口
2. 创建API客户端
3. 实现React Hook封装
4. 添加错误处理和加载状态

## 专门技能推荐

**适合技能**:

- `frontend-design`: UI组件、设计系统、样式
- `theme-factory`: 主题定制、配色方案
- `webapp-testing`: Playwright测试、组件测试
- `canvas-design`: 图形化编辑器（如有图表需求）

**核心Agent提示**:

- 提到"前端编辑器"、"React组件" → 参考此文档
- 提到"UI测试"、"Playwright" → 检查e2e/目录
- 提到"组件文档缺失" → 检查组件README.md
- 提到"样式问题" → 检查styles/目录和Tailwind配置
