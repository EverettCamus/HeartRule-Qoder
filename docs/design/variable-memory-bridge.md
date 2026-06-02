# 变量-记忆桥接设计

> **定位**: 对 `memory-framework.md` §2.1（脚本变量）的补充设计文档，定义变量与 Hindsight 会谈记忆的职责边界和桥接机制。
> **版本**: v0.1.0
> **日期**: 2026-06-03

---

## 1. 问题

Phase 1 完成后，Hindsight 已经可以跨会话 retain/recall/reflect。但变量系统和记忆系统之间的职责边界尚未明确界定。当前存在以下问题：

1. **同一信息存两处**：用户在会谈中说「我从小就觉得永远不够好」→ Hindsight retain 记住了 → ai_think 又把它提取出来存进了全局变量 `核心信念`。下次会话，变量被读取——但如果 Hindsight 里的判断已经更新（reflect 调整了信心或结论），变量里的版本就是过期的。

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

| 不该存                     | 应交由              | 原因                                                       |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| 用户描述焦虑的完整叙事     | Hindsight recall()  | 变量只需知道"情绪问题是焦虑"，不需要记焦虑的具体表现       |
| 信念形成的童年经历详情     | Hindsight recall()  | 变量只需"核心信念 = 我不够好"，经历在记忆中，需要时 recall |
| PHQ-9 得分变化的趋势分析   | Hindsight reflect() | 变量只需最新得分，趋势是记忆系统的综合能力                 |
| 咨询师跨会话形成的临床判断 | Hindsight Opinion   | 判断是动态演化的，变量的值应该是调用时从记忆获取的最新版本 |

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

## 4. 变量刷新机制（未来设计）

### 4.1 思路

每次 Action 使用变量前，可选地从 Hindsight recall 刷新变量值。这确保变量始终反映最新的记忆状态。

### 4.2 触发时机

```
ai_ask 开始前:
  if config.variable_prefill:
    对每个输出变量:
      recall(变量名对应的查询) → 如果信心足够 → 预填变量值
      标记 source: 'memory'

ai_think 执行时:
  if config.use_memory:
    recall(config.memory_query) → 注入 LLM prompt
    LLM 综合 recall 结果 + 当前对话 → 输出变量值
```

### 4.3 YAML 配置草案

```yaml
# ai_ask 变量预填
- action_id: ask_belief
  action_type: ai_ask
  config:
    output:
      - varName: 核心信念
        method: llm
        variable_prefill: true # 先从记忆预填
        memory_query: '用户的核心信念和完美主义倾向'
        prefill_confidence_threshold: 0.6 # 信心低于此值时不预填，改问用户

# ai_think 记忆增强推理
- action_id: think_analysis
  action_type: ai_think
  config:
    think_goal: '综合分析用户核心信念的来源和当前影响'
    output_variables: [核心信念, 主要压力源, 应对模式]
    use_memory: true
    memory_query: '用户的核心信念、完美主义倾向、工作压力来源、童年经历'
```

### 4.4 预填变量标记

预填的变量需要标记来源，区分于用户输入和 LLM 提取：

```typescript
interface VariableMetadata {
  source: 'user_input' | 'llm_extraction' | 'memory_prefill';
  confidence?: number; // memory_prefill 时的 Hindsight 信心
  recalledAt?: string; // 预填时间
  memoryQuery?: string; // 使用的 recall 查询
}
```

---

## 5. 当前实现状态

| 能力                      | 状态        | 说明                                         |
| ------------------------- | ----------- | -------------------------------------------- |
| ai_ask 对话中提取变量     | ✅ Phase 0  | direct / pattern / llm 三种方法              |
| ai_think 占位符填充       | ✅ Phase 0  | 仅硬编码占位符，不做真实推理                 |
| Session 启动时 recall     | ✅ Phase 1  | 固定查询「用户核心问题、关键事件、治疗进展」 |
| `{%memory_context%}` 注入 | ✅ Phase 1  | ai_ask / ai_say 模板中的记忆上下文占位符     |
| per-Action retain         | ✅ Phase 2a | Action 完成时 retain 完整对话片段            |
| 变量从记忆预填            | ❌ Phase 2b | 需实现 ai_think 真实 LLM 推理 + recall       |
| 变量刷新机制              | ❌ Phase 2b | 需 AiAskAction 支持 variable_prefill         |
| 全局变量收缩              | ❌ 持续     | 需要审计现有脚本中的全局变量，逐步迁移       |

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

1. 先在新的 YAML 脚本中使用 `variable_prefill` + `use_memory` 配置
2. 旧的全局变量保持不变，不做破坏性变更
3. 当 `use_memory: true` 的 ai_think 覆盖了某个全局变量时，记录来源为 `memory`
4. 逐步确认变量值从记忆获取的准确性后，移除对应的全局变量声明

---

## 7. 设计决策记录

| 决策             | 选择                        | 理由                                                                |
| ---------------- | --------------------------- | ------------------------------------------------------------------- |
| 变量收缩范围     | 仅设计文档，不立即实施      | 需要先审计现有脚本中的全局变量使用情况                              |
| 变量刷新触发     | Action 开始前（可选配置）   | 每个 Action 开始前做 recall 可确保最新；可配置避免不必要的 LLM 调用 |
| 预填信心阈值     | 可配置（默认 0.6）          | 信心过低时宁愿问用户，避免错误预填                                  |
| VariableMetadata | 新增 source/confidence 字段 | 便于调试和追溯变量值的来源                                          |
| 全局变量审计     | 后续 YAML 脚本层面做        | 不涉及代码改动，由咨询师在脚本工程中标记                            |
