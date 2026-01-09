# HeartRule AI咨询引擎 - TypeScript版本

基于"LLM + YAML脚本"的智能咨询框架，采用TypeScript + Node.js技术栈重构。

## 🎯 项目概述

本项目是HeartRule AI咨询引擎的TypeScript版本，采用Monorepo架构组织代码。系统保持原有六引擎架构（脚本执行、话题调度、意识触发、记忆、变量提取、LLM编排），同时提升类型安全性和开发体验。

## 📦 Monorepo结构

```
HeartRule-Qcoder/
├── packages/
│   ├── shared-types/         # 共享类型定义和Zod Schema
│   ├── core-engine/          # 核心引擎包（六大引擎）
│   ├── api-server/           # Fastify HTTP API服务
│   ├── client-web/           # React前端应用（游戏化UI）
│   └── scripts-validator/    # YAML脚本验证CLI工具
├── scripts/
│   ├── init-db/              # 数据库初始化脚本
│   └── sessions/             # YAML会谈流程脚本
├── docker-compose.dev.yml    # 开发环境Docker配置
├── pnpm-workspace.yaml       # pnpm工作区配置
├── package.json              # 根package.json
└── tsconfig.json             # TypeScript配置
```

## 🛠 技术栈

### 核心技术
- **运行时**: Node.js v20 LTS
- **语言**: TypeScript 5.x
- **包管理**: pnpm 9.x
- **构建工具**: Vite 5.x (前端) + tsup (库)

### 后端框架
- **API框架**: Fastify 4.x
- **数据库**: PostgreSQL 16 + Drizzle ORM
- **缓存**: Redis 7.2 + ioredis
- **LLM集成**: Vercel AI SDK 4.x

### 前端框架
- **UI框架**: React 18
- **状态管理**: Zustand
- **图形渲染**: Pixi.js (2D游戏化) / Three.js (3D可选)
- **动画**: Framer Motion

### 开发工具
- **测试**: Vitest + Playwright
- **代码规范**: ESLint + Prettier
- **Git钩子**: Husky + lint-staged

## 🚀 快速开始

### 1. 环境要求

- Node.js >= 20.11.0
- pnpm >= 9.0.0
- Docker & Docker Compose (用于本地数据库)

### 2. 安装依赖

```bash
# 安装pnpm（如果未安装）
npm install -g pnpm@9

# 安装项目依赖
pnpm install
```

### 3. 启动开发环境

```bash
# 启动Docker服务（PostgreSQL + Redis）
pnpm docker:dev

# 等待服务健康检查通过后，运行数据库迁移
pnpm db:migrate

# 启动API服务器
pnpm dev
```

### 4. 访问服务

- **API服务**: http://localhost:8000
- **API文档**: http://localhost:8000/docs
- **PostgreSQL管理**: http://localhost:8080 (Adminer)
- **Redis管理**: http://localhost:8081 (Redis Commander)

## 📝 开发命令

```bash
# 开发模式（启动API服务）
pnpm dev

# 构建所有包
pnpm build

# 运行测试
pnpm test              # 运行所有测试
pnpm test:watch        # 监听模式
pnpm test:coverage     # 生成覆盖率报告

# 代码质量
pnpm lint              # 检查代码规范
pnpm lint:fix          # 自动修复
pnpm format            # 格式化代码
pnpm typecheck         # 类型检查

# Docker管理
pnpm docker:dev        # 启动开发环境
pnpm docker:down       # 停止开发环境

# 数据库操作
pnpm db:migrate        # 运行迁移
pnpm db:studio         # 打开Drizzle Studio
```

## 🏗 核心包说明

### @heartrule/shared-types
共享的TypeScript类型定义和Zod Schema验证，供所有包使用。

### @heartrule/core-engine
无界面（Headless）核心引擎，实现六大引擎：
- 脚本执行引擎
- LLM编排引擎
- 变量提取引擎
- 记忆引擎
- 话题调度引擎
- 意识触发引擎

### @heartrule/api-server
基于Fastify的HTTP API服务，提供RESTful和WebSocket接口。

### @heartrule/client-web
React前端应用，支持游戏化UI和实时聊天。

## 🔧 配置说明

### 环境变量

复制 `.env.example` 为 `.env` 并填写实际值：

```bash
cp .env.example .env
```

关键配置项：
- `DATABASE_URL`: PostgreSQL连接字符串
- `REDIS_URL`: Redis连接字符串
- `VOLCANO_API_KEY`: 火山引擎API密钥
- `VOLCANO_ENDPOINT_ID`: DeepSeek端点ID

### TypeScript配置

根目录的 `tsconfig.json` 为基础配置，各包可继承并覆盖：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

## 📚 文档

- [设计文档](.qoder/quests/ai-consulting-engine-architecture.md) - 技术选型和架构设计
- [API文档](docs/api/) - RESTful API接口说明
- [脚本编写指南](docs/scripts/) - YAML脚本开发规范

## 🧪 测试策略

### 单元测试
使用Vitest编写单元测试，覆盖率目标≥80%：

```bash
pnpm test
```

### 集成测试
测试API端点和数据库交互：

```bash
pnpm test --filter api-server
```

### E2E测试
使用Playwright测试完整用户流程：

```bash
pnpm test:e2e
```

## 🐛 常见问题

### Q: pnpm install失败？
A: 确保Node.js版本≥20.11，清除缓存后重试：
```bash
pnpm store prune
pnpm install
```

### Q: Docker服务启动失败？
A: 检查端口占用（5432、6379、8080、8081），确保Docker Desktop运行中。

### Q: 类型检查报错？
A: 先构建shared-types包：
```bash
pnpm --filter @heartrule/shared-types build
```

## 🤝 贡献指南

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开Pull Request

## 📄 许可证

待定

---

**项目状态**: 🚧 开发中（第一阶段：基础设施搭建）

**版本**: 2.0.0

**最后更新**: 2026-01-06
