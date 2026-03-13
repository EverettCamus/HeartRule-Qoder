---
document_id: docs-design-thinking-Memory-Engine-分层记忆架构设计-md
authority: historical
status: archived
version: 0.9.0
last_updated: 2026-02-10
archived_date: 2026-03-12
source: docs
path: design/thinking/Memory-Engine-分层记忆架构设计.md
tags: [historical, reference, archived]
search_priority: medium
---

# Memory Engine - Layered Memory Architecture Design

## Design Goals

Based on the optimization recommendations in [HeartRule-咨询智能实现机制评估与优化建议报告.md](../HeartRule-咨询智能实现机制评估与优化建议报告.md), implement a layered memory architecture (short-term/medium-term/long-term) for the HeartRule project, specifically optimized for psychological counseling scenarios.

## Design Principles

1. **Layered Management**: Short-term memory (Redis), medium-term memory (PostgreSQL), long-term memory (vector retrieval)
2. **Psychological Counseling Scenario Optimization**: Support for emotion tracking, key moment detection, treatment goal management
3. **Extensibility**: Modular design, supporting future extension of other memory types
4. **Backward Compatibility**: Maintain existing conversationHistory functionality in Session model
5. **Performance Optimization**: High-frequency access uses memory/Redis, low-frequency access uses persistent storage

## Current State Analysis

### Existing Infrastructure

1. **Memory Engine Implementation**: `packages/core-engine/src/engines/memory/index.ts` (placeholder)

   ```typescript
   export interface MemoryItem {
     id: string;
     content: string;
     importance: number;
   }

   export class MemoryEngine {
     async store(_item: MemoryItem): Promise<void> {
       /* TODO */
     }
     async retrieve(_query: string): Promise<MemoryItem[]> {
       /* TODO */
     }
   }
   ```

2. **Database Schema**: memories table in `packages/api-server/src/db/schema.ts`

   ```sql
   -- Existing fields:
   -- id, sessionId, content, memoryType, importance, metadata, createdAt, accessedAt, accessCount
   -- Commented field: embedding (vector storage, requires pgvector extension)
   ```

3. **Session Model**: conversationHistory in `packages/core-engine/src/domain/session.ts`
   ```typescript
   public conversationHistory: ConversationEntry[];  // Conversation history
   ```

## Layered Memory Architecture Design

### Three-Layer Memory Model

```
┌─────────────────────────────────────────────────────────────┐
│                    HeartRule Memory System                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Memory Manager (Unified Entry)          │   │
│  │  - retrieve(request) → UnifiedMemoryContext          │   │
│  │  - store(interaction)                                │   │
│  │  - updateMemory(session)                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│         ┌────────────────┼────────────────┐                 │
│         ▼                ▼                ▼                 │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐         │
│  │  Working   │   │  Episodic  │   │  Semantic  │         │
│  │  Memory    │   │  Memory    │   │  Memory    │         │
│  ├────────────┤   ├────────────┤   ├────────────┤         │
│  │  Redis     │   │ PG+Vector  │   │  Postgres  │         │
│  │ In-memory  │   │ Doc+Index  │   │ Structured │         │
│  │  Storage   │   │            │   │  Storage   │         │
│  └────────────┘   └────────────┘   └────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1. Working Memory (Short-term)

**Storage Medium**: Redis (fast access, session-level cache)
**Lifecycle**: Current session duration, can be persisted to medium-term memory after session ends
**Capacity Limit**: Recent N conversation messages or fixed time window

**Data Structure**:

```typescript
interface WorkingMemory {
  // Current session window
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    emotionalState?: EmotionalState;
  }>;

  // Immediate state of current session
  currentContext: {
    activeGoals: string[]; // Current treatment goals being pursued
    recentEmotions: Emotion[]; // Recent emotional states
    pendingActions: Action[]; // Pending actions
    attentionFocus: string; // Current focus of attention
  };

  // Session metadata
  sessionMeta: {
    sessionId: string;
    startTime: number;
    turnCount: number;
    userId: string;
  };
}
```

### 2. Episodic Memory (Medium-term)

**Storage Medium**: PostgreSQL + pgvector (vector retrieval)
**Lifecycle**: All historical sessions of the user
**Retrieval Method**: Keyword matching + vector similarity + time decay weighting

**Data Structure**:

```typescript
interface Episode {
  id: string;
  sessionId: string;
  userId: string;
  timeRange: {
    start: number;
    end: number;
  };

  // Content structure
  summary: string; // LLM-generated summary
  topics: string[]; // Discussed topics
  emotions: EmotionRecord[]; // Emotion change records
  keyEvents: KeyEvent[]; // Key moments (breakthroughs, resistance, emotional fluctuations)
  therapyGoals: string[]; // Treatment goals for this session
  outcomes: string; // Session outcomes

  // Retrieval indices
  embeddings: number[]; // Vector embeddings
  keywords: string[]; // Extracted keywords
}
```

### 3. Semantic Memory (Long-term)

**Storage Medium**: PostgreSQL (structured storage)
**Lifecycle**: User profile, treatment knowledge, relationship patterns
**Update Strategy**: Incremental updates, aggregation based on multi-session data

**Data Structure**:

```typescript
interface UserProfile {
  userId: string;

  // Demographic information
  demographics: {
    age?: number;
    gender?: string;
    background?: string;
  };

  // Psychological profile
  psychologicalProfile: {
    concerns: string[]; // Primary concerns
    diagnoses?: string[]; // Diagnostic information
    treatmentHistory: string[]; // Treatment history
    copingStrategies: string[]; // Coping strategies
    supportSystem: string[]; // Support system
  };

  // Preferences and patterns
  preferences: {
    communicationStyle: string;
    preferredInterventions: string[];
    responsePatterns: Record<string, string>;
  };

  // Important dates and events
  importantDates: Array<{
    date: string;
    description: string;
    significance: 'positive' | 'negative' | 'neutral';
  }>;

  // Risk indicators
  riskIndicators: {
    crisisHistory: CrisisEvent[];
    warningSigns: string[];
    safetyPlan?: string;
  };
}
```

## API Interface Design

### MemoryManager (Unified Entry)

```typescript
export interface MemoryManager {
  // Unified retrieval interface
  retrieve(request: RetrievalRequest): Promise<UnifiedMemoryContext>;

  // Storage interface
  storeInteraction(interaction: MemoryInteraction): Promise<void>;

  // Update user profile
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void>;

  // Detect key moments
  detectKeyEvent(sessionId: string, interaction: Interaction): Promise<KeyEvent | null>;

  // Emotion analysis
  analyzeEmotion(text: string): Promise<EmotionalState>;
}

interface RetrievalRequest {
  sessionId: string;
  userId: string;
  query: string;
  priority?: 'working' | 'episodic' | 'semantic' | 'balanced';
  maxResults?: number;
}

interface UnifiedMemoryContext {
  working: WorkingMemory;
  episodic: Episode[];
  semantic: SemanticMemory;
  emotionalState?: EmotionalState;
  keyEvents?: KeyEvent[];
}
```

### Layered Storage Interface

```typescript
interface MemoryStorage {
  // Short-term storage
  working: {
    save(sessionId: string, memory: WorkingMemory): Promise<void>;
    load(sessionId: string): Promise<WorkingMemory | null>;
    clear(sessionId: string): Promise<void>;
  };

  // Medium-term storage
  episodic: {
    save(episode: Episode): Promise<void>;
    search(query: string, userId: string, limit?: number): Promise<Episode[]>;
    getBySession(sessionId: string): Promise<Episode[]>;
    getByTimeRange(userId: string, start: number, end: number): Promise<Episode[]>;
  };

  // Long-term storage
  semantic: {
    save(profile: UserProfile): Promise<void>;
    load(userId: string): Promise<UserProfile | null>;
    update(userId: string, updates: Partial<UserProfile>): Promise<void>;
  };
}
```

## Psychological Counseling Scenario Special Features

### Emotion Tracking System

```typescript
class EmotionalTrackingSystem {
  // Real-time emotion analysis
  async analyzeEmotion(text: string): Promise<EmotionalState> {
    // Use pre-trained emotion analysis model
    // Returns primary emotion, intensity, valence, arousal
  }

  // Emotion pattern recognition
  async detectPattern(userId: string): Promise<EmotionPattern> {
    // Analyze recent emotion records, identify recurring patterns
  }

  // Crisis signal detection
  async detectCrisisSignals(userId: string, emotion: EmotionalState): Promise<CrisisAlert | null> {
    // Check if matches known dangerous patterns
  }
}
```

### Key Moment Detection

```typescript
class KeyEventDetector {
  // Use LLM to determine if it's a key moment
  async isKeyEvent(
    userMessage: string,
    assistantResponse: string,
    emotionalState: EmotionalState
  ): Promise<boolean> {
    const prompt = `
      Analyze the following psychological counseling dialogue interaction to determine if it constitutes a "key moment":
      
      Client message: ${userMessage}
      Counselor response: ${assistantResponse}
      Emotional state: ${JSON.stringify(emotionalState)}
      
      Key moments include:
      - Emotional breakthrough (sudden emotional release)
      - Cognitive change (insight emergence)
      - Resistance appearance
      - Crisis signals
      - Treatment progress
    `;

    // Call LLM for analysis
    const result = await this.llm.generate(prompt);
    return JSON.parse(result).isKeyEvent;
  }
}
```

## Implementation Roadmap

### Phase 1: Basic Session Memory (2-3 weeks)

- Implement Working Memory (based on Redis)
- Integrate with existing Session model's conversationHistory
- Basic test coverage

### Phase 2: Historical Session Retrieval (3-4 weeks)

- Implement Episodic Memory (PostgreSQL + pgvector)
- Vector similarity retrieval functionality
- Conversation summary generation

### Phase 3: User Profile System (2-3 weeks)

- Implement Semantic Memory (structured database)
- User profile CRUD operations
- Profile update and aggregation logic

### Phase 4: Intelligent Memory Management (4-5 weeks)

- Emotion tracking system
- Key moment detection
- Memory compression and importance scoring

### Phase 5: Adaptive Memory (3-4 weeks)

- Machine learning-driven memory priority adjustment
- Personalized memory retrieval optimization
- Treatment goal tracking

## Technical Dependencies

### Required Dependencies

1. **Redis**: Short-term memory storage
2. **PostgreSQL 16+**: Medium-term and long-term memory storage
3. **pgvector extension**: Vector similarity retrieval
4. **Emotion analysis model**: Optional, can use open-source pre-trained models

### Optional Dependencies

1. **Vector database**: e.g., Pinecone, Weaviate (alternative to pgvector)
2. **GPU acceleration**: Emotion analysis and vector embedding computation
3. **Monitoring system**: Memory usage statistics and performance monitoring

## Integration Points

### Integration with Existing Systems

1. **Session Model**: Maintain conversationHistory as default implementation for short-term memory
2. **ActionContext**: Provide memory context during Action execution
3. **LLM Orchestration Engine**: Memory-augmented generation (RAG mode)
4. **Monitoring Engine**: Memory usage monitoring

### Data Flow

```
User Input → Session → MemoryManager.retrieve() → Enhanced Context → LLM Generation → MemoryManager.store()
```

## Risk Assessment and Mitigation

### Technical Risks

1. **Vector retrieval performance**: Retrieval latency with large volume of historical sessions
   - Mitigation: Index optimization, result caching, paginated queries
2. **Emotion analysis accuracy**: Model may misjudge emotions
   - Mitigation: Multi-model voting, confidence thresholds, manual review mechanism
3. **Data consistency**: Data synchronization between three memory layers
   - Mitigation: Transactional operations, eventual consistency pattern

### Privacy Risks

1. **Sensitive information storage**: Psychological counseling content is highly sensitive
   - Mitigation: Data encryption, access control, anonymization
2. **Long-term memory leakage**: User profiles contain personal information
   - Mitigation: GDPR-compliant design, data minimization principle, periodic cleanup

## Success Metrics

### Functional Metrics

1. Memory retrieval accuracy > 85%
2. Emotion analysis accuracy > 75%
3. Key moment detection recall > 70%

### Performance Metrics

1. Short-term memory read latency < 10ms
2. Medium-term memory retrieval latency < 200ms
3. Memory storage throughput > 1000 ops/sec

### Business Metrics

1. User session engagement improvement > 15%
2. Treatment goal achievement rate improvement > 10%
3. Crisis identification accuracy > 80%

## Next Steps

1. **Detailed Technical Design**: Detailed class diagrams and interface definitions for each module
2. **Database Migration**: Update existing memories table, add necessary indexes
3. **Prototype Development**: Implement Phase 1 basic functionality
4. **Testing Strategy**: Unit tests, integration tests, performance tests
5. **Deployment Plan**: Production environment deployment and monitoring plan

---

**Design Completion Date**: March 1, 2026  
**Design Status**: Draft - Pending Technical Review  
**Estimated Start Date**: March 2, 2026  
**Estimated Completion Date**: April 15, 2026 (Phase 1-3)
