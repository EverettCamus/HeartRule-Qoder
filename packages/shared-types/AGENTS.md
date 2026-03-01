# AGENTS.md - 共享类型层

## 架构定位

**核心职责**:

- 定义项目全局TypeScript类型
- 提供Zod Schema用于运行时验证
- 作为其他包（core-engine、api-server）的共享依赖

**构建特性**:

- tsup构建（与core-engine一致）
- 零依赖运行时开销
- 纯类型声明 + Zod Schema

## 项目结构

```
src/
├── domain/               # 领域类型定义
│   ├── session-types.ts  # Session相关类型
│   ├── message-types.ts  # Message相关类型
│   ├── script-types.ts   # Script相关类型
│   ├── action-types.ts   # Action相关类型
│   └── variable-types.ts # Variable相关类型
├── schemas/              # Zod Schema定义
│   ├── session-schemas.ts
│   ├── message-schemas.ts
│   ├── script-schemas.ts
│   └── action-schemas.ts
├── api/                  # API合约类型
│   ├── requests.ts       # API请求类型
│   └── responses.ts      # API响应类型
└── index.ts             # 公共导出入口
```

## 核心类型定义

**会话模型**:

```typescript
// 会话状态枚举
export type SessionStatus = 'created' | 'active' | 'paused' | 'completed' | 'failed';

// 主会话接口
export interface Session {
  id: string;
  userId: string;
  scriptId: string;
  status: SessionStatus;
  variables: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

**消息模型**:

```typescript
// 消息角色类型
export type MessageRole = 'user' | 'ai' | 'system';

// 消息接口
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}
```

**脚本模型**:

```typescript
// YAML脚本结构
export interface Script {
  id: string;
  name: string;
  description?: string;
  phases: Phase[];
}
```

## Zod Schema验证

**运行时验证**:

```typescript
import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  scriptId: z.string(),
  status: z.enum(['created', 'active', 'paused', 'completed', 'failed']),
  variables: z.record(z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
```

**Schema导出模式**:

- 每个领域模型对应一个Schema文件
- Schema同时用于TypeScript类型推断（z.infer<>）
- 运行时验证与编译时类型保持一致

## 构建配置

**tsup配置**:

```json
{
  "build": "tsup",
  "entry": ["src/index.ts"],
  "format": ["esm", "cjs"],
  "dts": true,
  "clean": true,
  "sourcemap": true
}
```

**构建命令**:

```bash
pnpm --filter @heartrule/shared-types build    # tsup构建
pnpm --filter @heartrule/shared-types typecheck # 类型检查
```

**导出优化**:

- 使用index.ts作为统一导出点
- 避免循环依赖
- 按需导出（namespace或named exports）

## 类型安全策略

**严格模式**:

- verbatimModuleSyntax 禁止类型重导出
- noUnusedLocals / noUnusedParameters 强制执行
- strictNullChecks 启用

**TypeScript配置**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "strict": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## 依赖管理

**零运行时依赖**:

- 开发依赖：typescript、zod、@types/node
- 生产依赖：无（纯类型包）

**版本同步**:

- TypeScript版本与monorepo一致（5.x）
- Zod版本保持一致（3.x）
- 避免跨包版本冲突

## API合约类型

**请求类型**:

```typescript
export interface CreateSessionRequest {
  userId: string;
  scriptId: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
}
```

**响应类型**:

```typescript
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  validationErrors?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

## 实用类型工具

**类型助手**:

```typescript
// 提取Zod Schema的类型
export type InferSchema<T extends z.ZodType<any>> = z.infer<T>;

// 部分更新类型
export type PartialUpdate<T> = Partial<T> & { id: string };

// 空对象检测
export type EmptyObject = Record<string, never>;
```

## 测试策略

**类型测试**:

- 通过TypeScript编译确保类型正确性
- 没有运行时测试（纯类型包）
- 使用tsd（TypeScript Definition Tester）可选

**集成测试**:

- 依赖于包确保类型兼容性
- core-engine、api-server作为集成测试环境

## 维护准则

**新增类型流程**:

1. 在src/domain/创建类型定义文件
2. 添加对应的Zod Schema（如需运行时验证）
3. 在src/index.ts导出
4. 更新其他包的类型引用

**类型变更兼容性**:

- 向后兼容性优先
- 废弃类型使用@deprecated标记
- 重大变更需多版本过渡

## 专门技能推荐

**适合技能**:

- `doc-coauthoring`: 类型文档、API合约规范
- `internal-comms`: 类型变更通知、兼容性说明

**核心Agent提示**:

- 提到"共享类型"、"Zod Schema" → 参考此文档
- 提到"API合约"、"类型安全" → 检查api/目录
- 提到"运行时验证" → 检查schemas/目录
- 提到"类型冲突" → 检查导出冲突和依赖循环
