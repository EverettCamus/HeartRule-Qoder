# Topic动态展开Action队列两阶段LLM Prompt模板

## 概述

本目录包含HeartRule AI咨询引擎中Topic动态展开Action队列功能的两阶段LLM Prompt模板。这些模板采用"决策-规划"两阶段架构，实现智能的话题展开和行动队列生成。

## 核心组件

### 1. Decision Prompt (`decision-llm-v1-final.md`)

**用途**: 分析对话上下文，决定是否需要调整当前话题，以及如何调整。

**输入**:

- 对话历史
- 当前话题状态
- 已提取的实体
- 会话变量

**输出** (JSON格式):

```json
{
  "strategy": "new_entities|deepen_entity|skip_entity|continue_current",
  "reasoning": "决策理由...",
  "entities": [...],
  "needs_adjustment": true/false,
  "adjustment_type": "new_entities|deepen_entity|skip_entity",
  "adjustment_target": "实体名称或null"
}
```

### 2. Planner Prompt (`planner-llm-v1-final.md`)

**用途**: 基于Decision结果，生成具体的Action执行队列。

**输入**:

- Decision输出
- 对话上下文
- 话题配置

**输出** (YAML格式的Action队列):

```yaml
actions:
  - action_id: 'ask_entity_detail'
    action_type: 'ai_ask'
    config:
      question_template: '问题模板...'
      variables:
        - name: 'variable_name'
          type: 'text'
          extraction_method: 'direct'
metadata:
  estimated_time: '3-5分钟'
  priority: 'high|medium|low'
  goal: '行动队列目标...'
```

## 快速开始

### 1. 配置模板变量

模板使用双层变量系统：

1. **系统层变量** (`{%变量名%}`): 在模板加载时由系统替换
   - `{%conversation_history%}`: 对话历史
   - `{%current_topic%}`: 当前话题
   - `{%extracted_entities%}`: 已提取的实体

2. **模板层变量** (`{{变量名}}`): 在prompt中作为占位符，由LLM填充
   - `{{strategy}}`: 决策策略
   - `{{reasoning}}`: 决策理由

### 2. 集成到HeartRule引擎

```typescript
import { PromptTemplateManager } from '@heartrule/core-engine';
import decisionPrompt from './decision-llm-v1-final.md';
import plannerPrompt from './planner-llm-v1-final.md';

// 注册模板
const templateManager = new PromptTemplateManager();
templateManager.registerTemplate('topic-decision', decisionPrompt);
templateManager.registerTemplate('topic-planner', plannerPrompt);

// 使用模板
const decisionResult = await templateManager.render('topic-decision', {
  conversation_history: [...],
  current_topic: 'family_background',
  extracted_entities: ['父亲', '母亲']
});

const planResult = await templateManager.render('topic-planner', {
  decision_output: decisionResult,
  conversation_context: {...}
});
```

### 3. 测试模板

使用内置测试框架：

```bash
# 运行所有测试场景
node test-runner.mjs --all

# 运行特定场景
node test-runner.mjs deepen-entity-scenario

# 运行集成测试
node integration-test.mjs
```

## 测试框架

### 测试场景

1. **`new-entities-scenario.json`**: 测试发现新实体场景
2. **`deepen-entity-scenario.json`**: 测试深化实体场景
3. **`skip-entity-scenario.json`**: 测试跳过实体场景

### 评估标准

详细评估标准见: `test-evaluation-criteria.md`

## 类型定义

TypeScript类型定义: `../../packages/shared-types/src/domain/topic-decision-v2.ts`

```typescript
import {
  TopicDecisionOutput,
  TopicPlanOutput,
  validateDecisionOutput,
  validatePlanOutput
} from '@heartrule/shared-types';

// 使用Zod Schema验证输出
const decision: TopicDecisionOutput = {...};
const isValid = validateDecisionOutput(decision);
```

## 迭代开发记录

### 迭代过程

本模板经过3轮迭代测试和优化：

1. **迭代1**: 基础模板创建和初步测试
2. **迭代2**: 优化变量边界和输出格式
3. **迭代3**: 完善示例和错误处理

详细迭代报告见: `iteration-reports/` 目录

### 测试结果

- **最终通过率**: 100% (3/3场景)
- **决策质量**: 100/100
- **规划质量**: 100/100

详细测试结果: `test-results-summary.md`

## 配置指南

### topic节点YAML配置

```yaml
topic:
  topic_id: 'family_background'
  config:
    # 使用两阶段LLM Pipeline
    pipeline_type: 'two-stage-llm'

    # Decision Prompt配置
    decision_prompt: 'topic-decision' # 模板名称
    decision_llm: 'gpt-4' # LLM模型

    # Planner Prompt配置
    planner_prompt: 'topic-planner'
    planner_llm: 'gpt-4'

    # 变量配置
    variables:
      - name: 'conversation_history'
        source: 'session.messages'
        max_tokens: 2000

      - name: 'extracted_entities'
        source: 'session.variables.entities'

    # 超时设置
    timeout_ms: 30000

    # 重试策略
    retry:
      max_attempts: 3
      backoff_ms: 1000
```

### 自定义模板

要创建自定义模板，建议：

1. 复制现有模板作为基础
2. 修改特定部分的指令
3. 添加领域特定的示例
4. 使用测试框架验证

```bash
# 创建自定义模板
cp decision-llm-v1-final.md my-custom-decision.md

# 修改模板
# ... 编辑 my-custom-decision.md ...

# 测试自定义模板
node test-runner.mjs --custom my-custom-decision.md
```

## 故障排除

### 常见问题

1. **模板变量未替换**
   - 检查变量名拼写
   - 确认变量数据源存在
   - 查看模板管理器日志

2. **LLM输出格式错误**
   - 检查prompt中的格式指令是否清晰
   - 验证示例是否符合预期格式
   - 增加输出验证步骤

3. **测试失败**
   - 检查测试数据格式
   - 验证期望输出是否正确
   - 查看详细错误日志

### 调试工具

```bash
# 查看模板渲染结果
node debug-template.mjs decision-llm-v1-final.md --context context.json

# 验证输出格式
node validate-output.mjs decision-output.json

# 性能分析
node profile-test.mjs --scenario deepen-entity-scenario
```

## 性能优化

### 最佳实践

1. **上下文长度**: 保持对话历史在2000 tokens以内
2. **示例数量**: 每个模板包含3-5个高质量示例
3. **输出格式**: 使用严格的JSON/YAML格式约束
4. **错误处理**: 包含明确的错误情况和处理方式

### 监控指标

- 决策准确率
- 规划质量评分
- 响应时间
- Token使用量

## 版本历史

### v1.0 (2026-03-09)

- 初始发布
- 三阶段迭代开发完成
- 3个测试场景全部通过
- 完整的类型定义和验证
- 端到端集成测试

## 贡献指南

### 开发流程

1. **创建分支**: `feature/topic-prompt-enhancement`
2. **修改模板**: 编辑prompt文件
3. **更新测试**: 添加或修改测试场景
4. **运行测试**: `node test-runner.mjs --all`
5. **更新文档**: 修改README和类型定义
6. **提交PR**: 包含测试结果和文档更新

### 代码规范

- 使用中文编写prompt指令
- 保持一致的格式和结构
- 包含充分的示例
- 添加必要的注释

## 许可证

本模板是HeartRule AI咨询引擎的一部分，遵循项目主许可证。

## 支持

- 问题报告: GitHub Issues
- 文档: HeartRule项目文档
- 讨论: 项目开发频道
