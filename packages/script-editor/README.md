# 咨询脚本可视化编辑器

基于设计文档实现的云端咨询脚本编辑与调试工具。

## 功能特性

### 已实现（MVP阶段）

- ✅ 数据库Schema扩展（PROJECT、SCRIPT_FILE、PROJECT_DRAFT、PROJECT_VERSION表）
- ✅ 前端应用框架（React + TypeScript + Ant Design）
- ✅ 工程列表页面UI
- ✅ 基础路由结构

### 待实现

- ⏳ 后端API（工程管理、版本控制）
- ⏳ 工程文件管理视图
- ⏳ 脚本编辑器（四层结构导航 + Action编辑）
- ⏳ 变量管理面板
- ⏳ 版本控制界面
- ⏳ 在线调试功能

## 技术栈

**前端**:
- React 18
- TypeScript 5
- Ant Design 5
- React Router 6
- Zustand (状态管理)
- ReactFlow (流程图)
- Vite (构建工具)

**后端**:
- Fastify
- Drizzle ORM
- PostgreSQL 16
- Redis

## 快速开始

### 前置条件

- Node.js >= 20.11.0
- pnpm >= 9.0.0
- PostgreSQL 16
- Docker (可选)

### 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 运行数据库迁移

```bash
# 启动PostgreSQL（如果使用Docker）
docker-compose -f docker-compose.dev.yml up -d

# 执行迁移
pnpm --filter api-server db:migrate
```

### 启动开发服务器

```bash
# 启动后端API服务器（端口3001）
pnpm --filter api-server dev

# 启动前端开发服务器（端口3000）
pnpm --filter script-editor dev
```

访问 `http://localhost:3000` 查看应用。

## 项目结构

```
packages/script-editor/
├── src/
│   ├── pages/
│   │   ├── ProjectList/        # 工程列表页
│   │   │   ├── index.tsx
│   │   │   └── style.css
│   │   └── ProjectEditor/      # 工程编辑器页（开发中）
│   │       └── index.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 数据模型

### 核心表

- `projects` - 脚本工程表
- `script_files` - 脚本文件表（归属于工程）
- `project_drafts` - 工程草稿表
- `project_versions` - 工程版本表

详见设计文档：[visual-consulting-editor.md](../../.qoder/quests/visual-consulting-editor.md)

## 开发进度

参考设计文档的实施路线图：

- [x] **阶段一：MVP核心能力**（进行中）
  - [x] 数据模型扩展
  - [x] 前端应用框架
  - [x] 工程列表页面
  - [ ] 工程CRUD API
  - [ ] 基础编辑界面
  - [ ] 草稿保存和版本发布

- [ ] **阶段二：调试验证能力**
- [ ] **阶段三：体验优化**
- [ ] **阶段四：扩展功能**

## 许可证

UNLICENSED
