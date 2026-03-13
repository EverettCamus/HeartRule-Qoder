# AGENTS.md - HeartRule AI Consulting Engine

## 全局规则

- **回复语言**: 当用户使用中文提问时，请使用中文回复。

## Overview

HeartRule is a TypeScript monorepo implementing an AI consulting engine using "LLM + YAML scripts" for intelligent consultation.

## Project Structure

```
packages/
├── shared-types/     # Shared TypeScript types + Zod schemas
├── core-engine/      # Six core engines (headless)
├── api-server/       # Fastify REST API + WebSocket
└── script-editor/   # React-based script editor UI
```

## Commands

### Installation & Development

```bash
pnpm install
pnpm docker:dev
pnpm --filter @heartrule/api-server db:migrate
pnpm dev
pnpm dev:editor
pnpm dev:all
```

### Building

```bash
pnpm build
pnpm --filter @heartrule/shared-types build
pnpm --filter @heartrule/core-engine build
pnpm --filter @heartrule/api-server build
```

### Testing

```bash
pnpm test                  # All unit tests
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage
pnpm test -- <file-path>  # Single test file
pnpm test -- -t "pattern" # Single test by name
pnpm test:api             # API package tests only
pnpm test:e2e             # E2E tests
pnpm test:e2e:ui          # E2E with UI
```

### Linting & Formatting

```bash
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
```

### Type Checking

```bash
pnpm typecheck
pnpm --filter @heartrule/core-engine typecheck
```

## Code Style Guidelines

### TypeScript

- **Target**: ES2022, **Module**: ESNext
- **Strict mode**: Enabled
- **No unused locals/parameters**: Enforced
- **No implicit returns**: Required

### Naming

- **Classes/Interfaces/Types**: `PascalCase` (e.g., `Session`, `ActionContext`)
- **Functions/Variables**: `camelCase` (e.g., `getVariable`)
- **Constants**: `UPPER_SNAKE_CASE`
- **Files**: `kebab-case.ts`, `*.test.ts`

### Imports

Order with blank lines between groups:

```typescript
// 1. Node.js built-in
import * as path from 'path';
// 2. External packages
import { describe, it, expect } from 'vitest';
// 3. Internal packages (monorepo)
import { SessionStatus } from '@heartrule/shared-types';
// 4. Relative imports - same package
import type { BaseAction } from './actions/base-action.js';
```

### Error Handling

- Use typed error objects
- Include error messages in `ActionResult.error` for Action failures
- Use try/catch with specific error handling
- Log errors with `console.error` with prefixes

```typescript
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error: any) {
  console.error('[ActionName] Failed:', error.message);
  return { success: false, error: error.message };
}
```

### Async/Await

- Always use `async/await` over raw Promises
- Never use `.then()` chains
- Handle errors with try/catch

### Types

- Use explicit return types for public functions
- Prefer interfaces over type aliases for object shapes
- Use `any` sparingly - use `unknown` if type is unknown
- Use `Record<string, T>` for dictionary types

### Null Handling

- Prefer optional chaining (`?.`) and nullish coalescing (`??`)
- Avoid non-null assertions (`!`) unless certain

### Comments

- Use JSDoc for public APIs and complex logic
- Write comments in English

### Testing

- Use Vitest with `describe`/`it`/`expect` API
- Test file location: `__tests__/` directory next to source

## Git Conventions

### Commit Messages

```
feat: add new action type
fix: resolve variable extraction bug
refactor: simplify exit condition logic
test: add coverage for session model
```

### Pre-commit Hooks

Husky runs automatically: ESLint fix, Prettier format, lint-staged.

## Common Patterns

### Action Implementation

```typescript
export class MyAction extends BaseAction {
  static actionType = 'my_action';
  async execute(context: ActionContext, userInput?: string): Promise<ActionResult> {
    try {
      return { success: true, completed: true, aiMessage: 'Response' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}


## Agent分层文档架构 (AGENTS.md)

### 分层放置决策
```

根目录 → 本项目AGENTS.md
packages/script-editor/ → AGENTS.md (前端React应用)
packages/api-server/ → AGENTS.md (REST API + 70+脚本)
packages/core-engine/ → AGENTS.md (六大核心引擎)
packages/shared-types/ → AGENTS.md (共享类型系统)

```

### 关键项目发现（影响Agent工作）

**架构偏差**:
- API服务器根目录有70+ .ts脚本 → 应移到scripts/目录
- Core Engine同时有test/和__tests__/目录 → 需要统一
- Project有.sisyphus/目录可能包含自定义工作流

**构建工具混合**:
- shared-types/core-engine: tsup构建
- api-server: tsc + nodemon
- script-editor: Vite + React

**缺乏**:
- CI/CD工作流，只有本地Docker compose
- 生产Dockerfile，只有开发配置
- Lint-staged排除的大型目录(.opencode/, .qoder/)

**约束**:
- TypeScript严格模式：unusedLocals/unusedParameters强制执行
- 100字符宽度（.prettierrc）
- verbatimModuleSyntax（no type-only re-exports）

### 专门Agent优化

**使用这些技能时优先考虑**:
- frontend-design, theme-factory (script-editor)
- webapp-testing (e2e测试)
- internal-comms (日志记录/错误处理)
- doc-coauthoring (生成文档)

**关键触发点**:
- 提到'咨询引擎' → 优先使用core-engine AGENTS.md
- 提到'脚本编辑' → 优先使用script-editor AGENTS.md
- 提到'YAML脚本' → 检查scripts/目录约定

```

### Domain Model

```typescript
export class Session {
  constructor(params: { userId: string; scriptId: string; status?: SessionStatus }) {}
  start(): void {
    /* ... */
  }
  toJSON(): Record<string, unknown> {
    /* ... */
  }
}
```

## Additional Resources

- [README.md](../README.md) - Project overview
- [openspec/specs/\_global/process/development-guide.md](../openspec/specs/_global/process/development-guide.md) - Development guide
- API docs: http://localhost:8000/docs (when running locally)
