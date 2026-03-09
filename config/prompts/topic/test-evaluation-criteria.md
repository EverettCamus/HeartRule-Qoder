# Prompt测试评估标准

## 概述

本文档定义了HeartRule AI咨询引擎中Topic决策与规划提示词的测试评估标准。这些标准用于评估提示词的质量、一致性和有效性，支持实践导向的迭代开发工作流：测试 → 分析 → 优化 → 重测。

## 评估维度

### 1. 决策提示词（Decision Prompt）评估标准

#### 1.1 格式正确性

- **JSON结构完整性**：输出必须符合预定义的JSON Schema
- **必需字段存在**：`needsAdjustment`, `strategy`, `reasoning`, `adjustmentPlan`必须存在
- **数据类型正确**：布尔值、字符串、数组、对象类型必须正确
- **枚举值有效**：`strategy`和`intent`必须使用预定义的枚举值

#### 1.2 内容相关性

- **推理过程充分性**：`reasoning`字段必须清晰解释决策依据
- **上下文敏感性**：决策必须基于提供的对话历史和实体状态
- **策略适当性**：选择的`strategy`必须与场景匹配
- **意图合理性**：为每个实体分配的`intent`必须合理

#### 1.3 业务逻辑正确性

- **调整必要性判断**：`needsAdjustment`必须正确反映场景需求
- **实体识别准确性**：必须识别所有相关实体
- **行动需求合理性**：`actionsNeeded`必须与实体意图匹配
- **约束条件遵守**：必须遵守`constraints`中的限制

#### 1.4 情感智能

- **情绪信号检测**：必须检测对话中的情绪基调
- **共情表达**：决策应体现对用户情感状态的理解
- **抗拒处理**：当用户表达抗拒时，应采取适当策略

### 2. 规划提示词（Planner Prompt）评估标准

#### 2.1 YAML格式正确性

- **语法正确性**：YAML语法必须正确，无解析错误
- **缩进一致性**：必须使用一致的缩进（建议2空格）
- **必需字段完整**：每个Action必须包含所有必需字段
- **Schema符合性**：必须符合ActionConfig[] Schema

#### 2.2 命名规范遵守

- **Action ID规范**：必须遵循`{entity_type}_{index}_{purpose_slug}`格式
- **变量命名规范**：必须遵循`{entity_type}_{index}_{variable_suffix}`格式
- **后缀一致性**：变量后缀必须使用预定义的标准后缀

#### 2.3 内容质量

- **自然语言流畅性**：`content`字段必须自然、流畅、符合对话语境
- **问题设计质量**：问题必须开放、引导性、单一焦点
- **渐进深入性**：问题序列必须体现渐进深入的原则
- **共情表达**：必须包含适当的共情表达

#### 2.4 技术正确性

- **变量提取配置**：`output`字段必须正确配置变量提取
- **提取方法适当性**：`extraction_method`必须与变量类型匹配
- **轮次限制合理**：`max_rounds`必须合理设置
- **思考目标明确性**：`think_goal`必须清晰明确

### 3. 集成评估标准

#### 3.1 决策-规划一致性

- **意图实现度**：规划输出必须完全实现决策的意图
- **行动对应性**：生成的Actions必须对应`actionsNeeded`中的描述
- **变量实现度**：`variableTargets`中指定的变量必须在规划中实现

#### 3.2 实体索引一致性

- **索引分配一致性**：实体索引必须在决策和规划中保持一致
- **新实体索引正确**：新实体必须按顺序分配新索引
- **已有实体索引保留**：已有实体必须保留原索引

#### 3.3 插入策略遵守

- **策略实现度**：必须正确实现`insertionStrategy`
- **位置准确性**：如果指定`targetPosition`，必须准确实现

## 评分系统

### 评分等级

- **A (优秀)**: 90-100分 - 完全符合标准，质量卓越
- **B (良好)**: 75-89分 - 基本符合标准，有少量改进空间
- **C (合格)**: 60-74分 - 主要标准符合，有明显改进空间
- **D (不合格)**: <60分 - 不符合关键标准

### 评分权重

| 维度           | 权重 | 说明                         |
| -------------- | ---- | ---------------------------- |
| 决策格式正确性 | 15%  | JSON结构、必需字段、数据类型 |
| 决策内容质量   | 25%  | 推理、策略、意图、业务逻辑   |
| 规划格式正确性 | 15%  | YAML语法、命名规范、必需字段 |
| 规划内容质量   | 25%  | 自然语言、问题设计、共情表达 |
| 集成一致性     | 20%  | 意图实现、索引一致、策略遵守 |

### 扣分细则

1. **严重错误**（-20分/项）：
   - JSON/YAML解析失败
   - 必需字段缺失
   - 枚举值无效
   - 违反约束条件

2. **中等错误**（-10分/项）：
   - 命名规范违反
   - 变量提取配置错误
   - 索引不一致
   - 插入策略未实现

3. **轻微错误**（-5分/项）：
   - 语言不自然
   - 问题设计不佳
   - 共情表达不足
   - 推理不充分

## 测试工作流

### 1. 测试执行阶段

```bash
# 运行测试脚本
./test-runner.sh --scenario new-entities-scenario

# 批量运行所有测试
./test-runner.sh --all
```

### 2. 分析评估阶段

1. **自动评估**：脚本自动检查格式正确性和命名规范
2. **人工评估**：人工评估内容质量和业务逻辑正确性
3. **集成检查**：检查决策与规划的一致性

### 3. 优化迭代阶段

1. **问题识别**：基于评估结果识别具体问题
2. **提示词优化**：修改提示词模板解决识别的问题
3. **示例完善**：根据需要添加或修改示例

### 4. 重测验证阶段

1. **重新测试**：运行优化后的提示词
2. **效果对比**：比较优化前后的评估结果
3. **迭代决策**：决定是否继续优化或接受当前版本

## 实践导向的工作模式

### 核心原则

1. **快速迭代**：小步快跑，频繁测试
2. **数据驱动**：基于测试结果进行优化
3. **领域专家参与**：领域专家直接参与提示词迭代
4. **版本控制**：每次优化都创建新版本

### 工作流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   测试      │───▶│   分析      │───▶│   优化      │───▶│   重测      │
│   (Test)    │    │  (Analyze)  │    │ (Optimize)  │    │  (Retest)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                  │
       └───────────────────┴───────────────────┴──────────────────┘
                             持续迭代
```

### 工具支持

1. **测试脚本**：`test-runner.sh` - 自动化测试执行
2. **评估报告**：自动生成详细的评估报告
3. **对比工具**：支持版本间对比分析
4. **可视化仪表板**：展示测试结果和趋势

## 测试数据集管理

### 数据集结构

```
test-data/
├── new-entities-scenario.json      # 新实体场景
├── deepen-entity-scenario.json     # 深化实体场景
├── skip-entity-scenario.json       # 跳过实体场景
├── emotion-response-scenario.json  # 情绪响应场景（未来扩展）
└── custom-scenario-template.json   # 自定义场景模板
```

### 场景扩展指南

1. **复制模板**：基于`custom-scenario-template.json`创建新场景
2. **定义场景**：填写`scenario_name`和`description`
3. **配置上下文**：设置`topic_config`、`conversation_history`、`existing_entities`
4. **定义期望输出**：设置`expected_decision_output`和`expected_planner_output`
5. **设置评估标准**：配置`evaluation_criteria`

### 版本控制

- 每次提示词优化创建新版本（如`v1.1`、`v1.2`）
- 测试数据集与提示词版本关联
- 保留历史测试结果用于趋势分析

## 附录

### A. 预定义枚举值

#### 策略类型（strategy）

- `NEW_ENTITIES`：发现新实体需要处理
- `DEEPEN_ENTITY`：深化已有实体的信息收集
- `SKIP_ENTITY`：跳过某些实体
- `REORDER_ACTIONS`：重新排序现有Actions
- `CUSTOM`：自定义调整策略

#### 实体意图（intent）

- `NEW`：全新实体，需要完整信息收集流程
- `EXTEND`：已有实体，补充额外信息
- `DEEPEN`：深化已有实体的情感/关系维度
- `SKIP`：跳过该实体处理

#### 插入策略（insertionStrategy）

- `APPEND_TO_END`：追加到队列末尾
- `INSERT_AFTER_CURRENT`：插入到当前Action之后
- `INSERT_BEFORE_TOPIC_END`：插入到Topic结束之前

### B. 变量后缀规范

| 后缀         | 含义     | 示例                             |
| ------------ | -------- | -------------------------------- |
| name         | 姓名     | caregiver_0_name                 |
| relationship | 关系类型 | caregiver_1_relationship         |
| role         | 角色描述 | caregiver_2_role                 |
| memory       | 记忆描述 | caregiver_0_childhood_memory     |
| emotion      | 情感体验 | caregiver_1_emotional_tone       |
| quality      | 关系质量 | caregiver_2_relationship_quality |
| detail       | 关系细节 | caregiver_0_relationship_detail  |
| impact       | 影响描述 | caregiver_0_work_impact          |

### C. 评估报告模板

```json
{
  "test_run_id": "2026-03-09T21:30:00Z",
  "scenario": "new-entities-scenario",
  "prompt_version": "decision-llm-v1-draft.md",
  "scores": {
    "decision_format": 95,
    "decision_content": 88,
    "planner_format": 92,
    "planner_content": 85,
    "integration": 90,
    "overall": 88
  },
  "issues": [
    {
      "severity": "medium",
      "category": "naming_convention",
      "description": "Action ID 'caregiver_1_say_welcome' 应使用连字符而非下划线",
      "suggestion": "改为 'caregiver-1-say-welcome'"
    }
  ],
  "recommendations": ["优化问题设计，使其更加开放", "增加共情表达", "完善变量提取配置"]
}
```
