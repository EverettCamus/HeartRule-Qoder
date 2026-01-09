# 开发指南

本文档为开发者提供HeartRule AI咨询引擎的TypeScript开发指南。

## 环境准备

### 1. Node.js 环境

确保安装 Node.js 18+ 或更高版本：

```bash
node --version
```

### 2. 安装 pnpm

```bash
npm install -g pnpm
```

### 3. 安装依赖

```bash
cd c:\CBT\HeartRule-Qcoder
pnpm install
```

### 4. 配置环境变量

复制 `.env.example` 为 `.env` 并填写必要的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置LLM API密钥和数据库配置：

```
# LLM 配置
VOLCANO_API_KEY=your_volcano_key_here
VOLCANO_ENDPOINT_ID=your_endpoint_id

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/heartrule
```

### 5. 启动数据库

```bash
# 使用 Docker Compose 启动 PostgreSQL
pnpm docker:dev
```

### 6. 初始化数据库

```bash
cd packages/api-server
pnpm db:migrate
pnpm db:init
```

## 项目结构

```
packages/
├── core-engine/         # 核心引擎包
│   ├── src/
│   │   ├── actions/         # Action 实现
│   │   ├── domain/          # 领域模型
│   │   └── engines/         # 六大引擎
│   └── package.json
├── api-server/          # API 服务器
│   ├── src/
│   │   ├── db/              # 数据库 (Drizzle ORM)
│   │   ├── routes/          # API 路由
│   │   └── services/        # 应用服务
│   └── package.json
└── shared-types/        # 共享类型定义
    ├── src/
    │   ├── api/             # API 类型
    │   ├── domain/          # 领域类型
    │   └── enums.ts         # 枚举定义
    └── package.json
```

## 核心概念

### 1. 领域模型

- **Session（会话）**: 一次完整的咨询会话
- **Message（消息）**: 会话中的单条消息
- **Variable（变量）**: 会话中的变量状态
- **Script（脚本）**: YAML 脚本定义

### 2. 脚本层次结构

```
Session（会谈）
  └── Phase（阶段）
      └── Topic（话题）
          └── Action（咨询动作）
```

### 3. Action 类型（MVP阶段）

- `ai_say`: 向用户传达信息
- `ai_ask`: 引导式提问收集信息
- `ai_think`: 内部认知加工
- `use_skill`: 调用咨询技术脚本

## 开发工作流

### 1. 创建新的 Action 类型

在 `packages/core-engine/src/actions/` 目录下创建新文件：

```typescript
import { BaseAction } from './base-action';
import { ActionContext, ActionResult } from '@heartrule/shared-types';

export class MyAction extends BaseAction {
  async execute(context: ActionContext): Promise<ActionResult> {
    // 实现 Action 逻辑
    return {
      success: true,
      message: 'Action executed',
    };
  }
}
```

在 `action-registry.ts` 中注册：

```typescript
import { MyAction } from './my-action';

registry.register('my_action', MyAction);
```

### 2. 开发新的引擎功能

引擎位于 `packages/core-engine/src/engines/` 目录：

- `script-execution/`: 脚本执行引擎
- `llm-orchestration/`: LLM 编排引擎
- `variable-extraction/`: 变量提取引擎
- `memory/`: 记忆引擎

每个引擎都有独立的目录结构和入口文件 `index.ts`。

### 3. 添加 API 端点

在 `packages/api-server/src/routes/` 目录下添加路由：

```typescript
import { FastifyPluginAsync } from 'fastify';

const myRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/my-endpoint', async (request, reply) => {
    // 处理请求
    return { success: true };
  });
};

export default myRoutes;
```

在 `app.ts` 中注册路由：

```typescript
await fastify.register(myRoutes, { prefix: '/api/my' });
```

### 4. 数据库 Schema 修改

编辑 `packages/api-server/src/db/schema.ts`：

```typescript
export const myTable = pgTable('my_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

生成并应用迁移：

```bash
cd packages/api-server
pnpm db:generate
pnpm db:migrate
```

## 测试

### 1. 运行单元测试

```bash
pnpm test
```

### 2. 运行集成测试

```bash
cd packages/api-server
pnpm test:flow
```

### 3. 手动测试

启动开发服务器：

```bash
cd packages/api-server
pnpm dev
```

使用 Web 界面测试：

- 打开 `web/index.html`
- 点击"开始咨询"
- 输入消息进行测试

## 代码规范

### TypeScript 风格

- 使用严格模式 (`strict: true`)
- 优先使用接口 (`interface`) 而非类型别名 (`type`)
- 导出类型时使用 `export type` 或 `export interface`
- 避免使用 `any`，使用 `unknown` 替代

### 命名约定

- 文件名：kebab-case (`my-action.ts`)
- 类名：PascalCase (`MyAction`)
- 函数/变量名：camelCase (`myFunction`)
- 常量：UPPER_SNAKE_CASE (`MAX_RETRIES`)
- 接口：PascalCase (`ActionContext`)

### 代码组织

- 一个文件一个主要导出
- 相关功能组织在同一目录
- 使用 barrel exports (`index.ts`)

## 调试

### 1. 使用 VSCode 调试

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug API Server",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "cwd": "${workspaceFolder}/packages/api-server",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 2. 查看日志

服务器日志会输出到控制台，包含：

- 请求信息
- 脚本执行流程
- LLM 调用详情
- 错误堆栈

### 3. 数据库调试

```bash
# 连接到 PostgreSQL
docker exec -it heartrule-postgres psql -U postgres -d heartrule

# 查看表
\dt

# 查询数据
SELECT * FROM sessions;
```

## 常见问题

### 问题1：类型错误

**现象**：TypeScript 编译报类型错误

**解决**：

1. 检查 `shared-types` 包是否已构建：`cd packages/shared-types && pnpm build`
2. 确保导入路径正确使用别名：`@heartrule/shared-types`
3. 清理并重新构建：`pnpm clean && pnpm build`

### 问题2：数据库连接失败

**现象**：`Database connection error`

**解决**：

1. 确认 Docker 正在运行
2. 检查 `.env` 文件中的 `DATABASE_URL`
3. 重启数据库容器：`pnpm docker:down && pnpm docker:dev`

### 问题3：LLM 调用失败

**现象**：`LLM provider error`

**解决**：

1. 检查 `.env` 中的 API 密钥配置
2. 验证网络连接
3. 查看具体错误日志

## 贡献指南

### 提交代码

1. 创建功能分支：`git checkout -b feature/my-feature`
2. 提交更改：`git commit -m "feat: add my feature"`
3. 推送到远程：`git push origin feature/my-feature`
4. 创建 Pull Request

### Commit 信息规范

使用 Conventional Commits：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `refactor:` 重构
- `test:` 测试相关
- `chore:` 构建/工具相关

## 相关资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Fastify 文档](https://www.fastify.io/docs/latest/)
- [Drizzle ORM 文档](https://orm.drizzle.team/docs/overview)
- [脚本示例](../scripts/)
