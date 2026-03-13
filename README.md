# HeartRule AI咨询引擎 (TypeScript)

> **基于"LLM + YAML脚本"的智能咨询框架**  
> 首个应用场景：CBT心理咨询

**当前版本**：2.0.0 (TypeScript) 🚀

---

## 📖 项目概述

AI咨询引擎采用混合架构，结合大语言模型的语言理解与生成能力，以及结构化脚本的流程控制能力，将专业咨询师的经验、技术、流程和数据沉淀为可执行、可维护的脚本化知识库。

### 核心特性

- ✅ **经验结构化沉淀**：通过YAML脚本将咨询师经验转化为可复用知识资产
- ✅ **灵活性与可控性平衡**：LLM提供自然语言交互，脚本保证流程专业性
- ✅ **领域知识可扩展**：支持不同咨询领域的专业化脚本定制
- ✅ **质量可追溯**：脚本化流程便于审计、优化和质量管理
- ✅ **类型安全**：TypeScript编译时检查，减少运行时错误
- ✅ **高性能**：Fastify框架 + 异步事件循环
- ✅ **现代化架构**：Monorepo + pnpm + 六大核心引擎

---

## 🏗️ 系统架构

### 五层分层架构

```
┌─────────────────────────────────────────────┐
│  表现层：用户前端、领域工程师工作台         │
├─────────────────────────────────────────────┤
│  应用层：会话管理、脚本调试、脚本编辑       │
├─────────────────────────────────────────────┤
│  引擎层：六大核心引擎                       │
│  ├─ 脚本执行引擎                            │
│  ├─ LLM编排引擎                             │
│  ├─ 变量提取引擎                            │
│  ├─ 记忆引擎                                │
│  ├─ 话题调度引擎                            │
│  └─ 意识触发引擎                            │
├─────────────────────────────────────────────┤
│  脚本层：YAML脚本（会谈流程、咨询技术）     │
├─────────────────────────────────────────────┤
│  基础设施层：LLM服务、PostgreSQL、Redis     │
└─────────────────────────────────────────────┘
```

### Monorepo结构

```
packages/
├── shared-types/      # 共享TypeScript类型定义 + Zod Schema
├── core-engine/       # 六大核心引擎（headless）
└── api-server/        # Fastify REST API + WebSocket
```

详细架构文档：[.qoder/quests/ai-consulting-engine-architecture.md](.qoder/quests/ai-consulting-engine-architecture.md)

---

## 🚀 快速开始

### 环境要求

- **Node.js**: 20+ (LTS)
- **pnpm**: 9+
- **PostgreSQL**: 16
- **Redis**: 7.2

### 一键启动（推荐）

```bash
# 1. 安装依赖
pnpm install

# 2. 启动Docker服务（PostgreSQL + Redis）
pnpm docker:dev

# 3. 运行数据库迁移
pnpm --filter @heartrule/api-server db:migrate

# 4. 启动API服务器
pnpm dev
```

### 访问系统

- **API文档**：http://localhost:8000/docs （Swagger UI）
- **健康检查**：http://localhost:8000/health
- **PostgreSQL管理**：http://localhost:8080 （Adminer）
- **Redis管理**：http://localhost:8081 （Redis Commander）

---

## 📂 项目目录

```
HeartRule-Qcoder/
├── 📁 packages/                    # TypeScript Monorepo
│   ├── shared-types/               # 共享类型（Session、Message、Script等）
│   ├── core-engine/                # 核心引擎包
│   │   ├── src/domain/             # 领域模型
│   │   ├── src/engines/            # 六大引擎实现
│   │   └── src/actions/            # Action基类与注册表
│   └── api-server/                 # Fastify API服务
│       ├── src/routes/             # API路由
│       ├── src/db/                 # Drizzle ORM Schema
│       └── src/app.ts              # 应用入口
│
├── 📁 scripts/                     # YAML脚本（通用）
│   ├── sessions/                   # 会谈流程脚本
│   └── techniques/                 # 咨询技术脚本
│
├── 📁 docs/                        # 文档
│   ├── DEVELOPMENT_GUIDE.md        # 开发指南
│   └── MVP_IMPLEMENTATION_STATUS.md
│
├── 📁 config/                      # 配置文件
│   └── dev.yaml                    # 开发环境配置
│
├── 📁 legacy-python/               # ⚠️ Python旧版本（待弃用）
│
├── 📄 package.json                 # 根package.json
├── 📄 pnpm-workspace.yaml          # pnpm工作区配置
├── 📄 docker-compose.dev.yml       # Docker服务编排
└── 📄 README.md                    # 本文件
```

---

## 🛠️ 技术栈

### 后端核心

| 技术        | 版本   | 用途                       |
| ----------- | ------ | -------------------------- |
| TypeScript  | 5.9    | 编程语言                   |
| Node.js     | 20 LTS | 运行时                     |
| Fastify     | 4.x    | Web框架（性能优于Express） |
| Drizzle ORM | 0.29   | 数据库ORM（零运行时开销）  |
| PostgreSQL  | 16     | 持久化数据库               |
| Redis       | 7.2    | 缓存与会话存储             |
| Zod         | 3.x    | 运行时Schema验证           |

### AI集成

| 技术           | 用途                               |
| -------------- | ---------------------------------- |
| Vercel AI SDK  | 统一LLM调用接口                    |
| @ai-sdk/openai | OpenAI Provider                    |
| Volcengine Ark | 火山引擎DeepSeek（自定义Provider） |

### 开发工具

| 工具              | 用途                            |
| ----------------- | ------------------------------- |
| pnpm              | Monorepo包管理器                |
| tsup              | TypeScript库构建工具            |
| Vitest            | 测试框架（Jest兼容）            |
| ESLint + Prettier | 代码质量与格式化                |
| Husky             | Git钩子（pre-commit、pre-push） |

---

## 🧪 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行测试并生成覆盖率报告
pnpm test:coverage

# 类型检查
pnpm --filter @heartrule/core-engine typecheck
```

### 测试覆盖

当前测试状态：

- ✅ **15个测试**全部通过
- ✅ Session领域模型测试（6个）
- ✅ Script领域模型测试（4个）
- ✅ YAML解析器测试（5个）

---

## 📦 构建与部署

### 构建所有包

```bash
# 构建shared-types
pnpm --filter @heartrule/shared-types build

# 构建core-engine
pnpm --filter @heartrule/core-engine build

# 构建api-server
pnpm --filter @heartrule/api-server build
```

### Docker部署

```bash
# 构建镜像
docker build -t heartrule-api:latest .

# 启动生产环境
docker-compose up -d
```

---

## 📚 核心概念

### YAML脚本结构

```yaml
session:
  session_id: 'cbt_assessment'
  phases:
    - phase_id: 'greeting'
      topics:
        - topic_id: 'welcome'
          actions:
            - action_type: 'ai_say'
              action_id: 'greeting'
              config:
                content_template: '你好！欢迎使用AI咨询服务。'

            - action_type: 'ai_ask'
              action_id: 'ask_name'
              config:
                question_template: '请问怎么称呼您？'
                variables:
                  - name: 'user_name'
                    type: 'text'
                    extraction_method: 'direct'
```

### Action类型

| Action类型  | 用途               | 示例                   |
| ----------- | ------------------ | ---------------------- |
| `ai_say`    | 向用户传达信息     | 问候、解释说明         |
| `ai_ask`    | 引导式提问收集信息 | 收集用户姓名、情绪评分 |
| `ai_think`  | 内部认知加工       | 分析用户情绪、生成评估 |
| `use_skill` | 调用咨询技术脚本   | 苏格拉底式提问         |

### 六大核心引擎

1. **脚本执行引擎**：解析YAML，管理Phase → Topic → Action流程
2. **LLM编排引擎**：统一管理多个LLM提供者，支持流式/非流式调用
3. **变量提取引擎**：从对话中提取变量（direct、pattern、llm三种方法）
4. **记忆引擎**：短期/中期/长期记忆管理（当前实现短期记忆）
5. **话题调度引擎**：动态话题切换（计划驱动 + 意识驱动）
6. **意识触发引擎**：监控对话情境，优先级干预

---

## 🔌 API接口

### 核心端点

#### 会话管理

- `POST /api/sessions` - 创建会话
- `GET /api/sessions/:id` - 获取会话详情
- `GET /api/sessions/:id/messages` - 获取消息历史
- `GET /api/sessions/:id/variables` - 获取会话变量
- `GET /api/users/:userId/sessions` - 列出用户会话

#### 聊天交互

- `POST /api/chat` - 发送消息（非流式）
- `POST /api/chat/stream` - 发送消息（SSE流式）

#### 脚本管理

- `POST /api/scripts` - 创建脚本
- `GET /api/scripts/:id` - 获取脚本详情
- `GET /api/scripts` - 列出脚本
- `POST /api/scripts/:id/validate` - 验证脚本

详细API文档：http://localhost:8000/docs

---

## 🎯 开发指南

### 添加新的Action类型

1. 在`packages/core-engine/src/actions/`创建新文件
2. 继承`BaseAction`类
3. 实现`execute`方法
4. 在`registry.ts`中注册

示例代码：

```typescript
import { BaseAction, ActionContext, ActionResult } from './base.js';

export class MyAction extends BaseAction {
  async execute(context: ActionContext, userInput?: string): Promise<ActionResult> {
    // 实现Action逻辑
    return {
      success: true,
      completed: true,
      aiMessage: '这是AI的响应',
    };
  }
}
```

### 编写YAML脚本

参考示例脚本：

- [scripts/sessions/cbt_depression_assessment.yaml](scripts/sessions/cbt_depression_assessment.yaml)
- [scripts/techniques/socratic_questioning.yaml](scripts/techniques/socratic_questioning.yaml)

---

## 📖 文档资源

- [开发指南](openspec/specs/_global/process/development-guide.md)
- [架构设计](.qoder/quests/ai-consulting-engine-architecture.md)
- [构建修复报告](BUILD_FIX_REPORT.md)
- [目录重组计划](DIRECTORY_RESTRUCTURE_PLAN.md)

---

## 🤝 贡献指南

### 提交代码前检查

- [ ] 代码通过所有测试（`pnpm test`）
- [ ] 类型检查通过（`pnpm typecheck`）
- [ ] 代码格式化（自动触发：Husky pre-commit）
- [ ] 更新相关文档

### Git工作流

```bash
# 创建特性分支
git checkout -b feature/my-feature

# 提交更改（会自动触发lint和format）
git commit -m "feat: 添加新功能"

# 推送到远程
git push origin feature/my-feature
```

---

## 📊 项目状态

### 当前完成度

- ✅ **TypeScript迁移**：100%
- ✅ **核心引擎**：80%（脚本执行、LLM编排、变量提取已完成）
- ✅ **API服务**：100%（11个端点）
- ✅ **测试框架**：100%（15个测试）
- ⏳ **前端开发**：0%（计划使用React + Pixi.js）

### 下一步计划

1. **短期（1-2周）**
   - 实现具体Action类型（AiSayAction、AiAskAction等）
   - 增加测试覆盖率（目标90%+）
   - 完善记忆引擎（Redis集成）

2. **中期（1个月）**
   - 实现话题调度引擎
   - 实现意识触发引擎
   - 创建React前端包

3. **长期（3个月）**
   - 长期记忆（向量检索）
   - 游戏化UI（Pixi.js）
   - 生产环境部署

---

## ⚠️ Python版本（已弃用）

如需查看Python旧版本（不推荐）：

- 目录：[legacy-python/](legacy-python/)
- 文档：[legacy-python/README.md](legacy-python/README.md)
- 状态：功能冻结，仅修复严重Bug
- 计划删除时间：2025-Q3

**强烈建议所有新开发使用TypeScript版本！**

---

## 📞 支持与反馈

### 获取帮助

1. 查看[开发指南](openspec/specs/_global/process/development-guide.md)
2. 查看[API文档](http://localhost:8000/docs)
3. 提交[GitHub Issue](https://github.com/your-org/heartrule/issues)

### 社区

- GitHub Discussions
- 开发者交流群

---

## 📄 许可证

待定

---

**最后更新**：2025-01-07  
**维护者**：HeartRule开发团队
