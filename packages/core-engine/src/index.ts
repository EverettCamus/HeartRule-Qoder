/**
 * Core Engine Package
 *
 * 基于DDD的核心引擎实现，包含领域模型、应用服务与基础设施适配器
 *
 * 架构分层：
 * - Domain Layer: 领域模型（Session, Script, Message, Variable, ActionDefinition）
 * - Application Layer: 动作执行器（Ai*Action）与引擎（ScriptExecutor, LLMOrchestrator 等）
 * - Infrastructure Layer: 外部服务适配（LLM 提供方、记忆存储等）
 */

// =============================================================================
// Version Information (版本信息)
// =============================================================================
/**
 * 引擎版本号 (语义化版本)
 *
 * @remarks
 * 用于版本兼容性检测与脚本验证
 * 格式: MAJOR.MINOR.PATCH
 * - MAJOR: 不兼容的结构变更
 * - MINOR: 向后兼容的功能增强
 * - PATCH: 向后兼容的问题修复
 */
export const ENGINE_VERSION = '2.1.0';

/**
 * 支持的最低脚本版本
 *
 * @remarks
 * 引擎版本 N 必须能执行版本 N-1 和 N-2 的脚本
 */
export const MIN_SCRIPT_VERSION = '2.0.0';

/**
 * 检查脚本兼容性
 *
 * @param scriptVersion - 脚本版本号
 * @returns 兼容性结果
 */
export function checkScriptCompatibility(scriptVersion: string): {
  compatible: boolean;
  engineVersion: string;
  scriptVersion: string;
  message?: string;
} {
  // 简单版本比较（后续可增强为完整语义化版本解析）
  const parseVersion = (v: string) => {
    const parts = v.split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const engine = parseVersion(ENGINE_VERSION);
  const script = parseVersion(scriptVersion);
  const minScript = parseVersion(MIN_SCRIPT_VERSION);

  // 检查脚本版本是否大于等于最低要求
  const compatible =
    script.major > minScript.major ||
    (script.major === minScript.major && script.minor >= minScript.minor);

  if (!compatible) {
    return {
      compatible: false,
      engineVersion: ENGINE_VERSION,
      scriptVersion,
      message: `Script version ${scriptVersion} is not compatible with engine ${ENGINE_VERSION}. Minimum required: ${MIN_SCRIPT_VERSION}`,
    };
  }

  // 检查是否需要升级警告
  if (script.major < engine.major) {
    return {
      compatible: true,
      engineVersion: ENGINE_VERSION,
      scriptVersion,
      message: `Script version ${scriptVersion} is older than engine ${ENGINE_VERSION}. Consider upgrading for new features.`,
    };
  }

  return {
    compatible: true,
    engineVersion: ENGINE_VERSION,
    scriptVersion,
  };
}

// =============================================================================
// Domain Layer (领域层)
// =============================================================================
// 领域模型：承载业务核心概念与规则，不依赖外部基础设施

// Session 聚合：会话执行 BC 的核心聚合根，负责会话生命周期与执行状态管理
export * from './domain/session.js';

// Message 实体/值对象：表达单条对话消息，参与 conversationHistory 维护
export * from './domain/message.js';

// Script 实体：脚本元数据与解析后结构（Phase/Topic/ActionDefinition）的承载者
export * from './domain/script.js';

// Variable 领域对象：变量状态、作用域、更新策略与历史管理
export * from './domain/variable.js';

// =============================================================================
// Application Layer - Action Executors (应用层 - 动作执行器)
// =============================================================================
// 动作执行器：在运行时执行 ActionDefinition，协调 LLM/记忆/变量/用户交互
// 注：ActionDefinition 本身属于领域模型（Script/Topic 内的值对象），这里导出的是应用层的执行器

// BaseAction: 动作执行器基类，定义执行上下文与结果结构
export * from './actions/base-action.js';

// ActionRegistry: 动作执行器注册表，支持运行时动态创建执行器实例
export * from './actions/action-registry.js';

// 具体动作执行器实现
export * from './actions/ai-say-action.js'; // AI 讲解/介绍动作执行器
export * from './actions/ai-ask-action.js'; // AI 追问/提问动作执行器

// =============================================================================
// Application Layer - Application Services (应用层 - 应用服务接口)
// =============================================================================
// DDD 第三阶段重构：定义核心引擎向外部系统暴露的标准接口
// 作为防腐层（Anti-Corruption Layer），隔离核心引擎内部实现与外部调用关系

// SessionApplicationService: 会话应用服务接口，提供会话初始化与用户输入处理的标准接口
export * from './application/session-application-service.js';

// =============================================================================
// Application Layer - Engines (应用层 - 引擎)
// =============================================================================
// 引擎层：应用服务与流程编排，组合领域模型与动作执行器完成用例

// ScriptExecutor: 脚本执行引擎，根据脚本结构逐步推进会话执行
export * from './engines/script-execution/script-executor.js';

// LLMOrchestrator: LLM 编排引擎，封装与 LLM 的交互与结构化输出
export * from './engines/llm-orchestration/index.js';

// VariableExtractor: 变量提取引擎，从对话与 LLM 输出中抽取变量
export * from './engines/variable-extraction/index.js';

// VariableScopeResolver: 变量作用域解析器，确定变量应写入哪个作用域
export * from './engines/variable-scope/variable-scope-resolver.js';

// PromptTemplateManager: 提示词模板管理器，支持两层变量替换与模板组装
export * from './engines/prompt-template/index.js';

// MemoryEngine: 记忆引擎，管理长期/短期记忆的读写（待实现）
export * from './engines/memory/index.js';

// YAMLParser: YAML 脚本解析器，支持 Schema 验证
export * from './engines/script-execution/yaml-parser.js';

// =============================================================================
// Schema Validation (Schema 验证体系)
// =============================================================================
// YAML 脚本 Schema 验证服务，提供完整的验证与错误处理能力

export * from './schemas/index.js';

// =============================================================================
// 注：旧版接口（已废弃，待迁移）
// =============================================================================
// 以下文件将在第二阶段逐步迁移到新接口：
// - actions/base.ts (旧版 Action 基类)
// - actions/registry.ts (旧版注册表)
// - engines/script-execution/executor.ts (旧版执行器)
