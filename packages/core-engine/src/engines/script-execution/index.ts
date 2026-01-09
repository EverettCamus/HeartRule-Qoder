/**
 * 脚本执行引擎
 */

export * from './yaml-parser.js';
// 旧版本执行器（保留以防兼容性需要，但使用别名避免冲突）
export type { ExecutionState as LegacyExecutionState } from './executor.js';
export { ScriptExecutor as LegacyScriptExecutor } from './executor.js';
// 新版本 Script Executor（默认导出）
export * from './script-executor.js';
