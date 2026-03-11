# 五层架构实现指南

**版本**: 1.0  
**最后更新**: 2026年3月9日  
**基于决策**: [2026-03-09-five-layer-implementation-decisions.md](../decisions/2026-03-09-five-layer-implementation-decisions.md)

---

## 概述

本指南详细描述了HeartRule咨询智能系统五层架构的具体实现机制，聚焦于各层"计划-灵活"平衡的实现方案。本指南面向开发团队和技术架构师，提供具体的技术实现指导。

## 架构总览

```
┌─────────────────────────────────────────────────────┐
│                Consultation层                        │
│  跨会谈战略调整 · 治疗计划演进 · 长期模式识别        │
├─────────────────────────────────────────────────────┤
│                 Session层                            │
│  会谈结构守护 · 时间策略执行 · 进展监控              │
├─────────────────────────────────────────────────────┤
│                 Phase层                              │
│  意识侦察系统 · 咨询技能调用 · 话题队列调度          │
├─────────────────────────────────────────────────────┤
│                 Topic层                              │
│  目标进展监控 · 动态队列调整 · 行动方案优化          │
├─────────────────────────────────────────────────────┤
│                 Action层                             │
│  主线程+监控线程 · 原子执行单元 · 质量门禁           │
└─────────────────────────────────────────────────────┘
```

## 1. Action层实现机制

### 1.1 核心设计：双线程模型

**架构图**:

```
用户输入
    ↓
[监控线程] ← 异步启动
    │       检查：安全性、相关性、专业性
    ↓       评分阈值 > 0.8
[主线程] ────┐
    │       │
    ↓       ↓
生成响应  调整建议
    │       │
    ↓       ↓
用户输出  策略优化
```

### 1.2 动作类型定义与Scene Solution方案

**设计演进**：从单一动作类型配置演进为场景化解决方案框架，支持每个action_type有多个场景化模板方案，通过智能预处理接口实现精准匹配。

**scene_solution架构**：每个action_type可以定义多个scene_solution，每个scene_solution针对特定对话场景进行优化。LLM根据action的目标提示词智能分类，选择最合适的scene_solution。

```yaml
# Action类型配置示例（支持scene_solution）
action_types:
  ai_say:
    description: '向用户传达信息（方案说服、知识介绍等）'
    # 向后兼容：原有配置作为默认scene_solution
    main_prompt_template: 'templates/actions/ai_say/main.md'
    monitor_prompt_template: 'templates/actions/ai_say/monitor.md'
    monitor_frequency: 'low' # 低频监控

    # 场景化解决方案（scene_solutions）
    scene_solutions:
      - id: 'advice'
        name: '建议方案'
        description: '提供具体建议或解决方案'
        category: 'advice'
        main_prompt_template: 'templates/actions/ai_say/scenes/advice/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/advice/monitor.md'
        monitor_frequency: 'medium'
        classification_prompt: '这是一个提供建议或解决方案的场景'

      - id: 'knowledge'
        name: '介绍知识'
        description: '介绍专业知识或概念'
        category: 'knowledge'
        main_prompt_template: 'templates/actions/ai_say/scenes/knowledge/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/knowledge/monitor.md'
        monitor_frequency: 'low'
        classification_prompt: '这是一个介绍专业知识或概念的场景'

      - id: 'persuasion'
        name: '说服引导'
        description: '说服用户接受观点或采取行动'
        category: 'persuasion'
        main_prompt_template: 'templates/actions/ai_say/scenes/persuasion/main.md'
        monitor_prompt_template: 'templates/actions/ai_say/scenes/persuasion/monitor.md'
        monitor_frequency: 'high'
        classification_prompt: '这是一个说服用户接受观点或采取行动的场景'

  ai_ask:
    description: '收集用户信息，存入变量供后续引用'
    # 向后兼容：原有配置作为默认scene_solution
    main_prompt_template: 'templates/actions/ai_ask/main.md'
    monitor_prompt_template: 'templates/actions/ai_ask/monitor.md'
    monitor_frequency: 'high' # 高频监控
    variable_extraction:
      method: 'llm_extraction'
      schema: 'schemas/user_info.json'

    # 场景化解决方案（scene_solutions）
    scene_solutions:
      - id: 'open_question'
        name: '开放式提问'
        description: '引导用户自由表达，收集丰富信息'
        category: 'open_question'
        main_prompt_template: 'templates/actions/ai_ask/scenes/open_question/main.md'
        monitor_prompt_template: 'templates/actions/ai_ask/scenes/open_question/monitor.md'
        monitor_frequency: 'high'
        classification_prompt: '这是一个开放式提问，引导用户自由表达'

      - id: 'closed_question'
        name: '封闭式提问'
        description: '获取具体信息或确认细节'
        category: 'closed_question'
        main_prompt_template: 'templates/actions/ai_ask/scenes/closed_question/main.md'
        monitor_prompt_template: 'templates/actions/ai_ask/scenes/closed_question/monitor.md'
        monitor_frequency: 'medium'
        classification_prompt: '这是一个封闭式提问，获取具体信息或确认细节'

  ai_think:
    description: '对信息进行加工分析，结果存入变量'
    main_prompt_template: 'templates/actions/ai_think/main.md'
    monitor_prompt_template: 'templates/actions/ai_think/monitor.md'
    monitor_frequency: 'medium'
    output_variables: ['analysis_result', 'insights']

  ai_draw:
    description: '根据用户描述进行绘画输出'
    main_prompt_template: 'templates/actions/ai_draw/main.md'
    monitor_prompt_template: 'templates/actions/ai_draw/monitor.md'
    monitor_frequency: 'medium'

  ai_form:
    description: '智能引导用户填表，提供提示帮助'
    main_prompt_template: 'templates/actions/ai_form/main.md'
    monitor_prompt_template: 'templates/actions/ai_form/monitor.md'
    monitor_frequency: 'high'
    guidance_steps: 3 # 最多3步引导
```

**字段说明**：

- `id`: 场景唯一标识符
- `name`: 场景名称（中文）
- `description`: 场景描述
- `category`: 场景分类（用于智能分类）
- `main_prompt_template`: 主提示词模板路径
- `monitor_prompt_template`: 监控提示词模板路径
- `monitor_frequency`: 监控频率（always, high, medium, low, on_error, periodic, first_round_only, never）
- `classification_prompt`: 分类提示词（用于LLM智能分类）

**智能预处理接口**：LLM根据action的目标提示词进行分类，选择最合适的scene_solution。例如：

- ai_say目标为'提供解决方案建议' → 选择advice场景
- ai_say目标为'介绍专业知识' → 选择knowledge场景
- ai_ask目标为'了解用户感受' → 选择open_question场景
- ai_ask目标为'确认具体信息' → 选择closed_question场景

**实施阶段**：

1. **本期（框架定义）**：定义scene_solution架构，支持手动指定scene_solution
2. **下期（智能选择）**：实现LLM智能分类，自动选择最佳scene_solution

**向后兼容**：现有脚本无需修改，原有action_type配置作为默认scene_solution使用。脚本工程师可逐步采用场景化方案，提升对话质量。

### 1.3 每类Action对应的监控层

**架构设计原则**：

- 每个Action类型（ai_say, ai_ask, ai_think等）都有对应的监控处理器
- 每个Action类型有独立的监控提示词模板
- 监控处理器继承通用基类，共享JSON解析、重试等基础设施
- 监控模板支持两层方案（default/custom）和变量替换

**监控处理器注册表示例**：

```yaml
action_monitor_mapping:
  ai_say:
    monitor_handler: 'AiSayMonitorHandler'
    template_path: 'default/ai_say_monitor_v1.md'
    focus_areas:
      - '用户理解困难检测'
      - '表达优化建议生成'
      - '安全风险评估'

  ai_ask:
    monitor_handler: 'AiAskMonitorHandler'
    template_path: 'default/ai_ask_monitor_v1.md'
    focus_areas:
      - '信息收集障碍识别'
      - '提问策略调整'
      - '用户阻抗处理'

  ai_think:
    monitor_handler: 'AiThinkMonitorHandler' # 待实现
    template_path: 'default/ai_think_monitor_v1.md' # 待创建
    focus_areas:
      - '分析质量评估'
      - '逻辑一致性检查'
      - '洞察深度评估'
```

**监控模板两层方案**：

```
监控模板路径解析优先级：
1. custom/{scheme_name}/{action_type}_monitor_v1.md (自定义方案)
2. default/{action_type}_monitor_v1.md (系统默认)

变量替换支持：
- {{current_round}} - 当前轮次
- {{max_rounds}} - 最大轮次
- {{user_engagement}} - 用户参与度
- {{topic_content}} - 话题内容
- {{action_result}} - Action执行结果
- 以及其他context/metrics中的变量
```

**监控分析流程**：

```
1. Action执行完成后，收集执行metrics和context
2. MonitorOrchestrator根据actionType选择对应的监控处理器
3. 监控处理器调用MonitorTemplateService加载并渲染监控模板
4. 调用监控LLM进行分析，解析JSON结果
5. 根据分析结果生成反馈建议或触发Topic编排
6. 监控反馈注入：将分析结果中的`feedback_for_action`字段存储到`executionState.metadata.latestMonitorFeedback`，并自动注入到下一个Action的LLM提示词中
```

监控反馈机制确保监控分析结果能够影响主流程的执行。当监控LLM识别出优化机会或问题时，会通过`feedback_for_action`字段提供具体的改进建议。这些建议被存储到执行上下文中，并在下一个Action执行时自动注入到LLM提示词中，从而实现监控结果对主流程的实时干预和优化。

**通用监控检查项**（适用于所有Action类型）：

监控检查通过模板文件实现，而非YAML配置。系统使用Markdown模板文件定义监控分析任务，这些模板遵循统一的结构设计。

**模板位置**：`_system/config/default/*_monitor_v1.md`

**当前支持的Action类型**：

- `ai_ask_monitor_v1.md` - 用于ai_ask Action的监控分析
- `ai_say_monitor_v1.md` - 用于ai_say Action的监控分析

**模板设计原则**：

1. **Role定位**：明确监控LLM的角色和职责
2. **输入信息**：提供完整的执行上下文和metrics数据
3. **分析任务**：定义具体的监控分析维度（安全性、相关性、专业性、质量等）
4. **输出格式**：严格JSON格式，包含`score`、`reasoning`、`feedback_for_action`、`strategy_suggestion`等字段
5. **分析示例**：提供示例输入输出，确保LLM理解分析标准
6. **注意事项**：包含实现细节和边界条件说明

**模板内容示例**（ai_ask_monitor_v1.md节选）：

````markdown
# Role定位

你是一个AI咨询会话的监控分析专家，负责评估Action执行的质量和安全性...

# 输入信息

## 执行上下文

- Action类型: ai_ask
- 用户输入: {{user_input}}
- AI回应: {{ai_response}}
  ...

# 分析任务

请从以下维度分析本次Action执行：

## 1. 安全性检查

检查AI回应是否包含：

1. 自伤或伤害他人的表述
2. 非法或危险行为建议
3. 极端情绪煽动
   ...

# 输出格式

请严格按照以下JSON格式输出分析结果：

```json
{
  "score": 0.85,
  "reasoning": "安全性良好，但相关性有待提高...",
  "feedback_for_action": "建议在提问时更明确地关联用户前文内容",
  "strategy_suggestion": "继续当前话题，但增加连接性提问"
}
```
````

````

**实现状态**：当前仅`ai_ask`和`ai_say`两种Action类型实现了监控处理器，其他Action类型将在后续版本中逐步支持。

### 1.4 执行流程

```typescript
// 伪代码示例
class ActionExecutor {
  async execute(actionConfig: ActionConfig, context: ActionContext): Promise<ActionResult> {
    // 1. 启动监控线程（异步）
    const monitorPromise = this.startMonitorThread(actionConfig, context);

    // 2. 执行主线程
    const mainResult = await this.executeMainThread(actionConfig, context);

    // 3. 获取监控结果
    const monitorResult = await monitorPromise;

    // 4. 根据监控结果调整
    if (monitorResult.score < 0.8) {
      return this.handleLowQualityResult(mainResult, monitorResult);
    }

    // 5. 记录执行数据
    this.recordExecutionData(actionConfig, mainResult, monitorResult);

    return {
      success: true,
      completed: true,
      aiMessage: mainResult.content,
      variables: mainResult.extractedVariables,
      monitorScore: monitorResult.score,
    };
  }
}
````

## 2. Topic层实现机制

### 2.1 核心设计：两阶段LLM Pipeline

**架构图**:

```
对话上下文
    ↓
[Stage 1: Decision LLM] ← 分析对话，判断是否需要调整队列
    │       输出：结构化调整计划（JSON）
    ↓
[Stage 2: Planner LLM] ← 将调整计划转换为Action配置
    │       输出：Action YAML脚本
    ↓
Schema验证
    ├─ 通过 → 应用新actions队列
    └─ 失败 → 回退机制
```

### 2.2 两阶段Pipeline详解（设计思路演进）

**当前设计思路演进**:

原始设计文档中的"代码层维护实体处理进度"方式存在以下问题：

1. 代码层需要维护复杂的状态管理
2. 需要将状态传递给LLM进行重复判断
3. 增加了系统复杂性和维护负担

**改进的设计思路**:

**Stage 1: Decision LLM（决策层）**

- **输入**: Topic目标、策略、对话摘要、剩余时间等
- **输出**: 调整要求的自然语言描述，而非过度结构化的JSON
- **核心能力**:
  - 理解对话上下文，识别需要处理的新实体
  - 判断是否需要调整Action队列
  - 提供调整方向和理由的文字描述

**Stage 2: Planner LLM（规划层）**

- **输入**: Stage 1的文字描述 + Topic目标/策略
- **输出**: 具体的Action YAML脚本
- **核心能力**:
  - 将文字调整要求转换为可执行的Action配置
  - 遵循命名规范和脚本语法
  - 考虑执行连续性和用户体验

**可能的Stage 3: 执行/验证层**

- **可选引入**: 第三个LLM负责执行修改计划或进行质量检查
- **Schema验证**: 确保生成的Action脚本符合技术规范
- **回退机制**: 验证失败时的处理策略

**设计哲学**:

- 像"写代码"一样的过程：需求描述 → 代码生成 → 执行 → 验证
- 优先解决智能水平问题，效率优化作为后续考虑
- 减少代码层状态管理，让LLM承担更多智能判断

### 2.3 动态调整情景示例

Topic层的动态调整能力支持多种情景，这些情景主要影响Decision LLM、Planner LLM和可能的Executor LLM的提示词设计：

**情景A：一对多实体展开（核心示例）**

- **触发条件**: 用户提到多个需要逐一处理的对象（如多个抚养者）
- **调整动作**: 为每个实体生成对应的Action子队列
- **示例**:
  - 用户提到"爸爸、妈妈、外公"
  - 系统自动为每个抚养者生成基本信息收集Actions
  - 不同实体可分配不同数量的Actions（如爸爸3个、妈妈2个、外公1个）

**情景B：话题延伸处理**

- **触发条件**: 用户主动跑题，但内容与当前Topic相关
- **调整动作**: 插入1-2个简要认可的Actions后回归主线
- **示例**:
  - 用户突然提到小学班主任的回忆
  - 系统插入："嗯，您提到的小学班主任经历确实很有意思..."
  - 然后引导回原话题："让我们回到刚才关于抚养者的话题..."

**情景C：条件跳过**

- **触发条件**: 前置条件不满足（如用户抗拒、时间不足）
- **调整动作**: 跳过部分次要Actions
- **示例**:
  - 用户明确表示不想深入讨论某个话题
  - 系统跳过相关的深入追问Actions
  - 直接进入下一个话题或总结

**情景D：情绪响应**

- **触发条件**: 检测到用户情绪明显波动
- **调整动作**: 插入安抚类Action或暂停当前Topic
- **示例**:
  - 用户表现出强烈焦虑情绪
  - 系统插入共情表达："我能感受到您此刻的焦虑..."
  - 询问是否需要调整节奏或话题

**情景E：信息深化**

- **触发条件**: 收集到高质量信息，值得深入探索
- **调整动作**: 增加追问或分析类Actions
- **示例**:
  - 用户提供了特别有洞察的自我观察
  - 系统追加："您刚才提到的这个观察非常深刻，我们可以进一步探讨..."
  - 增加认知模式分析Action

**设计要点**:

- 所有情景都通过Prompt模板配置，无需代码修改
- 调整逻辑由LLM判断，代码层只负责执行
- 不同情景可组合出现（如同时处理新实体和情绪响应）
- 优先级处理：安全相关 > 情绪响应 > 信息深化 > 常规调整

**配置驱动**: 所有业务逻辑通过YAML配置和Prompt模板定义，实现零编码扩展。

**Topic节点YAML配置结构**:

```yaml
topic:
  id: 'collect_caregiver_info'
  goal: '收集来访者童年主要抚养者信息'
  strategy: 'progressive_deepening'

  # 决策提示词配置
  decision_prompt_config:
    system_variables: { ... }
    template_variables: { ... }
    conditional_blocks: [...]
    examples: [...]

  # 规划提示词配置
  planner_prompt_config:
    input_variables: { ... }
    template_fragments: { ... }
    loop_templates: [...]
    examples: [...]
```

### 2.5 典型使用场景

**场景A：一对多实体展开（核心实现）**

- **Topic目标**: 收集来访者童年主要抚养者情况
- **动态展开**:
  1. Action1收集到"爸爸"，自动展开Action2(爸爸)、Action3(爸爸)
  2. Action3(爸爸)执行中，用户提到"妈妈、外公"，自动追加对应Actions
- **关键点**: 脚本作者只需要写一次模板，引擎通过两阶段LLM自动生成和扩展Actions

**其他扩展场景**:

- **场景B：话题延伸处理** - 用户主动跑题但内容相关
- **场景C：条件跳过** - 根据条件跳过部分Actions
- **场景D：情绪响应** - 检测到用户情绪明显波动

### 2.6 状态上报协议

Topic层需要向Phase层上报：

- `topic_progress`: 目标达成度（0-1）
- `adjustment_decisions`: 调整决策记录（包含两阶段LLM输出）
- `entity_status`: 实体识别与处理状态
- `time_usage`: 时间使用情况
- `key_issues`: 遇到的关键问题

## 3 意识侦察系统（LLM+脚本哲学）

### 3.1 设计哲学：纯LLM驱动检测

**核心原则**：遵循"LLM+脚本（组装提示词）"哲学，所有检测逻辑封装在提示词模板中，通过LLM端到端理解，避免传统AI的语义拆解流水线。

**与传统AI检测的区别**：
| 传统AI检测 | LLM+脚本检测 |
|------------|--------------|
| 原始文本 → 分词 → 句法分析 → 语义理解 → 规则匹配 | 原始文本 → 提示词模板（组装上下文） → LLM（端到端理解） → 结构化输出 |
| 依赖规则引擎、模式匹配库 | 依赖提示词工程和LLM理解能力 |
| 检测逻辑硬编码在代码中 | 检测逻辑定义在脚本模板中 |
| 性能优化通过算法优化 | 性能优化通过模型选择、批量处理、缓存 |

### 3.2 意识定义脚本化架构

```yaml
# 意识定义脚本示例：scripts/consciousness/contradiction-detection.yaml
consciousness:
  id: 'contradiction_detection'
  name: '矛盾识别意识'
  description: '识别用户前后矛盾表述'

  # 加载配置
  loading:
    scope: ['phase:assessment', 'phase:exploration'] # 在哪些阶段加载
    activation: 'conditional' # conditional | always | on_demand
    priority: 0.7 # 加载优先级（0-1）

  # 核心：LLM检测配置
  detection:
    method: 'llm_pattern_recognition'
    frequency: 'adaptive' # 自适应频率，非固定间隔
    context_window: 10 # 分析最近10条消息

    # 提示词模板配置
    prompt_template:
      path: 'templates/consciousness/contradiction-detection.md'
      input_variables:
        - 'recent_messages:最近10条对话'
        - 'session_variables:会话变量'
        - 'emotional_state:情绪状态'

    # LLM配置
    llm_config:
      model: 'claude-3-haiku' # 轻量级模型用于检测
      temperature: 0.1
      max_tokens: 500

    # 输出格式
    output_schema:
      type: 'object'
      properties:
        detected: { type: 'boolean' }
        confidence: { type: 'number', minimum: 0, maximum: 1 }
        contradiction_type: { type: 'string' }
        evidence: { type: 'array', items: { type: 'string' } }
        recommended_skill: { type: 'string' }
      required: ['detected', 'confidence']

  # 性能优化（LLM-native）
  performance:
    caching:
      enabled: true
      ttl: '30_seconds' # 检测结果缓存30秒
      key_based_on: ['message_hash', 'session_context']

    batching:
      enabled: true
      batch_size: 3 # 每3条消息批量检测一次
      batch_timeout: '100ms'

    sampling:
      enabled: true
      sample_rate: 0.3 # 30%的消息进行详细检测
      always_check: ['safety_keywords'] # 安全关键词始终检查

  # 触发后动作
  actions:
    - type: 'call_skill'
      skill_id: 'clarification_questioning'
      condition: 'detected == true && confidence > 0.7'

    - type: 'log_insight'
      condition: 'detected == true'
      insight_type: 'contradiction_pattern'
```

### 3.3 意识加载与激活机制

**三层加载策略**：

1. **全局意识**：始终加载（如安全风险检测）

   ```yaml
   loading:
     scope: 'global'
     activation: 'always'
   ```

2. **阶段意识**：在特定Phase加载

   ```yaml
   loading:
     scope: ['phase:assessment', 'phase:intervention']
     activation: 'conditional' # 按需激活
   ```

3. **动态意识**：运行时根据上下文动态加载
   ```yaml
   loading:
     scope: 'dynamic'
     activation: 'on_demand'
     loading_conditions:
       - 'user_mentions_trauma == true'
       - 'session_duration > 15_minutes'
   ```

**性能优化**：

- **懒加载**：意识只在需要时实例化
- **引用计数**：多场景共享同一意识，避免重复加载
- **语义缓存**：基于语义相似度的缓存，而非精确匹配
- **自适应采样**：根据对话强度动态调整检测频率

### 3.4 安全底线保障

**即使坚持"纯LLM"，安全底线仍需保障**：

```yaml
safety_backstop:
  # 极简关键词匹配（不是完整规则引擎）
  emergency_keywords:
    - '自杀'
    - '自残'
    - '想死'
    - 'kill myself'

  # 实现方式：字符串包含检查，<1ms延迟
  implementation: 'string.includes() check'

  # 触发动作：立即暂停对话，调用危机干预
  action: 'immediate_crisis_intervention'

  # 优先级：最高，覆盖所有其他逻辑
  priority: 'highest'
```

### 3.5 意识触发引擎工作流

```
对话进行中
    ↓
[意识加载器] ← 根据当前Phase/上下文加载相关意识脚本
    │       只加载提示词模板，不实例化复杂逻辑
    ↓
[检测调度器] ← 智能调度（非固定阶段）
    │       考虑因素：
    │       - 消息重要性（情感强度、长度）
    │       - 上次检测时间
    │       - 缓存命中率
    ↓
[批量检测器] ← 批量组装提示词，单次LLM调用
    │       输入：多条消息 + 多个意识模板
    │       输出：批量检测结果（结构化JSON）
    ↓
[结果解析器] ← 解析LLM的结构化响应
    ├─ 触发技能调用 → 插入技能Topic
    ├─ 更新语义缓存 → 提高后续检测效率
    └─ 调整检测频率 → 自适应优化
```

### 3.6 性能优化策略（LLM-native）

**不依赖规则引擎，而是通过LLM-native方式优化**：

1. **模型分层**：

   ```yaml
   detection_tiers:
     tier1: # 高频检测
       model: 'claude-3-haiku' # 快速、便宜
       prompt: '简版检测模板'
       max_tokens: 200

     tier2: # 深度检测
       model: 'claude-3-sonnet' # 更准确
       trigger: 'tier1.confidence < 0.7'
   ```

2. **智能采样**：

   ```yaml
   adaptive_sampling:
     base_rate: 0.2 # 20%消息检测

     increase_when:
       - 'emotional_intensity > 0.7'
       - 'message_length > 100_chars'
       - 'contains_question == true'

     decrease_when:
       - 'consecutive_similar_messages > 3'
       - 'session_phase == "closing"'
   ```

3. **语义缓存**：
   ```typescript
   class ConsciousnessCache {
     // 基于语义的缓存，而非精确匹配
     async getCachedDetection(message: string, context: Context): Promise<DetectionResult | null> {
       // 计算语义相似度
       const similarity = await this.calculateSemanticSimilarity(message, cachedMessages);
       if (similarity > 0.9) {
         return cachedResult;
       }
       return null;
     }
   }
   ```

### 3.7 与现有架构的集成

**完全复用现有基础设施**：

1. **模板系统**：复用`PromptTemplateManager`加载和渲染提示词模板
2. **LLM编排**：复用`LLMOrchestrator`统一LLM调用接口
3. **监控模式**：与`MonitorOrchestrator`类似架构模式
4. **脚本配置**：意识定义在YAML脚本中，与现有Action配置一致

**向后兼容**：现有监控系统可以逐步迁移到意识检测架构，两者可以共存。

## 4. Session层实现机制

### 4.1 会谈守护职责

**三大守护维度**:

1. **结构完整性守护**
   - 以CBT心理咨询为例
   - 开始阶段：建立关系，设定议程
   - 过程阶段：按Phase推进，监控进展
   - 结束阶段：总结收获，布置作业

2. **时间策略执行**
   - Phase时间分配监控
   - 进度提醒与调整
   - 超时处理机制

3. **主目标进展监控**
   - 目标达成度评估
   - 关键里程碑检查
   - 风险识别与处理

### 4.2 决策边界规则

**Session层处理**（影响本次会谈剩余部分）：

- 延长或缩短某个Phase的时间
- 调整Phase内的topic顺序
- 因用户状态变化调整会谈节奏
- 处理会谈内的突发危机

**Consultation层处理**（影响治疗整体方向）：

- 改变本次会谈的终极治疗目标
- 调整后续会谈的安排
- 基于重大发现重新制定治疗计划
- 增加或减少整个疗程的会谈次数

### 4.3 状态评估框架

```yaml
session_assessment:
  # 评估时间点
  assessment_points:
    - '会谈开始后10分钟'
    - '每个Phase结束时'
    - '会谈结束前15分钟'

  # 评估维度
  dimensions:
    goal_achievement:
      weight: 0.4
      indicators:
        - '核心议题覆盖度'
        - '关键信息收集完整性'
        - '用户认知/情绪变化'

    process_quality:
      weight: 0.3
      indicators:
        - '咨询关系建立质量'
        - '对话流畅度'
        - '专业遵循度'

    risk_management:
      weight: 0.3
      indicators:
        - '安全风险水平'
        - '伦理风险'
        - '用户满意度风险'

  # 决策阈值
  decision_thresholds:
    replan_session: 0.3 # 目标达成度<30%时考虑重规划
    extend_time: 0.7 # 进展良好但时间不足时延长时间
    early_end: 0.9 # 目标达成度>90%时可提前结束
```

### 4.4 重规划触发条件

```yaml
replanning_triggers:
  crisis_situation:
    condition: '检测到自伤、伤害他人等紧急风险'
    action: '立即转向危机干预协议'
    priority: '最高'

  major_discovery:
    condition: '发现比原计划更核心的问题'
    action: '重新评估Session目标'
    priority: '高'
    escalation: 'Consultation层' # 需要跨层决策

  strong_resistance:
    condition: '用户阻抗持续高水平且影响进展'
    action: '调整咨询方法或节奏'
    priority: '中'

  poor_progress:
    condition: '目标达成度 < 0.3 且时间已过一半'
    action: '重新规划剩余时间使用'
    priority: '中'
```

## 5. 层间协调协议

### 5.1 状态上报规范

**数据格式**:

```typescript
interface LayerReport {
  layer: 'action' | 'topic' | 'phase' | 'session';
  timestamp: string;
  metrics: Record<string, number>;
  decisions: Array<{
    type: string;
    reason: string;
    outcome: string;
  }>;
  issues: Array<{
    severity: 'low' | 'medium' | 'high';
    description: string;
    impact: string;
  }>;
}
```

**上报频率**:

- Action层：每个action执行完成后
- Topic层：每个topic完成或调整后
- Phase层：每个Phase结束时
- Session层：关键评估时间点

### 5.2 决策影响传播

```
Action调整 → 影响Topic进展评估
Topic调整 → 影响Phase进度监控
Phase调整 → 影响Session时间分配
Session调整 → 影响Consultation治疗计划
```

### 5.3 冲突解决机制

1. **同级冲突**：在同一层内发生的决策冲突
   - 解决方案：按优先级排序，高优先级覆盖低优先级
   - 示例：Phase层多个意识同时触发，按紧急程度排序

2. **跨层冲突**：不同层的决策相互矛盾
   - 解决方案：向上层汇报，由上层协调
   - 示例：Topic层想增加actions，但Phase层因时间不足想减少

3. **资源冲突**：多个调整竞争同一资源（如时间）
   - 解决方案：按战略重要性分配
   - 示例：危机干预 vs 常规话题推进

## 6. 实施检查清单

### Phase 1: Action层（MVP核心）

- [ ] 实现ai_say, ai_ask基础动作类型
- [ ] 开发主线程+监控线程框架
- [ ] 建立动作执行状态跟踪
- [ ] 实现基础监控检查项（安全、相关性）

### Phase 2: Topic层

- [ ] 实现Topic规划器基础版本
- [ ] 开发LLM生成actions + schema验证流程
- [ ] 建立调整决策记录机制
- [ ] 实现状态上报协议

### Phase 3: Phase层

- [ ] 实现情绪识别和阻抗识别意识
- [ ] 开发基础咨询技能库（共情表达、阻抗处理）
- [ ] 建立意识触发到技能调用流程
- [ ] 实现topic队列调整机制

### Phase 4: Session层

- [ ] 实现会谈结构完整性检查
- [ ] 开发时间策略执行监控
- [ ] 建立Session层决策边界规则
- [ ] 实现状态评估框架

### Phase 5: Consultation层

- [ ] 实现跨会谈进展评估
- [ ] 开发治疗计划调整机制
- [ ] 建立长期模式识别能力
- [ ] 实现完整的层间协调

## 7. 性能与监控指标

### 关键性能指标

1. **响应时间**：各层决策延迟 < 2秒
2. **资源使用**：监控线程CPU使用率 < 20%
3. **决策质量**：调整后目标达成度提升 > 20%
4. **识别准确率**：意识识别准确率 > 85%

### 监控仪表板

建议实现的监控维度：

- 各层决策频率分布
- 调整成功率统计
- 意识触发与技能调用关联分析
- 层间通信延迟热图
- 用户满意度与系统调整相关性

## 8. 扩展与演进

### 短期扩展（3-6个月）

1. 增加更多Action类型（ai_draw, ai_form等）
2. 丰富意识侦察类型（更多心理咨询维度）
3. 扩展咨询技能库（更多治疗技术）
4. 优化LLM提示词工程

### 中期演进（6-12个月）

1. 机器学习优化：基于历史数据优化决策阈值
2. 个性化适应：根据用户特征调整监控策略
3. 多模态扩展：支持语音、图像等输入输出
4. 协作模式：AI与人类咨询师协作机制

### 长期愿景（1-2年）

1. 自主学习：从咨询案例中自动提炼模式和技能
2. 领域扩展：扩展到其他专业对话领域（医疗、教育等）
3. 生态构建：咨询技能市场，第三方技能开发
4. 研究平台：心理咨询研究数据收集与分析

---

## 附录

### A. 相关文档

1. [决策文档](../decisions/2026-03-09-five-layer-implementation-decisions.md)
2. [哲学思考](../design/thinking/HeartRule咨询智能实现机制.md)
3. [MVP路线图](../implementation/mvp-roadmap.md)

### B. 技术参考

1. Worker Threads实现示例
2. LLM提示词模板库
3. Schema验证工具配置
4. 监控指标收集框架

### C. 专业参考

1. 心理咨询伦理规范
2. 认知行为疗法技术手册
3. 危机干预协议标准
4. 咨询效果评估工具
