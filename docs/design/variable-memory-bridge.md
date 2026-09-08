---
status: decision-recorded
last_updated: 2026-09-08
---

# 变量-记忆桥接设计

> **关联**:
>
> - 上游：[记忆框架设计](memory-framework.md) — 定义五种记忆类型及其职责，本文补充变量如何从记忆取值
> - 关联：[recall 快慢通道设计](ai-ask-memory-recall.md) — 变量通过 recall 通道检索记忆
> - 关联：[意识系统设计](consciousness-system.md) — 意识同时依赖变量和记忆两个数据源
>
> **版本**: v0.1.1
> **日期**: 2026-06-03
>
> ⚠️ **校准（2026-09-08 · ADR 005 生效）**：Hindsight 已删除 opinion 类型（2026 年初起），职能拆至 observation（自动 consolidate 的原子信念 + 证据）与 mental model（常驻公式化判断）。本文原"Hindsight Opinion"承接与"confidence 分数对比"的合并策略一并修订——临床判断的动态承载改为 observation + mental model，比较信号改为可核验的客观证据信号，无数值 confidence（见 `decisions/004` 决策 1/6 修订与 `decisions/005` 决策 1/3）。

---

## 1. 问题

Phase 1 完成后，Hindsight 已经可以跨会话 retain/recall/reflect。但变量系统和记忆系统之间的职责边界尚未明确界定。当前存在以下问题：

1. **同一信息存两处**：用户在会谈中说「我从小就觉得永远不够好」→ Hindsight retain 记住了 → ai_think 又把它提取出来存进了全局变量 `核心信念`。下次会话，变量被读取——但如果 Hindsight 里的判断已更新（observation 被 refine、mental model 被后台重写），变量里的版本就是过期的。

2. **变量类型混杂**：全局变量既有操作参数（`咨询师名`、`session_count`），也有语义结论（`核心信念`、`主要压力源`）。后者本质上是记忆的衍生品，不应该独立存储。

3. **变量更新缺乏机制**：当前变量只在 `ai_ask` 收集时写入，或 `ai_think` 占位符填充。没有从记忆系统刷新变量的路径。

---

## 2. 职责边界

### 2.1 变量该存什么（操作必需）

| 类别         | 示例                                         | 特征                           |
| ------------ | -------------------------------------------- | ------------------------------ |
| **操作参数** | `{情绪问题} = "焦虑"`, `{治疗阶段} = "中期"` | 脚本分支/跳转需要精确值        |
| **进程控制** | `{current_round} = 3`, `{session_count} = 5` | 跨回合/跨会话计数              |
| **全局事实** | `{用户名} = "张伟"`, `{年龄} = 34`           | 客观固定信息，入诊时填一次即可 |

### 2.2 变量不该存什么（应交由记忆）

| 不该存                     | 应交由                               | 原因                                                                                                                  |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 用户描述焦虑的完整叙事     | Hindsight recall()                   | 变量只需知道"情绪问题是焦虑"，不需要记焦虑的具体表现                                                                  |
| 信念形成的童年经历详情     | Hindsight recall()                   | 变量只需"核心信念 = 我不够好"，经历在记忆中，需要时 recall                                                            |
| PHQ-9 得分变化的趋势分析   | Hindsight reflect()                  | 变量只需最新得分，趋势是记忆系统的综合能力                                                                            |
| 咨询师跨会话形成的临床判断 | Hindsight observation + mental model | 判断随证据动态演化（observation consolidate/refine、mental model 后台重写），变量的值应该是调用时从记忆获取的最新版本 |

### 2.3 边界规则

```
变量 = 操作参数的精确值（脚本流程控制需要）
记忆 = 语义理解的内容 + 动态演化的判断（AI 理解来访者需要）

变量可以从记忆获取值，但不独立存储语义结论。
变量的权威来源是记忆，而不是反过来。
```

---

## 3. 变量的双重来源

基于 `memory-framework.md` §2.1.1，变量值有两个来源：

```
来源 1: 对话中直接提取 (Phase 0 已实现)
  ai_ask 的 extractionMethod: direct / pattern / llm
  → 从用户单次回复中提取精确值
  → 适用：单次即可收集的信息

来源 2: 从会谈记忆中调取 (Phase 2b 新增)
  ai_think 调用 recall() 从 Hindsight 获取
  → 用户可能跨多次对话提到同一个信息
  → 不需要反复向用户收集，也不需要全局变量持久化
  → 示例：
    recall("用户的核心信念")
    → World: "用户自述'永远不够好'的感觉源于母亲高期望"
    → Observation: "完美主义倾向与童年条件化自我价值感相关"
    → ai_think 综合后写入变量 {核心信念} = "完美主义倾向（与童年条件化自我价值感相关）"
```

---

## 4. 变量刷新机制

### 4.1 核心思路：Piggyback 变量刷新

**在执行 Action N 时，将 Action N+1 引用的变量纳入 Action N 的 LLM 输出 schema，让 LLM 在处理当前任务的同时顺便评估这些变量的值是否需要更新。**

```
Action N 执行:
  输入: {{chat}} + {%memory_context%} + 当前模板
  LLM 输出:
    ├── 当前 action 的回复内容 + 目标变量     ← 原任务
    └── Action N+1 的引用变量 (如已变化则更新)  ← 蹭车刷新

  → 同步写入 VariableStore
  → 异步发起 Hindsight recall (双保险)
```

**成本**：输出 token 增加 ~50-200 per 变量，输入 token 增加 ~100-300 per 变量（提示 LLM "顺便判断这些变量是否需要更新"）。无额外 LLM 调用。

**与独立 ai_think 的成本对比**：

| 方案             | 每次刷新                         | 10 变量/会话 | 50 会话/天   |
| ---------------- | -------------------------------- | ------------ | ------------ |
| Piggyback        | ~200 tokens 输出增量             | ~2k tokens   | ~100k tokens |
| 独立 ai_think    | 1 次完整 LLM 调用 (~1.5k tokens) | ~15k tokens  | ~750k tokens |
| Hindsight recall | 1 次 HTTP（无 LLM）              | 0 LLM tokens | 0 LLM tokens |

**Piggyback 的边际成本约为独立 ai_think 的 1/10，且不增加 LLM 调用次数。**

### 4.2 双路径：同步 LLM + 异步 Hindsight

只靠 LLM piggyback 有一个弱点：LLM 在生成回复时主要注意力在"当前要问用户什么"，对被动评估的变量可能关注不足。Hindsight recall 虽然异步，但返回的是结构化、经过三网络分类（world/experience/observation）的记忆，准确度更高。

**双路径设计**：

```
Action N 执行时:
  ┌─────────────────────────────────────────────────────┐
  │ 路径 1 (同步): LLM Piggyback                        │
  │   Action N 的 LLM 输出中包含 Action N+1 变量的刷新值   │
  │   → 立即写入 VariableStore                          │
  │   → 标记 source: 'llm_piggyback'                    │
  │   → 确保 Action N+1 执行时变量已是最新               │
  └─────────────────────────────────────────────────────┘
  ┌─────────────────────────────────────────────────────┐
  │ 路径 2 (异步): Hindsight recall                     │
  │   发起 recall("核心信念") 等查询                     │
  │   → 结果回来后比较证据强度与时效                     │
  │   → 如果 Hindsight 的观察更新/证据更充分，覆盖        │
  │   → 标记 source: 'hindsight_recall'                 │
  │   → 作为长期记忆的校准锚点                           │
  └─────────────────────────────────────────────────────┘
```

**合并策略**：异步结果返回时，用证据强度的客观信号比较（ADR 005 决策 3——记忆层不持久化数值 confidence，只用可核验信号）：

```
if (hindsightObservation 比 piggyback 值更新鲜（recall 时间戳 / 条目时间线）||
    hindsightObservation 证据更充分（sourceFactIds 更多 / refine 方向 strengthened）||
    对应 mental model 标记 is_stale（提示旧公式化已过期，需以新证据覆盖）) {
  覆盖变量值，source = 'hindsight_recall'
}
```

#### Hindsight 在本 session 内的角色

Per-action `retain()` 在每个 action 结束后立即发起（fire-and-forget），Hindsight 服务端的提取 + 索引在秒级完成：

```
时间线:
  Action 1 执行 → retain(1) 发起
  Action 2 执行 → retain(2) 发起, Action 1 的 recall 可能已可用
  Action 3 执行 → retain(3) 发起, Action 1-2 的 recall 确定可用
```

本 session 内超出 `{{chat}}` 窗口的早期对话，Hindsight 是唯一的记忆来源——recall 不是"跨 session 才需要"，而是"对话长度超出上下文窗口就需要"。前一 action 执行 retain，后续 action 的 recall 时间上充裕。

### 4.3 Look-Ahead 变量解析

#### 解析范围

在执行 Action N 之前，向前看 Action N+1，解析其引用的变量。

**引用来源**：

| 引用位置               | 示例                                           | 解析方式                                     |
| ---------------------- | ---------------------------------------------- | -------------------------------------------- |
| `config.prompt` / 模板 | `"你之前提到过{{核心信念}}..."`                | 正则 `\{\{(\w+)\}\}`                         |
| `config.condition`     | `condition: "情绪问题 == '焦虑'"`              | 解析条件表达式中的变量名                     |
| `config.system_prompt` | `"用户的核心信念是{{核心信念}}"`               | 正则匹配                                     |
| `config.memory_query`  | `memory_query: '用户的核心信念和完美主义倾向'` | 不需要解析（这是 recall 查询，不是变量引用） |

#### 分支处理

当 Action N+1 是条件分支（`condition`）时，简单策略：**收集所有分支中引用的变量**。

```yaml
- action_id: ask_mood
  action_type: ai_ask
  # ... 根据用户情绪走不同分支

- action_id: path_anxiety
  condition: "情绪问题 == '焦虑'"
  config:
    prompt: '你之前提到{{核心信念}}和{{应对模式}}...'

- action_id: path_default
  config:
    prompt: '让我们继续聊聊{{主要压力源}}...'
```

Action `ask_mood` 的 look-ahead 收集：`{核心信念, 应对模式, 主要压力源}` —— 三个变量全部纳入刷新。

**理由**：变量数量少（通常 1-5 个），全量收集不造成显著 token 膨胀；避免路径预测错误的代价。如果后期变量膨胀到 10+，再引入上限机制（每轮最多 3 个，按出现顺序优先级）。

#### Fallback 链

不是所有情况下 Action N 都有 LLM 输出 schema 可以蹭：

```
1. Action N 是 ai_say (纯输出, 无 LLM 输出 schema)
   → 回退到 Action N-1 的 look-ahead 结果
   → 如果仍然没有，使用当前 VariableStore 中的值（可能过时）

2. Action N 是 session 第一个 action (冷启动)
   → 依赖 Session 初始化时的 Hindsight recall (session-orchestrator.ts:253)
   → 此时 recall 返回的是跨 session 的记忆，本 session 还没有新信息需要刷新

3. Action N+1 是 exit_decision / 条件跳转
   → 不刷新（这些 action 不引用变量做内容替换，只做条件判断）
```

### 4.4 变量 `autoRefresh` 属性

默认所有变量参与自动刷新。某些变量需要关闭。

#### 默认策略

| 变量语义                                             | 默认 autoRefresh | 理由                                      |
| ---------------------------------------------------- | ---------------- | ----------------------------------------- |
| 临床判断（核心信念、主要压力源、情绪状态）           | `true`           | 随对话深入动态演化，需要保持最新          |
| 用户人口学信息（姓名、年龄、性别）                   | `false`          | 客观固定，入诊后不再变化                  |
| 量表得分（PHQ-9、GAD-7）                             | `false`          | 只在用户提交新量表时更新，不应被 LLM 推测 |
| 进程控制（session_count、current_round、max_rounds） | `false`          | 引擎管理，LLM 不应触碰                    |
| 脚本分支参数（治疗阶段、当前技术）                   | `false`          | 脚本作者显式控制                          |

#### YAML 声明

```yaml
variables:
  global:
    - name: 核心信念
      type: string
      autoRefresh: true
      refreshQuery: '用户的核心信念和完美主义倾向' # Hindsight recall 用的查询

    - name: 用户名
      type: string
      autoRefresh: false

    - name: PHQ-9得分
      type: number
      autoRefresh: false
      refreshTrigger: '量表提交' # 只在特定事件触发刷新

    - name: 情绪状态
      type: string
      autoRefresh: true
      refreshQuery: '用户当前的情绪状态和变化趋势'
```

#### 运行时行为

```typescript
interface VariableDefinition {
  name: string;
  type: VariableType;
  scope: VariableScope;
  autoRefresh: boolean; // 默认 true
  refreshQuery?: string; // Hindsight recall 用的语义查询
  refreshTrigger?: string; // 可选：仅特定事件触发刷新
}
```

运行时逻辑：

```
lookAheadVariables(actionN+1)
  → 过滤 autoRefresh === false 的变量
  → 剩余变量纳入 piggyback 输出 schema
```

### 4.5 实现阶段

#### Phase A: Look-Ahead 解析器（核心引擎）

在 `ScriptExecutor` 中增加向前看、解析下一个 action 变量引用的能力：

- 新增 `resolveLookAheadVariables(currentPosition, script)` 方法
- 返回 `{ varName, definition }[]`（已过滤 `autoRefresh: false`）
- 注入到 `ActionContext.metadata.lookAheadVariables`

**关键文件**：`packages/core-engine/src/engines/script-execution/script-executor.ts`

#### Phase B: AiAskAction Piggyback

在 `AiAskAction` 的输出 schema 中追加 look-ahead 变量：

- 读取 `context.metadata.lookAheadVariables`
- 在 LLM 输出 JSON schema 中追加字段（如 `_refresh_核心信念`）
- 解析 LLM 返回后，将非空值写入 VariableStore
- 标记 `source: 'llm_piggyback'`

**关键文件**：`packages/core-engine/src/domain/actions/ai-ask-action.ts`

#### Phase C: 异步 Hindsight Recall

在 action 完成后，对 look-ahead 变量发起异步 recall：

- 读取 `variableDefinition.refreshQuery`
- 调用 `memoryRepository.recall(userId, refreshQuery)`
- 结果回来后与当前值比较，按合并策略决定是否覆盖
- 标记 `source: 'hindsight_recall'`

**关键文件**：`packages/api-server/src/services/session-orchestrator.ts`

#### Phase D: VariableMetadata 扩展

扩展 `VariableValue` 类型，增加来源追踪字段：

```typescript
// ADR 005 决策 3：不保留 confidence: number ——
// 证据强度由 recall 命中的 observation 信号（新鲜度 / proofCount / refine 方向）+ mental model is_stale 表达
interface VariableValue {
  value: unknown;
  type: VariableType;
  lastUpdated: string;
  source: 'user_input' | 'llm_extraction' | 'llm_piggyback' | 'hindsight_recall';
  refreshQuery?: string;
  scope: VariableScope;
}
```

**关键文件**：`packages/shared-types/src/domain/variable.ts`

### 4.6 YAML 完整示例

```yaml
phases:
  - id: assessment
    topics:
      - id: emotional_state
        actions:
          # Action 1: 初始收集情绪问题
          - action_id: ask_emotion
            action_type: ai_ask
            config:
              prompt: '请描述你最近的情绪状态'
              output:
                - varName: 情绪问题
                  method: llm
                - varName: 情绪强度
                  method: llm
            # look-ahead → 下一个 action 引用了 {情绪问题}

          # Action 2: 根据情绪走分支
          - action_id: ask_detail
            action_type: ai_ask
            config:
              prompt: '关于你的{{情绪问题}}，能多说一些吗？具体在什么情况下出现？'
              output:
                - varName: 情绪触发场景
                  method: llm
            # Action 1 的 LLM 输出中已刷新了 {情绪问题}
            # 如果 Hindsight 中有更新的判断，异步回调会覆盖

          # Action 3: 用 ai_think 综合分析，从记忆补充变量
          - action_id: think_synthesize
            action_type: ai_think
            config:
              think_goal: '综合评价用户情绪状态和可能的核心信念'
              output_variables: [核心信念, 主要压力源]
              use_memory: true
              memory_query: '用户的核心信念、主要压力来源、童年经历'
            # ai_think 是显式的综合推理节点
            # 自动刷新机制不能替代深度推理，只能保持值的"不陈旧"

      - id: intervention
        actions:
          - action_id: ask_coping
            action_type: ai_ask
            config:
              prompt: '基于我们目前对{{核心信念}}和{{主要压力源}}的理解...'
            # {{核心信念}} 可能已被前面的 piggyback 或 Hindsight 异步刷新
```

---

## 5. 当前实现状态

| 能力                       | 状态        | 说明                                                           |
| -------------------------- | ----------- | -------------------------------------------------------------- |
| ai_ask 对话中提取变量      | ✅ Phase 0  | direct / pattern / llm 三种方法                                |
| ai_think 占位符填充        | ✅ Phase 0  | 仅硬编码占位符，不做真实推理                                   |
| Session 启动时 recall      | ✅ Phase 1  | 固定查询「用户核心问题、关键事件、治疗进展」                   |
| `{%memory_context%}` 注入  | ✅ Phase 1  | ai_ask / ai_say 模板中的记忆上下文占位符                       |
| per-Action retain          | ✅ Phase 2a | Action 完成时 retain 完整对话片段                              |
| Look-Ahead 变量解析器      | ❌ 待实现   | §4.5 Phase A: ScriptExecutor 中解析下一个 action 的变量引用    |
| AiAskAction Piggyback 刷新 | ❌ 待实现   | §4.5 Phase B: LLM 输出 schema 中追加 refresh 字段              |
| 异步 Hindsight Recall      | ❌ 待实现   | §4.5 Phase C: action 完成后异步 recall，择优覆盖               |
| VariableMetadata 扩展      | ❌ 待实现   | §4.5 Phase D: source 字段扩展 llm_piggyback / hindsight_recall |
| 全局变量收缩               | ❌ 持续     | 需要审计现有脚本中的全局变量，逐步迁移                         |

---

## 6. 迁移策略

### 6.1 识别需要迁移的变量

审计现有 YAML 脚本中的全局变量声明，标记每项的类别：

```
操作参数（保留在变量）:
  - 咨询师名、用户名、当前会谈次数、max_rounds

语义值（应迁移到记忆）:
  - 核心信念 → recall("用户的核心信念")
  - 主要压力源 → recall("用户的主要压力来源")
  - 情绪状态 → recall("用户当前的情绪状态")
  - 应对模式 → recall("用户的应对模式")

全局事实（保留在变量，但来源标记为记忆）:
  - PHQ-9得分 → 量表提交时写入变量，同时 retain 到 Hindsight
```

### 6.2 渐进式迁移

1. 先在新的 YAML 脚本中为变量配置 `autoRefresh` + `refreshQuery` 属性
2. 旧的全局变量保持不变，不做破坏性变更（默认 `autoRefresh: true`，行为向后兼容）
3. 当 piggyback 或 Hindsight recall 更新了变量值时，记录 `source` 为 `llm_piggyback` 或 `hindsight_recall`
4. 逐步确认变量值从记忆获取的准确性后，对固定变量设置 `autoRefresh: false`，移除对应的全局变量声明

---

## 7. 设计决策记录

| 决策                      | 选择                                                                    | 理由                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 变量收缩范围              | 仅设计文档，不立即实施                                                  | 需要先审计现有脚本中的全局变量使用情况                                                                         |
| 变量刷新策略              | Piggyback（蹭已有 LLM 调用）                                            | 边际成本 ~0.1 倍 LLM 调用 vs 独立 ai_think 的 1 倍                                                             |
| 刷新时机                  | Action N 执行时刷新 Action N+1 的变量                                   | 确保变量在被使用前已更新；per-action retain 在秒级完成，时间窗口充裕                                           |
| 双路径                    | 同步 LLM piggyback + 异步 Hindsight recall                              | LLM 保证及时性（下一 action 立即可用），Hindsight 保证准确性（结构化记忆 > LLM 被动评估）                      |
| Look-ahead 深度           | 仅看下一个 action                                                       | 降低解析复杂度；多看几个 action 的收益递减                                                                     |
| 分支处理                  | 收集所有分支的变量                                                      | 变量数量少（1-5），全量收集不造成显著成本；避免路径预测错误                                                    |
| Hindsight 本 session 使用 | 支持                                                                    | Per-action retain 是异步快速的，不需要等跨 session                                                             |
| autoRefresh 默认          | `true`                                                                  | 大多数变量需要保持新鲜；固定信息（人口学、量表得分）显式关闭                                                   |
| 合并策略                  | Hindsight 的客观证据信号更优时覆盖（ADR 005 决策 3，无数值 confidence） | LLM piggyback 是"快速但不一定准确"，Hindsight 是"稍慢但结构化"；证据强度用 proofCount / 新鲜度 / is_stale 判断 |
| 全局变量审计              | 后续 YAML 脚本层面做                                                    | 不涉及代码改动，由咨询师在脚本工程中标记                                                                       |
