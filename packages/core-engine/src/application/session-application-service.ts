/**
 * Session Application Service
 * 
 * @remarks
 * 此文件为向后兼容层，重新导出新的模块结构
 * 
 * DDD 六边形架构重构：
 * - 接口定义：ports/inbound/session-application.port.ts
 * - 实现类：usecases/session-application-service.ts
 * 
 * @deprecated 请直接从 ports 或 usecases 导入
 */

// 重新导出接口定义
export type {
  ISessionApplicationService,
  InitializeSessionRequest,
  ProcessUserInputRequest,
  SessionExecutionResponse,
  ExtendedExecutionPosition,
} from './ports/inbound/session-application.port.js';

// 重新导出实现类
export {
  DefaultSessionApplicationService,
  createDefaultSessionApplicationService,
} from './usecases/session-application-service.js';
