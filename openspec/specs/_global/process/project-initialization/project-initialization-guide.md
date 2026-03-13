# 工程初始化机制使用指南

## 概述

本文档说明如何使用心流引擎的工程初始化机制快速创建带有两层模板结构的新工程。

---

## 一、工程初始化功能

### 1.1 功能说明

当你创建一个新的咨询脚本工程时，系统会自动：

1. **创建两层目录结构**：
   - `_system/config/default/` - 系统默认模板（只读）
   - `_system/config/custom/` - 自定义模板方案（可编辑）

2. **复制系统模板**：
   - 从代码工程 `config/prompts/` 复制最新的系统模板到 `_system/config/default/`
   - 包含：`ai_ask_v1.md`、`ai_say_v1.md` 等核心模板

3. **生成示例脚本**：
   - `scripts/examples/hello-world.yaml` - 简单的欢迎会话示例

4. **创建配置文件**：
   - `project.json` - 工程元数据配置
   - `README.md` - 工程说明文档
   - `.gitignore` - Git 忽略规则

### 1.2 目录结构示例

```
my-project/
├── _system/
│   └── config/
│       ├── default/           # 系统默认层（只读）
│       │   ├── ai_ask_v1.md
│       │   ├── ai_say_v1.md
│       │   └── .readonly       # 只读标记文件
│       └── custom/             # 自定义层（可编辑）
│           └── .gitkeep        # 占位文件
├── scripts/
│   └── examples/
│       └── hello-world.yaml    # 示例脚本
├── project.json                # 工程配置
├── README.md                   # 工程说明
└── .gitignore                  # Git 忽略规则
```

---

## 二、使用方式

### 2.1 通过 API 创建工程

**端点**: `POST /api/projects`

**请求示例**:

```bash
curl -X POST http://localhost:8000/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "CBT抑郁症评估工程",
    "description": "用于CBT抑郁症评估的咨询脚本工程",
    "author": "心理咨询师张三",
    "template": "blank",
    "language": "zh-CN"
  }'
```

**请求参数**:

| 参数          | 类型   | 必填 | 说明                                                  | 默认值   |
| ------------- | ------ | ---- | ----------------------------------------------------- | -------- |
| `projectName` | string | ✅   | 工程名称                                              | -        |
| `description` | string | ❌   | 工程描述                                              | 空字符串 |
| `author`      | string | ✅   | 作者名称                                              | -        |
| `template`    | enum   | ❌   | 模板类型：`blank`、`cbt-assessment`、`cbt-counseling` | `blank`  |
| `language`    | string | ❌   | 语言代码（如 `zh-CN`、`en-US`）                       | `zh-CN`  |
| `domain`      | string | ❌   | 领域标识                                              | -        |
| `scenario`    | string | ❌   | 场景标识                                              | -        |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "id": "uuid-xxxx-xxxx-xxxx",
    "projectName": "CBT抑郁症评估工程",
    "status": "draft",
    "createdAt": "2026-02-01T12:00:00Z"
  }
}
```

### 2.2 通过编辑器创建工程

> ⚠️ **注意**：编辑器UI集成功能尚在规划中（阶段3），当前请使用API方式创建工程。

**临时方案**：

- 使用测试脚本 `test-project-creation-flow.ts` 创建工程
- 或通过 API 直接调用创建接口

---

## 三、工程配置文件说明

### 3.1 project.json

工程元数据配置文件，包含工程的基本信息：

```json
{
  "projectId": "uuid-xxxx-xxxx-xxxx",
  "name": "CBT抑郁症评估工程",
  "version": "1.0.0",
  "description": "",
  "language": "zh-CN",
  "templateVersion": "1.0.0",
  "systemTemplateVersion": "1.2.0",
  "createdAt": "2026-02-01T12:00:00Z",
  "metadata": {
    "author": "心理咨询师张三",
    "organization": "",
    "tags": []
  },
  "dependencies": {
    "@心流引擎/core-engine": "^2.0.0"
  }
}
```

**字段说明**:

| 字段                    | 说明                         |
| ----------------------- | ---------------------------- |
| `projectId`             | 工程唯一标识（UUID）         |
| `name`                  | 工程名称                     |
| `version`               | 工程版本号                   |
| `language`              | 工程语言                     |
| `systemTemplateVersion` | 系统模板版本（来自代码工程） |
| `createdAt`             | 创建时间                     |

### 3.2 .readonly 文件

位于 `_system/config/default/.readonly`，用于标记该目录为只读。

**内容**:

```
# 系统默认模板（Default 层）

此目录包含系统默认模板，请勿直接修改。
如需自定义，请在 custom/ 目录下创建新的模板方案。
```

---

## 四、自定义模板方案

### 4.1 创建自定义方案

假设你想为"CBT抑郁症"创建专用模板方案：

**步骤**:

1. 在 `_system/config/custom/` 下创建新目录：

   ```
   _system/config/custom/cbt_depression/
   ```

2. 从 default 层复制模板作为起点：

   ```bash
   cp _system/config/default/ai_ask_v1.md _system/config/custom/cbt_depression/
   cp _system/config/default/ai_say_v1.md _system/config/custom/cbt_depression/
   ```

3. 编辑模板内容，添加针对抑郁症的特定话术和策略

### 4.2 在脚本中使用自定义方案

在 Session 节点配置 `template_scheme` 字段：

```yaml
session:
  session_id: cbt_depression_session
  session_name: CBT抑郁症评估会话
  template_scheme: custom/cbt_depression # 指定使用自定义方案

  phases:
    - phase_id: assessment
      topics:
        - topic_id: mood_assessment
          actions:
            - action_type: ai_ask
              # 自动使用 _system/config/custom/cbt_depression/ai_ask_v1.md
              content: '请描述你最近两周的情绪状态'
              output:
                - 情绪描述
```

### 4.3 模板查找顺序

引擎按以下顺序查找模板：

1. **Custom 层**：`_system/config/custom/{template_scheme}/{template}.md`
2. **Default 层**（回退）：`_system/config/default/{template}.md`

**示例**：

- 配置：`template_scheme: custom/cbt_depression`
- 查找路径：
  1. `_system/config/custom/cbt_depression/ai_ask_v1.md`（优先）
  2. `_system/config/default/ai_ask_v1.md`（回退）

---

## 五、系统模板内容

### 5.1 ai_ask_v1.md

提问类 Action 的提示词模板，包含：

- **安全边界与伦理规范**：诊断禁止、处方禁止、保证禁止
- **JSON 输出格式**：统一的结构化输出
- **安全风险自查**：safety_risk 字段
- **危机信号检测**：crisis_signal 标记

### 5.2 ai_say_v1.md

讲解类 Action 的提示词模板，包含：

- **安全边界与伦理规范**：同 ai_ask
- **理解度评估**：assessment 字段
- **JSON 输出格式**：统一的结构化输出

### 5.3 模板变量

系统模板支持以下变量占位符：

| 变量       | 说明           | 示例                     |
| ---------- | -------------- | ------------------------ |
| `{{time}}` | 当前时间       | "2026-02-01 12:00"       |
| `{{who}}`  | 咨询师角色名称 | "心理咨询师"             |
| `{{user}}` | 用户名称       | "用户"                   |
| `{{chat}}` | 对话历史       | "用户: ...\n咨询师: ..." |
| `{{task}}` | 当前任务描述   | "评估用户的情绪状态"     |

---

## 六、测试验证

### 6.1 本地测试脚本

使用 `test-project-initializer-local.ts` 验证工程初始化功能：

```bash
cd packages/api-server
npx tsx test-project-initializer-local.ts
```

**测试输出**:

```
=== ProjectInitializer 本地测试 ===

📋 Step 1: 清理测试工作区...
✅ 测试工作区已清理

📋 Step 2: 创建 ProjectInitializer 实例...
✅ ProjectInitializer 实例已创建

📋 Step 3: 执行工程初始化...
✅ 工程初始化成功！
   - 工程路径: C:\CBT\test-workspace\test-project-xxxx
   - 生成的示例脚本数量: 1

📋 Step 4: 验证目录结构...
   ✅ _system/config/default
   ✅ _system/config/custom
   ✅ scripts/examples

📋 Step 5: 验证系统模板复制（T13）...
   ✅ .readonly 标记文件存在
   ✅ ai_ask_v1.md (4.63 KB)
      ✓ 包含安全边界规范
   ✅ ai_say_v1.md (4.52 KB)
      ✓ 包含安全边界规范

=== 测试总结 ===

✅ T12 - ProjectInitializer 实现验证: 通过
✅ T13 - 系统模板复制到 default 层: 通过
✅ 两层目录结构创建: 通过
✅ 配置文件生成: 通过
✅ 示例脚本生成: 通过
```

### 6.2 单元测试

运行单元测试套件：

```bash
cd packages/api-server
npx vitest run src/services/project-initializer.test.ts
```

**测试覆盖**：

- ✅ 15个测试用例全部通过
- ✅ 覆盖 T12、T13 核心功能
- ✅ 验证目录结构、模板复制、配置文件生成

---

## 七、常见问题

### Q1: 如何更新系统模板到最新版本？

**A**: 系统模板在工程创建时从代码工程复制，后续更新需要手动操作：

1. **方案1**：重新创建工程（推荐用于新工程）
2. **方案2**：手动复制新模板到 default 层（需谨慎，可能影响现有脚本）

**未来优化**：

- 计划增加"模板版本管理"功能
- 支持工程级别的模板版本升级

### Q2: 可以直接修改 default 层的模板吗？

**A**: 不可以。default 层标记为只读，原因：

1. 保证系统模板的一致性
2. 避免意外修改影响其他脚本
3. 便于模板版本管理

**正确做法**：

- 在 custom 层创建新的模板方案
- 在脚本中通过 `template_scheme` 引用自定义方案

### Q3: 如何在团队中共享自定义模板方案？

**A**: 当前支持的方式：

1. **Git 版本控制**：将 `_system/config/custom/` 提交到代码库
2. **手动导出/导入**：复制 custom 目录到其他工程

**未来优化**：

- 计划增加"模板市场"功能
- 支持方案的导入/导出/评分机制

### Q4: 工程初始化失败怎么办？

**A**: 检查以下几点：

1. **权限问题**：确保有工作区目录的写权限
2. **系统模板路径**：确认 `config/prompts/` 目录存在
3. **数据库连接**：确保数据库服务正常运行

**查看日志**：

```bash
# 查看详细错误信息
tail -f logs/api-server.log
```

---

## 八、参考文档

- **设计文档**：[template-security-boundary-addition.md](../.qoder/quests/template-security-boundary-addition.md) - 第3.10节
- **使用指南**：[\_system/README.md](../_system/README.md) - 两层模板系统使用说明
- **API文档**：项目知识库 - "工程管理API"
- **核心引擎测试**：[template-resolver.test.ts](../packages/core-engine/test/template-resolver.test.ts)

---

## 九、版本历史

| 版本 | 日期       | 变更内容                         |
| ---- | ---------- | -------------------------------- |
| 1.0  | 2026-02-01 | 初始版本，完成工程初始化机制文档 |
