# ✅ 修复完成：提示词模板文件已包含

## 问题

之前创建的 `smart-ai-ask-exit` 工程缺少提示词模板文件，导致工程无法完整运行 ai_ask 和 ai_say 动作。

## 解决方案

已更新 `scripts/db/import-ai-ask-exit-project.ts` 导入脚本，现在包含 **三步骤工程创建**：

### 第1步：创建项目记录

```
项目ID: 550e8400-e29b-41d4-a716-446655440000
项目名称: smart-ai-ask-exit
```

### 第2步：为每个场景创建会话脚本文件

```
✅ scenario-1-normal-exit.yaml
✅ scenario-2-impedance-exit.yaml
✅ scenario-3-topic-drift.yaml
✅ scenario-4-max-rounds-safety.yaml
✅ scenario-5-comprehensive.yaml
```

### 第3步：复制提示词模板文件到工程（✨ 新增！）

```
✅ ai_ask_v1.md          → _system/config/default/ai_ask_v1.md
✅ ai_ask_monitor_v1.md  → _system/config/default/ai_ask_monitor_v1.md
✅ ai_say_v1.md          → _system/config/default/ai_say_v1.md
✅ ai_say_monitor_v1.md  → _system/config/default/ai_say_monitor_v1.md
```

---

## 模板文件详情

### 1. `ai_ask_v1.md` - AI 提问模板

**用途**: 生成结构化问题，提取用户信息

**核心功能**：

- 支持变量替换：`{{task}}`, `{{current_round}}`, `{{chat}}` 等
- 包含安全边界检查（诊断禁止、处方禁止、保证禁止）
- 危机检测：标记 `crisis_detected` 字段
- 动态话术自适应：根据用户回复长度调整提问方式（开放式/选择式/示例引导式）
- JSON 输出格式包含：
  - `content`: 生成的提问
  - `EXIT`: 退出标志（true/false）
  - `BRIEF`: 内容摘要
  - `metrics`: 用户参与度、情绪强度等
  - `progress_suggestion`: 进度建议
  - `crisis_detected`: 危机检测

### 2. `ai_say_v1.md` - AI 讲说模板

**用途**: 生成讲解或反馈信息

**核心功能**：

- 支持讲解主题的动态调整
- 根据用户理解度判断是否退出
- 包含完整的安全边界检查
- JSON 输出格式包含理解度评估

### 3. `ai_ask_monitor_v1.md` - AI 提问监控模板

**用途**: 异步监控 ai_ask 过程中的隐蔽危机信号

### 4. `ai_say_monitor_v1.md` - AI 讲说监控模板

**用途**: 异步监控 ai_say 过程中的隐蔽危机信号

---

## 验证方法

运行导入脚本后，检查数据库中的 `script_files` 表：

```sql
-- 查看为 smart-ai-ask-exit 工程创建的所有文件
SELECT file_type, file_name, file_path
FROM script_files
WHERE project_id = '550e8400-e29b-41d4-a716-446655440000'::uuid
ORDER BY file_type, file_name;

-- 预期结果：
-- file_type  | file_name            | file_path
-- -----------|----------------------|--------------------------------------------
-- session    | scenario-1-...yaml   | _system/test-scenarios/scenario-1-...yaml
-- session    | scenario-2-...yaml   | _system/test-scenarios/scenario-2-...yaml
-- ...
-- template   | ai_ask_v1.md         | _system/config/default/ai_ask_v1.md
-- template   | ai_say_v1.md         | _system/config/default/ai_say_v1.md
-- template   | ai_ask_monitor_v1.md | _system/config/default/ai_ask_monitor_v1.md
-- template   | ai_say_monitor_v1.md | _system/config/default/ai_say_monitor_v1.md
```

---

## 下一步

现在可以按原流程继续：

```bash
# 1. 导入工程到数据库（包含模板文件）
pnpm tsx scripts/db/import-ai-ask-exit-project.ts

# 2. 启动 API 和编辑器
pnpm dev & pnpm dev:editor

# 3. 在编辑器中加载 "smart-ai-ask-exit" 工程
# 4. 选择场景进行调试

# 验证：在编辑器中执行 ai_ask 动作时，应该能看到：
# ✓ 完整的提示词模板
# ✓ 变量正确替换
# ✓ LLM 返回格式化的 JSON 响应
# ✓ 退出条件正确判断
```

---

## 文件位置

- **导入脚本**: `scripts/db/import-ai-ask-exit-project.ts` （已更新）
- **测试场景**: `scripts/sessions/exit-tests/scenario-*.yaml` （已创建）
- **更新文档**: `SMART_AI_ASK_EXIT_CREATED.md` 第85-100行 （已更新）

---

**完成日期**: 2026-03-20  
**修复内容**: 补齐工程模板文件，完整支持 ai_ask/ai_say 动作执行
