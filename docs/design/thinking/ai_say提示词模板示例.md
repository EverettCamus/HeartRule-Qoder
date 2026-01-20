# ai_say 功能设计规范与应用场景示例

**日期**: 2025-01-14
**版本**: 2.0
**目的**: 给出 ai_say 的最终设计规范、提示词模板和应用场景样板，供 CBT 工程师和开发人员直接使用。

---

## 📋 目录

1. [架构设计理念](#架构设计理念)
2. [提示词模板定义](#提示词模板定义)
   - 主线 A：执行层（业务逻辑 + 回复生成）
   - 支线 B：分析层（深度评估 + 策略规划）
   - 支线 C：监控层（风险监控 + 干预）
3. [ai_say 脚本字段设计说明（面向 CBT 工程师）](#ai_say-脚本字段设计说明面向-cbt-工程师)
4. [应用场景 1：介绍 ABC 模型](#应用场景-1介绍-abc-模型)
5. [应用场景 2：说服用户尝试思维记录](#应用场景-2说服用户尝试思维记录)

---

## 🏗️ 架构设计理念

### 三层架构：职责清晰分离

```
┌─────────────────────────────────────────────────────────┐
│  脚本层（Domain Layer）                                  │
│  - 定义业务逻辑（讲解主题、说服策略等）                  │
│  - 定义评估维度、退出条件与步骤调整规则                  │
│  - 定义用户画像（支线B使用）                             │
└─────────────────────────────────────────────────────────┘
           ↓ 配置
┌─────────────────────────────────────────────────────────┐
│  支线B（Analysis Layer - 分析层）                        │
│  - 深度分析对话历史                                      │
│  - 执行脚本定义的评估维度                                │
│  - 阶段0：在话题第1轮前生成 base_steps + strategy_steps   │
│          + strategy_prompt（步骤生成与策略初始化）        │
│  - 阶段1+：在后续轮次更新评估结果、progress_summary、     │
│            strategy_steps（含 planned_steps）和步骤调整   │
│            建议（step_adjustment_recommendation）        │
│  - 输出结构化评估结果和沟通策略（供主线A和规则引擎使用）│
│  执行频率：第1轮同步预处理，其后每2-3轮，5-10秒响应      │
└─────────────────────────────────────────────────────────┘
           ↓ 评估结果 + 策略 + 步骤
┌─────────────────────────────────────────────────────────┐
│  主线A（Execution Layer - 执行层）                       │
│  - 执行业务逻辑（讲解/说服等）                           │
│  - 应用沟通策略和步骤（来自支线B）                       │
│  - 生成回复                                              │
│  - 输出退出建议（exit + exit_reason），实际退出由规则引擎│
│    基于结构化评估结果与退出规则做最终决策               │
│  执行频率：每轮必执行，2-3秒响应                         │
└─────────────────────────────────────────────────────────┘
           ↓ 回复 + 退出决策
┌─────────────────────────────────────────────────────────┐
│  规则引擎（Framework Layer）                             │
│  - 读取脚本定义的退出规则与步骤调整规则                  │
│  - 基于支线B评估结果和主线A输出做确定性判断（毫秒级）    │
│  - 在规则无法覆盖的边缘场景下，可参考主线A的LLM退出判断  │
│    作为兜底信号                                          │
└─────────────────────────────────────────────────────────┘
```

### 核心设计原则

1. **单一职责原则（SRP）**：
   - 主线A：专注业务逻辑和回复生成，初级风险识别
   - 支线B：专注深度分析和策略规划，实现端到端策略生成
   - 支线C：专注安全审核与修订

2. **注意力聚焦（Attention Focus）**：
   - 主线A更专注于当前讲解/说服任务
   - 主线A不再承担深度分析（由支线B负责）
   - 用户画像、长期摘要等远程信息只在支线B使用

3. **确定性优先（Deterministic First）**：
   - 退出决策由规则引擎基于脚本 `exit_criteria` 与支线B结构化评估结果做出（确定、可审计）
   - 主线A的LLM退出判断仅作为兜底信号或一致性检查（灵活、补充）
   - 中止条件评估优先级高于退出条件判断，确保在紧急情况下能及时中止当前交互

4. **可观测性设计（Observability First）**：
   - 所有决策过程都应留下轨迹，包括策略生成、退出判断、风险评估等
   - 提供决策依据的可视化支持，便于调试和优化
   - 记录提示词版本和LLM性能指标，支持持续改进

---

## 📝 提示词模板定义

### 主线 A：执行层（业务逻辑 + 回复生成）

#### 设计理念

**职责边界（What）**：
- ✅ **执行业务逻辑并生成回复**：根据脚本定义的【讲解主题】和当前步骤状态，为用户生成本轮自然语言回复。
- ✅ **落实当前沟通策略与步骤计划**：基于支线 B 提供的 `strategy_prompt` 与 `strategy_steps`，在回复中贯彻当前步骤的目标与沟通重点。
- ✅ **给出本轮退出与风险筛查建议**：结合支线 B 的 `assessment_summary` 以及模板内联的退出条件，输出本轮的 `exit` / `exit_reason`，并对紧急风险做快速筛查，填充 `risk_screening` 字段。

**实现手段 / 输入方式（How）**：
- 使用同步 LLM 调用，在每一轮对话中执行主线 A 提示词模板。
- 主要输入包括：脚本层提供的 `{%topic_description%}`，支线 B 输出的 `{%progress_summary%}`、`{%strategy_steps%}`（步数与描述）、`{%strategy_prompt%}`，最近对话窗口 `{%chat_with_latest_message%}`，以及 `{%assessment_summary%}` 等。
- 提示词中通过"【你的任务】"明确要求模型依次完成：执行业务逻辑、判断是否退出、进行紧急风险快速筛查并返回结构化 JSON。

**架构约束 / 数据边界（Boundary）**：
- ❌ 不承担深度评估职责（理解度、情绪、抗拒等维度的量化评估由支线 B 完成）。
- ❌ 不直接访问用户画像与长期摘要，只通过支线 B 提供的 `strategy_prompt`、`progress_summary` 等间接使用用户画像信息。
- ✅ 与脚本层的边界：仅消费脚本定义的业务语义与退出规则（如 `topic_description`、`subtype`、`exit_criteria`），不修改脚本内容。
- ✅ 与支线 B 的边界：将支线 B 输出的评估摘要与策略作为输入信号使用，不反向写入 B 线状态。
- ✅ 与规则引擎的边界：规则引擎基于主线 A 的 `exit` / `exit_reason` 与支线 B 的结构化评估结果做最终退出决策。
- ✅ 与支线 C 的边界：通过 `risk_screening` 字段向支线 C 和规则引擎暴露本轮快速风险筛查结果，由后者决定是否启动更深入的安全评估与脚本切换。

**性能特点**：
- Prompt大小：约 300 tokens（紧凑、稳定）
- 通常 2-3 秒响应
- 任务数量：2 个（执行业务逻辑 + 判断是否退出）
- 上下文范围：仅使用近期对话窗口 + 当前步骤状态 + 策略提示（不读取完整历史）

---

**执行频率**: 同步，每轮必执行（2-3秒响应）

**模板文件**: `config/prompts/ai-say-mainline-a.prompt`

**模板内容**:

```
现时间 {%time%}，你是 {%who%}。请延续对话，生成给 {%user%} 的回应。

【讲解主题】
# 注意：这里可以包含复杂的业务逻辑，由CBT工程师编写
# 例如：详细的讲解步骤、说服策略、引导技巧等
# CBT 工程师还可以在此定义本话题的特定风险关注点（如：常见触发点、误解类型、容易激发的高危情绪）
# 这是主线A的核心关注点
{%topic_description%}

【当前讲解进度】
{%progress_summary%}
# ← 由支线 B 生成

【当前策略步骤】
你正在执行第 {%step_index%}/{%total_steps%} 步：{%step_description%}
下一步重点：{%next_step_focus%}
# ← 由支线 B 规划和动态调整

【沟通策略】
# 注意：此策略由支线B基于用户画像生成，已包含用户特征的精华
{%strategy_prompt%}

【近期对话窗口】
# 只包含最近若干轮，对最后一条用户消息直接回应
{%chat_with_latest_message%}
# 注意：这是本次会谈最近的对话片段，最新消息已合并在末尾
# 使用短窗口可以减少干扰和成本，同时保留当前语境

【你的任务】

1. **执行业务逻辑**：
   - 根据【讲解主题】的要求，生成你的回复
   - 应用【沟通策略】中的指导
   - 确保回复符合当前策略步骤的重点

2. **判断是否退出**：
   - 来访者反应评估：
     {%assessment_summary%}
     # 例如：
     # - 理解度：85分
     # - 有疑问：否
     # - 表达理解：是
     # - 情绪状态：积极
     # - 抗拒程度：0分

   - 退出条件：
     # 围绕理解度/疑问/表达理解等，本模板直接约定
     理解度>=80 且无疑问，或 理解度>=70 且表达理解

   - 请判断是否应该退出当前话题

   > **协作流程说明**：当支线B评估建议准备退出时（`should_exit=true`），规则层会向主线A添加退出提示词，使对话逐步进入收尾阶段。只有当主线A实际标记`exit=true`时，规则层才会做出最终退出决策。

3. **风险快速筛查**：
  # 目的：快速识别需要立即关注的紧急风险，用于决定是否同步启动支线 C
  - 请基于最近一轮用户回复和对话历史，判断是否存在以下风险：
    - 自杀/自伤风险
    - 危机情绪（情绪强度极高，接近失控）
    - 严重认知扭曲（灾难化、绝对化且影响很大）
    - 治疗关系破裂风险（强烈指责、明显不信任）
  - 请在输出的 risk_screening 字段中如实填写筛查结果（urgent_risk_detected 和 risk_type）

【输出格式】
严格按照以下 JSON 格式输出：
{
  "response": {
    "咨询师": "你的回复内容..."
  },
  "exit": true|false,
  "exit_reason": "退出原因或继续原因...",
  "risk_screening": {
    "urgent_risk_detected": true|false,
    "risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
  }
}
```

**变量说明**:
- `{%time%}` - 当前时间
- `{%who%}` - AI 角色名称（例如："李医生"）
- `{%user%}` - 用户名称（例如："小明"）
- `{%topic_description%}` - 讲解主题的详细描述（脚本定义，可包含复杂业务逻辑）
- `{%progress_summary%}` - 讲解进度总结（由支线B生成：第1轮来自阶段0，其后轮次来自阶段1+的最新输出）
- `{%step_index%}`, `{%total_steps%}`, `{%step_description%}`, `{%next_step_focus%}` - 策略步骤游标（由支线B生成：第1轮来自阶段0的 `strategy_steps`，第2+轮来自阶段1+更新后的 `strategy_steps`）
- `{%strategy_prompt%}` - 沟通策略提示（由支线B生成：第1轮来自阶段0，第2+轮来自阶段1+的最新输出）
- `{%chat_with_latest_message%}` - 本次会谈最近若干轮对话（最后一条是用户最新消息）
- `{%assessment_summary%}` - 支线B输出中的 `assessment_summary` 字段（为主线 A 使用的评估结果摘要，用于退出判断）

---

### 自然过渡：基于 phase/topic/action 的自动分级

> ⚠️ 这一节只解释 **主线 A 退出后，引擎如何自动决定过渡“有多正式”**，CBT 工程师在脚本里**不需要**配置任何 `transition_mode` 字段，只需要维护好会谈结构（phase → topic → action）。

#### 设计思路（谁来决定过渡形式？）

- **脚本层**：只定义会谈结构和内容：
  - phase：大阶段（例如“建立同盟”“介绍 ABC 模型”“安排作业”）
  - topic：某个 phase 里的具体小话题
  - action：在某个 topic 下的 `ai_say` / `ai_ask` / `ai_think`
- **引擎层**：在 `ai_say` 话题退出（EV-064.shouldExit === true）后，根据
  当前节点 → 下一个节点的结构关系，自动推导 **transitionLevel**：
  - `phase`：跨 phase → 使用“**显性过渡**”模板
  - `topic`：同一 phase 内换 topic → 使用“**轻量过渡**”模板
  - `action`：同一 topic 内的 action 切换 → **不额外生成过渡语句**

#### 三种过渡级别的效果示例

1. **Phase 级（显性过渡）**  
   - 典型场景：
     - 从「介绍 ABC 模型」的最后一个 `ai_say` 退出，进入新 phase「安排思维记录作业」。
   - 效果示例：
   
   ```
   这部分我们主要一起看了 ABC 模型：事情本身、你的想法，还有随之来的情绪之间是怎么互相影响的。
   接下来，我想和你一起做一件很具体的事——试着用一个小练习，把 ABC 模型用在你最近的一件烦心事上，
   这样你可以更直观地看到：“原来我一念之差，会这么影响自己的感受”。
   ```
   - 特点：
     - 2–3 句，清楚标出“上一大段讲完了、要进入新阶段”；
     - 模板：**PhaseTransitionTemplate**（在细节文档中定义）。

2. **Topic 级（轻量过渡）**  
   - 典型场景：
     - 在同一个 phase 内，从「用图像解释 ABC」切到「举一个生活化例子」。
   - 效果示例：
   
   ```
   说到这儿，我们不妨用一个更生活化的例子来试试看。
   比如，想象一下你最近一次特别紧张的时刻，我们可以用刚才讲的 ABC 模型，套在那件事上看看。
   ```
   - 特点：
     - 0–2 句，非常短的“顺嘴一提式”过渡；
     - 如果近期对话已经自然铺垫好，也可以几乎不出现明显的“我们换个话题”句式；
     - 模板：**TopicTransitionTemplate**（在细节文档中定义）。

3. **Action 级（无显式过渡）**  
   - 典型场景：
     - 同一 topic 内连续两个 `ai_say`；
     - 或 `ai_say` 退出后马上进入同一 topic 内的 `ai_ask` 提问。
   - 效果策略：
     - 引擎不会额外插入一段“过渡话术”，直接进入下一个 action；
     - 连贯性由：
       - 主线 A 模板的 `recent_chat_window` / `chat_with_latest_message`，
       - 支线 B 的 `strategy_prompt` 和 `progress_summary` 来保证。

#### 对 CBT 工程师的影响

- 你**不用**记任何 `transition_mode` 枚举，也**不用**在 YAML 里手写“过渡句”；
- 你要做的是：
  - 把会谈脚本拆成合理的 phase / topic / action 结构；
  - 给每个 action（尤其是 topic 起始 action）写好 `topic` / `topic_summary` / `benefit`；
- 剩下的：
  - **“何时退出当前话题”** → 由 `exit_criteria` + 支线 B 评估 + 规则引擎决定；
  - **“退出后过渡有多正式”** → 由引擎根据 phase/topic/action 层级自动判定；
  - **“具体过渡话术怎么说”** → 由 Phase/Topic 级过渡模板 + LLM 自然生成。

### 支线 B：分析层（深度评估 + 策略规划）

#### 设计理念

**职责边界（What）**：
1. **对会谈状态进行量化评估并输出结构化结果**
   - 根据脚本和模板约定的评估维度（如理解度、情绪状态、抗拒程度等），对当前会谈状态进行量化评估；
   - 以结构化数据形式输出评估结果（如 `assessment`、`assessment_summary`），供规则引擎、主线 A 等组件使用。

2. **规划并维护当前话题的步骤计划**
   - 在话题开始时，为当前 `ai_say` 话题生成基线步骤计划（`base_steps`）；
   - 在后续轮次中，根据最新评估结果更新步骤执行状态（`strategy_steps`），并输出步骤调整建议（`step_adjustment_recommendation`），由规则引擎结合脚本中的 `step_adjustment_rules` 做确定性应用。

3. **基于评估结果和用户画像生成沟通策略**
   - 综合当前结构化评估结果与用户画像信息，生成或更新面向主线 A 的沟通策略提示（如 `strategy_prompt`、`progress_summary`）；
   - 策略中已内嵌画像关键信息，主线 A 只需使用策略和步骤变量，无需直接访问用户画像。

**实现手段 / 输入方式（How）**：
- 使用分层对话上下文（近期对话窗口 `recent_chat_window` + 本次会谈小结 `current_session_summary` + 跨会谈长期摘要 `long_term_summary`）作为输入，对会谈过程进行深度语义分析，为评估和策略提供上下文支撑。
- 在**两阶段执行机制**下工作：
  - 阶段 0：在话题第一次开始前，同步生成 `base_steps`、初始 `strategy_steps` 和初始 `strategy_prompt`，主线 A 第 1 轮必须等待该阶段完成；
  - 阶段 1+：在后续轮次中，异步更新评估结果、进度总结、步骤状态与沟通策略，主线 A 使用最近一次可用的输出。

**架构约束 / 数据边界（Boundary）**：
- 用户画像（教育背景、学习风格、认知特点、情感特点、语言偏好等）及长程会谈摘要只在支线 B 中直接访问和处理；其他组件仅通过支线 B 输出的 `strategy_prompt`、`progress_summary` 等摘要与策略间接使用这些信息。
- 不直接参与退出决策的确定性计算，而是通过输出结构化评估结果和步骤调整建议，由规则引擎依据脚本定义的 `exit_criteria` 与 `step_adjustment_rules` 做最终决策。
- 与主线 A 的边界：主线 A 只读取支线 B 的输出（评估摘要、策略、步骤状态），不回写或修改支线 B 的内部状态。
- 与脚本层的边界：支线 B 读取脚本定义的评估维度和与退出相关的字段解释，但不修改脚本内容或规则本身。

**性能特点**：
- 可以慢（5-10秒响应），以换取更高质量的评估与策略；
- 每 2–3 轮执行一次（第 1 轮为同步预处理，后续轮次通常异步），不阻塞主线 A 的逐轮回复。

#### 两阶段执行机制

- **阶段 0（第 1 轮同步预处理：步骤生成与策略初始化）**
  - 触发时机：某个 ai_say 话题第一次开始执行，且需要支线 B 支持。
  - 输入：
    - 已完成脚本变量替换的 `{%topic_description%}`（含【讲解要点】/【说服要点】等）
    - `ai_say_subtype` / `ai_say_subtype_hint`
    - 用户画像（教育背景、学习风格、认知特点、情感特点、语言偏好等）
    - 当前对话上下文（首轮通常只有用户最新消息）
  - 输出：
    - `base_steps`: 该话题的**基线步骤计划**（字符串数组，不可变）
    - `strategy_steps`: 初始化的步骤执行状态（含 `planned_steps`、`current_step_index`、`step_description`、`next_step_focus`）
    - `strategy_prompt`: 面向主线 A 的初始沟通策略
    - `initialization_reasoning`: 对步骤拆解与策略选择的简要说明
  - 执行顺序：主线 A 第 1 轮**必须等待**阶段 0 完成，然后使用其中的步骤与策略变量生成本轮回复。

- **阶段 1+（第 2 轮及以后：异步监控与调整）**
  - 触发时机：同一 ai_say 话题的第 2 轮及以后。
  - 输入：
    - `base_steps`（阶段 0 生成的基线步骤，仅供参考，不可修改）
    - 上一轮的 `strategy_steps`（作为 `last_strategy_steps` 注入提示词）
    - 分层对话上下文、用户画像、上一轮主线 A 输出等
  - 输出：
    - `assessment` / `assessment_summary`：最新一轮的评估结果
    - `progress_summary`：当前进度总结
    - `strategy_steps`: 更新后的步骤执行状态（含 `planned_steps`）
    - `current_step_completion`: 当前步骤完成度
    - `step_adjustment_recommendation`: 是否需要调整步骤计划以及如何调整
    - `strategy_prompt`: 面向主线 A 的更新后沟通策略
  - 执行方式：通常作为**异步任务**运行，主线 A 从第 2 轮开始不再等待支线 B，同步使用“最近一次可用”的支线 B 输出结果。

**分层记忆设计（生成与管理）**：
- `recent_chat_window`：每次调用前，由系统从当前会谈记录中裁剪最近 N 轮对话（或最多 M 个 tokens），主要用于保持语言与语境连贯。
- `current_session_summary`：在本次会谈结束（或每个 topic 结束）时，由专门的总结模型基于本次会谈的对话与 topic 信息生成，会谈级小结，存入会谈记录。
- `long_term_summary`：每次会谈结束后，用旧的 `long_term_summary` + 新的 `current_session_summary` 调用总结模型滚动更新，形成跨会谈的长期摘要，存入用户长期档案。
- 使用原则：语言连贯优先看 `recent_chat_window`，理解本次会谈进展看 `current_session_summary`，理解长期模式与风险趋势看 `long_term_summary`。

---

**模板内容（阶段 0：步骤生成与策略初始化，通用）**：

- **调用时机**：某个 ai_say 话题第一次开始执行，且需要支线 B 支持时，由 orchestrator 在调用主线 A 之前先调用本模板。
- **执行目标**：
  - 从 `{%topic_description%}` 抽取/归纳出一组结构化的基线步骤 `base_steps[]`；
  - 初始化可执行的 `strategy_steps`（含 `planned_steps` 和当前步骤光标）；
  - 生成面向主线 A 的初始 `strategy_prompt`，结合用户画像做个性化语言风格与策略。

**提示词模板**：

```markdown
【支线 B 阶段 0：步骤生成与策略初始化（通用）】

你是资深 CBT 教学设计与会谈策略专家，负责在某个 ai_say 话题开始之前，
根据脚本提供的讲解/说服内容和用户画像，生成一套清晰可执行的步骤计划和沟通策略。

【脚本提供的讲解/说服内容（已完成变量替换）】
{%topic_description%}

【当前 ai_say 场景类型】
# 本模板适用于所有 subtype，会根据 subtype 提示做轻度适配
- subtype: {%ai_say_subtype%}
- subtype_hint: {%ai_say_subtype_hint%}

【用户画像】
- 教育背景：{%教育背景%}
- 心理学知识：{%心理学知识%}
- 学习风格：{%学习风格%}
- 认知特点：{%认知特点%}
- 情感特点：{%情感特点%}
- 词汇水平：{%词汇水平%}
- 语言风格：{%语言风格%}
- 常用表达：{%用户常用表达%}

【当前对话上下文】
# 首轮通常只有用户的最新一条消息，用于判断进入话题时的状态
{%recent_chat_window%}

【你的任务】

**任务 1：提炼话题目标与核心路径**
1. 从【脚本提供的讲解/说服内容】中提炼本 ai_say 话题的核心目标（1-2 句话）。
2. 根据 subtype_hint 判断是偏“讲解”（introduce_concept）还是偏“说服/邀请尝试”（persuade）等。

**任务 2：拆解为基线步骤 base_steps**
3. 将整个话题拆解为 3-7 个有清晰顺序的步骤（字符串数组），输出为 base_steps：
   - 每一步尽量简洁、可操作；
   - 步骤之间保持逻辑递进关系；
   - 对于 introduce_concept，通常包括：整体介绍 → 举例说明 → 引导应用；
   - 对于 persuade，通常包括：降低阻抗 → 展示价值 → 邀请尝试 → 安排第一步行动。

**任务 3：初始化策略步骤 strategy_steps**
4. 在 base_steps 的基础上，初始化可执行的 strategy_steps：
   - planned_steps: 使用 base_steps，必要时可做轻微拆分或合并；
   - current_step_index: 1（从第 1 步开始）；
   - total_steps: planned_steps 的长度；
   - step_description: 第 1 步的简要描述；
   - next_step_focus: 第 2 步的关注重点（如存在）。

**任务 4：生成初始沟通策略 strategy_prompt**
5. 结合用户画像与 subtype_hint，生成一段给主线 A 使用的沟通策略提示（strategy_prompt）：
   - 包含语言风格建议（正式/口语、节奏、用词难度等）；
   - 例子选择策略（是否使用生活化例子、与用户经验相关的情境等）；
   - 共鸣建立方式（如何认可用户、如何降低防御等）；
   - 引导与收尾策略（如何邀请提问、如何确认理解/接受度等）。

**任务 5：给出初始化理由（initialization_reasoning）**
6. 用 2-4 句自然语言解释你为什么这样拆解步骤、为什么这样设置初始策略。

【输出格式】

严格按照以下 JSON 格式输出（字段顺序可调整，但必须全部包含）：

{
  "base_steps": [
    "步骤1：...",
    "步骤2：...",
    "步骤3：..."
  ],
  "strategy_steps": {
    "planned_steps": [
      "步骤1：...",
      "步骤2：...",
      "步骤3：..."
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "当前步骤描述（通常为第1步）",
    "next_step_focus": "下一步重点（通常为第2步）"
  },
  "strategy_prompt": "【沟通策略】... 面向主线A的初始策略建议 ...",
  "initialization_reasoning": "为什么这样拆解步骤和设置策略的简要说明"
}
```

> 实际实现中，可以在此基础上增加 `assessment` / `assessment_summary` / `progress_summary` / `current_step_completion` 等字段，以便第 1 轮就获得初始评估结果；本文后续示例中的“支线B输出（初始化）”采用了这一扩展形态。

### 不同 subtype 的三份提示词模板示例

在 CBT 领域内，ai_say 的 `subtype` 集合是相对有限的一组（如 `introduce_concept` / `persuade` / `train_intro` 等）。当前阶段，本设计采用一个简单而直接的实现约定：

- 每一个 subtype 都对应一组 **三份提示词模板**：
  - 主线 A：执行层模板（负责本轮回复 + 退出判断）；
  - 支线 B：分析层模板（负责深度评估 + 策略规划）；
  - 支线 C：监控层模板（负责风险监控 + 干预建议）。
- 不同 subtype 的三份模板在结构上可以不同：任务拆分、评估维度、输出 JSON 字段都可以按需要调整。

#### 示例 1：subtype = `introduce_concept`（知识讲解）

- **主线 A 模板**：即前文《主线 A：执行层（业务逻辑 + 回复生成）》中的模板，退出判断依赖：
  - 支线 B 输出的 `understanding_level` / `has_questions` / `expressed_understanding` 等字段；
  - 模板内联约定的退出条件（例如：理解度>=80且无疑问，或理解度>=70且表达理解）。
- **支线 B 模板（阶段 0 + 阶段 1+）**：即前文《支线 B：分析层（深度评估 + 策略规划）》中的通用模板，
  - **阶段 0（第 1 轮同步预处理）**：
    - 输入：已完成变量替换的 `{%topic_description%}`、`ai_say_subtype` / `ai_say_subtype_hint`、用户画像、当前对话上下文；
    - 输出：`base_steps`（基线步骤）、`strategy_steps`（含 `planned_steps`、`current_step_index`、`total_steps`、`step_description`、`next_step_focus`）、`strategy_prompt`、`initialization_reasoning`；
    - 主线 A 第 1 轮在调用前**必须等待**该阶段完成，并使用其中的步骤与策略变量生成第 1 轮回复。
  - **阶段 1+（第 2 轮及以后异步监控与调整）**：
    - 输入：`base_steps`、上一轮 `strategy_steps`（作为 `{%last_strategy_steps%}` 注入）、分层对话上下文、用户画像、上一轮主线 A 输出；
    - 输出：更新后的 `assessment` / `assessment_summary`、`progress_summary`、`strategy_steps`（含 `planned_steps`）、`current_step_completion`、`step_adjustment_recommendation`、`strategy_prompt`；
    - 通常以异步方式运行，主线 A 从第 2 轮开始使用“最近一次可用”的支线 B 输出结果。
- **支线 C 模板**：即前文《支线 C：监控层（风险监控 + 干预）》中的模板，作为所有 subtype 共享的基础风险监控模板之一。

#### 示例 2：subtype = `persuade`（说服 / 邀请尝试）

本场景目标：在保证安全和尊重自主性的前提下，**邀请用户尝试某个技术/作业或接受某个安排**，并根据用户的接受度、阻抗程度和尝试意愿来判断是否结束当前说服阶段。

##### 主线 A 提示词模板（persuade）

```markdown
现时间 {%time%}，你是 {%who%}。当前你正在围绕某个邀请/说服任务与 {%user%} 对话，请延续对话，生成本轮回应。

【讲解/说服主题】
# 注意：这里可以包含具体的说服目标和关键论点，由 CBT 工程师在脚本中编写
# 例如：为什么要尝试某个思维记录、练习、暴露作业等
# 以及适合该用户的说服策略要点（可以引用支线 B 的策略）
{%topic_description%}

【当前说服进度】
{%progress_summary%}
# ← 由支线 B 生成，对当前说服阶段的进度总结

【当前策略步骤】
你正在执行第 {%step_index%}/{%total_steps%} 步：{%step_description%}
下一步重点：{%next_step_focus%}
# ← 由支线 B 规划和动态调整

【沟通策略】
# 注意：此策略由支线B基于用户画像生成，已包含用户特征的精华
# 主线A不需要再看原始用户画像，直接应用此策略即可
{%strategy_prompt%}

【近期对话窗口】（只包含最近若干轮，对最后一条用户消息直接回应）
{%chat_with_latest_message%}
# 注意：这是本次会谈最近的对话片段，最新消息已合并在末尾
# 使用短窗口可以减少干扰和成本，同时保留当前语境

【你的任务】

1. **执行说服/邀请任务**：
   - 根据【讲解/说服主题】中的说服目标和要点，生成你的回复
   - 应用【沟通策略】中的指导，注意语气、共情和节奏
   - 确保回复聚焦于当前策略步骤的目标

2. **判断是否退出当前说服阶段**：
   - 来访者反应评估：
     {%assessment_summary%}
     # 例如：
     # - 接受度：78分
     # - 阻抗程度：2分
     # - 是否表达愿意尝试：是
     # - 是否仍有重要顾虑：否

   - 退出条件（围绕接受度/阻抗/尝试意愿/重要顾虑等）：
     接受度>=70 且 expressed_willingness=true 且 has_major_concerns=false

   - 请判断是否应该结束当前说服/邀请尝试阶段，并在 JSON 中填入 exit 与 exit_reason。

3. **风险快速筛查**：
  # 目的：快速识别需要立即关注的紧急风险，用于决定是否同步启动支线 C
  - 请基于最近一轮用户回复和对话历史，判断是否存在以下风险：
    - 自杀/自伤风险
    - 危机情绪（情绪强度极高，接近失控）
    - 严重认知扭曲（灾难化、绝对化且影响很大）
    - 治疗关系破裂风险（强烈指责、明显不信任）
  - 请在输出的 risk_screening 字段中如实填写筛查结果（urgent_risk_detected 和 risk_type）

【输出格式】
严格按照以下 JSON 格式输出：
{
  "response": {
    "咨询师": "你的回复内容..."
  },
  "exit": true|false,
  "exit_reason": "退出原因或继续原因...",
  "risk_screening": {
    "urgent_risk_detected": true|false,
    "risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
  }
}
```

##### 支线 B 提示词模板（persuade）

```markdown
【支线 B：深度分析与策略规划（persuade 场景）】

你是资深 CBT 咨询督导，负责在“说服/邀请尝试”场景下深度分析对话过程，为下一轮对话提供优化策略，并评估说服阶段的进展。

【对话上下文（分层记忆）】
- 最近 N 轮对话:
@@@
{%recent_chat_window%}
@@@
- 本次会谈各话题小结:
@@@
{%current_session_summary%}
@@@
- 跨会谈长期摘要:
@@@
{%long_term_summary%}
@@@
# 只提供：本次会谈最近若干轮 + 本次会谈小结 + 跨会谈长期摘要，而不是完整原文历史

【当前说服主题】
{%topic%}

【主题提示词】
{%topic_prompt%}

【当前 ai_say 场景类型】
# 本模板仅在 subtype=persuade 时使用
{%ai_say_subtype%}

【场景说明（给本支线使用）】
# 由 subtype 映射成的自然语言说明，帮助你知道当前轮主要任务侧重：
# - persuade：侧重说服/邀请尝试，评估接受度、抗拒、尝试意愿等
{%ai_say_subtype_hint%}

【上一轮主线 A 输出】
{%last_mainline_output%}

【用户画像】
# 用户画像只在支线B中使用，主线A通过策略间接使用

**基础信息**：
- 教育背景：{%教育背景%}
- 心理学知识：{%心理学知识%}
- 学习风格：{%学习风格%}
- 认知特点：{%认知特点%}
- 情感特点：{%情感特点%}

**语言偏好**：
- 词汇水平：{%词汇水平%}
- 语言风格：{%语言风格%}
- 常用表达：{%用户常用表达%}

【当前步骤计划（来自阶段0与上一轮）】
- 基线步骤（base_steps）：
@@@
{%base_steps%}
@@@
- 上一轮策略步骤（last_strategy_steps）：
@@@
{%last_strategy_steps%}
@@@



【你的任务】

**任务 1：评估接受度与阻抗程度**
1. 评估用户对当前建议/作业的总体接受度（0-100），输出：acceptance_level
2. 评估用户的阻抗程度（0-10），输出：resistance_score

**任务 2：评估尝试意愿与重要顾虑**
3. 判断用户是否明确表达“愿意尝试”或等价表述，输出：expressed_willingness (true|false)
4. 判断是否仍有尚未回应的重要顾虑（例如安全担心、时间精力、价值冲突等），输出：has_major_concerns (true|false)
5. 如有，归纳 1-3 条最关键的顾虑，输出：major_concerns (数组，元素为自然语言短句)

**任务 3：说服进度总结与步骤调整判断（阶段 1+）**
6. 总结当前说服阶段的进度（用户目前接受到哪一步、还有哪些关键点未覆盖），输出：progress_summary
7. 结合 `base_steps` 与 `{%last_strategy_steps%}`，判断是否需要调整当前执行计划（例如：简化步骤、增加铺垫、重新排序），输出：step_adjustment_recommendation：
   - should_adjust: true|false
   - adjustment_type: "simplify" | "elaborate" | "reorder" | "skip" | "insert" | "none"
   - reasoning: 自然语言解释
8. 在上述判断基础上，输出更新后的 strategy_steps：
   - planned_steps: 完整的步骤列表（如有调整，反映调整后的顺序与内容）
   - current_step_index: 当前应执行的步骤序号
   - total_steps: 计划总步骤数（planned_steps 的长度）
   - step_description: 当前步骤描述
   - next_step_focus: 下一步重点

**任务 4：沟通策略生成**
9. 基于用户画像、上述评估结果与更新后的 strategy_steps，生成下一轮说服/邀请对话的沟通策略，输出：strategy_prompt
   - 包含：
     - 语言风格建议
     - 例子选择策略
     - 共鸣建立方式
     - 引导/收尾策略

【输出格式】
严格按照以下 JSON 格式输出：
{
  "assessment": {
    "acceptance_level": 0-100,
    "resistance_score": 0-10,
    "expressed_willingness": true|false,
    "has_major_concerns": true|false,
    "major_concerns": ["顾虑1", "顾虑2"],
    "reasoning": "综合评估理由..."
  },
  "assessment_summary": [
    "接受度：78分",
    "阻抗程度：2分",
    "是否表达愿意尝试：是",
    "是否仍有重要顾虑：否"
  ],
  "progress_summary": "当前说服阶段进度总结...",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：...",
      "步骤2：...",
      "步骤3：..."
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "当前步骤描述",
    "next_step_focus": "下一步重点"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "当前步骤计划合理，可按原计划推进"
  },
  "strategy_prompt": "【沟通策略】... 针对说服/邀请场景的具体建议 ..."
}
```

##### 支线 C 提示词模板（persuade）

- 在 `persuade` 场景下，支线 C 使用前文《支线 C：监控层（风险监控 + 干预）》中的完整模板；
- 该模板输出的 `risk_signals` / `risk_level` / `risk_assessment` / `intervention_recommendation` 会被规则引擎和主线 A 的风险筛查逻辑综合使用：
  - 当 `risk_level` 为 medium/high 时，规则引擎可以要求主线 A 在回复中优先处理安全和稳定；
  - 主线 A 在本轮的 `risk_screening` 字段中反映“是否需要立即触发支线 C 建议的干预动作”。


#### subtype 自动补齐机制（脚本验证阶段）

在脚本作者视角：

- `subtype` 是可选字段；
- 如果写了，代表脚本作者**明确指定特殊场景**（可用于调试或特定需求），系统按显式值执行；
- 如果没写，系统会在 `CounselingScript` 聚合根验证前，通过一次 LLM 预处理，为每个 `ai_say` 自动补齐合适的 subtype。

推荐流程（简化版）：

1. 脚本加载后，应用层调用一个 LLM 支持的"脚本语义分析服务"，把每个 `ai_say` 的 `topic` / `concept` / `description` 传给模型。
2. LLM 返回：
   - 推荐的 `subtype`（如 introduce_concept / persuade / train_intro / ...）
   - 简短理由（为什么这么判断）
   - 置信度（0-1）
3. 当且仅当：
   - 该 `ai_say` **没有**显式 subtype；
   - 且置信度 ≥ 预设阈值（例如 0.7），
   才使用 LLM 推荐值填充 subtype；否则保持为空，按默认/保守策略处理。
4. `CounselingScript` 聚合根在验证时，要求每个需要支线 B 支持的 `ai_say` 最终都有一个 subtype（显式或自动补齐）。

设计原则：

- 显式 subtype 总是优先于自动推断（脚本作者意图优先）。
- 自动补齐发生在脚本加载/验证阶段，不在每轮对话时重复调用，控制延迟与成本。
- 推断结果和理由可以记录下来，方便 CBT 工程师在工具界面中检查与调整。
- 通过端到端策略生成机制，确保自动推断的 subtype 能够与后续的策略规划和执行保持一致。

#### 脚本语义分析服务的 LLM 提示词示例

> 该服务在脚本加载 / 验证阶段被调用，用于**自动推断每个 ai_say 的 subtype**。
> 下面是一个可以直接将 `{topic_description}` 代入，并输出可 JSON 解析结果的提示词示例。

- **调用时机**：应用层在加载 `CounselingScript` 后，对每个 `ai_say` 调用一次
- **输入内容**：
  - `topic`：话题标题（简短）
  - `concept`：可选，核心概念标签
  - `description`：详细的 `topic_description`（脚本作者写的业务语义）
- **输出要求**：必须是**单个 JSON 对象**，便于程序解析

**提示词模板示例**（伪代码）：

```
### 支线 C：安全审核与修订引擎（条件触发，在主线 A 检测到高风险时启动）

#### 设计理念

**职责边界（What）**：
1. **审核并修订主线 A 生成的回复内容**
   - 仅在主线 A 检测到高风险信号时启动
   - 对即将发送给用户的回复内容进行审核，必要时进行修订以确保安全性
   - 输出审核结果和修订后的回复内容

2. **为规则引擎和安全脚本路由提供结构化决策信号**
   - 输出可被规则引擎直接消费的决策信号（如 `should_interrupt`、`should_route_to_safety_script`、`recommended_route` 等），
     用于触发后续的安全流程（包括话题切换、转介或其他预定义干预机制）。

**实现手段 / 输入方式（How）**：
- 通过同步 LLM 调用执行支线 C 提示词模板，仅在主线 A `risk_screening` 检测到高风险时触发；
- 主要输入包括：主线 A 生成的回复内容、裁剪后的会谈对话历史、用户基础信息等；
- 模板内引导模型审核回复内容的安全性，并在必要时提供修订版本。

**架构约束 / 数据边界（Boundary）**：
- 与主线 A：支线 C 基于主线 A 的风险筛查结果工作，对主线 A 生成的回复内容进行审核和必要的修订；
- 与规则引擎：规则引擎基于支线 C 输出的 `risk_level`、`risk_type` 和决策信号，结合全局安全策略与脚本配置，决定是否中断当前话题、切换到安全话题脚本或触发外部安全流程。
- 与脚本层及安全话题脚本：支线 C 只产生"路由到哪类安全脚本"的建议（即安全话题脚本标识或类别），安全处置细节在独立的安全话题脚本中实现，遵循与普通话题相同的 spec-workflow 规范。
- 性能与调用方式：支线 C 仅在检测到高风险信号时执行（约 5-10% 的对话），响应时间 2-3 秒，不影响主线 A 的常规响应路径。

---

**执行频率**: 条件触发，仅在主线 A 检测到高风险时执行（约 5-10% 的对话）

**模板文件**: `config/prompts/ai-say-branch-c.prompt`

**模板内容**:

```
【支线 C：安全审核与修订引擎】

你是心理危机干预专家，负责审核并修订可能存在风险的回复内容。

【主线 A 生成的回复内容】
{%mainline_response%}

【完整对话历史】
{%full_chat_history%}

【用户基础信息】
- 教育背景：{%education_background%}
- 心理学知识：{%psychology_knowledge%}
- 情感特点：{%emotional_traits%}

【历史风险记录】
{%risk_history%}
# 之前识别的风险信号

【你的任务】

**任务 1：审核回复内容的安全性**
- 检查回复内容是否存在以下风险：
  - 可能激发用户自杀或自伤行为
  - 可能加剧用户情绪危机
  - 可能忽视用户的紧急求助信号
  - 可能提供不恰当的建议
- 输出：needs_correction (布尔值)

**任务 2：修订回复内容（如需要）**
- 如果需要修正，提供修订后的回复内容：
  - 确保内容安全且富有同理心
  - 避免激发负面情绪
  - 必要时提供寻求专业帮助的建议
- 输出：corrected_response (字符串)

**任务 3：风险等级评估**
- 评估风险等级：
  - low: 无明显风险
  - medium: 有潜在风险但不紧急
  - high: 存在明显风险，需要立即干预
- 输出：risk_level

**任务 4：干预建议**
- 如果风险等级为 medium 或 high，提供干预建议：
  - 立即行动（转介、联系紧急联系人、报警）
  - 对话策略调整（安抚、稳定、建立安全感）
  - 后续跟进计划
- 输出：intervention_recommendation

【输出格式】
严格按照以下 JSON 格式输出：

{
  "needs_correction": true|false,
  "corrected_response": "修订后的回复内容",
  "correction_reason": "修订原因",
  "risk_level": "low|medium|high",
  "risk_assessment": {
    "suicide_risk": 0-10,
    "self_harm_risk": 0-10,
    "emotional_crisis": 0-10,
    "trauma_indicators": 0-10,
    "reasoning": "风险评估理由..."
  },
  "intervention_recommendation": {
    "immediate_action": "立即行动建议...",
    "conversation_adjustment": "对话策略调整...",
    "follow_up_plan": "后续跟进计划..."
  }
}
```

**变量说明**:
- `{%mainline_response%}` - 主线 A 生成的回复内容
- `{%full_chat_history%}` - 完整对话历史
- `{%risk_history%}` - 历史风险记录
- 其他变量同主线A

---

### 支线 C：监控层（风险监控 + 干预）

#### 设计理念

**职责边界（What）**：
1. **对当前会谈进行风险信号检测与分级评估**
   - 基于当前轮对话及必要的历史信息，识别是否存在自杀、自伤、暴力、虐待披露、严重躯体症状等安全相关风险；
   - 输出结构化风险评估结果（如 `risk_type`、`risk_level`、`risk_signals`、`risk_assessment` 等），供规则引擎和主线 A 综合使用。

2. **在需要时为当前轮回复提供安全导向建议或替代文案**
   - 当检测到中高等级风险时，给出安全导语式的回复建议，或生成一条更安全的替代回复草案，作为主线 A 调整/替换本轮回复的依据；
   - 在极高风险场景下，为会话切换到专门的安全话题脚本提供路由建议（如 `safety_script_id`、`intervention_recommendation`）。

3. **为规则引擎和安全脚本路由提供结构化决策信号**
   - 输出可被规则引擎直接消费的决策信号（如 `should_interrupt`、`should_route_to_safety_script`、`recommended_route` 等），
     用于触发后续的安全流程（包括话题切换、转介或其他预定义干预机制）。

**实现手段 / 输入方式（How）**：
- 通过异步 LLM 调用执行支线 C 提示词模板，不阻塞主线 A 的同步回复；
- 主要输入包括：裁剪后的会谈对话历史（或必要的完整历史片段）、用户基础信息（可选）、历史风险记录等，用于支撑风险识别与分级；
- 模板内引导模型输出统一结构的风险评估结果和干预建议，避免将完整业务逻辑硬编码在主线 A 中。

**架构约束 / 数据边界（Boundary）**：
- 与主线 A：支线 C 不直接修改主线 A 内部状态，只通过结构化结果影响主线 A 的本轮回复选择（例如作为安全替代文案或安全优先提示）；主线 A 在需要时参考支线 C 的 `risk_assessment` 与 `intervention_recommendation` 调整对话策略。
- 与规则引擎：规则引擎基于支线 C 输出的 `risk_level`、`risk_type` 和决策信号，结合全局安全策略与脚本配置，决定是否中断当前话题、切换到安全话题脚本或触发外部安全流程。
- 与脚本层及安全话题脚本：支线 C 只产生"路由到哪类安全脚本"的建议（即安全话题脚本标识或类别），安全处置细节在独立的安全话题脚本中实现，遵循与普通话题相同的 spec-workflow 规范。
- 性能与调用方式：支线 C 以低优先级、异步方式执行（典型 3–5 秒响应），不影响主线 A 的实时响应路径；可配置为“每轮执行”或“仅在特定触发条件下执行”（例如主线 A `risk_screening` 检测到潜在风险时）。

---

**执行频率**: 异步，每轮执行（低优先级，3-5秒响应）

**模板文件**: `config/prompts/ai-say-branch-c.prompt`

**模板内容**:

```
【支线 C：风险监控与干预】

你是心理危机干预专家，负责监控对话中的风险信号，必要时触发干预。

【完整对话历史】
{%full_chat_history%}

【用户基础信息】
- 教育背景：{%教育背景%}
- 心理学知识：{%心理学知识%}
- 情感特点：{%情感特点%}

【历史风险记录】
{%risk_history%}
# 之前识别的风险信号

【你的任务】

**任务 1：风险信号识别**
- 识别以下风险信号：
  - 自杀倾向（直接或间接表达）
  - 自伤行为（过去或计划中）
  - 严重情绪失控（愤怒、绝望、恐慌）
  - 危机事件（创伤、暴力、虐待）
  - 精神病性症状（幻觉、妄想）
- 输出：risk_signals (数组)

**任务 2：风险等级评估**
- 评估风险等级：
  - low: 无明显风险
  - medium: 有风险信号但不紧急
  - high: 需要立即干预
- 输出：risk_level

**任务 3：干预建议**
- 如果风险等级为 medium 或 high，提供干预建议：
  - 立即行动（转介、联系紧急联系人、报警）
  - 对话策略调整（安抚、稳定、建立安全感）
  - 后续跟进计划
- 输出：intervention_recommendation

【输出格式】
严格按照以下 JSON 格式输出：

{
  "risk_signals": ["信号1", "信号2"],
  "risk_level": "low|medium|high",
  "risk_assessment": {
    "suicide_risk": 0-10,
    "self_harm_risk": 0-10,
    "emotional_crisis": 0-10,
    "trauma_indicators": 0-10,
    "reasoning": "风险评估理由..."
  },
  "intervention_recommendation": {
    "immediate_action": "立即行动建议...",
    "conversation_adjustment": "对话策略调整...",
    "follow_up_plan": "后续跟进计划..."
  }
}
```

**变量说明**:
- `{%full_chat_history%}` - 完整对话历史
- `{%risk_history%}` - 历史风险记录
- 其他变量同主线A

---

## 🧩 ai_say 脚本字段设计说明（面向 CBT 工程师）

### 1. 字段分类总览

下表从 **CBT 工程师视角** 对 ai_say 相关脚本字段做一个整体分类。注意：这里专指 **`actions` 里面 `ai_say` 对象本身的字段**，不包括外层的 `topic` / `phase` / `session`。

| 字段 | 分类 | 主要作用 | 示例值 |
|------|------|----------|--------|
| `description` / 直接字符串 | 必填 | 本次 ai_say 要讲解 / 说服的自然语言内容，通常包含【讲解要点】或【说服要点】 | `"ABC 模型是 CBT 的核心概念，包括三个部分…"` |
| `concept` | 推荐 | 标记本段讲解对应的 CBT 概念，便于知识管理和选择合适模板 | `"ABC模型"` |
| `subtype` | 推荐 | 标记对话子类型（如“介绍概念”“说服尝试”等），用于选择不同的提示词与评估维度 | `"introduce_concept"` |
| `max_rounds` | 高级 | 为特殊场景设置该 ai_say 的**硬性轮数上限**，普通脚本一般不需要关心 | `5` |
| `exit_criteria` | 高级 | 为特定 ai_say 编写专门的退出规则，用来**收紧或覆盖**系统的通用退出逻辑 | 见下文 |
| `step_adjustment_rules` | 高级 | 为规则引擎定义步骤调整规则，与支线 B 输出的 `step_adjustment_recommendation` 协作使用 | 见下文 |

> 兼容性说明：`- ai_say: "一句话提示词"` 与 `- ai_say: { description: "一句话提示词" }` 在语义上等价。

### 2. 字段详细说明

#### 2.1 `description` / 直接字符串形式

- **字段名称**：`description`（或让 `ai_say` 直接等于一个字符串）
- **是否必填**：是（至少要以其中一种形式提供）
- **用途说明**：描述这一次 ai_say 要完成的讲解 / 说服任务，是提示词中【讲解主题】【讲解要点】【说服要点】的合并结果。
- **是否由系统自动推断**：否，完全由 CBT 工程师编写。
- **示例值**：

```yaml
- ai_say:
    description: |
      ABC模型是CBT的核心概念，包括三个部分：
      - A (Activating Event): 诱发事件
      - B (Belief): 信念/想法
      - C (Consequence): 结果/情绪
      它们之间的关系是：A → B → C

      【讲解要点】
      1. 先整体介绍ABC三个要素
      2. 用生活化例子说明A→B→C的关系
      3. 强调B是关键，不是A直接导致C
      4. 引导用户举出自己的例子
```

或使用简写形式：

```yaml
- ai_say: |
    ABC模型是CBT的核心概念，包括三个部分：
    - A (Activating Event): 诱发事件
    - B (Belief): 信念/想法
    - C (Consequence): 结果/情绪
    它们之间的关系是：A → B → C
```

#### 2.2 `concept`

- **字段名称**：`concept`
- **是否必填**：否（推荐填写）
- **用途说明**：用于标记本段讲解对应的 CBT 概念名称，便于：
  - 在脚本/知识库中做统计与检索；
  - 按概念选择不同的 ai_say 模板或策略；
  - 后续做学习路径与覆盖度分析。
- **是否由系统自动推断**：是。当脚本未填写 `concept` 时，脚本语义分析服务可以根据 `topic` + `description` 给出推荐概念；CBT 工程师也可以在工具界面中人工修改。
- **示例值**：`"ABC模型"`、`"自动化思维"`、`"认知歪曲"`。

#### 2.3 `subtype`

- **字段名称**：`subtype`
- **是否必填**：否（推荐填写，或由系统自动补齐）
- **用途说明**：标记当前 ai_say 的对话子类型，例如：
  - `introduce_concept`：介绍一个新的 CBT 概念（如 ABC 模型、自动化思维等）；
  - `persuade`：说服 / 邀请用户尝试某个工具或作业；
  - `train_intro`：在正式练习前，介绍训练步骤或注意事项。
  不同 `subtype` 会对应不同的：
  - 评估维度（理解度 vs 接受度 vs 抗拒程度…）；
  - 默认退出逻辑；
  - 支线 B / C 使用的提示词模板。
- **是否由系统自动推断**：是。参见文档前文的“subtype 自动补齐机制”：
  - 如果脚本中未写 `subtype`，会在脚本验证阶段调用 LLM，根据 `topic` / `concept` / `description` 推荐一个 subtype；
  - 只有当置信度足够高时才自动填充，否则按保守默认处理；
  - 一旦脚本作者显式写了 `subtype`，则以人工为准。
- **示例值**：`"introduce_concept"`、`"persuade"`、`"train_intro"`。

#### 2.4 `max_rounds`

- **字段名称**：`max_rounds`
- **是否必填**：否（高级字段，绝大多数脚本可以不写）
- **用途说明**：为极少数有**硬性轮数上限**要求的场景设置保护上限，例如：
  - 某些教学型脚本要求“最多 3 轮讲解，超出就必须结束”；
  - 某些评测场景需要固定轮数，便于统一评估不同脚本的效果。
  在一般咨询场景中，咨询师不会自然地想到“我要 5 轮还是 6 轮”，而是关注“讲清楚 / 讲浅一点 / 讲深入一点”，因此不要求 CBT 工程师日常填写。
- **是否由系统自动推断**：是。系统可以基于：
  - `subtype`（例如 `introduce_concept` / `persuade`）；
  - 全局配置（不同场景的默认轮数上限）；
  推出一个合理的 `max_rounds`，并结合退出条件与评估结果提前退出。
- **示例值**：`5`、`3`（仅在特殊教学/评测脚本中显式配置）。

#### 2.5 `exit_criteria`

- **字段名称**：`exit_criteria`
- **是否必填**：否（高级字段，按需配置）
- **用途说明**：在规则引擎层定义**结构化的退出规则**，通常是一组 `rules`：
  - 每条规则由 `condition` + `action` + `reason` 组成；
  - 典型 `condition` 会引用支线 B 输出的评估字段，如 `understanding_level`、`has_questions`、`expressed_understanding`、`acceptance_level`、`resistance_score` 等；
  - `action` 通常是 `"exit"` 或 `"continue"`。
- **是否由系统自动推断**：部分是。每个 `subtype` 都有一套**通用默认退出规则**（例如：
  - `introduce_concept` 默认：理解度 ≥ 80 且无疑问，或 理解度 ≥ 70 且表达理解 → 可退出；
  - `persuade` 默认：接受度 ≥ 70 且表达愿意尝试 → 可退出；
  因此在多数脚本中可以不写 `exit_criteria`，直接使用默认规则。
  当确有特殊教学/安全要求时，脚本可以通过 `exit_criteria` 收紧或覆盖默认规则。
- **示例值**：

```yaml
exit_criteria:
  rules:
    - condition: "understanding_level >= 80 AND has_questions == false"
      action: "exit"
      reason: "用户已充分理解且无疑问"
    - condition: "understanding_level >= 70 AND expressed_understanding == true"
      action: "exit"
      reason: "用户表达理解意图且理解度达标"
    - else: "continue"
```

#### 2.6 `step_adjustment_rules`

- **字段名称**：`step_adjustment_rules`
- **是否必填**：否（高级字段）
- **用途说明**：为规则引擎提供**可配置的步骤调整策略**，配合支线 B 输出的 `step_adjustment_recommendation` 使用。例如：
  - 在用户理解得特别快时，缩短讲解流程；
  - 在用户抗拒度很高时，插入“动机激发”步骤。
- **是否由系统自动推断**：默认无自动生成；如果不配置，系统只使用支线 B 的建议进行轻量调整，不做复杂的脚本级规则。
- **示例值**：

```yaml
step_adjustment_rules:
  - name: "快速理解时缩短讲解"
    condition: "understanding_level >= 90"
    action: "skip_to_summary_step"
    reason: "用户理解度极高，可以直接总结并退出"
```

### 3. 设计原则说明

#### 3.1 为什么不要求 CBT 工程师填写 `max_rounds`

- 在真实咨询与教学场景中，咨询师更习惯用**模糊语言**思考：
  - “简单讲一下” / “详细讲一讲” / “今天重点只铺垫概念”
  而不是“精确讲 3 轮还是 5 轮”。
- 如果强制要求填写 `max_rounds`，会带来两个问题：
  - 增加脚本编写负担，且不符合咨询师的自然思维方式；
  - 参数一旦写死，后期若调整策略需要逐个脚本修改，维护成本高。
- 因此，设计上选择：
  - **不要求** CBT 工程师填写 `max_rounds`；
  - 由系统根据 `subtype` + 全局配置推导一个合理上限；
  - 真实退出时仍然由“理解度 / 接受度 / 疲劳度”等评估维度决定，而不是单纯靠轮数。

#### 3.2 为什么 `subtype` 和 `concept` 可以自动识别

- 对 CBT 工程师来说，最自然的工作方式是：
  - 给每个话题起一个 `topic`；
  - 写清楚 `description` / `topic_description`，描述要讲什么、怎么讲。
- `subtype` 和 `concept` 更接近“**系统内部的分类标签**”，主要用于：
  - 选择不同 subtype 的提示词模板与评估维度；
  - 做知识管理和脚本统计。
- 因此：
  - 将 `subtype` / `concept` 设计为**推荐字段**，可填可不填；
  - 在脚本验证阶段，通过一次 LLM 调用自动推断：
    - 未填写时 → 尝试识别并补齐；
    - 已填写时 → 以脚本作者意图为准，只做一致性检查与报告。
- 这样既保留了**高级用户的可控性**，又避免让大多数 CBT 工程师被迫学习太多系统内部术语。

#### 3.3 为什么 `exit_criteria` 应该有通用默认规则

- 退出决策是 ai_say 的“**框架级能力**”，每个 subtype 都可以有一套经过验证的默认规则：
  - 例如 `introduce_concept` 关注理解度和是否有未解决疑问；
  - `persuade` 则关注接受度、抗拒程度和尝试意愿。
- 如果要求每个 ai_say 都手写 `exit_criteria`：
  - 容易出错，且脚本之间风格不一致；
  - CBT 工程师会被大量技术细节淹没（条件表达式、字段名等）。
- 因此：
  - **默认情况**：由系统按 subtype 应用一套通用退出规则；
  - **只有在有明确业务需求时**，才建议通过 `exit_criteria` 收紧或覆盖默认规则（例如教学考核、风险敏感话题）。

#### 3.4 简单易用 vs 高级可控的平衡

- 对绝大多数 CBT 工程师：
  - 只需要关注业务语义本身：`topic` + `description`；
  - 可以选择性地标记 `concept`，以便后续统计和检索；
  - 不需要了解 `max_rounds` / `exit_criteria` / `step_adjustment_rules` 的技术细节。
- 对高级用户和架构师：
  - 可以在需要时精细控制退出逻辑和步骤调整；
  - 通过显式配置 `subtype` / `max_rounds` / `exit_criteria` / `step_adjustment_rules`，实现高可控、高可测的行为。
- 设计目标：
  - **“开箱即用”：** 只填必填字段也能获得合理行为；
  - **“逐级解锁”：** 需要时再打开推荐字段和高级字段，不影响已有脚本。

### 4. 脚本示例：简化版 vs 完整版

#### 4.1 简化版脚本（普通 CBT 工程师使用）

```yaml
sessions:
  - session: "ABC模型介绍"
    phases:
      - phase: "概念介绍"
        steps:
          - topic: "ABC模型核心概念"
            actions:
              - ai_say: |
                  ABC模型是CBT的核心概念，包括三个部分：
                  - A (Activating Event): 诱发事件
                  - B (Belief): 信念/想法
                  - C (Consequence): 结果/情绪
                  它们之间的关系是：A → B → C

                  【讲解要点】
                  1. 先整体介绍ABC三个要素
                  2. 用生活化例子（如考试焦虑）说明A→B→C的关系
                  3. 强调B（想法）是关键，不是A直接导致C
                  4. 引导用户举出自己的例子
```

> 说明：这里只填写了必需的业务语义（`topic` + `ai_say` 内容），其余字段由系统按默认策略处理。

#### 4.2 完整版脚本（高级用户使用）

```yaml
sessions:
  - session: "ABC模型介绍"
    phases:
      - phase: "概念介绍"
        steps:
          - topic: "ABC模型核心概念"
            actions:
              - ai_say:
                  description: |
                    ABC模型是CBT的核心概念，包括三个部分：
                    - A (Activating Event): 诱发事件
                    - B (Belief): 信念/想法
                    - C (Consequence): 结果/情绪
                    它们之间的关系是：A → B → C

                    【讲解要点】
                    1. 先整体介绍ABC三个要素
                    2. 用生活化例子（如考试焦虑）说明A→B→C的关系
                    3. 强调B（想法）是关键，不是A直接导致C
                    4. 引导用户举出自己的例子
                  concept: "ABC模型"
                  subtype: "introduce_concept"
                  max_rounds: 5
                  exit_criteria:
                    rules:
                      - condition: "understanding_level >= 80 AND has_questions == false"
                        action: "exit"
                        reason: "用户已充分理解且无疑问"
                      - condition: "understanding_level >= 70 AND expressed_understanding == true"
                        action: "exit"
                        reason: "用户表达理解意图且理解度达标"
                      - else: "continue"
                  step_adjustment_rules:
                    - name: "快速理解时缩短讲解"
                      condition: "understanding_level >= 90"
                      action: "skip_to_summary_step"
                      reason: "用户理解度极高，可以直接总结并退出"
```

> 说明：此版本展示了所有常见字段的组合用法，适合需要精细控制退出逻辑和步骤调整的高级场景。

## 🎬 应用场景 1：介绍 ABC 模型

### 场景描述

**目标**: 向来访者介绍 CBT 的核心概念 ABC 模型

**用户画像**:
- 姓名：小明
- 教育背景：本科
- 心理学知识：无
- 学习风格：视觉型，喜欢具体例子
- 认知特点：逻辑思维较强
- 情感特点：容易焦虑
- 词汇水平：中等
- 语言风格：口语化
- 常用表达："就是说"、"我懂了"、"有点不太明白"

### YAML 脚本

```yaml
sessions:
  - session: "ABC模型介绍"
    declare:
    - var: 来访者名
      value: 小明
    - var: 咨询师名
      value: 李老师
    - var: 教育背景
      value: 本科
    - var: 心理学知识
      value: 无
    - var: 学习风格
      value: 视觉型，喜欢具体例子
    - var: 认知特点
      value: 逻辑思维较强
    - var: 情感特点
      value: 容易焦虑
    - var: 词汇水平
      value: 中等
    - var: 语言风格
      value: 口语化
    - var: 用户常用表达
      value: 就是说、我懂了、有点不太明白
    # 推荐：同时维护一个聚合的脚本层用户画像变量，供支线B/领域适配层直接消费
    - var: 用户画像
      value: |
        姓名：小明
        教育背景：本科
        心理学知识：无
        学习风格：视觉型，喜欢具体例子
        认知特点：逻辑思维较强
        情感特点：容易焦虑
        词汇水平：中等
        语言风格：口语化
        常用表达："就是说"、"我懂了"、"有点不太明白"

    phases:
      - phase: "概念介绍"
        steps:
          - topic: "ABC模型核心概念"
            actions:
              - ai_say: |
                  ABC模型是CBT的核心概念，包括三个部分：
                  - A (Activating Event): 诱发事件
                  - B (Belief): 信念/想法
                  - C (Consequence): 结果/情绪
                  它们之间的关系是：A → B → C

                  【讲解要点】
                  1. 先整体介绍ABC三个要素
                  2. 用生活化例子（如考试焦虑）说明A→B→C的关系
                  3. 强调B（想法）是关键，不是A直接导致C
                  4. 引导用户举出自己的例子
                subtype: "introduce_concept"
                concept: "ABC模型"
                max_rounds: 5

                # 评估场景（支线B执行）
                # 一般由 subtype 自动映射，脚本中无需显式配置

                # 退出条件（规则引擎执行）
                exit_criteria:
                  rules:
                    - condition: "understanding_level >= 80 AND has_questions == false"
                      action: "exit"
                      reason: "用户已充分理解且无疑问"
                    - condition: "understanding_level >= 70 AND expressed_understanding == true"
                      action: "exit"
                      reason: "用户表达理解意图且理解度达标"
                    - else: "continue"
```

### 模拟上下文（第1轮对话）

**对话历史**: （空，这是第一轮）

**用户最新消息**: "李医生，您好！我想了解一下CBT是怎么工作的。"

**支线B输出**（初始化）:
```json
{
  "assessment": {
    "identified_questions": ["CBT是怎么工作的"],
    "understanding_level": 0,
    "expressed_understanding": false,
    "emotional_state": "积极",
    "emotion_intensity": 2,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 8,
    "has_questions": true,
    "reasoning": "用户主动询问CBT工作原理，表现出学习意愿，情绪积极，认知准备度较高"
  },
  "assessment_summary": [
    "理解度：0分",
    "有疑问：是",
    "表达理解：否",
    "情绪状态：积极",
    "抗拒程度：0分"
  ],
  "base_steps": [
    "步骤1：用简单的语言整体介绍ABC模型的三个要素（A、B、C）",
    "步骤2：用生活化例子（如考试焦虑）说明A→B→C的关系",
    "步骤3：引导用户举出自己的例子并应用ABC模型解释"
  ],
  "progress_summary": "刚开始介绍ABC模型",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：用简单的语言整体介绍ABC模型的三个要素（A、B、C）",
      "步骤2：用生活化例子（如考试焦虑）说明A→B→C的关系",
      "步骤3：引导用户举出自己的例子并应用ABC模型解释"
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "用简单的语言整体介绍ABC模型的三个要素（A、B、C）",
    "next_step_focus": "用生活化例子帮助理解A→B→C的关系"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 10
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "首轮讲解，按原步骤计划推进即可"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：使用口语化表达（用户词汇水平中等），避免专业术语，多用'就是说'这样的过渡词（用户常用表达）\n- 例子选择：准备一个关于焦虑的生活化例子（如考试焦虑），符合用户视觉型学习风格\n- 共鸣建立：认可用户的学习意愿，建立协作关系，注意用户容易焦虑的特点\n- 引导策略：先整体介绍，再逐个解释，最后用例子串联（符合用户逻辑思维强的特点）"
}
```

### 代入变量后的完整提示词（主线A - 第1轮）

```
现时间 2025-01-14 16:50，你是 李医生。请延续对话，生成给 小明 的回应。

【讲解主题】
# 注意：这里可以包含复杂的业务逻辑，由CBT工程师编写
ABC模型是CBT的核心概念，包括三个部分：
- A (Activating Event): 诱发事件
- B (Belief): 信念/想法
- C (Consequence): 结果/情绪
它们之间的关系是：A → B → C

【讲解要点】
1. 先整体介绍ABC三个要素
2. 用生活化例子（如考试焦虑）说明A→B→C的关系
3. 强调B（想法）是关键，不是A直接导致C
4. 引导用户举出自己的例子

【当前讲解进度】
刚开始介绍ABC模型

【当前策略步骤】
你正在执行第 1/3 步：用简单的语言介绍ABC模型的三个要素
下一步重点：用生活化的例子帮助理解

【沟通策略】
# 注意：此策略由支线B基于用户画像生成，已包含用户特征的精华
- 语言风格：使用口语化表达（用户词汇水平中等），避免专业术语，多用'就是说'这样的过渡词（用户常用表达）
- 例子选择：准备一个关于焦虑的生活化例子（如考试焦虑），符合用户视觉型学习风格
- 共鸣建立：认可用户的学习意愿，建立协作关系，注意用户容易焦虑的特点
- 引导策略：先整体介绍，再逐个解释，最后用例子串联（符合用户逻辑思维强的特点）

【近期对话窗口】（只包含最近若干轮，对最后一条用户消息直接回应）
小明: "李医生，您好！我想了解一下CBT是怎么工作的。"

【你的任务】

1. **执行业务逻辑**：
   - 根据【讲解主题】和【讲解要点】的要求，生成你的回复
   - 应用【沟通策略】中的指导
   - 确保回复符合当前策略步骤的重点

2. **判断是否退出**：
   - 来访者反应评估：
     - 理解度：0分（刚开始）
     - 有疑问：是（用户询问CBT工作原理）
     - 表达理解：否
     - 情绪状态：积极
     - 抗拒程度：0分

   - 退出条件（由脚本定义）：
     - 理解度>=80且无疑问 → 退出
     - 理解度>=70且表达理解 → 退出
     - 其他情况 → 继续

   - 请判断是否应该退出当前话题

3. **风险快速筛查**：
   - 请基于最近一轮用户回复和对话历史，判断是否存在以下风险（自杀/自伤、危机情绪、严重认知扭曲、治疗关系破裂）
   - 请在输出的 risk_screening 字段中如实填写筛查结果（urgent_risk_detected 和 risk_type）


【输出格式】
严格按照以下 JSON 格式输出：

{
  "response": {
    "咨询师": "你的回复内容..."
  },
  "exit": true|false,
  "exit_reason": "退出原因或继续原因...",
  "risk_screening": {
    "urgent_risk_detected": true|false,
    "risk_type": "suicide|self_harm|crisis_emotion|severe_distortion|alliance_rupture|null"
  }
}
```

### 模拟LLM输出（主线A - 第1轮）

```json
{
  "response": {
    "咨询师": "小明你好！很高兴你想了解CBT。CBT的核心其实就是一个叫ABC模型的东西，特别好理解。就是说，我们把一件事情分成三个部分来看：A是发生的事情，B是你对这件事的想法，C是你的情绪反应。比如说，你考试前（这是A），如果你想'我肯定考不好'（这是B），那你就会很焦虑（这是C）。关键是，不是A直接导致C，而是你的想法B在中间起作用。你觉得这个思路好理解吗？"
  },
  "exit": false,
  "exit_reason": "用户刚开始学习，理解度为0分，有疑问需要解答，不满足退出条件，继续讲解",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  understanding_level: 0,
  has_questions: true,
  expressed_understanding: false
};

// 执行退出规则
// 规则1: understanding_level >= 80 AND has_questions == false → 不满足
// 规则2: understanding_level >= 70 AND expressed_understanding == true → 不满足
// 结果: continue

// 主线A的LLM判断作为兜底，结果一致：exit = false
```

---

### 模拟上下文（第2轮对话）

**对话历史**:
```
李医生: 小明你好！很高兴你想了解CBT。CBT的核心其实就是一个叫ABC模型的东西，特别好理解。就是说，我们把一件事情分成三个部分来看：A是发生的事情，B是你对这件事的想法，C是你的情绪反应。比如说，你考试前（这是A），如果你想'我肯定考不好'（这是B），那你就会很焦虑（这是C）。关键是，不是A直接导致C，而是你的想法B在中间起作用。你觉得这个思路好理解吗？
```

**用户最新消息**: "嗯，有点明白了。就是说，同样是考试，如果我想的不一样，情绪也会不一样对吗？"

**支线B输出**（第2轮）:
```json
{
  "assessment": {
    "identified_questions": [],
    "understanding_level": 65,
    "expressed_understanding": true,
    "emotional_state": "积极",
    "emotion_intensity": 3,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 8,
    "has_questions": false,
    "reasoning": "用户理解了B影响C的核心逻辑，表达了理解意图（'有点明白了'），但还没有完全掌握ABC三者的关系，也没有举出自己的例子"
  },
  "progress_summary": "用户已理解B影响C的核心逻辑，但对ABC完整关系的理解还不够深入",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：用简单的语言整体介绍ABC模型的三个要素（A、B、C）",
      "步骤2：用生活化例子（如考试焦虑）说明A→B→C的关系",
      "步骤3：引导用户举出自己的例子并应用ABC模型解释"
    ],
    "current_step_index": 2,
    "total_steps": 3,
    "step_description": "确认用户理解，并用更多例子深化ABC三者关系",
    "next_step_focus": "引导用户举出自己的例子"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 60
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "当前推进节奏合理，可按原步骤计划继续深化理解"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：先肯定用户的理解（用户喜欢被认可），再用'对，就是这个意思'来强化\n- 例子选择：再举一个反例（同样的事件，不同的想法，不同的情绪），符合用户视觉型学习风格\n- 共鸣建立：认可用户的理解进步，鼓励继续思考\n- 引导策略：用开放式问题引导用户举出自己的例子（符合用户逻辑思维强的特点）"
}
```

### 代入变量后的完整提示词（主线A - 第2轮）

```
现时间 2025-01-14 16:52，你是 李医生。请延续对话，生成给 小明 的回应。

【讲解主题】
（同第1轮，省略）

【当前讲解进度】
用户已理解B影响C的核心逻辑，但对ABC完整关系的理解还不够深入

【当前策略步骤】
你正在执行第 2/3 步：确认用户理解，并用更多例子深化ABC三者关系
下一步重点：引导用户举出自己的例子

【沟通策略】
- 语言风格：先肯定用户的理解（用户喜欢被认可），再用'对，就是这个意思'来强化
- 例子选择：再举一个反例（同样的事件，不同的想法，不同的情绪），符合用户视觉型学习风格
- 共鸣建立：认可用户的理解进步，鼓励继续思考
- 引导策略：用开放式问题引导用户举出自己的例子（符合用户逻辑思维强的特点）

【近期对话窗口】（只包含最近若干轮，对最后一条用户消息直接回应）
李医生: 小明你好！很高兴你想了解CBT。CBT的核心其实就是一个叫ABC模型的东西，特别好理解。就是说，我们把一件事情分成三个部分来看：A是发生的事情，B是你对这件事的想法，C是你的情绪反应。比如说，你考试前（这是A），如果你想'我肯定考不好'（这是B），那你就会很焦虑（这是C）。关键是，不是A直接导致C，而是你的想法B在中间起作用。你觉得这个思路好理解吗？
小明: "嗯，有点明白了。就是说，同样是考试，如果我想的不一样，情绪也会不一样对吗？"

【你的任务】

1. **执行业务逻辑**：
   - 根据【讲解主题】的要求，生成你的回复
   - 应用【沟通策略】中的指导
   - 确保回复符合当前策略步骤的重点

2. **判断是否退出**：
   - 来访者反应评估：
     - 理解度：65分
     - 有疑问：否
     - 表达理解：是（"有点明白了"）
     - 情绪状态：积极
     - 抗拒程度：0分

   - 退出条件：
     - 理解度>=80且无疑问 → 退出（不满足，理解度65<80）
     - 理解度>=70且表达理解 → 退出（不满足，理解度65<70）
     - 其他情况 → 继续

   - 请判断是否应该退出当前话题

3. **风险快速筛查**：
   - 请基于最近一轮用户回复和对话历史，判断是否存在以下风险（自杀/自伤、危机情绪、严重认知扭曲、治疗关系破裂）
   - 请在输出的 risk_screening 字段中如实填写筛查结果（urgent_risk_detected 和 risk_type）


【输出格式】
（同第1轮）
```

### 模拟LLM输出（主线A - 第2轮）

```json
{
  "response": {
    "咨询师": "对！就是这个意思！你理解得很准确。同样是考试这件事（A），如果你想'我准备得挺充分的，应该没问题'（B），你可能就会比较平静甚至有点自信（C）。但如果你想'我肯定考不好'（B），那就会很焦虑（C）。你看，事件A是一样的，但想法B不同，情绪C就完全不一样了。你能想想自己生活中有没有类似的例子吗？比如遇到什么事情，不同的想法会让你有不同的感受？"
  },
  "exit": false,
  "exit_reason": "用户理解度65分，虽然表达了理解意图，但未达到70分阈值，需要继续深化理解",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  understanding_level: 65,
  has_questions: false,
  expressed_understanding: true
};

// 执行退出规则
// 规则1: understanding_level >= 80 AND has_questions == false → 不满足（65 < 80）
// 规则2: understanding_level >= 70 AND expressed_understanding == true → 不满足（65 < 70）
// 结果: continue
```

---

### 模拟上下文（第3轮对话）

**对话历史**:
```
李医生: 小明你好！很高兴你想了解CBT。CBT的核心其实就是一个叫ABC模型的东西，特别好理解。就是说，我们把一件事情分成三个部分来看：A是发生的事情，B是你对这件事的想法，C是你的情绪反应。比如说，你考试前（这是A），如果你想'我肯定考不好'（这是B），那你就会很焦虑（这是C）。关键是，不是A直接导致C，而是你的想法B在中间起作用。你觉得这个思路好理解吗？

小明: 嗯，有点明白了。就是说，同样是考试，如果我想的不一样，情绪也会不一样对吗？

李医生: 对！就是这个意思！你理解得很准确。同样是考试这件事（A），如果你想'我准备得挺充分的，应该没问题'（B），你可能就会比较平静甚至有点自信（C）。但如果你想'我肯定考不好'（B），那就会很焦虑（C）。你看，事件A是一样的，但想法B不同，情绪C就完全不一样了。你能想想自己生活中有没有类似的例子吗？比如遇到什么事情，不同的想法会让你有不同的感受？
```

**用户最新消息**: "我想想...比如我老板批评我的时候，如果我觉得'他是在帮我进步'，我就不会那么难受。但如果我觉得'他是在针对我'，我就会很生气。这也是ABC模型吗？"

**支线B输出**（第3轮）:
```json
{
  "assessment": {
    "identified_questions": ["这也是ABC模型吗？"],
    "understanding_level": 85,
    "expressed_understanding": true,
    "emotional_state": "积极",
    "emotion_intensity": 5,
    "topic_alignment": 1.0,
    "resistance_score": 0,
    "cognitive_readiness": 9,
    "has_questions": true,
    "reasoning": "用户能够举出自己的例子，准确识别了A、B、C三个要素，理解度达标。虽然有疑问（'这也是ABC模型吗？'），但这是确认性疑问，不是真正的困惑"
  },
  "progress_summary": "用户已完全理解ABC模型的核心逻辑，能够准确识别A、B、C三个要素，并能应用到自己的生活中",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：用简单的语言整体介绍ABC模型的三个要素（A、B、C）",
      "步骤2：用生活化例子（如考试焦虑）说明A→B→C的关系",
      "步骤3：引导用户举出自己的例子并应用ABC模型解释"
    ],
    "current_step_index": 3,
    "total_steps": 3,
    "step_description": "确认用户理解，总结要点，准备退出",
    "next_step_focus": "肯定用户的理解，简要总结ABC模型的价值"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 100
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "已达到退出条件，无需再调整步骤计划"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：热情肯定用户的例子（用户喜欢被认可），用'完全正确'来强化\n- 例子选择：不需要新例子，直接确认用户的例子\n- 共鸣建立：赞赏用户的学习能力和应用能力\n- 引导策略：简要总结ABC模型的价值，为下一个话题做铺垫"
}
```

### 模拟LLM输出（主线A - 第3轮）

```json
{
  "response": {
    "咨询师": "完全正确！你举的这个例子太棒了！老板批评你（A），你想'他是在帮我进步'（B），你就不会那么难受（C）；但如果你想'他是在针对我'（B），你就会很生气（C）。这就是标准的ABC模型！你看，掌握了ABC模型，你就能理解为什么同样的事情，不同的人会有不同的情绪反应，甚至同一个人在不同时候也会有不同的反应。这就是CBT的核心思想：改变想法，就能改变情绪。你已经完全理解ABC模型了！"
  },
  "exit": true,
  "exit_reason": "用户理解度85分，达到退出阈值80分，且能举出自己的例子，满足退出条件",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  understanding_level: 85,
  has_questions: true,  // 注意：这是确认性疑问，不是真正的困惑
  expressed_understanding: true
};

// 执行退出规则
// 规则1: understanding_level >= 80 AND has_questions == false → 不满足（has_questions = true）
// 规则2: understanding_level >= 70 AND expressed_understanding == true → 满足！（85 >= 70 且 expressed_understanding = true）
// 结果: exit

// 主线A的LLM判断作为兜底，结果一致：exit = true
```

**系统最终决策**: 规则引擎判断退出，主线A LLM判断也退出，结束当前话题。

---

## 🎬 应用场景 2：说服用户尝试思维记录

### 场景描述

**目标**: 说服来访者尝试使用思维记录表（一种CBT工具）

**用户画像**:
- 姓名：小红
- 教育背景：高中
- 心理学知识：无
- 学习风格：实践型，喜欢直接行动
- 认知特点：具体思维，不喜欢抽象概念
- 情感特点：容易抗拒，不喜欢麻烦的事情
- 词汇水平：一般
- 语言风格：直接、简洁
- 常用表达："太麻烦了"、"我试试吧"、"这有用吗"

### YAML 脚本

```yaml
sessions:
  - session: "思维记录工具介绍"
    variables:
      session:
        user_name: "小红"
        counselor_name: "王医生"
        # 用户画像（只在支线B中使用）
        教育背景: "高中"
        心理学知识: "无"
        学习风格: "实践型，喜欢直接行动"
        认知特点: "具体思维，不喜欢抽象概念"
        情感特点: "容易抗拒，不喜欢麻烦的事情"
        词汇水平: "一般"
        语言风格: "直接、简洁"
        用户常用表达: "太麻烦了、我试试吧、这有用吗"

    phases:
      - phase: "工具介绍与说服"
        steps:
          - topic: "思维记录表的价值"
            actions:
              - ai_say:
                  concept: "思维记录表"
                  description: |
                    思维记录表是一个简单的工具，帮助你记录：
                    1. 发生了什么事（A）
                    2. 你当时想了什么（B）
                    3. 你有什么情绪（C）
                    通过记录，你能更清楚地看到自己的思维模式。

                    【说服要点】
                    1. 强调简单易用（针对用户怕麻烦的特点）
                    2. 强调实际效果（针对用户实践型的特点）
                    3. 提供具体例子（针对用户具体思维的特点）
                    4. 降低承诺门槛（先试一次，不要求长期坚持）

                    【特定风险关注】
                    - 用户在回顾某些事件时，情绪可能突然升高到极度痛苦（需警惕危机情绪）
                    - 用户可能误解记录内容会被他人看到或用于评判（需澄清隐私与用途）

                  subtype: "persuade"
                  max_rounds: 5

                  # 评估场景（支线B执行）
                  # 通常随 subtype 一起确定，脚本中无需显式配置

                  # 退出条件（规则引擎执行）
                  exit_criteria:
                    rules:
                      - condition: "acceptance_level >= 70 AND expressed_willingness == true"
                        action: "exit"
                        reason: "用户接受度达标且表达了尝试意愿"
                      - condition: "resistance_score >= 8 AND rounds >= 3"
                        action: "exit"
                        reason: "用户抗拒程度高，多次说服无效，避免过度推销"
                      - else: "continue"

                  # 步骤调整规则（规则引擎 + 支线B 协作执行）
                  step_adjustment_rules:
                    - name: "快速接受时缩短说服流程"
                      condition: "acceptance_level >= 80 AND expressed_willingness == true"
                      action: "skip_to_summary_step"
                      reason: "用户已经高度接受，可直接进入总结与行动指导"
                    - name: "高抗拒时增加动机激发步骤"
                      condition: "resistance_score >= 8"
                      action: "insert_motivation_step"
                      reason: "用户抗拒程度较高，需要先增加内在动机"
```

### 模拟上下文（第1轮对话）

**对话历史**:
```
王医生: 小红，我们上次聊了ABC模型，你理解得很好。今天我想介绍一个工具，可以帮助你更好地了解自己的想法。
```

**用户最新消息**: "什么工具啊？不会很麻烦吧？"

**支线B输出**（初始化）:
```json
{
  "assessment": {
    "identified_questions": ["什么工具啊", "不会很麻烦吧"],
    "understanding_level": 0,
    "expressed_understanding": false,
    "emotional_state": "抗拒",
    "emotion_intensity": 4,
    "topic_alignment": 1.0,
    "resistance_score": 6,
    "cognitive_readiness": 7,
    "has_questions": true,
    "acceptance_level": 0,
    "expressed_willingness": false,
    "reasoning": "用户对工具表现出抗拒倾向（'不会很麻烦吧'），抗拒程度中等（6分），需要降低抗拒感"
  },
  "assessment_summary": [
    "接受度：0分",
    "阻抗程度：6分",
    "是否表达愿意尝试：否",
    "是否仍有重要顾虑：是"
  ],
  "base_steps": [
    "步骤1：介绍工具的简单性和实用性，降低用户的抗拒感",
    "步骤2：用具体例子展示工具的易用性和实际效果",
    "步骤3：邀请用户尝试一次思维记录，降低承诺门槛"
  ],
  "progress_summary": "刚开始介绍思维记录表，用户表现出抗拒倾向",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：介绍工具的简单性和实用性，降低用户的抗拒感",
      "步骤2：用具体例子展示工具的易用性和实际效果",
      "步骤3：邀请用户尝试一次思维记录，降低承诺门槛"
    ],
    "current_step_index": 1,
    "total_steps": 3,
    "step_description": "介绍工具的简单性和实用性，降低用户的抗拒感",
    "next_step_focus": "用具体例子展示工具的易用性和实际效果"
  },
  "current_step_completion": {
    "is_completed": false,
    "completion_percentage": 10,
    "reasoning": "刚开始执行第1步，仅完成初步介绍，还未进入举例和邀请尝试的部分"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "首轮仅需按原计划推进，无需调整步骤计划"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：直接、简洁（用户语言风格），避免长篇大论，用'很简单'、'就几分钟'来降低抗拒（针对用户怕麻烦的特点）\n- 例子选择：用一个超简单的例子（3个问题，1分钟完成），符合用户实践型学习风格\n- 共鸣建立：理解用户不喜欢麻烦的心理，强调'不麻烦'\n- 引导策略：先承诺简单，再展示价值，最后邀请尝试（符合用户具体思维的特点）"
}
```

### 代入变量后的完整提示词（主线A - 第1轮）

```
现时间 2025-01-14 17:00，你是 王医生。请延续对话，生成给 小红 的回应。

【讲解主题】
思维记录表是一个简单的工具，帮助你记录：
1. 发生了什么事（A）
2. 你当时想了什么（B）
3. 你有什么情绪（C）
通过记录，你能更清楚地看到自己的思维模式。

【说服要点】
1. 强调简单易用（针对用户怕麻烦的特点）
2. 强调实际效果（针对用户实践型的特点）
3. 提供具体例子（针对用户具体思维的特点）
4. 降低承诺门槛（先试一次，不要求长期坚持）

【当前讲解进度】
刚开始介绍思维记录表，用户表现出抗拒倾向

【当前策略步骤】
你正在执行第 1/3 步：介绍工具的简单性和实用性，降低用户的抗拒感
下一步重点：用具体例子展示工具的易用性

【沟通策略】
- 语言风格：直接、简洁（用户语言风格），避免长篇大论，用'很简单'、'就几分钟'来降低抗拒（针对用户怕麻烦的特点）
- 例子选择：用一个超简单的例子（3个问题，1分钟完成），符合用户实践型学习风格
- 共鸣建立：理解用户不喜欢麻烦的心理，强调'不麻烦'
- 引导策略：先承诺简单，再展示价值，最后邀请尝试（符合用户具体思维的特点）

【近期对话窗口】（只包含最近若干轮，对最后一条用户消息直接回应）
王医生: 小红，我们上次聊了ABC模型，你理解得很好。今天我想介绍一个工具，可以帮助你更好地了解自己的想法。
小红: "什么工具啊？不会很麻烦吧？"

【你的任务】

1. **执行业务逻辑**：
   - 根据【讲解主题】和【说服要点】的要求，生成你的回复
   - 应用【沟通策略】中的指导
   - 确保回复符合当前策略步骤的重点

2. **判断是否退出**：
   - 来访者反应评估：
     - 接受度：0分（刚开始）
     - 抗拒程度：6分（中等）
     - 表达尝试意愿：否
     - 有疑问：是

   - 退出条件（由脚本定义）：
     - 接受度>=70且表达尝试意愿 → 退出
     - 抗拒程度>=8且轮次>=3 → 退出（避免过度推销）
     - 其他情况 → 继续

   - 请判断是否应该退出当前话题

   > **协作流程说明**：当支线B评估建议准备退出时（`should_exit=true`），规则层会向主线A添加退出提示词，使对话逐步进入收尾阶段。只有当主线A实际标记`exit=true`时，规则层才会做出最终退出决策。

3. **风险快速筛查**：
   - 请基于最近一轮用户回复和对话历史，判断是否存在以下风险（自杀/自伤、危机情绪、严重认知扭曲、治疗关系破裂）
   - 请在输出的 risk_screening 字段中如实填写筛查结果（urgent_risk_detected 和 risk_type）


【输出格式】
（同场景1）
```

### 模拟LLM输出（主线A - 第1轮）

```json
{
  "response": {
    "咨询师": "完全不麻烦！就是一个很简单的表格，叫思维记录表。你只需要回答三个问题：发生了什么事？你当时想了什么？你有什么感受？就这么简单，一分钟就能填完。比如你今天迟到了（事件），你想'老板肯定要骂我了'（想法），然后你就很紧张（感受）。记下来就行了。这个工具能帮你看清楚自己的想法是怎么影响情绪的。"
  },
  "exit": false,
  "exit_reason": "用户刚开始接触工具，接受度0分，抗拒程度6分（中等），需要继续说服",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  acceptance_level: 0,
  resistance_score: 6,
  expressed_willingness: false,
  rounds: 1
};

// 执行退出规则
// 规则1: acceptance_level >= 70 AND expressed_willingness == true → 不满足
// 规则2: resistance_score >= 8 AND rounds >= 3 → 不满足
// 结果: continue
```

---

### 模拟上下文（第2轮对话）

**对话历史**:
```
王医生: 小红，我们上次聊了ABC模型，你理解得很好。今天我想介绍一个工具，可以帮助你更好地了解自己的想法。

小红: 什么工具啊？不会很麻烦吧？

王医生: 完全不麻烦！就是一个很简单的表格，叫思维记录表。你只需要回答三个问题：发生了什么事？你当时想了什么？你有什么感受？就这么简单，一分钟就能填完。比如你今天迟到了（事件），你想'老板肯定要骂我了'（想法），然后你就很紧张（感受）。记下来就行了。这个工具能帮你看清楚自己的想法是怎么影响情绪的。
```

**用户最新消息**: "听起来是挺简单的，但这有用吗？我记下来了又怎么样？"

**支线B输出**（第2轮）:
```json
{
  "assessment": {
    "identified_questions": ["这有用吗", "我记下来了又怎么样"],
    "understanding_level": 40,
    "expressed_understanding": false,
    "emotional_state": "困惑",
    "emotion_intensity": 3,
    "topic_alignment": 1.0,
    "resistance_score": 5,
    "cognitive_readiness": 7,
    "has_questions": true,
    "acceptance_level": 30,
    "expressed_willingness": false,
    "reasoning": "用户理解了工具的操作方式（'听起来是挺简单的'），但对工具的价值持怀疑态度（'这有用吗'），抗拒程度从6降至5，接受度提升至30分"
  },
  "assessment_summary": [
    "接受度：30分",
    "阻抗程度：5分",
    "是否表达愿意尝试：否",
    "是否仍有重要顾虑：是"
  ],
  "progress_summary": "用户理解了工具的简单性，但对工具的实用价值持怀疑态度",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：介绍工具的简单性和实用性，降低用户的抗拒感",
      "步骤2：用具体例子展示工具的易用性和实际效果",
      "步骤3：邀请用户尝试一次思维记录，降低承诺门槛"
    ],
    "current_step_index": 2,
    "total_steps": 3,
    "step_description": "展示工具的实际价值，用具体例子说明记录后的改变",
    "next_step_focus": "邀请用户尝试一次，降低承诺成本"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 60,
    "reasoning": "第1步（说明工具简单）已基本完成，第2步正在进行中，用户已开始关注工具价值"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "当前推进节奏和步骤顺序合理，可继续按原计划推进"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：用'你会发现'、'很多人都说'来增加可信度（符合用户直接简洁的风格）\n- 例子选择：用一个具体的改变例子（记录后发现想法不合理，情绪改善），符合用户实践型学习风格\n- 共鸣建立：理解用户的怀疑，用'我理解你的疑问'来建立共鸣\n- 引导策略：降低承诺成本，邀请'试一次'而不是'一直做'（针对用户怕麻烦的特点）"
}
```

### 模拟LLM输出（主线A - 第2轮）

```json
{
  "response": {
    "咨询师": "我理解你的疑问。记下来的好处是，你会发现很多时候你的想法其实不太合理。比如你迟到了，你想'老板肯定要骂我'，但记下来后你可能会发现，老板其实没骂你，或者只是提醒了一下。这时候你就会意识到，是你自己的想法让你紧张的，不是事情本身。很多人都说，记录几次后，他们就能更快地发现自己的不合理想法，情绪也就好多了。要不你试一次？就一次，看看有没有用。"
  },
  "exit": false,
  "exit_reason": "用户接受度30分，未达到70分阈值，抗拒程度5分（中等），需要继续说服",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  acceptance_level: 30,
  resistance_score: 5,
  expressed_willingness: false,
  rounds: 2
};

// 支线B给出的步骤调整建议
const stepAdjustment = {
  should_adjust: false,
  adjustment_type: "none",
  reasoning:
    "当前推进节奏和步骤顺序合理，可继续按原计划推进"
};

// 当前的步骤计划（来自支线B的 strategy_steps）
let currentPlan = {
  planned_steps: [
    "步骤1：介绍工具的简单性和实用性，降低用户的抗拒感",
    "步骤2：用具体例子展示工具的易用性和实际效果",
    "步骤3：邀请用户尝试一次思维记录，降低承诺门槛"
  ],
  current_step_index: 2,
  total_steps: 3,
  step_description:
    "展示工具的实际价值，用具体例子说明记录后的改变",
  next_step_focus: "邀请用户尝试一次，降低承诺成本"
};

// 规则引擎应用步骤调整建议
if (stepAdjustment.should_adjust) {
  currentPlan = applyStepAdjustment(currentPlan, stepAdjustment);
  // 例如：在当前步骤前插入“动机激发”步骤，或跳过后续步骤
}
// 本轮示例中 should_adjust = false，因此保持原有步骤计划

// 执行退出规则
// 规则1: acceptance_level >= 70 AND expressed_willingness == true → 不满足（30 < 70）
// 规则2: resistance_score >= 8 AND rounds >= 3 → 不满足（5 < 8）
// 结果: continue
```

---

### 模拟上下文（第3轮对话）

**对话历史**:
```
王医生: 小红，我们上次聊了ABC模型，你理解得很好。今天我想介绍一个工具，可以帮助你更好地了解自己的想法。

小红: 什么工具啊？不会很麻烦吧？

王医生: 完全不麻烦！就是一个很简单的表格，叫思维记录表。你只需要回答三个问题：发生了什么事？你当时想了什么？你有什么感受？就这么简单，一分钟就能填完。比如你今天迟到了（事件），你想'老板肯定要骂我了'（想法），然后你就很紧张（感受）。记下来就行了。这个工具能帮你看清楚自己的想法是怎么影响情绪的。

小红: 听起来是挺简单的，但这有用吗？我记下来了又怎么样？

王医生: 我理解你的疑问。记下来的好处是，你会发现很多时候你的想法其实不太合理。比如你迟到了，你想'老板肯定要骂我'，但记下来后你可能会发现，老板其实没骂你，或者只是提醒了一下。这时候你就会意识到，是你自己的想法让你紧张的，不是事情本身。很多人都说，记录几次后，他们就能更快地发现自己的不合理想法，情绪也就好多了。要不你试一次？就一次，看看有没有用。
```

**用户最新消息**: "好吧，我试试吧。反正也不麻烦。"

**支线B输出**（第3轮）:
```json
{
  "assessment": {
    "identified_questions": [],
    "understanding_level": 75,
    "expressed_understanding": true,
    "emotional_state": "平静",
    "emotion_intensity": 2,
    "topic_alignment": 1.0,
    "resistance_score": 2,
    "cognitive_readiness": 8,
    "has_questions": false,
    "acceptance_level": 75,
    "expressed_willingness": true,
    "reasoning": "用户接受了尝试的建议（'我试试吧'），虽然还有些保留（'反正也不麻烦'），但已经明确表达了尝试意愿，抗拒程度降至2分，接受度达到75分"
  },
  "progress_summary": "用户已接受尝试思维记录表的建议，说服成功",
  "strategy_steps": {
    "planned_steps": [
      "步骤1：介绍工具的简单性和实用性，降低用户的抗拒感",
      "步骤2：用具体例子展示工具的易用性和实际效果",
      "步骤3：邀请用户尝试一次思维记录，降低承诺门槛"
    ],
    "current_step_index": 3,
    "total_steps": 3,
    "step_description": "确认用户的承诺，提供具体的行动指导",
    "next_step_focus": "给出简单的操作指导，降低执行难度"
  },
  "current_step_completion": {
    "is_completed": true,
    "completion_percentage": 100,
    "reasoning": "三步说服流程已完成，用户已经明确表达尝试意愿"
  },
  "step_adjustment_recommendation": {
    "should_adjust": false,
    "adjustment_type": "none",
    "reasoning": "已达到退出条件，无需再调整步骤计划"
  },
  "strategy_prompt": "【沟通策略】\n- 语言风格：肯定用户的决定（用户喜欢被认可），用'太好了'来强化\n- 例子选择：不需要新例子，直接给出操作指导\n- 共鸣建立：认可用户的开放态度\n- 引导策略：给出简单的第一步行动指导（符合用户实践型学习风格），降低执行难度"
}
```

### 模拟LLM输出（主线A - 第3轮）

```json
{
  "response": {
    "咨询师": "太好了！你愿意尝试，这就是很大的进步。这样吧，今天回去后，如果遇到什么让你情绪波动的事情，就用手机备忘录记下来：1）发生了什么？2）你当时想了什么？3）你有什么感受？就这三个问题。下次我们见面的时候，你可以给我看看，我们一起分析分析。你觉得怎么样？"
  },
  "exit": true,
  "exit_reason": "用户接受度75分，达到退出阈值70分，且明确表达了尝试意愿（'我试试吧'），说服成功",
  "risk_screening": {
    "urgent_risk_detected": false,
    "risk_type": null
  }
}
```

**规则引擎判断**：
```typescript
// 来访者反应评估
const assessment = {
  acceptance_level: 75,
  resistance_score: 2,
  expressed_willingness: true,
  rounds: 3
};

// 执行退出规则
// 规则1: acceptance_level >= 70 AND expressed_willingness == true → 满足！（75 >= 70 且 expressed_willingness = true）
// 结果: exit

// 主线A的LLM判断作为兜底，结果一致：exit = true
```

**系统最终决策**: 规则引擎判断退出，主线A LLM判断也退出，说服成功，结束当前话题。

---

## 📊 总结

### 两个场景的对比

| 维度 | 场景1：介绍ABC模型 | 场景2：说服尝试思维记录 |
|------|-------------------|----------------------|
| **目标** | 知识传递 | 行为改变（说服） |
| **用户特点** | 逻辑思维强，学习意愿高 | 具体思维，容易抗拒 |
| **主要挑战** | 确保理解深度 | 降低抗拒，建立信任 |
| **策略重点** | 用例子深化理解，引导应用 | 强调简单性，展示价值，降低承诺成本 |
| **退出标准** | 理解度 >= 80 | 接受度 >= 70 |
| **关键指标** | understanding_level | resistance_score, acceptance_level |

### 三条线的协同工作

1. **主线A（执行层 - 核心对话引擎）**:
   - ✅ **职责**：执行业务逻辑，生成回复，判断退出
   - ✅ **执行频率**：每轮必执行，2秒响应（优化后）
   - ✅ **任务数量**：2个任务（执行业务逻辑 + 判断退出）
   - ✅ **输出**：`response` + `exit` + `exit_reason` + `risk_screening`
   - ✅ **特点**：专注业务逻辑，注意力集中，提示词精简（~300 tokens）

2. **支线B（分析层 - 深度评估与策略规划）**:
   - ✅ **职责**：执行评估维度，输出结构化评估结果，生成沟通策略，并管理步骤计划
   - ✅ **执行频率**：每2-3轮执行一次，5-10秒响应
   - ✅ **评估维度**：由脚本定义（understanding_level, emotional_state, resistance_score, has_questions等）
   - ✅ **输出**：`assessment` + `assessment_summary` + `progress_summary` + `strategy_steps` + `current_step_completion` + `step_adjustment_recommendation` + `strategy_prompt`
   - ✅ **特点**：深度分析，输出高质量评估，独占用户画像，对步骤执行进行智能监督与调整

3. **支线C（监控层 - 风险监控与干预）**:
   - ✅ **职责**：持续监控风险信号，评估风险等级，提供干预建议
   - ✅ **执行频率**：每轮执行，低优先级，3-5秒响应
   - ✅ **输出**：`risk_signals` + `risk_level` + `risk_assessment` + `intervention_recommendation`
   - ✅ **特点**：独立运行，不阻塞主线A

4. **规则引擎（框架层 - 确定性判断）**:
   - ✅ **职责**：来访者反应评估，执行脚本定义的退出规则
   - ✅ **执行频率**：每轮执行，毫秒级响应
   - ✅ **特点**：确定性判断，零成本，主线A的LLM判断作为兜底

### 变量替换的两层系统

1. **脚本层变量** `{变量名}`:
   - 由ActionContext提供
   - 例如：`{user_message}`, `{chat}`, `{task}`

2. **系统层变量** `{%变量名%}`:
   - 由系统配置提供
   - 例如：`{%time%}`, `{%who%}`, `{%user%}`, `{%教育背景%}`, `{%strategy_prompt%}`

---

