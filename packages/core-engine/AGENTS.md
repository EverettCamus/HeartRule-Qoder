# AGENTS.md - 核心引擎层

## 架构特性

**六大核心引擎**:

1. 脚本执行引擎 → YAML解析与Action流程控制
2. LLM编排引擎 → 统一LLM调用接口（Vercel AI SDK）
3. 变量提取引擎 → dialogue → variables（三种提取方法）
4. 记忆引擎 → 短期/中期/长期记忆管理
5. 话题调度引擎 → 动态话题切换（计划 + 意识驱动）
6. 意识触发引擎 → 情境监控与优先级干预

**测试目录问题**:

- ❌ 存在`test/`和`__tests__/`两个测试目录 → 需要统一
- ✅ 有docs/和\_system/配置目录提供上下文

## 核心目录结构

```
src/
├── domain/               # 领域模型
│   ├── session.ts       # Session实体（核心模型）
│   ├── message.ts       # Message实体（对话消息）
│   ├── script.ts        # Script实体（YAML脚本）
│   └── variable.ts      # Variable实体（会话变量）
├── engines/              # 六大引擎实现
│   ├── script-execution-engine.ts
│   ├── llm-orchestration-engine.ts
│   ├── variable-extraction-engine.ts
│   ├── memory-engine.ts
│   ├── topic-scheduling-engine.ts
│   └── consciousness-trigger-engine.ts
├── actions/              # Action基类与注册表
│   ├── base-action.ts   # BaseAction抽象类
│   ├── registry.ts      # Action注册表（单例）
│   └── types.ts         # ActionResult等类型定义
└── utils/               # 实用工具
test/                    # ❌ 测试目录（应统一命名）
__tests__/               # ❌ 另一个测试目录
docs/                    # 文档目录
_system/                 # 系统配置
config/                  # 运行时配置
```

## 构建与类型检查

**构建配置**:

- tsup构建配置（与shared-types一致）
- ES2022 + ESNext模块
- 严格TypeScript设置（verbatimModuleSyntax）

**构建命令**:

```bash
pnpm --filter @heartrule/core-engine build     # tsup构建
pnpm --filter @heartrule/core-engine typecheck  # 类型检查
pnpm --filter @heartrule/core-engine test       # 运行测试
```

**依赖关系**:

- 依赖@heartrule/shared-types
- 被@heartrule/api-server依赖
- 独立引擎，可headless运行

## 领域模型约束

**会话管理**:

```typescript
class Session {
  id: string;
  userId: string;
  scriptId: string;
  status: SessionStatus;
  variables: Record<string, unknown>;
  // 会话状态流转逻辑
}
```

**消息模型**:

- UserMessage（用户输入）
- AiMessage（ai响应）
- SystemMessage（系统消息）
- 支持流式/非流式输出

**脚本模型**:

- YAML脚本解析到Script对象
- Phase → Topic → Action层次结构
- Action配置基于Zod Schema验证

## Action扩展协议

**添加新Action步骤**:

1. 继承BaseAction抽象类
2. 实现execute方法（返回ActionResult）
3. 在registry.ts中注册
4. 创建对应的类型定义

**Action类型示例**:

- `ai_say`: 向用户传达信息
- `ai_ask`: 引导式提问收集变量
- `ai_think`: 内部认知加工
- `use_skill`: 调用咨询技术脚本

**ActionResult格式**:

```typescript
interface ActionResult {
  success: boolean;
  completed: boolean;
  aiMessage?: string;
  error?: string;
  variables?: Record<string, unknown>;
}
```

## 引擎间通信

**上下文传递**:

```typescript
interface ActionContext {
  session: Session;
  currentPhase?: Phase;
  currentTopic?: Topic;
  messageHistory: Message[];
  variables: Record<string, unknown>;
  llmClient: LLMClient;
}
```

**状态管理**: -[ ] 会话状态在引擎间共享 -[ ] 变量提取由VariableExtractionEngine处理 -[ ] 记忆管理由MemoryEngine负责 -[ ] LLM调用由LLMOrchestrationEngine统一

## 变量提取策略

**三种提取方法**:

1. **直接提取**: 从问题模板预定义字段提取
2. **模式匹配**: 正则表达式提取（如数字评分）
3. **LLM提取**: 使用LLM从自由文本提取结构化数据

**变量验证**:

- Zod Schema运行时验证
- 类型转换（string→number等）
- 缺省值处理

## 技术约束

**TypeScript严格规则**:

- `UnusedLocals`和`UnusedParameters`强制检查
- 拒绝`as any`类型断言（除非绝对必要）
- 优先使用`unknown`而非`any`

**ESLint规则**:

- 最大行长度100字符
- 强制使用async/await而非.then()
- 错误处理必须包含具体错误消息

**反模式**:

- ❌ `@ts-ignore` / `@ts-expect-error`
- ❌ 空的catch块 `catch(e) {}`
- ❌ 类型安全的函数缺少返回类型注解

## 测试约定

**测试目录问题**:

- 当前有`test/`和`__tests__/` → 目标统一到`__tests__/`
- 测试文件命名：`*.test.ts`
- 测试结构：describe → it → expect

**测试覆盖要求**:

- Session领域模型：已完成6个测试
- Script领域模型：已完成4个测试
- YAML解析器：已完成5个测试
- Action扩展：待补充测试

**实用建议**:

1. 统一测试目录到`__tests__/`
2. 添加引擎集成测试
3. 增加E2E测试场景

## 专门技能推荐

**适合技能**:

- `doc-coauthoring`: 引擎设计文档、架构说明
- `internal-comms`: 引擎间接口定义、协议文档
- `webapp-testing`: 引擎测试策略

**核心Agent提示**:

- 提到"核心引擎"、"六大引擎" → 参考此文档
- 提到"Action扩展"、"YAML脚本" → 检查src/actions/
- 提到"领域模型" → 检查src/domain/
- 提到"测试目录混乱" → 统一test/和**tests**/
