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

## 工程架构演进

### 架构变迁历史

**v1.0: 磁盘模式** (已废弃)

- 工程资源存储于物理workspace目录
- 依赖PROJECTS_WORKSPACE环境变量
- 模板文件直接从workspace/{projectId}/\_system/config读取

**v2.0: 混合模式** (Story 0.1-0.4)

- 数据库存储 + 磁盘同步
- SessionManager.syncTemplatesToDisk()临时方案
- DatabaseTemplateProvider基础设施就位

**v2.1: 纯数据库模式** (✅ Story 0.5已完成 - 2026-02-07)

- 所有工程资源存储于PostgreSQL
- 无需物理workspace目录
- 单一数据源,支持分布式部署

### 工程资源位置

当前架构(v2.1)下,所有工程资源存储于数据库:

| 资源类型 | 数据库表          | fileType   | 路径示例                             |
| -------- | ----------------- | ---------- | ------------------------------------ |
| 模板文件 | script_files      | 'template' | \_system/config/default/ai_ask_v1.md |
| 脚本文件 | script_files      | 'session'  | scripts/welcome.yaml                 |
| 表单定义 | script_files      | 'form'     | forms/assessment.yaml                |
| 规则配置 | script_files      | 'rule'     | rules/crisis_detection.yaml          |
| 工程配置 | projects.metadata | -          | JSON字段                             |

### 开发者注意事项

1. **禁止访问文件系统**
   - 新Action开发不应使用fs模块访问工程文件
   - 模板加载通过DatabaseTemplateProvider

2. **模板加载机制**
   - TemplateResolver自动识别数据库模式(projectId存在时)
   - BaseAction.resolveProjectRoot()返回空字符串启用数据库模式

3. **测试环境**
   - 仅需数据库,无需准备workspace目录
   - E2E测试在无workspace情况下验证通过

4. **迁移工具**
   - import-disk-templates-to-db.ts为遗留工具
   - 用于一次性导入历史磁盘模板
   - 新工程创建不再依赖此工具

## 核心概念

### 1. 架构分层（DDD 视角）

本项目遵循领域驱动设计（DDD）原则，分为以下层次：

- **Domain Layer (领域层)**
  - Session 聚合：会话执行 BC 的核心聚合根
  - Script 实体：脚本元数据与解析后结构（Phase/Topic/ActionDefinition）
  - Message 实体/值对象：对话消息
  - Variable 领域对象：变量状态、作用域与历史管理

- **Application Layer (应用层)**
  - 动作执行器：Ai\*Action 类（如 AiSayAction、AiAskAction）
  - 引擎层：ScriptExecutor、LLMOrchestrator、VariableExtractor 等
  - 应用服务：ISessionApplicationService 等（DDD 第三阶段新增）

- **Infrastructure Layer (基础设施层)**
  - API 路由与持久化
  - 外部 LLM 服务适配

### 2. 领域词汇表

| 术语                    | 定义                                                                                 | DDD 层次 |
| ----------------------- | ------------------------------------------------------------------------------------ | -------- |
| **Session**             | 一次完整的咨询会话，是会话执行 BC 的核心聚合根                                       | 领域层   |
| **Script**              | 描述会谈流程的 YAML 脚本，包含 Phase/Topic/ActionDefinition 结构                     | 领域层   |
| **Phase**               | 脚本中的阶段，围绕一个阶段性目标组织相关话题                                         | 领域层   |
| **Topic**               | 脚本中的话题，围绕一个具体的“最小咨询目标”组织一组动作                               | 领域层   |
| **ActionDefinition**    | 脚本中的动作定义（Topic 内的值对象），描述“要做什么”与“业务意图”                     | 领域层   |
| **Ai\*Action Executor** | 动作执行器（应用层服务），在运行时执行 ActionDefinition，协调 LLM/记忆/变量/用户交互 | 应用层   |
| **Message**             | 会话中的单条对话消息，参与 conversationHistory 维护                                  | 领域层   |
| **Variable**            | 会话中的变量状态，用于驱动会谈流程与分支决策                                         | 领域层   |
| **ScriptExecutor**      | 脚本执行引擎，根据脚本结构逐步推进会话执行                                           | 应用层   |
| **LLMOrchestrator**     | LLM 编排引擎，封装与 LLM 的交互与结构化输出                                          | 应用层   |
| **VariableExtractor**   | 变量提取引擎，从对话与 LLM 输出中抽取变量                                            | 应用层   |

### 3. 领域模型

- **Session（会话）**: 一次完整的咨询会话
- **Message（消息）**: 会话中的单条消息
- **Variable（变量）**: 会话中的变量状态
- **Script（脚本）**: YAML 脚本定义

### 4. 脚本层次结构

```
Session（会谈）
  └── Phase（阶段）
      └── Topic（话题）
          └── Action（咨询动作）
```

### 5. Action 类型（MVP阶段）

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

## DDD 重构成果（第三阶段）

### 重构目标

第三阶段主题：**跨上下文协作与工具化增强**

### Story 1: API 层与核心引擎的边界

**成果**：

- ✅ 定义了 `ISessionApplicationService` 应用服务接口
- ✅ 创建 `packages/core-engine/src/application/session-application-service.ts`
- ✅ 作为防腐层（Anti-Corruption Layer）隔离核心引擎与 API 层

**接口设计原则**：

1. 输入参数只包含必要的业务标识与数据，不包含基础设施细节
2. 输出结果携带完整的执行结果与状态，便于 API 层转换为 HTTP 响应
3. 错误处理通过统一的错误类型封装，避免暴露内部异常

**核心类型**：

```typescript
export interface ISessionApplicationService {
  initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse>;
  processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse>;
}
```

### Story 2: 调试信息管道化

**成果**：

- ✅ 创建 `packages/core-engine/docs/debug-info-pipeline.md` 文档
- ✅ 定义统一的调试信息结构 `LLMDebugInfo`
- ✅ 明确调试信息从 LLM 到响应的完整流转路径

**调试信息流转架构**：

```
LLMProvider → LLMOrchestrator → Action.execute() →
ScriptExecutor → SessionApplicationService → API Layer → Script Editor
```

**核心规则**：

1. 单一来源原则：调试信息只在 LLMProvider 层生成
2. 最近调用原则：只保留最近一次 LLM 调用的调试信息
3. 可选传递原则：所有接口中 `debugInfo` 均为可选字段
4. Action 未完成也传递：即使 Action 未完成也应传递调试信息

### Story 3: 版本演进策略

**成果**：

- ✅ 创建 `packages/core-engine/docs/version-evolution-strategy.md` 文档
- ✅ 定义脚本与引擎的版本兼容性策略
- ✅ 明确语义化版本号规范与兼容性矩阵

**核心兼容性规则**：

1. **引擎向后兼容保证**：引擎版本 N 必须能执行版本 N-1 和 N-2 的脚本
2. **脚本向前兼容检测**：脚本版本 N 在引擎版本 N-1 上执行时给出清晰错误提示
3. **字段可选性原则**：新增字段必须是可选的，提供默认值
4. **字段重命名策略**：同时支持旧字段名和新字段名（snake_case ↔ camelCase）

**版本格式**：遵循语义化版本 (Semantic Versioning)

```
MAJOR.MINOR.PATCH
```

### 测试覆盖增强

**成果**：

- ✅ 创建 `packages/core-engine/test/TEST_COVERAGE_PLAN.md` 文档
- ✅ 创建 `packages/core-engine/test/session-application-service.test.ts` 测试框架
- ✅ 定义测试金字塔与优先级策略

**测试覆盖率目标**：

- Domain Layer: 90%
- Actions: 85%
- Engines: 80%
- Application Services: 80%
- **整体: 85%**

### 文档输出

1. **应用服务接口**：`packages/core-engine/src/application/session-application-service.ts`
2. **调试信息管道**：`packages/core-engine/docs/debug-info-pipeline.md`
3. **版本演进策略**：`packages/core-engine/docs/version-evolution-strategy.md`
4. **测试覆盖计划**：`packages/core-engine/test/TEST_COVERAGE_PLAN.md`

### 后续工作

- [ ] 实现 `ISessionApplicationService` 的默认实现
- [ ] 在 API 层中使用应用服务接口
- [ ] 实现版本检测机制
- [ ] 完成 P0 优先级测试用例
- [ ] 达成测试覆盖率 85% 目标
