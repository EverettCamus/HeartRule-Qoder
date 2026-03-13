# Session Layer Intelligent Guardian Design Document

**Version**: 1.0  
**Last Updated**: March 11, 2026  
**Based on Analysis**: layer-implementation-guide.md Section 4 + Existing Session Implementation Analysis  
**Designer**: Atlas (Master Orchestrator)

---

## 1. Design Background and Objectives

### 1.1 Problem Identification

Through analysis of layer-implementation-guide.md and existing Session implementation, the following design gaps were identified:

**Existing Session Implementation** (already exists):

- Basic session lifecycle management (start, pause, complete, fail)
- Variable management (dual-track: flat Map + layered VariableStore)
- Execution position management (Phase/Topic/Action index)
- Conversation history recording
- Application service interface (initialization and user input processing)

**Session Layer Intelligent Functions Defined in layer-implementation-guide.md** (not yet implemented):

- Session guardian responsibilities (structural integrity, time strategy, primary goal progress monitoring)
- State assessment framework (assessment timing, assessment dimensions, decision thresholds)
- Replanning trigger conditions (crisis situations, major discoveries, strong resistance, poor progress)

### 1.2 Design Objectives

1. **Implement Intelligent Guardian**: Add all intelligent functions defined in layer-implementation-guide.md on top of existing Session
2. **Maintain Architectural Consistency**: Conform to the project's existing DDD and hexagonal architecture patterns
3. **Ensure Extensibility**: Support future addition of more intelligent functions and assessment dimensions
4. **Provide Testability**: Intelligent guardian logic can be tested independently without affecting existing functionality
5. **Minimal Intrusiveness**: Minimize modifications to existing code as much as possible

---

## 2. Architecture Design

### 2.1 Overall Architecture

Adopting the **Independent SessionGuardian Service** approach, achieving optimal balance between responsibility separation and implementation complexity.

```
┌─────────────────────────────────────────────────────┐
│                SessionGuardian Service               │
│  Intelligent guardian layer, responsible for        │
│  Session layer intelligent assessment and decisions │
│  ├─ AssessmentEngine: State Assessment Engine       │
│  ├─ ReplanningEngine: Replanning Decision Engine    │
│  └─ TimeStrategyEngine: Time Strategy Engine        │
├─────────────────────────────────────────────────────┤
│                Existing Session Entity               │
│  Basic session management (state, variables,        │
│  position, history)                                 │
│  Remains unchanged, interacts with Guardian via     │
│  events only                                       │
├─────────────────────────────────────────────────────┤
│                SessionApplicationService             │
│  Application service layer, coordinates Session     │
│  and Guardian interaction                           │
│  Triggers intelligent assessment at key time        │
│  points, executes replanning decisions             │
└─────────────────────────────────────────────────────┘
```

### 2.2 Core Design Principles

1. **Single Responsibility Principle**: Session handles basic session management, Guardian handles intelligent guardianship
2. **Open-Closed Principle**: Intelligent engines are extensible without modifying existing core logic
3. **Dependency Inversion Principle**: Reduce coupling between components through interface abstraction
4. **Event-Driven**: Component communication through events, improving system responsiveness

---

## 3. Core Component Design

### 3.1 SessionGuardian Class

```typescript
// Core Responsibility: Intelligent Guardian Coordinator
class SessionGuardian {
  // Dependent intelligent engines
  private assessmentEngine: AssessmentEngine;
  private replanningEngine: ReplanningEngine;
  private timeStrategyEngine: TimeStrategyEngine;

  // State records
  private assessmentHistory: SessionAssessmentResult[] = [];
  private replanningDecisions: ReplanningDecision[] = [];
  private timeAdjustments: TimeAdjustment[] = [];

  // Core methods
  async assessSession(context: AssessmentContext): Promise<SessionAssessmentResult>;
  async checkReplanningTriggers(context: ReplanningContext): Promise<ReplanningDecision>;
  async executeTimeStrategy(context: TimeStrategyContext): Promise<TimeAdjustment>;
  async monitorStructureIntegrity(context: StructureContext): Promise<StructureCheckResult>;
}
```

### 3.2 AssessmentEngine (State Assessment Engine)

**Responsibility**: Evaluate overall session progress and quality

**Assessment Dimensions** (from layer-implementation-guide.md):

1. **Goal Achievement** (weight: 0.4)
   - Core topic coverage
   - Key information collection completeness
   - User cognitive/emotional changes
2. **Process Quality** (weight: 0.3)
   - Counseling relationship establishment quality
   - Dialogue fluency
   - Professional adherence
3. **Risk Management** (weight: 0.3)
   - Safety risk level
   - Ethical risks
   - User satisfaction risks

**Assessment Timing**:

- 10 minutes after session start
- At the end of each Phase
- 15 minutes before session end
- When risk is detected
- When key milestones are achieved

### 3.3 ReplanningEngine (Replanning Decision Engine)

**Responsibility**: Adjust session plan when problems are detected

**Trigger Conditions** (from layer-implementation-guide.md):

1. **Crisis Situation** (priority: highest)
   - Condition: Detection of self-harm, harm to others, or other emergency risks
   - Action: Immediately switch to crisis intervention protocol
2. **Major Discovery** (priority: high)
   - Condition: Discovery of issues more core than the original plan
   - Action: Re-evaluate Session goals
   - Escalation: Requires Consultation layer decision
3. **Strong Resistance** (priority: medium)
   - Condition: User resistance remains at high level and affects progress
   - Action: Adjust counseling approach or pace
4. **Poor Progress** (priority: medium)
   - Condition: Goal achievement < 0.3 and more than half the time has passed
   - Action: Replan remaining time usage

### 3.4 TimeStrategyEngine (Time Strategy Engine)

**Responsibility**: Monitor and execute time strategies

**Core Functions**:

1. **Phase Time Allocation Monitoring**
2. **Progress Reminders and Adjustments**
3. **Overtime Handling Mechanism**
4. **Intelligent Time Reallocation**

**Decision Thresholds**:

- `replanSession: 0.3` - Consider replanning when goal achievement < 30%
- `extendTime: 0.7` - Extend time when progress is good but time is insufficient
- `earlyEnd: 0.9` - Can end early when goal achievement > 90%

---

## 4. Integration with Existing Architecture

### 4.1 Integration in SessionApplicationService

```typescript
class DefaultSessionApplicationService {
  async processUserInput(request: ProcessUserInputRequest): Promise<SessionExecutionResponse> {
    // 1. Restore Session state
    // 2. Process user input
    // 3. Check if intelligent assessment is needed

    if (this.shouldTriggerAssessment(session, currentTime)) {
      // Create Guardian and execute assessment
      const guardian = this.sessionGuardianFactory.create(session);
      const assessment = await guardian.assessSession({
        trigger: 'user_input_processed',
        context: { userInput: request.userInput },
      });

      // Adjust execution based on assessment results
      if (assessment.requiresReplanning) {
        const decision = await guardian.checkReplanningTriggers({
          assessment: assessment,
        });
        await this.executeReplanning(session, decision);
      }
    }

    // ... remaining processing logic
  }
}
```

### 4.2 Event-Driven Architecture

```typescript
// Define intelligent guardian related events
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

// Event handler
class SessionIntelligenceEventHandler {
  async handleAssessmentTriggered(event: SessionAssessmentTriggeredEvent): Promise<void> {
    const guardian = this.guardianFactory.create(event.sessionId);
    const assessment = await guardian.assessSession({
      trigger: event.trigger,
      timestamp: event.timestamp,
    });

    // Publish assessment completed event
    this.eventBus.publish(
      new SessionAssessmentCompletedEvent(event.sessionId, assessment, new Date())
    );
  }
}
```

### 4.3 Dependency Injection Configuration

```typescript
// Register intelligent guardian components in IoC container
container.register(SessionGuardianFactory, {
  useFactory: (c) =>
    new SessionGuardianFactory(
      c.resolve(AssessmentEngine),
      c.resolve(ReplanningEngine),
      c.resolve(TimeStrategyEngine)
    ),
});

container.register(AssessmentEngine, { useClass: DefaultAssessmentEngine });
container.register(ReplanningEngine, { useClass: DefaultReplanningEngine });
container.register(TimeStrategyEngine, { useClass: DefaultTimeStrategyEngine });
```

---

## 5. Data Structure Design

### 5.1 Core Interface Definitions

```typescript
// Session assessment result
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

// Replanning decision
interface ReplanningDecision {
  id: string;
  sessionId: string;
  timestamp: Date;
  trigger: ReplanningTrigger;
  actions: ReplanningAction[];
  priority: 'low' | 'medium' | 'high' | 'highest';
  escalationRequired: boolean;
  escalationTarget?: 'Consultation Layer';
  status: 'pending' | 'executing' | 'completed' | 'failed';
}

// Time adjustment
interface TimeAdjustment {
  id: string;
  sessionId: string;
  timestamp: Date;
  adjustmentType: 'extend_phase' | 'shorten_phase' | 'reorder_phases' | 'skip_topic';
  target: string; // phaseId or topicId
  value: number | string;
  expectedImpact: string;
  riskLevel: 'low' | 'medium' | 'high';
}
```

### 5.2 Database Schema Extension

```sql
-- Intelligent assessment records table
CREATE TABLE session_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_type VARCHAR(50) NOT NULL,
  overall_score DECIMAL(3,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  dimension_scores JSONB NOT NULL,
  key_findings TEXT[],
  recommendations TEXT[],
  requires_replanning BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replanning decisions table
CREATE TABLE replanning_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger_id VARCHAR(100) NOT NULL,
  actions JSONB NOT NULL,
  priority VARCHAR(20) NOT NULL,
  escalation_required BOOLEAN NOT NULL DEFAULT false,
  escalation_target VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  execution_result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. LLM Integration Design

### 6.1 Assessment Prompt Template

````markdown
# Role Definition

You are an intelligent monitoring expert for AI psychological counseling sessions, responsible for evaluating the overall progress and quality of sessions.

# Analysis Task

Please evaluate this session from the following dimensions:

## 1. Goal Achievement (weight: 40%)

- Core topic coverage
- Key information collection completeness
- User cognitive/emotional changes

## 2. Process Quality (weight: 30%)

- Counseling relationship establishment quality
- Dialogue fluency
- Professional adherence

## 3. Risk Management (weight: 30%)

- Safety risk level
- Ethical risks
- User satisfaction risks

# Output Format

```json
{
  "overallScore": 0.85,
  "dimensionScores": {
    "goalAchievement": 0.8,
    "processQuality": 0.85,
    "riskManagement": 0.9
  },
  "keyFindings": ["Finding 1", "Finding 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "requiresReplanning": false
}
```
````

### 6.2 Replanning Decision Prompt

````markdown
# Role Definition

You are a replanning expert for AI psychological counseling sessions, responsible for adjusting session plans when problems are detected.

# Trigger Condition Evaluation

Please evaluate whether the following trigger conditions are met:

1. Crisis Situation: Detection of self-harm, harm to others, or other emergency risks
2. Major Discovery: Discovery of issues more core than the original plan
3. Strong Resistance: User resistance remains at high level and affects progress
4. Poor Progress: Goal achievement < 0.3 and more than half the time has passed

# Output Format

```json
{
  "triggerActivated": true,
  "activatedTriggers": ["crisis_situation"],
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

```

---

## 7. Implementation Roadmap

### Phase 1: Basic Framework (1-2 weeks)
- Create SessionGuardian class and basic interfaces
- Implement basic assessment logic (non-LLM version)
- Integrate into SessionApplicationService
- Basic unit tests

### Phase 2: Intelligent Assessment (2-3 weeks)
- Implement complete assessment framework
- LLM integration (assessment prompt templates)
- Assessment scheduler (intelligent timing judgment)
- Data persistence (assessment result storage)

### Phase 3: Replanning Mechanism (2-3 weeks)
- Implement ReplanningEngine
- Trigger condition system (all conditions from layer-implementation-guide.md)
- Replanning execution logic
- Cross-layer coordination mechanism (with Consultation layer)

### Phase 4: Time Strategy (1-2 weeks)
- Implement TimeStrategyEngine
- Time allocation algorithm
- Progress prediction functionality

### Phase 5: Optimization and Monitoring (1-2 weeks)
- Performance optimization (caching, batch processing)
- Monitoring dashboard
- A/B testing framework
- Feedback loop optimization

---

## 8. Key Success Indicators

### Technical Indicators
- **Assessment Latency**: < 2 seconds (P95)
- **Decision Accuracy**: > 85% (based on manual evaluation)
- **System Stability**: 99.9% availability
- **Resource Usage**: CPU usage increase < 10%

### Business Indicators
- **Session Quality Improvement**: User satisfaction increase > 20%
- **Goal Achievement Improvement**: Core goal completion rate increase > 15%
- **Risk Reduction**: Safety incidents decrease > 30%
- **Time Utilization Improvement**: Session time waste reduction > 25%

---

## 9. Risks and Mitigation Measures

### Technical Risks
1. **LLM Response Instability**
   - Mitigation: Implement retry mechanism, fallback assessment logic, local caching
2. **Performance Impact**
   - Mitigation: Asynchronous assessment, batch processing, intelligent sampling (not every assessment calls LLM)
3. **State Synchronization Issues**
   - Mitigation: Event-driven architecture, optimistic locking, state versioning

### Business Risks
1. **Over-Intervention**
   - Mitigation: Configurable intervention thresholds, manual review mechanism
2. **Misjudgment Risk**
   - Mitigation: Multi-dimensional cross-validation, confidence scoring, manual review option
3. **User Acceptance**
   - Mitigation: Progressive introduction, user control options, transparent decision process

---

## 10. Appendix

### 10.1 Related Documents
1. [layer-implementation-guide.md](../layer-implementation-guide.md) - Original requirement definition
2. [Session Domain Model Analysis Report] - Existing implementation analysis
3. [Session Application Service Analysis Report] - Existing architecture analysis

### 10.2 Technical References
1. **Existing Session Entity**: `packages/core-engine/src/domain/session.ts`
2. **Session Application Service**: `packages/core-engine/src/application/usecases/session-application-service.ts`
3. **Dependency Injection Container**: `packages/api-server/src/ioc/container.ts`
4. **Database Schema**: `packages/api-server/src/db/schema.ts`

### 10.3 Decision Records
- **Solution Selection**: Independent SessionGuardian service (Option B)
- **Architecture Pattern**: Event-driven + Dependency injection
- **Integration Strategy**: Minimal intrusiveness, keep existing Session entity unchanged
- **Implementation Strategy**: Progressive implementation, phased delivery

---

**Document Status**: ✅ Design Completed
**Next Step**: Create detailed implementation plan (using writing-plans skill)
```
