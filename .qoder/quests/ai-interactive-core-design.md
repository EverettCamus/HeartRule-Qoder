# AI智能交互核心功能设计

## 一、设计背景与价值

### 1.1 为什么现在最值得做

会话执行的"心脏"已经在跳动，具备完整的执行链路基础：

**现有能力基础**
- DefaultSessionApplicationService 建立了完整执行链路（initializeSession / processUserInput → ScriptExecutor.executeSession）
- ExecutionState 拥有 status + currentPhaseIdx/currentTopicIdx/currentActionIdx 位置追踪
- variableStore 已引入分层存储结构，支持 global/session/phase/topic 四级作用域
- ExtendedExecutionPosition 预留了多轮对话与策略引擎的承载点（currentRound/maxRounds/lastActionRoundInfo）
- 已有测试覆盖：variable-extraction.test.ts、variable-migration.test.ts 验证了作用域解析与变量迁移

**DDD视角的价值**
- 本方向直接作用于"咨询会话 + 脚本执行 + LLM编排"的交界处，属于核心域工作
- 符合规则《quest-aligns-with-DDD》要求的架构设计与核心领域逻辑修改场景

### 1.2 设计目标与原则

本设计聚焦三条主线推进AI智能交互核心能力：

1. **高级变量管理机制**：规范化分层存储结构，强化作用域解析与生命周期管理
2. **多轮对话智能终止判断**：基于currentRound/maxRounds + 退出变量标志实现统一终止策略
3. **智能策略决策引擎**：结合LLMOrchestrator + LLMDebugInfo实现策略分支选择与元数据记录

**设计原则**
- 保持DDD架构：Application层负责输入输出与状态包装，引擎层完成策略和LLM编排
- 可追踪性：所有决策点（变量来源、终止原因、策略选择）均记录到metadata
- 最小变更：优先扩展现有结构（如metadata），避免破坏性修改

---

## 二、高级变量管理机制设计

### 2.1 现状分析

**已有能力**
- 分层存储结构：variableStore 支持 global/session/phase/topic 四级作用域
- VariableScopeResolver 提供作用域解析：determineScope / setVariable / resolveVariable
- 优先级查找：topic > phase > session > global
- 类型推断与元数据：VariableValue 包含 value/type/lastUpdated/source

**存在问题**
- variableStore 结构 shape 未固定，存在 any 使用场景
- ai_ask 输出变量与作用域映射逻辑分散，缺乏统一规范
- 变量生命周期（创建/更新/销毁）缺少明确的管理策略
- 跨作用域变量访问规则未在领域层显式建模

### 2.2 设计方案

#### 2.2.1 规范 VariableStore 结构

**目标**：消除 any 类型，固定 shape 为强类型结构

```
VariableStore 结构定义：
  - global: Record<string, VariableValue>
    · 生命周期：跨会话持久化
    · 适用场景：用户基础属性、配置常量
  
  - session: Record<string, VariableValue>
    · 生命周期：会话级别
    · 适用场景：用户身份、会话元数据、累积变量
  
  - phase: Record<phaseId, Record<string, VariableValue>>
    · 生命周期：阶段级别
    · 适用场景：阶段临时状态、中间结果
  
  - topic: Record<topicId, Record<string, VariableValue>>
    · 生命周期：话题级别
    · 适用场景：话题内的临时数据、输出变量

VariableValue 元数据扩展：
  - value: unknown（实际值）
  - type: string（推断类型：string/number/boolean/array/object/null）
  - lastUpdated: string（ISO时间戳）
  - source: string（来源标识：actionId或'migrated'）
  - scope: VariableScope（所属作用域）
  - history?: VariableHistoryEntry[]（可选的历史记录）
```

**实现策略**
- 在 VariableScopeResolver 中添加结构验证方法 validateStoreStructure
- createInitialExecutionState 和 restoreExecutionState 保证结构完整性
- 维护"旧 variables → variableStore.session"迁移逻辑的一致性（已有测试覆盖）

#### 2.2.2 强化 ai_ask 输出变量管理

**目标**：规范 output 配置 → 作用域映射流程

**作用域映射规则**
```
ai_ask 输出变量的作用域确定顺序：
  1. 检查 VariableDefinition（在 declare 中预定义）
     - 若存在定义：使用定义中的 scope 字段
     - 若未定义：执行步骤2
  
  2. 根据变量语义推断作用域
     - 若变量名包含"全局"/"用户基础"等关键词 → global
     - 若变量名包含"会话"/"累积"等关键词 → session
     - 默认情况 → topic（与当前 topicId 绑定）
  
  3. 通过 VariableScopeResolver.determineScope 统一执行
```

**输出变量自动注册机制**
```
AiAskAction 执行时自动注册输出变量到 topic 作用域：
  - 遍历 output 配置中的 get 字段
  - 若 VariableScopeResolver 中不存在该变量定义
  - 自动调用 setVariableDefinition 注册为 topic 级别
  - 记录日志："Auto-registered variable {varName} in topic scope"
```

**E2E测试场景扩展**
- 场景1：ai_ask 未声明输出变量，自动注册到 topic
- 场景2：ai_ask 引用已声明的 session 级别变量，正确写入 session
- 场景3：ai_ask 多轮对话中，每轮提取的变量均正确存储（已有回归测试覆盖）
- 场景4：复杂 CBT 场景（抑郁评分、情绪记录）的变量提取与作用域验证

#### 2.2.3 变量生命周期管理策略

**作用域生命周期规则**
```
Global 作用域：
  - 创建：项目初始化时从脚本 global.yaml 加载
  - 更新：极少更新，仅配置变更时
  - 销毁：项目卸载时

Session 作用域：
  - 创建：会话初始化（createInitialState）
  - 更新：ai_ask/ai_say/think 等动作产生
  - 销毁：会话结束或超时

Phase 作用域：
  - 创建：进入 phase 时，在 variableStore.phase[phaseId] 创建命名空间
  - 更新：phase 内的动作产生
  - 销毁：离开 phase 时删除 variableStore.phase[phaseId]

Topic 作用域：
  - 创建：进入 topic 时，在 variableStore.topic[topicId] 创建命名空间
  - 更新：topic 内的动作产生
  - 销毁：离开 topic 时删除 variableStore.topic[topicId]
```

**作用域清理时机**
- ScriptExecutor 在切换 phase/topic 时触发清理逻辑
- 清理时记录 metadata：cleanedScopes / cleanedVariables
- 保留 session 级别的关键变量（如用户基础信息）

**跨作用域访问规则**
```
读取规则（优先级查找）：
  topic → phase → session → global

写入规则（严格作用域隔离）：
  - 只能写入变量定义指定的作用域
  - 若未定义，写入当前最小作用域（topic）
  - 禁止跨作用域覆盖（如 topic 变量覆盖 global）

变量覆盖规则：
  - 同名变量允许在不同作用域共存
  - 查找时按优先级返回，不删除低优先级值
  - 仅在作用域销毁时删除对应变量
```

### 2.3 可观测性与调试支持

**变量提取追踪**
```
在 ExecutionState.metadata 中记录变量操作：
  - variableOperations: [
      {
        actionId: string,
        operation: 'extract' | 'update' | 'delete',
        variableName: string,
        scope: VariableScope,
        value: unknown,
        timestamp: string
      }
    ]
```

**作用域状态快照**
```
在每个 topic/phase 结束时，记录作用域快照到 metadata：
  - scopeSnapshots: {
      topicId: { variables: Record<string, unknown> },
      phaseId: { variables: Record<string, unknown> }
    }
```

**调试信息暴露**
- 前端变量气泡显示：变量名/值/作用域/来源
- 调试面板显示：变量提取历史、作用域切换记录

---

## 三、多轮对话智能终止判断设计

### 3.1 现状分析

**已有能力**
- BaseAction 支持 currentRound / maxRounds 轮次追踪
- ai_ask 已实现多轮追问逻辑（executeMultiRound）
- ExtendedExecutionPosition 已预留 currentRound/maxRounds 承载点
- buildResponse 方法已从 executionState.metadata.lastActionRoundInfo 提取轮次信息

**存在问题**
- 各 Action 的退出判定逻辑分散，缺乏统一的执行结果与元数据结构，调用方难以在会话层面统一感知退出状态
- 退出条件（exit_criteria）未标准化，仅在模板提示词中隐式处理，交互型 Action 难以复用配置模式
- SessionExecutionResponse.executionStatus 未明确区分等待输入 / 正常完成 / 出错等状态，也无法表达退出/中止的原因
- 缺少退出/中止原因的元数据记录（如 metadata.exitReason / metadata.lastActionExitInfo），调试与可观测性不足

### 3.2 设计方案

#### 3.2.1 统一执行结果结构与推荐退出判定模式

统一退出机制**仅适用于具备多轮对话语义的交互型 Action**，按动作类型差异化处理：
- 交互型动作：如 ai_ask、ai_say、fill_form，需结合轮次、理解度、表单完整性等信号进行退出判断；
- 内部/一次性动作：如 ai_think、use_skill、show_pic 等，仅需完成单轮执行与结果状态标记，不参与多轮退出决策流程。

在此基础上，引入按 Action 类型配置的 ExitPolicy，每个 Action 显式声明是否启用多轮退出（supportsExit）以及启用的判定来源（enabledSources），下文的四级优先级仅对 supportsExit === true 的交互型 Action 生效。

**终止决策流程**
```
终止判定优先级（从高到低，仅对 supportsExit === true 的交互型 Action 生效）：
  1. 硬性上限检查（max_rounds）
     - currentRound >= maxRounds → 强制终止
     - exitReason: "达到最大轮次限制"
  
  2. 退出标志检查（EXIT 变量）
     - LLM 输出的 EXIT 字段 === 'true' → 终止
     - exitReason: 提取 exit_reason 或 BRIEF 字段
  
  3. 退出条件评估（exit_criteria）
     - 基于 understanding_level / has_questions 等维度
     - exitReason: "满足退出条件：{具体条件}"
  
  4. LLM 建议（llm_suggestion）
     - 主线 A 输出 should_exit: true → 建议终止
     - exitReason: 记录 LLM 给出的原因
```

**Action 类型差异化约定**
- ai_ask / ai_say / fill_form 等交互型动作：supportsExit = true，并在各自配置中声明启用的判定来源（如 max_rounds、exit_flag、exit_criteria、llm_suggestion 的子集）；
- ai_think / use_skill / show_pic 等内部或一次性动作：默认 supportsExit = false，不要求配置 exit_criteria，不写入多轮退出历史，仅记录普通执行结果。

**Action 层统一接口（引擎视角）**

从调用方（ScriptExecutor / SessionApplicationService）视角看，所有 Action 只需对外暴露统一的执行结果语义：本轮执行结束后是继续等待输入、已经完成，还是发生错误；退出/中止的复杂判定过程由各 Action 自行负责。

在此基础上，交互型 Action 可选地在内部实现一个辅助方法 evaluateExitCondition，用于生成退出相关元数据并复用四级优先级判定流程：
```
BaseAction 可选地提供方法 evaluateExitCondition（仅供交互型 Action 内部使用）：
  - 输入：context（包含 variableStore 和 conversationHistory）
  - 输出：ExitDecision
    {
      should_exit: boolean,
      reason: string,
      decision_source: 'max_rounds' | 'exit_flag' | 'exit_criteria' | 'llm_suggestion'
    }
  
  - 推荐模式：对 supportsExit === true 的交互型 Action，按启用的判定来源顺序执行上述四步检查；内部逻辑可按动作类型裁剪或扩展
  - 该决策结果仅用于组装本 Action 的退出相关元数据（如 ActionExecutionResult.exitInfo、metadata.exitDecision），ScriptExecutor 不直接依赖 evaluateExitCondition
```

**ScriptExecutor 层执行结果整合**
```
在 continueAction 中仅消费各 Action 返回的执行结果（如 completed / waiting_input / error 等状态）：
  - 根据执行结果的 status 设置 action.completed 与 SessionExecutionResponse.executionStatus
  - 若执行结果或 metadata 中包含退出/中止信息（如 exitReason / lastActionExitInfo），写入 executionState.metadata 便于前端与调试使用
  - 对于 ai_say 等复杂交互型 Action，其内部可按 `docs/design/thinking/ai_say智能实现机制.md` 中的三层 LLM + 规则层逻辑生成退出决策，ScriptExecutor 不介入具体判定过程
```

#### 3.2.2 退出条件（exit_criteria）标准化

**配置结构定义**
```
exit_criteria 在脚本配置中的结构（作为交互型 Action 的通用 superset，由 action_type 对应的子类型约束实际可用字段）：
  {
    understanding_threshold: number,  // 理解度阈值（0-100）
    has_questions: boolean,          // 是否允许有疑问时退出
    min_rounds: number,              // 最小轮次要求
    custom_conditions: [              // 自定义条件数组
      {
        variable: string,             // 变量名（如"用户情绪"）
        operator: '==' | '!=' | '>' | '<' | 'contains',
        value: unknown                // 比较值
      }
    ]
  }
```

为避免将理解度等字段强制应用于所有动作类型，exit_criteria 在脚本 schema 中将建模为基于 action_type 的 discriminated union，例如：AiAskExitCriteria / AiSayExitCriteria / FillFormExitCriteria / GenericExitCriteria；其中 ai_think 等内部动作不配置 exit_criteria。

**评估执行流程**
```
evaluateExitCondition 执行 exit_criteria 评估：
  1. 从 variableStore 读取 understanding_level（若存在）
  2. 检查 understanding_level >= understanding_threshold
  3. 检查 has_questions 条件（从 LLM 输出或变量中获取）
  4. 检查 currentRound >= min_rounds
  5. 遍历 custom_conditions，逐条评估
  6. 所有条件满足 → should_exit = true
```

**LLM 输出与退出条件的映射**
```
ai_ask 模板提示词中引导 LLM 输出：
  - EXIT: 'true' / 'false'
  - exit_reason: string（描述为何建议退出）
  
ai_say 模板提示词中引导 LLM 输出：
  - assessment.understanding_level: number
  - assessment.has_questions: boolean
  - should_exit: boolean
```

#### 3.2.3 元数据记录与可观测性

**executionState.metadata 扩展**
```
新增字段：
  - lastActionRoundInfo: {
      actionId: string,
      currentRound: number,
      maxRounds: number,
      exitDecision?: ExitDecision
    }
  
  - exitHistory: [
      {
        actionId: string,
        round: number,
        decision: ExitDecision,
        timestamp: string
      }
    ]
```

**SessionExecutionResponse 扩展**
```
在 buildResponse 中填充：
  - executionStatus: 明确区分 'completed' | 'waiting_input' | 'error'
  - position.currentRound / position.maxRounds
  - metadata.exitReason（终止原因的用户友好描述）
  - metadata.exitDecisionSource（决策来源标识）
```

**调试信息暴露**
- 前端调试面板显示：每轮的终止判定结果、决策依据
- LLMDebugInfo 中记录：prompt 中包含的退出条件、LLM 输出的 EXIT 字段

#### 3.2.4 差异化退出策略的实施计划

- **分层模型调整**：在 BaseAction 中引入 ExitPolicy / supportsExit / enabledSources 等抽象，区分交互型动作与内部动作；ai_ask / ai_say / fill_form 等交互型动作声明自己的 ExitPolicy，ai_think / use_skill / show_pic 默认 supportsExit = false。
- **引擎层整合**：在 ScriptExecutor.continueAction 中先读取当前 Action 的 ExitPolicy，仅对 supportsExit === true 的动作执行统一优先级流程，并将决策结果写入 exitHistory 和 metadata.exitDecision。
- **配置与 Schema 演进**：调整脚本 schema，将 exit_criteria 建模为按 action_type 区分的 discriminated union，并为 ai_think 等内部动作在配置层明确声明“无需退出条件”。
- **测试与回归**：为 ai_ask / ai_say / fill_form 分别补充多轮退出测试用例；为 ai_think / use_skill / show_pic 增加“无 exit_criteria 仍可正常执行且不写入 exitHistory”的回归测试，确保差异化退出策略行为稳定。

---

## 四、智能策略决策引擎设计

### 4.1 现状分析

**已有能力**
- LLMOrchestrator 支持多提供者管理、批量调用、上下文共享
- LLMDebugInfo 记录每次 LLM 调用的 prompt/response/metadata
- ai_say 提示词模板支持两层变量替换（脚本变量 + 系统变量）
- 需求文档中描述了支线 B 端到端生成策略提示词（strategy_prompt）的设想

**设计目标**
- 避免硬编码规则映射：不维护"用户特征 → 策略模板"的规则引擎
- 端到端策略生成：LLM 综合用户画像、对话历史、情境生成策略建议
- 保持领域层纯净：策略引擎作为领域服务，不直接依赖基础设施
- 可观测性：记录策略生成的推理过程

### 4.2 设计方案

#### 4.2.1 策略引擎架构定位

**DDD 视角的分层**
```
Application 层（SessionApplicationService）：
  - 职责：输入输出与状态包装
  - 不涉及策略生成逻辑
  - 调用 Engine 层返回的结果

Engine 层（StrategyDecisionEngine）：
  - 职责：策略生成与决策
  - 输入：用户画像变量、对话历史、当前情境
  - 输出：strategy_prompt（自然语言策略建议）
  - 通过 LLMOrchestrator 调用 LLM

Domain 层（领域服务）：
  - StrategyContext 值对象：封装策略决策的输入上下文
  - StrategyRecommendation 值对象：封装策略建议结果
```

#### 4.2.2 策略上下文（StrategyContext）设计

**StrategyContext 结构**
```
策略上下文封装策略决策所需的全部输入：
  - userProfile: 用户画像变量（从 variableStore 提取）
    {
      educationLevel: string,
      age: number,
      psychologyKnowledge: number,
      learningStyle: string,
      currentEmotion: string,
      cognitiveAbility: number
    }
  
  - conversationHistory: 对话历史（最近 N 轮）
    Array<{ role: string, content: string }>
  
  - currentSituation: 当前情境
    {
      topicDescription: string,
      currentPhase: string,
      progressSummary: string,
      understandingTrend: string
    }
  
  - actionConfig: 当前动作配置
    {
      actionType: string,
      subtype?: string,  // ai_say 的场景类型（如 introduce_concept）
      maxRounds: number,
      exitCriteria: object
    }
```

**上下文构建策略**
- 由 Action（如 AiSayAction/AiAskAction）在执行前构建 StrategyContext
- 从 ActionContext.variableStore 提取用户画像变量（按预定义字段名）
- 从 ActionContext.conversationHistory 截取最近 10-20 轮对话
- 从 ActionContext.metadata 提取进度摘要（如 progressSummary）

#### 4.2.3 策略决策引擎（StrategyDecisionEngine）设计

**引擎接口定义**
```
StrategyDecisionEngine 提供方法：
  - generateStrategyPrompt(context: StrategyContext): Promise<StrategyRecommendation>
    · 输入：策略上下文
    · 输出：策略建议（包含推理过程）
```

**StrategyRecommendation 结构**
```
策略建议结果包含：
  - strategyPrompt: string
    · 自然语言的策略建议，直接注入主线 A 提示词
    · 示例：
      """
      【沟通策略建议】
      1. 语言风格：半正式、中等复杂度、委婉
         理由：用户本科学历，但当前情绪低落，需要温和表达
      
      2. 例子类型：具体的个人经历例子
         理由：用户学习偏好是具体案例，抽象概念理解较慢
      
      3. 共鸣策略：高强度情绪验证 + 普遍化
         理由：用户表达强烈的孤独感，需要先验证情绪再普遍化
      """
  
  - reasoning: object
    · 策略生成的推理过程（用于可观测性）
    {
      userStateAnalysis: string,
      keyConsiderations: string[],
      strategyRationale: string
    }
```

**策略生成提示词模板**
```
支线 B 策略生成模板（存储在 config/prompts/strategy-generation）：
  """
  你是 CBT 咨询策略专家，负责生成个性化的沟通策略建议。
  
  【用户画像】
  - 教育程度：{educationLevel}
  - 年龄：{age}
  - 心理学知识：{psychologyKnowledge}
  - 学习偏好：{learningStyle}
  - 当前情绪：{currentEmotion}
  - 认知能力：{cognitiveAbility}
  
  【对话历史】
  {conversationHistory}
  
  【当前情境】
  - 话题：{topicDescription}
  - 阶段：{currentPhase}
  - 进度：{progressSummary}
  
  【任务】
  基于以上信息，生成四个维度的沟通策略建议：
  1. 语言风格（正式程度、复杂度、直接性）
  2. 例子类型（抽象程度、来源、情感倾向）
  3. 共鸣策略（主要策略、强度）
  4. 引导方式（风格、指导性）
  
  【输出格式】
  {
    "reasoning": {
      "userStateAnalysis": "用户状态综合分析",
      "keyConsiderations": ["考虑因素1", "考虑因素2"],
      "strategyRationale": "策略选择理由"
    },
    "strategyPrompt": "自然语言的策略建议"
  }
  """
```

**引擎实现要点**
- 通过 PromptTemplateManager 加载策略生成模板
- 两层变量替换：脚本变量（用户画像）+ 系统变量（对话历史/情境）
- 调用 LLMOrchestrator.generateText 获取策略建议
- 解析 JSON 响应，构造 StrategyRecommendation
- 记录调用到 LLMDebugInfo（prompt + response + metadata）

#### 4.2.4 策略注入主线 A 流程

**ai_say 场景集成**
```
AiSayAction 执行流程扩展：
  1. 首轮执行时（currentRound === 0）
     - 构建 StrategyContext
     - 调用 StrategyDecisionEngine.generateStrategyPrompt
     - 将 strategyPrompt 存入 context.metadata.strategyPrompt
  
  2. 后续轮次
     - 从 context.metadata.strategyPrompt 读取策略建议
     - 若对话情境变化显著，重新生成策略（可选）
  
  3. 主线 A 提示词模板
     - 添加变量占位符 {%strategy_prompt%}
     - 在模板替换时注入策略建议
```

**ai_ask 场景集成**
```
AiAskAction 执行流程扩展：
  1. 多轮追问模式（executeMultiRound）
     - 在生成问题前，调用策略引擎获取策略建议
     - 策略建议指导如何调整提问方式（如简化语言、增加共鸣）
  
  2. 主线 A 提示词模板
     - 在 multi-round-ask 模板中注入 {%strategy_prompt%}
     - LLM 综合策略建议生成下一轮问题
```

#### 4.2.5 策略引擎的可观测性

**metadata 记录**
```
executionState.metadata 扩展：
  - strategyDecisions: [
      {
        actionId: string,
        round: number,
        context: StrategyContext,
        recommendation: StrategyRecommendation,
        timestamp: string
      }
    ]
```

**LLMDebugInfo 扩展**
```
策略生成调用记录：
  - promptType: 'strategy_generation'
  - input: { userProfile, conversationHistory, currentSituation }
  - output: { strategyPrompt, reasoning }
  - latency: number（策略生成耗时）
```

**调试信息暴露**
- 前端调试面板显示：策略生成的推理过程、策略建议内容
- 支持查看历史策略决策记录
- 可对比不同策略下的用户反馈（A/B 测试基础）

---

## 五、实施策略与优先级

### 5.1 渐进式实施路径

**阶段 1：高级变量管理机制（基础能力）**
- 优先级：P0
- 理由：其他功能依赖稳固的变量管理基础
- 任务拆解：
  1. 规范 VariableStore 结构，消除 any 类型
  2. 强化 ai_ask 输出变量自动注册
  3. 实现作用域生命周期管理与清理
  4. 添加 E2E 测试覆盖（复杂 CBT 场景）
- 预期产出：variableStore 结构稳定，变量操作可追踪

**阶段 2：多轮对话智能终止判断（核心交互）**
- 优先级：P0
- 理由：直接影响用户体验，需要标准化终止逻辑
- 任务拆解：
  1. 在 BaseAction 中实现 evaluateExitCondition
  2. 标准化 exit_criteria 配置结构
  3. 在 ScriptExecutor 中整合终止决策
  4. 扩展 metadata 记录终止原因与决策依据
  5. 前端调试面板显示终止判定信息
- 预期产出：统一的终止决策流程，可观测的退出原因

**阶段 3：智能策略决策引擎（智能化增强）**
- 优先级：P1
- 理由：提升交互智能度，但可在前两阶段完成后迭代
- 任务拆解：
  1. 定义 StrategyContext 和 StrategyRecommendation 值对象
  2. 实现 StrategyDecisionEngine（领域服务）
  3. 创建策略生成提示词模板
  4. 在 AiSayAction 中集成策略引擎
  5. 扩展 LLMDebugInfo 记录策略生成信息
- 预期产出：端到端的策略生成能力，可观测的策略推理过程

### 5.2 兼容性与风险控制

**向后兼容策略**
- 变量管理：保留"旧 variables → variableStore.session"迁移逻辑
- 多轮对话：已存在的 ai_ask 无需修改配置，默认行为不变
- 策略引擎：作为可选能力，未配置时不触发策略生成

**风险缓解措施**
- 变量管理：增加结构验证，启动时检测 variableStore 完整性
- 终止判定：兜底机制（max_rounds 硬性上限）防止无限循环
- 策略引擎：LLM 调用失败时回退到静态提示词模板

**测试覆盖要求**
- 单元测试：VariableScopeResolver / StrategyDecisionEngine 核心逻辑
- 集成测试：ScriptExecutor 与 Action 的协同
- E2E 测试：完整的 CBT 会话流程（评估性会谈）

---

## 六、成功标准与验收条件

### 6.1 高级变量管理机制

**功能验收**
- [ ] variableStore 结构固定为强类型，无 any 使用
- [ ] ai_ask 输出变量自动注册到 topic 作用域
- [ ] 作用域生命周期管理正确（phase/topic 切换时清理）
- [ ] 变量操作记录到 metadata.variableOperations

**测试验收**
- [ ] 通过所有现有变量测试（variable-extraction.test.ts, variable-migration.test.ts）
- [ ] 新增 E2E 测试覆盖 CBT 场景（抑郁评分、情绪记录、关系评估）
- [ ] 前端变量气泡正确显示变量名/值/作用域/来源

### 6.2 多轮对话智能终止判断

**功能验收**
- [ ] BaseAction.evaluateExitCondition 实现四级终止判定
- [ ] exit_criteria 配置标准化，支持 understanding_threshold / has_questions / custom_conditions
- [ ] executionState.metadata 记录 lastActionRoundInfo 和 exitHistory
- [ ] SessionExecutionResponse 暴露 exitReason 和 exitDecisionSource

**测试验收**
- [ ] 单元测试覆盖 evaluateExitCondition 各分支逻辑
- [ ] 集成测试验证 ScriptExecutor 终止决策整合
- [ ] 前端调试面板显示每轮的终止判定结果

### 6.3 智能策略决策引擎

**功能验收**
- [ ] StrategyDecisionEngine 实现策略生成
- [ ] StrategyContext 正确提取用户画像变量和对话历史
- [ ] StrategyRecommendation 包含 strategyPrompt 和 reasoning
- [ ] AiSayAction 在首轮执行时调用策略引擎
- [ ] 主线 A 提示词模板注入 {%strategy_prompt%}

**测试验收**
- [ ] 单元测试验证 StrategyDecisionEngine 端到端流程
- [ ] Mock LLM 响应测试策略生成逻辑
- [ ] E2E 测试验证策略建议对对话质量的影响（需人工评估）
- [ ] LLMDebugInfo 正确记录策略生成的 prompt 和 response

---

## 七、附录

### 7.1 关键概念术语表

| 术语 | 定义 |
|------|------|
| VariableStore | 分层变量存储结构，支持 global/session/phase/topic 四级作用域 |
| VariableScopeResolver | 变量作用域解析器，负责变量的读取、写入和作用域确定 |
| ExecutionState | 脚本执行状态，包含位置信息、变量存储、对话历史、元数据 |
| ExtendedExecutionPosition | 扩展的执行位置信息，包含 currentRound/maxRounds 等多轮对话字段 |
| exit_criteria | 退出条件配置，定义动作何时应终止（如理解度阈值、最小轮次） |
| ExitDecision | 终止决策结果，包含 should_exit/reason/decision_source |
| StrategyContext | 策略上下文，封装策略决策所需的用户画像、对话历史、当前情境 |
| StrategyRecommendation | 策略建议结果，包含自然语言的策略提示词和推理过程 |
| StrategyDecisionEngine | 策略决策引擎，基于 LLM 端到端生成沟通策略建议 |

### 7.2 参考文档与代码位置

**现有代码参考**
- 变量作用域解析：`packages/core-engine/src/engines/variable-scope/variable-scope-resolver.ts`
- 脚本执行器：`packages/core-engine/src/engines/script-execution/script-executor.ts`
- ai_ask 动作执行器：`packages/core-engine/src/actions/ai-ask-action.ts`
- ai_say 动作执行器：`packages/core-engine/src/actions/ai-say-action.ts`
- LLM 编排引擎：`packages/core-engine/src/engines/llm-orchestration/orchestrator.ts`

**测试参考**
- 变量提取测试：`packages/core-engine/test/variable-extraction.test.ts`
- 变量迁移测试：`packages/core-engine/test/variable-migration.test.ts`
- ai_ask 多轮对话回归测试：`packages/core-engine/test/ai-ask-incomplete-action.test.ts`

**需求文档参考**
- Heart Rule 脚本定义需求：`docs/design/thinking/Heart Rule脚本定义需求.md`
- HeartRule 引擎能力需求：`docs/design/thinking/HeartRule引擎能力需求.md`
- ai_say 智能实现机制：`docs/design/thinking/ai_say智能实现机制.md`

### 7.3 设计决策记录

**决策 1：避免规则映射，采用端到端策略生成**
- 背景：传统方案维护"用户特征 → 策略模板"规则引擎，成本高、灵活性差
- 决策：采用 Andrew Ng 的端到端 LLM 策略生成理念，让 LLM 综合推理
- 依据：LLM 擅长语义理解和综合考虑多因素，规则引擎擅长确定性控制
- 影响：减少硬编码规则，提升灵活性，但需要良好的提示词设计

**决策 2：终止判定采用四级优先级策略**
- 背景：终止逻辑分散在各 Action，缺乏统一规范
- 决策：max_rounds > exit_flag > exit_criteria > llm_suggestion
- 依据：硬性上限防止无限循环，显式标志优先于隐式条件，LLM 建议最低优先级
- 影响：保证系统安全性，同时保留灵活性

**决策 3：变量作用域严格隔离，禁止跨作用域覆盖**
- 背景：同名变量在不同作用域共存可能导致混淆
- 决策：允许同名变量在不同作用域共存，但禁止 topic 变量覆盖 global
- 依据：优先级查找机制已保证正确性，严格隔离避免副作用
- 影响：变量管理更清晰，但需要明确的作用域定义规范
