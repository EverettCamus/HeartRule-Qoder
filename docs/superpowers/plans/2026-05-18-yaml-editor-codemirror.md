# YAML Editor CodeMirror Line Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain Ant Design `<TextArea>` in YAML editing mode with CodeMirror 6 to get line numbers and YAML syntax highlighting.

**Architecture:** Swap `<Input.TextArea>` for `@uiw/react-codemirror`'s `<CodeMirror>` component with `@codemirror/lang-yaml`. The callback signature changes from `(e: ChangeEvent) => void` to `(value: string) => void`. No other architectural changes.

**Tech Stack:** `@uiw/react-codemirror`, `@codemirror/lang-yaml`, CodeMirror 6 (peer deps auto-installed), React 18, TypeScript

---

### Task 1: Install dependencies

**Files:**

- Modify: `packages/script-editor/package.json`

- [ ] **Step 1: Add @uiw/react-codemirror and @codemirror/lang-yaml**

```bash
cd packages/script-editor && pnpm add @uiw/react-codemirror @codemirror/lang-yaml
```

- [ ] **Step 2: Verify install**

```bash
grep "react-codemirror\|lang-yaml" packages/script-editor/package.json
```

Expected: Both packages appear in `dependencies`.

---

### Task 2: Update EditorContent to use CodeMirror

**Files:**

- Modify: `packages/script-editor/src/pages/ProjectEditor/EditorContent.tsx:21,238-248`
- Modify: `packages/script-editor/src/pages/ProjectEditor/style.css` (add CodeMirror height rule)

- [ ] **Step 1: Change the onContentChange prop type**

In `EditorContent.tsx`, change line 37:

```tsx
// Before:
onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;

// After:
onContentChange: (value: string) => void;
```

- [ ] **Step 2: Replace import and JSX**

Remove the `TextArea` destructuring on line 21:

```tsx
// Before:
const { TextArea } = Input;

// After: (remove this line, no longer needed)
```

Add CodeMirror import after the existing `@ant-design/icons` import block (after line 1):

```tsx
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
```

Replace lines 238-248:

```tsx
// Before:
<TextArea
  value={fileContent}
  onChange={onContentChange}
  placeholder="Edit YAML content..."
  style={{
    width: '100%',
    minHeight: '600px',
    fontFamily: 'Monaco, Consolas, monospace',
    fontSize: '14px',
  }}
/>

// After:
<CodeMirror
  value={fileContent}
  onChange={onContentChange}
  placeholder="Edit YAML content..."
  extensions={[yamlLang()]}
  height="600px"
  style={{
    fontSize: '14px',
  }}
  theme="light"
/>
```

- [ ] **Step 3: Add CSS to make CodeMirror fill width**

In `packages/script-editor/src/pages/ProjectEditor/style.css`, add at the end:

```css
/* CodeMirror editor full width */
.editor-content .cm-editor {
  width: 100%;
}
```

- [ ] **Step 4: Verify typecheck**

```bash
cd packages/script-editor && pnpm typecheck
```

Expected: PASS (no type errors).

---

### Task 3: Update handleContentChange in parent

**Files:**

- Modify: `packages/script-editor/src/pages/ProjectEditor/index.tsx:644-648`

- [ ] **Step 1: Change the callback to accept string directly**

In `index.tsx`, update `handleContentChange`:

```tsx
// Before:
const handleContentChange = useCallback(
  (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(e.target.value);
  },
  [setFileContent]
);

// After:
const handleContentChange = useCallback(
  (value: string) => {
    setFileContent(value);
  },
  [setFileContent]
);
```

- [ ] **Step 2: Verify typecheck**

```bash
cd packages/script-editor && pnpm typecheck
```

Expected: PASS (no type errors).

---

### Task 4: Build verification

- [ ] **Step 1: Build the script-editor package**

```bash
cd packages/script-editor && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify TextArea import is clean**

```bash
grep "TextArea" packages/script-editor/src/pages/ProjectEditor/EditorContent.tsx
```

Expected: No matches (the unused import was removed).

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add packages/script-editor/package.json packages/script-editor/pnpm-lock.yaml \
  packages/script-editor/src/pages/ProjectEditor/EditorContent.tsx \
  packages/script-editor/src/pages/ProjectEditor/index.tsx \
  packages/script-editor/src/pages/ProjectEditor/style.css
git commit -m "feat: replace YAML editor TextArea with CodeMirror for line numbers

Add @uiw/react-codemirror and @codemirror/lang-yaml. Swap plain TextArea
for CodeMirror component with YAML syntax highlighting and line number gutter."
```
