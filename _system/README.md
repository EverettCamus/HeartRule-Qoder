# 两层模板方案机制使用指南

## 概述

HeartRule 引擎支持两层模板方案机制，允许您为不同的咨询场景定制专属的LLM提示词模板。

## 架构设计

```
_system/
└── config/
    ├── default/          # 第1层：系统默认模板（兜底）
    │   ├── ai_ask_v1.md
    │   └── ai_say_v1.md
    └── custom/           # 第2层：自定义方案模板（优先）
        ├── crisis_intervention/
        │   └── ai_ask_v1.md    # 危机干预专用模板
        └── adolescent_friendly/
            ├── ai_ask_v1.md    # 青少年友好版模板
            └── ai_say_v1.md
```

### 两层机制

1. **Default层（系统默认）**
   - 路径：`_system/config/default/`
   - 用途：系统默认模板，适用于通用咨询场景
   - 优先级：低（兜底层）
   - 必须存在，否则系统无法启动

2. **Custom层（自定义方案）**
   - 路径：`_system/config/custom/{scheme_name}/`
   - 用途：针对特定场景定制的模板（如危机干预、青少年咨询等）
   - 优先级：高（优先使用）
   - 可选，不存在时自动回退到default层

### 回退机制

- 如果Session配置了 `template_scheme`，系统优先查找custom层模板
- 如果custom层模板不存在，自动回退到default层
- 如果default层模板也不存在，抛出错误

## 使用方法

### 1. 使用默认模板

在Session YAML中不配置 `template_scheme` 字段：

```yaml
session:
  session_id: "my_session_v1"
  session_name: "我的会谈"
  # 不配置 template_scheme，将使用 default 层模板
  
  phases:
    - phase_id: "phase_1"
      # ...
```

**效果**：所有Action将使用 `_system/config/default/` 下的模板

### 2. 使用自定义模板方案

在Session YAML的 `session` 节点下配置 `template_scheme`：

```yaml
session:
  session_id: "crisis_intervention_v1"
  session_name: "危机干预会谈"
  template_scheme: "crisis_intervention"  # 使用危机干预专用模板
  
  phases:
    - phase_id: "phase_1"
      # ...
```

**效果**：
- 如果存在 `_system/config/custom/crisis_intervention/ai_ask_v1.md`，优先使用
- 如果不存在，回退到 `_system/config/default/ai_ask_v1.md`

## 创建自定义模板方案

### 步骤1：创建方案目录

```bash
mkdir -p _system/config/custom/your_scheme_name
```

### 步骤2：复制默认模板作为起点

```bash
cp _system/config/default/ai_ask_v1.md _system/config/custom/your_scheme_name/
cp _system/config/default/ai_say_v1.md _system/config/custom/your_scheme_name/
```

### 步骤3：根据场景需求修改模板

编辑 `_system/config/custom/your_scheme_name/ai_ask_v1.md`，根据具体场景调整：

- **语气风格**：调整语言风格（温和、专业、活泼等）
- **安全边界**：针对特定场景强调特定的安全规范
- **输出格式**：保持JSON结构一致，但可以调整字段说明
- **注意事项**：增加场景特定的注意事项

### 步骤4：在Session中配置使用

```yaml
session:
  template_scheme: "your_scheme_name"
```

## 示例：危机干预模板方案

项目中已包含一个危机干预模板方案示例：

**路径**：`_system/config/custom/crisis_intervention/ai_ask_v1.md`

**特点**：
- 高度警觉危机信号（自伤、自杀、他伤）
- 强化危机响应原则（冷静、支持、不评判）
- 优先询问安全计划和求助意愿
- 增加"urgent"情绪色调选项

**使用方法**：

```yaml
session:
  session_id: "crisis_test_v1"
  session_name: "危机干预测试"
  template_scheme: "crisis_intervention"
```

## 测试验证

### 运行测试脚本

```bash
cd packages/core-engine
npx tsx test-template-resolver.ts
```

**测试内容**：
- ✅ Default层模板解析
- ✅ Custom层模板解析
- ✅ 回退机制（custom不存在时回退到default）
- ✅ 不存在的方案处理

### 使用测试Session

项目中包含测试Session：`scripts/sessions/test_template_scheme.yaml`

查看该文件了解完整的使用说明和示例。

## 模板文件名规范

- `ai_ask_v1.md`：ai_ask动作的LLM提示词模板
- `ai_say_v1.md`：ai_say动作的LLM提示词模板
- 文件名固定，不可修改

## JSON输出格式

所有咨询动作的LLM输出必须遵循统一的JSON格式：

```json
{
  "content": "AI生成的内容（主要字段）",
  "EXIT": "false",
  "BRIEF": "简短摘要(10字以内)",
  "safety_risk": {
    "detected": false,
    "risk_type": null,
    "confidence": "high",
    "reason": null
  },
  "metadata": {
    "emotional_tone": "supportive",
    "crisis_signal": false
  }
}
```

### 字段说明

- `content`：AI生成的提问或回复内容（将展示给用户）
- `EXIT`：是否满足退出条件（"true"或"false"）
- `BRIEF`：内容摘要，不超过10个字
- `safety_risk`：LLM自我审查的安全风险检测
  - `detected`：是否检测到安全边界违规
  - `risk_type`：风险类型（diagnosis/prescription/guarantee/inappropriate_advice）
  - `confidence`：检测置信度（high/medium/low）
  - `reason`：检测原因说明
- `metadata`：元数据
  - `emotional_tone`：情绪色调（supportive/neutral/concerned/urgent）
  - `crisis_signal`：是否检测到用户的危机信号（true/false）

## 注意事项

1. **模板文件编码**：必须使用UTF-8编码
2. **JSON格式**：所有模板输出必须是有效的JSON，字段不可缺失
3. **向后兼容**：Action代码已兼容新旧两种格式，旧模板仍可正常工作
4. **安全边界**：所有模板必须包含安全边界约束，这是强制要求
5. **Default层必须存在**：系统启动前必须确保default层模板存在

## 常见问题

### Q1: 如何知道当前使用的是哪个模板？

查看Action执行日志，TemplateResolver会输出解析结果：
- "layer: default" 表示使用default层
- "layer: custom, scheme: xxx" 表示使用custom层的xxx方案

### Q2: 可以只定制部分Action的模板吗？

可以。例如，只创建 `custom/my_scheme/ai_ask_v1.md`，不创建 `ai_say_v1.md`。
这样ai_ask使用custom层，ai_say自动回退到default层。

### Q3: 修改模板后需要重启系统吗？

是的。模板在Action初始化时加载，修改后需要重启引擎才能生效。

### Q4: 如何验证模板是否有效？

运行测试脚本：`npx tsx test-template-resolver.ts`

### Q5: 可以创建多少个自定义方案？

没有限制。每个方案都是一个独立的目录，可以根据需要创建任意数量。

## 进阶使用

### 场景化模板方案建议

1. **crisis_intervention**（危机干预）
   - 高度警觉自伤/自杀信号
   - 强化安全响应机制
   - 优先关注求助意愿

2. **adolescent_friendly**（青少年友好）
   - 使用更活泼、亲和的语言
   - 减少专业术语
   - 增加共情和鼓励

3. **cognitive_restructuring**（认知重构）
   - 强调苏格拉底式提问
   - 引导用户识别认知扭曲
   - 注重逻辑推理过程

4. **grief_counseling**（悲伤辅导）
   - 使用温和、支持性语言
   - 尊重悲伤过程
   - 避免催促或建议"放下"

### 模板版本管理

建议通过Git管理模板文件：

```bash
git add _system/config/
git commit -m "feat: add crisis_intervention template scheme"
```

## 相关文档

- 设计文档：`docs/design/template-security-boundary-addition.md`
- 测试Session：`scripts/sessions/test_template_scheme.yaml`
- 测试脚本：`packages/core-engine/test-template-resolver.ts`

---

**版本**：v1.0  
**更新时间**：2026-01-31  
**作者**：HeartRule Team
