# 工程初始化修复 - 部署说明

## 问题描述

用户反馈：在编辑器中点击"New Project"创建新工程时，遇到三个阶段的问题：

1. **示例脚本缺失**：数据库中只有3个默认文件（global.yaml、roles.yaml、skills.yaml），缺少示例脚本（hello-world.yaml）
2. **脚本格式错误（第一次修复）**：生成的示例脚本使用了旧的 `script` 格式，导致验证失败，错误提示"期望值: Session 或 Technique 脚本"
3. **Schema验证错误（第二次修复）**：即使修复为 `sessions` 格式后，仍然提示"无法识别的脚本类型"，因为Schema定义与实际脚本格式不匹配

虽然物理目录已正确创建（包含模板目录和示例脚本），但示例脚本没有导入到数据库，且格式不符合当前Schema要求。

## 解决方案

### 第一阶段：导入示例脚本

#### 后端修改

1. **修改 `ProjectInitializer`** (packages/api-server/src/services/project-initializer.ts)
   - 新增 `GeneratedScript` 接口，记录生成的脚本信息
   - 新增 `ProjectInitResult` 接口，返回初始化结果
   - `generateSampleScripts()` 方法返回生成的脚本列表
   - `initializeProject()` 方法返回 `ProjectInitResult`

2. **修改工程创建API** (packages/api-server/src/routes/projects.ts)
   - 接收 `ProjectInitializer.initializeProject()` 的返回值
   - 遍历 `generatedScripts`，将示例脚本导入到数据库
   - 解析YAML内容为JSON，同时保存yamlContent

### 第二阶段：修复脚本格式

**修改 `ProjectInitializer.generateSampleScripts()`**，将示例脚本格式从旧的 `script:` 改为正确的 `sessions:` 格式：

- 旧格式（错误）：`script: { name: ..., version: ..., phases: [...] }`
- 新格式（正确）：`sessions: [{ session: "...", declare: [...], phases: [...] }]`

### 第三阶段：修复Schema定义

**问题根本原因**：JSON Schema 定义使用的是旧的格式规范，与实际脚本格式不匹配。

#### Schema修复清单

1. **session.schema.json** - Session 顶层结构
   - ❌ 旧格式：`{session: {session_id: "...", phases: [...]}}`（单对象，需要 session_id）
   - ✅ 新格式：`{sessions: [{session: "...", declare: [...], phases: [...]}]}`（数组，使用名称）

2. **phase.schema.json** - Phase 层级结构  
   - ❌ 旧格式：`{phase_id: "...", phase_name: "...", topics: [...]}`（需要 ID，使用 topics）
   - ✅ 新格式：`{phase: "...", description: "...", steps: [...]}`（使用名称，使用 steps）

3. **topic.schema.json** - Topic 层级结构
   - ❌ 旧格式：`{topic_id: "...", topic_name: "...", actions: [...]}`（需要 ID）
   - ✅ 新格式：`{topic: "...", description: "...", actions: [...]}`（使用名称）

4. **action-base.schema.json** - Action 基础结构
   - ❌ 旧格式：`{action_type: "...", action_id: "...", config: {content: "..."}}`（嵌套结构，需要 ID）
   - ✅ 新格式：`{type: "...", content: "...", output: [...]}`（扁平结构，简化字段）

5. **schema-validator.ts** - 脚本类型检测逻辑
   - ❌ 旧逻辑：`'session' in data`（检测单数形式）
   - ✅ 新逻辑：`'sessions' in data`（检测复数形式）

### 修改后的行为

创建新工程时：
1. ✅ 数据库创建3个默认文件记录（global.yaml、roles.yaml、skills.yaml）
2. ✅ 物理目录创建完整的模板目录结构（config/prompts/_system/）
3. ✅ 物理目录生成示例脚本（scripts/examples/hello-world.yaml）
4. ✅ **示例脚本自动导入到数据库**（新增功能）
5. ✅ **示例脚本使用正确的 `sessions` 格式**（格式修复）

结果：用户在编辑器中可以看到4个文件，包括hello-world.yaml示例脚本，且脚本格式正确，可以通过Schema验证。

## 部署步骤

### 1. 配置环境变量（已完成）

`.env` 文件中添加：
```bash
PROJECTS_WORKSPACE=./workspace/projects
```

### 2. 重启API服务器

```bash
# 停止当前服务
Ctrl+C

# 重新启动
pnpm --filter @heartrule/api-server dev
```

### 3. 验证功能

#### 方法1：通过编辑器测试
1. 打开前端编辑器（http://localhost:5173）
2. 点击"New Project"按钮
3. 填写工程名称，点击创建
4. 进入工程编辑器，查看文件列表
5. ✅ 应该看到4个文件，包括 hello-world.yaml

#### 方法2：通过API测试
```bash
# 创建测试工程
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "测试工程",
    "author": "LEO",
    "template": "blank"
  }'

# 查看返回的工程ID，然后查询文件列表
curl http://localhost:8000/api/projects/{project-id}/files
```

#### 方法3：检查数据库
```sql
-- 查询最新工程的文件数量
SELECT p.project_name, COUNT(sf.id) as file_count
FROM projects p
LEFT JOIN script_files sf ON p.id = sf.project_id
WHERE p.created_at > NOW() - INTERVAL '1 hour'
GROUP BY p.id, p.project_name
ORDER BY p.created_at DESC
LIMIT 1;

-- 应该显示 file_count = 4
```

## 技术细节

### 示例脚本正确格式

**Session 脚本** 必须使用 `sessions` 顶层字段（不是 `script`）：

```yaml
sessions:
  - session: 你好世界
    declare:
      - var: 用户名
        value: 用户
      - var: 咨询师名
        value: AI助手
    
    phases:
      - phase: 问候阶段
        steps:
          - topic: 问候
            actions:
              - type: ai_say
                content: |
                  欢迎来到心流咨询，我是你的AI助手。
              
              - type: ai_ask
                content: 你最近过得怎么样？
                output:
                  - 用户状态
```

**Schema 验证逻辑**（参考 [schema-validator.ts](file://packages/core-engine/src/schemas/validators/schema-validator.ts#L85-L99)）：
- Session脚本：检查是否包含 `sessions` 字段
- Technique脚本：检查是否包含 `topic` 字段
- 如果都不包含，返回错误："期望值: Session 或 Technique 脚本"

### 示例脚本导入流程

```typescript
// 1. ProjectInitializer 生成脚本并返回元数据
const initResult = await initializer.initializeProject({...});

// 2. API遍历生成的脚本
for (const script of initResult.generatedScripts) {
  // 3. 解析YAML内容为JSON
  const parsedContent = yaml.load(script.content);
  
  // 4. 插入数据库
  await db.insert(scriptFiles).values({
    projectId: newProject.id,
    fileType: 'session',
    fileName: script.fileName,
    fileContent: parsedContent,    // JSON格式（用于API响应）
    yamlContent: script.content,   // YAML格式（用于编辑器）
  });
}
```

### 支持的工程模板

- **blank** (默认): 生成 hello-world.yaml
- **cbt-assessment**: 生成 cbt-assessment-demo.yaml（CBT评估会谈示例）
- **cbt-counseling**: 待实现

### 文件类型说明

数据库中的文件类型：
- `global`: 全局变量配置
- `roles`: 角色定义
- `skills`: 技能库
- `session`: 会谈脚本（示例脚本属于此类型）

## 回归测试

✅ 已验证场景：
1. 创建空白工程 (template: blank)
   - 数据库包含4个文件
   - 物理目录包含完整模板结构
   - hello-world.yaml 使用正确的 `sessions` 格式
   - hello-world.yaml 可在编辑器中打开并通过Schema验证

2. 物理目录结构正确
   - config/prompts/_system/ 包含4个模板文件
   - config/prompts/custom/ 存在（用于自定义模板）
   - scripts/examples/hello-world.yaml 存在且格式正确

3. 旧工程不受影响
   - 现有工程的文件数量和内容不变

4. Schema验证正确性（新增）
   - ✅ Session脚本检测：正确识别 `sessions` 顶层字段
   - ✅ 格式验证：`phase`/`steps`/`topic`/`type` 等字段均通过验证
   - ✅ 扁平化 Action 结构：直接在 action 对象中使用 `content`/`output` 字段
   - ✅ 完整工作流程：YAML解析 → 类型检测 → Schema验证 全部成功

## 已知问题

无（所有问题已修复）

## 相关问题排查

### 如果仍然出现"期望值: Session 或 Technique 脚本"错误

检查脚本格式是否正确：

1. **Session 脚本** 必须使用 `sessions` 顶层字段（不是 `script`）
2. **Technique 脚本** 必须使用 `topic` 顶层字段
3. 检查YAML缩进是否正确（使用2个空格）
4. 确保字段名称拼写正确（`sessions` 不是 `session`）

参考正确的Session脚本示例：
- [scripts/sessions/test_ai_say_basic.yaml](file://scripts/sessions/test_ai_say_basic.yaml)
- 新生成的 hello-world.yaml

## 后续优化建议

1. **前端增强**：在"New Project"对话框中添加模板选择选项
   - 用户可选择 blank、cbt-assessment、cbt-counseling 等模板
   - 目前前端默认使用 blank 模板

2. **CBT模板完善**：实现 cbt-assessment 和 cbt-counseling 模板的示例脚本

3. **模板管理**：提供API接口，允许用户查看和管理工程模板

---

**修改日期**: 2026-01-31  
**修改人**: AI Assistant  
**版本**: v2.0 (增加Schema修复)  
**关联Story**: Story 1.3 统一模板系统完善  
**修复阶段**:  
- v1.0: 导入示例脚本 + 修复脚本格式  
- v2.0: 修复Schema定义，实现完整验证流程
