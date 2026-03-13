---
document_id: domain-tactical-ai-ask-execution-sequence
category: domain/tactical
status: active
version: 1.0.0
last_updated: 2026-03-13
source: docs/design/ai-ask-execution-sequence.md
tags: [ai_ask, execution-sequence, ddd-tactical, monitoring-feedback]
search_priority: high
---

# ai_ask Action Complete Execution Sequence

## Overview

This document describes the complete execution flow of the ai_ask Action, from first-round execution, multi-round interaction, monitoring feedback loop, to final exit, including interaction sequences with components such as ScriptExecutor, MonitorOrchestrator, and AiAskMonitorHandler.

## 1. First Round Execution (Sending Question)

```mermaid
sequenceDiagram
    participant User as User
    participant Executor as ScriptExecutor
    participant Action as AiAskAction
    participant Template as TemplateResolver
    participant LLM as LLM Orchestrator

    User->>Executor: executeSession(script, null)
    Executor->>Executor: executeTopic()
    Executor->>Action: execute(context, null)

    Note over Action: currentRound = 0
    Action->>Action: registerOutputVariables()
    Action->>Action: executeMultiRound()
    Action->>Action: loadTemplate(context)
    Action->>Template: resolveTemplatePath('ai_ask')
    Template-->>Action: {path, layer, scheme}
    Action->>Action: Load template content

    Action->>Action: extractScriptVariables()
    Action->>Action: buildSystemVariables()
    Action->>Action: getMonitorFeedback()
    Note over Action: No monitor feedback in first round

    Action->>Action: buildPrompt(template, scriptVars, systemVars, "")
    Action->>LLM: generateText(prompt)
    LLM-->>Action: {text, debugInfo}

    Action->>Action: parseLLMResponse()
    Action->>Action: parseMultiRoundOutput()
    Note over Action: Extract content, EXIT, metrics, etc.

    Action-->>Executor: ActionResult{completed:false, aiMessage, metrics, progress_suggestion}

    Executor->>Executor: handleActionNotCompleted()
    Executor->>Executor: Save aiMessage to conversationHistory
    Executor->>Executor: status = WAITING_INPUT
    Executor-->>User: Return question, wait for answer
```

## 2. Subsequent Rounds (User Answer + Monitor Feedback)

```mermaid
sequenceDiagram
    participant User as User
    participant Executor as ScriptExecutor
    participant ResultHandler as ExecutionResultHandler
    participant Action as AiAskAction
    participant MonitorOrch as MonitorOrchestrator
    participant Monitor as AiAskMonitorHandler
    participant MonitorLLM as Monitor LLM
    participant ActionLLM as Action Main Thread LLM

    User->>Executor: executeSession(script, userInput)
    Executor->>Executor: continueAction()
    Executor->>Executor: Add userInput to conversationHistory
    Note over Executor: executionState.conversationHistory.push()
    Executor->>Action: execute(context, userInput)

    Note over Action: currentRound++
    Action->>Action: loadTemplate()
    Action->>Action: getMonitorFeedback(context)
    Note over Action: Read latestMonitorFeedback
    Action->>Action: buildPrompt()
    Note over Action: Append monitor feedback to prompt end

    Action->>ActionLLM: generateText(prompt + monitor feedback)
    ActionLLM-->>Action: {text, debugInfo}

    Action->>Action: parseMultiRoundOutput()
    Action->>Action: extractMetrics()
    Action->>Action: extractProgressSuggestion()
    Action->>Action: Check EXIT flag

    Action-->>Executor: ActionResult{completed:false/true, metrics, progress_suggestion}

    rect rgb(255, 244, 225)
        Note over Executor,MonitorLLM: Monitor Thread (async, non-blocking main flow)

        Executor->>ResultHandler: handleIncomplete()
        ResultHandler->>ResultHandler: Save aiMessage, debugInfo
        ResultHandler->>ResultHandler: storeMetricsAndTriggerMonitor()

        par Async Monitor Analysis
            ResultHandler->>MonitorOrch: analyze() [async trigger]
            Note over ResultHandler: No await, return immediately

            MonitorOrch->>MonitorOrch: selectHandler('ai_ask')
            MonitorOrch->>Monitor: new AiAskMonitorHandler()
            MonitorOrch->>Monitor: parseMetrics(result)
            Monitor-->>MonitorOrch: {information_completeness, user_engagement...}

            MonitorOrch->>Monitor: analyzeWithLLM(metrics, context)
            Monitor->>Monitor: buildMonitorVariables()
            Note over Monitor: Build monitor input: metrics + historical trends
            Monitor->>Monitor: generateMonitorPrompt()
            Monitor->>MonitorLLM: Call monitor template
            MonitorLLM-->>Monitor: {intervention_needed, feedback_for_action...}

            Monitor->>Monitor: parseMonitorOutput()
            Note over Monitor: 3 retries: direct→trim→extract_json_block
            Monitor-->>MonitorOrch: MonitorAnalysis

            MonitorOrch->>Monitor: buildFeedbackPrompt(analysis)
            Monitor-->>MonitorOrch: [Topic-level strategy suggestion] text

            MonitorOrch->>MonitorOrch: storeFeedback()
            MonitorOrch->>Executor: Write to metadata.latestMonitorFeedback
            MonitorOrch->>Executor: Write to metadata.monitorFeedback[]
        end
    end

    Executor-->>User: Return aiMessage, wait for next input
```

## 3. Exit Condition and Completion

```mermaid
sequenceDiagram
    participant Action as AiAskAction
    participant Executor as ScriptExecutor
    participant ResultHandler as ExecutionResultHandler

    Action->>Action: executeMultiRound()
    Action->>Action: Check exit conditions

    alt max_rounds reached
        Action->>Action: exitReason = 'max_rounds_reached'
        Action->>Action: finishAction()
        Action->>Action: Backtrack variables from conversation history
        Action-->>Executor: ActionResult{completed:true, exit_reason}
    else EXIT='true'
        Action->>Action: exitReason = 'exit_criteria_met'
        Action->>Action: finishAction()
        Action-->>Executor: ActionResult{completed:true, exit_reason}
    else progress_suggestion='blocked'
        Action->>Action: exitReason = 'user_blocked'
        Action->>Action: finishAction()
        Action-->>Executor: ActionResult{completed:true, exit_reason}
    else Continue questioning
        Action-->>Executor: ActionResult{completed:false}
    end

    Executor->>ResultHandler: handleCompleted()
    ResultHandler->>ResultHandler: handleActionCompleted()
    ResultHandler->>ResultHandler: processExtractedVariables()
    ResultHandler->>ResultHandler: Write to variableStore scopes
    ResultHandler->>Executor: Return

    Executor->>Executor: moveToNextAction()
    Executor->>Executor: Prepare next Action
```

## 4. Monitor Feedback Loop (Key Mechanism)

```mermaid
flowchart TD
    A[ai_ask Round 1 Execution] --> B[Return metrics:<br/>user_engagement='brief response']
    B --> C[ResultHandler stores metrics to<br/>actionMetricsHistory]
    C --> D[Async trigger MonitorOrchestrator]

    D --> E[AiAskMonitorHandler.parseMetrics]
    E --> F[analyzeWithLLM:<br/>Call monitor template]
    F --> G[Monitor LLM Analysis:<br/>Detect user avoidance]
    G --> H[buildFeedbackPrompt:<br/>Generate feedback text]
    H --> I[Store in metadata.latestMonitorFeedback]

    I -.Async complete.-> J[ai_ask Round 2 Execution]
    J --> K[getMonitorFeedback:<br/>Read latestMonitorFeedback]
    K --> L[buildPrompt:<br/>Append monitor feedback to prompt]
    L --> M[Action main thread LLM call<br/>with monitor suggestion]
    M --> N[Generate adjusted question]

    style D fill:#fff4e1
    style E fill:#fff4e1
    style F fill:#fff4e1
    style G fill:#fff4e1
    style H fill:#fff4e1
    style I fill:#fff4e1
    style M fill:#e1f5ff
```

## Core Design Points

### Async Monitor Mechanism

- Monitor analysis is triggered asynchronously via `.catch()`, not blocking Action main flow
- ResultHandler.storeMetricsAndTriggerMonitor() does not use `await`
- Monitor failure does not affect session continuation

### Monitor Feedback Loop

1. Action execution returns metrics (user engagement, information completeness, etc.)
2. ResultHandler stores to actionMetricsHistory
3. MonitorOrchestrator asynchronously calls AiAskMonitorHandler
4. Monitor LLM analyzes user response patterns, generates adjustment suggestions
5. Suggestions stored in metadata.latestMonitorFeedback
6. Next round Action execution reads and appends to prompt
7. Action LLM adjusts questioning strategy based on feedback

### Exit Conditions

- **max_rounds_reached**: Maximum rounds reached
- **exit_criteria_met**: LLM determines information is sufficient (EXIT='true')
- **user_blocked**: progress_suggestion='blocked', user explicitly refuses to answer

### Variable Extraction and Scope

- When Action completes, backtrack and extract output variables from conversationHistory
- Write to corresponding scope via VariableScopeResolver (topic/phase/session/global)
- Support scope override rules: topic > phase > session > global

## Related Files

- `packages/core-engine/src/domain/actions/ai-ask-action.ts` - AiAskAction implementation
- `packages/core-engine/src/engines/script-execution/script-executor.ts` - ScriptExecutor (refactored)
- `packages/core-engine/src/application/handlers/execution-result-handler.ts` - Result handler
- `packages/core-engine/src/application/orchestrators/monitor-orchestrator.ts` - Monitor orchestrator
- `packages/core-engine/src/application/monitors/ai-ask-monitor-handler.ts` - ai_ask monitor handler
- `packages/core-engine/src/application/monitors/base-monitor-handler.ts` - Monitor base class

## ScriptExecutor Refactoring Notes

### Refactoring Principles (Martin Fowler)

Following "Refactoring: Improving the Design of Existing Code" principles, the following refactorings were applied to ScriptExecutor:

#### 1. Extract Method

**Original executeSession (150 lines) split into:**

- `executeSession` (32 lines) - Main flow orchestration
- `initializeSession` (13 lines) - Initialize session
- `resumeCurrentActionIfNeeded` (34 lines) - Resume incomplete action
- `handleIncompleteAction` (19 lines) - Handle incomplete action
- `handleCompletedAction` (14 lines) - Handle completed action
- `executeAllPhases` (15 lines) - Execute all phases
- `moveToNextPhase` (9 lines) - Move to next phase
- `updatePositionForNextPhase` (19 lines) - Update phase position info
- `clearPositionIds` (5 lines) - Clear position IDs
- `clearActionIds` (3 lines) - Clear action IDs
- `clearTopicAndActionIds` (4 lines) - Clear topic and action IDs

**Original updateVariablesWithScope (60 lines) split into:**

- `updateVariablesWithScope` (15 lines) - Variable update main logic
- `writeVariablesToScopes` (18 lines) - Write variables to scopes
- `writeVariableToScope` (12 lines) - Write single variable
- `verifyVariablesWritten` (25 lines) - Verify variable write success

**Original executePhase (47 lines) split into:**

- `executePhase` (14 lines) - Phase execution main logic
- `moveToNextTopic` (9 lines) - Move to next topic
- `updatePositionForNextTopic` (13 lines) - Update topic position info

#### 2. Single Responsibility Principle

Each extracted function has a single clear responsibility:

- **Initialization**: Parse script, setup metadata, restore state
- **Execution**: Execute phase, topic, action
- **State Management**: Update position, clear position, save state
- **Variable Processing**: Write variables, verify variables, determine scope

#### 3. Composed Method

The refactored main method uses composition pattern, each step completed by a clearly named sub-method:

```typescript
async executeSession(...) {
  const phases = this.initializeSession(...);
  const shouldContinue = await this.resumeCurrentActionIfNeeded(...);
  if (!shouldContinue) return executionState;
  await this.executeAllPhases(...);
  executionState.status = ExecutionStatus.COMPLETED;
  return executionState;
}
```

#### 4. Guard Clauses

Use early return pattern to reduce nesting:

```typescript
if (!executionState.variableStore) {
  console.warn('...');
  return; // Early return, avoid deep nesting
}
```

### Refactoring Results

- ✅ **Improved Readability**: Function length reduced from 150 lines to 32 lines
- ✅ **Enhanced Testability**: Each sub-function can be tested independently
- ✅ **Improved Maintainability**: Clear responsibilities, easy to locate issues
- ✅ **Backward Compatible**: All existing tests pass (Phase 1, Phase 8)
- ✅ **No Performance Loss**: No additional overhead, pure logic reorganization
