# AGENTS.md - API服务器层

## 架构特点

**服务器配置**:

- Fastify REST API + WebSocket
- TypeScript后端应用（tsc构建）
- PostgreSQL + Redis存储

**模式偏差**:

- ❌ 根目录70+ .ts脚本文件 → 应迁移到scripts/子目录
- ✅ 数据库Schema统一在drizzle/目录
- ❌ Node脚本与API代码混合 → 考虑分离到bin/

## 核心文件路径

```
package.json               # 主配置（构建、测试、数据库迁移）
drizzle.config.ts         # 数据库迁移配置
src/
├── app.ts               # Fastify应用入口
├── routes/              # REST API路由（11个端点）
│   ├── sessions/        # 会话管理API
│   ├── chat/            # 聊天交互API（流式/非流式）
│   └── scripts/         # 脚本管理API
├── db/                  # Drizzle ORM Schema
└── events/              # WebSocket事件处理
scripts/                 # 建议目标目录（用于根目录的70+ .ts文件）
```

## 构建与部署

**开发模式**:

```bash
pnpm --filter @heartrule/api-server dev
pnpm docker:dev           # 启动PostgreSQL + Redis
pnpm --filter @heartrule/api-server db:migrate
```

**构建命令**:

```bash
pnpm --filter @heartrule/api-server build    # TypeScript编译
pnpm --filter @heartrule/api-server typecheck # 类型检查
```

**测试**:

```bash
pnpm --filter @heartrule/api-server test
```

## 数据层约定

**数据库迁移**:

- 使用Drizzle ORM + Drizzle Kit进行迁移
- 迁移文件位置：drizzle/migrations/
- Schema定义：src/db/schema.ts

**存储策略**:

- PostgreSQL: 持久化数据（Sessions, Messages, Users）
- Redis: 会话缓存、WebSocket连接管理
- 本地缓存：用于高频会话变量读取

## API端点分类

### 会话管理（Session API）

- `POST /api/sessions` # 创建会话
- `GET /api/sessions/:id` # 获取会话详情
- `GET /api/sessions/:id/messages` # 消息历史
- `GET /api/users/:userId/sessions` # 用户会话列表

### 聊天交互（Chat API）

- `POST /api/chat` # 非流式消息
- `POST /api/chat/stream` # SSE流式消息

### 脚本管理（Script API）

- `POST /api/scripts` # 创建脚本
- `GET /api/scripts/:id` # 获取脚本详情
- `GET /api/scripts` # 脚本列表
- `POST /api/scripts/:id/validate` # 验证脚本

## 错误处理模式

**HTTP状态码**:

- 200: 成功
- 400: 客户端错误（验证失败）
- 401: 未认证（待实现）
- 404: 资源不存在
- 500: 服务器错误

**响应格式**:

```typescript
{
  success: boolean,
  data?: unknown,
  error?: string,
  validationErrors?: Record<string, string[]>
}
```

## WebSocket事件

**连接流程**:

1. 客户端连接：`ws://localhost:8000/ws`
2. 认证消息：`{"type": "auth", "sessionId": "..."}`
3. 双向消息传递

**事件类型**:

- `session_updated` → Session状态变更
- `action_completed` → Action执行完成
- `error_occurred` → 引擎执行错误

## 监控与日志

**日志格式**:

- 统一格式：`[API] [Timestamp] [Method] [Path]`
- 结构化日志（JSON格式）
- 请求ID追踪（requestId）

**健康检查**:

- `GET /health` → 系统状态检查
- `GET /health/db` → 数据库连接检查
- `GET /health/redis` → Redis连接检查

## 优化建议

**立即修复**:

1. 迁移根目录脚本文件到scripts/子目录
2. 统一TypeScript构建配置（与core-engine一致）
3. 添加API限流（Rate Limiting）

**性能优化**:

1. 实现请求缓存层（Redis）
2. 添加API版本控制（/api/v1/...）
3. 实现请求批处理（GraphQL可选）

**可维护性**:

1. 添加OpenAPI文档自动生成
2. 实现API契约测试
3. 统一错误处理和响应格式

## 专门技能推荐

**适合技能**:

- `internal-comms`: API日志、错误处理结构化
- `doc-coauthoring`: API文档、接口规格说明
- `webapp-testing`: API端点测试（Postman替代）

**核心Agent提示**:

- 提到"API端点"、"REST接口" → 参考此文档
- 提到"数据库迁移"、"PostgreSQL" → 检查drizzle/配置
- 提到"WebSocket通信" → 查看events/目录
