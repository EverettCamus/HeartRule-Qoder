# 版本演进策略

> DDD 第三阶段重构 - Story 3: 版本演进策略

## 目标

为脚本与引擎的版本演化定义兼容性策略，确保系统在迭代过程中保持向后兼容，同时支持渐进式升级。

## 版本化对象

### 1. 脚本版本 (Script Version)

**字段**: `Script.version` (string, 语义化版本号)

**管理范围**:
- 脚本结构 (Phase → Topic → Action)
- Action 配置字段
- 变量命名约定
- 提示词模板引用

**版本格式**: 遵循语义化版本 (Semantic Versioning)
```
MAJOR.MINOR.PATCH
```

- **MAJOR**: 不兼容的结构变更 (如新增必填字段、删除字段)
- **MINOR**: 向后兼容的功能增强 (如新增可选字段、新 Action 类型)
- **PATCH**: 向后兼容的问题修复 (如修正拼写错误、优化提示词)

### 2. 引擎版本 (Engine Version)

**字段**: `@heartrule/core-engine` 包版本

**管理范围**:
- Action 执行器接口 (BaseAction)
- 领域模型接口 (Session, Script, Variable)
- 应用服务接口 (ISessionApplicationService)
- 引擎内部算法 (ScriptExecutor, LLMOrchestrator, VariableScopeResolver)

**版本格式**: 语义化版本
```
MAJOR.MINOR.PATCH
```

- **MAJOR**: 破坏性变更 (如移除旧接口、修改核心行为)
- **MINOR**: 向后兼容的功能增强 (如新增 Action 类型、优化算法)
- **PATCH**: 向后兼容的缺陷修复

### 3. API 版本 (API Version)

**字段**: HTTP API 路径前缀 (如 `/api/v1/sessions`)

**管理范围**:
- HTTP 接口路径
- 请求/响应数据结构
- 认证与授权机制

**版本格式**: `v1`, `v2`, `v3` (整数版本号)

## 兼容性矩阵

| 脚本版本 | 引擎版本 | 兼容性 | 策略 |
|---------|---------|-------|------|
| 1.x     | 2.x     | ✅ 完全兼容 | 引擎保持向后兼容 |
| 2.x     | 2.x     | ✅ 完全兼容 | 脚本与引擎匹配 |
| 2.x     | 1.x     | ⚠️ 部分兼容 | 降级模式 (禁用新特性) |
| 3.x     | 2.x     | ❌ 不兼容 | 提示用户升级引擎 |

## 兼容性规则

### 规则 1: 引擎向后兼容保证

**承诺**: 引擎版本 N 必须能执行版本 N-1 和 N-2 的脚本。

**实现**:
- 保留旧版 Action 接口 (标记为 `@deprecated`)
- 提供适配器层转换旧版配置到新版格式
- 在 ScriptExecutor 中检测脚本版本并选择执行策略

**示例**:
```typescript
// script-executor.ts
if (script.version.startsWith('1.')) {
  // 使用旧版执行逻辑或适配器
  return this.executeLegacyScript(script);
} else {
  // 使用新版执行逻辑
  return this.executeScript(script);
}
```

### 规则 2: 脚本向前兼容检测

**承诺**: 脚本版本 N 在引擎版本 N-1 上执行时，应给出清晰的错误提示。

**实现**:
- 在脚本执行前检查版本兼容性
- 如果不兼容，抛出 `VersionMismatchError` 并提示升级

**示例**:
```typescript
// script-executor.ts
const scriptVersion = parseVersion(script.version);
const engineVersion = parseVersion(packageJson.version);

if (scriptVersion.major > engineVersion.major) {
  throw new VersionMismatchError(
    `Script requires engine v${scriptVersion.major}.x.x, but current engine is v${engineVersion.major}.x.x. Please upgrade the engine.`
  );
}
```

### 规则 3: 字段可选性原则

**承诺**: 新增字段必须是可选的，不得破坏现有脚本。

**实现**:
- 新增 Action 配置字段时，提供默认值
- 使用 TypeScript 的可选属性 (`field?:`) 和 Zod 的 `.optional()`

**示例**:
```typescript
// 旧版 ai_ask 配置
interface AiAskConfigV1 {
  question: string;
  target_variable: string;
}

// 新版 ai_ask 配置 (兼容旧版)
interface AiAskConfigV2 extends AiAskConfigV1 {
  max_rounds?: number;        // 可选，默认 5
  validation_rules?: string[]; // 可选，默认 []
}
```

### 规则 4: 字段重命名策略

**承诺**: 字段重命名必须保留旧字段名的兼容性。

**实现**:
- 同时支持旧字段名和新字段名
- 在 `BaseAction.getConfig()` 中提供自动映射

**当前实现**:
```typescript
// base-action.ts
protected getConfig(key: string, defaultValue: any = undefined): any {
  const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

  return this.config[key] ?? this.config[snakeKey] ?? this.config[camelKey] ?? defaultValue;
}
```

**示例**:
```typescript
// 兼容 target_variable 和 targetVariable
const targetVar = this.getConfig('targetVariable', 'default_var');
```

### 规则 5: Action 类型演进策略

**承诺**: 新增 Action 类型不影响旧脚本，移除 Action 类型需提前声明废弃期。

**实现**:
- 新增 Action 类型直接注册到 `ActionRegistry`
- 移除 Action 类型前，标记为 `@deprecated` 并保留至少 2 个 MAJOR 版本

**废弃流程**:
1. **v2.0**: 标记 `OldAction` 为 `@deprecated`，文档说明替代方案
2. **v2.x**: 保留 `OldAction` 但在执行时打印警告日志
3. **v3.0**: 移除 `OldAction`

### 规则 6: 引擎内部算法演进

**承诺**: 算法优化不得改变外部可观测行为。

**实现**:
- 变量作用域解析、LLM 编排等内部算法可自由优化
- 但必须保持输入输出接口不变
- 如需改变行为，通过配置开关控制（默认保持兼容）

**示例**:
```typescript
// variable-scope-resolver.ts
const useLegacyResolution = config.useLegacyScopeResolution ?? false;

if (useLegacyResolution) {
  return this.resolveScopeLegacy(varName);
} else {
  return this.resolveScopeOptimized(varName);
}
```

## 版本检测机制

### 脚本版本检测

**时机**: 脚本加载时

**位置**: `ScriptExecutor.initialize()` 或 `SessionApplicationService.initializeSession()`

**逻辑**:
```typescript
function checkScriptCompatibility(script: Script): CompatibilityResult {
  const scriptVersion = parseVersion(script.version);
  const engineVersion = parseVersion(ENGINE_VERSION);

  if (scriptVersion.major > engineVersion.major) {
    return {
      compatible: false,
      severity: 'error',
      message: `Script v${script.version} requires engine v${scriptVersion.major}.x or higher. Current engine: v${ENGINE_VERSION}`,
    };
  }

  if (scriptVersion.major < engineVersion.major - 1) {
    return {
      compatible: true,
      severity: 'warning',
      message: `Script v${script.version} is 2+ major versions behind. Consider upgrading to v${engineVersion.major}.x for better features.`,
    };
  }

  return { compatible: true, severity: 'ok', message: 'Compatible' };
}
```

### API 版本协商

**时机**: HTTP 请求处理

**位置**: API 路由层 (`packages/api-server/src/routes/`)

**逻辑**:
```typescript
// 当前: /api/sessions (默认 v1)
// 未来: /api/v2/sessions

app.use('/api/v1', v1Router);
app.use('/api/v2', v2Router);
app.use('/api', v1Router); // 默认指向 v1
```

## 版本元数据扩展

### 脚本元数据

**建议扩展 Script 字段**:
```typescript
interface Script {
  // 现有字段
  scriptId: string;
  version: string;  // 脚本版本
  
  // 建议新增
  engineVersion?: string;  // 创建时的引擎版本
  minEngineVersion?: string; // 最低兼容引擎版本
  maxEngineVersion?: string; // 最高兼容引擎版本
  deprecationNotice?: string; // 废弃通知（如果该脚本版本即将不支持）
}
```

### 引擎元数据

**建议导出版本信息**:
```typescript
// packages/core-engine/src/index.ts
export const ENGINE_VERSION = '2.0.0';
export const COMPATIBLE_SCRIPT_VERSIONS = ['1.x', '2.x'];
```

## 迁移策略

### 自动迁移工具

**目标**: 提供 CLI 工具将旧版脚本升级到新版

**功能**:
- 自动检测脚本版本
- 应用迁移规则 (如字段重命名、结构调整)
- 生成迁移报告

**示例命令**:
```bash
pnpm heartrule-cli migrate-script --input old-script.yaml --output new-script.yaml --target-version 2.0
```

### 渐进式迁移

**策略**: 允许系统同时运行多个版本的脚本

**实现**:
- 数据库 `scripts` 表中 `version` 字段标识脚本版本
- ScriptExecutor 根据版本选择执行策略
- 统计面板显示各版本脚本的运行情况

## 测试策略

### 跨版本兼容性测试

**目标**: 确保引擎能正确执行不同版本的脚本

**测试用例**:
1. **向后兼容测试**: 引擎 v2.x 执行 v1.x 脚本
2. **向前兼容检测测试**: 引擎 v1.x 执行 v2.x 脚本时抛出错误
3. **字段兼容测试**: 旧字段名和新字段名都能正确解析
4. **默认值测试**: 新增可选字段缺失时使用默认值

### 回归测试套件

**目标**: 防止版本演进破坏现有功能

**实现**:
- 维护一组标准脚本 (v1.0, v1.5, v2.0)
- 每次发布前对所有脚本执行完整测试
- 确保输出结果不变 (或按预期变更)

## 文档约定

### 变更日志 (CHANGELOG.md)

**格式**:
```markdown
## [2.0.0] - 2026-01-26

### Added
- 新增 `ISessionApplicationService` 应用服务接口
- 新增 `ExtendedExecutionPosition` 支持多轮对话位置信息

### Changed
- 优化变量作用域解析算法 (保持向后兼容)

### Deprecated
- `ExecutionState.variables` 将在 v3.0 移除，请使用 `ExecutionState.variableStore`

### Removed
- 无

### Fixed
- 修复 ai_ask 多轮对话时变量提取错误

### Breaking Changes
- 无
```

### API 文档版本标注

**示例**:
```typescript
/**
 * 初始化会话
 * 
 * @since v2.0.0
 * @param request - 初始化请求
 * @returns 会话执行响应
 */
initializeSession(request: InitializeSessionRequest): Promise<SessionExecutionResponse>;
```

## 相关规范

### 语义化版本规范

参考: [https://semver.org/](https://semver.org/)

### Node.js 版本策略

参考: [Node.js LTS 版本计划](https://nodejs.org/en/about/releases/)

### TypeScript Breaking Changes

参考: [TypeScript Breaking Changes](https://github.com/microsoft/TypeScript/wiki/Breaking-Changes)

## 实现检查清单

### ✅ 已实现

- [x] Script 包含 `version` 字段
- [x] BaseAction 支持 snake_case/camelCase 字段兼容
- [x] ActionRegistry 支持动态注册 Action

### 🔜 待实现

- [ ] 脚本版本检测机制 (`checkScriptCompatibility`)
- [ ] 引擎版本导出 (`ENGINE_VERSION`)
- [ ] 版本不兼容时的错误提示
- [ ] 自动迁移工具 CLI
- [ ] 跨版本兼容性测试套件
- [ ] 扩展 Script 元数据 (engineVersion, minEngineVersion)

## 版本演进路线图

### v2.x (当前)
- ✅ 完成 DDD 重构三个阶段
- ✅ 定义应用服务接口
- ✅ 统一调试信息管道
- ⏳ 完善版本兼容性检测

### v3.0 (规划中)
- 移除旧版 `ExecutionState.variables` (仅保留 `variableStore`)
- 移除旧版 Action 基类 (`actions/base.ts`)
- 引入脚本 Schema 验证层
- 支持脚本热重载

### v4.0 (远期规划)
- 支持多租户隔离
- 引入插件系统 (自定义 Action 类型)
- 分布式执行引擎

## 相关文档

- [DDD 分析与重构计划](../../docs/design/ddd-analysis-refactor-plan.md)
- [开发指南](../../docs/DEVELOPMENT_GUIDE.md)
- [调试信息管道化](./debug-info-pipeline.md)
- [应用服务接口](../src/application/session-application-service.ts)

## 变更历史

- **2026-01-26**: 初始文档创建，定义版本演进策略（DDD 第三阶段）
