# 产品引擎开发知识版图

> 面向"游戏化心理陪伴产品"的两层知识框架：引擎层（通用AI咨询基础设施）与产品层（青少年心理陪伴的领域应用）。
>
> 最后更新: 2026-07-14

---

## 总览

构建一个面向青少年和父母的游戏化心理陪伴产品，需要两类知识：

| 层面                      | 解决的问题                                 | 评价标准                       | 知识来源                         |
| ------------------------- | ------------------------------------------ | ------------------------------ | -------------------------------- |
| **Layer 1: 咨询引擎**     | 如何抽象"咨询"使其能被脚本化、可跨领域复用 | 通用性、可扩展性、可靠性       | 认知科学、软件架构、AI工程       |
| **Layer 2: 心理陪伴产品** | 如何用引擎造出有效且安全的青少年心理产品   | 临床有效性、用户安全、用户体验 | 发展心理学、临床心理学、安全工程 |

**核心洞察**：引擎目前是"单线程执行器"——主线回应（Phase→Topic→Action）已完整，但意识观察（Thread B）、持久记忆（Hindsight）、深度推理（AiThink）全在设计文档中，尚未实现。这意味着引擎能**执行脚本**，但不能**观察自己执行得好不好**。

---

## Layer 1: 咨询引擎 — 让引擎有"耳朵"和"记忆"

### 1.1 元认知架构设计 ⭐⭐⭐⭐⭐

**为什么是最高优先级：** Consciousness system（Thread B）是引擎从"能运行"到"能变聪明"的关键跃迁。没有它，引擎就是没有反馈系统的机器。

引擎现状：

- `MonitorOrchestrator` + `AiAskMonitorHandler` / `AiSayMonitorHandler` 是前身（仅做 per-action 质量评估）
- Consciousness system 设计文档已完成（`docs/design/consciousness-system.md`），定义了主线+支线双线程架构、三种干预模式（feedback / slow_thinking / orchestration）、内置+脚本定义两类意识
- Contradiction detection 和 Emotion detection 设计文档归档在 `openspec/docs/consciousness-design/`
- **代码零行**

需要研读的知识：

1. **反思性实践理论（Reflective Practice）— Donald Schön**
   - 核心概念：knowing-in-action（行动中知）vs reflection-in-action（行动中反思）
   - 优秀咨询师不是在"执行技术"，而是在对话中持续观察、调整、重新框定问题
   - 与引擎的映射：Thread A = knowing-in-action, Thread B = reflection-in-action
   - 推荐：《The Reflective Practitioner》（Schön, 1983）

2. **双过程理论（Dual Process Theory）— Kahneman, Evans, Stanovich**
   - System 1（快速直觉）vs System 2（慢速分析推理）
   - 与引擎的映射：规则层退出判定 = System 1；LLM 深度矛盾分析 = System 2
   - Consciousness 需要在"快速规则检测"和"慢速 LLM 深度分析"之间做资源分配
   - 推荐：《Thinking, Fast and Slow》（Kahneman, 2011）

3. **Actor-Critic 架构模式**
   - Actor（执行策略）与 Critic（评估策略）的分离和交互
   - 与引擎的映射：ScriptExecutor = Actor, Consciousness system = Critic
   - 关键设计问题：Critic 的反馈粒度（per-action? per-topic? per-phase?）、干预时机、多 Critic 冲突仲裁

**落地目标：** 实现 `docs/design/consciousness-system.md` Phase 1 — 框架 + 示例意识（process_quality + emotion_trajectory）

---

### 1.2 记忆系统设计 ⭐⭐⭐⭐

**为什么重要：** 没有记忆的咨询师每次会话都从零开始。记忆系统让引擎能跨会话积累对来访者的理解。

引擎现状：

- `MemoryRepository` port 已定义（retain / recall / reflect），四网络模型（World / Experience / Opinion / Observation）
- Hindsight 集成完整设计（`docs/design/memory-framework.md`），预估 12 周
- Variable-Memory bridge 设计（`docs/design/variable-memory-bridge.md`）
- AiAsk 中 recall 集成设计（`docs/design/ai-ask-memory-recall.md`）
- `FakeMemoryRepository` 测试用，实际 adapter **代码零行**

需要研读的知识：

1. **人脑记忆的多系统模型 — Tulving, Squire**
   - Episodic memory（情节记忆：具体经历）vs Semantic memory（语义记忆：抽象知识）
   - Memory reconsolidation（记忆再巩固）：每次 recall 时记忆被重新编码，可被更新
   - 与引擎的映射：Experience = episodic, World = semantic, Opinion = 情感标记, Observation = 元认知
   - 关键洞察：reflect 操作不是在"生成新记忆"，而是在模拟 reconsolidation — 从多处记忆合成新 insight

2. **GraphRAG — 向量检索 + 知识图谱混合**
   - 向量相似度检索（语义匹配）的局限：无法处理多跳推理、因果链
   - 知识图谱补全：实体解析（"我妈" = "王女士"）、关系抽取（"害怕考试" → causal → "父亲的批评"）
   - 与引擎的映射：你的设计已包含 entity resolution + causal/temporal edges — 这是正确的方向
   - 推荐：Microsoft GraphRAG 论文 + LangChain GraphRAG 实践

3. **记忆衰减与巩固策略**
   - 什么记忆应被强化（多次 recall 命中、与多个 experience 关联的）
   - 什么记忆应被衰减（过时的、被新 evidence 修正的、低置信度的 Opinion）
   - 这是认知模型问题，不是纯技术问题

**落地目标：** 实现 Hindsight adapter + MemoryService（session-start recall → per-action retain → session-end reflect）

---

### 1.3 LLM 评估方法论 ⭐⭐⭐⭐

**为什么重要：** 评估是"知道引擎做得好不好"的前提。没有评估，你无法判断意识系统、记忆系统是否真的改善了咨询质量。

引擎现状：

- `test/eval/` 目录存在，有 tolerance 调优实践
- 缺乏系统化的评估维度定义和 LLM-as-judge 偏差校准

需要研读的知识：

1. **LLM-as-Judge 的系统性偏差**
   - 位置偏差（position bias）：偏好列表中靠前的选项
   - 冗长偏差（verbosity bias）：偏好更长的回答
   - 吸引力偏差（attractiveness bias）：偏好华丽的表达但忽视实质
   - 自我增强偏差（self-enhancement bias）：偏好与自己风格相似的输出
   - 需要对抗策略：打乱顺序、控制长度、多 judge 交叉验证

2. **多维评估框架设计**
   - 一次咨询的质量不能用单一分数衡量
   - 建议维度：共情准确性、信息完整性、安全性、干预适当性、语言自然度
   - 各维度间的独立性检验、评分者间信度（inter-rater reliability）验证
   - 推荐：DeepEval、LangSmith evaluation、Anthropic 的 eval 指南

3. **评估驱动开发（Eval-Driven Development）**
   - 新脚本/新 action 上线前先写 eval case
   - 回归时跑 eval 套件，变差的输出溯源分析
   - 区分"引擎问题"（需改代码）和"脚本问题"（需改 YAML）

**落地目标：** 为 `ai_ask` 和 `ai_say` 建立至少 3 维度的评估套件（共情 / 安全 / 信息完整性）

---

### 1.4 DSL 演进策略 ⭐⭐⭐

**为什么需要关注：** 当 consciousness system 引入 `orchestration` 干预模式（跳过/切换/插入 Topic），DSL 需要在"声明式结构"和"动态编排"之间取得平衡。

引擎现状：

- YAML DSL 是纯声明式的顺序执行流水线（Phase → Topic → Action）
- Consciousness YAML schema 已设计但未加入 JSON Schema 验证
- 当前 DSL 不支持条件分支、循环、跳转

需要研读的知识：

1. **声明式 + 命令式混合 DSL 设计**
   - 你的 DSL 目前类似 Ansible（声明期望状态），但意识干预需要类似编程语言的控制流
   - 混合策略：脚本声明"可调度的选项"（允许跳过/插入的 Topic），意识在运行时做选择
   - 推荐：Fowler《领域特定语言》中关于"适应性 DSL"的讨论

2. **DSL 版本化与脚本迁移**
   - 引擎升级（新增 action 类型、consciousness 类型）→ 旧脚本如何保持兼容？
   - 需要 migration strategy：脚本 schema version 字段 → 迁移规则 → 自动转换
   - 设计原则：新增字段必须有默认值，废弃字段保留过渡期

**落地目标：** 扩展 YAML schema 支持 consciousness 配置 + 条件性动作（optional / conditional actions）

---

## Layer 2: 心理陪伴产品 — 让脚本有"灵魂"和"安全意识"

### 2.1 青少年发展心理学 + 家庭系统理论 ⭐⭐⭐⭐⭐

**为什么是最高优先级：** 这是脚本内容的"原料"。引擎再好，脚本内容不对，一切都是零。

核心知识领域：

1. **依恋理论（Attachment Theory）— Bowlby, Ainsworth**
   - 四种依恋风格：安全型、焦虑型、回避型、混乱型
   - 依恋风格深刻影响青少年如何回应 AI 咨询：
     - 安全型 → 把 AI 当工具，健康使用
     - 焦虑型 → 可能过度依赖（"AI 比父母更懂我"）
     - 回避型 → 可能抗拒任何深入对话
   - 引擎需要能识别依恋风格并适配交互策略
   - 推荐：《Attachment and Loss》（Bowlby）+ 《A Secure Base》（Bowlby）

2. **青少年认知神经发育**
   - 前额叶（理性决策、冲动控制）到 25 岁才完全成熟
   - 杏仁核（情绪反应）在青少年期高度活跃
   - 工程含义：行为层面干预比纯认知层面干预更有效；多感官输入（视觉化情绪、身体感受锚定）优于纯文字对话
   - 推荐：《The Teenage Brain》（Jensen, 2015）

3. **家庭系统理论 — Bowen, Minuchin**
   - 核心概念：三角化（triangulation）、分化（differentiation）、代际传递
   - 青少年问题极少是孤立个体问题——几乎都嵌套在家庭互动模式中
   - 面向"青少年+父母"的产品，需要理解这对关系的动态
   - 推荐：《Family Therapy in Clinical Practice》（Bowen, 1978）

4. **Erikson 心理社会发展阶段**
   - 青少年核心冲突：身份 vs 角色混乱（Identity vs Role Confusion）
   - "我是谁"、"我想成为什么样的人" — 心理陪伴需要帮助青少年探索身份，而非仅在症状层面工作
   - 推荐：《Identity: Youth and Crisis》（Erikson, 1968）

**落地目标：** 基于依恋风格和认知发展水平，设计至少 3 种不同的 `ai_ask` 交互策略模板

---

### 2.2 CBT → ACT → CFT 技术演进 ⭐⭐⭐⭐⭐

**为什么需要多流派：** CBT 假设来访者有元认知能力（"我能观察自己的想法"），很多青少年还没完全发展出来。ACT 和 CFT 提供更适配青少年的替代路径。

核心知识领域：

1. **经典 CBT — Beck, Ellis**
   - 认知模型：情境 → 自动思维 → 情绪/行为/生理反应
   - 核心技术：苏格拉底式提问、认知重构、行为实验、暴露疗法
   - 局限：需要元认知能力；"挑战想法"可能被青少年体验为"被纠正"
   - 推荐：《Cognitive Behavior Therapy: Basics and Beyond》（Beck, 2020 3rd ed.）

2. **接纳承诺疗法（ACT）— Hayes**
   - 核心：不挑战想法，而是接纳想法存在 + 承诺价值驱动的行动
   - 六边形模型：接纳、认知解离、当下觉察、观察自我、价值澄清、承诺行动
   - 与引擎的天然契合：consciousness system 的"支线观察" = ACT 的"观察自我"训练
   - 推荐：《Get Out of Your Mind and Into Your Life》（Hayes, 2005）+ 《ACT Made Simple》（Harris, 2019 2nd ed.）

3. **慈悲聚焦疗法（CFT）— Gilbert**
   - 专门处理羞耻感和自我批评
   - 三系统情绪模型：威胁系统、驱动系统、安抚系统
   - 对中国青少年的特殊适配性：学业失败 → 羞耻 → 自我攻击 → 逃避/崩溃
   - 推荐：《The Compassionate Mind》（Gilbert, 2009）

4. **动机访谈（MI）— Miller & Rollnick**
   - 适用于"被父母逼着来的"青少年 —— 处于 pre-contemplative stage
   - 核心技术：反映性倾听、发展差异（develop discrepancy）、避免争论、滚动抵抗
   - 推荐：《Motivational Interviewing》（Miller & Rollnick, 2012 3rd ed.）

**关键设计洞察：** 引擎需要的不是"一个 CBT 脚本"，而是一个**技术匹配引擎** — 根据来访者特征（年龄、问题类型、改变阶段、依恋风格）匹配合适的干预技术。这对应 `TopicPlanner` 的战略决策能力。

**落地目标：** 为 CBT、ACT、CFT 各编写至少 1 套完整的咨询脚本（Theme → Phase → Topic → Action）

---

### 2.3 安全系统工程 ⭐⭐⭐⭐⭐

**为什么是硬约束：** 这是产品能否合法上线的门槛。面向青少年的心理健康产品，监管压力远大于成人产品。

引擎现状：

- 关键词安全边界检查（不可诊断/开药/保证疗效）
- 危机信号检测（crisis_detected: true 触发警告）
- 可选 double-LLM 安全确认
- 但缺乏系统化的分层安全架构

需要研读的知识：

1. **分层安全架构设计**
   - 规则层（确定性拦截）：自杀/自伤/伤人关键字 + 正则 → 立即升级
   - LLM 安全分类层（概率性标记）：灰色地带（"我觉得活着好累" vs "我想死"）
   - 人类审计层（抽样质量审计）：不是实时干预，而是事后质量监控
   - 关键设计：每层的"硬边界"在哪里？哪层有权力中断会话？

2. **青少年特有的风险场景**
   - 网络霸凌（cyberbullying）迹象识别
   - 自伤社群影响（如 pro-ana、self-harm communities）
   - 性剥削（grooming）行为模式
   - 物质滥用（substance abuse）信号
   - 这些不是传统心理热线的主要场景，但在青少年 AI 产品中必须覆盖

3. **家长端信息不对称设计**
   - 青少年需要隐私（否则不会坦诚）vs 家长需要知情（安全场景）
   - 设计方案：
     - 安全升级通知：不透露具体对话内容，只告知"您的孩子可能需要支持"
     - 治疗进展摘要：聚合的、脱敏的（"最近一周情绪稳定性有所提升"）
     - 家长教育模块：帮家长理解青少年心理，而非只是监控

4. **"陪伴"vs"治疗"的法律边界**
   - 产品定位决定监管路径：
     - "心理健康陪伴" → 不能声称治疗效果，监管较轻
     - "数字疗法（DTx）" → 需要 FDA/NMPA 认证，监管极重
   - 青少年数据隐私：COPPA（美国）、GDPR-K（欧洲）、《个人信息保护法》（中国）

**落地目标：** 实现三层安全架构的规则层 + 设计 LLM 安全分类层的 prompt 模板

---

### 2.4 行为设计用于心理改善 ⭐⭐⭐⭐

**为什么需要区分于"游戏留存"：** 心理健康产品的"留存"目标和游戏的"留存"有本质区别——你不是要让用户花更多时间，而是要让他们在"刚好够"的参与中产生真实的心理改善。

核心知识领域：

1. **自我决定理论（SDT）— Deci & Ryan**
   - 三个基本心理需求：自主性（autonomy）、胜任感（competence）、关系感（relatedness）
   - 游戏化应强化这三者，而非用外在奖励替代
   - 推荐：《Self-Determination Theory》（Ryan & Deci, 2017）

2. **自我效能感（Self-Efficacy）— Bandura**
   - 四个来源：掌握经验（小任务成功）、替代经验（看到同龄人故事）、社会说服（AI 的鼓励）、生理状态解读
   - 引擎应追踪这四类"效能证据"，在适当时机呈现给用户
   - 推荐：《Self-Efficacy: The Exercise of Control》（Bandura, 1997）

3. **Fogg 行为模型（B=MAP）**
   - 行为 = 动机（Motivation）× 能力（Ability）× 提示（Prompt）
   - 每个 `ai_ask` 提出的"行为实验"或"作业"必须在这三个维度上可行
   - 推荐：《Tiny Habits》（Fogg, 2019）

4. **"游戏化"在心理健康中的正确形态**
   - ❌ 不是：积分、等级、排行榜、连续打卡（Duolingo 式黑暗模式在心理健康中是绝对不能用的）
   - ✅ 是：
     - 叙事化：心理成长包装为英雄之旅（Persona 式的社交链接）
     - 渐进式挑战：难度匹配能力，创造心流（Csikszentmihalyi）
     - 可视化反馈：让不可见的心理过程可见（情绪变化曲线、信念地图）
   - 终极成功指标不是 DAU，而是"用户带着技能离开"
   - 推荐：《Actionable Gamification》（Chou, 2015 — Octalysis 框架）

5. **戒断机制与"毕业路径"**
   - 当用户的心理指标持续改善 → 主动降频、简化干预、鼓励自治
   - "你最近做得很好，我们下周见？" vs "你还需要每天跟我聊聊"
   - 设计原则：AI 的目标是让自己变得"不再被需要"

**落地目标：** 设计"毕业路径"的状态机（从每日 → 每周 → 按需），以及行为实验的难度分级系统

---

### 2.5 中国文化语境下的心理干预适配 ⭐⭐⭐

核心知识领域：

1. **中国式亲子冲突的文化动力**
   - 学业期待（"为你好"的正当性叙事）
   - 面子文化（"别人家的孩子"的社会比较）
   - 孝道期望（"听话"作为道德要求）
   - 这些不是 CBT 教科书里的"认知扭曲"，而是真实的、有文化根基的价值观

2. **高语境沟通中的情绪识别**
   - 中国文化中情绪表达更间接、更压抑
   - "还行" = 可能意味着"我很糟糕但不想谈"
   - "我就是为他好" = 可能意味着"我很焦虑但我不知道怎么表达"
   - 变量提取系统需要理解这种间接性

3. **污名化解构与渐进式入口**
   - 很多中国父母不认为孩子有"心理问题"（太严重了），只认为"不听话"或"学习态度不好"
   - 产品入口设计：从"学习辅导/成长工具"到"心理健康"的渐进过渡
   - 话术策略：避免使用"治疗"、"症状"、"障碍"等临床标签，改用"习惯"、"模式"、"成长"

4. **推荐的本地化心理学资源**
   - 台湾心理咨询本土化研究（黄光国、杨国枢的"本土心理学"）
   - 大陆家庭治疗实践（方新、赵旭东的系统家庭治疗）
   - 青少年网络心理咨询的中国经验

**落地目标：** 编写至少 1 套经过文化适配的亲子沟通主题脚本

---

## 优先级路线图

```
Phase 1: 引擎层基础 + 产品层临床内核（优先级 ⭐⭐⭐⭐⭐）

  1.1 元认知架构设计 ────→ 实现 Consciousness system
  1.2 记忆系统设计   ────→ 实现 Hindsight 集成
  2.1 青少年心理 + 家庭系统 ──→ 脚本内容的知识基础
  2.2 ACT/CFT 技术体系 ────→ 多流派干预策略
  2.3 安全系统工程   ────→ 分层安全架构

Phase 2: 引擎层完善 + 产品层体验（优先级 ⭐⭐⭐⭐）

  1.3 LLM 评估方法论 ────→ 系统化 eval 体系
  2.4 行为设计 ──────────→ 毕业路径 + 心流设计
  2.5 中国文化适配 ────────→ 本地化脚本

Phase 3: 引擎层长期演进（优先级 ⭐⭐⭐）

  1.4 DSL 演进策略 ────────→ 声明式 + 动态编排混合
```

---

## 推荐阅读清单（按阅读顺序）

### 引擎层

| #   | 书名                        | 作者            | 关联领域   | 优先级     |
| --- | --------------------------- | --------------- | ---------- | ---------- |
| 1   | The Reflective Practitioner | Schön (1983)    | 元认知架构 | ⭐⭐⭐⭐⭐ |
| 2   | Thinking, Fast and Slow     | Kahneman (2011) | 双过程理论 | ⭐⭐⭐⭐⭐ |
| 3   | 领域特定语言                | Fowler (2010)   | DSL 设计   | ⭐⭐⭐     |
| 4   | Building LLM Apps           | various         | LLM 评估   | ⭐⭐⭐⭐   |

### 产品层

| #   | 书名                                                    | 作者                     | 关联领域       | 优先级     |
| --- | ------------------------------------------------------- | ------------------------ | -------------- | ---------- |
| 1   | ACT Made Simple (2nd ed.)                               | Harris (2019)            | ACT 技术       | ⭐⭐⭐⭐⭐ |
| 2   | The Compassionate Mind                                  | Gilbert (2009)           | CFT 技术       | ⭐⭐⭐⭐⭐ |
| 3   | The Teenage Brain                                       | Jensen (2015)            | 青少年神经发育 | ⭐⭐⭐⭐⭐ |
| 4   | Cognitive Behavior Therapy: Basics and Beyond (3rd ed.) | Beck (2020)              | CBT 技术       | ⭐⭐⭐⭐   |
| 5   | Attachment and Loss (Vol. 1)                            | Bowlby (1969)            | 依恋理论       | ⭐⭐⭐⭐   |
| 6   | Motivational Interviewing (3rd ed.)                     | Miller & Rollnick (2012) | 动机访谈       | ⭐⭐⭐⭐   |
| 7   | Self-Determination Theory                               | Ryan & Deci (2017)       | 行为设计       | ⭐⭐⭐⭐   |
| 8   | Tiny Habits                                             | Fogg (2019)              | 行为设计       | ⭐⭐⭐     |
| 9   | Family Therapy in Clinical Practice                     | Bowen (1978)             | 家庭系统       | ⭐⭐⭐     |
| 10  | Identity: Youth and Crisis                              | Erikson (1968)           | 青少年发展     | ⭐⭐⭐     |
