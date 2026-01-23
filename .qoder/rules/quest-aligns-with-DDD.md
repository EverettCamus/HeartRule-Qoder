---
trigger: model_decision
description: 在进行架构设计、创建新模块或修改核心领域逻辑时触发
---

# HeartRule DDD架构规范（六边形架构）

本项目采用**六边形架构（Hexagonal Architecture）+ 轻量事件机制**，确保AI咨询引擎的可测试性、可扩展性和领域隔离。

## 一、限界上下文边界定义

### 核心上下文（Core Domain）
| 上下文 | 职责 | 边界 |
|--------|------|------|
| **咨询会话** | 管理咨询流程生命周期 | Session、ExecutionState |
| **脚本执行** | 解析并执行YAML脚本 | Script、Phase、Topic、Action |
| **LLM编排** | 统一管理LLM调用 | Provider、Orchestrator |

### 支撑上下文（Supporting Domain）
| 上下文 | 职责 | 边界 |
|--------|------|------|
| **变量管理** | 提取和存储会话变量 | Variable、VariableExtractor |
| **记忆系统** | 四层记忆架构 | ShortTerm/MidTerm/LongTerm/Structured |
| **提示词模板** | 管理AI提示词 | PromptTemplate、TemplateLoader |

### 通用上下文（Generic Domain）
- 持久化存储（数据库适配）
- 配置管理
- 日志与监控

## 二、分层架构职责分离

```
┌─────────────────────────────────────────────────────────────┐
│                    入站适配器层 (Inbound Adapters)            │
│   HTTP Controllers / WebSocket Handlers / CLI              │
├─────────────────────────────────────────────────────────────┤
│                    应用层 (Application Layer)               │
│   UseCases / 端口定义 (Ports)                               │
├─────────────────────────────────────────────────────────────┤
│                    领域层 (Domain Layer)                    │
│   聚合根 / 实体 / 值对象 / 领域服务 / 领域事件               │
├─────────────────────────────────────────────────────────────┤
│                    引擎层 (Engines Layer)                   │
│   脚本执行 / LLM编排 / 变量提取 / 记忆 / 话题调度 / 意识触发   │
├─────────────────────────────────────────────────────────────┤
│                    出站适配器层 (Outbound Adapters)          │
│   数据库适配器 / LLM Provider适配器 / 外部服务适配器          │
└─────────────────────────────────────────────────────────────┘
```

### 层级依赖规则

| 规则 | 说明 | 违规示例 |
|------|------|----------|
| ✅ 向内依赖 | 外层依赖内层，内层不依赖外层 | ❌ Domain层import Drizzle |
| ✅ 通过端口交互 | 应用层通过接口调用基础设施 | ❌ UseCase直接new Repository |
| ✅ 领域纯净 | Domain层无外部框架依赖 | ❌ Session类import express |

## 三、领域模型设计原则

### 聚合根识别
```typescript
// ✅ 正确：Session作为聚合根，包含完整行为
class Session {
  start(): void { /* 业务逻辑 */ }
  pause(): void { /* 业务逻辑 */ }
  complete(): void { /* 业务逻辑 */ }
  updatePosition(position: ExecutionPosition): void { /* 业务逻辑 */ }
}

// ❌ 错误：贫血模型，行为散落在Service中
class Session {
  status: string;
  position: object;
}
class SessionService {
  startSession(session: Session) { session.status = 'active'; }
}
```

### 值对象使用
```typescript
// ✅ 正确：ExecutionPosition作为不可变值对象
interface ExecutionPosition {
  readonly phaseIndex: number;
  readonly topicIndex: number;
  readonly actionIndex: number;
}

// ❌ 错误：使用可变对象
let position = { phaseIndex: 0 };
position.phaseIndex = 1; // 直接修改
```

### 领域事件（可选）
```typescript
// 关键业务事件应定义为领域事件
interface SessionStartedEvent {
  sessionId: string;
  scriptId: string;
  timestamp: Date;
}

interface ActionCompletedEvent {
  sessionId: string;
  actionId: string;
  result: ActionResult;
}
```

## 四、基础设施解耦要求

### 端口定义（应用层）
```typescript
// packages/core-engine/src/application/ports/outbound/

// ✅ LLM Provider端口
interface ILLMProvider {
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse>;
  getName(): string;
}

// ✅ 会话仓储端口
interface ISessionRepository {
  findById(sessionId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  updateState(sessionId: string, state: ExecutionState): Promise<void>;
}

// ✅ 脚本仓储端口
interface IScriptRepository {
  findById(scriptId: string): Promise<Script | null>;
  findByName(scriptName: string): Promise<Script | null>;
}
```

### 适配器实现（基础设施层）
```typescript
// packages/api-server/src/adapters/outbound/

// ✅ 正确：适配器实现端口接口
class DrizzleSessionRepository implements ISessionRepository {
  async findById(sessionId: string): Promise<Session | null> {
    const row = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
    return row ? this.toDomain(row) : null;
  }
}

// ✅ 正确：LLM适配器可替换
class VolcanoLLMAdapter implements ILLMProvider {
  async chat(messages: ChatMessage[]): Promise<LLMResponse> { /* 火山引擎实现 */ }
}

class OpenAIAdapter implements ILLMProvider {
  async chat(messages: ChatMessage[]): Promise<LLMResponse> { /* OpenAI实现 */ }
}
```

## 五、代码检查清单

在创建或修改代码时，请检查以下合规点：

### 新建文件时
- [ ] 文件放置在正确的层级目录
- [ ] 不违反依赖方向（内层不依赖外层）
- [ ] 领域层代码无框架依赖

### 修改领域模型时
- [ ] 行为封装在聚合根内
- [ ] 使用值对象表示不可变概念
- [ ] 关键状态变更考虑领域事件

### 添加外部集成时
- [ ] 定义端口接口（在应用层）
- [ ] 实现适配器（在基础设施层）
- [ ] 通过依赖注入使用

### 引擎扩展时
- [ ] 引擎通过端口与外部交互
- [ ] 引擎间通过领域服务协作
- [ ] 避免引擎直接依赖具体实现

## 六、目录结构参考

```
packages/core-engine/src/
├── domain/                    # 领域层
│   ├── models/               # 聚合根、实体、值对象
│   ├── services/             # 领域服务
│   └── events/               # 领域事件
├── application/               # 应用层
│   ├── ports/                # 端口定义
│   │   ├── inbound/         # 入站端口（用例接口）
│   │   └── outbound/        # 出站端口（依赖接口）
│   └── usecases/             # 用例实现
├── engines/                   # 引擎层（特殊领域服务）
└── index.ts

packages/api-server/src/
├── adapters/                  # 适配器层
│   ├── inbound/              # 入站适配器（HTTP/WS）
│   └── outbound/             # 出站适配器（DB/LLM）
└── app.ts                     # 依赖注入组装
```

## 七、违规处理建议

| 违规类型 | 处理建议 |
|----------|----------|
| 领域层引入外部依赖 | 抽取接口到端口，实现移至适配器 |
| Service层过于臃肿 | 拆分为多个UseCase，行为下沉到领域模型 |
| 直接使用具体实现 | 定义接口，通过构造函数注入 |
| 引擎间直接调用 | 通过领域服务或事件解耦 |

---
*此规则在进行架构设计、创建新模块或修改核心领域逻辑时自动提醒，确保架构一致性。*
