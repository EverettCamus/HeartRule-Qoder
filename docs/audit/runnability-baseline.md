# 可运行基线 — 工程编目战役 S5

> 镜头：**现在能不能跑？跑到哪一步断？**
> 日期：2026-09-28 · 环境：WSL2 / Node 24.13.1 / pnpm 9.15.0 · 无 Docker、无 DB、无 Redis、无 Hindsight
> 方法：只跑**只读或纯本地**命令。**未启动任何服务、未启动 Docker、未安装任何依赖。**

---

## 第一部分 · 结论卡

| 链路                                                             | 能不能跑 | 卡在哪                                                                                                                            | 证据                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **构建** `pnpm build`                                            | ✅ 能    | 无阻塞。构建告警：core-engine 把 node 内置模块（`path`/`fs/promises`）打进编辑器包，vite externalize 成 `__vite-browser-external` | `EXIT=0`；4 包全过（shared-types tsup → core-engine tsup → script-editor tsc+vite → api-server tsc）。编辑器产物 3007.87 kB / gzip 979.65 kB；`../core-engine/dist/index.mjs (1008:32): "resolve" is not exported by "__vite-browser-external"` |
| **类型检查** `pnpm typecheck`                                    | ✅ 能    | 无阻塞                                                                                                                            | `tsc --noEmit` → `EXIT=0`，零输出                                                                                                                                                                                                               |
| **Lint** `pnpm lint`                                             | ✅ 能    | 无阻塞（但噪声大）                                                                                                                | `✖ 1239 problems (0 errors, 1239 warnings)`；`EXIT=0`。警告集中在 `no-console`、`no-explicit-any`                                                                                                                                               |
| **单元测试** `pnpm test`                                         | ✅ 能    | 无阻塞。但**默认套件会打真实 LLM**                                                                                                | `Test Files 61 passed \| 2 skipped (63)`；`Tests 697 passed \| 22 skipped (719)`；`EXIT=0`；`Duration 73.95s`                                                                                                                                   |
| **编辑器单元测试** `pnpm --filter @heartrule/script-editor test` | ✅ 能    | 无阻塞。但**被根 `pnpm test` 排除，等于不在默认门禁里**                                                                           | `Test Files 7 passed (7)`；`Tests 104 passed \| 2 skipped (106)`；`EXIT=0`                                                                                                                                                                      |
| **E2E** `pnpm test:e2e`                                          | ❌ 不能  | 编辑器 dev server（:8081）未起、API 未起、DB 未起                                                                                 | `3 failed \| 1 skipped`；`EXIT=1`；失败原因 `page.goto: net::ERR_NETWORK_CHANGED at http://localhost:8081/projects/<id>`                                                                                                                        |
| **启动依赖** `pnpm dev`                                          | ⚠️ 部分  | 服务能起、路由能注册；**任何走 DB 的请求会断**                                                                                    | 实测：`buildApp()` 全图加载成功 → `BUILD_APP_OK routes registered (no listen)`；DI 容器初始化成功 `llmProvider: 'DeepSeek'`、`[HindsightAdapter] Initialized { baseUrl: http://localhost:8888 }`。全程**无 DB / 无 Redis / 无 Hindsight**       |
| **启动依赖** `pnpm dev:editor`                                   | ⚠️ 部分  | vite :8081 可起，但 `/api` 代理指向 `localhost:3000`，该端口无服务                                                                | `vite.config.ts`：`port: 8081`，`proxy['/api'].target = http://localhost:3000`                                                                                                                                                                  |
| **`pnpm docker:dev`**                                            | ❌ 不能  | **Docker 在本 WSL 发行版不可用**                                                                                                  | `docker info` → `The command 'docker' could not be found in this WSL 2 distro.` `EXIT=0`（无 daemon）。二进制仅存在于 Windows 挂载点 `/mnt/c/Program Files/Docker/Docker/resources/bin/`                                                        |
| **数据库迁移** `pnpm db:migrate`                                 | ❌ 不能  | 需要 PostgreSQL:5432，端口全关                                                                                                    | `migrate(db, { migrationsFolder: './drizzle' })` 需活连接；`ss -ltn` 无 5432/6379/8888                                                                                                                                                          |
| **编辑器冒烟（人工）**                                           | ❌ 不能  | 需要 editor + API + DB 三者齐备                                                                                                   | 同 E2E 阻塞点                                                                                                                                                                                                                                   |

---

## 第二部分 · 恢复基线所需的最小动作清单

按依赖顺序。

| #   | 动作                                | 命令 / 位置                                                                                                                                      | 需要人工介入？                                                                                                                     |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **开启 Docker Desktop 的 WSL 集成** | Docker Desktop → Settings → Resources → WSL Integration → 勾选本发行版 → Apply & Restart                                                         | **是（只能人做）**。当前 `docker` 在本 distro 不存在，脚本无法自救                                                                 |
| 2   | **预创建 3 个 external volume**     | `docker volume create heartrule-qcoder_postgres_data`（+ `_redis_data`、`_hindsight_data`）                                                      | 否。但**不先做则第 3 步必失败**——`docker-compose.dev.yml` 三个 volume 全部声明 `external: true`                                    |
| 3   | 启动依赖服务                        | `pnpm docker:dev`                                                                                                                                | 否（依赖第 1、2 步）                                                                                                               |
| 4   | 对齐 API 端口                       | 二选一：改 `.env` `API_PORT=8000`，或改 `scripts/archive/prepare-e2e-test.js:15`、`packages/script-editor/e2e/create-test-project.mjs:7` 为 3000 | 否。**不对齐则 e2e 数据准备脚本连不上**                                                                                            |
| 5   | 跑迁移                              | `pnpm db:migrate`                                                                                                                                | 否（依赖第 3 步）                                                                                                                  |
| 6   | 修 1 处字面坏路径                   | 根 `package.json` `create:sample` → `node scripts/archive/create-sample-project.mjs`                                                             | 否                                                                                                                                 |
| 7   | 起 API + 编辑器                     | `pnpm dev:all`                                                                                                                                   | 否（依赖第 3、5 步）                                                                                                               |
| 8   | 把 e2e 夹具路径对齐                 | `scripts/archive/prepare-e2e-test.js:141` 写入路径改为 `packages/api-server/test-project-id.txt`（与两个 spec 的读取路径一致）                   | 否。**当前写作路径是 `scripts/archive/test-project-id.txt`，读的是 `packages/api-server/test-project-id.txt`，不修则数据准备白做** |
| 9   | 用真实 LLM key 走一次冒烟           | `.env` 的 `DEEPSEEK_API_KEY` 当前有值                                                                                                            | **是（需人确认 key 有效与额度）**                                                                                                  |
| 10  | （建议）把编辑器测试并回默认门禁    | 根 `vitest.config.ts` 移出 `packages/script-editor/**`，或加一条 `test:all`                                                                      | 否                                                                                                                                 |
| 11  | （建议）让 `test:api` 指向真测试    | api-server `package.json`：`"test": "vitest run"`                                                                                                | 否。当前它指向归档脚本，api-server 的 6 个测试文件只靠根 `pnpm test` 顺带跑                                                        |

**最短路径 = 4 步人工阻塞中的 1 步 + 3 条命令**：开 WSL 集成 → 建 volume → `pnpm docker:dev` → `pnpm db:migrate`。
第 1 步是唯一**无法由脚本完成**的动作。

---

## 第三部分 · 护栏覆盖地图

端到端路径：**编辑器(UI) → API(Fastify) → DB(Postgres) → 引擎(core-engine) → LLM(DeepSeek)**

| 段                              | 覆盖                                     | 说明                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编辑器 UI ↔ API（E2E）          | ❌ **无（3 测试全红）**                  | `version-management.spec.ts` 3 个测试，全部因 :8081 无服务失败                                                                                                              |
| 编辑器 UI（E2E，永久跳过）      | ⚫ **禁用**                              | `debug-bubbles-isolation.spec.ts` 全文仅 1 个测试且是 `test.skip`（:292）→ 该 spec 整体等于未启用                                                                           |
| 编辑器组件 / 服务               | ✅ **104 测试**                          | 7 个文件全过，**但被根 vitest 排除**，只在 `--filter script-editor` 下跑                                                                                                    |
| HTTP 路由层（schema/序列化）    | ⚠️ **仅 2 文件 / 12 测试，且是合成 app** | `fastify-serializer-e2e.test.ts`、`response-schema.test.ts` 自建一个裸 Fastify 复刻 schema，**不 import 任何真实路由**                                                      |
| HTTP 路由层（真实 handler）     | ❌ **无**                                | `sessions.ts`(27 KB)、`projects.ts`(28 KB)、`versions.ts`(12.6 KB)、`scripts.ts`(13.5 KB)、`chat.ts` 五个路由模块**零测试**                                                 |
| DB 持久化边界                   | ❌ **无（17 测试被跳过 + 3 测试假绿）**  | `project-initializer.test.ts` 14 skipped、`scripts.test.ts` 3 skipped；`database-template-provider.test.ts` 报 pass 但断言全挂在 `dbAvailable=false`，白烧 3008 ms 连接超时 |
| 记忆（Hindsight 端口/适配器）   | ⚠️ **仅 Fake/Spy**                       | `memory-repository-integration.test.ts` 用 `SpyMemoryRepository`；真实 `HindsightMemoryAdapter` 在测试中从未被执行                                                          |
| 引擎层（六引擎）                | ✅ **最强**                              | 约 600 用例，零外部依赖，覆盖 domain/application/engines/regression/monitoring                                                                                              |
| 引擎 → LLM                      | ⚠️ **除 1 例外全 mock**                  | 唯一真实 LLM 测试见下                                                                                                                                                       |
| **整会话生命周期（HTTP 贯通）** | ❌ **无**                                | 没有任何测试从 `POST /api/sessions/:id/messages` 一路打到底                                                                                                                 |

### 两个关键单点

**唯一走真 LLM 的测试**：`packages/core-engine/test/eval/response-strategy.eval.test.ts`

- 7 个用例，**72.06 s**（占 `pnpm test` 总时长 73.95 s 的 97%）
- 直连 `https://api.deepseek.com`，走 `@ai-sdk/openai` 的 `generateText`
- **完全绕过 API 与 DB**：只调 `PromptTemplateManager` 读 `config/prompt-defaults/ai_ask_v1.md`，再自己拼提示词
- 激活条件仅 `DEEPSEEK_API_KEY` 存在 → 本机 `.env` 有值，所以**默认 `pnpm test` 就会真实调用付费 API**，且结果不确定（靠 20%/25% 字数容差兜底）

**唯一 UI E2E 覆盖**：版本切换三件事（撤销栈清空、未保存改动弹警告、工作区内容等于目标快照），对应 `version-management.spec.ts` 3 个用例 —— **当前全红**。

### 最大的洞

**"引擎能跑" 与 "用户能点通" 之间整段无人看守**：HTTP handler 层 + DB 持久化边界合计约 **8.3 千行 api-server 源码**，只有 995 行测试，且其中 20 个用例在当前环境一律跳过、3 个假绿。
F 类"不可验证"的根因就在这一段：引擎侧测试很厚，但**没有任何护栏能证明一次真实请求从路由进、经 DB、到引擎、再回响应是通的**。

---

## 第四部分 · 全部坏引用与数据层缺口清单

### 4.1 `package.json` 坏引用（根 + 各包，全量扫描）

| 位置              | 脚本                        | 指向                                                    | 状态                                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| 根 `package.json` | `create:sample`             | `packages/api-server/create-sample-project.mjs`         | ❌ **字面不存在**。实际文件在 `scripts/archive/create-sample-project.mjs` |
| 根 `package.json` | `test:api`                  | `pnpm --filter api-server test`                         | ⚠️ 转发到下方那条，**不跑 api-server 的真测试**                           |
| `api-server`      | `test`                      | `tsx ../../scripts/archive/test-version-switch-sync.js` | ⚠️ 文件存在，但**是需要活 API(:8000) 的临时脚本，非测试套件**             |
| `api-server`      | `test:flow`                 | `scripts/archive/test-full-flow.ts`                     | ⚠️ 同上（无 describe/it）                                                 |
| `api-server`      | `test:welcome`              | `scripts/archive/test-full-welcome.ts`                  | ⚠️ 同上（无 describe/it）                                                 |
| `api-server`      | `test:global-vars`          | `scripts/archive/test-global-vars-persistence.ts`       | ⚠️ 同上                                                                   |
| `api-server`      | `cleanup-templates:analyze` | `scripts/archive/analyze-and-cleanup-templates.ts`      | ⚠️ 归档脚本                                                               |
| `api-server`      | `cleanup-templates:execute` | 同上 `--execute`                                        | ⚠️ 归档脚本                                                               |
| `api-server`      | `cleanup-templates:auto`    | 同上 `--execute --yes`                                  | ⚠️ 归档脚本                                                               |
| `api-server`      | —                           | **没有任何 `vitest` 脚本**                              | ❌ 其 6 个测试文件只能靠根 `pnpm test` 顺带发现                           |

> 勘误：已知线索称"5 处脚本指向 `scripts/archive/` 的坏路径"。实测**字面断链只有 1 处**（`create:sample`）；其余 7 处**路径可解析**，但语义已坏——指向归档的一次性脚本，既不跑真测试、又需要活 API。根 `pnpm test` 本身正常（能发现 api-server 的 6 个测试文件）。

### 4.2 端口 / 路径不一致

| 引用点                                                 | 值                                                         | 冲突对象                                                |
| ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------- |
| `.env` `API_PORT`                                      | `3000`                                                     | `.env.example` 为 `8000`；`app.ts` 默认 `8000`          |
| `vite.config.ts` proxy target                          | `http://localhost:3000`                                    | 依赖 `.env` 的 3000                                     |
| `scripts/archive/prepare-e2e-test.js:15`               | `http://localhost:8000/api`                                | 与 .env 的 3000 冲突                                    |
| `packages/script-editor/e2e/create-test-project.mjs:7` | `http://localhost:8000/api`                                | 同上                                                    |
| `scripts/archive/test-version-switch-sync.js:9`        | `http://localhost:8000/api`                                | 同上（即 api-server 的 `test` 脚本）                    |
| `packages/script-editor/e2e/prepare-test-data.mjs:12`  | `http://localhost:3000/api`                                | 与同目录 `create-test-project.mjs` 的 8000 **自相矛盾** |
| `scripts/start-dev.ps1:47`                             | 编辑器 `http://localhost:5173`                             | vite 实际 `8081`                                        |
| `scripts/archive/create-sample-project.mjs`            | fetch 用 `8000`，日志却打印 `请刷新 http://localhost:3000` | 自相矛盾                                                |
| 其他归档脚本                                           | `3001` / `3002` / `3000`                                   | 各说各话                                                |

| 引用点   | 写入路径                                                                          | 读取路径                                                 | 冲突                                                                                     |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E2E 夹具 | `scripts/archive/prepare-e2e-test.js:141` → `scripts/archive/test-project-id.txt` | 两个 spec 均读 `packages/api-server/test-project-id.txt` | ❌ **不一致**。该文件现存（`a498d580-…`，8/16 手工放置），一旦重跑准备脚本就会写到错位置 |

### 4.3 `playwright.config.ts` 缺口

| 项          | 现状                           | 影响                                                                   |
| ----------- | ------------------------------ | ---------------------------------------------------------------------- |
| `webServer` | **整段被注释掉**               | 无自动起服务；必须人工先跑 `pnpm dev:all`，否则 E2E 必红（当前即如此） |
| `baseURL`   | `http://localhost:8081`        | 与 vite `8081` 一致 ✅                                                 |
| `testDir`   | `./packages/script-editor/e2e` | ✅ 存在 2 个 spec                                                      |

### 4.4 数据层：迁移文件 ↔ journal 全量对照

`packages/api-server/drizzle/` 共 **7 个 `.sql`**，`meta/_journal.json` 只有 **6 条**，`meta/` 有 **6 个 snapshot**。

| `.sql` 文件                          | journal 条目  | snapshot                | 状态                                          |
| ------------------------------------ | ------------- | ----------------------- | --------------------------------------------- |
| `0000_massive_young_avengers.sql`    | ✅ `idx 0`    | ✅ `0000_snapshot.json` | 正常                                          |
| `0001_dusty_iceman.sql`              | ✅ `idx 1`    | ✅ `0001_snapshot.json` | 正常                                          |
| `0002_familiar_joystick.sql`         | ✅ `idx 2`    | ✅ `0002_snapshot.json` | 正常                                          |
| **`0003_add_deprecated_status.sql`** | ❌ **无条目** | ❌ **无 snapshot**      | 🔴 **孤立文件**（且与下一条共用 `0003` 前缀） |
| `0003_smiling_doctor_strange.sql`    | ✅ `idx 3`    | ✅ `0003_snapshot.json` | 正常                                          |
| `0004_loud_luminals.sql`             | ✅ `idx 4`    | ✅ `0004_snapshot.json` | 正常                                          |
| `0005_dizzy_mephistopheles.sql`      | ✅ `idx 5`    | ✅ `0005_snapshot.json` | 正常                                          |

**缺口影响评估：不是功能缺口。** `drizzle-orm` 的 `migrate()` 只读 `_journal.json`，孤立文件永不执行；而其内容已被 `0003_smiling_doctor_strange.sql` **完全覆盖**：

| 孤立文件做的事                                     | journaled `0003` 是否覆盖                              | schema.ts 是否一致                        |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `ALTER TYPE project_status ADD VALUE 'deprecated'` | ✅ 有                                                  | ✅ `projectStatusEnum` 含 `'deprecated'`  |
| `COMMENT ON TYPE project_status`（注释）           | ❌ 无                                                  | 仅丢注释，无害                            |
| —                                                  | `ALTER TYPE file_type ADD VALUE 'template'`            | ✅ `fileTypeEnum` 含 `'template'`         |
| —                                                  | `ALTER TABLE script_files ADD COLUMN file_path` + 索引 | ✅ `filePath` + `scriptFiles_filePathIdx` |

**另一处数据层残留**：迁移 `0000` 建了 `memories` 表，但 `src/db/schema.ts` **零引用**（`grep -c memories = 0`）——记忆已迁到 Hindsight 端口，该表是死 schema。
**schema.ts 表清单**（10 张）：`sessions` `messages` `scripts` `projects` `script_files` `project_drafts` `project_versions` `variables` `debug_entries` `user_global_variables` —— 除 `memories` 外与迁移集合一致。

> ⚠️ 迁移未被实际执行验证：`pnpm db:migrate` 需要 PostgreSQL:5432，当前不可用。上表为 `.sql` / `_journal.json` / `schema.ts` 三方静态比对结果。

### 4.5 依赖与配置缺口

| 项                              | 现状                                                                                                                                                        | 影响                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis                           | `docker-compose.dev.yml` 起 `redis:7.2-alpine`，`.env` 有 `REDIS_URL`，但 `packages/*/src` 中 `ioredis` / `REDIS_URL` **零引用**                            | 🔴 **死依赖**：白起一个容器，配置项无人读                                                                                                                                                                      |
| `.env` 相对 `.env.example` 缺失 | `HINDSIGHT_URL`、`HINDSIGHT_PORT`、`HINDSIGHT_API_LLM_PROVIDER`、`HINDSIGHT_API_LLM_API_KEY`、`HINDSIGHT_API_LLM_MODEL`、`JWT_SECRET`、`PROJECTS_WORKSPACE` | Hindsight 靠代码默认值 `http://localhost:8888` 兜底；JWT/PROJECTS_WORKSPACE 无兜底                                                                                                                             |
| `LLM_PROVIDER`                  | `.env` = `deepseek`；`.env.example` 默认 = `volcano`                                                                                                        | 两处默认不一致                                                                                                                                                                                                 |
| docker-compose volumes          | 三个 volume 全 `external: true`                                                                                                                             | 必须先手工 `docker volume create`                                                                                                                                                                              |
| `packages/api-server/dist`      | 构建产物，**未纳入 git**（`.gitignore:4 /packages/*/dist/`）                                                                                                | 我的 `pnpm build` 已刷新它（`dist/index.js` 由 6/2 变为 9/28）。**构建前**其 mtime 为 6/2 23:40、目录 2/24，而 api-server src 最新提交在 9/8 → `pnpm start`（`node dist/index.js`）此前跑的是约 3 个月前的代码 |
| `_system/` 目录                 | 只有 `README.md`，**无 `config/`**                                                                                                                          | 模板 2 层解析的 Custom 层（`_system/config/custom/{scheme}/`）与 Default 层（`_system/config/default/`）在文件系统下均不存在，实际回落到 `config/prompt-defaults/`                                             |
| core-engine 浏览器打包          | 编辑器产物含 node 内置模块 externalize 告警                                                                                                                 | 构建通过，但若运行时命中该路径会报 `"resolve" is not exported`                                                                                                                                                 |

### 4.6 仓库卫生

| 项           | 现状                                                                                                                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 活 worktree  | `.claude/worktrees/rerun-feature-continue`（`5df889c`，5/18）                                                                                                                                                                                                                                                               |
| 废弃分支     | 9 个：`feature/five-layer-mvp`、`feature/template-caching-optimization`、`refactor/architecture`、`worktree-cleanup+archive-scripts`、`worktree-cleanup+dedup-execution-position`、`worktree-cleanup+delete-dead-files`、`worktree-cleanup+editor-unused-types`、`worktree-rerun-action`、`worktree-rerun-feature-continue` |
| 测试资产分布 | core-engine：测试 9097 行 / 源码 17767 行（0.51）；api-server：测试 995 行 / 源码 8268 行（**0.12**）；script-editor：源码 20518 行，7 个测试文件                                                                                                                                                                           |

---

## 附：本次审计产生的副作用（如实记录）

| 动作            | 副作用                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------- |
| `pnpm build`    | 刷新了 4 个包的 `dist/`（均 gitignored，不入库）                                            |
| `pnpm test`     | 向 `api.deepseek.com` 发出真实 LLM 请求（eval 套件 7 次调用）                               |
| `pnpm test:e2e` | 改写 `packages/script-editor/e2e/test-results/.last-run.json`（git 追踪文件中唯一被改动的） |
| 全部            | **未改动任何源码或配置**；未安装依赖；未启动 Docker / 服务                                  |
