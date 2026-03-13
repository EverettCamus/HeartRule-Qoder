---
document_id: docs-design-session-intelligence-guardian-design-md
authority: domain-expert
status: active
version: 1.0.0
last_updated: 2026-03-12
source: docs
path: design/session-intelligence-guardian-design.md
tags: [ddd, tactical-design, session-management, intelligence]
search_priority: high
---

# Session层智能守护设计文档

**版本**: 1.0  
**最后更新**: 2026年3月11日  
**基于分析**: layer-implementation-guide.md第4节 + 现有Session实现分析  
**设计者**: Atlas (Master Orchestrator)

---

## 1. 设计背景与目标

### 1.1 问题识别

通过对layer-implementation-guide.md和现有Session实现的分析，发现以下设计差距：

**现有Session实现**（已存在）：

- 基础会话生命周期管理（启动、暂停、完成、失败）
- 变量管理（双轨制：扁平Map + 分层VariableStore）
- 执行位置管理（Phase/Topic/Action索引）
- 对话历史记录
- 应用服务接口（初始化和用户输入处理）

**layer-implementation-guide.md中定义的Session层智能功能**（尚未实现）：

- 会谈守护职责（结构完整性、时间策略、主目标进展监控）
- 状态评估框架（评估时间点、评估维度、决策阈值）
- 重规划触发条件（危机情况、重大发现、强烈阻抗、进展不佳）

### 1.2 设计目标

1. **实现智能守护**：在现有Session基础上添加layer-implementation-guide.md中定义的所有智能功能
2. **保持架构一致性**：符合项目现有的DDD和六边形架构模式
3. **确保可扩展性**：支持未来增加更多智能功能和评估维度
4. **提供可测试性**：智能守护逻辑可独立测试，不影响现有功能
5. **最小侵入性**：尽可能减少对现有代码的修改

---

## 2. 架构设计

### 2.1 整体架构

采用**独立的SessionGuardian服务**方案，在职责分离和实现复杂度之间取得最佳平衡。

```
┌─────────────────────────────────────────────────────┐
│                SessionGuardian服务                   │
│  智能守护层，负责Session层的智能评估与决策           │
│  ├─ AssessmentEngine: 状态评估引擎                   │
│  ├─ ReplanningEngine: 重规划决策引擎                 │
│  └─ TimeStrategyEngine: 时间策略引擎                 │
├─────────────────────────────────────────────────────┤
│                现有Session实体                       │
│  基础会话管理（状态、变量、位置、历史）               │
│  保持不变，仅通过事件与Guardian交互                  │
├─────────────────────────────────────────────────────┤
│                SessionApplicationService             │
│  应用服务层，协调Session与Guardian的交互              │
│  在关键时间点触发智能评估，执行重规划决策             │
└─────────────────────────────────────────────────────┘
```

### 2.2 核心设计原则

1. **单一职责原则**：Session负责基础会话管理，Guardian负责智能守护
2. **开闭原则**：智能引擎可扩展，不修改现有核心逻辑
3. **依赖倒置原则**：通过接口抽象，降低组件间耦合
4. **事件驱动**：通过事件进行组件间通信，提高系统响应性

---

## 3. 核心组件设计

### 3.1 SessionGuardian类

```typescript
// 核心职责：智能守护协调者
class SessionGuardian {
  // 依赖的智能引擎
  private assessmentEngine: AssessmentEngine;
  private replanningEngine: ReplanningEngine;
  private timeStrategyEngine: TimeStrategyEngine;

  // 状态记录
  private assessmentHistory: SessionAssessmentResult[] = [];
  private replanningDecisions: ReplanningDecision[] = [];
  private timeAdjustments: TimeAdjustment[] = [];

  // 核心方法
  async assessSession(context: AssessmentContext): Promise<SessionAssessmentResult>;
  async checkReplanningTriggers(context: ReplanningContext): Promise<ReplanningDecision>;
  async executeTimeStrategy(context: TimeStrategyContext): Promise<TimeAdjustment>;
  async monitorStructureIntegrity(context: StructureContext): Promise<StructureCheckResult>;
}
```

### 3.2 AssessmentEngine（状态评估引擎）

**职责**：评估会话的整体进展和质量

**评估维度**（来自layer-implementation-guide.md）：

1. **目标达成度**（权重: 0.4）
   - 核心议题覆盖度
   - 关键信息收集完整性
   - 用户认知/情绪变化
2. **过程质量**（权重: 0.3）
   - 咨询关系建立质量
   - 对话流畅度
   - 专业遵循度
3. **风险管理**（权重: 0.3）
   - 安全风险水平
   - 伦理风险
   - 用户满意度风险

**评估时间点**：

- 会谈开始后10分钟
- 每个Phase结束时
- 会谈结束前15分钟
- 检测到风险时
- 关键里程碑达成时

### 3.3 ReplanningEngine（重规划决策引擎）

**职责**：在检测到问题时调整会话计划

**触发条件**（来自layer-implementation-guide.md）：

1. **危机情况**（优先级: 最高）
   - 条件：检测到自伤、伤害他人等紧急风险
   - 动作：立即转向危机干预协议
2. **重大发现**（优先级: 高）
   - 条件：发现比原计划更核心的问题
   - 动作：重新评估Session目标
   - 升级：需要Consultation层决策
3. **强烈阻抗**（优先级: 中）
   - 条件：用户阻抗持续高水平且影响进展
   - 动作：调整咨询方法或节奏
4. **进展不佳**（优先级: 中）
   - 条件：目标达成度 < 0.3 且时间已过一半
   - 动作：重新规划剩余时间使用

### 3.4 TimeStrategyEngine（时间策略引擎）

**职责**：监控和执行时间策略

**核心功能**：

1. **Phase时间分配监控**
2. **进度提醒与调整**
3. **超时处理机制**
4. **智能时间重分配**

**决策阈值**：

- `replanSession: 0.3` - 目标达成度<30%时考虑重规划
- `extendTime: 0.7` - 进展良好但时间不足时延长时间
- `earlyEnd: 0.9` - 目标达成度>90%时可提前结束

---

## 4. 与现有架构的集成

### 4.1 在SessionApplicationService中的集成

```typescript
class DefaultSessionApplicationService {
  async processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse> {
    // 1. 恢复Session状态
    // 2. 处理用户输入
    // 3. 检查是否需要智能评估

    if (this.shouldTriggerAssessment(session, currentTime)) {
      // 创建Guardian并执行评估
      const guardian = this.sessionGuardianFactory.create(session);
      const assessment = await guardian.assessSession({
        trigger: 'user_input_processed',
        context: { userInput: request.userInput },
      });

      // 根据评估结果调整执行
      if (assessment.requiresReplanning) {
        const decision = await guardian.checkReplanningTriggers({
          assessment: assessment,
        });
        await this.executeReplanning(session, decision);
      }
    }

    // ... 其余处理逻辑
  }
}
```

### 4.2 事件驱动架构

```typescript
// 定义智能守护相关事件
class SessionAssessmentTriggeredEvent {
  constructor(
    public readonly sessionId: string,
    public readonly trigger: string,
    public readonly timestamp: Date
  ) {}
}

class SessionReplanningDecisionEvent {
  constructor(
    public readonly sessionId: string,
    public readonly decision: ReplanningDecision,
    public readonly timestamp: Date
  ) {}
}

// 事件处理器
class SessionIntelligenceEventHandler {
  async handleAssessmentTriggered(event: SessionAssessmentTriggeredEvent): Promise<void> {
    const guardian = this.guardianFactory.create(event.sessionId);
    const assessment = await guardian.assessSession({
      trigger: event.trigger,
      timestamp: event.timestamp,
    });

    // 发布评估完成事件
    this.eventBus.publish(
      new SessionAssessmentCompletedEvent(event.sessionId, assessment, new Date())
    );
  }
}
```

### 4.3 依赖注入配置

```typescript
// 在IoC容器中注册智能守护组件
container.register(SessionGuardianFactory, {
  useFactory: (c) =>
    new SessionGuardianFactory(
      c.resolve(AssessmentEngine,
      c.resolve(ReplanningEngine),
      c.resolve(TimeStrategyEngine)
    ),
});

container.register(AssessmentEngine, { useClass: DefaultAssessmentEngine });
container.register(ReplanningEngine, useClass: DefaultAssessmentEngine });

container.register(Replanning: AssessmentEngine

container.register(ReplanningEngine

container.register(Replanning: AssessmentEngine

container.register(ReplanningEngine, { useClass: DefaultReplanningEngine });

container.register(Replanning: AssessmentEngine

container.register(ReplanningEngine, { useClass: DefaultReplanningEngine });
container.register(TimeStrategyEngine, { useClass: DefaultTimeStrategyEngine });
```

---

## 5. 数据结构设计

### 5.1 核心接口定义

```typescript
// Session评估结果
interface SessionAssessment {
  id: string;
  sessionId: string;
  timestamp: Date;
  trigger: AssessmentTrigger;
  overallScore: number; // 0-1
  dimensionScores: {
    goalAchievement: number;
    processQuality: number;
    riskManagement: number;
  };
  keyFindings: string[];
  recommendations: string[];
  requiresReplanning: boolean;
  replanningPriority?: 'low' | 'medium' | 'high' | 'highest';
}

// 重规划决策
interface ReplanningDecision {
  id: string;
  sessionId: string;
  timestamp: Date;
  trigger: ReplanningTrigger;
  actions: ReplanningAction[];
  priority: 'low | 'medium' | 'high' | 'highest' | 'pending' | 'executing' | 'completed' | 'failed';
}

// 时间调整
interface TimeAdjustment {
  id: string;
  sessionId: string;
  timestamp: Date;
  adjustmentType: 'extend_phase' | 'shorten_phase' | 'reorder_phases' | 'skip_topic';
  target: string; // phaseId或topicId
  value: number | string;
  expectedImpact: string;
  riskLevel: 'low' | 'medium' | 'high';
}
```

### 5.2 数据库Schema扩展

```sql
-- 智能评估记录表
CREATE TABLE session_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_type VARCHAR(50) NOT NULL,
  overall_score DECIMAL(3,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  dimension_scores JSONB NOT NULL,
  key_findings TEXT[],
  recommendations TEXT[],
  requires_replanning BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 重规划决策表
CREATE TABLE replanning_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_id VARCHAR(100) NOT NULL,
  actions JSONB NOT NULL,
  priority VARCHAR(20) NOT NULL,
  escalation_required BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_target VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  execution_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. LLM集成设计

### 6.1 评估提示词模板

`````markdown
# Role定位

你是一个AI心理咨询会话的智能监控专家，负责评估会话的整体进展和质量。

# 分析任务

请从以下维度评估本次会话：

## 1. 目标达成度 (权重: 40%)

- 核心议题覆盖度
- 关键信息收集完整性
- 用户认知/情绪变化

## 2. 过程质量 (权重: 30%)

- 咨询关系建立质量
- 对话流畅度
- 专业遵循度

## 3. 风险管理 (权重: 30%)

- 安全风险水平
- 伦理风险
- 用户满意度风险

# 输出格式

```json
{
  "overallScore": 0.85,
  "dimensionScores": {
    "goal": 0.8,
    "process: {
      "quality: 0.85
    "risk": 0.9
  },
  "keyFindings": ["发现1", "发现2"],
  "recommendations": ["建议1", "建议2"]
}
```

### 6.2 重规划决策提示词

```json

```

# Role定位

你是一个AI:-shell-protocol.h: $(cat <<'EOF'

# Role定位

你是一个AI心理咨询会话的重规划专家，负责在检测到危机情况: 评估触发条件评估: 危机情况评估提示词模板

```markdown
# Role定位

你是一个AI心理咨询会话的重规划专家，负责在检测到问题

# 触发条件评估: 协议
```

### 6.2-protocol.h

```

### 6.2-protocol.md

```

### 6.2: 重规划决策提示词模板

````markdown
# Role定位

你是一个AI心理咨询会话的重规划专家，负责在检测到问题时调整会话计划。

# 触发条件评估

请评估以下触发条件是否满足：

1. 危机情况：检测到自伤、伤害他人等紧急风险
2. 重大发现：发现比原计划更核心的问题
3. 强烈阻抗：用户阻抗持续高水平且影响进展
4. 进展不佳: 目标达成度 < 0.3 且时间已过一半

# 输出格式

```json
{
  "triggerActivated": true,
  "activated
  "activated-protocol.h: ["crisis_situation"],
  "replanningActions": [
    {
      "type": "time_adjustment",
      "adjustment": "extend_phase",
      "phaseId": "assessment",
      "additionalMinutes": 10
    }
  ],
  "priority": "highest"
}
```
````
`````

---

## 7. 实施路线图

### Phase 1: 基础框架（1-2周）

- 创建SessionGuardian类和基础接口
- 实现基础评估逻辑（非LLM版本）
- 集成到SessionApplicationService
- 基础单元测试

### Phase 2: 智能评估（2-3周）

- 实现完整的评估框架
- LLM集成（评估提示词模板）
- 评估调度器（智能时间点判断）
- 数据持久化（评估结果保存）

### Phase 3: 重规划机制（2-3周）

- 实现ReplanningEngine
- 触发条件系统（layer-implementation-guide.md中所有条件）
- 重规划执行逻辑
- 跨层协调机制（与Consultation层）

### Phase 4: 时间策略（1-2周）

- 实现TimeStrategyEngine
- 时间分配算法
- 进度预测功能

### Phase 5: 优化与监控（1-2周）

- 性能优化（缓存、批量处理）
- 监控仪表板
- A/B测试框架
- 反馈循环优化

---

## 8. 关键成功指标

### 技术指标

- **评估延迟**: < 2秒（P95）
- **决策准确率**: > 85%（基于人工评估）
- **系统稳定性**: 99.9%可用性
- **资源使用**: CPU使用率增加 < 10%

### 业务指标

- **会话质量提升**: 用户满意度提升 > 20%
- **目标达成度提升**: 核心目标完成率提升 > 15%
- **风险降低**: 安全事件减少 > 30%
- **时间利用率提升**: 会话时间浪费减少 > 25%

---

## 9. 风险与缓解措施

### 技术风险

1. **LLM响应不稳定**
   - 缓解: 实现重试机制、备用评估逻辑、本地缓存
2. **性能影响**
   - 缓解: 异步评估、批量处理、智能采样（非每次评估都调用LLM）
3. **状态同步问题**
   - 缓解: 事件驱动架构、乐观锁、状态版本控制

### 业务风险

1. **过度干预**
   - 缓解: 可配置的干预阈值、人工审核机制
2. \*\*误判风险
   - 误判风险缓解: 可配置的干预阈值

### 业务风险

1. **过度干预**
   - 缓解: 可配置的干预阈值、人工审核机制
2. **误判风险**
   - 缓解: 多维度交叉验证、置信度评分、人工复核选项
3. **用户接受度**
   - 缓解: 渐进式引入、用户控制选项、透明化决策过程

---

## 10. 附录

### 10.1 相关文档

1. [layer-implementation-guide.md](../architecture/layer-implementation-guide.md) - 原始需求定义
2. [Session领域模型分析报告] - 现有实现分析
3. [Session应用服务分析报告] - 现有架构分析

### 10.2 技术参考

1. **现有Session实体**: `packages/core-engine/src/domain/session.ts`
2. **Session应用服务**: `packages/core-engine/src/application/usecases/session-application-service.ts`
3. **依赖注入容器**: `packages/api-server/src/ioc/container.ts`
4. **数据库Schema**: `packages/api-server/src/db/schema.ts`

### 10.3 决策记录

- **方案选择**: 独立的SessionGuardian服务（方案B）
- **架构模式**: 事件驱动 + 依赖注入
- **集成策略**: 最小侵入性，保持现有Session实体不变
- **实施策略**: 渐进式实施，分阶段交付

---

**文档状态**: ✅ 已完成设计
**下一步**: 创建详细的实施计划（使用writing-plans技能）
