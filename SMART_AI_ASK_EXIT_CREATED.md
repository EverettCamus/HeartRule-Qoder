# 📦 AI-Ask 退出决策测试项目 - 创建完成

## ✅ 创建成果

你已成功创建 **smart-ai-ask-exit** 项目，包含 5 个完整的退出场景测试。

---

## 📁 文件清单

### 🎯 核心测试脚本（5个）

所有位于: `scripts/sessions/exit-tests/`

```
scenario-1-normal-exit.yaml         ✅ 正常退出 - 信息完整
scenario-2-impedance-exit.yaml      ✅ 阻抗退出 - 用户回避
scenario-3-topic-drift.yaml         ✅ 偏题退出 - 用户离题
scenario-4-max-rounds-safety.yaml   ✅ 最大轮次退出 - 安全网触发
scenario-5-comprehensive.yaml       ✅ 综合条件退出 - 混合评估
```

### 🛠️ 工具脚本

```
scripts/db/import-ai-ask-exit-project.ts    导入脚本到数据库（推荐）
scripts/db/insert-ai-ask-exit-project.sql   SQL 导入脚本（备选）
```

### 📖 文档

```
AI_ASK_EXIT_TEST_GUIDE.md                   完整的测试指南和场景说明
CLAUDE.md                                   项目架构文档（已更新）
docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md  设计文档（参考）
```

---

## 🚀 四步快速启动

### 第1步：导入到数据库

```bash
# 确保 PostgreSQL 运行中
pnpm tsx scripts/db/import-ai-ask-exit-project.ts
```

**预期输出**:

```
🚀 开始导入 AI-Ask 退出决策测试项目...

📦 第一步：创建项目 "smart-ai-ask-exit"
✅ 项目创建成功 (ID: 550e8400-e29b-41d4-a716-446655440000)

📝 第二步：为每个场景创建脚本文件
✅ 场景1：正常退出 - 信息完整
✅ 场景2：阻抗退出 - 用户回避
✅ 场景3：偏题退出 - 用户离题
✅ 场景4：最大轮次退出 - 安全网触发
✅ 场景5：综合条件退出 - 混合评估

📋 第三步：复制提示词模板文件到工程
✅ 模板文件：ai_ask_v1.md
✅ 模板文件：ai_ask_monitor_v1.md
✅ 模板文件：ai_say_v1.md
✅ 模板文件：ai_say_monitor_v1.md

📊 导入完成！

📋 项目摘要：
   项目名称：smart-ai-ask-exit
   项目ID：550e8400-e29b-41d4-a716-446655440000
   脚本数量：5
   模板文件：4
   设计文档：docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md

💡 下一步操作：
   1. 打开编辑器：pnpm dev:editor
   2. 打开API服务：pnpm dev
   3. 在编辑器中加载项目 "smart-ai-ask-exit"
   4. 逐个测试5个场景的退出行为
```

### 第2步：启动开发环境

```bash
# 终端1：API 服务
pnpm dev

# 终端2：脚本编辑器
pnpm dev:editor
```

### 第3步：在编辑器中调试

1. 打开编辑器 → 加载项目
2. 查找项目 **"smart-ai-ask-exit"**
3. 选择其中一个场景加载
4. 执行测试会话，查看 ai_ask 动作的退出行为

### 第4步：验证模板文件

编辑器加载工程后，应该能看到 4 个提示词模板文件已自动复制：

- `ai_ask_v1.md` - AI 提问模板
- `ai_ask_monitor_v1.md` - AI 提问监控模板
- `ai_say_v1.md` - AI 讲说模板
- `ai_say_monitor_v1.md` - AI 讲说监控模板

这些模板支持 {{变量}} 和 {%系统变量%} 的替换，已配置到 Default 层（`_system/config/default/`）。

---

## 🎯 每个场景的核心验证点

### 场景1：正常退出

```
✓ 用户快速提供完整信息
✓ LLM: exit="true", brief="已收集所有关键信息"
✓ 规则: required_variables 全部满足
✓ 轮次: < max_rounds (3-5轮内正常退出)
```

### 场景2：阻抗退出

```
✓ 用户回答简短/模糊/拒绝
✓ LLM assessment: 包含"阻抗程度：高"
✓ 规则: impedance_threshold (60) 被触发
✓ 尽管变量未完整，仍然尊重心理边界而退出
```

### 场景3：偏题退出

```
✓ 用户开始讨论无关话题
✓ LLM assessment: 包含"话题偏离"提示
✓ 规则: topic_drift_threshold (40) 被触发
✓ LLM 首先温和引导，再次偏离则退出
```

### 场景4：最大轮次退出

```
✓ 轮数计数正确推进：0→1→2→3
✓ 第3轮后无条件退出（无视 LLM exit 字段）
✓ 规则: max_rounds=3 安全网生效
✓ 日志: "Max rounds reached. Force exit."
```

### 场景5：综合条件退出

```
✓ LLM 输出格式完整 (assessment + progress markdown)
✓ crisis_detected 仅在明显危机时为 true
✓ 优先级决策: 危机 > 最大轮次 > 变量完整 > 其他
✓ 多条件综合评估逻辑正确执行
```

---

## 📊 YAML Schema 概览

每个场景脚本遵循的结构：

```yaml
metadata:
  name: '场景名称'
  version: '1.0'
  description: '场景说明'
  test_scenario: 'scenario_type'
  created_date: '2026-03-20'
  author: 'Test Suite'

session:
  session_id: 'unique_id'
  session_name: '会话名称'
  phases:
    - phase_id: 'phase_id'
      phase_name: '阶段名称'
      topics:
        - topic_id: 'topic_id'
          topic_name: '话题名称'
          actions:
            - action_type: 'ai_ask' # 核心 action 类型
              action_id: 'unique_action_id'
              config:
                content: 'AI 问题文本'
                output:
                  - get: '变量名'
                    define: '变量定义'
                    require: '关键|重要|补充'

                # 退出条件配置（关键！）
                max_rounds: 5
                required_variables: ['变量1', '变量2']
                understanding_threshold: 70
                impedance_threshold: 40
                topic_drift_threshold: 30

                exit: '退出说明文本'
```

---

## 🔧 故障排除

### 导入失败

**症状**: `pnpm tsx scripts/db/import-ai-ask-exit-project.ts` 报错

**检查清单**:

1. PostgreSQL 是否运行中？
   ```bash
   pnpm db:studio
   ```
2. 数据库连接字符串是否正确？
   ```bash
   echo $DATABASE_URL
   ```
3. 脚本文件是否都存在？
   ```bash
   ls scripts/sessions/exit-tests/scenario-*.yaml
   ```

### 编辑器无法加载项目

**症状**: 编辑器中找不到 "smart-ai-ask-exit"

**解决方案**:

1. 刷新编辑器页面
2. 验证项目已插入数据库：
   ```bash
   pnpm db:studio
   # 查看 projects 表，检查是否存在 smart-ai-ask-exit
   ```
3. 检查 API 服务日志（`pnpm dev` 的输出）

### LLM 响应格式错误

**症状**: LLM 返回的不是预期的 JSON 格式

**可能原因**:

- 模板文件中的提示词不清晰
- LLM 模型能力限制

**调试步骤**:

1. 查看 `debugInfo` 中的 `prompt` 字段，检查发送给 LLM 的具体提示
2. 查看 `response` 字段，看 LLM 的原始输出
3. 在编辑器中修改提示词，重新测试

---

## 💡 高级用法

### 修改场景参数

在编辑器中打开脚本文件，修改 `ai_ask` 的 config：

```yaml
config:
  max_rounds: 3 # 改为 2 以更快触发安全网
  impedance_threshold: 60 # 改为 70 以降低阻抗检测敏感度
  topic_drift_threshold: 40 # 改为 50 以提高话题偏移容忍度
```

### 自定义用户输入测试

1. 启动会话
2. 在"用户输入"字段输入各种回应：
   - ✅ 最优响应：快速、清晰、完整
   - ⚠️ 次优响应：信息不完整、有歧义
   - ❌ 不良响应：回避、离题、简短

### 观察 LLM 调试信息

每轮对话后，查看 `debugInfo` 对象：

```json
{
  "prompt": "完整的系统+用户提示词",
  "response": "LLM 的原始响应",
  "config": {
    "temperature": 0.7,
    "max_tokens": 2000,
    "model": "gpt-4o"
  },
  "timestamp": "2026-03-20T10:30:00Z"
}
```

---

## 📚 参考资源

1. **完整设计文档**: `docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`
2. **项目架构**: 查看更新后的 `CLAUDE.md` 的"设计模式"和"设计哲学"部分
3. **测试指南**: `AI_ASK_EXIT_TEST_GUIDE.md` (这个文件)

---

## 🎓 学习路径

### 初级（理解概念）

1. 阅读 `AI_ASK_EXIT_TEST_GUIDE.md` 的场景说明
2. 在编辑器中加载场景1-5，观察 YAML 结构
3. 执行简单会话，看到 LLM 响应和退出行为

### 中级（深入原理）

1. 阅读完整设计文档第 2-3 节（LLM 输出格式、规则引擎）
2. 修改各场景的阈值参数，测试敏感度
3. 分析 `debugInfo` 中的 prompt，理解如何精确表达退出条件

### 高级（实现集成）

1. 阅读设计文档第 4-6 节（实施优先级、风险缓解）
2. 在 `core-engine/src/engines/exit-decision/` 中查看 ExitDecisionEngine 实现
3. 为 `ai-ask` action 集成完整的退出决策逻辑

---

## ✨ 下一步

完成这个测试项目后：

1. **✅ 验证退出逻辑** → 所有5个场景都能正确退出
2. **✅ 性能基准** → 记录 LLM 响应时间和 token 消耗
3. **✅ 边界情况** → 测试混合场景（如既高阻抗又有危机信号）
4. **✅ 文档完善** → 补充实际测试中发现的最佳实践
5. **✅ 代码集成** → 按设计文档的实施步骤将 ExitDecisionEngine 集成

---

**🎉 准备好调试了！**

```bash
# 一键启动
pnpm tsx scripts/db/import-ai-ask-exit-project.ts && pnpm dev & pnpm dev:editor
```

有任何问题，查看 `AI_ASK_EXIT_TEST_GUIDE.md` 或参考设计文档。
