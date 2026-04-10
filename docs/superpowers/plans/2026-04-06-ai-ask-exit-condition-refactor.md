# AI_Ask Exit Condition Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 AI_Ask 退出判断机制，实现清晰的信息收集优先级管理和字段规范化

**Architecture:**

- 字段重命名：`exit` → `exit_condition`（YAML配置字段，避免与LLM输出字段混淆）
- 移除冗余：删除 `custom_conditions`（功能与退出条件描述重叠）
- 新增优先级：`output.require` 字段支持4个紧迫度等级（即时、本次对话内、可推迟、持续跟踪）
- 模板增强：更新 `ai_ask_v1.md` 指导LLM基于紧迫度调整收集策略
- 默认值设置：`max_rounds: 100`, `require: "可推迟"`

**Tech Stack:** TypeScript, Zod, JSON Schema, Markdown templates

---

## 文件结构图

### 新增文件

无

### 修改文件

1. **Type Definitions** (`shared-types`):
   - `packages/shared-types/src/domain/exit-decision.ts` - 移除 CustomExitCondition 类型定义
   - `packages/shared-types/src/domain/ai-ask-output.ts` - 无需修改（require字段是YAML配置，不是LLM输出）
   - `packages/shared-types/src/index.ts` - 导出更新后的类型

2. **JSON Schemas** (`core-engine`):
   - `packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json` - 字段重命名和移除
   - `packages/core-engine/src/adapters/inbound/script-schema/common/output-field.schema.json` - 添加 require 字段

3. **Core Engine** (`core-engine`):
   - `packages/core-engine/src/domain/actions/ai-ask-action.ts` - 更新字段引用和模板变量
   - `packages/core-engine/src/domain/actions/base-action.ts` - 移除 customer_conditions 处理逻辑
   - `packages/core-engine/src/engines/exit-decision/exit-decision-engine.ts` - 移除相关检查

4. **Templates**:
   - `config/templates/default/ai_ask_v1.md` - 更新退出条件和紧迫度指导

5. **Frontend** (`script-editor`):
   - `packages/script-editor/src/types/action.ts` - 更新类型定义
   - `packages/script-editor/src/utils/aiAskValidation.ts` - 更新验证规则

6. **Tests**:
   - `packages/core-engine/test/regression/multi-round-exit-decision.test.ts` - 更新测试
   - `packages/core-engine/test/unit/template-validation.test.ts` - 更新测试
   - 其他相关测试文件

7. **YAML Scripts** (Migration):
   - `scripts/sessions/exit-tests/*.yaml` - 字段迁移

---

## Task 1: 更新 JSON Schemas

**Files:**

- Modify: `packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json`
- Modify: `packages/core-engine/src/adapters/inbound/script-schema/common/output-field.schema.json`

- [ ] **Step 1: 修改 ai-ask.schema.json - 重命名 exit 字段**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ai-ask-config.schema.json",
  "title": "AI Ask Action Config Schema",
  "description": "ai_ask 动作的配置 Schema",
  "type": "object",
  "required": ["content"],
  "properties": {
    "content": {
      "type": "string",
      "minLength": 1,
      "description": "提问内容模板"
    },
    "tone": {
      "type": "string",
      "description": "语气风格"
    },
    "exit_condition": {
      "type": "string",
      "description": "退出条件的文本描述（给LLM的语义提示）",
      "default": "用户提供了足够的信息"
    },
    "output": {
      "type": "array",
      "items": {
        "$ref": "../common/output-field.schema.json"
      },
      "description": "输出变量配置"
    },
    "max_rounds": {
      "type": "number",
      "minimum": 1,
      "maximum": 200,
      "default": 100,
      "description": "最大轮数（安全网，防止LLM陷入死循环）。默认100轮，大多数情况下脚本工程师无需修改"
    }
  },
  "additionalProperties": false
}
```

**注意**：移除了 `custom_conditions` 字段，修正了 output 的 $ref 路径，将 `exit` 重命名为 `exit_condition`，`max_rounds` 默认值从 20 改为 100。

- [ ] **Step 2: 修改 output-field.schema.json - 添加 require 字段**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "output-field.schema.json",
  "title": "OutputField",
  "description": "输出字段配置",
  "type": "object",
  "properties": {
    "get": {
      "type": "string",
      "description": "提取变量名"
    },
    "set": {
      "type": "string",
      "description": "设置变量名"
    },
    "define": {
      "type": "string",
      "description": "变量定义说明"
    },
    "value": {
      "type": "string",
      "description": "直接设置的值"
    },
    "require": {
      "type": "string",
      "enum": ["即时", "本次对话内", "可推迟", "持续跟踪"],
      "default": "可推迟",
      "description": "信息收集紧迫度等级：即时（必须立刻获得）、本次对话内（优先本次获取）、可推迟（可推迟到下次，默认值）、持续跟踪（不主动提问，仅记录）"
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 3: 提交 Schema 更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json
git add packages/core-engine/src/adapters/inbound/script-schema/common/output-field.schema.json
git commit -m "refactor(schema): 重命名exit为exit_condition，移除custom_conditions，添加require字段"
```

---

## Task 2: 更新共享类型定义

**Files:**

- Modify: `packages/shared-types/src/domain/exit-decision.ts`
- Modify: `packages/shared-types/src/index.ts` (如需)

- [ ] **Step 1: 移除 CustomExitCondition 类型定义**

在 `packages/shared-types/src/domain/exit-decision.ts` 中，删除以下代码：

**删除第33-48行**：

```typescript
/**
 * 自定义退出条件（用于 exit_criteria.custom_conditions）
 */
export interface CustomExitCondition {
  variable: string;
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains';
  value: unknown;
}

/**
 * 自定义退出条件 Schema
 */
export const CustomExitConditionSchema = z.object({
  variable: z.string(),
  operator: z.enum(['==', '!=', '>', '<', '>=', '<=', 'contains']),
  value: z.unknown(),
});
```

**修改第65-68行的 ExitCriteria 接口**：

```typescript
export interface ExitCriteria {
  max_rounds?: number; // 最大轮次限制（安全网，防止LLM陷入死循环）
  required_variables?: string[]; // 必须收集的变量列表（确保任务完成）
}
```

**修改第74-77行的 ExitCriteriaSchema**：

```typescript
export const ExitCriteriaSchema = z.object({
  max_rounds: z.number().int().min(1).optional(),
  required_variables: z.array(z.string()).optional(),
});
```

**修改第54行的注释**：

```typescript
/**
 * 退出条件配置（通用 superset）
 *
 * 针对不同的 action_type，实际可用字段有所不同：
 * - ai_ask: max_rounds, required_variables
 * - ai_say: 无
 * - fill_form: 无（表单完整性由其他逻辑处理）
 * - 内部动作 (ai_think, use_skill, show_pic): 不使用 exit_criteria
 *
 * 设计决策：
 * - 已移除 min_rounds（无实际场景）
 * - 已移除 max_tokens、max_cost（应在系统层控制）
 * - 已移除 max_silence_rounds、min_response_length（与LLM阻抗检测重复）
 * - 已移除 understanding_threshold、has_questions（语义判断交给LLM的exit字段）
 * - 已移除 custom_conditions（功能与 exit_condition 文本描述重叠）
 */
```

- [ ] **Step 2: 提交类型更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/shared-types/src/domain/exit-decision.ts
git commit -m "refactor(types): 移除CustomExitCondition类型定义"
```

---

## Task 3: 更新核心引擎 - base-action.ts

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts`

- [ ] **Step 1: 移除 evaluateExitCriteria 中的 custom_conditions 处理逻辑**

定位到 `evaluateExitCriteria` 方法（约第495-518行），移除 custom_conditions 相关代码。

**修改前**（第495-518行左右）：

```typescript
// 检查 custom_conditions
if (this.exitCriteria.custom_conditions && context.scopeResolver) {
  for (const condition of this.exitCriteria.custom_conditions) {
    const satisfied = this.evaluateCondition(condition, context);
    if (!satisfied) {
      return {
        shouldExit: false,
        reason: `自定义条件不满足: ${condition.variable} ${condition.operator} ${condition.value}`,
        triggeredRules: [],
      };
    }
  }
  // 所有条件都满足
  return {
    shouldExit: true,
    reason: `自定义条件全部满足`,
    triggeredRules: ['custom_conditions'],
  };
}
```

**修改后**：

```typescript
// custom_conditions 已移除，不再在代码层检查自定义条件
// 语义判断完全交给 LLM 的 exit 字段
```

- [ ] **Step 2: 移除 evaluateCondition 方法**

如果 `evaluateCondition` 方法只为 `custom_conditions` 服务，移除整个方法。

- [ ] **Step 3: 提交 base-action 更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/core-engine/src/domain/actions/base-action.ts
git commit -m "refactor(core): 移除base-action中的custom_conditions处理逻辑"
```

---

## Task 4: 更新核心引擎 - ai-ask-action.ts

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts`

- [ ] **Step 1: 更新模板变量提取逻辑**

定位到模板变量设置部分（约第463-464行），修改：

**修改前**：

```typescript
// 退出条件
const exitCondition = this.getConfig('exit', '用户提供了足够的信息');
variables.set('exit', exitCondition);
```

**修改后**：

```typescript
// 退出条件文本描述
const exitCondition = this.getConfig('exit_condition', '用户提供了足够的信息');
variables.set('exit_condition', exitCondition);
```

- [ ] **Step 2: 提交 ai-ask-action 更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/core-engine/src/domain/actions/ai-ask-action.ts
git commit -m "refactor(core): 更新ai-ask-action中exit字段引用为exit_condition"
```

---

## Task 5: 更新核心引擎 - exit-decision-engine.ts

**Files:**

- Modify: `packages/core-engine/src/engines/exit-decision/exit-decision-engine.ts`

- [ ] **Step 1: 移除 custom_conditions 相关检查**

检查文件中是否有 `custom_conditions` 相关的逻辑，如有则移除。

- [ ] **Step 2: 提交更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/core-engine/src/engines/exit-decision/exit-decision-engine.ts
git commit -m "refactor(core): 移除exit-decision-engine中custom_conditions检查"
```

---

## Task 6: 更新 Prompt Template

**Files:**

- Modify: `config/templates/default/ai_ask_v1.md`

- [ ] **Step 1: 更新退出条件部分**

**修改前**（第17-18行）：

```markdown
【退出条件】
{{exit}}
```

**修改后**：

```markdown
【退出条件】
满足以下条件时可退出: {{exit_condition}}
```

- [ ] **Step 2: 添加紧迫度优先级指导**

在【信息收集任务】部分后，添加紧迫度指导（约在第5-6行后插入）：

```markdown
【当前进度】
第 {{current_round}}/{{max_rounds}} 轮
已收集信息：
{{collected_variables}}

【当前对话历史】
{{chat}}

【语气风格】
{{tone}}

【退出条件】
满足以下条件时可退出: {{exit_condition}}

【信息收集紧迫度与策略】

**紧迫度等级定义**：

1. **即时 (urgent)** - 必须立刻获得：
   - 用户不答 → 反复追问 → 仍拒绝 → 建议转人工或终止
   - 未获取前不得进行其他话题
2. **本次对话内 (in-session)** - 优先本次获取：
   - 正常周期内尝试收集
   - 用户回避 → 暂时跳过 → 最后2-3轮再问一次
   - 最终未获取 → 标注假设状态，继续后续流程
3. **可推迟 (deferrable)** - 可推迟到下次：
   - 不主动追问，如果用户主动提及时顺势收集
   - 咨询结束时提示"这个问题下次可以再聊"
4. **持续跟踪 (tracking-only)** - 仅记录：
   - 不主动提问，仅记录用户自发提供的信息
   - 用于长期趋势分析

**轮次紧迫度判断**：

- 当前轮次：{{current_round}}/{{max_rounds}}
- **最后3轮**：（如 97/100, 98/100, 99/100）
  - 集中火力于 **即时** 和 **本次对话内** 级别信息
  - 如果仍有 **即时** 信息未获，提示用户"这是最后一次机会"
  - 可跳过 **可推迟** 和 **持续跟踪** 级别的信息
```

- [ ] **Step 3: 更新判断退出逻辑说明**

修改第44-56行的退出判断说明：

**修改前**：

```markdown
2. **判断是否退出**：
   - 检查是否满足【退出条件】
   - 如果用户阻抗明显或信息已完整，设置 exit 为 "true"
   - 如果信息不足但用户愿意配合，设置 exit 为 "false"
   - 从以下关键字中选择 exit_reason：
     - `信息已完整` - 正常完成，任务目标达成
     - `信息不足` - 用户未提供足够信息，需要继续
     - `用户阻抗` - 用户回避/抗拒，建议退出
     - `达到最大轮次` - 安全网触发，强制退出
     - `用户理解困难` - 用户困惑，无法继续
     - `话题偏离` - 偏题严重，建议退出
     - `危机信号` - 检测到危机，需要处理
     - `继续收集` - 正常继续收集信息
```

**修改后**：

```markdown
2. **判断是否退出**：
   - 检查是否满足【退出条件】
   - 根据紧迫度评估信息收集情况
   - 如果用户阻抗明显或信息已完整，设置 exit 为 "true"
   - 如果信息不足但用户愿意配合，设置 exit 为 "false"
   - 从以下关键字中选择 exit_reason：
     - `信息已完整` - 正常完成，任务目标达成
     - `信息不足` - 用户未提供足够信息，需要继续
     - `用户阻抗` - 用户回避/抗拒，建议退出
     - `达到最大轮次` - 安全网触发，强制退出
     - `用户理解困难` - 用户困惑，无法继续
     - `话题偏离` - 偏题严重，建议退出
     - `危机信号` - 检测到危机，需要处理
     - `继续收集` - 正常继续收集信息
```

- [ ] **Step 4: 提交模板更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add config/templates/default/ai_ask_v1.md
git commit -m "feat(template): 添加紧迫度优先级指导，更新退出条件字段名"
```

---

## Task 7: 更新前端类型定义

**Files:**

- Modify: `packages/script-editor/src/types/action.ts`

- [ ] **Step 1: 检查并移除 CustomExitCondition 相关类型**

如果该文件中有 `CustomExitCondition` 或 `custom_conditions` 相关的类型定义，移除它们。

- [ ] **Step 2: 更新字段名**

如果该文件中有 `exit` 字段的类型定义，重命名为 `exit_condition`。

- [ ] **Step 3: 提交更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/script-editor/src/types/action.ts
git commit -m "refactor(frontend): 更新action类型定义，移除custom_conditions"
```

---

## Task 8: 更新前端验证逻辑

**Files:**

- Modify: `packages/script-editor/src/utils/aiAskValidation.ts`

- [ ] **Step 1: 更新字段名验证**

如果该文件中有对 `exit` 字段的验证，重命名为 `exit_condition`。

- [ ] **Step 2: 移除 custom_conditions 验证**

移除对 `custom_conditions` 字段的验证逻辑。

- [ ] **Step 3: 提交更改**

```bash
cd /home/leo/projects/HeartRule-Qoder
git add packages/script-editor/src/utils/aiAskValidation.ts
git commit -m "refactor(frontend): 更新ai_ask验证逻辑，移除custom_conditions验证"
```

---

## Task 9: 更新测试文件

**Files:**

- Modify: `packages/core-engine/test/regression/multi-round-exit-decision.test.ts`
- Modify: `packages/core-engine/test/unit/template-validation.test.ts`
- 其他相关测试文件

- [ ] **Step 1: 更新 multi-round-exit-decision.test.ts**

文件路径：`/home/leo/projects/HeartRule-Qoder/packages/core-engine/test/regression/multi-round-exit-decision.test.ts`

**需要修改的内容**：

1. 移除所有 `custom_conditions` 相关的测试用例（第133-145行，第193-230行）
2. 更新字段名 `exit` → `exit_condition`（如果测试中使用）

使用 TDD 方式：

1. 先运行测试确认当前状态

   ```bash
   cd /home/leo/projects/HeartRule-Qoder
   pnpm test -- packages/core-engine/test/regression/multi-round-exit-decision.test.ts
   ```

2. 根据错误信息更新测试代码

3. 再次运行测试确认通过
   ```bash
   pnpm test -- packages/core-engine/test/regression/multi-round-exit-decision.test.ts
   ```

- [ ] **Step 2: 更新 template-validation.test.ts**

文件路径：`/home/leo/projects/HeartRule-Qoder/packages/core-engine/test/unit/template-validation.test.ts`

更新字段名引用。

- [ ] **Step 3: 运行所有测试**

```bash
cd /home/leo/projects/HeartRule-Qoder
pnpm test
```

- [ ] **Step 4: 提交测试更改**

```bash
git add packages/core-engine/test/
git commit -m "test: 更新测试以匹配exit_condition重命名和custom_conditions移除"
```

---

## Task 10: 迁移 YAML 脚本

**Files:**

- Modify: `scripts/sessions/exit-tests/*.yaml` (所有相关YAML脚本)

- [ ] **Step 1: 批量重命名 exit 字段**

在 `scripts/sessions/exit-tests/` 目录下所有 YAML 文件中：

- 将 `exit:` 重命名为 `exit_condition:`
- 删除所有 `custom_conditions:` 相关配置行

可以使用 sed 命令或手动编辑。

示例：

```bash
cd /home/leo/projects/HeartRule-Qoder/scripts/sessions/exit-tests
# 使用 sed 批量替换（谨慎使用）
find . -name "*.yaml" -type f -exec sed -i 's/^    exit:/    exit_condition:/g' {} \;
```

- [ ] **Step 2: 为 output 字段添加 require 属性**

在每个 YAML 文件的 `output` 部分，添加 `require` 字段：

示例：

```yaml
output:
  - get: '症状描述'
    define: '来访者描述的影响日常生活的客观表现'
    require: '即时' # 新增字段
```

- [ ] **Step 3: 验证脚本语法**

```bash
cd /home/leo/projects/HeartRule-Qoder
# 运行一些简单的测试确保脚本格式正确
pnpm test -- packages/core-engine/test/regression/
```

- [ ] **Step 4: 提交脚本迁移**

```bash
git add scripts/
git commit -m "refactor(scripts): 迁移YAML脚本字段名exit→exit_condition，添加require字段"
```

---

## Task 11: 最终验证和类型检查

**Files:**

- All packages

- [ ] **Step 1: 运行完整的类型检查**

```bash
cd /home/leo/projects/HeartRule-Qoder
pnpm typecheck
```

预期输出：无错误

- [ ] **Step 2: 运行完整的测试套件**

```bash
pnpm test
```

预期输出：所有测试通过（可能需要调整一些测试预期）

- [ ] **Step 3: 运行构建**

```bash
pnpm build
```

预期输出：构建成功

- [ ] **Step 4: 运行 lint 检查**

```bash
pnpm lint
```

如有问题，运行：

```bash
pnpm lint:fix
```

- [ ] **Step 5: 最终提交**

```bash
git add .
git commit -m "refactor: 完成AI_Ask退出条件重构

- 重命名exit字段为exit_condition
- 移除custom_conditions字段和相关逻辑
- 添加output.require字段支持4个紧迫度等级
- 更新模板添加紧迫度优先级指导
- 设置max_rounds默认值为100
- 设置require默认值为'可推迟'
- 更新所有相关测试和YAML脚本"
```

---

## Task 12: 更新文档

**Files:**

- Update: `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`

- [ ] **Step 1: 更新设计规范文档**

在 `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md` 中：

1. 更新字段名称 `exit` → `exit_condition`
2. 移除 custom_conditions 的说明
3. 添加 require 字段的紧迫度等级说明
4. 更新默认值说明

- [ ] **Step 2: 提交文档更新**

```bash
git add docs/
git commit -m "docs: 更新AI_Ask退出判断机制设计文档"
```

---

## 验收标准

- [ ] 所有单元测试通过
- [ ] 所有端到端测试通过
- [ ] TypeScript 类型检查无错误
- [ ] 构建成功
- [ ] Lint 检查通过
- [ ] YAML 脚本语法正确
- [ ] 字段名已全部更新：`exit` → `exit_condition`
- [ ] `custom_conditions` 已从代码和配置中移除
- [ ] `output.require` 字段已添加并支持4个紧迫度等级
- [ ] 模板已更新紧迫度优先级指导
- [ ] 默认值已设置：`max_rounds: 100`, `require: "可推迟"`
- [ ] 文档已更新

---

## 回滚计划

如果实施过程中遇到严重问题：

1. **软回滚**（代码层面）：

   ```bash
   git revert HEAD
   ```

2. **硬回滚**（删除所有更改）：

   ```bash
   git reset --hard <commit-hash-before-refactor>
   ```

3. **分步回滚**：
   - 每个任务都有独立的 commit，可以选择性回滚特定任务

---

## 风险与缓解

| 风险                       | 缓解措施                               |
| -------------------------- | -------------------------------------- |
| 类型定义不完整导致编译错误 | 每个阶段运行 typecheck                 |
| 测试失败                   | 使用 TDD 方式，先运行测试再修改代码    |
| YAML 脚本迁移遗漏          | 批量搜索 exit 字段确保无遗漏           |
| 前端类型冲突               | 及时更新前端类型定义并运行测试         |
| 向后兼容性                 | 提供迁移指南，旧字段支持过渡期（可选） |

---

## 实施优先级

**高优先级**：

1. Task 1: JSON Schemas
2. Task 2: 共享类型定义
3. Task 3-5: 核心引擎更新
4. Task 6: Prompt Template

**中优先级**：5. Task 7-8: 前端更新 6. Task 9: 测试更新

**后续任务**：7. Task 10: YAML 脚本迁移 8. Task 11: 最终验证 9. Task 12: 文档更新

---

## 实施顺序建议

**阶段1：核心架构更新**（Task 1-6）

- 先更新Schema和类型定义（基础设施）
- 再更新核心引擎代码（业务逻辑）
- 最后更新模板（LLM接口）

**阶段2：测试和前端**（Task 7-9）

- 更新前端类型和验证
- 更新测试确保功能正常

**阶段3：迁移和验证**（Task 10-12）

- 迁移现有YAML脚本
- 最终验证和文档更新
