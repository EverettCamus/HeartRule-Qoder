---
document_id: openspec-specs-product-feature-guides-topic-configuration-guide-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/product/feature-guides/topic-configuration-guide.md
tags: [authoritative, current, specification, product, feature-guide]
search_priority: high
---

# Story 2.1: Topic配置新增字段使用指南

## 概述

Story 2.1为Topic配置增加了两个新字段，用于定义Topic的执行目标和策略：

- **topic_goal**: Topic要达成的具体目标
- **strategy**: 供TopicPlanner规划时参考的策略要点

## topic_goal字段

### 用途

描述该Topic要达成的具体、可验证的目标。

### 语法

```yaml
topics:
  - topic_id: 'collect_caregiver_info'
    topic_name: '收集抚养者信息'
    topic_goal: '了解来访者童年期主要抚养者及关系模式'
    actions:
      # ... actions列表
```

### 编写建议

1. **具体明确**: 使用动词开头，描述要完成什么
2. **可验证**: 目标应该可以通过对话内容判断是否达成
3. **适度抽象**: 不要过于具体（如"询问抚养者姓名"），也不要过于抽象（如"建立良好关系"）
4. **用户中心**: 从用户获益角度描述，而非系统功能角度

### 示例

| 场景         | 好的topic_goal                                     | 不好的topic_goal |
| ------------ | -------------------------------------------------- | ---------------- |
| 收集基本信息 | "了解来访者的基本人口学信息（年龄、职业、居住地）" | "收集用户信息"   |
| 评估抑郁程度 | "评估来访者当前抑郁症状的严重程度"                 | "做抑郁评估"     |
| 探索压力源   | "识别来访者当前生活中的主要压力来源"               | "了解压力"       |

## strategy字段

### 用途

为TopicPlanner提供规划时的策略参考，帮助AI理解如何更好地执行这个Topic。

### 语法

```yaml
topics:
  - topic_id: 'explore_work_stress'
    topic_name: '探索工作压力'
    topic_goal: '了解来访者工作环境中的压力来源及应对方式'
    strategy: |
      1. 从一般性问题开始，逐步深入具体细节
      2. 关注工作环境、人际关系、工作负荷三个维度
      3. 注意区分客观压力源和主观压力感受
      4. 探索来访者已有的应对策略及其效果
    actions:
      # ... actions列表
```

### 策略要点分类

#### 1. 对话节奏策略

- "从开放性问题开始，逐步聚焦"
- "先建立信任，再深入敏感话题"
- "注意对话节奏，避免过快或过慢"

#### 2. 信息收集策略

- "多角度验证信息一致性"
- "关注非言语线索（如回避、情绪变化）"
- "区分事实描述和主观感受"

#### 3. 干预策略

- "先共情，后建议"
- "提供多种选择，让来访者自主决定"
- "小步渐进，避免一次性改变太多"

#### 4. 风险评估策略

- "注意自杀、自伤等风险信号的识别"
- "评估社会支持系统的完整性"
- "判断是否需要紧急干预或转介"

### 编写建议

1. **具体可操作**: 策略应该具体到可以指导AI如何提问和回应
2. **分层递进**: 从一般原则到具体技巧
3. **领域相关**: 结合心理咨询的专业知识
4. **灵活适应**: 考虑不同用户群体的差异

## 两个字段的协同使用

### 理想组合

```yaml
topics:
  - topic_id: 'assess_sleep_issues'
    topic_name: '评估睡眠问题'
    topic_goal: '全面评估来访者的睡眠问题类型、严重程度及影响因素'
    strategy: |
      1. 先了解睡眠问题的具体表现（入睡困难、早醒、睡眠质量等）
      2. 评估问题持续时间、频率和严重程度
      3. 探索可能的生理、心理、环境因素
      4. 了解对日常生活功能的影响
      5. 评估既往治疗经历和效果
    actions:
      # ... actions列表
```

### 字段间关系

1. **goal定义what**: 要达成什么目标
2. **strategy定义how**: 如何达成这个目标
3. **actions定义具体步骤**: 具体的对话行动

## 在TopicPlanner中的应用

### 规划过程

1. **目标理解**: TopicPlanner读取topic_goal，理解本Topic的核心目标
2. **策略选择**: 基于strategy字段，选择适当的对话策略
3. **行动生成**: 结合用户当前状态，生成具体的对话行动
4. **动态调整**: 根据对话进展，动态调整策略和执行方式

### 示例：抑郁评估Topic

```yaml
topics:
  - topic_id: 'depression_assessment'
    topic_name: '抑郁评估'
    topic_goal: '全面评估来访者的抑郁症状、严重程度及功能影响'
    strategy: |
      1. 使用标准化评估工具（如PHQ-9）的核心问题
      2. 关注情绪、认知、行为、生理四个维度的症状
      3. 评估症状持续时间、频率和对功能的影响
      4. 注意自杀风险的评估
      5. 探索症状的可能原因和维持因素
    actions:
      - action_type: 'ai_say'
        action_id: 'intro'
        config:
          content_template: '接下来我想了解一下您最近的情绪状态，这有助于我更好地理解您的情况。'

      - action_type: 'ai_ask'
        action_id: 'mood_question'
        config:
          question_template: '最近两周，您是否经常感到情绪低落、沮丧或绝望？'
          # ... 其他配置
```

## 最佳实践

### 1. goal编写最佳实践

✅ **好的实践**:

- "评估来访者的焦虑症状严重程度"
- "探索来访者的人际关系模式"
- "帮助来访者识别自动负性思维"

❌ **避免的实践**:

- "问一些问题"（太模糊）
- "完成焦虑评估"（系统视角）
- "让用户感觉更好"（不可验证）

### 2. strategy编写最佳实践

✅ **好的实践**:

- 分点列出，清晰易读
- 结合心理咨询专业知识
- 考虑不同用户群体的差异
- 包含风险评估要点

❌ **避免的实践**:

- 过于抽象的原则
- 与技术实现细节混合
- 假设用户具有特定知识
- 忽略安全性和伦理考虑

### 3. 字段维护最佳实践

1. **版本控制**: 当Topic逻辑变更时，同步更新goal和strategy
2. **团队评审**: 重要Topic的goal和strategy应该经过团队评审
3. **用户测试**: 通过实际对话测试goal的达成度和strategy的有效性
4. **持续优化**: 基于使用数据不断优化goal和strategy

## 常见问题解答

### Q1: topic_goal和action的目标有什么区别？

**A**: topic_goal是Topic级别的整体目标，而每个action有自己的具体目标。例如：

- Topic goal: "评估抑郁症状严重程度"
- Action goal: "询问情绪低落频率"

### Q2: strategy字段是必须的吗？

**A**: 不是必须的，但强烈建议填写。对于复杂或专业的Topic，strategy字段能显著提升AI的执行质量。

### Q3: 如何测试goal和strategy的有效性？

**A**: 可以通过：

1. 人工评审goal的明确性和可验证性
2. 模拟对话测试strategy的指导效果
3. 实际用户对话中观察goal达成情况
4. 收集AI执行过程中的困惑或错误

### Q4: goal和strategy应该由谁编写？

**A**: 建议由领域专家（心理咨询师）和AI工程师协作编写：

- 领域专家：确保专业性和有效性
- AI工程师：确保可执行性和技术可行性

## 技术实现细节

### 数据库Schema

```sql
-- topics表新增字段
ALTER TABLE topics ADD COLUMN topic_goal TEXT;
ALTER TABLE topics ADD COLUMN strategy TEXT;
```

### API接口

```typescript
interface TopicConfig {
  topic_id: string;
  topic_name: string;
  topic_goal?: string; // 新增
  strategy?: string; // 新增
  actions: ActionConfig[];
}
```

### 在ScriptExecutor中的使用

```typescript
class TopicPlanner {
  async planTopicExecution(topic: TopicConfig, context: ExecutionContext): Promise<ExecutionPlan> {
    // 使用topic_goal理解Topic目标
    const goal = topic.topic_goal || '未定义目标';

    // 使用strategy指导规划
    const strategy = topic.strategy || '无特定策略';

    // 基于goal和strategy生成执行计划
    return this.generatePlan(goal, strategy, context);
  }
}
```

## 总结

topic_goal和strategy字段的引入，使Topic配置从单纯的"动作序列"升级为"目标导向的智能对话单元"。这种升级带来了以下好处：

1. **目标明确性**: 每个Topic都有清晰、可验证的目标
2. **策略指导性**: AI在执行时有明确的策略参考
3. **质量可评估**: 可以基于goal达成度评估Topic执行质量
4. **持续优化**: 基于strategy的有效性数据不断优化

通过合理使用这两个字段，可以显著提升HeartRule系统的对话质量和专业性。

---

**文档版本**: v1.0  
**最后更新**: 2026-02-15  
**相关Story**: Story 2.1 - Topic配置增强  
**适用版本**: HeartRule 2.0+
