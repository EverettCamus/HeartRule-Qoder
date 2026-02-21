# Story 2.1: Topic配置新增字段使用指南

## 概述

Story 2.1为Topic配置增加了两个新字段，用于定义Topic的执行目标和策略：

- **topic_goal**: Topic要达成的具体目标
- **strategy**: 供TopicPlanner规划时参考的策略要点

## topic_goal字段

### 用途

描述该Topic要达成的具体、可验证的目标。

### 语法

```yaml
topics:
  - topic_id: 'collect_caregiver_info'
    topic_name: '收集抚养者信息'
    topic_goal: '了解来访者童年期主要抚养者及关系模式'
    actions:
      # ... actions列表
```

### 编写建议

1. **具体明确**: 使用动词开头，描述要完成什么
2. **可验证**: 目标应该可以通过对话内容判断是否达成
3. **简洁**: 建议50-100字，最多500字

### 示例

**✅ 好的示例**:

```yaml
topic_goal: "收集来访者童年期主要抚养者及关系模式"
topic_goal: "引导来访者识别出引发焦虑的自动化思维"
topic_goal: "与来访者建立信任关系，营造安全氛围"
```

**❌ 不好的示例**:

```yaml
topic_goal: "抚养者" # 太简略
topic_goal: "这个话题要聊抚养者，还要问关系，记忆也要问..." # 太啰嗦
```

## strategy字段

### 用途

为TopicPlanner提供规划时的策略指导，描述完成目标的方法、优先级、取舍原则等。

### 语法

```yaml
topics:
  - topic_id: 'collect_caregiver_info'
    strategy: |
      1. 优先收集主要抚养者(父母)信息，次要抚养者(祖辈)视时间调整深度
      2. 每位抚养者需收集: 称呼、同住情况、深刻记忆(至少一个具体事件)
      3. 若用户提及多位抚养者，需对每位展开完整提问序列
      4. 时间不足时: 保证主要抚养者完整信息，次要抚养者仅收集称呼和关系
      5. 遇到强烈情绪反应时: 插入ai_say安抚，暂缓深度追问
    actions:
      # ... actions列表
```

### 编写建议

1. **结构化**: 使用编号列表，每条一个策略要点
2. **优先级明确**: 说明什么情况下做什么
3. **条件清晰**: 用"若...则..."、"当...时..."等条件句
4. **可操作**: 策略要具体到Action级别的调整
5. **长度适中**: 建议200-500字，最多2000字

### 策略要素

一个完整的strategy通常包含：

1. **优先级**: 什么最重要，什么次要
2. **必须收集**: 哪些信息是必不可少的
3. **展开条件**: 在什么情况下需要循环/展开Actions
4. **取舍规则**: 时间不足时如何取舍
5. **特殊处理**: 遇到异常情况(如强烈情绪、回避)如何应对

### 示例

**✅ 好的示例**:

```yaml
strategy: |
  1. 先整体询问有哪些抚养者，再逐个深入
  2. 对每位抚养者依次收集: 称呼 → 关系质量 → 同住情况 → 深刻记忆
  3. 主要抚养者(父母)必须完整收集，次要抚养者可简化
  4. 若用户提到3位以上抚养者，优先父母和最常提及的1位
  5. 深刻记忆需引导到具体事件，避免泛泛而谈
  6. 若用户回避某位抚养者，尊重边界，不强求深入
```

**✅ 简洁示例**:

```yaml
strategy: |
  优先收集主诉信息(症状、困扰、持续时间)
  若时间充裕，追问诱发事件和应对方式
  避免过早解释或建议，先收集完整信息
```

**❌ 不好的示例**:

```yaml
strategy: "随便聊聊抚养者" # 太模糊
strategy: "要仔细问，不能遗漏" # 无具体指导
```

## 占位符使用

### 概述

在actions中可以使用占位符`{变量名}`，TopicPlanner会根据上下文动态替换或展开。

### 占位符格式

**语法规则**:

- 使用花括号包裹: `{变量名}`
- 变量名规则: 字母/下划线/中文开头，后接字母/数字/下划线/中文
- 区分大小写

**✅ 合法占位符**:

```yaml
{用户称呼}
{抚养者}
{目标情绪}
{user_name}
{_temp_var}
```

**❌ 非法占位符**:

```yaml
{123}           # 不能以数字开头
{user-name}     # 不能包含连字符
{user name}     # 不能包含空格
```

### 占位符类型

#### 1. 输入占位符

用于构建Prompt，引用已存在的变量。

```yaml
actions:
  - action_type: ai_ask
    action_id: 'ask_relationship'
    config:
      content: '您和{抚养者}的关系怎么样?' # 引用已提取的变量
```

**验证规则**:

- 引用的变量必须在当前作用域可访问(Topic/Phase/Session/Global)
- 未定义变量会生成Warning(不阻断执行)

#### 2. 输出占位符

用于定义提取目标，首次定义变量。

```yaml
actions:
  - action_type: ai_ask
    config:
      output:
        - get: '{抚养者}_关系' # 动态生成变量名
          define: '与该抚养者的关系质量'
```

**验证规则**:

- 输出占位符不要求变量提前定义
- 默认写入当前Topic作用域

#### 3. Action ID占位符

用于生成唯一的Action标识。

```yaml
actions:
  - action_type: ai_ask
    action_id: 'ask_memory_{抚养者}' # 调试日志中显示为 ask_memory_父亲
```

### 变量作用域

占位符解析遵循四层作用域优先级:

1. **Topic层变量** (最高优先级)
2. **Phase层变量**
3. **Session层变量**
4. **Global层变量** (最低优先级)

**示例**:

```yaml
sessions:
  - session:
      declare:
        - var: 咨询师名
          value: '李医生'
      phases:
        - phase:
            declare:
              - var: 阶段目标
                value: '评估'
            topics:
              - topic:
                  declare:
                    - var: 当前焦点
                      value: '抚养者'
                  actions:
                    - action_type: ai_say
                      config:
                        content: '我是{咨询师名}，现在{阶段目标}阶段，聊聊{当前焦点}'
                        # 解析结果: "我是李医生，现在评估阶段，聊聊抚养者"
```

## Schema验证

### 验证时机

1. **脚本上传时**: 验证topic_goal和strategy字段格式
2. **可视化编辑时**: 实时验证字段内容
3. **占位符使用时**: 验证格式和引用有效性

### 验证规则

| 字段       | 必填 | 最大长度 | 验证内容                        |
| ---------- | ---- | -------- | ------------------------------- |
| topic_goal | 否   | 500字符  | 非空字符串                      |
| strategy   | 否   | 2000字符 | 非空字符串，支持多行            |
| 占位符格式 | -    | -        | `{变量名}` 正则匹配             |
| 占位符引用 | -    | -        | 变量是否在作用域内定义(Warning) |

### 错误示例

**Schema错误**:

```yaml
topic_goal: 123 # ❌ 必须是字符串
strategy: null # ❌ 不能为null
```

**占位符格式错误**:

```yaml
content: '您和{123非法}的关系如何?' # ❌ 占位符格式无效
```

**占位符引用警告**:

```yaml
content: '您和{未定义变量}的关系如何?' # ⚠️ Warning: 变量未定义
```

## 最佳实践

### 1. 编写strategy的SMART原则

- **Specific** (具体): 明确说明做什么，不用模糊词汇
- **Measurable** (可衡量): 能判断是否执行了该策略
- **Actionable** (可操作): 能指导TopicPlanner生成具体Actions
- **Relevant** (相关): 与topic_goal直接相关
- **Time-bound** (有时限): 说明优先级和时间分配

### 2. 分层设计

**Session层**: 整体咨询目标和风格

```yaml
session:
  description: 'CBT认知行为疗法，关注想法-情绪-行为链条'
```

**Phase层**: 阶段性目标

```yaml
phase:
  description: '评估阶段，收集基础信息'
```

**Topic层**: 具体对话目标和策略

```yaml
topic:
  topic_goal: '收集抚养者信息'
  strategy: '优先父母，次要祖辈...'
```

### 3. 渐进式detail

从粗到细，先写核心策略，再补充边界情况。

**第一版**:

```yaml
strategy: |
  1. 先问有哪些抚养者
  2. 逐个收集信息
```

**迭代后**:

```yaml
strategy: |
  1. 先整体询问有哪些抚养者(开放式问题)
  2. 对每位抚养者依次收集: 称呼 → 关系 → 同住 → 记忆
  3. 主要抚养者(父母)必须完整，次要抚养者可简化
  4. 若超过3位，优先父母+最常提及的1位
  5. 深刻记忆需具体事件，不接受"关系很好"等泛泛回答
  6. 遇到回避不强求，尊重边界
```

### 4. 测试验证

在调试会话中观察TopicPlanner日志，确认strategy被正确理解。

```
[TopicPlanner] 规划Topic: collect_caregiver_info
[TopicPlanner] 策略: 优先父母，次要祖辈...
[TopicPlanner] 生成Action队列: 5个Actions
```

## 常见问题

### Q: topic_goal和strategy有什么区别？

**A**:

- `topic_goal`: **What** - 要达成什么目标
- `strategy`: **How** - 如何达成目标，包括优先级、条件判断、取舍规则

### Q: 可以不写strategy吗？

**A**: 可以。strategy是可选字段。不写时：

- Story 2.1: TopicPlanner直接使用actions模板
- Story 2.2+: LLM会基于topic_goal和上下文自行规划

### Q: 占位符何时被替换？

**A**:

- Story 2.1: 占位符仅作为"标记"，不做替换
- Story 2.2: TopicPlanner根据上下文动态替换或展开

### Q: strategy可以引用变量吗？

**A**: 可以。strategy是文本字段，可以使用占位符：

```yaml
strategy: |
  根据{用户年龄}调整提问方式:
  - 18岁以下: 使用简单语言
  - 18-60岁: 正常语言
  - 60岁以上: 放慢节奏
```

### Q: 如何调试占位符解析？

**A**:

1. 查看脚本编辑器的Schema验证错误
2. 创建调试会话，查看服务端日志
3. 观察TopicPlanner的规划结果日志

## 参考资料

- 设计文档: `.qoder/quests/story2-1-default-action-template.md`
- 验证脚本: `scripts/sessions/story-2.1-verification-test.yaml`
- PlaceholderValidator: `packages/core-engine/src/adapters/inbound/script-schema/validators/placeholder-validator.ts`
- 架构设计: `docs/design/thinking/HeartRule咨询智能实现机制.md`
