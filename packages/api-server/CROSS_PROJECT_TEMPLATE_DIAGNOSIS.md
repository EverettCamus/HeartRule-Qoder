# 工程间模板配置错乱问题 - 完整诊断报告

**问题单号**: 跨工程模板查找错误  
**诊断时间**: 2026-02-09  
**严重程度**: 高 - 导致工程隔离失效

---

## 📊 问题现象

用户报告：
- 在 **test999** 工程（ID: `6d38fcc6-977b-423f-abc5-6b590e1942e5`）中调试 `hello-world.yaml`
- 但系统实际查找 **test project22** 工程（ID: `0042aed9-a756-4bbf-95f4-3ec355feb651`）的模板
- 日志显示：`projectId: '0042aed9-a756-4bbf-95f4-3ec355feb651'`

---

## 🔍 根因分析

### 1. 会话创建流程

从服务端日志分析（Terminal 541-1013）：

```javascript
// 会话创建 API 日志
[API] Session initialized
sessionId: '5f962044-bf31-49be-a426-44953afb16bf'
scriptId: 'ef45f366-b271-4696-870c-44db13d465f7'
```

### 2. 脚本归属查询

通过数据库诊断脚本 `analyze-session-flow.ts` 确认：

```
脚本记录:
  - scriptName: hello-world.yaml
  - scriptId: ef45f366-b271-4696-870c-44db13d465f7
  - tags: ['debug', 'project:0042aed9-a756-4bbf-95f4-3ec355feb651']
  - projectId (from tags): 0042aed9-a756-4bbf-95f4-3ec355feb651

❌ 该脚本属于 test project22 工程！
```

### 3. test999 工程脚本查询

通过诊断脚本 `find-test999-scripts.ts` 确认：

```
数据库中共有 25 个脚本

test999 工程的脚本: 0 个

❌ test999 工程中没有任何脚本！
✅ test999 工程有 leo 自定义模板（8个文件）
```

### 4. 会话-工程绑定机制

代码分析 [sessions.ts#L88-L107](file:///c:/CBT/HeartRule-Qcoder/packages/api-server/src/routes/sessions.ts#L88-L107)：

```typescript
// 从 script.tags 中提取 projectId
const tags = (script.tags as string[]) || [];
const projectTag = tags.find(tag => tag.startsWith('project:'));
const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

// 保存到 session.metadata
await db.insert(sessions).values({
  id: sessionId,
  scriptId,  // ⚠️ 这里决定了绑定关系
  metadata: projectId ? { projectId } : {},
});
```

**绑定流程：**
```
Script.tags → projectId → Session.metadata.projectId
```

---

## 🎯 问题根源

### 核心问题：前端工程隔离缺失

```
用户在前端切换到 test999 工程
  ↓
打开 hello-world.yaml 编辑器
  ↓
❌ 前端未过滤不同工程的脚本
  ↓
实际打开的是 test project22 的 hello-world.yaml
  (scriptId: ef45f366-b271-4696-870c-44db13d465f7)
  ↓
创建会话时使用了错误的 scriptId
  ↓
Session 绑定到 test project22 工程
  (projectId: 0042aed9-a756-4bbf-95f4-3ec355feb651)
  ↓
查找 test project22 的模板（而非 test999）
```

### 数据验证

| 项目 | 结果 |
|------|------|
| **会话创建流程** | ✅ 每次调试创建新会话 |
| **脚本归属验证** | ❌ scriptId 属于 test project22 |
| **工程脚本统计** | ❌ test999 工程无脚本 |
| **工程模板统计** | ✅ test999 工程有 leo 模板 |

---

## ✅ 解决方案

### 临时修复（已完成）

执行脚本 `copy-script-to-test999.ts`：

```bash
cd packages/api-server
npx tsx copy-script-to-test999.ts
```

**结果：**
```
✅ 脚本复制成功:
  - 新脚本名称: test999-hello-world.yaml
  - 新 Script ID: be25dd19-2c6c-4d8c-9c40-3f708f3652a9
  - 目标工程: 6d38fcc6-977b-423f-abc5-6b590e1942e5 (test999)
  - tags: ['debug', 'project:6d38fcc6-977b-423f-abc5-6b590e1942e5']
```

### 使用说明

1. **在前端重新加载脚本列表**
2. **选择 test999 工程的脚本**: `test999-hello-world.yaml`
3. **使用新的 scriptId**: `be25dd19-2c6c-4d8c-9c40-3f708f3652a9`
4. **创建新会话**，系统将正确使用 test999 的模板

**验证成功标志：**
```
日志应显示:
[DatabaseTemplateProvider] hasTemplate called: {
  projectId: '6d38fcc6-977b-423f-abc5-6b590e1942e5',
  filePath: '_system/config/custom/leo/ai_say_v1.md'
}
Result: true ✅
```

---

## 🔧 根本解决方案（需前端配合）

### 1. API 层面：工程过滤

修改脚本查询 API，添加 projectId 过滤：

```typescript
// GET /api/projects/:projectId/scripts
app.get('/api/projects/:projectId/scripts', async (request, reply) => {
  const { projectId } = request.params;
  
  const allScripts = await db.select().from(scripts);
  
  // 过滤属于该工程的脚本
  const projectScripts = allScripts.filter(s => {
    const tags = (s.tags as string[]) || [];
    const projectTag = tags.find(tag => tag.startsWith('project:'));
    const scriptProjectId = projectTag?.replace('project:', '');
    return scriptProjectId === projectId;
  });
  
  return projectScripts;
});
```

### 2. 前端层面：工程隔离

脚本编辑器需要实现：
- 只显示当前工程的脚本
- 脚本列表显示工程信息
- 创建会话时验证 scriptId 归属

### 3. 数据库层面：外键约束（可选）

考虑在 `scripts` 表添加 `projectId` 字段：

```typescript
export const scripts = pgTable('scripts', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  scriptName: varchar('script_name', { length: 255 }).notNull(),
  // ...
});
```

**优势：**
- 数据库层面强制工程隔离
- 可使用外键约束保证数据一致性
- 查询性能更好（索引支持）

**风险：**
- 需要数据迁移
- 涉及现有 tags 机制重构

---

## 📝 诊断脚本清单

| 脚本名称 | 用途 | 结果 |
|---------|------|------|
| `analyze-session-flow.ts` | 分析会话创建流程和工程绑定 | ✅ 确认脚本归属错误 |
| `find-test999-scripts.ts` | 查找 test999 工程的所有脚本 | ✅ 确认无脚本 |
| `copy-script-to-test999.ts` | 复制脚本到 test999 工程 | ✅ 修复成功 |

---

## 🎓 经验教训

### 已记录到记忆系统

**类别**: `common_pitfalls_experience`  
**关键词**: session, projectId, 工程隔离, 脚本绑定, 跨工程错误

**核心要点：**
1. Session 的 projectId 绑定在创建时通过 Script.tags 确定
2. 前端必须实现工程级脚本隔离
3. 脚本编辑器需要显示工程归属信息
4. 数据库诊断脚本是快速定位问题的关键

---

## ✅ 验证清单

- [x] 确认调试流程（创建新会话 vs 复用会话）
- [x] 分析工程隔离问题根源
- [x] 检查会话-工程绑定机制
- [x] 创建临时修复脚本
- [x] 执行脚本并验证成功
- [ ] 用户在前端验证新脚本
- [ ] 前端实现工程隔离机制（长期）

---

**结论**：  
问题根源是前端工程隔离缺失，导致用户在 test999 工程中实际使用了 test project22 的脚本。临时修复已完成，用户需要在前端选择新创建的 `test999-hello-world.yaml` 脚本。长期需要前端实现工程级脚本隔离。
