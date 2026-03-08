# HeartRule-Qoder 架构重构设计方案

**Date**: 2026-03-08
**Status**: Draft
**Author**: Sisyphus

---

## 1. 背景与目标

### 1.1 当前架构问题

经过代码分析，发现以下架构问题需要解决：

| 优先级 | 问题                | 影响                                                         |
| ------ | ------------------- | ------------------------------------------------------------ |
| P0     | 领域模型双向依赖    | `Session` 类引用了引擎层类型（`BaseAction`, `LLMDebugInfo`） |
| P0     | 双轨变量存储        | `variables: Map<string, unknown>` + `variableStore` 同时存在 |
| P1     | Action 基类过于臃肿 | 892 行代码，违反 SRP                                         |
| P1     | 测试目录不统一      | `test/` 和 `__tests__/` 共存                                 |
| P2     | 根目录脚本混乱      | 70+ .ts 脚本文件在根目录                                     |

### 1.2 重构目标

1. **消除反向依赖**：领域层不应依赖引擎实现层
2. **统一变量模型**：只保留 `variableStore`，废弃扁平变量存储
3. **职责分离**：Action 基类只保留抽象定义，基础设施逻辑提取到独立模块
4. **目录规范化**：测试目录和脚本文件统一管理

### 1.3 约束条件

- 不要求向后兼容（breaking change 可接受）
- 所有改动在同一迭代完成

---

## 2. 总体架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────┐
│  应用层：API Server / Script Editor         │
├─────────────────────────────────────────────┤
│  领域层：Domain Models & Services           │
│  - Session (Entity)                         │
│  - Message (Entity)                         │
│  - Script (Entity)                          │
│  - SessionService (Domain Service)          │
├─────────────────────────────────────────────┤
│  引擎层：Six Engines (Headless)             │
│  - Script Execution Engine                  │
│  - LLM Orchestration Engine                │
│  - Variable Extraction Engine               │
│  - Memory Engine                            │
│  - Topic Scheduling Engine                  │
│  - Consciousness Trigger Engine             │
├─────────────────────────────────────────────┤
│  基础设施层：Adapters & Utilities           │
│  - Action Implementations                   │
│  - LLM Providers                            │
│  - Template Resolvers                       │
└─────────────────────────────────────────────┘
```

### 2.2 依赖方向

```
Domain Layer (Shared Types)
        ↑
    Services
        ↑
    Engines ← Adapters/Utilities
        ↑
    API Server / Script Editor
```

**核心原则**：领域层是独立的基础设施，不依赖任何上层实现。

---

## 3. 详细设计方案

### 3.1 Session 领域模型重构

#### 3.1.1 当前问题

```typescript
// core-engine/src/domain/session.ts - 问题代码
public currentAction: BaseAction | null;      // ❌ 引用引擎层
public lastLLMDebugInfo?: LLMDebugInfo;       // ❌ 引用引擎层
```

#### 3.1.2 重构方案

**拆分 Session 为：**

1. **SessionEntity** (`shared-types/src/domain/session.ts`)
   - 纯数据对象（POJO）
   - 只包含状态枚举和字段定义
   - 不包含任何业务逻辑

2. **SessionService** (`core-engine/src/domain/services/session-service.ts`)
   - 状态流转逻辑（start, pause, resume, complete, fail）
   - 变量操作逻辑
   - 对话历史管理
   - **依赖引擎层**（通过接口注入）

#### 3.1.3 变更文件

| 文件                                         | 变更                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| `shared-types/src/domain/session.ts`         | 移除类实现，只保留接口 + Zod Schema                  |
| `core-engine/src/domain/session.ts`          | 重命名为 `session-service.ts`，提取为 Domain Service |
| `core-engine/src/domain/entities/session.ts` | 新增纯数据 Entity                                    |

---

### 3.2 变量存储统一

#### 3.2.1 当前问题

```typescript
// 双轨并存
public variables: Map<string, unknown>;      // 旧版扁平
public variableStore?: VariableStore;         // 新版分层
```

#### 3.2.2 重构方案

**废弃 `variables: Map<string, unknown>`，只保留 `variableStore`**

1. 在 `VariableStore` 中添加扁平访问兼容方法
2. 所有引擎和 Action 只使用 `variableStore`
3. 迁移脚本：更新所有引用 `session.variables` 的代码

#### 3.2.3 变更文件

| 文件                                      | 变更                          |
| ----------------------------------------- | ----------------------------- |
| `shared-types/src/domain/variable.ts`     | 扩展 `VariableStore` 接口     |
| `core-engine/src/engines/variable-scope/` | 统一变量查找逻辑              |
| 所有 Action 文件                          | 移除 `context.variables` 引用 |

---

### 3.3 Action 基类重构

#### 3.3.1 当前问题

`base-action.ts` (892 行) 包含：

- 变量替换逻辑（70+ 行）
- 退出条件评估（100+ 行）
- 安全边界检测（80+ 行，已废弃）
- LLM 输出解析
- 模板路径解析

#### 3.3.2 重构方案

**拆分为多层：**

```
domain/
└── actions/
    ├── base-action.ts        # 抽象基类（只定义接口 + execute 抽象方法）
    └── interfaces/
        ├── i-action-context.ts
        ├── i-action-result.ts
        └── i-variable-substitutor.ts

infrastructure/
└── actions/
    ├── variable-substitutor.ts    # 变量替换实现
    ├── exit-condition-evaluator.ts # 退出条件评估
    └── safety-checker.ts          # 安全边界检测
```

#### 3.3.3 变更文件

| 文件                                                                 | 变更                          |
| -------------------------------------------------------------------- | ----------------------------- |
| `core-engine/src/domain/actions/base-action.ts`                      | 精简为 100 行，只保留抽象定义 |
| `core-engine/src/infrastructure/actions/variable-substitutor.ts`     | 新增                          |
| `core-engine/src/infrastructure/actions/exit-condition-evaluator.ts` | 新增                          |
| `core-engine/src/infrastructure/actions/safety-checker.ts`           | 新增（从废弃代码重构）        |

---

### 3.4 测试目录统一

#### 3.4.1 当前问题

- `packages/core-engine/src/test/`
- `packages/core-engine/src/__tests__/`

#### 3.4.2 重构方案

**统一到 `__tests__/`**

1. 迁移 `test/` 下的文件到 `__tests__/`
2. 删除 `test/` 目录
3. 更新配置文件中的测试路径

---

### 3.5 脚本文件迁移

#### 3.5.1 当前问题

根目录有 70+ .ts 脚本文件，混合了：

- 测试脚本 (`test-*.ts`)
- 迁移脚本 (`migrate-*.ts`, `update-*.ts`)
- 工具脚本 (`check-*.ts`, `find-*.ts`, `verify-*.ts`)

#### 3.5.2 重构方案

```
scripts/
├── migration/     # 数据库迁移脚本
├── development/  # 开发辅助脚本
├── testing/      # 测试脚本
└── maintenance/  # 维护脚本
```

---

## 4. 数据流设计

### 4.1 Session 生命周期

```
┌─────────────┐     start()      ┌─────────────┐
│  CREATED    │ ──────────────→  │   ACTIVE    │
└─────────────┘                  └─────────────┘
       ↑                                │
       │                                │ pause()
       │                                ↓
       │                         ┌─────────────┐
       │                         │   PAUSED    │
       │                         └─────────────┘
       │                                │
       │                                │ resume()
       │                                ↓
       │                         ┌─────────────┐
       │                    complete() │   COMPLETED
       │                         ←─────────────┘
       │
       │                         ┌─────────────┐
       └───────────── fail() ──→ │   FAILED   │
                                 └─────────────┘
```

### 4.2 变量查找优先级

```
VariableStore (分层)
├── global     # 全局变量（系统级）
├── session    # 会话级变量
├── phase      # 阶段级变量
└── topic      # 话题级变量

查找顺序：topic → phase → session → global
写入优先级：按作用域显式指定
```

---

## 5. 错误处理设计

### 5.1 错误类型定义

```typescript
// shared-types/src/errors.ts
export enum ErrorCode {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_INVALID_STATE = 'SESSION_INVALID_STATE',
  VARIABLE_EXTRACTION_FAILED = 'VARIABLE_EXTRACTION_FAILED',
  ACTION_EXECUTION_FAILED = 'ACTION_EXECUTION_FAILED',
  // ...
}
```

### 5.2 错误传播

- **引擎层错误**：封装为 `EngineError`，包含上下文信息
- **Action 层错误**：返回 `ActionResult.success = false`，包含错误消息
- **API 层错误**：统一通过 `error-handler.ts` 处理

---

## 6. 迁移计划

### Phase 1: 基础设施重构

1. 创建新的目录结构
2. 定义新的接口和抽象类

### Phase 2: 核心模块迁移

1. 迁移 Session 模型
2. 统一变量存储
3. 精简 Action 基类

### Phase 3: 目录与文件清理

1. 统一测试目录
2. 迁移根目录脚本

### Phase 4: 验证与测试

1. 运行所有测试
2. API 集成测试
3. E2E 测试

---

## 7. 验收标准

- [ ] Session 模型不依赖引擎层类型
- [ ] 只使用 `variableStore`，无扁平变量引用
- [ ] Action 基类 < 150 行
- [ ] 测试目录统一为 `__tests__/`
- [ ] 根目录脚本迁移到 `scripts/`
- [ ] 所有测试通过
- [ ] API 构建成功

---

## 8. 风险与缓解

| 风险         | 影响 | 缓解措施     |
| ------------ | ---- | ------------ |
| 破坏现有功能 | 高   | 全面测试覆盖 |
| 循环依赖     | 中   | 依赖检查工具 |
| 迁移遗漏     | 中   | 代码搜索验证 |

---

**下一步**：调用 writing-plans skill 创建详细实现计划
