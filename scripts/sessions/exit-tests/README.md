# AI_Ask 退出机制测试脚本

本目录包含用于测试 AI_Ask 退出判断机制的 YAML 脚本。

## 测试文件清单

| 文件                           | 测试场景           | 说明                                         |
| ------------------------------ | ------------------ | -------------------------------------------- |
| `test-max-rounds.yaml`         | max_rounds 安全网  | 验证最大轮次限制作为防止死循环的最后一道防线 |
| `test-required-variables.yaml` | required_variables | 验证必需变量收集完成后的退出行为             |
| `test-silence-rounds.yaml`     | max_silence_rounds | 验证用户沉默/无实质回复时的退出              |
| `test-custom-conditions.yaml`  | custom_conditions  | 验证自定义退出条件的触发                     |
| `test-llm-semantic.yaml`       | LLM语义控制        | 验证理解度、阻抗检测等语义退出               |
| `test-crisis-detection.yaml`   | crisis_detected    | 验证危机检测和处理机制                       |
| `test-comprehensive.yaml`      | 综合测试           | 测试多种退出条件的组合                       |

## 退出条件分类

### 规则控制类（代码实现）

| 字段                  | 说明                   |
| --------------------- | ---------------------- |
| `max_rounds`          | 最大轮次限制（安全网） |
| `required_variables`  | 必须收集的变量列表     |
| `max_silence_rounds`  | 连续无实质内容轮次     |
| `min_response_length` | 最小响应长度（可选）   |
| `custom_conditions`   | 自定义条件             |

### LLM控制类（语义理解）

| 字段                      | 说明                 |
| ------------------------- | -------------------- |
| `understanding_threshold` | 理解度阈值（0-100）  |
| `has_questions`           | 是否允许有疑问时退出 |
| `impedance_threshold`     | 阻抗检测阈值         |
| `topic_drift_threshold`   | 偏题识别阈值         |

## 退出优先级

```
1. max_rounds 触发 → 强制退出（安全网）
2. LLM EXIT=true → 语义层面的退出判断
3. required_variables 全部收集 → 任务完成退出
4. max_silence_rounds 触发 → 用户放弃退出
```

## 已移除的参数

根据设计决策，以下参数已从退出条件中移除：

- `min_rounds` - 在大多数咨询场景中无实际意义
- `max_tokens` - 成本控制应在系统层实现
- `max_cost` - 成本控制应在系统层实现

## 测试方法

1. 将测试脚本导入项目
2. 创建会话并运行
3. 观察退出行为是否符合预期

## 设计文档

详见：`docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`
