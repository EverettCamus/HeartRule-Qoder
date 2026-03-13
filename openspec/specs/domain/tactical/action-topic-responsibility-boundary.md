---
document_id: openspec-specs-domain-tactical-action-topic-responsibility-boundary-md
authority: primary
status: active
version: 1.0.0
last_updated: 2026-03-12
source: openspec
path: specs/domain/tactical/action-topic-responsibility-boundary.md
tags: [authoritative, current, specification, ddd, tactical-design, responsibility-boundary]
search_priority: high
language_note: This document is currently in Chinese and needs translation to English per DDD tactical design language strategy.
---

## **Action层(ai_ask)与Topic层的职能边界**

---

### **一、 核心设计哲学：分层规划与执行**

本设计遵循 **“抬头规划，低头执行”** 的递归式智能架构：

- **Action层（低头执行）**：是系统的“手”与“嘴”，作为**原子执行单元**，专注于稳定、流畅、安全地完成单次交互。其智能是 **“条件反射式”** 的，追求零延迟的可靠输出。
- **Topic层（抬头规划）**：是系统的“战术大脑”，作为**目标攻坚单元**，负责将抽象目标转化为具体行动方案，并在执行中动态调整。其智能是 **“审慎决策式”** 的，应对复杂性与不确定性。

---

### **二、 Action层 (`ai_ask`) 的职责与内置智能**

Action层是一个 **“参数化的单目标追问引擎”**。它接收来自Topic层的明确指令，在限定的对话空间内，通过智能化的多轮交互，完成一次具体的收集任务。

#### **内部智能边界（应包含的能力）**

1.  **微观话术生成与适配**
    - **职责**：将Topic层下发的抽象任务描述（`core_prompt`），转化为自然、流畅的提问语句。
    - **灵活性**：根据用户**上一轮回复的完整性、情绪和语言风格**，动态调整追问策略（如从开放提问转为选择提问）。
    - **实现**：通过轻量级、规则驱动的 `dynamic_prompting` 或极简LLM调用来实现，绝不改变提问的根本目标。

2.  **表达风格调整**
    - **职责**：根据脚本配置的 `tone`（如“温和”、“专业”）和 `ai_role`，自动调整生成语句的语气、人称和用词。
    - **边界**：此调整是统一的、基于配置的，不涉及业务逻辑判断。

3.  **退出条件判断（自主决策）**
    - **职责**：严格按照预定义的 `exit_condition`（如“获得具体事例”、“用户明确拒绝”、“情绪超阈值”）和 `max_rounds`（最大轮次）**独立判断**何时结束本轮追问。
    - **边界**：判断逻辑是确定性的、基于规则的，不涉及对“是否已达成Topic目标”的评估。

4.  **变量提取与格式化**
    - **职责**：按照 `output_variables` 的定义，从用户回答中提取结构化数据。
    - **智能**：可包含简单的文本解析、模式匹配或极简LLM调用，确保提取的准确性和一致性。
    - **边界**：只提取预定义的变量，不进行额外的信息推断或关联分析。

5.  **异常处理与安全兜底**
    - **职责**：检测并处理用户输入的异常情况（如攻击性语言、完全无关的回答、系统错误）。
    - **实现**：通过预定义的异常处理流程和安全策略，确保对话不中断、不失控。
    - **边界**：处理方式应是标准化的、安全的，不尝试“理解”或“修复”异常的根本原因。

#### **外部依赖边界（不应包含的能力）**

1.  **❌ 目标理解与拆解**
    - Action层**不应**理解Topic层的宏观目标，也不应自主拆解复杂任务。
    - **正确做法**：Topic层将宏观目标拆解为具体的、原子化的 `core_prompt`，Action层只需忠实执行。

2.  **❌ 跨轮次状态记忆与推理**
    - Action层**不应**记忆或推理跨越多轮Action的长期状态。
    - **正确做法**：Topic层负责维护跨Action的上下文，并在需要时通过 `context_variables` 传递给Action。

3.  **❌ 业务逻辑判断**
    - Action层**不应**判断“用户回答是否满足业务需求”、“是否应转向其他Topic”等业务逻辑。
    - **正确做法**：Topic层的 `TopicPlanner` 负责此类判断，并据此调度后续Action。

4.  **❌ 创造性问题解决**
    - Action层**不应**在遇到困难时“创造性”地改变提问目标或引入新概念。
    - **正确做法**：遇到无法处理的情况时，应按照 `exit_condition` 退出，并将控制权交还Topic层。

---

### **三、 Topic层的职责与智能边界**

Topic层是一个 **“目标驱动的动态规划器”**。它接收来自Phase层的战略目标，通过智能调度和动态调整，组织一系列Action来达成该目标。

#### **核心职责**

1.  **目标理解与拆解**
    - **职责**：理解 `topic_goal`（如“评估抑郁严重程度”），并将其拆解为一系列具体的、可执行的子任务。
    - **智能**：需要理解领域知识、评估任务复杂度、设计合理的执行序列。

2.  **动态规划与调度**
    - **职责**：根据用户的实时反馈，动态调整Action的执行顺序、内容甚至目标。
    - **智能**：需要评估当前进度、识别障碍、生成替代方案。

3.  **跨Action状态管理**
    - **职责**：维护在整个Topic执行过程中积累的变量、洞察和上下文。
    - **实现**：通过 `topic_variables` 和 `execution_state` 来管理和传递状态。

4.  **退出与转移决策**
    - **职责**：判断Topic目标是否已达成、是否应提前退出、是否应转移到其他Topic。
    - **智能**：需要综合评估收集到的信息、用户状态和咨询进展。

#### **智能实现机制**

1.  **TopicPlanner模块**
    - **功能**：核心规划引擎，负责将 `topic_goal` 转化为具体的Action序列。
    - **输入**：`topic_goal`、`strategy`、当前上下文变量、用户历史。
    - **输出**：下一个要执行的Action及其配置。

2.  **ProgressMonitor模块**
    - **功能**：监控Topic执行进度，评估目标达成度。
    - **实现**：基于预定义的进度评估规则和LLM的轻量级分析。

3.  **AdaptationEngine模块**
    - **功能**：根据执行情况动态调整后续计划。
    - **场景**：用户提供的信息超出预期、遇到阻力、情绪变化等。

---

### **四、 两层之间的接口规范**

#### **Topic → Action 的指令传递**

```yaml
action_config:
  action_type: 'ai_ask'
  action_id: 'ask_depression_frequency'
  config:
    # 核心指令（WHAT）
    core_prompt: '询问用户最近两周情绪低落的频率'

    # 执行参数（HOW）
    tone: '温和'
    ai_role: '关心你的咨询师'
    max_rounds: 3

    # 退出条件（WHEN TO STOP）
    exit_conditions:
      - condition_type: 'variable_extracted'
        variable_name: 'depression_frequency'
      - condition_type: 'user_refusal'
        max_attempts: 1
      - condition_type: 'emotion_threshold'
        emotion: 'frustration'
        threshold: 0.7

    # 输出定义（WHAT TO EXTRACT）
    output_variables:
      - name: 'depression_frequency'
        type: 'categorical'
        options: ['几乎每天', '一半以上天数', '几天', '完全没有']
        extraction_method: 'llm_classification'

    # 上下文注入（CONTEXT）
    context_variables:
      - name: 'user_name'
        value: '{{user_name}}'
      - name: 'previous_topic'
        value: 'basic_info_collection'
```

#### **Action → Topic 的结果反馈**

```yaml
action_result:
  success: true
  completed: true
  extracted_variables:
    depression_frequency: '一半以上天数'
    confidence: 0.85
  metadata:
    rounds_used: 2
    exit_reason: 'variable_extracted'
    user_emotion: 'cooperative'
  conversation_snippet:
    - role: 'assistant'
      content: '最近两周，您有多少天感到情绪低落、沮丧或绝望？'
    - role: 'user'
      content: '大概有八九天吧，感觉挺经常的。'
```

---

### **五、 协作流程示例**

#### **场景：评估睡眠问题**

```
Phase层目标：完成初步心理评估
  ↓
Topic层目标：评估睡眠问题的类型和严重程度
  ↓
TopicPlanner分析：
  1. 需要了解睡眠问题的具体表现（入睡困难、早醒、睡眠质量）
  2. 需要评估问题持续时间、频率
  3. 需要了解对日常生活的影响
  ↓
Action序列规划：
  1. Action 1: 询问睡眠问题类型 (ai_ask)
  2. Action 2: 询问问题频率和持续时间 (ai_ask)
  3. Action 3: 询问对日常功能的影响 (ai_ask)
  ↓
执行与调整：
  - Action 1 执行成功，提取到"入睡困难"
  - ProgressMonitor评估：获得了关键信息，继续执行
  - Action 2 执行中用户表现出焦虑
  - AdaptationEngine调整：简化问题，提前进入Action 3
  - Action 3 执行成功，Topic目标基本达成
  ↓
Topic层决策：睡眠问题评估完成，转入下一个Topic
```

#### **错误协作模式示例**

```
❌ 错误模式1：Action越权
Topic层: "评估睡眠问题"
Action层: "用户说失眠，我应该继续问焦虑问题吗？" ← Action不应做业务判断

✅ 正确模式：
Topic层: "用户报告失眠，ProgressMonitor评估需要探索焦虑关联"
Topic层: 规划新的Action "询问焦虑症状"
Action层: 执行具体的提问任务
```

```
❌ 错误模式2：Topic层过度控制
Topic层: "问睡眠问题，第一轮问类型，第二轮问频率，第三轮问影响..."
Action层: 机械执行，无法根据用户回答动态调整话术

✅ 正确模式：
Topic层: "收集睡眠问题信息，重点关注类型、频率、影响"
Action层: 根据用户回答的完整性，智能调整追问策略
```

---

### **六、 技术实现指导**

#### **Action层的实现要点**

```typescript
class AiAskAction extends BaseAction {
  async execute(context: ActionContext, userInput?: string): Promise<ActionResult> {
    // 1. 解析配置参数
    const { core_prompt, tone, ai_role, max_rounds, exit_conditions } = this.config;

    // 2. 生成适配合适的提问
    const question = this.generateAdaptiveQuestion(core_prompt, tone, ai_role, userInput);

    // 3. 检查退出条件
    if (this.shouldExit(exit_conditions, userInput, context)) {
      return {
        success: true,
        completed: true,
        extracted_variables: this.extractVariables(userInput),
        metadata: { exit_reason: this.getExitReason() },
      };
    }

    // 4. 继续追问或完成
    if (this.currentRound < max_rounds) {
      return {
        success: true,
        completed: false,
        aiMessage: question,
        metadata: { current_round: this.currentRound + 1 },
      };
    }

    // 5. 达到最大轮次，强制退出
    return {
      success: true,
      completed: true,
      extracted_variables: this.extractVariables(userInput),
      metadata: { exit_reason: 'max_rounds_reached' },
    };
  }
}
```

#### **Topic层的实现要点**

```typescript
class TopicPlanner {
  async planNextAction(topic: TopicConfig, context: ExecutionContext): Promise<ActionPlan> {
    // 1. 理解Topic目标
    const goal = this.understandGoal(topic.topic_goal);

    // 2. 评估当前进度
    const progress = this.assessProgress(context.variables, goal);

    // 3. 选择下一个最佳Action
    const nextAction = this.selectBestAction(topic.actions, progress, context.userState);

    // 4. 动态调整Action配置
    const adaptedConfig = this.adaptActionConfig(nextAction.config, context);

    return {
      action: nextAction,
      config: adaptedConfig,
      rationale: this.getPlanningRationale(),
    };
  }
}
```

---

### **七、 验证与测试**

#### **边界验证测试用例**

1.  **Action层独立性测试**
    - 给定相同的输入和配置，Action是否总是产生相同的输出？
    - Action是否在达到退出条件时正确停止，而不继续追问？
    - Action是否严格遵循配置的 `tone` 和 `ai_role`？

2.  **Topic层规划能力测试**
    - TopicPlanner是否能够根据不同的 `topic_goal` 生成合理的Action序列？
    - ProgressMonitor是否能够准确评估Topic目标的达成度？
    - AdaptationEngine是否能够在遇到障碍时生成有效的调整方案？

3.  **两层协作测试**
    - Topic层是否能够正确处理Action层的各种结果（成功、失败、提前退出）？
    - Action层是否能够正确使用Topic层提供的上下文变量？
    - 两层之间的状态传递是否准确无误？

#### **性能指标**

1.  **Action层指标**
    - 响应时间：< 500ms
    - 追问准确率：> 90%
    - 变量提取准确率：> 85%
    - 异常处理成功率：> 95%

2.  **Topic层指标**
    - 规划时间：< 1s
    - 目标达成率：> 80%
    - 动态调整准确率：> 75%
    - 状态管理准确率：> 90%

---

### **八、 总结**

**Action层与Topic层的职能边界**是HeartRule系统架构的核心设计原则：

1.  **分离关注点**：Action专注执行，Topic专注规划
2.  **递归智能**：每层在其职责范围内实现最大化的智能
3.  **明确接口**：通过标准化的接口实现松耦合协作
4.  **可测试性**：清晰的边界使得每层可以独立测试和优化

这种设计确保了系统的：

- **稳定性**：Action层的原子性执行避免错误传播
- **灵活性**：Topic层的动态规划适应复杂场景
- **可维护性**：清晰的边界简化了问题定位和修复
- **可进化性**：每层可以独立改进而不影响其他层

遵循这一边界原则，是构建高质量、可扩展AI咨询系统的关键。

---

**文档版本**：v1.0  
**最后更新**：2026-02-10  
**相关文档**：

- [Topic动态展开Action队列-DDD战术设计](../tactical/topic-action-queue-ddd-tactical-design.md)
- [HeartRule设计哲学](../../strategic/heartrule-design-philosophy.md)
- [五层架构实现指南](../../architecture/layer-implementation-guide.md)
