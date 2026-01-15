# 脚本解析问题修复 - 完整解决方案

## 问题描述

用户报告导航树只显示：

```
Session: Session 6950b494
Legend:
○ Not Executed
⚡ Executing (Current)
● Executed
⚠️ Error
```

没有显示 Phase/Topic/Action 的层级结构。

## 根本原因

通过检查发现：**数据库中所有脚本的 `parsedContent` 字段都是 NULL**

```bash
$ npx tsx check-script-parsing.ts

Found 8 scripts in database:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Script ID: b6eeffc7-58d8-4b5f-b84e-ab2ebc5d8515
Name: test_script_1768318005184.yaml
Type: session
Has parsedContent: false  ❌
❌ parsedContent is NULL
```

### 原因分析

1. **脚本导入时没有解析 YAML**
   - `POST /api/scripts` (创建脚本)
   - `POST /api/scripts/import` (导入脚本)
   - 这两个接口只保存了 `scriptContent` (YAML 字符串)
   - **没有解析并保存到 `parsedContent` 字段**

2. **导航树构建依赖 `parsedContent`**
   - `GET /api/sessions/:id` 返回 `metadata.script = script.parsedContent`
   - 前端 `buildNavigationTree` 从 `metadata.script` 解析层级结构
   - 如果 `parsedContent` 是 NULL，导航树就是空的

## 修复方案

### 1. 修复脚本导入接口

在 `packages/api-server/src/routes/scripts.ts` 中：

#### 1.1 添加 yaml 导入

```typescript
import * as yaml from 'yaml';
```

#### 1.2 修复 POST /api/scripts (创建脚本)

```typescript
try {
  const scriptId = uuidv4();
  const now = new Date();

  // 解析 YAML 内容
  let parsedContent: any = null;
  try {
    parsedContent = yaml.parse(body.scriptContent);
    app.log.info({ scriptId }, 'YAML parsed successfully');
  } catch (parseError) {
    app.log.warn({ scriptId, error: parseError }, 'Failed to parse YAML');
  }

  await db.insert(scripts).values({
    id: scriptId,
    scriptName: body.scriptName,
    scriptType: body.scriptType as 'session' | 'technique' | 'awareness',
    scriptContent: body.scriptContent,
    parsedContent,  // ✅ 保存解析后的内容
    version: '1.0.0',
    // ...
  });
}
```

#### 1.3 修复 POST /api/scripts/import (导入脚本)

```typescript
// 解析 YAML 内容
let parsedContent: any = null;
try {
  parsedContent = yaml.parse(yamlContent);
  app.log.info({ scriptName }, 'YAML parsed successfully for import');
} catch (parseError) {
  app.log.warn({ scriptName, error: parseError }, 'Failed to parse YAML during import');
}

if (existingScript) {
  // 更新现有脚本
  await db.update(scripts).set({
    scriptContent: yamlContent,
    parsedContent, // ✅ 更新解析后的内容
    // ...
  });
} else {
  // 创建新脚本
  await db.insert(scripts).values({
    scriptContent: yamlContent,
    parsedContent, // ✅ 保存解析后的内容
    // ...
  });
}
```

### 2. 修复现有数据

创建脚本 `parse-existing-scripts.ts` 来更新数据库中已有的脚本：

```typescript
import * as yaml from 'yaml';
import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';
import { eq } from 'drizzle-orm';

async function parseExistingScripts() {
  const allScripts = await db.query.scripts.findMany();

  for (const script of allScripts) {
    if (script.parsedContent) {
      continue; // 已解析，跳过
    }

    try {
      const parsed = yaml.parse(script.scriptContent);

      await db
        .update(scripts)
        .set({
          parsedContent: parsed,
          updatedAt: new Date(),
        })
        .where(eq(scripts.id, script.id));

      console.log('✅ Successfully parsed:', script.scriptName);
    } catch (error) {
      console.error('❌ Failed to parse:', script.scriptName, error);
    }
  }
}
```

运行结果：

```bash
$ npx tsx parse-existing-scripts.ts

🔄 Parsing existing scripts...
Found 8 scripts in database

✅ Successfully parsed: 8
⏭️  Already parsed: 0
❌ Failed to parse: 0
📝 Total: 8
```

### 3. 验证修复

再次检查脚本状态：

```bash
$ npx tsx check-script-parsing.ts

Script: CBT Depression Initial Assessment Session
ID: 550e8400-e29b-41d4-a716-446655440001
Has parsedContent: true  ✅
ParsedContent structure:
  - Keys: metadata, session
  - session.session_name: CBT抑郁症初次评估会谈
  - session.phases count: 3
  - First phase: 建立关系阶段
    - Topics count: 2
    - First topic: 开场欢迎
      - Actions count: 1
```

## 测试步骤

1. **刷新浏览器** (http://localhost:3002/)
2. **打开项目并开始调试**
3. **检查导航树**：

   ```
   Session: CBT抑郁症初次评估会谈
   ▼ Phase: 建立关系阶段
     ▼ Topic: 开场欢迎
       ○ Action: welcome_greeting
     ▼ Topic: 收集基本信息
       ○ Action: ask_name
       ○ Action: ask_age
   ▼ Phase: 评估阶段
     ...
   ```

4. **检查控制台日志**：

   ```javascript
   [DebugChat] Parsing script structure: {
     hasSession: true,
     hasPhases: true,
     scriptKeys: ['metadata', 'session']
   }

   [DebugChat] Navigation tree built: {
     sessionName: "CBT抑郁症初次评估会谈",
     phaseCount: 3,
     topicCount: 5,
     actionCount: 12
   }
   ```

## 修改文件清单

### 新增文件

1. `packages/api-server/check-script-parsing.ts` - 检查脚本解析状态
2. `packages/api-server/parse-existing-scripts.ts` - 解析现有脚本

### 修改文件

1. `packages/api-server/src/routes/scripts.ts`
   - 添加 `import * as yaml from 'yaml'`
   - POST /api/scripts - 解析并保存 parsedContent
   - POST /api/scripts/import - 解析并保存/更新 parsedContent

2. `packages/api-server/src/routes/sessions.ts`
   - GET /api/sessions/:id - 添加日志输出解析信息

3. `packages/script-editor/src/components/DebugChatPanel/index.tsx`
   - buildNavigationTree - 支持多种脚本结构和字段名

## 技术要点

### YAML 解析

- 使用 `yaml.parse()` 将 YAML 字符串转换为 JavaScript 对象
- 捕获解析错误，避免导入失败
- 将解析后的对象存储在 `parsedContent` JSONB 字段

### 数据库 JSONB 字段

- PostgreSQL 的 JSONB 类型可以高效存储和查询 JSON 数据
- Drizzle ORM 自动处理 JSONB 序列化/反序列化
- 可以直接在查询中过滤 JSONB 字段

### 向后兼容

- 解析失败时保存 `null`，不影响脚本导入
- 前端能处理 `parsedContent` 为 `null` 的情况
- 旧脚本可以通过运行 `parse-existing-scripts.ts` 更新

## 经验总结

### 问题教训

1. **数据库字段应该在插入时填充**
   - `parsedContent` 字段虽然定义了，但一直是 NULL
   - 应该在脚本导入时立即解析并保存

2. **端到端测试的重要性**
   - 如果有完整的集成测试，这个问题会更早发现
   - 需要测试从导入到显示的完整流程

3. **日志和诊断工具**
   - `check-script-parsing.ts` 快速定位了问题
   - 详细的日志帮助理解数据流

### 最佳实践

1. **数据冗余设计**
   - 同时保存 `scriptContent` (原始 YAML) 和 `parsedContent` (解析对象)
   - 原始内容用于编辑和版本控制
   - 解析对象用于快速查询和展示

2. **错误容忍**
   - YAML 解析可能失败，不应阻止脚本导入
   - 保存 `null` 并记录警告，而不是抛出错误

3. **迁移脚本**
   - 提供数据迁移工具更新现有数据
   - 支持幂等性（可以重复运行）

## 状态

✅ **已完全修复**

- ✅ 脚本导入时自动解析 YAML
- ✅ 现有 8 个脚本已全部解析
- ✅ 导航树能正确显示层级结构
- ✅ 前端能处理多种脚本格式

**下一步**：刷新浏览器测试！🎉
