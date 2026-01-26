# 关键测试用例补充计划

> DDD 第三阶段重构 - 测试覆盖增强

## 目标

补齐核心路径与边界场景的测试用例,确保重构后的系统稳定性与可靠性。

## 测试策略

### 测试金字塔

```
       E2E Tests (5%)
         /\
        /  \
       /    \
      /  集成  \
     /  测试   \
    /  (25%)   \
   /____________\
  /              \
 /   单元测试      \
/____(70%)________\
```

### 测试优先级

1. **P0 (必须)**: 核心业务流程、数据完整性
2. **P1 (重要)**: 边界场景、错误处理
3. **P2 (建议)**: 性能优化、用户体验

## 测试覆盖现状

### ✅ 已有测试

| 测试文件 | 覆盖内容 | 优先级 |
|---------|---------|-------|
| `ai-ask-incomplete-action.test.ts` | ai_ask 多轮对话、变量提取 | P0 |
| `variable-extraction.test.ts` | 变量提取引擎、输出结构验证 | P0 |
| `variable-migration.test.ts` | 变量作用域迁移 | P1 |
| `prompt-template.test.ts` | 提示词模板替换 | P1 |
| `output-list.test.ts` | output_list 结构化输出 | P1 |

### ❌ 缺失的关键测试

#### 1. 应用服务接口测试 (P0)

**目标**: 验证 `ISessionApplicationService` 接口的实现

**测试文件**: `packages/core-engine/test/session-application-service.test.ts`

**测试场景**:
- ✅ 初始化会话并获取第一条 AI 消息
- ✅ 处理用户输入并推进会话执行
- ✅ 变量正确写入 variableStore
- ✅ debugInfo 正确传递
- ❌ 错误场景处理 (脚本解析失败、LLM 超时)
- ❌ 多轮对话状态保持
- ❌ 会话恢复 (从中间状态继续执行)

#### 2. 调试信息管道测试 (P0)

**目标**: 验证调试信息从 LLM 到响应的完整流转

**测试文件**: `packages/core-engine/test/debug-info-pipeline.test.ts`

**测试场景**:
- ✅ LLMProvider 生成 debugInfo
- ✅ Action 传递 debugInfo
- ✅ ScriptExecutor 保存 lastLLMDebugInfo
- ❌ Action 未完成时 debugInfo 传递
- ❌ 多轮对话时 debugInfo 更新
- ❌ debugInfo 包含完整的 prompt/response/config

#### 3. 版本兼容性测试 (P1)

**目标**: 验证脚本版本与引擎版本的兼容性

**测试文件**: `packages/core-engine/test/version-compatibility.test.ts`

**测试场景**:
- ❌ 引擎 v2.x 执行 v1.x 脚本 (向后兼容)
- ❌ 引擎 v1.x 执行 v2.x 脚本 (版本检测)
- ❌ 字段重命名兼容 (snake_case ↔ camelCase)
- ❌ 新增可选字段使用默认值

#### 4. 边界场景测试 (P1)

**测试文件**: `packages/core-engine/test/boundary-scenarios.test.ts`

**测试场景**:
- ❌ 空脚本执行
- ❌ 单 Action 脚本
- ❌ 超长对话历史 (sliding window)
- ❌ 变量名冲突 (不同作用域同名变量)
- ❌ LLM 返回空响应
- ❌ LLM 返回非 JSON 格式
- ❌ 用户输入特殊字符 (emoji, 换行符)

#### 5. 性能基准测试 (P2)

**测试文件**: `packages/core-engine/test/performance-benchmark.test.ts`

**测试场景**:
- ❌ 大脚本执行性能 (100+ Actions)
- ❌ 变量作用域解析性能 (1000+ 变量)
- ❌ LLM 批量调用性能
- ❌ 内存占用测试

## 测试实现计划

### Phase 1: 核心路径覆盖 (本次完成)

**目标**: 补齐 P0 优先级测试

**任务**:
1. ✅ 创建 `session-application-service.test.ts` 骨架
2. ✅ 实现会话初始化测试
3. ✅ 实现用户输入处理测试
4. ⏳ 实现错误场景测试

**验收标准**:
- 所有 P0 测试场景通过
- 核心路径测试覆盖率 > 80%

### Phase 2: 边界场景覆盖 (后续)

**目标**: 补齐 P1 优先级测试

**任务**:
1. 创建 `debug-info-pipeline.test.ts`
2. 创建 `version-compatibility.test.ts`
3. 创建 `boundary-scenarios.test.ts`

**验收标准**:
- P1 测试场景通过
- 边界场景测试覆盖率 > 60%

### Phase 3: 性能基准测试 (可选)

**目标**: 建立性能基线

**任务**:
1. 创建 `performance-benchmark.test.ts`
2. 集成性能监控工具 (如 Clinic.js)

## 测试工具与框架

### 单元测试

- **框架**: Vitest
- **断言库**: Vitest (内置)
- **Mock**: Vitest vi.fn()

### 集成测试

- **框架**: Vitest
- **数据库**: 测试专用 PostgreSQL 实例
- **LLM Mock**: 自定义 MockLLMProvider

### E2E 测试

- **框架**: Playwright
- **位置**: `packages/api-server/test-*.ts`

## 测试数据管理

### 测试脚本

**位置**: `packages/core-engine/test/fixtures/scripts/`

**内容**:
- `minimal-script.yaml`: 最小脚本 (1 Phase, 1 Topic, 1 Action)
- `multi-round-script.yaml`: 多轮对话脚本
- `complex-script.yaml`: 复杂脚本 (多 Phase, 变量作用域)
- `v1-legacy-script.yaml`: v1.x 版本脚本 (兼容性测试)

### Mock 数据

**位置**: `packages/core-engine/test/fixtures/mocks/`

**内容**:
- `mock-llm-responses.json`: 预定义的 LLM 响应
- `mock-variables.json`: 预定义的变量集合

## 测试执行命令

```bash
# 运行所有测试
pnpm -C packages/core-engine test

# 运行单个测试文件
pnpm -C packages/core-engine test session-application-service.test.ts

# 运行测试并生成覆盖率报告
pnpm -C packages/core-engine test:coverage

# 监听模式 (开发时)
pnpm -C packages/core-engine test:watch
```

## 测试覆盖率目标

| 模块 | 当前覆盖率 | 目标覆盖率 |
|-----|----------|-----------|
| Domain (领域模型) | ~60% | 90% |
| Actions (动作执行器) | ~70% | 85% |
| Engines (引擎) | ~50% | 80% |
| Application (应用服务) | ~0% | 80% |
| **整体** | **~55%** | **85%** |

## 回归测试规范

### 触发条件

以下变更必须执行完整回归测试：
1. 修改核心领域模型 (Session, Script, Variable)
2. 修改 Action 执行逻辑
3. 修改变量作用域解析算法
4. 升级 MAJOR 或 MINOR 版本

### 回归测试套件

**位置**: `packages/core-engine/test/regression/`

**内容**:
- 所有 P0 测试用例
- 历史 Bug 修复的回归测试 (如 variableStore 初始化修复)

## 测试文档模板

### 单元测试模板

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ModuleName', () => {
  let instance: ModuleName;

  beforeEach(() => {
    // Setup
    instance = new ModuleName();
  });

  describe('methodName', () => {
    it('should handle normal case', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = instance.methodName(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case: empty input', () => {
      // ...
    });

    it('should throw error when invalid input', () => {
      expect(() => instance.methodName(null)).toThrow();
    });
  });
});
```

### 集成测试模板

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Integration: SessionFlow', () => {
  let db: Database;
  let executor: ScriptExecutor;

  beforeAll(async () => {
    // Setup database and dependencies
    db = await setupTestDatabase();
    executor = new ScriptExecutor(/* ... */);
  });

  afterAll(async () => {
    // Cleanup
    await db.close();
  });

  it('should complete full session flow', async () => {
    // Arrange
    const script = await loadTestScript('minimal-script.yaml');

    // Act
    const result = await executor.execute(script);

    // Assert
    expect(result.status).toBe('completed');
  });
});
```

## 相关规范

- [开发指南 - 测试规范](../../docs/DEVELOPMENT_GUIDE.md#测试规范)
- [E2E 测试指南](../../docs/E2E_TESTING_GUIDE.md)
- [变量提取测试报告](../../docs/test/variable-extraction-test-report.md)

## 实施进度

- [x] 完成测试计划文档
- [ ] Phase 1: 核心路径测试 (session-application-service.test.ts)
- [ ] Phase 2: 边界场景测试
- [ ] Phase 3: 性能基准测试
- [ ] 达成整体覆盖率 85% 目标

## 变更历史

- **2026-01-26**: 初始文档创建，定义测试补充计划（DDD 第三阶段）
