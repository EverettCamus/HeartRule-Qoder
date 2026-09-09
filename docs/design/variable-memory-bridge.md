---
status: decision-recorded
last_updated: 2026-09-09
---

# 变量-记忆桥接设计

> **关联**:
>
> - 上游：[记忆框架设计](memory-framework.md) — 定义五种记忆类型及其职责，本文补充变量如何从记忆取值
> - 关联：[recall 快慢通道设计](ai-ask-memory-recall.md) — 变量通过 recall 通道检索记忆
> - 关联：[意识系统设计](consciousness-system.md) — 意识同时依赖变量和记忆两个数据源
>
> **版本**: v0.2.0
> **创建**: 2026-06-03 · **修订**: 2026-09-09
>
> ⚠️ **校准（2026-09-08 · ADR 005 生效）**：Hindsight 已删除 opinion 类型（2026 年初起），职能拆至 observation（自动 consolidate 的原子信念 + 证据）与 mental model（常驻公式化判断）。本文原"Hindsight Opinion"承接与"confidence 分数对比"的合并策略一并修订——临床判断的动态承载改为 observation + mental model，比较信号改为可核验的客观证据信号，无数值 confidence（见 `decisions/004` 决策 1/6 修订与 `decisions/005` 决策 1/3）。
>
> ⚠️ **修订（2026-09-09 · v0.2.0，人批准）**：证据驱动修订三件事——(1) 新增**变量消费方式二分**（§2.4）：条件消费需标量 → 快照缓存模型；插值消费不需标量 → 收缩为 memory_query 声明 + 记忆上下文注入（快通道推广）；(2) 修正**合并策略**（§4.2）：按时机分工——新鲜度层级上 piggyback（看得见 {{chat}}）严格新于 recall（滞后于 per-action 异步 retain），原"recall 时效更优时覆盖"分支会话内不可达；(3) 快照增加**证据锚**字段（§4.5 Phase D，可互查原则 3 + ADR 005 客观信号，无数值 confidence）。
>
> ⚠️ **裁决（2026-09-09 · ADR 007 优先，人已裁定）**：v0.2.0 与 [007 ADR](decisions/007-variable-document-boundary.md) 矛盾处以 007 为准——(1) 跨会话权威：v0.2.0「快照是可重建缓存（权威在记忆）」改为信息点文档唯一权威，装载读文档、recall 只兜底（007 决策 2/4）；(2) 异步 recall 回包不再写变量（evidence 锚 / 空值兜底路径取消），会话内唯一刷新源是 piggyback（007 决策 6）。冲突区段的完整修订由 backlog Epic D [design] 故事执行。

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

### 2.4 消费方式二分：语义结论再分两类

"变量该存什么"按消费方式再切一刀——同一个语义结论（如"核心信念"），消费方式不同，存法不同：

```
消费方式            要的是                        存储模型
──────────────────────────────────────────────────────────────
条件消费            精确标量（驱动分支/退出判断）   快照缓存：存值 + 消费前 piggyback
（condition /        没有值就无法分支               刷新 + 会话结束 reconcile + 证据锚
  exit_decision /
  队列调整）

插值消费            符合当前理解的表达             不存值：memory_query 声明 + 记忆上下文
（仅 prompt/模板     不需要精确值，措辞允许演化      注入（mental model / observation 已在
  插值）                                           {{memory_context}}；消费点按需
                                                   recall 补齐，0 LLM、≤200ms 预算，
                                                   继承 ADR 006 决策 2/3 的快通道约束）
```

**分类规则**：按变量的**全部引用点**定类——任何一处出现在 condition / exit_decision / 队列调整 → 标量类（缓存模型）；仅出现在 prompt/模板插值 → 可收缩类（memory_query 声明）。

**两条配套纪律**：

1. **静态校验兜底误用**（渐进规则化原则 3）：引擎加载 YAML 时分析引用位置，可收缩类声明出现在条件位置 → 报错，不静默走错分支。
2. **可追溯不丢失**：插值消费点的 `memory_query` 声明保留了维度锚——"AI 为什么这么说"仍可回溯到记忆证据链（observation 的 sourceFactIds / mental model 的 based_on），不依赖变量快照的写入记录。

**为什么收缩成立（ADR 005 之后更强）**：案例公式化判断（核心信念、主要压力源等）已由 mental model 承载——会话启动零 LLM 读入 {{memory_context}}、后台随证据重写。插值消费的 LLM 当轮已持有最新判断，再存标量副本 = 同一信息第三处存（表 + mental model + 快照），正是 §1 问题 1 的病。收缩后无值即无过期，且 look-ahead/piggyback 集合缩小（token 成本下降）。

---

## 3. 变量的双重来源

基于 `memory-framework.md` §2.1.1，变量值有两个来源：

```
来源 1: 对话中直接提取 (Phase 0 已实现)
  ai_ask 的 extractionMethod: direct / pattern / llm
  → 从用户单次回复中提取精确值
  → 适用：单次即可收集的信息

来源 2: 从会谈记忆中调取 (Phase 2b 新增，服务于条件消费的标量变量)
  案例公式化变量（核心信念、主要压力源等）: 读取 mental model（零 LLM）
    → 会话启动已注入 {{memory_context}}，ai_think 需要标量时直接取 mental model 内容
  非公式化变量: ai_think 调用 recall() 综合
    → 用户可能跨多次对话提到同一个信息
    → 不需要反复向用户收集，也不需要全局变量持久化
    → 示例：
      recall("用户的核心信念")
      → World: "用户自述'永远不够好'的感觉源于母亲高期望"
      → Observation: "完美主义倾向与童年条件化自我价值感相关" (proofCount: 3)
      → ai_think 综合后写入变量 {核心信念}，evidence 锚指向 observation 的 sourceFactIds
  插值消费的变量不经过这条路径——按 §2.4 收缩为 memory_query 声明，无值可写
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
  → 异步发起 Hindsight recall (校准锚, 见 §4.2)
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

只靠 LLM piggyback 有一个弱点：LLM 在生成回复时主要注意力在"当前要问用户什么"，对被动评估的变量可能关注不足。Hindsight recall 返回的是结构化、经过三网络分类（world/experience/observation）的记忆，且 observation 带证据溯源（proofCount / sourceFactIds）——作为**校准**来源更有据可查。

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
  │   → 回包不抢写：更新快照的 evidence 锚               │
  │   → piggyback 值为空/低质量时兜底写入                │
  │   → 标记 source: 'hindsight_recall'                 │
  │   → 作为长期记忆的校准锚点                           │
  └─────────────────────────────────────────────────────┘
```

**新鲜度层级**（合并策略的依据，任一时刻从新到旧）：

```
{{chat}} / messages 表（含最新用户输入）
  > piggyback 视野（当轮 LLM 调用看到 {{chat}}）
  > retain → Hindsight store（per-action 异步，滞后当前在途对话）
  > recall 读到内容（读上面的 store）
  > 上次会话结束时的快照
```

推论：**会话内 recall 永远不比 piggyback 更新鲜**——两者之间隔着未 retain 的在途对话。原合并策略中"recall 时效优于 piggyback 时覆盖"的分支不可达，删除。

**合并策略（按时机分工，证据强度用 ADR 005 客观信号，无数值 confidence）**：

```
会话内        piggyback 写入即生效（最鲜，无需仲裁）
异步 recall  回包只更新 evidence 锚（sourceFactIds / proofCount / refine 方向
              / mental model is_stale）；piggyback 值为空或低质量时兜底
会话结束      reconcile 对账：mental model / observation 基于新证据重写
              （非 is_stale）→ 更新快照 + 记证据锚，source = 'session_reconcile'
下次会话启动   快照是可重建缓存（权威在记忆）：getMentalModel（零 LLM 读）
              + 批量 recall 初值 → 覆盖旧快照
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
   → 决议：不为 ai_say 加 piggyback——ai_say 与前一 action 之间无用户输入，
     其 LLM 视野与前一 ai_ask 相同，评估证据零增量；链中插值消费经 §2.4
     收缩后不依赖标量；作者在意新鲜度时显式插入 ai_think（既定节点：
     内部推理 → 结论写入变量）

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
// 可信度由证据锚的客观信号表达；evidence 同时满足可互查原则 3
//（"从记忆派生的变量值能反向追溯到支撑它的原始记忆片段"）
interface VariableValue {
  value: unknown;
  type: VariableType;
  scope: VariableScope;
  source:
    | 'user_input' // ai_ask 从用户输入提取
    | 'llm_extraction' // ai_ask LLM 提取
    | 'llm_piggyback' // 消费前 look-ahead 蹭车刷新
    | 'hindsight_recall' // 异步 recall 兜底写入
    | 'mental_model' // 案例公式化：mental model 读取（零 LLM）
    | 'session_reconcile'; // 会话结束对账写回
  lastUpdated: string; // 客观时间戳（禁的是 LLM 自评分数，不禁时间戳）
  evidence?: {
    sourceFactIds?: string[]; // observation 溯源事实（可互查）
    proofCount?: number; // 证据条数
    mentalModelId?: string; // mental model 承载时
    isStale?: boolean; // mental model 过期信号
    refineDirection?: 'strengthened' | 'weakened'; // refine 历史方向
  };
  refreshQuery?: string;
}
```

**关键文件**：`packages/shared-types/src/domain/variable.ts`

#### Phase E: 消费方式静态校验

在 YAML 脚本加载时分析变量引用位置（§2.4）：

- 收集每个变量的全部引用点（prompt 插值 / condition / exit_decision / 队列调整）
- 可收缩类声明（仅插值引用）出现在条件位置 → 加载报错
- 校验结果写入脚本校验输出，供脚本编辑器展示

**关键文件**：脚本解析/校验处（core-engine script 解析模块，落点以实现为准）

#### Phase F: 会话结束 reconcile 对账

会话结束时，对语义标量变量做对账（§4.2 合并策略）：

- reflect / mental model 后台重写基于新证据（非 is_stale）→ 更新快照
- 记录 evidence 锚（sourceFactIds / proofCount / mentalModelId）
- 标记 source: 'session_reconcile'

**关键文件**：`packages/api-server/src/services/session-orchestrator.ts`

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
            # 异步 recall 回包更新 evidence 锚，不抢写（§4.2 合并策略）

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

| 能力                       | 状态        | 说明                                                          |
| -------------------------- | ----------- | ------------------------------------------------------------- |
| ai_ask 对话中提取变量      | ✅ Phase 0  | direct / pattern / llm 三种方法                               |
| ai_think 占位符填充        | ✅ Phase 0  | 仅硬编码占位符，不做真实推理                                  |
| Session 启动时 recall      | ✅ Phase 1  | 固定查询「用户核心问题、关键事件、治疗进展」                  |
| `{%memory_context%}` 注入  | ✅ Phase 1  | ai_ask / ai_say 模板中的记忆上下文占位符                      |
| per-Action retain          | ✅ Phase 2a | Action 完成时 retain 完整对话片段                             |
| Look-Ahead 变量解析器      | ❌ 待实现   | §4.5 Phase A: ScriptExecutor 中解析下一个 action 的变量引用   |
| AiAskAction Piggyback 刷新 | ❌ 待实现   | §4.5 Phase B: LLM 输出 schema 中追加 refresh 字段             |
| 异步 Hindsight Recall      | ❌ 待实现   | §4.5 Phase C: action 完成后异步 recall，择优覆盖              |
| VariableMetadata 扩展      | ❌ 待实现   | §4.5 Phase D: source 枚举扩展 + evidence 证据锚               |
| 消费方式静态校验           | ❌ 待实现   | §4.5 Phase E: YAML 加载时引用点分析，可收缩类误用条件位置报错 |
| 会话结束 reconcile 对账    | ❌ 待实现   | §4.5 Phase F: 会话结束基于新证据更新快照 + 证据锚             |
| 插值消费快通道 recall 注入 | ❌ 待实现   | §2.4: ai-ask-memory-recall 快通道推广到插值消费点（0 LLM）    |
| 全局变量收缩               | ❌ 持续     | 按 §6 消费方式二分审计现有脚本中的全局变量，逐步迁移          |

---

## 6. 迁移策略

### 6.1 识别需要迁移的变量

审计现有 YAML 脚本中的全局变量声明，标记每项的类别：

```
操作参数（保留在变量）:
  - 咨询师名、用户名、当前会谈次数、max_rounds

语义值（按消费方式二分，§2.4）:
  条件消费 → 保留标量（缓存模型）:
    - 情绪状态 → autoRefresh: true, refreshQuery: '用户当前的情绪状态和变化趋势'
  插值消费 → 收缩为 memory_query 声明（不存值）:
    - 核心信念 → memory_query: '用户的核心信念'
    - 主要压力源 → memory_query: '用户的主要压力来源'
    - 应对模式 → memory_query: '用户的应对模式'

全局事实（保留在变量，但来源标记为记忆）:
  - PHQ-9得分 → 量表提交时写入变量，同时 retain 到 Hindsight
```

### 6.2 渐进式迁移

1. 先在新的 YAML 脚本中为变量配置 `autoRefresh` + `refreshQuery` 属性；仅插值消费的语义变量直接声明为 memory_query（可收缩类），不再做变量声明
2. 旧的全局变量保持不变，不做破坏性变更（默认 `autoRefresh: true`，行为向后兼容）
3. 当 piggyback 或 Hindsight recall 更新了变量值时，记录 `source` 为 `llm_piggyback` 或 `hindsight_recall`
4. 逐步确认变量值从记忆获取的准确性后，对固定变量设置 `autoRefresh: false`，移除对应的全局变量声明

---

## 7. 设计决策记录

| 决策                      | 选择                                                                                   | 理由                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 变量收缩范围              | 仅设计文档，不立即实施                                                                 | 需要先审计现有脚本中的全局变量使用情况                                                                                                                            |
| 变量刷新策略              | Piggyback（蹭已有 LLM 调用）                                                           | 边际成本 ~0.1 倍 LLM 调用 vs 独立 ai_think 的 1 倍                                                                                                                |
| 刷新时机                  | Action N 执行时刷新 Action N+1 的变量                                                  | 确保变量在被使用前已更新；per-action retain 在秒级完成，时间窗口充裕                                                                                              |
| 双路径                    | 同步 LLM piggyback（会话内唯一刷新源）+ 异步 Hindsight recall（校准锚）                | piggyback 看得见 {{chat}} 最鲜；recall 结构化带证据但滞后于 retain——不赛跑新鲜度，回包只更新 evidence 锚 + 空值兜底                                               |
| Look-ahead 深度           | 仅看下一个 action                                                                      | 降低解析复杂度；多看几个 action 的收益递减                                                                                                                        |
| 分支处理                  | 收集所有分支的变量                                                                     | 变量数量少（1-5），全量收集不造成显著成本；避免路径预测错误                                                                                                       |
| Hindsight 本 session 使用 | 支持                                                                                   | Per-action retain 是异步快速的，不需要等跨 session                                                                                                                |
| autoRefresh 默认          | `true`                                                                                 | 大多数变量需要保持新鲜；固定信息（人口学、量表得分）显式关闭                                                                                                      |
| 合并策略                  | 按时机分工：会话内 piggyback 生效；recall 只校准；会话结束 reconcile；下次启动重建快照 | 新鲜度层级上 recall 严格滞后于 piggyback（per-action 异步 retain），"recall 更时效"分支不可达；证据强度用 proofCount / sourceFactIds / is_stale（ADR 005 决策 3） |
| 消费方式二分              | 条件消费 → 标量缓存；插值消费 → 收缩为 memory_query + 记忆上下文注入                   | 插值要的是"符合当前理解的表达"而非精确值；ADR 005 后 mental model 已在注入路径，标量副本是第三处存储；收缩后无值无过期，piggyback 集合缩小                        |
| ai_say 链刷新             | 不覆盖                                                                                 | ai_say 与前一 action 间无用户输入，piggyback 评估证据零增量；插值收缩后链中需求消失；作者在意时显式插入 ai_think                                                  |
| 快照字段                  | 证据锚（evidence: sourceFactIds/proofCount/mentalModelId/is_stale），无数值 confidence | 可互查原则 3（派生值回溯原始记忆片段）+ ADR 005 决策 3（LLM 自评分数无标定，用客观信号）                                                                          |
| 全局变量审计              | 后续 YAML 脚本层面做                                                                   | 不涉及代码改动，由咨询师在脚本工程中标记                                                                                                                          |

---

## 8. 案例验证

> 机制讨论的模拟对话案例（rhythm §8 案例验证要求：人确认合理性后作为验收处案例的单一出处）。

### 案例 A：条件消费标量 —— piggyback 刷新生命周期

```
会话 2 启动（核心信念已有 mental model 记录）:
  [启动] getMentalModel("核心信念公式化") → 快照 {核心信念} = "完美主义倾向（源于母亲高期望）"
         source: mental_model, evidence: { mentalModelId, isStale: false }
  ...
  Action k: ai_ask「最近工作压力大吗」
    用户: "上周述职被领导说了两句，我又觉得自己不够好了"
    → Action k 的 LLM 输出附带 look-ahead 刷新 {核心信念}（Action k+1 的 condition 引用）:
      值不变（新证据未推翻公式化），写入快照 source: llm_piggyback
    → 异步 recall 回包: 更新 evidence 锚（observation proofCount +1），不覆盖值
  Action k+1: condition "核心信念 == '我不够好'" → 读快照，确定、便宜
  [会话结束] reconcile: mental model 非 is_stale、无重写 → 快照保留 + evidence 锚落库
```

### 案例 B：插值消费收缩 —— memory_query + 记忆上下文注入

```
原脚本: 全局变量 主要压力源 + ai_say 模板 "让我们继续聊聊{{主要压力源}}..."
收缩后:
  ai_say config:
    memory_query: '用户的主要压力来源'
  → 执行时快通道 recall（≤200ms，无 LLM）注入该 action 的 {{memory_context}}
  → LLM 自然引用: "上次你提到主要压力来自和上级的关系，最近这方面有变化吗？"
  → 无标量、无过期、措辞随当前理解；"为什么这么说"可回溯 observation 的 sourceFactIds
```

### 案例 C：ai_say 链决议

```
连续 ai_say（心理教育段落）中模板引用 {核心信念}:
  → 经 §2.4 收缩为 memory_query 注入，无标量需求（决议不覆盖 ai_say 的代价被消掉）
若脚本作者需要跨轮一致的表述或条件分支:
  → 显式插入 ai_think（output_variables: [核心信念]），作为可控可调试的刷新点
```
