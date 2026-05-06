# Debug Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist debug session history so users can resume or review past debugging sessions within a project.

**Architecture:** Add backend list/delete API routes for sessions, create a DebugHistoryList component for browsing past sessions, convert the Debug button to a smart dropdown (continue / new / history), and adapt DebugChatPanel to support opening from history with position validation against the latest script.

**Tech Stack:** TypeScript, Fastify (backend), React 18 + Ant Design (frontend), Drizzle ORM + PostgreSQL, localStorage for last-session reference

---

### Task 1: Backend — List sessions by project

**Files:**

- Modify: `packages/api-server/src/routes/sessions.ts` — add GET `/api/sessions` route

- [ ] **Step 1: Add list sessions route**

Add this route BEFORE the `// 获取会话详情` block (before line 171), after the POST create route and before GET `/:id`:

```typescript
// 列出项目的调试会话
app.get(
  '/api/sessions',
  {
    schema: {
      tags: ['sessions'],
      description: '列出项目的调试会话（最近50个）',
      querystring: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          limit: { type: 'number', default: 50 },
        },
      },
    },
  },
  async (request, reply) => {
    const { projectId, limit = 50 } = request.query as {
      projectId: string;
      limit: number;
    };

    try {
      // Query sessions where metadata->>'projectId' matches
      // NOTE: add `sql` to the top-level drizzle-orm import: import { eq, sql } from 'drizzle-orm';
      const projectSessions = await db
        .select({
          id: sessions.id,
          scriptId: sessions.scriptId,
          status: sessions.status,
          executionStatus: sessions.executionStatus,
          position: sessions.position,
          variables: sessions.variables,
          metadata: sessions.metadata,
          createdAt: sessions.createdAt,
          updatedAt: sessions.updatedAt,
        })
        .from(sessions)
        .where(sql`${sessions.metadata}->>'projectId' = ${projectId}`)
        .orderBy(sql`${sessions.updatedAt} DESC`)
        .limit(Math.min(limit, 50));

      // Enrich with script file name and message count
      const enriched = await Promise.all(
        projectSessions.map(async (s) => {
          const script = await db.query.scripts.findFirst({
            where: eq(scripts.id, s.scriptId),
          });
          const msgCount = await db.$count(messages, eq(messages.sessionId, s.id));

          return {
            sessionId: s.id,
            scriptId: s.scriptId,
            scriptFileName: script?.scriptName || 'unknown.yaml',
            executionStatus: s.executionStatus,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
            position: s.position,
            messageCount: msgCount,
          };
        })
      );

      return { success: true, data: enriched };
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list sessions',
      });
    }
  }
);
```

- [ ] **Step 2: Run type check on backend**

```bash
cd packages/api-server && pnpm typecheck
```

Expected: No type errors (ensure `sql` is imported at top of file).

- [ ] **Step 3: Commit**

```bash
git add packages/api-server/src/routes/sessions.ts
git commit -m "feat: add GET /api/sessions list by project route"
```

---

### Task 2: Backend — Delete session route + auto cleanup

**Files:**

- Modify: `packages/api-server/src/routes/sessions.ts` — add DELETE route + auto-cleanup in POST

- [ ] **Step 1: Add DELETE route**

Add after the list route, before `// 获取会话详情`:

```typescript
// 删除调试会话
app.delete(
  '/api/sessions/:id',
  {
    schema: {
      tags: ['sessions'],
      description: '删除调试会话及其消息',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, id),
      });

      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }

      // Delete messages first (cascade should handle this, but be explicit)
      await db.delete(messages).where(eq(messages.sessionId, id));
      await db.delete(sessions).where(eq(sessions.id, id));

      return { success: true };
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to delete session' });
    }
  }
);
```

- [ ] **Step 2: Add auto-cleanup in POST /api/sessions**

In the POST `/api/sessions` handler, after `await db.insert(sessions).values(...)` (around line 117), add:

```typescript
// Auto-cleanup: keep max 50 sessions per project
if (projectId) {
  // Uses `sql` imported at top of file
  const projectSessionCount = await db.$count(
    sessions,
    sql`${sessions.metadata}->>'projectId' = ${projectId}`
  );
  if (projectSessionCount > 50) {
    // Delete oldest sessions beyond 50
    const excessCount = projectSessionCount - 50;
    const oldestToDelete = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(sql`${sessions.metadata}->>'projectId' = ${projectId}`)
      .orderBy(sql`${sessions.updatedAt} ASC`)
      .limit(excessCount);

    for (const old of oldestToDelete) {
      await db.delete(messages).where(eq(messages.sessionId, old.id));
      await db.delete(sessions).where(eq(sessions.id, old.id));
    }
    app.log.info({ deletedCount: oldestToDelete.length }, 'Auto-cleaned old sessions');
  }
}
```

Note: if `import('drizzle-orm')` is problematic, use top-level `sql` import. Consolidate: import `sql` once at the top of the file.

- [ ] **Step 3: Run type check**

```bash
cd packages/api-server && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/api-server/src/routes/sessions.ts
git commit -m "feat: add DELETE session route and auto-cleanup (>50 limit)"
```

---

### Task 3: Frontend API — Add list and delete methods

**Files:**

- Modify: `packages/script-editor/src/api/debug.ts`

- [ ] **Step 1: Add API methods**

Add to the `debugApi` object before the closing `};`:

```typescript
  /**
   * 列出项目的调试会话历史
   */
  async listDebugSessions(projectId: string, limit = 50) {
    const response = await axios.get<{
      success: boolean;
      data: Array<{
        sessionId: string;
        scriptId: string;
        scriptFileName: string;
        executionStatus: string;
        createdAt: string;
        updatedAt: string;
        position: ExecutionPosition;
        messageCount: number;
      }>;
    }>(`${API_BASE_URL}/sessions`, {
      params: { projectId, limit },
      timeout: 10000,
    });
    return response.data;
  },

  /**
   * 删除调试会话
   */
  async deleteDebugSession(sessionId: string) {
    const response = await axios.delete<{ success: boolean }>(
      `${API_BASE_URL}/sessions/${sessionId}`,
      { timeout: 10000 }
    );
    return response.data;
  },
```

- [ ] **Step 2: Type check frontend**

```bash
cd packages/script-editor && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/script-editor/src/api/debug.ts
git commit -m "feat: add listDebugSessions and deleteDebugSession API methods"
```

---

### Task 4: DebugHistoryList component (new)

**Files:**

- Create: `packages/script-editor/src/components/DebugHistoryList/index.tsx`
- Create: `packages/script-editor/src/components/DebugHistoryList/style.css`

- [ ] **Step 1: Create the component**

```typescript
import { DeleteOutlined, DownOutlined, RightOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Empty, List, Modal, Popconfirm, Tag, Typography } from 'antd';
import React, { useEffect, useState } from 'react';

import { debugApi } from '../../api/debug';
import type { ExecutionPosition } from '../../api/debug';
import './style.css';

const { Text } = Typography;

interface SessionListItem {
  sessionId: string;
  scriptId: string;
  scriptFileName: string;
  executionStatus: string;
  createdAt: string;
  updatedAt: string;
  position: ExecutionPosition;
  messageCount: number;
}

interface DebugHistoryListProps {
  visible: boolean;
  projectId: string;
  onEnter: (sessionId: string, executionStatus: string) => void;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  running: { label: '进行中', color: 'green' },
  waiting_input: { label: '等待输入', color: 'blue' },
  completed: { label: '已完成', color: 'default' },
  error: { label: '错误', color: 'red' },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPosition(pos: ExecutionPosition): string {
  const phase = pos.phaseId || `Phase ${(pos.phaseIndex || 0) + 1}`;
  const topic = pos.topicId || `Topic ${(pos.topicIndex || 0) + 1}`;
  return `${phase} → ${topic} → ${pos.actionId || '...'}`;
}

const DebugHistoryList: React.FC<DebugHistoryListProps> = ({
  visible,
  projectId,
  onEnter,
  onClose,
}) => {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSessions = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await debugApi.listDebugSessions(projectId);
      if (result.success) {
        setSessions(result.data);
      }
    } catch (err) {
      console.error('[DebugHistory] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      loadSessions();
      setExpandedId(null);
    }
  }, [visible, projectId]);

  const handleDelete = async (sessionId: string) => {
    try {
      await debugApi.deleteDebugSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      // Clear localStorage if deleting last session
      const lastKey = `debug_last:${projectId}`;
      if (localStorage.getItem(lastKey) === sessionId) {
        localStorage.removeItem(lastKey);
      }
    } catch (err) {
      console.error('[DebugHistory] Failed to delete session:', err);
    }
  };

  const isSessionActive = (status: string) =>
    status === 'running' || status === 'waiting_input';

  return (
    <Modal
      title="调试历史"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
    >
      {sessions.length === 0 && !loading ? (
        <Empty description="暂无调试历史" />
      ) : (
        <List
          loading={loading}
          dataSource={sessions}
          renderItem={(item) => {
            const statusConfig = STATUS_CONFIG[item.executionStatus] || {
              label: item.executionStatus,
              color: 'default',
            };
            const isExpanded = expandedId === item.sessionId;

            return (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    key="expand"
                    onClick={() => setExpandedId(isExpanded ? null : item.sessionId)}
                  >
                    {isExpanded ? '收起' : '详情'}
                  </Button>,
                  <Button
                    type="link"
                    key="enter"
                    onClick={() => onEnter(item.sessionId, item.executionStatus)}
                  >
                    进入
                  </Button>,
                  <Popconfirm
                    key="delete"
                    title="确定删除此调试会话？"
                    onConfirm={() => handleDelete(item.sessionId)}
                    okText="删除"
                    cancelText="取消"
                  >
                    <Button type="link" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      <Text strong>{item.scriptFileName}</Text>
                      <Tag color={statusConfig.color} style={{ marginLeft: 8 }}>
                        {statusConfig.label}
                      </Tag>
                    </span>
                  }
                  description={
                    <div>
                      <div>
                        {item.position ? formatPosition(item.position) : '未开始'}
                      </div>
                      <div>
                        {item.messageCount} 条消息 · 创建于 {formatTime(item.createdAt)}
                      </div>
                      {isExpanded && (
                        <div className="debug-history-detail">
                          {/* Position is already shown in the main description */}
                          {isSessionActive(item.executionStatus) && (
                            <div>
                              会话进行中，可继续调试
                            </div>
                          )}
                          {!isSessionActive(item.executionStatus) && (
                            <div>
                              会话已结束，以只读模式查看
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </Modal>
  );
};

export default DebugHistoryList;
```

- [ ] **Step 2: Create style.css**

```css
.debug-history-detail {
  margin-top: 8px;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 4px;
  font-size: 13px;
}
```

- [ ] **Step 3: Type check frontend**

```bash
cd packages/script-editor && pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/script-editor/src/components/DebugHistoryList/
git commit -m "feat: add DebugHistoryList component"
```

---

### Task 5: Smart Debug button — ProjectEditorHeader

**Files:**

- Modify: `packages/script-editor/src/pages/ProjectEditor/ProjectEditorHeader.tsx`

Replace the current flat Debug button with a split-button dropdown.

- [ ] **Step 1: Update ProjectEditorHeader props and JSX**

Change the import at top — add `Dropdown` and `MenuProps`:

```typescript
import {
  ArrowLeftOutlined,
  SaveOutlined,
  RocketOutlined,
  HistoryOutlined,
  BugOutlined,
  CaretDownOutlined,
} from '@ant-design/icons';
import { Layout, Typography, Button, Space, Tag, Divider, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
```

Update the interface — add `hasLastSession` and `lastSessionStatus`:

```typescript
interface ProjectEditorHeaderProps {
  project: Project | null;
  hasUnsavedChanges: boolean;
  saving: boolean;
  versionPanelVisible: boolean;
  files: ScriptFile[];
  hasLastSession: boolean;
  lastSessionUnfinished: boolean;
  onBack: () => void;
  onSave: () => void;
  onPublish: () => void;
  onDebug: () => void;
  onContinueDebug: () => void;
  onDebugHistory: () => void;
  onVersionToggle: () => void;
}
```

Destructure new props and build the dropdown. Replace this code (lines 89-96):

```tsx
<Button
  icon={<BugOutlined />}
  onClick={onDebug}
  disabled={!project || files.filter((f) => f.fileType === 'session').length === 0}
>
  Debug
</Button>
```

With:

```tsx
{
  (() => {
    const sessionFileCount = files.filter((f) => f.fileType === 'session').length;
    const disabled = !project || sessionFileCount === 0;
    const mainLabel = lastSessionUnfinished ? '继续调试' : 'Debug';
    const mainAction = lastSessionUnfinished ? onContinueDebug : onDebug;

    const menuItems: MenuProps['items'] = [
      {
        key: 'new',
        label: '新建调试',
        icon: <BugOutlined />,
        onClick: onDebug,
      },
      {
        key: 'history',
        label: '调试历史',
        icon: <HistoryOutlined />,
        onClick: onDebugHistory,
      },
    ];

    return (
      <Space.Compact>
        <Button
          type={lastSessionUnfinished ? 'primary' : 'default'}
          icon={<BugOutlined />}
          onClick={mainAction}
          disabled={disabled}
        >
          {mainLabel}
        </Button>
        <Dropdown menu={{ items: menuItems }} trigger={['click']}>
          <Button
            type={lastSessionUnfinished ? 'primary' : 'default'}
            icon={<CaretDownOutlined />}
            disabled={disabled}
          />
        </Dropdown>
      </Space.Compact>
    );
  })();
}
```

- [ ] **Step 2: Type check**

```bash
cd packages/script-editor && pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/script-editor/src/pages/ProjectEditor/ProjectEditorHeader.tsx
git commit -m "feat: convert Debug button to smart split-button with dropdown"
```

---

### Task 6: Wire up — ProjectEditor (debug state + localStorage)

**Files:**

- Modify: `packages/script-editor/src/pages/ProjectEditor/index.tsx`

- [ ] **Step 1: Add new state variables**

Add after existing debug state (around line 176):

```typescript
const [debugHistoryVisible, setDebugHistoryVisible] = useState(false);
const [lastSessionId, setLastSessionId] = useState<string | null>(null);
const [lastSessionUnfinished, setLastSessionUnfinished] = useState(false);
```

- [ ] **Step 2: Add localStorage helper and load-on-mount logic**

Add this effect after `loadProjectData` effect (after line 1228):

```typescript
// On project load, check for last debug session
useEffect(() => {
  if (!projectId) return;
  const lastKey = `debug_last:${projectId}`;
  const storedSessionId = localStorage.getItem(lastKey);
  if (storedSessionId) {
    // Verify the session still exists and is unfinished
    debugApi
      .getDebugSession(storedSessionId)
      .then((session) => {
        const isUnfinished =
          session.executionStatus === 'running' || session.executionStatus === 'waiting_input';
        setLastSessionId(storedSessionId);
        setLastSessionUnfinished(isUnfinished);
      })
      .catch(() => {
        // Session no longer exists, clean up
        localStorage.removeItem(lastKey);
        setLastSessionId(null);
        setLastSessionUnfinished(false);
      });
  }
}, [projectId]);
```

- [ ] **Step 3: Add continueDebug handler**

Add before `handleSave` (around line 675):

```typescript
const handleContinueDebug = useCallback(async () => {
  if (!lastSessionId || !projectId) return;

  try {
    const sessionDetail = await debugApi.getDebugSession(lastSessionId);

    // Get current file content for the session's script
    const scriptName = sessionDetail.metadata?.script?.session?.session_id || '';
    const targetFile = files.find(
      (f) => f.fileType === 'session' && f.fileName?.includes(scriptName)
    );

    if (!targetFile || !targetFile.yamlContent) {
      message.error('找不到对应的脚本文件');
      return;
    }

    // Import latest script
    const importResult = await debugApi.importScript(
      targetFile.yamlContent,
      targetFile.fileName,
      projectId
    );

    if (!importResult.success || !importResult.data?.scriptId) {
      message.error('导入脚本失败');
      return;
    }

    // Validate position compatibility
    const newScript = await debugApi.getDebugSession(lastSessionId);
    // We need to parse the latest script and check position bounds
    // This is done inside the DebugChatPanel load flow

    // Open debug panel with the history session
    setDebugSessionId(lastSessionId);
    setDebugInitialMessage('');
    setDebugInitialDebugInfo(null);
    setDebugTarget(null);
    setDebugPanelVisible(true);
  } catch (err: any) {
    console.error('[ContinueDebug] Failed:', err);
    message.error('恢复调试会话失败: ' + (err.message || 'Unknown error'));
  }
}, [lastSessionId, projectId, files]);
```

- [ ] **Step 4: Add history enter handler**

```typescript
const handleEnterHistorySession = useCallback(
  (sessionId: string, _executionStatus: string) => {
    setDebugHistoryVisible(false);
    setDebugSessionId(sessionId);
    setDebugInitialMessage('');
    setDebugInitialDebugInfo(null);
    setDebugTarget(null);
    setDebugPanelVisible(true);
    // Update localStorage
    if (projectId) {
      localStorage.setItem(`debug_last:${projectId}`, sessionId);
    }
  },
  [projectId]
);
```

- [ ] **Step 5: Update onClose of DebugChatPanel**

Update the `onClose` callback (around line 1436) to handle localStorage:

```typescript
        onClose={() => {
          // Save last session if unfinished
          if (debugSessionId && projectId) {
            const sessionInfo = /* need to get current execution status */;
            // We'll handle this via onSessionStatusChange prop instead
          }
          setDebugPanelVisible(false);
          setDebugSessionId(null);
          setDebugInitialMessage('');
          setDebugInitialDebugInfo(null);
          setDebugTarget(null);
        }}
```

Actually, use a simpler approach. Add a dedicated close handler:

```typescript
const handleDebugPanelClose = useCallback(() => {
  // Don't clear lastSessionId here — localStorage is managed
  // by DebugChatPanel via onSessionStatusChange prop
  setDebugPanelVisible(false);
  // Don't null out sessionId — let the next open decide
}, []);
```

- [ ] **Step 6: Pass new props to ProjectEditorHeader**

Update the header props (around line 1292):

```tsx
<ProjectEditorHeader
  project={project}
  hasUnsavedChanges={hasUnsavedChanges}
  saving={saving}
  versionPanelVisible={versionPanelVisible}
  files={files}
  hasLastSession={!!lastSessionId}
  lastSessionUnfinished={lastSessionUnfinished}
  onBack={() => navigate('/projects')}
  onSave={handleSave}
  onPublish={() => setPublishModalVisible(true)}
  onDebug={() => setDebugConfigVisible(true)}
  onContinueDebug={handleContinueDebug}
  onDebugHistory={() => setDebugHistoryVisible(true)}
  onVersionToggle={() => setVersionPanelVisible(!versionPanelVisible)}
/>
```

- [ ] **Step 7: Add DebugHistoryList component to JSX**

Add after `DebugConfigModal` (around line 1426):

```tsx
{
  /* 调试历史列表 */
}
{
  projectId && (
    <DebugHistoryList
      visible={debugHistoryVisible}
      projectId={projectId}
      onEnter={handleEnterHistorySession}
      onClose={() => setDebugHistoryVisible(false)}
    />
  );
}
```

Also add the import at the top:

```typescript
import DebugHistoryList from '../../components/DebugHistoryList';
```

- [ ] **Step 8: Add onSessionStatusChange to DebugChatPanel**

Update the DebugChatPanel usage (around line 1429) to pass the new prop:

```tsx
<DebugChatPanel
  visible={debugPanelVisible}
  sessionId={debugSessionId}
  initialMessage={debugInitialMessage}
  initialDebugInfo={debugInitialDebugInfo}
  debugTarget={debugTarget}
  onClose={handleDebugPanelClose}
  onSessionRestart={(newSessionId) => {
    setDebugSessionId(newSessionId);
    if (projectId) {
      localStorage.setItem(`debug_last:${projectId}`, newSessionId);
    }
  }}
  onSessionStatusChange={(sessionId, status) => {
    if (projectId) {
      const isUnfinished = status === 'running' || status === 'waiting_input';
      if (isUnfinished) {
        localStorage.setItem(`debug_last:${projectId}`, sessionId);
      } else {
        localStorage.removeItem(`debug_last:${projectId}`);
        setLastSessionUnfinished(false);
      }
    }
  }}
/>
```

- [ ] **Step 9: Type check**

```bash
cd packages/script-editor && pnpm typecheck
```

- [ ] **Step 10: Commit**

```bash
git add packages/script-editor/src/pages/ProjectEditor/index.tsx
git commit -m "feat: wire up debug history, smart button, and localStorage in ProjectEditor"
```

---

### Task 7: DebugChatPanel — fromHistory mode + position validation

**Files:**

- Modify: `packages/script-editor/src/components/DebugChatPanel/index.tsx`

- [ ] **Step 1: Add new props and position validation**

The current `DebugChatPanelProps` interface (line 40-48) needs `fromHistory` and `onSessionStatusChange`. Update:

```typescript
interface DebugChatPanelProps {
  visible: boolean;
  sessionId: string | null;
  initialMessage?: string;
  initialDebugInfo?: any;
  debugTarget?: { type: 'draft' | 'version'; versionId?: string; versionNumber?: string } | null;
  onClose: () => void;
  onSessionRestart?: (newSessionId: string) => void;
  onSessionStatusChange?: (sessionId: string, status: string) => void;
}
```

Update the destructure (line 108-116):

```typescript
const DebugChatPanel: React.FC<DebugChatPanelProps> = ({
  visible,
  sessionId,
  initialMessage,
  initialDebugInfo,
  debugTarget,
  onClose,
  onSessionRestart,
  onSessionStatusChange, // new
}) => {
```

- [ ] **Step 2: Add position validation in loadSessionData**

Inside `loadSessionData`, after building the navigation tree and before creating position bubbles (around line 350), add a validation check. However, since `loadSessionData` already uses `sessionDetail.position` and gracefully handles missing data, the existing code is mostly fine. The key addition: if the script structure has changed so much that phases/topics/actions arrays are shorter than the saved indices, the position bubble will have incomplete data.

Add a validation function before `loadSessionData` (around line 115):

```typescript
// Validate position compatibility against loaded navigation tree
const validatePosition = (
  tree: NavigationTreeType | null,
  position: any
): { compatible: boolean; message?: string } => {
  if (!tree || !position) return { compatible: true }; // no position to validate
  const phases = tree.phases || [];
  if (position.phaseIndex >= phases.length) {
    return {
      compatible: false,
      message: `Phase ${position.phaseIndex + 1} 不存在（当前脚本只有 ${phases.length} 个 phase）`,
    };
  }
  const topics = phases[position.phaseIndex]?.topics || [];
  if (position.topicIndex >= topics.length) {
    return {
      compatible: false,
      message: `Topic ${position.topicIndex + 1} 不存在`,
    };
  }
  const actions = topics[position.topicIndex]?.actions || [];
  if (position.actionIndex >= actions.length) {
    return {
      compatible: false,
      message: `Action ${position.actionIndex + 1} 不存在`,
    };
  }
  return { compatible: true };
};
```

Then after `buildNavigationTree` call (around line 330), check compatibility:

```typescript
// Validate position compatibility
if (sessionDetail.position) {
  const validation = validatePosition(tree, sessionDetail.position);
  if (!validation.compatible) {
    setError(`脚本结构已变更，原调试位置无法定位：${validation.message}。建议新建调试。`);
    // Still show what we can, but mark as incompatible
  }
}
```

- [ ] **Step 3: Call onSessionStatusChange when execution status changes**

In `handleSendMessage`, after receiving the response and checking `response.executionStatus` (around line 622), add:

```typescript
if (response.executionStatus && sessionInfo) {
  setSessionInfo({ ...sessionInfo, executionStatus: response.executionStatus });
  onSessionStatusChange?.(currentSessionId, response.executionStatus);
}
```

Similarly, add in the error path and in `handleAcknowledgment`.

- [ ] **Step 4: Commit**

```bash
git add packages/script-editor/src/components/DebugChatPanel/index.tsx
git commit -m "feat: add position validation and session status callback to DebugChatPanel"
```

---

### Task 8: Update CreateDebugSessionRequest with projectId

**Files:**

- Modify: `packages/script-editor/src/api/debug.ts` — add `projectId` to request type
- Modify: `packages/script-editor/src/components/DebugConfigModal/index.tsx` — pass `projectId`

- [ ] **Step 1: Update API types**

In `debug.ts`, update `CreateDebugSessionRequest`:

```typescript
export interface CreateDebugSessionRequest {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
  projectId?: string;
}
```

- [ ] **Step 2: Pass projectId in DebugConfigModal**

In `DebugConfigModal/index.tsx`, update the `sessionData` object (around line 213) to include `projectId`:

```typescript
const sessionData = {
  userId: values.userId || 'debug_user',
  scriptId: scriptId,
  initialVariables: {},
  projectId: currentProject?.id,
};
```

- [ ] **Step 3: Update backend schema to accept projectId**

In `packages/api-server/src/routes/sessions.ts`, update the POST body schema (line 22-30) to include `projectId`:

```typescript
        body: {
          type: 'object',
          required: ['userId', 'scriptId'],
          properties: {
            userId: { type: 'string', minLength: 1 },
            scriptId: { type: 'string', format: 'uuid' },
            initialVariables: { type: 'object', additionalProperties: true },
            projectId: { type: 'string', format: 'uuid' },
          },
        },
```

And in the handler destructure (line 75):

```typescript
const {
  userId,
  scriptId,
  initialVariables,
  projectId: bodyProjectId,
} = request.body as {
  userId: string;
  scriptId: string;
  initialVariables?: Record<string, unknown>;
  projectId?: string;
};
```

Then update the projectId extraction logic (line 96-98). Replace:

```typescript
const tags = (script.tags as string[]) || [];
const projectTag = tags.find((tag) => tag.startsWith('project:'));
const projectId = projectTag ? projectTag.replace('project:', '') : undefined;
```

With:

```typescript
// Use explicit projectId from body, fall back to tags
const tags = (script.tags as string[]) || [];
const projectTag = tags.find((tag) => tag.startsWith('project:'));
const projectId = bodyProjectId || (projectTag ? projectTag.replace('project:', '') : undefined);
```

- [ ] **Step 4: Type check both packages**

```bash
cd packages/script-editor && pnpm typecheck
cd packages/api-server && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/script-editor/src/api/debug.ts \
        packages/script-editor/src/components/DebugConfigModal/index.tsx \
        packages/api-server/src/routes/sessions.ts
git commit -m "feat: pass projectId in createDebugSession request"
```

---

### Task 9: Integration test — manual verification checklist

- [ ] **Step 1: Start dev servers**

```bash
pnpm dev:all
```

- [ ] **Step 2: Create a debug session**

1. Open a project in the editor
2. Click "Debug ▾" → "新建调试"
3. Select a session script, start debugging
4. Send a few messages — verify the debug chat works
5. Close the debug panel

- [ ] **Step 3: Verify "继续调试"**

1. Refresh the page or re-enter the project
2. Verify the button shows "继续调试" (blue/primary)
3. Click "继续调试" — verify it opens the previous session
4. Verify the conversation history is restored
5. Send another message — verify it continues from the saved position

- [ ] **Step 4: Verify "调试历史"**

1. Click "继续调试 ▾" → "调试历史"
2. Verify list shows sessions with script name, status, position, message count
3. Click "详情" — verify expanded detail
4. Click "进入" on an active session — verify it opens
5. Click "进入" on a completed session — verify read-only mode

- [ ] **Step 5: Verify delete**

1. Open history list
2. Hover and click delete icon
3. Confirm deletion
4. Verify session is removed from list

- [ ] **Step 6: Verify session end state**

1. Complete a session (run through all phases)
2. Close the panel
3. Refresh — verify button shows "Debug" (not "继续调试") since session ended
4. Open history — verify session shows "已完成" status
5. Enter the session — verify read-only mode

- [ ] **Step 7: Verify incompatible position**

1. Start a debug session, send messages (advance position)
2. Close panel
3. Edit the YAML script — delete the current phase/topic
4. Save the script
5. Click "继续调试"
6. Verify error message about incompatible position
