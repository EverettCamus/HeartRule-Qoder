# Smart AI-Ask Exit 测试项目

## 📌 项目概述

**名称**: `smart-ai-ask-exit`  
**目的**: 验证 AI-Ask 退出决策机制 (v1.2) 的 5 个核心场景  
**参考文档**: `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`  
**创建日期**: 2026-03-20

---

## 🎯 5 个测试场景

### 场景1：正常退出 - 信息完整

**文件**: `scenario-1-normal-exit.yaml`

**预期行为**:

- 用户在 2-3 轮内快速、完整地回答问题
- 收集齐所有必需变量（`required_variables` 完整）
- LLM 判定用户理解充分、无阻抗
- 规则引擎检查通过 → **正常退出**

**测试用户输入**:

- 好的响应: "我最近心情特别低落，已经有三个月了。每天都提不起精神。"
  - 两个关键变量已收集 → 继续评估补充信息
- 最优响应: "主要问题是工作压力导致的焦虑，持续了大约半年。我会在周一早上特别紧张，影响了工作效率。"
  - 关键信息+背景 → 直接退出

---

### 场景2：阻抗退出 - 用户回避

**文件**: `scenario-2-impedance-exit.yaml`

**预期行为**:

- 用户对"家庭关系"这类敏感话题表现出回避
- 回答简短、模糊，或表示"不想说"
- LLM 检测到高阻抗（`impedance_score > 60`）
- 规则引擎触发 → **尊重心理边界，优雅退出**

**关键参数**:

- `impedance_threshold: 60` - 阻抗触发阈值

**测试用户输入**:

- 低阻抗: "还好吧。没什么特别的。"
  - 简短且模糊 → 回避信号
- 高阻抗: "我不想讨论这个。可以换个话题吗？"
  - 明确拒绝 → impedance_score > 60 → 规则触发 → 退出
- 隐蔽阻抗: "嗯...这个呀...我不太记得了。可能没什么特别的。"
  - 时间填充 + 记忆缺失 → 隐蔽阻抗 → 退出

---

### 场景3：偏题退出 - 用户离题

**文件**: `scenario-3-topic-drift.yaml`

**预期行为**:

- 用户回答开始偏离主题"焦虑症状"
- 讨论工作八卦、天气、不相关的个人经历
- LLM 检测到话题偏移（`topic_drift_score > 40`）
- 规则引擎触发 → **温和引导，如再次偏离则退出**

**关键参数**:

- `topic_drift_threshold: 40` - 话题偏移触发阈值

**测试用户输入**:

- 轻微偏离: "嗯，焦虑症状的话...对了，你知道吗，最近我的同事..."
  - 开始离题 → LLM 进行一次引导
- 引导后仍离题: 继续聊同事，跟焦虑没关系
  - 多次拒绝回焦点 → topic_drift_score > 40 → 退出
- 明显偏离: "焦虑症状？最近天气真好，我在想去哪里度假..."
  - 完全离题 → 立即退出

---

### 场景4：最大轮次退出 - 安全网触发

**文件**: `scenario-4-max-rounds-safety.yaml`

**预期行为**:

- 无论 LLM 如何判断，一旦达到 `max_rounds` 限制
- 规则引擎 **强制退出**（最后的安全网）
- 防止 LLM 陷入无限循环

**关键参数**:

- `max_rounds: 3` - 设置较低轮数以测试安全网机制

**测试流程**:

```
轮1: AI 提问 → 用户回答 → LLM 评估 exit=false → 继续
轮2: AI 提问 → 用户回答 → LLM 评估 exit=false → 继续
轮3: AI 提问 → 用户回答 → LLM 评估 exit=false → ❌ 强制退出

（即使 LLM 在第3轮想继续，规则层也会强制结束）
```

---

### 场景5：综合条件退出 - 混合评估

**文件**: `scenario-5-comprehensive.yaml`

**预期行为**:

- 结合所有退出条件：`required_variables`、`understanding_threshold`、`impedance_threshold`、`topic_drift_threshold`、`crisis_detected`
- 展示完整的 LLM 输出格式
- 演示优先级决策：危机 > 最大轮次 > 变量完整 > 其他条件

**LLM 完整输出格式**:

```json
{
  "content": "我听到你最近有这些想法...",
  "assessment": "## 风险识别\n危机等级：中等\n## 阻抗分析\n阻抗程度：低(25分)",
  "progress": "## 进度评估\n- [x] 自伤想法：已坦诚回答\n- [ ] 支持系统：未详细探索",
  "exit": "false",
  "brief": "需要继续探索支持系统",
  "crisis_detected": false
}
```

---

## 🚀 快速开始

### 1. 导入项目到数据库

```bash
pnpm tsx scripts/db/import-ai-ask-exit-project.ts
```

### 2. 启动调试

```bash
# 终端1：API 服务
pnpm dev

# 终端2：编辑器
pnpm dev:editor
```

### 3. 在编辑器中加载项目 `smart-ai-ask-exit`

逐个测试 5 个场景，验证退出决策是否符合预期。

---

## 📋 验证清单

对于每个场景：

- [ ] 脚本加载无误
- [ ] LLM 提示词清晰
- [ ] 响应格式为完整 JSON
- [ ] 退出条件正确触发
- [ ] 规则引擎与 LLM 判断协同正确

---

**项目版本**: v1.0  
**创建日期**: 2026-03-20  
**设计文档**: `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`
