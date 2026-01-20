/**
 * Core Engine Package
 * 
 * 六大引擎的Headless实现
 */

// 领域模型
export * from './domain/session.js';
export * from './domain/message.js';
export * from './domain/script.js';
export * from './domain/variable.js';

// 引擎
// export * from './engines/script-execution/index.js';  // 暂时注释，使用新版本
export * from './engines/llm-orchestration/index.js';
export * from './engines/variable-extraction/index.js';
export * from './engines/memory/index.js';
export * from './engines/prompt-template/index.js';  // 新增：提示词模板管理器

// Actions (新版本，替代旧的 base.js 和 registry.js)
export * from './actions/base-action.js';
export * from './actions/action-registry.js';
export * from './actions/ai-say-action.js';
export * from './actions/ai-ask-action.js';

// Script Executor (新版本)
export * from './engines/script-execution/script-executor.js';
