# 003 — 时间管理的实现机制

## 背景

在确定了时间预估策略（[001](./001-topic-time-estimation.md)）和用途（[002](./002-time-application-and-depth.md)）之后，需要确定实现层面的五个问题：脚本如何声明时间、会谈准备时是否用 LLM 评估、时间判断由谁在什么时机执行、深度切换如何让 LLM 调整行为、以及计时/判断/响应/学习的基础机制。

经过了心理咨询、法律顾问、战略咨询、营养咨询四个领域的交叉讨论。

## 决策

### 一、脚本声明

#### 阶段级

```yaml
phases:
  - id: closing
    time:
      planned_duration: 10 # 分钟数
      min_duration: 10 # 至少需要多久
      # ratio: 0.2              # 也支持按比例（占总时长 20%），分钟数优先
```

`planned_duration` 支持分钟数或 `ratio`。两者都有时分钟数优先。不填的阶段由引擎按剩余时间均分。

#### 话题级

```yaml
topics:
  - id: confirm_scope
    time:
      type: rigid # 刚性话题：时间可预估
      estimated_duration: 5

  - id: explore_trauma
    time:
      type: flexible # 弹性话题：时间取决于来访者
      min_duration: 10

  - id: psychoeducation
    # 不声明 time → 默认 flexible, estimatedDuration=5
```

`rigid` 和 `flexible` 的差异：

|                    | rigid      | flexible                 |
| ------------------ | ---------- | ------------------------ |
| 时间预估来源       | 脚本声明值 | 历史学习值 > 默认值      |
| 执行后是否修正预估 | 不修正     | 每次会谈后用实际耗时修正 |

#### 深度预设

```yaml
topics:
  - id: quick_checkin
    depth: quick # 默认就是 quick 版
```

脚本预设的深度在会谈准备时写入议程条目。意识层可在执行中覆盖——预设是起点，不是牢笼。

---

### 二、会谈准备时不使用 LLM 评估时间

议程生成时的时间预估来源只有三个，按优先级取：

1. 脚本声明的 `estimatedDuration`
2. 该来访者×该话题的历史学习值（`TopicDurationRecord.movingAverage`）
3. 系统默认值（刚性 5 分钟，弹性 10 分钟）

**不需要 LLM 参与**。理由：

- 会谈准备是同步阶段，加 LLM 调用延长启动时间
- 没有执行数据时 LLM 的"预估"和默认值没有本质区别
- 真正准的时间来自历史数据，不是 LLM 推理

---

### 三、时间判断的归属：`process_quality` 内置意识

时间节奏不作为独立意识，而是 `process_quality` 内置意识的一个判断维度。`process_quality` 已在 `consciousness-system.md` 中定义为始终运行、每轮评估的轻量意识。

**三层运算**：

| 层           | 频率                  | 做什么                               | 调 LLM？                    |
| ------------ | --------------------- | ------------------------------------ | --------------------------- |
| 计算         | 每轮                  | 话题已用时间、阶段剩余时间、偏差比例 | 不（算术运算）              |
| 判断         | 每轮                  | 偏差超过阈值 → 触发对应级别干预      | 不（规则判断）              |
| 生成干预文本 | 触发时，cooldown≥2 轮 | 生成上下文相关的加速/收束提示词      | 调（复用意识管线 LLM 调用） |

**阈值按领域可配**，放在 `_system/config/custom/{scheme}/` 下：

```yaml
process_quality:
  time:
    topic_pressure_threshold: 1.5 # 实际/预估 > 1.5 → 话题级压力
    stage_pressure_threshold: 0.8 # 阶段剩余/计划 < 0.8 → 阶段级压力
    intervention_cooldown: 2 # 提示词注入至少间隔 2 轮
```

**两级响应对应意识的分级干预**（见 [consciousness-system.md §2.2](../consciousness/consciousness-system.md#22-轻量干预与重量干预)）：

| 压力层级           | 走什么通道                            | 动作                                 |
| ------------------ | ------------------------------------- | ------------------------------------ |
| 话题级（超 50%）   | 轻量干预 → `suggestedIntervention`    | 提示词注入：生成上下文相关的收束指导 |
| 阶段级（剩余不够） | 重量干预 → 直接调用 `IAgendaModifier` | cancel / setDepth / reorder          |

---

### 四、深度切换的三层实现

深度切换通过三个独立的层叠加生效，各管各的，互不冲突：

**参数层（不含 LLM）**：动作执行引擎在创建 Action 时根据当前深度调整 `max_rounds`。quick 缩为标准版的 1/3，deep 扩为 1.5 倍。

**动作层（不含 LLM）**：执行引擎在取下一个动作时检查当前深度：

| 深度     | 对 Think 动作              | 对 Ask/Say 动作               |
| -------- | -------------------------- | ----------------------------- |
| quick    | 跳过（直接标记 completed） | 正常执行（max_rounds 已缩减） |
| standard | 正常执行                   | 正常执行                      |
| deep     | 正常执行                   | 正常执行（max_rounds 已扩充） |

**提示词层（含 LLM）**：在构建 Ask/Say 动作的提示词时，注入深度相关的行为指导。注入文本由模板系统管理，可按领域定制。

两条注入通道：

| 作用范围               | 通道                                                                         | 时机           |
| ---------------------- | ---------------------------------------------------------------------------- | -------------- |
| `all_pending` / `full` | 引擎层：深度写在 `AgendaEntry.depth` → Action 构建时读取并注入               | Action 创建时  |
| `current_remaining`    | 意识反馈通道：`process_quality` → `suggestedIntervention` → 下一轮主线提示词 | 每轮意识分析后 |

---

### 五、计时与学习的基础机制

**计时**：议程执行引擎在每个话题开始时记录时间戳，完成时计算差值，写入 `AgendaEntry.metadata.actualDuration`。

**学习存储**：按来访者 × 话题 × 深度三维存储 `TopicDurationRecord`，记录每次会谈的实际耗时和移动平均。会谈结束时自动更新。

**carryover 收集**：`Agenda.cancel()` 内部在取消原因为 `time_pressure` 时自动将条目信息按 `phaseId` 分组写入 `agenda.metadata.carryover`。同一话题被连续 carryover 两次时紧急度自动提升。

**异常检测**：话题实际耗时显著偏离历史均值时（超出来访者常规波动范围），作为信号上报意识层——来访者状态可能发生变化。

---

## 后果

- `process_quality` 需要扩展时间判断维度和相关配置。
- 深度切换需要 `BaseAction` 在构建时接受深度参数，`max_rounds` 支持动态调整。
- 会谈结束后需要回写 `actualDuration` 的流程。
- `TopicDurationRecord` 需要存储结构（可在 metadata JSONB 中或独立表）。
- 脚本 YAML schema 需要新增 Phase 级 `time` 字段、Topic 级 `time` 字段、Topic 级 `depth` 字段（可选）。
- 不同领域的阈值差异大，走模板覆盖而非代码硬编码。

## 关联

- [001 — 话题时间预估策略](./001-topic-time-estimation.md)
- [002 — 时间预估的用途与深度切换](./002-time-application-and-depth.md)
- `consciousness-system.md` §2.1-2.2 — 意识运行机制、轻量/重量干预
- `topic-queue-implementation.md` §4-5 — 时间管理机制、setDepth
