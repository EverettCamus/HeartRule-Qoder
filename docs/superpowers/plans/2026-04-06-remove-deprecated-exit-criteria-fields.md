# Remove Deprecated Exit Criteria Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `understanding_threshold` and `has_questions` fields from schemas and type definitions (strict mode, breaking backward compatibility).

**Architecture:** These semantic-threshold fields are no longer processed by the code layer (delegate to LLM). Clean up JSON schemas, TypeScript types, and Zod schemas to match the refactored code behavior.

**Tech Stack:** TypeScript, Zod, JSON Schema

---

## Files Affected

| File                                                                                 | Change | Description                                            |
| ------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------ |
| `packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json` | Modify | Remove `understanding_threshold`, `has_questions`      |
| `packages/shared-types/src/domain/exit-decision.ts`                                  | Modify | Remove fields from `ExitCriteria` interface and schema |

---

### Task 1: Update ai-ask.schema.json

**Files:**

- Modify: `packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json`

- [ ] **Step 1: Remove deprecated fields from schema**

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
    "exit": {
      "type": "string",
      "description": "退出条件"
    },
    "output": {
      "type": "array",
      "items": {
        "$ref": "output-field.schema.json"
      },
      "description": "输出变量配置"
    },
    "max_rounds": {
      "type": "number",
      "minimum": 1,
      "maximum": 200,
      "default": 20,
      "description": "最大轮数"
    },
    "custom_conditions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "variable": {
            "type": "string",
            "description": "变量名"
          },
          "operator": {
            "type": "string",
            "enum": ["==", "!=", ">", "<", ">=", "<=", "contains"],
            "description": "比较操作符"
          },
          "value": {
            "description": "比较值"
          }
        },
        "required": ["variable", "operator", "value"]
      },
      "description": "自定义退出条件"
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `cat packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json | jq . > /dev/null && echo "Valid JSON"`

- [ ] **Step 3: Commit**

```bash
git add packages/core-engine/src/adapters/inbound/script-schema/actions/ai-ask.schema.json
git commit -m "refactor(schema): remove understanding_threshold and has_questions from ai-ask schema"
```

---

### Task 2: Update ExitCriteria Type and Schema

**Files:**

- Modify: `packages/shared-types/src/domain/exit-decision.ts`

- [ ] **Step 1: Update ExitCriteria interface and comments**

Update the interface and doc comments at lines 51-70:

```typescript
/**
 * 退出条件配置（通用 superset）
 *
 * 针对不同的 action_type，实际可用字段有所不同：
 * - ai_ask: custom_conditions, max_rounds, required_variables
 * - ai_say: custom_conditions
 * - fill_form: custom_conditions (表单完整性由其他逻辑处理)
 * - 内部动作 (ai_think, use_skill, show_pic): 不使用 exit_criteria
 *
 * 设计决策：
 * - 已移除 min_rounds（无实际场景）
 * - 已移除 max_tokens、max_cost（应在系统层控制）
 * - 已移除 max_silence_rounds、min_response_length（与LLM阻抗检测重复）
 * - 已移除 understanding_threshold、has_questions（语义判断交给LLM的exit字段）
 */
export interface ExitCriteria {
  custom_conditions?: CustomExitCondition[]; // 自定义条件数组
  max_rounds?: number; // 最大轮次限制（安全网，防止LLM陷入死循环）
  required_variables?: string[]; // 必须收集的变量列表（确保任务完成）
}
```

- [ ] **Step 2: Update ExitCriteriaSchema**

Update the Zod schema at lines 75-81:

```typescript
export const ExitCriteriaSchema = z.object({
  custom_conditions: z.array(CustomExitConditionSchema).optional(),
  max_rounds: z.number().int().min(1).optional(),
  required_variables: z.array(z.string()).optional(),
});
```

- [ ] **Step 3: Build and verify**

Run: `pnpm --filter @heartrule/shared-types build`

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @heartrule/core-engine typecheck`

- [ ] **Step 5: Run tests**

Run: `pnpm test`

- [ ] **Step 6: Commit**

```bash
git add packages/shared-types/src/domain/exit-decision.ts
git commit -m "refactor(types): remove understanding_threshold and has_questions from ExitCriteria"
```

---

### Task 3: Verify No Remaining References

**Files:**

- None (verification only)

- [ ] **Step 1: Search for remaining references**

Run: `grep -r "understanding_threshold\|has_questions" packages/ --include="*.ts" --include="*.json" | grep -v "node_modules" | grep -v ".test.ts"`

- [ ] **Step 2: If any references found, they are in test files or should be removed**

Expected: No references in production code (tests already updated in previous refactor)

- [ ] **Step 3: Final verification**

Run: `pnpm test && pnpm typecheck`

---

## Summary

This plan removes deprecated exit criteria fields that were already disabled in code logic. The changes are:

1. **JSON Schema**: Remove `understanding_threshold` and `has_questions` from ai-ask.schema.json
2. **TypeScript Types**: Remove fields from `ExitCriteria` interface and update documentation
3. **Zod Schema**: Remove fields from `ExitCriteriaSchema`

**Breaking Changes**: YAML scripts using these fields will receive schema validation errors.
