# 会话管理API

<cite>
**本文档引用的文件**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts)
- [packages/api-server/src/db/schema.ts](file://packages/api-server/src/db/schema.ts)
- [packages/api-server/src/utils/error-handler.ts](file://packages/api-server/src/utils/error-handler.ts)
- [packages/shared-types/src/domain/session.ts](file://packages/shared-types/src/domain/session.ts)
- [packages/shared-types/src/domain/message.ts](file://packages/shared-types/src/domain/message.ts)
- [packages/shared-types/src/domain/variable.ts](file://packages/shared-types/src/domain/variable.ts)
- [packages/shared-types/src/api/responses.ts](file://packages/shared-types/src/api/responses.ts)
- [packages/shared-types/src/enums.ts](file://packages/shared-types/src/enums.ts)
- [packages/core-engine/src/engines/script-execution/script-executor.ts](file://packages/core-engine/src/engines/script-execution/script-executor.ts)
</cite>

## 更新摘要
**变更内容**
- 更新会话管理器重大重构部分，包括新的数据加载方法
- 新增分层变量存储结构和回合数管理功能
- 增强执行状态恢复机制的详细说明
- 更新API响应结构，包含新的variableStore字段
- 新增全局变量加载和管理功能

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)

## 简介

会话管理API是HeartRule心理咨询系统的核心组件，负责管理基于YAML脚本的咨询会话生命周期。该API提供了完整的会话管理功能，包括会话创建、状态跟踪、消息交互和变量管理。

系统采用分层架构设计：
- **路由层**：Fastify路由定义和请求验证
- **服务层**：会话管理器封装业务逻辑
- **数据层**：Drizzle ORM数据库操作
- **共享层**：类型定义和错误处理规范

**更新** 会话管理器经过重大重构，引入了新的数据加载方法、分层变量存储结构和增强的执行状态管理功能。

## 项目结构

会话管理API位于`packages/api-server`包中，主要包含以下关键文件：

```mermaid
graph TB
subgraph "API服务器"
Routes[routes/sessions.ts<br/>路由定义]
Services[services/session-manager.ts<br/>会话管理器]
Utils[utils/error-handler.ts<br/>错误处理]
DB[db/schema.ts<br/>数据库模式]
end
subgraph "共享类型"
Domain[domain/*.ts<br/>领域模型]
Enums[enums.ts<br/>枚举定义]
Responses[api/responses.ts<br/>响应模型]
end
subgraph "核心引擎"
Engine[engines/script-execution/script-executor.ts<br/>脚本执行器]
end
Routes --> Services
Services --> DB
Services --> Engine
Services --> Utils
Routes --> Domain
Services --> Domain
Domain --> Enums
Domain --> Responses
```

**图表来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L1-L613)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L1-L694)
- [packages/api-server/src/db/schema.ts](file://packages/api-server/src/db/schema.ts#L1-L219)

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L1-L613)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L1-L694)

## 核心组件

### 会话管理器 (SessionManager)

会话管理器是API的核心业务逻辑组件，负责：
- 会话初始化和状态管理
- 用户输入处理和脚本执行
- 消息持久化和变量跟踪
- 错误处理和状态恢复

**更新** 会话管理器经过重大重构，引入了新的数据加载方法和增强的状态管理功能：

```mermaid
classDiagram
class SessionManager {
+scriptExecutor : ScriptExecutor
+loadSessionById(sessionId) Promise~SessionData~
+loadScriptById(scriptId) Promise~ScriptData~
+loadConversationHistory(sessionId) Promise~any[]~
+loadGlobalVariables(scriptName) Promise~Record~string, any~~
+createInitialExecutionState(globalVars, sessionVars, history) ExecutionState
+restoreExecutionState(session, globalVars, history) ExecutionState
+executeScript(script, sessionId, state, userInput) Promise~ExecutionState~
+saveNewAIMessages(sessionId, state, prevLen) Promise~void~
+saveUserMessage(sessionId, userInput) Promise~void~
+saveVariableSnapshots(sessionId, oldVars, newVars) Promise~void~
+updateSessionState(sessionId, state, globalVars) Promise~void~
+buildSessionResponse(state, session, globalVars, includeVarStore) SessionResponse
+buildErrorResponse(error, session, script, sessionId) SessionResponse
-private flattenVariableStore(variableStore, position) Object
-private inferValueType(value) string
-private buildVariableSnapshots(sessionId, oldVars, newVars) NewVariable[]
}
class ScriptExecutor {
+executeSession(scriptContent, sessionId, executionState, userInput) Promise~ExecutionState~
+createInitialState() ExecutionState
+deserializeActionState(actionState) BaseAction
+serializeActionState(action) any
-executePhase(phase, sessionId, executionState, userInput) Promise~void~
-executeTopic(topic, phaseId, sessionId, executionState, userInput) Promise~void~
-executeAction(action, phaseId, topicId, sessionId, executionState, userInput) Promise~ActionResult~
}
class ExecutionState {
+status : ExecutionStatus
+currentPhaseIdx : number
+currentTopicIdx : number
+currentActionIdx : number
+variables : Record~string, any~
+variableStore : VariableStore
+conversationHistory : Array
+metadata : Record~string, any~
+lastAiMessage : string
+currentPhaseId : string
+currentTopicId : string
+currentActionId : string
+currentActionType : string
+lastLLMDebugInfo : LLMDebugInfo
}
SessionManager --> ScriptExecutor : "使用"
ScriptExecutor --> ExecutionState : "返回"
```

**图表来源**
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L72-L694)
- [packages/core-engine/src/engines/script-execution/script-executor.ts](file://packages/core-engine/src/engines/script-execution/script-executor.ts#L87-L895)

### 数据库架构

系统使用PostgreSQL作为数据存储，采用JSONB字段存储复杂数据结构：

```mermaid
erDiagram
SESSIONS {
uuid id PK
string user_id
uuid script_id
enum status
enum execution_status
jsonb position
jsonb variables
jsonb metadata
timestamp created_at
timestamp updated_at
timestamp completed_at
}
MESSAGES {
uuid id PK
uuid session_id FK
enum role
text content
string action_id
jsonb metadata
timestamp timestamp
}
VARIABLES {
uuid id PK
uuid session_id FK
string variable_name
jsonb value
enum scope
string value_type
string source
timestamp created_at
timestamp updated_at
}
SCRIPTS {
uuid id PK
string script_name UK
enum script_type
text script_content
jsonb parsed_content
string version
enum status
string author
jsonb tags
timestamp created_at
timestamp updated_at
}
SESSIONS ||--o{ MESSAGES : "包含"
SESSIONS ||--o{ VARIABLES : "跟踪"
SCRIPTS ||--|| SESSIONS : "关联"
```

**图表来源**
- [packages/api-server/src/db/schema.ts](file://packages/api-server/src/db/schema.ts#L22-L176)

**章节来源**
- [packages/api-server/src/db/schema.ts](file://packages/api-server/src/db/schema.ts#L1-L219)

## 架构概览

会话管理API采用RESTful架构设计，遵循HTTP标准和JSON响应格式：

```mermaid
sequenceDiagram
participant Client as 客户端
participant API as API服务器
participant Manager as 会话管理器
participant Engine as 脚本执行器
participant DB as 数据库
Client->>API : POST /api/sessions
API->>DB : 验证脚本存在性
API->>DB : 创建会话记录
API->>Manager : initializeSession(sessionId)
Manager->>DB : loadSessionById()
Manager->>DB : loadScriptById()
Manager->>DB : loadGlobalVariables()
Manager->>DB : loadConversationHistory()
Manager->>Engine : executeSession(initial)
Engine->>DB : 保存AI消息
Manager->>DB : 更新会话状态
API-->>Client : 会话创建响应
Client->>API : POST /api/sessions/ : id/messages
API->>DB : 验证会话存在性
API->>Manager : processUserInput(sessionId, content)
Manager->>DB : loadSessionById()
Manager->>DB : loadScriptById()
Manager->>DB : loadGlobalVariables()
Manager->>DB : loadConversationHistory()
Manager->>Engine : executeSession(userInput)
Engine->>DB : 保存用户消息
Engine->>DB : 保存AI消息
Manager->>DB : 更新会话状态
API-->>Client : 聊天响应
```

**图表来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L14-L148)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L598-L692)

## 详细组件分析

### 1. 创建会话 (POST /api/sessions)

#### 请求规范
- **方法**: POST
- **路径**: `/api/sessions`
- **请求头**: `Content-Type: application/json`
- **请求体**:
  ```json
  {
    "userId": "string",
    "scriptId": "uuid",
    "initialVariables": {}
  }
  ```

#### 响应规范
- **成功响应** (200):
  ```json
  {
    "sessionId": "uuid",
    "status": "string",
    "createdAt": "string",
    "aiMessage": "string",
    "executionStatus": "string",
    "position": {
      "phaseIndex": 0,
      "phaseId": "string",
      "topicIndex": 0,
      "topicId": "string",
      "actionIndex": 0,
      "actionId": "string",
      "actionType": "string"
    },
    "variables": {},
    "globalVariables": {},
    "variableStore": {
      "global": {},
      "session": {},
      "phase": {},
      "topic": {}
    },
    "debugInfo": {}
  }
  ```

- **错误响应** (404/500):
  ```json
  {
    "success": false,
    "error": {
      "code": "SCRIPT_NOT_FOUND",
      "type": "configuration",
      "message": "Script not found",
      "details": "错误详情",
      "context": {
        "scriptId": "uuid",
        "scriptName": "string",
        "timestamp": "string"
      },
      "recovery": {
        "canRetry": false,
        "retryAction": "string",
        "suggestion": "string"
      }
    }
  }
  ```

#### 处理流程
```mermaid
flowchart TD
Start([接收创建请求]) --> Validate["验证请求参数"]
Validate --> ScriptCheck{"脚本存在?"}
ScriptCheck --> |否| NotFound["返回404错误"]
ScriptCheck --> |是| CreateSession["创建会话记录"]
CreateSession --> InitSession["初始化会话状态"]
InitSession --> LoadGlobalVars["加载全局变量"]
LoadGlobalVars --> LoadHistory["加载对话历史"]
LoadHistory --> CreateState["创建初始执行状态"]
CreateState --> ExecuteScript["执行脚本获取AI消息"]
ExecuteScript --> SaveMessages["保存AI消息到数据库"]
SaveMessages --> SaveSnapshots["保存变量快照"]
SaveSnapshots --> UpdateSession["更新会话状态"]
UpdateSession --> BuildResponse["构建响应"]
BuildResponse --> Success["返回成功响应"]
NotFound --> End([结束])
Success --> End
```

**图表来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L67-L148)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L598-L634)

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L14-L148)
- [packages/shared-types/src/api/responses.ts](file://packages/shared-types/src/api/responses.ts#L113-L129)

### 2. 获取会话详情 (GET /api/sessions/:id)

#### 请求规范
- **方法**: GET
- **路径**: `/api/sessions/:id`
- **路径参数**: `id` (UUID)
- **响应**: 完整会话信息，包含脚本解析内容

#### 响应结构
```json
{
  "sessionId": "uuid",
  "userId": "string",
  "scriptId": "uuid",
  "status": "active",
  "executionStatus": "running",
  "position": {
    "phaseIndex": 0,
    "phaseId": "phase_0",
    "topicIndex": 0,
    "topicId": "topic_0",
    "actionIndex": 0,
    "actionId": "action_0",
    "actionType": "string",
    "currentRound": 0,
    "maxRounds": 0
  },
  "variables": {},
  "metadata": {
    "script": {
      "session": {
        "session_id": "string",
        "session_name": "string",
        "phases": []
      }
    },
    "globalVariables": {},
    "variableStore": {
      "global": {},
      "session": {},
      "phase": {},
      "topic": {}
    }
  },
  "createdAt": "string",
  "updatedAt": "string"
}
```

#### 处理逻辑
会话详情接口会将数据库中的位置索引转换为包含ID字段的完整位置信息，便于前端导航树构建。**更新** 现在包含回合数信息和分层变量存储结构。

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L150-L275)
- [packages/shared-types/src/domain/session.ts](file://packages/shared-types/src/domain/session.ts#L13-L52)

### 3. 获取消息历史 (GET /api/sessions/:id/messages)

#### 请求规范
- **方法**: GET
- **路径**: `/api/sessions/:id/messages`
- **路径参数**: `id` (UUID)

#### 响应结构
```json
{
  "success": true,
  "data": [
    {
      "messageId": "uuid",
      "role": "ai",  // assistant -> ai
      "content": "string",
      "timestamp": "string",
      "actionId": "string",
      "metadata": {}
    }
  ]
}
```

#### 数据转换
系统会将数据库中的`assistant`角色转换为前端期望的`ai`角色，并标准化时间戳格式。

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L277-L346)
- [packages/shared-types/src/domain/message.ts](file://packages/shared-types/src/domain/message.ts#L8-L29)

### 4. 发送消息 (POST /api/sessions/:id/messages)

#### 请求规范
- **方法**: POST
- **路径**: `/api/sessions/:id/messages`
- **请求体**:
  ```json
  {
    "content": "string"
  }
  ```

#### 响应结构
```json
{
  "aiMessage": "string",
  "sessionStatus": "string",
  "executionStatus": "string",
  "variables": {},
  "globalVariables": {},
  "variableStore": {
    "global": {},
    "session": {},
    "phase": {},
    "topic": {}
  },
  "position": {
    "phaseIndex": 0,
    "phaseId": "string",
    "topicIndex": 0,
    "topicId": "string",
    "actionIndex": 0,
    "actionId": "string",
    "actionType": "string",
    "currentRound": 0,
    "maxRounds": 0
  },
  "debugInfo": {},
  "error": {
    "code": "string",
    "type": "string",
    "message": "string",
    "details": "string",
    "context": {
      "scriptId": "uuid",
      "scriptName": "string",
      "sessionId": "uuid",
      "position": {
        "phaseIndex": 0,
        "phaseId": "string",
        "topicIndex": 0,
        "topicId": "string",
        "actionIndex": 0,
        "actionId": "string",
        "actionType": "string"
      },
      "timestamp": "string"
    },
    "recovery": {
      "canRetry": true,
      "retryAction": "string",
      "suggestion": "string"
    }
  }
}
```

#### 执行流程
```mermaid
sequenceDiagram
participant Client as 客户端
participant API as API服务器
participant Manager as 会话管理器
participant Engine as 脚本执行器
participant DB as 数据库
Client->>API : POST /api/sessions/ : id/messages
API->>DB : 验证会话存在性
API->>Manager : processUserInput(sessionId, content)
Manager->>DB : loadSessionById()
Manager->>DB : loadScriptById()
Manager->>DB : loadGlobalVariables()
Manager->>DB : loadConversationHistory()
Manager->>DB : saveUserMessage()
Manager->>Engine : restoreExecutionState()
Manager->>Engine : executeSession(userInput)
Engine->>DB : 保存AI消息
Engine->>DB : 保存变量快照
Manager->>DB : 更新会话状态
API-->>Client : 返回聊天响应
```

**图表来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L455-L536)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L639-L692)

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L348-L536)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L639-L692)

### 5. 获取会话变量 (GET /api/sessions/:id/variables)

#### 请求规范
- **方法**: GET
- **路径**: `/api/sessions/:id/variables`

#### 响应结构
直接返回会话的变量对象，包含所有已定义的变量及其值。**更新** 现在包含分层变量存储结构，支持全局、会话、阶段和主题级别的变量管理。

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L538-L576)

### 6. 列出用户会话 (GET /api/users/:userId/sessions)

#### 请求规范
- **方法**: GET
- **路径**: `/api/users/:userId/sessions`
- **路径参数**: `userId` (字符串)

#### 响应结构
返回按创建时间降序排列的用户会话数组。

**章节来源**
- [packages/api-server/src/routes/sessions.ts](file://packages/api-server/src/routes/sessions.ts#L578-L612)

## 依赖关系分析

### 错误处理机制

系统实现了统一的错误处理机制，支持多种错误类型的分类和恢复策略：

```mermaid
classDiagram
class DetailedApiError {
+code : ErrorCode
+type : ErrorType
+message : string
+details : string
+context : ErrorContext
+recovery : ErrorRecovery
}
class ErrorContext {
+scriptId : string
+scriptName : string
+sessionId : string
+position : DetailedExecutionPosition
+timestamp : string
}
class ErrorRecovery {
+canRetry : boolean
+retryAction : string
+suggestion : string
}
class ErrorCode {
<<enumeration>>
SCRIPT_NOT_FOUND
SCRIPT_PARSE_ERROR
SCRIPT_VALIDATION_ERROR
SESSION_NOT_FOUND
ACTION_EXECUTION_ERROR
LLM_SERVICE_ERROR
DATABASE_ERROR
}
class ErrorType {
<<enumeration>>
SYNTAX
CONFIGURATION
RUNTIME
SESSION
SYSTEM
}
DetailedApiError --> ErrorContext : "包含"
DetailedApiError --> ErrorRecovery : "包含"
DetailedApiError --> ErrorCode : "使用"
DetailedApiError --> ErrorType : "使用"
```

**图表来源**
- [packages/shared-types/src/api/responses.ts](file://packages/shared-types/src/api/responses.ts#L68-L84)
- [packages/shared-types/src/enums.ts](file://packages/shared-types/src/enums.ts#L94-L105)

### 会话状态管理

会话状态管理采用位置追踪机制，通过三元组索引跟踪执行进度。**更新** 现在支持分层变量存储和回合数管理：

```mermaid
stateDiagram-v2
[*] --> Active
Active --> Running : 初始化
Running --> WaitingInput : 需要用户输入
WaitingInput --> Running : 接收用户输入
Running --> Completed : 脚本执行完成
Running --> Error : 执行错误
Error --> Active : 重试
Completed --> [*]
note right of WaitingInput
保存Action内部状态
支持断点续传
包含回合数管理
包含分层变量存储
end note
```

**图表来源**
- [packages/core-engine/src/engines/script-execution/script-executor.ts](file://packages/core-engine/src/engines/script-execution/script-executor.ts#L14-L20)
- [packages/api-server/src/services/session-manager.ts](file://packages/api-server/src/services/session-manager.ts#L255-L303)

**章节来源**
- [packages/shared-types/src/enums.ts](file://packages/shared-types/src/enums.ts#L6-L22)
- [packages/core-engine/src/engines/script-execution/script-executor.ts](file://packages/core-engine/src/engines/script-execution/script-executor.ts#L826-L844)

### 分层变量存储结构

**新增** 会话管理器现在支持分层变量存储结构，提供更精细的变量作用域管理：

```mermaid
classDiagram
class VariableStore {
+global : Record~string, VariableValue~
+session : Record~string, VariableValue~
+phase : Record~string, Record~string, VariableValue~~
+topic : Record~string, Record~string, VariableValue~~
}
class VariableValue {
+value : any
+type : string
+lastUpdated : string
+source : string
}
class Position {
+phaseId : string
+topicId : string
+actionId : string
}
VariableStore --> VariableValue : "包含"
VariableStore --> Position : "与位置关联"
```

**图表来源**
- [packages/shared-types/src/domain/variable.ts](file://packages/shared-types/src/domain/variable.ts#L32-L41)
- [packages/shared-types/src/domain/variable.ts](file://packages/shared-types/src/domain/variable.ts#L8-L17)

## 性能考虑

### 数据库优化
- **索引策略**：为会话表的用户ID、状态和创建时间建立复合索引
- **查询优化**：使用分页查询避免大量数据传输
- **连接池**：合理配置数据库连接池大小

### 缓存策略
- **会话状态缓存**：对活跃会话进行内存缓存
- **脚本内容缓存**：缓存已解析的脚本内容
- **消息历史缓存**：缓存最近的消息历史
- **全局变量缓存**：缓存项目级别的全局变量

### 并发控制
- **事务管理**：确保会话状态更新的原子性
- **锁机制**：防止并发修改导致的数据不一致
- **超时处理**：设置合理的操作超时时间

### 新增性能优化
- **变量存储优化**：分层变量存储减少不必要的数据传输
- **状态序列化**：Action内部状态的序列化和反序列化优化
- **回合数管理**：高效的回合数跟踪和限制机制

## 故障排除指南

### 常见错误及解决方案

| 错误类型 | 错误代码 | 描述 | 解决方案 |
|---------|---------|------|----------|
| 脚本不存在 | SCRIPT_NOT_FOUND | 指定的脚本ID不存在 | 确认脚本已正确导入并验证ID格式 |
| 会话不存在 | SESSION_NOT_FOUND | 会话ID无效或已过期 | 检查会话ID有效性，重新创建会话 |
| 脚本解析错误 | SCRIPT_PARSE_ERROR | YAML语法错误 | 修复YAML语法，验证脚本结构 |
| 数据库错误 | DATABASE_ERROR | 数据库操作失败 | 检查数据库连接，重试操作 |
| LLM服务错误 | LLM_SERVICE_ERROR | 大语言模型服务不可用 | 检查网络连接和服务状态 |
| 变量存储初始化失败 | VARIABLE_STORE_INIT_ERROR | 分层变量存储初始化失败 | 检查变量存储结构完整性 |

### 调试技巧
1. **启用详细日志**：在开发环境中启用详细的执行日志
2. **状态检查**：定期检查会话状态和执行进度
3. **变量监控**：监控变量变化和提取结果
4. **错误上下文**：利用错误上下文信息定位问题
5. **回合数跟踪**：监控Action的回合数执行情况
6. **变量存储验证**：检查分层变量存储的结构完整性

**章节来源**
- [packages/api-server/src/utils/error-handler.ts](file://packages/api-server/src/utils/error-handler.ts#L22-L71)
- [packages/api-server/src/utils/error-handler.ts](file://packages/api-server/src/utils/error-handler.ts#L186-L233)

## 结论

会话管理API经过重大重构后，提供了更加完善的心理咨询会话生命周期管理功能。通过清晰的分层架构、完善的错误处理机制、灵活的脚本执行引擎和增强的变量管理功能，系统能够支持复杂的咨询流程和多轮对话交互。

**更新** 主要改进包括：
- **完整的会话生命周期管理**：从创建到完成的全链路支持
- **灵活的位置追踪机制**：支持断点续传和状态恢复
- **强大的错误处理能力**：提供详细的错误信息和恢复建议
- **可扩展的架构设计**：支持自定义脚本和Action扩展
- **分层变量存储结构**：提供精细化的变量作用域管理
- **回合数管理功能**：支持多轮对话的精确控制
- **全局变量加载机制**：支持项目级别的全局变量管理

该API为心理咨询系统的智能化发展奠定了坚实的技术基础，能够有效提升咨询效率和质量。新的分层变量存储结构和回合数管理功能特别适用于复杂的CBT（认知行为疗法）等需要多轮对话和变量跟踪的心理咨询场景。