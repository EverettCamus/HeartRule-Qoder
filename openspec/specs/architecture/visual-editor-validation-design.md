---
document_id: architecture-visual-editor-validation-design
authority: architecture-design
status: active
version: 1.0.0
last_updated: 2026-02-10
source: docs/design/visual-editor-validation-design.md
path: architecture/visual-editor-validation-design.md
tags: [visual-editor, validation, schema, architecture-design]
search_priority: medium
---

# Visual Editor Validation Feature Design

## Problem Analysis

### Problem 1: Validation errors not visible in Visual Editor mode

**Current State**: Validation error panel only displays in YAML Mode
**Requirement**: Validation errors should also be visible in Visual Editor mode

### Problem 2: Deprecated fields not detected

**Current State**: The following deprecated fields in the script are not detected:

```yaml
- action_id: action_2
  action_type: ai_ask
  config:
    content_template: Ask the visitor how to address them # ❌ Not detected
    question_template: Ask the visitor how to address them # ❌ Not detected
    exit: Received the visitor's name
    target_variable: user_name # ❌ Not detected
    extraction_prompt: Acceptable name for the visitor # ❌ Not detected
    required: false # ❌ Not detected
    max_rounds: 3
```

**Root Cause**:

- Topic Schema references `action-base.schema.json`
- Action Base Schema defines `config` field only as `type: object`, without deep validation
- Need to dynamically reference the corresponding Config Schema based on `action_type`

## Solution Design

### Solution 1: Fix Deep Validation (Solves Problem 2)

#### 1.1 Use JSON Schema if-then-else Conditional Validation

Modify `action-base.schema.json` to dynamically reference the corresponding Config Schema based on `action_type`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "action-base.schema.json",
  "title": "Action Base Schema",
  "type": "object",
  "required": ["action_type", "action_id"],
  "properties": {
    "action_type": {
      "type": "string",
      "enum": ["ai_say", "ai_ask", "ai_think", "use_skill"]
    },
    "action_id": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "condition": {
      "type": "string"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": { "action_type": { "const": "ai_ask" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-ask-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "ai_say" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-say-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "ai_think" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "ai-think-config.schema.json" }
        },
        "required": ["config"]
      }
    },
    {
      "if": {
        "properties": { "action_type": { "const": "use_skill" } }
      },
      "then": {
        "properties": {
          "config": { "$ref": "use-skill-config.schema.json" }
        },
        "required": ["config"]
      }
    }
  ],
  "additionalProperties": false
}
```

**Advantages**:

- Standard JSON Schema approach
- One modification solves all problems
- Deprecated fields are automatically detected

**Disadvantages**:

- Requires AJV to properly support if-then-else (needs testing)
- Schema file becomes more complex

#### 1.2 Create Independent Schema File References

Create complete Schema files for each Action type:

**ai-ask-action.schema.json**:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "ai-ask-action.schema.json",
  "title": "AI Ask Action Schema",
  "type": "object",
  "required": ["action_type", "action_id", "config"],
  "properties": {
    "action_type": { "const": "ai_ask" },
    "action_id": { "type": "string", "minLength": 1 },
    "condition": { "type": "string" },
    "config": { "$ref": "ai-ask-config.schema.json" }
  },
  "additionalProperties": false
}
```

Then use `oneOf` selection in Topic Schema:

```json
{
  "actions": {
    "type": "array",
    "minItems": 1,
    "items": {
      "oneOf": [
        { "$ref": "ai-ask-action.schema.json" },
        { "$ref": "ai-say-action.schema.json" },
        { "$ref": "ai-think-action.schema.json" },
        { "$ref": "use-skill-action.schema.json" }
      ]
    }
  }
}
```

**Advantages**:

- Clear structure, each Action type is independent
- Easy to maintain and extend

**Disadvantages**:

- Need to create more Schema files
- May produce redundant error messages (when oneOf fails)

**Recommendation**: Use Solution 1.1 (if-then-else)

### Solution 2: Display Validation Errors in Visual Editor Mode (Solves Problem 1)

#### 2.1 UI Display Location Options

**Option A: Display global error panel at top of ActionNodeList**

```
┌─────────────────────────────────┐
│  ⚠️ Found 6 script validation errors │
│  [Click to view details]        │
└─────────────────────────────────┘
┌─────────────────────────────────┐
│  Phase 1: Build Relationship    │
│    Topic 1: Welcome             │
│      Action 1 ✅                 │
│      Action 2 ❌ (has errors)   │  ← Mark nodes with errors
│    Topic 2: ...                 │
└─────────────────────────────────┘
```

**Option B: Display current Action errors in property panel**

```
┌─────────────────────────────────┐
│  Action Properties              │
├─────────────────────────────────┤
│  ⚠️ This Action has 5 validation errors │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  ❌ Missing required field 'content' │
│  ❌ Deprecated field 'content_template' │
│  ...                            │
├─────────────────────────────────┤
│  Action ID: action_2            │
│  Action Type: ai_ask            │
│  ...                            │
└─────────────────────────────────┘
```

**Option C: Mark errors directly in node list**

```
┌─────────────────────────────────┐
│  Phase 1: Build Relationship    │
│    Topic 1: Welcome             │
│      Action 1 ✅                 │
│      ┌───────────────────────┐  │
│      │ Action 2 ❌           │  │
│      │ ⚠️ 5 field errors     │  │  ← Hover to show error summary
│      └───────────────────────┘  │
└─────────────────────────────────┘
```

**Recommendation**: Combined approach

- Display **global error summary at top of ActionNodeList** (Option A)
- **Mark Actions with errors** using red border or icon on nodes (Option C)
- Display **detailed errors for selected Action** in property panel (Option B)

#### 2.2 Error Data Structure

Need to group validation errors by hierarchy:

```typescript
interface ValidationErrorsByPath {
  // Global errors
  global: ValidationErrorDetail[];

  // Group by Phase-Topic-Action
  byAction: Map<
    string,
    {
      phaseIndex: number;
      topicIndex: number;
      actionIndex: number;
      errors: ValidationErrorDetail[];
    }
  >;
}
```

#### 2.3 Implementation Steps

**Step 1**: Parse error paths to extract location information

```typescript
/**
 * Extract Phase/Topic/Action indices from error path
 * Example: "phases[0].topics[1].actions[2].config.content"
 * Returns: { phaseIndex: 0, topicIndex: 1, actionIndex: 2 }
 */
function parseErrorPath(path: string): {
  phaseIndex: number | null;
  topicIndex: number | null;
  actionIndex: number | null;
} {
  const phaseMatch = path.match(/phases\[(\d+)\]/);
  const topicMatch = path.match(/topics\[(\d+)\]/);
  const actionMatch = path.match(/actions\[(\d+)\]/);

  return {
    phaseIndex: phaseMatch ? parseInt(phaseMatch[1]) : null,
    topicIndex: topicMatch ? parseInt(topicMatch[1]) : null,
    actionIndex: actionMatch ? parseInt(actionMatch[1]) : null,
  };
}
```

**Step 2**: Display error summary in ActionNodeList

```tsx
// ActionNodeList component
{
  validationResult && !validationResult.valid && (
    <Alert
      message={`Found ${validationResult.errors.length} script validation errors`}
      type="error"
      closable
      showIcon
      style={{ margin: '12px' }}
    />
  );
}
```

**Step 3**: Mark Action nodes with errors

```tsx
// Calculate error count for each Action
const actionErrors = useMemo(() => {
  if (!validationResult) return new Map();

  const errorMap = new Map<string, number>();
  validationResult.errors.forEach((error) => {
    const { phaseIndex, topicIndex, actionIndex } = parseErrorPath(error.path);
    if (phaseIndex !== null && topicIndex !== null && actionIndex !== null) {
      const key = `${phaseIndex}-${topicIndex}-${actionIndex}`;
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
  });

  return errorMap;
}, [validationResult]);

// Display error marker when rendering Action
const errorCount = actionErrors.get(`${phaseIdx}-${topicIdx}-${actionIdx}`);
{
  errorCount && (
    <Tag color="error" style={{ marginLeft: '8px' }}>
      {errorCount} errors
    </Tag>
  );
}
```

**Step 4**: Display current Action errors in property panel

```tsx
// ActionPropertyPanel component
const currentActionErrors = useMemo(() => {
  if (!validationResult || !selectedActionPath) return [];

  return validationResult.errors.filter((error) => {
    const { phaseIndex, topicIndex, actionIndex } = parseErrorPath(error.path);
    return (
      phaseIndex === selectedActionPath.phaseIndex &&
      topicIndex === selectedActionPath.topicIndex &&
      actionIndex === selectedActionPath.actionIndex
    );
  });
}, [validationResult, selectedActionPath]);

// Display errors at top of panel
{
  currentActionErrors.length > 0 && (
    <ValidationErrorPanel errors={currentActionErrors} onClose={() => {}} />
  );
}
```

## Implementation Plan

### Phase 1: Fix Deep Validation (High Priority)

1. Modify `action-base.schema.json`, add if-then-else conditional validation
2. Recompile core-engine
3. Test if deprecated fields can be detected

### Phase 2: Visual Editor Error Display (Medium Priority)

1. Create `parseErrorPath` utility function
2. Add global error summary at top of ActionNodeList
3. Add error markers on Action nodes
4. Display current Action errors in ActionPropertyPanel

### Phase 3: User Experience Optimization (Low Priority)

1. Click error summary to auto-jump to first Action with errors
2. Hover over error marker to show error preview
3. Provide one-click fix for deprecated fields

## Test Cases

### Case 1: Deprecated Field Detection

**Input**: ai_ask Action containing 5 deprecated fields
**Expected**: Detect 6 errors (missing content + 5 deprecated fields)

### Case 2: Visual Editor Error Display

**Input**: Open script with errors, switch to Visual Editor
**Expected**:

- Error summary displayed at top of ActionNodeList
- Actions with errors show red markers
- When selecting an Action with errors, property panel displays detailed errors

### Case 3: Post-Fix Validation

**Input**: Fix all deprecated fields
**Expected**:

- Error markers disappear
- Error summary disappears
- Can save normally

## Known Issues

### Issue 1: AJV Support for if-then-else

**Risk**: Some versions of AJV have incomplete support for if-then-else
**Mitigation**: Use latest version of AJV, test and verify

### Issue 2: Performance Issues

**Risk**: Re-parsing all error paths on every edit may affect performance
**Mitigation**: Use useMemo to cache computation results

## References

- [JSON Schema Conditionals](https://json-schema.org/understanding-json-schema/reference/conditionals.html)
- [AJV if-then-else support](https://ajv.js.org/json-schema.html#if-then-else)
