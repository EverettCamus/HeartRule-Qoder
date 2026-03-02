# LLM稳定生成Action队列技术方案

## 1. 问题陈述

在Topic动态调整Action队列的场景下，需要让LLM能够：

- 生成符合YAML语法的脚本
- 合理选择Action类型（`ai_say`, `ai_ask`, `ai_think`, `use_skill`）
- 正确定义和引用脚本变量
- 配置完整的Action参数
- 保证生成结果的逻辑连贯性

### 1.1 核心挑战

| 挑战           | 描述                                   | 难度 |
| -------------- | -------------------------------------- | ---- |
| **语法正确性** | YAML缩进、字段名、嵌套结构必须精确     | 高   |
| **语义合理性** | Action类型选择、参数配置需符合业务逻辑 | 高   |
| **变量一致性** | 变量定义、引用、作用域需要前后一致     | 中   |
| **完整性**     | 必填字段不能遗漏，可选字段合理使用     | 中   |

### 1.2 解决方案思路

纯Prompt方案难以保证稳定性，需要采用**多层约束 + 验证修正**的综合策略。

## 2. HeartRule现有基础设施

### 2.1 JSON Schema定义

项目已具备完整的Action配置Schema定义：

```
packages/core-engine/src/adapters/inbound/script-schema/
├── actions/
│   ├── ai-ask.schema.json      # ai_ask配置Schema
│   ├── ai-say.schema.json      # ai_say配置Schema
│   ├── ai-think.schema.json    # ai_think配置Schema
│   ├── use-skill.schema.json   # use_skill配置Schema
│   └── base.schema.json        # Action基础Schema
├── common/
│   └── output-field.schema.json # 输出字段Schema
├── session.schema.json         # Session Schema
├── phase.schema.json           # Phase Schema
└── topic.schema.json           # Topic Schema
```

### 2.2 Schema Registry与验证器

```typescript
// schema-registry.ts - Schema注册与验证
export class SchemaRegistry {
  private ajv: Ajv;
  private compiledSchemas: Map<string, ValidateFunction>;

  // 编译并缓存所有Schema
  compileAllSchemas(): void;

  // 验证Action配置
  validateAction(actionType: string, config: any): ValidationResult;
}

// schema-validator.ts - 综合验证服务
export class SchemaValidator {
  // 验证完整Session脚本
  validateSession(yamlContent: string): ValidationResult;

  // 验证单个Action
  validateAction(actionConfig: any): ValidationResult;
}
```

### 2.3 Schema-to-Prompt转换器

```typescript
// schema-prompt-generator.ts - 将Schema转换为LLM提示词约束
export class SchemaPromptGenerator {
  // 生成Action配置约束提示词
  generateActionConstraintsPrompt(actionType: string): string;

  // 生成完整Session约束提示词
  generateSessionConstraintsPrompt(): string;
}
```

## 3. 五层约束框架设计

```
┌─────────────────────────────────────────┐
│  第五层：验证与修正循环                  │
│  • Schema验证 + 自动修正                │
│  • 一致性检查 + 补充完善                 │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  第四层：领域知识注入                   │
│  • Action选择规则（何时用say/ask/think）│
│  • 变量设计指南                         │
│  • 序列编排原则                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  第三层：分步生成策略                   │
│  • 步骤1：确定Topic目标                 │
│  • 步骤2：设计Action序列逻辑            │
│  • 步骤3：选择具体Action类型            │
│  • 步骤4：配置每个Action                │
│  • 步骤5：定义变量                      │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  第二层：结构化输出约束                 │
│  • JSON Schema约束                      │
│  • 必须/可选字段说明                    │
│  • 枚举值限制                           │
│  • 数值范围约束                         │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  第一层：高质量示例                     │
│  • 完整的YAML示例                       │
│  • 常见模式示例                         │
│  • 最佳实践示例                         │
└─────────────────────────────────────────┘
```

## 4. 各层详细实现

### 4.1 第一层：高质量示例库

**示例分类与组织**

```yaml
# config/examples/action_patterns/
├── information_gathering.yaml    # 信息收集模式
├── assessment_evaluation.yaml    # 评估分析模式
├── psychoeducation.yaml          # 心理教育模式
├── intervention.yaml             # 干预技术模式
└── closure_summary.yaml          # 总结收尾模式

# 示例文件结构
information_gathering:
  name: "信息收集模式"
  description: "适用于了解用户基本情况、问题背景的Topic"
  patterns:
    - name: "渐进式信息收集"
      scenario: "需要逐步了解多个相关信息点"
      example_yaml: |
        actions:
          - action_type: "ai_ask"
            action_id: "ask_basic_info"
            config:
              content: "请问您的姓名和年龄是？"
              output:
                - get: "user_name"
                  define: "用户姓名"
                - get: "user_age"
                  define: "用户年龄"
          - action_type: "ai_ask"
            action_id: "ask_contact_reason"
            config:
              content: "今天想和我聊些什么？"
              output:
                - get: "chief_complaint"
                  define: "主要诉求"
```

**示例选择策略**

```typescript
class ExampleSelector {
  // 根据Topic目标匹配最相关的示例
  selectRelevantExamples(topicGoal: string, count: number = 3): ActionPattern[] {
    // 1. 关键词匹配
    const keywords = this.extractKeywords(topicGoal);

    // 2. 语义相似度计算（可选，需嵌入模型）
    const similarityScores = this.calculateSimilarity(keywords);

    // 3. 返回top-N相关示例
    return this.rankAndSelect(similarityScores, count);
  }
}
```

### 4.2 第二层：结构化输出约束

**利用现有SchemaPromptGenerator**

```typescript
// 在生成提示词时调用
const constraintsPrompt = schemaPromptGenerator.generateActionConstraintsPrompt('ai_ask');

// 生成的约束示例
/*
ai_ask 动作配置约束：

必填字段：
- content (string, minLength: 1): 提问内容模板

可选字段：
- tone (string): 语气风格
- exit (string): 退出条件表达式
- max_rounds (number, range: 1-10): 最大追问轮数
- output (array): 输出变量配置
  - get (string, required): 提取变量名
  - define (string): 变量定义说明
  - value (string): 直接设置值

约束：
- content中可使用{{variable}}引用已定义变量
- max_rounds范围1-10
- output数组每个元素必须包含get字段
*/
```

**增强的约束提示词模板**

```markdown
## Action配置格式约束

### 全局约束

1. action_type只能取以下值之一：
   - "ai_say": 向用户传达信息
   - "ai_ask": 向用户提问收集信息
   - "ai_think": 内部分析思考
   - "use_skill": 调用咨询技术脚本

2. action_id命名规范：
   - 使用小写字母和下划线
   - 简洁描述动作目的，如"ask_name", "explain_process"
   - 同一Topic内不能重复

3. YAML缩进规则：
   - 使用2个空格缩进
   - 不要使用Tab
   - 注意嵌套层级的对齐

### ai_ask配置约束

{{ai_ask_constraints}}

### ai_say配置约束

{{ai_say_constraints}}

### ai_think配置约束

{{ai_think_constraints}}
```

### 4.3 第三层：分步生成策略

**提示词模板：分步引导生成**

```markdown
## Action队列生成任务

请按以下步骤生成Action队列：

### 步骤1：确定Action序列逻辑

根据Topic目标，先设计Action序列的逻辑框架：

- 开场：[目的说明]
- 中间：[信息收集/分析]
- 收尾：[总结反馈]

### 步骤2：为每一步选择Action类型

参考选择规则：
| 剧情阶段 | 推荐Action类型 | 说明 |
|---------|---------------|------|
| 开场说明 | ai_say | 说明目的、建立关系 |
| 信息收集 | ai_ask | 提问并定义output变量 |
| 内部分析 | ai_think | 分析数据、评估状态 |
| 总结反馈 | ai_say | 信息汇总、下一步指示 |

### 步骤3：配置每个Action

严格按照下方的Schema约束填写配置字段。

{{schema_constraints}}

### 步骤4：定义变量

确保变量设计的合理性：

- 每个ai_ask定义要提取的变量
- 变量名具描述性：user_name, emotion_score
- 后续Action可引用：{{user_name}}

### 步骤5：生成YAML

按以上规划，生成完整的YAML配置。
```

### 4.4 第四层：领域知识注入

**Action类型选择决策规则**

| 场景类型 | 首选Action        | 次选Action        | 选择理由                   |
| -------- | ----------------- | ----------------- | -------------------------- |
| 信息传达 | `ai_say`          | -                 | 单向输出，无需用户输入     |
| 信息收集 | `ai_ask`          | `ai_say`+`ai_ask` | 需要定义output变量收集信息 |
| 内部处理 | `ai_think`        | -                 | 不涉及用户交互，纯内部推理 |
| 技能调用 | `use_skill`       | -                 | 调用预定义咨询技术脚本     |
| 混合场景 | `ai_say`→`ai_ask` | -                 | 先说明再提问，降低认知负荷 |

**变量设计最佳实践**

```yaml
# 好的变量设计示例
output:
  - get: "user_name"           # 简洁明确
    define: "用户姓名"           # 有中文说明

  - get: "depression_score"    # 描述性名称
    define: "抑郁程度评分"
    value: "{{self_report}}"   # 可以引用其他变量

# 常见错误示例（需避免）
output:
  - get: "var1"                # ❌ 无意义名称
  - get: "user_information"    # ❌ 太笼统
  - get: "x"                   # ❌ 单字母变量
```

**变量引用模式**

```yaml
# 模式1：链式引用
actions:
  - action_type: ai_ask
    config:
      content: '请问您的名字是？'
      output:
        - get: user_name
          define: '用户姓名'

  - action_type: ai_say
    config:
      content: '{{user_name}}，欢迎您！'

  # 模式2：条件变量（高级用法）
  - action_type: ai_think
    config:
      content: |
        分析用户情绪评分{{emotion_score}}。
        {% if emotion_score > 7 %}
        用户情绪异常，需要关注。
        {% endif %}
```

### 4.5 第五层：验证与修正循环

**验证管道架构**

```
生成输出 → Schema验证 → 语法检查 → 逻辑一致性检查 → 人工/自动修正
    ↑                                                        │
    └──────────────────── 错误反馈 ←───────────────────────────┘
```

**验证器实现**

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

class ActionConfigValidator {
  // 1. Schema验证
  validateSchema(actions: ActionConfig[]): ValidationResult;

  // 2. 变量一致性检查
  validateVariableConsistency(actions: ActionConfig[]): ValidationResult;

  // 3. 逻辑流程检查
  validateLogicalFlow(actions: ActionConfig[]): ValidationResult;

  // 4. 综合验证
  validateAll(actions: ActionConfig[]): ValidationResult {
    const results = [
      this.validateSchema(actions),
      this.validateVariableConsistency(actions),
      this.validateLogicalFlow(actions),
    ];

    return this.aggregateResults(results);
  }
}
```

**自动修正机制**

```typescript
class AutoCorrector {
  // 常见错误及其修正规则
  private correctionRules: Map<string, CorrectionRule> = new Map([
    [
      'missing_output',
      {
        pattern: /ai_ask.*without.*output/,
        fix: (action) => ({ ...action, config: { ...action.config, output: [] } }),
      },
    ],
    [
      'invalid_indent',
      {
        pattern: /inconsistent.*indentation/,
        fix: (action) => this.normalizeIndentation(action),
      },
    ],
    [
      'undefined_variable',
      {
        pattern: /undefined.*variable.*{{(.+)}}/,
        fix: (action, match) => this.addVariableDefinition(action, match[1]),
      },
    ],
  ]);

  correct(result: ValidationResult, actions: ActionConfig[]): ActionConfig[] {
    let corrected = [...actions];

    for (const error of result.errors) {
      const rule = this.correctionRules.get(error.type);
      if (rule) {
        corrected = rule.fix(corrected, error.details);
      }
    }

    return corrected;
  }
}
```

## 5. 完整生成管道实现

### 5.1 管道架构

```typescript
class ActionGenerationPipeline {
  // 阶段1：准备 - 收集上下文、选择示例
  async prepareContext(input: GenerationInput): Promise<PreparedContext>;

  // 阶段2：生成 - 调用LLM，支持重试
  async generateWithRetry(context: PreparedContext, maxRetries: number): Promise<string>;

  // 阶段3：解析 - YAML解析
  parseYAML(yamlContent: string): ActionConfig[];

  // 阶段4：验证 - Schema验证 + 一致性检查
  validateActions(actions: ActionConfig[]): ValidationResult;

  // 阶段5：修正 - 自动修正常见错误
  autoCorrect(actions: ActionConfig[], validation: ValidationResult): ActionConfig[];

  // 阶段6：增强 - 添加文档注释
  enhanceDocumentation(actions: ActionConfig[]): ActionConfig[];
}
```

### 5.2 重试机制设计

**重试策略**

| 重试次数 | Temperature | 策略       | 说明                     |
| -------- | ----------- | ---------- | ------------------------ |
| 第1次    | 0.7         | 创造性生成 | 探索可能的最佳结果       |
| 第2次    | 0.5         | 约束增强   | 在提示词中强调Schema约束 |
| 第3次    | 0.3         | 保守生成   | 严格遵循示例格式         |

**错误反馈机制**

```typescript
interface RetryContext {
  previousError: string;
  previousOutput: string;
  attemptNumber: number;

  // 构建修正提示词
  buildCorrectionPrompt(): string {
    return `
## 上次生成存在的问题

错误类型：${this.previousError}

上次生成的YAML：
\`\`\`yaml
${this.previousOutput}
\`\`\`

## 修正要求
请根据以下错误信息修正上述YAML：
${this.getErrorSpecificGuidance()}
    `;
  }

  private getErrorSpecificGuidance(): string {
    const guidance = {
      'schema_violation': '检查必填字段是否完整，字段类型是否正确',
      'yaml_syntax': '检查缩进是否正确（使用2空格），冒号后是否有空格',
      'variable_inconsistency': '确保引用的变量已在之前的action中定义',
      'missing_output': 'ai_ask类型必须包含output字段定义要提取的变量'
    };
    return guidance[this.previousError] || '请仔细检查并修正错误';
  }
}
```

## 6. 生成质量评估

### 6.1 质量指标体系

| 维度           | 指标             | 权重 | 评估方法            |
| -------------- | ---------------- | ---- | ------------------- |
| **语法正确性** | Schema符合度     | 30%  | AJV验证通过率       |
| **语义合理性** | Action选择正确性 | 25%  | 规则匹配 + 人工抽检 |
| **变量一致性** | 变量定义引用一致 | 20%  | 静态分析            |
| **逻辑连贯性** | 流程设计合理     | 15%  | 结构化检查          |
| **可维护性**   | 命名规范、可读性 | 10%  | 代码风格检查        |

### 6.2 评估实现

```typescript
interface QualityMetrics {
  // 语法层面
  schemaCompliance: number; // 0-1，Schema符合度
  yamlValidity: boolean; // YAML语法正确性

  // 语义层面
  actionTypeAppropriateness: number; // Action类型选择合理性
  variableConsistency: number; // 变量一致性分数

  // 实用层面
  logicalFlowScore: number; // 逻辑流程分数
  completenessScore: number; // 配置完整性

  // 综合得分
  overallScore: number; // 加权总分

  // 改进建议
  suggestions: string[];
}

class QualityEvaluator {
  evaluate(actions: ActionConfig[], context: GenerationContext): QualityMetrics {
    const metrics: QualityMetrics = {
      schemaCompliance: this.evaluateSchemaCompliance(actions),
      yamlValidity: true, // 已通过解析
      actionTypeAppropriateness: this.evaluateActionSelection(actions),
      variableConsistency: this.evaluateVariableConsistency(actions),
      logicalFlowScore: this.evaluateLogicalFlow(actions, context),
      completenessScore: this.evaluateCompleteness(actions),
      overallScore: 0,
      suggestions: [],
    };

    // 计算加权总分
    metrics.overallScore =
      metrics.schemaCompliance * 0.3 +
      metrics.actionTypeAppropriateness * 0.25 +
      metrics.variableConsistency * 0.2 +
      metrics.logicalFlowScore * 0.15 +
      metrics.completenessScore * 0.1;

    // 生成改进建议
    metrics.suggestions = this.generateSuggestions(metrics, actions);

    return metrics;
  }
}
```

## 7. 实施路线图

### 7.1 阶段一：基础验证（1周）

**目标**：验证技术可行性

**任务**：

1. 集成现有Schema系统生成约束提示词
2. 构建10个高质量示例
3. 实现基础重试机制（最多3次）
4. 人工评估生成质量

**验收标准**：

- Schema验证通过率 > 80%
- 变量一致性 > 70%
- 人工评估合格率 > 60%

### 7.2 阶段二：框架完善（2周）

**目标**：提升生成稳定性

**任务**：

1. 实现五层约束框架完整流程
2. 构建示例库（50+示例）
3. 实现自动修正机制
4. 添加质量评估系统

**验收标准**：

- Schema验证通过率 > 95%
- 变量一致性 > 90%
- 人工评估合格率 > 80%

### 7.3 阶段三：生产就绪（2周）

**目标**：生产环境可部署

**任务**：

1. 集成到Topic智能规划流程
2. 添加缓存和性能优化
3. 完善日志和可观测性
4. 编写使用文档

**验收标准**：

- 集成测试通过
- 性能指标达标（<5s生成时间）
- 文档完整

## 8. 风险与缓解

### 8.1 技术风险

| 风险                         | 概率 | 影响 | 缓解措施                         |
| ---------------------------- | ---- | ---- | -------------------------------- |
| Schema约束不足，生成格式错误 | 中   | 高   | 增强分步生成，添加format checker |
| 变量引用混乱                 | 高   | 中   | 实现变量作用域检查器             |
| Action类型选择不当           | 中   | 中   | 注入更多决策规则和示例           |
| LLM幻觉生成不存在的字段      | 低   | 高   | 白名单约束 + 后处理清理          |

### 8.2 应对策略

```typescript
// LLM幻觉防御
class HallucinationDetector {
  private allowedFields = new Set([
    'action_type',
    'action_id',
    'condition',
    'config',
    'content',
    'tone',
    'exit',
    'max_rounds',
    'output',
    'get',
    'set',
    'define',
    'value',
  ]);

  detectUnknownFields(actions: ActionConfig[]): string[] {
    const unknown: string[] = [];

    for (const action of actions) {
      // 检查config中的未知字段
      if (action.config) {
        for (const field of Object.keys(action.config)) {
          if (!this.allowedFields.has(field)) {
            unknown.push(`${action.action_id}.config.${field}`);
          }
        }
      }
    }

    return unknown;
  }
}
```

## 9. 总结

### 9.1 核心设计原则

1. **约束分层**：从示例到验证，层层保障
2. **渐进生成**：分步思考，降低单步复杂度
3. **知识注入**：领域规则明确，减少模糊空间
4. **闭环修正**：验证反馈驱动持续改进

### 9.2 HeartRule基础设施价值

- ✅ 完整的JSON Schema定义体系
- ✅ `SchemaPromptGenerator`可复用
- ✅ 条件Schema处理多Action类型
- ✅ 分层验证机制

### 9.3 关键成功因素

1. **示例质量 > 数量**：精心设计的10个示例胜过粗制滥造的100个
2. **约束精确性**：模糊的约束导致模糊的输出
3. **反馈闭环**：错误信息要具体可操作
4. **温度控制**：创造性任务高温，修正任务低温

### 9.4 后续优化方向

1. **Few-shot Learning优化**：动态选择最相关示例
2. **Fine-tuning**：基于成功案例微调专用模型
3. **结构化解码**：使用约束解码确保格式正确
4. **多模型协作**：生成模型 + 验证模型分离

---

**文档版本**：v1.0  
**创建日期**：2026-03-02  
**作者**：HeartRule设计团队  
**状态**：草案，待实施验证
