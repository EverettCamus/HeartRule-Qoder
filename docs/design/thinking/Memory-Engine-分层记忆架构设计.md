# Memory Engine - 分层记忆架构设计

## 设计目标

基于[HeartRule-咨询智能实现机制评估与优化建议报告.md](../HeartRule-咨询智能实现机制评估与优化建议报告.md)中的优化建议，为HeartRule项目实现一个分层记忆架构（短期/中期/长期），特别针对心理咨询场景优化。

## 设计原则

1. **分层管理**：短期记忆（Redis）、中期记忆（PostgreSQL）、长期记忆（向量检索）
2. **心理咨询场景优化**：支持情感追踪、关键时刻检测、治疗目标管理
3. **可扩展性**：模块化设计，支持未来扩展其他记忆类型
4. **向后兼容**：保持现有Session模型中的conversationHistory功能
5. **性能优化**：高频访问使用内存/Redis，低频访问使用持久化存储

## 当前状态分析

### 现有基础设施

1. **记忆引擎实现**：`packages/core-engine/src/engines/memory/index.ts`（占位符）

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

2. **数据库Schema**：`packages/api-server/src/db/schema.ts`中的memories表

   ```sql
   -- 已有字段：
   -- id, sessionId, content, memoryType, importance, metadata, createdAt, accessedAt, accessCount
   -- 注释字段：embedding（向量存储，需要pgvector扩展）
   ```

3. **Session模型**：`packages/core-engine/src/domain/session.ts`中的conversationHistory
   ```typescript
   public conversationHistory: ConversationEntry[];  // 对话历史
   ```

## 分层记忆架构设计

### 三层记忆模型

```
┌─────────────────────────────────────────────────────────────┐
│                    HeartRule Memory System                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Memory Manager (统一入口)                │   │
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
│  │  内存存储   │   │  文档+索引 │   │  结构化存储 │         │
│  └────────────┘   └────────────┘   └────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1. 短期记忆（Working Memory）

**存储介质**：Redis（快速访问，会话级缓存）
**生命周期**：当前会话期间，会话结束后可持久化到中期记忆
**容量限制**：最近N条对话消息或固定时间窗口

**数据结构**：

```typescript
interface WorkingMemory {
  // 当前会话窗口
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    emotionalState?: EmotionalState;
  }>;

  // 当前会话的即时状态
  currentContext: {
    activeGoals: string[]; // 当前追求的治疗目标
    recentEmotions: Emotion[]; // 最近的情绪状态
    pendingActions: Action[]; // 待完成的行动
    attentionFocus: string; // 当前关注点
  };

  // 会话元数据
  sessionMeta: {
    sessionId: string;
    startTime: number;
    turnCount: number;
    userId: string;
  };
}
```

### 2. 中期记忆（Episodic Memory）

**存储介质**：PostgreSQL + pgvector（向量检索）
**生命周期**：用户的所有历史会话
**检索方式**：关键词匹配 + 向量相似度 + 时间衰减加权

**数据结构**：

```typescript
interface Episode {
  id: string;
  sessionId: string;
  userId: string;
  timeRange: {
    start: number;
    end: number;
  };

  // 内容结构
  summary: string; // LLM生成的摘要
  topics: string[]; // 讨论的主题
  emotions: EmotionRecord[]; // 情绪变化记录
  keyEvents: KeyEvent[]; // 关键时刻（突破、抵抗、情绪波动）
  therapyGoals: string[]; // 本会话的治疗目标
  outcomes: string; // 会话结果

  // 检索索引
  embeddings: number[]; // 向量嵌入
  keywords: string[]; // 提取的关键词
}
```

### 3. 长期记忆（Semantic Memory）

**存储介质**：PostgreSQL（结构化存储）
**生命周期**：用户档案、治疗知识、关系模式
**更新策略**：增量更新，基于多会话数据聚合

**数据结构**：

```typescript
interface UserProfile {
  userId: string;

  // 人口学信息
  demographics: {
    age?: number;
    gender?: string;
    background?: string;
  };

  // 心理档案
  psychologicalProfile: {
    concerns: string[]; // 主要关注问题
    diagnoses?: string[]; // 诊断信息
    treatmentHistory: string[]; // 治疗历史
    copingStrategies: string[]; // 应对策略
    supportSystem: string[]; // 支持系统
  };

  // 偏好与模式
  preferences: {
    communicationStyle: string;
    preferredInterventions: string[];
    responsePatterns: Record<string, string>;
  };

  // 重要日期与事件
  importantDates: Array<{
    date: string;
    description: string;
    significance: 'positive' | 'negative' | 'neutral';
  }>;

  // 风险指标
  riskIndicators: {
    crisisHistory: CrisisEvent[];
    warningSigns: string[];
    safetyPlan?: string;
  };
}
```

## API接口设计

### MemoryManager（统一入口）

```typescript
export interface MemoryManager {
  // 统一检索接口
  retrieve(request: RetrievalRequest): Promise<UnifiedMemoryContext>;

  // 存储接口
  storeInteraction(interaction: MemoryInteraction): Promise<void>;

  // 更新用户档案
  updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<void>;

  // 检测关键时刻
  detectKeyEvent(sessionId: string, interaction: Interaction): Promise<KeyEvent | null>;

  // 情绪分析
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

### 分层存储接口

```typescript
interface MemoryStorage {
  // 短期存储
  working: {
    save(sessionId: string, memory: WorkingMemory): Promise<void>;
    load(sessionId: string): Promise<WorkingMemory | null>;
    clear(sessionId: string): Promise<void>;
  };

  // 中期存储
  episodic: {
    save(episode: Episode): Promise<void>;
    search(query: string, userId: string, limit?: number): Promise<Episode[]>;
    getBySession(sessionId: string): Promise<Episode[]>;
    getByTimeRange(userId: string, start: number, end: number): Promise<Episode[]>;
  };

  // 长期存储
  semantic: {
    save(profile: UserProfile): Promise<void>;
    load(userId: string): Promise<UserProfile | null>;
    update(userId: string, updates: Partial<UserProfile>): Promise<void>;
  };
}
```

## 心理咨询场景特殊功能

### 情感追踪系统

```typescript
class EmotionalTrackingSystem {
  // 实时情绪分析
  async analyzeEmotion(text: string): Promise<EmotionalState> {
    // 使用预训练的情感分析模型
    // 返回主要情绪、强度、效价、唤醒度
  }

  // 情绪模式识别
  async detectPattern(userId: string): Promise<EmotionPattern> {
    // 分析最近的情绪记录，识别重复模式
  }

  // 危机信号检测
  async detectCrisisSignals(userId: string, emotion: EmotionalState): Promise<CrisisAlert | null> {
    // 检查是否匹配已知的危险模式
  }
}
```

### 关键时刻检测

```typescript
class KeyEventDetector {
  // 使用LLM判断是否为关键时刻
  async isKeyEvent(
    userMessage: string,
    assistantResponse: string,
    emotionalState: EmotionalState
  ): Promise<boolean> {
    const prompt = `
      分析以下心理咨询对话交互，判断是否构成"关键时刻"：
      
      来访者消息: ${userMessage}
      咨询师回应: ${assistantResponse}
      情绪状态: ${JSON.stringify(emotionalState)}
      
      关键时刻包括：
      - 情绪突破（突然情绪释放）
      - 认知改变（洞察产生）
      - 阻抗出现
      - 危机信号
      - 治疗进展
    `;

    // 调用LLM分析
    const result = await this.llm.generate(prompt);
    return JSON.parse(result).isKeyEvent;
  }
}
```

## 实现路线图

### Phase 1: 基础会话记忆（2-3周）

- 实现Working Memory（基于Redis）
- 与现有Session模型的conversationHistory集成
- 基础测试覆盖

### Phase 2: 历史会话检索（3-4周）

- 实现Episodic Memory（PostgreSQL + pgvector）
- 向量相似度检索功能
- 对话摘要生成

### Phase 3: 用户档案系统（2-3周）

- 实现Semantic Memory（结构化数据库）
- 用户档案CRUD操作
- 档案更新与聚合逻辑

### Phase 4: 智能记忆管理（4-5周）

- 情感追踪系统
- 关键时刻检测
- 记忆压缩与重要性评分

### Phase 5: 自适应记忆（3-4周）

- 机器学习驱动的记忆优先级调整
- 个性化记忆检索优化
- 治疗目标追踪

## 技术依赖

### 必需依赖

1. **Redis**: 短期记忆存储
2. **PostgreSQL 16+**: 中期和长期记忆存储
3. **pgvector扩展**: 向量相似度检索
4. **情感分析模型**: 可选，可使用开源预训练模型

### 可选依赖

1. **向量数据库**: 如Pinecone、Weaviate（替代pgvector）
2. **GPU加速**: 情感分析和向量嵌入计算
3. **监控系统**: 记忆使用统计和性能监控

## 集成点

### 与现有系统集成

1. **Session模型**: 保持conversationHistory作为短期记忆的默认实现
2. **ActionContext**: 在Action执行时提供记忆上下文
3. **LLM编排引擎**: 记忆增强生成（RAG模式）
4. **监控引擎**: 记忆使用情况监控

### 数据流

```
用户输入 → Session → MemoryManager.retrieve() → 增强上下文 → LLM生成 → MemoryManager.store()
```

## 风险评估与缓解

### 技术风险

1. **向量检索性能**: 大量历史会话时检索延迟
   - 缓解：索引优化、结果缓存、分页查询
2. **情感分析准确性**: 模型可能误判情绪
   - 缓解：多模型投票、置信度阈值、人工审核机制
3. **数据一致性**: 三层记忆间的数据同步
   - 缓解：事务性操作、最终一致性模式

### 隐私风险

1. **敏感信息存储**: 心理咨询内容高度敏感
   - 缓解：数据加密、访问控制、匿名化处理
2. **长期记忆泄露**: 用户档案包含个人信息
   - 缓解：GDPR合规设计、数据最小化原则、定期清理

## 成功指标

### 功能性指标

1. 记忆检索准确率 > 85%
2. 情感分析准确率 > 75%
3. 关键时刻检测召回率 > 70%

### 性能指标

1. 短期记忆读取延迟 < 10ms
2. 中期记忆检索延迟 < 200ms
3. 记忆存储吞吐量 > 1000次/秒

### 业务指标

1. 用户会话参与度提升 > 15%
2. 治疗目标达成率提升 > 10%
3. 危机识别准确率 > 80%

## 后续步骤

1. **详细技术设计**: 每个模块的详细类图和接口定义
2. **数据库迁移**: 更新现有memories表，添加必要索引
3. **原型开发**: 实现Phase 1的基础功能
4. **测试策略**: 单元测试、集成测试、性能测试
5. **部署计划**: 生产环境部署和监控方案

---

**设计完成时间**: 2026年3月1日  
**设计状态**: 草案 - 待技术评审  
**预计开始时间**: 2026年3月2日  
**预计完成时间**: 2026年4月15日（Phase 1-3）
