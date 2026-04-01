# AI_Ask退出判断机制优化实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化AI_Ask的退出判断机制，采用统一LLM评估+规则引擎辅助的混合架构，简化评估字段结构

**Architecture:** 移除现有的`metrics`和`progress_suggestion`字段，新增`assessment`（阻抗、风险、用户理解评估）和`progress`（任务进度说明）字段，一次性升级所有依赖代码

**Tech Stack:** TypeScript, Zod Schema, YAML脚本, Vitest测试框架

---

## 目录

1. [类型定义更新](#1-类型定义更新)
2. [AiAskAction核心修改](#2-aiaaskaction核心修改)
3. [模板文件更新](#3-模板文件更新)
4. [监控处理器更新](#4-监控处理器更新)
5. [依赖代码清理](#5-依赖代码清理)
6. [测试更新与验证](#6-测试更新与验证)

---

### Task 1: 扩展ExitCriteria类型定义

**Files:**

- Modify: `packages/shared-types/src/domain/exit-decision.ts:59-74`
- Modify: `packages/shared-types/src/domain/exit-decision.ts:35-48`

**Step 1: 更新ExitCriteria接口添加成本控制字段**

在 `packages/shared-types/src/domain/exit-decision.ts` 文件中，找到 `ExitCriteria` 接口，添加以下新字段：

```typescript
export interface ExitCriteria {
  understanding_threshold?: number; // 理解度阈值（0-100）
  has_questions?: boolean; // 是否允许有疑问时退出
  min_rounds?: number; // 最小轮次要求
  max_rounds?: number; // 最大轮次限制（新增）
  max_tokens?: number; // 最大token消耗（新增）
  max_cost?: number; // 最大成本限制（新增）
  required_variables?: string[]; // 必须收集的变量列表（新增）
  min_response_length?: number; // 最小响应长度（新增）
  max_silence_rounds?: number; // 连续无实质内容轮次（新增）
  custom_conditions?: CustomExitCondition[]; // 自定义条件数组
}
```

**Step 2: 更新ExitCriteriaSchema**

找到 `ExitCriteriaSchema`，添加对应的Zod验证规则：

```typescript
export const ExitCriteriaSchema = z.object({
  understanding_threshold: z.number().min(0).max(100).optional(),
  has_questions: z.boolean().optional(),
  min_rounds: z.number().int().min(1).optional(),
  max_rounds: z.number().int().min(1).optional(), // 新增
  max_tokens: z.number().int().min(100).optional(), // 新增
  max_cost: z.number().min(0).optional(), // 新增
  required_variables: z.array(z.string()).optional(), // 新增
  min_response_length: z.number().int().min(1).optional(), // 新增
  max_silence_rounds: z.number().int().min(1).optional(), // 新增
  custom_conditions: z.array(CustomExitConditionSchema).optional(),
});
```

**Step 3: 运行类型检查**

```bash
cd packages/shared-types && pnpm typecheck
```

Expected: PASS

**Step 4: 提交**

```bash
git add packages/shared-types/src/domain/exit-decision.ts
git commit -m "feat: extend ExitCriteria with cost control and variable requirements"
```

---

### Task 2: 创建EnhancedAskLLMOutput类型

**Files:**

- Create: `packages/shared-types/src/domain/ai-ask-output.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: 创建新的AI_Ask输出类型文件**

创建文件 `packages/shared-types/src/domain/ai-ask-output.ts`：

```typescript
import { z } from 'zod';

export interface EnhancedAskLLMOutput {
  content?: string; // AI回复内容
  assessment?: string; // 阻抗、风险、用户理解评估（markdown格式）
  progress?: string; // 任务进度说明（结构化markdown）
  EXIT: string; // 退出标志（'true'/'false'）
  BRIEF?: string; // 退出/继续理由摘要
  crisis_detected: boolean; // 仅明显危机时为true，触发同步危机处理
}

export const EnhancedAskLLMOutputSchema = z.object({
  content: z.string().optional(),
  assessment: z.string().optional(),
  progress: z.string().optional(),
  EXIT: z.enum(['true', 'false']),
  BRIEF: z.string().optional(),
  crisis_detected: z.boolean().default(false),
});
```

**危机检测分层机制说明**：

| 危机类型     | 触发条件                       | 处理方式                                    |
| ------------ | ------------------------------ | ------------------------------------------- |
| **明显危机** | `crisis_detected: true`        | 主线程同步启动危机处理LLM，评估是否修订回复 |
| **隐蔽危机** | assessment中的风险识别细微信号 | 另一线程的ai_ask监控LLM异步分析             |

- `crisis_detected` 仅用于**明显、紧急**的危机信号（如明确的自杀意念、自伤计划、他伤倾向）
- 隐蔽危机嵌入在assessment的markdown描述中，由监控流程处理

**Step 2: 更新shared-types的导出**

在 `packages/shared-types/src/index.ts` 中添加导出：

```typescript
export * from './domain/ai-ask-output.js';
```

**Step 3: 运行类型检查**

```bash
cd packages/shared-types && pnpm typecheck
```

Expected: PASS

**Step 4: 提交**

```bash
git add packages/shared-types/src/domain/ai-ask-output.ts packages/shared-types/src/index.ts
git commit -m "feat: create EnhancedAskLLMOutput type for new assessment structure"
```

---

### Task 3: 更新AiAskAction接口引用

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

**Step 1: 替换AskLLMOutput接口引用**

在 `packages/core-engine/src/domain/actions/ai-ask-action.ts` 文件中：

1. 移除原有的 `AskLLMOutput` 接口定义（第38-64行）
2. 添加从 shared-types 的导入：

```typescript
import type { EnhancedAskLLMOutput, ExitCriteria } from '@heartrule/shared-types';
```

3. 更新 `parseMultiRoundOutput` 方法的返回类型：

```typescript
private parseMultiRoundOutput(rawResponse: string): {
  output: EnhancedAskLLMOutput;  // 修改这里
  cleanedResponse: string;
  parseError?: {
    retryCount: number;
    strategies: string[];
    finalError: string;
  };
} {
  // ... 方法体保持不变
}
```

**Step 2: 更新getDefaultAskOutput方法**

```typescript
private getDefaultAskOutput(rawResponse: string): EnhancedAskLLMOutput {
  return {
    content: rawResponse.trim(),
    assessment: 'JSON解析失败，使用默认评估',
    progress: '进度评估不可用',
    EXIT: 'NO',
    BRIEF: 'LLM输出JSON解析失败',
    crisis_detected: false,
  };
}
```

**Step 3: 运行类型检查**

```bash
cd packages/core-engine && pnpm typecheck
```

Expected: 可能有编译错误，需要继续修复

**Step 4: 提交**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "refactor: update AiAskAction to use EnhancedAskLLMOutput"
```

---

### Task 4: 更新parseLLMResponse方法

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

**Step 1: 重构parseLLMResponse方法**

在 `parseLLMResponse` 方法中，更新多轮模式的处理逻辑：

```typescript
private parseLLMResponse(
  llmResult: any,
  templateType: AskTemplateType,
  resolution: any,
  safetyCheck: any
): ActionResult {
  if (templateType === AskTemplateType.SIMPLE) {
    // 简单模式保持不变...
    // ... 现有代码
  } else {
    // 多轮模式：解析JSON响应
    const parseResult = this.parseMultiRoundOutput(llmResult.text);
    const llmOutput = parseResult.output;

    // 判断是否退出
    const shouldExit = llmOutput.EXIT === 'true';

    // 提取AI消息
    const aiRole = this.getConfig('ai_role', '咨询师');
    const aiMessage = llmOutput.content || '';

    // 检查危机信号
    const crisisDetected = llmOutput.crisis_detected || false;

    // 如果检测到明显危机，启动危机处理流程
    if (crisisDetected) {
      // TODO: 同步启动危机处理LLM，评估是否修订回复
      console.warn('[AiAskAction] ⚠️ 危机信号检测到，启动危机处理流程');
    }

    return {
      success: true,
      completed: false,
      aiMessage,
      debugInfo: llmResult.debugInfo,
      metadata: {
        actionType: AiAskAction.actionType,
        shouldExit,
        brief: llmOutput.BRIEF,
        assessment: llmOutput.assessment,    // 新增
        progress: llmOutput.progress,        // 新增
        crisis_detected: crisisDetected,     // 简化危机检测
        currentRound: this.currentRound,
        llmRawOutput: parseResult.cleanedResponse,
        template_path: resolution.path,
        template_layer: resolution.layer,
        template_scheme: resolution.scheme,
        safety_check: safetyCheck,
        parseError: (parseResult.parseError?.retryCount || 0) > 1,
        parseRetryCount: parseResult.parseError?.retryCount || 0,
        parseErrorDetails: parseResult.parseError,
      },
    };
  }
}
```

**Step 2: 移除extractMetrics和extractProgressSuggestion方法**

删除以下方法（位于第731-769行附近）：

- `private extractMetrics(llmOutput: AskLLMOutput): ActionMetrics`
- `private extractProgressSuggestion(llmOutput: AskLLMOutput): ProgressSuggestion`
- `private getDefaultMetrics(): ActionMetrics`

**Step 3: 运行测试**

```bash
cd packages/core-engine && pnpm test -- ai-ask-action.test.ts
```

Expected: 部分测试会失败，需要更新测试用例

**Step 4: 提交**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "refactor: update parseLLMResponse to handle new output structure"
```

---

### Task 5: 更新AI_Ask模板文件

**Files:**

- Modify: `_system/config/default/ai_ask_v1.md`

**Step 1: 更新模板输出格式**

找到模板文件中的【输出格式】部分，替换为：

````markdown
【输出格式】

你必须输出为以下 JSON 格式：

```json
{
  "content": "你生成的提问内容...",
  "assessment": "## 阻抗分析\n阻抗程度：中等(65分)\n主要表现：回避倾向...\n\n## 风险识别\n无明显安全风险\n\n## 用户理解\n用户理解程度良好",
  "progress": "## 进度评估\n- [x] 症状描述：已收集详细描述\n- [ ] 持续时间：用户未明确说明\n- [x] 严重程度：已确认中度\n\n## 成本与轮次\n当前轮次：3/5\n建议轮次：还需1-2轮",
  "EXIT": "false",
  "BRIEF": "信息不足，需要继续收集持续时间",
  "crisis_detected": false
}
```
````

【字段说明】

**核心字段**：

- `content`: 你生成的提问内容（主要字段，将展示给用户）
- `assessment`: 综合评估（markdown格式），包含：
  - 阻抗分析：用户回避、困惑、记忆缺失等程度评估
  - 风险识别：安全边界遵守情况、隐蔽危机信号
  - 用户理解：用户对问题的理解程度
- `progress`: 任务进度说明（markdown格式），包含：
  - 进度评估：使用任务列表格式说明每个输出变量的收集状态
  - 成本与轮次：当前轮次、建议轮次、效率评估
- `EXIT`: 是否满足退出条件（"true" 或 "false"）
- `BRIEF`: 退出/继续的简短理由（不超过15个字）
- `crisis_detected`: **仅明显危机**时设为true（如明确的自杀意念、自伤计划）
  - true时将同步启动危机处理流程，评估是否需要修订回复
  - 隐蔽或不确定的危机信号应写入assessment的风险识别部分

````

**Step 2: 更新模板中的评估指导**

在模板的【你的任务】部分，找到并更新评估相关的说明：

```markdown
4. **生成综合评估**：
   - 生成`assessment`：分析用户阻抗程度、风险识别、用户理解情况
   - 生成`progress`：使用任务列表格式说明每个输出变量的收集进度
   - 基于评估结果决定`EXIT`和`BRIEF`
````

**Step 3: 验证模板语法**

```bash
cd packages/core-engine && NODE_ENV=development pnpm test -- template-resolver.test.ts
```

Expected: 测试可能失败，需要更新测试用例

**Step 4: 提交**

```bash
git add _system/config/default/ai_ask_v1.md
git commit -m "feat: update ai_ask template with new assessment and progress fields"
```

---

### Task 6: 更新监控处理器

**Files:**

- Modify: `packages/core-engine/src/engines/monitoring/base-monitor-handler.ts`
- Modify: `packages/core-engine/src/engines/monitoring/ai-ask-monitor-handler.ts`

**Step 1: 更新BaseMonitorHandler的parseMetrics方法**

```typescript
protected parseMetrics(result: ActionResult): Record<string, any> {
  // 从metadata中提取assessment和progress
  const assessment = result.metadata?.assessment || '';
  const progress = result.metadata?.progress || '';

  return {
    assessment,
    progress,
    brief: result.metadata?.brief || '',
    shouldExit: result.metadata?.shouldExit || false,
  };
}
```

**Step 2: 更新AiAskMonitorHandler的监控变量构建**

```typescript
protected buildMonitorVariables(
  actionResult: ActionResult,
  context: ActionContext
): Map<string, any> {
  const variables = super.buildMonitorVariables(actionResult, context);

  // 添加新的评估字段
  variables.set('assessment', actionResult.metadata?.assessment || '');
  variables.set('progress', actionResult.metadata?.progress || '');

  return variables;
}
```

**Step 3: 更新监控模板变量引用**

检查 `_system/config/default/ai_ask_monitor_v1.md` 模板，将 `{%metrics%}` 替换为 `{%assessment%}` 和 `{%progress%}` 的适当引用。

**Step 4: 运行监控测试**

```bash
cd packages/core-engine && pnpm test -- monitoring
```

Expected: 需要更新测试用例

**Step 5: 提交**

```bash
git add packages/core-engine/src/engines/monitoring/
git commit -m "refactor: update monitor handlers for new assessment structure"
```

---

### Task 7: 清理依赖metrics的代码

**Files:**

- Search: 整个项目中使用 `metrics.` 的引用
- Modify: 所有相关文件

**Step 1: 查找所有metrics引用**

```bash
cd /home/leo/projects/HeartRule-Qoder
grep -r "metrics\." --include="*.ts" --include="*.js" .
```

**Step 2: 更新BaseAction中的ActionMetrics引用**

检查 `packages/core-engine/src/domain/actions/base-action.ts` 中 ActionMetrics 接口的使用，移除或注释相关代码。

**Step 3: 更新测试文件**

更新所有引用metrics的测试文件，使用新的assessment和progress字段。

**Step 4: 运行完整测试套件**

```bash
pnpm test
```

Expected: 修复所有测试失败

**Step 5: 提交**

```bash
git add -A
git commit -m "chore: remove metrics and progress_suggestion field dependencies"
```

---

### Task 8: 实现规则引擎

**Files:**

- Create: `packages/core-engine/src/engines/exit-decision/rule-based-evaluator.ts`
- Create: `packages/core-engine/src/engines/exit-decision/exit-decision-engine.ts`
- Create: `packages/core-engine/src/engines/exit-decision/index.ts`
- Test: `packages/core-engine/__tests__/engines/exit-decision.test.ts`

**Step 1: 创建RuleBasedEvaluator**

创建目录并文件 `packages/core-engine/src/engines/exit-decision/rule-based-evaluator.ts`：

```typescript
import type { ExitCriteria } from '@heartrule/shared-types';

export interface RuleEvaluationResult {
  shouldExit: boolean;
  reason: string;
  triggeredRules: string[];
}

export interface RuleContext {
  currentRound: number;
  totalTokens: number;
  estimatedCost: number;
  userInputLength: number;
  silentRounds: number;
  collectedVariables: string[];
  requiredVariables: string[];
}

export class RuleBasedEvaluator {
  evaluate(criteria: ExitCriteria, context: RuleContext): RuleEvaluationResult {
    const triggeredRules: string[] = [];

    // 检查最大轮次
    if (criteria.max_rounds && context.currentRound >= criteria.max_rounds) {
      triggeredRules.push(`max_rounds: ${context.currentRound} >= ${criteria.max_rounds}`);
    }

    // 检查最大token
    if (criteria.max_tokens && context.totalTokens >= criteria.max_tokens) {
      triggeredRules.push(`max_tokens: ${context.totalTokens} >= ${criteria.max_tokens}`);
    }

    // 检查最大成本
    if (criteria.max_cost && context.estimatedCost >= criteria.max_cost) {
      triggeredRules.push(`max_cost: ${context.estimatedCost} >= ${criteria.max_cost}`);
    }

    // 检查最小响应长度
    if (criteria.min_response_length && context.userInputLength < criteria.min_response_length) {
      triggeredRules.push(
        `min_response_length: ${context.userInputLength} < ${criteria.min_response_length}`
      );
    }

    // 检查沉默轮次
    if (criteria.max_silence_rounds && context.silentRounds >= criteria.max_silence_rounds) {
      triggeredRules.push(
        `max_silence_rounds: ${context.silentRounds} >= ${criteria.max_silence_rounds}`
      );
    }

    // 检查必需变量
    if (criteria.required_variables && criteria.required_variables.length > 0) {
      const missingVars = criteria.required_variables.filter(
        (v) => !context.collectedVariables.includes(v)
      );
      if (missingVars.length === 0) {
        triggeredRules.push('required_variables: all collected');
      }
    }

    const shouldExit = triggeredRules.length > 0;

    return {
      shouldExit,
      reason: shouldExit ? `触发规则: ${triggeredRules.join(', ')}` : '未触发任何硬性规则',
      triggeredRules,
    };
  }
}
```

**Step 2: 创建ExitDecisionEngine**

创建文件 `packages/core-engine/src/engines/exit-decision/exit-decision-engine.ts`：

```typescript
import type { ExitCriteria, EnhancedAskLLMOutput } from '@heartrule/shared-types';
import { RuleBasedEvaluator, type RuleContext } from './rule-based-evaluator.js';

export interface ExitDecisionResult {
  shouldExit: boolean;
  reason: string;
  source: 'llm' | 'rules' | 'combined';
  llmExit: boolean;
  ruleExit: boolean;
}

export interface DecisionContext extends RuleContext {
  llmOutput: EnhancedAskLLMOutput;
}

export class ExitDecisionEngine {
  private ruleEvaluator: RuleBasedEvaluator;

  constructor() {
    this.ruleEvaluator = new RuleBasedEvaluator();
  }

  evaluate(criteria: ExitCriteria, context: DecisionContext): ExitDecisionResult {
    // LLM的退出建议
    const llmExit = context.llmOutput.EXIT === 'true';
    const llmReason = context.llmOutput.BRIEF || 'LLM建议退出';

    // 规则引擎评估
    const ruleResult = this.ruleEvaluator.evaluate(criteria, {
      currentRound: context.currentRound,
      totalTokens: context.totalTokens,
      estimatedCost: context.estimatedCost,
      userInputLength: context.userInputLength,
      silentRounds: context.silentRounds,
      collectedVariables: context.collectedVariables,
      requiredVariables: criteria.required_variables || [],
    });

    // 综合决策
    const shouldExit = llmExit || ruleResult.shouldExit;
    let reason = '';
    let source: 'llm' | 'rules' | 'combined' = 'llm';

    if (llmExit && ruleResult.shouldExit) {
      reason = `LLM与规则均建议退出: ${llmReason}, ${ruleResult.reason}`;
      source = 'combined';
    } else if (llmExit) {
      reason = llmReason;
      source = 'llm';
    } else if (ruleResult.shouldExit) {
      reason = ruleResult.reason;
      source = 'rules';
    } else {
      reason = '继续对话';
    }

    return {
      shouldExit,
      reason,
      source,
      llmExit,
      ruleExit: ruleResult.shouldExit,
    };
  }
}
```

**Step 3: 创建导出索引**

创建文件 `packages/core-engine/src/engines/exit-decision/index.ts`：

```typescript
export {
  RuleBasedEvaluator,
  type RuleEvaluationResult,
  type RuleContext,
} from './rule-based-evaluator.js';
export {
  ExitDecisionEngine,
  type ExitDecisionResult,
  type DecisionContext,
} from './exit-decision-engine.js';
```

**Step 4: 添加测试**

创建目录 `packages/core-engine/__tests__/engines/exit-decision/` 并创建测试文件：

```typescript
import { describe, it, expect } from 'vitest';
import { ExitDecisionEngine } from '../../../src/engines/exit-decision/exit-decision-engine.js';

describe('ExitDecisionEngine', () => {
  it('should exit when max_rounds reached', () => {
    const engine = new ExitDecisionEngine();
    const criteria = { max_rounds: 3 };
    const context = {
      currentRound: 5,
      totalTokens: 100,
      estimatedCost: 0.01,
      userInputLength: 10,
      silentRounds: 0,
      collectedVariables: [],
      requiredVariables: [],
      llmOutput: { EXIT: 'false' },
    };

    const result = engine.evaluate(criteria, context);
    expect(result.shouldExit).toBe(true);
    expect(result.source).toBe('rules');
  });

  it('should use LLM suggestion when no rules triggered', () => {
    const engine = new ExitDecisionEngine();
    const criteria = { max_rounds: 10 };
    const context = {
      currentRound: 3,
      totalTokens: 100,
      estimatedCost: 0.01,
      userInputLength: 50,
      silentRounds: 0,
      collectedVariables: [],
      requiredVariables: [],
      llmOutput: { EXIT: 'true', BRIEF: '信息已收集完整' },
    };

    const result = engine.evaluate(criteria, context);
    expect(result.shouldExit).toBe(true);
    expect(result.source).toBe('llm');
  });
});
```

**Step 5: 运行测试**

```bash
cd packages/core-engine && pnpm test -- exit-decision.test.ts
```

Expected: PASS

**Step 6: 提交**

```bash
git add packages/core-engine/src/engines/exit-decision/
git commit -m "feat: add rule-based exit decision engine"
```

---

### Task 9: 集成ExitDecisionEngine到AiAskAction

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

**Step 1: 在AiAskAction中注入ExitDecisionEngine**

在构造函数中添加：

```typescript
import { ExitDecisionEngine } from '../../engines/exit-decision/index.js';

export class AiAskAction extends BaseAction {
  static actionType = 'ai_ask';
  private llmOrchestrator?: LLMOrchestrator;
  private templateManager: PromptTemplateManager;
  private templateResolver: TemplateResolver;
  private templateType: AskTemplateType;
  private exitDecisionEngine: ExitDecisionEngine; // 新增

  constructor(actionId: string, config: Record<string, any>, llmOrchestrator?: LLMOrchestrator) {
    super(actionId, config);
    this.maxRounds = this.getConfig('max_rounds', 3);
    this.llmOrchestrator = llmOrchestrator;
    this.exitDecisionEngine = new ExitDecisionEngine(); // 新增

    // ... 其余构造函数代码
  }
}
```

**Step 2: 更新executeMultiRound方法中的退出决策**

在 `executeMultiRound` 方法中，替换退出决策逻辑：

```typescript
private async executeMultiRound(
  context: ActionContext,
  userInput?: string | null
): Promise<ActionResult> {
  // ... 前面的代码保持不变（第一轮生成问题）

  // 调用 LLM 生成下一轮问题或决定退出
  const llmResult = await this.generateQuestionFromTemplate(context, AskTemplateType.MULTI_ROUND);

  // 提取 LLM 输出的原始数据
  const llmOutput = llmResult.metadata?.llmRawOutput
    ? JSON.parse(this.cleanJsonOutput(llmResult.metadata.llmRawOutput))
    : {};

  // 使用ExitDecisionEngine进行综合决策
  const exitCriteria = this.buildExitCriteriaFromConfig();
  const decisionContext = {
    currentRound: this.currentRound,
    totalTokens: this.calculateTokensUsed(context),
    estimatedCost: this.estimateCost(context),
    userInputLength: (userInput || '').length,
    silentRounds: this.calculateSilentRounds(context, userInput),
    collectedVariables: this.getCollectedVariables(context),
    requiredVariables: exitCriteria.required_variables || [],
    llmOutput: llmOutput,
  };

  const exitDecision = this.exitDecisionEngine.evaluate(exitCriteria, decisionContext);

  // 计算 exit_reason
  let exitReason: ExitReason | undefined;
  if (exitDecision.source === 'rules' && exitDecision.ruleExit) {
    exitReason = 'max_rounds_reached';
  } else if (exitDecision.source === 'llm' && exitDecision.llmExit) {
    if (llmOutput.assessment?.includes('阻抗')) {
      exitReason = 'user_blocked';
    } else if (llmOutput.assessment?.includes('偏题')) {
      exitReason = 'off_topic';
    } else {
      exitReason = 'exit_criteria_met';
    }
  }

  if (exitDecision.shouldExit) {
    console.log(`[AiAskAction] ✅ Decided to exit: ${exitDecision.reason}`);
    const finalResult = await this.finishAction(context, userInput);
    return {
      ...finalResult,
      metadata: {
        ...finalResult.metadata,
        exit_reason: exitReason,
        exit_decision: exitDecision,
      },
    };
  }

  // 继续追问
  this.currentRound += 1;
  return {
    ...llmResult,
    completed: false,
    metadata: {
      ...llmResult.metadata,
      waitingFor: 'answer',
      continueAsking: true,
      currentRound: this.currentRound,
      exitDecision,
      exit_reason: exitReason,
    },
  };
}
```

**Step 3: 添加辅助方法**

```typescript
private buildExitCriteriaFromConfig(): ExitCriteria {
  return {
    max_rounds: this.getConfig('max_rounds'),
    max_tokens: this.getConfig('max_tokens'),
    max_cost: this.getConfig('max_cost'),
    required_variables: this.getConfig('output')?.map((v: any) => v.get).filter(Boolean),
    min_response_length: this.getConfig('min_response_length'),
    max_silence_rounds: this.getConfig('max_silence_rounds'),
    understanding_threshold: this.getConfig('understanding_threshold'),
    has_questions: this.getConfig('has_questions'),
    min_rounds: this.getConfig('min_rounds'),
    custom_conditions: this.getConfig('custom_conditions'),
  };
}

private calculateTokensUsed(context: ActionContext): number {
  const historyText = context.conversationHistory
    .map(msg => msg.content)
    .join(' ');
  return Math.ceil(historyText.length / 4);
}

private estimateCost(context: ActionContext): number {
  const tokens = this.calculateTokensUsed(context);
  return (tokens / 1000) * 0.0015;
}

private calculateSilentRounds(context: ActionContext, userInput?: string | null): number {
  if (!userInput || userInput.trim().length < 5) {
    return (context.metadata?.silentRounds || 0) + 1;
  }
  return 0;
}

private getCollectedVariables(context: ActionContext): string[] {
  const outputConfig = this.getConfig('output', []);
  return outputConfig
    .map((v: any) => v.get)
    .filter((name: string) => {
      const value = context.scopeResolver?.resolveVariable(name)
        || context.variables[name];
      return value !== undefined && value !== null && value !== '';
    });
}
```

**Step 4: 运行测试**

```bash
cd packages/core-engine && pnpm test -- ai-ask-action.test.ts
```

Expected: 修复测试，确保新功能正常工作

**Step 5: 提交**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "feat: integrate ExitDecisionEngine into AiAskAction"
```

---

### Task 10: 更新YAML脚本配置格式

**Files:**

- Modify: `scripts/sessions/test_multi_output.yaml`
- Modify: `scripts/sessions/cbt_depression_assessment.yaml`

**Step 1: 更新test_multi_output.yaml添加require字段**

```yaml
output:
  - get: '症状描述'
    define: '用户描述的主要症状表现'
    require: '关键'
  - get: '持续时间'
    define: '症状持续的时间长度'
    require: '重要'
  - get: '严重程度'
    define: '症状严重程度的评估（轻度/中度/重度）'
    require: '重要'
```

**Step 2: 更新cbt_depression_assessment.yaml添加成本控制字段**

```yaml
- action_type: 'ai_ask'
  action_id: 'ask_main_issue'
  config:
    target_variable: 'chief_complaint'
    question_template: |
      ${user_name}，能和我说说是什么原因让你来到这里吗？
      最近有什么困扰你的事情吗？
    extraction_prompt: '提取用户描述的主要问题和困扰'
    required: true
    max_rounds: 5
    max_tokens: 2000
    required_variables: ['chief_complaint']
```

**Step 3: 验证脚本语法**

```bash
cd packages/api-server && pnpm test -- scripts
```

Expected: 脚本解析测试应该通过

**Step 4: 提交**

```bash
git add scripts/
git commit -m "chore: update YAML scripts with new exit criteria fields"
```

---

### Task 11: 完整端到端测试

**Files:**

- Create: `packages/core-engine/__tests__/e2e/ai-ask-exit-decision.test.ts`

**Step 1: 创建端到端测试**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { AiAskAction } from '../../src/domain/actions/ai-ask-action.js';
import type { ActionContext } from '../../src/domain/actions/base-action.js';

describe('AI_Ask Exit Decision E2E', () => {
  let mockContext: ActionContext;

  beforeAll(() => {
    mockContext = {
      sessionId: 'test-session',
      phaseId: 'test-phase',
      topicId: 'test-topic',
      actionId: 'test-action',
      variables: { 用户名: '测试用户' },
      conversationHistory: [],
      metadata: {},
    };
  });

  it('should exit when max_rounds reached', async () => {
    const config = {
      question_template: '请描述你的症状',
      exit: '用户提供了症状描述',
      max_rounds: 2,
      output: [{ get: '症状描述', define: '症状描述', require: '关键' }],
    };

    const action = new AiAskAction('test-action', config);

    // 模拟第一轮
    const round1 = await action.execute(mockContext);
    expect(round1.completed).toBe(false);

    // 模拟第二轮
    const round2 = await action.execute(mockContext, '有点头疼');
    expect(round2.completed).toBe(false);

    // 模拟第三轮（应触发max_rounds退出）
    const round3 = await action.execute(mockContext, '还是头疼');
    expect(round3.completed).toBe(true);
    expect(round3.metadata?.exit_reason).toBe('max_rounds_reached');
  });

  it('should include assessment and progress in result', async () => {
    const config = {
      question_template: '请详细描述你的感受',
      exit: '用户提供了详细描述',
      output: [{ get: '感受描述', define: '感受描述', require: '关键' }],
    };

    const action = new AiAskAction('test-action', config);

    const result = await action.execute(mockContext, '不想说');

    // 检查assessment和progress字段存在
    expect(result.metadata?.assessment).toBeDefined();
    expect(result.metadata?.progress).toBeDefined();
  });
});
```

**Step 2: 运行完整测试套件**

```bash
pnpm test
```

Expected: 所有测试通过

**Step 3: 运行类型检查**

```bash
pnpm typecheck
```

Expected: 无类型错误

**Step 4: 提交**

```bash
git add packages/core-engine/__tests__/e2e/ai-ask-exit-decision.test.ts
git commit -m "test: add e2e tests for ai_ask exit decision optimization"
```

---

### Task 12: 文档更新

**Files:**

- Update: `docs/plans/2026-03-18-ai-ask-exit-decision-design.md` (标记已完成)
- Update: `README.md` 相关部分

**Step 1: 标记设计文档完成**

在设计文档末尾更新状态：

```markdown
## 8. 验收标准

- [x] 所有单元测试通过
- [x] 所有端到端测试通过
- [x] TypeScript类型检查无错误
- [x] 现有YAML脚本继续正常工作
- [x] LLM输出格式符合新规范
- [x] 规则引擎正确处理硬性条件
```

**Step 2: 更新README.md**

在README的"AI_Ask动作"部分添加对新退出机制的解释。

**Step 3: 提交**

```bash
git add docs/
git commit -m "docs: update documentation for ai_ask exit decision optimization"
```

---

## 验证命令

完成后运行以下命令验证：

```bash
# 完整测试套件
pnpm test

# 类型检查
pnpm typecheck

# 构建验证
pnpm build
```

## 实施完成

所有任务完成后，更新设计文档状态并提交最终更改。
