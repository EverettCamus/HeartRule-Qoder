# Re-run Current Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable re-running the current action (or rolling back to any prior action) in a debug session without restarting, with editable prompt/LLM config, version history, and write-back to YAML.

**Architecture:** Per-action snapshots stored in `sessions.metadata.actionSnapshots[actionId]` capture state at action entry. Rerun API restores the snapshot, cascade-clears subsequent data, and re-executes. LLM config flows through `ActionContext.llmConfig` → action's `generateText()` calls with priority: call param > action config > global default.

**Tech Stack:** TypeScript, Fastify, React 18 + Ant Design, Drizzle ORM (PostgreSQL JSONB)

---

### Task 1: Extend ActionContext with llmConfig and wire into script-executor

**Files:**

- Modify: `packages/core-engine/src/domain/actions/base-action.ts:44-63`
- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts:1156-1167`
- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts:1195-1205`

- [ ] **Step 1: Add llmConfig to ActionContext interface**

In `base-action.ts`, add the optional `llmConfig` field to `ActionContext`:

```typescript
export interface ActionContext {
  sessionId: string;
  phaseId: string;
  topicId: string;
  actionId: string;
  variables: Record<string, any>;
  systemVariables?: Record<string, any>;
  variableStore?: VariableStore;
  scopeResolver?: VariableScopeResolver;
  conversationHistory: Array<{
    role: string;
    content: string;
    actionId?: string;
    metadata?: Record<string, any>;
  }>;
  metadata: Record<string, any>;
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}
```

- [ ] **Step 2: Inject llmConfig from executionState.metadata into ActionContext in executeAction()**

In `script-executor.ts`, in `executeAction()` at the context construction (~line 1156):

```typescript
const context: ActionContext = {
  sessionId,
  phaseId,
  topicId,
  actionId: action.actionId,
  variables: { ...executionState.variables },
  variableStore: executionState.variableStore,
  scopeResolver,
  conversationHistory: [...executionState.conversationHistory],
  metadata: { ...executionState.metadata },
  llmConfig: executionState.metadata.llmConfig || undefined,
};
```

- [ ] **Step 3: Inject llmConfig in continueAction()**

In `script-executor.ts`, in `continueAction()` at the context construction (~line 1195):

```typescript
const context: ActionContext = {
  sessionId,
  phaseId: executionState.currentPhaseId || `phase_${executionState.currentPhaseIdx}`,
  topicId: executionState.currentTopicId || `topic_${executionState.currentTopicIdx}`,
  actionId: action.actionId,
  variables: { ...executionState.variables },
  variableStore: executionState.variableStore,
  scopeResolver,
  conversationHistory: [...executionState.conversationHistory],
  metadata: { ...executionState.metadata },
  llmConfig: executionState.metadata.llmConfig || undefined,
};
```

- [ ] **Step 4: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/domain/actions/base-action.ts packages/core-engine/src/engines/script-execution/script-executor.ts
git commit -m "feat: add llmConfig to ActionContext and inject from execution state"
```

---

### Task 2: Make AiAskAction and AiSayAction read llmConfig from context

**Files:**

- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts:992-1001`
- Modify: `packages/core-engine/src/domain/actions/ai-ask-action.ts:517-527`
- Modify: `packages/core-engine/src/domain/actions/ai-say-action.ts:189-196`
- Modify: `packages/core-engine/src/domain/actions/ai-say-action.ts:375-386`

- [ ] **Step 1: AiAskAction.callLLM() — pass llmConfig to generateText()**

In `ai-ask-action.ts`, modify the `callLLM` method (~line 992):

```typescript
private async callLLM(prompt: string, context?: ActionContext) {
  if (!this.llmOrchestrator) {
    throw new Error('[callLLM] LLM Orchestrator is null');
  }
  try {
    const llmConfig = context?.llmConfig;
    return await this.llmOrchestrator.generateText(
      prompt,
      {
        temperature: llmConfig?.temperature ?? 0.7,
        maxTokens: llmConfig?.maxTokens ?? 4096,
        responseFormat: { type: 'json_object' },
      },
      llmConfig?.provider
    );
  } catch (e: any) {
    logger.error('❌ [callLLM] LLM call failed:', {
      message: e.message,
```

Note: `generateText(prompt, config?, providerName?)` — the third param switches providers. The `config` param's `model` field is used by the provider's `generateText` which merges it with instance config.

- [ ] **Step 2: AiAskAction — find all callLLM call sites and pass context**

Find all `this.callLLM(prompt)` calls and update to `this.callLLM(prompt, context)`. These are in the `execute()` method and potentially helper methods. Do a grep to find them all:

```bash
grep -n "this.callLLM" packages/core-engine/src/domain/actions/ai-ask-action.ts
```

Update each call site to pass `context`.

- [ ] **Step 3: AiAskAction.extractVariableByLlm() — pass provider**

In the `extractVariableByLlm` method (~line 524):

```typescript
const result = await this.llmOrchestrator!.generateText(
  extractPrompt,
  {
    temperature: context.llmConfig?.temperature ?? 0.3,
    maxTokens: context.llmConfig?.maxTokens ?? 500,
  },
  context.llmConfig?.provider
);
```

- [ ] **Step 4: AiSayAction — template mode generateText call (~line 192)**

```typescript
const llmConfig = context?.llmConfig;
const llmResult = await this.llmOrchestrator!.generateText(
  prompt,
  {
    temperature: llmConfig?.temperature ?? 0.7,
    maxTokens: llmConfig?.maxTokens ?? 1000,
    responseFormat: { type: 'json_object' },
  },
  llmConfig?.provider
);
```

- [ ] **Step 5: AiSayAction — natural expression generateText call (~line 382)**

```typescript
const llmConfig = context?.llmConfig;
const result = await this.llmOrchestrator.generateText(
  `${systemPrompt}\n\n${userPrompt}`,
  {
    temperature: llmConfig?.temperature ?? 0.7,
    maxTokens: llmConfig?.maxTokens ?? 500,
    responseFormat: { type: 'json_object' },
  },
  llmConfig?.provider
);
```

- [ ] **Step 6: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Run core-engine tests**

```bash
pnpm --filter @heartrule/core-engine test
```

- [ ] **Step 8: Commit**

```bash
git add packages/core-engine/src/domain/actions/ai-ask-action.ts packages/core-engine/src/domain/actions/ai-say-action.ts
git commit -m "feat: pass llmConfig from ActionContext to LLMOrchestrator.generateText() in ai_ask and ai_say actions"
```

---

### Task 3: Create action snapshots in ScriptExecutor when entering new actions

**Files:**

- Modify: `packages/core-engine/src/engines/script-execution/script-executor.ts:873-878`

- [ ] **Step 1: Add snapshot creation before executing a new action**

In `executeTopic()` where a new action instance is created (~line 873), add snapshot creation logic:

```typescript
// Create or get Action instance
if (!executionState.currentAction) {
  const action = this.createAction(actionConfig);
  executionState.currentAction = action;
  executionState.currentActionId = actionConfig.action_id;
  executionState.currentActionType = actionConfig.action_type;

  // Create action snapshot on first entry
  if (!executionState.metadata.actionSnapshots) {
    executionState.metadata.actionSnapshots = {};
  }
  const snapshots = executionState.metadata.actionSnapshots as Record<string, any>;
  if (!snapshots[actionConfig.action_id]) {
    snapshots[actionConfig.action_id] = {
      phaseIndex: executionState.currentPhaseIdx,
      topicIndex: executionState.currentTopicIdx,
      actionIndex: executionState.currentActionIdx,
      actionId: actionConfig.action_id,
      actionType: actionConfig.action_type,
      variableStore: executionState.variableStore
        ? JSON.parse(JSON.stringify(executionState.variableStore))
        : undefined,
      conversationHistoryLength: executionState.conversationHistory.length,
      timestamp: new Date().toISOString(),
      originalConfig: { ...actionConfig },
    };
  }

  logger.debug(`✅ Created action instance: ${action.actionId}`);
}
```

Note: `messageCount` will be added by SessionManager in `updateSessionState()` since it's a DB concept.

- [ ] **Step 2: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run core-engine tests**

```bash
pnpm --filter @heartrule/core-engine test
```

- [ ] **Step 4: Commit**

```bash
git add packages/core-engine/src/engines/script-execution/script-executor.ts
git commit -m "feat: create per-action snapshots on first entry in ScriptExecutor"
```

---

### Task 4: Add messageCount to snapshots and add rerunAction() to SessionManager

**Files:**

- Modify: `packages/api-server/src/services/session-manager.ts`

- [ ] **Step 1: Add messageCount to snapshots in updateSessionState()**

In `updateSessionState()` (~line 690), before persisting metadata, read the current max message id and add to any new snapshots:

```typescript
private async updateSessionState(
  sessionId: string,
  executionState: ExecutionState,
  globalVariables: Record<string, any>
): Promise<void> {
  // Add messageCount to any new snapshots that don't have it yet
  if (executionState.metadata.actionSnapshots) {
    const snapshots = executionState.metadata.actionSnapshots as Record<string, any>;
    for (const key of Object.keys(snapshots)) {
      if (snapshots[key].messageCount === undefined) {
        const maxMsg = await db.query.messages.findFirst({
          where: (fields, { eq: eqFn }) => eqFn(fields.sessionId, sessionId),
          orderBy: (fields, { desc: descFn }) => descFn(fields.id),
        });
        snapshots[key].messageCount = maxMsg ? maxMsg.id : 0;
      }
    }
  }

  await db
    .update(sessions)
    .set({
      position: { ... },
      variables: executionState.variables,
      executionStatus: executionState.status,
      metadata: {
        ...executionState.metadata,
        globalVariables,
        variableStore: executionState.variableStore,
        lastLLMDebugInfo: executionState.lastLLMDebugInfo,
      },
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));
}
```

Wait — finding max message id requires importing `desc` from drizzle-orm. Check the existing imports and add `desc` if not already imported.

Actual implementation — query the count instead of max id for reliability:

```typescript
const msgCount = await db.$count(messages, eq(messages.sessionId, sessionId));
snapshots[key].messageCount = msgCount;
```

- [ ] **Step 2: Add rerunAction() method to SessionManager**

Add the `rerunAction()` method. It reads a snapshot, restores DB state, cascade-clears subsequent data, applies config overrides, and re-executes:

```typescript
async rerunAction(
  sessionId: string,
  targetActionId?: string
): Promise<SessionResponse> {
  // 1. Load session and script
  const session = await this.loadSessionById(sessionId);
  const script = await this.loadScriptById(session.scriptId);

  const metadata = (session.metadata as Record<string, any>) || {};
  const actionSnapshots = metadata.actionSnapshots || {};

  // 2. Determine target action
  const currentActionId = (session.position as Record<string, any>)?.actionId
    || metadata.currentActionId;
  const targetKey = targetActionId || currentActionId;

  if (!targetKey || !actionSnapshots[targetKey]) {
    throw new Error(`No snapshot found for action: ${targetKey}`);
  }

  const snapshot = actionSnapshots[targetKey];

  // 3. Cascade cleanup: remove snapshots for actions after target
  const scriptContent = yaml.parse(script.scriptContent) || {};
  const phases = scriptContent.session?.phases || [];
  const allActionIds: string[] = [];
  for (const phase of phases) {
    for (const topic of (phase.topics || [])) {
      for (const action of (topic.actions || [])) {
        allActionIds.push(action.action_id);
      }
    }
  }
  const targetIdx = allActionIds.indexOf(targetKey);
  const newSnapshots: Record<string, any> = {};
  for (const id of allActionIds.slice(0, targetIdx + 1)) {
    if (actionSnapshots[id]) {
      newSnapshots[id] = actionSnapshots[id];
    }
  }

  // 4. Cascade cleanup: delete messages after snapshot point
  await db.delete(messages).where(
    and(
      eq(messages.sessionId, sessionId),
      gt(messages.id, snapshot.messageCount)
    )
  );

  // 5. Restore position and variableStore
  const restoredMetadata = {
    ...metadata,
    variableStore: snapshot.variableStore,
    actionSnapshots: newSnapshots,
    llmConfig: metadata.llmConfig, // preserve any override
  };
  delete restoredMetadata.actionState;
  delete restoredMetadata.lastActionRoundInfo;
  delete restoredMetadata.completedActionContext;

  // Clean rerunHistory entries for actions after target
  if (restoredMetadata.rerunHistory) {
    restoredMetadata.rerunHistory = (restoredMetadata.rerunHistory as any[])
      .filter((entry: any) => {
        const entryIdx = allActionIds.indexOf(entry.actionId);
        return entryIdx >= 0 && entryIdx <= targetIdx;
      });
  }

  await db
    .update(sessions)
    .set({
      position: {
        phaseIndex: snapshot.phaseIndex,
        topicIndex: snapshot.topicIndex,
        actionIndex: snapshot.actionIndex,
        actionId: snapshot.actionId,
        actionType: snapshot.actionType,
        currentRound: 0,
      },
      executionStatus: ExecutionStatus.RUNNING,
      metadata: restoredMetadata,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, sessionId));

  // 6. Re-execute (same flow as processUserInput but without user input)
  const { values: globalVariables } = await this.loadGlobalVariables(
    script.scriptName, session.userId
  );
  const conversationHistory = await this.loadConversationHistory(sessionId);
  let executionState = this.restoreExecutionState(
    { ...session, metadata: restoredMetadata, executionStatus: ExecutionStatus.RUNNING, position: { phaseIndex: snapshot.phaseIndex, topicIndex: snapshot.topicIndex, actionIndex: snapshot.actionIndex } } as any,
    globalVariables,
    conversationHistory
  );

  const prevHistoryLength = executionState.conversationHistory.length;
  executionState = await this.executeScript(script, sessionId, executionState, null);

  await this.saveNewAIMessages(sessionId, executionState, prevHistoryLength);
  await this.saveVariableSnapshots(sessionId, session.variables, executionState.variables);

  // Re-read session to get updated metadata
  const updatedSession = await this.loadSessionById(sessionId);
  await this.updateSessionState(sessionId, executionState, globalVariables);

  return this.buildSessionResponse(executionState, updatedSession, script, globalVariables, true);
}
```

Note: You'll need to import `and`, `gt` from drizzle-orm, and `yaml` from 'yaml'. The `messages` table and `ExecutionStatus` should already be imported.

- [ ] **Step 3: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/api-server/src/services/session-manager.ts
git commit -m "feat: add messageCount to snapshots and implement rerunAction() in SessionManager"
```

---

### Task 5: Add POST /api/sessions/:sessionId/rerun route

**Files:**

- Modify: `packages/api-server/src/routes/sessions.ts`

- [ ] **Step 1: Add the rerun route**

Add after the existing session routes (before the closing `}` of `registerSessionRoutes`):

```typescript
// Rerun action
app.post(
  '/api/sessions/:sessionId/rerun',
  {
    schema: {
      tags: ['sessions'],
      description: '回退到指定 action 起点并重新执行',
      params: {
        type: 'object',
        required: ['sessionId'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          targetActionId: { type: 'string' },
          config: {
            type: 'object',
            properties: {
              content: { type: 'string' },
              tone: { type: 'string' },
              max_rounds: { type: 'number' },
              output: { type: 'array' },
            },
          },
          llmConfig: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              model: { type: 'string' },
              temperature: { type: 'number' },
              maxTokens: { type: 'number' },
            },
          },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body =
        (request.body as {
          targetActionId?: string;
          config?: Record<string, any>;
          llmConfig?: Record<string, any>;
        }) || {};

      const sessionManager = new SessionManager();

      // Inject llmConfig and config override into session metadata before rerun
      if (body.llmConfig || body.config) {
        const session = await db.query.sessions.findFirst({
          where: (fields, { eq: eqFn }) => eqFn(fields.id, sessionId),
        });
        if (session) {
          const metadata = (session.metadata as Record<string, any>) || {};
          if (body.llmConfig) {
            metadata.llmConfig = body.llmConfig;
          }
          if (body.config) {
            metadata.rerunConfigOverride = body.config;
          }
          await db
            .update(sessions)
            .set({ metadata, updatedAt: new Date() })
            .where(eq(sessions.id, sessionId));
        }
      }

      const result = await sessionManager.rerunAction(sessionId, body.targetActionId);

      // Record version in rerunHistory
      const session = await db.query.sessions.findFirst({
        where: (fields, { eq: eqFn }) => eqFn(fields.id, sessionId),
      });
      if (session) {
        const metadata = (session.metadata as Record<string, any>) || {};
        const rerunHistory = (metadata.rerunHistory || []) as any[];
        const actionId =
          body.targetActionId ||
          (session.position as Record<string, any>)?.actionId ||
          metadata.currentActionId;

        const newVersion: any = {
          versionId: uuidv4(),
          actionId,
          timestamp: new Date().toISOString(),
          config: body.config || {},
          llmConfig: body.llmConfig || undefined,
          debugInfo: result.debugInfo,
          result: {
            roundsUsed: result.currentRound ?? 0,
            exitReason: 'completed',
            variableCount: result.variables ? Object.keys(result.variables).length : 0,
          },
        };

        // Per-action limit: max 20 versions, remove oldest (except v1) if exceeded
        const actionVersions = rerunHistory.filter((e: any) => e.actionId === actionId);
        if (actionVersions.length >= 20) {
          const oldestNonV1 = actionVersions.find(
            (e: any) => e.versionId !== actionVersions[0]?.versionId
          );
          if (oldestNonV1) {
            const idx = rerunHistory.indexOf(oldestNonV1);
            rerunHistory.splice(idx, 1);
          }
        }

        rerunHistory.push(newVersion);
        metadata.rerunHistory = rerunHistory;

        await db
          .update(sessions)
          .set({ metadata, updatedAt: new Date() })
          .where(eq(sessions.id, sessionId));
      }

      return reply.send(result);
    } catch (error: any) {
      if (error.message?.includes('No snapshot found')) {
        return reply.status(400).send({ error: error.message });
      }
      logError('rerun', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }
);
```

- [ ] **Step 2: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-server/src/routes/sessions.ts
git commit -m "feat: add POST /api/sessions/:sessionId/rerun endpoint"
```

---

### Task 6: Add POST /api/scripts/:scriptId/actions/:actionId/config route

**Files:**

- Modify: `packages/api-server/src/routes/scripts.ts`

- [ ] **Step 1: Add the write-back route**

Add to `registerScriptRoutes()` in `scripts.ts`:

```typescript
// Write back action config to YAML script
app.post(
  '/api/scripts/:scriptId/actions/:actionId/config',
  {
    schema: {
      tags: ['scripts'],
      description: '将调试后的 action config 回写到 YAML 脚本文件',
      params: {
        type: 'object',
        required: ['scriptId', 'actionId'],
        properties: {
          scriptId: { type: 'string', format: 'uuid' },
          actionId: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          config: { type: 'object' },
          llmConfig: { type: 'object' },
        },
      },
    },
  },
  async (request, reply) => {
    try {
      const { scriptId, actionId } = request.params as {
        scriptId: string;
        actionId: string;
      };
      const body = request.body as {
        config?: Record<string, any>;
        llmConfig?: Record<string, any>;
      };

      // Load script
      const script = await db.query.scripts.findFirst({
        where: (fields, { eq: eqFn }) => eqFn(fields.id, scriptId),
      });
      if (!script) {
        return reply.status(404).send({ error: 'Script not found' });
      }

      // Parse YAML
      const scriptContent = yaml.parse(script.scriptContent) || {};
      const phases = scriptContent.session?.phases || [];

      // Find and update the target action
      let found = false;
      for (const phase of phases) {
        for (const topic of phase.topics || []) {
          for (const action of topic.actions || []) {
            if (action.action_id === actionId) {
              if (body.config) {
                Object.assign(action, body.config);
              }
              if (body.llmConfig) {
                action.llm_config = body.llmConfig;
              }
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }

      if (!found) {
        return reply.status(400).send({
          error: '目标 action 已被删除，无法回写',
        });
      }

      // Serialize back to YAML and update DB
      const updatedYaml = yaml.stringify(scriptContent);
      await db
        .update(scripts)
        .set({ scriptContent: updatedYaml, updatedAt: new Date() })
        .where(eq(scripts.id, scriptId));

      return reply.send({ success: true });
    } catch (error: any) {
      logError('writeBackActionConfig', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  }
);
```

Note: `yaml` may already be imported at the top of `scripts.ts`. If not, add `import * as yaml from 'yaml';`. Check for `logError` import; if not available, use `console.error` or import from `'../utils/error-handler.js'`.

- [ ] **Step 2: TypeCheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/api-server/src/routes/scripts.ts
git commit -m "feat: add POST /api/scripts/:scriptId/actions/:actionId/config write-back endpoint"
```

---

### Task 7: Add rerunAction() and writeBackActionConfig() to frontend API

**Files:**

- Modify: `packages/script-editor/src/api/debug.ts`

- [ ] **Step 1: Add types for rerun request/response**

Add before the `debugApi` object:

```typescript
export interface RerunRequest {
  targetActionId?: string;
  config?: {
    content?: string;
    tone?: string;
    max_rounds?: number;
    output?: any[];
  };
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
}

export interface RerunResponse extends DebugMessageResponse {
  rerunInfo?: {
    rerunCount: number;
    versionId: string;
    previousRounds: number;
  };
}

export interface WriteBackConfigRequest {
  config?: Record<string, any>;
  llmConfig?: Record<string, any>;
}
```

- [ ] **Step 2: Add API methods**

Add methods to the `debugApi` object:

```typescript
/**
 * 重运行当前或指定 action
 */
async rerunAction(sessionId: string, data: RerunRequest) {
  const response = await axios.post<RerunResponse>(
    `${API_BASE_URL}/sessions/${sessionId}/rerun`,
    data,
    { timeout: 60000 }
  );
  return response.data;
},

/**
 * 回写 action config 到 YAML 脚本
 */
async writeBackActionConfig(
  scriptId: string,
  actionId: string,
  data: WriteBackConfigRequest
) {
  const response = await axios.post<{ success: boolean }>(
    `${API_BASE_URL}/scripts/${scriptId}/actions/${actionId}/config`,
    data,
    { timeout: 10000 }
  );
  return response.data;
},
```

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/script-editor/src/api/debug.ts
git commit -m "feat: add rerunAction and writeBackActionConfig to frontend debug API"
```

---

### Task 8: Create RerunModal component

**Files:**

- Create: `packages/script-editor/src/components/DebugChatPanel/RerunModal/index.tsx`
- Create: `packages/script-editor/src/components/DebugChatPanel/RerunModal/style.css`

- [ ] **Step 1: Create the RerunModal component**

```typescript
import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Input, InputNumber, Select, Button, List, Tag, Space, message } from 'antd';
import { debugApi } from '../../../api/debug';
import type { RerunRequest, DebugSessionDetail } from '../../../api/debug';
import './style.css';

const { TextArea } = Input;

interface VersionEntry {
  versionId: string;
  actionId: string;
  timestamp: string;
  config: {
    content?: string;
    tone?: string;
    max_rounds?: number;
    output?: any[];
  };
  llmConfig?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  result?: {
    roundsUsed: number;
    exitReason: string;
    variableCount: number;
  };
  writtenBack?: boolean;
}

interface RerunModalProps {
  visible: boolean;
  actionId: string;
  actionType: string;
  actionConfig: Record<string, any>;       // current action's original config
  sessionDetail: DebugSessionDetail | null;  // for scriptId and metadata
  versions: VersionEntry[];                // rerunHistory filtered by actionId
  mode: 'rerun' | 'rollback';             // rerun = current action, rollback = historical action
  targetInfo?: {                           // for rollback mode: what will be cleared
    phasePath: string;
    snapshotTime: string;
    messagesToClear: number;
    actionsToClear: string[];
  };
  onConfirm: (data: RerunRequest) => Promise<void>;
  onWriteBack: (versionId: string, config: Record<string, any>, llmConfig?: Record<string, any>) => Promise<void>;
  onCancel: () => void;
}

const LLM_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'volcano', label: 'Volcano (火山引擎)' },
];

const RerunModal: React.FC<RerunModalProps> = ({
  visible,
  actionId,
  actionType,
  actionConfig,
  sessionDetail,
  versions,
  mode,
  targetInfo,
  onConfirm,
  onWriteBack,
  onCancel,
}) => {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [writeBackLoading, setWriteBackLoading] = useState(false);

  // Editable fields
  const [prompt, setPrompt] = useState(actionConfig?.content || '');
  const [tone, setTone] = useState(actionConfig?.tone || '');
  const [maxRounds, setMaxRounds] = useState(actionConfig?.max_rounds || 20);
  const [provider, setProvider] = useState('deepseek');
  const [model, setModel] = useState('deepseek-v4-flash');
  const [temperature, setTemperature] = useState(0.7);

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setPrompt(actionConfig?.content || '');
      setTone(actionConfig?.tone || '');
      setMaxRounds(actionConfig?.max_rounds || 20);
      setSelectedVersionId(null);
    }
  }, [visible, actionConfig]);

  // When a version is selected, fill form from that version
  const handleSelectVersion = (version: VersionEntry) => {
    setSelectedVersionId(version.versionId);
    setPrompt(version.config?.content || actionConfig?.content || '');
    setTone(version.config?.tone || actionConfig?.tone || '');
    setMaxRounds(version.config?.max_rounds || actionConfig?.max_rounds || 20);
    if (version.llmConfig) {
      setProvider(version.llmConfig.provider || 'deepseek');
      setModel(version.llmConfig.model || 'deepseek-v4-flash');
      setTemperature(version.llmConfig.temperature ?? 0.7);
    }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true);
    try {
      const data: RerunRequest = {
        config: {
          content: prompt,
          tone: tone || undefined,
          max_rounds: maxRounds,
        },
        llmConfig: {
          provider,
          model,
          temperature,
        },
      };
      await onConfirm(data);
      setConfirmLoading(false);
    } catch (e: any) {
      setConfirmLoading(false);
      throw e;
    }
  };

  const handleWriteBack = async () => {
    if (!selectedVersionId) {
      message.warning('请先选择一个版本');
      return;
    }
    const version = versions.find(v => v.versionId === selectedVersionId);
    if (!version) return;

    setWriteBackLoading(true);
    try {
      await onWriteBack(selectedVersionId, version.config, version.llmConfig);
      setWriteBackLoading(false);
    } catch (e: any) {
      setWriteBackLoading(false);
      throw e;
    }
  };

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [versions]
  );

  return (
    <Modal
      title={mode === 'rerun' ? `重运行当前 Action` : `回退到 ${actionId}`}
      open={visible}
      onCancel={onCancel}
      width={700}
      footer={null}
      destroyOnClose
    >
      <div className="rerun-modal">
        {/* Rollback warning */}
        {mode === 'rollback' && targetInfo && (
          <div className="rerun-modal__warning">
            <div className="rerun-modal__warning-title">
              ⚠️ 回退点信息
            </div>
            <div>{targetInfo.phasePath}</div>
            <div>快照时间: {targetInfo.snapshotTime}</div>
            <div style={{ marginTop: 8 }}>
              将清除以下内容：
              <ul>
                <li>{targetInfo.messagesToClear} 条对话消息</li>
                {targetInfo.actionsToClear.map(a => (
                  <li key={a}>{a} 的变量和执行状态</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Version history (rerun mode only) */}
        {mode === 'rerun' && sortedVersions.length > 0 && (
          <div className="rerun-modal__section">
            <div className="rerun-modal__section-title">配置版本</div>
            <List
              size="small"
              dataSource={sortedVersions}
              renderItem={(version) => (
                <List.Item
                  className={`rerun-modal__version-item ${selectedVersionId === version.versionId ? 'rerun-modal__version-item--selected' : ''}`}
                  onClick={() => handleSelectVersion(version)}
                >
                  <div style={{ width: '100%' }}>
                    <Space>
                      <Tag color={selectedVersionId === version.versionId ? 'blue' : 'default'}>
                        {version.versionId === sortedVersions[sortedVersions.length - 1]?.versionId ? 'v1 (原始)' : `v${sortedVersions.indexOf(version) + 1}`}
                      </Tag>
                      <span>{new Date(version.timestamp).toLocaleString()}</span>
                      {version.result && (
                        <span>{version.result.roundsUsed}轮/{version.result.exitReason}</span>
                      )}
                      {version.writtenBack && <Tag color="green">已回写</Tag>}
                    </Space>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      prompt: "{version.config?.content?.substring(0, 50)}..."
                      {version.llmConfig && `  LLM: ${version.llmConfig.model} temp=${version.llmConfig.temperature}`}
                    </div>
                  </div>
                </List.Item>
              )}
              style={{ maxHeight: 200, overflow: 'auto' }}
            />
          </div>
        )}

        {/* Edit config */}
        <div className="rerun-modal__section">
          <div className="rerun-modal__section-title">编辑配置</div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Prompt:</div>
            <TextArea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="输入新的 prompt 内容..."
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Tone:</div>
            <Input
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              placeholder="如：平和，简洁，有趣"
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 4 }}>Max Rounds:</div>
            <InputNumber
              value={maxRounds}
              onChange={(v) => setMaxRounds(v || 20)}
              min={1}
              max={500}
            />
          </div>
        </div>

        {/* LLM settings */}
        <div className="rerun-modal__section">
          <div className="rerun-modal__section-title">LLM 设置</div>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <div style={{ marginBottom: 4 }}>Provider:</div>
              <Select
                value={provider}
                onChange={setProvider}
                options={LLM_PROVIDERS}
                style={{ width: 200 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Model:</div>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-v4-flash"
                style={{ width: 300 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Temperature:</div>
              <InputNumber
                value={temperature}
                onChange={(v) => setTemperature(v || 0.7)}
                min={0}
                max={2}
                step={0.1}
              />
            </div>
          </Space>
        </div>

        {/* Warning */}
        <div className="rerun-modal__warning">
          {mode === 'rerun'
            ? '⚠️ 将回退到 Action 起点，并清除本 Action 的消息'
            : '⚠️ 将回退到该 Action 起点，并清除之后的所有消息和变量'}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            {mode === 'rerun' && selectedVersionId && (
              <Button
                onClick={handleWriteBack}
                loading={writeBackLoading}
              >
                回写到脚本
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            <Button
              type="primary"
              onClick={handleConfirm}
              loading={confirmLoading}
            >
              {mode === 'rerun' ? '确认重运行' : '确认回退'}
            </Button>
          </Space>
        </div>
      </div>
    </Modal>
  );
};

export default RerunModal;
```

- [ ] **Step 2: Create the CSS file**

```css
.rerun-modal__section {
  margin-bottom: 16px;
}

.rerun-modal__section-title {
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #f0f0f0;
}

.rerun-modal__warning {
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  padding: 12px;
  margin-top: 12px;
  font-size: 13px;
}

.rerun-modal__warning-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.rerun-modal__version-item {
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 4px;
  transition: background 0.2s;
}

.rerun-modal__version-item:hover {
  background: #f5f5f5;
}

.rerun-modal__version-item--selected {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
}
```

- [ ] **Step 3: TypeCheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/script-editor/src/components/DebugChatPanel/RerunModal/
git commit -m "feat: add RerunModal component with version history, config editing, and LLM settings"
```

---

### Task 9: Integrate RerunModal into DebugChatPanel

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `DebugChatPanel/index.tsx`:

```typescript
import RerunModal from './RerunModal';
import { debugApi } from '../../api/debug';
import type { RerunRequest } from '../../api/debug';
```

- [ ] **Step 2: Add rerun-related state**

Add inside the `DebugChatPanel` component, near the other state declarations (~line 130):

```typescript
const [rerunModalVisible, setRerunModalVisible] = useState(false);
const [rerunMode, setRerunMode] = useState<'rerun' | 'rollback'>('rerun');
const [rerunTargetActionId, setRerunTargetActionId] = useState<string>('');
const [rerunTargetInfo, setRerunTargetInfo] = useState<any>(null);
```

- [ ] **Step 3: Derive versions and actionConfig from sessionDetail**

Add after sessionDetail is loaded (near where `sessionInfo` is set):

```typescript
const rerunHistory: any[] = useMemo(
  () => (sessionInfo?.metadata?.rerunHistory as any[]) || [],
  [sessionInfo]
);

const actionSnapshots: Record<string, any> = useMemo(
  () => (sessionInfo?.metadata?.actionSnapshots as Record<string, any>) || {},
  [sessionInfo]
);

const currentActionConfig = useMemo(() => {
  const actionId = currentPosition?.actionId;
  if (!actionId || !actionSnapshots[actionId]) return {};
  return actionSnapshots[actionId].originalConfig || {};
}, [currentPosition, actionSnapshots]);

const currentActionVersions = useMemo(() => {
  const actionId = currentPosition?.actionId;
  if (!actionId) return [];
  return rerunHistory.filter((e: any) => e.actionId === actionId);
}, [rerunHistory, currentPosition]);
```

- [ ] **Step 4: Add rerun and rollback handlers**

```typescript
const handleRerunCurrent = () => {
  setRerunMode('rerun');
  setRerunTargetActionId(currentPosition?.actionId || '');
  setRerunTargetInfo(null);
  setRerunModalVisible(true);
};

const handleRollbackToAction = (actionId: string) => {
  const snapshot = actionSnapshots[actionId];
  if (!snapshot) {
    message.warning('该 action 没有快照，无法回退');
    return;
  }

  // Calculate what will be cleared
  const allActionIds = Object.keys(actionSnapshots);
  const snapshotIdx = allActionIds.indexOf(actionId);
  const actionsToClear = allActionIds.slice(snapshotIdx);

  setRerunMode('rollback');
  setRerunTargetActionId(actionId);
  setRerunTargetInfo({
    phasePath: `Phase ${snapshot.phaseIndex + 1} → Topic ${snapshot.topicIndex + 1} → ${actionId}`,
    snapshotTime: new Date(snapshot.timestamp).toLocaleString(),
    messagesToClear: '?', // We don't have this easily on the frontend
    actionsToClear: actionsToClear.filter((a) => a !== actionId),
  });
  setRerunModalVisible(true);
};

const handleRerunConfirm = async (data: RerunRequest) => {
  if (!activeSessionId) return;

  data.targetActionId = rerunMode === 'rollback' ? rerunTargetActionId : undefined;

  // Call API
  const result = await debugApi.rerunAction(activeSessionId, data);

  // Add separator bubble
  addDebugBubble({
    id: uuidv4(),
    type: 'system',
    timestamp: new Date().toISOString(),
    actionId: rerunTargetActionId || currentPosition?.actionId,
    actionType: currentPosition?.actionType,
    content: {
      type: 'system_message',
      content: `🔄 ${rerunMode === 'rerun' ? '重运行当前 action' : `回退到 ${rerunTargetActionId} 并重新执行`}`,
    },
  });

  // Replace messages with new execution result
  if (result.aiMessage) {
    const newAssistantMsg: DebugMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: result.aiMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newAssistantMsg]);
  }

  // Update position and session info
  if (result.position) {
    setCurrentPosition({
      phaseIndex: result.position.phaseIndex,
      topicIndex: result.position.topicIndex,
      actionIndex: result.position.actionIndex,
      phaseId: result.position.phaseId,
      topicId: result.position.topicId,
      actionId: result.position.actionId,
      actionType: result.position.actionType,
      currentRound: result.currentRound ?? 0,
      maxRounds: result.maxRounds,
    });
  }

  // Refresh session detail to get updated metadata (new rerunHistory entry)
  if (activeSessionId) {
    try {
      const updatedSession = await debugApi.getDebugSession(activeSessionId);
      setSessionInfo(updatedSession);
    } catch (e) {
      // ignore refresh errors
    }
  }

  setRerunModalVisible(false);
};

const handleWriteBack = async (
  versionId: string,
  config: Record<string, any>,
  llmConfig?: Record<string, any>
) => {
  if (!sessionInfo?.scriptId || !rerunTargetActionId) return;

  await debugApi.writeBackActionConfig(sessionInfo.scriptId, rerunTargetActionId, {
    config,
    llmConfig,
  });

  message.success(`已将配置写入脚本文件的 action: ${rerunTargetActionId}`);
};
```

- [ ] **Step 5: Add "重运行" button to PositionBubble**

In the PositionBubble rendering section (~line 1733), add a button next to the current position display. The easiest approach: find where PositionBubble is rendered for the current action and add a rerun button alongside it. Or add it in the `PositionBubbleContent` interface and component.

Since `PositionBubble` is a separate component, the simplest approach is to add a button in the DebugChatPanel footer or header. Look for an appropriate spot — the `PositionBubble` component in `packages/script-editor/src/components/DebugBubbles/PositionBubble/index.tsx`.

For now, add a button in the DebugChatPanel's message area header. Find the "当前" position display and add the rerun button:

Add a small button near the chat input area or in the position display area. The exact placement depends on the current layout. Minimum implementation: add it to the existing header section where session info is displayed. Search for a suitable mount point in the JSX.

Actually, the simplest and most visible place: add it next to the position bubble that displays the current action. Find the rendering of PositionBubble with `content={item.data.content as PositionBubbleContent}` (~line 1733) and add a conditional rerun button when the bubble is for the current action and execution is WAITING_INPUT:

Look for the debug bubble rendering loop and add after the PositionBubble:

```tsx
{
  /* Show rerun button for current action position bubbles */
}
{
  item.type === 'position' &&
    item.data.content.currentRound !== undefined &&
    sessionInfo?.executionStatus === 'waiting_input' && (
      <Button size="small" onClick={handleRerunCurrent} style={{ marginLeft: 8 }}>
        重运行
      </Button>
    );
}
```

- [ ] **Step 6: Add "回退到此" buttons to NavigationTree items**

The `NavigationTree` component already accepts `currentPosition`. We need to pass a callback. Check the NavigationTree props interface:

```bash
grep -n "interface.*Props\|onAction" packages/script-editor/src/components/NavigationTree/NavigationTree.tsx | head -10
```

Add an `onRollback` prop to NavigationTree. In the NavigationTree rendering in DebugChatPanel (~line 1480):

```tsx
<NavigationTree
  tree={navigationTree}
  currentPosition={currentPosition}
  onRollback={handleRollbackToAction}
  actionSnapshots={actionSnapshots}
/>
```

Update NavigationTree to show "回退到此" buttons on completed action nodes that have snapshots. This involves modifying the NavigationTree component. The exact implementation depends on the component's internal structure.

- [ ] **Step 7: Add RerunModal to JSX**

Add near the end of the component's return (before the closing tag):

```tsx
<RerunModal
  visible={rerunModalVisible}
  actionId={rerunTargetActionId}
  actionType={currentPosition?.actionType || ''}
  actionConfig={currentActionConfig}
  sessionDetail={sessionInfo}
  versions={currentActionVersions}
  mode={rerunMode}
  targetInfo={rerunTargetInfo}
  onConfirm={handleRerunConfirm}
  onWriteBack={handleWriteBack}
  onCancel={() => setRerunModalVisible(false)}
/>
```

- [ ] **Step 8: TypeCheck**

```bash
pnpm --filter @heartrule/script-editor typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/script-editor/src/components/DebugChatPanel/index.tsx
git commit -m "feat: integrate RerunModal into DebugChatPanel with rerun button and rollback support"
```

---

### Task 10: Update NavigationTree to support rollback buttons

**Files:**

- Modify: `packages/script-editor/src/components/NavigationTree/NavigationTree.tsx`

- [ ] **Step 1: Check current NavigationTree interface**

Read the NavigationTree component to understand its props and rendering:

```bash
grep -n "interface\|props\|export" packages/script-editor/src/components/NavigationTree/NavigationTree.tsx | head -20
```

- [ ] **Step 2: Add onRollback and actionSnapshots props**

Extend the NavigationTree props interface:

```typescript
interface NavigationTreeProps {
  tree: NavigationTreeType | null;
  currentPosition?: CurrentPosition;
  onRollback?: (actionId: string) => void;
  actionSnapshots?: Record<string, any>;
}
```

- [ ] **Step 3: Render "回退到此" button on completed action nodes**

In the tree node rendering, for each action node that:

- Is completed (not the current action)
- Has a snapshot in `actionSnapshots`

Add a small `[回退到此]` button that calls `onRollback(actionId)`.

- [ ] **Step 4: TypeCheck and commit**

```bash
pnpm --filter @heartrule/script-editor typecheck
git add packages/script-editor/src/components/NavigationTree/NavigationTree.tsx
git commit -m "feat: add rollback buttons to NavigationTree action nodes"
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev:all
```

- [ ] **Step 2: Manual test — rerun current action**
  1. Create a debug session with an ai_ask action
  2. Wait for the action to complete (enter WAITING_INPUT)
  3. Click "重运行" button
  4. Verify the RerunModal opens with the action's config pre-filled
  5. Modify the prompt content
  6. Click "确认重运行"
  7. Verify: position resets to round 0, new AI response appears, old messages preserved above separator

- [ ] **Step 3: Manual test — version history**
  1. Rerun the same action 3-4 times with different prompts
  2. Open the RerunModal again
  3. Verify all versions appear in the list (latest first)
  4. Click a previous version — verify its config fills the edit form
  5. Select a version and click "回写到脚本"
  6. Verify the API call succeeds and the version is marked as written back

- [ ] **Step 4: Manual test — rollback to historical action**
  1. Navigate a session through action_1 → action_2 → action_3
  2. In the navigation tree, click "回退到此" on action_1
  3. Verify the rollback modal shows what will be cleared
  4. Confirm rollback
  5. Verify: action_2 and action_3 messages are gone, execution resumes from action_1

- [ ] **Step 5: Manual test — LLM switching**
  1. Rerun with a different provider/model
  2. Verify the debugInfo shows the selected model
  3. Verify the response is different from the default provider

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
pnpm typecheck
```

---

## Notes

- The `llmConfig` field on `LLMConfig` interface uses `model` (string), `temperature` (optional number), `maxTokens` (optional number). The `BaseLLMProvider.generateText()` already merges `Partial<LLMConfig>` with instance defaults — no change needed there.
- The `generateText(prompt, config?, providerName?)` third parameter switches the provider instance from the orchestrator's registry. The provider must already be registered (DeepSeek, OpenAI, Volcano are registered at startup).
- Snapshots use `JSON.parse(JSON.stringify())` for deep cloning `variableStore` — this works because VariableStore contains only serializable data (no functions/classes).
- The `rerunHistory` per-action limit of 20 versions is enforced in the route handler, not in SessionManager, since it only applies when versions are actively created by the user.
- For Task 9 (DebugChatPanel integration), the exact placement of the "重运行" button may need adjustment based on the current UI layout. The plan shows the approach; the exact JSX position should be verified against the current component structure.
