# HeartRule 咨询智能系统 - Product Backlog

## 产品愿景与MVP目标

**产品愿景**: 实现"抬头规划,低头执行"的五层智能咨询架构,通过Session/Phase/Topic/Action四层协同,构建既可靠又灵活的专业对话系统

**MVP目标**: 用1个完整的CBT焦虑评估脚本,实现并可视化展示四层架构(Session→Phase→Topic→Action)的智能规划与执行机制

**成功指标**:

- CBT焦虑评估脚本可完整执行四层逻辑
- 调试面板可展示每层的规划决策与执行状态
- Topic层可根据用户输入动态生成Action队列
- Phase层可根据时间和用户状态动态调度Topic

---

## Epic 1: Action层智能执行能力(原子交互层)

**Epic目标**: 完善Action层的"话术微调"智能,实现在边界内的表达适应性调整

**优先级**: P0 - 最高(基础层,必须优先)

### Story 1.1: ai_ask的微观话术动态适配能力

**Story描述**: 作为ai_ask Action,我需要根据用户上一轮回复的风格和完整性,在不改变提问目标的前提下,动态调整下一句话术(如从开放式转为选择式提问),以提高对话的流畅性和自然度

**详细需求**:

- 在提示词模板中嵌入话术适配指令,根据用户回复风格调整提问方式
- 支持配置话术风格偏好(开放优先/选择优先/混合)
- 根据用户回复长度自动选择合适的追问方式(短回复→选择题,长回复→开放追问)
- 所有调整严格限制在当前`question_template`目标范围内
- 将话术调整决策记录到debugInfo供调试

**验收标准**:

- [ ] ai_ask能根据用户回复风格调整话术
- [ ] 开放式/选择式提问自动切换
- [ ] 话术调整不改变提问的根本目标
- [ ] debugInfo记录话术适配决策过程
- [ ] 单元测试覆盖各种回复风格场景

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 1.3的统一模板系统

**技术实现要点**:

- 在提示词模板中增加话术风格适配指令
- 根据用户回复长度(字数)自动选择提问方式
- 保持提问目标不变,仅调整表达方式

**职责边界澄清**:

- ✅ Action层负责: "如何问"(话术风格、表达方式)
- ❌ Action层不负责: "问什么"和"是否继续问"(由Topic层决策)
- ✅ Action层可以: 给出初步的进度建议(如`待补充`),供Topic层参考
- ❌ Action层不应: 基于信息充分度做业务逻辑判断

---

### Story 1.2: ai_say动作的受众适配能力

**Story描述**: 作为系统,我需要根据用户的教育背景/年龄/理解力,自动调整解释的抽象程度和比喻选择

**详细需求**:

- 支持从variableStore读取用户画像变量(如`用户教育水平`、`用户年龄`)
- ai_say配置支持`adaptation_rules`字段,定义不同受众的话术调整规则
- 自动选择合适的比喻/术语/句式
- 首次使用概念时自动添加简单解释

**验收标准**:

- [ ] ai_say可读取用户画像变量
- [ ] 同一内容对不同受众生成不同话术
- [ ] 青少年(<18岁)自动使用具体比喻
- [ ] 高学历用户可使用专业术语
- [ ] 调试面板显示适配决策依据

**优先级**: P1 - 中  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 1.1的LLM评估能力

---

### Story 1.3: Action层统一提示词模板系统

**Story描述**: 作为开发者,我希望每个Action类型有预置的通用提示词模板,避免每个脚本重复编写格式定义/上下文引用等

**详细需求**:

- 在`engines/prompt-template`下为每种 Action 类型创建默认模板
- 模板包含:输出格式定义、上下文引用规则、安全边界说明
- 脚本中只需编写业务目标,系统自动组装完整提示词
- 支持在 session 中指定数据库脚本工程中 custom 目录下的模板方案(`template_scheme`)

**验收标准**:

- [ ] ai_ask/ai_say/ai_think都有默认模板
- [ ] 默认模板包含角色定义、输出格式、安全规范
- [ ] 脚本只写业务提示词即可运行
- [ ] 支持两层模板方案机制(default + custom),可通过 session 节点的 `template_scheme` 字段指定使用的方案
- [ ] 单元测试覆盖模板渲染逻辑

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 无

---

### Story 1.4: Action执行状态的精细化暴露

**Story描述**: 作为Topic层,我需要获取Action的精细执行状态(如信息充分度/用户参与度/情绪强度),以决定是否调整后续Action

**详细需求**:

- ActionResult增加`metrics`字段,包含:
  - `information_completeness`: 0-100,信息充分度(初步评估)
  - `user_engagement`: 0-100,用户投入度
  - `emotional_intensity`: 0-100,情绪强度(如焦虑水平)
  - `reply_relevance`: 0-100,回答相关性(是否偏离当前问题)
- ai_ask/ai_say在执行过程中自动计算这些指标
- 指标存入executionState.metadata供上层使用
- Action层同时提供`progress_suggestion`字段(如"待补充"/"完成"/"遇阻")

**验收标准**:

- [ ] ActionResult新增metrics字段
- [ ] ai_ask返回information_completeness和reply_relevance
- [ ] ai_say返回user_engagement
- [ ] 指标值合理(有LLM评估依据)
- [ ] executionState.metadata可查询历史指标
- [ ] Action层提供progress_suggestion建议

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 1.3的统一模板系统

**职责边界澄清**:

- ✅ Action层负责: 计算并返回状态指标和进度建议
- ❌ Action层不负责: 基于指标做业务决策(如是否跳过、是否安抚)
- ✅ Topic层负责: 解析指标,根据strategy做出战术决策

---

## Epic 2: Topic层智能规划能力(目标攻坚层)

**Epic目标**: 实现Topic层的"战术规划"核心能力,根据实时信息动态生成/调整Action队列

**优先级**: P0 - 最高(核心价值层)

### Story 2.1: Topic的默认Action模板定义

**Story描述**: 作为脚本编写者,我希望为Topic定义一个"理想的默认Action序列模板",作为最佳实践路径

**详细需求**:

- Topic YAML支持`default_action_template`字段,定义理想的Action序列
- 模板中Action可包含占位符(如`{抚养者称呼}`)
- Topic配置支持`strategy`字段,描述完成目标的策略
- 模板作为Topic的"执行基准",用于后续动态调整

**验收标准**:

- [ ] Topic可定义default_action_template
- [ ] 模板中Action支持变量占位符
- [ ] Topic.strategy字段可描述策略要点
- [ ] 解析器正确加载模板到内存
- [ ] 模板验证(Action类型有效、占位符合法)

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖现有YAML解析器

---

### Story 2.2: Topic根据用户输入动态展开Action队列

**Story描述**: 作为Topic,当用户提到"父亲、母亲、奶奶"三位抚养者时,我需要将"收集抚养者记忆"的模板实例化为三个并行子任务流

**详细需求**:

- Topic引擎检测到用户输入包含多个实体时,触发动态展开
- 将模板中的`{抚养者称呼}`替换为"父亲"/"母亲"/"奶奶"
- 生成3组Action序列(每组包含问询、记录、情感探索等步骤)
- 动态生成的Action插入到当前执行队列
- 记录展开决策到debugInfo

**验收标准**:

- [ ] 提及多抚养者时自动展开为多个子任务
- [ ] 每个子任务的Action正确替换占位符
- [ ] 执行顺序合理(逐个完成,而非交叉)
- [ ] debugInfo记录展开决策依据
- [ ] 单元测试覆盖1-5个实体的展开场景

**优先级**: P0 - 最高  
**预估工作量**: 13 Story Points  
**依赖关系**: 依赖Story 2.1的模板定义

**技术实现要点**:

- 新建`TopicPlanner`类(位于engines/topic-planning/)
- 实现`expandTemplate(template, entities)`方法
- 在ScriptExecutor.executeTopic()中调用规划逻辑
- 动态生成的Action加入topic.actions数组

---

### Story 2.3: Topic根据阻抗动态插入安抚Action

**Story描述**: 作为Topic,当检测到用户出现强烈阻抗(拒绝回答/情绪激动)时,我需要暂停原计划,插入一个ai_say安抚动作

**详细需求**:

- Topic引擎监测Action返回的`user_engagement`指标
- 当engagement<30且连续2次,判定为"强阻抗"
- 自动生成一个ai_say Action,内容为共情+降低压力
- 插入到当前Action之后,原计划Action后移
- 安抚完成后,可选择继续原问题或跳过

**验收标准**:

- [ ] 检测到强阻抗时自动插入安抚Action
- [ ] 安抚话术与当前Topic上下文相关
- [ ] 安抚后可配置是retry/skip/postpone
- [ ] debugInfo记录阻抗检测与决策过程
- [ ] 集成测试模拟阻抗场景

**优先级**: P1 - 中高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 1.4的指标暴露

---

### Story 2.4: Topic层基于Action反馈的信息充分度决策

**Story描述**: 作为Topic层,我需要根据ai_ask返回的信息充分度指标和进度建议,决定是否需要继续追问、跳过还是调整策略

**详细需求**:

- Topic层监听ai_ask返回的metadata.progress_suggestion("待补充"/"完成"/"遇阻")
- 根据Topic.strategy配置,决定如何处理"待补充"状态:
  - **重新追问**: 在当前位置插入新的ai_ask,调整话术再次提问
  - **降低要求**: 接受部分信息,标记为"部分收集",继续后续动作
  - **跳过继续**: 标记变量为"未收集",直接执行下一动作
- 支持配置充分度阈值和决策规则:
  - `min_completeness_threshold`: 最低充分度要求(0-100)
  - `retry_strategy`: 重试策略配置(rephrase/simplify/skip)
  - `max_retry_count`: 最大重试次数
- 决策过程记录到debugInfo

**验收标准**:

- [ ] Topic层能正确解析Action返回的进度建议
- [ ] 根据strategy配置做出合理决策
- [ ] 支持重新追问、降低要求、跳过等多种策略
- [ ] debugInfo记录完整决策依据(含指标值、阈值、策略选择)
- [ ] 单元测试覆盖各种进度建议的处理
- [ ] 集成测试验证Topic层决策逻辑

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 1.4的状态指标暴露

**技术实现要点**:

- 在TopicPlanner中实现`evaluateActionResult()`方法
- 基于metrics.information_completeness和progress_suggestion做决策
- 支持动态插入新Action或调整后续队列

**职责边界确认**:

- ✅ 符合Topic层职责: 根据Action反馈进行战术决策
- ✅ 符合Action层边界: Action只提供指标,不做业务决策
- ✅ 符合分层哲学: Topic层"抬头规划",Action层"低头执行"

---

### Story 2.5: Topic时间预算与优先级配置

**Story描述**: 作为Phase层,我需要为每个Topic设置时间预算和优先级,以便Topic自我调控执行深度

**详细需求**:

- Topic YAML支持`time_budget`字段(单位:分钟)
- 支持`priority`字段(high/medium/low)
- Topic执行时记录实际耗时
- 当接近time_budget时,Topic可选择快速收尾或标记"未完成"
- 优先级影响被Phase跳过的可能性

**验收标准**:

- [ ] Topic可配置time_budget和priority
- [ ] executionState记录Topic实际耗时
- [ ] 超时时Topic可自动快速收尾
- [ ] Phase层可读取Topic优先级
- [ ] 调试面板显示时间预算vs实际耗时

**优先级**: P1 - 中  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Epic 3的Phase调度能力

---

## Epic 3: Phase层智能调度能力(环节导航层)

**Epic目标**: 实现Phase层的"议程调度"能力,根据时间/进度/用户状态动态调整Topic队列

**优先级**: P0 - 高(协调层)

### Story 3.1: Phase的Topic队列与时间预算定义

**Story描述**: 作为脚本编写者,我希望为Phase定义Topic队列、总时间预算和各Topic优先级权重

**详细需求**:

- Phase YAML支持`total_time_budget`字段
- `topic_queue`中每个Topic引用有priority权重
- Phase启动时初始化时间追踪器
- 记录每个Topic的计划时间vs实际时间

**验收标准**:

- [ ] Phase可定义total_time_budget
- [ ] Topic队列包含priority配置
- [ ] Phase执行时实时追踪剩余时间
- [ ] executionState.metadata记录Phase时间状态
- [ ] YAML解析器正确加载Phase时间配置

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 2.5的Topic时间配置

---

### Story 3.2: Phase根据时间压力动态跳过低优先Topic

**Story描述**: 作为Phase,当某个Topic耗时超预期且剩余时间<10分钟时,我需要跳过低优先级Topic或转为快速收集

**详细需求**:

- Phase引擎实时计算:剩余时间 / 剩余Topic数量
- 当单Topic平均可用时间<配置阈值,触发调度决策
- 对priority=low的Topic执行skip操作
- 对priority=medium的Topic降级为"快速模式"(减少Action数量)
- 记录调度决策到debugInfo

**验收标准**:

- [ ] 时间压力大时自动跳过低优先级Topic
- [ ] 中优先级Topic可降级为快速模式
- [ ] 高优先级Topic不受影响
- [ ] debugInfo记录调度决策依据
- [ ] 单元测试覆盖时间压力场景

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 3.1的时间追踪

**技术实现要点**:

- 新建`PhaseScheduler`类(位于engines/phase-scheduling/)
- 实现`evaluateTimePressure()`方法
- 实现`adjustTopicQueue()`方法
- 在ScriptExecutor.executePhase()中调用调度逻辑

---

### Story 3.3: Phase根据用户疲劳度调整Topic节奏

**Story描述**: 作为Phase,当检测到用户连续多个Topic的engagement下降时,我需要插入休息Topic或调整后续难度

**详细需求**:

- Phase引擎追踪最近3个Topic的平均engagement
- 当平均值<50且呈下降趋势,判定为"疲劳状态"
- 可选策略:插入轻松话题/缩短剩余Topic/建议结束Phase
- 策略由Phase配置的`fatigue_handling`字段决定
- 记录疲劳检测到debugInfo

**验收标准**:

- [ ] 检测到疲劳时自动调整Topic节奏
- [ ] 可配置疲劳处理策略(insert_break/shorten/suggest_end)
- [ ] 插入的休息Topic与主题相关
- [ ] debugInfo记录疲劳检测指标
- [ ] 集成测试模拟疲劳场景

**优先级**: P2 - 中低  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 1.4的engagement指标

---

### Story 3.4: Phase完成度评估与上报

**Story描述**: 作为Phase,执行结束时我需要评估自己的完成质量,并上报给Session层作为重规划依据

**详细需求**:

- Phase结束时计算完成度指标:
  - `topics_completed_rate`: 完成Topic数/计划Topic数
  - `quality_score`: 基于各Topic的信息充分度
  - `time_efficiency`: 实际耗时/计划耗时
- 指标存入executionState.metadata.phaseMetrics
- Session层可读取这些指标

**验收标准**:

- [ ] Phase结束时自动计算完成度指标
- [ ] 指标包含完成率/质量/效率三个维度
- [ ] 存储到executionState便于Session读取
- [ ] 调试面板显示Phase完成度仪表盘
- [ ] 单元测试覆盖指标计算逻辑

**优先级**: P1 - 中  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Epic 4的Session监控能力

---

## Epic 4: Session层战略调整能力(单次作战层)

**Epic目标**: 实现Session层的"战略重规划"能力,在极端情况下调整会谈目标与结构

**优先级**: P1 - 中(高层决策)

### Story 4.1: Session的Phase结构与总体目标定义

**Story描述**: 作为脚本编写者,我希望定义Session的总体目标和Phase序列,作为本次会谈的作战计划

**详细需求**:

- Session YAML支持`global_goal`字段,描述会谈总目标
- `planned_phases`定义Phase序列及各Phase的goal
- Session启动时初始化目标追踪
- 记录Session整体进度

**验收标准**:

- [ ] Session可定义global_goal和planned_phases
- [ ] YAML解析器正确加载Session配置
- [ ] executionState记录Session目标状态
- [ ] 调试面板显示Session目标与进度
- [ ] 文档说明Session配置规范

**优先级**: P1 - 中  
**预估工作量**: 3 Story Points  
**依赖关系**: 无

---

### Story 4.2: Session危机协议触发与重规划

**Story描述**: 作为Session,当用户暴露危机信息(如自伤念头)时,我需要立即暂停原计划,启动危机干预Phase

**详细需求**:

- Session配置支持`crisis_triggers`字段,定义危机关键词/模式
- Action执行过程中检测用户输入是否匹配危机特征
- 触发时,Session暂停当前Phase,插入`crisis_intervention` Phase
- 危机Phase可以是预定义脚本或动态生成
- 记录危机触发事件到metadata

**验收标准**:

- [ ] 检测到危机关键词时自动触发重规划
- [ ] 原Phase被暂停,危机Phase插入队列
- [ ] 危机Phase执行完可选择:恢复原计划/结束会谈/转介
- [ ] debugInfo记录危机检测与决策
- [ ] 集成测试模拟危机触发场景

**优先级**: P1 - 中高  
**预估工作量**: 13 Story Points  
**依赖关系**: 依赖Story 4.1的Session结构

**技术实现要点**:

- 新建`SessionPlanner`类(位于engines/session-planning/)
- 实现`detectCrisis()`方法
- 实现`insertCrisisPhase()`方法
- 在ScriptExecutor.executeSession()中调用检测逻辑

---

### Story 4.3: Session目标偏离检测与调整

**Story描述**: 作为Session,当连续多个Phase的完成质量低(<60分)时,我需要评估是否调整后续Phase的重点

**详细需求**:

- Session引擎追踪各Phase的quality_score
- 当连续2个Phase质量<60,触发目标偏离评估
- 调用LLM分析偏离原因(如用户理解困难/抗拒话题)
- 根据分析结果调整后续Phase:简化目标/更换策略/增加铺垫
- 记录调整决策到debugInfo

**验收标准**:

- [ ] 检测到质量持续低下时触发评估
- [ ] LLM分析偏离原因并给出建议
- [ ] 可自动调整后续Phase配置
- [ ] debugInfo记录偏离检测与调整策略
- [ ] 单元测试覆盖偏离检测逻辑

**优先级**: P2 - 中低  
**预估工作量**: 13 Story Points  
**依赖关系**: 依赖Story 3.4的Phase指标上报

---

### Story 4.4: Session状态持久化与恢复

**Story描述**: 作为系统,我需要在Session暂停/中断时保存完整状态,恢复时可继续执行

**详细需求**:

- executionState包含Session/Phase/Topic/Action的完整位置信息
- 保存时序列化所有状态(包括Action内部状态)
- 恢复时正确反序列化并定位到中断点
- 支持跨会话的状态迁移(如用户下次登录继续)

**验收标准**:

- [ ] Session可暂停并保存状态
- [ ] 恢复时从中断点继续执行
- [ ] Action内部状态(如currentRound)正确恢复
- [ ] 对话历史完整保留
- [ ] 集成测试覆盖暂停-恢复流程

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖现有executionState设计

---

## Epic 5: 调试可视化与监控能力

**Epic目标**: 实现五层架构的可视化调试,展示每层的规划决策与执行状态

**优先级**: P0 - 高(核心竞争力)

### Story 5.1: 四层架构执行流可视化

**Story描述**: 作为开发者/测试者,我希望在调试面板看到Session→Phase→Topic→Action的执行流图,包含当前位置和状态

**详细需求**:

- 调试面板左侧显示四层树形结构
- 当前执行位置高亮显示
- 每层节点显示状态图标(执行中/完成/跳过/失败)
- 点击节点查看详细信息(配置/指标/决策日志)
- 实时更新(WebSocket推送)

**验收标准**:

- [ ] 调试面板显示四层树形结构
- [ ] 当前执行Action高亮
- [ ] 节点状态图标正确
- [ ] 点击节点显示详情面板
- [ ] 执行过程实时更新

**优先级**: P0 - 最高  
**预估工作量**: 13 Story Points  
**依赖关系**: 依赖现有DebugChatPanel组件

**技术实现要点**:

- 扩展DebugChatPanel,增加ExecutionTreeView组件
- executionState增加`hierarchySnapshot`字段
- API返回完整层次结构数据
- 使用React Tree组件库实现

---

### Story 5.2: Topic动态规划决策的可视化

**Story描述**: 作为开发者,我希望看到Topic如何根据用户输入动态展开Action队列,包含决策依据和生成过程

**详细需求**:

- debugInfo包含Topic规划日志:
  - 原始模板内容
  - 检测到的实体列表
  - 展开决策(为什么展开/展开几个)
  - 生成的Action队列
- 调试面板显示"Topic规划视图"
- 可对比"计划队列"vs"实际队列"

**验收标准**:

- [ ] debugInfo包含Topic规划详细日志
- [ ] 调试面板显示模板展开过程
- [ ] 可查看生成的Action配置
- [ ] 高亮显示动态生成的Action
- [ ] 支持导出规划日志为JSON

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 2.2的动态展开能力

---

### Story 5.3: Phase调度决策的时间线视图

**Story描述**: 作为开发者,我希望看到Phase如何根据时间压力调整Topic队列,以时间线形式展示

**详细需求**:

- debugInfo包含Phase调度日志:
  - 时间预算分配表
  - 实际耗时记录
  - 调度决策点(何时/为何跳过/降级)
- 调试面板显示"Phase时间线视图"
- 横轴为时间,纵轴为Topic,显示执行时长和决策点

**验收标准**:

- [ ] debugInfo包含Phase调度时间线
- [ ] 调试面板显示时间线可视化
- [ ] 标注调度决策点和原因
- [ ] 可对比计划时间vs实际时间
- [ ] 支持回放Phase执行过程

**优先级**: P1 - 中  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 3.2的Phase调度能力

---

### Story 5.4: Session战略调整的决策日志

**Story描述**: 作为开发者,我希望看到Session层做了哪些战略调整(如危机重规划),包含触发原因和调整内容

**详细需求**:

- debugInfo包含Session决策日志:
  - 危机检测事件
  - 目标偏离评估
  - 重规划决策(调整了什么)
  - 调整效果评估
- 调试面板显示"Session决策历史"
- 按时间顺序列出所有重大决策

**验收标准**:

- [ ] debugInfo包含Session决策完整日志
- [ ] 调试面板显示决策历史列表
- [ ] 每条决策包含:时间/触发原因/执行动作/结果
- [ ] 可筛选决策类型(危机/偏离/调整)
- [ ] 支持导出决策报告

**优先级**: P1 - 中  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 4.2的Session重规划能力

---

### Story 5.5: LLM调用的Prompt-Response追踪

**Story描述**: 作为开发者,我希望看到每次LLM调用的完整Prompt和Response,以及调用耗时和token消耗

**详细需求**:

- debugInfo包含每次LLM调用记录:
  - 调用位置(哪个Action/哪个决策点)
  - 完整Prompt(包含系统提示+用户输入+变量注入)
  - LLM Response原文
  - 耗时/token数/费用
- 调试面板显示"LLM调用列表"
- 点击查看详细Prompt-Response对

**验收标准**:

- [ ] 每次LLM调用记录到debugInfo
- [ ] 调试面板显示调用列表
- [ ] 可查看完整Prompt和Response
- [ ] 显示性能指标(耗时/token/费用)
- [ ] 支持搜索和过滤LLM调用

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖现有LLM编排引擎

---

## Epic 6: 脚本编辑器的四层编排支持

**Epic目标**: 在脚本编辑器中支持可视化编辑Session/Phase/Topic/Action的层次结构

**优先级**: P1 - 中(工具层)

### Story 6.1: Session/Phase/Topic的层次结构编辑器

**Story描述**: 作为脚本编写者,我希望在可视化编辑器中拖拽创建Session→Phase→Topic的层次结构

**详细需求**:

- 编辑器左侧显示层次树
- 支持拖拽创建Phase/Topic节点
- 支持拖拽调整顺序
- 点击节点在右侧显示属性面板
- 实时同步到YAML

**验收标准**:

- [ ] 编辑器显示三层树形结构
- [ ] 可拖拽创建/删除/排序节点
- [ ] 属性面板支持编辑配置
- [ ] 实时同步到YAML预览
- [ ] 支持折叠/展开节点

**优先级**: P1 - 中  
**预估工作量**: 13 Story Points  
**依赖关系**: 依赖现有脚本编辑器架构

---

### Story 6.2: Topic默认模板的可视化编辑

**Story描述**: 作为脚本编写者,我希望在编辑Topic时可视化定义默认Action模板,包含占位符管理

**详细需求**:

- Topic属性面板显示"默认模板"标签页
- 可拖拽添加Action到模板
- Action配置中可插入变量占位符(下拉选择)
- 预览模板展开效果(模拟输入实体)
- 验证模板合法性

**验收标准**:

- [ ] Topic属性面板支持编辑默认模板
- [ ] 可拖拽添加Action到模板
- [ ] 占位符通过下拉菜单插入
- [ ] 实时预览模板展开
- [ ] 保存时验证模板语法

**优先级**: P2 - 中低  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 6.1的编辑器

---

### Story 6.3: Phase时间预算的可视化配置

**Story描述**: 作为脚本编写者,我希望在编辑Phase时可视化分配时间预算给各Topic,并看到预警提示

**详细需求**:

- Phase属性面板显示"时间分配"视图
- 拖动滑块分配各Topic时间预算
- 显示总和是否超过Phase总预算(红色预警)
- 推荐时间分配(基于历史数据)
- 保存到YAML

**验收标准**:

- [ ] Phase属性面板支持时间分配
- [ ] 可视化滑块分配Topic时间
- [ ] 超预算时红色预警
- [ ] 显示推荐分配值
- [ ] 实时同步到YAML

**优先级**: P2 - 中低  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 6.1的编辑器

---

## Epic 7: 基础设施与测试

**Epic目标**: 完善测试体系和基础设施,确保四层架构稳定可靠

**优先级**: P0 - 高(质量保障)

### Story 7.1: Topic动态规划的单元测试套件

**Story描述**: 作为开发者,我需要为Topic动态规划逻辑编写完整的单元测试,覆盖各种边界场景

**详细需求**:

- 测试用例覆盖:
  - 检测到1-5个实体时的展开
  - 模板占位符替换正确性
  - 无实体时不展开
  - 阻抗检测与安抚插入
- 使用mock LLM避免真实调用
- 测试执行时间<5秒

**验收标准**:

- [ ] 测试覆盖率>90%
- [ ] 覆盖所有边界场景
- [ ] 所有测试通过
- [ ] 使用mock避免LLM调用
- [ ] 测试执行快速(<5s)

**优先级**: P0 - 高  
**预估工作量**: 5 Story Points  
**依赖关系**: 依赖Story 2.2的Topic规划实现

---

### Story 7.2: Phase调度逻辑的集成测试

**Story描述**: 作为开发者,我需要编写端到端测试,验证Phase在时间压力下的调度行为

**详细需求**:

- 测试场景:
  - 正常情况下所有Topic执行
  - 时间不足时跳过低优先级Topic
  - 疲劳时插入休息Topic
- 使用真实YAML脚本
- 验证executionState状态正确

**验收标准**:

- [ ] 覆盖3个核心调度场景
- [ ] 使用真实脚本测试
- [ ] 验证调度决策正确
- [ ] 验证最终状态正确
- [ ] 测试可重复运行

**优先级**: P0 - 高  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 3.2的Phase调度实现

---

### Story 7.3: Session危机重规划的回归测试

**Story描述**: 作为开发者,我需要创建回归测试,确保危机触发后Session状态正确且可恢复

**详细需求**:

- 测试场景:
  - 危机触发后Phase切换正确
  - 危机Phase执行完可恢复原计划
  - executionState正确记录危机事件
- 模拟不同危机级别
- 验证状态持久化与恢复

**验收标准**:

- [ ] 覆盖危机触发-执行-恢复全流程
- [ ] 验证Phase切换逻辑
- [ ] 验证状态持久化
- [ ] 模拟不同危机级别
- [ ] 所有测试通过

**优先级**: P1 - 中  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖Story 4.2的危机协议实现

---

### Story 7.4: 性能基准测试与优化

**Story描述**: 作为开发者,我需要建立性能基准,确保四层架构不引入显著延迟

**详细需求**:

- 测试指标:
  - Topic规划耗时<200ms
  - Phase调度决策耗时<100ms
  - Session重规划耗时<500ms
  - 完整会话执行内存占用<50MB
- 建立性能监控
- 识别性能瓶颈并优化

**验收标准**:

- [ ] 所有指标满足基准要求
- [ ] 建立自动化性能测试
- [ ] 性能回归时CI失败
- [ ] 文档说明性能优化要点
- [ ] 提供性能分析报告

**优先级**: P1 - 中  
**预估工作量**: 8 Story Points  
**依赖关系**: 依赖所有核心Story完成

---

### Story 7.5: YAML脚本Schema验证体系

**Story描述**: 作为系统,我需要建立完整的YAML Schema验证体系,在开发、上传、加载和AI生成等各个环节确保脚本格式符合规范

**详细需求**:

- 为Session/Phase/Topic/Action四层结构分别定义JSON Schema
- 实现多层次验证机制:
  - **开发阶段验证**: 脚本编辑器集成实时语法检查,编辑时即时提示错误
  - **上传前验证**: API接口强制性验证,拒绝不符合规范的脚本
  - **加载时验证**: ScriptParser加载YAML时进行Schema校验
  - **AI生成约束**: 为LLM提供Schema作为生成约束,确保输出格式正确
- Schema验证内容包括:
  - 字段类型验证(string/number/boolean/array/object)
  - 必填字段检查(session_id/phase_id/topic_id/action_type等)
  - 枚举值验证(action_type只能是ai_say/ai_ask/ai_think等)
  - 数值范围约束(max_rounds: 1-10, priority: 0-100)
  - 嵌套结构验证(phases数组/topics数组/actions数组)
  - Action配置字段规范验证(ai_ask必须有question_template,ai_say必须有content_template)
- 提供详细错误信息:
  - 精确定位错误位置(行号/字段路径)
  - 说明错误类型和原因
  - 提供修复建议和示例

**验收标准**:

- [ ] 完成Session/Phase/Topic/Action四层JSON Schema定义
- [ ] 脚本编辑器支持实时Schema验证,编辑时显示错误提示
- [ ] API上传接口集成Schema验证,返回详细错误信息
- [ ] ScriptParser加载时自动验证,无效配置抛出明确异常
- [ ] Schema约束可导出为LLM Prompt格式,用于AI生成
- [ ] 错误信息包含字段路径、错误类型、修复建议
- [ ] 验证覆盖所有核心字段和常见错误场景
- [ ] 单元测试覆盖各层Schema验证逻辑
- [ ] 文档说明Schema规范和验证机制

**优先级**: P0 - 高  
**预估工作量**: 13 Story Points  
**依赖关系**: 无(基础设施,优先实现)

---

## 实施路线图

### Sprint 1 (2周) - Action层基础增强与验证体系

**目标**: 完成Action层的智能执行能力,建立基础设施

- Story 7.5: YAML脚本Schema验证体系 (P0) ⭐基础设施
- Story 1.3: Action统一提示词模板 (P0)
- Story 1.1: ai_ask微观话术适配 (P0)
- Story 1.4: Action状态精细化暴露 (P0)
- Story 7.1: Topic单元测试套件 (P0)

**交付物**: Schema验证体系 + Action层话术适配+状态暴露 + 完整测试

**说明**: Story 7.5作为基础设施优先实现,为后续开发提供脚本校验保障

---

### Sprint 2 (2周) - Topic层核心规划能力

**目标**: 实现Topic层的战术规划核心

- Story 2.1: Topic默认模板定义 (P0)
- Story 2.2: Topic动态展开Action队列 (P0) ⭐核心
- Story 2.4: Topic层信息充分度决策 (P0) ⭐新增
- Story 2.5: Topic时间预算配置 (P1)
- Story 5.2: Topic规划决策可视化 (P0)

**交付物**: Topic可根据用户输入动态展开子任务 + 基于Action反馈进行决策 + 调试可见

**说明**: Story 2.4确保Topic层能正确消费Action层反馈,实现分层协作

---

### Sprint 3 (2周) - Phase层调度能力

**目标**: 实现Phase层的议程调度

- Story 3.1: Phase的Topic队列定义 (P0)
- Story 3.2: Phase根据时间压力调度 (P0) ⭐核心
- Story 3.4: Phase完成度评估 (P1)
- Story 7.2: Phase调度集成测试 (P0)

**交付物**: Phase可根据时间动态调度Topic,有集成测试

**说明**: 依赖Story 2.5的Topic时间配置

---

### Sprint 4 (2周) - Session层战略能力

**目标**: 实现Session层的重规划能力

- Story 4.1: Session结构定义 (P1)
- Story 4.2: Session危机协议 (P1) ⭐核心
- Story 4.4: Session状态持久化 (P0)
- Story 7.3: Session回归测试 (P1)

**交付物**: Session支持危机重规划+状态恢复,有回归测试

---

### Sprint 5 (2周) - 调试可视化完善

**目标**: 完善调试体验,展示四层协同

- Story 5.1: 四层执行流可视化 (P0) ⭐核心
- Story 5.3: Phase时间线视图 (P1)
- Story 5.4: Session决策日志 (P1)
- Story 5.5: LLM调用追踪 (P0)

**交付物**: 完整的四层架构调试面板,可演示

---

### Sprint 6 (2周) - 优化与迭代

**目标**: 补充次要功能,优化性能

- Story 1.2: ai_say受众适配 (P1)
- Story 2.3: Topic阻抗处理 (P1)
- Story 3.3: Phase疲劳检测 (P2)
- Story 7.4: 性能基准测试 (P1)

**交付物**: 系统更智能,性能达标

---

### Sprint 7-8 (按需) - 编辑器工具链

**目标**: 提升脚本编写效率

- Story 6.1: 层次结构编辑器 (P1)
- Story 6.2: Topic模板编辑 (P2)
- Story 6.3: Phase时间配置 (P2)

**交付物**: 可视化脚本编辑器支持四层架构

---

## 优先级说明

- **P0**: MVP必须,核心价值,优先实现
- **P1**: 重要但非紧急,增强能力
- **P2**: 锦上添花,后续迭代

## Story Points 估算说明

- **3-5 SP**: 简单配置/小功能,1-2天
- **8 SP**: 中等复杂度,需要设计+实现+测试,3-4天
- **13 SP**: 复杂功能,需要新建引擎/大量测试,5-7天

---

## 关键里程碑

1. **Milestone 1 (Sprint 2结束)**: Topic动态规划可演示
2. **Milestone 2 (Sprint 3结束)**: Phase调度能力完整
3. **Milestone 3 (Sprint 4结束)**: Session重规划可演示
4. **Milestone 4 (Sprint 5结束)**: 完整CBT脚本+四层调试可对外展示 ⭐

---

## 总结

这份Product Backlog按照"纵向切片"原则,优先实现端到端能力(Topic→Phase→Session逐层贯通),每个Sprint交付可演示的增量价值。MVP聚焦在前5个Sprint,确保核心"抬头规划,低头执行"机制可视化验证。
