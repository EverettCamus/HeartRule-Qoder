---
document_id: 'docs-archive-misc-ddd-hexagonal-refactoring-plan'
authority: 'historical'
status: 'archived'
archived_date: '2026-09-29'
source: 'packages/core-engine'
path: 'packages/core-engine/DDD_HEXAGONAL_REFACTORING_PLAN.md'
tags: ['historical', 'reference', 'archived', 'misc']
search_priority: 'medium'
---

> **⚠️ 归档说明（2026-09-29，MESS-B-07）**：本文档原在 `packages/core-engine/` 包根，是 **2026-02** 的 core-engine 分层重构方案。它与后来的 `docs/superpowers/plans/ddd-refactoring-plan.md` 是**两套并行方案、描述同一件事**——**以较晚那份为准，本文档仅作历史**。

> **勿照做**：文中两个阶段**从未执行**，且 2026-09-29 已裁定**明确弃**（属「用户零感知的、为目录而重构」）：
>
> - **Phase 1.1**「创建入站端口」——实测 `application/ports/` 下至今只有 `outbound/`，入站端口从未建；
> - **Phase 1.4**「收拢应用层分散目录」——`monitors/` 与 `orchestrators/` 至今并排，文中要建的 `application/monitoring/` 从未存在。
>
> 其中未勾选的事项不再逐条落实。另：文中标注的「基准架构文档」`.qoder/rules/quest-aligns-with-DDD.md` **已不存在**（`.qoder/` 目录已删）。

# Core-Engine DDD 六边形架构重构执行方案

> **基准架构文档**：`.qoder/rules/quest-aligns-with-DDD.md`  
> **重构目标**：将现有 core-engine 结构调整至严格符合六边形架构规范  
> **执行原则**：阶段化执行 + 质量验证门禁 + 零功能破坏

---

## 一、架构违规严重性评估与优先级排序

### 🔴 P0 - 严重违规（必须立即修复）

| 违规项                            | 严重性       | 影响范围                                            | 根因                                                         |
| --------------------------------- | ------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| **LLM Provider 适配器污染领域层** | **Critical** | engines/llm-orchestration                           | 具体实现（openai-provider/volcano-provider）混入 core-engine |
| **应用层职责分散**                | High         | state/handlers/orchestration/orchestrators/monitors | 5个顶级目录散落应用层逻辑，缺乏边界表达                      |
| **Actions 定位模糊**              | High         | actions/\*                                          | 领域行为与应用工厂混合，平级于 domain 造成语义不清           |

### 🟡 P1 - 中度违规（影响可扩展性）

| 违规项                  | 严重性 | 影响范围         | 根因                                       |
| ----------------------- | ------ | ---------------- | ------------------------------------------ |
| **Schema 验证层次不明** | Medium | schemas/\*       | 入站适配器职责未显式表达，与领域层平级     |
| **测试结构与架构脱节**  | Medium | test/\*          | 测试文件平铺，未按 hex 边界组织            |
| **端口定义缺失**        | Medium | 缺少 ports/ 目录 | 出站依赖（ILLMProvider等）未显式抽象为端口 |

### 🟢 P2 - 长期优化（架构演进方向）

| 项目                   | 目标                                  | 价值                   |
| ---------------------- | ------------------------------------- | ---------------------- |
| **聚合根按聚合拆分**   | domain/session/, domain/script/       | 更清晰的限界上下文边界 |
| **领域事件机制**       | domain/events/                        | 解耦跨聚合协作         |
| **LLM 适配器完全外移** | 移至 api-server/adapters/outbound/llm | 彻底隔离基础设施       |

---

## 二、分阶段实施计划

### 📋 总体路线图

```
Phase 1 (端口抽离 & 应用层边界)  [3天]
   ↓ 质量验证：接口稳定性 + 依赖注入可用性
Phase 2 (目录结构调整)          [4天]
   ↓ 质量验证：编译通过 + 单元测试全绿
Phase 3 (测试代码重组)          [2天]
   ↓ 质量验证：测试覆盖率不降低 + 回归测试通过
Phase 4 (依赖注入改造)          [3天]
   ↓ 质量验证：E2E 测试通过 + API 层集成正常
```

---

## Phase 1：端口抽离与应用层边界（P0 核心违规修复）

**目标**：建立清晰的端口层，收拢应用层职责，消除适配器污染

### 1.1 创建端口层目录结构

**操作步骤**：

```bash
# 创建端口目录
mkdir -p packages/core-engine/src/application/ports/inbound
mkdir -p packages/core-engine/src/application/ports/outbound
```

**创建文件**：

- `src/application/ports/inbound/session-application.port.ts`
- `src/application/ports/outbound/llm-provider.port.ts`
- `src/application/ports/outbound/template-provider.port.ts`

**具体内容（示例）**：

```typescript
// src/application/ports/outbound/llm-provider.port.ts
export interface ILLMProvider {
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse>;
  getName(): string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  debugInfo?: LLMDebugInfo;
}
```

**时间估算**：0.5天

---

### 1.2 抽取 ISessionApplicationService 接口并归位 usecases

**当前状态**：接口定义在实现文件 `application/session-application-service.ts` 中

**目标状态**：

- 接口独立到 `application/ports/inbound/`
- 实现类移至 `application/usecases/`

**操作步骤**：

1. 从 `session-application-service.ts` 提取接口定义到 `ports/inbound/session-application.port.ts`
2. 将实现类移至 `application/usecases/session-application-service.ts`
3. 更新导入路径

**文件变更**：

```typescript
// Before: src/application/session-application-service.ts
export interface ISessionApplicationService { ... }
export class SessionApplicationService implements ISessionApplicationService { ... }

// After: src/application/ports/inbound/session-application.port.ts
export interface ISessionApplicationService { ... }
export type InitializeSessionRequest = { ... };
export type ProcessUserInputRequest = { ... };
export type SessionExecutionResponse = { ... };

// After: src/application/usecases/session-application-service.ts
import { ISessionApplicationService, ... } from '../ports/inbound/session-application.port.js';
export class SessionApplicationService implements ISessionApplicationService { ... }
```

**时间估算**：0.5天

---

### 1.3 重构 LLMOrchestrator 依赖端口而非具体实现

**当前问题**：

- `engines/llm-orchestration/orchestrator.ts` 直接依赖 `openai-provider.ts` 等具体实现
- `providers.ts` 在 core-engine 内注册具体 Provider

**目标**：

- `LLMOrchestrator` 构造函数接受 `ILLMProvider` 接口
- 具体 Provider 通过依赖注入传入

**操作步骤**：

1. 修改 `orchestrator.ts`：

```typescript
// Before
import { OpenAIProvider } from './openai-provider.js';
export class LLMOrchestrator {
  private provider = new OpenAIProvider(...);
}

// After
import { ILLMProvider } from '../../application/ports/outbound/llm-provider.port.js';
export class LLMOrchestrator {
  constructor(private provider: ILLMProvider) {}
}
```

2. 暂时保留 `openai-provider.ts` 和 `volcano-provider.ts`（Phase 4 再外移）
3. 让这些 Provider 实现 `ILLMProvider` 接口

**验证**：

- 编译通过
- 修改 `session-application-service.ts` 的构造函数，接受注入的 LLMOrchestrator

**时间估算**：1天

---

### 1.4 收拢应用层分散目录

**目标**：将 `state/`, `handlers/`, `orchestration/`, `orchestrators/`, `monitors/` 收拢到 `application/` 下

**操作步骤**：

1. **创建子目录**：

```bash
mkdir -p packages/core-engine/src/application/usecases
mkdir -p packages/core-engine/src/application/state
mkdir -p packages/core-engine/src/application/handlers
mkdir -p packages/core-engine/src/application/orchestration
mkdir -p packages/core-engine/src/application/monitoring
```

> **注意**：`application/usecases/` 用于存放应用服务（如 SessionApplicationService），与端口定义分离。

2. **文件移动映射**：

| 原路径                                           | 新路径                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `src/state/action-state-manager.ts`              | `src/application/state/action-state-manager.ts`              |
| `src/handlers/execution-result-handler.ts`       | `src/application/handlers/execution-result-handler.ts`       |
| `src/orchestration/topic-action-orchestrator.ts` | `src/application/orchestration/topic-action-orchestrator.ts` |
| `src/orchestrators/monitor-orchestrator.ts`      | `src/application/monitoring/monitor-orchestrator.ts`         |
| `src/monitors/*`                                 | `src/application/monitoring/monitors/*`                      |

3. **批量移动命令**（PowerShell）：

```powershell
# 移动 state
Move-Item "packages\core-engine\src\state\action-state-manager.ts" "packages\core-engine\src\application\state\"

# 移动 handlers
Move-Item "packages\core-engine\src\handlers\execution-result-handler.ts" "packages\core-engine\src\application\handlers\"

# 移动 orchestration
Move-Item "packages\core-engine\src\orchestration\topic-action-orchestrator.ts" "packages\core-engine\src\application\orchestration\"

# 移动 monitors
Move-Item "packages\core-engine\src\orchestrators\monitor-orchestrator.ts" "packages\core-engine\src\application\monitoring\"
Move-Item "packages\core-engine\src\monitors" "packages\core-engine\src\application\monitoring\" -Force

# 删除空目录
Remove-Item "packages\core-engine\src\state" -Force
Remove-Item "packages\core-engine\src\handlers" -Force
Remove-Item "packages\core-engine\src\orchestration" -Force
Remove-Item "packages\core-engine\src\orchestrators" -Force
```

4. **更新所有导入路径**（全局替换）：

```typescript
// 查找所有引用并更新
from './state/action-state-manager.js'
→ './application/state/action-state-manager.js'

from './handlers/execution-result-handler.js'
→ './application/handlers/execution-result-handler.js'

// ... 其他类似
```

**验证**：

- 运行 `pnpm -C packages/core-engine build` 编译成功
- 运行 `pnpm -C packages/core-engine test` 所有测试通过

**时间估算**：1天

---

### 📊 Phase 1 验收标准

- [ ] `application/ports/inbound/` 和 `outbound/` 目录存在且包含核心接口
- [ ] `LLMOrchestrator` 依赖 `ILLMProvider` 接口而非具体实现
- [ ] 应用层代码集中在 `application/` 下（不再有顶级 state/handlers 等目录）
- [ ] 编译通过：`pnpm -C packages/core-engine build`
- [ ] 单元测试通过：`pnpm -C packages/core-engine test`
- [ ] 核心 API 接口签名未变化（向后兼容）

**质量门禁**：Phase 1 完成后必须通过上述检查，才能进入 Phase 2

**架构审查要点**：

- [ ] 确认 SessionApplicationService 已移至 `application/usecases/`
- [ ] 确认端口接口与实现类物理分离
- [ ] 确认 application/ 层内部结构清晰（ports / usecases / state / handlers / orchestration / monitoring）

---

## Phase 2：目录结构调整（P0 + P1 合规化）

**目标**：Actions 归位领域层，Schema 归位适配器层，Domain 按聚合重组

## 2.1 Actions 领域行为归位 domain/actions

**当前问题**：

- `src/actions/` 包含领域行为（ai-ask/ai-say/ai-think）和应用工厂（action-factory/action-registry）

**目标**：

- 领域行为（具体 Action 实现）→ `src/domain/actions/`
- 应用工厂（factory/registry）→ `src/application/actions/`

**⚠️ 重要说明**：

- BaseAction 如果仅定义接口/抽象类 → 归入 `domain/actions/`
- 如果 BaseAction 包含执行框架协调逻辑（与 ExecutionContext 深度耦合）→ 需拆分为领域接口 + 应用层执行框架
- **本次 Phase 2 暂按"BaseAction 为领域抽象"处理，后续 P2 阶段根据实际代码审查再细化**

**操作步骤**：

1. **创建目录**：

```bash
mkdir -p packages/core-engine/src/domain/actions
mkdir -p packages/core-engine/src/application/actions
```

2. **文件移动映射**：

| 原路径                           | 新路径                                       |
| -------------------------------- | -------------------------------------------- |
| `src/actions/base-action.ts`     | `src/domain/actions/base-action.ts`          |
| `src/actions/ai-ask-action.ts`   | `src/domain/actions/ai-ask-action.ts`        |
| `src/actions/ai-say-action.ts`   | `src/domain/actions/ai-say-action.ts`        |
| `src/actions/ai-think-action.ts` | `src/domain/actions/ai-think-action.ts`      |
| `src/actions/action-factory.ts`  | `src/application/actions/action-factory.ts`  |
| `src/actions/action-registry.ts` | `src/application/actions/action-registry.ts` |

3. **批量移动**：

```powershell
# 移动领域行为
Move-Item "packages\core-engine\src\actions\base-action.ts" "packages\core-engine\src\domain\actions\"
Move-Item "packages\core-engine\src\actions\ai-ask-action.ts" "packages\core-engine\src\domain\actions\"
Move-Item "packages\core-engine\src\actions\ai-say-action.ts" "packages\core-engine\src\domain\actions\"
Move-Item "packages\core-engine\src\actions\ai-think-action.ts" "packages\core-engine\src\domain\actions\"

# 移动应用工厂
Move-Item "packages\core-engine\src\actions\action-factory.ts" "packages\core-engine\src\application\actions\"
Move-Item "packages\core-engine\src\actions\action-registry.ts" "packages\core-engine\src\application\actions\"

# 删除空目录
Remove-Item "packages\core-engine\src\actions" -Force
```

4. **更新导入路径**（全局替换）：

```typescript
from './actions/base-action.js'
→ './domain/actions/base-action.js'

from './actions/action-factory.js'
→ './application/actions/action-factory.js'
```

**时间估算**：1天

---

### 2.2 Schema 验证层移至适配器层

**目标**：将 `src/schemas/` 重命名为 `src/adapters/inbound/script-schema/`

**操作步骤**：

1. **创建适配器目录**：

```bash
mkdir -p packages/core-engine/src/adapters/inbound/script-schema
```

2. **整体移动**：

```powershell
# 移动整个 schemas 目录内容
Move-Item "packages\core-engine\src\schemas\*" "packages\core-engine\src\adapters\inbound\script-schema\" -Force
Remove-Item "packages\core-engine\src\schemas" -Force
```

3. **更新导入路径**：

```typescript
from './schemas/validators/schema-validator.js'
→ './adapters/inbound/script-schema/validators/schema-validator.js'
```

**时间估算**：0.5天

---

### 2.3 Domain 按聚合拆分子目录（可选，建议 P2）

**目标**：将 `domain/*.ts` 按聚合组织

**当前状态**：

```
domain/
├── session.ts
├── script.ts
├── message.ts
└── variable.ts
```

**目标状态**（可选）：

```
domain/
├── session/
│   ├── session.ts
│   ├── message.ts
│   └── variable.ts
├── script/
│   └── script.ts
└── actions/
    └── ...
```

**决策**：Phase 2 暂不执行，作为 P2 长期优化项

---

### 2.4 更新 src/index.ts 导出路径

**目标**：同步更新所有公开 API 的导出路径

**操作步骤**：

1. 读取当前 `src/index.ts`
2. 逐个更新导出路径：

```typescript
// Before
export * from './actions/base-action.js';
export * from './actions/action-registry.js';
export * from './state/action-state-manager.js';

// After
export * from './domain/actions/base-action.js';
export * from './application/actions/action-registry.js';
export * from './application/state/action-state-manager.js';
```

**验证**：

- 编译成功
- api-server 中的导入不报错

**时间估算**：0.5天

---

### 2.5 更新 api-server 的导入路径

**操作步骤**：

1. 在 `packages/api-server` 中全局搜索 `@heartrule/core-engine`
2. 确认所有导入仍然有效（因为 index.ts 已更新）
3. 如有直接引用内部路径的，逐个修复

**验证命令**：

```bash
cd packages/api-server
pnpm build
pnpm test
```

**时间估算**：1天

---

### 📊 Phase 2 验收标准

- [ ] `domain/actions/` 包含所有 Action 行为类
- [ ] `application/actions/` 包含 factory 和 registry
- [ ] `adapters/inbound/script-schema/` 包含所有 schema 验证逻辑
- [ ] `src/index.ts` 导出路径已更新
- [ ] core-engine 编译通过
- [ ] api-server 编译通过
- [ ] 所有单元测试通过

**质量门禁**：Phase 2 完成后，运行完整 monorepo 构建验证

```bash
pnpm -r build
pnpm -r test
```

---

## Phase 3：测试代码重组（测试架构对齐）

**目标**：按 hex 边界组织测试，建立 unit / integration / regression / monitoring 层次

### 3.1 创建测试目录结构

**操作步骤**：

```bash
mkdir -p packages/core-engine/test/unit/domain
mkdir -p packages/core-engine/test/unit/domain-actions
mkdir -p packages/core-engine/test/unit/engines
mkdir -p packages/core-engine/test/unit/application
mkdir -p packages/core-engine/test/integration
mkdir -p packages/core-engine/test/regression
mkdir -p packages/core-engine/test/monitoring
mkdir -p packages/core-engine/test/fixtures/scripts
mkdir -p packages/core-engine/test/fixtures/mocks
```

**时间估算**：0.5天

---

### 3.2 测试文件迁移映射表

| 原路径                                    | 新路径                                              | 分类 |
| ----------------------------------------- | --------------------------------------------------- | ---- |
| `variable-extraction.test.ts`             | `unit/engines/variable-extraction.test.ts`          | 单元 |
| `variable-scope-structure.test.ts`        | `unit/engines/variable-scope-resolver.test.ts`      | 单元 |
| `prompt-template.test.ts`                 | `unit/engines/prompt-template.test.ts`              | 单元 |
| `template-resolver.test.ts`               | `unit/engines/template-resolver.test.ts`            | 单元 |
| `phase6-action-state-manager.test.ts`     | `unit/application/action-state-manager.test.ts`     | 单元 |
| `phase8-execution-result-handler.test.ts` | `unit/application/execution-result-handler.test.ts` | 单元 |
| `session-application-service.test.ts`     | `integration/session-application-service.test.ts`   | 集成 |
| `ai-ask-incomplete-action.test.ts`        | `integration/ai-ask-multi-round-flow.test.ts`       | 集成 |
| `multi-round-exit-decision.test.ts`       | `integration/multi-round-exit-decision.test.ts`     | 集成 |
| `output-list.test.ts`                     | `integration/output-list.test.ts`                   | 集成 |
| `safety-boundary-detection.test.ts`       | `integration/safety-boundary-detection.test.ts`     | 集成 |
| `version-compatibility.test.ts`           | `integration/version-compatibility.test.ts`         | 集成 |
| `variable-migration.test.ts`              | `regression/variable-migration-regression.test.ts`  | 回归 |
| `monitors/monitor-handler.test.ts`        | `monitoring/monitor-handler.test.ts`                | 监控 |

**批量移动脚本**：

```powershell
# 单元测试 - engines
Move-Item "packages\core-engine\test\variable-extraction.test.ts" "packages\core-engine\test\unit\engines\"
Move-Item "packages\core-engine\test\variable-scope-structure.test.ts" "packages\core-engine\test\unit\engines\variable-scope-resolver.test.ts"
Move-Item "packages\core-engine\test\prompt-template.test.ts" "packages\core-engine\test\unit\engines\"
Move-Item "packages\core-engine\test\template-resolver.test.ts" "packages\core-engine\test\unit\engines\"

# 单元测试 - application
Move-Item "packages\core-engine\test\phase6-action-state-manager.test.ts" "packages\core-engine\test\unit\application\action-state-manager.test.ts"
Move-Item "packages\core-engine\test\phase8-execution-result-handler.test.ts" "packages\core-engine\test\unit\application\execution-result-handler.test.ts"

# 集成测试
Move-Item "packages\core-engine\test\session-application-service.test.ts" "packages\core-engine\test\integration\"
Move-Item "packages\core-engine\test\ai-ask-incomplete-action.test.ts" "packages\core-engine\test\integration\ai-ask-multi-round-flow.test.ts"
Move-Item "packages\core-engine\test\multi-round-exit-decision.test.ts" "packages\core-engine\test\integration\"
Move-Item "packages\core-engine\test\output-list.test.ts" "packages\core-engine\test\integration\"
Move-Item "packages\core-engine\test\safety-boundary-detection.test.ts" "packages\core-engine\test\integration\"
Move-Item "packages\core-engine\test\version-compatibility.test.ts" "packages\core-engine\test\integration\"

# 回归测试
Move-Item "packages\core-engine\test\variable-migration.test.ts" "packages\core-engine\test\regression\variable-migration-regression.test.ts"

# 监控测试
Move-Item "packages\core-engine\test\monitors\monitor-handler.test.ts" "packages\core-engine\test\monitoring\"
```

**时间估算**：1天

---

### 3.3 更新测试文件内的导入路径

**操作步骤**：

测试文件移动后，需要更新其内部导入路径，因为相对于 `src/` 的位置变了：

```typescript
// 原本在 test/ 根目录时
import { VariableExtractor } from '../src/engines/variable-extraction/extractor.js';

// 移到 test/unit/engines/ 后
import { VariableExtractor } from '../../../src/engines/variable-extraction/extractor.js';
```

**批量处理**：

- 使用 IDE 的"移动文件并更新引用"功能
- 或手动检查每个迁移的测试文件

**时间估算**：0.5天

---

### 📊 Phase 3 验收标准

- [ ] 所有测试文件按 unit/integration/regression/monitoring 归类
- [ ] 测试文件内的导入路径正确
- [ ] 运行 `pnpm -C packages/core-engine test` 所有测试通过
- [ ] 测试覆盖率不低于重构前基准（目标 ≥ 55%）

**质量门禁**：测试全绿且覆盖率不降低

---

## Phase 4：依赖注入改造（端口-适配器连接）

**目标**：在 api-server 层实现依赖注入，将具体 LLM Provider 作为适配器注入

### 4.1 在 api-server 创建 LLM 适配器目录

**操作步骤**：

```bash
mkdir -p packages/api-server/src/adapters/outbound/llm
```

**时间估算**：0.5天

---

### 4.2 将 LLM Provider 实现移至 api-server

**目标**：将 `core-engine/src/engines/llm-orchestration/{openai,volcano}-provider.ts` 移到 api-server

**操作步骤**：

1. **复制文件到 api-server**：

```powershell
Copy-Item "packages\core-engine\src\engines\llm-orchestration\openai-provider.ts" "packages\api-server\src\adapters\outbound\llm\"
Copy-Item "packages\core-engine\src\engines\llm-orchestration\volcano-provider.ts" "packages\api-server\src\adapters\outbound\llm\"
```

2. **让 Provider 实现 ILLMProvider 接口**：

```typescript
// packages/api-server/src/adapters/outbound/llm/openai-provider.ts
import { ILLMProvider, LLMOptions, LLMResponse } from '@heartrule/core-engine';

export class OpenAIAdapter implements ILLMProvider {
  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse> {
    // 实现逻辑
  }
  getName(): string {
    return 'openai';
  }
}
```

3. **从 core-engine 中删除 Provider 实现**（保留 orchestrator）：

```powershell
Remove-Item "packages\core-engine\src\engines\llm-orchestration\openai-provider.ts"
Remove-Item "packages\core-engine\src\engines\llm-orchestration\volcano-provider.ts"
Remove-Item "packages\core-engine\src\engines\llm-orchestration\providers.ts"
```

**时间估算**：1天

---

### 4.3 在 api-server 实现依赖注入容器

**目标**：在 api-server 启动时组装依赖关系

**操作步骤**：

创建 `packages/api-server/src/ioc/container.ts`：

```typescript
import { LLMOrchestrator, SessionApplicationService } from '@heartrule/core-engine';
import { OpenAIAdapter } from '../adapters/outbound/llm/openai-provider.js';
import { VolcanoAdapter } from '../adapters/outbound/llm/volcano-provider.js';

export class DependencyContainer {
  private llmProvider: ILLMProvider;
  private sessionAppService: SessionApplicationService;

  constructor() {
    // 根据配置选择 Provider
    const providerType = process.env.LLM_PROVIDER || 'openai';
    this.llmProvider = providerType === 'openai'
      ? new OpenAIAdapter()
      : new VolcanoAdapter();

    // 构造 LLMOrchestrator
    const llmOrchestrator = new LLMOrchestrator(this.llmProvider);

    // 构造应用服务
    this.sessionAppService = new SessionApplicationService(llmOrchestrator, ...);
  }

  getSessionApplicationService(): SessionApplicationService {
    return this.sessionAppService;
  }
}
```

**时间估算**：1天

---

### 4.4 更新 API 路由使用注入的服务

**操作步骤**：

修改 `packages/api-server/src/routes/sessions.ts`：

```typescript
// Before
import { SessionApplicationService } from '@heartrule/core-engine';
const service = new SessionApplicationService(...); // 直接 new

// After
import { container } from '../ioc/container.js';
const service = container.getSessionApplicationService(); // 从容器获取
```

**时间估算**：0.5天

---

### 📊 Phase 4 验收标准

- [ ] LLM Provider 实现位于 `api-server/src/adapters/outbound/llm/`
- [ ] core-engine 不再包含具体 Provider 实现
- [ ] api-server 有依赖注入容器组装依赖
- [ ] 运行 E2E 测试通过（`packages/api-server/test-*.ts`）
- [ ] API 接口功能正常（启动服务手动验证或跑 Playwright）

**质量门禁**：E2E 测试全绿 + 手动冒烟测试通过

---

## 三、风险控制措施

### 🛡️ 风险矩阵

| 风险点                       | 概率   | 影响     | 缓解措施                      | 回滚方案                   |
| ---------------------------- | ------ | -------- | ----------------------------- | -------------------------- |
| **导入路径错误导致编译失败** | High   | High     | 每个 Phase 完成后立即编译验证 | Git revert 到上一个 commit |
| **测试失败（功能回归）**     | Medium | Critical | 每次变更后运行测试套件        | 回滚文件变更，补充缺失测试 |
| **循环依赖**                 | Low    | High     | 使用 `madge` 工具检测循环依赖 | 重新设计依赖关系           |
| **api-server 集成失败**      | Medium | High     | Phase 4 前先在沙盒环境验证    | 保持 Phase 3 的可用版本    |
| **E2E 测试环境污染**         | Low    | Medium   | 使用独立测试数据库            | 重置测试环境               |

### 🔄 回滚策略

**分支策略**：

```bash
# 从 main 拉取重构分支
git checkout -b refactor/ddd-hexagonal-phase1

# 每个 Phase 完成后打 tag
git tag phase1-端口抽离-完成
git tag phase2-目录调整-完成
git tag phase3-测试重组-完成
git tag phase4-依赖注入-完成
```

**回滚命令**：

```bash
# 回滚到某个 Phase
git reset --hard phase2-目录调整-完成

# 或者撤销最近一次提交
git revert HEAD
```

### ✅ 持续验证检查清单

**每个 Phase 完成后必须执行**：

```bash
# 1. 编译检查
pnpm -C packages/core-engine build
pnpm -C packages/api-server build

# 2. 单元测试
pnpm -C packages/core-engine test

# 3. 集成测试（Phase 2+ 执行）
pnpm -C packages/api-server test

# 4. 循环依赖检查（Phase 2+ 执行）
npx madge --circular packages/core-engine/src/index.ts

# 5. 类型检查
pnpm -C packages/core-engine typecheck
pnpm -C packages/api-server typecheck
```

---

## 四、验证标准与合规性检查清单

### 📋 架构合规性检查清单

**领域层检查**：

- [ ] `src/domain/` 下无任何外部框架依赖（express, drizzle, fastify 等）
- [ ] 领域模型包含充血行为（Session.start(), Session.complete() 等）
- [ ] Actions 位于 `domain/actions/` 下
- [ ] 无循环依赖

**应用层检查**：

- [ ] `application/ports/` 清晰定义入站/出站端口
- [ ] 应用服务位于 `application/usecases/`
- [ ] 所有状态管理、编排、监控逻辑在 `application/` 下
- [ ] 依赖方向：应用层 → 领域层（不反向）

**引擎层检查**：

- [ ] `engines/` 下的引擎仅依赖端口接口，不依赖具体实现
- [ ] `engines/llm-orchestration/` 不包含具体 Provider 实现

**适配器层检查**：

- [ ] Schema 验证位于 `adapters/inbound/script-schema/`
- [ ] LLM Provider 实现位于 `api-server/adapters/outbound/llm/`（Phase 4）
- [ ] 适配器实现端口接口

**测试层检查**：

- [ ] 测试目录按 unit/integration/regression/monitoring 组织
- [ ] 单元测试覆盖率 ≥ 70%
- [ ] 集成测试覆盖核心流程
- [ ] E2E 测试在 api-server 层执行

### 🎯 功能完整性验证

**核心功能清单**（重构前后必须一致）：

- [ ] 会话初始化并返回首条 AI 消息
- [ ] 用户输入处理并推进脚本执行
- [ ] 变量提取与作用域解析
- [ ] 多轮对话流程正常
- [ ] 调试信息管道完整
- [ ] 版本兼容性（v1.x 脚本在 v2.x 引擎运行）

**验证方法**：

```bash
# 运行完整测试套件
pnpm -r test

# 启动 dev 环境手动验证
pnpm dev
# 访问 http://localhost:3000/debug.html
# 执行一个完整的会话流程
```

---

## 五、时间估算与里程碑

### 📅 时间线（工作日）

| Phase       | 任务                 | 时间  | 累计   | 里程碑              |
| ----------- | -------------------- | ----- | ------ | ------------------- |
| **Phase 1** | 端口层创建           | 0.5天 | 0.5天  |                     |
|             | 接口抽离             | 0.5天 | 1天    |                     |
|             | LLMOrchestrator 重构 | 1天   | 2天    |                     |
|             | 应用层收拢           | 1天   | 3天    | ✅ M1：端口层建立   |
| **Phase 2** | Actions 归位         | 1天   | 4天    |                     |
|             | Schema 移动          | 0.5天 | 4.5天  |                     |
|             | index.ts 更新        | 0.5天 | 5天    |                     |
|             | api-server 验证      | 1天   | 6天    | ✅ M2：目录结构合规 |
| **Phase 3** | 测试目录创建         | 0.5天 | 6.5天  |                     |
|             | 测试迁移             | 1天   | 7.5天  |                     |
|             | 导入路径修复         | 0.5天 | 8天    | ✅ M3：测试结构对齐 |
| **Phase 4** | LLM 适配器外移       | 1天   | 9天    |                     |
|             | 依赖注入容器         | 1天   | 10天   |                     |
|             | API 路由更新         | 0.5天 | 10.5天 |                     |
|             | E2E 验证             | 0.5天 | 11天   | ✅ M4：依赖注入完成 |
| **Buffer**  | 风险预留             | 1天   | 12天   |                     |

**总工期**：12 个工作日（约 2.5 周）

### 🎖️ 里程碑定义

- **M1**：端口层建立，应用层边界清晰
  - 交付物：端口接口文件、重构后的 LLMOrchestrator
  - 验收：编译通过 + 单元测试通过
- **M2**：目录结构符合六边形架构
  - 交付物：重组后的 src/ 目录、更新的 index.ts
  - 验收：monorepo 完整构建通过
- **M3**：测试代码与架构对齐
  - 交付物：重组的 test/ 目录
  - 验收：测试覆盖率不降低
- **M4**：完整的端口-适配器模式落地
  - 交付物：api-server 依赖注入容器、外移的 LLM 适配器
  - 验收：E2E 测试通过 + 功能验证通过

---

# 六、后续长期优化路线（P2）

**不在本次重构范围内，作为后续技术债处理**：

1. **🔴 领域智能规则下沉**（优先级最高，3-5天）
   - **识别并提取当前混在 ScriptExecutor / MonitorHandler / AiAskAction 中的领域智能规则**
   - 创建领域服务/策略对象：
     - `ConversationSafetyPolicy`（危机判定、风险评估）
     - `ConversationFlowPolicy`（何时退出动作、何时切换话题）
     - `ResponseQualityPolicy`（回避检测、有效性判断）
   - 将这些领域规则从应用层/引擎层下沉到 `domain/services/` 或 `domain/policies/`
   - **这是 DDD 六边形架构的核心价值所在**，当前重构只是目录调整，真正的智能领域提取在 P2

2. **领域模型按聚合重组**（2-3天）
   - 将 `domain/*.ts` 拆分为 `domain/session/`, `domain/script/` 等

3. **引入领域事件**（3-5天）
   - 创建 `domain/events/`
   - 实现 SessionStartedEvent, ActionCompletedEvent 等
   - 通过事件解耦跨聚合协作

4. **完善端口定义**（2天）
   - 补充 IScriptRepository, ISessionRepository 等仓储端口
   - 将数据库访问逻辑从 api-server 封装为适配器

5. **性能优化**（3天）
   - 大脚本执行性能测试与优化
   - 变量作用域解析性能优化

> **关键提示**：本次 Phase 1-4 重构的目标是"**架构分层边界清晰化**"（目录调整 + 端口抽离），
> 而非"领域模型细化"。真正的领域智能规则提取（如将"何时触发危机干预"的判定逻辑从 ScriptExecutor
> 下沉到 Domain Service）属于 P2 阶段的"**领域建模深化**"，需要在当前重构稳定后再进行。

---

## 七、执行检查点与沟通机制

### 🔔 关键决策点

执行过程中以下场景需要确认：

1. **Phase 1 完成后**：确认端口接口设计是否满足需求
2. **Phase 2 开始前**：确认是否同步进行 Domain 聚合拆分（建议跳过）
3. **Phase 4 开始前**：确认 LLM Provider 外移对现有 E2E 测试的影响

### 📊 进度报告节点

- **每日**：提交当天完成的文件变更（小步提交）
- **每个 Phase 完成**：运行验收标准检查，生成测试报告
- **里程碑完成**：生成架构合规性报告，确认可进入下一阶段

---

## 八、附录

### A. 工具推荐

- **循环依赖检测**：`npx madge --circular src/`
- **导入路径批量替换**：VSCode 的"查找并替换"（正则模式）
- **文件移动**：IDE 的 Refactor > Move 功能（自动更新引用）

### B. 参考资料

- 项目架构文档：`.qoder/rules/quest-aligns-with-DDD.md`
- 测试计划：`packages/core-engine/test/TEST_COVERAGE_PLAN.md`
- 六边形架构原理：Alistair Cockburn - Hexagonal Architecture

---

**文档版本**：v1.0  
**创建时间**：2026-02-10  
**负责人**：架构重构小组  
**审核状态**：待审核
