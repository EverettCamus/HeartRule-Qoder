---
document_id: 'docs-archive-bugfix-schema-build-configuration-fix'
authority: 'historical'
status: 'archived'
archived_date: '2026-03-13'
source: 'docs'
path: 'docs/bugfix/schema-build-configuration-fix.md'
migrated_to: '' # 如果已迁移到openspec，填写openspec路径
tags: ['historical', 'reference', 'archived', 'bugfix']
search_priority: 'medium'
ai_retrieval_hint: '⚠️ 此文档已归档，请优先参考OpenSpec文档'
---

# ⚠️ ARCHIVED DOCUMENT

**此文档已归档，仅供参考和历史记录。**
**当前开发请参考OpenSpec文档：\`openspec/specs/\`**

**归档原因**: 文档已迁移到OpenSpec结构或不再维护
**归档日期**: 2026-03-13
**原始路径**: docs/bugfix/schema-build-configuration-fix.md

---

---

document_id: docs-bugfix-schema-build-configuration-fix-md
authority: historical
status: archived
version: 1.0.0
last_updated: 2026-01-29
archived_date: 2026-03-12
source: docs
path: bugfix/schema-build-configuration-fix.md
tags: [historical, reference, archived, bugfix]
search_priority: low

---

# Schema 构建配置修复 - 解决编辑器缓存问题

## 问题描述

用户在编辑器中仍然看到 Schema 验证错误，即使 Schema 源文件已经修复：

```
发现 3 个脚本验证错误

- session.phases[0] 包含不允许的额外字段 'description'
- session.phases[0].topics[0].actions[0] 包含不允许的额外字段 'config'
- session.phases[0].topics[0].actions[1] 包含不允许的额外字段 'config'
```

## 根本原因

**构建配置问题**：Schema JSON 文件没有被复制到 `dist` 目录

1. **Schema 源文件位置**：`packages/core-engine/src/schemas/*.json`
2. **构建输出位置**：`packages/core-engine/dist/`
3. **问题**：tsup 默认只编译 TypeScript 文件，不复制 JSON 文件
4. **结果**：编辑器使用的是旧版本的 Schema（没有 description 和 config 字段）

## 修复方案

### 修改 tsup 配置文件

**文件**：`packages/core-engine/tsup.config.ts`

**添加内容**：

1. 导入文件系统模块
2. 实现递归复制目录函数
3. 在 `onSuccess` 钩子中复制 schemas 目录

**完整配置**：

```typescript
import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

// 递归复制目录
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['@heartrule/shared-types'],
  onSuccess: async () => {
    // 复制 schemas 目录到 dist
    console.log('Copying schemas to dist...');
    copyDir('src/schemas', 'dist/schemas');
    console.log('Schemas copied successfully!');
  },
});
```

## 修复步骤

### 1. 修改构建配置

```bash
# 编辑 packages/core-engine/tsup.config.ts
# 添加 onSuccess 钩子复制 schemas
```

### 2. 重新编译 core-engine

```bash
cd packages/core-engine
pnpm build
```

**预期输出**：

```
CLI tsup v8.5.1
ESM ⚡️ Build success in 59ms
Copying schemas to dist...
Schemas copied successfully!
DTS ⚡️ Build success in 3568ms
```

### 3. 验证文件复制

```bash
ls dist/schemas/*.json
ls dist/schemas/actions/*.json
```

**预期结果**：

```
dist/schemas/
  - phase.schema.json      (包含 description 字段)
  - topic.schema.json      (包含 description 字段)
  - session.schema.json
dist/schemas/actions/
  - base.schema.json       (包含 config 字段)
  - ai-ask.schema.json
  - ai-say.schema.json
  - ai-think.schema.json
  - use-skill.schema.json
```

### 4. 重新编译 script-editor

```bash
cd packages/script-editor
pnpm build
```

### 5. 清除浏览器缓存并重新加载页面

**方法 1：硬刷新**

- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

**方法 2：清除缓存**

- 打开开发者工具 (F12)
- 右键刷新按钮
- 选择"清空缓存并硬性重新加载"

## 验证修复

### 测试脚本

用户的脚本现在应该能通过验证：

```yaml
session:
  session_id: cbt_depression_assessment
  phases:
    - phase_id: phase_1
      phase_name: New Phase 1
      description: '' # ✅ 现在允许
      topics:
        - topic_id: topic_1
          topic_name: New Topic 1
          actions:
            - action_id: action_1
              action_type: ai_say
              config: # ✅ 现在允许
                content: '内容'
                max_rounds: 2
```

### 预期结果

- ✅ 无验证错误
- ✅ description 字段被接受
- ✅ config 字段被接受

## 技术说明

### 为什么需要复制 JSON 文件

1. **运行时加载**：SchemaValidator 在运行时需要读取 JSON Schema 文件
2. **模块解析**：编辑器从 `node_modules/@heartrule/core-engine/dist/` 加载模块
3. **文件引用**：Schema 文件通过相对路径 `$ref` 相互引用
4. **构建产物**：必须确保 dist 目录包含完整的 schemas 目录结构

### tsup onSuccess 钩子

```typescript
onSuccess: async () => {
  // 在编译成功后执行
  copyDir('src/schemas', 'dist/schemas');
};
```

**执行时机**：

- ESM 构建成功后
- DTS 生成前
- 确保每次构建都复制最新的 Schema

### 复制函数实现

```typescript
function copyDir(src: string, dest: string) {
  // 1. 创建目标目录（递归）
  mkdirSync(dest, { recursive: true });

  // 2. 读取源目录内容
  const entries = readdirSync(src, { withFileTypes: true });

  // 3. 遍历并复制
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // 递归复制子目录
      copyDir(srcPath, destPath);
    } else {
      // 复制文件
      copyFileSync(srcPath, destPath);
    }
  }
}
```

## 文件结构对比

### 修复前

```
packages/core-engine/
├── src/
│   └── schemas/
│       ├── session.schema.json
│       ├── phase.schema.json
│       ├── topic.schema.json
│       └── actions/
│           ├── base.schema.json
│           ├── ai-ask.schema.json
│           └── ...
└── dist/
    ├── index.mjs
    ├── index.d.mts
    └── (缺少 schemas 目录) ❌
```

### 修复后

```
packages/core-engine/
├── src/
│   └── schemas/
│       └── (同上)
└── dist/
    ├── index.mjs
    ├── index.d.mts
    └── schemas/              ✅ 新增
        ├── session.schema.json
        ├── phase.schema.json
        ├── topic.schema.json
        └── actions/
            ├── base.schema.json
            ├── ai-ask.schema.json
            └── ...
```

## 相关修复

本次修复涉及两个层面的问题：

### 1. Schema 定义修复（之前完成）

- [x] Phase Schema 添加 description 字段
- [x] Topic Schema 添加 description 字段
- [x] Action Base Schema 添加 config 字段

### 2. 构建配置修复（本次完成）

- [x] tsup 配置添加 onSuccess 钩子
- [x] 实现 schemas 目录复制
- [x] 验证文件正确复制

## 更新日志

### v1.0.2 (2026-01-29)

#### 🐛 Bug 修复

- ✅ tsup 配置添加 Schema 文件复制
- ✅ 确保 dist 目录包含最新的 Schema 定义
- ✅ 解决编辑器使用旧 Schema 的缓存问题

#### ✅ 编译验证

- ✅ core-engine 编译成功并复制 schemas
- ✅ script-editor 编译成功
- ✅ 文件结构验证通过

#### 📝 文档

- ✅ 创建构建配置修复文档
- ✅ 添加清除缓存指南
- ✅ 更新验证流程说明

## 用户操作指南

### 立即修复步骤

1. **重新编译项目**

   ```bash
   cd packages/core-engine
   pnpm build
   cd ../script-editor
   pnpm build
   ```

2. **清除浏览器缓存**
   - 按 `Ctrl + Shift + R` (Windows) 或 `Cmd + Shift + R` (Mac)
   - 或手动清空缓存并重新加载

3. **重新加载编辑器页面**
   - 访问 `http://localhost:5173/script_editor.html`
   - 打开之前报错的脚本
   - 验证错误应该消失

### 验证修复成功

打开脚本编辑器，检查：

- ✅ Phase 的 description 字段不报错
- ✅ Topic 的 description 字段不报错
- ✅ Action 的 config 字段不报错
- ✅ 验证通过，显示"没有发现错误"

## 预防措施

### 未来添加 Schema 字段时

1. **修改源文件**：`src/schemas/*.json`
2. **重新编译**：`pnpm build`（会自动复制）
3. **清除缓存**：确保浏览器使用新版本
4. **验证**：测试新字段是否生效

### CI/CD 集成

在持续集成中，确保：

```yaml
# .github/workflows/build.yml
- name: Build core-engine
  run: |
    cd packages/core-engine
    pnpm build
    # 验证 schemas 目录存在
    test -d dist/schemas || exit 1
```

## 总结

通过修改 tsup 构建配置，确保 Schema JSON 文件被正确复制到 dist 目录，解决了编辑器使用旧版本 Schema 的问题。用户现在可以正常使用 description 和 config 字段，不会再看到验证错误。
